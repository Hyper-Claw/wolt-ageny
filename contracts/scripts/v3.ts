import { ethers } from "hardhat";
import FactoryArt from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import NpmArt from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";
import RouterArt from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";

/**
 * Deploy a full local Uniswap V3 stack + a mock 6-decimal USDC (for local dev /
 * tests). On Arc we instead point at the real USDC ERC-20 and either an existing
 * V3 or one we deploy — see deploy.ts.
 *
 * WNative is deployed only as the periphery's required WETH9 constructor arg; it
 * is never the pair token (tokens pair against USDC directly).
 */
/** Deploy just the Uniswap V3 core+periphery (WETH9 placeholder, factory, NPM, router). */
export async function deployV3Core(deployer: any) {
  const WNative = await ethers.getContractFactory("WNative");
  const weth9 = await WNative.deploy();
  await weth9.waitForDeployment();

  const Factory = new ethers.ContractFactory(FactoryArt.abi, FactoryArt.bytecode, deployer);
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const Npm = new ethers.ContractFactory(NpmArt.abi, NpmArt.bytecode, deployer);
  const npm = await Npm.deploy(await factory.getAddress(), await weth9.getAddress(), await weth9.getAddress());
  await npm.waitForDeployment();

  const Router = new ethers.ContractFactory(RouterArt.abi, RouterArt.bytecode, deployer);
  const router = await Router.deploy(await factory.getAddress(), await weth9.getAddress());
  await router.waitForDeployment();

  return { weth9, factory, npm, router };
}

/** Local dev/test stack: V3 core + a mock 6-decimal USDC. */
export async function deployV3(deployer: any) {
  const core = await deployV3Core(deployer);
  const USDC = await ethers.getContractFactory("MockUSDC");
  const usdc = await USDC.deploy();
  await usdc.waitForDeployment();
  return { ...core, usdc };
}

export async function v3Addrs(v3: { usdc: any; factory: any; npm: any; router: any }) {
  return {
    npm: await v3.npm.getAddress(),
    router: await v3.router.getAddress(),
    factory: await v3.factory.getAddress(),
    usdc: await v3.usdc.getAddress(),
    pairedDecimals: 6,
  };
}

/**
 * Default curve economics. Tokens are 18-dec, USDC is 6-dec. The single-sided
 * range spans ~1e-6 .. 1e-4 USDC/token; graduation threshold is in USDC (6-dec).
 * Tune before a live deploy to hit a target raise (DYOR V3 uses ~$9k).
 */
export const ECON = {
  poolFee: 10000,
  tickSpacing: 200,
  tickLower: -405400, // launch MC ~$2.5k
  tickUpper: -380400, // graduation MC ~$30k (12.2x range)
  totalSupply: ethers.parseEther("1000000000"),
  graduationThreshold: 8658n * 1_000_000n, // ~$8.66k USDC = √(2.5k × 30k) to graduate
  protocolFeePercent: 50n,
  restrictionBlocks: 0n,
};

export async function deployLaunchpad(
  a: { npm: string; router: string; factory: string; usdc: string; pairedDecimals: number },
  feeRecipient: string,
  overrides: Partial<typeof ECON> = {}
) {
  const e = { ...ECON, ...overrides };
  const F = await ethers.getContractFactory("ArcLaunchpad");
  const lp = await F.deploy(
    a.npm,
    a.router,
    a.factory,
    a.usdc,
    a.pairedDecimals,
    feeRecipient,
    e.poolFee,
    e.tickSpacing,
    e.tickLower,
    e.tickUpper,
    e.totalSupply,
    e.graduationThreshold,
    e.protocolFeePercent,
    e.restrictionBlocks
  );
  await lp.waitForDeployment();
  return lp;
}

/** Mint mock USDC (6-dec) to an account and approve a spender. */
export async function fundUsdc(usdc: any, to: any, human: string, spender?: string) {
  const amount = ethers.parseUnits(human, 6);
  await usdc.mint(to.address, amount);
  if (spender) await usdc.connect(to).approve(spender, amount);
  return amount;
}

export function launchParams(over: Partial<{ name: string; symbol: string; logo: string; description: string }> = {}) {
  return {
    name: over.name ?? "Arc Doge",
    symbol: over.symbol ?? "ADOGE",
    logo: over.logo ?? "ipfs://logo",
    description: over.description ?? "the first dog on Arc",
    socials: { twitter: "https://x.com/arc", telegram: "", discord: "", website: "https://arc.io", farcaster: "" },
  };
}
