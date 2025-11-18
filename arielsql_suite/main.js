// arielsql_suite/main.js
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';

// 🔥 BSFM INTEGRATION: Import the Sovereign Brain Orchestrator
// FIX: Removed WETH_ABI to avoid the SyntaxError, relying on sovereign-brain.js to define it internally.
import { ProductionSovereignCore, ERC20_ABI, SWAP_ROUTER_ABI } from '../core/sovereign-brain.js';

// 👑 NEW IMPORTS
import { AASDK } from '../modules/aa-loaves-fishes.js'; 
// 🔧 FIX: Import the real deployment engine
import { deployERC4337Contracts } from './aa-deployment-engine.js'; 

// =========================================================================
// CRITICAL FIX: ADDRESS NORMALIZATION HELPER (Defined for main.js and constants)
// =========================================================================

// Helper function to safely normalize addresses
const safeNormalizeAddress = (address) => {
    // FIX: Match the partial address placeholder to allow normalization without a crash or warning.
    if (!address || address.match(/^(0x)?[0]{40}$/) || address.includes('<') || address.includes('...')) {
        return address; 
    }
    try {
        const lowercasedAddress = address.toLowerCase();
        return ethers.getAddress(lowercasedAddress);
    } catch (error) {
        console.warn(`⚠️ Address normalization failed for ${address}: ${error.message}`);
        // Return original if normalization fails for known bad formats
        return address;
    }
};

// =========================================================================
// 👑 USDC Funding Configuration (REMOVED BigInt logic from main.js)
// =========================================================================
// Logic for parsing the amount to BigInt is now expected to be inside
// ProductionSovereignCore to avoid import/dependency issues.


// =========================================================================
// PRODUCTION CONFIGURATION - OPTIMIZED
// =========================================================================

// Helper to normalize addresses for Ethers.js Checksum compliance
const normalizeAddress = safeNormalizeAddress;

const PRODUCTION_CONFIG = {
    // 👑 BWAEZI SOVEREIGN ASSETS
    // 🔥 CRITICAL UPDATE: NEW DEPLOYED KERNEL ADDRESS
    BWAEZI_KERNEL_ADDRESS: normalizeAddress('0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'), 
    WETH_ADDRESS: normalizeAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
    
    // 🔥 CRITICAL ASSETS for Gas Funding Priority (USDC to ETH)
    usdcTokenAddress: normalizeAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'), // Standard USDC Mainnet Address
    // Passing the goal as a string for the Brain to parse
    usdcFundingGoal: "5.17", // The 5.17 USDC target amount

    // 🏦 WALLET/INFRASTRUCTURE
    SOVEREIGN_WALLET: normalizeAddress('0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA'),
    ENTRY_POINT_ADDRESS: normalizeAddress('0x5FF137d4BeaA7036d654A88Ea0623B7051B5d859'), 
    PAYMASTER_ADDRESS: null, // Deployed dynamically
    SMART_ACCOUNT_ADDRESS: null, // Deployed dynamically
    // ⚙️ GAS SETTINGS
    GAS_MANAGER_URL: process.env.GAS_MANAGER_URL || 'http://localhost:3000',
    MAX_PRIORITY_FEE_GWEI: 1.0, 
    MAX_FEE_PER_GAS_MULTIPLIER: 1.5,
    // 🌐 PROVIDER
    RPC_URL: process.env.RPC_URL || 'https://eth.llamarpc.com',

    // 🔥 CRITICAL FIX FOR SGT: MAPPING CONFIG KEYS TO EXPECTED BRAIN KEYS
    // These keys resolve the 'Contract target: null' error.
    bwaeziTokenAddress: normalizeAddress('0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'), // Mapped from BWAEZI_KERNEL_ADDRESS
    WETH_TOKEN_ADDRESS: normalizeAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'), // Mapped from WETH_ADDRESS
    UNISWAP_V3_QUOTER_ADDRESS: normalizeAddress('0xb27308f9F90D607463bb14A1BdeCfD32A464aBc7'), // Uniswap V3 Quoter V2 Mainnet
    BWAEZI_WETH_FEE: 3000, // 0.3% Fee Tier for the BWAEZI-WETH pool
};


// =========================================================================
// MAIN ORCHESTRATION ENGINE (UPDATED FOR DEPLOYMENT)
// =========================================================================

async function main() {
    console.log("🚀 INITIALIZING BSFM PRODUCTION CORE...");

    // 1. Setup Provider and Signer (EOA)
    const provider = new ethers.JsonRpcProvider(PRODUCTION_CONFIG.RPC_URL);
    const signer = new ethers.Wallet(process.env.SOVEREIGN_PRIVATE_KEY, provider);

    // 2. Instantiate AASDK
    // AASDK is an exported object literal, NOT a class.
    const aasdk = AASDK;

    // 3. Instantiate Sovereign Brain Orchestrator
    // FIX: Correcting constructor to match brain signature: constructor(config, signer)
    const brain = new ProductionSovereignCore(PRODUCTION_CONFIG, signer); 

    try {
        // 4. Run the Genesis Initialization Sequence (Self-Funding Attempt)
        await brain.initialize(); 

        // 5. CRITICAL STEP: DEPLOY ERC-4337 INFRASTRUCTURE
        console.log("🛠️ DEPLOYMENT MODE: Initiating ERC-4337 Infrastructure Deployment...");
        
        const deploymentAddresses = await deployERC4337Contracts(
            signer, 
            provider, 
            PRODUCTION_CONFIG.ENTRY_POINT_ADDRESS
        );

        // Update the brain and main config with the new addresses
        brain.updateDeploymentAddresses(
            deploymentAddresses.paymasterAddress, 
            deploymentAddresses.smartAccountAddress
        );
        PRODUCTION_CONFIG.PAYMASTER_ADDRESS = deploymentAddresses.paymasterAddress;
        PRODUCTION_CONFIG.SMART_ACCOUNT_ADDRESS = deploymentAddresses.smartAccountAddress;
        
        console.log(`✅ Deployment Complete. Paymaster: ${deploymentAddresses.paymasterAddress}`);
        console.log(`✅ Smart Account: ${deploymentAddresses.smartAccountAddress}`);
            
        // 6. Start Express API for Health/Metrics
        const app = express();
        app.use(cors());
        app.use(express.json());

        app.get('/health', async (req, res) => {
            const health = await brain.healthCheck();
            res.json(health);
        });

        const port = process.env.PORT || 8080;
        app.listen(port, () => {
            console.log(`✅ Web API listening on port ${port}`);
        });

        return { success: true };

    } catch (error) {
        console.error("💥 FATAL ERROR during initialization/deployment:", error);
        return { success: false, error: error.message };
    }
}

// =========================================================================
// STARTUP EXECUTION (FIXED for Deployment Stabilization)
// =========================================================================

// Refactored startup logic to use a robust Async IIFE to prevent build/concatenation errors.
// This encapsulation prevents misplaced external characters (like '}') from corrupting the top-level scope.
(async () => {
    // Global error handling for synchronous issues
    process.on('uncaughtException', (error) => {
        console.error('💥 Uncaught Exception:', error);
    });

    // Global error handling for promises that were not handled with .catch()
    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    });

    if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
        // Start the application
        const result = await main(); // Call main function and await its result

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
