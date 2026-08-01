// Tor -> https JSON-RPC bridge with caching, dedup, throttling and 429-retry.
//
// The Arc mainnet RPC is a Tor .onion that rate-limits (429) under load. Every
// visitor's browser hits this bridge, so this one process is the right place to
// protect the onion: cache read results briefly, collapse identical concurrent
// reads into one upstream call, cap how many requests hit the onion at once, and
// retry 429s upstream so callers never see a blank.
const http = require("http");
const https = require("https");
const { SocksProxyAgent } = require("socks-proxy-agent");

const PORT = Number(process.env.PORT || 8080);
const ONION_RPC = process.env.ONION_RPC; // e.g. http://xxxxx.onion
const TOR_SOCKS = process.env.TOR_SOCKS || "socks5h://127.0.0.1:9050";

if (!ONION_RPC) {
  console.error("Set ONION_RPC to your .onion RPC URL (e.g. http://xxxx.onion)");
  process.exit(1);
}

const target = new URL(ONION_RPC);
const isHttps = target.protocol === "https:";
const transport = isHttps ? https : http;
// keepAlive reuses Tor streams instead of paying circuit setup on every request.
const agent = new SocksProxyAgent(TOR_SOCKS, { keepAlive: true, maxSockets: 8, timeout: 45000 });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// --- how long each read method may be served from cache (ms) ---
const TTL = {
  eth_chainId: 60000,
  net_version: 60000,
  web3_clientVersion: 60000,
  eth_getCode: 60000,
  eth_call: 3000,
  eth_getBalance: 2500,
  eth_getStorageAt: 3000,
  eth_blockNumber: 2000,
  eth_gasPrice: 5000,
  eth_maxPriorityFeePerGas: 5000,
  eth_feeHistory: 5000,
  eth_getLogs: 5000,
  eth_getBlockByNumber: 3000,
};

const cache = new Map(); // key -> { expires, obj }
const inflight = new Map(); // key -> Promise<{ status, body }>

// Evict expired entries periodically so the map doesn't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of cache) if (v.expires <= now) cache.delete(k);
}, 30000).unref();

// --- cap concurrent requests to the onion so we don't trip its rate limit ---
const MAX_UPSTREAM = 4;
let active = 0;
const waiters = [];
function acquire() {
  if (active < MAX_UPSTREAM) {
    active++;
    return Promise.resolve();
  }
  return new Promise((r) => waiters.push(r)).then(() => {
    active++;
  });
}
function release() {
  active--;
  const next = waiters.shift();
  if (next) next();
}

function rawUpstream(bodyStr) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: (target.pathname || "/") + (target.search || ""),
      method: "POST",
      agent,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(bodyStr) },
      timeout: 30000,
    };
    const preq = transport.request(opts, (pres) => {
      const chunks = [];
      pres.on("data", (c) => chunks.push(c));
      pres.on("end", () => resolve({ status: pres.statusCode || 502, body: Buffer.concat(chunks) }));
    });
    preq.on("timeout", () => preq.destroy(new Error("upstream timeout")));
    preq.on("error", reject);
    preq.write(bodyStr);
    preq.end();
  });
}

// Retry on 429 / 5xx with backoff, always through the concurrency gate.
async function upstream(bodyStr, tries = 4) {
  let last;
  for (let i = 0; i < tries; i++) {
    await acquire();
    try {
      const res = await rawUpstream(bodyStr);
      if (res.status !== 429 && res.status < 500) return res;
      last = res;
    } catch (e) {
      last = e;
    } finally {
      release();
    }
    await new Promise((r) => setTimeout(r, 250 * Math.pow(2, i)));
  }
  if (last && typeof last.status === "number") return last; // surface the last 429/5xx
  throw last || new Error("upstream failed");
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  if (req.method === "GET") {
    res.writeHead(200, { "content-type": "text/plain", ...CORS });
    return res.end("arc rpc bridge ok");
  }
  if (req.method !== "POST") {
    res.writeHead(405, CORS);
    return res.end();
  }

  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      /* non-JSON — passthrough below */
    }
    const single = parsed && !Array.isArray(parsed) && typeof parsed === "object";
    const method = single ? parsed.method : null;
    const ttl = method ? TTL[method] : undefined;
    const key = ttl ? method + ":" + JSON.stringify(parsed.params || []) : null;

    const sendJson = (status, obj) => {
      res.writeHead(status, { "content-type": "application/json", ...CORS });
      res.end(JSON.stringify(obj));
    };
    const sendRaw = (status, buf) => {
      res.writeHead(status, { "content-type": "application/json", ...CORS });
      res.end(buf);
    };

    // Cache hit — serve immediately, restamped with this request's id.
    if (key) {
      const hit = cache.get(key);
      if (hit && hit.expires > Date.now()) {
        return sendJson(200, { ...hit.obj, id: parsed.id });
      }
    }

    try {
      // Cacheable read: dedupe identical concurrent requests into one upstream call.
      if (key) {
        let p = inflight.get(key);
        if (!p) {
          p = upstream(body);
          inflight.set(key, p);
          p.finally(() => inflight.delete(key)).catch(() => {});
        }
        const result = await p;
        try {
          const obj = JSON.parse(result.body.toString());
          if (result.status === 200 && obj && obj.result !== undefined && obj.error === undefined) {
            cache.set(key, { expires: Date.now() + ttl, obj });
          }
          return sendJson(result.status, { ...obj, id: parsed.id });
        } catch {
          return sendRaw(result.status, result.body); // e.g. a 429 HTML page
        }
      }

      // Non-cacheable (sends, nonce, receipts, batches, non-JSON): straight relay.
      const result = await upstream(body);
      return sendRaw(result.status, result.body);
    } catch (e) {
      return sendJson(502, { jsonrpc: "2.0", id: single ? parsed.id : null, error: { code: -32000, message: `bridge: ${e.message}` } });
    }
  });
});

server.listen(PORT, () => console.log(`Arc RPC bridge on :${PORT} -> ${ONION_RPC} via ${TOR_SOCKS} (cache+dedup+retry)`));
