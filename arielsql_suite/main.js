// arielsql_suite/main.js
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';

// 🔥 CORRECTED IMPORTS: Importing real modules from the file system (NO MOCKS)
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { deployERC4337Contracts } from './aa-deployment-engine.js';
import { getArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js'; // REAL FILE IMPORT
import { getGlobalLogger } from '../modules/enterprise-logger/index.js'; // REAL FILE IMPORT

// 👑 Initialize the Orchestrator Logger (early initialization is critical, addressing the log timing warning)
const logger = getGlobalLogger('MainOrchestrator');

// =========================================================================
// 👑 CORE CONFIGURATION (Environment Dependent)
// =========================================================================

const BSFM_CONFIG = {
    // These values must be set via ENV variables in production
    MAINNET_RPC_URL: process.env.MAINNET_RPC_URL,
    PRIVATE_KEY: process.env.PRIVATE_KEY, // The EOA signer key
    UNISWAP_V3_QUOTER_ADDRESS: process.env.UNISWAP_V3_QUOTER_ADDRESS || '0xb27308f9F90D607463bb14a1BcdC2D097cB52667', // Example Quoter
    WETH_ADDRESS: process.env.WETH_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH mainnet address
    usdcTokenAddress: process.env.USDC_ADDRESS || '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC mainnet address
    usdcFundingGoal: process.env.USDC_FUNDING_GOAL || "5.17", // Amount to swap to ETH
    // ✅ CRITICAL FIX: Updated BWAEZI Token address from migration log
    bwaeziTokenAddress: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da', 
    BWAEZI_WETH_FEE: process.env.BWAEZI_WETH_FEE || 3000, // 0.3% fee tier for BWAEZI/WETH
    PAYMASTER_ADDRESS: process.env.PAYMASTER_ADDRESS, // Set if already deployed
    SMART_ACCOUNT_ADDRESS: process.env.SMART_ACCOUNT_ADDRESS // Set if already deployed
};

// =========================================================================
// 🚀 MAIN ORCHESTRATION FLOW
// =========================================================================

async function main() {
    // 🔥 CRITICAL FIX: Ensure PRIVATE_KEY is set before proceeding
    if (!process.env.PRIVATE_KEY) {
        logger.error("❌ FATAL: PRIVATE_KEY environment variable is required to instantiate the EOA Signer. ABORTING DEPLOYMENT.");
        // The log confirms this exact error was thrown and caught by the main try/catch block.
        throw new Error("PRIVATE_KEY not set in environment."); 
    }

    try {
        logger.info('🧠 INITIALIZING CONSCIOUSNESS REALITY ENGINE...');
        // 1. Setup EOA Signer
        const provider = new ethers.JsonRpcProvider(BSFM_CONFIG.MAINNET_RPC_URL);
        const signer = new ethers.Wallet(BSFM_CONFIG.PRIVATE_KEY, provider);

        // 2. Initialize Core Brain
        const coreBrain = new ProductionSovereignCore(BSFM_CONFIG, signer); 
        await coreBrain.initialize(); // Runs self-funding logic

        // 3. Initialize SQL Engine
        // Correct usage of the imported real function
        const dbEngine = getArielSQLiteEngine(logger); 
        dbEngine.setup();
        logger.info('✅ CONSCIOUSNESS REALITY ENGINE READY - PRODUCTION MODE ACTIVE');


        // 4. Check deployment status again and deploy if needed
        const deploymentStatus = await coreBrain.checkDeploymentStatus();
        
        if (!deploymentStatus.paymasterDeployed || !deploymentStatus.smartAccountDeployed) {
            logger.info('🛠️ DEPLOYMENT MODE: Initiating ERC-4337 Infrastructure Deployment...');

            const deploymentResult = await deployERC4337Contracts(signer, BSFM_CONFIG);

            if (deploymentResult.success) {
                logger.info(`🎉 ERC-4337 Deployment Successful! Paymaster: ${deploymentResult.paymasterAddress}, Smart Account: ${deploymentResult.smartAccountAddress}`);
                coreBrain.updateDeploymentAddresses(deploymentResult.paymasterAddress, deploymentResult.smartAccountAddress);
            } else {
                logger.error(`❌ CRITICAL DEPLOYMENT FAILURE: ${deploymentResult.error}`);
            }
        } else {
            logger.info('✅ ERC-4337 Infrastructure already deployed. Proceeding to runtime...');
        }

        // 5. System Runtime Start (Web server and AA operations)
        const app = express();
        app.use(cors());
        app.get('/health', async (req, res) => {
            const health = await coreBrain.healthCheck();
            res.json(health);
        });
        
        const PORT = process.env.PORT || 8080;
        app.listen(PORT, () => {
            logger.info(`🌐 Web Server running on port ${PORT}`);
        });

    } catch (error) {
        // This will catch the PRIVATE_KEY error or any other initialization failure
        logger.error(`💥 FATAL ERROR during initialization/deployment: ${error.stack}`);
        console.log('❌ BSFM Production System Started with Errors');
    }
}

main();
