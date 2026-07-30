import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { deployV3, deployLaunchpad, v3Addrs } from "./v3";

/**
 * Local-only: deploy a full Uniswap V3 stack + ArcLaunchpad, seed demo coins with
 * trades (and graduate one), and auto-write web/.env.local. Run against a node:
 *   npm run seed:local
 */
async function main() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error(`seed.ts is local-only (got "${network.name}")`);
  }
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const v3 = await deployV3(deployer);
  const lp = await deployLaunchpad(await v3Addrs(v3), deployer.address, {
    graduationThreshold: ethers.parseEther("3"),
  });
  const address = await lp.getAddress();
  const deadline = () => Math.floor(Date.now() / 1000) + 600;

  const socials = (t: string, w: string) => ({ twitter: t, telegram: "", discord: "", website: w, farcaster: "" });
  const coins = [
    { s: alice, name: "Arc Doge", symbol: "ADOGE", desc: "The first dog on Arc.", buys: ["0.3", "0.2"] },
    { s: bob, name: "Circle Cat", symbol: "MEOW", desc: "Nine lives, sub-second finality.", buys: ["0.8", "1.2"] },
    { s: carol, name: "USDC Pepe", symbol: "UPEPE", desc: "Rare. Stable. Frog.", buys: ["0.1"] },
    { s: alice, name: "Malachite", symbol: "MALA", desc: "Consensus, but make it a coin.", buys: [] },
    { s: bob, name: "Gas Money", symbol: "GAS", desc: "Pays for itself.", buys: ["2"] },
  ];

  const launched: string[] = [];
  const traders = [alice, bob, carol];
  for (const c of coins) {
    const tx = await lp
      .connect(c.s)
      .launch({ name: c.name, symbol: c.symbol, logo: "", description: c.desc, socials: socials("https://x.com/arc", "https://arc.io") });
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
    launched.push(token);
    for (let i = 0; i < c.buys.length; i++) {
      await lp.connect(traders[i % traders.length]).buy(token, 0n, deadline(), { value: ethers.parseEther(c.buys[i]) });
    }
    console.log(`launched ${c.symbol.padEnd(6)} → ${token}  (${c.buys.length} buys)`);
  }

  // Graduate the first coin so the Graduated section is populated.
  await lp.connect(bob).buy(launched[0], 0n, deadline(), { value: ethers.parseEther("4") });
  console.log(`graduated ${coins[0].symbol} (${launched[0]})`);

  const envLine = `NEXT_PUBLIC_CHAIN=local\nNEXT_PUBLIC_LAUNCHPAD_ADDRESS=${address}\n`;
  const webEnvPath = path.resolve(process.cwd(), "..", "web", ".env.local");
  let wrote = false;
  try {
    if (fs.existsSync(path.dirname(webEnvPath))) {
      fs.writeFileSync(webEnvPath, envLine);
      wrote = true;
    }
  } catch {
    /* ignore */
  }

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(`ArcLaunchpad deployed at: ${address}`);
  if (wrote) {
    console.log(`\n✔ Wrote web/.env.local. Now run the web app:  cd ../web && npm run dev`);
  } else {
    console.log(`\nSet in web/.env.local:\n  NEXT_PUBLIC_CHAIN=local\n  NEXT_PUBLIC_LAUNCHPAD_ADDRESS=${address}`);
  }
  console.log("────────────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
