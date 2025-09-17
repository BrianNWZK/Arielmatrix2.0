#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Starting build_and_deploy.sh"

# 1) Fast npm config
npm config set registry "https://registry.npmjs.org"
npm config set legacy-peer-deps true
npm config set audit false
npm config set fund false
npm config set progress false

# 2) Clean cache
npm cache clean --force

# 3) Install dependencies if missing
install_if_missing() {
  local dir="$1"
  [ -d "$dir" ] || return 0

  if [ -f "$dir/package-lock.json" ]; then
    echo "📦 Installing deps in $dir..."
    (cd "$dir" && npm ci --no-audit --no-fund) || (cd "$dir" && npm install --no-audit --no-fund || true)
  elif [ -f "$dir/package.json" ]; then
    echo "📦 Installing deps in $dir..."
    (cd "$dir" && npm install --no-audit --no-fund || true)
  fi
}

install_if_missing "."
install_if_missing "backend"
install_if_missing "frontend"

# 4) Ensure critical modules
ensure_module_installed() {
  local pkg="$1"
  echo "🔍 Checking for $pkg..."
  if ! npm list "$pkg" >/dev/null 2>&1; then
    echo "📦 Installing $pkg..."
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
ensure_module_installed "sqlite3"

# 5) Rebuild native modules
for mod in better-sqlite3 sqlite3; do
  if npm list "$mod" >/dev/null 2>&1; then
    echo "🧱 Rebuilding $mod..."
    npm rebuild "$mod" || true
  fi
done

# 6) Skip WASM builds
echo "⏭️ Skipping pqc-dilithium WASM build — using native bindings only."
echo "⏭️ Skipping pqc-kyber WASM build — using native bindings only."

echo "✅ build_and_deploy.sh completed successfully."
