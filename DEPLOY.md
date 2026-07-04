# Deploying Tipfall on a VPS

This gets you a live, always-on donation page with automatic HTTPS in about
15 minutes. Everything runs in two containers (the app + Caddy for TLS), so
the only thing you install on the server is Docker.

You need three things: a **server**, a **domain name**, and her **wallet
addresses**.

---

## 1. Get a server

Any small Linux VPS works. For Germany, [Hetzner Cloud](https://www.hetzner.com/cloud)
is a great, cheap choice (servers physically in DE):

- Create a project → **Add Server**
- Location: **Nuremberg** or **Falkenstein**
- Image: **Ubuntu 24.04**
- Type: **CX22** (2 vCPU / 4 GB, ~€4/mo) — more than enough
- Add your SSH key (or set a root password), then **Create**

Note the server's **public IPv4** address.

## 2. Point a domain at it

You need a domain (or subdomain) for HTTPS — a bare IP can't get a
certificate, and crypto wallets/OBS want `https://`. A domain is ~€10/year at
Namecheap, Porkbun, Cloudflare, etc.

In your domain's DNS settings, add an **A record**:

```
Type: A     Name: tips     Value: <your server IP>
```

That gives you `tips.yourchannel.com`. DNS can take a few minutes to
propagate.

## 3. Install Docker on the server

SSH in (`ssh root@<server IP>`) and run:

```bash
curl -fsSL https://get.docker.com | sh
```

## 4. Get the code and configure

```bash
git clone https://github.com/Hyper-Claw/wolt-ageny.git
cd wolt-ageny
cp .env.example .env
nano .env
```

Fill in `.env`:

- `DOMAIN` — the domain from step 2 (e.g. `tips.yourchannel.com`)
- `ETH_ADDRESS` — her **public** Ethereum address (`0x…`)
- `SOL_ADDRESS` — her **public** Solana address
- `OVERLAY_KEY` and `ADMIN_KEY` — generate strong random values:

  ```bash
  openssl rand -hex 16   # run twice, paste one into each
  ```

- (optional) `GOAL_EUR`, `GOAL_TITLE`, `STREAMER_NAME`

Leave the RPC lines as-is to start (the free public endpoints are fine).

> **Never put a private key or seed phrase in this file.** Tipfall only ever
> needs the public receiving addresses.

## 5. Launch

```bash
docker compose up -d --build
```

Caddy will fetch an HTTPS certificate automatically within a minute. Check
it's up:

```bash
docker compose logs -f
```

Visit `https://tips.yourchannel.com/` — you should see the donation page. 🎉

## 6. Wire it into the stream

The server logs print every URL on start. With your `OVERLAY_KEY`:

- **Twitch panel / chat:** link `https://tips.yourchannel.com/`
- **OBS → Sources → + → Browser Source:**
  - Alerts: `https://tips.yourchannel.com/overlay?key=<OVERLAY_KEY>` (≈900×360)
  - Goal bar: `https://tips.yourchannel.com/goal?key=<OVERLAY_KEY>` (≈440×340)
- **Customize alerts/goal/tiers:** open `https://tips.yourchannel.com/customize`,
  paste both keys, tweak, Save. (No redeploy needed — overlays update live.)

Send yourself a test alert from the `/customize` page, or:

```bash
curl -X POST https://tips.yourchannel.com/api/test-alert \
  -H "x-admin-key: <ADMIN_KEY>" -H "content-type: application/json" \
  -d '{"name":"TestDonor","message":"Hello stream!","eur":150}'
```

---

## Changing the look (UX)

Two kinds of customization:

- **No code —** alert sound, goal, and donation tiers (colors/GIFs per tip
  size) are all set on the `/customize` page.
- **Editing pages —** the actual page design lives in `public/`:
  - `public/index.html` — the donation page donors see
  - `public/overlay.html` — the on-stream alert card
  - `public/goal.html` — the on-stream goal bar
  - `public/customize.html` — the control panel

  Colors/fonts are plain CSS at the top of each file (look for the
  `:root { --accent … }` block). After editing:

  ```bash
  git pull        # if you edited via GitHub, or just save on the server
  docker compose up -d --build
  ```

## Updating later (manual)

```bash
cd wolt-ageny
git pull
docker compose up -d --build
```

The donation ledger (`data/`) is kept in a Docker volume, so it survives
updates and restarts.

---

## Automatic deploys (recommended — no more SSH)

Set this up once and you'll never have to touch the server again. After it's
wired up:

- Editing a page on **github.com** (pencil icon → commit) redeploys it live.
- Or click **Actions → Deploy to VPS → Run workflow** for a manual redeploy.

It works by giving GitHub a key to SSH in and run the update for you.

### One-time setup

**1. On your own computer, make a deploy key** (a dedicated SSH key just for
this — no passphrase):

```bash
ssh-keygen -t ed25519 -f tipfall_deploy -N "" -C "github-deploy"
```

That creates two files: `tipfall_deploy` (private) and `tipfall_deploy.pub`
(public).

**2. Authorize the public key on the server.** Copy the contents of
`tipfall_deploy.pub` and, on the VPS:

```bash
cat >> ~/.ssh/authorized_keys < tipfall_deploy.pub   # or paste it in with nano
```

(If you're logging in as `root`, that's `/root/.ssh/authorized_keys`.)

**3. Add three secrets to the GitHub repo.** Go to the repo on github.com →
**Settings → Secrets and variables → Actions → New repository secret**, and add:

| Name | Value |
|------|-------|
| `DEPLOY_HOST` | your server's IP address |
| `DEPLOY_USER` | `root` (or your deploy user) |
| `DEPLOY_SSH_KEY` | the **entire** contents of the **private** `tipfall_deploy` file |

That's it. The next push to `main` (or a manual run) deploys automatically.
Watch it under the repo's **Actions** tab.

> Keep the private key secret — it only ever lives in the GitHub secret and on
> your computer, never in the repo. Delete your local copy once it's pasted in
> if you like; you can always generate a new one.

> ⚠️ Once auto-deploy is on, make edits through **GitHub** (not by editing
> files directly on the server), so the server's `git pull` never hits a
> conflict.

---

## Surviving reboots

The containers are set to `restart: unless-stopped`, and Docker's installer
enables the Docker service on boot. So if the server reboots (or crashes),
everything comes back on its own. To be certain Docker starts at boot:

```bash
sudo systemctl enable docker
```

## Handy commands

```bash
docker compose logs -f        # watch live logs (incoming tips print here)
docker compose restart        # restart after an .env change
docker compose down           # stop everything (data is retained)
```
