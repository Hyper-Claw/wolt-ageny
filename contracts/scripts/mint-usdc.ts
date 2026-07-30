import { ethers } from "hardhat";

// Local helper: mint mock USDC to an address (only works with MockUSDC).
//   USDC_ADDRESS=0x.. MINT_TO=0x.. MINT_AMOUNT=100000 hardhat run scripts/mint-usdc.ts --network localhost
async function main() {
  const usdc = process.env.USDC_ADDRESS;
  if (!usdc) throw new Error("Set USDC_ADDRESS");
  const [signer] = await ethers.getSigners();
  const to = process.env.MINT_TO ?? signer.address;
  const amount = ethers.parseUnits(process.env.MINT_AMOUNT ?? "100000", 6);
  const c = await ethers.getContractAt("MockUSDC", usdc);
  await (await c.mint(to, amount)).wait();
  console.log(`minted ${ethers.formatUnits(amount, 6)} USDC to ${to}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
