#!/bin/bash
set -euo pipefail

echo "🚀 Running quick fix for production deployment..."

# Remove deprecated packages
npm uninstall yaeti npmlog inflight gauge are-we-there-yet @npmcli/move-file@1 @npmcli/move-file@2 rimraf@2 rimraf@3 glob@7 2>/dev/null || true

# Install updated versions
npm install glob@^10.0.0 rimraf@^5.0.0 @npmcli/move-file@^3.0.0 lru-cache@^10.0.0 pino@^8.15.0 --save

# Update critical packages
npm install @solana/web3.js@^1.87.0 @solana/spl-token@^0.3.9 ethers@^6.10.0 --save

# Clean install
rm -rf node_modules package-lock.json
npm install

# Run cleanup
./scripts/cleanup-conflicts.sh

echo "✅ Quick fix completed!"
