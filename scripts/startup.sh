#!/bin/bash
echo "🚀 ArielSQL Ultimate - Autonomous Startup Sequence"
echo "📦 Node: $(node --version)"
echo "🐢 SQLite: $(sqlite3 --version 2>/dev/null || echo 'Not available')"

# === DEPENDENCY VERIFICATION ===
check_dependency() {
    node -e "require('$1'); console.log('✅ $1')" 2>/dev/null || {
        echo "⚠️  Missing $1, attempting installation..."
        npm install $1 --no-save --no-audit --prefer-offline
    }
}

# Critical dependencies
check_dependency "express"
check_dependency "dotenv"
check_dependency "axios"
check_dependency "web3"

# === CONFIGURATION VALIDATION ===
if [ ! -f "config/bwaezi-config.js" ]; then
    echo "⚙️  Generating default configuration..."
    node scripts/generate-config.js
fi

# === AUTONOMOUS RECOVERY MODE ===
start_application() {
    local max_retries=3
    local retry_count=0
    
    while [ $retry_count -lt $max_retries ]; do
        echo "🎯 Attempt $((retry_count+1)) to start application..."
        
        if [ -f "arielsql_suite/main.js" ]; then
            exec node arielsql_suite/main.js
        elif [ -f "server.js" ]; then
            exec node server.js
        else
            echo "❌ No entry point found. Available:"
            find . -name "*.js" -type f | grep -E "(main|server|service|index|app)" | head -5
            break
        fi
        
        retry_count=$((retry_count+1))
        sleep 2
    done
    
    # Fallback to minimal server
    echo "🔄 Starting fallback autonomous server..."
    exec node scripts/autonomous-fallback.js
}

start_application
