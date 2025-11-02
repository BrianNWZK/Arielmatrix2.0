/**
 * 🚀 BWAEZI QUANTUM ENTERPRISE LAUNCH - PRODUCTION GOD MODE v8.7
 * ULTRA GAS OPTIMIZED - RENDER PORT BINDING FIXED
 * REAL LIVE MAINNET DEPLOYMENT READY
 */

import { ethers } from 'ethers';
import express from 'express';
import cors from 'cors';

// Import BWAEZI Kernel Contract
import { BWAEZI_KERNEL_ABI, BWAEZI_KERNEL_BYTECODE, BWAEZIKernelDeployer } from './bwaezi-kernel-contract.js';

// =========================================================================
// PRODUCTION CONFIGURATION - GAS OPTIMIZED
// =========================================================================
const CONFIG = {
    SOVEREIGN_WALLET: "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA",
    TOKEN_NAME: "BWAEZI",
    TOKEN_SYMBOL: "bwzC", 
    TOTAL_SUPPLY: "100000000",
    DEPLOYMENT_GAS_LIMIT: "2000000", // REDUCED FOR GAS SAVINGS
    NETWORK: "mainnet",
    CHAIN_ID: 1,
    RPC_URLS: [
        "https://eth.llamarpc.com",
        "https://cloudflare-eth.com", 
        "https://ethereum.publicnode.com"
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

// =========================================================================
// GAS OPTIMIZED PROVIDER
// =========================================================================
class GasOptimizedProvider {
    constructor(rpcUrls) {
        this.rpcUrls = rpcUrls;
    }

    async initializeProvider() {
        console.log("🌐 INITIALIZING GAS-OPTIMIZED PROVIDER...");
        
        for (const rpcUrl of this.rpcUrls) {
            try {
                console.log(`   🔄 Testing: ${rpcUrl}`);
                const provider = new ethers.JsonRpcProvider(rpcUrl);
                const network = await provider.getNetwork();
                const blockNumber = await provider.getBlockNumber();
                
                console.log(`   ✅ CONNECTED: ${rpcUrl}`);
                console.log(`      • Block: ${blockNumber} | Chain: ${network.chainId}`);
                return provider;
                
            } catch (error) {
                console.log(`   ❌ Failed: ${rpcUrl}`);
            }
        }
        throw new Error("All RPCs failed");
    }
}

// =========================================================================
// RENDER-COMPATIBLE SERVER STARTER
// =========================================================================
function startRenderServer(app, port) {
    return new Promise((resolve) => {
        const server = app.listen(port, '0.0.0.0', () => {
            console.log(`✅ RENDER SERVER RUNNING: 0.0.0.0:${port}`);
            console.log(`   🌐 Health: http://0.0.0.0:${port}/health`);
            resolve(server);
        });
    });
}

// =========================================================================
// GAS-EFFICIENT BLOCKCHAIN INIT
// =========================================================================
async function initializeBlockchain() {
    console.log("🚀 INITIALIZING BLOCKCHAIN (GAS OPTIMIZED)...");
    
    if (!CONFIG.PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY required");
    }

    const gasProvider = new GasOptimizedProvider(CONFIG.RPC_URLS);
    provider = await gasProvider.initializeProvider();
    wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    
    const balance = await provider.getBalance(wallet.address);
    console.log(`   💰 Balance: ${ethers.formatEther(balance)} ETH`);
    
    return { provider, wallet };
}

// =========================================================================
// ULTRA GAS-EFFICIENT DEPLOYMENT
// =========================================================================
async function deployWithGasProtection() {
    console.log("🔥 DEPLOYING WITH GAS PROTECTION...");
    
    const gasPrice = await provider.getFeeData();
    console.log(`   ⛽ Gas Price: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei`);
    
    // GAS PRICE PROTECTION - DON'T DEPLOY IF TOO HIGH
    if (gasPrice.gasPrice > ethers.parseUnits("50", "gwei")) {
        throw new Error(`Gas price too high: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei. Wait for lower fees.`);
    }

    kernelDeployer = new BWAEZIKernelDeployer(wallet, provider, CONFIG);
    const result = await kernelDeployer.deploy();
    
    if (!result.success) throw new Error(result.error);
    
    bwaeziKernelAddress = result.address;
    kernelContract = result.contract;
    
    console.log(`🎉 DEPLOYED: ${bwaeziKernelAddress}`);
    console.log(`   💸 Cost: ${ethers.formatEther(result.deploymentCost)} ETH`);
    
    return result;
}

// =========================================================================
// EXPRESS SERVER - ALL ORIGINAL ENDPOINTS
// =========================================================================
function createSovereignServer() {
    const app = express();
    app.use(cors());
    app.use(express.json());

    // =========================================================================
    // ORIGINAL ENDPOINTS - MAINTAINED
    // =========================================================================
    
    // Health (Original)
    app.get('/health', (req, res) => {
        res.json({
            status: 'OPERATIONAL',
            service: 'BWAEZI_SOVEREIGN_KERNEL',
            version: '8.7',
            network: CONFIG.NETWORK,
            kernelDeployed: !!bwaeziKernelAddress,
            kernelAddress: bwaeziKernelAddress,
            sovereign: CONFIG.SOVEREIGN_WALLET,
            timestamp: new Date().toISOString()
        });
    });

    // Status (Original)
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
                        name: name,
                        symbol: symbol,
                        totalSupply: totalSupply.toString(),
                        founderBalance: sovereignBalance.toString(),
                        address: bwaeziKernelAddress
                    };
                } catch (error) {
                    console.error("Error fetching token info:", error.message);
                }
            }
            
            res.json({
                status: 'operational',
                network: CONFIG.NETWORK,
                port: CONFIG.PORT,
                ecosystem: 'bwaezi_enterprise',
                wallet: {
                    address: wallet?.address || 'not_initialized',
                    network: CONFIG.NETWORK
                },
                token: tokenInfo,
                godMode: true,
                production: true,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    // Deploy (Original)
    app.post('/deploy', async (req, res) => {
        try {
            if (bwaeziKernelAddress) {
                return res.status(400).json({
                    error: 'Kernel already deployed',
                    address: bwaeziKernelAddress
                });
            }
            
            const result = await deployWithGasProtection();
            
            if (result.success) {
                res.json({
                    success: true,
                    message: 'BWAEZI Kernel deployed successfully',
                    address: result.address,
                    transactionHash: result.transactionHash,
                    deploymentCost: result.deploymentCost,
                    network: CONFIG.NETWORK,
                    sovereign: {
                        wallet: CONFIG.SOVEREIGN_WALLET,
                        balance: ethers.formatUnits(await kernelContract.balanceOf(CONFIG.SOVEREIGN_WALLET), 18)
                    }
                });
            } else {
                res.status(500).json({
                    success: false,
                    error: result.error
                });
            }
        } catch (error) {
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });

    // AI Execution (Original)
    app.post('/ai/execute', async (req, res) => {
        try {
            const { task } = req.body;
            
            if (!kernelContract) {
                return res.status(400).json({
                    error: 'Kernel contract not deployed'
                });
            }
            
            const result = await kernelDeployer.executeSovereignFunction('requestAIExecution', task);
            
            res.json({
                ...result,
                message: `AI execution requested: ${task}`
            });
            
        } catch (error) {
            res.status(500).json({
                error: error.message
            });
        }
    });

    // Revenue (Original)
    app.get('/revenue', async (req, res) => {
        try {
            let tokenBalance = "0";
            
            if (bwaeziKernelAddress && kernelContract) {
                try {
                    const balance = await kernelContract.balanceOf(CONFIG.SOVEREIGN_WALLET);
                    tokenBalance = balance.toString();
                } catch (error) {
                    console.error("Error fetching token balance:", error.message);
                }
            }
            
            res.json({
                revenue_status: 'MONITORING_ACTIVE',
                target: '$1,200,000',
                timeframe: '24_hours',
                recipient: CONFIG.SOVEREIGN_WALLET,
                current_balances: {
                    bwaezi: tokenBalance,
                    usdt_value: (parseInt(tokenBalance) / 100).toString()
                },
                godMode: true,
                production: true,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    // System (Original)
    app.get('/system', async (req, res) => {
        try {
            res.json({
                system: 'BWAEZI ENTERPRISE - PRODUCTION GOD MODE',
                status: 'ACTIVE',
                network: CONFIG.NETWORK,
                port: CONFIG.PORT,
                token: {
                    deployed: !!bwaeziKernelAddress,
                    address: bwaeziKernelAddress,
                    name: CONFIG.TOKEN_NAME,
                    symbol: CONFIG.TOKEN_SYMBOL
                },
                revenue: {
                    target: '$1,200,000',
                    timeframe: '24_hours',
                    active: true
                },
                timestamp: new Date().toISOString(),
                godMode: true
            });
        } catch (error) {
            res.status(500).json({
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }
    });

    // NEW: Gas Optimization Endpoint
    app.get('/gas/optimize', async (req, res) => {
        try {
            const gasData = await provider.getFeeData();
            const balance = await provider.getBalance(wallet.address);
            
            res.json({
                current_gas: ethers.formatUnits(gasData.gasPrice, 'gwei') + ' gwei',
                max_recommended: '50 gwei',
                wallet_balance: ethers.formatEther(balance) + ' ETH',
                optimization: gasData.gasPrice <= ethers.parseUnits("50", "gwei") ? 'OPTIMAL' : 'WAIT',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });

    return app;
}

// =========================================================================
// MAIN DEPLOYMENT - GAS PROTECTED
// =========================================================================
async function executeGasOptimizedDeployment() {
    console.log(`
    ╔══════════════════════════════════════════════════╗
    ║           BWAEZI SOVEREIGN KERNEL v8.7          ║
    ║           GAS OPTIMIZED DEPLOYMENT              ║
    ║           RENDER PORT BINDING FIXED             ║
    ╚══════════════════════════════════════════════════╝
    `);
    
    console.log("🚀 STARTING GAS-OPTIMIZED DEPLOYMENT");
    console.log("   👑 Sovereign:", CONFIG.SOVEREIGN_WALLET);
    console.log("   💰 Gas Protection: ACTIVE");
    console.log("   🌐 Render Ready: 0.0.0.0 binding");
    
    try {
        // 1. Initialize blockchain with gas check
        await initializeBlockchain();
        
        // 2. Deploy with gas protection
        const deployment = await deployWithGasProtection();
        if (!deployment.success) throw new Error("Deployment failed");
        
        // 3. Start Render-compatible server
        const app = createSovereignServer();
        await startRenderServer(app, CONFIG.PORT);
        
        console.log("\n" + "=".repeat(60));
        console.log("🎉 GAS-OPTIMIZED DEPLOYMENT SUCCESS!");
        console.log("=".repeat(60));
        console.log(`   📍 ${bwaeziKernelAddress}`);
        console.log(`   👑 ${CONFIG.SOVEREIGN_WALLET}`);
        console.log(`   💸 ${ethers.formatEther(deployment.deploymentCost)} ETH`);
        console.log(`   🌐 http://0.0.0.0:${CONFIG.PORT}/health`);
        console.log("=".repeat(60));
        
        return {
            success: true,
            kernelAddress: bwaeziKernelAddress,
            deploymentCost: deployment.deploymentCost,
            sovereign: CONFIG.SOVEREIGN_WALLET
        };
        
    } catch (error) {
        console.error("💥 DEPLOYMENT FAILED:", error.message);
        
        // GAS-SAVING: Don't waste more gas if deployment fails
        if (error.message.includes("Gas price too high")) {
            console.log("   💡 GAS SAVING: Waiting for lower fees protects your ETH");
        }
        
        return { success: false, error: error.message };
    }
}

// =========================================================================
// STARTUP EXECUTION
// =========================================================================
if (import.meta.url === `file://${process.argv[1]}`) {
    executeGasOptimizedDeployment().then(result => {
        if (result.success) {
            console.log(`
    ✅ DEPLOYMENT SUCCESSFUL - GAS OPTIMIZED!
    📍 ${result.kernelAddress}
    👑 ${result.sovereign}
    💸 ${ethers.formatEther(result.deploymentCost)} ETH
            `);
        } else {
            console.log(`
    ❌ DEPLOYMENT STOPPED: ${result.error}
    💡 Gas savings protected your remaining ETH
            `);
            process.exit(1);
        }
    }).catch(error => {
        console.error("💥 CRITICAL ERROR:", error);
        process.exit(1);
    });
}

export {
    executeGasOptimizedDeployment,
    BWAEZI_KERNEL_ABI, 
    BWAEZI_KERNEL_BYTECODE,
    CONFIG
};
