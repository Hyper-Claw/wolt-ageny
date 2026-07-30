"use client";

import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortAddr, fmtNative } from "@/lib/format";

export function Header() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });

  return (
    <header className="sticky top-0 z-20 border-b border-arc-border bg-arc-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-arc-green font-black text-black">
              A
            </span>
            <span className="text-lg font-black tracking-tight">
              arc<span className="text-arc-green">.fun</span>
            </span>
          </Link>
          <nav className="hidden gap-4 text-sm text-arc-muted sm:flex">
            <Link href="/" className="hover:text-white">
              Explore
            </Link>
            <Link href="/create" className="hover:text-white">
              Create
            </Link>
            <a
              href="https://docs.arc.io/arc-chain"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white"
            >
              Arc Chain
            </a>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <Link href="/create" className="btn-green hidden text-sm sm:inline-flex">
            + Create coin
          </Link>
          {isConnected ? (
            <button
              onClick={() => disconnect()}
              className="btn-ghost text-sm"
              title="Click to disconnect"
            >
              {balance ? `${fmtNative(balance.value)} ${balance.symbol}` : ""} · {shortAddr(address!)}
            </button>
          ) : (
            <button onClick={() => connect({ connector: injected() })} className="btn-green text-sm">
              Connect wallet
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
