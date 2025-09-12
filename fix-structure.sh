#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Pre-deploy: installing build tools & dependencies (no file checks)"

# 1. Install system dependencies for native builds
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    git curl ca-certificates python3 make g++ pkg-config \
    sqlite3 libsqlite3-dev
elif command -v yum >/dev/null 2>&1; then
  yum install -y \
    git curl ca-certificates python3 make gcc-c++ pkgconfig \
    sqlite sqlite-devel
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache \
    git curl ca-certificates python3 make g++ pkgconfig \
    sqlite sqlite-dev
else
  echo "⚠️  No supported package manager found — skipping system deps"
fi

# 2. Configure npm for speed & compatibility
npm config set fund false >/dev/null 2>&1 || true
npm config set audit false >/dev/null 2>&1 || true
npm config set progress false >/dev/null 2>&1 || true
npm config set legacy-peer-deps true >/dev/null 2>&1 || true

# 3. Install Node dependencies in each workspace
install_deps() {
  local dir="$1"
  if [ -f "$dir/package-lock.json" ]; then
    echo "📦 Installing deps in $dir (npm ci)..."
    (cd "$dir" && npm ci --no-audit --no-fund) || \
    (cd "$dir" && npm install --no-audit --no-fund || true)
  elif [ -f "$dir/package.json" ]; then
    echo "📦 Installing deps in $dir (npm install)..."
    (cd "$dir" && npm install --no-audit --no-fund || true)
  fi
}

install_deps "."
[ -d "backend" ] && install_deps "backend"
[ -d "frontend" ] && install_deps "frontend"

# 4. Rebuild native modules if present
if (npm list sqlite3 >/dev/null 2>&1) || (cd backend 2>/dev/null && npm list sqlite3 >/dev/null 2>&1); then
  echo "🧱 Rebuilding sqlite3..."
  npm rebuild sqlite3 || true
  (cd backend && npm rebuild sqlite3) || true
fi

# 5. Optional: Install Playwright/Puppeteer browsers if present
if (npm list playwright >/dev/null 2>&1) || (cd backend 2>/dev/null && npm list playwright >/dev/null 2>&1); then
  echo "🎭 Installing Playwright browsers..."
  npx playwright install --with-deps || true
fi
if (npm list puppeteer >/dev/null 2>&1) || (cd backend 2>/dev/null && npm list puppeteer >/dev/null 2>&1); then
  if command -v chromium >/dev/null 2>&1 || command -v chromium-browser >/dev/null 2>&1; then
    export PUPPETEER_SKIP_DOWNLOAD=1
    echo "🌐 Puppeteer will use system Chromium."
  fi
fi

echo "✅ fix-structure.sh completed — environment ready for build & deploy"
