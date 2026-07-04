import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import QRCode from 'qrcode';

import { config } from './src/config.js';
import { buildAssets } from './src/assets.js';
import {
  createPending, getPending, matchPending, expectedInUse,
  donationSeen, recordDonation, markPaid,
  getState, setState, totalEur, topDonors, recentDonations,
} from './src/db.js';
import { watchEth } from './src/eth.js';
import { watchSol } from './src/sol.js';
import { getPrices, eurValue, usdPrice } from './src/prices.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PENDING_TTL_MS = config.pendingTtlMin * 60_000;
const ASSETS = buildAssets(config);

// -------------------------------------------------------- overlay settings
const DEFAULT_SETTINGS = {
  sound: 'chime',                       // chime | coin | fanfare | none
  goalTitle: config.goalTitle,
  goalEur: config.goalEur,
  // tiers: pick the highest whose minEur <= donation EUR
  tiers: [],                            // [{ minEur, color, gif, sound }]
};

function getSettings() {
  const raw = getState('overlaySettings');
  if (!raw) return { ...DEFAULT_SETTINGS };
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }; }
  catch { return { ...DEFAULT_SETTINGS }; }
}

// -------------------------------------------------------- look & feel theme
const DEFAULT_THEME = {
  title: `${config.streamerName === 'the streamer' ? 'Crypto' : config.streamerName}'s Tip Jar`,
  subtitle: 'Drop a coin in the piggy bank — your name and message pop up live on stream. 💕',
  pig: '🐷',            // the emoji used everywhere piggies appear
  accent: '#ff5fa2',    // main pink
  accent2: '#ff9ad0',   // light pink
  pigCount: 12,         // floating pigs on the donation page
  speed: 1,             // animation speed multiplier (higher = faster)
};

function getTheme() {
  const raw = getState('theme');
  if (!raw) return { ...DEFAULT_THEME };
  try { return { ...DEFAULT_THEME, ...JSON.parse(raw) }; }
  catch { return { ...DEFAULT_THEME }; }
}

// ---------------------------------------------------------------- overlay ws
const wss = new WebSocketServer({ noServer: true });

function broadcast(event) {
  const payload = JSON.stringify(event);
  for (const client of wss.clients) {
    if (client.readyState === client.OPEN) client.send(payload);
  }
}

// ------------------------------------------------------------ payment intake
async function onPayment({ asset, txid, sender, amount, display }) {
  if (donationSeen(txid)) return;

  if (BigInt(amount) < asset.min) {
    recordDonation({
      txid, asset: asset.id, chain: asset.chain, sender, amount,
      eur: null, name: null, message: null, created_at: Date.now(),
    });
    return;
  }

  const pending = matchPending(asset.id, amount, PENDING_TTL_MS);
  const name = pending?.name || null;
  const message = pending?.message || null;

  const prices = await getPrices();
  const eur = eurValue(asset, display, prices);

  recordDonation({
    txid, asset: asset.id, chain: asset.chain, sender, amount,
    eur, name, message, created_at: Date.now(),
  });
  if (pending) markPaid(pending.id, txid);

  const alert = {
    type: 'donation',
    asset: asset.id, symbol: asset.symbol,
    amount: display, eur,
    name: name || 'Anonymous', message: message || '',
    txid,
  };
  console.log(`[tip] ${alert.name}: ${alert.amount} ${alert.symbol}${eur != null ? ` (~€${eur})` : ''}`);
  broadcast({ ...alert, total: totalEur().total });
}

// ------------------------------------------------------------------- routes
app.get('/api/config', (_req, res) => {
  res.json({
    streamer: config.streamerName,
    assets: Object.fromEntries(
      Object.values(ASSETS).map((a) => [a.id, {
        symbol: a.symbol, label: a.label, recipient: a.recipient, presets: a.presets,
      }]),
    ),
  });
});

// Current USD price per coin, per asset — used for the $10/$25/$50/$100 preset
// buttons (converted to the coin amount client-side). USDC ≈ 1.
app.get('/api/prices', async (_req, res) => {
  const prices = await getPrices();
  res.json(Object.fromEntries(
    Object.values(ASSETS).map((a) => [a.id, usdPrice(a, prices)]),
  ));
});

app.post('/api/donate', async (req, res) => {
  const { asset: assetId, amount, name, message } = req.body ?? {};
  const asset = ASSETS[assetId];
  if (!asset) return res.status(400).json({ error: 'unknown or disabled asset' });
  if (!/^\d+(\.\d+)?$/.test(String(amount ?? ''))) return res.status(400).json({ error: 'invalid amount' });

  let base;
  try { base = asset.toBase(String(amount)); }
  catch { return res.status(400).json({ error: 'invalid amount' }); }
  if (base < asset.min) {
    return res.status(400).json({ error: `minimum is ${asset.toDisplay(asset.min)} ${asset.symbol}` });
  }

  let expected;
  for (let i = 0; i < 10; i++) {
    expected = (base + asset.dust()).toString();
    if (!expectedInUse(asset.id, expected, PENDING_TTL_MS)) break;
    expected = null;
  }
  if (!expected) return res.status(503).json({ error: 'busy, try again' });

  const id = crypto.randomUUID();
  createPending({
    id, asset: asset.id, chain: asset.chain, expected,
    name: String(name ?? '').slice(0, 40) || null,
    message: String(message ?? '').slice(0, 200) || null,
    created_at: Date.now(),
  });

  const display = asset.toDisplay(expected);
  const qr = await QRCode.toDataURL(asset.uri(asset.recipient, display), { margin: 1, width: 260 });
  res.json({
    id, asset: asset.id, symbol: asset.symbol,
    recipient: asset.recipient, amount: display, amountBase: expected,
    wallet: asset.wallet ? asset.wallet(asset.recipient, expected) : null,
    expiresInMin: config.pendingTtlMin, qr,
  });
});

app.get('/api/donate/:id', (req, res) => {
  const p = getPending(req.params.id);
  if (!p) return res.status(404).json({ error: 'not found' });
  res.json({ status: p.status, txid: p.txid ?? null });
});

// --- overlay-facing (require overlay key) ---
function overlayAuth(req, res, next) {
  if (req.query.key !== config.overlayKey) return res.status(403).json({ error: 'forbidden' });
  next();
}

app.get('/api/overlay-settings', overlayAuth, (_req, res) => res.json(getSettings()));

// Theme is cosmetic and the donation page is public, so this read needs no key.
app.get('/api/theme', (_req, res) => res.json(getTheme()));

app.get('/api/stats', overlayAuth, (_req, res) => {
  const s = getSettings();
  const { total, n } = totalEur();
  res.json({
    totalEur: Math.round(total * 100) / 100,
    count: n,
    goalEur: s.goalEur,
    goalTitle: s.goalTitle,
    top: topDonors(5),
    recent: recentDonations(8),
  });
});

// --- admin (require admin key header) ---
function adminAuth(req, res, next) {
  if (req.get('x-admin-key') !== config.adminKey) return res.status(403).json({ error: 'forbidden' });
  next();
}

app.post('/api/overlay-settings', adminAuth, (req, res) => {
  const b = req.body ?? {};
  const clean = {
    sound: ['chime', 'coin', 'fanfare', 'none'].includes(b.sound) ? b.sound : 'chime',
    goalTitle: String(b.goalTitle ?? config.goalTitle).slice(0, 60),
    goalEur: Math.max(0, Number(b.goalEur) || 0),
    tiers: Array.isArray(b.tiers) ? b.tiers.slice(0, 5).map((t) => ({
      minEur: Math.max(0, Number(t.minEur) || 0),
      color: String(t.color ?? '').slice(0, 20),
      gif: String(t.gif ?? '').slice(0, 400),
      sound: ['chime', 'coin', 'fanfare', 'none', ''].includes(t.sound) ? t.sound : '',
    })).sort((a, z) => a.minEur - z.minEur) : [],
  };
  setState('overlaySettings', JSON.stringify(clean));
  res.json({ ok: true, settings: clean });
});

app.post('/api/theme', adminAuth, (req, res) => {
  const b = req.body ?? {};
  const hex = (v, dflt) => (/^#[0-9a-fA-F]{6}$/.test(String(v ?? '')) ? v : dflt);
  const clean = {
    title: String(b.title ?? DEFAULT_THEME.title).slice(0, 60) || DEFAULT_THEME.title,
    subtitle: String(b.subtitle ?? DEFAULT_THEME.subtitle).slice(0, 160),
    pig: (String(b.pig ?? '').slice(0, 8)) || DEFAULT_THEME.pig,
    accent: hex(b.accent, DEFAULT_THEME.accent),
    accent2: hex(b.accent2, DEFAULT_THEME.accent2),
    pigCount: Math.max(0, Math.min(40, Math.round(Number(b.pigCount)) || 0)),
    speed: Math.max(0.2, Math.min(4, Number(b.speed) || 1)),
  };
  setState('theme', JSON.stringify(clean));
  res.json({ ok: true, theme: clean });
});

app.post('/api/test-alert', adminAuth, (req, res) => {
  const eur = Number(req.body?.eur) || 25;
  broadcast({
    type: 'donation', asset: 'eth', symbol: 'ETH',
    amount: req.body?.amount || '0.01', eur,
    name: req.body?.name || 'TestDonor',
    message: req.body?.message || 'This is a test alert — looking good!',
    txid: 'test', total: totalEur().total,
  });
  res.json({ ok: true });
});

app.get('/overlay', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/goal', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'goal.html')));
app.get('/customize', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'customize.html')));

// -------------------------------------------------------------------- start
const server = app.listen(config.port, () => {
  console.log(`[tipfall] donation page  → http://localhost:${config.port}/`);
  console.log(`[tipfall] OBS alerts     → http://localhost:${config.port}/overlay?key=${config.overlayKey}`);
  console.log(`[tipfall] OBS goal bar   → http://localhost:${config.port}/goal?key=${config.overlayKey}`);
  console.log(`[tipfall] customize      → http://localhost:${config.port}/customize`);
  console.log(`[tipfall] enabled assets: ${Object.keys(ASSETS).join(', ') || '(none — set ETH_ADDRESS / SOL_ADDRESS)'}`);
});

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname !== '/ws' || url.searchParams.get('key') !== config.overlayKey) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

const byChain = (chain) => ({
  native: Object.values(ASSETS).find((a) => a.chain === chain && a.kind === 'native') ?? null,
  usdc: Object.values(ASSETS).find((a) => a.chain === chain && a.kind !== 'native') ?? null,
});

watchEth(byChain('eth'), onPayment);
watchSol(byChain('sol'), onPayment);
