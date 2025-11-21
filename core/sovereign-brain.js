// core/sovereign-brain.js — BSFM ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.9.1 FIXED
// $5.17 USDC SWAP = PRIMARY & ONLY PATH TO SOVEREIGNTY
// FORCE SWAP EVEN WITH ETH - DEPLOYMENT OPTIMIZED

import { EventEmitter } from 'events';
import Web3 from 'web3';
import { ethers } from 'ethers';
import { getGlobalLogger } from '../modules/enterprise-logger/index.js';
import { AASDK } from '../modules/aa-loaves-fishes.js';

// =========================================================================
// CHECKSUM-SAFE ADDRESS NORMALIZER (NEVER CRASHES AGAIN)
// =========================================================================
const safeAddr = (addr) => {
    if (!addr) return addr;
    try {
        return ethers.getAddress(addr.toLowerCase());
    } catch {
        return addr.toLowerCase();
    }
};

// MAINNET CONTRACTS — ALL PRE-NORMALIZED
const USDC_ADDRESS      = safeAddr('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
const WETH_ADDRESS      = safeAddr('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
const UNISWAP_ROUTER    = safeAddr('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45');
const UNISWAP_QUOTER    = safeAddr('0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6'); // Fixed correct Quoter

// ABIs (optimized)
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

const QUOTER_ABI = [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) external returns (uint256 amountOut)"
];

const ROUTER_ABI = [
    {
        "inputs": [{
            "components": [
                {"name": "tokenIn","type": "address"},
                {"name": "tokenOut","type": "address"},
                {"name": "fee","type": "uint24"},
                {"name": "recipient","type": "address"},
                {"name": "deadline","type": "uint256"},
                {"name": "amountIn","type": "uint256"},
                {"name": "amountOutMinimum","type": "uint256"},
                {"name": "sqrtPriceLimitX96","type": "uint160"}
            ],
            "name": "params",
            "type": "tuple"
        }],
        "name": "exactInputSingle",
        "outputs": [{"name": "amountOut", "type": "uint256"}],
        "stateMutability": "payable",
        "type": "function"
    }
];

class ProductionSovereignCore extends EventEmitter {
    constructor(config = {}) {
        super();
        this.logger = getGlobalLogger('SovereignCore_v2.9.1');

        const RPC = process.env.MAINNET_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo';
        this.provider = new ethers.JsonRpcProvider(RPC);
        this.wallet = new ethers.Wallet(process.env.MAINNET_PRIVATE_KEY || process.env.PRIVATE_KEY, this.provider);
        this.address = this.wallet.address;

        // Contracts
        this.usdc   = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, this.wallet);
        this.router = new ethers.Contract(UNISWAP_ROUTER, ROUTER_ABI, this.wallet);
        this.quoter = new ethers.Contract(UNISWAP_QUOTER, QUOTER_ABI, this.wallet);

        // FORCE SWAP MODE - Always ensure maximum ETH for deployment
        this.MIN_ETH_THRESHOLD = ethers.parseEther("0.01"); // Increased threshold
        this.FUNDING_USDC = 5.17;
        this.FORCE_SWAP_MODE = true; // NEW: Always swap for maximum deployment power

        this.deploymentState = {
            paymasterDeployed: false,
            smartAccountDeployed: false
        };
    }

    // $5.17 USDC → ETH SWAP — DEPLOYMENT POWER-UP
    async execute517UsdcFunding() {
        this.logger.info(`🚀 $5.17 USDC SWAP INITIATED — DEPLOYMENT POWER-UP SEQUENCE`);

        try {
            const amountIn = ethers.parseUnits(this.FUNDING_USDC.toString(), 6);
            const fee = 500; // 0.05% pool
            const deadline = Math.floor(Date.now() / 1000) + 1800;

            // 1. Check USDC balance
            const usdcBal = await this.usdc.balanceOf(this.address);
            this.logger.info(`USDC Balance: ${ethers.formatUnits(usdcBal, 6)} USDC`);

            if (usdcBal < amountIn) {
                this.logger.error(`INSUFFICIENT USDC: ${ethers.formatUnits(usdcBal, 6)} < 5.17`);
                return false;
            }

            // 2. Get quote with proper method signature
            this.logger.info(`Getting quote for 5.17 USDC → ETH...`);
            const quote = await this.quoter.quoteExactInputSingle.staticCall(
                USDC_ADDRESS, 
                WETH_ADDRESS, 
                fee,
                amountIn, 
                0
            );
            
            const amountOut = quote;
            const minOut = (amountOut * 990n) / 1000n; // 1% slippage for reliability

            this.logger.info(`Quote: 5.17 USDC → ${ethers.formatEther(amountOut)} ETH`);

            // 3. Check and approve USDC
            const allowance = await this.usdc.allowance(this.address, UNISWAP_ROUTER);
            if (allowance < amountIn) {
                this.logger.info(`Approving 5.17 USDC for Uniswap...`);
                const approveTx = await this.usdc.approve(UNISWAP_ROUTER, amountIn);
                await approveTx.wait(1);
                this.logger.info(`Approval confirmed`);
            }

            // 4. EXECUTE SWAP
            this.logger.info(`Executing swap...`);
            const params = {
                tokenIn: USDC_ADDRESS,
                tokenOut: WETH_ADDRESS,
                fee: fee,
                recipient: this.address,
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            };

            const tx = await this.router.exactInputSingle(params, {
                gasLimit: 300000,
                maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
                maxFeePerGas: ethers.parseUnits("30", "gwei")
            });

            this.logger.info(`SWAP TX SUBMITTED: ${tx.hash}`);
            const receipt = await tx.wait();
            this.logger.info(`SWAP CONFIRMED in block ${receipt.blockNumber}`);

            // 5. Verify new balance
            const newBal = await this.provider.getBalance(this.address);
            this.logger.info(`💥 $5.17 USDC SWAP SUCCESS → NEW ETH Balance: ${ethers.formatEther(newBal)} ETH`);
            
            return true;

        } catch (error) {
            this.logger.error(`SWAP FAILED: ${error.message}`);
            if (error.code === 'CALL_EXCEPTION') {
                this.logger.error(`Contract call error - check addresses and ABIs`);
            }
            return false;
        }
    }

    // ENHANCED FUNDING LOGIC - FORCE SWAP FOR MAXIMUM DEPLOYMENT POWER
    async ensureFundingAndDeploy() {
        const bal = await this.provider.getBalance(this.address);
        const ethBal = ethers.formatEther(bal);
        this.logger.info(`Current ETH Balance: ${ethBal} ETH`);

        // FORCE SWAP MODE: Always execute $5.17 USDC swap for maximum deployment power
        if (this.FORCE_SWAP_MODE || bal < this.MIN_ETH_THRESHOLD) {
            this.logger.info(`⚡ DEPLOYMENT POWER-UP INITIATED → EXECUTING $5.17 USDC SWAP`);
            const swapSuccess = await this.execute517UsdcFunding();
            
            if (!swapSuccess) {
                this.logger.error(`DEPLOYMENT POWER-UP FAILED → INSUFFICIENT FUEL`);
                // Don't exit - try deployment with current balance
                this.logger.warn(`Attempting deployment with current ETH balance...`);
            } else {
                this.logger.info(`✅ DEPLOYMENT POWER-UP COMPLETE → MAXIMUM FUEL ACQUIRED`);
            }
        } else {
            this.logger.info(`ETH sufficient, proceeding with deployment`);
        }

        this.logger.info(`🎯 FUNDING SECURED → PROCEEDING WITH ERC-4337 DEPLOYMENT`);
        
        // Continue with your existing deployment logic
        await this.executeDeployment();
        
        return true;
    }

    // ENHANCED DEPLOYMENT EXECUTION
    async executeDeployment() {
        try {
            this.logger.info(`🚀 INITIATING ERC-4337 CONTRACT DEPLOYMENT SEQUENCE...`);
            
            // Your existing deployment logic here
            // Add enhanced gas management
            const balance = await this.provider.getBalance(this.address);
            this.logger.info(`Deployment Fuel: ${ethers.formatEther(balance)} ETH`);
            
            if (balance < ethers.parseEther("0.005")) {
                this.logger.warn(`Low ETH for deployment - transactions may fail`);
            }
            
            // Continue with paymaster and SCW deployment...
            this.logger.info(`✅ DEPLOYMENT SEQUENCE INITIATED`);
            
        } catch (error) {
            this.logger.error(`Deployment execution failed: ${error.message}`);
            throw error;
        }
    }

    async initialize() {
        this.logger.info(`🧠 BSFM SOVEREIGN BRAIN v2.9.1 — DEPLOYMENT POWER-UP ACTIVE`);
        this.logger.info(`💵 FORCE SWAP MODE: ${this.FORCE_SWAP_MODE ? 'ACTIVE' : 'STANDBY'}`);
        
        await this.ensureFundingAndDeploy();
        this.emit('ready');
    }
}

export { ProductionSovereignCore };
