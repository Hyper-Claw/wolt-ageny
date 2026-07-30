# Run the launchpad locally (no real funds)

Test the full app — UI, wallet, buys/sells, graduation — against a local blockchain on your own
machine. Everything uses fake local test funds; nothing touches Arc or real money.

## Prerequisites

- **Node.js 18+** and npm — check with `node -v` ([install here](https://nodejs.org) if missing)
- A **browser wallet** — [MetaMask](https://metamask.io) is easiest
- The code on your machine. Either:
  - `git clone <this-repo-url>` then `git checkout claude/arc-token-launchpad-pwo0s4`, or
  - on GitHub, switch to the `claude/arc-token-launchpad-pwo0s4` branch → **Code ▸ Download ZIP** and unzip.

## One-time install

From the repo root:

```bash
npm run setup
```

(installs both `contracts` and `web` dependencies).

## Start it — three terminals, all from the repo root

| Terminal | Command         | What it does                                                    |
| -------- | --------------- | --------------------------------------------------------------- |
| 1        | `npm run chain` | Starts a local blockchain on port 8545 (leave it running)       |
| 2        | `npm run seed`  | Deploys the launchpad + 5 demo coins, **auto-writes** web config |
| 3        | `npm run web`   | Starts the app at http://localhost:3000                         |

That's it. `npm run seed` writes `web/.env.local` for you, so there's nothing to copy or paste.
Open **http://localhost:3000** and you'll see the 5 seeded coins.

> On a fresh chain the launchpad always deploys to
> `0x5FbDB2315678afecb367f032d93F642f64180aa3` (deterministic), and the seed writes that address into
> `web/.env.local` automatically.

## Connect MetaMask to the local chain

1. MetaMask → networks → **Add network manually**:
   - Network name: `Localhost 8545`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `USDC`
2. **Import account** → paste this well-known local test key (Hardhat Account #0):

   ```
   0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
   ```

   You'll see ~10000 test USDC. These keys are public and only control fake local funds — **never
   send real money to them.**
3. In the app, click **Connect wallet**.

Now you can:

- **Create** a coin at `/create` (try a Dev buy amount like `1`)
- **Buy / sell** on any coin's page and watch price, market cap and the curve progress move
- Push a coin to **100%** to see it **graduate** and lock liquidity

## Tips & troubleshooting

- **Restarting the chain (Terminal 1) wipes state.** Just re-run `npm run seed`. The address stays
  the same, so nothing else changes.
- **MetaMask "nonce too high" after a chain restart:** MetaMask → Settings → Advanced → *Clear
  activity tab data* for the account.
- **Explore is empty:** make sure Terminal 2 (`npm run seed`) finished successfully, then restart
  Terminal 3 (`npm run web`) — Next.js only reads env at startup.
- **Port 8545 already in use:** an old chain is still running; stop it (close that terminal) before
  `npm run chain`.
- **Watch it without a browser:** `npm run demo` prints the full launch → trade → graduate lifecycle
  in the terminal.

When you're ready to go live on Arc testnet with a shareable URL instead of local, see the deploy
section in the main [README](./README.md).
