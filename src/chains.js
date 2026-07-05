// EVM networks we watch for tips. Her receiving address is the same on all of
// them, so a donor can pay on whichever they like and it still lands. Native
// USDC (Circle, 6 decimals) contract per chain; nativeEth = chain's gas token
// is ETH (so we watch native transfers as "ETH"). Any RPC can be overridden
// via env (e.g. BASE_RPC=...). Disable chains with EVM_DISABLE=polygon,optimism.
const DEFS = [
  { id: 'ethereum', name: 'Ethereum', chainId: 1,
    rpc: () => process.env.ETH_RPC || 'https://ethereum-rpc.publicnode.com',
    confirmations: () => Number(process.env.ETH_CONFIRMATIONS || 3),
    usdc: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', nativeEth: true },
  { id: 'base', name: 'Base', chainId: 8453,
    rpc: () => process.env.BASE_RPC || 'https://base-rpc.publicnode.com',
    confirmations: () => Number(process.env.BASE_CONFIRMATIONS || 6),
    usdc: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913', nativeEth: true },
  { id: 'arbitrum', name: 'Arbitrum', chainId: 42161,
    rpc: () => process.env.ARBITRUM_RPC || 'https://arbitrum-one-rpc.publicnode.com',
    confirmations: () => Number(process.env.ARBITRUM_CONFIRMATIONS || 6),
    usdc: '0xaf88d065e77c8cc2239327c5edb3a432268e5831', nativeEth: true },
  { id: 'optimism', name: 'Optimism', chainId: 10,
    rpc: () => process.env.OPTIMISM_RPC || 'https://optimism-rpc.publicnode.com',
    confirmations: () => Number(process.env.OPTIMISM_CONFIRMATIONS || 6),
    usdc: '0x0b2c639c533813f4aa9d7837caf62653d097ff85', nativeEth: true },
  { id: 'polygon', name: 'Polygon', chainId: 137,
    rpc: () => process.env.POLYGON_RPC || 'https://polygon-bor-rpc.publicnode.com',
    confirmations: () => Number(process.env.POLYGON_CONFIRMATIONS || 20),
    usdc: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', nativeEth: false }, // native gas is POL, not ETH
];

export function buildChains() {
  const disabled = (process.env.EVM_DISABLE || '').split(',').map((s) => s.trim()).filter(Boolean);
  return DEFS.filter((d) => !disabled.includes(d.id)).map((d) => ({
    id: d.id, name: d.name, chainId: d.chainId,
    rpc: d.rpc(), confirmations: d.confirmations(),
    usdc: d.usdc, nativeEth: d.nativeEth,
  }));
}
