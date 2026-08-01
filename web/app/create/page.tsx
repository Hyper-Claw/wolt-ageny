"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { decodeEventLog, type Address } from "viem";
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
    discord: "",
    website: "",
    farcaster: "",
  });
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [imgBusy, setImgBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleFile(file?: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setError("");
    setImgBusy(true);
    try {
      const uri = await compressToDataUri(file);
      setForm((f) => ({ ...f, uri }));
    } catch {
      setError("Couldn't process that image — try a smaller/simpler one, or paste a URL below.");
    } finally {
      setImgBusy(false);
    }
  }

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
      const hash = await writeContractAsync({
        ...launchpad,
        functionName: "launch",
        args: [
          {
            name: form.name,
            symbol: form.symbol,
            logo: form.uri,
            description: form.description,
            socials: {
              twitter: form.twitter,
              telegram: form.telegram,
              discord: form.discord,
              website: form.website,
              farcaster: form.farcaster,
            },
          },
        ],
      });
      setStatus("Deploying token + V3 pool on Arc…");
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
        <Field label="Image" hint="Drop or click to upload — auto-resized & stored on-chain. Or paste a URL below.">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFile(e.dataTransfer.files?.[0]);
            }}
            onClick={() => fileInputRef.current?.click()}
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-arc-border bg-black/20 p-3 hover:border-arc-accent"
          >
            {form.uri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.uri} alt="preview" className="h-12 w-12 rounded object-cover" />
            ) : (
              <div className="grid h-12 w-12 place-items-center rounded bg-black/30 text-xl text-arc-muted">+</div>
            )}
            <span className="text-sm text-arc-muted">
              {imgBusy ? "Processing…" : form.uri ? "Change image" : "Drop an image or click to upload"}
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>
        </Field>
        <Field label="…or Image URL" hint="https://… or data:image/…">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Twitter">
            <input className="input" placeholder="https://x.com/…" value={form.twitter} onChange={set("twitter")} />
          </Field>
          <Field label="Telegram">
            <input className="input" placeholder="https://t.me/…" value={form.telegram} onChange={set("telegram")} />
          </Field>
          <Field label="Discord">
            <input className="input" placeholder="https://discord.gg/…" value={form.discord} onChange={set("discord")} />
          </Field>
          <Field label="Website">
            <input className="input" placeholder="https://…" value={form.website} onChange={set("website")} />
          </Field>
          <Field label="Farcaster">
            <input className="input" placeholder="https://warpcast.com/…" value={form.farcaster} onChange={set("farcaster")} />
          </Field>
        </div>
        <p className="text-xs text-arc-muted">
          Launching deploys your token and seeds its entire supply into a locked Uniswap V3 pool paired
          with USDC. It's tradable immediately. You can buy your own tokens right after on the coin page.
        </p>

        {error && <p className="rounded-lg bg-red-500/10 p-3 text-xs text-red-300">{error}</p>}
        {status && !error && <p className="text-xs text-arc-green">{status}</p>}

        <button type="submit" className="btn-green w-full" disabled={!valid || busy || !isConfigured}>
          {busy ? "Working…" : isConnected ? "Launch coin" : "Connect wallet to launch"}
        </button>
      </form>
    </div>
  );
}

/**
 * Resize + compress an image entirely in the browser into a small data: URI so
 * it can be stored on-chain as the token's logo string. Steps down size/quality
 * until it fits under an on-chain-friendly cap.
 */
async function compressToDataUri(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const MAX_LEN = 40000; // ~30KB — keeps launch gas + Explore reads reasonable
  for (const size of [160, 128, 96, 64]) {
    for (const q of [0.85, 0.7, 0.55, 0.4]) {
      const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("no canvas context");
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      const uri = canvas.toDataURL("image/webp", q);
      if (uri.length <= MAX_LEN) return uri;
    }
  }
  throw new Error("image too large after compression");
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
