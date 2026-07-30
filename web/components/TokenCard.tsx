"use client";

import Link from "next/link";
import { type TokenWithCurve } from "@/lib/reads";
import { fmtCompact, shortAddr, timeAgo } from "@/lib/format";

export function TokenCard({ item }: { item: TokenWithCurve }) {
  const { meta, curve } = item;
  const graduated = curve?.graduated ?? false;
  const progress = curve ? Number(curve.progressBps) / 100 : 0;

  return (
    <Link
      href={`/token/${meta.token}`}
      className="card group overflow-hidden p-2 transition hover:border-arc-blue/60"
    >
      <div className="relative">
        <Thumb uri={meta.uri} symbol={meta.symbol} />
        {graduated && (
          <span className="absolute left-2 top-2 rounded-lg bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-arc-blue backdrop-blur">
            Graduated
          </span>
        )}
      </div>

      <div className="px-1.5 pb-1 pt-2.5">
        <div className="truncate text-sm font-bold text-arc-text">{meta.name}</div>
        <div className="truncate text-xs text-arc-muted">${meta.symbol}</div>

        <div className="mt-1.5 text-sm font-bold text-arc-text">
          ${fmtCompact(curve?.marketCap ?? 0n)} <span className="text-[10px] font-medium text-arc-muted">MC</span>
        </div>

        {!graduated && (
          <div className="mt-2">
            <div className="h-1 overflow-hidden rounded-full bg-arc-subtle">
              <div
                className="h-full rounded-full bg-arc-gradient transition-all"
                style={{ width: `${Math.min(100, Math.max(2, progress))}%` }}
              />
            </div>
          </div>
        )}

        <div className="mt-2 flex items-center justify-between text-[11px] text-arc-muted">
          <span className="font-mono">{shortAddr(meta.token)}</span>
          {graduated ? <span>{timeAgo(meta.createdAt)}</span> : <span className="text-arc-blue">{progress.toFixed(0)}%</span>}
        </div>
      </div>
    </Link>
  );
}

function Thumb({ uri, symbol }: { uri: string; symbol: string }) {
  const valid = uri && (uri.startsWith("http") || uri.startsWith("data:"));
  return (
    <div className="aspect-square w-full overflow-hidden rounded-xl bg-arc-subtle">
      {valid ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uri} alt={symbol} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-4xl font-black text-arc-muted">
          {symbol.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}
