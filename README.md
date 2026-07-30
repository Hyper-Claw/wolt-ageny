# arc.fun — a token launchpad for the Arc chain

A pump.fun / [Pons](https://pons.family/launchpad)-style token launchpad built for
[**Arc**](https://docs.arc.io/arc-chain), Circle's EVM-compatible L1 (USDC is the native gas token,
testnet chain id `5042002`).

Anyone can deploy a token **and** its bonding-curve trading pool in a single transaction. Tokens are
priced on a constant-product virtual-reserve curve, denominated in Arc's native USDC. When a token
sells out its curve allocation it **graduates**: curve trading closes and the reserved liquidity is
locked, ready to migrate to a DEX.

## What's in here

```
contracts/   Hardhat + Solidity 0.8.24 — the bonding-curve launchpad
web/         Next.js 14 + wagmi/viem — the launchpad UI
```

### Feature parity with Pons / pump.fun

| Pons / pump.fun                              | Here                                                              |
| -------------------------------------------- | ----------------------------------------------------------------- |
| Explore grid of coins (mcap, image, age)     | `/` — live grid, search, per-coin market cap + curve progress     |
| Create form (name, ticker, image, socials)   | `/create` — full form + optional **dev buy** at launch            |
| Single-tx deploy of token + pool             | `ArcLaunchpad.launch()` deploys the ERC20 and opens its curve      |
| Bonding-curve buy/sell                        | `buy()` / `sell()` on a virtual-reserve constant-product curve     |
| Coin page with live trades + progress         | `/token/[address]` — stats, curve progress, live trades feed       |
| Creator earnings / platform fees              | 1% trade fee, split platform/creator (configurable)               |
| Graduation + liquidity lock/migration         | Auto-graduation, locked liquidity, migrator-only DEX migration    |

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

## Smart contracts

- **`LaunchToken.sol`** — a fixed-supply ERC20 (1B). The full supply is minted to the launchpad; there
  is no owner and no post-deploy mint, so supply is immutable.
- **`ArcLaunchpad.sol`** — holds every token's curve in one contract (pump.fun-style). Highlights:
  - Virtual-reserve constant-product curve (`x·y=k`) priced in native USDC.
  - 800M sold on the curve, 200M reserved for post-graduation liquidity.
  - Fees taken on every trade, split between the platform and the token creator.
  - Buys that would cross the graduation boundary are capped and the excess is refunded.
  - On graduation, curve trading closes and liquidity (native + LP tokens) is locked; only the
    configured `liquidityMigrator` can move it to a DEX.
  - Slippage (`minTokensOut` / `minNativeOut`) and `deadline` guards, `ReentrancyGuard` throughout.
  - View helpers for the UI: `calcBuy`, `calcSell`, `spotPrice`, `marketCap`, `progressBps`,
    `getTokens`.

### Build, test, deploy

```bash
cd contracts
npm install
npm test                 # 8 passing unit tests
cp .env.example .env      # set PRIVATE_KEY (Arc testnet gas) + optional RPC/FEE_RECIPIENT
npm run deploy:arc        # deploys ArcLaunchpad to Arc testnet
```

> This environment blocks `binaries.soliditylang.org`, so Hardhat can't download `solc`. The config
> points Hardhat at the WASM `solc` shipped by the npm package instead — see `hardhat.config.ts`.

Curve parameters (total supply, curve allocation, virtual reserves, fees) are constructor args in
`scripts/deploy.ts`. Native amounts assume 18-decimal native units; tune them if Arc's native
decimals differ.

## Frontend

```bash
cd web
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_LAUNCHPAD_ADDRESS to the deployed address
npm run dev                         # http://localhost:3000
```

- Wallet connection via the injected (browser wallet) connector — no WalletConnect project id needed.
- Reads live chain state via viem (`TokenLaunched` / `Trade` logs + curve view functions); no indexer
  required for the MVP.
- Until `NEXT_PUBLIC_LAUNCHPAD_ADDRESS` is set, the UI shows a banner explaining how to wire it up.

## Notes & disclaimers

Experimental software for the Arc testnet. Bonding-curve launchpads carry real risk (illiquid tokens,
manipulation, malicious launches). Nothing here is audited or financial advice — trade at your own
risk.
