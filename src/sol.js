import { config } from './config.js';
import { getState, setState } from './db.js';

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

// Generic signature poller for one address. `extract(tx)` returns the base-unit
// amount credited to us in that tx (0n to skip). `stateKey` stores the cursor.
function pollAddress({ address, stateKey, extract, onHit }) {
  let scanning = false;
  let bootstrapped = !!getState(stateKey);

  async function tick() {
    if (scanning) return;
    scanning = true;
    try {
      const until = getState(stateKey);
      const sigs = await rpc('getSignaturesForAddress', [
        address,
        { limit: 25, ...(until ? { until } : {}), commitment: 'confirmed' },
      ]);
      if (!sigs?.length) { bootstrapped = true; return; }

      // First run with no cursor: don't replay history, just mark the tip.
      if (!bootstrapped) {
        setState(stateKey, sigs[0].signature);
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
        const amount = extract(tx);
        if (amount > 0n) {
          const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
          await onHit({ txid: sig.signature, sender: keys[0] ?? null, amount });
        }
      }
      setState(stateKey, sigs[sigs.length - 1].signature);
    } catch (err) {
      console.error(`[sol] watcher error (${stateKey}):`, err.message);
    } finally {
      scanning = false;
    }
  }

  tick();
  setInterval(tick, 10_000);
}

export function watchSol({ native, usdc }, onPayment) {
  // Native SOL: balance delta on the owner account.
  if (native) {
    pollAddress({
      address: native.recipient,
      stateKey: 'solLastSig',
      extract: (tx) => {
        const keys = tx.transaction.message.accountKeys.map((k) => (typeof k === 'string' ? k : k.pubkey));
        const idx = keys.indexOf(native.recipient);
        if (idx === -1) return 0n;
        return BigInt(tx.meta.postBalances[idx]) - BigInt(tx.meta.preBalances[idx]);
      },
      onHit: ({ txid, sender, amount }) =>
        onPayment({ asset: native, txid, sender, amount: amount.toString(), display: native.toDisplay(amount) }),
    });
    console.log(`[sol] watching ${native.recipient} (SOL) via ${config.solRpc}`);
  }

  // USDC (SPL): resolve the owner's token account, then watch it.
  if (usdc) {
    (async () => {
      let ata = getState('solUsdcAta');
      while (!ata) {
        try {
          const res = await rpc('getTokenAccountsByOwner', [
            usdc.recipient, { mint: usdc.mint }, { encoding: 'jsonParsed', commitment: 'confirmed' },
          ]);
          ata = res?.value?.[0]?.pubkey ?? null;
        } catch (err) {
          console.error('[sol] USDC ATA lookup error:', err.message);
        }
        if (!ata) { await new Promise((r) => setTimeout(r, 60_000)); }
      }
      setState('solUsdcAta', ata);
      pollAddress({
        address: ata,
        stateKey: 'solUsdcLastSig',
        extract: (tx) => {
          const owned = (bals) => (bals ?? []).find(
            (b) => b.mint === usdc.mint && b.owner === usdc.recipient,
          );
          const pre = owned(tx.meta.preTokenBalances);
          const post = owned(tx.meta.postTokenBalances);
          if (!post) return 0n;
          const preAmt = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
          return BigInt(post.uiTokenAmount.amount) - preAmt;
        },
        onHit: ({ txid, sender, amount }) =>
          onPayment({ asset: usdc, txid, sender, amount: amount.toString(), display: usdc.toDisplay(amount) }),
      });
      console.log(`[sol] watching ${ata} (USDC ATA) via ${config.solRpc}`);
    })();
  }
}
