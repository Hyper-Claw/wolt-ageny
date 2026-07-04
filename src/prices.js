// EUR prices for pretty alert amounts. Purely cosmetic — donations work fine
// if this API is unreachable.
let cache = { eth: null, sol: null, at: 0 };

export async function getPrices() {
  if (Date.now() - cache.at < 5 * 60_000) return cache;
  try {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=ethereum,solana&vs_currencies=eur',
      { signal: AbortSignal.timeout(5000) },
    );
    if (res.ok) {
      const json = await res.json();
      cache = { eth: json.ethereum?.eur ?? null, sol: json.solana?.eur ?? null, at: Date.now() };
    }
  } catch {
    // keep stale cache
  }
  return cache;
}

export function eurValue(chain, displayAmount, prices) {
  const price = chain === 'eth' ? prices.eth : prices.sol;
  if (!price) return null;
  return Math.round(Number(displayAmount) * price * 100) / 100;
}
