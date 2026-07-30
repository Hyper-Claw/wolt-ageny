# Run the launchpad locally (no real funds)

Test the full app — UI, wallet, buys/sells, graduation — against a local blockchain on your own
machine. Everything uses fake local test funds; nothing touches Arc or real money.

## Prerequisites

- **Node.js 18+** and npm
- A **browser wallet** — [MetaMask](https://metamask.io) is easiest
- This repo cloned locally

## The short version

```bash
# one-time
git clone <this-repo> && cd wolt-ageny
(cd contracts && npm install)
(cd web && npm install)
```

Then use **three terminals**:

| Terminal | Directory   | Command            | What it does                              |
| -------- | ----------- | ------------------ | ----------------------------------------- |
| 1        | `contracts` | `npm run node`     | Starts a local blockchain on port 8545    |
| 2        | `contracts` | `npm run seed:local` | Deploys the launchpad + 5 demo coins    |
| 3        | `web`       | `npm run dev`      | Starts the app at http://localhost:3000   |

## Step by step

### 1. Start the local chain (Terminal 1)

```bash
cd contracts
npm run node
```

Leave this running. It prints 20 pre-funded test accounts and their private keys. **Account #0**:

```
Address:     0xf39Fd6e51aad88F6F4ce6aB8827279cfffb92266
Private key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
```

> These keys are public and well-known — they only control fake funds on your local node. **Never
> send real money to them.**

### 2. Deploy + seed demo coins (Terminal 2)

```bash
cd contracts
npm run seed:local
```

This deploys `ArcLaunchpad` and launches 5 demo coins with some trades. On a fresh node the address
is always:

```
0x5FbDB2315678afecb367f032d93F642f64180aa3
```

### 3. Point the web app at local (Terminal 3)

```bash
cd web
cp .env.local.example .env.local
```

Edit `web/.env.local` so it contains:

```
NEXT_PUBLIC_CHAIN=local
NEXT_PUBLIC_LAUNCHPAD_ADDRESS=0x5FbDB2315678afecb367f032d93F642f64180aa3
```

Then:

```bash
npm run dev
```

Open **http://localhost:3000** — the Explore grid should show the 5 seeded coins.

### 4. Connect MetaMask to the local chain

1. In MetaMask → networks → **Add network manually**:
   - Network name: `Localhost 8545`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `USDC`
2. **Import account** → paste the Account #0 private key above. You'll see ~10000 test USDC.
3. Back in the app, click **Connect wallet**.

Now you can:

- **Create** a coin at `/create` (try a Dev buy amount like `1`)
- **Buy / sell** on any coin's page and watch price, market cap and the curve progress move
- Push a coin to **100%** to see it **graduate** and lock liquidity

## Tips & troubleshooting

- **Restarting the node resets everything.** Re-run `npm run seed:local`. The launchpad address stays
  the same, so you don't need to change `.env.local`.
- **MetaMask "nonce too high" after a node restart:** MetaMask → Settings → Advanced → *Clear
  activity tab data* for the account.
- **Explore is empty:** confirm `.env.local` has `NEXT_PUBLIC_CHAIN=local` and the right address, then
  restart `npm run dev` (Next.js only reads env at startup).
- **Change your own account:** import any of the other private keys the node printed to trade from a
  second wallet.

When you're ready to go live on Arc testnet instead of local, see the deploy section in the main
[README](./README.md).
