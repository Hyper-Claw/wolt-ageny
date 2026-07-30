import { expect } from "chai";
import { ethers } from "hardhat";
import { deployV3, deployLaunchpad, v3Addrs, fundUsdc, launchParams, ECON } from "../scripts/v3";

async function fixture(overrides = {}) {
  const [deployer, creator, alice, bob] = await ethers.getSigners();
  const v3 = await deployV3(deployer);
  const lp = await deployLaunchpad(await v3Addrs(v3), deployer.address, overrides);
  return { v3, lp, deployer, creator, alice, bob };
}

async function launch(lp: any, creator: any, over = {}) {
  const tx = await lp.connect(creator).launch(launchParams(over));
  const rc = await tx.wait();
  let token = "";
  for (const log of rc.logs) {
    try {
      const p = lp.interface.parseLog(log);
      if (p?.name === "TokenLaunched") token = p.args.token;
    } catch {
      /* skip */
    }
  }
  return token;
}

const deadline = async () => (await ethers.provider.getBlock("latest"))!.timestamp + 600;
const USDC = (n: string) => ethers.parseUnits(n, 6);

describe("ArcLaunchpad (Uniswap V3, USDC-paired)", () => {
  it("launches a token into a real V3 pool paired with USDC, single-sided", async () => {
    const { lp, v3, creator } = await fixture();
    const token = await launch(lp, creator);
    const erc20 = await ethers.getContractAt("LaunchToken", token);
    const pool = await lp.poolOf(token);

    expect(pool).to.properAddress;
    expect(await erc20.liquidityPool()).to.equal(pool);
    expect(await erc20.pairedToken()).to.equal(await v3.usdc.getAddress());
    expect(await erc20.balanceOf(pool)).to.be.gt(ethers.parseEther("999000000"));

    // Self-describing (Pons/DYOR-compatible).
    expect(await erc20.logo()).to.equal("ipfs://logo");
    const socials = await erc20.socials();
    expect(socials[0]).to.equal("https://x.com/arc");

    const l = await lp.getLaunchedToken(token);
    expect(l.exists).to.equal(true);
    expect(l.pairedToken).to.equal(await v3.usdc.getAddress());
    expect(l.supply).to.equal(ECON.totalSupply);
    expect(l.positionId).to.be.gt(0n);

    const locker = await ethers.getContractAt("Locker", await lp.locker());
    expect(await locker.positionIds(token)).to.equal(l.positionId);
  });

  it("buys with USDC via the router: tokens received and price rises", async () => {
    const { lp, v3, creator, alice } = await fixture();
    const token = await launch(lp, creator);
    const erc20 = await ethers.getContractAt("LaunchToken", token);

    await fundUsdc(v3.usdc, alice, "100", await lp.getAddress());
    const p0 = await lp.spotPrice(token);
    await lp.connect(alice).buy(token, USDC("100"), 0n, await deadline());
    const p1 = await lp.spotPrice(token);

    expect(await erc20.balanceOf(alice.address)).to.be.gt(0n);
    expect(p1).to.be.gt(p0);
    expect(await lp.marketCap(token)).to.be.gt(0n);
    // principal == USDC that landed in the pool
    expect(await lp.pairedPrincipal(token)).to.equal(USDC("100"));
  });

  it("round-trips: buy then sell returns USDC minus fees", async () => {
    const { lp, v3, creator, alice } = await fixture();
    const token = await launch(lp, creator);
    const erc20 = await ethers.getContractAt("LaunchToken", token);

    await fundUsdc(v3.usdc, alice, "200", await lp.getAddress());
    await lp.connect(alice).buy(token, USDC("200"), 0n, await deadline());
    const bought = await erc20.balanceOf(alice.address);
    expect(bought).to.be.gt(0n);

    await erc20.connect(alice).approve(await lp.getAddress(), bought);
    const before = await v3.usdc.balanceOf(alice.address);
    await lp.connect(alice).sell(token, bought, 0n, await deadline());
    const received = (await v3.usdc.balanceOf(alice.address)) - before;

    expect(received).to.be.gt(0n);
    expect(received).to.be.lt(USDC("200")); // two 1% pool fees
    expect(received).to.be.gt(USDC("195"));
    expect(await erc20.balanceOf(alice.address)).to.equal(0n);
  });

  it("tracks graduation via USDC principal", async () => {
    const { lp, v3, creator, bob } = await fixture({ graduationThreshold: USDC("50") });
    const token = await launch(lp, creator);

    let st = await lp.graduationStatus(token);
    expect(st.graduated).to.equal(false);
    expect(st.threshold).to.equal(USDC("50"));

    await fundUsdc(v3.usdc, bob, "60", await lp.getAddress());
    await lp.connect(bob).buy(token, USDC("60"), 0n, await deadline());

    st = await lp.graduationStatus(token);
    expect(st.principal).to.be.gte(USDC("50"));
    expect(st.graduated).to.equal(true);
    expect(await lp.progressBps(token)).to.equal(10000n);
  });

  it("prices in USDC/token with correct decimals", async () => {
    const { lp, v3, creator, alice } = await fixture();
    const token = await launch(lp, creator);
    // Start price should be a small but non-zero USDC value (scaled 1e18).
    const p0 = await lp.spotPrice(token);
    expect(p0).to.be.gt(0n);
    // Market cap sanity: price * 1e9 supply, formatted as USDC, should be positive.
    await fundUsdc(v3.usdc, alice, "500", await lp.getAddress());
    await lp.connect(alice).buy(token, USDC("500"), 0n, await deadline());
    const mc = await lp.marketCap(token);
    expect(Number(ethers.formatUnits(mc, 18))).to.be.gt(0);
  });

  it("accrues LP fees the locker can collect", async () => {
    const { lp, v3, creator, alice } = await fixture();
    const token = await launch(lp, creator);
    await fundUsdc(v3.usdc, alice, "100", await lp.getAddress());
    await lp.connect(alice).buy(token, USDC("100"), 0n, await deadline());
    const locker = await ethers.getContractAt("Locker", await lp.locker());
    await expect(locker.collectFees(token)).to.not.be.reverted;
  });
});
