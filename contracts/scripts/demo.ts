import { ethers } from "hardhat";
import { deployV3, deployLaunchpad, v3Addrs, fundUsdc, launchParams } from "./v3";

/**
 * End-to-end walkthrough on a local in-process chain (real Uniswap V3, USDC-paired).
 * Run:  npm run demo
 */
const U = (n: bigint) => Number(ethers.formatUnits(n, 6));
const P = (n: bigint) => Number(ethers.formatUnits(n, 18));

async function main() {
  const [deployer, alice, bob] = await ethers.getSigners();
  const v3 = await deployV3(deployer);
  const lp = await deployLaunchpad(await v3Addrs(v3), deployer.address, {
    graduationThreshold: 500n * 1_000_000n, // $500 for a quick demo
  });
  console.log(`\nArcLaunchpad (V3, USDC) → ${await lp.getAddress()}\n`);

  const tx = await lp.connect(alice).launch(launchParams());
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
  console.log(`1. Launched $ADOGE → ${token}  (pool ${await lp.poolOf(token)})`);
  await snapshot(lp, token);

  const dl = () => Math.floor(Date.now() / 1000) + 600;
  await fundUsdc(v3.usdc, alice, "100000", await lp.getAddress());
  await fundUsdc(v3.usdc, bob, "100000", await lp.getAddress());

  console.log(`\n2. Alice buys $50, Bob buys $150 of USDC`);
  await lp.connect(alice).buy(token, ethers.parseUnits("50", 6), 0n, dl());
  await lp.connect(bob).buy(token, ethers.parseUnits("150", 6), 0n, dl());
  await snapshot(lp, token);

  const erc20 = await ethers.getContractAt("LaunchToken", token);
  const bal = await erc20.balanceOf(alice.address);
  await erc20.connect(alice).approve(await lp.getAddress(), bal);
  console.log(`\n3. Alice sells half her bag`);
  await lp.connect(alice).sell(token, bal / 2n, 0n, dl());
  await snapshot(lp, token);

  console.log(`\n4. A whale buys $500 and graduates the token`);
  await lp.connect(bob).buy(token, ethers.parseUnits("500", 6), 0n, dl());
  await snapshot(lp, token);

  console.log(`\nDone ✔  launch → USDC trade → graduate on real Uniswap V3.\n`);
}

async function snapshot(lp: any, token: string) {
  const price = await lp.spotPrice(token);
  const mcap = await lp.marketCap(token);
  const st = await lp.graduationStatus(token);
  const progress = await lp.progressBps(token);
  console.log(
    `   price=$${P(price).toPrecision(3)}  mcap=$${P(mcap).toFixed(0)}  ` +
      `raised=$${U(st.principal).toFixed(2)}/$${U(st.threshold)}  ` +
      `progress=${(Number(progress) / 100).toFixed(1)}%  graduated=${st.graduated}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
