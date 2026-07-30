import { ethers, network } from "hardhat";

/**
 * Live smoke test against a deployed launchpad: launch a token, buy it, sell it.
 * Answers "can we launch a token and trade it" on the target network.
 *
 * Env:
 *   LAUNCHPAD   deployed ArcLaunchpad address (required)
 *   BUY_USDC    USDC to spend on the test buy (default "1")
 *   NAME, SYMBOL, LOGO, DESCRIPTION  optional token metadata
 *
 * Run:  LAUNCHPAD=0x... npm run launch-trade -- --network arcMainnet
 */
const ERC20_ABI = [
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
];

async function main() {
  const lpAddr = process.env.LAUNCHPAD;
  if (!lpAddr) throw new Error("Set LAUNCHPAD to the deployed launchpad address");
  const [signer] = await ethers.getSigners();
  const lp = await ethers.getContractAt("ArcLaunchpad", lpAddr);
  const usdcAddr: string = await lp.usdc();
  const pairedDecimals = Number(await lp.pairedDecimals());
  const usdc = new ethers.Contract(usdcAddr, ERC20_ABI, signer);
  const dl = () => Math.floor(Date.now() / 1000) + 900;

  const bal0 = await usdc.balanceOf(signer.address);
  console.log(`network=${network.name} signer=${signer.address}`);
  console.log(`USDC balance: ${ethers.formatUnits(bal0, pairedDecimals)}\n`);

  // --- 1. Launch ---
  console.log("1) launching token…");
  const params = {
    name: process.env.NAME ?? "Arc Test Coin",
    symbol: process.env.SYMBOL ?? "ARCTEST",
    logo: process.env.LOGO ?? "",
    description: process.env.DESCRIPTION ?? "live launch + trade smoke test",
    socials: { twitter: "", telegram: "", discord: "", website: "", farcaster: "" },
  };
  const ltx = await lp.launch(params);
  const lrc = await ltx.wait();
  let token = "";
  for (const log of lrc!.logs) {
    try {
      const p = lp.interface.parseLog(log);
      if (p?.name === "TokenLaunched") token = p.args.token;
    } catch {
      /* skip */
    }
  }
  const pool = await lp.poolOf(token);
  console.log(`   token=${token}\n   pool=${pool}`);
  console.log(`   tx=${ltx.hash}`);
  console.log(`   price=$${Number(ethers.formatUnits(await lp.spotPrice(token), 18)).toPrecision(3)} mcap=$${Number(ethers.formatUnits(await lp.marketCap(token), 18)).toFixed(0)}\n`);

  // --- 2. Buy ---
  const buyAmt = ethers.parseUnits(process.env.BUY_USDC ?? "1", pairedDecimals);
  if (bal0 < buyAmt) throw new Error(`Need ${ethers.formatUnits(buyAmt, pairedDecimals)} USDC to buy, have ${ethers.formatUnits(bal0, pairedDecimals)}`);
  console.log(`2) buying with ${ethers.formatUnits(buyAmt, pairedDecimals)} USDC…`);
  await (await usdc.approve(lpAddr, buyAmt)).wait();
  const btx = await lp.buy(token, buyAmt, 0n, dl());
  await btx.wait();
  const tk = await ethers.getContractAt("LaunchToken", token);
  const bought = await tk.balanceOf(signer.address);
  console.log(`   received ${ethers.formatUnits(bought, 18)} ${params.symbol}`);
  console.log(`   tx=${btx.hash}`);
  console.log(`   price=$${Number(ethers.formatUnits(await lp.spotPrice(token), 18)).toPrecision(3)}\n`);

  // --- 3. Sell ---
  console.log(`3) selling it back…`);
  await (await tk.approve(lpAddr, bought)).wait();
  const stx = await lp.sell(token, bought, 0n, dl());
  await stx.wait();
  const bal1 = await usdc.balanceOf(signer.address);
  console.log(`   tx=${stx.hash}`);
  console.log(`   USDC now: ${ethers.formatUnits(bal1, pairedDecimals)} (net cost incl. 2x pool fee)\n`);

  console.log("✔ launch + buy + sell all succeeded on-chain.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
