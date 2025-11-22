// arielsql_suite/main.js - FULL DEPLOYMENT WITH AUTO TOKEN TRANSFER and AA Engine Startup
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
// 👑 NEW IMPORT: The AA SDK integration layer
import { AASDK, getSCWAddress } from '../modules/aa-loaves-fishes.js';
import { deployERC4337Contracts } from './aa-deployment-engine.js'; 

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
    // Addresses are hardcoded post-deployment for immediate execution
    ENTRY_POINT_ADDRESS: "0x5FF137D4bEAA7036d654a898df565D304B88", // Official Mainnet EntryPoint v0.6
    
    // 🔥 CRITICAL CONTRACT ADDRESSES (ASSUMED DEPLOYED)
    TOKEN_CONTRACT_ADDRESS: process.env.BWAEZI_TOKEN_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da', // BWAEZI Token Contract
    WETH_TOKEN_ADDRESS: process.env.WETH_TOKEN_ADDRESS || "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    UNISWAP_V3_QUOTER_ADDRESS: process.env.UNISWAP_V3_QUOTER_ADDRESS || "0xb27308f9F90D607463bb33aEB824A6c6D6D0Bd6d", // Corrected Quoter address
    BWAEZI_WETH_FEE: 3000,

    PAYMASTER_ADDRESS: process.env.PAYMASTER_ADDRESS || "0xC336127cb4732d8A91807f54F9531C682F80E864",
    SMART_ACCOUNT_ADDRESS: process.env.SMART_ACCOUNT_ADDRESS || "0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C",
    
    // NOTE: BWAEZI_PAYMASTER_ADDRESS is the same as PAYMASTER_ADDRESS
    BWAEZI_PAYMASTER_ADDRESS: process.env.PAYMASTER_ADDRESS || "0xC336127cb4732d8A91807f54F9531C682F80E864",
};

// BWAEZI Token ABI for transfer
const BWAEZI_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)"
];

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

    if (eoaBalance === 0n) {
        throw new Error(`❌ EOA has 0 ${symbol} balance. Cannot transfer.`);
    }

    if (scwBalance > 0n) {
        console.log(`⚠️ SCW already has ${ethers.formatUnits(scwBalance, decimals)} ${symbol} balance. Skipping transfer.`);
        return { success: true, message: "SCW already funded." };
    }
    
    // Transfer the full EOA balance to the SCW
    const amountToTransfer = eoaBalance; // The 100,000,000 BWAEZI amount
    
    console.log(`\n🔥 Initiating transfer of ${ethers.formatUnits(amountToTransfer, decimals)} ${symbol} to SCW...`);

    // This EOA transaction requires native ETH for gas
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

            const result = await optimizedCore.executeBWAEZISwapWithAA(amountIn, tokenOutAddress);
            
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
    try {
        console.log("🔥 BSFM ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.1.0: AA UPGRADE INITIATED");
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
        const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);

        // NOTE: deployERC4337Contracts is removed as deployment is complete in your logs.
        // --- Initialize Production Sovereign Core with AA Addresses ---
        const optimizedCore = new ProductionSovereignCore({ 
            paymasterAddress: CONFIG.BWAEZI_PAYMASTER_ADDRESS, 
            smartAccountAddress: CONFIG.SMART_ACCOUNT_ADDRESS 
        });

        await optimizedCore.initialize();
        optimizedCore.startTradingBot(); // Start the continuous trading loop

        startExpressServer(optimizedCore);

    } catch (error) {
        console.error("❌ CRITICAL BOOT FAILURE:", error.message);
        process.exit(1);
    }
})();
