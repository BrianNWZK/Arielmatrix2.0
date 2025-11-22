// arielsql_suite/main.js - FULL DEPLOYMENT WITH AUTO TOKEN TRANSFER
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { AASDK } from '../modules/aa-loaves-fishes.js'; 
// NOTE: deployERC4337Contracts is removed as deployment is complete.
// import { deployERC4337Contracts } from './aa-deployment-engine.js'; 

// =========================================================================
// PRODUCTION CONFIGURATION - OPTIMIZED
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
    ENTRY_POINT_ADDRESS: "0x5FF137D4bEAA7036d654a898df565D304B88",
    
    // 🔥 CRITICAL CONTRACT ADDRESSES
    TOKEN_CONTRACT_ADDRESS: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da', // BWAEZI Token Contract
    WETH_TOKEN_ADDRESS: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    UNISWAP_V3_QUOTER_ADDRESS: "0xb27308f9F90D607463bb33aEB824A6c6D6D0Bd6d", // Corrected Quoter address
    BWAEZI_WETH_FEE: 3000,
    
    // ✅ CONTRACTS ARE ALREADY DEPLOYED - HARDCODED ADDRESSES
    PAYMASTER_ADDRESS: "0xC336127cb4732d8A91807f54F9531C682F80E864",
    SMART_ACCOUNT_ADDRESS: "0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C",

    // 💰 TRADING CONFIGURATION - ACTIVATING REVENUE GENERATION
    TRADING_CONFIG: {
        // High-frequency/High-impact strategies are prioritized for launch
        ARBITRAGE_ACTIVE: true, // High Profit, Low Risk
        MOMENTUM_ACTIVE: true,  // Medium Profit, Medium Risk
        REBALANCING_ACTIVE: true, // Low Risk, Set to true to start on 6-hour cron
        OPTIMIZED_SWAPS_ACTIVE: true, // Medium Profit, Low Risk
        MIN_PROFIT_THRESHOLD_USD: 50, // Minimum $50 profit per trade to execute
        TRADING_STRATEGIES: [
            { name: 'Arbitrage', profit: 'High', risk: 'Low', frequency: 'Opportunistic' },
            { name: 'Momentum', profit: 'Medium', risk: 'Medium', frequency: 'Continuous' },
            { name: 'Rebalancing', profit: 'Low', risk: 'Low', frequency: 'Every 6 hours' },
            { name: 'Optimized Swaps', profit: 'Medium', risk: 'Low', frequency: 'Continuous' },
        ]
    },
};

// BWAEZI Token ABI for transfer
const BWAEZI_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

// Utility for Express server
const startExpressServer = () => {
    const app = express();
    app.use(cors());
    app.use(express.json());
    
    app.get('/health', (req, res) => {
        res.json({ 
            status: 'operational', 
            version: '2.1.1-SOVEREIGN_TRADING',
            contracts: {
                token: CONFIG.TOKEN_CONTRACT_ADDRESS,
                paymaster: CONFIG.PAYMASTER_ADDRESS,
                smartAccount: CONFIG.SMART_ACCOUNT_ADDRESS
            },
            trading: CONFIG.TRADING_CONFIG
        });
    });
    
    app.post('/api/transfer-tokens', async (req, res) => {
        try {
            const result = await transferBWAEZIToSCW();
            res.json(result);
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    return app.listen(CONFIG.PORT, () => {
        console.log(`🚀 BSFM Sovereign API Listening on port ${CONFIG.PORT}`);
    });
};

/**
 * 🎯 CRITICAL FUNCTION: Transfer 100M BWAEZI to Smart Contract Wallet
 * CRITICAL FIX: Ensures transfer is skipped if SCW is funded, preventing crash on restart.
 */
async function transferBWAEZIToSCW() {
    console.log("\n" + "=".repeat(60));
    console.log("🔥 INITIATING 100M BWAEZI TRANSFER TO SMART CONTRACT WALLET");
    console.log("=".repeat(60));
    
    if (!CONFIG.SMART_ACCOUNT_ADDRESS) {
        throw new Error("Smart Account not configured. Check CONFIG addresses.");
    }
    
    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
    const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    
    console.log(`📍 EOA Address: ${CONFIG.SOVEREIGN_WALLET}`);
    console.log(`🎯 SCW Address: ${CONFIG.SMART_ACCOUNT_ADDRESS}`);
    console.log(`💎 Token Address: ${CONFIG.TOKEN_CONTRACT_ADDRESS}`);
    
    const bwaeziContract = new ethers.Contract(CONFIG.TOKEN_CONTRACT_ADDRESS, BWAEZI_ABI, signer);
    
    // Check balances BEFORE transfer
    const eoaBalance = await bwaeziContract.balanceOf(CONFIG.SOVEREIGN_WALLET);
    const scwBalance = await bwaeziContract.balanceOf(CONFIG.SMART_ACCOUNT_ADDRESS);
    const decimals = await bwaeziContract.decimals();
    const symbol = await bwaeziContract.symbol();
    
    console.log(`\n📊 BALANCES BEFORE TRANSFER:`);
    console.log(`   EOA Balance: ${ethers.formatUnits(eoaBalance, decimals)} ${symbol}`);
    console.log(`   SCW Balance: ${ethers.formatUnits(scwBalance, decimals)} ${symbol}`);
    
    const amountToFund = ethers.parseUnits("100000000", decimals); // 100,000,000 BWAEZI
    const sufficientThreshold = ethers.parseUnits("50000000", decimals); // 50,000,000 BWAEZI

    // --- CRITICAL FIX START: Check SCW balance first to allow skipping on restart ---
    if (scwBalance >= sufficientThreshold) {
        console.log(`⚠️  SCW already has ${ethers.formatUnits(scwBalance, decimals)} ${symbol}.`);
        console.log(`✅ SCW is sufficiently funded. Skipping transfer.`);
        return { success: true, message: "SCW already funded." };
    }
    
    // If we reach here, the SCW needs funding. Now we check the EOA source.
    if (eoaBalance === 0n) {
        throw new Error(`❌ EOA has 0 ${symbol} balance and SCW is not sufficiently funded. Manual EOA funding required.`);
    }
    // --- CRITICAL FIX END ---
    
    // Use the full available balance if less than 100M is present
    const actualTransferAmount = eoaBalance < amountToFund ? eoaBalance : amountToFund;
    
    console.log(`\nSending ${ethers.formatUnits(actualTransferAmount, decimals)} ${symbol} to SCW...`);
    
    const tx = await bwaeziContract.transfer(CONFIG.SMART_ACCOUNT_ADDRESS, actualTransferAmount);
    
    console.log(`📝 Transaction Hash: ${tx.hash}`);
    await tx.wait();
    console.log("🎉 Transfer confirmed on-chain.");
    
    // Check balances AFTER transfer
    const newScwBalance = await bwaeziContract.balanceOf(CONFIG.SMART_ACCOUNT_ADDRESS);
    
    console.log(`\n📊 BALANCES AFTER TRANSFER:`);
    console.log(`   SCW Balance: ${ethers.formatUnits(newScwBalance, decimals)} ${symbol}`);
    
    console.log("=".repeat(60));
    console.log("✅ BWAEZI SOVEREIGN CORE IS NOW FULLY FUNDED AND OPERATIONAL.");
    console.log("=".repeat(60) + "\n");
    
    return { 
        success: true, 
        message: `Successfully transferred ${ethers.formatUnits(actualTransferAmount, decimals)} BWAEZI to SCW`, 
        transactionHash: tx.hash 
    };
}

/**
 * Main deployment and initialization sequence
 */
async function deployAndInitialize() {
    console.log("=========================================================");
    console.log("🚀 BSFM SYSTEM INITIALIZING: USING DEPLOYED ERC-4337 CONTRACTS");
    console.log("=========================================================");

    if (!CONFIG.PRIVATE_KEY) {
        throw new Error("CRITICAL: PRIVATE_KEY environment variable is not set.");
    }
    
    // 1. USE EXISTING ERC-4337 INFRASTRUCTURE
    console.log(`\n🎉 USING EXISTING DEPLOYMENT:`);
    console.log(`   Paymaster Address: ${CONFIG.PAYMASTER_ADDRESS}`);
    console.log(`   SCW Address: ${CONFIG.SMART_ACCOUNT_ADDRESS}`);
    
    // 2. FUND THE SOVEREIGN CORE (100M BWAEZI Transfer)
    await transferBWAEZIToSCW(); 

    // 3. INITIALIZE SOVEREIGN CORE BRAIN AND TRADING ENGINE
    console.log("\n🧠 INITIALIZING SOVEREIGN CORE WITH TRADING CONFIGURATION...");
    const sovereignCore = new ProductionSovereignCore({
        smartAccountAddress: CONFIG.SMART_ACCOUNT_ADDRESS,
        paymasterAddress: CONFIG.PAYMASTER_ADDRESS,
        tokenAddress: CONFIG.TOKEN_CONTRACT_ADDRESS,
        privateKey: CONFIG.PRIVATE_KEY,
        rpcUrl: CONFIG.RPC_URLS[0],
        // 💰 Injecting the new trading strategies and config
        tradingConfig: CONFIG.TRADING_CONFIG
    });
    
    // This call must now resolve the internal dependency issue
    await sovereignCore.initialize();
    
    // 4. ACTIVATE AUTO-TRADING BOT
    console.log(`\n✅ Starting Auto-Trading Bot with ${CONFIG.TRADING_CONFIG.TRADING_STRATEGIES.length} active strategies...`);
    sovereignCore.startAutoTrading();

    // 5. START API SERVER
    startExpressServer();
}

deployAndInitialize().catch(error => {
    console.error("❌ CRITICAL BSFM DEPLOYMENT FAILURE:", error);
    process.exit(1);
});
