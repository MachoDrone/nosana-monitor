#!/bin/bash
# Nosana Monitor - Zero-config monitoring for Nosana GPU nodes
# Usage: bash <(wget -qO- "https://raw.githubusercontent.com/MachoDrone/nosana-monitor/main/nosana-monitor.sh")

set -e

REPO="https://github.com/MachoDrone/nosana-monitor.git"
BUILD_DIR="/tmp/nosana-monitor-build"
IMAGE_NAME="nosana-monitor"
CONTAINER_NAME="nosana-monitor"
NOSANA_DIR="${HOME}/.nosana"

echo "============================================"
echo "  Nosana Monitor - Installer"
echo "============================================"

# Check Docker
if ! command -v docker &> /dev/null; then
  echo "ERROR: Docker is not installed."
  exit 1
fi

# Stop existing monitor if running
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Stopping existing nosana-monitor..."
  docker rm -f "$CONTAINER_NAME" > /dev/null 2>&1
fi

# Clone or update repo
if [ -d "$BUILD_DIR" ]; then
  echo "Updating source..."
  cd "$BUILD_DIR" && git pull -q
else
  echo "Downloading source..."
  git clone -q "$REPO" "$BUILD_DIR"
fi

# Build image
echo "Building container..."
docker build -q -t "$IMAGE_NAME" "$BUILD_DIR/nosana-monitor"

# Run container
echo "Starting monitor..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -v "${NOSANA_DIR}:/root/.nosana:ro" \
  -v nosana-monitor-state:/state \
  -v /var/run/docker.sock:/var/run/docker.sock \
  "$IMAGE_NAME" "$@"

echo ""
echo "Monitor is running. View logs with:"
echo "  docker logs -f ${CONTAINER_NAME}"
echo ""
