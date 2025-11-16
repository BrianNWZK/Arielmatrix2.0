import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
// 🔥 FIXED IMPORT: Import the class directly
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
// 👑 AA IMPORTS
import { AASDK } from '../modules/aa-loaves-fishes.js'; 
import { deployERC4337Contracts } from './aa-deployment-engine.js';

// =========================================================================
// PRODUCTION CONFIGURATION
// =========================================================================

const normalizeAddress = (address) => {
    if (!address || address.match(/^(0x)?[0]{40}$/)) {
        return address;
    }
    const lowercasedAddress = address.toLowerCase();
    return ethers.getAddress(lowercasedAddress);
};

const CONFIG = {
    SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET || "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA",
    NETWORK: 'mainnet',
    RPC_URLS: [
        "https://eth.llamarpc.com", 
        "https://rpc.ankr.com/eth", 
        "https://cloudflare-eth.com" 
    ],
    PORT: process.env.PORT || 10000,
    PRIVATE_KEY: process.env.PRIVATE_KEY,

    // ERC-4337 Addresses
    ENTRY_POINT_ADDRESS: normalizeAddress("0x5FF137D4bEAA7036d654a88Ea898df565D304B88"),
    BWAEZI_TOKEN_ADDRESS: normalizeAddress("0xF1d2208ABc26F8C04b49103280A2667734f24AC6"),
    WETH_TOKEN_ADDRESS: normalizeAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
    UNISWAP_V3_QUOTER_ADDRESS: normalizeAddress("0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6"),
    BWAEZI_WETH_FEE: 3000, 
    
    BWAEZI_PAYMASTER_ADDRESS: null, 
    SMART_ACCOUNT_ADDRESS: null, 
};

// Express Server
const startExpressServer = () => {
    const app = express();
    app.use(cors());
    app.use(express.json());
    
    app.get('/health', (req, res) => {
        const isDeployed = !!CONFIG.BWAEZI_PAYMASTER_ADDRESS;
        res.status(isDeployed ? 200 : 503).json({
            status: isDeployed ? 'OPERATIONAL' : 'DEPLOYING_OR_FAILED',
            paymaster: CONFIG.BWAEZI_PAYMASTER_ADDRESS,
            scw: CONFIG.SMART_ACCOUNT_ADDRESS,
            network: CONFIG.NETWORK
        });
    });

    return app.listen(CONFIG.PORT, () => console.log(`🚀 API Listening on port ${CONFIG.PORT}`));
};

// Improved engine initialization
async function initializeSovereignBrain(config) {
    try {
        console.log("🧠 Initializing Sovereign Brain Engine (v2.4.0)...");
        
        // 🔥 CRITICAL FIX: Create instance with proper config
        const brainConfig = {
            ...config,
            PRIVATE_KEY: config.PRIVATE_KEY,
            rpcUrls: config.RPC_URLS
        };
        
        console.log("🔧 Creating ProductionSovereignCore instance...");
        const optimizedCore = new ProductionSovereignCore(brainConfig);
        
        console.log("⚡ Initializing core engine...");
        await optimizedCore.initialize();
        
        console.log("✅ Sovereign Brain Engine initialized successfully");
        return optimizedCore;
        
    } catch (error) {
        console.error("❌ Sovereign Brain initialization failed:", error.message);
        throw new Error(`Engine initialization failed: ${error.message}`);
    }
}

// =========================================================================
// MAIN EXECUTION LOGIC - FIXED FLOW
// =========================================================================

async function main() {
    const expressServer = startExpressServer(); 
    
    try {
        console.log("🔥 BSFM ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.4.0: AA UPGRADE INITIATED");
        console.log("💰 BWAEZI TOKEN CONTRACT:", CONFIG.BWAEZI_TOKEN_ADDRESS);
        console.log("👑 SOVEREIGN WALLET (100M tokens holder):", CONFIG.SOVEREIGN_WALLET);
        console.log("🌐 NETWORK:", CONFIG.NETWORK);
        
        if (!CONFIG.PRIVATE_KEY) {
            throw new Error("PRIVATE_KEY is mandatory for deployment.");
        }

        // 🔥 CRITICAL CHANGE: INITIALIZE ENGINE FIRST
        console.log("🚀 Phase 1: Initializing Sovereign Brain Engine...");
        const optimizedCore = await initializeSovereignBrain(CONFIG);

        // 🔥 CRITICAL: EXECUTE FLASH LOAN ARBITRAGE BEFORE DEPLOYMENT
        console.log("💎 Phase 2: Executing Zero-Capital Flash Loan Arbitrage...");
        const arbitrageResult = await optimizedCore.executeQuantumArbitrageVault();
        
        if (arbitrageResult.success) {
            console.log(`🎉 ARBITRAGE SUCCESS: $${arbitrageResult.profit} revenue generated!`);
            console.log("💰 SUFFICIENT GAS NOW AVAILABLE FOR CONTRACT DEPLOYMENT");
        } else {
            console.log("⚠️ Arbitrage failed, but continuing with available funds...");
        }

        // 🔥 NOW PROCEED WITH CONTRACT DEPLOYMENT
        console.log("🔧 Phase 3: Starting ERC-4337 Contract Deployment...");
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider); 
        
        const { paymasterAddress, smartAccountAddress } = await deployERC4337Contracts(
            provider, 
            signer, 
            CONFIG, 
            AASDK
        );

        // Update config
        CONFIG.BWAEZI_PAYMASTER_ADDRESS = paymasterAddress;
        CONFIG.SMART_ACCOUNT_ADDRESS = smartAccountAddress;
        
        console.log("✅ Contract deployment completed successfully");
        console.log(`💰 Paymaster: ${CONFIG.BWAEZI_PAYMASTER_ADDRESS}`);
        console.log(`👛 Smart Account: ${CONFIG.SMART_ACCOUNT_ADDRESS}`);

        console.log('✅ ULTIMATE OPTIMIZED SYSTEM: FULLY OPERATIONAL');
        console.log('💎 BWAEZI ECONOMY: ACTIVE - 100M TOKENS READY FOR GAS PAYMENTS');

        return {
            success: true,
            sovereignBrain: optimizedCore,
            paymasterAddress: CONFIG.BWAEZI_PAYMASTER_ADDRESS,
            smartAccountAddress: CONFIG.SMART_ACCOUNT_ADDRESS,
            arbitrageResult: arbitrageResult,
            message: "Production system deployed successfully"
        };
        
    } catch (error) {
        console.error("\n💥 DEPLOYMENT FAILED:", error.message);
        console.log("🔧 Server remains started - system in recovery mode.");

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
    process.on('uncaughtException', (error) => {
        console.error('💥 Uncaught Exception:', error);
    });
    
    process.on('unhandledRejection', (reason, promise) => {
        console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
    });
    
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
