/**
 * 🚀 BWAEZI ENTERPRISE KERNEL - MAIN ENTRY POINT
 * PRODUCTION GOD MODE v8.5
 * ULTRA GAS OPTIMIZED - PORT BINDING FIXED
 */

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

// Import OPTIMIZED BWAEZI Kernel Contract
import { BWAEZIKernelDeployer } from './bwaezi-kernel-contract.js';

// =========================================================================
// CONFIGURATION
// =========================================================================
const CONFIG = {
    SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET || "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA",
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    PORT: process.env.PORT || 10000,
    RPC_URLS: ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth"]
};

// Global state
let bwaeziKernelAddress = null;
let kernelContract = null;
let provider = null;
let wallet = null;

// =========================================================================
// EXPRESS SERVER - PORT BINDING FIXED
// =========================================================================
function createExpressServer() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // Health endpoint
    app.get('/health', async (req, res) => {
        try {
            res.json({
                status: 'operational',
                version: 'v8.5',
                port: CONFIG.PORT,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // DEPLOY ENDPOINT - SIMPLIFIED & WORKING
    app.post('/deploy', async (req, res) => {
        console.log('🚀 DEPLOYMENT REQUEST RECEIVED');
        
        try {
            if (bwaeziKernelAddress) {
                return res.json({
                    success: true,
                    message: 'Already deployed',
                    address: bwaeziKernelAddress
                });
            }

            // Validate private key
            if (!CONFIG.PRIVATE_KEY) {
                return res.status(400).json({
                    success: false,
                    error: "PRIVATE_KEY environment variable required"
                });
            }

            // Initialize provider if not already
            if (!provider) {
                provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
            }

            // Initialize wallet
            if (!wallet) {
                wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
            }

            console.log('🎯 Starting deployment...');
            console.log(' • Wallet:', wallet.address);
            
            const balance = await provider.getBalance(wallet.address);
            console.log(' • Balance:', ethers.formatEther(balance), 'ETH');

            // Deploy contract
            const kernelDeployer = new BWAEZIKernelDeployer(wallet, provider, CONFIG);
            const result = await kernelDeployer.deploy();

            if (result.success) {
                bwaeziKernelAddress = result.address;
                kernelContract = result.contract;
                
                res.json({
                    success: true,
                    message: 'BWAEZI Kernel deployed successfully',
                    address: result.address,
                    transaction: result.transactionHash,
                    explorer: `https://etherscan.io/address/${result.address}`
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            console.error('Deployment error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // GET endpoint for easy browser deployment
    app.get('/deploy-now', async (req, res) => {
        console.log('🚀 GET DEPLOYMENT TRIGGERED');
        
        try {
            if (bwaeziKernelAddress) {
                return res.json({
                    success: true,
                    message: 'Already deployed',
                    address: bwaeziKernelAddress
                });
            }

            // Validate private key
            if (!CONFIG.PRIVATE_KEY) {
                return res.status(400).json({
                    success: false,
                    error: "PRIVATE_KEY environment variable required"
                });
            }

            // Initialize provider if not already
            if (!provider) {
                provider = new ethers.JsonRpcProvider(CONFIG.RPC_URLS[0]);
            }

            // Initialize wallet
            if (!wallet) {
                wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
            }

            console.log('🎯 Starting deployment via GET...');
            
            const balance = await provider.getBalance(wallet.address);
            console.log(' • Balance:', ethers.formatEther(balance), 'ETH');

            // Deploy contract
            const kernelDeployer = new BWAEZIKernelDeployer(wallet, provider, CONFIG);
            const result = await kernelDeployer.deploy();

            if (result.success) {
                bwaeziKernelAddress = result.address;
                kernelContract = result.contract;
                
                res.json({
                    success: true,
                    message: 'BWAEZI Kernel deployed successfully via GET',
                    address: result.address,
                    transaction: result.transactionHash,
                    explorer: `https://etherscan.io/address/${result.address}`
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }

        } catch (error) {
            console.error('GET Deployment error:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // Root endpoint
    app.get('/', (req, res) => {
        res.json({
            message: '🚀 BWAEZI SOVEREIGN KERNEL API - PRODUCTION GOD MODE',
            endpoints: [
                'GET  /health - System status',
                'POST /deploy - Deploy BWAEZI Kernel',
                'GET  /deploy-now - Deploy via GET'
            ],
            deployment_ready: true
        });
    });

    return app;
}

// =========================================================================
// MAIN EXECUTION - PORT BINDING FIXED
// =========================================================================
async function main() {
    try {
        console.log("🚀 STARTING BWAEZI SOVEREIGN KERNEL");
        console.log(" • Port:", CONFIG.PORT);
        console.log(" • Sovereign:", CONFIG.SOVEREIGN_WALLET);
        
        if (!CONFIG.PRIVATE_KEY) {
            console.log("❌ PRIVATE_KEY environment variable required");
            process.exit(1);
        }

        // Create and start Express server
        const app = createExpressServer();
        
        // ✅ CRITICAL PORT BINDING FIX
        const server = app.listen(CONFIG.PORT, '0.0.0.0', () => {
            console.log(`✅ BWAEZI KERNEL API RUNNING ON PORT ${CONFIG.PORT}`);
            console.log(`🌐 Local: http://localhost:${CONFIG.PORT}`);
            console.log(`🌐 Network: http://0.0.0.0:${CONFIG.PORT}`);
            console.log("🔥 READY FOR DEPLOYMENT!");
            console.log("💡 Use POST /deploy or GET /deploy-now");
        });

        // Handle server errors
        server.on('error', (error) => {
            console.error('❌ Server error:', error);
            process.exit(1);
        });

    } catch (error) {
        console.error("💥 STARTUP FAILED:", error);
        process.exit(1);
    }
}

// =========================================================================
// START THE APPLICATION
// =========================================================================
main().catch(error => {
    console.error("💥 FATAL ERROR:", error);
    process.exit(1);
});
