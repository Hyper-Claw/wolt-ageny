"use client";

import { useState } from "react";

/**
 * Shows a full address in monospace with a copy-to-clipboard button and an
 * optional block-explorer link. Wraps on small screens instead of truncating.
 */
export function CopyAddress({
  value,
  href,
  label = "Contract",
}: {
  value: string;
  href?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-arc-border bg-black/20 px-3 py-2 text-xs">
      {label && <span className="text-arc-muted">{label}</span>}
      <code className="min-w-0 flex-1 break-all font-mono text-arc-accent">{value}</code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-md border border-arc-border px-2 py-1 font-semibold hover:border-arc-accent"
        title="Copy address"
      >
        {copied ? (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            Copied
          </>
        ) : (
          <>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy
          </>
        )}
      </button>
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 rounded-md border border-arc-border px-2 py-1 font-semibold hover:border-arc-accent"
          title="View on explorer"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h6v6" />
            <path d="M10 14 21 3" />
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          </svg>
          Explorer
        </a>
      )}
    </div>
  );
}
