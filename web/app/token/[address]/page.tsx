"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAddress, isAddress, type Address } from "viem";
import { fetchTokenCached } from "@/lib/reads";
import { activeChain } from "@/lib/chain";
import { fmtCompact, fmtPrice, fmtUsdc, shortAddr } from "@/lib/format";
import { TradePanel } from "@/components/TradePanel";
import { TradesFeed } from "@/components/TradesFeed";
import { CopyAddress } from "@/components/CopyAddress";

export default function TokenPage() {
  const params = useParams<{ address: string }>();
  const raw = params.address;
  const valid = isAddress(raw);
  const token = (valid ? getAddress(raw) : "0x0000000000000000000000000000000000000000") as Address;
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, refetch } = useQuery({
    queryKey: ["tokenFull", token, refreshKey],
    queryFn: () => fetchTokenCached(token),
    enabled: valid,
    refetchInterval: 8_000,
    placeholderData: (prev) => prev,
  });
  const meta = data?.meta ?? undefined;
  const curve = data?.curve ?? undefined;

  if (!valid) {
    return <p className="text-arc-muted">Invalid token address.</p>;
  }

  const progress = curve ? Number(curve.progressBps) / 100 : 0;

  return (
    <div>
      <Link href="/" className="text-sm text-arc-muted hover:text-white">
        ← Back to explore
      </Link>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: identity, stats, trades */}
        <div className="space-y-6 lg:col-span-2">
          <div className="card flex gap-4 p-5">
            <Thumb uri={meta?.uri} symbol={meta?.symbol ?? "?"} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black">{meta?.name ?? "…"}</h1>
                <span className="text-lg text-arc-muted">${meta?.symbol ?? ""}</span>
                {curve?.graduated && (
                  <span className="rounded bg-arc-green/20 px-2 py-0.5 text-xs font-bold text-arc-green">
                    GRADUATED
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-arc-muted">{meta?.description}</p>
              <div className="mt-2 space-y-2">
                <CopyAddress
                  value={token}
                  label="Contract"
                  href={
                    activeChain.blockExplorers
                      ? `${activeChain.blockExplorers.default.url}/address/${token}`
                      : undefined
                  }
                />
                {meta?.pool && meta.pool !== "0x0000000000000000000000000000000000000000" && (
                  <CopyAddress
                    value={meta.pool}
                    label="Pool"
                    href={
                      activeChain.blockExplorers
                        ? `${activeChain.blockExplorers.default.url}/address/${meta.pool}`
                        : undefined
                    }
                  />
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                {meta?.creator && <span className="text-arc-muted">creator {shortAddr(meta.creator)}</span>}
                {meta?.twitter && <SocialLink href={meta.twitter} label="twitter" />}
                {meta?.telegram && <SocialLink href={meta.telegram} label="telegram" />}
                {meta?.discord && <SocialLink href={meta.discord} label="discord" />}
                {meta?.website && <SocialLink href={meta.website} label="website" />}
                {meta?.farcaster && <SocialLink href={meta.farcaster} label="farcaster" />}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Market cap" value={curve ? `${fmtCompact(curve.marketCap)}` : "…"} unit="USDC" />
            <Stat label="Price" value={curve ? fmtPrice(curve.spotPrice) : "…"} unit="USDC" />
            <Stat label="Raised" value={curve ? fmtUsdc(curve.principal) : "…"} unit="USDC" />
            <Stat label="Progress" value={`${progress.toFixed(1)}%`} />
          </div>

          <CurveProgress progress={progress} />

          <TradesFeed token={token} refreshKey={refreshKey} />
        </div>

        {/* Right: trade panel */}
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-20">
            <TradePanel
              token={token}
              graduated={curve?.graduated ?? false}
              onTraded={async () => {
                setRefreshKey((k) => k + 1);
                try {
                  await fetch("/api/revalidate", {
                    method: "POST",
                    body: JSON.stringify({ paths: [`/api/token/${token}`, "/api/tokens"] }),
                  });
                } catch {
                  /* best-effort */
                }
                await refetch();
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function CurveProgress({ progress }: { progress: number }) {
  return (
    <div className="card p-5">
      <div className="mb-2 flex justify-between text-sm">
        <span className="font-bold">Bonding curve progress</span>
        <span className="text-arc-green">{progress.toFixed(2)}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-arc-bg">
        <div
          className="h-full rounded-full bg-arc-gradient transition-all"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
      <p className="mt-3 text-xs text-arc-muted">
        Progress tracks USDC raised toward the graduation threshold. Liquidity is locked in the
        Uniswap V3 pool from launch, and trading continues in the same pool before and after
        graduation.
      </p>
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-arc-muted">{label}</div>
      <div className="mt-1 font-bold">
        {value} {unit && <span className="text-xs font-normal text-arc-muted">{unit}</span>}
      </div>
    </div>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-arc-accent hover:underline">
      {label}
    </a>
  );
}

function Thumb({ uri, symbol }: { uri?: string; symbol: string }) {
  const valid = uri && (uri.startsWith("http") || uri.startsWith("data:"));
  return (
    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-arc-bg">
      {valid ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={uri} alt={symbol} className="h-full w-full object-cover" />
      ) : (
        <div className="grid h-full w-full place-items-center text-3xl font-black text-arc-muted">
          {symbol.slice(0, 2).toUpperCase()}
        </div>
      )}
    </div>
  );
}
