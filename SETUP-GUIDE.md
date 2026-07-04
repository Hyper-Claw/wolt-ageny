# Tipfall — Complete Beginner's Setup Guide 🧑‍🏫

This guide assumes **you have never used a server, a terminal, or crypto
before**. Follow it top to bottom and you'll have donations running on the
stream. Take your time — there's no step you can't undo.

**Total time:** ~30–45 minutes.
**Total cost:** ~€4/month (server) + ~€10/year (domain). Nothing else.

---

## What you're actually building (plain English)

Think of it as three things:

1. A little **website** where fans go to send a crypto tip.
2. A **pop-up** that appears on the stream when a tip arrives (like other tip
   alerts you've seen).
3. A **goal bar** on the stream that fills up as tips come in.

For that website to be online 24/7, it needs to live on a computer that's
always on — that rented computer is called a **server** (or "VPS"). We rent a
cheap one, put the code on it, and point a web address at it.

You'll copy-paste commands. **You do not need to understand them.** Just paste
exactly what's shown.

---

## Before you start: the 3 things you need

- [ ] **Her two wallet addresses** (see Part 1 — takes 2 minutes)
- [ ] **A credit card or PayPal** (to rent the server + buy the web address)
- [ ] **About 40 minutes**

> 💡 A quick note on words:
> - **Terminal / command line** = a black window where you type commands.
> - **SSH** = the way you connect from your computer to the rented server.
> - **Domain** = a web address like `tips.hername.com`.
> - **`.env` file** = a small settings file where you put her addresses + passwords.

---

## Part 1 — Get her wallet addresses (2 min)

Tips go **straight into her crypto wallet**. The app only needs her **public
receiving addresses** — the equivalent of an IBAN you'd put on an invoice.

> 🚨 **THE ONE RULE THAT MATTERS:** You need the **receiving address** (also
> called "public address" or "wallet address"). You must **NEVER** type her
> **secret recovery phrase / seed phrase / private key** into this app, this
> guide, or anywhere online. Anyone with the seed phrase can steal all her
> money. Tipfall never asks for it and never needs it.

If she doesn't have a wallet yet, the two easiest:

- **Ethereum (for ETH + USDC):** [MetaMask](https://metamask.io) (browser
  extension / phone app).
- **Solana (for SOL + USDC):** [Phantom](https://phantom.app) (browser
  extension / phone app).

**To copy the receiving address:**

- **MetaMask:** open it → her account name/address is at the top → click it to
  **copy**. It starts with `0x…` and is 42 characters long.
- **Phantom:** open it → click the account name at the top → **Copy address**.
  It's a long string of letters and numbers (no `0x`).

Paste both somewhere safe for now (a notes file). You'll need them in Part 6.

> You only need ONE Ethereum address (it receives both ETH and USDC) and ONE
> Solana address (it receives both SOL and USDC). Four currencies, two
> addresses.

---

## Part 2 — Buy a domain (5 min)

You need a web address. A bare server has only a number for an address, and
web browsers + crypto wallets require a real `https://` name.

1. Go to a domain seller — [Porkbun](https://porkbun.com) and
   [Namecheap](https://www.namecheap.com) are cheap and easy.
2. Search for a name you like (e.g. `hername.com`, `hernametips.com`). ~€10/yr.
3. Buy it. Create the account, pay. Done for now — we come back to it in Part 7.

> You don't need email hosting, "web hosting", privacy add-ons, or anything
> they upsell. Just the domain.

---

## Part 3 — Rent the server (5 min)

We'll use **Hetzner**, which is cheap and has servers **in Germany**.

1. Go to <https://www.hetzner.com/cloud> and **Sign Up**. Verify your email.
   (First-time signups sometimes need a quick ID/card verification — normal.)
2. Once logged in to the **Cloud Console**, click **+ New Project**, name it
   `tipfall`, open it.
3. Click **Add Server**. Choose:
   - **Location:** Nuremberg or Falkenstein (Germany).
   - **Image:** **Ubuntu** (the newest version, e.g. 24.04).
   - **Type:** the **CX22** (2 vCPU, 4 GB RAM) — about €4.50/month. Plenty.
   - **Networking:** leave IPv4 + IPv6 checked.
   - **SSH keys:** skip for now — scroll down and set a **root password**
     instead (easier for a first-timer). Write it down.
   - **Name:** `tipfall-server`.
4. Click **Create & Buy Now**.

After ~20 seconds you'll see your server with a **public IP address** like
`203.0.113.45`. **Copy that IP** — you need it next.

---

## Part 4 — Connect to the server (5 min)

You'll open a terminal on your own computer and log into the server.

### On Windows

1. Press the **Start** button, type `PowerShell`, open **Windows PowerShell**.
2. Type this (replace `YOUR_SERVER_IP` with the IP from Part 3):

   ```
   ssh root@YOUR_SERVER_IP
   ```

3. It'll say *"Are you sure you want to continue connecting?"* → type `yes`,
   Enter.
4. It asks for the password → type the root password from Part 3 (the screen
   won't show anything as you type — that's normal), Enter.

### On Mac

1. Open **Terminal** (Cmd+Space, type "Terminal", Enter).
2. Same command:

   ```
   ssh root@YOUR_SERVER_IP
   ```

3. Type `yes` if asked, then the root password (nothing shows while typing).

✅ When you see something like `root@tipfall-server:~#`, **you're in.** Every
command from here on is typed into this window.

---

## Part 5 — Install Docker (2 min)

Docker is the tool that runs the app. Paste this one line and press Enter:

```bash
curl -fsSL https://get.docker.com | sh
```

Wait ~1 minute until it finishes and you get the prompt back. Then make sure
it starts automatically after any reboot:

```bash
sudo systemctl enable docker
```

---

## Part 6 — Download the app & enter the settings (8 min)

**1. Download the code** (paste, Enter):

```bash
git clone https://github.com/Hyper-Claw/wolt-ageny.git
cd wolt-ageny
```

**2. Create the settings file:**

```bash
cp .env.example .env
```

**3. Generate two secret passwords** the app needs. Run this twice and copy
each result somewhere:

```bash
openssl rand -hex 16
```

You'll get two random strings like `9f2c1a...`. Call one the **OVERLAY key**
and the other the **ADMIN key**.

**4. Open the settings file to edit it:**

```bash
nano .env
```

This opens a simple text editor **inside the terminal**. Use arrow keys to
move (the mouse won't work here). Fill in these lines — replace the parts after
the `=`:

```
DOMAIN=tips.hername.com            ← the domain you bought, with "tips." in front
ETH_ADDRESS=0x....                 ← her Ethereum address from Part 1
SOL_ADDRESS=....                   ← her Solana address from Part 1
OVERLAY_KEY=paste-first-random-string
ADMIN_KEY=paste-second-random-string
```

Optional, if you want a goal bar from day one:

```
GOAL_EUR=500
GOAL_TITLE=New Streaming PC
STREAMER_NAME=HerName
```

Leave every other line as it is.

**5. Save and exit nano:** press **Ctrl + O** (letter O), then **Enter** to
save, then **Ctrl + X** to exit.

> 🚨 Reminder: `ETH_ADDRESS` and `SOL_ADDRESS` are the **public receiving
> addresses** only. Never put a seed phrase / private key here.

---

## Part 7 — Point the domain at the server (5 min + waiting)

Now connect the web address to your server's IP.

1. Log in to where you bought the domain (Porkbun/Namecheap).
2. Find **DNS settings** (sometimes "DNS records", "Advanced DNS", or "Manage").
3. Add a new record:
   - **Type:** `A`
   - **Host / Name:** `tips`
   - **Value / Answer / Points to:** your server IP (from Part 3)
   - **TTL:** leave default
4. Save.

This makes `tips.hername.com` point to your server. It usually works within a
few minutes but can take up to an hour to spread across the internet.

> Make sure the `tips.` part here **matches** the `DOMAIN=tips.hername.com`
> line in your `.env`.

---

## Part 8 — Launch! (2 min)

Back in the terminal (still connected to the server, in the `wolt-ageny`
folder), paste:

```bash
docker compose up -d --build
```

The first time takes 1–3 minutes (it's building everything). When it finishes
and you get the prompt back, it's running.

**Check it worked:** open a web browser on your normal computer and go to
`https://tips.hername.com` (your domain). You should see the purple donation
page. 🎉

> The secure `https://` padlock is set up **automatically** — it can take an
> extra minute or two the very first time. If you get a security warning
> immediately after launching, wait 2 minutes and refresh.

---

## Part 9 — Put it on the stream (OBS) (5 min)

The app gives you two "browser source" links for OBS. They are:

- **Alerts:** `https://tips.hername.com/overlay?key=YOUR_OVERLAY_KEY`
- **Goal bar:** `https://tips.hername.com/goal?key=YOUR_OVERLAY_KEY`

(Use the **OVERLAY key** from Part 6, not the admin one.)

**In OBS, for each link:**

1. Under **Sources**, click **+** → **Browser**.
2. Name it "Tip Alerts" (or "Goal Bar") → **OK**.
3. In **URL**, paste the link.
4. Set a size — Alerts: Width `900`, Height `360`. Goal bar: Width `440`,
   Height `340`.
5. **OK.** Drag it where you want it on the scene.

**Test it:** open `https://tips.hername.com/customize`, paste your ADMIN key
and OVERLAY key at the top, and click **Send test alert**. A pop-up should
appear on your OBS scene. 🎉

---

## Part 10 — Link it on Twitch (2 min)

So fans can find the donation page:

1. On Twitch, go to her channel page → **About / Panels** → **Edit Panels**.
2. Add a panel, give it a title like "💜 Donate", and set the link to
   `https://tips.hername.com`.
3. (Optional) put the same link in her chat commands / stream description.

---

## Part 11 — Customize the look (anytime)

Open `https://tips.hername.com/customize` (paste both keys at the top). No
tech needed here — you can:

- Pick the **alert sound** (chime / coin / fanfare / silent) and preview it.
- Set the **goal** title and amount.
- Add **tiers** — e.g. "tips over €50 get a gold border and a party GIF".

Click **Save**. The stream overlays update within a minute — no restart.

Want to change actual colors/text of the pages? That's editing files — see the
"Changing the look" section in `DEPLOY.md`. If you set up auto-deploy (below),
you can even edit them on github.com and they go live by themselves.

---

## Part 12 — Hands-off updates (optional but recommended)

So you never have to log into the server again, set up **auto-deploy**: after
a one-time setup, any change goes live automatically. The step-by-step is in
**`DEPLOY.md` → "Automatic deploys"**. It's a bit more technical, so it's fine
to skip until you're comfortable.

---

## 🆘 Troubleshooting

**"The page won't load / can't be reached."**
- Wait a few more minutes — DNS (Part 7) and the security certificate (Part 8)
  both need a little time on first setup.
- Check the domain's A record IP matches the server IP exactly.
- On the server, run `docker compose ps` — both `app` and `caddy` should say
  "running". If not, run `docker compose logs` to see the error (or paste it to
  me).

**"Security warning / not secure."**
- First-time certificate setup can take 1–2 minutes. Wait and refresh. Make
  sure you're visiting `https://` + the exact domain in your `.env`.

**"I lost the connection to the server."**
- Just run `ssh root@YOUR_SERVER_IP` again and log in. Then `cd wolt-ageny` to
  get back to the folder.

**"A tip didn't show up."**
- Crypto needs a few confirmations; alerts appear within seconds-to-a-minute
  after the network confirms. The fan must send the **exact amount** shown on
  the payment screen (that's how it matches their name).

**"I need to change a setting in `.env`."**
- `cd wolt-ageny`, `nano .env`, edit, save (Ctrl+O, Enter, Ctrl+X), then
  `docker compose up -d` to apply.

**Everything broke and I want to restart it:**
```bash
cd wolt-ageny
docker compose restart
```

---

## 💰 What it costs

| Thing | Cost |
|-------|------|
| Server (Hetzner CX22) | ~€4.50 / month |
| Domain name | ~€10 / year |
| The software | free |
| Fees on tips | just the network fee the sender pays; **you keep ~100%** |

Compare that to StreamElements/PayPal taking a cut and the ban risk — this
pays for itself fast.

---

## 🔒 Safety recap

- ✅ Tips go **directly to her wallet**. This server never holds her money.
- ✅ Only her **public addresses** go in `.env`.
- 🚫 Never share/enter her **seed phrase or private key** — not here, not
  anywhere. No legitimate tool ever asks for it.
- 🔑 Keep the OVERLAY and ADMIN keys private (they control the overlays).

You're done. Go get those tips. 💜
