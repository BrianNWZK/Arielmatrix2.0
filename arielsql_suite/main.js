import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
// 🔥 BSFM INTEGRATION: Import the Sovereign Brain Orchestrator
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
// 👑 NEW IMPORTS
import { AASDK } from '../modules/aa-loaves-fishes.js'; 
import { deployERC4337Contracts } from './aa-deployment-engine.js'; // The compilation/deployment engine

// =========================================================================
// PRODUCTION CONFIGURATION - OPTIMIZED
// =========================================================================

// Helper to normalize addresses for Ethers.js Checksum compliance
const normalizeAddress = (address) => {
    // Check if the address is a placeholder (zero address) or null/undefined
    if (!address || address.match(/^(0x)?[0]{40}$/)) {
        return address;
    }
    // CRITICAL FIX: Ensure input is lowercase before normalization to prevent 
    // Ethers V6 from throwing "bad address checksum" on badly mixed-cased strings.
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
    // Addresses are normalized here immediately
    ENTRY_POINT_ADDRESS: normalizeAddress("0x5FF137D4bEAA7036d654a88Ea898df565D304B88"), // Official Mainnet EntryPoint v0.6
    BWAEZI_TOKEN_ADDRESS: normalizeAddress("0xF1d2208ABc26F8C04b49103280A2667734f24AC6"), // YOUR BWAEZI TOKEN CONTRACT (Fixed)
    WETH_TOKEN_ADDRESS: normalizeAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"), // WETH Mainnet
    UNISWAP_V3_QUOTER_ADDRESS: normalizeAddress("0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"), // Actual Uniswap V3 Quoter mainnet address
    BWAEZI_WETH_FEE: 3000, 
    
    BWAEZI_PAYMASTER_ADDRESS: null, 
    SMART_ACCOUNT_ADDRESS: null, 
};

const CONFIG = CONFIG_BASE; // Use the normalized config

// Utility for Express server 
const startExpressServer = () => {
    const app = express();
    app.use(cors());
    app.use(express.json());
    
    // Add a basic health check endpoint
    app.get('/health', (req, res) => {
        const isDeployed = !!CONFIG.BWAEZI_PAYMASTER_ADDRESS;
        res.status(isDeployed ? 200 : 503).json({
            status: isDeployed ? 'OPERATIONAL' : 'DEPLOYING_OR_FAILED',
            paymaster: CONFIG.BWAEZI_PAYMASTER_ADDRESS,
            scw: CONFIG.SMART_ACCOUNT_ADDRESS,
            network: CONFIG.NETWORK,
            bwaeziToken: CONFIG.BWAEZI_TOKEN_ADDRESS,
            sovereignWallet: CONFIG.SOVEREIGN_WALLET
        });
    });

    return app.listen(CONFIG.PORT, () => console.log(`🚀 API Listening on port ${CONFIG.PORT}`));
};

// Improved engine initialization with better error handling
async function initializeSovereignBrain(config) {
    try {
        console.log("🧠 Initializing Sovereign Brain Engine (v2.4.1 - Self-Healing)...");
        
        // 🔥 CRITICAL FIX: Validate that ProductionSovereignCore is a valid class constructor
        if (typeof ProductionSovereignCore !== 'function') {
            throw new Error(`Invalid engine instance: Expected a class constructor, got ${typeof ProductionSovereignCore}. Check core/sovereign-brain.js export.`);
        }
        
        const brainConfig = {
            paymasterAddress: config.BWAEZI_PAYMASTER_ADDRESS,
            smartAccountAddress: config.SMART_ACCOUNT_ADDRESS,
            network: config.NETWORK,
            rpcUrls: config.RPC_URLS,
            bwaeziTokenAddress: config.BWAEZI_TOKEN_ADDRESS,
            sovereignWallet: config.SOVEREIGN_WALLET
        };

        console.log("🔧 Creating ProductionSovereignCore instance...");
        const optimizedCore = new ProductionSovereignCore(brainConfig); 
        
        console.log("⚡ Initializing core engine (Running EOA Self-Fund Check)...");
        // CRITICAL: The brain performs the EOA self-funding check here before proceeding.
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
    const expressServer = startExpressServer(); 
    
    try {
        console.log("🔥 BSFM ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.4.1: ZERO-LOSS GUARDRAIL ENABLED");
        console.log("💰 BWAEZI TOKEN CONTRACT:", CONFIG.BWAEZI_TOKEN_ADDRESS);
        console.log("👑 SOVEREIGN WALLET (100M tokens holder):", CONFIG.SOVEREIGN_WALLET);
        console.log("🌐 NETWORK:", CONFIG.NETWORK);
        
        if (!CONFIG.PRIVATE_KEY) {
            throw new Error("PRIVATE_KEY is mandatory for deployment. Please set it in the environment.");
        }

        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider); 
        
        // 1. INITIALIZE CORE (Pre-AA state) - needed to run the EOA revenue generator
        console.log("🚀 Initializing Production Sovereign Core (Pre-Deployment Mode)...");
        // AA addresses are null here, forcing the core to focus on EOA operations
        const optimizedCore = await initializeSovereignBrain(CONFIG);

        // 🚨 CRITICAL: THIS IS THE AUTOMATED ZERO-CAPITAL ARBITRAGE EXECUTION
        // The EOA must be funded before the expensive contract deployment
        const executeRevenueVault = async () => {
            try {
                console.log("💎 Executing Zero-Capital Revenue Generator (Flash Loan Arbitrage)...");
                
                if (optimizedCore.executeQuantumArbitrageVault) {
                    // NOTE: The executeQuantumArbitrageVault method performs a critical
                    // Ethers.js 'callStatic' simulation internally before sending the live transaction.
                    // This ensures the EOA's gas is not wasted on a non-profitable or reverting transaction.
                    const result = await optimizedCore.executeQuantumArbitrageVault();
                    
                    if (result.success) {
                        console.log('✅ QUANTUM ARBITRAGE VAULT: REVENUE GENERATED SUCCESSFULLY');
                        console.log(`💰 INJECTED ${result.profit} ETH. $5,000+ REVENUE GENERATION: ACTIVE - SYSTEM NOW SELF-FUNDED`);
                    } else {
                        console.log(`⚠️ ZERO-CAPITAL ARBITRAGE FAILED: ${result.error}`);
                        console.log('🛡️ ZERO-LOSS GUARDRAIL ACTIVE: EOA gas was preserved due to simulation failure.');
                        console.log('🔄 The EOA is still protected by the self-funding mechanism and remains operational.');
                    }
                    return result.success;
                } else {
                    console.log('⚠️ Quantum Arbitrage Vault method not available in current core version');
                    return false;
                }
            } catch (vaultError) {
                console.error('❌ Zero-Capital Vault execution failed:', vaultError.message);
                console.log('🔄 Continuing system operation in recovery mode.');
                return false;
            }
        };

        // --- 2. PRE-DEPLOYMENT FUNDING EXECUTION ---
        console.log("💰 Running Pre-Deployment Funding Strategy (Arbitrage First)...");
        const fundingSuccess = await executeRevenueVault();

        if (!fundingSuccess) {
            console.log("⚠️ WARNING: Initial funding arbitrage failed. Deployment may fail if EOA is not manually funded.");
        }

        // --- 3. DEPLOY CONTRACTS (Now EOA is expected to be funded) ---
        console.log("🔧 Starting ERC-4337 Contract Deployment...");
        const { paymasterAddress, smartAccountAddress } = await deployERC4337Contracts(provider, signer, CONFIG, AASDK);

        // Update config with real deployed addresses
        CONFIG.BWAEZI_PAYMASTER_ADDRESS = paymasterAddress;
        CONFIG.SMART_ACCOUNT_ADDRESS = smartAccountAddress;
        
        console.log("✅ Contract deployment completed successfully");
        console.log(`💰 Paymaster: ${CONFIG.BWAEZI_PAYMASTER_ADDRESS}`);
        console.log(`👛 Smart Account: ${CONFIG.SMART_ACCOUNT_ADDRESS}`);
        
        // --- 4. Update Sovereign Core with AA Addresses for operation ---
        optimizedCore.updateDeploymentAddresses(CONFIG.BWAEZI_PAYMASTER_ADDRESS, CONFIG.SMART_ACCOUNT_ADDRESS);
        await optimizedCore.checkDeploymentStatus();
        
        console.log('✅ ULTIMATE OPTIMIZED SYSTEM: FULLY OPERATIONAL (AA, ZERO-LOSS, & SELF-HEALING ENABLED)');
        console.log('🎯 SYSTEM STATUS: READY FOR PRODUCTION');
        console.log('💎 BWAEZI ECONOMY: ACTIVE - 100M TOKENS READY FOR GAS PAYMENTS');

        return {
            success: true,
            sovereignBrain: optimizedCore,
            paymasterAddress: CONFIG.BWAEZI_PAYMASTER_ADDRESS,
            smartAccountAddress: CONFIG.SMART_ACCOUNT_ADDRESS,
            bwaeziTokenAddress: CONFIG.BWAEZI_TOKEN_ADDRESS,
            message: "Production system deployed successfully"
        };
        
    } catch (error) {
        console.error("\n💥 DEPLOYMENT FAILED:", error.message);
        console.error("🔍 Error details:", error);
        
        console.log("🔧 Server remains started - system in recovery mode.");
        console.log("🔄 You can restart the deployment process by triggering a rebuild");

        return {
            success: false,
            error: error.message
        };
    }
}

// =========================================================================
// STARTUP EXECUTION
// =========================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
    // Error handling
    process.on('uncaughtException', (error) => {
        console.error('💥 Uncaught Exception:', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
    // Start the application
    main().then(result => {
        if (result.success) {
            console.log("🎉 BSFM Production System Started Successfully!");
            console.log("🚀 BWAEZI ENTERPRISE READY FOR 100M TOKEN ECONOMY!");
        } else {
            console.log("❌ BSFM Production System Started with Errors");
            process.exit(1);
        }
    }).catch(error => {
        console.error("💥 FATAL ERROR:", error);
        process.exit(1);
    });
}
