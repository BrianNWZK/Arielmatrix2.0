#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Validating production structure..."

# 1. Verify all required files exist (no placeholders)
required_files=(
  "package.json"
  "package-lock.json"
  "backend/scripts/server.js"
  "backend/config/bwaezi-config.js"
  "backend/contracts/APIKeyGenerator.sol"
  "backend/contracts/RevenueDistributor.sol"
  "frontend/package.json"
  "frontend/package-lock.json"
)
missing=()
for f in "${required_files[@]}"; do
  [ -e "$f" ] || missing+=("$f")
done
if [ ${#missing[@]} -gt 0 ]; then
  echo "❌ Missing required files:"
  printf ' - %s\n' "${missing[@]}"
  exit 1
fi
echo "✅ All required files present."

# 2. Install system dependencies
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y git curl python3 make g++ pkg-config sqlite3 libsqlite3-dev
fi

# 3. Install Node dependencies without altering lockfiles
npm ci --no-audit --no-fund
if [ -f backend/package.json ]; then
  (cd backend && npm ci --no-audit --no-fund)
fi
if [ -f frontend/package.json ]; then
  (cd frontend && npm ci --no-audit --no-fund)
fi

# 4. Rebuild native modules if needed
npm rebuild sqlite3 || true
(cd backend && npm rebuild sqlite3 || true)

echo "✅ fix-structure.sh completed successfully."
