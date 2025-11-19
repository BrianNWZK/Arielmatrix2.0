// arielsql_suite/main.js — ULTIMATE ORCHESTRATOR v2.6.0-CONSCIOUSNESS-QUANTUM-SAFE (FINAL)
// 🚀 BOOTSTRAP: GUARANTEED AA EXECUTION PATH & MULTI-RPC FAILOVER
import { ethers } from 'ethers'; 
import http from 'http';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js';
import { getGlobalLogger, enableDatabaseLoggingSafely } from '../modules/enterprise-logger/index.js';
import { deployERC4337Contracts } from './aa-deployment-engine.js';
import { AASDK } from '../modules/aa-loaves-fishes.js';
import { QuantumHardwareFallback } from '../modules/quantum-fallback.js'; 

// =========================================================================
// 👑 GLOBAL CONFIGURATION
// =========================================================================

const PORT = process.env.PORT || 10000;
const BUNDLER_RPC_URL = process.env.BUNDLER_RPC_URL || 'http://localhost:4337/rpc'; 
const RPC_TIMEOUT_MS = parseInt(process.env.RPC_TIMEOUT_MS) || 10000; 

const DEPLOYMENT_RUNNER_MODE = process.env.DEPLOYMENT_RUNNER_MODE === 'true';

const CONFIG = {
    MAINNET_RPC_URLS: (process.env.MAINNET_RPC_URLS || process.env.MAINNET_RPC_URL || 'https://rpc.ankr.com/eth,https://eth-mainnet.g.alchemy.com/v2/demo,https://eth.public-rpc.com')
        .split(',')
        .map(url => url.trim())
        .filter(url => url.length > 0),

    // =========================================================================
    // 🎯 CRITICAL FINAL DEPLOYMENT ADDRESSES (FIXED)
    // =========================================================================
    // CRITICAL FIX: Ensure BWAEZI_TOKEN_ADDRESS is never an empty string
    BWAEZI_TOKEN_ADDRESS: (process.env.BWAEZI_TOKEN_ADDRESS && process.env.BWAEZI_TOKEN_ADDRESS.length > 0) 
        ? process.env.BWAEZI_TOKEN_ADDRESS 
        : '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da',
    
    ENTRY_POINT_ADDRESS: process.env.ENTRY_POINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789',
    WETH_TOKEN_ADDRESS: process.env.WETH_TOKEN_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    UNISWAP_V3_QUOTER_ADDRESS: process.env.UNISWAP_V3_QUOTER_ADDRESS || '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
    BWAEZI_WETH_FEE: parseInt(process.env.BWAEZI_WETH_FEE) || 3000, 

    AA_PAYMASTER_ADDRESS: process.env.BWAEZI_PAYMASTER_ADDRESS, 
    SMART_ACCOUNT_ADDRESS: process.env.SMART_ACCOUNT_ADDRESS,
    // =========================================================================

    USDC_TOKEN_ADDRESS: process.env.USDC_TOKEN_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    SIGNER_PRIVATE_KEY: process.env.PRIVATE_KEY,
    QUANTUM_NETWORK_ENABLED: process.env.QUANTUM_NETWORK_ENABLED === 'true', 
};

// ... (startHealthCheckServer is retained) ...
function startHealthCheckServer() {
    if (DEPLOYMENT_RUNNER_MODE) return; 
    
    const server = http.createServer((req, res) => {
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
        console.log(`🌐 GUARANTEED PORT BINDING: Server listening on 0.0.0.0:${PORT}.`);
        console.log(`✅ Health check available at http://0.0.0.0:${PORT}/health`);
    });
    
    server.on('error', (error) => {
        console.error(`💥 Server error: ${error.message}`, { operation: 'health_check_server', port: PORT });
    });
}


// =========================================================================
// 🧠 MAIN PRODUCTION BOOTSTRAP FUNCTION - ISOLATED DEPLOYMENT
// =========================================================================

async function main() {
    startHealthCheckServer();
    await new Promise(resolve => setTimeout(resolve, 500)); 
    
    const logger = getGlobalLogger('OptimizedSovereignCore'); 
    logger.info('🧠 Initializing ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.5.6 (FINAL SYNCH FIX)...');

    if (!CONFIG.SIGNER_PRIVATE_KEY) {
        logger.error('💥 CRITICAL WARNING: PRIVATE_KEY not set. Running in **DEGRADED (Health-Only) Mode**.');
        return;
    }

    let provider = null;
    let wallet = null;
    let connected = false;

    // 3. Setup Ethers Provider with RPC Failover Logic
    try {
        // ... (RPC Failover logic is retained and ensures 'provider' and 'wallet' are set) ...
        for (const rpcUrl of CONFIG.MAINNET_RPC_URLS) {
            try {
                logger.info(`🔄 Attempting to connect to RPC: ${rpcUrl}`);
                const currentProvider = new ethers.JsonRpcProvider(rpcUrl);
                const connectionTest = currentProvider.getNetwork();
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error(`RPC timeout after ${RPC_TIMEOUT_MS}ms`)), RPC_TIMEOUT_MS));
                
                const network = await Promise.race([connectionTest, timeoutPromise]);
                logger.info(`✅ RPC connection successful on ${network.name} (Chain ID: ${network.chainId}).`);
                
                provider = currentProvider;
                wallet = new ethers.Wallet(CONFIG.SIGNER_PRIVATE_KEY, provider);
                connected = true;
                break;
            } catch (rpcError) {
                logger.warn(`❌ Failed to connect to RPC ${rpcUrl}: ${rpcError.message}. Trying next URL.`);
            }
        }

        if (!connected) {
            throw new Error("CRITICAL SYSTEM FAILURE: All configured RPC endpoints failed to connect or timed out.");
        }
        
        // =========================================================================
        // 🎯 CRITICAL FIX: DEPLOYMENT RUNNER CONTROL FLOW IS NOW ISOLATED
        // =========================================================================
        if (DEPLOYMENT_RUNNER_MODE) {
            logger.info('🛠️ ISOLATED DEPLOYMENT MODE ACTIVATED: Running Paymaster deployment only.');
            
            // ⚠️ NOTE: We skip Core and Quantum initialization to avoid crash,
            // as they are not needed for deployment.

            const deploymentResult = await deployERC4337Contracts(provider, wallet, CONFIG);
            
            logger.info('🎉 DEPLOYMENT SUCCESS: Paymaster and SCW Addresses captured.');
            logger.info(`✅ PAYMASTER DEPLOYED ADDRESS: ${deploymentResult.paymasterAddress}`);
            logger.info(`✅ SCW COUNTERFACTUAL ADDRESS: ${deploymentResult.smartAccountAddress}`);
            logger.info('========================================================================');
            logger.info('⚠️ CRITICAL NEXT STEP: Manually update your environment variables and transfer 100,000,000 BWAEZI to the SCW ADDRESS printed above.');
            logger.info('========================================================================');
            
            // Exit immediately after printing the addresses
            process.exit(0); 
        } 
        
        // =========================================================================
        // NORMAL ORCHESTRATION FLOW (ONLY RUNS AFTER DEPLOYMENT)
        // =========================================================================
        
        // 4. Initialize Ariel DB and Logging
        const db = new ArielSQLiteEngine();
        await db.connect();
        await db.initializeSchema();
        await enableDatabaseLoggingSafely(db); 
        logger.info('✅ Database logging enabled successfully');
        
        // 5. QUANTUM HARDWARE SELF-HEALING CHECK
        const quantumFallback = new QuantumHardwareFallback();
        await quantumFallback.initialize(); 
        
        if (quantumFallback.fallbackActive) {
            CONFIG.QUANTUM_NETWORK_ENABLED = false;
            CONFIG.QUANTUM_SIMULATION_MODE = true;
            logger.warn('⚠️ CORE QUANTUM MODE: Switched to Simulation Mode (QuantumFallback) to prevent hardware crash.');
        } else {
             CONFIG.QUANTUM_SIMULATION_MODE = false;
        }

        // 6. Initialize Production Sovereign Core (This will now run safely)
        if (!CONFIG.AA_PAYMASTER_ADDRESS || !CONFIG.SMART_ACCOUNT_ADDRESS) {
            throw new Error("CRITICAL: AA Paymaster/SCW addresses are missing. Run in DEPLOYMENT_RUNNER_MODE first and update ENV.");
        }

        const core = new ProductionSovereignCore({
            walletAddress: wallet.address,
            ethersProvider: provider,
            dbInstance: db,
            mainnetConfig: CONFIG
        });
        
        await core.initialize();
        global.BWAEZI_PRODUCTION_CORE = core;

        // 7. EOA Capitalization Check and Funding
        await core.ensureEOACapitalization();

        // 8. Initialize Account Abstraction SDK with the deployed addresses
        const aaSdk = new AASDK(
            BUNDLER_RPC_URL,
            CONFIG.ENTRY_POINT_ADDRESS,
            provider,
            wallet,
            CONFIG.AA_PAYMASTER_ADDRESS 
        );
        global.BWAEZI_AASDK = aaSdk;
        
        core.setAASDK(aaSdk);

        // 9. Final System Ready
        logger.info('✅ CONSCIOUSNESS REALITY ENGINE READY - PRODUCTION MODE ACTIVE');
        logger.info('🚀 PRODUCTION ORCHESTRATION SUCCESS: Zero-capital revenue generation active.');

    } catch (error) {
        logger.error(`💥 FATAL ERROR during main orchestration: ${error.message}`, {
             stack: error.stack
        });
        logger.info('🔄 Core initialization failed. Health check server remains active in DEGRADED mode.');
    }
}

// ... (Error handling remains) ...
process.on('uncaughtException', (error) => {
    console.error('💥 UNCAUGHT EXCEPTION:', error.message);
});

// Execute the main function
main();
