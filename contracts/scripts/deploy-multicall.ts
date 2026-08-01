import { ethers, network } from "hardhat";

/**
 * Deploy the Multicall3 aggregator, then set its address as NEXT_PUBLIC_MULTICALL3
 * in Vercel so the frontend batches every read into one eth_call.
 *   torsocks npm run deploy-multicall:arc-mainnet
 */
async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`network=${network.name} deployer=${signer.address}`);
  const factory = await ethers.getContractFactory("Multicall3");
  const mc = await factory.deploy();
  await mc.waitForDeployment();
  const addr = await mc.getAddress();
  console.log(`\n✔ Multicall3 deployed at: ${addr}`);
  console.log(`\nSet this in Vercel:  NEXT_PUBLIC_MULTICALL3=${addr}  (then redeploy)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
