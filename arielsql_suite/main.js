// arielsql_suite/main.js - FULL DEPLOYMENT WITH AUTO TOKEN TRANSFER and AA Engine Startup
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
import { 
    ProductionSovereignCore, 
    EnterpriseConfigurationError // Imported for error handling
} from '../core/sovereign-brain.js';

// 👑 FIX 1: Import logger utilities
import { initializeGlobalLogger, enableDatabaseLoggingSafely } from '../modules/enterprise-logger/index.js';

// === 🎯 REQUIRED CORE SERVICE IMPORTS FOR DI ===
// These must be explicitly imported and instantiated here, not inside sovereign-brain.js
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js'; 
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js'; 
import { BrianNwaezikeChain } from '../backend/blockchain/BrianNwaezikeChain.js'; 
import { SovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js'; 
import { AutonomousAIEngine } from '../backend/agents/autonomous-ai-engine.js'; 
import { BWAEZIToken } from '../modules/bwaezi-token.js'; 
// 👑 NEW SECURITY IMPORT
import { AIThreatDetector } from '../modules/ai-threat-detector/index.js'; 

// 👑 NEW IMPORT: The AA SDK integration layer
import { AASDK, getSCWAddress } from '../modules/aa-loaves-fishes.js';
// import { deployERC4337Contracts } from './aa-deployment-engine.js'; // ❌ REMOVED: Contract deployment concluded

// =========================================================================
// PRODUCTION CONFIGURATION - OPTIMIZED
// Addresses are confirmed from the deployment logs.
// =========================================================================
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

    // === 👑 ERC-4337 LOAVES AND FISHES CONSTANTS (MAINNET) 👑 ===
    ENTRY_POINT_ADDRESS: "0x5FF137D4bEAA7036d654a898df565D304B88", // Official Mainnet EntryPoint v0.6
    
    // 🔥 CRITICAL CONTRACT ADDRESSES (CONFIRMED DEPLOYED)
    TOKEN_CONTRACT_ADDRESS: process.env.BWAEZI_TOKEN_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da', // BWAEZI Token Contract
    WETH_TOKEN_ADDRESS: process.env.WETH_TOKEN_ADDRESS || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    UNISWAP_V3_QUOTER_ADDRESS: process.env.UNISWAP_V3_QUOTER_ADDRESS || "0xb27308f9F90D607463bb33aEB824A6c6D6D0Bd6d",
    BWAEZI_WETH_FEE: 3000,
    // PRODUCTION ADDRESSES FROM LOGS:
    PAYMASTER_ADDRESS: "0xC336127cb4732d8A91807f54F9531C682F80E864", 
    SMART_ACCOUNT_ADDRESS: "0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C",
    BWAEZI_PAYMASTER_ADDRESS: "0xC336127cb4732d8A91807f54F9531C682F80E864",
};

// BWAEZI Token ABI for transfer
const BWAEZI_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

// =========================================================================
// 🎯 DEPENDENCY INJECTION ORCHESTRATION LAYER
// =========================================================================

/**
 * Initializes all core services in a strict, dependency-safe order.
 */
const initializeAllDependencies = async (config) => {
    const provider = new ethers.JsonRpcProvider(config.RPC_URLS[0]);

    // 1. DB and Payout System (Base Dependencies)
    console.log('👷 Initializing ArielSQLiteEngine...');
    const arielSQLiteEngine = new ArielSQLiteEngine(config); 
    await arielSQLiteEngine.initialize?.(); 

    // 1.5. Initialize AI Threat Detector (Relies on internal DB/Shield for security context, must be early)
    console.log('🛡️ Initializing AIThreatDetector...');
    const aiThreatDetector = new AIThreatDetector();
    await aiThreatDetector.initialize();

    console.log('👷 Initializing BrianNwaezikePayoutSystem...');
    const brianNwaezikePayoutSystem = new BrianNwaezikePayoutSystem(config, provider); 
    await brianNwaezikePayoutSystem.initialize?.();

    // 2. Chain and AA SDK (Higher Level Dependencies)
    console.log('👷 Initializing BrianNwaezikeChain...');
    const bwaeziChain = new BrianNwaezikeChain(config, brianNwaezikePayoutSystem); 
    await bwaeziChain.initialize?.();
    
    console.log('👷 Initializing AASDK...');
    const aaSDK = new AASDK(provider, config); 
    await aaSDK.initialize?.();
    
    const bwaeziToken = new BWAEZIToken(provider, config.TOKEN_CONTRACT_ADDRESS); 

    // 3. Revenue Engine (Requires Chain/DB/Payout)
    console.log('👷 Initializing SovereignRevenueEngine...');
    const sovereignRevenueEngine = new SovereignRevenueEngine(config, arielSQLiteEngine, bwaeziChain, brianNwaezikePayoutSystem); 
    await sovereignRevenueEngine.initialize?.();
    
    // 4. Autonomous AI Engine (Requires Revenue Engine + Threat Detection)
    console.log('👷 Initializing AutonomousAIEngine...');
    // NOTE: The AutonomousAIEngine constructor will need to be updated to accept aiThreatDetector if it uses it directly.
    // FIX: Pass aiThreatDetector directly to AutonomousAIEngine to satisfy dependency
    const autonomousAIEngine = new AutonomousAIEngine(sovereignRevenueEngine, aiThreatDetector); 
    await autonomousAIEngine.initialize?.();
    
    console.log('✅ All Core Services Initialized.');

    return {
        arielDB: arielSQLiteEngine,
        payoutSystem: brianNwaezikePayoutSystem,
        bwaeziChain: bwaeziChain,
        revenueEngine: sovereignRevenueEngine,
        aiEngine: autonomousAIEngine,
        aiThreatDetector: aiThreatDetector, // 👑 INJECTED FIX
        aaSDK: aaSDK,
        bwaeziToken: bwaeziToken,
        provider: provider,
    };
};

// =========================================================================
// ORIGINAL LOGIC - TOKEN TRANSFER (MODIFIED FOR PRODUCTION CHECK)
// =========================================================================

const transferBWAEZIToSCW = async () => {
    if (!CONFIG.PRIVATE_KEY) {
        return { success: false, error: "PRIVATE_KEY environment variable is not set." };
    }
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
    const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    const bwaeziContract = new ethers.Contract(CONFIG.TOKEN_CONTRACT_ADDRESS, BWAEZI_ABI, signer);
    
    const [eoaBalance, scwBalance, decimals] = await Promise.all([
        bwaeziContract.balanceOf(signer.address),
        bwaeziContract.balanceOf(CONFIG.SMART_ACCOUNT_ADDRESS),
        bwaeziContract.decimals()
    ]);
    const symbol = await bwaeziContract.symbol();
    console.log(`\n📊 BALANCES BEFORE TRANSFER:`);
    console.log(` EOA Balance: ${ethers.formatUnits(eoaBalance, decimals)} ${symbol}`);
    console.log(` SCW Balance: ${ethers.formatUnits(scwBalance, decimals)} ${symbol}`);
    
    // Check against the deployment log: SCW Balance: 100000000.0 bwzC
    const targetAmount = ethers.parseUnits("100000000", decimals);
    if (scwBalance === targetAmount) {
        console.log(`✅ SCW already funded with ${ethers.formatUnits(scwBalance, decimals)} ${symbol} balance. Skipping EOA transfer.`);
        return { success: true, message: "SCW already funded." };
    }
    
    // Fallback logic for transfer if SCW is unexpectedly empty
    if (eoaBalance === 0n) {
        throw new Error(`❌ EOA has 0 ${symbol} balance. Cannot initiate funding transfer.`);
    }
    
    const amountToTransfer = eoaBalance;
    console.log(`\n🔥 Initiating transfer of ${ethers.formatUnits(amountToTransfer, decimals)} ${symbol} to SCW...`);
    const tx = await bwaeziContract.transfer(CONFIG.SMART_ACCOUNT_ADDRESS, amountToTransfer);
    console.log(`⏳ Transfer Transaction Hash: ${tx.hash}`);
    await tx.wait();
    
    const newSCWBalance = await bwaeziContract.balanceOf(CONFIG.SMART_ACCOUNT_ADDRESS);
    
    console.log(`\n✅ TRANSFER SUCCESSFUL!`);
    console.log(` New SCW Balance: ${ethers.formatUnits(newSCWBalance, decimals)} ${symbol}`);
    
    return { 
        success: true, 
        message: `Successfully transferred ${ethers.formatUnits(amountToTransfer, decimals)} ${symbol} to SCW.`,
        transactionHash: tx.hash,
        SCWAddress: CONFIG.SMART_ACCOUNT_ADDRESS
    };
};

// Utility for Express server
const startExpressServer = (optimizedCore) => {
    const app = express();
    app.use(cors());
    app.use(express.json());
    app.get('/health', (req, res) => {
        res.json({ 
            status: 'operational', 
            version: '2.1.0-SOVEREIGN-AA', // Updated version number
            contracts: {
                token: CONFIG.TOKEN_CONTRACT_ADDRESS,
                paymaster: CONFIG.PAYMASTER_ADDRESS,
                smartAccount: CONFIG.SMART_ACCOUNT_ADDRESS
            },
            tradingStatus: optimizedCore.getTradingStats()
        });
    });
    // Endpoint to manually initiate the one-time token transfer
    app.post('/api/transfer-tokens', async (req, res) => {
        try {
            const result = await transferBWAEZIToSCW();
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    // Endpoint to trigger the first BWAEZI-funded swap to generate revenue
    app.post('/api/start-revenue-generation', async (req, res) => {
        try {
            // Hardcode initial test trade: Swap 50,000 BWAEZI for WETH
            const amountIn = ethers.parseUnits("50000", 18); 
            const tokenOutAddress = CONFIG.WETH_TOKEN_ADDRESS;
            // This calls the AA-enabled swap function in the Sovereign Core
            const result = await optimizedCore.executeBWAEZISwapWithAA(CONFIG.TOKEN_CONTRACT_ADDRESS, amountIn, tokenOutAddress);
            
            if(result.success) {
                res.json({ success: true, message: "BWAEZI-funded swap successfully submitted to Bundler.", result });
            } else {
                 res.status(500).json({ success: false, message: "Revenue generation failed.", error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    return app.listen(CONFIG.PORT, () => {
        console.log(`🚀 Server running on port ${CONFIG.PORT}`);
    });
};

// =========================================================================
// STARTUP EXECUTION
// =========================================================================
(async () => {
    let logger;
    try {
        // FIX 2: Initialize the global logger immediately as the first step
        logger = initializeGlobalLogger('SovereignCore', { logLevel: process.env.LOG_LEVEL || 'info' });
        logger.info("🔥 BSFM ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.1.0: AA UPGRADE INITIATED");
        
        // 1. Initialize all necessary dependencies/services (including AutonomousAIEngine)
        const injectedServices = await initializeAllDependencies(CONFIG); 

        // FIX 3: Enable database logging after ArielSQLiteEngine is initialized/fetched
        // This links the Ariel DB instance to the Enterprise Logger for persistent logging.
        await enableDatabaseLoggingSafely(injectedServices.arielDB);

        // 👑 AUTO TOKEN TRANSFER: Ensures the Smart Contract Wallet (SCW) is funded.
        logger.info("⚙️ Starting Auto Token Transfer Check...");
        const transferResult = await transferBWAEZIToSCW();
        logger.info(`[DEPLOYMENT LOG] Token Transfer Status: ${transferResult.message}`);

        // 2. Initialize Production Sovereign Core (sovereign-brain.js) with Config AND the Injected Services
        const coreConfig = { 
            rpcUrl: CONFIG.RPC_URLS[0],
            privateKey: CONFIG.PRIVATE_KEY,
            paymasterAddress: CONFIG.BWAEZI_PAYMASTER_ADDRESS, 
            smartAccountAddress: CONFIG.SMART_ACCOUNT_ADDRESS,
            tokenAddress: CONFIG.TOKEN_CONTRACT_ADDRESS,
            ...CONFIG
        };

        // Initialize the core, which integrates the AutonomousAIEngine (aiEngine)
        const optimizedCore = new ProductionSovereignCore(coreConfig, injectedServices); 
        await optimizedCore.initialize();
        optimizedCore.startAutoTrading(); // Starts the continuous trading loop
        startExpressServer(optimizedCore);

    } catch (error) {
        // Use logger if available, otherwise fallback to console.error
        if (logger) {
            logger.error("❌ CRITICAL BOOT FAILURE:", { message: error.message, stack: error.stack });
        } else {
            console.error("❌ CRITICAL BOOT FAILURE:", error.message);
        }
        process.exit(1);
    }
})();

// EXPORTS (Maintain original exports)
export { initializeAllDependencies, startExpressServer, CONFIG };
