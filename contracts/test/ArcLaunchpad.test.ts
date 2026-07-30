import { expect } from "chai";
import { ethers } from "hardhat";
import { deployV3, deployLaunchpad, v3Addrs, launchParams, ECON } from "../scripts/v3";

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

describe("ArcLaunchpad (Uniswap V3)", () => {
  it("launches a token into a real V3 pool with single-sided liquidity", async () => {
    const { lp, creator } = await fixture();
    const token = await launch(lp, creator);
    expect(token).to.properAddress;

    const erc20 = await ethers.getContractAt("LaunchToken", token);
    const pool = await lp.poolOf(token);
    expect(pool).to.properAddress;
    expect(await erc20.liquidityPool()).to.equal(pool);

    // The pool holds essentially the entire supply as single-sided liquidity.
    const poolBal = await erc20.balanceOf(pool);
    expect(poolBal).to.be.gt(ethers.parseEther("999000000"));

    // Self-describing token (Pons-compatible).
    expect(await erc20.logo()).to.equal("ipfs://logo");
    expect(await erc20.description()).to.equal("the first dog on Arc");
    const socials = await erc20.socials();
    expect(socials[0]).to.equal("https://x.com/arc");
    expect(await erc20.deployer()).to.equal(creator.address);

    // getLaunchedToken struct.
    const l = await lp.getLaunchedToken(token);
    expect(l.exists).to.equal(true);
    expect(l.deployer).to.equal(creator.address);
    expect(l.supply).to.equal(ECON.totalSupply);
    expect(l.poolFee).to.equal(BigInt(ECON.poolFee));
    expect(l.positionId).to.be.gt(0n);

    // Locker custodies the LP position.
    const locker = await ethers.getContractAt("Locker", await lp.locker());
    expect(await locker.positionIds(token)).to.equal(l.positionId);
    expect(await locker.tokenProtocolFeeShares(token)).to.equal(50n);
  });

  it("buys via the router: tokens received and price rises", async () => {
    const { lp, creator, alice } = await fixture();
    const token = await launch(lp, creator);
    const erc20 = await ethers.getContractAt("LaunchToken", token);

    const p0 = await lp.spotPrice(token);
    await lp.connect(alice).buy(token, 0n, await deadline(), { value: ethers.parseEther("1") });
    const p1 = await lp.spotPrice(token);

    expect(await erc20.balanceOf(alice.address)).to.be.gt(0n);
    expect(p1).to.be.gt(p0);
    expect(await lp.marketCap(token)).to.be.gt(0n);
  });

  it("round-trips: buy then sell returns native (minus fees)", async () => {
    const { lp, creator, alice } = await fixture();
    const token = await launch(lp, creator);
    const erc20 = await ethers.getContractAt("LaunchToken", token);

    const spend = ethers.parseEther("2");
    await lp.connect(alice).buy(token, 0n, await deadline(), { value: spend });
    const bought = await erc20.balanceOf(alice.address);
    expect(bought).to.be.gt(0n);

    await erc20.connect(alice).approve(await lp.getAddress(), bought);
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await lp.connect(alice).sell(token, bought, 0n, await deadline());
    const rc = await tx.wait();
    const gas = rc.gasUsed * rc.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);

    const net = after - before + gas;
    expect(net).to.be.gt(0n);
    expect(net).to.be.lt(spend); // two 1% pool fees
    expect(await erc20.balanceOf(alice.address)).to.equal(0n);
  });

  it("tracks graduation via paired principal", async () => {
    const { lp, creator, bob } = await fixture({ graduationThreshold: ethers.parseEther("3") });
    const token = await launch(lp, creator);

    let status = await lp.graduationStatus(token);
    expect(status.graduated).to.equal(false);
    expect(status.threshold).to.equal(ethers.parseEther("3"));

    await lp.connect(bob).buy(token, 0n, await deadline(), { value: ethers.parseEther("4") });

    status = await lp.graduationStatus(token);
    expect(status.principal).to.be.gte(ethers.parseEther("3"));
    expect(status.graduated).to.equal(true);
    expect(await lp.progressBps(token)).to.equal(10000n);
  });

  it("accrues LP fees that the locker can collect", async () => {
    const { lp, creator, alice } = await fixture();
    const token = await launch(lp, creator);
    // Generate fee volume.
    await lp.connect(alice).buy(token, 0n, await deadline(), { value: ethers.parseEther("2") });
    const locker = await ethers.getContractAt("Locker", await lp.locker());
    // Should not revert; fees may be claimed to protocol/creator.
    await expect(locker.collectFees(token)).to.not.be.reverted;
  });

  it("supports an optional dev buy at launch", async () => {
    const { lp, creator } = await fixture();
    const tx = await lp.connect(creator).launch(launchParams(), { value: ethers.parseEther("1") });
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
    const erc20 = await ethers.getContractAt("LaunchToken", token);
    expect(await erc20.balanceOf(creator.address)).to.be.gt(0n);
    expect((await lp.getLaunchedToken(token)).initialBuyAmount).to.equal(ethers.parseEther("1"));
  });
});
