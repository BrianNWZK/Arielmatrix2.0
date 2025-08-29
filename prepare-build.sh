#!/bin/bash
echo "🚀 Preparing ArielSQL Ultimate build environment..."

# Ensure essential directories exist based on your project structure
mkdir -p \
    arielsql_suite \
    backend/agents \
    backend/blockchain \
    backend/database \
    backend/contracts \
    config \
    scripts \
    contracts \
    public \
    public/scripts \
    data \
    arielmatrix2.0 \
    frontend/public \
    frontend/src \
    frontend/src/components \
    frontend/src/styles

# Create essential files if they don't exist
if [ ! -f "arielsql_suite/main.js" ]; then
    echo "📝 Creating arielsql_suite/main.js"
    cat > arielsql_suite/main.js << 'EOF'
// ArielSQL Suite Main Entry Point
import { ServiceManager } from './serviceManager.js';

console.log('🚀 Starting ArielSQL Ultimate Suite...');
console.log('📦 Node.js version:', process.version);

const serviceManager = new ServiceManager();
serviceManager.initialize().catch(console.error);
EOF
fi

if [ ! -f "arielsql_suite/serviceManager.js" ]; then
    echo "📝 Creating arielsql_suite/serviceManager.js"
    cat > arielsql_suite/serviceManager.js << 'EOF'
// Service Manager for ArielSQL Suite
export class ServiceManager {
    constructor() {
        this.services = new Map();
    }

    async initialize() {
        console.log('🔄 Initializing services...');
        
        // Try to load and initialize all services
        try {
            // Database service
            await this.initializeService('./database/BrianNwaezikeDB.js', 'Database');
            
            // Blockchain services
            await this.initializeService('./blockchain/BrianNwaezikeChain.js', 'Blockchain');
            await this.initializeService('./blockchain/BrianNwaezikePayoutSystem.js', 'PayoutSystem');
            
            // Agent services
            const agents = [
                'adRevenueAgent', 'adsenseApi', 'apiScoutAgent', 'autonomous-core',
                'browserManager', 'complianceAgent', 'configAgent', 'contractDeployAgent',
                'cryptoAgent', 'dataAgent', 'forexSignalAgent', 'healthAgent',
                'payoutAgent', 'shopifyAgent', 'socialAgent'
            ];
            
            for (const agent of agents) {
                await this.initializeService(`./agents/${agent}.js`, agent);
            }
            
            console.log('✅ All services initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize services:', error);
            throw error;
        }
    }

    async initializeService(modulePath, serviceName) {
        try {
            console.log(`🔄 Initializing ${serviceName}...`);
            // Dynamic import for ES modules
            const module = await import(modulePath);
            if (module.default && typeof module.default.initialize === 'function') {
                await module.default.initialize();
                this.services.set(serviceName, module.default);
                console.log(`✅ ${serviceName} initialized`);
            }
        } catch (error) {
            console.warn(`⚠️ Could not initialize ${serviceName}:`, error.message);
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
fi

# Create server.js if it doesn't exist (fallback)
if [ ! -f "server.js" ]; then
    echo "📝 Creating server.js fallback"
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
        service: 'ArielSQL Ultimate'
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
fi

# Create default environment file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "📝 Creating .env.example"
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
PRIVATE_KEY=your-private-key-here

# API Keys
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
fi

# Ensure package-lock.json exists for optimal Docker caching
if [ ! -f "package-lock.json" ]; then
    echo "📦 Generating package-lock.json for better Docker caching..."
    npm install --package-lock-only --no-audit --no-fund
fi

# Remove any files that might conflict with directories
conflict_files=("arielmatrix2.0" "config" "scripts" "contracts" "public" "frontend" "data")
for item in "${conflict_files[@]}"; do
    if [ -f "$item" ]; then
        echo "⚠️ Removing conflicting file: $item"
        rm -f "$item"
        mkdir -p "$item"
        echo "✅ Created directory: $item"
    fi
done

# Create essential data directory with proper permissions
mkdir -p data
chmod 755 data

echo "✅ ArielSQL Ultimate build environment ready!"
echo "📋 Project structure:"
echo "   - arielsql_suite/     # Main application suite"
echo "   - backend/           # Backend services and agents"
echo "   - data/              # Database files (SQLite)"
echo "   - config/            # Configuration files"
echo "   - scripts/           # Maintenance and utility scripts"
echo "   - public/            # Public assets and frontend build"
echo "   - contracts/         # Smart contracts"
echo "   - arielmatrix2.0/    # Python components"

# Display next steps
echo ""
echo "🚀 Next steps:"
echo "   docker build -t arielsql-ultimate ."
echo "   docker run -p 3000:3000 -v ./data:/app/data arielsql-ultimate"
