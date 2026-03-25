#!/bin/sh
# Auto-update nosana-monitor: watches git for changes, rebuilds and restarts.
# Run as: nohup ./auto-update.sh &
# Or:     systemctl start nosana-auto-update

REPO_DIR="/home/md/claude-nosana-alerts"
MONITOR_DIR="${REPO_DIR}/nosana-monitor"
CONTAINER_NAME="nosana-monitor"
IMAGE_NAME="nosana-monitor"
HASH_FILE="/tmp/.nosana-monitor-hash"
POLL_INTERVAL=10

cd "$REPO_DIR" || exit 1

echo "$(date '+%Y-%m-%d %H:%M:%S') Auto-update watcher started (${POLL_INTERVAL}s interval)"

while true; do
  # Pull latest
  git fetch -q origin 2>/dev/null || { sleep "$POLL_INTERVAL"; continue; }
  BRANCH=$(git rev-parse --abbrev-ref HEAD)
  git merge -q "origin/${BRANCH}" 2>/dev/null || { sleep "$POLL_INTERVAL"; continue; }

  # Check if monitor source changed
  NEW_HASH=$(sha256sum "${MONITOR_DIR}/monitor.sh" "${MONITOR_DIR}/Dockerfile" "${MONITOR_DIR}/derive-pubkey.py" 2>/dev/null | sha256sum | cut -d' ' -f1)
  OLD_HASH=$(cat "$HASH_FILE" 2>/dev/null || echo "")

  if [ "$NEW_HASH" != "$OLD_HASH" ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') Monitor source changed, rebuilding..."

    # Capture current container args
    CURRENT_ARGS=$(docker inspect "$CONTAINER_NAME" --format '{{range .Args}}{{.}} {{end}}' 2>/dev/null || echo "")
    if [ -z "$CURRENT_ARGS" ]; then
      echo "WARNING: Could not read container args, skipping update"
      echo "$NEW_HASH" > "$HASH_FILE"
      sleep "$POLL_INTERVAL"
      continue
    fi

    # Build new image
    if docker build -q -t "${IMAGE_NAME}:latest" "$MONITOR_DIR"; then
      docker rm -f "$CONTAINER_NAME" 2>/dev/null || true
      docker run -d \
        --name "$CONTAINER_NAME" \
        --restart unless-stopped \
        -v /home/md/.nosana:/root/.nosana:ro \
        -v nosana-monitor-state:/state \
        -v /var/run/docker.sock:/var/run/docker.sock \
        "${IMAGE_NAME}:latest" $CURRENT_ARGS
      echo "$(date '+%Y-%m-%d %H:%M:%S') Monitor updated and restarted"
    else
      echo "$(date '+%Y-%m-%d %H:%M:%S') Build failed, skipping"
    fi

    echo "$NEW_HASH" > "$HASH_FILE"
  fi

  sleep "$POLL_INTERVAL"
done
