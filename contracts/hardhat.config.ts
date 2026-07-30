import { HardhatUserConfig, subtask } from "hardhat/config";
import { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } from "hardhat/builtin-tasks/task-names";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

// This environment blocks binaries.soliditylang.org, so Hardhat cannot download
// solc. Instead we point it at the WASM compiler shipped by the `solc` npm
// package (installed from the allowed npm registry).
const SOLC_VERSION = "0.8.24";
const SOLC_LONG_VERSION = "0.8.24+commit.e11b9ed9";
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async (args: { solcVersion: string }, _hre, runSuper) => {
  if (args.solcVersion === SOLC_VERSION) {
    return {
      compilerPath: require.resolve("solc/soljson.js"),
      isSolcJs: true,
      version: SOLC_VERSION,
      longVersion: SOLC_LONG_VERSION,
    };
  }
  return runSuper(args);
});

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : [];
// Arc public testnet defaults (see https://docs.arc.io/arc-chain).
const ARC_TESTNET_RPC = process.env.ARC_TESTNET_RPC ?? "https://rpc.testnet.arc.io";
// Arc mainnet — set ARC_MAINNET_RPC (your provider URL) and ARC_MAINNET_CHAIN_ID.
const ARC_MAINNET_RPC = process.env.ARC_MAINNET_RPC ?? "";
const ARC_MAINNET_CHAIN_ID = process.env.ARC_MAINNET_CHAIN_ID ? Number(process.env.ARC_MAINNET_CHAIN_ID) : undefined;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    arcTestnet: {
      url: ARC_TESTNET_RPC,
      chainId: 5042002,
      accounts,
    },
    // Chain id + RPC come from env because Arc mainnet params weren't public at
    // build time. Set ARC_MAINNET_RPC and ARC_MAINNET_CHAIN_ID in .env.
    arcMainnet: {
      url: ARC_MAINNET_RPC,
      ...(ARC_MAINNET_CHAIN_ID ? { chainId: ARC_MAINNET_CHAIN_ID } : {}),
      accounts,
    },
  },
};

export default config;
