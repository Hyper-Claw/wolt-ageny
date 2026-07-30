import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "arc.fun — Token Launchpad on Arc",
  description:
    "Create and trade tokens on a bonding curve on the Arc chain. A pump.fun / Pons-style launchpad.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 py-10 text-center text-xs text-arc-muted">
            Built on the Arc chain · Tokens trade against native USDC gas · This is experimental
            software — trade at your own risk.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
