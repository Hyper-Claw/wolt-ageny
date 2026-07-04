import { config } from './config.js';
import { getState, setState } from './db.js';

const LAMPORTS = 10n ** 9n;

let rpcId = 0;
async function rpc(method, params = []) {
  const res = await fetch(config.solRpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  if (!res.ok) throw new Error(`SOL RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`SOL RPC: ${json.error.message}`);
  return json.result;
}

export function solToLamports(amountStr) {
  const [whole = '0', frac = ''] = String(amountStr).split('.');
  return BigInt(whole) * LAMPORTS + BigInt((frac + '0'.repeat(9)).slice(0, 9));
}

export function lamportsToSol(lamports) {
  const l = BigInt(lamports);
  const whole = l / LAMPORTS;
  const frac = (l % LAMPORTS).toString().padStart(9, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

// Polls signatures for the donation address and reports every transaction
// that increased its balance.
export function watchSol(onPayment) {
  if (!config.solAddress) return;
  let scanning = false;
  let bootstrapped = !!getState('solLastSig');

  async function tick() {
    if (scanning) return;
    scanning = true;
    try {
      const until = getState('solLastSig');
      const sigs = await rpc('getSignaturesForAddress', [
        config.solAddress,
        { limit: 25, ...(until ? { until } : {}), commitment: 'confirmed' },
      ]);
      if (!sigs?.length) {
        // Empty history on a fresh wallet: nothing to skip, start live.
        bootstrapped = true;
        return;
      }

      // First run with no stored cursor: don't replay old history, just set the cursor.
      if (!bootstrapped) {
        setState('solLastSig', sigs[0].signature);
        bootstrapped = true;
        return;
      }

      for (const sig of sigs.reverse()) {
        if (sig.err) continue;
        const tx = await rpc('getTransaction', [
          sig.signature,
          { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
        ]);
        if (!tx?.meta || tx.meta.err) continue;

        const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
        const idx = keys.indexOf(config.solAddress);
        if (idx === -1) continue;

        const delta = BigInt(tx.meta.postBalances[idx]) - BigInt(tx.meta.preBalances[idx]);
        if (delta <= 0n) continue;

        await onPayment({
          chain: 'sol',
          txid: sig.signature,
          sender: keys[0] ?? null,
          amount: delta.toString(),
          display: lamportsToSol(delta),
        });
      }
      setState('solLastSig', sigs[sigs.length - 1].signature);
    } catch (err) {
      console.error('[sol] watcher error:', err.message);
    } finally {
      scanning = false;
    }
  }

  tick();
  setInterval(tick, 10_000);
  console.log(`[sol] watching ${config.solAddress} via ${config.solRpc}`);
}
