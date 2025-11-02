/**
 * 🚀 BWAEZI ENTERPRISE KERNEL - MAIN ENTRY POINT
 * PRODUCTION GOD MODE v8.5
 * * ES MODULE: Initializes blockchain, deploys the kernel, and starts 
 * a Render-compatible Express server to bind the required port.
 * * CRITICAL FIX: Explicitly binds Express server to 0.0.0.0 and PORT env.
 */

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

// Import OPTIMIZED BWAEZI Kernel Contract
import { BWAEZIKernelDeployer } from './bwaezi-kernel-contract.js';

// =========================================================================
// PRODUCTION CONFIGURATION - GAS OPTIMIZED
// =========================================================================
const CONFIG = {
    SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET || "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA",
    TOKEN_NAME: "BWAEZI",
    TOKEN_SYMBOL: "bwzC",
    TOTAL_SUPPLY: "100000000000000000000000000",
    DEPLOYMENT_GAS_LIMIT: "2500000",
    NETWORK: 'mainnet',
    CHAIN_ID: 1,
    RPC_URLS: [
        "https://eth.llamarpc.com",
        "https://rpc.ankr.com/eth", 
        "https://cloudflare-eth.com"
    ],
    PORT: process.env.PORT || 10000,
    PRIVATE_KEY: process.env.PRIVATE_KEY
};

// Global state
let bwaeziKernelAddress = null;
let kernelContract = null;
let provider = null;
let wallet = null;

// =========================================================================
// ROBUST PROVIDER WITH RETRY MECHANISM
// =========================================================================
class RobustProvider {
    constructor(rpcUrls) {
        this.rpcUrls = rpcUrls;
        this.currentIndex = 0;
        this.maxRetries = 3;
    }

    async initializeProvider() {
        console.log("🌐 INITIALIZING ROBUST PROVIDER WITH RETRY MECHANISM...");
        
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            const rpcUrl = this.rpcUrls[this.currentIndex];
            console.log(` 🔄 Attempt ${attempt + 1}: ${rpcUrl}`);
            
            try {
                const provider = new ethers.JsonRpcProvider(rpcUrl);
                
                // Test connection with timeout
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Connection timeout')), 10000)
                );
                
                const networkPromise = provider.getNetwork();
                const blockPromise = provider.getBlockNumber();
                
                const [network, block] = await Promise.race([
                    Promise.all([networkPromise, blockPromise]),
                    timeoutPromise
                ]);

                console.log(` ✅ CONNECTED: ${rpcUrl}`);
                console.log(` • Block: ${block} | Chain: ${network.chainId}`);
                return provider;
            } catch (error) {
                console.log(` ❌ FAILED: ${rpcUrl} - ${error.message}`);
                this.currentIndex = (this.currentIndex + 1) % this.rpcUrls.length;
                if (attempt < this.maxRetries - 1) {
                    console.log(` 💤 Retrying in 1 second...`);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            }
        }
        throw new Error("Failed to connect to all RPC endpoints after multiple retries.");
    }
}

// =========================================================================
// BLOCKCHAIN INITIALIZATION
// =========================================================================
async function initializeBlockchain() {
    console.log("🚀 INITIALIZING BLOCKCHAIN (ROBUST MODE)...");
    
    try {
        const providerManager = new RobustProvider(CONFIG.RPC_URLS);
        provider = await providerManager.initializeProvider();

        if (!CONFIG.PRIVATE_KEY) {
            throw new Error("PRIVATE_KEY environment variable required");
        }
        
        wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);

        // Robust balance check with retry
        let balance;
        for (let i = 0; i < 3; i++) {
            try {
                balance = await provider.getBalance(wallet.address);
                break;
            } catch (error) {
                if (i === 2) throw error;
                console.log(` 💤 Balance check failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        const gasData = await provider.getFeeData();
        console.log("✅ BLOCKCHAIN INITIALIZED");
        console.log(` 👑 Sovereign: ${CONFIG.SOVEREIGN_WALLET}`);
        console.log(` 💰 Balance: ${ethers.formatEther(balance)} ETH`);
        console.log(` ⛽ Gas Price: ${ethers.formatUnits(gasData.gasPrice, 'gwei')} gwei`);

        // GAS PROTECTION - Don't deploy if balance too low
        const minEth = ethers.parseEther("0.006");
        if (balance < minEth) {
            throw new Error(`Insufficient ETH. Need ${ethers.formatEther(minEth)} ETH, have ${ethers.formatEther(balance)} ETH`);
        }

        return { provider, wallet };
    } catch (error) {
        console.error("❌ BLOCKCHAIN INIT FAILED:", error.message);
        throw error;
    }
}

// =========================================================================
// ROBUST KERNEL DEPLOYMENT
// =========================================================================
async function deployBwaeziKernel() {
    try {
        const kernelDeployer = new BWAEZIKernelDeployer(wallet, provider, CONFIG);
        const result = await kernelDeployer.deploy();
        
        if (result.success) {
            bwaeziKernelAddress = result.address;
            kernelContract = result.contract;
            return {
                success: true,
                address: result.address,
                deploymentCost: result.deploymentCost
            };
        } else {
            return { success: false, error: result.error };
        }
    } catch (error) {
        console.error("❌ Deployment error:", error);
        return { success: false, error: error.message };
    }
}

// =========================================================================
// EXPRESS SERVER - MAINTAINS ALL ORIGINAL ENDPOINTS
// =========================================================================
function createExpressServer() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // Health check
    app.get('/health', async (req, res) => {
        try {
            let blockchainStatus = { isConnected: false };
            if (provider) {
                try {
                    const blockNumber = await provider.getBlockNumber();
                    blockchainStatus = {
                        network: CONFIG.NETWORK,
                        blockNumber: blockNumber,
                        isConnected: true,
                    };
                } catch (error) {
                    blockchainStatus = { 
                        isConnected: false, 
                        error: error.message 
                    };
                }
            }

            const tokenStatus = bwaeziKernelAddress ? {
                address: bwaeziKernelAddress,
                deployed: true
            } : { deployed: false };

            res.json({
                status: 'operational',
                version: 'v8.5',
                uptime: process.uptime(),
                port: CONFIG.PORT,
                blockchain: blockchainStatus,
                token: tokenStatus,
                godMode: true,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ 
                status: 'degraded', 
                error: error.message, 
                timestamp: new Date().toISOString() 
            });
        }
    });

    // Deploy endpoint
    app.post('/deploy', async (req, res) => {
        try {
            console.log('🚀 PRODUCTION TOKEN DEPLOYMENT REQUEST RECEIVED');
            
            if (bwaeziKernelAddress) {
                return res.json({
                    success: true,
                    message: 'Token already deployed',
                    address: bwaeziKernelAddress,
                    contract: kernelContract
                });
            }

            const deploymentResult = await deployBwaeziKernel();
            
            if (deploymentResult.success) {
                res.json({
                    success: true,
                    message: 'BWAEZI Kernel deployed successfully',
                    address: deploymentResult.address,
                    deploymentCost: deploymentResult.deploymentCost,
                    explorer: `https://etherscan.io/address/${deploymentResult.address}`
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: deploymentResult.error,
                    gasSaved: true
                });
            }
        } catch (error) {
            console.error('Deployment error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                gasSaved: true
            });
        }
    });

    // Token info endpoint
    app.get('/token', async (req, res) => {
        try {
            if (!kernelContract || !bwaeziKernelAddress) {
                return res.status(404).json({
                    error: 'Token not deployed yet',
                    deployed: false
                });
            }

            const [name, symbol, totalSupply, owner] = await Promise.all([
                kernelContract.name(),
                kernelContract.symbol(),
                kernelContract.totalSupply(),
                kernelContract.owner()
            ]);

            res.json({
                deployed: true,
                address: bwaeziKernelAddress,
                name: name,
                symbol: symbol,
                totalSupply: totalSupply.toString(),
                owner: owner,
                verified: true,
                network: CONFIG.NETWORK
            });
        } catch (error) {
            res.status(500).json({
                error: error.message,
                deployed: false
            });
        }
    });

    // Contract interaction endpoint
    app.post('/contract/:function', async (req, res) => {
        try {
            const { function: funcName } = req.params;
            const { params = [] } = req.body;

            if (!kernelContract) {
                return res.status(400).json({ error: 'Contract not deployed' });
            }

            if (!kernelContract[funcName]) {
                return res.status(400).json({ error: `Function ${funcName} not found` });
            }

            const result = await kernelContract[funcName](...params);
            res.json({ success: true, result: result.toString() });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    // Root endpoint
    app.get('/', (req, res) => {
        res.json({
            message: '🚀 BWAEZI SOVEREIGN KERNEL API - PRODUCTION GOD MODE v8.5',
            status: 'operational',
            endpoints: [
                'GET  /health - System status',
                'POST /deploy - Deploy BWAEZI Kernel',
                'GET  /token - Token information',
                'POST /contract/:function - Call contract functions'
            ],
            network: CONFIG.NETWORK,
            version: 'v8.5',
            godMode: true
        });
    });

    return app;
}

// =========================================================================
// MAIN EXECUTION - ROBUST STARTUP
// =========================================================================
async function main() {
    try {
        console.log("🚀 STARTING BWAEZI SOVEREIGN KERNEL - PRODUCTION GOD MODE v8.5");
        console.log(" ⚡ GAS OPTIMIZED - BYTECODE FIXED - RENDER READY");
        console.log(" 🔧 CONFIGURATION:");
        console.log(` • Network: ${CONFIG.NETWORK}`);
        console.log(` • Chain ID: ${CONFIG.CHAIN_ID}`);
        console.log(` • Port: ${CONFIG.PORT}`);
        console.log(` • Sovereign: ${CONFIG.SOVEREIGN_WALLET}`);

        // Initialize blockchain connection
        await initializeBlockchain();

        // Create and start Express server
        const app = createExpressServer();
        
        // ✅ CRITICAL FIX: Explicitly bind to 0.0.0.0 and PORT for Render
        const server = app.listen(CONFIG.PORT, '0.0.0.0', () => {
            console.log(`✅ BWAEZI KERNEL API RUNNING ON PORT ${CONFIG.PORT}`);
            console.log(` 🌐 Local: http://localhost:${CONFIG.PORT}`);
            console.log(` 🌐 Network: http://0.0.0.0:${CONFIG.PORT}`);
            console.log(" 🔥 READY FOR MAINNET DEPLOYMENT!");
            console.log(" 💡 Use POST /deploy to deploy the BWAEZI Kernel contract");
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM received, shutting down gracefully');
            server.close(() => {
                console.log('✅ Process terminated');
                process.exit(0);
            });
        });

    } catch (error) {
        console.error("❌ STARTUP FAILED:", error.message);
        console.log(" 💡 Check your environment variables and network connection");
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
