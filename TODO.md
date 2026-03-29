# TODO — Nosana Monitor

## Next Up — Critical
- [ ] **KV write limit — BLOCKER**: Free tier allows 1,000 KV writes/day. 8 monitors on new account (md5@vanasdale.com) exhausted limit by late morning 2026-03-27. Root cause: per-isolate pendingData flush — each Cloudflare isolate independently writes to KV every 2 minutes, multiplying actual writes far beyond the intended 720/day. Must solve before any fleet can run on free tier. Options: (a) consolidate writes via Durable Objects, (b) upgrade to $5/mo paid plan (1M writes), (c) reduce write frequency drastically
- [ ] **Bootstrap script**: Automate full setup for new operators (Cloudflare Worker + KV + VAPID + monitor deploy)
- [ ] **Python rewrite**: Monitor shell→Python for CPU reduction (32% spikes → <1%) and PDA derivation support
- [ ] Security: remove key file mount, derive pubkey via docker exec instead

## Next Up — Features
- [ ] Expand STUCK detection to cover STARTING, HEALTHCHECK, BENCHMARKING (not just RESTARTING)
- [ ] Nosana backend API: Total Jobs, Availability %, Anti-spoof % (not available via public API yet)
- [ ] Disk column accuracy: nosana-node reports incorrect disk_gb from benchmark container (overlayfs issue)
- [ ] Auto-detect all podman containers on host (eliminate --podman-container flag)
- [ ] Auto-detect hostname from Docker API (eliminate --host-name flag for single-node PCs)

## Known Issues
- [ ] **Cross-isolate KV write multiplication** — per-isolate pendingData flush causes N isolates × 720 writes/day instead of 720. Hit 1,000 limit on BOTH accounts (account 2 on 2026-03-26, account 3 on 2026-03-27). This is the same root cause as stale data — isolates don't share memory
- [ ] nn02/nn03 simultaneous reboot (2026-03-26 09:45) — Nosana node update via privileged container reboot syscall
- [ ] Stale job data lingers on dashboard — worker accumulates KV fields but never clears runningJob/jobStart when monitor reports non-RUNNING state

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
- [x] v0.02.0 — Solana RPC detection, blockchain timestamps, queue position, Market column, kiosk/fast mode, rate limit protection, push notifications aligned with dashboard, auto-deploy, 5-host fleet, CSS indicators, breathing bar, purge, column reorder
- [x] v0.02.1 — Fix default sort arrow and reset to target PC column; eliminate double-click-to-sort bug
- [x] v0.06.2 — SOL/NOS/Staked columns, Latest Job, CPU/NVIDIA/CUDA/System columns, animations (bolt1/ring3/queue dots/cardiac pulse/duration sweep), KV throttle architecture, persistent sort, version tracking, transition state, auto-update fix
- [x] v0.07.x — Multi-GPU support (--podman-container), GPU ID from nvidia-smi, IP column (ext/int auto-detected), edit mode checkboxes, data keyed by nodeAddress, dynamic interval, leader election, focus-based refresh, KV optimization (eliminated 719 writes/day)
- [x] v0.08.0 — Conservation Phase 1+2: cached RunAccount (getAccountInfo), cached authority, silent rate limit detection, worker-side RPC proxy (getMultipleAccounts batch), rpcStateCache in memory
