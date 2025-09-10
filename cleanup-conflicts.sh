#!/bin/bash
set -euo pipefail

# ============================================================
# CLEAN DEPLOY SCRIPT for ArielMatrix2.0
# ============================================================

IMAGE_NAME="arielmatrix2.0"
CONTAINER_NAME="arielmatrix2.0-container"
PORT=1000
HEALTH_CHECK_URL="http://localhost:${PORT}/agents/status"

log() { echo -e "\033[1;34mℹ️  $1\033[0m"; }
ok() { echo -e "\033[1;32m✅ $1\033[0m"; }
err() { echo -e "\033[1;31m❌ $1\033[0m"; }

# Step 1: Stop and remove old containers
log "Stopping old containers..."
docker ps -q --filter "name=$CONTAINER_NAME" | grep -q . && docker stop "$CONTAINER_NAME" || true
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# Step 2: Clean up Docker cache/images/volumes
log "Cleaning Docker system..."
docker system prune -af
docker volume prune -f

# Step 3: Rebuild Docker image from scratch
log "Building fresh Docker image..."
docker build --no-cache -t "$IMAGE_NAME" .

ok "Docker image built successfully"

# Step 4: Run the container
log "Starting container..."
docker run -d --rm --name "$CONTAINER_NAME" -p ${PORT}:${PORT} "$IMAGE_NAME"

# Step 5: Health check (up to 60s)
log "Checking container health..."
for i in {1..12}; do
  if curl -fs "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
    ok "Health check passed — service is running ✅"
    exit 0
  fi
  sleep 5
done

err "Health check failed — showing logs:"
docker logs "$CONTAINER_NAME"
exit 1
