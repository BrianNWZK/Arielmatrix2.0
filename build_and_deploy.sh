#!/bin/bash
# =========================================================================
# UNIFIED BUILD & CLEAN DEPLOY SCRIPT for ArielMatrix2.0
# =========================================================================
set -euo pipefail
shopt -s inherit_errexit

IMAGE_NAME="arielmatrix2.0"
CONTAINER_NAME="arielmatrix2.0-container"
PORT=1000
HEALTH_CHECK_URL="http://localhost:${PORT}/agents/status"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-your-registry/arielmatrix2.0}"
TAG="${TAG:-latest}"

log() { echo -e "\033[1;34mℹ️  $1\033[0m"; }
ok() { echo -e "\033[1;32m✅ $1\033[0m"; }
warn() { echo -e "\033[1;33m⚠️  $1\033[0m"; }
err() { echo -e "\033[1;31m❌ $1\033[0m"; }

# Step 0: Run cleanup-conflicts.sh if available
if [ -f "./cleanup-conflicts.sh" ]; then
  log "Running cleanup-conflicts.sh..."
  ./cleanup-conflicts.sh || { err "Conflict cleanup failed"; exit 1; }
fi

# Step 1: Stop old containers
log "Stopping old containers..."
docker ps -q --filter "name=$CONTAINER_NAME" | grep -q . && docker stop "$CONTAINER_NAME" || true
docker rm -f "$CONTAINER_NAME" 2>/dev/null || true

# Step 2: Clean up Docker cache/images/volumes
log "Cleaning Docker system..."
docker system prune -af
docker volume prune -f

# Step 3: Validate package-lock.json exists
if [ ! -f "package-lock.json" ]; then
  err "Error: package-lock.json is missing. Run 'npm install --package-lock-only'."
  exit 1
fi
ok "package-lock.json validated"

# Step 4: Build Docker image from scratch
log "Building fresh Docker image..."
docker build --no-cache -t "$IMAGE_NAME" . || { err "Docker build failed"; exit 1; }
ok "Docker image built successfully"

# Step 5: Run container
log "Starting container..."
docker run -d --rm --name "$CONTAINER_NAME" -p ${PORT}:${PORT} "$IMAGE_NAME"

# Step 6: Health check (60s max)
log "Performing health check..."
for i in {1..12}; do
  if curl -fs "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
    ok "Health check passed — service is running"
    break
  fi
  sleep 5
done

if ! curl -fs "$HEALTH_CHECK_URL" >/dev/null 2>&1; then
  err "Health check failed — showing logs:"
  docker logs "$CONTAINER_NAME"
  docker stop "$CONTAINER_NAME"
  exit 1
fi

# Step 7: Push to registry if configured
if [[ "$DOCKER_REGISTRY" == "your-registry/"* ]]; then
  warn "Skipping push (registry not configured)"
else
  log "Pushing image to $DOCKER_REGISTRY:$TAG..."
  docker tag "$IMAGE_NAME" "${DOCKER_REGISTRY}:${TAG}"
  docker push "${DOCKER_REGISTRY}:${TAG}" || { err "Push failed"; exit 1; }
  ok "Image pushed successfully"
fi

ok "🎉 Deployment successful"
