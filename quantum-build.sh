#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Define variables for easy configuration
IMAGE_NAME="arielsql-quantum-ai:latest"
CONTAINER_NAME="quantum-test"
HEALTH_CHECK_URL="http://localhost:10000/health"
HEALTH_CHECK_TIMEOUT_SECONDS=60
HEALTH_CHECK_INTERVAL_SECONDS=5

# === CLEANUP TRAP ===
# A trap ensures that the test container is always stopped and removed,
# even if the script fails unexpectedly.
function cleanup {
  echo "--- 🧹 Stopping and removing test container... 🧹 ---"
  # Use '|| true' to prevent the script from exiting if the container is already stopped.
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
# Use '-d' to run in detached mode and '--rm' to automatically remove the container on exit.
docker run -d --name "$CONTAINER_NAME" --rm -p 10000:10000 "$IMAGE_NAME"

echo "--- ⏳ Waiting for service to become available... ⏳ ---"
start_time=$(date +%s)
while true; do
  current_time=$(date +%s)
  elapsed=$((current_time - start_time))

  # Check for timeout
  if [ $elapsed -ge $HEALTH_CHECK_TIMEOUT_SECONDS ]; then
    echo "--- ❌ Health check timed out after ${HEALTH_CHECK_TIMEOUT_SECONDS} seconds. ---"
    docker logs "$CONTAINER_NAME"
    exit 1
  fi

  # Attempt a health check
  if curl --silent --fail --output /dev/null "$HEALTH_CHECK_URL"; then
    echo "--- ✅ Health check successful! The service is ready. ✅ ---"
    break
  fi

  echo "--- ⌛ Still waiting... (elapsed: ${elapsed}s/${HEALTH_CHECK_TIMEOUT_SECONDS}s) ---"
  sleep "$HEALTH_CHECK_INTERVAL_SECONDS"
done

# === DEPLOY (OPTIONAL) ===
# This section assumes you have a Docker registry set up and logged in.
# DOCKER_REGISTRY="your-registry/arielsql-quantum-ai"
# TAG="latest"
#
# echo "--- 🚀 Tagging and pushing the image to registry... 🚀 ---"
# docker tag "$IMAGE_NAME" "$DOCKER_REGISTRY:$TAG"
# docker push "$DOCKER_REGISTRY:$TAG"

echo "--- 🎯 Script completed successfully. 🎯 ---"
