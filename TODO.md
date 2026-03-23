# TODO — Nosana Monitor

## Next Up
- [ ] **Bootstrap script**: Automate Cloudflare Worker setup for new operators
  - Creates KV namespaces (FLEET_DATA + PUSH_SUBS)
  - Deploys worker code
  - Generates and sets VAPID keys as secrets
  - Generates random dashboard token
  - Prints ready-to-use dashboard URL
  - Input: operator's Cloudflare API token
- [ ] **Monitor integration**: Add dashboard push to monitor.sh
  - Push host status to Cloudflare Worker via curl
  - 10-minute heartbeat interval, immediate push on state change
  - New env var: DASHBOARD_URL
  - Stale threshold: 30 minutes (3 missed heartbeats = offline)
- [ ] Message retry queue: on 429 rate limit, queue failed messages and retry in order
  - Applies to both ntfy and Matrix sends
  - Queue must preserve message order per destination
  - On 429: read `retry_after_ms` (Matrix) or `Retry-After` (ntfy), sleep, retry once
  - Drop after second failure (don't block the monitor loop)
  - If multiple messages queued, combine same-priority messages into one before retry
  - Never queue/combine critical alerts (OFFLINE, STUCK) — always send immediately
  - Respect char limits: ntfy 4,096 body / Matrix 65,536 body
- [ ] Compact single-line messages: keep all alert text on one line where supported
  - Check ntfy and Matrix/Element rendering behavior
  - Avoids multi-line clutter in notification shade on mobile
- [ ] ntfy self-hosting option: document or support self-hosted ntfy for unlimited msgs
  - ntfy.sh free tier: ~250 msgs/day, burst limits apply
- [ ] Security: credentials visible in `docker inspect` args — consider env vars or mounted secrets file
- [ ] Expand STUCK detection to cover STARTING, HEALTHCHECK, BENCHMARKING (not just RESTARTING)

## Completed
- [x] v0.01.0 — Initial monitor with health checks, ntfy alerts
- [x] v0.01.1 — State tracking, stuck detection, status tier monitoring
- [x] v0.01.2 — Guard ntfy curl calls with `|| true` to prevent crash on send failure
- [x] v0.01.3 — Guard health/status curl command substitutions to fix crash loop
- [x] v0.01.4 — `--log` flag: logs all outbound notifications to file
- [x] v0.01.5 — Matrix notifications: unified `send_notify` function, ntfy + Matrix in parallel
- [x] v0.01.6 — Dual Matrix tokens: sysop (silent) + bot (alert with push notifications)
- [x] v0.01.7 — Auto-login via `--matrix-user`/`--matrix-bot-user` + auto-invite + auto-join
- [x] v0.01.8 — Split polling: health 5s / dashboard 30min, OFFLINE threshold 36 failures, node info in heartbeats
- [x] v0.01.9 — Cloudflare Worker dashboard with Web Push notifications, 3 alert levels, in-page audio, PWA support
