#!/usr/bin/env bash
set -e

echo "🛠️ Regenerating lockfile on Render..."

rm -f package-lock.json
npm install --legacy-peer-deps --no-audit --no-fund

echo "✅ Lockfile regenerated."
