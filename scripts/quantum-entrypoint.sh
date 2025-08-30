#!/bin/bash
echo "🚀 QRAF Live Boot: $(date)"
echo "🧠 Node: $(node --version)"
echo "🔧 SQLite: $(sqlite3 --version 2>/dev/null || echo 'Ready')"

# Ensure perms
chmod +x ./scripts/*.sh || echo "Perms already set"

# Real dep check
quantum_check_dep() {
    local dep=$1
    node -e "import('$dep').then(() => console.log('✅ $dep')).catch(() => { console.error('⚡ Installing $dep'); process.exit(1) })" || npm install "$dep" --no-save --no-audit
}

quantum_check_dep "express"
quantum_check_dep "ethers"
quantum_check_dep "ccxt"
quantum_check_dep "@tensorflow/tfjs-node"
quantum_check_dep "googleapis"

# Real blockchain validation
if [ -f "backend/blockchain/BrianNwaezikeChain.js" ]; then
    echo "⛓️ Validating Ethereum Mainnet"
    node -e "import { ethers } from 'ethers'; const provider = new ethers.JsonRpcProvider('https://rpc.ankr.com/eth'); provider.getBlockNumber().then(n => console.log('✅ Block:', n)).catch(e => console.error('Error:', e.message))"
fi

# Run fix scripts
./scripts/prepare-build.sh && ./scripts/verify-docker-build.sh && ./scripts/fix-structure.sh && ./scripts/cleanup-conflicts.sh

# Real startup
entry_points=("arielsql_suite/main.js" "server.js" "scripts/live-revenue-server.js")
for ep in "${entry_points[@]}"; do
    if [ -f "$ep" ]; then
        echo "🎯 Launching $ep"
        exec node "$ep"
    fi
done

echo "🌠 Activating Live Revenue Server"
exec node scripts/live-revenue-server.js
