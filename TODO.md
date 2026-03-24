# TODO — Nosana Monitor

## Next Up — Critical
- [ ] **Push-on-change + heartbeat**: Only push to Worker on state change or every 5 min. Cuts 86K req/day to ~5K.
- [ ] **Fix stagger collisions**: cksum % 20 gives same value for different pubkeys (nn02/nn04 both got 13). Use full pubkey hash for unique spread across STATUS_INTERVAL.
- [ ] **Rate limit scalability for large fleets (70-200 hosts)**: Current approach may not scale. Evaluate batching, jitter, and RPC call budget.
- [ ] **Controlled refresh**: Remove auto-refresh, disable pull-to-refresh, add manual refresh button with rate limit awareness.
- [ ] Security: credentials visible in `docker inspect` args — consider env vars or mounted secrets file

## Next Up — Features
- [ ] **Bootstrap script**: Automate Cloudflare Worker setup for new operators
  - Creates KV namespaces (FLEET_DATA + PUSH_SUBS)
  - Deploys worker code
  - Generates and sets VAPID keys as secrets
  - Generates random dashboard token
  - Input: operator's Cloudflare API token
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
- [x] v0.02.0 — Solana RPC RUNNING detection, queue position (getMultipleAccounts), Market column, purge button, auto-deploy, 5-host fleet deployment
