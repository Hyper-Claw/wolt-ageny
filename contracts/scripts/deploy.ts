import { ethers, network } from "hardhat";

/**
 * Deploys ArcLaunchpad with default pump.fun-style curve parameters.
 *
 * Native amounts are denominated in the chain's native gas token (USDC on Arc),
 * assuming 18-decimal native units. Tune `virtualNative` / `virtualToken` /
 * `curveSupply` if the target network uses different native decimals.
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying on network "${network.name}" with ${deployer.address}`);

  const totalSupply = ethers.parseEther("1000000000"); // 1B
  const curveSupply = ethers.parseEther("800000000"); // 800M sold on curve
  const virtualNative = ethers.parseEther("30"); // seeds start price
  const virtualToken = ethers.parseEther("1073000000"); // virtual token reserve
  const tradeFeeBps = 100n; // 1% trade fee
  const creatorFeeShareBps = 5000n; // creator gets 50% of the fee
  const creationFee = 0n; // free launches
  const feeRecipient = process.env.FEE_RECIPIENT ?? deployer.address;

  const Launchpad = await ethers.getContractFactory("ArcLaunchpad");
  const launchpad = await Launchpad.deploy(
    totalSupply,
    curveSupply,
    virtualNative,
    virtualToken,
    tradeFeeBps,
    creatorFeeShareBps,
    creationFee,
    feeRecipient
  );
  await launchpad.waitForDeployment();

  const address = await launchpad.getAddress();
  console.log(`ArcLaunchpad deployed at: ${address}`);
  console.log("Set NEXT_PUBLIC_LAUNCHPAD_ADDRESS in web/.env.local to this address.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
