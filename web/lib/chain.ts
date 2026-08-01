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
  // Only advertise Multicall3 if we KNOW it's deployed (set NEXT_PUBLIC_MULTICALL3).
  // Otherwise viem would route every read through a missing contract and stall.
  ...(process.env.NEXT_PUBLIC_MULTICALL3
    ? { contracts: { multicall3: { address: process.env.NEXT_PUBLIC_MULTICALL3 as `0x${string}` } } }
    : {}),
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
 * Arc mainnet. Chain id + RPC come from env because Arc mainnet params were not
 * public at build time — set NEXT_PUBLIC_ARC_MAINNET_CHAIN_ID and NEXT_PUBLIC_ARC_RPC.
 */
export const arcMainnet = defineChain({
  id: Number(process.env.NEXT_PUBLIC_ARC_MAINNET_CHAIN_ID ?? "5042002"),
  name: "Arc",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.NEXT_PUBLIC_ARC_RPC ?? "https://rpc.testnet.arc.io"] },
  },
  blockExplorers: {
    default: { name: "Arcscan", url: process.env.NEXT_PUBLIC_ARC_EXPLORER ?? "https://arc.exploreme.pro" },
  },
  // Only advertise Multicall3 if we KNOW it's deployed (set NEXT_PUBLIC_MULTICALL3).
  // Otherwise viem would route every read through a missing contract and stall.
  ...(process.env.NEXT_PUBLIC_MULTICALL3
    ? { contracts: { multicall3: { address: process.env.NEXT_PUBLIC_MULTICALL3 as `0x${string}` } } }
    : {}),
});

/**
 * The chain the app talks to, chosen by NEXT_PUBLIC_CHAIN:
 *   "local"   → local Hardhat node
 *   "mainnet" → Arc mainnet (env-configured)
 *   anything else (default) → Arc testnet
 */
export const activeChain =
  process.env.NEXT_PUBLIC_CHAIN === "local"
    ? hardhatLocal
    : process.env.NEXT_PUBLIC_CHAIN === "mainnet"
      ? arcMainnet
      : arcTestnet;
