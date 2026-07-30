import { launchpadAbi } from "./abi";

/** Deployed ArcLaunchpad address. Set after running the deploy script. */
export const LAUNCHPAD_ADDRESS = (process.env.NEXT_PUBLIC_LAUNCHPAD_ADDRESS ??
  "0x0000000000000000000000000000000000000000") as `0x${string}`;

/** Block the launchpad was deployed at, to bound log queries. */
export const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK ?? "0");

export const launchpad = {
  address: LAUNCHPAD_ADDRESS,
  abi: launchpadAbi,
} as const;

export const isConfigured = LAUNCHPAD_ADDRESS !== "0x0000000000000000000000000000000000000000";
