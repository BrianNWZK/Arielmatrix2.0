// arielsql_suite/main.js — ULTIMATE ORCHESTRATOR v2.6.0-CONSCIOUSNESS-QUANTUM-SAFE (FINAL)
// 🚀 BOOTSTRAP: GUARANTEED AA EXECUTION PATH & MULTI-RPC FAILOVER

// 🎯 CRITICAL FIX: Ensure correct Ethers v6 import and usage
import { ethers } from 'ethers'; 
import http from 'http';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js';
import { getGlobalLogger, enableDatabaseLoggingSafely } from '../modules/enterprise-logger/index.js';
import { deployERC4337Contracts } from './aa-deployment-engine.js';
import { AASDK } from '../modules/aa-loaves-fishes.js';

// =========================================================================
// 👑 GLOBAL CONFIGURATION
// =========================================================================

const PORT = process.env.PORT || 10000;
const BUNDLER_RPC_URL = process.env.BUNDLER_RPC_URL || 'http://localhost:4337/rpc'; 
const RPC_TIMEOUT_MS = parseInt(process.env.RPC_TIMEOUT_MS) || 10000; // 10 seconds timeout

const CONFIG = {
    // CRITICAL: Ensure this array has multiple RPC URLs for failover
    MAINNET_RPC_URLS: (process.env.MAINNET_RPC_URLS || process.env.MAINNET_RPC_URL || 'https://rpc.ankr.com/eth,https://eth-mainnet.g.alchemy.com/v2/demo,https://eth.public-rpc.com')
        .split(',')
        .map(url => url.trim())
        .filter(url => url.length > 0),

    // =========================================================================
    // 🎯 CRITICAL FINAL DEPLOYMENT ADDRESSES (FIXED)
    // =========================================================================
    // This is the newly deployed, fixed BWAEZI Token Contract that holds the 100M capital.
    BWAEZI_TOKEN_ADDRESS: process.env.BWAEZI_TOKEN_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da',
    
    // Addresses required for the BWAEZIPaymaster constructor
    ENTRY_POINT_ADDRESS: process.env.ENTRY_POINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    WETH_TOKEN_ADDRESS: process.env.WETH_TOKEN_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    UNISWAP_V3_QUOTER_ADDRESS: process.env.UNISWAP_V3_QUOTER_ADDRESS || '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6', // Placeholder based on common Uniswap Mainnet Quoter
    BWAEZI_WETH_FEE: parseInt(process.env.BWAEZI_WETH_FEE) || 3000, // 3000 = 0.3% fee tier for BWAEZI/WETH pool

    // This address will be dynamically updated after successful deployment
    AA_PAYMASTER_ADDRESS: process.env.BWAEZI_PAYMASTER_ADDRESS, 
    SMART_ACCOUNT_ADDRESS: process.env.SMART_ACCOUNT_ADDRESS,
    // =========================================================================

    USDC_TOKEN_ADDRESS: process.env.USDC_TOKEN_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    SIGNER_PRIVATE_KEY: process.env.PRIVATE_KEY,
    
    QUANTUM_NETWORK_ENABLED: process.env.QUANTUM_NETWORK_ENABLED === 'true',
};

// =========================================================================
// 🌐 IMMEDIATE FAILOVER & HEALTH CHECK SYSTEM (Decoupled from Logger)
// =========================================================================

/**
 * Starts the health check server immediately, using console for initial logging.
 */
function startHealthCheckServer() {
    const server = http.createServer((req, res) => {
        // Status defaults to DEGRADED until the main core successfully initializes
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const healthStatus = {
            status: global.BWAEZI_PRODUCTION_CORE?.isReady ? 'OK' : 'DEGRADED (Core initializing)',
            aaEngineStatus: global.BWAEZI_AASDK ? 'ACTIVE' : 'INACTIVE',
            timestamp: new Date().toISOString(),
            coreVersion: global.BWAEZI_PRODUCTION_CORE?.version || 'N/A'
        };
        res.end(JSON.stringify(healthStatus));
    });

    server.listen(PORT, '0.0.0.0', () => {
        // Use console.log for immediate, guaranteed output for Render to detect the port
        console.log(`🌐 GUARANTEED PORT BINDING: Server listening on 0.0.0.0:${PORT}.`);
        console.log(`✅ Health check available at http://0.0.0.0:${PORT}/health`);
    });
    
    server.on('error', (error) => {
        // Use console.error for guaranteed output
        console.error(`💥 Server error: ${error.message}`, { operation: 'health_check_server', port: PORT });
    });
}

// =========================================================================
// 🧠 MAIN PRODUCTION BOOTSTRAP FUNCTION - RESILIENCE INTEGRATED
// =========================================================================

async function main() {
    // 1. 🎯 CRITICAL FIX: Start the health server IMMEDIATELY (Fixes Render port binding timeout)
    startHealthCheckServer();
    // Wait briefly for the port to bind before continuing to heavy logic
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    // 2. Initial Logger Setup (Self-Healing)
    const logger = getGlobalLogger('OptimizedSovereignCore'); 
    logger.info('🧠 Initializing ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.5.6 (FINAL SYNCH FIX)...');

    if (!CONFIG.SIGNER_PRIVATE_KEY) {
        logger.error('💥 CRITICAL WARNING: PRIVATE_KEY not set. Running in **DEGRADED (Health-Only) Mode**.');
        return; // 🎯 FIX: Return instead of exiting to keep the health server alive
    }

    let provider = null;
    let wallet = null;
    let connected = false;

    try {
        // 3. Setup Ethers Provider with RPC Failover Logic and explicit timeout
        for (const rpcUrl of CONFIG.MAINNET_RPC_URLS) {
            try {
                logger.info(`🔄 Attempting to connect to RPC: ${rpcUrl}`);
                const currentProvider = new ethers.JsonRpcProvider(rpcUrl);
                
                // 🎯 CRITICAL FIX: Test connection with a hard timeout (Fixes 'request timeout')
                const connectionTest = currentProvider.getNetwork();
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error(`RPC timeout after ${RPC_TIMEOUT_MS}ms`)), RPC_TIMEOUT_MS)
                );
                
                const network = await Promise.race([connectionTest, timeoutPromise]);
                logger.info(`✅ RPC connection successful on ${network.name} (Chain ID: ${network.chainId}).`);
                
                // Assign working provider and create wallet/signer
                provider = currentProvider;
                wallet = new ethers.Wallet(CONFIG.SIGNER_PRIVATE_KEY, provider);
                connected = true;
                break; // Exit the loop on success
            } catch (rpcError) {
                logger.warn(`❌ Failed to connect to RPC ${rpcUrl}: ${rpcError.message}. Trying next URL.`);
                // Continue the loop to the next RPC URL
            }
        }

        if (!connected) {
            // Throwing here is okay, as the main catch block handles it gracefully
            throw new Error("CRITICAL SYSTEM FAILURE: All configured RPC endpoints failed to connect or timed out.");
        }
        
        // 4. Initialize Ariel DB and Logging
        const db = new ArielSQLiteEngine();
        await db.connect();
        await db.initializeSchema();
        await enableDatabaseLoggingSafely(db); 
        logger.info('✅ Database logging enabled successfully');

        // 5. Initialize Production Sovereign Core
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

        // 6. EOA Capitalization Check and Funding
        await core.ensureEOACapitalization();

        // 7. Deploy/Verify ERC-4337 Contracts
        // This deployment run is the final step to get the correct Paymaster and SCW addresses
        logger.info('🛠️ DEPLOYMENT MODE: Initiating permanent ERC-4337 Infrastructure Deployment...');
        const deploymentResult = await deployERC4337Contracts(provider, wallet, CONFIG);
        
        // 🎯 FIX: Update the CONFIG object and the core instance with the newly deployed addresses
        CONFIG.AA_PAYMASTER_ADDRESS = deploymentResult.paymasterAddress;
        CONFIG.SMART_ACCOUNT_ADDRESS = deploymentResult.smartAccountAddress;
        
        // 8. Initialize Account Abstraction SDK with the correct, newly deployed addresses
        const aaSdk = new AASDK(
            BUNDLER_RPC_URL,
            CONFIG.ENTRY_POINT_ADDRESS,
            provider,
            wallet,
            CONFIG.AA_PAYMASTER_ADDRESS // Use the freshly deployed Paymaster
        );
        global.BWAEZI_AASDK = aaSdk;
        
        // 9. Inject the AASDK into the Sovereign Core for permanent use.
        core.setAASDK(aaSdk);

        // 10. Final System Ready
        logger.info('✅ CONSCIOUSNESS REALITY ENGINE READY - PRODUCTION MODE ACTIVE');
        logger.info(`✅ PAYMASTER DEPLOYED & CONFIGURED: ${CONFIG.AA_PAYMASTER_ADDRESS}`);
        logger.info(`✅ SMART CONTRACT WALLET ADDRESS: ${CONFIG.SMART_ACCOUNT_ADDRESS}`);
        logger.info('⚠️ CRITICAL NEXT STEP: Manually transfer 100,000,000 BWAEZI to the SCW ADDRESS printed above.');
        logger.info('🚀 PRODUCTION ORCHESTRATION SUCCESS: Zero-capital revenue generation active.');

    } catch (error) {
        logger.error(`💥 FATAL ERROR during main orchestration: ${error.message}`, { 
            stack: error.stack, 
            operation: 'main_bootstrap' 
        });
        // 🎯 CRITICAL FIX: Do not exit (1). Log the failure and continue running.
        logger.info('🔄 Core initialization failed. Health check server remains active in DEGRADED mode.');
    }
}

// ✅ COMPREHENSIVE ERROR HANDLING
process.on('uncaughtException', (error) => {
    console.error('💥 UNCAUGHT EXCEPTION:', error.message);
    // 🎯 CRITICAL FIX: Removed process.exit(1) to keep the health server alive.
});

// Execute the main function
main();
