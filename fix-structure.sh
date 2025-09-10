#!/bin/bash
# ============================================================
# fix-structure.sh
# Ensures ArielSQL Ultimate project structure is correct
# ============================================================

set -euo pipefail

log()  { echo -e "\033[1;34mℹ️  $1\033[0m"; }
ok()   { echo -e "\033[1;32m✅ $1\033[0m"; }
warn() { echo -e "\033[1;33m⚠️  $1\033[0m"; }
err()  { echo -e "\033[1;31m❌ $1\033[0m"; }

log "🔧 Fixing ArielSQL Ultimate project structure..."

# -------------------------------------------------------------------
# 1. Handle file/directory conflicts
# -------------------------------------------------------------------
conflicts=("arielmatrix2.0" "config" "scripts" "contracts" "public" "frontend" "backend" "data" "arielsql_suite")
for item in "${conflicts[@]}"; do
    if [ -f "$item" ]; then
        warn "File exists where directory should be: $item"
        rm -f "$item" || { err "Failed to remove $item"; exit 1; }
        mkdir -p "$item"
        ok "Replaced file with directory: $item"
    elif [ -d "$item" ]; then
        ok "$item already a directory"
    else
        log "Creating missing directory: $item"
        mkdir -p "$item"
        ok "Created directory: $item"
    fi
done

# -------------------------------------------------------------------
# 2. Ensure essential subdirectories exist
# -------------------------------------------------------------------
log "📁 Ensuring essential subdirectories..."
mkdir -p \
    backend/{agents,blockchain,database,contracts} \
    data/{migrations,backups} \
    frontend/{public,src/{components,styles}} \
    public/{scripts,assets}

# -------------------------------------------------------------------
# 3. Ensure critical files exist
# -------------------------------------------------------------------

# Root package.json
if [ ! -f "package.json" ]; then
    cat > package.json <<'EOF'
{
  "name": "arielsql-suite",
  "version": "1.0.0",
  "type": "module",
  "engines": { "node": "22.x" },
  "scripts": {
    "start": "node arielsql_suite/main.js",
    "dev": "nodemon server.js",
    "precommit": "node scripts/precommit.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.21.0",
    "axios": "^1.7.7",
    "ethers": "^6.13.2",
    "ccxt": "^4.4.0",
    "sqlite3": "^5.1.7",
    "puppeteer": "^24.16.0",
    "playwright": "^1.48.2",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5"
  },
  "license": "MIT",
  "private": true
}
EOF
    ok "Created package.json with baseline dependencies"
else
    ok "package.json already exists"
fi

# Backend package.json
[ ! -f "backend/package.json" ] && echo '{"name": "arielsql-backend", "version": "1.0.0"}' > backend/package.json && ok "Created backend/package.json"

# arielsql_suite/main.js
if [ ! -f "arielsql_suite/main.js" ]; then
    cat > arielsql_suite/main.js <<'EOF'
// ArielSQL Suite Main Entry Point
import { ServiceManager } from './serviceManager.js';
console.log('🚀 Starting ArielSQL Ultimate Suite...');
console.log('📦 Node.js version:', process.version);
const serviceManager = new ServiceManager();
serviceManager.initialize().catch(console.error);
EOF
    ok "Created arielsql_suite/main.js"
fi

# arielsql_suite/serviceManager.js
if [ ! -f "arielsql_suite/serviceManager.js" ]; then
    cat > arielsql_suite/serviceManager.js <<'EOF'
// Service Manager for ArielSQL Suite
export class ServiceManager {
    constructor() { this.services = new Map(); }
    async initialize() {
        console.log('🔄 Initializing services...');
        for (const service of [
            './database/BrianNwaezikeDB.js',
            './blockchain/BrianNwaezikeChain.js',
            './blockchain/BrianNwaezikePayoutSystem.js'
        ]) {
            await this.init(service);
        }
    }
    async init(path) {
        try {
            const moduleName = path.split('/').pop().replace('.js','');
            console.log(`🔄 Initializing ${moduleName}...`);
            const mod = await import(path);
            if (mod.default?.initialize) {
                await mod.default.initialize();
                this.services.set(moduleName, mod.default);
                console.log(`✅ ${moduleName} initialized`);
            }
        } catch (e) { console.warn(`⚠️ Failed to init ${path}: ${e.message}`); }
    }
}
EOF
    ok "Created arielsql_suite/serviceManager.js"
fi

# Fallback server.js
if [ ! -f "server.js" ]; then
    cat > server.js <<'EOF'
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
app.use(cors());
app.use(express.json());
app.get('/health',(req,res)=>res.json({status:"healthy",timestamp:new Date(),service:"ArielSQL Ultimate"}));
app.listen(PORT,()=>console.log(`🚀 Server running on port ${PORT}`));
EOF
    ok "Created server.js fallback"
fi

# Example .env
[ ! -f ".env.example" ] && cat > .env.example <<'EOF'
PORT=3000
NODE_ENV=production
DATABASE_PATH=./data/arielsql.db
EOF
[ -f ".env.example" ] && ok ".env.example ready"

# DB schema
[ ! -f "data/schema.sql" ] && cat > data/schema.sql <<'EOF'
CREATE TABLE IF NOT EXISTS agent_payouts_log (
    payout_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    amount REAL NOT NULL,
    description TEXT,
    transaction_id TEXT,
    agent_type TEXT,
    metadata TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
EOF
ok "Ensured data/schema.sql exists"

# -------------------------------------------------------------------
# 4. Validate dependencies (safe check only, no installs here)
# -------------------------------------------------------------------
log "🔍 Checking critical dependencies..."
if [ -f package.json ]; then
    for dep in express axios ethers ccxt sqlite3 puppeteer playwright; do
        if ! grep -q "\"$dep\"" package.json; then
            warn "Dependency missing: $dep (run 'npm install $dep')"
        else
            ok "$dep present"
        fi
    done
fi

# -------------------------------------------------------------------
# 5. Final permissions
# -------------------------------------------------------------------
chmod 755 data || true

ok "ArielSQL Ultimate project structure fixed!"
