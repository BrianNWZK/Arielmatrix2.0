// arielsql_suite/main.js
import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';

// 🔥 BSFM INTEGRATION: Import the Sovereign Brain Orchestrator
import { ProductionSovereignCore, 
    EnhancedMainnetOrchestrator, 
    EnhancedRevenueEngine, 
    EnhancedBlockchainConnector, 
    LIVE_REVENUE_CONTRACTS } from './core/sovereign-brain.js';
import { BWAEZIKernelDeployer } from './bwaezi-kernel-contract.js';

// =========================================================================
// PRODUCTION CONFIGURATION - UPDATED FOR CONTRACT UPGRADE
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
    BWAEZI_KERNEL_ADDRESS: process.env.BWAEZI_KERNEL_ADDRESS || null,
    // USDC Contract for gas payments
    USDC_ADDRESS: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    UNISWAP_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"
};

// Global state variables
let bwaeziKernelAddress = CONFIG.BWAEZI_KERNEL_ADDRESS;
let provider = null;
let wallet = null;
let sovereignBrain = null;

// Updated KERNEL ABI with approve() function
const KERNEL_ABI_STUB = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function activateModule(bytes32 moduleId) external",
    "function AIExecutionRequested(string task, address requester) external",
    "function logArbitrage(address user, uint256 bwaeziAmount, uint256 ethEquivalent) external",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address owner) external view returns (uint256)"
];

// =========================================================================
// USDC TO ETH CONVERSION FOR GAS
// =========================================================================

class GasPaymentManager {
    constructor(wallet, provider) {
        this.wallet = wallet;
        this.provider = provider;
        this.usdcAddress = CONFIG.USDC_ADDRESS;
        this.uniswapRouter = CONFIG.UNISWAP_ROUTER;
    }

    // USDC ABI
    getUSDCABI() {
        return [
            "function balanceOf(address account) external view returns (uint256)",
            "function approve(address spender, uint256 amount) external returns (bool)",
            "function transfer(address to, uint256 amount) external returns (bool)"
        ];
    }

    // Uniswap V2 Router ABI
    getUniswapABI() {
        return [
            "function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)"
        ];
    }

    async getUSDCBalance() {
        try {
            const usdcContract = new ethers.Contract(this.usdcAddress, this.getUSDCABI(), this.wallet);
            const balance = await usdcContract.balanceOf(this.wallet.address);
            return ethers.formatUnits(balance, 6); // USDC has 6 decimals
        } catch (error) {
            console.error("Error getting USDC balance:", error.message);
            return "0";
        }
    }

    async swapUSDCForETH(usdcAmount) {
        try {
            console.log(`💱 Converting ${usdcAmount} USDC to ETH for gas...`);
            
            const usdcContract = new ethers.Contract(this.usdcAddress, this.getUSDCABI(), this.wallet);
            const uniswapRouter = new ethers.Contract(this.uniswapRouter, this.getUniswapABI(), this.wallet);
            
            // Convert USDC amount to wei (6 decimals)
            const usdcAmountWei = ethers.parseUnits(usdcAmount, 6);
            
            // Check balance
            const usdcBalance = await usdcContract.balanceOf(this.wallet.address);
            if (usdcBalance < usdcAmountWei) {
                throw new Error(`Insufficient USDC. Need ${usdcAmount} USDC, have ${ethers.formatUnits(usdcBalance, 6)} USDC`);
            }

            // Approve Uniswap to spend USDC
            console.log("🔐 Approving USDC for swap...");
            const approveTx = await usdcContract.approve(this.uniswapRouter, usdcAmountWei);
            await approveTx.wait();

            // Set up swap parameters
            const path = [this.usdcAddress, "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"]; // USDC -> WETH
            const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes
            const amountOutMin = 0; // Accept any amount for simplicity

            console.log("🔄 Executing USDC to ETH swap...");
            const swapTx = await uniswapRouter.swapExactTokensForETH(
                usdcAmountWei,
                amountOutMin,
                path,
                this.wallet.address,
                deadline
            );

            const receipt = await swapTx.wait();
            console.log(`✅ Successfully swapped ${usdcAmount} USDC for ETH`);
            
            return {
                success: true,
                transactionHash: receipt.hash,
                usdcAmount: usdcAmount
            };
        } catch (error) {
            console.error("❌ USDC to ETH swap failed:", error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async ensureGasBalance(minETH = "0.01") {
        const currentBalance = await this.provider.getBalance(this.wallet.address);
        const minBalanceWei = ethers.parseEther(minETH);
        
        if (currentBalance < minBalanceWei) {
            console.log(`⚠️ Low ETH balance: ${ethers.formatEther(currentBalance)} ETH`);
            
            const usdcBalance = await this.getUSDCBalance();
            if (parseFloat(usdcBalance) > 1) { // If we have at least 1 USDC
                const swapAmount = Math.min(parseFloat(usdcBalance), 5).toString(); // Swap up to 5 USDC
                return await this.swapUSDCForETH(swapAmount);
            } else {
                throw new Error(`Insufficient funds. Need ${minETH} ETH, have ${ethers.formatEther(currentBalance)} ETH and ${usdcBalance} USDC`);
            }
        }
        
        return { success: true, balance: ethers.formatEther(currentBalance) };
    }
}

// =========================================================================
// MAIN DEPLOYMENT & UPGRADE EXECUTION 
// =========================================================================
async function executeContractUpgrade() {
    console.log("🚀 STARTING BWAEZI CONTRACT UPGRADE WITH APPROVE() FUNCTION");
    try {
        await initializeBlockchain();
        
        // Initialize Gas Payment Manager
        const gasManager = new GasPaymentManager(wallet, provider);
        
        // Ensure we have enough ETH for deployment
        console.log("💰 CHECKING GAS BALANCE...");
        const gasCheck = await gasManager.ensureGasBalance("0.02"); // Need at least 0.02 ETH
        if (!gasCheck.success) {
            throw new Error(`Gas balance check failed: ${gasCheck.error}`);
        }

        // Check USDC balance
        const usdcBalance = await gasManager.getUSDCBalance();
        console.log(`💵 Current USDC Balance: ${usdcBalance} USDC`);

        // --- CONTRACT UPGRADE DEPLOYMENT ---
        console.log("🛠️ DEPLOYING UPDATED BWAEZI CONTRACT WITH APPROVE() FUNCTION...");
        const kernelDeployer = new BWAEZIKernelDeployer(wallet, provider, CONFIG);
        await kernelDeployer.compileAndPrepare(); 
        const deploymentResult = await kernelDeployer.deploy();
        
        if (deploymentResult.success) {
            bwaeziKernelAddress = deploymentResult.address;
            console.log(`\n🎉 UPGRADE SUCCESS! New Contract: ${deploymentResult.address}`);
            console.log(`✅ DEPLOYMENT COST: ${deploymentResult.deploymentCost} ETH`);
            console.log(`🔑 NEW FEATURES: approve(), transferFrom(), allowance mapping`);
            
            // Update environment with new contract address
            process.env.BWAEZI_KERNEL_ADDRESS = deploymentResult.address;
            
        } else {
            console.error(`\n❌ UPGRADE FAILED: ${deploymentResult.error}`);
            throw new Error("Contract upgrade failed");
        }
        
        // --- CONTINUE WITH BSFM LAUNCH ---
        console.log("\n🧠 LAUNCHING BSFM SOVEREIGN BRAIN WITH UPGRADED CONTRACT...");
        
        const modulePaths = discoverSovereignModules();
        const serviceMap = discoverFutureProofServices();
        
        sovereignBrain = new SovereignBrain(
            bwaeziKernelAddress,
            KERNEL_ABI_STUB,
            provider.connection.url
        );
        
        const launchSuccess = await sovereignBrain.initialize(CONFIG.PRIVATE_KEY, {
            modulePaths: modulePaths,
            serviceMap: serviceMap
        });

        if (launchSuccess) {
            console.log("🔥 BSFM GOD MODE ACTIVE WITH UPGRADED CONTRACT!");
        } else {
            throw new Error("BSFM failed to initialize with upgraded contract");
        }

        // Start Express Server
        const app = express();
        app.use(cors());
        app.use(express.json());
        
        app.get('/health', (req, res) => res.json({ 
            status: 'operational', 
            version: 'v17.0-BSFM-UPGRADED', 
            contract_upgraded: true,
            new_contract: bwaeziKernelAddress,
            features: ['approve()', 'transferFrom()', 'allowance mapping'],
            god_mode_active: sovereignBrain.isGodModeActive
        }));
        
        const port = CONFIG.PORT;
        const host = '0.0.0.0'; 
        app.listen(port, host, () => {
            console.log("=".repeat(60));
            console.log(` 🌐 Server: Listening on ${host}:${port}`);
            console.log(` 🔗 New Contract: ${bwaeziKernelAddress}`);
            console.log(` ✅ Approve Function: NOW AVAILABLE`);
            console.log("=".repeat(60));
        });

        return { success: true, newContract: bwaeziKernelAddress };
    } catch (error) {
        console.error("💥 UPGRADE FAILURE:", error);
        if (sovereignBrain) await sovereignBrain.stop();
        return { success: false, error: error.message };
    }
}

// =========================================================================
// STARTUP EXECUTION
// =========================================================================
if (import.meta.url === `file://${process.argv[1]}`) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║          BWAEZI CONTRACT UPGRADE - ADDING APPROVE()          ║
║    🔥 NOW WITH ERC-20 COMPLIANCE & DEX INTEGRATION 🔥       ║
╚══════════════════════════════════════════════════════════════╝
`);
    executeContractUpgrade().catch(error => {
        console.error("Upgrade failed:", error);
        process.exit(1);
    });
}

// ... [Keep the existing discoverSovereignModules, discoverFutureProofServices, 
// RobustProvider, and initializeBlockchain functions from your original code] ...
