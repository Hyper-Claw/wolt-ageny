"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { type TokenMeta, fetchCurve } from "@/lib/reads";
import { fmtCompact, shortAddr, timeAgo } from "@/lib/format";

export function TokenCard({ meta }: { meta: TokenMeta }) {
  const { data: curve } = useQuery({
    queryKey: ["curve", meta.token],
    queryFn: () => fetchCurve(meta.token),
    refetchInterval: 10_000,
  });

  const progress = curve ? Number(curve.progressBps) / 100 : 0;

  return (
    <Link
      href={`/token/${meta.token}`}
      className="card group flex gap-3 p-3 transition hover:border-arc-green/60"
    >
      <Thumb uri={meta.uri} symbol={meta.symbol} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="truncate font-bold">
            {meta.name} <span className="text-arc-muted">${meta.symbol}</span>
          </div>
          {curve?.graduated && (
            <span className="rounded bg-arc-green/20 px-1.5 py-0.5 text-[10px] font-bold text-arc-green">
              GRADUATED
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-arc-muted">
          by {shortAddr(meta.creator)} · {timeAgo(meta.createdAt)}
        </div>
        <p className="mt-1 line-clamp-2 text-xs text-arc-muted/80">{meta.description}</p>

        <div className="mt-2">
          <div className="flex justify-between text-[11px] text-arc-muted">
            <span>mcap {curve ? `${fmtCompact(curve.marketCap)} USDC` : "…"}</span>
            <span>{progress.toFixed(1)}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-arc-bg">
            <div
              className="h-full rounded-full bg-arc-green transition-all"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function Thumb({ uri, symbol }: { uri: string; symbol: string }) {
  const valid = uri && (uri.startsWith("http") || uri.startsWith("data:"));
  return (
    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-arc-bg">
      {valid ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uri} alt={symbol} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-2xl font-black text-arc-muted">
          {symbol.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}
