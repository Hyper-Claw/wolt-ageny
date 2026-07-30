import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { activeChain } from "./chain";

/**
 * Minimal wagmi config using the injected (browser-wallet) connector so no
 * external WalletConnect project id is required. The active chain (Arc testnet
 * or a local Hardhat node) is selected via NEXT_PUBLIC_CHAIN.
 */
export const wagmiConfig = createConfig({
  chains: [activeChain],
  connectors: [injected()],
  transports: {
    [activeChain.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
