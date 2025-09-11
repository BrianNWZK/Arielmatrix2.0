#!/bin/bash

echo "🔧 Fixing ArielSQL Ultimate project structure..."
echo "🕒 $(date '+%Y-%m-%d %H:%M:%S')"

# Ensure required directories exist
declare -a dirs=(
  "arielmatrix2.0"
  "config"
  "contracts"
  "public"
  "frontend"
  "backend"
  "backend/agents"
  "backend/blockchain"
  "backend/config"
  "backend/contracts"
  "backend/database"
  "backend/public"
  "backend/scripts"
  "data"
  "arielsql_suite"
)

for dir in "${dirs[@]}"; do
  if [ ! -d "$dir" ]; then
    mkdir -p "$dir"
    echo "✅ Created directory: $dir"
  else
    echo "✅ $dir is already a directory"
  fi
done

# Validate all agent files
declare -a agent_files=(
  "Automated Multi-Chain Fund Consolidation"
  "USDT-Wallet.js"
  "adRevenueAgent.js"
  "adsenseApi.js"
  "apiScoutAgent.js"
  "autonomous-ai-engine.js"
  "browserManager.js"
  "complianceAgent.js"
  "configAgent.js"
  "contractDeployAgent.js"
  "cryptoAgent.js"
  "dataAgent.js"
  "forexSignalAgent.js"
  "healthAgent.js"
  "payoutAgent.js"
  "shopifyAgent.js"
  "socialAgent.js"
  "solana-wallet.js"
  "wallet.js"
)

for agent in "${agent_files[@]}"; do
  path="backend/agents/$agent"
  if [ ! -f "$path" ]; then
    echo "❌ Missing agent file: $path"
    echo "🛑 Aborting: All agent files must be present."
    exit 1
  else
    echo "✅ Found agent: $path"
  fi
done

# Validate critical backend files
declare -a backend_files=(
  "blockchain/BrianNwaezikeChain.js"
  "blockchain/BrianNwaezikePayoutSystem.js"
  "config/bwaezi-config.js"
  "contracts/APIKeyGenerator.sol"
  "contracts/RevenueDistributor.sol"
  "database/BrianNwaezikeDB.js"
  "public/index.html"
  "scripts/CentralizedBwaeziBackend.js"
  "scripts/dashboard.html"
  "scripts/hardhat.config.js"
  "scripts/precommit.js"
  "scripts/server.js"
)

for file in "${backend_files[@]}"; do
  path="backend/$file"
  if [ ! -f "$path" ]; then
    echo "❌ Missing backend file: $path"
    exit 2
  else
    echo "✅ Found backend file: $path"
  fi
done

# Validate frontend essentials
declare -a frontend_files=(
  "public/assets/index.css"
  "scripts/deployBwaeziContract.js"
  "src/components/BwaeziDashboard.jsx"
  "src/components/BwaeziStats.jsx"
  "src/styles/BwaeziTheme.css"
  "src/App.jsx"
  "src/index.css"
  "src/main.jsx"
  ".deepsource.toml"
  ".dockerignore"
  ".eslintrc.json"
  ".gitignore"
  "build_and_deploy.sh"
  "cleanup-conflicts.sh"
  "dashboard.js"
  "Dockerfile"
  "fix-structure.sh"
  "hardhat.config.js"
  "index.html"
  "package-lock.json"
  "package.json"
  "tailwind.config.js"
  "vite.config.js"
)

for file in "${frontend_files[@]}"; do
  path="frontend/$file"
  if [ ! -f "$path" ]; then
    echo "❌ Missing frontend file: $path"
    exit 3
  else
    echo "✅ Found frontend file: $path"
  fi
done

# Validate arielsql_suite core files
declare -a suite_files=(
  "main.js"
  "serviceManager.js"
)

for file in "${suite_files[@]}"; do
  path="arielsql_suite/$file"
  if [ ! -f "$path" ]; then
    echo "❌ Missing ArielSQL Suite file: $path"
    exit 4
  else
    echo "✅ Found suite file: $path"
  fi
done

# Ensure essential environment and schema files
touch .env.example
[ ! -f "data/schema.sql" ] && touch data/schema.sql

# Validate critical dependencies
declare -a deps=("express" "axios" "ethers" "ccxt" "sqlite3" "puppeteer" "playwright")
missing=false
for dep in "${deps[@]}"; do
  if npm list "$dep" >/dev/null 2>&1; then
    echo "✅ $dep present"
  else
    echo "❌ $dep missing"
    missing=true
  fi
done

if [ "$missing" = true ]; then
  echo "🛑 One or more critical dependencies are missing. Please install them before proceeding."
  exit 5
fi

echo "✅ ArielSQL Ultimate project structure fully verified and deployment-ready!"
