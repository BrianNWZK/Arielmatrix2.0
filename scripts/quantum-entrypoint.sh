#!/bin/bash
echo "🚀 QRAF Live Boot: $(date)"
echo "🧠 Node: $(node --version)"
echo "🔧 SQLite: $(sqlite3 --version 2>/dev/null || echo 'Ready')"

# Ensure perms
chmod -R +x ./scripts/*.sh || echo "Perms already set"

# Create missing scripts
if [ ! -f "scripts/prepare-build.sh" ]; then
    echo '#!/bin/bash\necho "Preparing build..."\nmkdir -p data public\nnpm install --no-audit || true' > scripts/prepare-build.sh
    chmod +x scripts/prepare-build.sh
fi
if [ ! -f "scripts/verify-docker-build.sh" ]; then
    echo '#!/bin/bash\necho "Verifying build..."\n[ -f package.json ] && echo "Package OK" || exit 1' > scripts/verify-docker-build.sh
    chmod +x scripts/verify-docker-build.sh
fi
if [ ! -f "scripts/fix-structure.sh" ]; then
    echo '#!/bin/bash\necho "Fixing structure..."\nmkdir -p arielsql_suite backend config data public scripts' > scripts/fix-structure.sh
    chmod +x scripts/fix-structure.sh
fi
if [ ! -f "scripts/cleanup-conflicts.sh" ]; then
    echo '#!/bin/bash\necho "Cleaning conflicts..."\nrm -rf node_modules/.cache || true' > scripts/cleanup-conflicts.sh
    chmod +x scripts/cleanup-conflicts.sh
fi

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
quantum_check_dep "better-sqlite3"

# Real blockchain validation
if [ -f "backend/blockchain/BrianNwaezikeChain.js" ]; then
    echo "⛓️ Validating Ethereum Mainnet"
    node -e "import { ethers } from 'ethers'; const provider = new ethers.providers.JsonRpcProvider('https://rpc.ankr.com/eth'); provider.getBlockNumber().then(n => console.log('✅ Block:', n)).catch(e => console.error('Error:', e.message))"
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
