import { formatUnits } from "viem";

/** Format a native (USDC, 18-dec) amount with a symbol. */
export function fmtNative(wei: bigint, opts?: { decimals?: number }): string {
  const n = Number(formatUnits(wei, 18));
  const decimals = opts?.decimals ?? (n < 1 ? 4 : 2);
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals });
}

/** Compact number formatting for market caps etc. (e.g. 1.2K, 3.4M). */
export function fmtCompact(wei: bigint): string {
  const n = Number(formatUnits(wei, 18));
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 6 : 2 });
}

/** Compact token-amount formatting (18-dec ERC20 amounts). */
export function fmtTokens(wei: bigint): string {
  return fmtCompact(wei);
}

/** Price formatting that keeps precision for very small numbers. */
export function fmtPrice(wei: bigint): string {
  const n = Number(formatUnits(wei, 18));
  if (n === 0) return "0";
  if (n >= 0.01) return n.toLocaleString(undefined, { maximumFractionDigits: 6 });
  return n.toPrecision(3); // e.g. 7.70e-8
}

/** Format a 6-decimal USDC amount (raw) as a compact human value. */
export function fmtUsdc(raw: bigint): string {
  const n = Number(formatUnits(raw, 6));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`;
  return n.toLocaleString(undefined, { maximumFractionDigits: n < 1 ? 4 : 2 });
}

export function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}
