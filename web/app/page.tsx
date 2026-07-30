"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTokenList } from "@/lib/reads";
import { isConfigured } from "@/lib/contracts";
import { TokenCard } from "@/components/TokenCard";
import { ConfigBanner } from "@/components/ConfigBanner";

export default function ExplorePage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["tokenList"],
    queryFn: fetchTokenList,
    refetchInterval: 15_000,
    enabled: isConfigured,
  });

  const filtered = useMemo(() => {
    const list = data ?? [];
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(needle) ||
        t.symbol.toLowerCase().includes(needle) ||
        t.token.toLowerCase().includes(needle)
    );
  }, [data, q]);

  return (
    <div>
      <section className="mb-8 overflow-hidden rounded-2xl border border-arc-border bg-gradient-to-br from-arc-panel to-arc-bg p-8">
        <h1 className="text-3xl font-black sm:text-4xl">
          Launch a coin on <span className="text-arc-green">Arc</span> in seconds
        </h1>
        <p className="mt-2 max-w-xl text-arc-muted">
          Deploy a token and its bonding-curve pool in a single transaction. Fair launch, locked
          liquidity, priced in native USDC. When the curve fills, the coin graduates.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/create" className="btn-green">
            + Create coin
          </Link>
          <a href="https://docs.arc.io/arc-chain" target="_blank" rel="noreferrer" className="btn-ghost">
            Learn about Arc
          </a>
        </div>
      </section>

      <ConfigBanner />

      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold">Explore</h2>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, ticker or address…"
          className="input max-w-xs"
        />
      </div>

      {isLoading && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-28 animate-pulse bg-arc-card/50" />
          ))}
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="card p-10 text-center text-arc-muted">
          {isConfigured ? (
            <>
              No coins yet.{" "}
              <Link href="/create" className="text-arc-green hover:underline">
                Be the first to launch one →
              </Link>
            </>
          ) : (
            <>Connect the launchpad contract to see live coins.</>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((meta) => (
          <TokenCard key={meta.token} meta={meta} />
        ))}
      </div>
    </div>
  );
}
