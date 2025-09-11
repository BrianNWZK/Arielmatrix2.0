#!/bin/bash
# =========================================================================
# QUANTUM AI AUTONOMOUS BUILD & DEPLOYMENT - Main-Net, Zero-Simulation
# =========================================================================
set -euo pipefail
shopt -s inherit_errexit

IMAGE_NAME="arielsql-quantum-ai"
CONTAINER_NAME="quantum-mainnet"
PORT=1000
HEALTH_CHECK_URL="http://localhost:${PORT}/agents/status"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-your-registry/arielsql-quantum-ai}"
TAG="${TAG:-latest}"

log() { echo -e "\033[1;34mℹ️  $1\033[0m"; }
ok() { echo -e "\033[1;32m✅ $1\033[0m"; }
err() { echo -e "\033[1;31m❌ $1\033[0m"; }

# Validate that package-lock.json exists
validate_lockfile() {
  if [ ! -f "package-lock.json" ]; then
    err "Error: package-lock.json is missing. Please regenerate it with 'npm install --package-lock-only'."
    exit 1
  fi
  ok "Package-lock.json validated"
}

# Regenerate package-lock.json (if necessary)
regenerate_lockfile() {
  log "Regenerating package-lock.json..."
  rm -f package-lock.json
  npm install --package-lock-only --no-audit --no-fund
  git add package-lock.json
  git commit -m "fix: regenerate package-lock.json"
  ok "package-lock.json regenerated and committed"
}

# Validate environment setup
validate() {
  log "Validating environment..."
  for cmd in docker curl node npm; do
    command -v $cmd >/dev/null || { err "$cmd not found"; exit 1; }
  done
  validate_lockfile
  ok "Environment validated"
}

# Build Docker image
build() {
  log "Building Docker image..."
  docker buildx build --platform linux/amd64 -t "$IMAGE_NAME" . || { err "Docker build failed"; exit 1; }
  ok "Docker image built successfully"
}

# Test the Docker container
test_container() {
  log "Testing container..."
  docker run -d --rm --name "$CONTAINER_NAME" -p "${PORT}:${PORT}" "$IMAGE_NAME"
  for i in {1..30}; do
    if curl -fs "$HEALTH_CHECK_URL" >/dev/null; then
      ok "Health check passed"
      docker stop "$CONTAINER_NAME"
      return 0
    fi
    sleep 5
  done
  err "Health check failed"
  docker logs "$CONTAINER_NAME"
  docker stop "$CONTAINER_NAME"
  exit 1
}

# Push to Docker registry
push() {
  if [[ "$DOCKER_REGISTRY" == "your-registry/"* ]]; then
    log "Skipping push (registry not configured)"
    return 0
  fi
  log "Pushing to $DOCKER_REGISTRY:$TAG"
  docker tag "$IMAGE_NAME" "${DOCKER_REGISTRY}:${TAG}"
  docker push "${DOCKER_REGISTRY}:${TAG}" || { err "Push failed"; exit 1; }
  ok "Image pushed"
}

# Rollback function in case of failure
rollback() {
  err "Rolling back to previous image..."
  if docker images | grep -q "${DOCKER_REGISTRY}"; then
    docker run -d --rm -p "${PORT}:${PORT}" "${DOCKER_REGISTRY}:previous"
  fi
}

# Main execution function
main() {
  regenerate_lockfile
  validate
  build
  test_container
  push
  ok "🎉 Deployment successful"
}

# Trap error and rollback
trap rollback ERR

# Run main deployment process
main "$@"
