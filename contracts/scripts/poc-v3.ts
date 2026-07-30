import { ethers } from "hardhat";

// Proof-of-concept: stand up real Uniswap V3 locally, launch a token into a
// single-sided liquidity position (the bonding curve), and swap against it.
import FactoryArt from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import NpmArt from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";
import RouterArt from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";

const FEE = 10000; // 1%
const SPACING = 200;

function sqrtPriceX96AtTick(tick: number): bigint {
  const ratio = Math.pow(1.0001, tick / 2);
  // 2^96 = 79228162514264337593543950336
  const q96 = 79228162514264337593543950336;
  return BigInt(Math.floor(ratio * q96));
}

async function main() {
  const [deployer, buyer] = await ethers.getSigners();

  // --- Deploy WNative + Uniswap V3 (from precompiled artifacts) ---
  const WNative = await ethers.getContractFactory("WNative");
  const wnative = await WNative.deploy();
  await wnative.waitForDeployment();

  const Factory = new ethers.ContractFactory(FactoryArt.abi, FactoryArt.bytecode, deployer);
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const Npm = new ethers.ContractFactory(NpmArt.abi, NpmArt.bytecode, deployer);
  // constructor(factory, WETH9, tokenDescriptor) — descriptor only used by tokenURI().
  const npm = await Npm.deploy(await factory.getAddress(), await wnative.getAddress(), await wnative.getAddress());
  await npm.waitForDeployment();

  const Router = new ethers.ContractFactory(RouterArt.abi, RouterArt.bytecode, deployer);
  const router = await Router.deploy(await factory.getAddress(), await wnative.getAddress());
  await router.waitForDeployment();

  console.log(`WNative ${await wnative.getAddress()}`);
  console.log(`V3 Factory ${await factory.getAddress()}`);
  console.log(`PositionManager ${await npm.getAddress()}`);
  console.log(`SwapRouter ${await router.getAddress()}\n`);

  // --- Deploy a token (self-describing LaunchToken; deployer holds supply) ---
  const supply = ethers.parseEther("1000000000");
  const curveAmt = ethers.parseEther("800000000");
  const Token = await ethers.getContractFactory("LaunchToken");
  const token = await Token.deploy("Arc Doge", "ADOGE", supply, deployer.address, deployer.address);
  await token.waitForDeployment();
  const tokenAddr = await token.getAddress();
  const wAddr = await wnative.getAddress();

  const tokenIsToken0 = tokenAddr.toLowerCase() < wAddr.toLowerCase();
  const token0 = tokenIsToken0 ? tokenAddr : wAddr;
  const token1 = tokenIsToken0 ? wAddr : tokenAddr;
  console.log(`token ${tokenAddr}  tokenIsToken0=${tokenIsToken0}`);

  // Single-sided range: all token when current price is outside the range on the
  // token-heavy side. token0 => current < tickLower ; token1 => current > tickUpper.
  let tickLower: number, tickUpper: number, initTick: number;
  if (tokenIsToken0) {
    tickLower = -120000;
    tickUpper = -60000;
    initTick = tickLower - SPACING; // just below range => 100% token0
  } else {
    tickLower = 60000;
    tickUpper = 120000;
    initTick = tickUpper + SPACING; // just above range => 100% token1
  }

  const sqrtP = sqrtPriceX96AtTick(initTick);
  await (npm as any).createAndInitializePoolIfNecessary(token0, token1, FEE, sqrtP);
  const poolAddr = await (factory as any).getPool(token0, token1, FEE);
  console.log(`pool ${poolAddr}  ticks [${tickLower}, ${tickUpper}] init ${initTick}`);

  // Approve NPM and mint the single-sided position.
  await token.approve(await npm.getAddress(), curveAmt);
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const mintParams = {
    token0,
    token1,
    fee: FEE,
    tickLower,
    tickUpper,
    amount0Desired: tokenIsToken0 ? curveAmt : 0n,
    amount1Desired: tokenIsToken0 ? 0n : curveAmt,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: deployer.address,
    deadline,
  };
  const mintTx = await (npm as any).mint(mintParams);
  await mintTx.wait();

  const pool = await ethers.getContractAt(
    ["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)", "function liquidity() view returns (uint128)"],
    poolAddr
  );
  const s0 = await (pool as any).slot0();
  const liq = await (pool as any).liquidity();
  console.log(`after mint: liquidity=${liq}  poolTokenBal=${ethers.formatEther(await token.balanceOf(poolAddr))} ADOGE`);

  // --- Buy: swap WNative -> token via the router ---
  const spend = ethers.parseEther("5");
  await wnative.connect(buyer).deposit({ value: spend });
  await wnative.connect(buyer).approve(await router.getAddress(), spend);
  await (router as any).connect(buyer).exactInputSingle({
    tokenIn: wAddr,
    tokenOut: tokenAddr,
    fee: FEE,
    recipient: buyer.address,
    deadline,
    amountIn: spend,
    amountOutMinimum: 0n,
    sqrtPriceLimitX96: 0n,
  });

  const bought = await token.balanceOf(buyer.address);
  const s1 = await (pool as any).slot0();
  console.log(`\nbuyer spent 5 WNATIVE, received ${ethers.formatEther(bought)} ADOGE`);
  console.log(`sqrtPriceX96: ${s0.sqrtPriceX96} -> ${s1.sqrtPriceX96}  (price moved: ${s0.sqrtPriceX96 !== s1.sqrtPriceX96})`);
  console.log(`\n✔ Real Uniswap V3 launch + single-sided curve + swap works.`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
