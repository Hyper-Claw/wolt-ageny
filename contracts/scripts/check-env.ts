import { ethers, network } from "hardhat";

/**
 * Read-only pre-flight check (no gas, no deploy). Confirms the RPC works, the
 * chain id, that USDC_ADDRESS is a real 6-decimal USDC, and your wallet balance.
 *   npm run check:arc-mainnet
 */
async function main() {
  const net = await ethers.provider.getNetwork();
  console.log(`✓ RPC reachable — network="${network.name}" chainId=${net.chainId}`);

  const signers = await ethers.getSigners();
  if (signers.length === 0) {
    console.log("⚠ No PRIVATE_KEY set in .env — set it to check your wallet.");
  } else {
    const me = signers[0].address;
    const nativeBal = await ethers.provider.getBalance(me);
    console.log(`✓ Wallet ${me}`);
    console.log(`  native (gas) balance: ${ethers.formatUnits(nativeBal, 18)}  (18-dec USDC)`);
  }

  const usdcAddr = process.env.USDC_ADDRESS;
  if (!usdcAddr) {
    console.log("⚠ USDC_ADDRESS not set in .env");
    return;
  }
  const usdc = new ethers.Contract(
    usdcAddr,
    [
      "function symbol() view returns (string)",
      "function decimals() view returns (uint8)",
      "function balanceOf(address) view returns (uint256)",
    ],
    ethers.provider
  );
  try {
    const [sym, dec] = await Promise.all([usdc.symbol(), usdc.decimals()]);
    console.log(`✓ USDC ${usdcAddr}: symbol=${sym} decimals=${dec}`);
    if (Number(dec) !== 6) console.log(`  ⚠ expected 6 decimals — double-check this is the right USDC address`);
    if (signers.length > 0) {
      const bal = await usdc.balanceOf(signers[0].address);
      console.log(`  your USDC (ERC-20) balance: ${ethers.formatUnits(bal, dec)}`);
    }
  } catch {
    console.log(`✗ Could not read USDC at ${usdcAddr} — wrong address, or not an ERC-20 on this chain.`);
  }

  console.log("\nIf everything above looks right, run: npm run deploy:arc-mainnet");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
