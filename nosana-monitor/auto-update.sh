#!/bin/sh
# Auto-update nosana-monitor: pulls latest code, rebuilds and restarts if changed.
# Run via cron: */5 * * * * /home/md/claude-nosana-alerts/nosana-monitor/auto-update.sh
set -e

REPO_DIR="/home/md/claude-nosana-alerts"
MONITOR_DIR="${REPO_DIR}/nosana-monitor"
CONTAINER_NAME="nosana-monitor"
IMAGE_NAME="nosana-monitor"
HASH_FILE="/tmp/.nosana-monitor-hash"

cd "$REPO_DIR"

# Pull latest
git fetch -q origin 2>/dev/null || exit 0
BRANCH=$(git rev-parse --abbrev-ref HEAD)
git merge -q "origin/${BRANCH}" 2>/dev/null || exit 0

# Check if monitor source changed
NEW_HASH=$(sha256sum "${MONITOR_DIR}/monitor.sh" "${MONITOR_DIR}/Dockerfile" "${MONITOR_DIR}/derive-pubkey.py" 2>/dev/null | sha256sum | cut -d' ' -f1)
OLD_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")

if [ "$NEW_HASH" = "$OLD_HASH" ]; then
  exit 0
fi

echo "$(date '+%Y-%m-%d %H:%M:%S') Monitor source changed, rebuilding..."

# Capture current container args
CURRENT_ARGS=$(docker inspect "$CONTAINER_NAME" --format '{{range .Args}}{{.}} {{end}}' 2>/dev/null || echo "")
if [ -z "$CURRENT_ARGS" ]; then
  echo "WARNING: Could not read container args, skipping update"
  exit 1
fi

# Build new image
docker build -q -t "${IMAGE_NAME}:latest" "$MONITOR_DIR" || exit 1

# Restart with same args
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -v /home/md/.nosana:/root/.nosana:ro \
  "${IMAGE_NAME}:latest" $CURRENT_ARGS

echo "$NEW_HASH" > "$HASH_FILE"
echo "$(date '+%Y-%m-%d %H:%M:%S') Monitor updated and restarted"
