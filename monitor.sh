#!/bin/sh
set -e

VERSION="0.00.1"

# Defaults
KEY_PATH="/root/.nosana/nosana_key.json"
POLL_INTERVAL=60
NTFY_TOPIC=""

# Parse flags
while [ $# -gt 0 ]; do
  case "$1" in
    --key-path) KEY_PATH="$2"; shift 2 ;;
    --ntfy-topic) NTFY_TOPIC="$2"; shift 2 ;;
    --poll-interval) POLL_INTERVAL="$2"; shift 2 ;;
    --version) echo "nosana-monitor v${VERSION}"; exit 0 ;;
    *) shift ;;
  esac
done

# Derive pubkey
if [ ! -f "$KEY_PATH" ]; then
  echo "ERROR: Keypair not found at $KEY_PATH"
  echo "If using a custom path, pass --key-path /path/to/nosana_key.json"
  exit 1
fi

PUBKEY=$(python3 /app/derive-pubkey.py "$KEY_PATH")
if [ -z "$PUBKEY" ]; then
  echo "ERROR: Could not derive public key from $KEY_PATH"
  exit 1
fi

# Auto-generate ntfy topic if not set
FIRST8=$(echo "$PUBKEY" | head -c 8)
if [ -z "$NTFY_TOPIC" ]; then
  NTFY_TOPIC="nosana-${FIRST8}"
fi

# Startup message
echo "============================================"
echo "  Nosana Monitor v${VERSION}"
echo "============================================"
echo "  Node:  ${PUBKEY}"
echo "  Topic: ${NTFY_TOPIC}"
echo ""
echo "  Subscribe to alerts:"
echo "    Android: play.google.com/store/apps/details?id=io.heckel.ntfy"
echo "    iOS:     apps.apple.com/app/ntfy/id1625396347"
echo "    Web:     ntfy.sh/${NTFY_TOPIC}"
echo "============================================"
echo ""

# Monitor loop
HEALTH_URL="https://${PUBKEY}.node.k8s.prd.nos.ci/node/info"
ALERT_SENT=false

while true; do
  if curl -sf --max-time 10 "$HEALTH_URL" > /dev/null 2>&1; then
    if [ "$ALERT_SENT" = true ]; then
      curl -sf -H "Title: Node ONLINE" -H "Priority: default" -H "Tags: white_check_mark" \
        -d "Node ${FIRST8}... is back online" "ntfy.sh/${NTFY_TOPIC}" > /dev/null 2>&1
      ALERT_SENT=false
    fi
    echo "$(date '+%Y-%m-%d %H:%M:%S') OK - Node online"
  else
    if [ "$ALERT_SENT" = false ]; then
      curl -sf -H "Title: Node OFFLINE" -H "Priority: urgent" -H "Tags: rotating_light" \
        -d "Node ${FIRST8}... is unreachable!" "ntfy.sh/${NTFY_TOPIC}" > /dev/null 2>&1
      ALERT_SENT=true
    fi
    echo "$(date '+%Y-%m-%d %H:%M:%S') ALERT - Node unreachable"
  fi
  sleep "$POLL_INTERVAL"
done
