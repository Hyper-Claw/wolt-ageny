import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

/**
 * Deploys ArcLaunchpad to a local Hardhat node and seeds it with demo coins and
 * some trades, so the web app's Explore page is populated for local testing.
 *
 * Run against a running `npm run node`:
 *   npm run seed:local
 *
 * On a fresh node this is the FIRST deployment, so the launchpad address is
 * deterministic: 0x5FbDB2315678afecb367f032d93F642f64180aa3
 */
async function main() {
  if (network.name !== "localhost" && network.name !== "hardhat") {
    throw new Error(`seed.ts is for local testing only (got network "${network.name}")`);
  }

  const [deployer, alice, bob, carol] = await ethers.getSigners();

  const Launchpad = await ethers.getContractFactory("ArcLaunchpad");
  const lp = await Launchpad.deploy(
    ethers.parseEther("1000000000"),
    ethers.parseEther("800000000"),
    ethers.parseEther("30"),
    ethers.parseEther("1073000000"),
    100n,
    5000n,
    0n,
    deployer.address
  );
  await lp.waitForDeployment();
  const address = await lp.getAddress();

  const deadline = () => Math.floor(Date.now() / 1000) + 600;
  const coins = [
    { s: alice, name: "Arc Doge", sym: "ADOGE", uri: "", desc: "The first dog on Arc.", buys: ["3", "2"] },
    { s: bob, name: "Circle Cat", sym: "MEOW", uri: "", desc: "Nine lives, sub-second finality.", buys: ["8", "12"] },
    { s: carol, name: "USDC Pepe", sym: "UPEPE", uri: "", desc: "Rare. Stable. Frog.", buys: ["1"] },
    { s: alice, name: "Malachite", sym: "MALA", uri: "", desc: "Consensus, but make it a coin.", buys: [] },
    { s: bob, name: "Gas Money", sym: "GAS", uri: "", desc: "Pays for itself.", buys: ["20"] },
  ];

  const launched: string[] = [];
  for (const c of coins) {
    const tx = await lp
      .connect(c.s)
      .launch(c.name, c.sym, c.uri, c.desc, "https://x.com/arc", "", "https://arc.io", 0n);
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
    const traders = [alice, bob, carol];
    for (let i = 0; i < c.buys.length; i++) {
      await lp.connect(traders[i % traders.length]).buy(token, 0n, deadline(), {
        value: ethers.parseEther(c.buys[i]),
      });
    }
    console.log(`launched ${c.sym.padEnd(6)} → ${token}  (${c.buys.length} buys)`);
  }

  // Graduate the first coin so the Graduated section is populated in demos.
  await lp.connect(bob).buy(launched[0], 0n, deadline(), { value: ethers.parseEther("500") });
  console.log(`graduated ${coins[0].sym} (${launched[0]})`);

  // Convenience: write web/.env.local automatically so there's nothing to copy.
  const envLine = `NEXT_PUBLIC_CHAIN=local\nNEXT_PUBLIC_LAUNCHPAD_ADDRESS=${address}\n`;
  const webEnvPath = path.resolve(process.cwd(), "..", "web", ".env.local");
  let wrote = false;
  try {
    if (fs.existsSync(path.dirname(webEnvPath))) {
      fs.writeFileSync(webEnvPath, envLine);
      wrote = true;
    }
  } catch {
    /* fall back to printing below */
  }

  console.log("\n────────────────────────────────────────────────────────────");
  console.log(`ArcLaunchpad deployed at: ${address}`);
  if (wrote) {
    console.log(`\n✔ Wrote web/.env.local for you. Now just run the web app:`);
    console.log(`    cd ../web && npm run dev`);
  } else {
    console.log(`\nPut these in web/.env.local, then run \`npm run dev\` in web/:`);
    console.log(`  NEXT_PUBLIC_CHAIN=local`);
    console.log(`  NEXT_PUBLIC_LAUNCHPAD_ADDRESS=${address}`);
  }
  console.log("────────────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
