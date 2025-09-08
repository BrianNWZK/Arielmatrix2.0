#!/bin/bash

# =========================================================================
# QUANTUM AI AUTONOMOUS BUILD & DEPLOYMENT SYSTEM
# Real revenue edition - no placeholders, uses actual project files
# =========================================================================

# Exit immediately if a command exits with a non-zero status
set -e

# Enable advanced error handling
set -o pipefail
shopt -s inherit_errexit

# Configuration
IMAGE_NAME="arielsql-quantum-ai"
CONTAINER_NAME="quantum-test"
PORT=1000
HEALTH_CHECK_URL="http://localhost:${PORT}/health"
HEALTH_CHECK_TIMEOUT_SECONDS=120
HEALTH_CHECK_INTERVAL_SECONDS=5
DOCKER_REGISTRY="${DOCKER_REGISTRY:-your-registry/arielsql-quantum-ai}"
TAG="${TAG:-latest}"
MAX_RETRIES=3
RETRY_DELAY=10

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# === VALIDATION FUNCTIONS ===

validate_project_structure() {
    log_info "🔍 Validating project structure..."
    
    # Critical files that must exist
    local critical_files=(
        "package.json"
        "Dockerfile"
        "backend/agents/autonomous-ai-engine.js"
        "backend/agents/wallet.js"
        "arielsql_suite/main.js"
        "arielsql_suite/serviceManager.js"
    )
    
    for file in "${critical_files[@]}"; do
        if [ ! -f "$file" ]; then
            log_error "Missing critical file: $file"
            log_error "This file is required for real revenue generation"
            return 1
        fi
    done
    
    # Critical directories that must exist
    local critical_dirs=(
        "backend/agents"
        "arielsql_suite"
        "scripts"
    )
    
    for dir in "${critical_dirs[@]}"; do
        if [ ! -d "$dir" ]; then
            log_error "Missing critical directory: $dir"
            return 1
        fi
    done
    
    log_success "Project structure validation passed"
    return 0
}

validate_environment() {
    log_info "🔍 Validating environment..."
    
    # Check required commands
    local required_commands=("docker" "curl" "node" "npm")
    for cmd in "${required_commands[@]}"; do
        if ! command -v "$cmd" &> /dev/null; then
            log_error "Missing required command: $cmd"
            return 1
        fi
    done

    # Check Docker daemon
    if ! docker info >/dev/null 2>&1; then
        log_error "Docker daemon is not running"
        return 1
    fi

    log_success "Environment validation passed"
    return 0
}

# === DOCKER FUNCTIONS ===

build_docker_image() {
    local image_name="$1"
    log_info "🏗️  Building Docker image: $image_name"
    
    if DOCKER_BUILDKIT=1 docker build --no-cache -t "$image_name" .; then
        log_success "Docker build completed successfully"
        return 0
    else
        log_error "Docker build failed"
        return 1
    fi
}

test_docker_container() {
    local image_name="$1"
    local container_name="$2"
    local port="$3"
    
    log_info "🧪 Testing Docker container: $container_name"
    
    # Start container
    if ! docker run -d --name "$container_name" -p "${port}:${port}" "$image_name"; then
        log_error "Failed to start container"
        return 1
    fi

    # Wait for container to be ready
    local start_time=$(date +%s)
    local timeout=$((start_time + HEALTH_CHECK_TIMEOUT_SECONDS))
    
    while [ $(date +%s) -lt $timeout ]; do
        # Check if container is running
        if ! docker ps | grep -q "$container_name"; then
            log_error "Container stopped unexpectedly"
            docker logs "$container_name"
            return 1
        fi

        # Health check with timeout
        if curl -s --max-time 5 -f "${HEALTH_CHECK_URL}" >/dev/null 2>&1; then
            log_success "Container health check passed"
            return 0
        fi

        sleep "$HEALTH_CHECK_INTERVAL_SECONDS"
    done

    log_error "Health check timeout"
    docker logs "$container_name"
    return 1
}

push_docker_image() {
    local image_name="$1"
    local registry="$2"
    local tag="$3"
    
    if [ "$registry" = "your-registry/arielsql-quantum-ai" ]; then
        log_warning "Skipping push - registry is set to placeholder"
        return 0
    fi

    log_info "🚀 Pushing image to registry: $registry:$tag"
    
    # Tag image
    if ! docker tag "$image_name" "${registry}:${tag}"; then
        log_error "Failed to tag image"
        return 1
    fi

    # Push image
    if docker push "${registry}:${tag}"; then
        log_success "Image pushed successfully"
        return 0
    else
        log_error "Failed to push image"
        return 1
    fi
}

# === CLEANUP FUNCTIONS ===

cleanup() {
    log_info "🧹 Cleaning up resources..."
    
    # Stop and remove test container
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true
    
    log_success "Cleanup completed"
}

# === MAIN DEPLOYMENT WORKFLOW ===

main() {
    log_info "🚀 Starting Quantum AI Deployment System"
    log_info "💵 Real revenue generation enabled - no placeholders"
    
    # Set cleanup trap
    trap cleanup EXIT
    
    # Validate project structure first
    if ! validate_project_structure; then
        log_error "Project structure validation failed"
        log_error "Cannot proceed without real revenue-generating files"
        exit 1
    fi

    # Validate environment
    if ! validate_environment; then
        log_error "Environment validation failed"
        exit 1
    fi

    # Build Docker image
    if ! build_docker_image "$IMAGE_NAME"; then
        log_error "Docker build failed"
        exit 1
    fi

    # Test container
    if ! test_docker_container "$IMAGE_NAME" "$CONTAINER_NAME" "$PORT"; then
        log_error "Container test failed"
        exit 1
    fi

    # Stop test container
    docker stop "$CONTAINER_NAME" 2>/dev/null || true
    docker rm "$CONTAINER_NAME" 2>/dev/null || true

    # Push to registry (if configured)
    if ! push_docker_image "$IMAGE_NAME" "$DOCKER_REGISTRY" "$TAG"; then
        log_error "Image push failed"
        exit 1
    fi

    log_success "🎉 Deployment completed successfully!"
    log_success "💵 Real revenue generation enabled"
    log_info "📦 Image: $DOCKER_REGISTRY:$TAG"
    log_info "🌐 Health: $HEALTH_CHECK_URL"
}

# Handle errors
handle_error() {
    local line="$1"
    local command="$2"
    local code="${3:-1}"
    
    log_error "Error at line $line: $command (exit code: $code)"
    cleanup
    exit "$code"
}

# Set error trap
trap 'handle_error ${LINENO} "$BASH_COMMAND" $?' ERR

# Run main function
main "$@"
