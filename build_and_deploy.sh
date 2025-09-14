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
  sudo apt-get install -y git curl python3 make g++ pkg-config sqlite3 libsqlite3-dev cmake
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

# 5. Build pqc-dilithium WASM if not already present
echo "🔨 Building pqc-dilithium WASM modules..."
PQC_DIR="modules/pqc-dilithium"
DIST_DIR="$PQC_DIR/dist"
mkdir -p "$DIST_DIR"

if [ -z "$(ls -A "$DIST_DIR" 2>/dev/null)" ]; then
  echo "📦 Cloning liboqs..."
  if [ ! -d "$PQC_DIR/liboqs" ]; then
    git clone --depth 1 https://github.com/open-quantum-safe/liboqs.git "$PQC_DIR/liboqs"
  fi

  echo "⚙️ Compiling Dilithium variants to WASM..."
  (cd "$PQC_DIR/liboqs" && mkdir -p build && cd build && \
    cmake -DOQS_USE_OPENSSL=OFF -DOQS_BUILD_ONLY_LIB=ON -DOQS_OPT_TARGET=wasm .. && \
    make -j"$(nproc)")

  for level in 2 3 5; do
    wasm_file="dilithium${level}.wasm"
    src_path="$PQC_DIR/liboqs/build/bin/${wasm_file}"
    if [ -f "$src_path" ]; then
      cp "$src_path" "$DIST_DIR/"
      echo "✅ Built $wasm_file"
    else
      echo "⚠️ $wasm_file not found in build output"
    fi
  done
else
  echo "ℹ️ pqc-dilithium WASM already present, skipping build."
fi

# 6. Deployment steps (adjust to your needs)
echo "🚀 Deploying application..."
# Example: build frontend, start backend, etc.
# npm run build
# pm2 restart all

echo "✅ build_and_deploy.sh completed successfully."
