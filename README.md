# Tipfall 💜

Self-hosted crypto donation page for streamers — **ETH, SOL, and USDC**
(on both chains) — with live alerts, a fundraising goal bar, and a
point-and-click customizer, all as OBS browser sources. No payment
processor, no custodian, nothing that can ban you: tips go straight from
the viewer's wallet to yours, and this server only ever knows your
**public** addresses.

## How it works

```
viewer ──(ETH / SOL / USDC tx)──▶ your wallet
   │                        ▲
   ▼                        │ watches chain via public RPC
donation page ──▶ relay server ──▶ WebSocket ──▶ OBS alert + goal bar 🎉
```

1. A viewer opens the donation page, picks an asset, enters name + message
   + amount.
2. The server hands back an **exact amount with a unique dust tail**
   (e.g. `25.000473 USDC`). That tail is how the on-chain watcher knows
   which name/message belongs to which payment — no accounts, no tx-hash
   pasting.
3. The watcher polls the chain (ETH blocks + USDC logs every 15 s, SOL
   signatures every 10 s), verifies the payment actually landed in your
   wallet, and pushes an alert to the overlay. Payments that don't match a
   pending donation still alert as **Anonymous**, so nothing is missed.
4. Alerts can't be faked: they are only emitted for real, confirmed
   on-chain transfers to your address (deduped by tx id).

## Assets & networks supported

Donors just pick **ETH**, **USDC**, or **SOL** — they never choose a network.
Because the receiving address is identical on every EVM chain, the server
watches all of them at once and catches the tip wherever it lands:

| Asset | Networks watched |
|-------|------------------|
| ETH   | Ethereum, Base, Arbitrum, Optimism |
| USDC  | Ethereum, Base, Arbitrum, Optimism, Polygon |
| BTC   | Bitcoin (native segwit + taproot, via mempool.space) |
| SOL   | Solana |
| USDC  | Solana |

Donors can type an amount **in their own currency** (USD/EUR/GBP/CAD/AUD,
auto-detected from their browser) and the page converts it to the coin at live
rates — or enter an exact coin amount.

This means a donor can pay on cheap L2s (Base/Arbitrum/Optimism, ~1¢ fees) and
it still shows up. The donation page tells them "send on any network — your tip
is safe on any of them." Turn off any EVM chain with
`EVM_DISABLE=polygon,optimism` and Solana USDC with `USDC_SOL=false`. USDC is a
stablecoin, so a tip's EUR value doesn't swing with the market.

## Setup

> 🧑‍🏫 **New to servers/crypto/terminals?** Follow
> **[SETUP-GUIDE.md](SETUP-GUIDE.md)** — a click-by-click walkthrough that
> assumes zero experience. For the condensed technical version, see
> **[DEPLOY.md](DEPLOY.md)**.

Local run (for development):

```bash
npm install
cp .env.example .env   # fill in your wallet addresses + secrets
npm start
```

The console prints all your URLs on start. In OBS, add each overlay as a
**Browser Source** (transparent background):

- **Donation page:** `http://<host>:3000/` — link this in your Twitch panel.
- **Alerts overlay:** `http://<host>:3000/overlay?key=<OVERLAY_KEY>`
  (e.g. 900×360). Query params: `&duration=10` (seconds), `&mute`.
- **Goal bar / top supporters:** `http://<host>:3000/goal?key=<OVERLAY_KEY>`
  (e.g. 440×340). Add `&nolist` to hide the supporter list.
- **Customizer:** `http://<host>:3000/customize` — set the alert sound, the
  goal, and donation **tiers** (bigger tips get a different color, GIF, and
  sound). Saves to the server; overlays pick changes up within a minute.

### Customization (the `/customize` page)

- **Sounds:** `chime`, `coin`, `fanfare`, or silent — synthesized in the
  browser, so there are no audio files to host. Preview before saving.
- **Goal:** title + € target; the bar fills as tips arrive.
- **Tiers:** e.g. "above €100 → gold border + fanfare + a celebration GIF".
  The highest tier a donation clears wins.

### Test the overlay

```bash
curl -X POST http://localhost:3000/api/test-alert \
  -H "x-admin-key: $ADMIN_KEY" -H "content-type: application/json" \
  -d '{"name":"TestDonor","message":"Hello stream!","eur":150}'
```

### Deploying

Viewers need to reach the donation page, so run it somewhere public
(any €3–5/month VPS, or a free-tier host like Railway/Render) behind HTTPS —
a reverse proxy like Caddy gives you TLS in two lines. The overlay
WebSocket automatically uses `wss://` on HTTPS pages.

## Security model

- The server holds **no keys and no funds** — it's read-only on all chains.
- Overlay/goal/settings reads require the `OVERLAY_KEY`; saving settings and
  test alerts require the `ADMIN_KEY`.
- Donor names/messages are rendered with `textContent` (no HTML injection
  into your stream or goal widget).
- Alerts fire only for transactions the watcher itself verified on-chain.

## Notes for the streamer

- Tips are income; in Germany crypto received for streaming is taxable at
  its EUR value on receipt — the SQLite ledger (`data/tipfall.db`) stores
  the EUR value per tip as your record. Talk to a Steuerberater once amounts
  become regular.
- EUR conversion uses CoinGecko. If your host can't reach it (or you'd
  rather not depend on it), set fixed rates via `PRICES_EUR` in `.env`.
- Public RPCs are rate-limited but fine for tip volume. If you outgrow them,
  set `ETH_RPC` / `SOL_RPC` to a free Alchemy/Helius endpoint.
