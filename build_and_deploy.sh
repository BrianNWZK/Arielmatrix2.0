#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Define variables for easy configuration
IMAGE_NAME="arielsql-quantum-ai:latest"
CONTAINER_NAME="quantum-test"
PORT=1000
HEALTH_CHECK_URL="http://localhost:${PORT}/health"
HEALTH_CHECK_TIMEOUT_SECONDS=60
HEALTH_CHECK_INTERVAL_SECONDS=5
DOCKER_REGISTRY="your-registry/arielsql-quantum-ai"
TAG="latest"

# === CLEANUP TRAP ===
function cleanup {
  echo "--- 🧹 Stopping and removing test container... 🧹 ---"
  docker stop "$CONTAINER_NAME" || true
  docker rm "$CONTAINER_NAME" || true
  echo "--- ✅ Cleanup complete. ✅ ---"
}
trap cleanup EXIT

# === PRE-BUILD CHECKS ===
echo "--- 🔍 Checking for required files... 🔍 ---"

# Check if wallet.js exists
if [ ! -f "./backend/agents/wallet.js" ]; then
    echo "❌ ERROR: wallet.js not found at ./backend/agents/wallet.js"
    echo "Please ensure the file exists in the correct location."
    exit 1
fi

# Check if other critical files exist
REQUIRED_FILES=(
    "./backend/agents/autonomous-ai-engine.js"
    "./package.json"
    "./Dockerfile"
)

for file in "${REQUIRED_FILES[@]}"; do
    if [ ! -f "$file" ]; then
        echo "❌ ERROR: Required file $file not found"
        exit 1
    fi
done

echo "--- ✅ All required files found. ✅ ---"

# === COPY ALL NECESSARY FILES TO BUILD CONTEXT ===
echo "--- 📋 Preparing build context... 📋 ---"

# Create a temporary build directory
BUILD_DIR="./.docker-build"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# Copy all necessary files to build directory
cp -r ./backend "$BUILD_DIR/"
cp ./package.json "$BUILD_DIR/"
cp ./Dockerfile "$BUILD_DIR/"
cp ./.env "$BUILD_DIR/" 2>/dev/null || echo "⚠️  .env file not found, proceeding without it"

# Verify wallet.js was copied
if [ ! -f "$BUILD_DIR/backend/agents/wallet.js" ]; then
    echo "❌ ERROR: wallet.js was not copied to build context"
    exit 1
fi

echo "--- ✅ Build context prepared with wallet.js and all dependencies. ✅ ---"

# === BUILD ===
echo "--- 📦 Building the Docker image: ${IMAGE_NAME} 📦 ---"
cd "$BUILD_DIR"
DOCKER_BUILDKIT=1 docker build --no-cache -t "$IMAGE_NAME" .
cd ..

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
    echo "--- 📋 Container logs: ---"
    docker logs "$CONTAINER_NAME"
    echo "--- 🔍 Checking if wallet.js is in the container: ---"
    docker exec "$CONTAINER_NAME" ls -la /usr/src/app/backend/agents/ || true
    exit 1
  fi
  
  # Check if container is still running
  if ! docker ps | grep -q "$CONTAINER_NAME"; then
    echo "--- ❌ Container stopped unexpectedly. ---"
    docker logs "$CONTAINER_NAME"
    exit 1
  fi
  
  # Try health check
  if curl --silent --fail --output /dev/null "$HEALTH_CHECK_URL"; then
    echo "--- ✅ Health check successful! The service is ready. ✅ ---"
    break
  fi
  
  echo "--- ⌛ Still waiting... (elapsed: ${elapsed}s/${HEALTH_CHECK_TIMEOUT_SECONDS}s) ---"
  sleep "$HEALTH_CHECK_INTERVAL_SECONDS"
done

# === VERIFY FILES IN CONTAINER ===
echo "--- 🔍 Verifying files are in the container... 🔍 ---"
if docker exec "$CONTAINER_NAME" ls -la /usr/src/app/backend/agents/wallet.js >/dev/null 2>&1; then
    echo "--- ✅ wallet.js found in container. ✅ ---"
else
    echo "--- ❌ wallet.js NOT found in container! ---"
    docker exec "$CONTAINER_NAME" find /usr/src/app -name "wallet.js" || true
    exit 1
fi

# Check other critical files
CRITICAL_FILES=(
    "/usr/src/app/backend/agents/autonomous-ai-engine.js"
    "/usr/src/app/package.json"
)

for file in "${CRITICAL_FILES[@]}"; do
    if docker exec "$CONTAINER_NAME" ls "$file" >/dev/null 2>&1; then
        echo "--- ✅ $(basename "$file") found in container. ✅ ---"
    else
        echo "--- ❌ $(basename "$file") NOT found in container! ---"
        exit 1
    fi
done

docker stop "$CONTAINER_NAME"

# === DEPLOY ===
echo "--- 🚀 Deploying to Docker registry... 🚀 ---"
docker tag "$IMAGE_NAME" "$DOCKER_REGISTRY:$TAG"
docker push "$DOCKER_REGISTRY:$TAG"

# === CLEANUP BUILD DIR ===
echo "--- 🧹 Cleaning up build directory... 🧹 ---"
rm -rf "$BUILD_DIR"

echo "--- 🎯 Script completed successfully. 🎯 ---"
echo "--- 📦 Image pushed to: $DOCKER_REGISTRY:$TAG 📦 ---"
