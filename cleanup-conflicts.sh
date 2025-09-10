#!/bin/bash
# ============================================================
# cleanup-conflicts.sh
# Ensures required directories exist without being shadowed
# by files of the same name.
# ============================================================

set -euo pipefail

log() { echo -e "\033[1;34mℹ️  $1\033[0m"; }
ok() { echo -e "\033[1;32m✅ $1\033[0m"; }
warn() { echo -e "\033[1;33m⚠️  $1\033[0m"; }
err() { echo -e "\033[1;31m❌ $1\033[0m"; }

log "🧹 Cleaning up file-directory conflicts..."

conflicts=("arielmatrix2.0" "config" "scripts" "contracts" "public" "frontend" "backend")

for item in "${conflicts[@]}"; do
    if [ -f "$item" ]; then
        warn "File detected where directory should be: $item"
        rm -f "$item" || { err "Failed to remove file: $item"; exit 1; }
        mkdir -p "$item" || { err "Failed to create directory: $item"; exit 1; }
        ok "Replaced file with directory: $item"
    elif [ -d "$item" ]; then
        ok "$item is already a directory"
    else
        log "$item does not exist — creating directory"
        mkdir -p "$item" || { err "Failed to create directory: $item"; exit 1; }
        ok "Created directory: $item"
    fi
done

ok "Cleanup complete!"
