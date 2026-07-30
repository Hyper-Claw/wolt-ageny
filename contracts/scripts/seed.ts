import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import { deployV3, deployLaunchpad, v3Addrs, fundUsdc } from "./v3";

/**
 * Local-only: deploy a full Uniswap V3 stack + mock USDC + ArcLaunchpad, seed
 * demo coins with USDC trades (and graduate one), and auto-write web/.env.local.
 *   npm run seed:local
 */
async function main() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error(`seed.ts is local-only (got "${network.name}")`);
  }
  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const v3 = await deployV3(deployer);
  const lp = await deployLaunchpad(await v3Addrs(v3), deployer.address, {
    graduationThreshold: 500n * 1_000_000n, // $500 so a demo coin can graduate
  });
  const address = await lp.getAddress();
  const deadline = () => Math.floor(Date.now() / 1000) + 600;

  // Fund traders with mock USDC.
  const traders = [alice, bob, carol];
  for (const t of traders) await fundUsdc(v3.usdc, t, "100000", address);

  const socials = (t: string, w: string) => ({ twitter: t, telegram: "", discord: "", website: w, farcaster: "" });
  const coins = [
    { s: alice, name: "Arc Doge", symbol: "ADOGE", desc: "The first dog on Arc.", buys: ["30", "20"] },
    { s: bob, name: "Circle Cat", symbol: "MEOW", desc: "Nine lives, sub-second finality.", buys: ["80", "120"] },
    { s: carol, name: "USDC Pepe", symbol: "UPEPE", desc: "Rare. Stable. Frog.", buys: ["10"] },
    { s: alice, name: "Malachite", symbol: "MALA", desc: "Consensus, but make it a coin.", buys: [] },
    { s: bob, name: "Gas Money", symbol: "GAS", desc: "Pays for itself.", buys: ["200"] },
  ];

  const launched: string[] = [];
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
      await lp.connect(traders[i % traders.length]).buy(token, ethers.parseUnits(c.buys[i], 6), 0n, deadline());
    }
    console.log(`launched ${c.symbol.padEnd(6)} → ${token}  (${c.buys.length} buys)`);
  }

  // Graduate the first coin so the Graduated section is populated.
  await lp.connect(bob).buy(launched[0], ethers.parseUnits("600", 6), 0n, deadline());
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
