// EUR prices for pretty alert amounts and goal tracking. Cosmetic — donations
// still work if this API is unreachable (EUR just shows as unknown).
let cache = { at: 0, byId: {} };

const IDS = ['ethereum', 'solana', 'usd-coin'];

// Optional static override, e.g. PRICES_EUR="ethereum:3000,solana:150,usd-coin:0.92".
// Skips the network entirely — handy for self-hosts that can't reach CoinGecko.
const STATIC = (() => {
  if (!process.env.PRICES_EUR) return null;
  const byId = {};
  for (const pair of process.env.PRICES_EUR.split(',')) {
    const [id, v] = pair.split(':');
    if (id && v) byId[id.trim()] = Number(v);
  }
  return byId;
})();

export async function getPrices() {
  if (STATIC) return STATIC;
  if (Date.now() - cache.at < 5 * 60_000) return cache.byId;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${IDS.join(',')}&vs_currencies=eur`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const json = await res.json();
      cache = {
        at: Date.now(),
        byId: Object.fromEntries(IDS.map((id) => [id, json[id]?.eur ?? null])),
      };
    }
  } catch {
    // keep stale cache
  }
  return cache.byId;
}

// eurValue(asset, displayAmount, prices) -> number | null
export function eurValue(asset, displayAmount, prices) {
  const price = prices[asset.coingecko];
  if (price == null) return null;
  return Math.round(Number(displayAmount) * price * 100) / 100;
}
