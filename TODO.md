# TODO — Nosana Monitor

## Next Up — Critical
- [ ] **Exhaustive learn.nosana.com crawl**: Crawl every page for /hosts/ routes, host manager, all 4 API clients
- [ ] **RUNNING state detection**: /api/jobs gets rate limited. Try Solana RPC (RunAccount) instead — no rate limit
- [ ] **API call frequency optimization**: Current 10 calls/hr/host hits rate limit at scale
  - Move /api/jobs check to 30-min with specs, or replace with Solana RPC
  - Move /api/stats/nodes-country to once/hour or once/day
  - Rewards check to once/day at 00:15 UTC
  - Hardware fields (RAM, disk, GPU, CPU) to once/day

## Next Up — Features
- [ ] **Bootstrap script**: Automate Cloudflare Worker setup for new operators
  - Creates KV namespaces (FLEET_DATA + PUSH_SUBS)
  - Deploys worker code
  - Generates and sets VAPID keys as secrets
  - Generates random dashboard token
  - Input: operator's Cloudflare API token
- [ ] **Dashboard UI fixes**:
  - Sort arrow at bottom of rotated headers
  - Placeholder hosts (nn01, nn02) break some column sorts — clean up stale KV data
  - DL/UL fields: switch to avgDownload10/avgUpload10 from specs (done in code, needs testing)
  - Ping: switch to avgPing10 from specs (done in code, needs testing)
- [ ] **Restart monitor on nn03**: No monitors running on any host currently
- [ ] Security: credentials visible in `docker inspect` args — consider env vars or mounted secrets file
- [ ] Expand STUCK detection to cover STARTING, HEALTHCHECK, BENCHMARKING (not just RESTARTING)

## Removed (ntfy/Matrix being replaced by Cloudflare Worker)
- ~~Message retry queue~~
- ~~Compact single-line messages~~
- ~~ntfy self-hosting~~

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
