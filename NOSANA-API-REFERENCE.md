# Nosana API Reference — Complete Field Inventory
# Last updated: 2026-03-24
# Source: Exhaustive research via 8 parallel agents probing APIs, Solana RPC, GitHub, SDK docs

---

## 1. Node Self-Report API (public, no auth)

**Base URL:** `https://{NODE_PUBKEY}.node.k8s.prd.nos.ci`

### GET /
Returns node address string (liveness check)

### GET /node/info
| Field | Type | Example |
|-------|------|---------|
| node | string | pubkey |
| uptime | string | 2026-03-12T17:00:03.164Z |
| state | string | OTHER, RUNNING, QUEUED |
| info.version | string | 1.1.9-rc |
| info.country | string | US |
| info.protocol | string | socket |
| info.system_environment | string | 6.14.0-37-generic |
| info.network.ping_ms | int | 20 |
| info.network.download_mbps | int | 770 |
| info.network.upload_mbps | int | 37 |
| info.cpu.model | string | AMD Ryzen 9 5900X 12-Core Processor |
| info.cpu.logical_cores | int | 24 |
| info.cpu.physical_cores | int | 12 |
| info.disk_gb | int | 599 |
| info.ram_mb | int | 64226 |
| info.gpus.devices[].index | int | 0 |
| info.gpus.devices[].name | string | NVIDIA GeForce RTX 4090 |
| info.gpus.devices[].uuid | string | GPU-9046e9e9-a168-f14a-617f-5cc97de04235 |
| info.gpus.devices[].memory.total_mb | float | 24082.88 |
| info.gpus.devices[].network_architecture.major | int | 8 |
| info.gpus.devices[].network_architecture.minor | int | 9 |
| info.gpus.runtime_version | int | 12 |
| info.gpus.cuda_driver_version | float | 13.1 |
| info.gpus.nvml_driver_version | string | 590.48.01 |

### Authenticated Node Endpoints (job owner signature required)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /job/:id/info | GET | Job metadata |
| /job/:id/results | GET | Job results |
| /job/:id/job-definition | GET | Job spec |
| /job/:id/ops | GET | All operation statuses |
| /job/:id/ops/:opId | GET | Single operation status |
| /job/:id/group/current | GET | Current execution group |
| /job/:id/group/:group | GET | Specific group status |
| /job/:id/endpoints | GET | Service URLs (ONLINE/OFFLINE) |
| /job/:id/stop | POST | Stop job |
| /job/:id/job-definition | POST | Submit job definition |
| /job/:id/group/:group/move | POST | Reposition group |
| /job/:id/group/:group/restart | POST | Restart group |
| /job/:id/group/:group/operation/:opId/restart | POST | Restart operation |
| /job/:id/group/:group/stop | POST | Stop group |
| /job/:id/group/:group/operation/:opId/stop | POST | Stop operation |
| /node/validate | POST | Backend validates node |

### Node WebSocket Endpoints
| Path | Auth | Purpose |
|------|------|---------|
| /log | job owner sig | Real-time job logs |
| /flog | backend | Task manager logs |
| /status | node/owner sig | Real-time status stream |

---

## 2. Dashboard Backend API (public endpoints, no auth)

**Base URL:** `https://dashboard.k8s.prd.nos.ci/api`
**Alt URL:** `https://dashboard.k8s.prd.nosana.com/api`
**Swagger:** `https://dashboard.k8s.prd.nos.ci/api/swagger`
**OpenAPI spec:** `https://dashboard.k8s.prd.nos.ci/api/swagger/json`

### GET /api/nodes/{pubkey}/specs
| Field | Type | Example |
|-------|------|---------|
| outOfSync | null/bool | null |
| jobAddress | null/string | null (or job pubkey when running) |
| nodeAddress | string | pubkey |
| marketAddress | string | market pubkey |
| ram | int | 64226 (MB) |
| diskSpace | int | 599 (GB) |
| cpu | string | AMD Ryzen 9 5900X 12-Core Processor |
| country | string | US |
| ip | string | 107.9.195.142 |
| bandwidth.ping | int | 0 |
| bandwidth.upload | int | 0 |
| bandwidth.download | int | 0 |
| status | string | PREMIUM, COMMUNITY, OTHER |
| accessKeyMint | string | SFT address |
| createdAt | string | 2024-12-07T13:30:21.329Z |
| region | string | NORTH AMERICA |
| gpus[].nodeAddress | string | pubkey |
| gpus[].gpu | string | NVIDIA GeForce RTX 4090 |
| gpus[].uuid | string | GPU-9046e9e9... |
| gpus[].deviceId | int | 0 |
| gpus[].vramMb | float | 24082.88 |
| gpus[].majorArchitecture | int | 8 |
| gpus[].minorArchitecture | int | 9 |
| avgDownload10 | int | 704 |
| avgUpload10 | float | 34.8 |
| avgPing10 | float | 21.8 |
| logicalCores | int | 24 |
| physicalCores | int | 12 |
| nodeVersion | string | 1.1.9-rc |
| systemEnvironment | string | 6.14.0-37-generic |
| memoryGPU | float | 24082.88 |
| majorVersionGPU | int | 8 |
| minorVersionGPU | int | 9 |
| cudaRuntimeVersion | int | 12 |
| cudaVersion | float | 13.1 |
| nvmlVersion | string | 590.48.01 |
| claimableUptimeNosRewards | float | 134.765923 |
| claimableUptimeUsdRewards | int | 26 |
| totalClaimedUptimeUsdRewards | int | 0 |
| totalClaimedUptimeNosRewards | int | 0 |

### GET /api/stake/{pubkey} (UNDOCUMENTED)
| Field | Type | Example |
|-------|------|---------|
| address | string | pubkey |
| amount | int | 0 (NOS staked) |
| duration | int | 1209600 (seconds, min=14d) |
| timeUnstake | int | 0 |
| xnos | int | 0 |
| createdAt | string | ISO datetime |
| updatedAt | string | ISO datetime |

### GET /api/benchmarks/node-report?node={pubkey}
| Field | Type | Example |
|-------|------|---------|
| node | string | pubkey |
| status | string | PREMIUM |
| current_market | string | market address |
| uptimePercentage | float | 98.65 (= Availability %) |
| antiSpoofSuccessRate | int | 100 (= Anti-spoof %) |
| uptimeTestCount | int | 74 |
| antiSpoofTestCount | int | 71 |
| last_performed_job | int | unix timestamp |
| reports[].marketAddress | string | market address |
| reports[].requiredBandwidth | int | 0 |
| reports[].recommendedBandwidth | int | 0 |
| reports[].relativeWattage | int | 0 |
| reports[].relativeTemperature | int | 0 |
| reports[].relativePerformance | int | 0 |
| reports[].averageDownloadSpeed | int | 705 |
| reports[].averageUploadSpeed | int | 34 |

### GET /api/benchmarks/node-template-performance/{pubkey}
| Field | Type | Example |
|-------|------|---------|
| nodeId | string | pubkey |
| currentMarket | string | market address |
| templates | array | [] |
| marketOptions | object | {} |

### GET /api/jobs?node={pubkey}&limit=N&offset=N&state=STATE&market=ADDR
Response wrapper: `{jobs: [...], totalJobs: int}`

Per-job fields:
| Field | Type | Example |
|-------|------|---------|
| id | int | 47675178 |
| address | string | Solana address |
| ipfsJob | string | IPFS CID |
| ipfsResult | string/null | IPFS CID or null |
| market | string | market address |
| node | string | node address |
| payer | string | payer address |
| price | int | 285 (raw NOS) |
| project | string | project address |
| state | int | 0=QUEUED, 1=RUNNING, 2=COMPLETED, 3=STOPPED |
| type | string | deployment-manager, cli |
| jobDefinition | object | full pipeline (see below) |
| jobResult | object/null | result data (see below) |
| jobStatus | string/null | "success" |
| timeEnd | int | unix timestamp (0 when running) |
| timeStart | int | unix timestamp |
| benchmarkProcessedAt | null | always null |
| timeout | int | 21600 (seconds = max duration) |
| usdRewardPerHour | float | 0.2896 |
| listedAt | int | unix timestamp |

### jobDefinition internals
| Field | Type |
|-------|------|
| version | string ("0.1") |
| type | string ("container") |
| global.env.* | object |
| global.variables.* | object |
| deployment_id | string |
| meta.trigger | string (deployment-manager, cli, dashboard) |
| meta.system_requirements.required_vram | int |
| ops[].type | string ("container/run") |
| ops[].id | string |
| ops[].args.image | string |
| ops[].args.cmd | array |
| ops[].args.gpu | bool |
| ops[].args.env.* | object |
| ops[].args.expose | int |
| ops[].args.resources | array |
| ops[].args.entrypoint | array |
| ops[].results.* | string (regex patterns) |

### jobResult internals (completed jobs only)
| Field | Type |
|-------|------|
| status | string ("success") |
| startTime | int (epoch ms) |
| endTime | int (epoch ms) |
| secrets | object |
| secrets.url | string (exposed URL) |
| secrets.exposedUrl | string (UUID) |
| opStates[].operationId | string |
| opStates[].group | string |
| opStates[].status | string |
| opStates[].startTime | int (epoch ms) |
| opStates[].endTime | int (epoch ms) |
| opStates[].exitCode | int |
| opStates[].providerId | string (container ID) |
| opStates[].errors | array |
| opStates[].results.* | object |
| opStates[].diagnostics.state.Pid | int |
| opStates[].diagnostics.state.Dead | bool |
| opStates[].diagnostics.state.Error | string |
| opStates[].diagnostics.state.Health.Status | string |
| opStates[].diagnostics.state.Health.FailingStreak | int |
| opStates[].diagnostics.state.Paused | bool |
| opStates[].diagnostics.state.Status | string |
| opStates[].diagnostics.state.Running | bool |
| opStates[].diagnostics.state.ExitCode | int |
| opStates[].diagnostics.state.OOMKilled | bool |
| opStates[].diagnostics.state.StartedAt | string (ISO) |
| opStates[].diagnostics.state.FinishedAt | string (ISO) |
| opStates[].diagnostics.state.Restarting | bool |
| opStates[].diagnostics.state.RestartCount | int |
| opStates[].diagnostics.reason.jobExpired | bool |
| opStates[].diagnostics.reason.jobStopped | bool |
| opStates[].diagnostics.reason.hostShutDown | bool |
| opStates[].diagnostics.reason.reason | string |

### GET /api/jobs/{address}
Same fields as single job above.

### GET /api/jobs/stats (supports ?node= and ?market= filters)
| Field | Type | Example |
|-------|------|---------|
| completed | int | 3542223 |
| duration | string | "12346915572" (total seconds) |
| price | string | "2460068.333099" (total NOS) |
| usdReward | string | "2217285.464934" (total USD) |
| retrieved | int | unix timestamp |

### GET /api/jobs/running
Returns `{marketAddr: {running: count}}` for all markets with running jobs.

### GET /api/jobs/stats/timestamps?period={1h,24h,7d,1M,3M,1Y,all}
Supports ?node= and ?market= filters.
| Field | Type |
|-------|------|
| total | int |
| data[].x | int (epoch ms) |
| data[].y | int (count) |

### GET /api/jobs/templates
| Field | Type |
|-------|------|
| id | string |
| name | string |
| jobDefinition | object/null |
| icon | string (URL) |
| readme | string (markdown) |
| category | string (pipe-separated) |
| variants | array/null |
| is_variant_template | bool |
| parent_template_id | string/null |
| vram_requirement | int/null |
| cuda_requirement | null |

### GET /api/jobs/templates/grouped
Same with variants inlined, each variant has: id, variant_id, name, jobDefinition.

### GET /api/markets/
Query params: type=PREMIUM/COMMUNITY/OTHER, filterKey, filterValue, limit
| Field | Type | Example |
|-------|------|---------|
| address | string | market address |
| slug | string | silent-ridge-4090 |
| name | string | silent-ridge NVIDIA 4090 |
| sft | string | SFT address |
| type | string | PREMIUM, COMMUNITY, OTHER |
| usd_reward_per_hour | float/null | 0.2909 |
| nos_reward_per_second | float | 0.000278 |
| nos_job_price_per_second | float | 0.0003058 |
| network_fee_percentage | int | 10 |
| premium_community_relation | string/null | paired market |
| gpu_types | array | ["NVIDIA GeForce RTX 4090"] |
| required_images | array | docker images |
| required_remote_resources | array | [{type, url}] |
| nodes | array | always empty in list |
| client | bool | true |
| max_usd_uptime_reward_per_day | int/float | 0 |
| lowest_vram | int | 8 (some markets only) |

### GET /api/markets/{id}/
Same fields as above.

### GET /api/markets/{id}/required-resources
| Field | Type |
|-------|------|
| required_images | array |
| required_remote_resources | array |

### GET /api/stats
| Field | Type | Example |
|-------|------|---------|
| date | string | 2026-03-24T00:05:02.423Z |
| usdValueStaked | string | "3992216" |
| nosStaked | string | "13493417" |
| totalXNosStaked | string | "30951840" |
| stakers | int | 13814 |
| price | float | 0.295864 (NOS price in USD) |
| marketCap | int | 29567769 |
| dailyVolume | int | 735531 |
| totalSupply | int | 99999734 |
| circulatingSupply | int | 99999734 |
| fullyDilutedMarketCap | int | 29567769 |
| dailyPriceChange | float | 14.25 (percent) |

### GET /api/stats/nodes-country
| Field | Type |
|-------|------|
| data[].queue | int |
| data[].total | int |
| data[].country | string |
| data[].offline | int |
| data[].running | int |

---

## 3. Dashboard Backend API (auth-required endpoints)

Require `Authorization: Bearer <token>` header.

### Node Management (UNDOCUMENTED)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/nodes | GET | List nodes (requires auth) |
| /api/nodes/{address} | GET | Full node status |
| /api/nodes/{address}/check-market | POST | Market recommendation |
| /api/nodes/heartbeat | POST | Node heartbeat (30s) |
| /api/nodes/change-market | POST | Change market |
| /api/nodes/sync-node | POST | Sync after mint/market change |
| /api/rpc | GET | RPC URL |
| /api/errors/report | POST | Error reporting |

### Credits
| Endpoint | Method | Response |
|----------|--------|----------|
| /api/credits/balance | GET | assignedCredits, reservedCredits, settledCredits |

### Jobs (auth)
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/jobs/list | POST | Create job (ipfsHash, market, timeout, node) |
| /api/jobs/{addr}/extend | POST | Extend job (seconds) |
| /api/jobs/{addr}/stop | POST | Stop job |

### Deployments (17 endpoints)
Full CRUD: create, start, stop, archive, delete, update-revision, update-replicas, update-schedule, update-timeout, list jobs/revisions/events/tasks, get header, get/post job-definition, post results.

Deployment statuses: DRAFT, ERROR, STARTING, RUNNING, STOPPING, STOPPED, INSUFFICIENT_FUNDS, ARCHIVED
Deployment strategies: SIMPLE, SIMPLE-EXTEND, SCHEDULED (cron), INFINITE (rotation_time)

### Vaults
| Endpoint | Method | Purpose |
|----------|--------|---------|
| /api/deployments/vaults | GET | List vaults |
| /api/deployments/vaults/create | POST | Create vault |
| /api/deployments/vaults/{vault}/withdraw | POST | Withdraw |

---

## 4. Solana RPC (on-chain data)

**RPC endpoint:** https://api.mainnet-beta.solana.com
**Nosana RPC:** https://rpc.ironforge.network/mainnet?apiKey=01HXY5BNJRYXRW05J6NE9YFQ3M

### Balances
- SOL: getBalance(pubkey) -> lamports / 1e9
- NOS: getTokenAccountsByOwner(pubkey, {mint: "nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7"}) -> uiAmountString

### Program IDs
| Program | Address |
|---------|---------|
| Jobs | nosJhNRqr2bc9g1nfGDcXXTXvYUmxD4cVwy2pMWhrYM |
| Staking | nosScmHY2uR24Zh751PmGj9ww9QRNHewh9H59AfrTJE |
| Rewards | nosRB8DUV67oLNrL45bo2pFLrmsWPiewe2Lk2DRNYCp |
| Pools | nosPdZrfDzND1LAR28FLMDEATUPK53K8xbRBXAirevD |
| Nodes | nosNeZR64wiEhQc5j251bsP4WqDabT6hmz4PHyoHLGD |
| NOS Token | nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7 |

### On-Chain Account Structures

#### StakeAccount (113 bytes)
| Field | Type | Description |
|-------|------|-------------|
| amount | u64 | NOS tokens staked (6 decimals) |
| authority | Pubkey | Staker's wallet |
| duration | u64 | Lock duration seconds (min 14d, max 365d) |
| time_unstake | i64 | Unix timestamp of unstake (0 = still staked) |
| vault | Pubkey | Token vault |
| vault_bump | u8 | PDA bump |
| xnos | u128 | Computed xNOS rank score |

#### JobAccount (233 bytes)
| Field | Type | Description |
|-------|------|-------------|
| ipfs_job | [u8;32] | IPFS CID of job definition |
| ipfs_result | [u8;32] | IPFS CID of result |
| market | Pubkey | Market |
| node | Pubkey | Assigned node |
| payer | Pubkey | Funder |
| price | u64 | Price per timeout unit |
| project | Pubkey | Project |
| state | u8 | 0=Queued, 2=Done, 3=Stopped |
| time_end | i64 | Completion timestamp |
| time_start | i64 | Start timestamp |
| timeout | i64 | Max duration seconds |

#### MarketAccount (10,211 bytes)
| Field | Type | Description |
|-------|------|-------------|
| authority | Pubkey | Market owner |
| job_expiration | i64 | Seconds |
| job_price | u64 | Price per timeout |
| job_timeout | i64 | Default timeout seconds |
| job_type | u8 | Default/Small/Medium/Large/Gpu |
| vault | Pubkey | Token vault |
| vault_bump | u8 | PDA bump |
| node_access_key | Pubkey | NFT collection for access |
| node_xnos_minimum | u128 | Min xNOS to enter queue |
| queue_type | u8 | 0=Job, 1=Node, 255=Empty |
| queue | Vec<Pubkey> | Up to 314 entries |

#### RunAccount (113 bytes)
| Field | Type | Description |
|-------|------|-------------|
| job | Pubkey | Associated job |
| node | Pubkey | Executing node |
| payer | Pubkey | Funder |
| state | u8 | Execution state |
| time | i64 | Creation timestamp |

#### NodeAccount (variable size)
| Field | Type | Description |
|-------|------|-------------|
| authority | Pubkey | Operator wallet |
| audited | bool | Passed audit |
| architecture | u8 | ArchitectureType enum |
| country | u16 | ISO country code |
| cpu | u16 | vCPU cores |
| gpu | u16 | GPU count |
| memory | u16 | Memory GB |
| iops | u16 | I/O ops/sec |
| storage | u16 | Storage GB |
| endpoint | String | HTTP endpoint |
| icon | String | Node icon |
| version | String | Software version |

#### ReflectionAccount (89 bytes)
| Field | Type | Description |
|-------|------|-------------|
| rate | u128 | Reward distribution rate |
| total_reflection | u128 | Cumulative total |
| total_xnos | u128 | Total xNOS all participants |
| vault | Pubkey | Vault |
| vault_bump | u8 | PDA bump |

#### RewardAccount (~73 bytes)
| Field | Type | Description |
|-------|------|-------------|
| authority | Pubkey | User's wallet |
| bump | u8 | PDA bump |
| reflection | u128 | User's reflection share |
| xnos | u128 | User's xNOS at entry |

#### PoolAccount (139 bytes)
| Field | Type | Description |
|-------|------|-------------|
| authority | Pubkey | Pool owner |
| beneficiary | Pubkey | Token account receiving emissions |
| claim_type | u8 | Transfer=0, AddFee=1 |
| claimed_tokens | u64 | Already claimed |
| closeable | bool | Can be closed |
| emission | u64 | Rate per second |
| start_time | i64 | Pool start |
| vault | Pubkey | Token vault |
| vault_bump | u8 | PDA bump |

---

## 5. SDK Streaming (requires Node.js runtime)

| Method | Description |
|--------|-------------|
| client.jobs.monitor() | Merged job+run events via Solana WebSocket |
| client.jobs.monitorDetailed() | Separate job/market/run events |
| client.solana.rpcSubscriptions | Raw Solana account subscriptions |

---

## 6. Explore Dashboard Field Sources

| Explore Field | API Source |
|--------------|------------|
| Status (RUNNING) | /node/info -> state |
| Host API Status | /node/info responds = Online |
| Running job | /api/nodes/{addr}/specs -> jobAddress |
| Host market | /api/markets/{marketAddr}/ -> slug, name |
| Total Jobs | /api/jobs?node={addr}&limit=1 -> totalJobs |
| Availability % | /api/benchmarks/node-report?node={addr} -> uptimePercentage |
| Anti-spoof % | /api/benchmarks/node-report?node={addr} -> antiSpoofSuccessRate |
| CLI Version | /node/info -> info.version |
| GPU | /node/info -> info.gpus.devices[].name |
| NVIDIA Driver | /node/info -> info.gpus.nvml_driver_version |
| CUDA Version | /node/info -> info.gpus.cuda_driver_version |
| CPU | /node/info -> info.cpu.model |
| RAM | /node/info -> info.ram_mb |
| Disk Space | /node/info -> info.disk_gb |
| Country | /node/info -> info.country |
| System Environment | /node/info -> info.system_environment |
| Download Speed | /api/nodes/{addr}/specs -> avgDownload10 |
| Upload Speed | /api/nodes/{addr}/specs -> avgUpload10 |
| NOS Balance | Solana RPC getTokenAccountsByOwner |
| NOS Staked | /api/stake/{addr} -> amount |
| SOL Balance | Solana RPC getBalance |
| Claimable Rewards | /api/nodes/{addr}/specs -> claimableUptimeNosRewards |
