"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { parseEther, decodeEventLog, type Address } from "viem";
import { useAccount, useConnect, useWriteContract, useConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { waitForTransactionReceipt } from "wagmi/actions";
import { launchpad, isConfigured } from "@/lib/contracts";
import { launchpadAbi } from "@/lib/abi";
import { ConfigBanner } from "@/components/ConfigBanner";

export default function CreatePage() {
  const router = useRouter();
  const config = useConfig();
  const { isConnected } = useAccount();
  const { connect } = useConnect();
  const { writeContractAsync } = useWriteContract();

  const [form, setForm] = useState({
    name: "",
    symbol: "",
    uri: "",
    description: "",
    twitter: "",
    telegram: "",
    website: "",
    devBuy: "",
  });
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const valid = form.name.trim().length > 0 && form.symbol.trim().length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!valid) return;
    if (!isConnected) {
      connect({ connector: injected() });
      return;
    }
    try {
      setBusy(true);
      setStatus("Confirm the transaction in your wallet…");
      const value = form.devBuy ? parseEther(form.devBuy) : 0n;
      const hash = await writeContractAsync({
        ...launchpad,
        functionName: "launch",
        args: [
          form.name,
          form.symbol,
          form.uri,
          form.description,
          form.twitter,
          form.telegram,
          form.website,
          0n,
        ],
        value,
      });
      setStatus("Deploying token + curve on Arc…");
      const receipt = await waitForTransactionReceipt(config, { hash });

      // Pull the new token address out of the TokenLaunched event.
      let token: Address | undefined;
      for (const log of receipt.logs) {
        try {
          const parsed = decodeEventLog({ abi: launchpadAbi, data: log.data, topics: log.topics });
          if (parsed.eventName === "TokenLaunched") {
            token = (parsed.args as { token: Address }).token;
            break;
          }
        } catch {
          /* not our event */
        }
      }
      if (token) router.push(`/token/${token}`);
      else router.push("/");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Transaction failed");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-2xl font-black">Create a new coin</h1>
      <p className="mb-6 text-sm text-arc-muted">
        Deploys the token and its bonding-curve pool in one transaction. Fee: free to launch.
      </p>

      <ConfigBanner />

      <form onSubmit={onSubmit} className="card space-y-4 p-6">
        <Field label="Name *">
          <input className="input" placeholder="Arc Doge" value={form.name} onChange={set("name")} maxLength={64} />
        </Field>
        <Field label="Ticker *">
          <input
            className="input"
            placeholder="ADOGE"
            value={form.symbol}
            onChange={set("symbol")}
            maxLength={16}
          />
        </Field>
        <Field label="Image URL" hint="https://… or data:image/… (shown on cards & the coin page)">
          <input className="input" placeholder="https://…/logo.png" value={form.uri} onChange={set("uri")} />
        </Field>
        <Field label="Description">
          <textarea
            className="input min-h-[80px]"
            placeholder="What's the story?"
            value={form.description}
            onChange={set("description")}
            maxLength={500}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Twitter">
            <input className="input" placeholder="https://x.com/…" value={form.twitter} onChange={set("twitter")} />
          </Field>
          <Field label="Telegram">
            <input className="input" placeholder="https://t.me/…" value={form.telegram} onChange={set("telegram")} />
          </Field>
          <Field label="Website">
            <input className="input" placeholder="https://…" value={form.website} onChange={set("website")} />
          </Field>
        </div>
        <Field label="Dev buy (optional)" hint="USDC of your own to buy on the curve at launch">
          <input className="input" placeholder="0.0" inputMode="decimal" value={form.devBuy} onChange={set("devBuy")} />
        </Field>

        {error && <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
        {status && !error && <p className="text-xs text-arc-green">{status}</p>}

        <button type="submit" className="btn-green w-full" disabled={!valid || busy || !isConfigured}>
          {busy ? "Working…" : isConnected ? "Launch coin" : "Connect wallet to launch"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-sm font-semibold">{label}</div>
      {hint && <div className="mb-1 text-xs text-arc-muted">{hint}</div>}
      {children}
    </label>
  );
}
