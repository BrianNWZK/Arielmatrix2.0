#!/bin/bash
echo "🔧 Fixing ArielSQL Ultimate project structure..."

# Remove any files that should be directories
conflicts=("arielmatrix2.0" "config" "scripts" "contracts" "public" "frontend" "backend" "data" "arielsql_suite")
for item in "${conflicts[@]}"; do
    if [ -f "$item" ]; then
        echo "⚠️ Removing conflicting file: $item"
        rm -f "$item"
        mkdir -p "$item"
        echo "✅ Created directory: $item"
    elif [ -d "$item" ]; then
        echo "✅ $item is already a directory"
    else
        echo "ℹ️ $item does not exist, creating directory"
        mkdir -p "$item"
    fi
done

# Create essential directory structure
echo "📁 Creating essential directory structure..."
mkdir -p \
    arielsql_suite/ \
    backend/agents \
    backend/blockchain \
    backend/database \
    backend/contracts \
    config/ \
    scripts/ \
    contracts/ \
    public/scripts \
    public/assets \
    data/ \
    data/migrations \
    data/backups \
    frontend/public \
    frontend/src/components \
    frontend/src/styles \
    arielmatrix2.0/

# Create essential files if missing
echo "📝 Creating essential files..."

# Main package.json with critical dependencies for agents and blockchain
if [ ! -f "package.json" ]; then
    cat > package.json << 'EOF'
{
  "name": "arielsql-suite",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": "22.x"
  },
  "scripts": {
    "start": "node arielsql_suite/main.js",
    "dev": "nodemon server.js",
    "precommit": "node scripts/precommit.js",
    "test": "jest",
    "db:maintenance": "node scripts/database-maintenance.js",
    "db:backup": "node scripts/database-backup.js",
    "db:optimize": "node scripts/database-optimize.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "axios": "^1.7.7",
    "ethers": "^5.7.2",
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
    echo "✅ Created package.json with critical dependencies"
else
    echo "✅ package.json already exists"
fi

# Backend package.json
if [ ! -f "backend/package.json" ]; then
    echo '{"name": "arielsql-backend", "version": "1.0.0", "dependencies": {}}' > backend/package.json
    echo "✅ Created backend/package.json"
else
    echo "✅ backend/package.json already exists"
fi

# Main entry point
if [ ! -f "arielsql_suite/main.js" ]; then
    cat > arielsql_suite/main.js << 'EOF'
// ArielSQL Suite Main Entry Point
import { ServiceManager } from './serviceManager.js';

console.log('🚀 Starting ArielSQL Ultimate Suite...');
console.log('📦 Node.js version:', process.version);

const serviceManager = new ServiceManager();
serviceManager.initialize().catch(console.error);
EOF
    echo "✅ Created arielsql_suite/main.js"
fi

# Service Manager
if [ ! -f "arielsql_suite/serviceManager.js" ]; then
    cat > arielsql_suite/serviceManager.js << 'EOF'
// Service Manager for ArielSQL Suite
export class ServiceManager {
    constructor() {
        this.services = new Map();
    }

    async initialize() {
        console.log('🔄 Initializing services...');
        
        try {
            // Try to load core services
            const services = [
                './database/BrianNwaezikeDB.js',
                './blockchain/BrianNwaezikeChain.js',
                './blockchain/BrianNwaezikePayoutSystem.js'
            ];
            
            for (const servicePath of services) {
                await this.initializeService(servicePath);
            }
            
            console.log('✅ Core services initialized');
            
        } catch (error) {
            console.error('❌ Failed to initialize services:', error);
            // Continue anyway for demo purposes
            console.log('🟡 Starting in minimal mode');
        }
    }

    async initializeService(modulePath) {
        try {
            const moduleName = modulePath.split('/').pop().replace('.js', '');
            console.log(`🔄 Initializing ${moduleName}...`);
            
            // Dynamic import for ES modules
            const module = await import(modulePath);
            if (module.default && typeof module.default.initialize === 'function') {
                await module.default.initialize();
                this.services.set(moduleName, module.default);
                console.log(`✅ ${moduleName} initialized`);
            }
        } catch (error) {
            console.warn(`⚠️ Could not initialize ${modulePath}:`, error.message);
        }
    }

    getService(name) {
        return this.services.get(name);
    }

    async shutdown() {
        console.log('🛑 Shutting down services...');
        for (const [name, service] of this.services) {
            if (service.shutdown && typeof service.shutdown === 'function') {
                await service.shutdown();
            }
        }
        console.log('✅ All services shut down');
    }
}
EOF
    echo "✅ Created arielsql_suite/serviceManager.js"
fi

# Fallback server.js
if [ ! -f "server.js" ]; then
    cat > server.js << 'EOF'
// Fallback server for ArielSQL Ultimate
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        service: 'ArielSQL Ultimate',
        version: '1.0.0'
    });
});

app.get('/', (req, res) => {
    res.json({
        message: 'ArielSQL Ultimate Backend',
        version: '1.0.0',
        endpoints: ['/health', '/status']
    });
});

app.listen(PORT, () => {
    console.log(`🚀 ArielSQL Ultimate server running on port ${PORT}`);
    console.log(`📊 Health check available at http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});
EOF
    echo "✅ Created server.js fallback"
fi

# Environment example with blockchain/AI vars
if [ ! -f ".env.example" ]; then
    cat > .env.example << 'EOF'
# ArielSQL Ultimate Configuration
PORT=3000
NODE_ENV=production

# Database Configuration
DATABASE_PATH=./data/arielsql.db
LITESTREAM_REPLICA_URL=

# Blockchain Configuration
ETHEREUM_RPC_URL=https://mainnet.infura.io/v3/your-infura-key
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
REVENUE_CONTRACT_ADDRESS=0xYourContractAddress
PAYOUT_THRESHOLD=1000000000000000000
PRIVATE_KEY=your-private-key-here

# API Keys (replace with your actual keys)
GOOGLE_ADSENSE_CLIENT_ID=your-google-adsense-id
GOOGLE_ADSENSE_CLIENT_SECRET=your-google-adsense-secret
TWITTER_API_KEY=your-twitter-api-key
TWITTER_API_SECRET=your-twitter-api-secret

# Monitoring
PROMETHEUS_METRICS_PORT=9090
STATSD_HOST=localhost
STATSD_PORT=8125

# Feature Flags
ENABLE_BLOCKCHAIN=true
ENABLE_AI_ANALYTICS=true
ENABLE_AUTOMATED_TRADING=false
EOF
    echo "✅ Created .env.example with blockchain/AI vars"
else
    echo "✅ .env.example already exists"
fi

# Database schema for agent_payouts_log
if [ ! -f "data/schema.sql" ]; then
    cat > data/schema.sql << 'EOF'
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
    echo "✅ Created data/schema.sql for agent_payouts_log"
else
    echo "✅ data/schema.sql already exists"
fi

# Generate package-lock.json for better Docker caching
if [ ! -f "package-lock.json" ]; then
    echo "📦 Generating package-lock.json for Docker caching..."
    npm install --package-lock-only --no-audit --no-fund
    echo "✅ Created package-lock.json"
else
    echo "✅ package-lock.json already exists"
fi

# Novel: Validate critical dependencies
echo "🔍 Validating critical dependencies..."
if [ -f "package.json" ]; then
    for dep in express axios ethers ccxt sqlite3 puppeteer playwright; do
        if ! grep -q "\"$dep\":" package.json; then
            echo "⚠️ Adding missing dependency: $dep"
            npm install "$dep" --save --no-audit
        else
            echo "✅ Dependency $dep found in package.json"
        fi
    done
else
    echo "❌ package.json missing after creation, check earlier steps"
    exit 1
fi

# Set proper permissions
chmod 755 data/

echo ""
echo "✅ ArielSQL Ultimate project structure fixed!"
echo "📋 Project overview:"
echo "   - arielsql_suite/     # Main application suite"
echo "   - backend/           # Backend services and agents" 
echo "   - data/              # Database files (SQLite)"
echo "   - config/            # Configuration files"
echo "   - scripts/           # Maintenance scripts"
echo "   - public/            # Public assets"
echo "   - contracts/         # Smart contracts"
echo "   - arielmatrix2.0/    # Python components"
echo ""
echo "🚀 Next steps:"
echo "   docker build -t arielsql-ultimate ."
echo "   docker run -p 3000:3000 -v ./data:/app/data arielsql-ultimate"
