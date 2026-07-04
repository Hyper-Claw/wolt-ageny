import crypto from 'node:crypto';

function required(name) {
  const v = process.env[name];
  if (!v) {
    console.warn(`[config] WARNING: ${name} is not set — that chain is disabled.`);
    return null;
  }
  return v;
}

export const config = {
  port: Number(process.env.PORT || 3000),

  // Receiving addresses (public keys only — this server never touches private keys)
  ethAddress: required('ETH_ADDRESS')?.toLowerCase() ?? null,
  solAddress: required('SOL_ADDRESS') ?? null,

  // Public RPC endpoints; swap for an Alchemy/Helius free-tier URL for more headroom
  ethRpc: process.env.ETH_RPC || 'https://ethereum-rpc.publicnode.com',
  solRpc: process.env.SOL_RPC || 'https://api.mainnet-beta.solana.com',

  // Blocks behind head before an ETH payment is announced (reorg safety)
  ethConfirmations: Number(process.env.ETH_CONFIRMATIONS || 2),

  // Secret in the overlay URL so only her OBS receives alert events
  overlayKey: process.env.OVERLAY_KEY || crypto.randomBytes(12).toString('hex'),
  // Secret for firing test alerts
  adminKey: process.env.ADMIN_KEY || crypto.randomBytes(12).toString('hex'),

  // Pending donations expire after this many minutes if unpaid
  pendingTtlMin: Number(process.env.PENDING_TTL_MIN || 30),

  // Minimum donation sizes (in whole coins) to bother alerting on
  minEth: Number(process.env.MIN_ETH || 0.0005),
  minSol: Number(process.env.MIN_SOL || 0.005),

  streamerName: process.env.STREAMER_NAME || 'the streamer',
};

if (!process.env.OVERLAY_KEY) {
  console.warn(`[config] OVERLAY_KEY not set — generated one for this run: ${config.overlayKey}`);
}
if (!process.env.ADMIN_KEY) {
  console.warn(`[config] ADMIN_KEY not set — generated one for this run: ${config.adminKey}`);
}
