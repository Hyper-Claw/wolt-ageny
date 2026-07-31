// Minimal Tor -> https JSON-RPC bridge.
// Accepts browser POSTs and relays them to an Arc mainnet .onion RPC over Tor's
// SOCKS5 proxy, with permissive CORS so the frontend can call it.
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
const agent = new SocksProxyAgent(TOR_SOCKS);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    return res.end();
  }
  // Health check (keeps the host happy even before Tor is bootstrapped)
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
  req.on("end", () => {
    const opts = {
      hostname: target.hostname,
      port: target.port || (isHttps ? 443 : 80),
      path: (target.pathname || "/") + (target.search || ""),
      method: "POST",
      agent,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body) },
      timeout: 30000,
    };
    const preq = transport.request(opts, (pres) => {
      res.writeHead(pres.statusCode || 502, { "content-type": "application/json", ...CORS });
      pres.pipe(res);
    });
    preq.on("timeout", () => preq.destroy(new Error("upstream timeout")));
    preq.on("error", (e) => {
      res.writeHead(502, { "content-type": "application/json", ...CORS });
      res.end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: `bridge: ${e.message}` } }));
    });
    preq.write(body);
    preq.end();
  });
});

server.listen(PORT, () => console.log(`Arc RPC bridge on :${PORT} -> ${ONION_RPC} via ${TOR_SOCKS}`));
