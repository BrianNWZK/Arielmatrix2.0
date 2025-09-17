#!/usr/bin/env bash
set -euo pipefail

echo "🛠️ Starting proactive lockfile repair..."

# Step 1: Detect corrupted lockfile
if [ -f "package-lock.json" ]; then
  if ! grep -q '"lockfileVersion":' package-lock.json; then
    echo "⚠️ Detected malformed lockfile — missing lockfileVersion."
    rm -f package-lock.json
  elif grep -q '"integrity": ""' package-lock.json; then
    echo "⚠️ Detected empty integrity fields — lockfile is corrupted."
    rm -f package-lock.json
  else
    echo "🔍 Lockfile appears valid — continuing."
  fi
else
  echo "⚠️ No lockfile found — will generate a fresh one."
fi

# Step 2: Clean npm cache
echo "🧹 Cleaning npm cache..."
npm cache clean --force

# Step 3: Reinstall dependencies and regenerate lockfile
echo "📦 Reinstalling dependencies..."
npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline || {
  echo "❌ npm install failed — retrying with --no-verify..."
  npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline --no-verify || {
    echo "❌ Final attempt to install dependencies failed."
    exit 1
  }
}

# Step 4: Verify critical modules
verify_module() {
  local pkg="$1"
  echo "🔍 Verifying $pkg..."
  if ! node -e "require('$pkg')" 2>/dev/null; then
    echo "❌ $pkg failed to load — attempting reinstall..."
    npm install "$pkg" --save --legacy-peer-deps --no-audit --no-fund --prefer-offline --no-verify || {
      echo "❌ Failed to recover $pkg"
      exit 1
    }
  else
    echo "✅ $pkg is healthy."
  fi
}

verify_module "web3"
verify_module "axios"
verify_module "sqlite3"

echo "✅ Lockfile repair complete and dependencies verified."
