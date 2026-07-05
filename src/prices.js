// EUR + USD prices for pretty alert amounts, goal tracking, and dollar-based
// preset buttons. Cosmetic/best-effort — donations still work if this API is
// unreachable (EUR shows blank; presets fall back to coin amounts).
let cache = { at: 0, byId: {} };

const IDS = ['ethereum', 'solana', 'usd-coin'];

// Optional static override, e.g. PRICES_EUR="ethereum:3000,solana:150,usd-coin:0.92".
// Skips the network entirely — handy for self-hosts that can't reach CoinGecko.
const STATIC = (() => {
  if (!process.env.PRICES_EUR) return null;
  const byId = {};
  for (const pair of process.env.PRICES_EUR.split(',')) {
    const [id, v] = pair.split(':');
    if (id && v) byId[id.trim()] = { eur: Number(v), usd: Number(v) };
  }
  return byId;
})();

export async function getPrices() {
  if (STATIC) return STATIC;
  if (Date.now() - cache.at < 5 * 60_000) return cache.byId;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${IDS.join(',')}&vs_currencies=eur,usd`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const json = await res.json();
      cache = {
        at: Date.now(),
        byId: Object.fromEntries(IDS.map((id) => [id, {
          eur: json[id]?.eur ?? null,
          usd: json[id]?.usd ?? null,
        }])),
      };
    }
  } catch {
    // keep stale cache
  }
  return cache.byId;
}

// eurValue(asset, displayAmount, prices) -> number | null
export function eurValue(asset, displayAmount, prices) {
  const price = prices[asset.coingecko]?.eur;
  if (price == null) return null;
  return Math.round(Number(displayAmount) * price * 100) / 100;
}

// usdPrice(asset, prices) -> number | null  (price of 1 coin in USD)
export function usdPrice(asset, prices) {
  return prices[asset.coingecko]?.usd ?? null;
}

// eurPrice(asset, prices) -> number | null  (price of 1 coin in EUR)
export function eurPrice(asset, prices) {
  return prices[asset.coingecko]?.eur ?? null;
}
