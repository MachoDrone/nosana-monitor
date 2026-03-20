# Changelog — Nosana Monitor

## v0.01.8 — 2026-03-20
### Changed
- Health endpoint polling: 60s → 5s (catches 24-sec RESTARTING and short-lived states)
- Dashboard API polling: every poll → every 30 min (tier changes are rare, reduces load on shared API)
- OFFLINE threshold: 3 failures → 36 failures (3 min at 5s polling, prevents false alarms)
- Heartbeat now includes node info: version, ping, GPU, uptime, tier, state counts

## v0.01.7 — 2026-03-19
### Added
- Matrix dual-token system: sysop token (silent/right-aligned) + bot token (alert/left-aligned with push)
- Auto-login: `--matrix-user`, `--matrix-pass`, `--matrix-bot-user`, `--matrix-bot-pass` — no manual token digging
- Auto-invite: sysop invites bot to room via API on startup
- Auto-join: bot accepts invite and joins room automatically
- `--matrix-server` flag for self-hosted homeservers (default: matrix.org)

### Changed
- Removed `--matrix-token` and `--matrix-bot-token` flags — replaced by user/pass auto-login
- Matrix always requires both accounts (sysop + bot), no single-token option

## v0.01.6 — 2026-03-19
### Added
- Dual Matrix token routing: silent tier (sysop) and alert tier (bot)
- `send_notify` now accepts 5th arg for Matrix tier ("silent" or "alert")

## v0.01.5 — 2026-03-19
### Added
- Matrix notification support: `--matrix-token`, `--matrix-room`, `--matrix-server`
- Unified `send_notify` function replaces 7 inline curl calls
- `matrix_send` helper with jq-based JSON payload construction
- Emoji mapping from ntfy tags to Matrix messages
- Two-line Matrix format: emoji + title, then body

## v0.01.4 — 2026-03-19
### Added
- `--log` flag: writes all outbound notifications to a log file for debugging

## v0.01.3 — 2026-03-19
### Fixed
- **Primary crash loop**: `HEALTH_RESPONSE=$(curl -sf ...)` was unguarded — when the node's health endpoint was unreachable, `set -e` killed the script, Docker restarted it, and STARTED heartbeat fired again (spam loop)
- **Secondary crash path**: `STATUS_HTTP=$(curl -s ...)` for dashboard API had the same issue
- Both command substitutions now have `|| true` guards

## v0.01.2 — 2026-03-19
### Fixed
- Added `|| true` guards to all 7 ntfy `curl -sf` calls to prevent crash on ntfy failures (429 rate limit, network errors)

## v0.01.1 — 2026-03-19
### Added
- State change detection with ntfy alerts
- Stuck-in-RESTARTING detection (10-minute threshold)
- Dashboard status/tier monitoring (PREMIUM/ONBOARDED/COMMUNITY)
- Hourly heartbeat with state count summary

## v0.01.0 — 2026-03-19
### Added
- Initial monitor: health endpoint polling, OFFLINE/ONLINE alerts
- Configurable flags: `--key-path`, `--ntfy-topic`, `--poll-interval`, `--fail-threshold`
- Auto-derived ntfy topic from public key
- Docker containerized deployment
