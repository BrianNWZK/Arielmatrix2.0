#!/bin/bash
# =========================================================================
# QUANTUM AI AUTONOMOUS BUILD & DEPLOYMENT - Production Main-net
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

# Validate package-lock.json exists
validate_lockfile() {
  if [ ! -f "package-lock.json" ]; then
    err "Error: package-lock.json is missing. Please generate it using 'npm install --package-lock-only'."
    exit 1
  fi
  ok "Package-lock.json validated"
}

validate() {
  log "Validating environment..."
  for cmd in docker curl node npm; do
    command -v $cmd >/dev/null || { err "$cmd not found"; exit 1; }
  done
  validate_lockfile
  ok "Environment validated"
}

build() {
  log "Building Docker image..."
  docker buildx build --platform linux/amd64 -t "$IMAGE_NAME" . || { err "Build failed"; exit 1; }
  ok "Docker image built"
}

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
  err "Health check failed"; docker logs "$CONTAINER_NAME"; docker stop "$CONTAINER_NAME"; exit 1
}

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

rollback() {
  err "Rolling back to previous image..."
  if docker images | grep -q "${DOCKER_REGISTRY}"; then
    docker run -d --rm -p "${PORT}:${PORT}" "${DOCKER_REGISTRY}:previous"
  fi
}

main() {
  validate
  build
  test_container
  push
  ok "🎉 Deployment successful"
}
trap rollback ERR
main "$@"
