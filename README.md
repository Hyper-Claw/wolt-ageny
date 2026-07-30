# arc.fun — a token launchpad for the Arc chain

A pump.fun / [Pons](https://pons.family/launchpad)-style token launchpad built for
[**Arc**](https://docs.arc.io/arc-chain), Circle's EVM-compatible L1 (USDC is the native gas token,
testnet chain id `5042002`).

Anyone can deploy a token **and** its Uniswap V3 pool in a single transaction. The entire supply is
seeded as a single-sided concentrated-liquidity position — that position *is* the bonding curve —
priced against wrapped native USDC. Liquidity is locked in a `Locker`, price comes from the pool's
`slot0`, and trading continues in the same pool through and after graduation.

## What's in here

```
contracts/   Hardhat + Solidity 0.8.24 — the Uniswap V3 launcher, locker, token
web/         Next.js 14 + wagmi/viem — the launchpad UI
```

### Feature parity with Pons / pump.fun

| Pons / pump.fun                              | Here                                                              |
| -------------------------------------------- | ----------------------------------------------------------------- |
| Explore grid of coins (mcap, image, age)     | `/` — live grid, search, per-coin market cap + curve progress     |
| Create form (name, ticker, image, socials)   | `/create` — full form + optional **dev buy** at launch            |
| Single-tx deploy of token + pool             | `launch()` deploys the ERC20 **and** its Uniswap V3 pool + liquidity |
| Bonding curve                                 | single-sided V3 concentrated-liquidity position (real DEX pool)    |
| Buy/sell                                      | `buy()`/`sell()` route through the V3 swap router                  |
| Self-describing tokens                        | `logo()`, `description()`, `socials()`, `liquidityPool()` on-chain |
| Launch + graduation state                     | `getLaunchedToken()`, `graduationStatus()` (Pons-compatible)       |
| Coin page with live trades + progress         | `/token/[address]` — `slot0` price, progress, live trades feed     |
| Creator earnings / fees                       | pool LP fees, split protocol/creator via the `Locker`             |
| Locked liquidity + same-pool graduation        | LP NFT locked in the `Locker`; trading continues in the same pool  |

## Try it locally (no real funds)

Want to click through the whole thing in your browser? See **[LOCAL.md](./LOCAL.md)**. In short,
from the repo root:

```bash
npm run setup     # one-time: install contracts + web deps
npm run chain     # terminal 1: local blockchain
npm run seed      # terminal 2: deploy launchpad + 5 demo coins (auto-writes web config)
npm run web       # terminal 3: app at http://localhost:3000
```

Or watch the lifecycle in the terminal with `npm run demo`.

## Smart contracts (real Uniswap V3)

This is the authentic Pons mechanism: tokens launch directly into a **Uniswap V3 pool**, seeded as a
**single-sided concentrated-liquidity position** that acts as the bonding curve. Trading continues in
the same pool before and after graduation.

- **`LaunchToken.sol`** — fixed-supply (1B), self-describing ERC20: `logo()`, `description()`,
  `socials()`, `liquidityPool()`, `deployer()`, `pairedToken()`, `poolFee()`. No owner, no post-deploy
  mint.
- **`ArcLaunchpad.sol`** — the launcher:
  - `launch()` deploys the token, creates + initializes its V3 pool, and mints the **entire supply as
    one single-sided position** (orientation-aware; init price computed on-chain via `TickMath`).
  - `buy()`/`sell()` wrap/unwrap native and route through the V3 **swap router** so users trade with
    plain native value; `minTokensOut`/`minNativeOut` + `deadline` guards.
  - Price from the pool's `slot0` (`spotPrice`, `marketCap`); `graduationStatus()` tracks paired
    principal (the pool's native balance) vs a threshold; `getLaunchedToken()` returns the Pons struct.
- **`Locker.sol`** — custodies each pool's LP NFT (liquidity locked forever) and holds the fee split;
  `collectFees()` claims LP fees and splits them protocol/creator (`tokenProtocolFeeShares`,
  `feeRedirects`, `protocolFeeRecipient`).
- **`WNative.sol`** — wrapped-native (WETH9-style) quote asset (wrapped USDC on Arc).
- **`libraries/TickMath.sol`**, **`interfaces/IUniswapV3.sol`** — 0.8-compatible V3 helpers.

### Build, test, deploy

```bash
cd contracts
npm install
npm test                  # deploys a local V3 stack + runs the full lifecycle suite
npm run demo              # prints launch → trade → graduate on real V3
```

**Live deploy.** Set the target network's Uniswap V3 addresses in `.env` (`POSITION_MANAGER`,
`SWAP_ROUTER`, `V3_FACTORY`, `WNATIVE`) plus `PRIVATE_KEY` and optional `FEE_RECIPIENT`, then run the
deploy against your network. If those four V3 addresses are **not** set, `deploy.ts` deploys a fresh
local V3 stack (dev only). Curve economics (tick range, graduation threshold, fee tier, supply) live
in `ECON` in `scripts/v3.ts` — tune before a live deploy.

> This environment blocks `binaries.soliditylang.org`, so Hardhat can't download `solc`; the config
> points it at the WASM `solc` from npm (see `hardhat.config.ts`). Uniswap V3 core/periphery are used
> as precompiled artifacts, so no 0.7.6 toolchain is needed.

## Frontend

```bash
cd web
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_LAUNCHPAD_ADDRESS to the deployed address
npm run dev                         # http://localhost:3000
```

- Wallet connection via the injected (browser wallet) connector — no WalletConnect project id needed.
- Reads live chain state via viem (`TokenLaunched` / `Trade` logs + `slot0`-based views); no indexer
  required for the MVP.
- Until `NEXT_PUBLIC_LAUNCHPAD_ADDRESS` is set, the UI shows a banner explaining how to wire it up.
- Dark/light theme toggle; the design follows Pons's layout in the ARC blue→violet vibe.
- **Logo:** drop your artwork at `web/public/logo.png` and it's used automatically; otherwise the
  bundled `web/public/logo.svg` (a gradient rope-"L") is shown.

## Notes & disclaimers

Experimental software for the Arc testnet. Bonding-curve launchpads carry real risk (illiquid tokens,
manipulation, malicious launches). Nothing here is audited or financial advice — trade at your own
risk.
