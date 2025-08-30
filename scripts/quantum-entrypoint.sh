#!/bin/bash
echo "🌌 QRDE BOOT: $(date)"
echo "🧠 Node: $(node --version)"
echo "🔧 SQLite: $(sqlite3 --version 2>/dev/null || echo 'Ready')"

# AI-Agentic Dependency Check (uses autonomous-core.js logic)
quantum_check_dep() {
    local dep=$1
    node -e "import('$dep').then(() => console.log('✅ $dep')).catch(() => process.exit(1))" || {
        echo "⚡ Auto-installing $dep"
        npm install "$dep" --no-save --no-audit
    }
}

quantum_check_dep "express"
quantum_check_dep "ethers"
quantum_check_dep "ccxt"
quantum_check_dep "@tensorflow/tfjs-node"

# Blockchain Validation (novel: query contract for config)
if [ -f "backend/blockchain/BrianNwaezikeChain.js" ]; then
    echo "⛓️ Validating blockchain state"
    node -e "import { ethers } from 'ethers'; const provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'https://rpc.example.com'); provider.getBlockNumber().then(n => console.log('✅ Block:', n)).catch(e => console.error('⚠️ Blockchain error:', e.message))"
fi

# Run fix scripts
./scripts/prepare-build.sh && ./scripts/verify-docker-build.sh && ./scripts/fix-structure.sh && ./scripts/cleanup-conflicts.sh

# Quantum Startup (fallbacks to AI agent)
entry_points=("main.js" "serviceManager.js" "server.js")
for ep in "${entry_points[@]}"; do
    if [ -f "$ep" ]; then
        echo "🎯 Launching $ep"
        exec node "$ep"
    fi
done

# Ultimate Fallback: Autonomous AI Server
echo "🌠 Activating QRDE AI Fallback"
exec node scripts/quantum-autonomous-server.js
