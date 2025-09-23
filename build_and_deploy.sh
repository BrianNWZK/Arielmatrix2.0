#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Starting build_and_deploy.sh"

# Fast npm config
npm config set registry "https://registry.npmjs.org"
npm config set legacy-peer-deps true
npm config set audit false
npm config set fund false
npm config set progress false
npm cache clean --force

# Clean up problematic modules and deprecated packages
rm -rf node_modules/@tensorflow node_modules/sqlite3 node_modules/.cache 2>/dev/null || true

# Remove deprecated packages that cause conflicts
echo "🧹 Removing deprecated packages..."
npm uninstall yaeti npmlog inflight gauge are-we-there-yet @npmcli/move-file@1 @npmcli/move-file@2 rimraf@2 rimraf@3 glob@7 2>/dev/null || true

# Generate lockfile if missing
if [ ! -f "package-lock.json" ]; then
  echo "⚠️ package-lock.json missing — generating..."
  npm install --package-lock-only --no-audit --no-fund --legacy-peer-deps
fi

# Install updated versions of critical packages
echo "📦 Installing updated dependencies..."
npm install glob@^10.0.0 rimraf@^5.0.0 @npmcli/move-file@^3.0.0 lru-cache@^10.0.0 pino@^8.15.0 --save --no-audit --no-fund

# Install dependencies
install_if_missing() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  if [ -f "$dir/package-lock.json" ]; then
    (cd "$dir" && npm ci --legacy-peer-deps --no-audit --no-fund --prefer-offline) || \
    (cd "$dir" && npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline || true)
  elif [ -f "$dir/package.json" ]; then
    (cd "$dir" && npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline || true)
  fi
}

install_if_missing "."
install_if_missing "backend"
install_if_missing "frontend"

# Ensure critical modules
ensure_module_installed() {
  local pkg="$1"
  if ! npm list "$pkg" >/dev/null 2>&1; then
    echo "📦 Installing $pkg..."
    npm cache clean --force
    npm install "$pkg" --save --legacy-peer-deps --no-audit --no-fund --prefer-offline --no-verify || \
    npm install "$pkg" --save --legacy-peer-deps --no-audit --no-fund || {
      echo "❌ Failed to install $pkg"
      exit 1
    }
  else
    echo "✅ $pkg is already installed."
  fi
}

ensure_module_installed "web3"
ensure_module_installed "axios"
ensure_module_installed "@solana/web3.js"
ensure_module_installed "@solana/spl-token"

# Check for dependency issues
echo "🔍 Checking for dependency issues..."
node scripts/check-deps.js

# Fix any remaining dependency issues
echo "🔧 Fixing dependency issues..."
node scripts/fix-dependencies.js

# sqlite3 fallback
if ! npm list sqlite3 >/dev/null 2>&1; then
  echo "📦 sqlite3 not found — trying install..."
  npm install sqlite3 --save --legacy-peer-deps --no-audit --no-fund --prefer-offline --no-verify || {
    echo "⚠️ sqlite3 install failed — checking system fallback..."
    command -v sqlite3 >/dev/null 2>&1 && echo "✅ System sqlite3 available" || echo "❌ No sqlite3 available"
  }
fi

# Rebuild native modules
npm rebuild better-sqlite3 || true
npm rebuild sqlite3 || true

# Fix file-directory conflicts
echo "🧹 Cleaning up file-directory conflicts..."
./scripts/cleanup-conflicts.sh

# Skip WASM builds
echo "⏭️ Skipping pqc-dilithium WASM build — using native bindings only."
echo "⏭️ Skipping pqc-kyber WASM build — using native bindings only."

echo "✅ build_and_deploy.sh completed successfully."
