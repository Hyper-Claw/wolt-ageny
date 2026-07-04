import { config } from './config.js';
import { getState, setState } from './db.js';
import { TRANSFER_TOPIC } from './assets.js';

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

const hex = (n) => '0x' + n.toString(16);
const addrTopic = (addr) => '0x' + addr.replace(/^0x/, '').toLowerCase().padStart(64, '0');

// Watches confirmed blocks for native ETH transfers, and (if enabled) USDC
// ERC-20 Transfer logs, both into the receiving address.
export function watchEth({ native, usdc }, onPayment) {
  if (!native && !usdc) return;
  const recipient = (native ?? usdc).recipient;
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
      if (last >= safeHead) return;

      // Native ETH: scan each block's transactions.
      if (native) {
        for (let n = last + 1n; n <= safeHead; n++) {
          const block = await rpc('eth_getBlockByNumber', [hex(n), true]);
          if (!block) break;
          for (const tx of block.transactions ?? []) {
            if (tx.to?.toLowerCase() !== recipient) continue;
            const value = BigInt(tx.value);
            if (value === 0n) continue;
            await onPayment({
              asset: native, txid: tx.hash, sender: tx.from,
              amount: value.toString(), display: native.toDisplay(value),
            });
          }
        }
      }

      // USDC: one getLogs call over the whole range, filtered to transfers in.
      if (usdc) {
        const logs = await rpc('eth_getLogs', [{
          fromBlock: hex(last + 1n), toBlock: hex(safeHead),
          address: usdc.contract,
          topics: [TRANSFER_TOPIC, null, addrTopic(recipient)],
        }]);
        for (const log of logs ?? []) {
          const value = BigInt(log.data);
          if (value === 0n) continue;
          await onPayment({
            asset: usdc,
            // include logIndex so multiple transfers in one tx stay distinct
            txid: `${log.transactionHash}:${BigInt(log.logIndex).toString()}`,
            sender: '0x' + (log.topics[1] ?? '').slice(26),
            amount: value.toString(), display: usdc.toDisplay(value),
          });
        }
      }

      setState('ethLastBlock', safeHead.toString());
    } catch (err) {
      console.error('[eth] watcher error:', err.message);
    } finally {
      scanning = false;
    }
  }

  tick();
  setInterval(tick, 15_000);
  console.log(`[eth] watching ${recipient}${usdc ? ' (ETH + USDC)' : ' (ETH)'} via ${config.ethRpc}`);
}
