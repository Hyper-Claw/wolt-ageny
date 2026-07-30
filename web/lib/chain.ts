import { defineChain } from "viem";

/**
 * Arc public testnet. Circle's EVM-compatible L1 uses USDC as the native gas
 * token. See https://docs.arc.io/arc-chain.
 *
 * RPC and explorer URLs are overridable via env in case they change.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: {
    name: "USD Coin",
    symbol: "USDC",
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.io"],
    },
  },
  blockExplorers: {
    default: {
      name: "Arc Explorer",
      url: process.env.NEXT_PUBLIC_ARC_EXPLORER ?? "https://explorer.testnet.arc.io",
    },
  },
  testnet: true,
});
