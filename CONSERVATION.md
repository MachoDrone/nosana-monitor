# Conservation — Rate Limit & Resource Optimization Plan

## Problem Statement
The Nosana Fleet Monitor must support 1–200 hosts on Cloudflare free tier AND Solana public RPC without hitting rate limits. Current architecture uses expensive `getProgramAccounts` calls that fail silently under load.

---

## Cloudflare Free Tier Limits (SOLVED)

| Resource | Limit | Current Usage (8 hosts) | Status |
|----------|-------|------------------------|--------|
| Worker Requests | 100,000/day | ~8,000 (8%) | OK — dynamic interval scales to 200 hosts |
| KV Reads | 100,000/day | ~2,200 (2.2%) | OK — cached in memory after first read |
| KV Writes | 1,000/day | ~721 (72%) | OK — version fetch fixed, throttle working |

**Dynamic interval formula:** `max(5, min(300, ceil(86400 * N / (85800 - 5*N) / 5) * 5))`

| Hosts | Interval | Requests/day | R% |
|-------|----------|-------------|------|
| 5 | 10s | 47,425 | 47% |
| 50 | 55s | 82,995 | 83% |
| 100 | 105s | 86,986 | 87% |
| 200 | 205s | 89,493 | 89% |

---

## Solana Public RPC Limits (ACTIVE PROBLEM)

### Rate Limits (api.mainnet-beta.solana.com)
- **100 requests / 10 seconds / IP** (combined all methods)
- **40 requests / 10 seconds / IP / method** (per-method)
- Limits are **per public IP**, not per host
- `getProgramAccounts` is the heaviest call — 10x cost on paid providers

### Silent Rate Limiting
When rate-limited, the public RPC sometimes returns **empty results instead of 429 errors**. Our monitor treats empty results as "no RunAccount = QUEUED", causing false state detection.

### Current RPC Call Inventory (per host)

| Call | Method | Frequency | Weight | Purpose |
|------|--------|-----------|--------|---------|
| RUNNING detection | `getProgramAccounts` | Every 120s | HEAVY | Scans Jobs program for RunAccounts matching host pubkey |
| Queue position | `getMultipleAccounts` | Every 120s (when QUEUED) | Medium | Batch-reads all market accounts for queue data |
| Authority lookup | `getProgramAccounts` | Every 30min | HEAVY | Finds host registration to get authority pubkey |
| Staked NOS | `getProgramAccounts` | Every 30min | HEAVY | Scans staking program for authority's stake |
| SOL balance | `getBalance` | Every 30min | Light | Host SOL balance |
| NOS balance | `getTokenAccountsByOwner` | Every 30min | Light-Medium | Host NOS token balance |
| Min stake | `getAccountInfo` | Every 30min | Light | Market's minimum stake requirement |
| Job timeout | `getAccountInfo` | Every 120s (when RUNNING) | Light | Job timeout value |
| Job start time | `getSignaturesForAddress` | Once per job | Light | Block time of RunAccount creation |
| Queue entry time | `getSignaturesForAddress` | Once per state change | Light | Block time of queue entry |

### Current Load by Fleet Size (per IP, every 120s cycle)

| Hosts | getProgramAccounts/cycle | Total calls/cycle | Calls/10s | Limit | Status |
|-------|------------------------|-------------------|-----------|-------|--------|
| 5 | 5 | ~8 | ~0.7 | 100 | OK |
| 8 | 8 | ~13 | ~1.1 | 100 | MARGINAL (rate limited today) |
| 25 | 25 | ~40 | ~3.3 | 100 | RISKY |
| 50 | 50 | ~80 | ~6.7 | 100 | OVER LIMIT |
| 100 | 100 | ~160 | ~13.3 | 100 | FAR OVER |
| 200 | 200 | ~320 | ~26.7 | 100 | IMPOSSIBLE |

**All hosts sharing one public IP (NAT) makes this worse.**

---

## On-Chain Account Structure (Key Findings)

### RunAccount (determines RUNNING state)
- dataSize: 113 bytes (NOT 120 — need to verify)
- offset 40: node pubkey (32 bytes)
- **Created with `Keypair.generate()` — address is RANDOM, cannot be derived as PDA**
- Only exists while a job is active — deleted on completion

### StakeAccount (determines Staked NOS)
- **IS a PDA**: `PDA(["stake", NOS_MINT, authority], STAKING_PROGRAM)`
- Can be fetched directly with `getAccountInfo` — no scanning needed

### NOS Token Account (determines NOS balance)
- ATA (Associated Token Account) is deterministic
- Can be derived and fetched with `getAccountInfo`

---

## Optimization Plan

### Phase 1: Eliminate Redundant Heavy Calls (IMMEDIATE)

1. **Cache authority address** — the host registration account and authority pubkey don't change. Query once on startup, cache forever. Eliminates 1 `getProgramAccounts` every 30min per host.

2. **Derive StakeAccount PDA** — `PDA(["stake", NOS_MINT, authority], STAKING_PROGRAM)`. Replace `getProgramAccounts` with `getAccountInfo`. Eliminates 1 heavy call every 30min per host.

3. **Derive NOS ATA address** — replace `getTokenAccountsByOwner` with `getAccountInfo` on the known ATA. Eliminates 1 medium call every 30min per host.

4. **Cache RunAccount address** — when RUNNING detection succeeds, cache the RunAccount address. Subsequent checks use `getAccountInfo` on the cached address. Fall back to `getProgramAccounts` only when cached address returns null (job ended, need new scan). Reduces 90%+ of heavy calls during RUNNING state.

### Phase 2: Batch Calls Across Hosts (MEDIUM TERM)

5. **Coordinator model** — for multi-host PCs (nn01 with 3 GPUs), one monitor queries for all hosts on that machine and distributes results. Uses `getMultipleAccounts` to batch.

6. **Worker-side RPC proxy** — the Cloudflare Worker makes the Solana RPC calls instead of each monitor independently. One call per fleet per cycle, results distributed to all monitors. Eliminates per-host RPC entirely.

### Phase 3: Event-Driven State Detection (LONG TERM)

7. **WebSocket subscription** — subscribe to account changes on the host's registration/RunAccount. State changes detected in real-time without polling. Zero RPC calls for state detection.

8. **Transaction log monitoring** — watch the Jobs program for transactions involving the host's pubkey. Detect state changes from the transaction stream.

---

## Revised Load After Phase 1 Optimizations

| Hosts | getProgramAccounts/cycle | getAccountInfo/cycle | Total calls/cycle | Calls/10s | Status |
|-------|------------------------|---------------------|-------------------|-----------|--------|
| 5 | 0-5 (only on job transitions) | ~10 | ~15 | ~1.3 | OK |
| 25 | 0-5 | ~50 | ~55 | ~4.6 | OK |
| 50 | 0-10 | ~100 | ~110 | ~9.2 | OK |
| 100 | 0-20 | ~200 | ~220 | ~18.3 | MARGINAL |
| 200 | 0-40 | ~400 | ~440 | ~36.7 | RISKY |

### With Phase 2 (getMultipleAccounts batching)

| Hosts | Batched calls/cycle | Calls/10s | Status |
|-------|--------------------|-----------| --------|
| 5 | 2-3 | ~0.3 | OK |
| 50 | 3-4 | ~0.3 | OK |
| 100 | 4-5 | ~0.4 | OK |
| 200 | 6-8 | ~0.7 | OK |

---

## Multi-Host IP Considerations

| Scenario | Hosts/IP | getProgramAccounts budget | Notes |
|----------|----------|--------------------------|-------|
| Home lab (NAT) | 1-8 | Shared — current pain point | All hosts behind one router |
| Data center (dedicated) | 1 per IP | Full budget per host | Each server has own IP |
| Data center (NAT) | 10-50 per IP | Shared — needs Phase 2 | VPN or shared gateway |
| Colo with multi-GPU | 3-8 per IP | Shared — needs Phase 1 | nn01 scenario |

**Key insight**: The rate limit problem scales with **hosts per IP**, not total fleet size. An operator with 200 hosts across 200 IPs has no problem. An operator with 8 hosts behind NAT (our setup) hits limits today.

---

## Implementation Priority

| # | Optimization | Effort | Impact | Dependencies |
|---|-------------|--------|--------|-------------|
| 1 | Cache RunAccount address, use getAccountInfo | Small | HIGH — eliminates ~90% of heavy calls | None |
| 2 | Derive StakeAccount PDA | Small | Medium — eliminates 1 heavy call/30min | Know authority (from #3) |
| 3 | Cache authority from registration account | Small | Medium — eliminates 1 heavy call/30min | None |
| 4 | Derive NOS ATA address | Small | Low — eliminates 1 medium call/30min | None |
| 5 | Detect silent rate limiting (empty result != no data) | Small | HIGH — prevents false QUEUED state | None |
| 6 | Worker-side RPC proxy with getMultipleAccounts | Large | HIGH at scale — solves 200-host problem | Phase 1 complete |
| 7 | WebSocket subscriptions | Large | Eliminates polling entirely | Requires WebSocket support |

---

## Open Questions

- [ ] Verify RunAccount dataSize is 113 bytes (SDK says so) vs 120 bytes (our filter uses 120)
- [ ] Test if `getMultipleAccounts` with 100 RunAccount addresses triggers rate limits
- [ ] Can the market queue data tell us if a host is RUNNING without scanning RunAccounts?
- [ ] Does the Nosana Jobs program emit logs we can parse for state changes?
- [ ] What RPC do most large operators use? Can we default to Helius free tier?
