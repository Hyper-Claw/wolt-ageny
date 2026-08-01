import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { activeChain } from "./chain";
import { launchpadAbi, erc20Abi } from "./abi";
import { LAUNCHPAD_ADDRESS, DEPLOY_BLOCK } from "./contracts";

export const publicClient = createPublicClient({ chain: activeChain, transport: http() });

// Multicall3 is only used when NEXT_PUBLIC_MULTICALL3 is set (i.e. we've
// deployed/confirmed one on Arc). Otherwise we read directly — trying to route
// through a non-existent contract stalls every call.
const HAS_MULTICALL = !!process.env.NEXT_PUBLIC_MULTICALL3;

/**
 * Concurrency gate. The Arc RPC (reached over a single Tor circuit) rate-limits
 * bursts with 429s — firing every token's reads at once made the Explore page
 * hang and come back empty. This caps how many reads are in flight at a time so
 * we stay under the limit instead of getting throttled to a halt.
 */
let inFlight = 0;
const waiters: Array<() => void> = [];
async function gated<T>(fn: () => Promise<T>, max = 6): Promise<T> {
  if (inFlight >= max) await new Promise<void>((r) => waiters.push(r));
  inFlight++;
  try {
    return await fn();
  } finally {
    inFlight--;
    waiters.shift()?.();
  }
}

const tradeEvent = parseAbiItem(
  "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 usdcAmount, uint256 tokenAmount, uint256 timestamp)"
);

/** USDC (pair token) address + decimals, read from the launchpad. */
export async function fetchUsdcInfo(): Promise<{ address: Address; decimals: number }> {
  const [address, decimals] = await Promise.all([
    publicClient.readContract({ ...launchpad, functionName: "usdc" }),
    publicClient.readContract({ ...launchpad, functionName: "pairedDecimals" }),
  ]);
  return { address: address as Address, decimals: Number(decimals) };
}

const launchpad = { address: LAUNCHPAD_ADDRESS, abi: launchpadAbi } as const;

export type TokenMeta = {
  token: Address;
  creator: Address;
  name: string;
  symbol: string;
  uri: string; // logo
  pool: Address;
  description: string;
  twitter: string;
  telegram: string;
  discord: string;
  website: string;
  farcaster: string;
  createdAt: number;
};

export type CurveState = {
  spotPrice: bigint;
  marketCap: bigint;
  progressBps: bigint;
  principal: bigint;
  graduated: boolean;
};

export type TradeRow = {
  trader: Address;
  isBuy: boolean;
  usdcAmount: bigint; // 6-dec
  tokenAmount: bigint; // 18-dec
  timestamp: number;
  txHash: string;
};

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

/** Retry a read a few times — the Tor-bridged RPC occasionally rate-limits (429). */
async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  throw lastErr;
}

/**
 * All launched tokens (newest-first), read from the launchpad's on-chain views
 * (`tokenCount` + `getTokens`) plus each token's self-describing getters.
 *
 * This uses plain `eth_call`s instead of `eth_getLogs`, because the Arc RPC
 * (reached through the Tor bridge) caps/So rejects wide log ranges — which made
 * the log-based discovery return nothing. Views always work.
 */
export async function fetchTokenList(): Promise<TokenMeta[]> {
  const count = (await gated(() =>
    withRetry(() => publicClient.readContract({ ...launchpad, functionName: "tokenCount" }))
  )) as bigint;
  if (count === 0n) return [];

  // getTokens already returns newest-first.
  const addresses = (await gated(() =>
    withRetry(() => publicClient.readContract({ ...launchpad, functionName: "getTokens", args: [0n, count] }))
  )) as readonly Address[];

  const n = addresses.length;
  const metas = await Promise.all(
    addresses.map(async (token, i) => {
      const meta: TokenMeta = {
        token,
        creator: ZERO,
        name: "",
        symbol: "",
        uri: "",
        pool: ZERO,
        description: "",
        twitter: "",
        telegram: "",
        discord: "",
        website: "",
        farcaster: "",
        createdAt: n - i, // synthetic order key: newest (i=0) sorts highest
      };
      // Cards only need name/symbol/logo/pool/creator. description + socials are
      // fetched on the token detail page (fetchTokenMeta), keeping this list light.
      const read = (functionName: "name" | "symbol" | "logo" | "liquidityPool" | "deployer") =>
        gated(() =>
          withRetry(() => publicClient.readContract({ address: token, abi: erc20Abi, functionName }))
        ).catch(() => undefined);
      const [name, symbol, logo, pool, deployer] = await Promise.all([
        read("name"),
        read("symbol"),
        read("logo"),
        read("liquidityPool"),
        read("deployer"),
      ]);
      meta.name = (name as string) ?? "";
      meta.symbol = (symbol as string) ?? "";
      meta.uri = (logo as string) ?? "";
      meta.pool = (pool as Address) ?? ZERO;
      meta.creator = (deployer as Address) ?? ZERO;
      return meta;
    })
  );
  return metas;
}

/** Base list entry augmented with rich metadata read from the token itself. */
export async function fetchTokenMeta(token: Address): Promise<TokenMeta | null> {
  const list = await fetchTokenList();
  const base = list.find((t) => t.token.toLowerCase() === token.toLowerCase());
  if (!base) return null;
  try {
    const [description, socials] = await Promise.all([
      gated(() => withRetry(() => publicClient.readContract({ address: token, abi: erc20Abi, functionName: "description" }))),
      gated(() => withRetry(() => publicClient.readContract({ address: token, abi: erc20Abi, functionName: "socials" }))),
    ]);
    const s = socials as readonly [string, string, string, string, string];
    return {
      ...base,
      description: description as string,
      twitter: s[0],
      telegram: s[1],
      discord: s[2],
      website: s[3],
      farcaster: s[4],
    };
  } catch {
    return base;
  }
}

export type TokenWithCurve = { meta: TokenMeta; curve: CurveState | null };

/**
 * Explore-grid data via the cached /api/tokens endpoint (server does the slow
 * Tor reads once; the CDN serves everyone instantly). Bigints arrive as strings.
 */
export async function fetchTokensCached(): Promise<TokenWithCurve[]> {
  const res = await fetch("/api/tokens");
  if (!res.ok) throw new Error("tokens endpoint failed");
  const raw = (await res.json()) as Array<{
    meta: TokenMeta;
    curve: null | {
      spotPrice: string;
      marketCap: string;
      progressBps: string;
      principal: string;
      graduated: boolean;
    };
  }>;
  return raw.map((t) => ({
    meta: t.meta,
    curve: t.curve
      ? {
          spotPrice: BigInt(t.curve.spotPrice),
          marketCap: BigInt(t.curve.marketCap),
          progressBps: BigInt(t.curve.progressBps),
          principal: BigInt(t.curve.principal),
          graduated: t.curve.graduated,
        }
      : null,
  }));
}

/** Just the launched token addresses (newest-first), via on-chain views. */
async function fetchTokenAddresses(): Promise<Address[]> {
  const count = (await gated(() =>
    withRetry(() => publicClient.readContract({ ...launchpad, functionName: "tokenCount" }))
  )) as bigint;
  if (count === 0n) return [];
  const addresses = (await gated(() =>
    withRetry(() => publicClient.readContract({ ...launchpad, functionName: "getTokens", args: [0n, count] }))
  )) as readonly Address[];
  return [...addresses];
}

/**
 * Fast path: one Multicall3 request returns every token's metadata + curve
 * state in a single round-trip (huge over the slow Tor bridge). Throws if
 * Multicall3 isn't available, so the caller can fall back.
 */
async function fetchViaMulticall(addresses: Address[]): Promise<TokenWithCurve[]> {
  const PER = 9;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contracts: any[] = [];
  for (const token of addresses) {
    contracts.push(
      { address: token, abi: erc20Abi, functionName: "name" },
      { address: token, abi: erc20Abi, functionName: "symbol" },
      { address: token, abi: erc20Abi, functionName: "logo" },
      { address: token, abi: erc20Abi, functionName: "liquidityPool" },
      { address: token, abi: erc20Abi, functionName: "deployer" },
      { ...launchpad, functionName: "spotPrice", args: [token] },
      { ...launchpad, functionName: "marketCap", args: [token] },
      { ...launchpad, functionName: "progressBps", args: [token] },
      { ...launchpad, functionName: "graduationStatus", args: [token] }
    );
  }
  const res = await withRetry(() => publicClient.multicall({ contracts, allowFailure: true }));
  const n = addresses.length;
  return addresses.map((token, i) => {
    const base = i * PER;
    const ok = (j: number) => (res[base + j]?.status === "success" ? res[base + j].result : undefined);
    const meta: TokenMeta = {
      token,
      creator: (ok(4) as Address) ?? ZERO,
      name: (ok(0) as string) ?? "",
      symbol: (ok(1) as string) ?? "",
      uri: (ok(2) as string) ?? "",
      pool: (ok(3) as Address) ?? ZERO,
      description: "",
      twitter: "",
      telegram: "",
      discord: "",
      website: "",
      farcaster: "",
      createdAt: n - i,
    };
    const sp = ok(5) as bigint | undefined;
    const grad = ok(8) as readonly [bigint, bigint, boolean] | undefined;
    const curve: CurveState | null =
      sp !== undefined && grad
        ? {
            spotPrice: sp,
            marketCap: (ok(6) as bigint) ?? 0n,
            progressBps: (ok(7) as bigint) ?? 0n,
            principal: grad[0],
            graduated: grad[2],
          }
        : null;
    return { meta, curve };
  });
}

/** Every token with its live curve state (for the Explore grid). */
export async function fetchTokensWithCurves(): Promise<TokenWithCurve[]> {
  const addresses = await fetchTokenAddresses();
  if (!addresses.length) return [];
  if (HAS_MULTICALL) {
    try {
      return await fetchViaMulticall(addresses); // one round-trip when Multicall3 exists
    } catch {
      /* fall through to direct reads */
    }
  }
  const metas = await fetchTokenList();
  const curves = await Promise.all(metas.map((m) => fetchCurve(m.token).catch(() => null)));
  return metas.map((meta, i) => ({ meta, curve: curves[i] }));
}

export async function fetchCurve(token: Address): Promise<CurveState> {
  const call = (functionName: "spotPrice" | "marketCap" | "progressBps" | "graduationStatus") =>
    gated(() => withRetry(() => publicClient.readContract({ ...launchpad, functionName, args: [token] })));
  const [spotPrice, marketCap, progressBps, grad] = await Promise.all([
    call("spotPrice"),
    call("marketCap"),
    call("progressBps"),
    call("graduationStatus"),
  ]);
  const g = grad as readonly [bigint, bigint, boolean];
  return {
    spotPrice: spotPrice as bigint,
    marketCap: marketCap as bigint,
    progressBps: progressBps as bigint,
    principal: g[0],
    graduated: g[2],
  };
}

export type TokenFull = { meta: TokenMeta | null; curve: CurveState | null };

/**
 * One token's full metadata + curve state in a SINGLE Multicall3 request
 * (falls back to individual reads if Multicall3 is absent). Used by the cached
 * /api/token/[address] route so the token page loads in one round-trip.
 */
export async function fetchTokenFull(token: Address): Promise<TokenFull> {
  if (!HAS_MULTICALL) return fetchTokenLean(token);
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const contracts: any[] = [
      { address: token, abi: erc20Abi, functionName: "name" },
      { address: token, abi: erc20Abi, functionName: "symbol" },
      { address: token, abi: erc20Abi, functionName: "logo" },
      { address: token, abi: erc20Abi, functionName: "description" },
      { address: token, abi: erc20Abi, functionName: "socials" },
      { address: token, abi: erc20Abi, functionName: "deployer" },
      { address: token, abi: erc20Abi, functionName: "liquidityPool" },
      { ...launchpad, functionName: "spotPrice", args: [token] },
      { ...launchpad, functionName: "marketCap", args: [token] },
      { ...launchpad, functionName: "progressBps", args: [token] },
      { ...launchpad, functionName: "graduationStatus", args: [token] },
    ];
    const r = await withRetry(() => publicClient.multicall({ contracts, allowFailure: true }));
    const ok = (j: number) => (r[j]?.status === "success" ? r[j].result : undefined);
    const s = (ok(4) as readonly string[]) ?? [];
    const meta: TokenMeta = {
      token,
      name: (ok(0) as string) ?? "",
      symbol: (ok(1) as string) ?? "",
      uri: (ok(2) as string) ?? "",
      description: (ok(3) as string) ?? "",
      creator: (ok(5) as Address) ?? ZERO,
      pool: (ok(6) as Address) ?? ZERO,
      twitter: s[0] ?? "",
      telegram: s[1] ?? "",
      discord: s[2] ?? "",
      website: s[3] ?? "",
      farcaster: s[4] ?? "",
      createdAt: 0,
    };
    if (meta.pool === ZERO && !meta.name) return { meta: null, curve: null };
    const sp = ok(7) as bigint | undefined;
    const grad = ok(10) as readonly [bigint, bigint, boolean] | undefined;
    const curve: CurveState | null =
      sp !== undefined && grad
        ? {
            spotPrice: sp,
            marketCap: (ok(8) as bigint) ?? 0n,
            progressBps: (ok(9) as bigint) ?? 0n,
            principal: grad[0],
            graduated: grad[2],
          }
        : null;
    return { meta, curve };
  } catch {
    return fetchTokenLean(token);
  }
}

/** One token's meta + curve via direct reads (no Multicall3, no full-list scan). */
async function fetchTokenLean(token: Address): Promise<TokenFull> {
  const readT = (fn: "name" | "symbol" | "logo" | "description" | "socials" | "deployer" | "liquidityPool") =>
    gated(() => withRetry(() => publicClient.readContract({ address: token, abi: erc20Abi, functionName: fn }))).catch(
      () => undefined
    );
  const readL = (fn: "spotPrice" | "marketCap" | "progressBps" | "graduationStatus") =>
    gated(() => withRetry(() => publicClient.readContract({ ...launchpad, functionName: fn, args: [token] }))).catch(
      () => undefined
    );
  const [name, symbol, logo, description, socials, deployer, pool, sp, mc, pb, grad] = await Promise.all([
    readT("name"),
    readT("symbol"),
    readT("logo"),
    readT("description"),
    readT("socials"),
    readT("deployer"),
    readT("liquidityPool"),
    readL("spotPrice"),
    readL("marketCap"),
    readL("progressBps"),
    readL("graduationStatus"),
  ]);
  const s = (socials as readonly string[]) ?? [];
  const meta: TokenMeta = {
    token,
    name: (name as string) ?? "",
    symbol: (symbol as string) ?? "",
    uri: (logo as string) ?? "",
    description: (description as string) ?? "",
    creator: (deployer as Address) ?? ZERO,
    pool: (pool as Address) ?? ZERO,
    twitter: s[0] ?? "",
    telegram: s[1] ?? "",
    discord: s[2] ?? "",
    website: s[3] ?? "",
    farcaster: s[4] ?? "",
    createdAt: 0,
  };
  if (meta.pool === ZERO && !meta.name) return { meta: null, curve: null };
  const g = grad as readonly [bigint, bigint, boolean] | undefined;
  const curve: CurveState | null =
    sp !== undefined && g
      ? {
          spotPrice: sp as bigint,
          marketCap: (mc as bigint) ?? 0n,
          progressBps: (pb as bigint) ?? 0n,
          principal: g[0],
          graduated: g[2],
        }
      : null;
  return { meta, curve };
}

/** Token page data via the cached /api/token/[address] endpoint. */
export async function fetchTokenCached(token: Address): Promise<TokenFull> {
  const res = await fetch(`/api/token/${token}`);
  if (!res.ok) throw new Error("token endpoint failed");
  const t = (await res.json()) as {
    meta: TokenMeta | null;
    curve: null | { spotPrice: string; marketCap: string; progressBps: string; principal: string; graduated: boolean };
  };
  if (!t?.meta) return { meta: null, curve: null };
  return {
    meta: t.meta,
    curve: t.curve
      ? {
          spotPrice: BigInt(t.curve.spotPrice),
          marketCap: BigInt(t.curve.marketCap),
          progressBps: BigInt(t.curve.progressBps),
          principal: BigInt(t.curve.principal),
          graduated: t.curve.graduated,
        }
      : null,
  };
}

// spotPrice is USDC-per-token scaled 1e18; USDC is 6-dec, token 18-dec.
// tokensOut(18) = usdcIn(6) * 1e30 / spotPrice ; usdcOut(6) = tokenIn(18) * spotPrice / 1e30
const SCALE = 10n ** 30n;

/** Estimate tokens out for a USDC input (spot-based; on-chain minOut guards slippage). */
export async function calcBuy(token: Address, usdcIn: bigint): Promise<bigint> {
  if (usdcIn <= 0n) return 0n;
  const price = (await publicClient.readContract({ ...launchpad, functionName: "spotPrice", args: [token] })) as bigint;
  if (price === 0n) return 0n;
  return (usdcIn * SCALE) / price;
}

/** Estimate USDC out for a token input (spot-based). */
export async function calcSell(token: Address, tokenAmount: bigint): Promise<bigint> {
  if (tokenAmount <= 0n) return 0n;
  const price = (await publicClient.readContract({ ...launchpad, functionName: "spotPrice", args: [token] })) as bigint;
  return (tokenAmount * price) / SCALE;
}

export async function fetchTrades(token: Address): Promise<TradeRow[]> {
  const logs = await publicClient.getLogs({
    address: LAUNCHPAD_ADDRESS,
    event: tradeEvent,
    args: { token },
    fromBlock: DEPLOY_BLOCK,
    toBlock: "latest",
  });
  const rows = logs.map((log) => {
    const a = log.args;
    return {
      trader: a.trader as Address,
      isBuy: Boolean(a.isBuy),
      usdcAmount: a.usdcAmount ?? 0n,
      tokenAmount: a.tokenAmount ?? 0n,
      timestamp: Number(a.timestamp ?? 0n),
      txHash: log.transactionHash ?? "",
    };
  });
  return rows.reverse();
}
