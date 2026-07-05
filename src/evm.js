import { getState, setState } from './db.js';
import { TRANSFER_TOPIC } from './assets.js';

const MAX_BLOCKS_PER_TICK = 800;    // normal catch-up cap
const DOWNTIME_SKIP = 20000;        // if further behind than this, jump to head

let rpcId = 0;
async function rpc(url, method, params = []) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

const hex = (n) => '0x' + n.toString(16);
const addrTopic = (addr) => '0x' + addr.replace(/^0x/, '').toLowerCase().padStart(64, '0');

// Watches one EVM chain for native (ETH) transfers and USDC transfers into the
// recipient. `ethAsset` is null on chains whose gas token isn't ETH (e.g. Polygon).
export function watchEvmChain(chain, { recipient, ethAsset, usdcAsset }, onPayment) {
  const stateKey = `evmLast_${chain.id}`;
  let scanning = false;

  async function tick() {
    if (scanning) return;
    scanning = true;
    try {
      const head = BigInt(await rpc(chain.rpc, 'eth_blockNumber'));
      const safeHead = head - BigInt(chain.confirmations);
      if (safeHead < 0n) return;

      let last = getState(stateKey) ? BigInt(getState(stateKey)) : safeHead - 1n;
      if (safeHead - last > BigInt(DOWNTIME_SKIP)) {
        console.warn(`[${chain.id}] far behind (${safeHead - last} blocks) — skipping to head`);
        last = safeHead - 5n;
      }
      if (last >= safeHead) return;
      const to = last + BigInt(MAX_BLOCKS_PER_TICK) < safeHead ? last + BigInt(MAX_BLOCKS_PER_TICK) : safeHead;

      // Native transfers (only where the gas token is ETH).
      if (ethAsset) {
        for (let n = last + 1n; n <= to; n++) {
          const block = await rpc(chain.rpc, 'eth_getBlockByNumber', [hex(n), true]);
          if (!block) break;
          for (const tx of block.transactions ?? []) {
            if (tx.to?.toLowerCase() !== recipient) continue;
            const value = BigInt(tx.value);
            if (value === 0n) continue;
            await onPayment({
              asset: ethAsset, network: chain.name, txid: `${chain.id}:${tx.hash}`,
              sender: tx.from, amount: value.toString(), display: ethAsset.toDisplay(value),
            });
          }
        }
      }

      // USDC transfers via one getLogs call over the range.
      if (usdcAsset && chain.usdc) {
        const logs = await rpc(chain.rpc, 'eth_getLogs', [{
          fromBlock: hex(last + 1n), toBlock: hex(to),
          address: chain.usdc, topics: [TRANSFER_TOPIC, null, addrTopic(recipient)],
        }]);
        for (const log of logs ?? []) {
          const value = BigInt(log.data);
          if (value === 0n) continue;
          await onPayment({
            asset: usdcAsset, network: chain.name,
            txid: `${chain.id}:${log.transactionHash}:${BigInt(log.logIndex).toString()}`,
            sender: '0x' + (log.topics[1] ?? '').slice(26),
            amount: value.toString(), display: usdcAsset.toDisplay(value),
          });
        }
      }

      setState(stateKey, to.toString());
    } catch (err) {
      console.error(`[${chain.id}] watcher error:`, err.message);
    } finally {
      scanning = false;
    }
  }

  tick();
  setInterval(tick, 15_000);
  const kinds = [ethAsset && 'ETH', usdcAsset && 'USDC'].filter(Boolean).join(' + ');
  console.log(`[${chain.id}] watching ${recipient} (${kinds}) via ${chain.rpc}`);
}
