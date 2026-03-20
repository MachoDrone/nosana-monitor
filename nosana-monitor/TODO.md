# TODO — nosana-monitor

## Enrich STUCK Alert with Diagnostic Data
**Priority:** Next
**Context:** v0.01.1 fires a one-time alert when a node is stuck in RESTARTING for 10+ minutes, but it only tells the operator to go check manually. Instead, include diagnostic data directly in the alert body.

### Items to include:
1. **SOL balance** — Query Solana RPC for the node wallet's SOL balance (e.g., "SOL: 0.002")
2. **Recent nosana-node log lines** — Grab last ~5 lines via `docker exec podman podman logs nosana-node --tail 5`
3. **NOS stake amount** — TBD, include if feasible

### Prerequisites:
- Mount Docker socket into the monitor container: `-v /var/run/docker.sock:/var/run/docker.sock` (approved)

### Files to modify:
- `monitor.sh` — Add data-gathering functions, enrich the STUCK alert message
- `nosana-monitor.sh` — Add Docker socket mount to the `docker run` command

## ntfy Scaling for 70-Host Fleet
**Priority:** Before multi-node deployment
**Context:** Free ntfy.sh tier allows 250 msgs/day per IP. At ~30 msgs/host/day, a single host is fine, but 70 hosts behind a shared NAT would blow through the limit instantly.

### Options:
1. **Self-host ntfy** — Open source, rate limits fully configurable or disabled. Best long-term option.
2. **ntfy Pro ($10/mo)** — 20,000 msgs/day, sufficient for 70 hosts.
3. **Ensure each host has its own public IP** — Free tier works if no NAT sharing.

### Notes:
- Rate limit hit returns HTTP 429, no Retry-After header
- Limits are per-IP, not per-topic
- iOS push relay still goes through ntfy.sh even when self-hosted (250/day limit applies)
- v0.01.2 guards curl calls with `|| true` so a 429 no longer crashes the monitor
