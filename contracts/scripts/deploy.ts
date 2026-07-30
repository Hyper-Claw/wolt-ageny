import { ethers, network } from "hardhat";
import { deployV3Core, deployLaunchpad, ECON } from "./v3";

/**
 * Deploys ArcLaunchpad (Uniswap V3, USDC-paired).
 *
 * Env:
 *   USDC_ADDRESS      pair token (Arc mainnet USDC ERC-20 = 0x3600...0000, 6 dec).
 *                     If unset on a local network, a mock USDC is deployed.
 *   PAIRED_DECIMALS   USDC decimals (default 6).
 *   POSITION_MANAGER, SWAP_ROUTER, V3_FACTORY
 *                     an existing Uniswap V3 deployment (e.g. DyorSwap). If any is
 *                     missing, a fresh V3 stack is deployed (we own it).
 *   FEE_RECIPIENT     platform fee wallet (default deployer).
 *
 * Curve economics come from ECON in scripts/v3.ts — tune before a live deploy.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const env = process.env;
  const isLocal = network.name === "localhost" || network.name === "hardhat";
  console.log(`Deploying on "${network.name}" as ${deployer.address}`);

  // USDC / pair token
  let usdc = env.USDC_ADDRESS;
  if (!usdc) {
    if (!isLocal) throw new Error("Set USDC_ADDRESS (Arc USDC = 0x3600000000000000000000000000000000000000)");
    const Mock = await ethers.getContractFactory("MockUSDC");
    const m = await Mock.deploy();
    await m.waitForDeployment();
    usdc = await m.getAddress();
    console.log(`Deployed mock USDC → ${usdc}`);
  }
  const pairedDecimals = Number(env.PAIRED_DECIMALS ?? "6");

  // Uniswap V3
  let npm = env.POSITION_MANAGER, router = env.SWAP_ROUTER, factory = env.V3_FACTORY;
  if (!(npm && router && factory)) {
    console.log("No V3 env addresses — deploying our own Uniswap V3 stack…");
    const core = await deployV3Core(deployer);
    npm = await core.npm.getAddress();
    router = await core.router.getAddress();
    factory = await core.factory.getAddress();
    console.log(`  factory ${factory}\n  positionManager ${npm}\n  router ${router}`);
  } else {
    console.log("Using existing Uniswap V3:", { factory, npm, router });
  }

  const feeRecipient = env.FEE_RECIPIENT ?? deployer.address;
  const lp = await deployLaunchpad({ npm: npm!, router: router!, factory: factory!, usdc, pairedDecimals }, feeRecipient);
  const lpAddr = await lp.getAddress();

  console.log(`\n────────────────────────────────────────────────`);
  console.log(`ArcLaunchpad: ${lpAddr}`);
  console.log(`Locker:       ${await lp.locker()}`);
  console.log(`USDC (pair):  ${usdc}  (${pairedDecimals} dec)`);
  console.log(`Economics: fee=${ECON.poolFee} ticks=[${ECON.tickLower},${ECON.tickUpper}] gradTarget=$${Number(ECON.graduationThreshold) / 1e6}`);
  console.log(`\nNext: LAUNCHPAD=${lpAddr} npm run launch-trade -- (see scripts/launch-and-trade.ts)`);
  console.log(`Set NEXT_PUBLIC_LAUNCHPAD_ADDRESS=${lpAddr} in web/.env.local`);
  console.log(`────────────────────────────────────────────────`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
