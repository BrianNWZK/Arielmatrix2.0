#!/bin/bash
echo "🚀 QRAF v5 Live Boot: $(date)"
echo "🧠 Node: $(node --version)"
echo "🔧 SQLite: $(sqlite3 --version 2>/dev/null || echo 'Ready')"

# Ensure perms
chmod -R +x ./scripts/*.sh 2>/dev/null || echo "Perms already set"

# Create and run dynamic scripts from /tmp with improved reliability
echo -e '#!/bin/bash\nmkdir -p data public\nnpm install --no-audit || true' > /tmp/prepare-build.sh
echo -e '#!/bin/bash\n[ -f package.json ] && echo "Package OK" || exit 1' > /tmp/verify-docker-build.sh
echo -e '#!/bin/bash\nmkdir -p arielsql_suite backend config data public scripts' > /tmp/fix-structure.sh
echo -e '#!/bin/bash\nrm -rf node_modules/.cache || true' > /tmp/cleanup-conflicts.sh

chmod +x /tmp/prepare-build.sh /tmp/verify-docker-build.sh /tmp/fix-structure.sh /tmp/cleanup-conflicts.sh 2>/dev/null || echo "Failed to set script permissions, proceeding..."

# Verify scripts exist
for script in /tmp/prepare-build.sh /tmp/verify-docker-build.sh /tmp/fix-structure.sh /tmp/cleanup-conflicts.sh; do
    if [ ! -f "$script" ]; then
        echo "Error: $script not found, recreating..."
        echo -e '#!/bin/bash\necho "Placeholder for $script"' > "$script"
        chmod +x "$script" 2>/dev/null
    fi
done

# Dependency check
quantum_check_dep() {
    local dep=$1
    if ! node -e "import('$dep').then(() => console.log('✅ $dep')).catch(() => { console.error('⚡ Installing $dep'); process.exit(1) })"; then
        echo "Dependency check failed, installing $dep..."
        npm install "$dep" --no-save --no-audit
        echo "Finished installing $dep"
    fi
}

quantum_check_dep "express"
quantum_check_dep "ethers"
quantum_check_dep "web3"
quantum_check_dep "ccxt"
quantum_check_dep "@tensorflow/tfjs-node"
quantum_check_dep "googleapis"
quantum_check_dep "better-sqlite3"
quantum_check_dep "node-forge"
quantum_check_dep "async-mutex"

# Enhanced blockchain validation
if [ -f "backend/blockchain/BrianNwaezikeChain.js" ]; then
    echo "⛓️ Validating Ethereum Mainnet"
    if [ -z "${INFURA_API_KEY}" ] && [ -z "${ALCHEMY_API_KEY}" ]; then
        echo "⚠️ Warning: INFURA_API_KEY and ALCHEMY_API_KEY not set. Skipping blockchain validation."
    else
        node -e 'import { ethers } from "ethers"; const providers = [`https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY || "none"}`, `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY || "none"}`, "https://rpc.ankr.com/eth"]; let provider; for (const url of providers) { try { provider = new ethers.providers.JsonRpcProvider(url); break; } catch (e) { console.error("Provider failed:", url); } } provider.getBlockNumber().then(n => console.log("✅ Block:", n)).catch(e => console.error("Error:", e.message))' || echo "Blockchain validation failed."
    fi
fi

# Run fix scripts from /tmp
if [ -f /tmp/prepare-build.sh ] && [ -f /tmp/verify-docker-build.sh ] && [ -f /tmp/fix-structure.sh ] && [ -f /tmp/cleanup-conflicts.sh ]; then
    /tmp/prepare-build.sh && /tmp/verify-docker-build.sh && /tmp/fix-structure.sh && /tmp/cleanup-conflicts.sh || echo "Scripts failed, proceeding..."
else
    echo "Crucial temporary scripts not found, proceeding with fallback..."
fi

# Real startup
entry_points=("arielsql_suite/main.js" "server.js" "scripts/live-revenue-server.js")
for ep in "${entry_points[@]}"; do
    if [ -f "$ep" ]; then
        echo "🎯 Launching $ep"
        exec node "$ep" && exit 0
    fi
done

echo "🌠 Activating Live Revenue Server"
exec node scripts/live-revenue-server.js
