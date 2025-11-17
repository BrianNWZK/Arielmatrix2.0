import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
// 🔥 BSFM INTEGRATION: Import the Sovereign Brain Orchestrator
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
// 👑 NEW IMPORTS
import { AASDK } from '../modules/aa-loaves-fishes.js';
// 🔧 FIX: Import the real deployment engine
import { deployERC4337Contracts } from './aa-deployment-engine.js'; 

// =========================================================================
// CRITICAL FIX: ADDRESS NORMALIZATION HELPER (Defined for main.js and constants)
// =========================================================================

// Helper function to safely normalize addresses
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

// =========================================================================
// PRODUCTION CONFIGURATION - OPTIMIZED
// =========================================================================

// Helper to normalize addresses for Ethers.js Checksum compliance
const normalizeAddress = safeNormalizeAddress; // FIX: Now safeNormalizeAddress is defined

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
    BWAEZI_TOKEN_ADDRESS: normalizeAddress("0xF1d2208ABc26F8C04b49103280A2667734f24AC6"), // YOUR BWAEZI TOKEN CONTRACT (Fixed)
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
        console.log("🧠 Initializing Sovereign Brain Engine (v2.5.0 - Deployment Stabilization)...");

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

        console.log("⚡ Initializing core engine (Running EOA Self-Fund Check in Genesis Mode)...");
        await optimizedCore.initialize();

        console.log("✅ Sovereign Brain Engine initialized successfully");
        return optimizedCore;

    } catch (error) {
        console.error("❌ Sovereign Brain initialization failed:", error.message);
        throw new Error(`Engine initialization failed: ${error.message}`);
    }
}

// =========================================================================
// MAIN EXECUTION LOGIC
// =========================================================================

async function main() {
    startExpressServer();

    try {
        console.log("🔥 BSFM ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.5.0: DEPLOYMENT STABILIZATION COMPLETE");
        console.log("💰 BWAEZI TOKEN CONTRACT:", CONFIG.BWAEZI_TOKEN_ADDRESS);
        console.log("👑 SOVEREIGN WALLET (100M tokens holder):", CONFIG.SOVEREIGN_WALLET);
        console.log("🌐 NETWORK:", CONFIG.NETWORK);

        if (!CONFIG.PRIVATE_KEY) {
            throw new Error("PRIVATE_KEY is mandatory for deployment. Please set it in the environment.");
        }

        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);

        // 1. INITIALIZE CORE (Pre-AA state) - Triggers real EOA funding via arbitrage if needed
        console.log("🚀 Initializing Production Sovereign Core (Pre-Deployment Mode)...");
        sovereignCoreInstance = await initializeSovereignBrain(CONFIG);

        // --- 2. DEPLOY CONTRACTS (Now EOA is expected to be funded by step 1) ---
        console.log("🔧 Starting ERC-4337 Contract Deployment...");

        // NOTE: deployERC4337Contracts is imported from './aa-deployment-engine.js'
        const { paymasterAddress, smartAccountAddress } = await deployERC4337Contracts(provider, signer, CONFIG, AASDK);

        // Update config with real deployed addresses
        CONFIG.BWAEZI_PAYMASTER_ADDRESS = paymasterAddress;
        CONFIG.SMART_ACCOUNT_ADDRESS = smartAccountAddress;

        console.log("✅ Contract deployment completed successfully");
        console.log(`💰 Paymaster: ${CONFIG.BWAEZI_PAYMASTER_ADDRESS}`);
        console.log(`👛 Smart Account: ${CONFIG.SMART_ACCOUNT_ADDRESS}`);

        // --- 3. Update Sovereign Core with AA Addresses for operation ---
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
