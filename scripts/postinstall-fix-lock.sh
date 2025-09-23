#!/usr/bin/env bash
set -euo pipefail

echo "🚀 Starting comprehensive dependency fix and lockfile repair..."

# Step 1: Remove deprecated packages
echo "🗑️ Removing deprecated packages..."
npm uninstall yaeti npmlog inflight gauge are-we-there-yet @npmcli/move-file@1 @npmcli/move-file@2 rimraf@2 rimraf@3 glob@7 2>/dev/null || true

# Step 2: Install updated versions of problematic packages
echo "📦 Installing updated package versions..."
npm install glob@^10.0.0 rimraf@^5.0.0 @npmcli/move-file@^3.0.0 lru-cache@^10.0.0 pino@^8.15.0 --save

# Step 3: Update critical packages
echo "🔄 Updating critical packages..."
npm install @solana/web3.js@^1.87.0 @solana/spl-token@^0.3.9 ethers@^6.10.0 --save

# Step 4: Detect and handle corrupted lockfile
echo "🔍 Checking lockfile integrity..."
if [ -f "package-lock.json" ]; then
  if ! grep -q '"lockfileVersion":' package-lock.json; then
    echo "⚠️ Detected malformed lockfile — missing lockfileVersion."
    rm -f package-lock.json
  elif grep -q '"integrity": ""' package-lock.json; then
    echo "⚠️ Detected empty integrity fields — lockfile is corrupted."
    rm -f package-lock.json
  else
    echo "✅ Lockfile appears valid — continuing."
  fi
else
  echo "⚠️ No lockfile found — will generate a fresh one."
fi

# Step 5: Clean npm cache
echo "🧹 Cleaning npm cache..."
npm cache clean --force

# Step 6: Clean install with fresh dependencies
echo "📦 Performing clean installation..."
rm -rf node_modules
npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline || {
  echo "❌ npm install failed — retrying with --no-verify..."
  npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline --no-verify || {
    echo "❌ Final attempt to install dependencies failed."
    exit 1
  }
}

# Step 7: Verify critical modules
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
verify_module "@solana/web3.js"
verify_module "ethers"

# Step 8: Run cleanup
echo "🧽 Running final cleanup..."
if [ -f "./scripts/cleanup-conflicts.sh" ]; then
  ./scripts/cleanup-conflicts.sh
else
  echo "⚠️ Cleanup script not found, skipping..."
fi

echo "✅ Comprehensive dependency fix and lockfile repair completed!"
