#!/bin/sh
set -e

VERSION="0.01.0"

# Defaults
KEY_PATH="/root/.nosana/nosana_key.json"
POLL_INTERVAL=60
NTFY_TOPIC=""
FAIL_THRESHOLD=3

# Parse flags
while [ $# -gt 0 ]; do
  case "$1" in
    --key-path) KEY_PATH="$2"; shift 2 ;;
    --ntfy-topic) NTFY_TOPIC="$2"; shift 2 ;;
    --poll-interval) POLL_INTERVAL="$2"; shift 2 ;;
    --fail-threshold) FAIL_THRESHOLD="$2"; shift 2 ;;
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
STATUS_URL="https://dashboard.k8s.prd.nos.ci/api/nodes/${PUBKEY}/specs"
ALERT_SENT=false
LAST_HEARTBEAT=""
FIRST_RUN=true
FAIL_COUNT=0
DOWN_SINCE=""
LAST_STATE=""
LAST_STATUS=""
STATE_COUNTS_FILE="/tmp/nosana-state-counts"

# Reset state counts
reset_state_counts() {
  rm -f "$STATE_COUNTS_FILE"
  touch "$STATE_COUNTS_FILE"
}

# Increment a state count
increment_state() {
  _state="$1"
  _current=$(grep "^${_state}=" "$STATE_COUNTS_FILE" 2>/dev/null | cut -d= -f2)
  _current=${_current:-0}
  _new=$((_current + 1))
  if grep -q "^${_state}=" "$STATE_COUNTS_FILE" 2>/dev/null; then
    sed -i "s/^${_state}=.*/${_state}=${_new}/" "$STATE_COUNTS_FILE"
  else
    echo "${_state}=${_new}" >> "$STATE_COUNTS_FILE"
  fi
}

# Format state counts as a summary string
get_state_summary() {
  sort -t= -k2 -rn "$STATE_COUNTS_FILE" | while IFS='=' read -r _s _c; do
    printf "%s:%s " "$_s" "$_c"
  done
}

reset_state_counts

while true; do
  CURRENT_HOUR=$(date '+%Y-%m-%d %H')

  HEALTH_RESPONSE=$(curl -sf --max-time 10 "$HEALTH_URL" 2>/dev/null)
  if [ -n "$HEALTH_RESPONSE" ]; then
    # Parse state from response
    CURRENT_STATE=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")

    # Track state counts for debugging
    increment_state "$CURRENT_STATE"

    if [ "$ALERT_SENT" = true ]; then
      DOWN_MIN=$(( ($(date +%s) - DOWN_SINCE) / 60 ))
      curl -sf -H "Title: ONLINE: ${FIRST8}" -H "Priority: default" -H "Tags: white_check_mark" \
        -d "Health endpoint recovered after ~${DOWN_MIN} min: ${HEALTH_URL}" "ntfy.sh/${NTFY_TOPIC}" > /dev/null 2>&1
      ALERT_SENT=false
    fi
    FAIL_COUNT=0
    DOWN_SINCE=""

    # State change detection
    if [ -n "$LAST_STATE" ] && [ "$CURRENT_STATE" != "$LAST_STATE" ]; then
      curl -sf -H "Title: State: ${CURRENT_STATE}" -H "Priority: min" -H "Tags: large_blue_circle" \
        -d "${FIRST8}: ${LAST_STATE} -> ${CURRENT_STATE}" "ntfy.sh/${NTFY_TOPIC}" > /dev/null 2>&1
      echo "$(date '+%Y-%m-%d %H:%M:%S') STATE - ${LAST_STATE} -> ${CURRENT_STATE}"
    fi
    LAST_STATE="$CURRENT_STATE"

    # Status check (tier: PREMIUM/ONBOARDED/COMMUNITY) - check once per poll
    STATUS_HTTP=$(curl -s --max-time 10 -o /tmp/status_response -w "%{http_code}" "$STATUS_URL" 2>/dev/null)
    if [ "$STATUS_HTTP" = "404" ]; then
      CURRENT_STATUS="NOT_FOUND (404 error)"
    elif [ "$STATUS_HTTP" = "000" ] || [ -z "$STATUS_HTTP" ]; then
      CURRENT_STATUS="API REQUEST FAILED"
    elif [ "$STATUS_HTTP" = "200" ]; then
      CURRENT_STATUS=$(python3 -c "import sys,json; print(json.load(open('/tmp/status_response')).get('status','PARSE_ERROR, UNKNOWN'))" 2>/dev/null || echo "PARSE_ERROR, UNKNOWN")
    else
      CURRENT_STATUS="API REQUEST FAILED (HTTP ${STATUS_HTTP})"
    fi
    if [ -n "$LAST_STATUS" ] && [ "$CURRENT_STATUS" != "$LAST_STATUS" ]; then
      curl -sf -H "Title: Status: ${CURRENT_STATUS}" -H "Priority: high" -H "Tags: yellow_circle" \
        -d "${FIRST8}: ${LAST_STATUS} -> ${CURRENT_STATUS}" "ntfy.sh/${NTFY_TOPIC}" > /dev/null 2>&1
      echo "$(date '+%Y-%m-%d %H:%M:%S') STATUS - ${LAST_STATUS} -> ${CURRENT_STATUS}"
    fi
    LAST_STATUS="$CURRENT_STATUS"

    # Startup heartbeat or silent hourly heartbeat (only when healthy)
    if [ "$FIRST_RUN" = true ]; then
      curl -sf -H "Title: Heartbeat - STARTED" -H "Priority: min" -H "Tags: green_heart" \
        -d "Node ${FIRST8}... monitor started, state: ${CURRENT_STATE}" "ntfy.sh/${NTFY_TOPIC}" > /dev/null 2>&1
      LAST_HEARTBEAT="$CURRENT_HOUR"
      FIRST_RUN=false
    elif [ "$CURRENT_HOUR" != "$LAST_HEARTBEAT" ]; then
      STATE_SUMMARY=$(get_state_summary)
      curl -sf -H "Title: Heartbeat" -H "Priority: min" -H "Tags: green_heart" \
        -d "Node ${FIRST8}... ${STATE_SUMMARY}" "ntfy.sh/${NTFY_TOPIC}" > /dev/null 2>&1
      LAST_HEARTBEAT="$CURRENT_HOUR"
      echo "$(date '+%Y-%m-%d %H:%M:%S') HEARTBEAT - ${STATE_SUMMARY}"
      reset_state_counts
    fi
    echo "$(date '+%Y-%m-%d %H:%M:%S') OK - ${CURRENT_STATE}"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    if [ -z "$DOWN_SINCE" ]; then
      DOWN_SINCE=$(date +%s)
    fi
    if [ "$FAIL_COUNT" -ge "$FAIL_THRESHOLD" ] && [ "$ALERT_SENT" = false ]; then
      DOWN_MIN=$(( ($(date +%s) - DOWN_SINCE) / 60 ))
      curl -sf -H "Title: OFFLINE: ${FIRST8}" -H "Priority: urgent" -H "Tags: rotating_light" \
        -d "Health endpoint may be down (~${DOWN_MIN} min): ${HEALTH_URL}" "ntfy.sh/${NTFY_TOPIC}" > /dev/null 2>&1
      ALERT_SENT=true
    fi
    echo "$(date '+%Y-%m-%d %H:%M:%S') WARN - Node unreachable (${FAIL_COUNT}/${FAIL_THRESHOLD})"
  fi
  sleep "$POLL_INTERVAL"
done
