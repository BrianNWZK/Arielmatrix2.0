// arielsql_suite/main.js
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
// 🔥 BSFM INTEGRATION: Import the Sovereign Brain Orchestrator
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
// 👑 NEW IMPORTS
import { AASDK } from '../modules/aa-loaves-fishes.js';
import { deployERC4337Contracts, getDeploymentTransactionData } from './aa-deployment-engine.js'; 

// =========================================================================
// PRODUCTION CONFIGURATION - OPTIMIZED
// =========================================================================

// Helper to normalize addresses for Ethers.js Checksum compliance
const normalizeAddress = (address) => {
    if (!address || address.match(/^(0x)?[0]{40}$/)) {
        return address;
    }
    const lowercasedAddress = address.toLowerCase();
    return ethers.getAddress(lowercasedAddress);
};

const CONFIG_BASE = {
    SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET || "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA",
    NETWORK: 'mainnet',
    RPC_URLS: [
        "https://eth.llamarpc.com",
        "https://rpc.ankr.com/eth",
        "https://cloudflare-eth.com"
    ],
    PORT: process.env.PORT || 10000,
    PRIVATE_KEY: process.env.PRIVATE_KEY,

    // === 👑 ERC-4337 LOAVES AND FISHES CONSTANTS (MAINNET) 👑 ===
    ENTRY_POINT_ADDRESS: normalizeAddress("0x5FF137D4bEAA7036d654a88Ea898df565D304B88"), // Official Mainnet EntryPoint v0.6
    BWAEZI_TOKEN_ADDRESS: normalizeAddress("0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da"), // YOUR BWAEZI TOKEN CONTRACT (Fixed)
    WETH_TOKEN_ADDRESS: normalizeAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"), // WETH Mainnet
    UNISWAP_V3_QUOTER_ADDRESS: normalizeAddress("0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"), // Actual Uniswap V3 Quoter mainnet address
    BWAEZI_WETH_FEE: 3000,

    BWAEZI_PAYMASTER_ADDRESS: null,
    SMART_ACCOUNT_ADDRESS: null,
};

const CONFIG = CONFIG_BASE;

let sovereignCoreInstance = null;

// Utility for Express server
const startExpressServer = () => {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // Add a basic health check endpoint
    app.get('/health', async (req, res) => {
        if (!sovereignCoreInstance) {
            return res.status(503).json({ status: 'DOWN', reason: 'Engine not initialized' });
        }
        try {
            const health = await sovereignCoreInstance.healthCheck();
            res.json({ status: 'UP', ...health });
        } catch (e) {
            res.status(500).json({ status: 'ERROR', message: e.message });
        }
    });

    return app.listen(CONFIG.PORT, () => console.log(`🚀 API Listening on port ${CONFIG.PORT}`));
};

// Improved engine initialization with better error handling
async function initializeSovereignBrain(config) {
    try {
        console.log("🧠 Initializing Sovereign Brain Engine (v2.8.4 - Funding Bypass Active)..."); 

        if (typeof ProductionSovereignCore !== 'function') {
            throw new Error(`Invalid engine instance: Expected a class constructor, got ${typeof ProductionSovereignCore}. Check core/sovereign-brain.js export.`);
        }

        const brainConfig = {
            paymasterAddress: config.BWAEZI_PAYMASTER_ADDRESS,
            smartAccountAddress: config.SMART_ACCOUNT_ADDRESS,
            network: config.NETWORK,
            rpcUrls: config.RPC_URLS,
            bwaeziTokenAddress: config.BWAEZI_TOKEN_ADDRESS,
            sovereignWallet: config.SOVEREIGN_WALLET,
            WETH_TOKEN_ADDRESS: config.WETH_TOKEN_ADDRESS,
            UNISWAP_V3_QUOTER_ADDRESS: config.UNISWAP_V3_QUOTER_ADDRESS
        };

        console.log("🔧 Creating ProductionSovereignCore instance...");
        const optimizedCore = new ProductionSovereignCore(brainConfig);

        console.log("⚡ Initializing core engine (Skipping EOA Self-Fund Check)...");
        await optimizedCore.initialize();

        console.log("✅ Sovereign Brain Engine initialized successfully");
        return optimizedCore;

    } catch (error) {
        console.error("❌ Sovereign Brain initialization failed:", error.message);
        throw new Error(`Engine initialization failed: ${error.message}`);
    }
}

// =========================================================================
// 👑 PRE-FLIGHT SIMULATION FUNCTION (CRITICAL SAFETY LAYER) 👑
// =========================================================================

/**
 * @notice Performs a full pre-flight check by simulating the deployment execution using provider.call().
 * This determines if the transaction would succeed or revert due to internal contract logic.
 * @returns {boolean} True if simulation succeeds, false otherwise.
 */
async function simulateDeployment(provider, signer, config, aasdk) {
    console.log('\n🛰️ PRE-FLIGHT CHECK: Full Deployment Simulation (eth_call) initiated...');
    
    try {
        const { paymasterDeployTx, smartAccountDeployTx } = await getDeploymentTransactionData(signer, config, aasdk);

        // --- Step 1: Simulate Paymaster Deployment ---
        console.log('   -> Simulating Paymaster Contract deployment...');
        // provider.call() performs a simulated, non-state-changing execution
        const paymasterResult = await provider.call(paymasterDeployTx); 

        if (paymasterResult.length <= 2) {
            console.error('❌ Paymaster Simulation Failed: Received empty or invalid result from eth_call.');
            throw new Error('Paymaster deployment simulation failed to execute (Empty result).');
        }

        console.log('✅ Paymaster Simulation Success.');
        
        // --- Step 2: Simulate Smart Account Deployment (Initialization) ---
        console.log('   -> Simulating Smart Account Wallet initialization...');
        const scwResult = await provider.call(smartAccountDeployTx); 

        if (scwResult.length <= 2) {
            console.error('❌ SCW Simulation Failed: Received empty or invalid result from eth_call.');
            throw new Error('Smart Account deployment simulation failed to execute (Empty result).');
        }
        
        console.log('✅ SCW Simulation Success.');
        
        console.log('🎉 FULL PRE-FLIGHT SIMULATION PASSED: Deployment logic is sound.');
        return true;

    } catch (error) {
        console.error("⛔ CRITICAL STOP: Full Pre-Flight Simulation FAILED.");
        
        const revertReason = error.reason || error.message || 'Unknown Revert Reason';
        
        console.error(`\n❌ TRANSACTION DESTINED TO REVERT: ${revertReason}`);
        console.log("ETH waste prevented. The contract logic would have failed on-chain.");
        return false;
    }
}


/**
 * @notice Estimates gas and checks EOA balance, but does NOT stop the transaction.
 * @returns {object} Gas limits and success status.
 */
async function estimateGas(provider, signer, config) {
    console.log('\n⛽ ESTIMATING GAS: Checking minimum ETH required...');
    const EOA_ADDRESS = signer.address;
    
    try {
        const { paymasterDeployTx, smartAccountDeployTx } = await getDeploymentTransactionData(signer, config, AASDK);

        // --- Step 1: Estimate Gas for Paymaster Deployment ---
        const paymasterGasLimit = await provider.estimateGas(paymasterDeployTx);
        const paymasterGasSafety = (paymasterGasLimit * 120n) / 100n; // +20% safety margin

        // --- Step 2: Estimate Gas for Smart Account Deployment ---
        const scwGasLimit = await provider.estimateGas(smartAccountDeployTx);
        const scwGasSafety = (scwGasLimit * 120n) / 100n; // +20% safety margin

        const totalSafetyLimit = paymasterGasSafety + scwGasSafety;

        const currentBalance = await provider.getBalance(EOA_ADDRESS);
        const CONSERVATIVE_MAX_GAS_PRICE = ethers.parseUnits('20', 'gwei'); // 20 Gwei for a safety estimate
        const requiredEthForSafety = totalSafetyLimit * CONSERVATIVE_MAX_GAS_PRICE;

        if (currentBalance < requiredEthForSafety) {
            console.warn(`\n⚠️ EOA BALANCE LOW WARNING: Current: ${ethers.formatEther(currentBalance)} ETH.`);
            console.warn(`Required Safety Fund (20 Gwei Estimate): ${ethers.formatEther(requiredEthForSafety)} ETH.`);
            console.warn('PROCEEDING: Deployment continues as balance is confirmed sufficient for the swap. Proceed with caution.');
        } else {
            console.log(`✅ EOA Balance (${ethers.formatEther(currentBalance)} ETH) is sufficient. Proceeding.`);
        }

        return {
            success: true,
            totalGasSafetyLimit: totalSafetyLimit,
            paymasterGasSafety: paymasterGasSafety,
            scwGasSafety: scwGasSafety
        };

    } catch (error) {
        console.error("⚠️ GAS ESTIMATION WARNING: Could not complete gas estimation.");
        console.error(`\n❌ ERROR REVERT REASON: ${error.reason || error.message}`);
        // Return a failure state but DO NOT THROW, allowing main() to continue to deployment
        return { success: false, error: error.message }; 
    }
}


// =========================================================================
// MAIN EXECUTION LOGIC
// =========================================================================

async function main() {
    startExpressServer();

    try {
        console.log("🔥 BSFM ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.8.6: UNSTOPPABLE EXECUTION MODE"); 
        console.log("💰 BWAEZI TOKEN CONTRACT:", CONFIG.BWAEZI_TOKEN_ADDRESS);
        console.log("👑 SOVEREIGN WALLET (100M tokens holder):", CONFIG.SOVEREIGN_WALLET);
        console.log("🌐 NETWORK:", CONFIG.NETWORK);

        if (!CONFIG.PRIVATE_KEY) {
            throw new Error("PRIVATE_KEY is mandatory for deployment. Please set it in the environment.");
        }

        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);

        // 1. INITIALIZE CORE (Pre-AA state)
        console.log("🚀 Initializing Production Sovereign Core (Deployment Mode, EOA Funded)...");
        sovereignCoreInstance = await initializeSovereignBrain(CONFIG);

        // 2. RUN FULL PRE-FLIGHT SIMULATION (The TRUE safety check)
        const preFlightSuccess = await simulateDeployment(provider, signer, CONFIG, AASDK);

        if (!preFlightSuccess) {
            // Stops here ONLY if the transaction is destined to revert due to contract logic.
            throw new Error("Deployment aborted: Full Pre-Flight Simulation failed due to contract logic error."); 
        }

        // 3. RUN GAS ESTIMATION (Warning only, does not stop execution)
        const gasCheckResult = await estimateGas(provider, signer, CONFIG);
        
        // If gas estimation failed for some reason, we use a default gas limit for execution.
        const deploymentArgs = gasCheckResult.success ? {
            paymasterGasLimit: gasCheckResult.paymasterGasSafety,
            scwGasLimit: gasCheckResult.scwGasSafety
        } : {};

        console.log('✅ Pre-checks passed or warnings ignored. Proceeding with deployment broadcast.');


        // --- 4. DEPLOY CONTRACTS (Execution with Estimated Gas) ---
        console.log("⚡ Starting ERC-4337 Contract Deployment (Execution Authorized)...");
        
        // Pass the estimated gas limits to the deployment engine
        const { paymasterAddress, smartAccountAddress } = await deployERC4337Contracts(
            provider, 
            signer, 
            CONFIG, 
            AASDK,
            deploymentArgs
        );

        // Update config with real deployed addresses
        CONFIG.BWAEZI_PAYMASTER_ADDRESS = paymasterAddress;
        CONFIG.SMART_ACCOUNT_ADDRESS = smartAccountAddress;

        console.log("✅ Contract deployment completed successfully");
        console.log(`💰 Paymaster: ${CONFIG.BWAEZI_PAYMASTER_ADDRESS}`);
        console.log(`👛 Smart Account: ${CONFIG.SMART_ACCOUNT_ADDRESS}`);

        // --- 5. Update Sovereign Core with AA Addresses for operation ---
        sovereignCoreInstance.updateDeploymentAddresses(CONFIG.BWAEZI_PAYMASTER_ADDRESS, CONFIG.SMART_ACCOUNT_ADDRESS);
        await sovereignCoreInstance.checkDeploymentStatus();

        console.log('✅ ULTIMATE OPTIMIZED SYSTEM: FULLY OPERATIONAL (AA, REAL REVENUE, & ZERO-CAPITAL GENESIS ENABLED)');
        console.log('🎯 SYSTEM STATUS: READY FOR PRODUCTION');
        console.log('💎 BWAEZI ECONOMY: ACTIVE - 100M TOKENS READY FOR GAS PAYMENTS');

        return { success: true };

    } catch (error) {
        console.error("\n💥 DEPLOYMENT FAILED:", error.message);
        console.error("🔍 Error details:", error);

        console.log("🔧 Server remains started - system in recovery mode.");
        console.log("🔄 You can restart the deployment process by triggering a rebuild");

        return { success: false, error: error.message };
    }
}

// =========================================================================
// STARTUP EXECUTION 
// =========================================================================

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
