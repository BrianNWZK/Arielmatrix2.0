// arielsql_suite/main.js - BSFM MASTER BOOT FILE (v5.0 - SEVEN PILLARS ARCHITECTURE ENTRY POINT)

import process from 'process';

// 🚨 ARCHITECTURAL ASSUMPTION: The ServiceManager class (which contains the 
// corrected Interface First 'initialize' logic) must be imported.
import { ServiceManager } from './serviceManager.js'; 

// =========================================================================
// PRODUCTION CONFIGURATION - USER-DEFINED AND ENVIRONMENT VARIABLES
// =========================================================================
const CONFIG = {
    SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET || 
    "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA",
    NETWORK: 'mainnet',
    RPC_URLS: [
        "https://eth.llamarpc.com", 
        "https://rpc.ankr.com/eth", 
        "https://cloudflare-eth.com" 
    ],
    PORT: process.env.PORT || 10000,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    BWAEZI_KERNEL_ADDRESS: process.env.BWAEZI_KERNEL_ADDRESS || null
};

// =========================================================================
// MAIN LAUNCH FUNCTION
// =========================================================================

/**
 * Main function to start the BSFM ServiceManager.
 * This function orchestrates the Seven Pillars launch sequence by delegating 
 * to the ServiceManager's non-blocking initialize method.
 */
async function executeSystemLaunch() {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║             BWAEZI SOVEREIGN FINANCIAL MATRIX (BSFM)         ║
║         🔥 GOD MODE LAUNCH: SEVEN PILLARS SEQUENCE 🔥        ║
╚══════════════════════════════════════════════════════════════╝
`);
    
    try {
        const isMainnet = CONFIG.NETWORK === 'mainnet';
        
        const manager = new ServiceManager({
            port: CONFIG.PORT,
            mainnet: isMainnet, // Derived from CONFIG.NETWORK
            
            // Assume these still default to true if not explicitly disabled in ENV
            enableGodMode: process.env.ENABLE_GOD_MODE !== 'false', 
            walletIntegration: process.env.WALLET_INTEGRATION !== 'false',
            
            blockchainConfig: {
                // Use the first RPC URL for the primary connection
                rpcUrl: CONFIG.RPC_URLS[0] || 'https://rpc.winr.games', 
                // ChainId is often required for blockchain initialization
                chainId: process.env.BWAEZI_CHAIN_ID || 777777, 
                contractAddress: CONFIG.BWAEZI_KERNEL_ADDRESS
            },
            monitoringConfig: { logLevel: isMainnet ? 'info' : 'debug' }
        });

        // 🚀 CRITICAL STEP: Call the non-blocking initialize() method.
        // This starts the HTTP server immediately ("Interface First" - Pillar 7)
        // and begins the heavy core system loading (Pillars 1-6) in the background.
        await manager.initialize(); 

    } catch (error) {
        console.error("💥 FATAL SYSTEM FAILURE IN MAIN LAUNCH SCRIPT:", error.message);
        // A failure here means the interface couldn't even bind to the port.
        process.exit(1); 
    }
}

// Execute the main launch sequence only if this file is run directly.
if (import.meta.url.startsWith('file:')) {
    executeSystemLaunch();
}
