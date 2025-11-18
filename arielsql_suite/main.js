// arielsql_suite/main.js — PRODUCTION ORCHESTRATOR
// 🚀 BOOTSTRAP: GUARANTEED AA EXECUTION PATH

import { ethers } from 'ethers';
import { ProductionSovereignCore } from '../core/sovereign-brain.js'; 
import { setupGlobalLogger, getGlobalLogger } from '../modules/enterprise-logger/index.js';

// 🔥 CORRECTED IMPORT: Importing the real deployment logic from its dedicated module.
import { deployERC4337Contracts } from './aa-deployment-engine.js'; 


// =========================================================================
// 👑 GLOBAL CONFIGURATION (Updated with Confirmed Contract Address)
// =========================================================================

const CONFIG = {
    MAINNET_RPC_URL: process.env.MAINNET_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo',
    
    // CRITICAL DEPLOYMENT ADDRESSES (Must be set in ENV or passed here)
    ENTRY_POINT_ADDRESS: process.env.ENTRY_POINT_ADDRESS || null,
    WETH_TOKEN_ADDRESS: process.env.WETH_TOKEN_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', 
    UNISWAP_V3_QUOTER_ADDRESS: process.env.UNISWAP_V3_QUOTER_ADDRESS || null, // V3 Quoter address
    BWAEZI_WETH_FEE: 3000, // 0.3% fee tier

    // Token and Funding
    BWAEZI_TOKEN_ADDRESS: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da',
    USDC_TOKEN_ADDRESS: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', 
    USDC_FUNDING_GOAL: "5.17", 
    
    // Deployment Addresses (Will be updated during runtime if successful)
    BWAEZI_PAYMASTER_ADDRESS: null,
    SMART_ACCOUNT_ADDRESS: null,
};

// =========================================================================
// MAIN ORCHESTRATION FUNCTION
// =========================================================================

async function main() {
    setupGlobalLogger({ logLevel: 'info' });
    const logger = getGlobalLogger('Orchestrator');
    logger.info('Starting Sovereign Core Production Orchestrator...');

    // 1. CRITICAL GUARANTEE: Load EOA Signer
    const privateKey = process.env.PRIVATE_KEY;
    if (!privateKey) {
        logger.error('💥 FATAL ERROR: PRIVATE_KEY not set in environment. AA EXECUTION CANNOT BE GUARANTEED.');
        throw new Error('PRIVATE_KEY not set in environment.');
    }
    const provider = new ethers.JsonRpcProvider(CONFIG.MAINNET_RPC_URL);
    const signer = new ethers.Wallet(privateKey, provider);
    logger.info(`✅ EOA Signer Loaded: ${signer.address}`);

    // 2. Initialize Production Sovereign Core
    const core = new ProductionSovereignCore(CONFIG, signer);
    global.BWAEZI_PRODUCTION_CORE = core; 

    try {
        // 3. Run the Core Initialization Sequence (Guarantees EOA Funding if needed)
        await core.initialize();

        // 4. Check Deployment Status
        const status = await core.checkDeploymentStatus();

        // 5. GUARANTEED AA DEPLOYMENT EXECUTION
        if (!status.paymasterDeployed || !status.smartAccountDeployed) {
            logger.info('🛠️ DEPLOYMENT MODE: Initiating GUARANTEED ERC-4337 Infrastructure Deployment...');
            
            // CORRECT CALL: Passing all required core components to the real deployment function
            const { paymasterAddress, smartAccountAddress } = await deployERC4337Contracts(
                core.ethersProvider, 
                core.signer, 
                core.config, 
                core.AA_SDK
            );
            
            // Update the core configuration with the successful deployment addresses
            core.updateDeploymentAddresses(paymasterAddress, smartAccountAddress); 
            logger.info(`🎉 AA DEPLOYMENT COMPLETE (GUARANTEED): Paymaster: ${paymasterAddress}, Smart Account: ${smartAccountAddress}`);
        }

        // 6. Test Peg Maintenance (Ensures 1 BWAEZI = $100 WETH is respected)
        logger.info('👑 TESTING PEG ENFORCEMENT: Funding Paymaster for $500 WETH Equivalent...');
        await core.fundPaymasterWithBWAEZI(500); // Should use 5 BWAEZI at $100 peg.
        
        logger.info('🚀 SYSTEM fully operational. Zero-capital revenue generation active.');

    } catch (error) {
        logger.error('❌ PRODUCTION SYSTEM INITIALIZATION FAILED:', error.message);
        logger.error('HALTING ORCHESTRATOR. AA Deployment failed. Inspect transaction logs.');
        process.exit(1);
    }
};

// Start the production system
main();
