"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address } from "viem";
import { fetchTrades } from "@/lib/reads";
import { fmtCompact, fmtUsdc, shortAddr, timeAgo } from "@/lib/format";

export function TradesFeed({ token, refreshKey }: { token: Address; refreshKey: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["trades", token, refreshKey],
    queryFn: () => fetchTrades(token),
    refetchInterval: 8_000,
  });

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-arc-border px-4 py-3 font-bold">Trades</div>
      <div className="max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-arc-card text-left text-xs text-arc-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Account</th>
              <th className="px-4 py-2 font-medium">Type</th>
              <th className="px-4 py-2 text-right font-medium">USDC</th>
              <th className="px-4 py-2 text-right font-medium">Tokens</th>
              <th className="px-4 py-2 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-arc-muted">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && (data?.length ?? 0) === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-arc-muted">
                  No trades yet — be the first.
                </td>
              </tr>
            )}
            {data?.map((t, i) => (
              <tr key={`${t.txHash}-${i}`} className="border-t border-arc-border/50">
                <td className="px-4 py-2 font-mono text-xs">{shortAddr(t.trader)}</td>
                <td className={`px-4 py-2 font-bold ${t.isBuy ? "text-arc-green" : "text-red-400"}`}>
                  {t.isBuy ? "buy" : "sell"}
                </td>
                <td className="px-4 py-2 text-right">{fmtUsdc(t.usdcAmount)}</td>
                <td className="px-4 py-2 text-right">{fmtCompact(t.tokenAmount)}</td>
                <td className="px-4 py-2 text-right text-xs text-arc-muted">{timeAgo(t.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
