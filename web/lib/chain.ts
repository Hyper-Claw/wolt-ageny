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
      name: "Arcscan",
      url: process.env.NEXT_PUBLIC_ARC_EXPLORER ?? "https://testnet.arcscan.app",
    },
  },
  testnet: true,
});

/**
 * Local Hardhat node (chain id 31337). Native symbol is labelled USDC to match
 * the app even though it's just the local test gas token.
 */
export const hardhatLocal = defineChain({
  id: 31337,
  name: "Localhost (Hardhat)",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8545"] },
  },
  testnet: true,
});

/**
 * The chain the app talks to. Set NEXT_PUBLIC_CHAIN=local in web/.env.local to
 * target a local Hardhat node; anything else (default) targets Arc testnet.
 */
export const activeChain = process.env.NEXT_PUBLIC_CHAIN === "local" ? hardhatLocal : arcTestnet;
