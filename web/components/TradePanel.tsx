"use client";

import { useEffect, useState } from "react";
import { parseEther, formatUnits, maxUint256, type Address } from "viem";
import {
  useAccount,
  useConnect,
  useConfig,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { waitForTransactionReceipt } from "wagmi/actions";
import { launchpad } from "@/lib/contracts";
import { erc20Abi } from "@/lib/abi";
import { calcBuy, calcSell } from "@/lib/reads";
import { fmtCompact } from "@/lib/format";

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

  const { data: tokenBal, refetch: refetchBal } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, launchpad.address] : undefined,
    query: { enabled: !!address && mode === "sell" },
  });

  // Live quote as the user types.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        if (!amount || Number(amount) <= 0) return setQuote(0n);
        const wei = parseEther(amount);
        const q = mode === "buy" ? await calcBuy(token, wei) : await calcSell(token, wei);
        if (!cancelled) setQuote(q);
      } catch {
        if (!cancelled) setQuote(0n);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [amount, mode, token]);

  const deadline = () => BigInt(Math.floor(Date.now() / 1000) + 600);
  const minOut = (quote * (10_000n - SLIPPAGE_BPS)) / 10_000n;
  const needsApproval = mode === "sell" && amount && (allowance ?? 0n) < (safeParse(amount) ?? 0n);

  async function handle() {
    setError("");
    if (!isConnected) return connect({ connector: injected() });
    const wei = safeParse(amount);
    if (!wei || wei <= 0n) return;
    try {
      setBusy(true);
      if (mode === "buy") {
        const hash = await writeContractAsync({
          ...launchpad,
          functionName: "buy",
          args: [token, minOut, deadline()],
          value: wei,
        });
        await waitForTransactionReceipt(config, { hash });
      } else {
        if (needsApproval) {
          const ah = await writeContractAsync({
            address: token,
            abi: erc20Abi,
            functionName: "approve",
            args: [launchpad.address, maxUint256],
          });
          await waitForTransactionReceipt(config, { hash: ah });
          await refetchAllowance();
        }
        const hash = await writeContractAsync({
          ...launchpad,
          functionName: "sell",
          args: [token, wei, minOut, deadline()],
        });
        await waitForTransactionReceipt(config, { hash });
      }
      setAmount("");
      setQuote(0n);
      await Promise.all([refetchBal(), onTraded()]);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message.split("\n")[0] : "Transaction failed");
    } finally {
      setBusy(false);
    }
  }

  if (graduated) {
    return (
      <div className="card p-5">
        <div className="text-center">
          <div className="text-lg font-black text-arc-green">🎓 Graduated</div>
          <p className="mt-1 text-sm text-arc-muted">
            The bonding curve is complete and liquidity is locked, pending migration to a DEX. Curve
            trading is closed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
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
              mode === m
                ? m === "buy"
                  ? "bg-arc-green text-black"
                  : "bg-red-500 text-white"
                : "text-arc-muted hover:text-white"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      <div className="mb-2 flex items-center justify-between text-xs text-arc-muted">
        <span>{mode === "buy" ? "You pay (USDC)" : "You sell (tokens)"}</span>
        {mode === "sell" && tokenBal != null && (
          <button
            className="hover:text-white"
            onClick={() => setAmount(formatUnits(tokenBal as bigint, 18))}
          >
            balance: {fmtCompact(tokenBal as bigint)}
          </button>
        )}
      </div>
      <input
        className="input mb-2 text-lg"
        placeholder="0.0"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
      />

      {mode === "buy" && (
        <div className="mb-3 flex flex-wrap gap-2">
          {["0.1", "1", "5", "10"].map((v) => (
            <button key={v} onClick={() => setAmount(v)} className="btn-ghost px-2 py-1 text-xs">
              {v}
            </button>
          ))}
        </div>
      )}

      <div className="mb-4 rounded-lg bg-arc-bg p-3 text-sm">
        <div className="flex justify-between">
          <span className="text-arc-muted">You receive ≈</span>
          <span className="font-bold">
            {quote > 0n ? fmtCompact(quote) : "0"} {mode === "buy" ? "tokens" : "USDC"}
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
              ? "Approve & sell"
              : mode === "buy"
                ? "Buy"
                : "Sell"}
      </button>
    </div>
  );
}

function safeParse(v: string): bigint | undefined {
  try {
    return parseEther(v || "0");
  } catch {
    return undefined;
  }
}
