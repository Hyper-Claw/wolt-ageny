import { config } from './config.js';
import { getState, setState } from './db.js';

const WEI = 10n ** 18n;

let rpcId = 0;
async function rpc(method, params = []) {
  const res = await fetch(config.ethRpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  if (!res.ok) throw new Error(`ETH RPC HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(`ETH RPC: ${json.error.message}`);
  return json.result;
}

export function ethToWei(amountStr) {
  const [whole = '0', frac = ''] = String(amountStr).split('.');
  return BigInt(whole) * WEI + BigInt((frac + '0'.repeat(18)).slice(0, 18));
}

export function weiToEth(wei) {
  const w = BigInt(wei);
  const whole = w / WEI;
  const frac = (w % WEI).toString().padStart(18, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

// Polls new blocks (staying `ethConfirmations` behind head) and reports
// every plain-value transfer into the donation address.
export function watchEth(onPayment) {
  if (!config.ethAddress) return;
  let scanning = false;

  async function tick() {
    if (scanning) return;
    scanning = true;
    try {
      const head = BigInt(await rpc('eth_blockNumber'));
      const safeHead = head - BigInt(config.ethConfirmations);
      let last = getState('ethLastBlock') ? BigInt(getState('ethLastBlock')) : safeHead - 1n;
      // Never scan a huge backlog after downtime; skip to near-head.
      if (safeHead - last > 50n) last = safeHead - 5n;

      for (let n = last + 1n; n <= safeHead; n++) {
        const block = await rpc('eth_getBlockByNumber', ['0x' + n.toString(16), true]);
        if (!block) break;
        for (const tx of block.transactions ?? []) {
          if (tx.to?.toLowerCase() !== config.ethAddress) continue;
          const value = BigInt(tx.value);
          if (value === 0n) continue;
          await onPayment({
            chain: 'eth',
            txid: tx.hash,
            sender: tx.from,
            amount: value.toString(),
            display: weiToEth(value),
          });
        }
        setState('ethLastBlock', n.toString());
      }
    } catch (err) {
      console.error('[eth] watcher error:', err.message);
    } finally {
      scanning = false;
    }
  }

  tick();
  setInterval(tick, 15_000);
  console.log(`[eth] watching ${config.ethAddress} via ${config.ethRpc}`);
}
