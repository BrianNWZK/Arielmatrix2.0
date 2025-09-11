#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Validating production structure & installing missing dependencies..."

# Mode: "strict" = exit on missing files, "warn" = log and continue
MODE="${1:-strict}"

# === 1. Required paths from your pasted structure ===
required_paths=(
  "arielsql_suite"
  "arielsql_suite/main.js"
  "arielsql_suite/serviceManager.js"
  "backend"
  "backend/agents"
  "backend/agents/Automated Multi-Chain Fund Consolidation"
  "backend/agents/USDT-Wallet.js"
  "backend/agents/adRevenueAgent.js"
  "backend/agents/adsenseApi.js"
  "backend/agents/apiScoutAgent.js"
  "backend/agents/autonomous-ai-engine.js"
  "backend/agents/browserManager.js"
  "backend/agents/complianceAgent.js"
  "backend/agents/configAgent.js"
  "backend/agents/contractDeployAgent.js"
  "backend/agents/cryptoAgent.js"
  "backend/agents/dataAgent.js"
  "backend/agents/forexSignalAgent.js"
  "backend/agents/healthAgent.js"
  "backend/agents/payoutAgent.js"
  "backend/agents/shopifyAgent.js"
  "backend/agents/socialAgent.js"
  "backend/agents/solana-wallet.js"
  "backend/agents/wallet.js"
  "backend/blockchain/BrianNwaezikeChain.js"
  "backend/blockchain/BrianNwaezikePayoutSystem.js"
  "backend/contracts/APIKeyGenerator.sol"
  "backend/contracts/RevenueDistributor.sol"
  "backend/database/BrianNwaezikeDB.js"
  "backend/public/index.html"
  "backend/scripts/precommit.js"
  "backend/scripts/CentralizedBwaeziBackend.js"
  "backend/scripts/dashboard.html"
  "backend/scripts/hardhat.config.js"
  "backend/scripts/server.js"
  "backend/config/bwaezi-config.js"
  "contracts/BwaeziCore.sol"
  "frontend/public/assets/index.css"
  "frontend/src/components/BwaeziDashboard.jsx"
  "frontend/src/components/BwaeziStats.jsx"
  "frontend/src/styles/BwaeziTheme.css"
  "frontend/src/App.jsx"
  "frontend/src/index.css"
  "frontend/src/main.jsx"
  "frontend/dashboard.js"
  "frontend/index.html"
  "frontend/tailwind.config.js"
  "frontend/vite.config.js"
  "frontend/scripts/deployBwaeziContract.js"
  "frontend/.deepsource.toml"
  "frontend/.dockerignore"
  "frontend/.eslintrc.json"
  "frontend/.gitignore"
  "frontend/Dockerfile"
  "frontend/build_and_deploy.sh"
  "frontend/cleanup-conflicts.sh"
  "frontend/fix-structure.sh"
  "frontend/hardhat.config.js"
  "hardhat.config.js"
  "package-lock.json"
  "package.json"
  "requirements.txt"
)

missing_files=()
for path in "${required_paths[@]}"; do
  if [ ! -e "$path" ]; then
    echo "❌ Missing: $path"
    missing_files+=("$path")
  else
    echo "✅ Found: $path"
  fi
done

if [ ${#missing_files[@]} -gt 0 ]; then
  echo
  echo "⚠️  Total missing: ${#missing_files[@]}"
  for m in "${missing_files[@]}"; do echo "   - $m"; done
  if [ "$MODE" = "strict" ]; then
    echo "❌ Deployment stopped due to missing files."
    exit 1
  else
    echo "⚠️  Continuing despite missing files (MODE=$MODE)"
  fi
fi

# === 2. Install system dependencies for native builds ===
if command -v apt-get >/dev/null 2>&1; then
  sudo apt-get update -y
  sudo apt-get install -y git curl python3 make g++ pkg-config sqlite3 libsqlite3-dev
elif command -v yum >/dev/null 2>&1; then
  sudo yum install -y git curl python3 make gcc-c++ pkgconfig sqlite sqlite-devel
elif command -v apk >/dev/null 2>&1; then
  sudo apk add --no-cache git curl python3 make g++ pkgconfig sqlite sqlite-dev
fi

# === 3. Install missing Node dependencies ===
install_missing_deps() {
  local dir="$1"
  if [ -f "$dir/package.json" ]; then
    echo "📦 Checking dependencies in $dir..."
    pushd "$dir" >/dev/null
    npm config set fund false
    npm config set audit false
    npm config set progress false
    npm config set legacy-peer-deps true
    npm install --no-audit --no-fund
    popd >/dev/null
  fi
}

install_missing_deps "."
install_missing_deps "backend"
install_missing_deps "frontend"

# === 4. Rebuild native modules for stability ===
npm rebuild sqlite3 || true
(cd backend && npm rebuild sqlite3 || true)

echo "✅ fix-structure.sh completed — structure validated, dependencies installed."
