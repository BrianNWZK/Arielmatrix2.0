/**
 * 🚀 BWAEZI QUANTUM ENTERPRISE LAUNCH - PRODUCTION GOD MODE v8.6
 * FINAL DEPLOYMENT - RENDER PORT BINDING FIXED
 * REAL LIVE MAINNET DEPLOYMENT READY
 */

import { ethers } from 'ethers';
import express from 'express';
import cors from 'cors';

// Import BWAEZI Kernel Contract
import { BWAEZI_KERNEL_ABI, BWAEZI_KERNEL_BYTECODE, BWAEZIKernelDeployer } from './bwaezi-kernel-contract.js';

// =========================================================================
// PRODUCTION CONFIGURATION
// =========================================================================
const CONFIG = {
    SOVEREIGN_WALLET: "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA",
    TOKEN_NAME: "BWAEZI",
    TOKEN_SYMBOL: "bwzC", 
    TOTAL_SUPPLY: "100000000",
    DEPLOYMENT_GAS_LIMIT: "2500000",
    NETWORK: "mainnet",
    CHAIN_ID: 1,
    RPC_URLS: [
        "https://eth.llamarpc.com",
        "https://cloudflare-eth.com",
        "https://ethereum.publicnode.com",
        "https://1rpc.io/eth"
    ],
    PORT: process.env.PORT || 10000,
    PRIVATE_KEY: process.env.PRIVATE_KEY
};

// Global state
let bwaeziKernelAddress = null;
let kernelContract = null;
let provider = null;
let wallet = null;
let kernelDeployer = null;
let activeRpcUrl = null;

// =========================================================================
// ROBUST RPC PROVIDER
// =========================================================================
class RobustEthereumProvider {
    constructor(rpcUrls) {
        this.rpcUrls = rpcUrls;
        this.currentIndex = 0;
    }

    async initializeProvider() {
        console.log("🌐 INITIALIZING ETHEREUM PROVIDER...");
        
        for (let i = 0; i < this.rpcUrls.length; i++) {
            const rpcUrl = this.rpcUrls[this.currentIndex];
            console.log(`   🔄 Attempting RPC: ${rpcUrl}`);
            
            try {
                const provider = new ethers.JsonRpcProvider(rpcUrl);
                const network = await provider.getNetwork();
                const blockNumber = await provider.getBlockNumber();
                
                console.log(`   ✅ RPC SUCCESS: ${rpcUrl}`);
                console.log(`      • Network: ${network.name} (Chain ID: ${network.chainId})`);
                console.log(`      • Latest Block: ${blockNumber}`);
                
                activeRpcUrl = rpcUrl;
                return provider;
                
            } catch (error) {
                console.log(`   ❌ RPC FAILED: ${rpcUrl}`);
                this.currentIndex = (this.currentIndex + 1) % this.rpcUrls.length;
                if (i === this.rpcUrls.length - 1) throw error;
                await this.delay(1000);
            }
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// =========================================================================
// SIMPLE PORT BINDING FOR RENDER
// =========================================================================
function startServer(app, port) {
    return new Promise((resolve, reject) => {
        const server = app.listen(port, '0.0.0.0', () => {
            console.log(`✅ SERVER RUNNING ON PORT ${port}`);
            console.log(`   🌐 Health: http://0.0.0.0:${port}/health`);
            resolve(server);
        });

        server.on('error', (error) => {
            console.error(`❌ SERVER ERROR: ${error.message}`);
            reject(error);
        });
    });
}

// =========================================================================
// BLOCKCHAIN INITIALIZATION
// =========================================================================
async function initializeBlockchainInfrastructure() {
    console.log("🚀 INITIALIZING BLOCKCHAIN...");
    
    try {
        if (!CONFIG.PRIVATE_KEY) {
            throw new Error("PRIVATE_KEY environment variable is required");
        }

        const robustProvider = new RobustEthereumProvider(CONFIG.RPC_URLS);
        provider = await robustProvider.initializeProvider();
        wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
        
        const network = await provider.getNetwork();
        const balance = await provider.getBalance(wallet.address);
        
        console.log("✅ BLOCKCHAIN INITIALIZED");
        console.log(`   👑 SOVEREIGN WALLET: ${CONFIG.SOVEREIGN_WALLET}`);
        console.log(`   🔗 Active RPC: ${activeRpcUrl}`);
        console.log(`   💰 Balance: ${ethers.formatEther(balance)} ETH`);
        
        return { provider, wallet };
        
    } catch (error) {
        console.error("❌ BLOCKCHAIN INITIALIZATION FAILED:", error.message);
        throw error;
    }
}

// =========================================================================
// KERNEL DEPLOYMENT
// =========================================================================
async function deployBwaeziKernel() {
    console.log("🔥 DEPLOYING BWAEZI KERNEL...");
    
    try {
        kernelDeployer = new BWAEZIKernelDeployer(wallet, provider, CONFIG);
        const deploymentResult = await kernelDeployer.deploy();
        
        if (deploymentResult.success) {
            bwaeziKernelAddress = deploymentResult.address;
            kernelContract = deploymentResult.contract;
            
            console.log("🎉 BWAEZI KERNEL DEPLOYED!");
            console.log(`   📍 Contract: ${bwaeziKernelAddress}`);
            console.log(`   💸 Cost: ${ethers.formatEther(deploymentResult.deploymentCost)} ETH`);
            console.log(`   📈 Remaining: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH`);
            
            // Transfer tokens to sovereign wallet
            console.log("🔄 TRANSFERRING TOKENS...");
            const transferResult = await kernelDeployer.transferToSovereignWallet();
            if (transferResult.success) {
                console.log(`   ✅ ${transferResult.amount} BWAEZI SENT TO SOVEREIGN WALLET`);
            }
            
            return deploymentResult;
        } else {
            throw new Error(`Deployment failed: ${deploymentResult.error}`);
        }
        
    } catch (error) {
        console.error("❌ DEPLOYMENT FAILED:", error.message);
        throw error;
    }
}

// =========================================================================
// EXPRESS SERVER
// =========================================================================
function createSovereignServer() {
    const app = express();
    
    app.use(cors());
    app.use(express.json());
    
    // Health endpoint
    app.get('/health', (req, res) => {
        res.json({
            status: 'OPERATIONAL',
            service: 'BWAEZI_SOVEREIGN_KERNEL',
            version: '8.6',
            network: CONFIG.NETWORK,
            kernelDeployed: !!bwaeziKernelAddress,
            kernelAddress: bwaeziKernelAddress,
            sovereign: CONFIG.SOVEREIGN_WALLET,
            timestamp: new Date().toISOString()
        });
    });
    
    // Status endpoint
    app.get('/status', async (req, res) => {
        try {
            let tokenInfo = null;
            if (kernelContract) {
                try {
                    const name = await kernelContract.name();
                    const symbol = await kernelContract.symbol();
                    const totalSupply = await kernelContract.totalSupply();
                    const sovereignBalance = await kernelContract.balanceOf(CONFIG.SOVEREIGN_WALLET);
                    
                    tokenInfo = {
                        name, symbol,
                        totalSupply: ethers.formatUnits(totalSupply, 18),
                        sovereignBalance: ethers.formatUnits(sovereignBalance, 18),
                        address: bwaeziKernelAddress
                    };
                } catch (error) {
                    console.error("Error fetching token info:", error.message);
                }
            }
            
            res.json({
                deployed: !!bwaeziKernelAddress,
                address: bwaeziKernelAddress,
                sovereign: CONFIG.SOVEREIGN_WALLET,
                network: CONFIG.NETWORK,
                token: tokenInfo,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Deploy endpoint
    app.post('/deploy', async (req, res) => {
        try {
            if (bwaeziKernelAddress) {
                return res.status(400).json({ error: 'Already deployed', address: bwaeziKernelAddress });
            }
            
            const result = await deployBwaeziKernel();
            if (result.success) {
                const sovereignBalance = await kernelContract.balanceOf(CONFIG.SOVEREIGN_WALLET);
                
                res.json({
                    success: true,
                    message: 'BWAEZI Kernel deployed',
                    address: result.address,
                    transactionHash: result.transactionHash,
                    deploymentCost: result.deploymentCost,
                    sovereign: {
                        wallet: CONFIG.SOVEREIGN_WALLET,
                        balance: ethers.formatUnits(sovereignBalance, 18)
                    }
                });
            } else {
                res.status(500).json({ success: false, error: result.error });
            }
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
    
    // AI Execution
    app.post('/ai/execute', async (req, res) => {
        try {
            const { task } = req.body;
            if (!kernelContract) return res.status(400).json({ error: 'Contract not deployed' });
            
            const result = await kernelDeployer.executeSovereignFunction('requestAIExecution', task);
            res.json({ ...result, message: `AI execution: ${task}` });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    // Revenue endpoint
    app.get('/revenue', async (req, res) => {
        try {
            let tokenBalance = "0";
            if (kernelContract) {
                try {
                    const balance = await kernelContract.balanceOf(CONFIG.SOVEREIGN_WALLET);
                    tokenBalance = balance.toString();
                } catch (error) {
                    console.error("Error fetching balance:", error.message);
                }
            }
            
            res.json({
                revenue_status: 'ACTIVE',
                target: '$1,200,000',
                recipient: CONFIG.SOVEREIGN_WALLET,
                balances: {
                    bwaezi: tokenBalance,
                    usdt_value: (parseInt(tokenBalance) / 100).toString()
                },
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    
    return app;
}

// =========================================================================
// MAIN DEPLOYMENT EXECUTION
// =========================================================================
async function executeProductionDeployment() {
    console.log("🚀 STARTING BWAEZI SOVEREIGN KERNEL DEPLOYMENT");
    console.log("   👑 SOVEREIGN WALLET:", CONFIG.SOVEREIGN_WALLET);
    console.log("   🔗 Network: Ethereum Mainnet");
    console.log("   💰 Budget: 0.0072 ETH");
    
    try {
        // Initialize blockchain
        await initializeBlockchainInfrastructure();
        
        // Deploy contract
        const deploymentResult = await deployBwaeziKernel();
        if (!deploymentResult.success) throw new Error("Deployment failed");
        
        // Start server
        const app = createSovereignServer();
        await startServer(app, CONFIG.PORT);
        
        console.log("\n" + "=".repeat(60));
        console.log("🎉 BWAEZI SOVEREIGN INFRASTRUCTURE OPERATIONAL!");
        console.log("=".repeat(60));
        console.log(`   📍 Contract: ${bwaeziKernelAddress}`);
        console.log(`   👑 Sovereign: ${CONFIG.SOVEREIGN_WALLET}`);
        console.log(`   🌐 Server: Port ${CONFIG.PORT}`);
        console.log(`   💸 Cost: ${ethers.formatEther(deploymentResult.deploymentCost)} ETH`);
        console.log(`   🔗 Health: http://0.0.0.0:${CONFIG.PORT}/health`);
        console.log("=".repeat(60));
        
        return {
            success: true,
            kernelAddress: bwaeziKernelAddress,
            serverPort: CONFIG.PORT,
            deploymentCost: deploymentResult.deploymentCost,
            sovereign: CONFIG.SOVEREIGN_WALLET
        };
        
    } catch (error) {
        console.error("💥 DEPLOYMENT FAILED:", error.message);
        return { success: false, error: error.message };
    }
}

// =========================================================================
// STARTUP
// =========================================================================
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log(`
    ╔══════════════════════════════════════════════════╗
    ║           BWAEZI SOVEREIGN KERNEL v8.6          ║
    ║              PRODUCTION GOD MODE                ║
    ║           RENDER DEPLOYMENT READY               ║
    ╚══════════════════════════════════════════════════╝
    `);
    
    executeProductionDeployment().then(result => {
        if (result.success) {
            console.log(`
    ✅ DEPLOYMENT SUCCESSFUL!
    📍 ${result.kernelAddress}
    👑 ${result.sovereign}
    🌐 Port ${result.serverPort}
    💸 ${ethers.formatEther(result.deploymentCost)} ETH
            `);
        } else {
            console.log(`
    ❌ DEPLOYMENT FAILED: ${result.error}
            `);
            process.exit(1);
        }
    }).catch(error => {
        console.error("💥 UNEXPECTED ERROR:", error);
        process.exit(1);
    });
}

export {
    executeProductionDeployment,
    BWAEZI_KERNEL_ABI,
    BWAEZI_KERNEL_BYTECODE,
    CONFIG
};
