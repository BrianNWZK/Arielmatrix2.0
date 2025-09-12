#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Pre-deploy: installing build tools & dependencies (no file checks, idempotent)"

# 0) Fast npm config
npm config set registry "https://registry.npmmirror.com" >/dev/null 2>&1 || true
npm config set fund false >/dev/null 2>&1 || true
npm config set audit false >/dev/null 2>&1 || true
npm config set progress false >/dev/null 2>&1 || true
npm config set legacy-peer-deps true >/dev/null 2>&1 || true

# 1) System dependencies (no sudo; assume root inside container)
if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    git curl ca-certificates python3 make g++ pkg-config \
    sqlite3 libsqlite3-dev
elif command -v yum >/dev/null 2>&1; then
  yum install -y \
    git curl ca-certificates python3 make gcc-c++ pkgconfig \
    sqlite sqlite-devel
elif command -v apk >/dev/null 2>&1; then
  apk add --no-cache \
    git curl ca-certificates python3 make g++ pkgconfig \
    sqlite sqlite-dev
else
  echo "⚠️  No supported package manager found — skipping system deps"
fi

# 2) Idempotent dependency installs based on lockfile hash
install_deps_idempotent() {
  local dir="$1"
  [ -d "$dir" ] || return 0

  if [ -f "$dir/package-lock.json" ]; then
    local lock_hash
    lock_hash="$(sha256sum "$dir/package-lock.json" | awk '{print $1}')"
    local stamp="$dir/node_modules/.install-stamp"
    if [ -f "$stamp" ] && grep -q "$lock_hash" "$stamp"; then
      echo "⏭️  Skipping $dir (dependencies already up to date)"
      return 0
    fi
    echo "📦 Installing deps in $dir (npm ci)..."
    (cd "$dir" && npm ci --no-audit --no-fund) || (cd "$dir" && npm install --no-audit --no-fund || true)
    mkdir -p "$dir/node_modules"
    echo "$lock_hash" > "$stamp"
  elif [ -f "$dir/package.json" ]; then
    echo "📦 Installing deps in $dir (npm install)..."
    (cd "$dir" && npm install --no-audit --no-fund || true)
  fi
}

install_deps_idempotent "."
install_deps_idempotent "backend"
install_deps_idempotent "frontend"

# 3) Rebuild native modules for stability when present
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

# 4) Optional browsers (only if those deps exist)
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

echo "✅ fix-structure.sh completed — environment ready (no re-install loops)"
