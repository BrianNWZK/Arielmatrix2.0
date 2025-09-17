#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Pre-deploy: ensure build tools & install missing deps"

# 0) Fast npm config
npm config set registry "https://registry.npmjs.org" >/dev/null 2>&1 || true
npm config set fund false >/dev/null 2>&1 || true
npm config set audit false >/dev/null 2>&1 || true
npm config set progress false >/dev/null 2>&1 || true
npm config set legacy-peer-deps true >/dev/null 2>&1 || true

# Clean npm cache at start
npm cache clean --force

# 1) Clean up problematic directories before starting
echo "🧹 Cleaning up problematic directories..."
rm -rf node_modules/@tensorflow 2>/dev/null || true
rm -rf node_modules/.cache 2>/dev/null || true

# 2) Warn if important files are missing (but don't exit)
required_files=(
  "package.json"
  "backend/scripts/server.js"
  "backend/config/bwaezi-config.js"
  "backend/contracts/APIKeyGenerator.sol"
  "backend/contracts/RevenueDistributor.sol"
  "frontend/package.json"
)
missing=()
for f in "${required_files[@]}"; do
  [ -e "$f" ] || missing+=("$f")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "⚠️  Warning: Missing expected files:"
  printf ' - %s\n' "${missing[@]}"
else
  echo "✅ All expected files present."
fi

# 3) System dependencies (no sudo; assume root inside container)
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    git curl ca-certificates python3 make g++ pkg-config \
    sqlite3 libsqlite3-dev cmake
elif command -v yum >/dev/null 2>&1; then
  yum install -y \
    git curl ca-certificates python3 make gcc-c++ pkgconfig \
    sqlite sqlite-devel cmake
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache \
    git curl ca-certificates python3 make g++ pkgconfig \
    sqlite sqlite-dev cmake
else
  echo "⚠️  No supported package manager found — skipping system deps"
fi

# 4) Install only if missing with better error handling
install_if_missing() {
  local dir="$1"
  [ -d "$dir" ] || return 0

  echo "📦 Processing $dir..."
  
  # Clean up any problematic tensorflow directories
  if [ -d "$dir/node_modules/@tensorflow" ]; then
    rm -rf "$dir/node_modules/@tensorflow" 2>/dev/null || true
  fi

  if [ -f "$dir/package-lock.json" ]; then
    local lock_hash
    lock_hash="$(sha256sum "$dir/package-lock.json" 2>/dev/null | awk '{print $1}')" || true
    local stamp="$dir/node_modules/.install-stamp"

    if [ -d "$dir/node_modules" ] && [ -f "$stamp" ] && [ -n "$lock_hash" ] && grep -q "$lock_hash" "$stamp" 2>/dev/null; then
      echo "⏭️  $dir deps already installed and match lockfile — skipping"
      return 0
    fi

    echo "📦 Installing deps in $dir..."
    (cd "$dir" && npm ci --no-audit --no-fund --prefer-offline) || \
    (cd "$dir" && npm install --no-audit --no-fund --prefer-offline || true)
    mkdir -p "$dir/node_modules"
    [ -n "$lock_hash" ] && echo "$lock_hash" > "$stamp"

  elif [ -f "$dir/package.json" ]; then
    if [ -d "$dir/node_modules" ]; then
      echo "⏭️  $dir has node_modules — skipping"
      return 0
    fi
    echo "📦 Installing deps in $dir..."
    (cd "$dir" && npm install --no-audit --no-fund --prefer-offline || true)
  fi
}

install_if_missing "."
install_if_missing "backend"
install_if_missing "frontend"

# 5) Ensure critical modules are installed with better error handling
ensure_module_installed() {
  local pkg="$1"
  echo "🔍 Checking for $pkg..."
  
  # Check if package is already installed
  if npm list "$pkg" >/dev/null 2>&1; then
    echo "✅ $pkg is already installed."
    return 0
  fi

  echo "📦 $pkg not found — attempting install..."
  
  # Clean cache before install
  npm cache clean --force
  
  # Try install with offline preference
  if npm install "$pkg" --save --legacy-peer-deps --no-audit --no-fund --prefer-offline; then
    echo "✅ $pkg installed successfully."
    return 0
  fi

  echo "⚠️  First attempt failed — retrying with fresh download..."
  if npm install "$pkg" --save --legacy-peer-deps --no-audit --no-fund; then
    echo "✅ $pkg installed on second attempt."
    return 0
  fi

  echo "❌ Failed to install $pkg after multiple attempts"
  # Don't exit for sqlite3 as it might be optional or handled differently
  if [ "$pkg" != "sqlite3" ]; then
    exit 1
  fi
  return 1
}

ensure_module_installed "web3"
ensure_module_installed "axios"

# Special handling for sqlite3 - don't fail the build if it doesn't install
echo "🔍 Checking for sqlite3..."
if ! npm list sqlite3 >/dev/null 2>&1; then
  echo "📦 sqlite3 not found — attempting install..."
  npm cache clean --force
  if npm install sqlite3 --save --legacy-peer-deps --no-audit --no-fund --prefer-offline; then
    echo "✅ sqlite3 installed successfully."
  else
    echo "⚠️  sqlite3 installation failed — continuing without it"
    # Remove any partially installed sqlite3 to avoid ENOTEMPTY errors
    rm -rf node_modules/sqlite3 2>/dev/null || true
  fi
else
  echo "✅ sqlite3 is already installed."
fi

# 6) Rebuild native modules if present
if (npm list better-sqlite3 >/dev/null 2>&1) || (cd backend 2>/dev/null && npm list better-sqlite3 >/dev/null 2>&1); then
  echo "🧱 Rebuilding better-sqlite3..."
  npm rebuild better-sqlite3 || true
  (cd backend && npm rebuild better-sqlite3) || true
fi
if (npm list sqlite3 >/dev/null 2>&1) || (cd backend 2>/dev/null && npm list sqlite3 >/dev/null 2>&1); then
  echo "🧱 Rebuilding sqlite3..."
  npm rebuild sqlite3 || true
  (cd backend && npm rebuild sqlite3) || true
fi

# 7) Optional browsers
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

# 8) Skipping pqc-dilithium WASM build
echo "⏭️ Skipping pqc-dilithium WASM build — using native bindings only."

# 9) Skipping pqc-kyber WASM build
echo "⏭️ Skipping pqc-kyber WASM build — using native bindings only."

echo "✅ build_and_deploy.sh completed successfully."
