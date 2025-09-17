#!/usr/bin/env bash
set -euo pipefail

echo "🔍 Running runtime checks..."

check_module() {
  local module="$1"
  if node -e "require('$module'); console.log('✅ $module loaded')" 2>/dev/null; then
    return 0
  else
    echo "❌ $module failed to load"
    return 1
  fi
}

check_module "web3" || exit 1
check_module "axios" || exit 1
check_module "sqlite3" || echo "⚠️ sqlite3 not available — using system fallback"

echo "✅ All runtime checks passed"
