#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Pre-deploy: ensure build tools & install missing deps"

# 0) Fast npm config
npm config set registry "https://registry.npmmirror.com" >/dev/null 2>&1 || true
npm config set fund false >/dev/null 2>&1 || true
npm config set audit false >/dev/null 2>&1 || true
npm config set progress false >/dev/null 2>&1 || true
npm config set legacy-peer-deps true >/dev/null 2>&1 || true

# 1) Warn if important files are missing (but don't exit)
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
  echo "⚠️  Warning: Missing expected files:"
  printf ' - %s\n' "${missing[@]}"
else
  echo "✅ All expected files present."
fi

# 2) System dependencies (no sudo; assume root inside container)
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

# 3) Install only if missing
install_if_missing() {
  local dir="$1"
  [ -d "$dir" ] || return 0

  if [ -f "$dir/package-lock.json" ]; then
    local lock_hash
    lock_hash="$(sha256sum "$dir/package-lock.json" | awk '{print $1}')"
    local stamp="$dir/node_modules/.install-stamp"

    if [ -d "$dir/node_modules" ] && [ -f "$stamp" ] && grep -q "$lock_hash" "$stamp"; then
      echo "⏭️  $dir deps already installed and match lockfile — skipping"
      return 0
    fi

    echo "📦 Installing deps in $dir..."
    (cd "$dir" && npm ci --no-audit --no-fund) || (cd "$dir" && npm install --no-audit --no-fund || true)
    mkdir -p "$dir/node_modules"
    echo "$lock_hash" > "$stamp"

  elif [ -f "$dir/package.json" ]; then
    if [ -d "$dir/node_modules" ]; then
      echo "⏭️  $dir has node_modules — skipping"
      return 0
    fi
    echo "📦 Installing deps in $dir..."
    (cd "$dir" && npm install --no-audit --no-fund || true)
  fi
}

install_if_missing "."
install_if_missing "backend"
install_if_missing "frontend"

# 4) Rebuild native modules if present
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

# 5) Optional browsers
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

# 6) Build pqc-dilithium WASM if not already present
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

# 7) Build pqc-kyber WASM if not already present
echo "🔨 Building pqc-kyber WASM modules..."
KYBER_DIR="modules/pqc-kyber"
KYBER_DIST="$KYBER_DIR/dist"
mkdir -p "$KYBER_DIST"

if [ -z "$(ls -A "$KYBER_DIST" 2>/dev/null)" ]; then
  # Reuse liboqs if already cloned by dilithium, otherwise clone here
  if [ ! -d "$KYBER_DIR/liboqs" ]; then
    echo "📦 Cloning liboqs for Kyber..."
    git clone --depth 1 https://github.com/open-quantum-safe/liboqs.git "$KYBER_DIR/liboqs"
  fi

  echo "⚙️ Compiling Kyber variants to WASM..."
  (cd "$KYBER_DIR/liboqs" && mkdir -p build && cd build && \
    cmake -DOQS_USE_OPENSSL=OFF -DOQS_BUILD_ONLY_LIB=ON -DOQS_OPT_TARGET=wasm .. && \
    make -j"$(nproc)")

  # Copy produced WASM(s) to dist; adjust paths if your build outputs elsewhere
  for lvl in 512 768 1024; do
    wasm="kyber${lvl}.wasm"
    # Common liboqs build output dir example; change if needed
    src="$KYBER_DIR/liboqs/build/bin/$wasm"
    if [ -f "$src" ]; then
      cp "$src" "$KYBER_DIST/"
      echo "✅ Built $wasm"
    else
      echo "⚠️ $wasm not found in liboqs build output; check CMake flags and output paths."
    fi
  done
else
  echo "ℹ️ pqc-kyber WASM already present, skipping build."
fi

echo "✅ build_and_deploy.sh completed successfully."
