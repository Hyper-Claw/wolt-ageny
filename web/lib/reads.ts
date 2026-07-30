import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { activeChain } from "./chain";
import { launchpadAbi } from "./abi";
import { LAUNCHPAD_ADDRESS, DEPLOY_BLOCK } from "./contracts";

const tokenLaunchedEvent = parseAbiItem(
  "event TokenLaunched(address indexed token, address indexed creator, string name, string symbol, string uri, string description, string twitter, string telegram, string website, uint256 timestamp)"
);
const tradeEvent = parseAbiItem(
  "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 nativeAmount, uint256 tokenAmount, uint256 feePaid, uint256 newTokensSold, uint256 newRealNativeReserve, uint256 timestamp)"
);

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(),
});

export type TokenMeta = {
  token: Address;
  creator: Address;
  name: string;
  symbol: string;
  uri: string;
  description: string;
  twitter: string;
  telegram: string;
  website: string;
  createdAt: number;
};

export type CurveState = {
  realNativeReserve: bigint;
  tokensSold: bigint;
  graduated: boolean;
  createdAt: bigint;
  spotPrice: bigint;
  marketCap: bigint;
  progressBps: bigint;
};

export type TradeRow = {
  trader: Address;
  isBuy: boolean;
  nativeAmount: bigint;
  tokenAmount: bigint;
  timestamp: number;
  txHash: string;
};

const launchpadContract = { address: LAUNCHPAD_ADDRESS, abi: launchpadAbi } as const;

/** Fetch all launched tokens (newest-first) from TokenLaunched logs. */
export async function fetchTokenList(): Promise<TokenMeta[]> {
  const logs = await publicClient.getLogs({
    address: LAUNCHPAD_ADDRESS,
    event: tokenLaunchedEvent,
    fromBlock: DEPLOY_BLOCK,
    toBlock: "latest",
  });
  const metas: TokenMeta[] = logs.map((log) => {
    const a = log.args;
    return {
      token: a.token as Address,
      creator: a.creator as Address,
      name: a.name ?? "",
      symbol: a.symbol ?? "",
      uri: a.uri ?? "",
      description: a.description ?? "",
      twitter: a.twitter ?? "",
      telegram: a.telegram ?? "",
      website: a.website ?? "",
      createdAt: Number(a.timestamp ?? 0n),
    };
  });
  return metas.reverse(); // newest-first
}

export async function fetchTokenMeta(token: Address): Promise<TokenMeta | null> {
  const list = await fetchTokenList();
  return list.find((t) => t.token.toLowerCase() === token.toLowerCase()) ?? null;
}

export type TokenWithCurve = { meta: TokenMeta; curve: CurveState | null };

/** Fetch every token together with its live curve state (for the Explore grid). */
export async function fetchTokensWithCurves(): Promise<TokenWithCurve[]> {
  const metas = await fetchTokenList();
  const curves = await Promise.all(metas.map((m) => fetchCurve(m.token).catch(() => null)));
  return metas.map((meta, i) => ({ meta, curve: curves[i] }));
}

/** Read live curve state for a token. */
export async function fetchCurve(token: Address): Promise<CurveState> {
  const [curve, spotPrice, marketCap, progressBps] = await Promise.all([
    publicClient.readContract({ ...launchpadContract, functionName: "curves", args: [token] }),
    publicClient.readContract({ ...launchpadContract, functionName: "spotPrice", args: [token] }),
    publicClient.readContract({ ...launchpadContract, functionName: "marketCap", args: [token] }),
    publicClient.readContract({ ...launchpadContract, functionName: "progressBps", args: [token] }),
  ]);
  const c = curve as readonly [Address, Address, bigint, bigint, boolean, bigint];
  return {
    realNativeReserve: c[2],
    tokensSold: c[3],
    graduated: c[4],
    createdAt: c[5],
    spotPrice: spotPrice as bigint,
    marketCap: marketCap as bigint,
    progressBps: progressBps as bigint,
  };
}

export async function calcBuy(token: Address, grossIn: bigint): Promise<bigint> {
  if (grossIn <= 0n) return 0n;
  return (await publicClient.readContract({
    ...launchpadContract,
    functionName: "calcBuy",
    args: [token, grossIn],
  })) as bigint;
}

export async function calcSell(token: Address, tokenAmount: bigint): Promise<bigint> {
  if (tokenAmount <= 0n) return 0n;
  return (await publicClient.readContract({
    ...launchpadContract,
    functionName: "calcSell",
    args: [token, tokenAmount],
  })) as bigint;
}

/** Fetch recent trades for a token from Trade logs (newest-first). */
export async function fetchTrades(token: Address): Promise<TradeRow[]> {
  const logs = await publicClient.getLogs({
    address: LAUNCHPAD_ADDRESS,
    event: tradeEvent,
    args: { token },
    fromBlock: DEPLOY_BLOCK,
    toBlock: "latest",
  });
  const rows: TradeRow[] = logs.map((log) => {
    const a = log.args;
    return {
      trader: a.trader as Address,
      isBuy: Boolean(a.isBuy),
      nativeAmount: a.nativeAmount ?? 0n,
      tokenAmount: a.tokenAmount ?? 0n,
      timestamp: Number(a.timestamp ?? 0n),
      txHash: log.transactionHash ?? "",
    };
  });
  return rows.reverse();
}
