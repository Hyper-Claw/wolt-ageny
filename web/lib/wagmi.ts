import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { arcTestnet, hardhatLocal } from "./chain";

/**
 * Minimal wagmi config using the injected (browser-wallet) connector so no
 * external WalletConnect project id is required. Both chains are registered;
 * NEXT_PUBLIC_CHAIN (via `activeChain` in reads/UI) decides which one the app
 * reads from. The wallet uses whichever of these it's currently connected to.
 */
export const wagmiConfig = createConfig({
  chains: [arcTestnet, hardhatLocal] as const,
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(),
    [hardhatLocal.id]: http(),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
