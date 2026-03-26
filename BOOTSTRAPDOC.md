<!-- BOOTSTRAPDOC.md — Discord-formatted preview for Nosana Fleet Monitor bootstrap -->
<!-- FORMAT: Each section between --- separators is ONE Discord message. -->
<!-- Keep every section under 1800 characters (Discord limit is 2000). -->
<!-- Copy-paste each section as a separate message in your Discord channel. -->

**:satellite: Welcome to the Nosana Fleet Monitor**

A self-hosted monitoring system for Nosana GPU fleets — gives you a live dashboard and push notifications so you always know what your nodes are doing.

**What it does:**
- Real-time dashboard for your entire Nosana GPU fleet
- Web Push notifications (phone + desktop) when nodes go down or recover
- Blockchain state tracking — RUNNING, QUEUED, queue position
- SOL/NOS balances, GPU info, uptime
- Sortable columns, color-blind friendly status indicators

**What it costs:**
Nothing. Runs on Cloudflare Workers free tier. No server needed. No monthly fees.

**How long to set up:**
About 10 minutes from start to monitoring.

---

**:clipboard: What You'll Need Before Starting**

Make sure you have these ready before running the bootstrap:

**1. A Cloudflare account (free)**
> Sign up at <https://dash.cloudflare.com/sign-up>
> If you already have one, you're good — skip to step 2.

**2. Node.js 18+ and npm**
> Installed on the machine where you'll run the bootstrap script.
> Check with: `node --version`

**3. Git**
> Check with: `git --version`

**4. Docker on each Nosana host**
> The monitor runs as a container on each GPU node.
> Check with: `docker --version`

**5. Nosana keypair on each host**
> Located at `~/.nosana/nosana_key.json`
> This is the standard Nosana key location. The monitor reads it to identify your node on-chain.

That's the full list. The bootstrap handles everything else automatically.

---

**:hammer: Create Your Cloudflare Account**

If you don't have a Cloudflare account yet:

1. Go to <https://dash.cloudflare.com/sign-up>
2. Enter your email and a password
3. Check your inbox and verify your email
4. Done

> **Important:** You do **not** need to add a domain, set up DNS, or enter payment info. The free tier is all we need.

The bootstrap script handles creating your Worker, KV storage, and encryption keys. You just need the account to exist.

---

**:rocket: Run the Bootstrap**

On the machine where you have Node.js installed, run this one-liner:

```bash
bash <(curl -sL https://raw.githubusercontent.com/MachoDrone/nosana-monitor/main/bootstrap.sh)
```

**What happens when you run it:**

1. Checks your system for Node.js, npm, Docker, and git
2. Downloads the monitor source code
3. Opens your browser to log into Cloudflare
4. Creates KV storage and the Worker automatically
5. Generates VAPID encryption keys for push notifications
6. Deploys your dashboard to Cloudflare
7. Saves everything to a log file on your machine

The whole process takes about 5 minutes. Most of it is automatic — you only answer three prompts.

---

**:keyboard: What the Script Asks You**

The bootstrap asks exactly three things:

**1. Cloudflare login**
> Your browser opens to Cloudflare's OAuth page. Click **Allow** to authorize the Wrangler CLI. This is Cloudflare's official tool — your password is never seen by the script.

**2. Worker name**
> A name for your dashboard deployment (default: `nosana-fleet`). This becomes part of your URL. Letters, numbers, and dashes only.

**3. Fleet token**
> A unique identifier for your fleet, like `my-fleet` or `gpu-squad`. This keeps your fleet's data separate. Pick something memorable.

That's it. Everything else — KV namespaces, VAPID keys, secrets, deployment — is fully automatic.

---

**:white_check_mark: What You Get When It's Done**

After the bootstrap completes, you have:

**A live dashboard**
```
https://your-worker.workers.dev/d/your-token
```
Open this URL in any browser — desktop or phone.

**A log file at `~/nosana-fleet-bootstrap.log`** containing:
- Your Cloudflare account ID
- Your Worker name and URL
- Your fleet token
- VAPID keys (for push notifications)
- The exact command to start monitoring on each host

> **Keep this log file safe.** It contains your keys and configuration. Don't share it publicly.

**Web Push notifications**
Open the dashboard on any device and click **Enable Push Alerts**. You'll get instant notifications when a node goes down or comes back up — even if the browser is closed.

---

**:computer: Start Monitoring Your Hosts**

Run this on **each** Nosana GPU host you want to monitor:

```bash
bash <(wget -qO- "https://raw.githubusercontent.com/MachoDrone/nosana-monitor/main/nosana-monitor/nosana-monitor.sh") \
  --dashboard-url "YOUR_DASHBOARD_URL"
```

Replace `YOUR_DASHBOARD_URL` with the full URL from your bootstrap log.

**How it works:**
- Auto-detects your node's public key from `~/.nosana/nosana_key.json`
- Runs as a Docker container with auto-restart
- Sends heartbeats every 10 minutes
- Pushes immediately on state changes (RUNNING, QUEUED, offline)

**Useful commands:**
```
docker logs -f nosana-monitor     # live logs
docker restart nosana-monitor     # restart
docker rm -f nosana-monitor       # stop and remove
```

---

**:gear: Optional Extras**

These are not required but available if you want them:

**Custom hostname**
Add `--host-name "my-gpu-01"` to the monitor command to give each host a friendly label on the dashboard instead of a truncated public key.

**Auto-updates**
The monitor can auto-rebuild when updates are pushed:
```bash
systemctl start nosana-auto-update
```

**Matrix notifications**
For Slack-like alerts in a Matrix room, add your Matrix credentials:
```
--matrix-user "user" --matrix-pass "pass"
--matrix-bot-user "bot" --matrix-bot-pass "pass"
--matrix-room "!roomid:matrix.org"
```

Full flag reference is in the GitHub repo README.

---

**:question: Support**

**GitHub:** <https://github.com/MachoDrone/nosana-monitor>

Have a question or found a bug? Open an issue on GitHub or ask in this Discord channel.

The dashboard and monitor are fully open source — contributions and feedback are welcome.
