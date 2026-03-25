# TODO — Nosana Monitor

## Next Up — Critical
- [ ] **State timestamp tooltip (option 3)**: Tap health/state dot to see "DOWN since 5:21 AM EDT" or "RUNNING since 2:15 AM EDT". Store state transition timestamp in dashboard push data.
- [ ] **Market column bug**: Full slug + 2-char compact text showing together. Compact toggle not hiding full text properly.
- [ ] Security: credentials visible in `docker inspect` args — consider env vars or mounted secrets file

## Next Up — Features
- [ ] **Bootstrap script**: Automate Cloudflare Worker setup for new operators
  - Creates KV namespaces (FLEET_DATA + PUSH_SUBS)
  - Deploys worker code
  - Generates and sets VAPID keys as secrets
  - Generates random dashboard token
  - Input: operator's Cloudflare API token
- [ ] Expand STUCK detection to cover STARTING, HEALTHCHECK, BENCHMARKING (not just RESTARTING)
- [ ] Alternative nosana-node log access: `docker exec podman tail -N /var/lib/containers/storage/overlay-containers/{ID}/userdata/ctr.log` (has timestamps, avoids podman logs hang)

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
- [x] v0.02.0 — Solana RPC RUNNING detection, queue position, Market column, purge, auto-deploy, kiosk/fast mode, CSS dots, breathing bar, rate limit protection
