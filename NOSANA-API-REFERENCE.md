# Nosana Complete Technical Reference

Exhaustive crawl of learn.nosana.com -- 2026-03-24

---

## Table of Contents

1. [Platform Overview](#1-platform-overview)
2. [Getting Started / Entry Points](#2-getting-started--entry-points)
3. [Key Concepts](#3-key-concepts)
4. [Glossary](#4-glossary)
5. [Wallet Configuration](#5-wallet-configuration)
6. [CLI (@nosana/cli)](#6-cli-nosanacli)
7. [API Authentication](#7-api-authentication)
8. [Deployments](#8-deployments)
9. [Job Definition Schema](#9-job-definition-schema)
10. [Job Execution Flow](#10-job-execution-flow)
11. [Inference Endpoints](#11-inference-endpoints)
12. [GPU Markets](#12-gpu-markets)
13. [Examples (All)](#13-examples)
14. [Smart Contract Programs](#14-smart-contract-programs)
15. [Host / Grid Requirements](#15-host--grid-requirements)
16. [Key URLs and Addresses](#16-key-urls-and-addresses)
17. [REST API (from Swagger spec)](#17-rest-api-from-swagger-spec)
18. [SDK Complete Reference](#18-sdk-complete-reference-nosanakit-v2062)
19. [Node Control API](#19-node-control-api-per-node-endpoints)

---

## 1. Platform Overview

Nosana is a decentralized compute network built on Solana blockchain, founded by Jesse Eisses and Sjoerd Dijkstra in 2021.

Description: "a secure, decentralised, and distributed compute network where anyone can contribute their computing hardware, and be automatically, and fairly, paid to run software for others."

### Workload Types
- **Batch workloads**: On-demand job execution, scheduled execution at specific times/frequencies, input/output handling
- **Online workloads**: Publicly accessible service endpoints (APIs, websites)

### Interaction Methods
1. **Dashboard** (deploy.nosana.com) -- Web interface, Google login or Solana wallet
2. **REST API** -- HTTP-based programmatic access
3. **TypeScript SDK** (`@nosana/kit`) -- High-level client library
4. **CLI** (`@nosana/cli`) -- Command-line interface
5. **Blockchain Programs** -- Direct Solana smart contract interaction

---

## 2. Getting Started / Entry Points

### Platform URLs
| Platform | URL |
|----------|-----|
| Deploy | https://deploy.nosana.com |
| Host | https://host.nosana.com |
| Stake | https://stake.nosana.com |
| Explore | https://explore.nosana.com |
| Discord | discord.gg/nosana-ai |
| Dashboard Markets | https://dashboard.nosana.com/markets |

### For Deploying AI Workloads
- Dashboard at deploy.nosana.com (web-based, no code required)
- REST API
- TypeScript SDK
- CLI
- Blockchain Programs

### For Hosting GPUs
- Access via /hosts/grid.html
- Requirements: NVIDIA GPU (CUDA compatible), 12GB+ RAM, 256GB+ NVMe SSD, Ubuntu 20.04+ Linux

### Authentication Methods
1. Dashboard: Google login or Solana wallet
2. API/SDK: API key from deploy.nosana.com -> Account page
3. Wallet-based authentication (see Section 7)
4. CLI: Supports both API key and wallet options
5. Blockchain Programs: Solana wallet required

---

## 3. Key Concepts

### Jobs
"The concrete set of operations to be executed. A job lists the operations to be executed, their order, whether they need to be executed sequentially or in parallel, and how input and output are passed around between them. Operations are executed as containers and offer similar ability to integrate with storage, networking, and resources like CPU and memory."

Job definition is specified as JSON, describing container images, commands, and runtime requirements.

### Deployments
An orchestration layer managing job lifecycles. Deployments enable strategy selection for underlying job behavior -- such as whether jobs run indefinitely.

### GPU Markets
Pools of GPU resources where job scheduling occurs.

### Hosts
Individual GPU machines executing jobs. Each host belongs to a specific GPU Market and is matched to suitable hosts based on resource requirements.

### Credits
Prepaid credits used to pay for compute resources.

---

## 4. Glossary

| Term | Definition |
|------|------------|
| AI Inference | Using a trained AI model to generate outputs or predictions from new input data |
| API Key | Authentication token used to access the Nosana API via the SDK or direct HTTP requests |
| Base58 | A binary-to-text encoding format commonly used for encoding private keys and addresses in Solana |
| CLI | Command-line interface, specifically @nosana/cli for interacting with the Nosana Network from the terminal |
| Clients | Businesses or individuals who rent GPU compute through Nosana Network |
| Community GPU market | GPU market segment for new or unvalidated hosts to start, test setups, and prove reliability |
| Consumer GPUs | GPUs designed for personal or gaming use |
| Container | A lightweight, isolated environment that packages app code and dependencies (e.g. a Docker image) |
| Credits | Usage-based currency consumed when running deployments and jobs on Nosana, claimable from the Dashboard |
| Dashboard | The Nosana web UI where you manage API keys, credits, deployments, and monitor workloads |
| Deployment | A long-lived object that describes what to run and how to run it, creating jobs over time |
| GPU Compute | High-performance computing using GPUs for tasks like deep learning, data analytics, and rendering |
| GPU Market | A pool of GPU resources with shared characteristics where deployments are scheduled |
| GPU Marketplace | Nosana's product where GPU compute resources are listed and rented |
| Green Compute | Computing that prioritizes sustainability by optimizing idle resources and reducing e-waste |
| Grid | The network of GPU hosts that provide compute resources on the Nosana marketplace |
| Host | An individual GPU machine in a GPU market that actually runs your jobs |
| Idle GPUs | GPU resources not being used, rentable through Nosana Network |
| Job | A concrete execution of your workload created from a deployment's job definition |
| Job Definition | The JSON specification describing image, commands, and resources for each job |
| Keypair | A cryptographic key pair (public and private key) used to sign transactions on Solana |
| Mainnet | The production-ready phase of Nosana Network |
| Node | A registered GPU provider in the Nosana Network that can execute jobs and earn rewards |
| NOS Token | The native token of the Nosana Network, used for staking, rewards, and payments |
| Nosana Grid | The network of GPU hosts that provide compute resources |
| Phantom | A popular Solana browser wallet extension |
| Pool | A vesting pool or staking pool where users can lock tokens to earn rewards |
| Premium GPU market | GPU market segment for validated, high-performing GPU providers suitable for critical workloads |
| Private Key | The secret cryptographic key used to sign transactions and prove ownership of a wallet |
| Provider | A GPU provider or host that offers GPU resources on the Nosana Network marketplace |
| Rewards | NOS tokens earned by staking, running nodes, or participating in the ecosystem |
| SDK | The TypeScript Software Development Kit for interacting with Nosana |
| Seed Phrase | A mnemonic phrase (typically 12 or 24 words) used to generate and recover a wallet's private key |
| SOL | Solana's native cryptocurrency token, used to pay for blockchain transaction fees |
| Solana | High-performance blockchain platform that Nosana is built on |
| Solflare | A Solana wallet available as browser extension and mobile app |
| Staking | The process of locking NOS tokens to participate in the network, earn rewards, and validate transactions |
| Transaction | A signed operation on the Solana blockchain |
| Wallet | A software application or hardware device that stores your keypair |
| Workload | A compute task or job that runs on the Nosana Network |

---

## 5. Wallet Configuration

### Token Requirements
- **SOL** (minimum 0.05): For blockchain transaction fees
- **NOS tokens**: For deployment payments
- **NOS Token Address**: `nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7`

### Wallet Methods

#### 1. Dashboard (Browser Wallet Extensions)
- **Phantom**: Import/export private keys supported
- **Solflare**: Import/export recovery phrase or private key supported

#### 2. CLI (@nosana/cli)
Expects private keys as JSON arrays (64 bytes in Solana CLI format).

Keypair location: `~/.nosana/nosana_key.json` (auto-generated on first run)

**Conversion from base58:**
```bash
npm install --global @solana/web3.js bs58
```

```javascript
const web3 = require('@solana/web3.js');
const bs58 = require('bs58');
const secretKey = bs58.decode(process.argv[2]);
console.log(JSON.stringify([...web3.Keypair.fromSecretKey(secretKey).secretKey]));
```

Store output to: `~/.nosana/nosana_key.json`
Verify with: `npx @nosana/cli address`

#### 3. SDK (@nosana/kit)
Accepts multiple formats:
- 64-byte JSON arrays
- Base58 private keys
- 12/24-word seed phrases
- Browser wallet instances

Pass to `createNosanaClient()` without conversion.

---

## 6. CLI (@nosana/cli)

### Installation
```bash
npm install -g @nosana/cli
# or
yarn install -g @nosana/cli
pnpm install -g @nosana/cli
bun install -g @nosana/cli
```

### Verify
```bash
nosana --version
```

### Commands

#### Address
```bash
nosana address
```
Returns the public key for receiving tokens.

#### Job Post
```bash
nosana job post --file <filename> --market <Market_Address | Market_Slug> [--wait]
```
Flags:
- `--file`: Path to job definition JSON file
- `--market`: Target market address OR slug (e.g., `nvidia-4090`)
- `--wait`: Wait for job completion and receive results immediately
- `--network`: Network selection (mainnet)

Inline command form:
```bash
nosana job post echo hello world --wait --market 7AtiXMSH6R1jjBxrcYjehCkkSF7zvYWte63gwEDBcGHq
```

#### Job Get
```bash
nosana job get <JOB_ID> --network mainnet
```
Retrieve completed job results by ID.

#### Market List
```bash
nosana market list
```

#### Market Get
```bash
nosana market get <market-slug-or-address>
# Example:
nosana market get nvidia-3060
nosana market get 97G9NnvBDQ2WpKu6fasoMsAKmfj63C9rhysJnkeWodAf
```

### Output Information (Job Post)
Successful job execution returns:
- Keypair location
- Network designation
- Wallet address and SOL/NOS balances
- IPFS upload confirmation URL
- Job posting transaction ID
- Service endpoint URL
- Job dashboard link
- Job state progression: RUNNING -> COMPLETED
- Exit code
- Total NOS costs
- Duration in seconds

---

## 7. API Authentication

### Method 1: API Key
- Header: `Authorization: Bearer <api-key>`
- Uses account credits
- Vault management unavailable
- Get API key from deploy.nosana.com -> Account page

### Method 2: Wallet Authentication
- Header: `Authorization: NosanaApiAuthentication:<base64-encoded-signature>`
- Header: `x-user-id: <your-wallet-public-key>`
- Header: `Content-Type: application/json`
- Requires signing the message "NosanaApiAuthentication" with your Solana wallet
- Enables vault management (SOL/NOS transfers)

#### SDK Implementation
```typescript
import { createNosanaClient } from '@nosana/kit';

const client = createNosanaClient({
  wallet: {
    // Wallet configuration (Keypair, Wallet, or adapter)
  },
});
```

The SDK automatically handles SignerAuth creation and message signing.

#### Manual Implementation (@nosana/api)
Provide `SignerAuth` with:
- `identifier`: Wallet public key (base58 format)
- `generate()`: Async function returning base64-encoded signature
- `solana.getBalance()`: Fetch SOL/NOS balances
- `solana.transferTokensToRecipient()`: Execute token transfers
- `solana.deserializeSignSendAndConfirmTransaction()`: Sign and broadcast transactions

#### Vault Management (Wallet Auth Only)
- Creating and managing vaults
- Topping up vaults with SOL or NOS
- Withdrawing vault funds
- Retrieving vault balances
- Vault addresses returned in deployment responses

---

## 8. Deployments

### Core Concept
"Deployments are the best way to run workloads on the Nosana Network because they offer a single entrypoint to defining the workload (ie. the job definition) with additional controls over how it is scheduled, stopped or extended."

### Five Fundamental Components
1. **Job Definition** -- JSON document describing containerized operations
2. **Market** -- Solana public key identifying the compute marketplace
3. **Replicas** -- Integer count of parallel job instances to maintain
4. **Strategy** -- Lifecycle management approach
5. **Timeout** -- Maximum execution duration per job instance

### Deployment Strategies
| Strategy | Description |
|----------|-------------|
| SIMPLE | Executes specified job replicas once. Transitions to STOPPED when all replicas complete or timeout expires |
| SIMPLE-EXTEND | Runs job replicas with automatic timeout extension. Jobs continue extending by the initial timeout period until funds deplete |
| SCHEDULED | Deploys replicas at predetermined times using cron scheduling |
| INFINITE | (Coming Soon) Maintains continuous replica count by scheduling fresh jobs before existing ones reach timeout |

#### SCHEDULED Cron Format
Five space-separated fields: minute (0-59) | hour (0-23) | day of month (1-31) | month (1-12) | day of week (0-6, Sunday=0)

Examples:
- `"*/5 * * * *"` -- every 5 minutes
- `"0 * * * *"` -- hourly at start
- `"0 9 * * 1-5"` -- 09:00 weekdays only

### Deployment Status Lifecycle (8 states)
1. **DRAFT** -- Initial state, inactive
2. **STARTING** -- Initialization phase
3. **RUNNING** -- Active job processing
4. **STOPPING** -- Graceful shutdown
5. **STOPPED** -- Halted but restartable
6. **ARCHIVED** -- Permanently archived (irreversible)
7. **ERROR** -- Failure condition encountered
8. **INSUFFICIENT_FUNDS** -- Insufficient vault balance to continue operation

---

## 9. Job Definition Schema

### Top-Level Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | string | YES | Schema version (currently `"0.1"`) |
| `type` | `"container"` | YES | Execution type |
| `meta` | object | NO | Job metadata |
| `global` | object | NO | Defaults applied across all operations |
| `ops` | Ops (Array) | YES | Ordered operations/tasks for execution |

### Meta Object
```json
{
  "trigger": "api|cli|dashboard",
  "system_resources": {
    "required_vram": "<number|string>"
  }
}
```

### Global Defaults Object
```json
{
  "image": "string",
  "gpu": "boolean",
  "entrypoint": "string|string[]",
  "env": { "KEY": "VALUE" },
  "work_dir": "string"
}
```

### Operations (ops) Array
Each operation:
```json
{
  "id": "unique-id",
  "type": "container/run | container/create-volume",
  "args": { ... }
}
```

### Operation Args (container/run)

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `image` | string | YES | Docker image URL (recommended: full registry URL) |
| `cmd` | string or string[] | NO | Commands to execute |
| `gpu` | boolean | NO | GPU requirement |
| `expose` | number or ExposedPort[] | NO | Ports to expose externally |
| `env` | object | NO | Environment variables |
| `entrypoint` | string or string[] | NO | Docker entrypoint override |
| `resources` | Resource[] | NO | External data sources |
| `volumes` | Volume[] | NO | Volume mounts |
| `work_dir` | string | NO | Working directory |
| `authentication` | object | NO | Docker registry authentication |

### cmd Variations
- **String**: `"gunicorn -w 4 -k uvicorn.workers.UvicornWorker main:app"` -- Bash interprets
- **Array**: `["/bin/sh", "-c", "gunicorn", "-w", "4"]` -- Explicit shell

### Resource Types

#### S3 Resource
```json
{
  "type": "S3",
  "url": "https://storage.example.com/models",
  "target": "/data/",
  "files": ["model.bin"],
  "IAM": {
    "ACCESS_KEY_ID": "key",
    "SECRET_ACCESS_KEY": "secret"
  }
}
```

#### HuggingFace Resource
```json
{
  "type": "HF",
  "repo": "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
  "target": "/data-models/"
}
```

### Caching
"Nosana Nodes can cache resources they need to run a job." The main bottleneck to spinning up a job is downloading assets (docker images and model files). Cached resources reduce startup time.

### Docker Authentication
```json
{
  "authentication": {
    "docker": {
      "username": "user",
      "password": "pass",
      "email": "optional",
      "server": "optional registry URL"
    }
  }
}
```

### Volume Configuration (container/create-volume)
```json
{
  "type": "container/create-volume",
  "id": "create-volume",
  "args": {
    "name": "random-id-volume"
  }
}
```

Mount in subsequent operations:
```json
"volumes": [
  {
    "name": "random-id-volume",
    "dest": "/nosana/outputs"
  }
]
```

---

## 10. Job Execution Flow

### Job States
1. **Open** -- Initial state when job is submitted
2. **Assigned** -- Node selected based on requirements
3. **Work** -- Node executing the job
4. **Complete** -- Job finished, results pending
5. **Claimed** -- Results verified and accepted

### Flow Steps
1. **Job Submission**: User submits job in JSON format specifying tasks, Docker images, and GPU requirements
2. **Node Selection**: System assigns job to appropriate Nosana node (identified by Solana address)
3. **Job Execution**: Selected node pulls Docker image and executes specified commands
4. **Resource Utilization**: Node leverages GPU resources in decentralized manner
5. **Completion and Rewards**: Executing node earns $NOS token rewards

---

## 11. Inference Endpoints

### Service URL Pattern
```
https://<JOB_ID>.node.k8s.prd.nos.ci/<service-path>
```

### Posting a Job with Duration
```bash
nosana job post --file <filename> --market <market-address>
```

### SDK Alternative
```typescript
client.jobs.post({
  market: address('<market-address>'),
  timeout: 7200,
  ipfsHash: ipfsHash
})
```

Parameters:
- `timeout`: Job duration in seconds (e.g., 7200 = 2 hours)
- `market`: Market address for job posting
- `gpu`: Boolean flag enabling GPU resources
- `expose`: Container port to expose externally

### Timing Considerations
- Nginx endpoint: available immediately after job runs
- Ollama services: approximately 10 minutes for initialization
- Initial "Page not found" messages expected during startup

---

## 12. GPU Markets

### CLI Commands
```bash
nosana market list
nosana market get <slug-or-address>
```

### Market Attributes
- Market Name (GPU type)
- Address (for --market flag)
- SFT collection
- Job price (NOS/s)
- Job timeout
- Job expiration
- Queue type (Node/Job/Empty)
- Nodes in queue

### Known Market Addresses

| GPU | Market Address | Slug | Price |
|-----|---------------|------|-------|
| NVIDIA RTX 3060 / 3060 Ti | `7AtiXMSH6R1jjBxrcYjehCkkSF7zvYWte63gwEDBcGHq` | nvidia-3060 | 0.000043 NOS/s |
| NVIDIA RTX 4090 | `97G9NnvBDQ2WpKu6fasoMsAKmfj63C9rhysJnkeWodAf` | nvidia-4090 | 0.000115 NOS/s |
| NVIDIA RTX 4070 | `EzuHhkrhmV98HWzREsgLenKj2iHdJgrKmzfL8psP8Aso` | (4070 market) | -- |
| NVIDIA A100 | `GLJHzqRN9fKGBsvsFzmGnaQGknUtLN1dqaFR8n3YdM22` | (A100 market) | -- |

### nvidia-3060 Market Details (Example)
- SFT collection: `EriVoySzVWF4NtNxQFCFASR4632N9sh9YumTjkhGkkgL`
- Job price: 0.000043 NOS/s
- Job timeout: 120 minutes
- Job expiration: 24 hours
- Queue type: Node Queue
- Nodes in queue: 23
- Supported GPUs: NVIDIA GeForce RTX 3060, NVIDIA GeForce RTX 3060 Ti
- Required Docker images: `docker.io/laurensv/nosana-frpc`, `registry.hub.docker.com/nosana/stats:v1.0.4`

### Job Posting Syntax
Two equivalent formats:
```bash
nosana job post --market <Market_Address>
nosana job post --market <Market_Slug>
```

---

## 13. Examples

### 13.1 Hello World

**File**: `hello_world.json`
```json
{
  "version": "0.1",
  "type": "container",
  "meta": { "trigger": "cli" },
  "ops": [
    {
      "type": "container/run",
      "id": "hello-world",
      "args": {
        "cmd": ["echo hello world"],
        "image": "ubuntu"
      }
    }
  ]
}
```

**Command**:
```bash
nosana job post --file hello_world.json --market 97G9NnvBDQ2WpKu6fasoMsAKmfj63C9rhysJnkeWodAf --wait
```

**Output**: Execution in ~0.111s, exit code 0, outputs "hello world"

---

### 13.2 TinyLlama

**File**: `tiny_llama.json`
```json
{
  "version": "0.1",
  "type": "container",
  "meta": { "trigger": "cli" },
  "ops": [
    {
      "type": "container/run",
      "id": "tinyllama",
      "args": {
        "cmd": ["'Write me a story about Tony the tiny hawk'"],
        "image": "docker.io/jeisses/tinyllama:v4",
        "gpu": true
      }
    }
  ]
}
```

- **Model**: TinyLlama 1.1B parameters
- **Image**: `docker.io/jeisses/tinyllama:v4`
- **GPU**: required
- **Market**: `97G9NnvBDQ2WpKu6fasoMsAKmfj63C9rhysJnkeWodAf` (4090, 0.000115 NOS/s)
- **Throughput**: 129.610116 tokens/second

---

### 13.3 Ollama

**File**: `ollama.json`
```json
{
  "version": "0.1",
  "type": "container",
  "meta": { "trigger": "cli" },
  "ops": [
    {
      "type": "container/run",
      "id": "ollama",
      "args": {
        "cmd": [
          "-c 'curl -s https://raw.githubusercontent.com/KeesGeerligs/nosana/main/benchmarking/images/command.sh -o /tmp/command.sh && chmod +x /tmp/command.sh && /tmp/command.sh'"
        ],
        "image": "docker.io/nosana/ollama-7b:0.0.1",
        "gpu": true,
        "expose": 11434
      }
    }
  ]
}
```

- **Image**: `docker.io/nosana/ollama-7b:0.0.1`
- **Port**: 11434
- **Model**: gemma:7b
- **Endpoint**: `https://<JOB_ID>.node.k8s.prd.nos.ci/api/generate`

**cURL example**:
```bash
curl -X POST https://<JOB_ID>.node.k8s.prd.nos.ci/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model": "gemma:7b", "stream": false, "prompt": "What is water made of?"}'
```

**Response format**:
```json
{
  "model": "<model-name>",
  "created_at": "<ISO-timestamp>",
  "response": "<text-output>",
  "done": true,
  "done_reason": "<reason>"
}
```

---

### 13.4 Ollama (Endpoints page variant)

Alternative configuration from the endpoints documentation:
```
image: "docker.io/ollama/ollama:0.6.6"
entrypoint: ["/bin/sh"]
cmd: ["-c", "ollama serve & sleep 5 && ollama pull $MODEL && tail -f /dev/null"]
env.MODEL: "gemma3:4b-it-qat"
gpu: true
expose: 11434
```

---

### 13.5 vLLM

**Image**: `docker.io/vllm/vllm-openai:v0.5.4`
**Port**: 8000
**GPU**: required

#### Llama 3.1 70B AWQ-INT4
- Model path: `/root/.cache/huggingface/hub/models--hugging-quants--Meta-Llama-3.1-70B-Instruct-AWQ-INT4/snapshots/2123003760781134cfc31124aa6560a45b491fdf`
- Quantization: AWQ
- Max model length: 2176 tokens
- Market: `GLJHzqRN9fKGBsvsFzmGnaQGknUtLN1dqaFR8n3YdM22` (A100)

#### Llama 3.1 8B
- Model path: `/root/.cache/huggingface/hub/models--unsloth--Meta-Llama-3.1-8B`
- Quantization: AWQ
- Max model length: 2176 tokens
- Market: `97G9NnvBDQ2WpKu6fasoMsAKmfj63C9rhysJnkeWodAf` (4090)

#### Llama 3.1 8B AWQ-INT4
- Model path: `/root/.cache/huggingface/hub/models--hugging-quants--Meta-Llama-3.1-8B-Instruct-AWQ-INT4/snapshots/db1f81ad4b8c7e39777509fac66c652eb0a52f91`
- Market: `EzuHhkrhmV98HWzREsgLenKj2iHdJgrKmzfL8psP8Aso` (4070)

**Resource caching**: S3 from `models.nosana.io/hugging-face/` with specific snapshot paths.

**CLI Commands**:
```bash
nosana job post --market GLJHzqRN9fKGBsvsFzmGnaQGknUtLN1dqaFR8n3YdM22 --file vllm-70b.json
nosana job post --market 97G9NnvBDQ2WpKu6fasoMsAKmfj63C9rhysJnkeWodAf --file vllm-8b.json
nosana job post --market EzuHhkrhmV98HWzREsgLenKj2iHdJgrKmzfL8psP8Aso --file vllm-8b-4x.json
```

---

### 13.6 LMDeploy

**Image**: `docker.io/openmmlab/lmdeploy:v0.5.3-cu12`
**Port**: 23333
**GPU**: required

**Base command**:
```
lmdeploy serve api_server <model-path> --model-name llama3.1 --chat-template <template-path> --model-format awq
```

#### Llama 3.1 70B (4x)
- Snapshot: `2123003760781134cfc31124aa6560a45b491fdf`
- S3 Model: `https://models.nosana.io/hugging-face/llama3.1/70b/4x/models--hugging-quants--Meta-Llama-3.1-70B-Instruct-AWQ-INT4` -> `/root/models/`
- S3 Template: `https://models.nosana.io/templates/lmdeploy/chat` -> `/root/templates/`
- Market: `GLJHzqRN9fKGBsvsFzmGnaQGknUtLN1dqaFR8n3YdM22` (A100)

#### Llama 3.1 8B
- Snapshot: `069adfb3ab0ceba60b9af8f11fa51558b9f9d396`
- S3 Model: `https://models.nosana.io/hugging-face/llama3.1/8b/models--unsloth--Meta-Llama-3.1-8B` -> `/root/models/`
- S3 Template: `https://models.nosana.io/templates/lmdeploy/chat` -> `/root/templates/`
- Market: `97G9NnvBDQ2WpKu6fasoMsAKmfj63C9rhysJnkeWodAf` (4090)

#### Llama 3.1 8B AWQ INT4
- Snapshot: `db1f81ad4b8c7e39777509fac66c652eb0a52f91`
- S3 Model: `https://models.nosana.io/hugging-face/llama3.1/8b/4x/models--hugging-quants--Meta-Llama-3.1-8B-Instruct-AWQ-INT4` -> `/root/models/`
- Market: `EzuHhkrhmV98HWzREsgLenKj2iHdJgrKmzfL8psP8Aso` (4070)

**CLI Commands**:
```bash
nosana job post --market GLJHzqRN9fKGBsvsFzmGnaQGknUtLN1dqaFR8n3YdM22 --file lmdeploy-70b.json
nosana job post --market 97G9NnvBDQ2WpKu6fasoMsAKmfj63C9rhysJnkeWodAf --file lmdeploy-8b.json
nosana job post --market EzuHhkrhmV98HWzREsgLenKj2iHdJgrKmzfL8psP8Aso --file lmdeploy-8b-4x.json
```

---

### 13.7 Stable Diffusion WebUI

**File**: `stable_webui.json`
```json
{
  "version": "0.1",
  "type": "container",
  "meta": { "trigger": "cli" },
  "ops": [
    {
      "type": "container/run",
      "id": "stable-webui",
      "args": {
        "cmd": [],
        "image": "docker.io/universonic/stable-diffusion-webui:minimal",
        "gpu": true,
        "expose": 8080,
        "resources": [
          {
            "type": "S3",
            "url": "https://models.nosana.io/stable-diffusion/1.5",
            "target": "/app/stable-diffusion-webui/models/Stable-diffusion"
          }
        ]
      }
    }
  ]
}
```

- **Image**: `docker.io/universonic/stable-diffusion-webui:minimal`
- **Port**: 8080
- **Model Source**: S3 at `https://models.nosana.io/stable-diffusion/1.5`
- **Model Dest**: `/app/stable-diffusion-webui/models/Stable-diffusion`
- **Price**: 0.000097 NOS/s

```bash
nosana job post --file stable_webui.json --market nvidia-4090
```

---

### 13.8 Whisper

**File**: `whisper.json`
```json
{
  "version": "0.1",
  "type": "container",
  "meta": { "trigger": "cli" },
  "ops": [
    {
      "type": "container/run",
      "id": "run-whisper",
      "args": {
        "cmd": ["python openai-whisper.py -p hello.mp3"],
        "image": "docker.io/nosana/whisper:latest",
        "gpu": true
      }
    }
  ]
}
```

- **Image**: `docker.io/nosana/whisper:latest`
- **Input**: `hello.mp3`
- **Script**: `openai-whisper.py`
- **Execution time**: ~127 seconds
- **Cost**: 0.014605 NOS
- **Output format**: `[00:00.000 --> 00:00.500]  Hello!` (timestamp-based transcription)

---

### 13.9 Open WebUI

**File**: `open_webui.json`
```json
{
  "version": "0.1",
  "type": "container",
  "meta": { "trigger": "cli" },
  "ops": [
    {
      "type": "container/run",
      "id": "open-webui",
      "args": {
        "cmd": [],
        "env": {
          "WEBUI_AUTH": "False",
          "WEBUI_NAME": "Nosana Chat"
        },
        "image": "ghcr.io/open-webui/open-webui:ollama",
        "gpu": true,
        "expose": 8080
      }
    }
  ]
}
```

- **Image**: `ghcr.io/open-webui/open-webui:ollama`
- **Port**: 8080
- **Auth disabled**: `WEBUI_AUTH=False`
- **Display name**: "Nosana Chat"

---

### 13.10 Jupyter Notebook

**File**: `jupyter.json`
```json
{
  "version": "0.1",
  "type": "container",
  "meta": { "trigger": "cli" },
  "ops": [
    {
      "type": "container/run",
      "id": "jupyter-notebook",
      "args": {
        "cmd": [
          "bash -c ",
          "source /etc/bash.bashrc && jupyter notebook --notebook-dir=/tf --ip 0.0.0.0 --no-browser --allow-root --NotebookApp.token='' --NotebookApp.password=''"
        ],
        "expose": 8888,
        "image": "tensorflow/tensorflow:latest-gpu-jupyter",
        "gpu": true
      }
    }
  ]
}
```

- **Image**: `tensorflow/tensorflow:latest-gpu-jupyter`
- **Port**: 8888
- **Working directory**: `/tf`
- **Auth disabled**: empty token and password
- **Network**: `0.0.0.0` (all interfaces)
- **Price**: 0.000115 NOS/s

---

### 13.11 Multi-Operation Job

**File**: `multi_job.json`
```json
{
  "version": "0.1",
  "type": "container",
  "meta": { "trigger": "cli" },
  "global": {
    "work_dir": "/home/",
    "env": { "DEBUG": "1" }
  },
  "ops": [
    {
      "type": "container/create-volume",
      "id": "create-volume",
      "args": { "name": "random-id-volume" }
    },
    {
      "type": "container/run",
      "id": "run-from-cli",
      "args": {
        "cmd": [
          "/bin/bash -c ",
          "echo Hello World > /nosana/outputs/test.txt;",
          "ls /nosana/outputs;",
          "pwd;"
        ],
        "image": "ubuntu",
        "volumes": [
          { "name": "random-id-volume", "dest": "/nosana/outputs" }
        ],
        "work_dir": "/home/podman"
      }
    },
    {
      "type": "container/run",
      "id": "run-from-cli-2",
      "args": {
        "cmd": "/bin/bash -c 'echo Hello World; ls; pwd;'",
        "image": "ubuntu"
      }
    }
  ]
}
```

Features:
- Sequential operation execution with persistent volume support
- Container isolation per operation stage
- Global environment and work_dir inherited by all ops
- Volume shared between operations via `container/create-volume`

---

## 14. Smart Contract Programs

### Program Addresses

| Program | Address | Purpose |
|---------|---------|---------|
| Nosana Jobs | `nosJhNRqr2bc9g1nfGDcXXTXvYUmxD4cVwy2pMWhrYM` | Compute job marketplace |
| Nosana Staking | `nosScmHY2uR24Zh751PmGj9ww9QRNHewh9H59AfrTJE` | Token staking and xNOS issuance |
| Nosana Rewards | `nosRB8DUV67oLNrL45bo2pFLrmsWPiewe2Lk2DRNYCp` | Network participation rewards |
| Nosana Pools | `nosPdZrfDzND1LAR28FLMDEATUPK53K8xbRBXAirevD` | Token vesting distribution |
| NOS Token Mint | `nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7` | NOS SPL token |

### Security Audits
- Audit Report 1 (10-08-2022) by Op Codes
- Audit Report 2 (23-08-2022) by Op Codes
- Available in GitHub nosana-programs repository audits directory

### Integration Methods
1. **TypeScript SDK** (`@nosana/kit`) -- "The easiest way to interact with programs"
2. **Anchor Framework** -- Direct program interaction
3. **CLI Tools** -- Command-line operations

---

### 14.1 Nosana Jobs Program

**Address**: `nosJhNRqr2bc9g1nfGDcXXTXvYUmxD4cVwy2pMWhrYM`

#### Accounts (4)

##### Market Account (10,211 bytes)
Discriminator: `c94ebbe1f0c6c9fb`

| Field | Type | Size | Offset | Description |
|-------|------|------|--------|-------------|
| authority | publicKey | 32 | 8 | Market authority |
| jobExpiration | i64 | 8 | 40 | Job expiration time |
| jobPrice | u64 | 8 | 56 | Price per second in NOS |
| jobTimeout | i64 | 8 | 64 | Maximum job duration |
| jobType | u8 | 1 | 80 | Job type classification |
| vault | publicKey | 32 | 81 | Token vault address |
| vaultBump | u8 | 1 | 113 | PDA bump seed |
| nodeAccessKey | publicKey | 32 | 114 | SFT collection for node access |
| nodeXnosMinimum | u128 | 16 | 146 | Minimum xNOS stake requirement |
| queueType | u8 | 1 | 162 | Queue type (Job=0, Node=1, Empty=2) |
| queue | Vec<publicKey> | 10048 | 163 | Queue of waiting jobs or nodes |

##### Job Account
Discriminator: `CCQHFVlf`

##### Run Account
Discriminator: `DOeUuUda`

##### Vault Account
Holds token reserves for market operations.

#### Instructions (19)
1. Open -- Initialize market and vault (discriminator: `e4dc9b47c7bd3c2d`)
2. Update
3. Close
4. Close Admin
5. Assign
6. List
7. Delist
8. Recover
9. Extend
10. End
11. Work
12. Stop
13. Claim
14. Complete
15. Finish
16. Quit
17. Quit Admin
18. Clean
19. Clean Admin

#### Open Instruction Parameters
- `jobExpiration` (i64)
- `jobPrice` (u64)
- `jobTimeout` (i64)
- `jobType` (u8)
- `nodeXnosMinimum` (u128)

#### Enums

**QueueType**: Job (0), Node (1), Empty (2)

**JobType**: Numeric variants 6000-6018 (19 classifications)

---

### 14.2 Nosana Staking Program

**Address**: `nosScmHY2uR24Zh751PmGj9ww9QRNHewh9H59AfrTJE`
**Domain**: `nosana-staking.sol`
**Build**: Anchor Verified

#### Accounts

##### Settings Account (72 bytes)
Discriminator: `3f59cb9b4ced733a` (bytes: [63,89,203,155,76,237,115,58])

| Field | Type | Size | Offset | Description |
|-------|------|------|--------|-------------|
| authority | publicKey | 32 | 8 | Program signing authority |
| tokenAccount | publicKey | 32 | 40 | Slash deposit destination |

##### Stake Account
Referenced but detailed field layout not documented.

##### Vault Account
Referenced but detailed field layout not documented.

#### Instructions (10)
1. **Init** -- Initialize SettingsAccount (discriminator: `dc3bcfec6cfa2f64`, bytes: [220,59,207,236,108,250,47,100])
   - Accounts: settings, authority, systemProgram, rent
2. Unstake
3. Restake
4. Topup
5. Extend
6. Close
7. Withdraw
8. Slash
9. Update Settings
10. (10th instruction name not listed in docs)

#### xNOS Calculation
- Staked NOS multiplied by duration
- Duration: integer seconds
- Minimum duration: 14 days
- Maximum duration: 365 days
- Maximum multiplier: 4 (at one-year duration)

#### Error Codes
- 6000: Amount Not Enough

#### Dashboard
- https://dashboard.nosana.com/stake/
- xNOS Calculator: https://nosana.com/token

---

### 14.3 Nosana Rewards Program

**Address**: `nosRB8DUV67oLNrL45bo2pFLrmsWPiewe2Lk2DRNYCp`
**Domain**: `nosana-rewards.sol`
**Build**: Anchor Verified

Token reflection model: "fees are accounted for 'live' as they come in and no loops necessary."

#### Accounts

##### Reflection Account (89 bytes)
Discriminator: `cd99a036ef1adbbc` (bytes: [205,153,160,54,239,26,219,188])

| Field | Type | Size | Offset | Description |
|-------|------|------|--------|-------------|
| rate | u128 | 16 | 8 | Current reward rate |
| totalReflection | u128 | 16 | 24 | Current total reflection |
| totalXnos | u128 | 16 | 40 | Current total xNOS |
| vault | publicKey | 32 | 56 | VaultAccount address |
| vaultBump | u8 | 1 | 88 | VaultAccount bump |

##### Reward Account
Referenced but detailed field layout not documented.

##### Vault Account
Referenced but detailed field layout not documented.

#### Instructions (6)

| Instruction | Discriminator | Purpose |
|-------------|---------------|---------|
| Init | `dc3bcfec6cfa2f64` [220,59,207,236,108,250,47,100] | Initialize ReflectionAccount and VaultAccount |
| Enter | -- | Join rewards program |
| Add Fee | -- | Deposit fees for distribution |
| Claim | -- | Withdraw earned rewards |
| Sync | -- | Update reward calculations |
| Close | -- | Terminate reward account |

##### Init Instruction Accounts
- mint (writable: no, signer: no)
- reflection (writable: yes, signer: no)
- vault (writable: yes, signer: no)
- authority (writable: yes, signer: yes)
- systemProgram (writable: no, signer: no)
- tokenProgram (writable: no, signer: no)
- rent (writable: no, signer: no)

#### Operational Rules
- Single active rewards entry per user
- Claiming does not require unstaking
- Unstaking voids the reward account
- Unclaimed rewards distribute to remaining participants upon account closure
- Earned rewards automatically contribute to xNOS score (1x multiplier)
- Any party may close an unstaked user's account to prevent "ghost accounts"

---

### 14.4 Nosana Pools Program

**Address**: `nosPdZrfDzND1LAR28FLMDEATUPK53K8xbRBXAirevD`
**Domain**: `nosana-pools.sol`
**Build**: Anchor Verified

#### Accounts

##### Pool Account (139 bytes)
Discriminator: `74d2bb77c4c43489` (bytes: [116,210,187,119,196,196,52,137])

| Field | Type | Size | Offset | Description |
|-------|------|------|--------|-------------|
| authority | publicKey | 32 | 8 | Program invocation authority |
| beneficiary | publicKey | 32 | 40 | Token account receiving emissions |
| claimType | u8 | 1 | 72 | Claim type variant |
| claimedTokens | u64 | 8 | 73 | Tokens already claimed |
| closeable | bool | 1 | 81 | Pool closure permission |
| emission | u64 | 8 | 82 | Emission rate per second |
| startTime | i64 | 16 | 90 | Unix timestamp pool opening |
| vault | publicKey | 32 | 106 | Vault account reference |
| vaultBump | u8 | 1 | 138 | PDA bump seed |

##### Vault Account
Referenced but detailed field layout not documented.

#### Instructions (5+1)

| Instruction | Discriminator |
|-------------|---------------|
| Open | `e4dc9b47c7bd3c2d` |
| Claim | -- |
| Fee | -- |
| Transfer | -- |
| Close | -- |
| Update Beneficiary | -- |

##### Open Instruction Arguments
- emission (u64, 8 bytes, offset 0)
- startTime (i64, 16 bytes, offset 8)
- claimType (u8, 1 byte, offset 24)
- closeable (bool, 1 byte, offset 25)

##### Open Instruction Required Accounts (8)
- pool (writable, signer)
- vault (writable)
- beneficiary
- authority (writable, signer)
- mint
- systemProgram
- tokenProgram
- rent

#### Claim Type Enum
```
Transfer = 0
AddFee = 1
Unknown = 255
```

#### Program Totals
- Accounts: 2
- Instructions: 5
- Type variants: 1
- Errors: 5

---

## 15. Host / Grid Requirements

### Hardware Requirements
- **RAM**: 12GB minimum
- **Storage**: 256GB+ NVMe SSD required; up to 1TB recommended for large language models
- **Bandwidth**: Minimum 100 Mb/s down, 50 Mb/s up; Recommended 500 Mb/s down, 250 Mb/s up, ping < 100ms

### Operating System
- Ubuntu 20.04 or newer (native Linux only)
- Windows/WSL2 being deprecated

### Supported NVIDIA GPUs

#### Consumer Series
- RTX 30 Series: 3060, 3060Ti, 3070, 3070Ti, 3080, 3080Ti, 3090, 3090Ti
- RTX 40 Series: 4060, 4060Ti, 4070, 4070Ti, 4080, 4090
- RTX 50 Series: 5070, 5080, 5090

#### Professional Series
- RTX A Series: A4000, A4500, A5000, A5500, A6500
- Data Center: A100 40GB, A100 80GB, H100

### Key Constraints
- "1 private key per GPU, 1 GPU per PC" strictly enforced
- Security: "Run the Nosana Node software in a sandboxed environment and use a Solana wallet with only a minimal amount of SOL"

---

## 16. Key URLs and Addresses

### Platform URLs
| Service | URL |
|---------|-----|
| Deploy Dashboard | https://deploy.nosana.com |
| Host Dashboard | https://host.nosana.com |
| Stake Dashboard | https://stake.nosana.com |
| Explorer | https://explore.nosana.com |
| Legacy Dashboard | https://dashboard.nosana.com |
| Markets List | https://dashboard.nosana.com/markets |
| Staking UI | https://dashboard.nosana.com/stake/ |
| xNOS Calculator | https://nosana.com/token |
| Discord | discord.gg/nosana-ai |

### Service Endpoint Pattern
```
https://<JOB_ID>.node.k8s.prd.nos.ci/<path>
```

### Model Hosting (S3)
| Resource | URL |
|----------|-----|
| HuggingFace models | https://models.nosana.io/hugging-face/ |
| Stable Diffusion 1.5 | https://models.nosana.io/stable-diffusion/1.5 |
| LMDeploy templates | https://models.nosana.io/templates/lmdeploy/chat |

### Solana Addresses
| Entity | Address |
|--------|---------|
| NOS Token Mint | `nosXBVoaCTtYdLvKY6Csb4AC8JCdQKKAaWYtx2ZMoo7` |
| Jobs Program | `nosJhNRqr2bc9g1nfGDcXXTXvYUmxD4cVwy2pMWhrYM` |
| Staking Program | `nosScmHY2uR24Zh751PmGj9ww9QRNHewh9H59AfrTJE` |
| Rewards Program | `nosRB8DUV67oLNrL45bo2pFLrmsWPiewe2Lk2DRNYCp` |
| Pools Program | `nosPdZrfDzND1LAR28FLMDEATUPK53K8xbRBXAirevD` |
| 3060 Market | `7AtiXMSH6R1jjBxrcYjehCkkSF7zvYWte63gwEDBcGHq` |
| 4090 Market | `97G9NnvBDQ2WpKu6fasoMsAKmfj63C9rhysJnkeWodAf` |
| 4070 Market | `EzuHhkrhmV98HWzREsgLenKj2iHdJgrKmzfL8psP8Aso` |
| A100 Market | `GLJHzqRN9fKGBsvsFzmGnaQGknUtLN1dqaFR8n3YdM22` |
| 3060 SFT Collection | `EriVoySzVWF4NtNxQFCFASR4632N9sh9YumTjkhGkkgL` |

### Docker Images Used in Examples
| Image | Used For |
|-------|----------|
| `ubuntu` | Hello World |
| `docker.io/jeisses/tinyllama:v4` | TinyLlama |
| `docker.io/nosana/ollama-7b:0.0.1` | Ollama (gemma:7b) |
| `docker.io/ollama/ollama:0.6.6` | Ollama (endpoints variant) |
| `docker.io/vllm/vllm-openai:v0.5.4` | vLLM |
| `docker.io/openmmlab/lmdeploy:v0.5.3-cu12` | LMDeploy |
| `docker.io/universonic/stable-diffusion-webui:minimal` | Stable Diffusion |
| `docker.io/nosana/whisper:latest` | Whisper |
| `ghcr.io/open-webui/open-webui:ollama` | Open WebUI |
| `tensorflow/tensorflow:latest-gpu-jupyter` | Jupyter |
| `docker.io/laurensv/nosana-frpc` | Node infrastructure |
| `registry.hub.docker.com/nosana/stats:v1.0.4` | Node stats |

### NPM Packages
| Package | Purpose |
|---------|---------|
| `@nosana/cli` | Command-line interface |
| `@nosana/kit` | TypeScript SDK |
| `@nosana/api` | Low-level API client |

---

## 17. REST API (from Swagger spec)

**Base URL**: `https://dashboard.k8s.prd.nos.ci/api`
**Swagger UI**: `https://dashboard.k8s.prd.nos.ci/api/swagger`
**Swagger JSON**: `https://dashboard.k8s.prd.nos.ci/api/swagger/json`
**OpenAPI**: 3.0.3 -- "Dashboard Backend API with integrated Deployment Manager"

### Authentication
- **API Key**: `Authorization: Bearer nos_xxx_your_api_key`
- **Wallet**: `Authorization: NosanaApiAuthentication:<base64-signature>` + `x-user-id: <wallet-pubkey>`

### Pagination (shared pattern)
- `cursor` (string), `limit` (10|20|50|100, default: 10), `sort_order` ("asc"|"desc", default: "desc")
- Response: `{ cursor_next, cursor_prev, total_items }`

### Credits
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/credits/balance` | Yes | Returns `{ assignedCredits, reservedCredits, settledCredits }` |

### Jobs (standalone, credit-based)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/jobs/list` | Yes | Create job using credits. Body: `{ ipfsHash, market, timeout?, node? }` |
| GET | `/api/jobs/{address}` | **No** | Get job by address (public). Returns numeric `state` field |
| POST | `/api/jobs/{address}/extend` | Yes | Extend job. Body: `{ seconds }` |
| POST | `/api/jobs/{address}/stop` | Yes | Stop job. Returns `{ tx, job, delisted }` |

### Markets
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/markets/` | **No** | List markets (public). Query: `filterKey`, `filterValue`, `limit`, `type` |
| GET | `/api/markets/{id}/` | **No** | Get single market |
| GET | `/api/markets/{id}/required-resources` | **No** | Get required images + remote resources |

### Deployments
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/deployments` | Yes | List deployments. Query: search, id, name, status, strategy, vault, created_after/before |
| POST | `/api/deployments/create` | Yes | Create deployment. Body: name, market, replicas, timeout, strategy, job_definition, vault?, confidential? |
| GET | `/api/deployments/{deployment}` | Yes | Get specific deployment |
| DELETE | `/api/deployments/{deployment}` | Yes | Delete deployment permanently |
| POST | `/api/deployments/{deployment}/start` | Yes | Start deployment -> STARTING |
| POST | `/api/deployments/{deployment}/stop` | Yes | Stop deployment -> STOPPING |
| POST | `/api/deployments/{deployment}/archive` | Yes | Archive deployment -> ARCHIVED |
| POST | `/api/deployments/{deployment}/create-revision` | Yes | Create new revision. Body: JobDefinition |
| PATCH | `/api/deployments/{deployment}/update-active-revision` | Yes | Body: `{ active_revision }` |
| PATCH | `/api/deployments/{deployment}/update-replica-count` | Yes | Body: `{ replicas }` |
| PATCH | `/api/deployments/{deployment}/update-schedule` | Yes | Body: `{ schedule }` (cron) |
| PATCH | `/api/deployments/{deployment}/update-timeout` | Yes | Body: `{ timeout }` (min 60) |
| GET | `/api/deployments/{deployment}/events` | Yes | Deployment events. Query: category, type |
| GET | `/api/deployments/{deployment}/header` | Yes | Returns `{ header }` |
| GET | `/api/deployments/{deployment}/jobs` | Yes | Deployment jobs. Query: state, job, revision |
| GET | `/api/deployments/{deployment}/jobs/{job}` | Yes | Specific deployment job detail |
| GET | `/api/deployments/{deployment}/revisions` | Yes | List revisions |
| GET | `/api/deployments/{deployment}/tasks` | Yes | Scheduled tasks. Query: task (LIST|EXTEND|STOP), due_after/before |

### Host/Node Endpoints (called BY nodes, not users)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/deployments/jobs/{job}/job-definition` | Host | Returns job definition for a running job |
| POST | `/api/deployments/jobs/{job}/results` | Host | Post results from completed job |

### Vaults
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/deployments/vaults` | Yes | List user vaults |
| POST | `/api/deployments/vaults/create` | Yes | Create shared vault |
| POST | `/api/deployments/vaults/{vault}/withdraw` | Yes | Withdraw. Body: `{ SOL?, NOS? }`. Returns serialized tx |

### Key Response Schemas

**Market object**: `{ address, slug, name, sft, type (PREMIUM|COMMUNITY|OTHER), usd_reward_per_hour, nos_reward_per_second, nos_job_price_per_second, network_fee_percentage, gpu_types[], required_images[], required_remote_resources[], nodes[], client, lowest_vram?, max_usd_uptime_reward_per_day? }`

**Deployment object**: `{ id, name, vault, market, owner, status, replicas, timeout, endpoints[], confidential, active_revision, active_jobs, created_at, updated_at, strategy, schedule?, rotation_time? }`

**Job result (GET /api/jobs/{address})**: `{ ipfsJob, ipfsResult, market, node, payer, price, project, state (numeric), type, jobDefinition, jobResult, jobStatus, timeEnd, timeStart, benchmarkProcessedAt, timeout, usdRewardPerHour, listedAt }`

### Notable
- **No rate limits documented** anywhere in the Swagger spec
- **`x-nosana-api` header** appears on deployment routes, purpose undocumented
- **Job states differ by context**: numeric in standalone GET, string in deployment context (QUEUED/RUNNING/COMPLETED/STOPPED)
- **INFINITE strategy** requires `timeout >= 60` and `rotation_time` (seconds, must be 10 min less than timeout)

---

## 18. SDK Complete Reference (@nosana/kit v2.0.62)

### Client Creation
```typescript
import { createNosanaClient, NosanaNetwork } from '@nosana/kit';
const client = createNosanaClient(NosanaNetwork.MAINNET, {
  solana: { cluster: 'mainnet-beta', rpcEndpoint: '...', commitment: 'confirmed' },
  ipfs: { api: 'https://api.pinata.cloud', jwt: '...', gateway: 'https://gateway.pinata.cloud/ipfs/' },
  api: { apiKey: '...' },
  logLevel: 'debug',
  wallet: myWallet,
});
```

### Client Properties
| Property | Type | Description |
|----------|------|-------------|
| `client.jobs` | JobsProgram | Job operations + monitoring |
| `client.stake` | StakeProgram | Staking queries |
| `client.merkleDistributor` | MerkleDistributorProgram | Airdrop claims |
| `client.solana` | SolanaService | RPC, transactions, PDAs |
| `client.nos` | TokenService | NOS token operations |
| `client.api` | NosanaApi | REST API wrapper (jobs, markets, credits, deployments) |
| `client.ipfs` | IPFS | pin, pinFile, retrieve |
| `client.authorization` | Auth | Ed25519 signing/validation |

### JobsProgram Methods
| Method | Returns | Description |
|--------|---------|-------------|
| `get(address)` | `Job` | Single job |
| `run(address)` | `Run` | Job run details |
| `market(address)` | `Market` | Market details |
| `multiple(addresses[])` | `Job[]` | Batch job fetch |
| `all({state?, market?, node?, project?})` | `Job[]` | Filtered job list |
| `runs({job?, node?})` | `Run[]` | Filtered runs |
| `markets()` | `Market[]` | All markets |
| `monitor()` | `[AsyncIterable<SimpleMonitorEvent>, stop()]` | Real-time WebSocket (jobs+markets merged) |
| `monitorDetailed()` | `[AsyncIterable<MonitorEvent>, stop()]` | Real-time WebSocket (separate run events) |
| `post({market, timeout, ipfsHash, node?})` | Instruction | Post new job |

### JobState Enum
| State | Value |
|-------|-------|
| QUEUED | 0 |
| RUNNING | 1 |
| COMPLETED | 2 |
| STOPPED | 3 |

### API Sub-services
- `client.api.jobs` -- `.list()`, `.get()`, `.extend()`, `.stop()`
- `client.api.markets` -- `.get()`, `.list()`, `.getRequiredResources()`
- `client.api.credits` -- `.balance()` -> `{ assignedCredits, reservedCredits, settledCredits }`
- `client.api.deployments` -- `.create()`, `.get()`, `.list()`, `.pipe()`, `.vaults.create()`, `.vaults.list()`

### Error Codes
`AUTH_ERROR`, `FILE_ERROR`, `INVALID_CONFIG`, `INVALID_NETWORK`, `NO_WALLET`, `PROGRAM_ERROR`, `RPC_ERROR`, `TRANSACTION_ERROR`, `VALIDATION_ERROR`, `WALLET_CONVERSION_ERROR`

---

## 19. Node Control API (per-node endpoints)

**Base URL**: `https://<ID>.node.k8s.prd.nos.ci`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/job/<id>/ops` | GET | Check operation status |
| `/job/<id>/group/<group>/operation/<op>/stop` | POST | Stop specific operation |
| `/job/<id>/group/<group>/operation/<op>/restart` | POST | Restart specific operation |
| `/job/<id>/group/<group>/stop` | POST | Stop entire group |
| `/job/<id>/group/<group>/restart` | POST | Restart entire group |
| `/v1/chat/completions` | POST | OpenAI-compatible inference endpoint |

---

## Missing / Incomplete Information

1. **Host management endpoints** -- No `/hosts/` API routes exist in the public API. The hosts docs are purely setup/operational guides. Host-facing endpoints (`/api/deployments/jobs/{job}/job-definition` and `/results`) are called BY nodes, not for managing them.
2. **CLI full command reference** -- `/cli/` paths returned 404. Known commands: `nosana address`, `nosana job post`, `nosana job get`, `nosana market list`, `nosana market get`, `nosana node start`, `nosana --version`.
3. **Complete on-chain account structures** -- Job, Run, Stake, Reward, Vault account field layouts not fully documented.
4. **Full GPU market address list** -- Only 4 explicitly listed. Use `GET /api/markets/` for current complete list.
5. **Job error codes** -- Referenced as 6000-6018 but individual values not listed.
6. **Staking program instructions 2-10** -- Names listed but no parameter details.
7. **Default RPC endpoints / Program IDs** -- Not in docs, must check `@nosana/kit` source or `DEFAULT_CONFIGS`.
8. **`x-nosana-api` header purpose** -- Appears on all deployment routes, undocumented.
