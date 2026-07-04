import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

import { config } from './src/config.js';
import {
  createPending, getPending, matchPending, expectedInUse,
  donationSeen, recordDonation, markPaid,
} from './src/db.js';
import { watchEth, ethToWei, weiToEth } from './src/eth.js';
import { watchSol, solToLamports, lamportsToSol } from './src/sol.js';
import { getPrices, eurValue } from './src/prices.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PENDING_TTL_MS = config.pendingTtlMin * 60_000;
const CHAINS = {
  eth: {
    address: () => config.ethAddress,
    toBase: ethToWei,
    toDisplay: weiToEth,
    min: () => ethToWei(String(config.minEth)),
    // dust uniquifier range: 1e9–1e12 wei (≤ 0.000001 ETH, fractions of a cent)
    dust: () => 1_000_000_000n + BigInt(crypto.randomInt(1, 999_000)) * 1_000_000_000n,
    uri: (addr, display) => `ethereum:${addr}?value=${ethToWei(display).toString()}`,
    symbol: 'ETH',
  },
  sol: {
    address: () => config.solAddress,
    toBase: solToLamports,
    toDisplay: lamportsToSol,
    min: () => solToLamports(String(config.minSol)),
    // dust uniquifier: 1–99,999 lamports (≤ 0.0001 SOL)
    dust: () => BigInt(crypto.randomInt(1, 99_999)),
    uri: (addr, display) => `solana:${addr}?amount=${display}`,
    symbol: 'SOL',
  },
};

// ---------------------------------------------------------------- overlay ws
const wss = new WebSocketServer({ noServer: true });

function broadcast(event) {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

// ------------------------------------------------------------ payment intake
// Called by both chain watchers for every incoming transfer.
async function onPayment({ chain, txid, sender, amount, display }) {
  if (donationSeen(txid)) return;

  const c = CHAINS[chain];
  if (BigInt(amount) < c.min()) {
    recordDonation({ txid, chain, sender, amount, name: null, message: null, created_at: Date.now() });
    return;
  }

  const pending = matchPending(chain, amount, PENDING_TTL_MS);
  const name = pending?.name || null;
  const message = pending?.message || null;

  recordDonation({ txid, chain, sender, amount, name, message, created_at: Date.now() });
  if (pending) markPaid(pending.id, txid);

  const prices = await getPrices();
  const alert = {
    type: 'donation',
    chain,
    symbol: c.symbol,
    amount: display,
    eur: eurValue(chain, display, prices),
    name: name || 'Anonymous',
    message: message || '',
    txid,
  };
  console.log(`[tip] ${alert.name}: ${alert.amount} ${alert.symbol}${alert.eur ? ` (~€${alert.eur})` : ''}`);
  broadcast(alert);
}

// ------------------------------------------------------------------- routes
app.get('/api/config', (_req, res) => {
  res.json({
    streamer: config.streamerName,
    chains: Object.fromEntries(
      Object.entries(CHAINS)
        .filter(([, c]) => c.address())
        .map(([id, c]) => [id, { address: c.address(), symbol: c.symbol }]),
    ),
  });
});

// Donor announces intent: we hand back the exact amount whose dust tail
// identifies them, so the watcher can attach their name/message on match.
app.post('/api/donate', async (req, res) => {
  const { chain, amount, name, message } = req.body ?? {};
  const c = CHAINS[chain];
  if (!c || !c.address()) return res.status(400).json({ error: 'unknown or disabled chain' });
  if (!/^\d+(\.\d+)?$/.test(String(amount ?? ''))) return res.status(400).json({ error: 'invalid amount' });

  let base;
  try {
    base = c.toBase(String(amount));
  } catch {
    return res.status(400).json({ error: 'invalid amount' });
  }
  if (base < c.min()) {
    return res.status(400).json({ error: `minimum is ${c.toDisplay(c.min())} ${c.symbol}` });
  }

  let expected;
  for (let i = 0; i < 10; i++) {
    expected = (base + c.dust()).toString();
    if (!expectedInUse(chain, expected, PENDING_TTL_MS)) break;
    expected = null;
  }
  if (!expected) return res.status(503).json({ error: 'busy, try again' });

  const id = crypto.randomUUID();
  createPending({
    id, chain, expected,
    name: String(name ?? '').slice(0, 40) || null,
    message: String(message ?? '').slice(0, 200) || null,
    created_at: Date.now(),
  });

  const display = c.toDisplay(expected);
  const qr = await QRCode.toDataURL(c.uri(c.address(), display), { margin: 1, width: 260 });
  res.json({
    id,
    address: c.address(),
    amount: display,
    amountBase: expected,
    symbol: c.symbol,
    expiresInMin: config.pendingTtlMin,
    qr,
  });
});

// Donor page polls this to flip to "payment received".
app.get('/api/donate/:id', (req, res) => {
  const p = getPending(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json({ status: p.status, txid: p.txid ?? null });
});

// Fire a fake alert to test the OBS overlay.
app.post('/api/test-alert', (req, res) => {
  if (req.get('x-admin-key') !== config.adminKey) return res.status(403).json({ error: 'forbidden' });
  broadcast({
    type: 'donation',
    chain: 'eth',
    symbol: 'ETH',
    amount: '0.05',
    eur: 150,
    name: req.body?.name || 'TestDonor',
    message: req.body?.message || 'This is a test alert — looking good!',
    txid: 'test',
  });
  res.json({ ok: true });
});

app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// -------------------------------------------------------------------- start
const server = app.listen(config.port, () => {
  console.log(`[tipfall] donation page  → http://localhost:${config.port}/`);
  console.log(`[tipfall] OBS overlay    → http://localhost:${config.port}/overlay?key=${config.overlayKey}`);
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws' || url.searchParams.get('key') !== config.overlayKey) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

watchEth(onPayment);
watchSol(onPayment);
