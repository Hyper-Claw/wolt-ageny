import { ethers } from "hardhat";

/**
 * End-to-end walkthrough of the launchpad on a local Hardhat network.
 * No private key or real funds required — Hardhat provides funded test accounts.
 *
 * Run:  npx hardhat run scripts/demo.ts
 */
const E = (n: bigint) => ethers.formatEther(n);

async function main() {
  const [deployer, creator, alice, bob] = await ethers.getSigners();

  const totalSupply = ethers.parseEther("1000000000");
  const curveSupply = ethers.parseEther("800000000");
  const virtualNative = ethers.parseEther("30");
  const virtualToken = ethers.parseEther("1073000000");

  const Launchpad = await ethers.getContractFactory("ArcLaunchpad");
  const lp = await Launchpad.deploy(
    totalSupply,
    curveSupply,
    virtualNative,
    virtualToken,
    100n, // 1% trade fee
    5000n, // creator gets 50% of the fee
    0n, // free to launch
    deployer.address
  );
  await lp.waitForDeployment();
  console.log(`\nArcLaunchpad deployed → ${await lp.getAddress()}\n`);

  // --- 1. Launch a coin -------------------------------------------------
  const tx = await lp
    .connect(creator)
    .launch("Arc Doge", "ADOGE", "ipfs://logo", "the first dog on Arc", "", "", "", 0n);
  const rc = await tx.wait();
  let token = "";
  for (const log of rc!.logs) {
    try {
      const p = lp.interface.parseLog(log);
      if (p?.name === "TokenLaunched") token = p.args.token;
    } catch {
      /* skip */
    }
  }
  console.log(`1. Creator launched $ADOGE → ${token}`);
  await snapshot(lp, token);

  const deadline = () => Math.floor(Date.now() / 1000) + 600;

  // --- 2. Two buyers come in -------------------------------------------
  console.log(`\n2. Alice buys 5 USDC, then Bob buys 15 USDC`);
  await lp.connect(alice).buy(token, 0n, deadline(), { value: ethers.parseEther("5") });
  await lp.connect(bob).buy(token, 0n, deadline(), { value: ethers.parseEther("15") });
  await snapshot(lp, token);

  // --- 3. Alice takes some profit --------------------------------------
  const erc20 = await ethers.getContractAt("LaunchToken", token);
  const aliceBal = await erc20.balanceOf(alice.address);
  await erc20.connect(alice).approve(await lp.getAddress(), aliceBal);
  console.log(`\n3. Alice sells half her bag (${E(aliceBal / 2n)} ADOGE)`);
  await lp.connect(alice).sell(token, aliceBal / 2n, 0n, deadline());
  await snapshot(lp, token);

  // --- 4. A whale graduates the coin -----------------------------------
  console.log(`\n4. A whale buys big and graduates the curve`);
  const before = await ethers.provider.getBalance(bob.address);
  await lp.connect(bob).buy(token, 0n, deadline(), { value: ethers.parseEther("500") });
  const after = await ethers.provider.getBalance(bob.address);
  console.log(`   whale actually spent ≈ ${E(before - after)} USDC (excess auto-refunded)`);
  await snapshot(lp, token);

  const locked = await lp.lockedNative(token);
  console.log(`\n   Liquidity locked for DEX migration: ${E(locked)} USDC + ${E(await lp.lpSupply())} ADOGE`);
  console.log(`\nDone ✔  The full launch → trade → graduate lifecycle works.\n`);
}

async function snapshot(lp: any, token: string) {
  const price = await lp.spotPrice(token);
  const mcap = await lp.marketCap(token);
  const progress = await lp.progressBps(token);
  const curve = await lp.curves(token);
  console.log(
    `   price=${Number(ethers.formatEther(price)).toPrecision(3)} USDC  ` +
      `mcap=${Number(ethers.formatEther(mcap)).toFixed(0)} USDC  ` +
      `raised=${Number(ethers.formatEther(curve.realNativeReserve)).toFixed(2)} USDC  ` +
      `progress=${(Number(progress) / 100).toFixed(2)}%  ` +
      `graduated=${curve.graduated}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
