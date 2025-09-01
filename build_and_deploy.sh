#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Define variables for easy configuration
IMAGE_NAME="arielsql-quantum-ai:latest"
CONTAINER_NAME="quantum-test"
PORT=8080
HEALTH_CHECK_URL="http://localhost:${PORT}/health"
HEALTH_CHECK_TIMEOUT_SECONDS=60
HEALTH_CHECK_INTERVAL_SECONDS=5

# === CLEANUP TRAP ===
function cleanup {
  echo "--- 🧹 Stopping and removing test container... 🧹 ---"
  docker stop "$CONTAINER_NAME" || true
  docker rm "$CONTAINER_NAME" || true
  echo "--- ✅ Cleanup complete. ✅ ---"
}
trap cleanup EXIT

# === BUILD ===
echo "--- 📦 Building the Docker image: ${IMAGE_NAME} 📦 ---"
DOCKER_BUILDKIT=1 docker build --no-cache -t "$IMAGE_NAME" .

# === TEST ===
echo "--- 🧪 Starting test container for health check... 🧪 ---"
docker run -d --name "$CONTAINER_NAME" --rm -p "${PORT}:${PORT}" "$IMAGE_NAME"

echo "--- ⏳ Waiting for service to become available... ⏳ ---"
start_time=$(date +%s)
while true; do
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))

  if [ $elapsed -ge $HEALTH_CHECK_TIMEOUT_SECONDS ]; then
    echo "--- ❌ Health check timed out after ${HEALTH_CHECK_TIMEOUT_SECONDS} seconds. ---"
    docker logs "$CONTAINER_NAME"
    exit 1
  fi

  if curl --silent --fail --output /dev/null "$HEALTH_CHECK_URL"; then
    echo "--- ✅ Health check successful! The service is ready. ✅ ---"
    break
  fi

  echo "--- ⌛ Still waiting... (elapsed: ${elapsed}s/${HEALTH_CHECK_TIMEOUT_SECONDS}s) ---"
  sleep "$HEALTH_CHECK_INTERVAL_SECONDS"
done

docker stop "$CONTAINER_NAME"

# === DEPLOY (OPTIONAL) ===
# This section assumes you have a Docker registry set up and logged in.
# DOCKER_REGISTRY="your-registry/arielsql-quantum-ai"
# TAG="latest"
# docker tag "$IMAGE_NAME" "$DOCKER_REGISTRY:$TAG"
# docker push "$DOCKER_REGISTRY:$TAG"

echo "--- 🎯 Script completed successfully. 🎯 ---"
