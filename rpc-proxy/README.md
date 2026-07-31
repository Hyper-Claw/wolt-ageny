# Arc RPC bridge (Tor → https)

The Arc mainnet RPC is only reachable as a Tor `.onion` hidden service. A browser
(and your deployed website) can't dial `.onion` directly, so this is a tiny
always-on service that speaks plain **https JSON-RPC** on the public internet and
relays every request to your `.onion` RPC over Tor.

```
browser  --https-->  this bridge  --Tor SOCKS5-->  http://xxxx.onion  (Arc mainnet RPC)
```

- `server.js` — a Node HTTP server. `GET /` is a health check; `POST /` relays the
  JSON-RPC body to `ONION_RPC` through Tor, with permissive CORS.
- `Dockerfile` / `start.sh` — one small image that runs Tor **and** the forwarder;
  `start.sh` waits for Tor to bootstrap before starting the server.
- `fly.toml` — fly.io config with one always-on machine (so Tor stays warm).

## Config

| var          | required | default                        | notes                                   |
| ------------ | -------- | ------------------------------ | --------------------------------------- |
| `ONION_RPC`  | yes      | —                              | your Arc mainnet `.onion` RPC URL       |
| `PORT`       | no       | `8080`                         | port the bridge listens on              |
| `TOR_SOCKS`  | no       | `socks5h://127.0.0.1:9050`     | Tor SOCKS proxy (`socks5h` resolves .onion) |

> **`ONION_RPC` is set as a secret**, never committed. Don't paste the value into
> chat or the repo — set it directly in your host (e.g. `fly secrets set`).

## Deploy to fly.io (from your Codespace)

```bash
# 1. install flyctl (no admin needed — installs into your home dir)
curl -L https://fly.io/install.sh | sh
export FLYCTL_INSTALL="$HOME/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"

# 2. sign in (opens a browser link)
fly auth login          # or: fly auth signup

# 3. from the rpc-proxy/ folder
cd rpc-proxy
fly launch --copy-config --no-deploy   # accept the app name, region; keeps fly.toml

# 4. give it your onion RPC (this is the secret)
fly secrets set ONION_RPC=http://YOUR_ONION_ADDRESS.onion

# 5. ship it
fly deploy
```

When it's up, `fly open` (or the URL fly prints, `https://arc-rpc-bridge.fly.dev`)
should return `arc rpc bridge ok`. Test a real RPC call:

```bash
curl -s https://arc-rpc-bridge.fly.dev \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
# -> {"jsonrpc":"2.0","id":1,"result":"0x13b2"}   (0x13b2 = 5042)
```

The first call after a cold start can take a few seconds while Tor builds a
circuit; after that it's fast.

## Plug it into the website

In Vercel (or wherever the `web/` app is hosted) set:

```
NEXT_PUBLIC_ARC_RPC = https://arc-rpc-bridge.fly.dev
```

That's the only piece the frontend needs to reach Arc mainnet.

## Run locally (optional)

You need Tor running locally (`brew install tor` / `apt install tor`, then `tor`).

```bash
cd rpc-proxy
npm install
ONION_RPC=http://YOUR_ONION.onion node server.js
# bridge on http://localhost:8080
```

## Alternative host: Render

Render also works (Docker service, `min instances = 1`). Point it at this folder's
`Dockerfile`, add `ONION_RPC` as an environment variable, and use the
`https://<service>.onrender.com` URL for `NEXT_PUBLIC_ARC_RPC`.
