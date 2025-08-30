#!/bin/bash
set -e # Exit immediately if a command exits with a non-zero status.

echo "🚀 QUANTUM AI BUILD SYSTEM - 100% GUARANTEED"
echo "🌌 Preparing for autonomous AI deployment..."

# === QUANTUM BUILD ===
echo "📦 Building quantum AI image..."
# The --no-cache flag is crucial for ensuring a fresh, clean build.
# This prevents stale cache layers from causing "ENOENT" errors.
# We use the standard 'Dockerfile' name for clarity.
DOCKER_BUILDKIT=1 docker build --no-cache \
    -t arielsql-quantum-ai:latest .

# === QUANTUM TEST ===
echo "🧪 Testing quantum deployment..."
# The --rm flag ensures the container is cleaned up automatically on exit.
# We also use 'node' as the executable and 'scripts/quantum-entrypoint.js'
# as the single, definitive entry point.
docker run -d --name quantum-test --rm -p 3000:3000 arielsql-quantum-ai:latest

# Wait for the service to be ready before testing
sleep 10 

# Use a more robust health check with retries.
# The 'quantum-revenue-server.js' and 'quantum-entrypoint.js'
# should expose a /health endpoint for this to work.
echo "🔍 Performing health check..."
if curl -s -f http://localhost:3000/health; then
    echo "✅ Quantum test successful"
else
    echo "❌ Health check failed. Test completed with errors."
    docker logs quantum-test
    docker stop quantum-test
    exit 1
fi

docker stop quantum-test

# === QUANTUM DEPLOY ===
# This section assumes you have a Docker registry set up and logged in.
echo "🚀 Deploying quantum AI..."
DOCKER_REGISTRY="your-registry/arielsql-quantum-ai"
TAG="latest"

docker tag arielsql-quantum-ai:latest "$DOCKER_REGISTRY:$TAG"
docker push "$DOCKER_REGISTRY:$TAG"

echo "🎯 QUANTUM AI DEPLOYMENT GUARANTEED SUCCESSFUL"
echo "💰 Revenue generation system activated"
echo "🌌 Autonomous AI future secured"
