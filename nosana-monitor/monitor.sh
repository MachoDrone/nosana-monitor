#!/bin/sh
set -e

VERSION="0.01.9"

# Defaults
KEY_PATH="/root/.nosana/nosana_key.json"
POLL_INTERVAL=5
NTFY_TOPIC=""
FAIL_THRESHOLD=36
LOG_FILE=""
MATRIX_ROOM=""
MATRIX_SERVER="https://matrix.org"
MATRIX_USER=""
MATRIX_PASS=""
MATRIX_BOT_USER=""
MATRIX_BOT_PASS=""
STATUS_INTERVAL=1800  # 30 minutes in seconds
DASHBOARD_URL=""
HOST_NAME=""
DASHBOARD_INTERVAL=600  # 10 minutes in seconds

# Parse flags
while [ $# -gt 0 ]; do
  case "$1" in
    --key-path) KEY_PATH="$2"; shift 2 ;;
    --ntfy-topic) NTFY_TOPIC="$2"; shift 2 ;;
    --poll-interval) POLL_INTERVAL="$2"; shift 2 ;;
    --fail-threshold) FAIL_THRESHOLD="$2"; shift 2 ;;
    --log) LOG_FILE="$2"; shift 2 ;;
    --matrix-room) MATRIX_ROOM="$2"; shift 2 ;;
    --matrix-server) MATRIX_SERVER="$2"; shift 2 ;;
    --matrix-user) MATRIX_USER="$2"; shift 2 ;;
    --matrix-pass) MATRIX_PASS="$2"; shift 2 ;;
    --matrix-bot-user) MATRIX_BOT_USER="$2"; shift 2 ;;
    --matrix-bot-pass) MATRIX_BOT_PASS="$2"; shift 2 ;;
    --dashboard-url) DASHBOARD_URL="$2"; shift 2 ;;
    --host-name) HOST_NAME="$2"; shift 2 ;;
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

# URL-encode Matrix room ID (! and : need encoding)
MATRIX_ROOM_ENCODED=$(printf '%s' "$MATRIX_ROOM" | sed 's/!/%21/g; s/:/%3A/g')
TXN_COUNTER=0
MATRIX_TOKEN=""
MATRIX_BOT_TOKEN=""

# Matrix login: returns access token or empty string
# Usage: matrix_login "username" "password"
matrix_login() {
  _user="$1"
  _pass="$2"
  _login_payload=$(jq -n --arg u "$_user" --arg p "$_pass" \
    '{"type":"m.login.password","identifier":{"type":"m.id.user","user":$u},"password":$p}')
  _response=$(curl -sf --max-time 10 -X POST \
    -H "Content-Type: application/json" \
    -d "$_login_payload" \
    "${MATRIX_SERVER}/_matrix/client/v3/login" 2>/dev/null) || true
  printf '%s' "$_response" | jq -r '.access_token // empty' 2>/dev/null
}

# Matrix auto-join room
# Usage: matrix_join "token"
matrix_join() {
  _token="$1"
  curl -sf --max-time 10 -X POST \
    -H "Authorization: Bearer ${_token}" \
    -H "Content-Type: application/json" \
    -d '{}' \
    "${MATRIX_SERVER}/_matrix/client/v3/join/${MATRIX_ROOM_ENCODED}" > /dev/null 2>&1 || true
}

# Matrix invite user to room
# Usage: matrix_invite "inviter_token" "invitee_user_id"
matrix_invite() {
  _token="$1"
  _invitee="$2"
  curl -sf --max-time 10 -X POST \
    -H "Authorization: Bearer ${_token}" \
    -H "Content-Type: application/json" \
    -d "{\"user_id\":\"${_invitee}\"}" \
    "${MATRIX_SERVER}/_matrix/client/v3/rooms/${MATRIX_ROOM_ENCODED}/invite" > /dev/null 2>&1 || true
}

# Matrix setup: login both accounts, invite bot, join room
if [ -n "$MATRIX_ROOM" ] && [ -n "$MATRIX_USER" ] && [ -n "$MATRIX_BOT_USER" ]; then
  echo "Matrix: logging in..."

  MATRIX_TOKEN=$(matrix_login "$MATRIX_USER" "$MATRIX_PASS")
  if [ -z "$MATRIX_TOKEN" ]; then
    echo "ERROR: Matrix login failed for ${MATRIX_USER}"
  else
    echo "  Sysop login: OK"
    matrix_join "$MATRIX_TOKEN"
  fi

  MATRIX_BOT_TOKEN=$(matrix_login "$MATRIX_BOT_USER" "$MATRIX_BOT_PASS")
  if [ -z "$MATRIX_BOT_TOKEN" ]; then
    echo "ERROR: Matrix login failed for ${MATRIX_BOT_USER}"
  else
    echo "  Bot login: OK"
    # Sysop invites bot, then bot joins
    if [ -n "$MATRIX_TOKEN" ]; then
      _bot_server=$(printf '%s' "$MATRIX_SERVER" | sed 's|https\?://||')
      matrix_invite "$MATRIX_TOKEN" "@${MATRIX_BOT_USER}:${_bot_server}"
    fi
    matrix_join "$MATRIX_BOT_TOKEN"
  fi

  if [ -z "$MATRIX_TOKEN" ] || [ -z "$MATRIX_BOT_TOKEN" ]; then
    echo "WARNING: Matrix alerts disabled (login failed)"
    MATRIX_ROOM=""
  fi
elif [ -n "$MATRIX_ROOM" ]; then
  echo "ERROR: Matrix requires --matrix-user, --matrix-pass, --matrix-bot-user, --matrix-bot-pass"
  echo "  Matrix alerts disabled."
  MATRIX_ROOM=""
fi

# Map ntfy tags to emoji for Matrix
tag_emoji() {
  case "$1" in
    green_heart)       printf '💚' ;;
    white_check_mark)  printf '✅' ;;
    large_blue_circle) printf '🔵' ;;
    yellow_circle)     printf '🟡' ;;
    rotating_light)    printf '🚨' ;;
    *) printf '' ;;
  esac
}

# Send a Matrix message with the given token
# Usage: matrix_send "token" "message_text"
matrix_send() {
  _token="$1"
  _msg="$2"
  TXN_COUNTER=$((TXN_COUNTER + 1))
  _txn="$(date +%s)${TXN_COUNTER}"
  _payload=$(printf '%s' "$_msg" | jq -Rs '{"msgtype":"m.text","body":.}')
  curl -sf -X PUT \
    -H "Authorization: Bearer ${_token}" \
    -H "Content-Type: application/json" \
    -d "$_payload" \
    "${MATRIX_SERVER}/_matrix/client/v3/rooms/${MATRIX_ROOM_ENCODED}/send/m.room.message/${_txn}" > /dev/null 2>&1 || true
}

# Unified notification sender: ntfy + Matrix + log
# Usage: send_notify "Title" "Body" "priority" "tag" "matrix_tier"
#   matrix_tier: "silent" = sysop token (right-aligned, no ding)
#                "alert"  = bot token (left-aligned, push notification)
send_notify() {
  _title="$1"
  _body="$2"
  _priority="$3"
  _tag="$4"
  _tier="$5"

  # ntfy
  if [ -n "$NTFY_TOPIC" ]; then
    curl -sf -H "Title: ${_title}" -H "Priority: ${_priority}" -H "Tags: ${_tag}" \
      -d "$_body" "ntfy.sh/${NTFY_TOPIC}" > /dev/null 2>&1 || true
  fi

  # Matrix
  if [ -n "$MATRIX_ROOM" ]; then
    _emoji=$(tag_emoji "$_tag")
    _msg=$(printf '%s %s\n%s' "$_emoji" "$_title" "$_body")
    if [ "$_tier" = "alert" ]; then
      matrix_send "$MATRIX_BOT_TOKEN" "$_msg"
    else
      matrix_send "$MATRIX_TOKEN" "$_msg"
    fi
  fi

  # Log
  if [ -n "$LOG_FILE" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') SEND [${_tier}] [${_title}] ${_body}" >> "$LOG_FILE"
  fi
}

# Dashboard push: send host status to Cloudflare Worker
# Usage: dashboard_push "n_status" "queue_pos"
#   n_status: 1=node up, 0=node down
#   queue_pos: queue position string or "-"
dashboard_push() {
  if [ -z "$DASHBOARD_URL" ]; then return; fi
  _n="$1"
  _q="$2"
  _host="${HOST_NAME:-$(hostname)}"
  curl -sf --max-time 5 -X POST "$DASHBOARD_URL" \
    -H "Content-Type: application/json" \
    -d "{\"host\":\"${_host}\",\"n\":${_n},\"q\":\"${_q}\"}" >/dev/null 2>&1 || true
}

# Startup message
echo "============================================"
echo "  Nosana Monitor v${VERSION}"
echo "============================================"
echo "  Node:  ${PUBKEY}"
echo "  Topic: ${NTFY_TOPIC}"
if [ -n "$MATRIX_ROOM" ]; then
  echo "  Matrix: ${MATRIX_ROOM}"
fi
if [ -n "$DASHBOARD_URL" ]; then
  echo "  Dashboard: ${DASHBOARD_URL}"
  echo "  Host name: ${HOST_NAME:-$(hostname)}"
  echo "  Dashboard push: ${DASHBOARD_INTERVAL}s"
fi
echo "  Health poll: ${POLL_INTERVAL}s"
echo "  Status poll: ${STATUS_INTERVAL}s"
echo "  Offline after: ${FAIL_THRESHOLD} failures ($(( FAIL_THRESHOLD * POLL_INTERVAL ))s)"
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
LAST_DASHBOARD_PUSH=0
LAST_DASHBOARD_STATE=""
LAST_STATE=""
LAST_STATUS=""
STATE_SINCE=""
STUCK_ALERT_SENT=false
STUCK_THRESHOLD=600  # 10 minutes in seconds
STATE_COUNTS_FILE="/tmp/nosana-state-counts"
LAST_STATUS_CHECK=0
LAST_NODE_INFO=""

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

# Parse node info fields for heartbeat
get_node_info() {
  _json="$1"
  _uptime=$(printf '%s' "$_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('uptime','?'))" 2>/dev/null || echo "?")
  _version=$(printf '%s' "$_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('info',{}).get('version','?'))" 2>/dev/null || echo "?")
  _ping=$(printf '%s' "$_json" | python3 -c "import sys,json; print(json.load(sys.stdin).get('info',{}).get('network',{}).get('ping_ms','?'))" 2>/dev/null || echo "?")
  _gpu=$(printf '%s' "$_json" | python3 -c "import sys,json; d=json.load(sys.stdin).get('info',{}).get('gpus',{}).get('devices',[]); print(d[0]['name'] if d else '?')" 2>/dev/null || echo "?")
  printf 'v%s | ping:%sms | %s | up:%s' "$_version" "$_ping" "$_gpu" "$_uptime"
}

reset_state_counts

while true; do
  NOW=$(date +%s)
  CURRENT_HOUR=$(date '+%Y-%m-%d %H')

  HEALTH_RESPONSE=$(curl -sf --max-time 10 "$HEALTH_URL" 2>/dev/null) || true
  if [ -n "$HEALTH_RESPONSE" ]; then
    # Parse state from response
    CURRENT_STATE=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('state','UNKNOWN'))" 2>/dev/null || echo "UNKNOWN")

    # Cache full response for heartbeat
    LAST_NODE_INFO="$HEALTH_RESPONSE"

    # Track state counts
    increment_state "$CURRENT_STATE"

    if [ "$ALERT_SENT" = true ]; then
      DOWN_MIN=$(( (NOW - DOWN_SINCE) / 60 ))
      send_notify "ONLINE: ${FIRST8}" "Health endpoint recovered after ~${DOWN_MIN} min" "default" "white_check_mark" "alert"
      ALERT_SENT=false
    fi
    FAIL_COUNT=0
    DOWN_SINCE=""

    # State change detection
    if [ -n "$LAST_STATE" ] && [ "$CURRENT_STATE" != "$LAST_STATE" ]; then
      send_notify "State: ${CURRENT_STATE}" "${FIRST8}: ${LAST_STATE} -> ${CURRENT_STATE}" "min" "large_blue_circle" "silent"
      echo "$(date '+%Y-%m-%d %H:%M:%S') STATE - ${LAST_STATE} -> ${CURRENT_STATE}"
      STATE_SINCE=$NOW
      STUCK_ALERT_SENT=false
    fi
    LAST_STATE="$CURRENT_STATE"

    # Stuck in RESTARTING detection
    if [ "$CURRENT_STATE" = "RESTARTING" ] && [ -n "$STATE_SINCE" ] && [ "$STUCK_ALERT_SENT" = false ]; then
      STATE_DURATION=$(( NOW - STATE_SINCE ))
      if [ "$STATE_DURATION" -ge "$STUCK_THRESHOLD" ]; then
        STATE_MIN=$(( STATE_DURATION / 60 ))
        send_notify "STUCK: ${FIRST8}" "RESTARTING for ${STATE_MIN} min — check SOL balance, NOS stake, or node logs" "urgent" "rotating_light" "alert"
        echo "$(date '+%Y-%m-%d %H:%M:%S') STUCK - RESTARTING for ${STATE_MIN} min"
        STUCK_ALERT_SENT=true
      fi
    fi

    # Status check (tier) — every STATUS_INTERVAL seconds
    if [ $(( NOW - LAST_STATUS_CHECK )) -ge "$STATUS_INTERVAL" ]; then
      STATUS_HTTP=$(curl -s --max-time 10 -o /tmp/status_response -w "%{http_code}" "$STATUS_URL" 2>/dev/null) || true
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
        send_notify "Status: ${CURRENT_STATUS}" "${FIRST8}: ${LAST_STATUS} -> ${CURRENT_STATUS}" "high" "yellow_circle" "alert"
        echo "$(date '+%Y-%m-%d %H:%M:%S') STATUS - ${LAST_STATUS} -> ${CURRENT_STATUS}"
      fi
      LAST_STATUS="$CURRENT_STATUS"
      LAST_STATUS_CHECK=$NOW
    fi

    # Startup heartbeat or hourly heartbeat with node info
    if [ "$FIRST_RUN" = true ]; then
      NODE_INFO=$(get_node_info "$HEALTH_RESPONSE")
      send_notify "Heartbeat - STARTED" "Node ${FIRST8}... ${CURRENT_STATE} | ${NODE_INFO}" "min" "green_heart" "silent"
      LAST_HEARTBEAT="$CURRENT_HOUR"
      FIRST_RUN=false
    elif [ "$CURRENT_HOUR" != "$LAST_HEARTBEAT" ]; then
      STATE_SUMMARY=$(get_state_summary)
      NODE_INFO=$(get_node_info "$LAST_NODE_INFO")
      send_notify "Heartbeat" "Node ${FIRST8}... ${STATE_SUMMARY}| ${NODE_INFO} | tier:${LAST_STATUS}" "min" "green_heart" "silent"
      LAST_HEARTBEAT="$CURRENT_HOUR"
      echo "$(date '+%Y-%m-%d %H:%M:%S') HEARTBEAT - ${STATE_SUMMARY}"
      reset_state_counts
    fi
    echo "$(date '+%Y-%m-%d %H:%M:%S') OK - ${CURRENT_STATE}"
  else
    FAIL_COUNT=$((FAIL_COUNT + 1))
    if [ -z "$DOWN_SINCE" ]; then
      DOWN_SINCE=$NOW
    fi
    if [ "$FAIL_COUNT" -ge "$FAIL_THRESHOLD" ] && [ "$ALERT_SENT" = false ]; then
      DOWN_MIN=$(( (NOW - DOWN_SINCE) / 60 ))
      send_notify "OFFLINE: ${FIRST8}" "Health endpoint may be down (~${DOWN_MIN} min)" "urgent" "rotating_light" "alert"
      ALERT_SENT=true
    fi
    echo "$(date '+%Y-%m-%d %H:%M:%S') WARN - Node unreachable (${FAIL_COUNT}/${FAIL_THRESHOLD})"
  fi

  # Dashboard push: immediate on state change, otherwise every DASHBOARD_INTERVAL
  if [ -n "$DASHBOARD_URL" ]; then
    if [ -n "$HEALTH_RESPONSE" ]; then
      _dash_n=1
      _dash_q=$(echo "$HEALTH_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('queue','-'))" 2>/dev/null || echo "-")
    else
      _dash_n=0
      _dash_q="-"
    fi
    _dash_state="${_dash_n}:${_dash_q}"
    if [ "$_dash_state" != "$LAST_DASHBOARD_STATE" ]; then
      dashboard_push "$_dash_n" "$_dash_q"
      LAST_DASHBOARD_PUSH=$NOW
      LAST_DASHBOARD_STATE="$_dash_state"
    elif [ $(( NOW - LAST_DASHBOARD_PUSH )) -ge "$DASHBOARD_INTERVAL" ]; then
      dashboard_push "$_dash_n" "$_dash_q"
      LAST_DASHBOARD_PUSH=$NOW
    fi
  fi

  sleep "$POLL_INTERVAL"
done
