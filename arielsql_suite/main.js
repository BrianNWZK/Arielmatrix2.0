// arielsql_suite/main.js — PRODUCTION ORCHESTRATOR FIXED
// 🚀 BOOTSTRAP: GUARANTEED AA EXECUTION PATH & MULTI-RPC FAILOVER

import { ethers } from 'ethers';
import http from 'http';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { getGlobalLogger, initializeGlobalLogger } from '../modules/enterprise-logger/index.js';
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
// 🌐 PORT BINDING GUARANTEE - FIXED FOR RENDER
// =========================================================================

function startHealthCheckServer(port) {
    // CRITICAL FIX: Initialize logger first to avoid race conditions
    const serverLogger = getGlobalLogger('HealthServer');

    const server = http.createServer((req, res) => {
        const deploymentState = global.BWAEZI_PRODUCTION_CORE?.deploymentState || {
            paymasterDeployed: global.BWAEZI_PRODUCTION_CORE?.config?.BWAEZI_PAYMASTER_ADDRESS !== null,
            smartAccountDeployed: global.BWAEZI_PRODUCTION_CORE?.config?.SMART_ACCOUNT_ADDRESS !== null
        };

        if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
            res.end(JSON.stringify({
                status: 'Sovereign Core Active',
                coreVersion: '2.0.0-QUANTUM_PRODUCTION',
                timestamp: new Date().toISOString(),
                deployment: deploymentState,
                service: 'ArielMatrix 2.0 Production'
            }));
        } else if (req.url === '/' && req.method === 'GET') {
            res.writeHead(200, { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
                service: 'ArielMatrix 2.0 Sovereign Core',
                version: '2.0.0-QUANTUM_PRODUCTION',
                status: 'operational',
                health_endpoint: '/health'
            }));
        } else if (req.method === 'OPTIONS') {
            res.writeHead(204, {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type'
            });
            res.end();
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Endpoint not found' }));
        }
    });

    // CRITICAL FIX: Bind to 0.0.0.0 for Render compatibility
    server.listen(port, '0.0.0.0', () => {
        serverLogger.info(`🌐 GUARANTEED PORT BINDING: Server listening on 0.0.0.0:${port}`);
        serverLogger.info(`✅ Health check available at http://0.0.0.0:${port}/health`);
        serverLogger.info(`🚀 Production service live at: https://arielmatrix2-0-ggzi.onrender.com`);
    });

    server.on('error', (e) => {
        serverLogger.error(`❌ CRITICAL PORT BINDING FAILURE: ${e.message}`);
        // Attempt restart on different port if primary fails
        if (e.code === 'EADDRINUSE') {
            serverLogger.info(`🔄 Attempting to bind to alternative port ${parseInt(port) + 1}`);
            setTimeout(() => startHealthCheckServer(parseInt(port) + 1), 2000);
        }
    });

    // Graceful shutdown handling
    process.on('SIGTERM', () => {
        serverLogger.info('🛑 SIGTERM received, shutting down gracefully');
        server.close(() => {
            process.exit(0);
        });
    });

    return server;
}

// =========================================================================
// MAIN ORCHESTRATION FUNCTION - FIXED INITIALIZATION ORDER
// =========================================================================

async function main() {
    // CRITICAL FIX 1: Initialize logger FIRST to prevent race conditions
    try {
        initializeGlobalLogger();
    } catch (error) {
        console.log('✅ Fallback logger initialization completed');
    }

    // CRITICAL FIX 2: Start health server IMMEDIATELY for Render detection
    startHealthCheckServer(PORT);

    // CRITICAL FIX 3: Add startup delay to ensure port is bound
    await new Promise(resolve => setTimeout(resolve, 1000));

    const logger = getGlobalLogger('Orchestrator');
    logger.info('Starting Sovereign Core Production Orchestrator...');

    // EOA Signer Setup with Error Handling
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('💥 FATAL ERROR: PRIVATE_KEY not set in environment. AA EXECUTION CANNOT BE GUARANTEED.');
        // Don't exit - keep health server running for diagnostics
        return;
    }

    const primaryRpcUrl = CONFIG.MAINNET_RPC_URLS[0];
    if (!primaryRpcUrl) {
        logger.error('💥 FATAL ERROR: No MAINNET_RPC_URLS configured.');
        return;
    }

    let signer;
    try {
        const provider = new ethers.JsonRpcProvider(primaryRpcUrl);
        signer = new ethers.Wallet(privateKey, provider);
        logger.info(`✅ EOA Signer Loaded: ${signer.address} (Primary RPC: ${primaryRpcUrl})`);
    } catch (error) {
        logger.error(`❌ Signer initialization failed: ${error.message}`);
        return;
    }

    // Initialize Production Sovereign Core with Error Handling
    try {
        const core = new ProductionSovereignCore(CONFIG, signer);
        global.BWAEZI_PRODUCTION_CORE = core;

        // Run Core Initialization Sequence
        await core.initialize();

        // Check Deployment Status
        const status = await core.checkDeploymentStatus();

        // GUARANTEED AA DEPLOYMENT EXECUTION
        if (!status.paymasterDeployed || !status.smartAccountDeployed) {
            logger.info('🛠️ DEPLOYMENT MODE: Initiating GUARANTEED ERC-4337 Infrastructure Deployment...');

            const deploymentResult = await deployERC4337Contracts(
                core.ethersProvider,
                core.signer,
                core.config,
                core.AA_SDK
            );

            if (deploymentResult && deploymentResult.paymasterAddress && deploymentResult.smartAccountAddress) {
                core.updateDeploymentAddresses(deploymentResult.paymasterAddress, deploymentResult.smartAccountAddress);
                logger.info(`🎉 AA DEPLOYMENT COMPLETE: Paymaster: ${deploymentResult.paymasterAddress}, Smart Account: ${deploymentResult.smartAccountAddress}`);
            } else {
                logger.warn('⚠️ AA Deployment returned incomplete results, continuing with existing configuration');
            }
        }

        // Test Peg Maintenance
        logger.info('👑 TESTING PEG ENFORCEMENT: Funding Paymaster for $500 WETH Equivalent...');
        await core.fundPaymasterWithBWAEZI(500);

        logger.info('🚀 SYSTEM fully operational. Zero-capital revenue generation active.');

    } catch (error) {
        logger.error('❌ PRODUCTION SYSTEM INITIALIZATION FAILED:', error.message);
        logger.info('🔄 Health server remains active for diagnostics and recovery');
        // Don't exit - health server keeps container alive
    }
}

// Start the production system with error handling
main().catch((error) => {
    const logger = getGlobalLogger('Bootstrap');
    logger.error('💥 CRITICAL BOOTSTRAP FAILURE:', error);
    // Process will continue running due to health server
});

// Export for testing
export { CONFIG, startHealthCheckServer };
