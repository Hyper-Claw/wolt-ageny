"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect, useBalance } from "wagmi";
import { injected } from "wagmi/connectors";
import { shortAddr, fmtNative } from "@/lib/format";
import { Logo } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const pathname = usePathname();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: balance } = useBalance({ address });
  const onExplore = pathname === "/";

  return (
    <header className="sticky top-0 z-20 border-b border-arc-border bg-arc-bg/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Home">
            <Logo size={30} />
          </Link>
          <nav className="tabs">
            <Link href="/" className={`tab ${onExplore ? "tab-active" : ""}`}>
              Explore
            </Link>
            <span className="tab cursor-not-allowed opacity-60" title="Coming soon">
              Analytics
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {isConnected ? (
            <button onClick={() => disconnect()} className="btn-ghost" title="Click to disconnect">
              {balance ? `${fmtNative(balance.value)} ${balance.symbol} · ` : ""}
              {shortAddr(address!)}
            </button>
          ) : (
            <button onClick={() => connect({ connector: injected() })} className="btn-green">
              Connect
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
