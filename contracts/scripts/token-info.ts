import { ethers } from "hardhat";

/**
 * Read a token's live state directly from the launchpad + its V3 pool.
 *   LAUNCHPAD=0x.. TOKEN=0x.. npm run token-info:arc-mainnet
 */
async function main() {
  const lpAddr = process.env.LAUNCHPAD;
  const token = process.env.TOKEN;
  if (!lpAddr || !token) throw new Error("Set LAUNCHPAD and TOKEN");

  const lp = await ethers.getContractAt("ArcLaunchpad", lpAddr);
  const pool = await lp.poolOf(token);
  const usdcAddr: string = await lp.usdc();

  const price = await lp.spotPrice(token);
  const mc = await lp.marketCap(token);
  const st = await lp.graduationStatus(token);

  const poolC = new ethers.Contract(
    pool,
    [
      "function liquidity() view returns (uint128)",
      "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
    ],
    ethers.provider
  );
  const erc20 = ["function balanceOf(address) view returns (uint256)"];
  const usdcC = new ethers.Contract(usdcAddr, erc20, ethers.provider);
  const tokenC = new ethers.Contract(token, erc20, ethers.provider);

  const [liq, s0, poolUsdc, poolToken] = await Promise.all([
    poolC.liquidity(),
    poolC.slot0(),
    usdcC.balanceOf(pool),
    tokenC.balanceOf(pool),
  ]);

  console.log(`token   ${token}`);
  console.log(`pool    ${pool}`);
  console.log(`price   $${Number(ethers.formatUnits(price, 18)).toPrecision(4)} / token`);
  console.log(`mcap    $${Number(ethers.formatUnits(mc, 18)).toFixed(2)}`);
  console.log(`raised  $${Number(ethers.formatUnits(st.principal, 6)).toFixed(4)} (threshold $${Number(ethers.formatUnits(st.threshold, 6))}, graduated=${st.graduated})`);
  console.log(`--- pool internals ---`);
  console.log(`active liquidity   ${liq}`);
  console.log(`current tick       ${s0.tick}`);
  console.log(`pool USDC balance  ${ethers.formatUnits(poolUsdc, 6)}`);
  console.log(`pool token balance ${ethers.formatUnits(poolToken, 18)}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
