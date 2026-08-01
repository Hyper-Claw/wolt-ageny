"use client";

import { useEffect, useState } from "react";

/**
 * Brand logo. Probes for /logo.png (your artwork) then /logo.svg (bundled
 * default) on the client and shows the first that loads; falls back to a
 * gradient "L" mark. Probing in an effect avoids the SSR 404 → broken-image
 * flash that a plain <img onError> chain hits during hydration.
 *
 * Drop your rope-L artwork at web/public/logo.png to use it.
 */
const SOURCES = ["/logo.png", "/logo.avif", "/logo.webp", "/logo.jpg", "/logo.svg"];

export function Logo({ size = 32 }: { size?: number }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const candidate of SOURCES) {
        const ok = await new Promise<boolean>((resolve) => {
          const img = new window.Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = candidate;
        });
        if (ok) {
          if (!cancelled) setSrc(candidate);
          return;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!src) {
    return (
      <span
        className="grid place-items-center rounded-lg bg-arc-gradient font-black text-white"
        style={{ height: size, width: size, fontSize: size * 0.55 }}
      >
        L
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="logo"
      width={size}
      height={size}
      className="rounded-lg object-contain"
      style={{ height: size, width: size }}
    />
  );
}
