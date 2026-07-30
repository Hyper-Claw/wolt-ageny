import { ethers, network } from "hardhat";
import { deployV3, deployLaunchpad, v3Addrs, ECON } from "./v3";

/**
 * Deploys ArcLaunchpad (Uniswap V3 based).
 *
 * Uses an existing Uniswap V3 deployment if all of POSITION_MANAGER, SWAP_ROUTER,
 * V3_FACTORY and WNATIVE are set in the environment (the case for a live network
 * like Arc mainnet). Otherwise it deploys a fresh local V3 stack (dev / testing).
 *
 * Curve economics come from ECON in scripts/v3.ts — tune there before a live deploy.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying on "${network.name}" with ${deployer.address}`);

  const env = process.env;
  let addrs: { npm: string; router: string; factory: string; wnative: string };

  if (env.POSITION_MANAGER && env.SWAP_ROUTER && env.V3_FACTORY && env.WNATIVE) {
    addrs = {
      npm: env.POSITION_MANAGER,
      router: env.SWAP_ROUTER,
      factory: env.V3_FACTORY,
      wnative: env.WNATIVE,
    };
    console.log("Using configured Uniswap V3 deployment:", addrs);
  } else {
    console.log("No V3 env addresses set — deploying a local Uniswap V3 stack.");
    const v3 = await deployV3(deployer);
    addrs = await v3Addrs(v3);
    console.log("Deployed local V3:", addrs);
  }

  const feeRecipient = env.FEE_RECIPIENT ?? deployer.address;
  const lp = await deployLaunchpad(addrs, feeRecipient);
  const lpAddr = await lp.getAddress();
  const lockerAddr = await lp.locker();

  console.log(`\nArcLaunchpad: ${lpAddr}`);
  console.log(`Locker:       ${lockerAddr}`);
  console.log(`WNative:      ${addrs.wnative}`);
  console.log("\nSet NEXT_PUBLIC_LAUNCHPAD_ADDRESS in web/.env.local to the launchpad address.");
  console.log(`Economics: fee=${ECON.poolFee} ticks=[${ECON.tickLower},${ECON.tickUpper}] gradThreshold=${ethers.formatEther(ECON.graduationThreshold)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
