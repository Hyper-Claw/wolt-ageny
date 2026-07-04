# Tipfall 💜

Self-hosted crypto donation page for streamers — **ETH + SOL**, with live
alerts on stream via an OBS browser source. No payment processor, no
custodian, nothing that can ban you: tips go straight from the viewer's
wallet to yours, and this server only ever knows your **public** addresses.

## How it works

```
viewer ──(ETH/SOL tx)──▶ your wallet
   │                        ▲
   ▼                        │ watches chain via public RPC
donation page ──▶ relay server ──▶ WebSocket ──▶ OBS overlay alert 🎉
```

1. A viewer opens the donation page, enters name + message + amount.
2. The server hands back an **exact amount with a unique dust tail**
   (e.g. `0.0100000473 ETH`). That tail is how the on-chain watcher knows
   which name/message belongs to which payment — no accounts, no tx-hash
   pasting.
3. The watcher polls the chain (ETH blocks every 15 s, SOL signatures every
   10 s), verifies the payment actually landed in your wallet, and pushes an
   alert to the overlay. Payments that don't match a pending donation still
   alert as **Anonymous**, so nothing is ever missed.
4. Alerts can't be faked: they are only emitted for real, confirmed on-chain
   transfers to your address (deduped by tx id).

## Setup

```bash
npm install
cp .env.example .env   # fill in your wallet addresses + secrets
npm start
```

- **Donation page:** `http://<host>:3000/` — link this in your Twitch panel.
- **OBS overlay:** add a Browser Source pointing to
  `http://<host>:3000/overlay?key=<OVERLAY_KEY>` (size it e.g. 800×300,
  it has a transparent background).
  - Optional query params: `&duration=10` (seconds on screen), `&mute`.

### Test the overlay

```bash
curl -X POST http://localhost:3000/api/test-alert \
  -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" \
  -d '{"name":"TestDonor","message":"Hello stream!"}'
```

### Deploying

Viewers need to reach the donation page, so run it somewhere public
(any €3–5/month VPS, or a free-tier host like Railway/Render) behind HTTPS —
a reverse proxy like Caddy gives you TLS in two lines. The overlay
WebSocket automatically uses `wss://` on HTTPS pages.

## Security model

- The server holds **no keys and no funds** — it's read-only on both chains.
- Overlay events require the `OVERLAY_KEY`; test alerts require `ADMIN_KEY`.
- Donor names/messages are rendered with `textContent` (no HTML injection
  into your stream).
- Alerts fire only for transactions the watcher itself verified on-chain.

## Notes for the streamer

- Tips received are income; in Germany crypto received for streaming is
  taxable at its EUR value on receipt — keep the SQLite ledger
  (`data/tipfall.db`) as your record, and talk to a Steuerberater once
  amounts become regular.
- Public RPCs are rate-limited but fine for tip volume. If you outgrow
  them, set `ETH_RPC` / `SOL_RPC` to a free Alchemy/Helius endpoint.
