/**
 * 🚀 BWAEZI ENTERPRISE KERNEL - MAIN ENTRY POINT
 * PRODUCTION GOD MODE v8.5
 * * ES MODULE: Initializes blockchain, deploys the kernel, and starts 
 * a Render-compatible Express server to bind the required port.
 * * CRITICAL FIX: Enhanced private key validation and error handling
 */

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

// Import OPTIMIZED BWAEZI Kernel Contract
import { BWAEZIKernelDeployer } from './bwaezi-kernel-contract.js';

// =========================================================================
// ROBUST ENVIRONMENT VARIABLE VALIDATION
// =========================================================================
function validateEnvironment() {
    console.log("🔧 VALIDATING ENVIRONMENT VARIABLES...");
    
    const PRIVATE_KEY = process.env.PRIVATE_KEY;
    const SOVEREIGN_WALLET = process.env.SOVEREIGN_WALLET || "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA";
    
    // CRITICAL: Validate private key exists and is properly formatted
    if (!PRIVATE_KEY) {
        throw new Error("❌ PRIVATE_KEY environment variable is REQUIRED and not set");
    }
    
    if (!PRIVATE_KEY.startsWith('0x')) {
        throw new Error("❌ PRIVATE_KEY must start with '0x'");
    }
    
    if (PRIVATE_KEY.length !== 66) {
        throw new Error(`❌ PRIVATE_KEY invalid length: ${PRIVATE_KEY.length} characters (expected 66)`);
    }
    
    // Validate private key format (hex characters only)
    const hexRegex = /^0x[0-9a-fA-F]{64}$/;
    if (!hexRegex.test(PRIVATE_KEY)) {
        throw new Error("❌ PRIVATE_KEY contains invalid characters - must be 64 hex characters after 0x");
    }
    
    console.log("✅ ENVIRONMENT VARIABLES VALIDATED");
    console.log(` • Sovereign: ${SOVEREIGN_WALLET}`);
    console.log(` • Private Key: ${PRIVATE_KEY.substring(0, 10)}...${PRIVATE_KEY.substring(62)} (validated)`);
    
    return {
        PRIVATE_KEY,
        SOVEREIGN_WALLET,
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
        PORT: process.env.PORT || 10000
    };
}

// Global state
let bwaeziKernelAddress = null;
let kernelContract = null;
let provider = null;
let wallet = null;
let CONFIG = null;

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
// ENHANCED WALLET INITIALIZATION WITH VALIDATION
// =========================================================================
async function initializeWallet(provider, privateKey) {
    console.log("🔐 INITIALIZING WALLET WITH VALIDATION...");
    
    try {
        // Create wallet instance
        const wallet = new ethers.Wallet(privateKey, provider);
        
        // Test wallet functionality by getting address and balance
        const address = wallet.address;
        console.log(` • Wallet Address: ${address}`);
        
        // Verify balance can be retrieved (tests wallet functionality)
        const balance = await provider.getBalance(address);
        console.log(` • Wallet Balance: ${ethers.formatEther(balance)} ETH`);
        
        // Test signing capability (critical for deployments)
        const testMessage = "BWAEZI Kernel Verification";
        const signature = await wallet.signMessage(testMessage);
        
        if (!signature || signature.length !== 132) {
            throw new Error("Wallet signing test failed - invalid signature");
        }
        
        console.log("✅ WALLET INITIALIZED AND VALIDATED SUCCESSFULLY");
        console.log(` • Address: ${address}`);
        console.log(` • Balance: ${ethers.formatEther(balance)} ETH`);
        console.log(` • Signing: ✅ Functional`);
        
        return wallet;
    } catch (error) {
        console.error("❌ WALLET INITIALIZATION FAILED:", error.message);
        
        if (error.message.includes('invalid private key')) {
            throw new Error("INVALID PRIVATE KEY - Check your PRIVATE_KEY environment variable");
        } else if (error.message.includes('invalid length')) {
            throw new Error("PRIVATE_KEY length incorrect - must be 64 hex characters after 0x");
        } else {
            throw new Error(`Wallet initialization failed: ${error.message}`);
        }
    }
}

// =========================================================================
// BLOCKCHAIN INITIALIZATION
// =========================================================================
async function initializeBlockchain() {
    console.log("🚀 INITIALIZING BLOCKCHAIN (ROBUST MODE)...");
    
    try {
        // Validate environment first
        CONFIG = validateEnvironment();
        
        const providerManager = new RobustProvider(CONFIG.RPC_URLS);
        provider = await providerManager.initializeProvider();

        // Initialize wallet with enhanced validation
        wallet = await initializeWallet(provider, CONFIG.PRIVATE_KEY);

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

        return { provider, wallet, config: CONFIG };
    } catch (error) {
        console.error("❌ BLOCKCHAIN INIT FAILED:", error.message);
        
        // Provide specific guidance for common issues
        if (error.message.includes('PRIVATE_KEY')) {
            console.log("\n💡 SOLUTION: Set PRIVATE_KEY environment variable in Render dashboard");
            console.log("   Format: PRIVATE_KEY=0xYourActual64CharacterPrivateKey");
            console.log("   Make sure it starts with '0x' and has 64 hex characters");
        } else if (error.message.includes('invalid private key')) {
            console.log("\n💡 SOLUTION: Your PRIVATE_KEY is invalid");
            console.log("   • Check for typos or missing characters");
            console.log("   • Ensure it starts with '0x'");
            console.log("   • Must be exactly 64 hex characters after '0x'");
        }
        
        throw error;
    }
}

// =========================================================================
// ROBUST KERNEL DEPLOYMENT
// =========================================================================
async function deployBwaeziKernel() {
    try {
        console.log("🚀 STARTING BWAEZI KERNEL DEPLOYMENT...");
        
        if (!wallet) {
            throw new Error("Wallet not initialized - cannot deploy");
        }
        
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

    // Health check with enhanced wallet status
    app.get('/health', async (req, res) => {
        try {
            let blockchainStatus = { isConnected: false };
            let walletStatus = { initialized: false };
            
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
            
            if (wallet) {
                try {
                    const balance = await provider.getBalance(wallet.address);
                    walletStatus = {
                        initialized: true,
                        address: wallet.address,
                        balance: ethers.formatEther(balance),
                        hasFunds: parseFloat(ethers.formatEther(balance)) > 0.001
                    };
                } catch (error) {
                    walletStatus = {
                        initialized: true,
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
                wallet: walletStatus,
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

    // Wallet status endpoint for debugging
    app.get('/wallet-status', async (req, res) => {
        try {
            if (!wallet) {
                return res.status(400).json({ 
                    error: "Wallet not initialized",
                    solution: "Check PRIVATE_KEY environment variable" 
                });
            }
            
            const balance = await provider.getBalance(wallet.address);
            const network = await provider.getNetwork();
            
            res.json({
                address: wallet.address,
                balance: ethers.formatEther(balance),
                balanceWei: balance.toString(),
                network: network.name,
                chainId: network.chainId,
                status: 'connected',
                hasSufficientFunds: parseFloat(ethers.formatEther(balance)) > 0.006
            });
        } catch (error) {
            res.status(500).json({ 
                error: error.message,
                solution: "Check blockchain connection and private key" 
            });
        }
    });

    // Deploy endpoint
    app.post('/deploy', async (req, res) => {
        try {
            console.log('🚀 PRODUCTION TOKEN DEPLOYMENT REQUEST RECEIVED');
            
            // Verify wallet is ready
            if (!wallet) {
                return res.status(400).json({
                    success: false,
                    error: "Wallet not initialized - check PRIVATE_KEY environment variable",
                    solution: "Set PRIVATE_KEY=0xYourPrivateKey in Render environment variables"
                });
            }
            
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
                    gasSaved: true,
                    solution: deploymentResult.error.includes('private key') ? 
                        "Check PRIVATE_KEY environment variable" : "Check deployment parameters"
                });
            }
        } catch (error) {
            console.error('Deployment error:', error);
            res.status(500).json({
                success: false,
                error: error.message,
                gasSaved: true,
                solution: "Verify PRIVATE_KEY and blockchain connection"
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

    // Root endpoint
    app.get('/', (req, res) => {
        res.json({
            message: '🚀 BWAEZI SOVEREIGN KERNEL API - PRODUCTION GOD MODE v8.5',
            status: 'operational',
            endpoints: [
                'GET  /health - System status',
                'GET  /wallet-status - Wallet verification',
                'POST /deploy - Deploy BWAEZI Kernel',
                'GET  /token - Token information'
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
        
        // Initialize blockchain connection with enhanced validation
        const { provider: p, wallet: w, config } = await initializeBlockchain();
        provider = p;
        wallet = w;
        CONFIG = config;
        
        console.log("🔧 FINAL CONFIGURATION:");
        console.log(` • Network: ${CONFIG.NETWORK}`);
        console.log(` • Chain ID: ${CONFIG.CHAIN_ID}`);
        console.log(` • Port: ${CONFIG.PORT}`);
        console.log(` • Sovereign: ${CONFIG.SOVEREIGN_WALLET}`);
        console.log(` • Wallet: ${wallet.address}`);
        console.log(` • Balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);

        // Create and start Express server
        const app = createExpressServer();
        
        // ✅ CRITICAL FIX: Explicitly bind to 0.0.0.0 and PORT for Render
        const server = app.listen(CONFIG.PORT, '0.0.0.0', () => {
            console.log(`✅ BWAEZI KERNEL API RUNNING ON PORT ${CONFIG.PORT}`);
            console.log(` 🌐 Local: http://localhost:${CONFIG.PORT}`);
            console.log(` 🌐 Network: http://0.0.0.0:${CONFIG.PORT}`);
            console.log(" 🔥 READY FOR MAINNET DEPLOYMENT!");
            console.log(" 💡 Use POST /deploy to deploy the BWAEZI Kernel contract");
            console.log(" 💡 Use GET /wallet-status to verify wallet setup");
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
        
        // Specific error guidance
        if (error.message.includes('PRIVATE_KEY')) {
            console.log("\n🎯 IMMEDIATE SOLUTION REQUIRED:");
            console.log("1. Go to Render Dashboard → Your Service → Environment");
            console.log("2. Set PRIVATE_KEY=0xYourActualPrivateKey");
            console.log("3. Ensure it starts with '0x' and has 64 hex characters");
            console.log("4. Redeploy your service");
        }
        
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
