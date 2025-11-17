// arielsql_suite/main.js
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
import { fileURLToPath } from 'url';
import path from 'path';

// 🔥 BSFM INTEGRATION: Import the Sovereign Brain Orchestrator (v2.5.2)
import { ProductionSovereignCore } from '../core/sovereign-brain.js';

// 👑 NEW IMPORTS (Assumed necessary for core system functionality)
import { AASDK } from '../modules/aa-loaves-fishes.js';
import { getGlobalLogger, setupGlobalLogger } from '../modules/enterprise-logger/index.js';

// 🔧 FIX: Import the real deployment engine (Assumed to exist in the path)
import { deployERC4337Contracts } from './aa-deployment-engine.js'; 

// =========================================================================
// CRITICAL FIX: ADDRESS NORMALIZATION HELPER 
// =========================================================================

// Helper function to safely normalize addresses (critical for Checksum compliance)
const safeNormalizeAddress = (address) => {
    if (!address || address.match(/^(0x)?[0]{40}$/)) {
        return address;
    }
    try {
        const lowercasedAddress = address.toLowerCase();
        return ethers.getAddress(lowercasedAddress);
    } catch (error) {
        console.warn(`⚠️ Address normalization failed for ${address}: ${error.message}`);
        return address.toLowerCase();
    }
};
const normalizeAddress = safeNormalizeAddress;

// =========================================================================
// PRODUCTION CONFIGURATION - OPTIMIZED
// =========================================================================

// Sovereign Wallet: 0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA
const SOVEREIGN_WALLET_ADDRESS = normalizeAddress(process.env.SOVEREIGN_WALLET_ADDRESS || '0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA'); 

// CRITICAL: Replace this with the NEW_PRODUCTION_TOKEN_ADDRESS after ZDTM.
// The old address '0x4BC3C633a12F5BFFCaC9080c51B0CD44e17d0A8F' is ERC-20 non-compliant.
const PRODUCTION_CONFIG = {
    // 🔥 CRITICAL: Update this address after the ZDTM is complete.
    bwaeziTokenAddress: normalizeAddress('0xF1d2208ABc26F8C04b49103280A2667734f24AC6'), // Current public address (Placeholder)
    WETH_TOKEN_ADDRESS: normalizeAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'), // WETH mainnet
    UNISWAP_V3_QUOTER_ADDRESS: normalizeAddress('0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6'), // Quoter V2
    BWAEZI_WETH_FEE: 3000, // 0.3% fee tier (Assumed optimal for BWAEZI/WETH)
    ENTRY_POINT_ADDRESS: normalizeAddress('0x5FF137d4BeaA7036d654A88Ea898DF565d304b88'), // ERC-4337 EntryPoint
    rpcUrls: [
        process.env.MAINNET_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo' // Must be replaced
    ],
    sovereignWallet: SOVEREIGN_WALLET_ADDRESS,
    // Deployment state will be updated by the deployment engine
    BWAEZI_PAYMASTER_ADDRESS: process.env.BWAEZI_PAYMASTER_ADDRESS || null,
    SMART_ACCOUNT_ADDRESS: process.env.SMART_ACCOUNT_ADDRESS || null,
};


// =========================================================================
// CORE ORCHESTRATION ENGINE
// =========================================================================

async function main() {
    setupGlobalLogger({ service: 'BSFM_Enterprise' });
    const logger = getGlobalLogger('main');
    
    logger.info('🧠 Initializing Sovereign Brain Engine (v2.5.2 - Deployment Stabilization)...');

    if (!process.env.SOVEREIGN_WALLET_PRIVATE_KEY || !PRODUCTION_CONFIG.rpcUrls[0]) {
        logger.error('❌ CRITICAL CONFIGURATION FAILURE: Private key or RPC URL not set.');
        throw new Error('Missing configuration data.');
    }

    // 1. Setup Ethers Provider and Signer
    const provider = new ethers.JsonRpcProvider(PRODUCTION_CONFIG.rpcUrls[0]);
    const signer = new ethers.Wallet(process.env.SOVEREIGN_WALLET_PRIVATE_KEY, provider);

    logger.info(`🔧 Creating ProductionSovereignCore instance...`);
    // 2. Initialize the Core Brain
    const brain = new ProductionSovereignCore(PRODUCTION_CONFIG, signer);
    
    // 3. Initialize Brain (Runs SGT if undercapitalized)
    await brain.initialize();
    
    // 4. Start ERC-4337 Deployment
    // This step relies on the EOA being funded by the successful SGT.
    if (!brain.deploymentState.paymasterDeployed || !brain.deploymentState.smartAccountDeployed) {
        logger.info('🔧 Starting ERC-4337 Contract Deployment...');
        
        try {
            const deploymentResult = await deployERC4337Contracts(provider, signer, PRODUCTION_CONFIG);
            
            if (deploymentResult.success) {
                logger.info('✅ ERC-4337 Deployment Success!');
                brain.updateDeploymentAddresses(
                    deploymentResult.paymasterAddress, 
                    deploymentResult.smartAccountAddress
                );
            } else {
                logger.error(`❌ ENGINE INITIALIZATION FAILED: Deployment failed: ${deploymentResult.error}`);
                throw new Error("ERC-4337 Contract Deployment Failed.");
            }
        } catch (error) {
            logger.error(`❌ ENGINE INITIALIZATION FAILED: Invalid engine instance`);
            // The console log below is used by the deployment environment (e.g., Render)
            console.error('❌ ENGINE INITIALIZATION FAILED: Invalid engine instance'); 
            return { success: false, error: error.message };
        }
    }

    // 5. Start API Server
    const app = express();
    const PORT = process.env.PORT || 10000;
    app.use(cors());
    app.use(express.json());

    // Health check endpoint
    app.get('/health', async (req, res) => {
        try {
            const healthReport = await brain.healthCheck();
            res.status(200).json(healthReport);
        } catch (error) {
            res.status(500).json({ status: 'UNHEALTHY', error: error.message });
        }
    });

    app.listen(PORT, () => {
        logger.info(`🚀 API Listening on port ${PORT}`);
        console.log(`🚀 API Listening on port ${PORT}`);
    });
    
    return { success: true };
}

// Global error handling and startup
// Refactored startup logic to use a robust Async IIFE 
(async () => {
    // Global error handling for synchronous issues
    process.on('uncaughtException', (error) => {
        console.error('💥 Uncaught Exception:', error);
    });

    // Global error handling for promises that were not handled with .catch()
    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Determine if running as the main module
    if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
        const result = await main(); 

        if (result.success) {
            console.log("🎉 BSFM Production System Started Successfully!");
            console.log("🚀 BWAEZI ENTERPRISE READY FOR 100M TOKEN ECONOMY!");
        } else {
            console.log("❌ BSFM Production System Started with Errors");
        }
    }
})().catch(error => {
    console.error("💥 FATAL ERROR DURING IIFE EXECUTION:", error);
    process.exit(1);
});
