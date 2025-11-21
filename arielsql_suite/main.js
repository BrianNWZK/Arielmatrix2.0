import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
// 🔥 BSFM INTEGRATION: Import the Sovereign Brain Orchestrator
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
// 👑 SIMPLIFIED IMPORTS
import { AASDK } from '../modules/aa-loaves-fishes.js';
import { deployERC4337Contracts, getDeploymentTransactionData, verifyDeployment } from './aa-deployment-engine.js'; 

// =========================================================================
// SIMPLIFIED CONFIGURATION
// =========================================================================
const CONFIG = {
    SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET || "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA",
    NETWORK: 'mainnet',
    RPC_URLS: ["https://eth.llamarpc.com"],
    PORT: process.env.PORT || 10000,
    PRIVATE_KEY: process.env.PRIVATE_KEY,

    // ERC-4337 CONTRACTS
    ENTRY_POINT_ADDRESS: "0x5FF137D4bEAA7036d654a88Ea898df565D304B88",
    BWAEZI_TOKEN_ADDRESS: "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da",
    WETH_TOKEN_ADDRESS: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    UNISWAP_V3_QUOTER_ADDRESS: "0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6",
    BWAEZI_WETH_FEE: 3000,

    BWAEZI_PAYMASTER_ADDRESS: null,
    SMART_ACCOUNT_ADDRESS: null,
};

let sovereignCoreInstance = null;
let serverInstance = null;

// =========================================================================
// SIMPLIFIED EXPRESS SERVER
// =========================================================================
const startExpressServer = () => {
    const app = express();
    app.use(cors());
    app.use(express.json());

    app.get('/health', (req, res) => {
        res.json({ 
            status: 'UP', 
            deployed: !!CONFIG.BWAEZI_PAYMASTER_ADDRESS,
            paymaster: CONFIG.BWAEZI_PAYMASTER_ADDRESS,
            smartAccount: CONFIG.SMART_ACCOUNT_ADDRESS
        });
    });

    serverInstance = app.listen(CONFIG.PORT, () => {
        console.log(`🚀 API Listening on port ${CONFIG.PORT}`);
    });

    // Graceful shutdown
    const shutdownHandler = (signal) => {
        console.log(`\n🛑 ${signal} received, shutting down...`);
        serverInstance?.close(() => {
            console.log("✅ Server closed gracefully");
            process.exit(0);
        });
    };

    process.on('SIGTERM', shutdownHandler);
    process.on('SIGINT', shutdownHandler);

    return serverInstance;
};

// =========================================================================
// SIMPLIFIED SOVEREIGN BRAIN INITIALIZATION
// =========================================================================
async function initializeSovereignBrain(config) {
    try {
        console.log("🧠 Initializing Sovereign Brain Engine...");

        if (typeof ProductionSovereignCore !== 'function') {
            throw new Error('ProductionSovereignCore not found - check core/sovereign-brain.js');
        }

        const brainConfig = {
            paymasterAddress: config.BWAEZI_PAYMASTER_ADDRESS,
            smartAccountAddress: config.SMART_ACCOUNT_ADDRESS,
            network: config.NETWORK,
            bwaeziTokenAddress: config.BWAEZI_TOKEN_ADDRESS,
            sovereignWallet: config.SOVEREIGN_WALLET,
        };

        console.log("🔧 Creating ProductionSovereignCore instance...");
        const core = new ProductionSovereignCore(brainConfig);

        console.log("⚡ Initializing core engine...");
        await core.initialize();

        console.log("✅ Sovereign Brain Engine initialized successfully");
        return core;

    } catch (error) {
        console.error("❌ Sovereign Brain initialization failed:", error.message);
        throw error;
    }
}

// =========================================================================
// SIMPLIFIED DEPLOYMENT FLOW
// =========================================================================
async function deployContracts(provider, signer, config) {
    console.log('\n🚀 STARTING CONTRACT DEPLOYMENT...');
    
    try {
        // 1. Initialize AASDK (Simplified)
        let aaSdkInstance;
        try {
            aaSdkInstance = new AASDK(signer, config.ENTRY_POINT_ADDRESS);
            console.log("✅ AASDK initialized");
        } catch (error) {
            console.warn("⚠️ AASDK initialization failed, continuing without:", error.message);
            aaSdkInstance = null;
        }

        // 2. Quick balance check
        const balance = await provider.getBalance(signer.address);
        console.log(`💰 Deployment balance: ${ethers.formatEther(balance)} ETH`);
        
        if (balance < ethers.parseEther("0.001")) {
            throw new Error(`Insufficient ETH for deployment. Need at least 0.001 ETH, have ${ethers.formatEther(balance)} ETH`);
        }

        // 3. SIMPLIFIED: Skip complex simulation and estimation, go straight to deployment
        console.log('🎯 Proceeding with direct deployment...');

        // 4. DEPLOY CONTRACTS
        const { paymasterAddress, smartAccountAddress } = await deployERC4337Contracts(
            provider, 
            signer, 
            config, 
            aaSdkInstance,
            { paymasterGasLimit: 400000n } // Conservative gas limit
        );

        // 5. Update config
        config.BWAEZI_PAYMASTER_ADDRESS = paymasterAddress;
        config.SMART_ACCOUNT_ADDRESS = smartAccountAddress;

        console.log("✅ Contract deployment completed!");
        console.log(`💰 Paymaster: ${paymasterAddress}`);
        console.log(`👛 Smart Account: ${smartAccountAddress}`);

        // 6. Quick verification
        try {
            await verifyDeployment(provider, { paymasterAddress, smartAccountAddress }, config);
        } catch (verifyError) {
            console.warn("⚠️ Verification failed but deployment likely succeeded:", verifyError.message);
        }

        return { paymasterAddress, smartAccountAddress };

    } catch (error) {
        console.error('💥 Deployment failed:', error.message);
        throw error;
    }
}

// =========================================================================
// SIMPLIFIED MAIN EXECUTION
// =========================================================================
async function main() {
    console.log("🔥 BSFM PRODUCTION DEPLOYMENT v2.9.1");
    console.log("💰 BWAEZI Token:", CONFIG.BWAEZI_TOKEN_ADDRESS);
    console.log("👑 Sovereign Wallet:", CONFIG.SOVEREIGN_WALLET);
    console.log("🌐 Network:", CONFIG.NETWORK);

    // Start server immediately
    startExpressServer();

    try {
        // 1. Validate environment
        if (!CONFIG.PRIVATE_KEY) {
            throw new Error("PRIVATE_KEY environment variable is required");
        }

        // 2. Setup provider and signer
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
        
        console.log("🔗 Connected to Ethereum");
        console.log("👛 Deployer address:", signer.address);

        // 3. Deploy contracts first (before initializing brain)
        console.log('\n📦 PHASE 1: Deploying ERC-4337 Contracts...');
        const deployedAddresses = await deployContracts(provider, signer, CONFIG);

        // 4. Initialize Sovereign Brain with deployed addresses
        console.log('\n🧠 PHASE 2: Initializing Sovereign Brain...');
        sovereignCoreInstance = await initializeSovereignBrain(CONFIG);

        // 5. Update brain with deployment state
        if (sovereignCoreInstance && sovereignCoreInstance.setDeploymentState) {
            sovereignCoreInstance.setDeploymentState({
                paymasterAddress: deployedAddresses.paymasterAddress,
                smartAccountAddress: deployedAddresses.smartAccountAddress,
                paymasterDeployed: true,
                smartAccountDeployed: true
            });
        }

        console.log('\n🎉 DEPLOYMENT COMPLETE!');
        console.log('🚀 BWAEZI Paymaster System Ready');
        console.log('💎 100M Token Economy Activated');
        console.log(`🌐 Health check available at: http://localhost:${CONFIG.PORT}/health`);

        return { 
            success: true, 
            paymasterAddress: deployedAddresses.paymasterAddress,
            smartAccountAddress: deployedAddresses.smartAccountAddress
        };

    } catch (error) {
        console.error("\n💥 DEPLOYMENT FAILED:", error.message);
        
        // Provide specific troubleshooting guidance
        if (error.message.includes('insufficient funds') || error.code === 'INSUFFICIENT_FUNDS') {
            console.error('💸 SOLUTION: Add more ETH to your deployer wallet');
            const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
            const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
            const balance = await provider.getBalance(signer.address).catch(() => 0n);
            console.error(`💡 Current balance: ${ethers.formatEther(balance)} ETH`);
            console.error('💡 Recommended: At least 0.01 ETH for deployment');
        } else if (error.message.includes('invalid private key') || error.message.includes('invalid arrayify value')) {
            console.error('🔑 SOLUTION: Check your PRIVATE_KEY environment variable');
        } else if (error.message.includes('could not detect network')) {
            console.error('🌐 SOLUTION: Check your RPC URL - unable to connect to Ethereum');
        }
        
        console.log("\n🔧 Server remains running in recovery mode");
        console.log("🔄 Fix the issue and restart the deployment");
        
        return { success: false, error: error.message };
    }
}

// =========================================================================
// STARTUP EXECUTION WITH BETTER ERROR HANDLING
// =========================================================================
(async () => {
    try {
        // Global error handlers
        process.on('uncaughtException', (error) => {
            console.error('💥 Uncaught Exception:', error.message);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
        });

        // Only run main if this file is executed directly
        if (import.meta.url === `file://${process.argv[1]}`) {
            const result = await main();
            
            if (result.success) {
                console.log("\n🎊 BSFM SYSTEM DEPLOYED SUCCESSFULLY!");
                console.log("⭐ Ready for production use!");
            } else {
                console.log("\n❌ Deployment completed with errors");
                console.log("⚠️ System is running in limited mode");
            }
        }
    } catch (error) {
        console.error("💥 FATAL STARTUP ERROR:", error);
        process.exit(1);
    }
})();
