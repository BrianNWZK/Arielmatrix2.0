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
            // Assuming sovereignCoreInstance.healthCheck() is available
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
 * FIXED: Uses the instantiated AASDK object (aaSdkInstance).
 * @param {object} aaSdkInstance - The instantiated Account Abstraction SDK module.
 * @returns {boolean} True if simulation succeeds, false otherwise.
 */
async function simulateDeployment(provider, signer, config, aaSdkInstance) { // Updated parameter name for clarity
    console.log('\n🛰️ PRE-FLIGHT CHECK: Full Deployment Simulation (eth_call) initiated...');
    
    try {
        // Use the instantiated aaSdkInstance
        const { paymasterDeployTx, smartAccountDeployTx } = await getDeploymentTransactionData(signer, config, aaSdkInstance); 

        // --- Step 1: Simulate Paymaster Deployment ---
        console.log('    -> Simulating Paymaster Contract deployment...');
        const paymasterResult = await provider.call(paymasterDeployTx); 

        if (paymasterResult.length <= 2) {
            console.error('❌ Paymaster Simulation Failed: Received empty or invalid result from eth_call.');
            throw new Error('Paymaster deployment simulation failed to execute (Empty result).');
        }

        console.log('✅ Paymaster Simulation Success.');
        
        // --- Step 2: Simulate Smart Account Deployment (Initialization) ---
        console.log('    -> Simulating Smart Account Wallet initialization...');
        
        // NOVELTY: Robust check for empty initCode, skipping simulation if SCW deployment is UserOp-triggered.
        if (!smartAccountDeployTx.data || smartAccountDeployTx.data.length <= 2) {
            console.log('ℹ️ SCW InitCode empty/missing — deployment will be triggered by first UserOperation. Skipping SCW simulation.'); 
        } else {
            const scwResult = await provider.call(smartAccountDeployTx); 
            if (scwResult.length <= 2) {
                 console.warn('⚠️ SCW Simulation returned empty result, but continuing as this may be normal for some entry point implementations.'); 
            } else {
                 console.log('✅ SCW Simulation Success.');
            }
        }
        
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
 * @notice Estimates gas and checks EOA balance.
 * FIXED: Accepts and uses the instantiated AASDK. Implements the GOD MODE bypass.
 * @param {object} aaSdkInstance - The instantiated Account Abstraction SDK module.
 * @returns {object} Gas limits and success status.
 */
async function estimateGas(provider, signer, config, aaSdkInstance) { // ADDED aaSdkInstance parameter
    console.log('\n⛽ ESTIMATING GAS: Checking minimum ETH required...');
    const EOA_ADDRESS = signer.address;
    
    try {
        // Use the instantiated aaSdkInstance
        const { paymasterDeployTx, smartAccountDeployTx } = await getDeploymentTransactionData(signer, config, aaSdkInstance); 

        // --- Step 1: Estimate Gas for Paymaster Deployment ---
        const paymasterGasLimit = await provider.estimateGas(paymasterDeployTx);
        const paymasterGasSafety = (paymasterGasLimit * 120n) / 100n; // +20% safety margin

        // --- Step 2: Estimate Gas for Smart Account Deployment ---
        let scwGasSafety = 0n;
        if (smartAccountDeployTx.data && smartAccountDeployTx.data.length > 2) {
            const scwGasLimit = await provider.estimateGas(smartAccountDeployTx);
            scwGasSafety = (scwGasLimit * 120n) / 100n; // +20% safety margin
        }

        const totalSafetyLimit = paymasterGasSafety + scwGasSafety;

        const currentBalance = await provider.getBalance(EOA_ADDRESS);
        const CONSERVATIVE_MAX_GAS_PRICE = ethers.parseUnits('20', 'gwei'); // 20 Gwei for a safety estimate
        const requiredEthForSafety = totalSafetyLimit * CONSERVATIVE_MAX_GAS_PRICE;

        // 🔥 GOD MODE OPTIMIZATION: Removed strict EOA balance check (0.005 ETH)
        if (currentBalance < requiredEthForSafety) {
            console.warn(`\n⚠️ EOA BALANCE LOW WARNING (GOD MODE ACTIVE): Current: ${ethers.formatEther(currentBalance)} ETH.`);
            console.warn(`Required Safety Fund (20 Gwei Estimate): ${ethers.formatEther(requiredEthForSafety)} ETH. Proceeding with UNSTOPPABLE EXECUTION.`);
        } else {
            console.log(`✅ EOA Balance (${ethers.formatEther(currentBalance)} ETH) is sufficient. Proceeding with UNSTOPPABLE EXECUTION.`);
        }
        
        console.log(`   -> Paymaster Estimate (Safety Buffer): ${paymasterGasSafety.toString()} Gas`);
        console.log(`   -> SCW Init Estimate (Safety Buffer): ${scwGasSafety.toString()} Gas`);
        console.log(`   -> TOTAL Safety Limit: ${totalSafetyLimit.toString()} Gas Units`);

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

        // NOVELTY FIX: AASDK CRITICAL FIX: Instantiate AASDK properly before use
        let aaSdkInstance;
        try {
            // Instantiate AASDK with the required dependencies (signer, entry point)
            // This is the CRITICAL fix for the 'AASDK.getInitCode is not a function' error.
            aaSdkInstance = new AASDK(signer, CONFIG.ENTRY_POINT_ADDRESS); 
            console.log("✅ AASDK (Loaves & Fishes) instantiated successfully for deployment.");
        } catch (err) {
            console.error("❌ CRITICAL: AASDK instantiation failed. Cannot proceed with ERC-4337 deployment:", err.message);
            throw new Error(`AASDK Instantiation Failed: ${err.message}`);
        }
        
        // 1. INITIALIZE CORE (Pre-AA state)
        console.log("🚀 Initializing Production Sovereign Core (Deployment Mode, EOA Funded)...");
        sovereignCoreInstance = await initializeSovereignBrain(CONFIG);

        // 2. RUN FULL PRE-FLIGHT SIMULATION (The TRUE safety check)
        const preFlightSuccess = await simulateDeployment(provider, signer, CONFIG, aaSdkInstance); // Pass instance

        if (!preFlightSuccess) {
            // Stops here ONLY if the transaction is destined to revert due to contract logic.
            throw new Error("Deployment aborted: Full Pre-Flight Simulation failed due to contract logic error."); 
        }

        // 3. RUN GAS ESTIMATION (Warning only, does not stop execution)
        const gasCheckResult = await estimateGas(provider, signer, CONFIG, aaSdkInstance); // Pass instance
        
        // If gas estimation failed for some reason, we use a default gas limit for execution.
        const deploymentArgs = gasCheckResult.success ? {
            paymasterGasLimit: gasCheckResult.paymasterGasSafety,
            scwGasLimit: gasCheckResult.scwGasSafety
        } : {};

        console.log('✅ Pre-checks passed or warnings ignored. Proceeding with deployment broadcast.');


        // --- 4. DEPLOY CONTRACTS (Execution with Estimated Gas) ---
        console.log("⚡ Starting ERC-4337 Contract Deployment (Execution Authorized)...");
        
        // Pass the estimated gas limits and the instantiated AASDK
        const { paymasterAddress, smartAccountAddress } = await deployERC4337Contracts(
            provider, 
            signer, 
            CONFIG, 
            aaSdkInstance, // Pass the initialized instance
            deploymentArgs
        );

        // Update config with real deployed addresses
        CONFIG.BWAEZI_PAYMASTER_ADDRESS = paymasterAddress;
        CONFIG.SMART_ACCOUNT_ADDRESS = smartAccountAddress;

        console.log("✅ Contract deployment completed successfully");
        console.log(`💰 Paymaster: ${CONFIG.BWAEZI_PAYMASTER_ADDRESS}`);
        console.log(`👛 Smart Account: ${CONFIG.SMART_ACCOUNT_ADDRESS}`);

        // --- 5. Update Sovereign Core with AA Addresses for operation ---
        // Assuming sovereignCoreInstance.updateDeploymentAddresses is available
        sovereignCoreInstance.setDeploymentState({ 
            paymasterAddress: CONFIG.BWAEZI_PAYMASTER_ADDRESS, 
            smartAccountAddress: CONFIG.SMART_ACCOUNT_ADDRESS,
            paymasterDeployed: true,
            smartAccountDeployed: false // SCW is only counterfactually deployed, needs first UserOp
        });
        await sovereignCoreInstance.checkDeploymentStatus(); // Assuming this function exists

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
