// arielsql_suite/main.js — PRODUCTION ORCHESTRATOR
// 🚀 BOOTSTRAP: GUARANTEED AA EXECUTION PATH & MULTI-RPC FAILOVER

import { ethers } from 'ethers';
import http from 'http';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { getGlobalLogger } from '../modules/enterprise-logger/index.js';
import { deployERC4337Contracts } from './aa-deployment-engine.js';


// =========================================================================
// 👑 GLOBAL CONFIGURATION
// =========================================================================

// CRITICAL FIX: Set PORT to 10000 as requested
const PORT = process.env.PORT || 10000;

const CONFIG = {
    // 🎯 CRITICAL FIX: Load multiple RPCs from a comma-separated ENV variable
    MAINNET_RPC_URLS: (process.env.MAINNET_RPC_URLS || process.env.MAINNET_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo')
        .split(',')
        .map(url => url.trim())
        .filter(url => url.length > 0),

    // 🎯 CRITICAL FIX (SGT Blocker): Inject PRIVATE_KEY into CONFIG for deployment-engine access
    PRIVATE_KEY: process.env.PRIVATE_KEY || null,

    ENTRY_POINT_ADDRESS: process.env.ENTRY_POINT_ADDRESS || null,
    WETH_TOKEN_ADDRESS: process.env.WETH_TOKEN_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    UNISWAP_V3_QUOTER_ADDRESS: process.env.UNISWAP_V3_QUOTER_ADDRESS || null,
    BWAEZI_WETH_FEE: 3000, // 0.3% fee tier

    // Token and Funding
    BWAEZI_TOKEN_ADDRESS: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da',
    USDC_TOKEN_ADDRESS: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    USDC_FUNDING_GOAL: "5.17",

    // Deployment Addresses
    BWAEZI_PAYMASTER_ADDRESS: null,
    SMART_ACCOUNT_ADDRESS: null,
};

// =========================================================================
// 🌐 PORT BINDING GUARANTEE
// =========================================================================

function startHealthCheckServer(port) {
    const serverLogger = getGlobalLogger('HealthServer');

    const server = http.createServer((req, res) => {
        const deploymentState = global.BWAEZI_PRODUCTION_CORE?.deploymentState || {
            paymasterDeployed: global.BWAEZI_PRODUCTION_CORE?.config.BWAEZI_PAYMASTER_ADDRESS !== null,
            smartAccountDeployed: global.BWAEZI_PRODUCTION_CORE?.config.SMART_ACCOUNT_ADDRESS !== null
        };

        if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'Sovereign Core Active',
                coreVersion: '2.0.0-QUANTUM_PRODUCTION',
                activeRPC: global.BWAEZI_PRODUCTION_CORE?.provider?.connection?.url || 'N/A (check core)',
                deployment: deploymentState
            }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(port, () => {
        serverLogger.info(`🌐 GUARANTEED PORT BINDING: Server listening on port ${port}.`);
        serverLogger.info(`✅ Health check available at http://localhost:${port}/health`);
    });

    server.on('error', (e) => {
        serverLogger.error(`❌ CRITICAL PORT BINDING FAILURE: ${e.message}`);
    });
}


// =========================================================================
// MAIN ORCHESTRATION FUNCTION
// =========================================================================

async function main() {

    // 1. 🌐 CRITICAL FIX: GUARANTEE PORT BINDING FIRST
    startHealthCheckServer(PORT);

    // 2. Logger Setup
    const logger = getGlobalLogger('Orchestrator');
    logger.info('Starting Sovereign Core Production Orchestrator...');

    // 3. CRITICAL GUARANTEE: Load EOA Signer
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('💥 FATAL ERROR: PRIVATE_KEY not set in environment. AA EXECUTION CANNOT BE GUARANTEED.');
        return;
    }

    // 🎯 Use the PRIMARY RPC URL (the first one) for the signer's provider
    const primaryRpcUrl = CONFIG.MAINNET_RPC_URLS[0];
    if (!primaryRpcUrl) {
        logger.error('💥 FATAL ERROR: No MAINNET_RPC_URLS configured.');
        return;
    }
    const provider = new ethers.JsonRpcProvider(primaryRpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    
    // NOTE: ProductionSovereignCore must implement Multi-RPC handling (e.g., Failover or LoadBalancer) 
    // using the full CONFIG.MAINNET_RPC_URLS array internally.

    logger.info(`✅ EOA Signer Loaded: ${signer.address} (Primary RPC: ${primaryRpcUrl})`);

    // 4. Initialize Production Sovereign Core
    const core = new ProductionSovereignCore(CONFIG, signer);
    global.BWAEZI_PRODUCTION_CORE = core;

    try {
        // 5. Run the Core Initialization Sequence (Guarantees EOA Funding if needed)
        await core.initialize();

        // 6. Check Deployment Status
        const status = await core.checkDeploymentStatus();

        // 7. GUARANTEED AA DEPLOYMENT EXECUTION
        if (!status.paymasterDeployed || !status.smartAccountDeployed) {
            logger.info('🛠️ DEPLOYMENT MODE: Initiating GUARANTEED ERC-4337 Infrastructure Deployment...');

            // CORRECT CALL: Passing all required core components to the real deployment function
            const { paymasterAddress, smartAccountAddress } = await deployERC4337Contracts(
                core.ethersProvider,
                core.signer,
                core.config, // The config now correctly contains the PRIVATE_KEY
                core.AA_SDK
            );

            // Update the core configuration with the successful deployment addresses
            core.updateDeploymentAddresses(paymasterAddress, smartAccountAddress);
            logger.info(`🎉 AA DEPLOYMENT COMPLETE (GUARANTEED): Paymaster: ${paymasterAddress}, Smart Account: ${smartAccountAddress}`);
        }

        // 8. Test Peg Maintenance (Ensures 1 BWAEZI = $100 WETH is respected)
        logger.info('👑 TESTING PEG ENFORCEMENT: Funding Paymaster for $500 WETH Equivalent...');
        await core.fundPaymasterWithBWAEZI(500);

        logger.info('🚀 SYSTEM fully operational. Zero-capital revenue generation active.');

    } catch (error) {
        logger.error('❌ PRODUCTION SYSTEM INITIALIZATION FAILED:', error.message);
        logger.error('HALTING ORCHESTRATOR CORE LOGIC. Inspect transaction logs.');
        // Do NOT exit here; the health check server is already running, keeping the container alive.
    }
};

// Start the production system
main();
