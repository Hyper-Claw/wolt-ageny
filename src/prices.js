// EUR + USD prices for pretty alert amounts, goal tracking, and dollar-based
// preset buttons. Cosmetic/best-effort — donations still work if this API is
// unreachable (EUR shows blank; presets fall back to coin amounts).
let cache = { at: 0, byId: {} };

const IDS = ['ethereum', 'solana', 'usd-coin', 'bitcoin'];
// Fiat currencies a tipper can choose to see suggested amounts in.
export const CURRENCIES = ['usd', 'eur', 'gbp', 'cad', 'aud'];

// Optional static override, e.g. PRICES_EUR="ethereum:3000,solana:150,usd-coin:0.92".
// Skips the network entirely — handy for self-hosts that can't reach CoinGecko.
// Applies the given value to every currency (fine for offline dev).
const STATIC = (() => {
  if (!process.env.PRICES_EUR) return null;
  const byId = {};
  for (const pair of process.env.PRICES_EUR.split(',')) {
    const [id, v] = pair.split(':');
    if (id && v) byId[id.trim()] = Object.fromEntries(CURRENCIES.map((c) => [c, Number(v)]));
  }
  return byId;
})();

export async function getPrices() {
  if (STATIC) return STATIC;
  if (Date.now() - cache.at < 5 * 60_000) return cache.byId;
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${IDS.join(',')}&vs_currencies=${CURRENCIES.join(',')}`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const json = await res.json();
      cache = {
        at: Date.now(),
        byId: Object.fromEntries(IDS.map((id) => [id,
          Object.fromEntries(CURRENCIES.map((c) => [c, json[id]?.[c] ?? null])),
        ])),
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
