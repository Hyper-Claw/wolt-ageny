"use client";

import { useEffect, useState } from "react";
import { parseEther, parseUnits, formatUnits, maxUint256, type Address } from "viem";
import { useAccount, useConnect, useConfig, useReadContract, useWriteContract } from "wagmi";
import { injected } from "wagmi/connectors";
import { waitForTransactionReceipt } from "wagmi/actions";
import { launchpad } from "@/lib/contracts";
import { erc20Abi } from "@/lib/abi";
import { calcBuy, calcSell } from "@/lib/reads";
import { fmtCompact, fmtUsdc } from "@/lib/format";

type Mode = "buy" | "sell";
const SLIPPAGE_BPS = 300n; // 3%

export function TradePanel({
  token,
  graduated,
  onTraded,
}: {
  token: Address;
  graduated: boolean;
  onTraded: () => void;
}) {
  const config = useConfig();
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { writeContractAsync } = useWriteContract();

  const [mode, setMode] = useState<Mode>("buy");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<bigint>(0n);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // USDC (pair token) address + decimals from the launchpad.
  const { data: usdcAddr } = useReadContract({ ...launchpad, functionName: "usdc" });
  const { data: usdcDec } = useReadContract({ ...launchpad, functionName: "pairedDecimals" });
  const usdc = usdcAddr as Address | undefined;
  const usdcDecimals = Number(usdcDec ?? 6);

  const { data: usdcBal, refetch: refetchUsdcBal } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!usdc },
  });
  const { data: usdcAllowance, refetch: refetchUsdcAllow } = useReadContract({
    address: usdc,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && usdc ? [address, launchpad.address] : undefined,
    query: { enabled: !!address && !!usdc && mode === "buy" },
  });
  const { data: tokenBal, refetch: refetchTokenBal } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const { data: tokenAllowance, refetch: refetchTokenAllow } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, launchpad.address] : undefined,
    query: { enabled: !!address && mode === "sell" },
  });

  const amountIn = (): bigint | undefined => {
    try {
      if (!amount || Number(amount) <= 0) return undefined;
      return mode === "buy" ? parseUnits(amount, usdcDecimals) : parseEther(amount);
    } catch {
      return undefined;
    }
  };

  // Live quote as the user types.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const inAmt = amountIn();
      if (!inAmt) return setQuote(0n);
      try {
        const q = mode === "buy" ? await calcBuy(token, inAmt) : await calcSell(token, inAmt);
        if (!cancelled) setQuote(q);
      } catch {
        if (!cancelled) setQuote(0n);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, mode, token, usdcDecimals]);

  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);
  const minOut = (quote * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const inAmt = amountIn();
  const spender = launchpad.address;
  const needsApproval =
    mode === "buy"
      ? !!inAmt && (usdcAllowance ?? 0n) < inAmt
      : !!inAmt && (tokenAllowance ?? 0n) < inAmt;

  async function handle() {
    setError("");
    if (!isConnected) return connect({ connector: injected() });
    if (!inAmt) return;
    try {
      setBusy(true);
      if (mode === "buy") {
        if (!usdc) throw new Error("USDC not loaded");
        if ((usdcAllowance ?? 0n) < inAmt) {
          const ah = await writeContractAsync({ address: usdc, abi: erc20Abi, functionName: "approve", args: [spender, maxUint256] });
          await waitForTransactionReceipt(config, { hash: ah });
          await refetchUsdcAllow();
        }
        const hash = await writeContractAsync({ ...launchpad, functionName: "buy", args: [token, inAmt, minOut, deadline()] });
        await waitForTransactionReceipt(config, { hash });
      } else {
        if ((tokenAllowance ?? 0n) < inAmt) {
          const ah = await writeContractAsync({ address: token, abi: erc20Abi, functionName: "approve", args: [spender, maxUint256] });
          await waitForTransactionReceipt(config, { hash: ah });
          await refetchTokenAllow();
        }
        const hash = await writeContractAsync({ ...launchpad, functionName: "sell", args: [token, inAmt, minOut, deadline()] });
        await waitForTransactionReceipt(config, { hash });
      }
      setAmount("");
      setQuote(0n);
      await Promise.all([refetchUsdcBal(), refetchTokenBal(), onTraded()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-5">
      {graduated && (
        <div className="mb-3 rounded-lg bg-arc-blue/15 px-3 py-2 text-center text-xs font-semibold text-arc-blue">
          🎓 Graduated — trades in the open Uniswap V3 pool
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-arc-bg p-1">
        {(["buy", "sell"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              setMode(m);
              setAmount("");
              setQuote(0n);
            }}
            className={`rounded-md py-2 text-sm font-bold capitalize transition ${
              mode === m ? (m === "buy" ? "bg-arc-blue text-white" : "bg-red-500 text-white") : "text-arc-muted hover:text-arc-text"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-arc-muted">
        <span>{mode === "buy" ? "You pay (USDC)" : "You sell (tokens)"}</span>
        {mode === "buy" && usdcBal != null ? (
          <button className="hover:text-arc-text" onClick={() => setAmount(formatUnits(usdcBal as bigint, usdcDecimals))}>
            balance: {fmtUsdc(usdcBal as bigint)}
          </button>
        ) : mode === "sell" && tokenBal != null ? (
          <button className="hover:text-arc-text" onClick={() => setAmount(formatUnits(tokenBal as bigint, 18))}>
            balance: {fmtCompact(tokenBal as bigint)}
          </button>
        ) : null}
      </div>
      <input
        className="input mb-2 text-lg"
        placeholder="0.0"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
      />

      {(() => {
        const bal = mode === "buy" ? (usdcBal as bigint | undefined) : (tokenBal as bigint | undefined);
        const dec = mode === "buy" ? usdcDecimals : 18;
        if (bal == null || bal === 0n) return null;
        return (
          <div className="mb-3 flex flex-wrap gap-2">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => setAmount(formatUnits((bal * BigInt(pct)) / 100n, dec))}
                className="btn-ghost flex-1 px-2 py-1 text-xs"
              >
                {pct === 100 ? "MAX" : `${pct}%`}
              </button>
            ))}
          </div>
        );
      })()}

      <div className="mb-4 rounded-lg bg-arc-bg p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-arc-muted">You receive ≈</span>
          <span className="font-bold">
            {mode === "buy" ? `${quote > 0n ? fmtCompact(quote) : "0"} tokens` : `${quote > 0n ? fmtUsdc(quote) : "0"} USDC`}
          </span>
        </div>
        <div className="mt-1 flex justify-between text-xs text-arc-muted">
          <span>Slippage</span>
          <span>{Number(SLIPPAGE_BPS) / 100}%</span>
        </div>
      </div>

      {error && <p className="mb-3 rounded-lg bg-red-500/10 p-2 text-xs text-red-300">{error}</p>}

      <button
        onClick={handle}
        disabled={busy || (!!amount && quote === 0n)}
        className={mode === "buy" ? "btn-green w-full" : "btn w-full bg-red-500 text-white hover:bg-red-600"}
      >
        {busy
          ? "Working…"
          : !isConnected
            ? "Connect wallet"
            : needsApproval
              ? mode === "buy"
                ? "Approve & buy"
                : "Approve & sell"
              : mode === "buy"
                ? "Buy"
                : "Sell"}
      </button>
    </div>
  );
}
