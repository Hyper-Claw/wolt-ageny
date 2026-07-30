import { ethers } from "hardhat";
import { deployV3, deployLaunchpad, v3Addrs, launchParams } from "./v3";

/**
 * End-to-end walkthrough on a local in-process chain (real Uniswap V3).
 * Run:  npm run demo
 */
const F = (n: bigint) => Number(ethers.formatEther(n));

async function main() {
  const [deployer, alice, bob] = await ethers.getSigners();
  const v3 = await deployV3(deployer);
  const lp = await deployLaunchpad(await v3Addrs(v3), deployer.address, {
    graduationThreshold: ethers.parseEther("3"),
  });
  console.log(`\nArcLaunchpad (V3) → ${await lp.getAddress()}\n`);

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

  console.log(`\n2. Alice buys 0.5, Bob buys 1.0 (native) through the V3 router`);
  await lp.connect(alice).buy(token, 0n, dl(), { value: ethers.parseEther("0.5") });
  await lp.connect(bob).buy(token, 0n, dl(), { value: ethers.parseEther("1") });
  await snapshot(lp, token);

  const erc20 = await ethers.getContractAt("LaunchToken", token);
  const bal = await erc20.balanceOf(alice.address);
  await erc20.connect(alice).approve(await lp.getAddress(), bal);
  console.log(`\n3. Alice sells half her bag`);
  await lp.connect(alice).sell(token, bal / 2n, 0n, dl());
  await snapshot(lp, token);

  console.log(`\n4. A whale buys 4.0 and graduates the token`);
  await lp.connect(bob).buy(token, 0n, dl(), { value: ethers.parseEther("4") });
  await snapshot(lp, token);

  console.log(`\nDone ✔  launch → trade → graduate on real Uniswap V3.\n`);
}

async function snapshot(lp: any, token: string) {
  const price = await lp.spotPrice(token);
  const mcap = await lp.marketCap(token);
  const st = await lp.graduationStatus(token);
  const progress = await lp.progressBps(token);
  console.log(
    `   price=${F(price).toPrecision(3)}  mcap=${F(mcap).toFixed(2)}  ` +
      `principal=${F(st.principal).toFixed(3)}/${F(st.threshold)}  ` +
      `progress=${(Number(progress) / 100).toFixed(1)}%  graduated=${st.graduated}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
