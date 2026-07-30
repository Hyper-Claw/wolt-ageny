// Hand-written ABIs covering the functions and events the UI uses.
// Kept in sync with contracts/contracts/ArcLaunchpad.sol (Uniswap V3 based).

export const launchpadAbi = [
  // --- launch (single struct param) ---
  {
    type: "function",
    name: "launch",
    stateMutability: "payable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "logo", type: "string" },
          { name: "description", type: "string" },
          {
            name: "socials",
            type: "tuple",
            components: [
              { name: "twitter", type: "string" },
              { name: "telegram", type: "string" },
              { name: "discord", type: "string" },
              { name: "website", type: "string" },
              { name: "farcaster", type: "string" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
  // --- trading ---
  {
    type: "function",
    name: "buy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "usdcIn", type: "uint256" },
      { name: "minTokensOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "tokensOut", type: "uint256" }],
  },
  {
    type: "function",
    name: "sell",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "tokenAmount", type: "uint256" },
      { name: "minUsdcOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
    outputs: [{ name: "usdcOut", type: "uint256" }],
  },
  { type: "function", name: "usdc", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "pairedDecimals", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint8" }] },
  // --- views ---
  { type: "function", name: "spotPrice", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "marketCap", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "progressBps", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "pairedPrincipal", stateMutability: "view", inputs: [{ name: "token", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "graduationStatus",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [
      { name: "principal", type: "uint256" },
      { name: "threshold", type: "uint256" },
      { name: "graduated", type: "bool" },
    ],
  },
  { type: "function", name: "poolOf", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "tokenCount", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "getTokens",
    stateMutability: "view",
    inputs: [
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "page", type: "address[]" }],
  },
  { type: "function", name: "tokenTotalSupply", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "uint256" }] },
  { type: "function", name: "locker", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  // --- events ---
  {
    type: "event",
    name: "TokenLaunched",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "logo", type: "string", indexed: false },
      { name: "pool", type: "address", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Trade",
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "trader", type: "address", indexed: true },
      { name: "isBuy", type: "bool", indexed: false },
      { name: "usdcAmount", type: "uint256", indexed: false },
      { name: "tokenAmount", type: "uint256", indexed: false },
      { name: "timestamp", type: "uint256", indexed: false },
    ],
  },
] as const;

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "account", type: "address" }], outputs: [{ name: "", type: "uint256" }] },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  // Self-describing token getters (Pons-compatible).
  { type: "function", name: "description", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "string" }] },
  { type: "function", name: "liquidityPool", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  { type: "function", name: "deployer", stateMutability: "view", inputs: [], outputs: [{ name: "", type: "address" }] },
  {
    type: "function",
    name: "socials",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "twitter", type: "string" },
      { name: "telegram", type: "string" },
      { name: "discord", type: "string" },
      { name: "website", type: "string" },
      { name: "farcaster", type: "string" },
    ],
  },
] as const;
