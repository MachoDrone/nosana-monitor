#!/usr/bin/env bash
# ============================================================================
#  Nosana Fleet Monitor — Bootstrap Script
#  One-command setup for the entire Cloudflare Workers monitoring stack.
#
#  Usage:
#    bash <(curl -sL https://raw.githubusercontent.com/MachoDrone/nosana-monitor/main/bootstrap.sh)
#
#  Only prerequisite: Docker
#  Everything runs inside a container — nothing installed on your system.
# ============================================================================

set -euo pipefail

BRANCH="${NOSANA_BOOTSTRAP_BRANCH:-main}"
SCRIPT_URL="https://raw.githubusercontent.com/MachoDrone/nosana-monitor/${BRANCH}/bootstrap.sh"
REPO_URL="https://github.com/MachoDrone/nosana-monitor.git"
REPO_BRANCH="$BRANCH"

# ═══════════════════════════════════════════════════════════════════════════
#  CONTAINER SELF-LAUNCH
#  If we're on the host (not in a container), re-run ourselves inside one.
#  This way the ONLY prerequisite is Docker.
# ═══════════════════════════════════════════════════════════════════════════

if [ ! -f /.dockerenv ] && [ ! -f /run/.containerenv ]; then

    echo ""
    echo -e "\033[1m\033[0;36m"
    cat << 'BANNER'
  _   _                              _____ _           _
 | \ | | ___  ___  __ _ _ __   __ _|  ___| | ___  ___| |_
 |  \| |/ _ \/ __|/ _` | '_ \ / _` | |_  | |/ _ \/ _ \ __|
 | |\  | (_) \__ \ (_| | | | | (_| |  _| | |  __/  __/ |_
 |_| \_|\___/|___/\__,_|_| |_|\__,_|_|   |_|\___|\___|\__|

  M O N I T O R  —  B O O T S T R A P
BANNER
    echo -e "\033[0m"

    # Docker is the only prerequisite
    if ! command -v docker &>/dev/null; then
        echo -e "  \033[0;31mDocker is required to run this bootstrap.\033[0m"
        echo ""
        echo "  The monitor runs as a Docker container, so you need Docker"
        echo "  on this machine anyway. Install it first:"
        echo ""
        echo -e "  \033[0;36mhttps://docs.docker.com/engine/install/\033[0m"
        echo ""
        echo "  Quick install (Ubuntu/Debian):"
        echo "    curl -fsSL https://get.docker.com | sh"
        echo ""
        exit 1
    fi

    echo -e "  \033[1mThis script will:\033[0m"
    echo ""
    echo "    1.  Set up a bootstrap environment (Node.js container)"
    echo "    2.  Walk you through Cloudflare account setup"
    echo "    3.  Create your dashboard and push notification system"
    echo "    4.  Deploy everything automatically"
    echo "    5.  Save your credentials to a log file"
    echo ""
    echo "  Nothing is installed on your system. Everything runs inside"
    echo "  a container that is removed when the bootstrap finishes."
    echo "  The only file written to your disk is the credentials log."
    echo ""
    echo -en "  Press \033[1mEnter\033[0m to begin... "
    read -r

    echo ""
    echo -e "  \033[0;36mPreparing bootstrap environment...\033[0m"
    echo "  (Pulling Node.js container — about 30 seconds on first run)"
    echo ""

    docker run -it --rm \
        --network host \
        -v "$HOME:/hostOutput" \
        -e HOST_UID="$(id -u)" \
        -e HOST_GID="$(id -g)" \
        -e HOST_HOME="$HOME" \
        -e NOSANA_BOOTSTRAP_BRANCH="$BRANCH" \
        node:20-slim \
        bash -c "apt-get update -qq > /dev/null 2>&1 && \
                 apt-get install -y -qq git curl > /dev/null 2>&1 && \
                 npm install -g wrangler > /dev/null 2>&1 && \
                 curl -sL '${SCRIPT_URL}' -o /tmp/bootstrap.sh && \
                 bash /tmp/bootstrap.sh"

    exit $?
fi

# ═══════════════════════════════════════════════════════════════════════════
#  RUNNING INSIDE CONTAINER — MAIN BOOTSTRAP
# ═══════════════════════════════════════════════════════════════════════════

# ---------------------------------------------------------------------------
#  Colors and formatting
# ---------------------------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ---------------------------------------------------------------------------
#  Globals
# ---------------------------------------------------------------------------
LOG_FILE="/hostOutput/nosana-fleet-bootstrap.log"
HOST_HOME="${HOST_HOME:-/root}"

# ---------------------------------------------------------------------------
#  Helper functions
# ---------------------------------------------------------------------------
print_header() {
    echo -e "\n${BOLD}${CYAN}── $1 ──${NC}\n"
}

print_ok() {
    echo -e "  ${GREEN}✓${NC} $1"
}

print_fail() {
    echo -e "  ${RED}✗${NC} $1"
}

print_info() {
    echo -e "  ${CYAN}→${NC} $1"
}

print_warn() {
    echo -e "  ${YELLOW}!${NC} $1"
}

prompt_with_default() {
    local message="$1"
    local default="${2:-}"
    if [[ -n "$default" ]]; then
        echo -en "  ${YELLOW}?${NC} ${message} [${default}]: "
        read -r REPLY
        REPLY="${REPLY:-$default}"
    else
        echo -en "  ${YELLOW}?${NC} ${message}: "
        read -r REPLY
    fi
}

validate_slug() {
    local value="$1"
    local label="$2"
    if [[ -z "$value" ]]; then
        echo -e "  ${RED}Error: ${label} cannot be empty.${NC}"
        return 1
    fi
    if [[ ! "$value" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$ ]]; then
        echo -e "  ${RED}Error: ${label} must be lowercase letters, numbers, and hyphens only.${NC}"
        echo -e "  ${RED}       Cannot start or end with a hyphen.${NC}"
        return 1
    fi
    return 0
}

# ═══════════════════════════════════════════════════════════════════════════
#  STEP 1/6 — Download source code
# ═══════════════════════════════════════════════════════════════════════════

echo -e "\n${BOLD}${GREEN}  Bootstrap environment ready.${NC}\n"

print_header "Step 1/6 — Downloading source code"

print_info "Cloning ${CYAN}${REPO_URL}${NC}"
git clone --depth 1 -q -b "$REPO_BRANCH" "$REPO_URL" /tmp/nosana-monitor
print_ok "Source code ready."

# ═══════════════════════════════════════════════════════════════════════════
#  STEP 2/6 — Cloudflare account and API token
# ═══════════════════════════════════════════════════════════════════════════

print_header "Step 2/6 — Cloudflare account and API token"

echo -e "  ${BOLD}If you haven't created a Cloudflare account yet:${NC}"
echo ""
echo -e "    1. Open ${CYAN}https://dash.cloudflare.com/sign-up${NC} in your browser"
echo -e "    2. Enter your email and choose a password"
echo -e "    3. Verify you are human and click Submit"
echo -e "    4. ${BOLD}Stop${NC} — go to your email inbox and click the verification link"
echo -e "    5. You'll land on the Cloudflare dashboard"
echo -e "    6. Click ${BOLD}Skip${NC} through the onboarding questions"
echo ""
echo -e "  ${YELLOW}You do NOT need to:${NC}"
echo -e "    - Add a domain"
echo -e "    - Set up DNS"
echo -e "    - Enter payment information"
echo -e "  The free tier is all we need."
echo ""
echo -e "  Already have an account? Great — just press Enter."
echo ""
echo -en "  Press ${BOLD}Enter${NC} when your Cloudflare account is ready... "
read -r

echo ""
echo -e "  ${BOLD}Now we need an API token so this script can set up your Worker.${NC}"
echo ""
echo -e "  In the Cloudflare dashboard:"
echo ""
echo -e "    1. Click your profile icon (top right) → ${BOLD}Profile${NC}"
echo -e "    2. Click ${BOLD}API Tokens${NC} in the left menu"
echo -e "    3. Click ${BOLD}Create Token${NC}"
echo -e "    4. Find ${BOLD}Edit Cloudflare Workers${NC} and click ${BOLD}Use template${NC}"
echo -e "    5. Under Account Resources, select your account"
echo -e "    6. Under Zone Resources, select ${BOLD}All zones${NC}"
echo -e "    7. Click ${BOLD}Continue to summary${NC}"
echo -e "    8. Click ${BOLD}Create Token${NC}"
echo -e "    9. ${BOLD}Copy the token${NC} — you will only see it once"
echo ""
echo -e "  ${YELLOW}The token is a long string starting with something like: Abc1D2...${NC}"
echo ""

while true; do
    prompt_with_default "Paste your API token" ""
    CF_API_TOKEN="$REPLY"
    if [[ -z "$CF_API_TOKEN" ]]; then
        echo -e "  ${RED}Token cannot be empty.${NC}"
        continue
    fi
    # Verify the token works
    print_info "Verifying token..."
    export CLOUDFLARE_API_TOKEN="$CF_API_TOKEN"
    WHOAMI_OUTPUT=$(wrangler whoami 2>&1 || true)
    if echo "$WHOAMI_OUTPUT" | grep -qi "account"; then
        print_ok "Token verified."
        break
    else
        echo -e "  ${RED}Token verification failed. Check that you copied the full token.${NC}"
        echo -e "  ${YELLOW}Output: $(echo "$WHOAMI_OUTPUT" | tail -1)${NC}"
    fi
done

# Parse account ID
ACCOUNT_LINES=$(echo "$WHOAMI_OUTPUT" | grep -E '^\|.*\|.*[a-f0-9]{32}' || true)
if [[ -z "$ACCOUNT_LINES" ]]; then
    ACCOUNT_LINES=$(echo "$WHOAMI_OUTPUT" | grep -E '[a-f0-9]{32}' || true)
fi

ACCOUNT_ID=$(echo "$ACCOUNT_LINES" | grep -oE '[a-f0-9]{32}' | head -1 || true)

if [[ -z "$ACCOUNT_ID" ]]; then
    echo ""
    echo -e "  ${YELLOW}Could not auto-detect your Account ID.${NC}"
    echo -e "  You can find it in the Cloudflare dashboard:"
    echo -e "  ${CYAN}Workers & Pages${NC} → right sidebar shows Account ID."
    echo ""
    prompt_with_default "Enter your Cloudflare Account ID" ""
    ACCOUNT_ID="$REPLY"
fi

export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
echo -e "  ${GREEN}Account ID: ${ACCOUNT_ID}${NC}"

# ═══════════════════════════════════════════════════════════════════════════
#  STEP 3/6 — Name your dashboard
# ═══════════════════════════════════════════════════════════════════════════

print_header "Step 3/6 — Name your dashboard"

echo -e "  Choose a name for your Worker. This is just an identifier —"
echo -e "  your full dashboard URL will be shown after deployment."
echo -e "  Lowercase letters, numbers, and hyphens only."
echo ""

while true; do
    prompt_with_default "Worker name" "nosana-fleet"
    WORKER_NAME="$REPLY"
    if validate_slug "$WORKER_NAME" "Worker name"; then
        break
    fi
done

print_ok "Worker name: ${BOLD}${WORKER_NAME}${NC}"

# ═══════════════════════════════════════════════════════════════════════════
#  STEP 4/6 — Storage and encryption (automatic)
# ═══════════════════════════════════════════════════════════════════════════

print_header "Step 4/6 — Setting up storage and encryption"

echo -e "  Creating KV storage and VAPID encryption keys."
echo -e "  This is fully automatic — no input needed."
echo ""

# --- Create KV namespaces ---

print_info "Creating FLEET_DATA namespace..."
FLEET_KV_OUTPUT=$(wrangler kv namespace create FLEET_DATA 2>&1) || true

if echo "$FLEET_KV_OUTPUT" | grep -qi "already exists\|already being used"; then
    print_warn "FLEET_DATA already exists — reusing it."
    KV_LIST_OUTPUT=$(wrangler kv namespace list 2>&1 || true)
    FLEET_KV_ID=$(echo "$KV_LIST_OUTPUT" | grep -B2 "FLEET_DATA" | grep -oE '[a-f0-9]{32}' | head -1 || true)
    if [[ -z "$FLEET_KV_ID" ]]; then
        echo -e "  ${RED}Could not find FLEET_DATA namespace ID.${NC}"
        prompt_with_default "Enter FLEET_DATA namespace ID manually" ""
        FLEET_KV_ID="$REPLY"
    fi
else
    FLEET_KV_ID=$(echo "$FLEET_KV_OUTPUT" | grep -oE 'id = "[a-f0-9]+"' | grep -oE '[a-f0-9]{20,}' | head -1 || true)
    if [[ -z "$FLEET_KV_ID" ]]; then
        echo -e "  ${YELLOW}Could not parse FLEET_DATA ID from output:${NC}"
        echo "$FLEET_KV_OUTPUT"
        prompt_with_default "Enter FLEET_DATA namespace ID manually" ""
        FLEET_KV_ID="$REPLY"
    fi
fi
print_ok "FLEET_DATA: ${FLEET_KV_ID}"

print_info "Creating PUSH_SUBS namespace..."
PUSH_KV_OUTPUT=$(wrangler kv namespace create PUSH_SUBS 2>&1) || true

if echo "$PUSH_KV_OUTPUT" | grep -qi "already exists\|already being used"; then
    print_warn "PUSH_SUBS already exists — reusing it."
    KV_LIST_OUTPUT="${KV_LIST_OUTPUT:-$(wrangler kv namespace list 2>&1 || true)}"
    PUSH_KV_ID=$(echo "$KV_LIST_OUTPUT" | grep -B2 "PUSH_SUBS" | grep -oE '[a-f0-9]{32}' | head -1 || true)
    if [[ -z "$PUSH_KV_ID" ]]; then
        echo -e "  ${RED}Could not find PUSH_SUBS namespace ID.${NC}"
        prompt_with_default "Enter PUSH_SUBS namespace ID manually" ""
        PUSH_KV_ID="$REPLY"
    fi
else
    PUSH_KV_ID=$(echo "$PUSH_KV_OUTPUT" | grep -oE 'id = "[a-f0-9]+"' | grep -oE '[a-f0-9]{20,}' | head -1 || true)
    if [[ -z "$PUSH_KV_ID" ]]; then
        echo -e "  ${YELLOW}Could not parse PUSH_SUBS ID from output:${NC}"
        echo "$PUSH_KV_OUTPUT"
        prompt_with_default "Enter PUSH_SUBS namespace ID manually" ""
        PUSH_KV_ID="$REPLY"
    fi
fi
print_ok "PUSH_SUBS: ${PUSH_KV_ID}"

# --- Generate VAPID keys ---

print_info "Generating VAPID encryption keys..."
VAPID_OUTPUT=$(node -e '
const crypto = require("crypto");
const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
const rawPub = publicKey.export({ type: "spki", format: "der" });
const pubBytes = rawPub.slice(-65);
const pubB64 = Buffer.from(pubBytes).toString("base64url");
const rawPriv = privateKey.export({ type: "pkcs8", format: "der" });
const privBytes = rawPriv.slice(36, 68);
const privB64 = Buffer.from(privBytes).toString("base64url");
console.log(pubB64);
console.log(privB64);
')

VAPID_PUBLIC=$(echo "$VAPID_OUTPUT" | sed -n '1p')
VAPID_PRIVATE=$(echo "$VAPID_OUTPUT" | sed -n '2p')

if [[ -z "$VAPID_PUBLIC" || -z "$VAPID_PRIVATE" ]]; then
    echo -e "  ${RED}VAPID key generation failed.${NC}"
    exit 1
fi

print_ok "VAPID keys generated."
echo ""
print_ok "Storage and encryption ready."

# ═══════════════════════════════════════════════════════════════════════════
#  STEP 5/6 — Deploy dashboard
# ═══════════════════════════════════════════════════════════════════════════

print_header "Step 5/6 — Deploying dashboard"

echo -e "  Writing configuration and deploying to Cloudflare..."
echo ""

# Write wrangler.toml
cat > /tmp/nosana-monitor/cloudflare-worker/wrangler.toml << TOML
name = "${WORKER_NAME}"
main = "src/index.js"
compatibility_date = "2024-01-01"
account_id = "${ACCOUNT_ID}"

[triggers]
crons = ["*/2 * * * *"]

[[kv_namespaces]]
binding = "FLEET_DATA"
id = "${FLEET_KV_ID}"

[[kv_namespaces]]
binding = "PUSH_SUBS"
id = "${PUSH_KV_ID}"
TOML

print_ok "Configuration written."

# Set VAPID secrets
print_info "Storing VAPID keys as encrypted Worker secrets..."
cd /tmp/nosana-monitor/cloudflare-worker
echo "$VAPID_PUBLIC" | wrangler secret put VAPID_PUBLIC_KEY 2>&1 | tail -1
echo "$VAPID_PRIVATE" | wrangler secret put VAPID_PRIVATE_KEY 2>&1 | tail -1
print_ok "VAPID secrets stored."

# Deploy
print_info "Deploying Worker..."
DEPLOY_OUTPUT=$(cd /tmp/nosana-monitor/cloudflare-worker && wrangler deploy 2>&1)
echo "$DEPLOY_OUTPUT" | tail -3

WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-zA-Z0-9._-]+\.workers\.dev' | head -1)

if [[ -z "$WORKER_URL" ]]; then
    echo ""
    print_warn "Could not auto-detect Worker URL from deploy output."
    prompt_with_default "Enter your Worker URL (e.g., https://${WORKER_NAME}.xxx.workers.dev)" ""
    WORKER_URL="$REPLY"
fi

echo ""
print_ok "Dashboard deployed at: ${BOLD}${WORKER_URL}${NC}"

# ═══════════════════════════════════════════════════════════════════════════
#  STEP 6/6 — Fleet token and credentials
# ═══════════════════════════════════════════════════════════════════════════

print_header "Step 6/6 — Fleet token and credentials"

echo -e "  Your fleet token groups all your hosts into one dashboard."
echo -e "  Every monitor you start with the same token shows up together."
echo ""
echo -e "  Your full dashboard URL will be:"
echo ""
echo -e "    ${WORKER_URL}/d/${CYAN}____________${NC}"
echo -e "                                         ${YELLOW}↑ you choose this${NC}"
echo ""
echo -e "  Pick something short and memorable (e.g., ${CYAN}my-fleet${NC}, ${CYAN}gpu-squad${NC}, ${CYAN}lab-east${NC})."
echo ""

while true; do
    prompt_with_default "Fleet token" "my-fleet"
    FLEET_TOKEN="$REPLY"
    if validate_slug "$FLEET_TOKEN" "Fleet token"; then
        break
    fi
done

DASHBOARD_URL="${WORKER_URL}/d/${FLEET_TOKEN}"

echo ""
echo -e "  ${BOLD}Your dashboard URL:${NC}"
echo ""
echo -e "    ${GREEN}${DASHBOARD_URL}${NC}"
echo ""

# --- GitHub Actions note ---

echo -e "  ${CYAN}── Optional: Auto-Deploy ──${NC}"
echo ""
echo -e "  For automatic deploys when the code updates, add your Cloudflare"
echo -e "  API token as a GitHub secret:"
echo -e "    ${CYAN}gh secret set CLOUDFLARE_API_TOKEN --repo YOUR_USER/nosana-monitor${NC}"
echo -e "  You can skip this — manual deploys with ${BOLD}wrangler deploy${NC} work fine."
echo ""

# --- Write log file ---

echo -e "  ${BOLD}Saving credentials...${NC}"
echo ""
echo -e "  This file is your ${BOLD}deployment receipt${NC}. It contains:"
echo -e "    - Your dashboard URL (bookmark this)"
echo -e "    - The exact command to start monitoring on each host"
echo -e "    - Your VAPID keys (needed if you ever redeploy the Worker)"
echo ""
echo -e "  ${YELLOW}Without these keys, you would need to re-run the bootstrap.${NC}"
echo -e "  ${YELLOW}Keep this file safe.${NC}"
echo ""

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S %Z')

cat > "$LOG_FILE" << LOGFILE

══════════════════════════════════════════════════════════
  Nosana Fleet Monitor — Bootstrap Results
  Generated: ${TIMESTAMP}
══════════════════════════════════════════════════════════

CLOUDFLARE
  Account ID:      ${ACCOUNT_ID}
  Worker Name:     ${WORKER_NAME}
  Worker URL:      ${WORKER_URL}
  Dashboard URL:   ${DASHBOARD_URL}

KV NAMESPACES
  FLEET_DATA:      ${FLEET_KV_ID}
  PUSH_SUBS:       ${PUSH_KV_ID}

VAPID KEYS
  Public:          ${VAPID_PUBLIC}
  Private:         ${VAPID_PRIVATE}

FLEET
  Token:           ${FLEET_TOKEN}

──────────────────────────────────────────────────────────
  START MONITORING
──────────────────────────────────────────────────────────

  Run this on each Nosana host:

  bash <(wget -qO- "https://raw.githubusercontent.com/MachoDrone/nosana-monitor/main/nosana-monitor/nosana-monitor.sh") \\
    --dashboard-url "${DASHBOARD_URL}"

  Optional flags:
    --host-name "my-gpu-01"          Custom hostname
    --poll-interval 5                Health check interval (seconds)

  View logs:
    docker logs -f nosana-monitor

  Open dashboard:
    ${DASHBOARD_URL}

══════════════════════════════════════════════════════════
  KEEP THIS FILE SAFE — it contains your VAPID secrets.
  Without these keys, you would need to re-bootstrap.
══════════════════════════════════════════════════════════
LOGFILE

# Fix ownership so host user can read it (container runs as root)
if [[ -n "${HOST_UID:-}" && -n "${HOST_GID:-}" ]]; then
    chown "${HOST_UID}:${HOST_GID}" "$LOG_FILE"
fi
chmod 600 "$LOG_FILE"

print_ok "Saved to ${BOLD}${HOST_HOME}/nosana-fleet-bootstrap.log${NC}"

# ═══════════════════════════════════════════════════════════════════════════
#  FINAL SUMMARY
# ═══════════════════════════════════════════════════════════════════════════

echo ""
echo -e "${BOLD}${GREEN}"
echo "  ══════════════════════════════════════════════════════════"
echo "    Bootstrap complete!"
echo "  ══════════════════════════════════════════════════════════"
echo -e "${NC}"
echo -e "  ${BOLD}Dashboard:${NC}"
echo -e "    ${CYAN}${DASHBOARD_URL}${NC}"
echo ""
echo -e "  ${BOLD}Start monitoring on each Nosana host:${NC}"
echo ""
echo -e "    ${GREEN}bash <(wget -qO- \"https://raw.githubusercontent.com/MachoDrone/nosana-monitor/main/nosana-monitor/nosana-monitor.sh\") \\\\${NC}"
echo -e "    ${GREEN}  --dashboard-url \"${DASHBOARD_URL}\"${NC}"
echo ""
echo -e "  ${BOLD}Credentials saved to:${NC}"
echo -e "    ${CYAN}${HOST_HOME}/nosana-fleet-bootstrap.log${NC}"
echo ""
