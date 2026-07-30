import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import type { Chain } from "viem";
import { arcTestnet, arcMainnet, hardhatLocal } from "./chain";

/**
 * Minimal wagmi config using the injected (browser-wallet) connector so no
 * external WalletConnect project id is required. All known chains are registered
 * (deduped by id, since Arc mainnet's id defaults to testnet's until configured);
 * NEXT_PUBLIC_CHAIN (via `activeChain`) decides which the app reads from.
 */
const dedup = new Map<number, Chain>();
for (const c of [arcTestnet, arcMainnet, hardhatLocal] as Chain[]) dedup.set(c.id, c);
const chains = Array.from(dedup.values()) as [Chain, ...Chain[]];
const transports = Object.fromEntries(chains.map((c) => [c.id, http()]));

export const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
  transports,
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
