import { expect } from "chai";
import { ethers } from "hardhat";
import { ArcLaunchpad, LaunchToken } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

const TOTAL = ethers.parseEther("1000000000");
const CURVE = ethers.parseEther("800000000");
const VNATIVE = ethers.parseEther("30");
const VTOKEN = ethers.parseEther("1073000000");
const FEE_BPS = 100n; // 1%
const CREATOR_SHARE = 5000n; // 50%

async function deployFixture() {
  const [owner, creator, alice, bob] = await ethers.getSigners();
  const Launchpad = await ethers.getContractFactory("ArcLaunchpad");
  const launchpad = (await Launchpad.deploy(
    TOTAL,
    CURVE,
    VNATIVE,
    VTOKEN,
    FEE_BPS,
    CREATOR_SHARE,
    0n,
    owner.address
  )) as unknown as ArcLaunchpad;
  await launchpad.waitForDeployment();
  return { launchpad, owner, creator, alice, bob };
}

async function launchToken(launchpad: ArcLaunchpad, creator: HardhatEthersSigner, devBuy = 0n) {
  const tx = await launchpad
    .connect(creator)
    .launch("Doge", "DOGE", "ipfs://img", "much wow", "", "", "", 0n, { value: devBuy });
  const receipt = await tx.wait();
  const iface = launchpad.interface;
  let tokenAddr = "";
  for (const log of receipt!.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed?.name === "TokenLaunched") tokenAddr = parsed.args.token;
    } catch {
      /* not our event */
    }
  }
  return tokenAddr;
}

describe("ArcLaunchpad", () => {
  it("launches a token with full supply held by the launchpad", async () => {
    const { launchpad, creator } = await deployFixture();
    const token = await launchToken(launchpad, creator);
    expect(token).to.properAddress;

    const erc20 = (await ethers.getContractAt("LaunchToken", token)) as unknown as LaunchToken;
    expect(await erc20.totalSupply()).to.equal(TOTAL);
    expect(await erc20.balanceOf(await launchpad.getAddress())).to.equal(TOTAL);
    expect(await launchpad.tokenCount()).to.equal(1n);
    expect(await erc20.creator()).to.equal(creator.address);
  });

  it("buys tokens on the curve and charges a fee split between platform and creator", async () => {
    const { launchpad, owner, creator, alice } = await deployFixture();
    const token = await launchToken(launchpad, creator);
    const erc20 = (await ethers.getContractAt("LaunchToken", token)) as unknown as LaunchToken;

    const spend = ethers.parseEther("1");
    const quote = await launchpad.calcBuy(token, spend);
    expect(quote).to.be.gt(0n);

    const ownerBefore = await ethers.provider.getBalance(owner.address);
    const creatorBefore = await ethers.provider.getBalance(creator.address);

    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
    await launchpad.connect(alice).buy(token, 0n, deadline, { value: spend });

    // Alice received (approximately) the quoted amount.
    const bal = await erc20.balanceOf(alice.address);
    expect(bal).to.equal(quote);

    // Fee = 1% of 1 ether = 0.01; creator gets 50%, platform 50%.
    const fee = (spend * FEE_BPS) / 10000n;
    const creatorCut = (fee * CREATOR_SHARE) / 10000n;
    const platformCut = fee - creatorCut;
    expect((await ethers.provider.getBalance(owner.address)) - ownerBefore).to.equal(platformCut);
    expect((await ethers.provider.getBalance(creator.address)) - creatorBefore).to.equal(creatorCut);
  });

  it("round-trips: selling right after buying returns slightly less (fees)", async () => {
    const { launchpad, creator, alice } = await deployFixture();
    const token = await launchToken(launchpad, creator);
    const erc20 = (await ethers.getContractAt("LaunchToken", token)) as unknown as LaunchToken;

    const spend = ethers.parseEther("5");
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;
    await launchpad.connect(alice).buy(token, 0n, deadline, { value: spend });
    const bought = await erc20.balanceOf(alice.address);

    await erc20.connect(alice).approve(await launchpad.getAddress(), bought);
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await launchpad.connect(alice).sell(token, bought, 0n, deadline);
    const rcpt = await tx.wait();
    const gas = rcpt!.gasUsed * rcpt!.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);

    const netReceived = after - before + gas;
    // Two 1% fees (buy + sell) mean the seller nets clearly less than spent.
    expect(netReceived).to.be.lt(spend);
    expect(netReceived).to.be.gt((spend * 96n) / 100n);
    expect(await erc20.balanceOf(alice.address)).to.equal(0n);
  });

  it("graduates when the curve allocation sells out and refunds the excess", async () => {
    const { launchpad, creator, alice } = await deployFixture();
    const token = await launchToken(launchpad, creator);
    const erc20 = (await ethers.getContractAt("LaunchToken", token)) as unknown as LaunchToken;

    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 6000;
    // Massively overpay to force graduation in one buy; excess must be refunded.
    const spend = ethers.parseEther("1000");
    const before = await ethers.provider.getBalance(alice.address);
    const tx = await launchpad.connect(alice).buy(token, 0n, deadline, { value: spend });
    const rcpt = await tx.wait();
    const gas = rcpt!.gasUsed * rcpt!.gasPrice;
    const after = await ethers.provider.getBalance(alice.address);

    // Buyer receives exactly the curve allocation.
    expect(await erc20.balanceOf(alice.address)).to.equal(CURVE);

    const curve = await launchpad.curves(token);
    expect(curve.graduated).to.equal(true);
    expect(await launchpad.progressBps(token)).to.equal(10000n);

    // Far less than 1000 was actually spent (graduation raise ~88 native + fees).
    const spent = before - after - gas;
    expect(spent).to.be.lt(ethers.parseEther("100"));

    // Curve is closed for trading.
    await expect(launchpad.connect(alice).buy(token, 0n, deadline, { value: ethers.parseEther("1") }))
      .to.be.revertedWithCustomError(launchpad, "CurveGraduated");
  });

  it("locks liquidity on graduation and only the migrator can move it", async () => {
    const { launchpad, owner, creator, alice, bob } = await deployFixture();
    const token = await launchToken(launchpad, creator);
    const erc20 = (await ethers.getContractAt("LaunchToken", token)) as unknown as LaunchToken;
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 6000;
    await launchpad.connect(alice).buy(token, 0n, deadline, { value: ethers.parseEther("1000") });

    expect(await launchpad.lockedNative(token)).to.be.gt(0n);
    // LP allocation still held by the launchpad.
    const lp = await launchpad.lpSupply();
    expect(await erc20.balanceOf(await launchpad.getAddress())).to.equal(lp);

    await expect(launchpad.connect(bob).migrateLiquidity(token, bob.address)).to.be.revertedWithCustomError(
      launchpad,
      "NotMigrator"
    );

    await launchpad.connect(owner).migrateLiquidity(token, bob.address);
    expect(await erc20.balanceOf(bob.address)).to.equal(lp);
    expect(await launchpad.lockedNative(token)).to.equal(0n);
  });

  it("supports an optional dev buy at launch", async () => {
    const { launchpad, creator } = await deployFixture();
    const devBuy = ethers.parseEther("2");
    const token = await launchToken(launchpad, creator, devBuy);
    const erc20 = (await ethers.getContractAt("LaunchToken", token)) as unknown as LaunchToken;
    expect(await erc20.balanceOf(creator.address)).to.be.gt(0n);
    const curve = await launchpad.curves(token);
    expect(curve.tokensSold).to.be.gt(0n);
  });

  it("enforces slippage and deadline guards", async () => {
    const { launchpad, creator, alice } = await deployFixture();
    const token = await launchToken(launchpad, creator);
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;

    await expect(
      launchpad.connect(alice).buy(token, ethers.parseEther("999999999999"), deadline, {
        value: ethers.parseEther("1"),
      })
    ).to.be.revertedWithCustomError(launchpad, "SlippageExceeded");

    await expect(
      launchpad.connect(alice).buy(token, 0n, 1, { value: ethers.parseEther("1") })
    ).to.be.revertedWithCustomError(launchpad, "DeadlinePassed");
  });

  it("price and market cap increase as the curve fills", async () => {
    const { launchpad, creator, alice } = await deployFixture();
    const token = await launchToken(launchpad, creator);
    const deadline = (await ethers.provider.getBlock("latest"))!.timestamp + 600;

    const p0 = await launchpad.spotPrice(token);
    const mc0 = await launchpad.marketCap(token);
    await launchpad.connect(alice).buy(token, 0n, deadline, { value: ethers.parseEther("10") });
    const p1 = await launchpad.spotPrice(token);
    const mc1 = await launchpad.marketCap(token);

    expect(p1).to.be.gt(p0);
    expect(mc1).to.be.gt(mc0);
  });
});
