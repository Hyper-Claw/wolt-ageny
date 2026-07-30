import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { activeChain } from "./chain";
import { launchpadAbi, erc20Abi } from "./abi";
import { LAUNCHPAD_ADDRESS, DEPLOY_BLOCK } from "./contracts";

export const publicClient = createPublicClient({ chain: activeChain, transport: http() });

const tokenLaunchedEvent = parseAbiItem(
  "event TokenLaunched(address indexed token, address indexed creator, string name, string symbol, string logo, address pool, uint256 timestamp)"
);
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

/** All launched tokens (newest-first) from TokenLaunched logs. */
export async function fetchTokenList(): Promise<TokenMeta[]> {
  const logs = await publicClient.getLogs({
    address: LAUNCHPAD_ADDRESS,
    event: tokenLaunchedEvent,
    fromBlock: DEPLOY_BLOCK,
    toBlock: "latest",
  });
  const metas = logs.map((log) => {
    const a = log.args;
    return {
      token: a.token as Address,
      creator: a.creator as Address,
      name: a.name ?? "",
      symbol: a.symbol ?? "",
      uri: a.logo ?? "",
      pool: (a.pool as Address) ?? "0x0000000000000000000000000000000000000000",
      description: "",
      twitter: "",
      telegram: "",
      discord: "",
      website: "",
      farcaster: "",
      createdAt: Number(a.timestamp ?? 0n),
    } as TokenMeta;
  });
  return metas.reverse();
}

/** Base list entry augmented with rich metadata read from the token itself. */
export async function fetchTokenMeta(token: Address): Promise<TokenMeta | null> {
  const list = await fetchTokenList();
  const base = list.find((t) => t.token.toLowerCase() === token.toLowerCase());
  if (!base) return null;
  try {
    const [description, socials] = await Promise.all([
      publicClient.readContract({ address: token, abi: erc20Abi, functionName: "description" }),
      publicClient.readContract({ address: token, abi: erc20Abi, functionName: "socials" }),
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

/** Every token with its live curve state (for the Explore grid). */
export async function fetchTokensWithCurves(): Promise<TokenWithCurve[]> {
  const metas = await fetchTokenList();
  const curves = await Promise.all(metas.map((m) => fetchCurve(m.token).catch(() => null)));
  return metas.map((meta, i) => ({ meta, curve: curves[i] }));
}

export async function fetchCurve(token: Address): Promise<CurveState> {
  const [spotPrice, marketCap, progressBps, grad] = await Promise.all([
    publicClient.readContract({ ...launchpad, functionName: "spotPrice", args: [token] }),
    publicClient.readContract({ ...launchpad, functionName: "marketCap", args: [token] }),
    publicClient.readContract({ ...launchpad, functionName: "progressBps", args: [token] }),
    publicClient.readContract({ ...launchpad, functionName: "graduationStatus", args: [token] }),
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
