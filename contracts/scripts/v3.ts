import { ethers } from "hardhat";
import FactoryArt from "@uniswap/v3-core/artifacts/contracts/UniswapV3Factory.sol/UniswapV3Factory.json";
import NpmArt from "@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json";
import RouterArt from "@uniswap/v3-periphery/artifacts/contracts/SwapRouter.sol/SwapRouter.json";

/** Deploy a full local Uniswap V3 stack (for local dev / tests). */
export async function deployV3(deployer: any) {
  const WNative = await ethers.getContractFactory("WNative");
  const wnative = await WNative.deploy();
  await wnative.waitForDeployment();

  const Factory = new ethers.ContractFactory(FactoryArt.abi, FactoryArt.bytecode, deployer);
  const factory = await Factory.deploy();
  await factory.waitForDeployment();

  const Npm = new ethers.ContractFactory(NpmArt.abi, NpmArt.bytecode, deployer);
  const npm = await Npm.deploy(await factory.getAddress(), await wnative.getAddress(), await wnative.getAddress());
  await npm.waitForDeployment();

  const Router = new ethers.ContractFactory(RouterArt.abi, RouterArt.bytecode, deployer);
  const router = await Router.deploy(await factory.getAddress(), await wnative.getAddress());
  await router.waitForDeployment();

  return { wnative, factory, npm, router };
}

/**
 * Default curve economics. Single-sided range ~1e-9 .. 1e-7 native/token gives
 * a full-curve capacity of ~10 native; the graduation threshold sits below that.
 */
export const ECON = {
  poolFee: 10000,
  tickSpacing: 200,
  tickLower: -207200,
  tickUpper: -161000,
  totalSupply: ethers.parseEther("1000000000"),
  graduationThreshold: ethers.parseEther("6"),
  protocolFeePercent: 50n,
  restrictionBlocks: 0n,
};

export async function v3Addrs(v3: { wnative: any; factory: any; npm: any; router: any }) {
  return {
    npm: await v3.npm.getAddress(),
    router: await v3.router.getAddress(),
    factory: await v3.factory.getAddress(),
    wnative: await v3.wnative.getAddress(),
  };
}

export async function deployLaunchpad(
  a: { npm: string; router: string; factory: string; wnative: string },
  feeRecipient: string,
  overrides: Partial<typeof ECON> = {}
) {
  const e = { ...ECON, ...overrides };
  const F = await ethers.getContractFactory("ArcLaunchpad");
  const lp = await F.deploy(
    a.npm,
    a.router,
    a.factory,
    a.wnative,
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

export function launchParams(over: Partial<{ name: string; symbol: string; logo: string; description: string }> = {}) {
  return {
    name: over.name ?? "Arc Doge",
    symbol: over.symbol ?? "ADOGE",
    logo: over.logo ?? "ipfs://logo",
    description: over.description ?? "the first dog on Arc",
    socials: { twitter: "https://x.com/arc", telegram: "", discord: "", website: "https://arc.io", farcaster: "" },
  };
}
