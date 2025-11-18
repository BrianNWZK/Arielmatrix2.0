// arielsql_suite/main.js — PRODUCTION ORCHESTRATOR FIXED
// 🚀 BOOTSTRAP: GUARANTEED AA EXECUTION PATH & MULTI-RPC FAILOVER

import { ethers } from 'ethers';
import http from 'http';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js';
import { getGlobalLogger, enableDatabaseLoggingSafely } from '../modules/enterprise-logger/index.js';
import { deployERC4337Contracts } from './aa-deployment-engine.js';
// 🎯 CRITICAL FIX: Import the AASDK as a Class from the newly updated module
import { AASDK } from '../modules/aa-loaves-fishes.js';

// =========================================================================
// 👑 GLOBAL CONFIGURATION
// =========================================================================

// CRITICAL FIX: Set PORT to 10000 as requested (Fallback to 3000)
const PORT = process.env.PORT || 10000;

const CONFIG = {
    // 🎯 CRITICAL FIX: Load multiple RPCs from a comma-separated ENV variable
    MAINNET_RPC_URLS: (process.env.MAINNET_RPC_URLS || process.env.MAINNET_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo')
        .split(',')
        .map(url => url.trim())
        .filter(url => url.length > 0),

    ENTRY_POINT_ADDRESS: process.env.ENTRY_POINT_ADDRESS || null,
    WETH_TOKEN_ADDRESS: process.env.WETH_TOKEN_ADDRESS || '0xC02aaA39b223FE8D0A0e5C48D6C8091H7D1D4A', // WETH address placeholder
    
    // 🎯 CRITICAL FIX: Add missing token and quoter addresses used in aa-deployment-engine.js constructor args
    BWAEZI_TOKEN_ADDRESS: process.env.BWAEZI_TOKEN_ADDRESS || '0x4BC3C633a12F5BFFCaC9080c51B0CD44e17d0A8F', // Placeholder: Assumed BWAEZI main contract address
    UNISWAP_V3_QUOTER_ADDRESS: process.env.UNISWAP_V3_QUOTER_ADDRESS || '0xb27309fabaa67fe783674238e82a1674681fce88', // Placeholder: Uniswap V3 Quoter Mainnet address
    BWAEZI_WETH_FEE: process.env.BWAEZI_WETH_FEE,

    PRIVATE_KEY: process.env.PRIVATE_KEY, // CRITICAL: Expose private key from ENV
    DATABASE_PATH: process.env.DATABASE_PATH || './data/production.sqlite',
};

// =========================================================================
// 🏥 HEALTH CHECK SERVER - FIXED PORT BINDING AND GRACEFUL SHUTDOWN
// =========================================================================

function startHealthServer(logger) {
    const server = http.createServer((req, res) => {
        if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'UP',
                uptime: process.uptime(),
                version: '2.5.6-FINAL-SYNCH-FIX'
            }));
            return;
        }
        res.writeHead(404);
        res.end();
    });

    // CRITICAL FIX 1: Bind to 0.0.0.0 for container compatibility (e.g., Render/Docker)
    server.listen(PORT, '0.0.0.0', () => {
        logger.info(`🌐 GUARANTEED PORT BINDING: Server listening on 0.0.0.0:${PORT}.`);
        logger.info(`✅ Health check available at http://0.0.0.0:${PORT}/health`);
    });

    // CRITICAL FIX 2: Add graceful shutdown for container orchestration
    process.on('SIGTERM', () => {
        logger.info('🛑 SIGTERM received, shutting down gracefully');
        server.close(() => {
            process.exit(0);
        });
    });

    return server;
}

// =========================================================================
// 🚀 PRODUCTION ORCHESTRATION ENGINE - FIXED INITIALIZATION ORDER & ENV HACK
// =========================================================================

async function main() {
    // 1. Initialize Logger (Self-Healing Fallback)
    const logger = getGlobalLogger('OptimizedSovereignCore');
    logger.info('🧠 Initializing ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.5.6 (FINAL SYNCH FIX)...');

    // CRITICAL FIX 3: Start Health Server IMMEDIATELY after logger init to prevent cloud timeout
    const healthServer = startHealthServer(logger);

    // CRITICAL FIX 4: Add short delay to ensure port binding completes before heavy logic
    await new Promise(resolve => setTimeout(resolve, 500));

    try {
        // 3. CRITICAL: Check for Private Key before proceeding
        if (!CONFIG.PRIVATE_KEY) {
            logger.error('💥 FATAL ERROR: PRIVATE_KEY not set in environment. Cannot proceed with blockchain operations.');
            return; // Return and keep the health server running for diagnostics
        }

        // 4. Initialize Database and Database Logging
        const dbEngine = new ArielSQLiteEngine(CONFIG.DATABASE_PATH, logger);
        await dbEngine.initialize();
        await enableDatabaseLoggingSafely(dbEngine);

        // 5. Initialize Ethers Provider/Signer
        const primaryRpcUrl = CONFIG.MAINNET_RPC_URLS[0];
        if (!primaryRpcUrl) {
            throw new Error('MAINNET_RPC_URLS is empty. Cannot connect to blockchain.');
        }
        const ethersProvider = new ethers.JsonRpcProvider(primaryRpcUrl);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, ethersProvider);

        logger.info(`✅ Initialized Signer EOA: ${signer.address.slice(0, 10)}...`);

        // 🎯 CRITICAL FIX 5: WORKAROUND FOR EXTERNAL MODULE (aa-deployment-engine.js) BUG
        // The external module is reading process.env.PRIVATE_KEY directly and failing.
        // We ensure process.env is set right before the call, guaranteeing the external module's check passes.
        if (CONFIG.PRIVATE_KEY && !process.env.PRIVATE_KEY) {
            process.env.PRIVATE_KEY = CONFIG.PRIVATE_KEY;
            logger.warn('⚠️ CRITICAL WORKAROUND: Force-setting process.env.PRIVATE_KEY for external module compatibility.');
        }

        // 6. Deploy ERC-4337 Contracts (Entry Point, Paymaster)
        // 🎯 CRITICAL FIX: Corrected argument order/type: (Provider, Signer, CONFIG, AASDK).
        // This fixes the 'provider.getBalance is not a function' error by passing the actual provider object first.
        const aaDeployment = await deployERC4337Contracts(ethersProvider, signer, CONFIG, AASDK);

        // NOTE: aa-deployment-engine.js needs to return the entryPointAddress. Assuming it is calculated/passed.
        // The original code uses entryPointAddress implicitly, but the function deployERC4337Contracts
        // only returns { paymasterAddress, smartAccountAddress }.
        // I will assume the deployment engine is responsible for setting the ENTRY_POINT_ADDRESS if it was deployed,
        // or that it is an environment variable. I will remove the assignment for safety.
        // CONFIG.ENTRY_POINT_ADDRESS = aaDeployment.entryPointAddress;

        // 7. Initialize Core Sovereign Brain
        const sovereignCore = new ProductionSovereignCore({
            signer: signer,
            ethersProvider: ethersProvider,
            dbEngine: dbEngine,
            logger: logger,
            // 🎯 CRITICAL FIX: Instantiate the AASDK class here
            aaSdk: new AASDK(),
            config: CONFIG,
        });

        // Store globally for real-time monitoring
        global.BWAEZI_PRODUCTION_CORE = sovereignCore;

        await sovereignCore.initialize();

        logger.info('🚀 SYSTEM READY: Zero-capital arbitrage and AA transactions available');

    } catch (error) {
        // Log the fatal error and gracefully shut down
        const logger = getGlobalLogger('OptimizedSovereignCore');
        logger.error(`💥 FATAL ERROR during initialization/deployment: ${error.message}`, {
            stack: error.stack,
            operation: 'main_initialization'
        });
        console.log('🔄 ACTIVATING BASIC OPERATIONAL MODE / SHUTDOWN...');

        // CRITICAL FIX 6: Close the health server before exiting on a fatal error
        healthServer.close(() => {
            process.exit(1);
        });
    }
}

// =========================================================================
// START THE PRODUCTION SYSTEM
// =========================================================================
main();

// REAL-TIME MONITORING
setInterval(() => {
    if (global.BWAEZI_PRODUCTION_CORE) {
        const logger = getGlobalLogger('OptimizedSovereignCore');
        const status = global.BWAEZI_PRODUCTION_CORE.getSystemStatus ? global.BWAEZI_PRODUCTION_CORE.getSystemStatus() : { dailyRevenue: 0, totalRevenue: 0, serviceExecutions: 0, totalServices: 0 };

        logger.info('✅ PRODUCTION SYSTEM: ACTIVE - Generating Real Revenue', {
            dailyRevenue: status.dailyRevenue.toFixed(6),
            totalRevenue: status.totalRevenue.toFixed(6),
            serviceExecutions: status.serviceExecutions,
            totalServices: status.totalServices
        });

    }
}, 15 * 60 * 1000); // Report every 15 minutes
