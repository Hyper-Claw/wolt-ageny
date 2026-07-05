import { config } from './config.js';
import { getState, setState } from './db.js';

// Watches Bitcoin addresses for incoming payments via a mempool.space-compatible
// API. Alerts on first sight (including 0-conf mempool) for snappy alerts;
// deduped by txid so a later confirmation doesn't re-alert.
export function watchBtc({ addresses, asset }, onPayment) {
  for (const addr of addresses) watchAddress(addr);

  function watchAddress(addr) {
    const key = `btcSeen_${addr}`;
    let scanning = false;

    async function tick() {
      if (scanning) return;
      scanning = true;
      try {
        const res = await fetch(`${config.btcApi}/address/${addr}/txs`, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const txs = await res.json();

        const raw = getState(key);
        const seen = new Set(raw ? JSON.parse(raw) : []);
        const bootstrap = raw == null;   // first run: adopt history without alerting

        for (const tx of [...txs].reverse()) {   // oldest first
          if (seen.has(tx.txid)) continue;
          seen.add(tx.txid);
          if (bootstrap) continue;
          const sats = (tx.vout ?? [])
            .filter((o) => o.scriptpubkey_address === addr)
            .reduce((s, o) => s + BigInt(o.value), 0n);
          if (sats <= 0n) continue;
          await onPayment({
            asset, network: 'Bitcoin', txid: `btc:${tx.txid}`,
            sender: null, amount: sats.toString(), display: asset.toDisplay(sats),
          });
        }
        setState(key, JSON.stringify([...seen].slice(-400)));
      } catch (err) {
        console.error(`[btc] ${addr.slice(0, 12)}… error:`, err.message);
      } finally {
        scanning = false;
      }
    }

    tick();
    setInterval(tick, config.btcPollMs);
    console.log(`[btc] watching ${addr} via ${config.btcApi}`);
  }
}
