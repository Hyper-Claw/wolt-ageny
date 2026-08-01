"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchTokensCached, type TokenWithCurve } from "@/lib/reads";
import { isConfigured } from "@/lib/contracts";
import { TokenCard } from "@/components/TokenCard";
import { ConfigBanner } from "@/components/ConfigBanner";

type Sort = "Recent buys" | "Newest" | "Oldest" | "Market cap" | "Volume";
type Window = "All" | "24h" | "7d";
const SORTS: Sort[] = ["Recent buys", "Newest", "Oldest", "Market cap", "Volume"];
const WINDOWS: Window[] = ["All", "24h", "7d"];

export default function ExplorePage() {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("Recent buys");
  const [win, setWin] = useState<Window>("All");

  const { data, isLoading } = useQuery({
    queryKey: ["tokensFull"],
    queryFn: fetchTokensCached,
    refetchInterval: 20_000,
    staleTime: 15_000,
    retry: 3,
    placeholderData: (prev) => prev, // keep showing tokens while refetching
    enabled: isConfigured,
  });

  const all = data ?? [];
  const matchesSearch = (t: TokenWithCurve) => {
    if (!q.trim()) return true;
    const n = q.toLowerCase();
    return (
      t.meta.name.toLowerCase().includes(n) ||
      t.meta.symbol.toLowerCase().includes(n) ||
      t.meta.token.toLowerCase().includes(n)
    );
  };

  const graduated = useMemo(
    () => all.filter((t) => t.curve?.graduated && matchesSearch(t)),
    [all, q]
  );

  const explore = useMemo(() => {
    const now = Math.floor(Date.now() / 1000);
    const windowSecs = win === "24h" ? 86400 : win === "7d" ? 604800 : Infinity;
    const list = all
      .filter((t) => !t.curve?.graduated && matchesSearch(t))
      .filter((t) => now - t.meta.createdAt <= windowSecs);
    const mc = (t: TokenWithCurve) => Number(t.curve?.marketCap ?? 0n);
    switch (sort) {
      case "Oldest":
        return [...list].sort((a, b) => a.meta.createdAt - b.meta.createdAt);
      case "Market cap":
      case "Volume":
        return [...list].sort((a, b) => mc(b) - mc(a));
      case "Newest":
      case "Recent buys":
      default:
        return [...list].sort((a, b) => b.meta.createdAt - a.meta.createdAt);
    }
  }, [all, q, sort, win]);

  return (
    <div className="space-y-6">
      {/* Search + create */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search tokens"
            className="input rounded-full pl-10 pr-16"
          />
          <span className="badge absolute right-2 top-1/2 -translate-y-1/2">⌘K</span>
        </div>
        <Link href="/create" className="btn-ghost whitespace-nowrap">
          + Create
        </Link>
      </div>

      <ConfigBanner />

      {/* Graduated */}
      <section className="relative overflow-hidden rounded-2xl border border-arc-blue/40 bg-gradient-to-br from-arc-blue/10 via-arc-purple/5 to-transparent p-5 shadow-glow">
        <div className="mb-1 flex items-center gap-2">
          <h2 className="text-xl font-black text-arc-text">Graduated</h2>
          <span className="badge bg-arc-blue/20 text-arc-blue">{graduated.length}</span>
        </div>
        <p className="mb-4 text-sm text-arc-muted">Tokens that cleared the graduation threshold.</p>
        <Grid items={graduated} loading={isLoading} emptyLabel="No graduated tokens yet." />
      </section>

      {/* Explore */}
      <section>
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-arc-text">Explore</h2>
              <span className="badge">{all.length} launched</span>
            </div>
            <p className="text-sm text-arc-muted">Tokens still climbing toward graduation on Arc.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="tabs">
              {SORTS.map((s) => (
                <button key={s} onClick={() => setSort(s)} className={`tab ${sort === s ? "tab-active" : ""}`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="tabs">
              {WINDOWS.map((w) => (
                <button key={w} onClick={() => setWin(w)} className={`tab ${win === w ? "tab-active" : ""}`}>
                  {w}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Grid
          items={explore}
          loading={isLoading}
          emptyLabel={
            isConfigured ? "No coins yet — be the first to launch one." : "Connect the launchpad contract to see live coins."
          }
        />
      </section>
    </div>
  );
}

function Grid({ items, loading, emptyLabel }: { items: TokenWithCurve[]; loading: boolean; emptyLabel: string }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="card aspect-[3/4] animate-pulse bg-arc-card/50" />
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return <div className="card p-8 text-center text-sm text-arc-muted">{emptyLabel}</div>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <TokenCard key={item.meta.token} item={item} />
      ))}
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-arc-muted"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}
