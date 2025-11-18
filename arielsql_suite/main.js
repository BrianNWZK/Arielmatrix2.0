// arielsql_suite/main.js
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';

// CORRECTED IMPORTS: Importing real modules (NO MOCKS)
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { deployERC4337Contracts } from './aa-deployment-engine.js';
import { getArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js'; 
import { getGlobalLogger } from '../modules/enterprise-logger/index.js'; 

const logger = getGlobalLogger('MainOrchestrator');

// =========================================================================
// 👑 CORE CONFIGURATION
// =========================================================================

const BSFM_CONFIG = {
    MAINNET_RPC_URL: process.env.MAINNET_RPC_URL,
    PRIVATE_KEY: process.env.PRIVATE_KEY, 
    UNISWAP_V3_QUOTER_ADDRESS: process.env.UNISWAP_V3_QUOTER_ADDRESS || '0xb27308f9F90D607463bb14a1BcdC2D097cB52667', 
    WETH_ADDRESS: process.env.WETH_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 
    usdcTokenAddress: process.env.USDC_ADDRESS || '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', 
    usdcFundingGoal: process.env.USDC_FUNDING_GOAL || "5.17", // The target amount to swap for gas
    
    // ✅ CONFIRMED FIX: Using the address provided for BWAEZI/Smart Contract
    bwaeziTokenAddress: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da', 
    
    BWAEZI_WETH_FEE: process.env.BWAEZI_WETH_FEE || 3000, 
    
    // NOTE: This will prioritize the user-provided environment variable
    PAYMASTER_ADDRESS: process.env.PAYMASTER_ADDRESS, 
    SMART_ACCOUNT_ADDRESS: process.env.SMART_ACCOUNT_ADDRESS 
};

// =========================================================================
// 🚀 MAIN ORCHESTRATION FLOW
// =========================================================================

async function main() {
    // FIX: Since you confirmed it's set, this check now passes, resolving the log error.
    if (!process.env.PRIVATE_KEY) {
        logger.error("❌ FATAL: PRIVATE_KEY environment variable is required to instantiate the EOA Signer. ABORTING DEPLOYMENT.");
        throw new Error("PRIVATE_KEY not set in environment.");
    }

    try {
        logger.info('🧠 INITIALIZING CONSCIOUSNESS REALITY ENGINE...');
        // 1. Setup EOA Signer
        const provider = new ethers.JsonRpcProvider(BSFM_CONFIG.MAINNET_RPC_URL);
        const signer = new ethers.Wallet(BSFM_CONFIG.PRIVATE_KEY, provider);

        // 2. Initialize Core Brain - THIS RUNS THE USDC SWAP IF EOA IS LOW ON ETH
        const coreBrain = new ProductionSovereignCore(BSFM_CONFIG, signer); 
        await coreBrain.initialize();

        // 3. Initialize SQL Engine
        const dbEngine = getArielSQLiteEngine(logger); 
        dbEngine.setup();
        logger.info('✅ CONSCIOUSNESS REALITY ENGINE READY - PRODUCTION MODE ACTIVE');


        // 4. Deployment Check/Execution
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

        // 5. System Runtime Start
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
        logger.error(`💥 FATAL ERROR during initialization/deployment: ${error.stack}`);
        console.log('❌ BSFM Production System Started with Errors');
    }
}

main();
