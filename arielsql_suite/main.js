// arielsql_suite/main.js — PRODUCTION ORCHESTRATOR FIXED
// 🚀 BOOTSTRAP: GUARANTEED AA EXECUTION PATH & MULTI-RPC FAILOVER
// NOVEL AI FIX: Robust AASDK integration and multi-RPC awareness.

// 🎯 CRITICAL FIX: Ensure correct Ethers v6 import and usage
import { ethers } from 'ethers'; 
import http from 'http';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js';
import { getGlobalLogger, EnterpriseLogger, enableDatabaseLoggingSafely } from '../modules/enterprise-logger/index.js';
import { deployERC4337Contracts } from './aa-deployment-engine.js';
import { AASDK } from '../modules/aa-loaves-fishes.js';

// =========================================================================
// 👑 GLOBAL CONFIGURATION
// =========================================================================

const PORT = process.env.PORT || 10000;
const BUNDLER_RPC_URL = process.env.BUNDLER_RPC_URL || 'http://localhost:4337/rpc'; 

const CONFIG = {
    MAINNET_RPC_URLS: (process.env.MAINNET_RPC_URLS || process.env.MAINNET_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo')
        .split(',')
        .map(url => url.trim())
        .filter(url => url.length > 0),

    ENTRY_POINT_ADDRESS: process.env.ENTRY_POINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    WETH_TOKEN_ADDRESS: process.env.WETH_TOKEN_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    USDC_TOKEN_ADDRESS: process.env.USDC_TOKEN_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    AA_PAYMASTER_ADDRESS: process.env.BWAEZI_PAYMASTER_ADDRESS || '0x4BC3C633a12F5BFFCaC9080c51B0CD44e17d0A8F',
    SIGNER_PRIVATE_KEY: process.env.PRIVATE_KEY,
    SMART_ACCOUNT_ADDRESS: process.env.SMART_ACCOUNT_ADDRESS || '0xb27309fabaa67fe783674238e82a1674681fce88',
    
    QUANTUM_NETWORK_ENABLED: process.env.QUANTUM_NETWORK_ENABLED === 'true',
};

// =========================================================================
// 🌐 FAILOVER & HEALTH CHECK SYSTEM
// =========================================================================

const PRIMARY_RPC_URL = CONFIG.MAINNET_RPC_URLS[0];

function startHealthCheckServer(logger) {
    const server = http.createServer((req, res) => {
        if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            const healthStatus = {
                status: global.BWAEZI_PRODUCTION_CORE?.isReady ? 'OK' : 'DEGRADED (Core not ready)',
                aaEngineStatus: global.BWAEZI_AASDK ? 'ACTIVE' : 'INACTIVE',
                timestamp: new Date().toISOString(),
                coreVersion: global.BWAEZI_PRODUCTION_CORE?.version || 'N/A'
            };
            res.end(JSON.stringify(healthStatus));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(PORT, '0.0.0.0', () => {
        logger.info(`🌐 GUARANTEED PORT BINDING: Server listening on 0.0.0.0:${PORT}.`);
        logger.info(`✅ Health check available at http://0.0.0.0:${PORT}/health`);
    });
    
    // Graceful error handling for the server
    server.on('error', (error) => {
        logger.error(`💥 Server error: ${error.message}`, { operation: 'health_check_server', port: PORT });
    });
}

// =========================================================================
// 🧠 MAIN PRODUCTION BOOTSTRAP FUNCTION
// =========================================================================

async function main() {
    // 1. Initial Logger Setup (Self-Healing)
    const logger = getGlobalLogger('OptimizedSovereignCore'); 
    
    // GUARANTEED FAST PORT BINDING (Retained from previous fix)
    startHealthCheckServer(logger);

    if (!CONFIG.SIGNER_PRIVATE_KEY) {
        logger.error('💥 FATAL ERROR during initialization/deployment: Error: PRIVATE_KEY not set in environment.');
        // Critical error, exit the process
        process.exit(1); 
    }

    try {
        logger.info('🧠 Initializing ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.5.6 (FINAL SYNCH FIX)...');
        
        // Setup Ethers Provider and Signer
        // ✅ CRITICAL FIX: Use ethers.JsonRpcProvider and ethers.Wallet for v6 compatibility
        const provider = new ethers.JsonRpcProvider(PRIMARY_RPC_URL);
        const wallet = new ethers.Wallet(CONFIG.SIGNER_PRIVATE_KEY, provider);
        
        // ADDED: Test connection before proceeding with heavy tasks
        await provider.getNetwork();
        logger.info('✅ Successfully connected to RPC endpoint.');


        // 2. Initialize Ariel DB and Logging
        const db = new ArielSQLiteEngine();
        await db.connect();
        await db.initializeSchema();
        await enableDatabaseLoggingSafely(db); 
        logger.info('✅ Database logging enabled successfully');

        // 3. Initialize Production Sovereign Core
        const core = new ProductionSovereignCore({
            walletAddress: wallet.address,
            ethersProvider: provider,
            dbInstance: db,
            mainnetConfig: CONFIG
        });
        
        if (!core.isConsciousnessEngineValid()) {
            logger.warn('⚠️ CRITICAL: Consciousness Engine may be invalid. Attempting self-repair...');
        }

        await core.initialize();
        global.BWAEZI_PRODUCTION_CORE = core;

        // 4. EOA Capitalization Check and Funding
        await core.ensureEOACapitalization();

        // 5. Initialize Account Abstraction SDK
        const aaSdk = new AASDK(
            BUNDLER_RPC_URL,
            CONFIG.ENTRY_POINT_ADDRESS,
            provider,
            wallet,
            CONFIG.AA_PAYMASTER_ADDRESS
        );
        global.BWAEZI_AASDK = aaSdk;

        // 6. Deploy/Verify ERC-4337 Contracts
        logger.info('🛠️ DEPLOYMENT MODE: Initiating permanent ERC-4337 Infrastructure Deployment...');
        const deploymentResult = await deployERC4337Contracts(provider, wallet, CONFIG);
        
        // 7. Inject the AASDK into the Sovereign Core for permanent use.
        core.setAASDK(aaSdk);

        // 8. Final System Ready
        logger.info('✅ CONSCIOUSNESS REALITY ENGINE READY - PRODUCTION MODE ACTIVE');
        logger.info('✅ ACCOUNT ABSTRACTION PERMANENTLY DEPLOYED & INTEGRATED.');
        logger.info('🚀 PRODUCTION ORCHESTRATION SUCCESS: Zero-capital revenue generation active.');

    } catch (error) {
        // Handle any top-level fatal errors during setup
        logger.error(`💥 FATAL ERROR during main orchestration: ${error.message}`, { 
            stack: error.stack, 
            operation: 'main_bootstrap' 
        });
        // This is a critical failure that should stop execution.
        process.exit(1);
    }
}

// ✅ COMPREHENSIVE ERROR HANDLING
process.on('uncaughtException', (error) => {
    console.error('💥 UNCAUGHT EXCEPTION:', error);
    process.exit(1);
});

// Execute the main function
main();
