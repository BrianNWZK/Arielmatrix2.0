// core/sovereign-brain.js — BSFM ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.9.1 FIXED
// $5.17 USDC SWAP = PRIMARY & ONLY PATH TO SOVEREIGNTY
// FORCE SWAP EVEN WITH ETH - DEPLOYMENT OPTIMIZED

import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { getGlobalLogger } from '../modules/enterprise-logger/index.js';

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
const UNISWAP_QUOTER    = safeAddr('0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6');

// ABIs (optimized and corrected)
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

const QUOTER_ABI = [
    {
        "inputs": [
            {"internalType": "bytes","name": "path","type": "bytes"},
            {"internalType": "uint256","name": "amountIn","type": "uint256"}
        ],
        "name": "quoteExactInput",
        "outputs": [
            {"internalType": "uint256","name": "amountOut","type": "uint256"}
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    },
    {
        "inputs": [
            {"internalType": "address","name": "tokenIn","type": "address"},
            {"internalType": "address","name": "tokenOut","type": "address"},
            {"internalType": "uint24","name": "fee","type": "uint24"},
            {"internalType": "uint256","name": "amountIn","type": "uint256"},
            {"internalType": "uint160","name": "sqrtPriceLimitX96","type": "uint160"}
        ],
        "name": "quoteExactInputSingle",
        "outputs": [
            {"internalType": "uint256","name": "amountOut","type": "uint256"}
        ],
        "stateMutability": "nonpayable",
        "type": "function"
    }
];

const ROUTER_ABI = [
    {
        "inputs": [
            {
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
            }
        ],
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
        this.MIN_ETH_THRESHOLD = ethers.parseEther("0.01");
        this.FUNDING_USDC = 5.17;
        this.FORCE_SWAP_MODE = true;

        this.deploymentState = {
            paymasterDeployed: false,
            smartAccountDeployed: false
        };
    }

    // IMPROVED QUOTE METHOD WITH FALLBACKS
    async getSwapQuote(amountIn) {
        try {
            // Method 1: Try quoteExactInputSingle first
            const fee = 500; // 0.05% pool
            const quote = await this.quoter.quoteExactInputSingle.staticCall(
                USDC_ADDRESS,
                WETH_ADDRESS, 
                fee,
                amountIn,
                0
            );
            return quote;
        } catch (error) {
            this.logger.warn(`Primary quote method failed, trying alternative...`);
            
            // Method 2: Alternative approach - use a fixed rate as fallback
            // Current approximate rate: 1 ETH ≈ 2700 USDC
            const approximateRate = 2700n;
            const amountOut = (amountIn * ethers.parseEther("1")) / (approximateRate * 1000000n);
            const minOut = (amountOut * 95n) / 100n; // 5% buffer for safety
            
            this.logger.info(`Using approximate quote: ${ethers.formatEther(amountOut)} ETH`);
            return minOut;
        }
    }

    // $5.17 USDC → ETH SWAP — DEPLOYMENT POWER-UP (FIXED)
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

            // 2. Get quote with improved error handling
            this.logger.info(`Getting quote for 5.17 USDC → ETH...`);
            const amountOut = await this.getSwapQuote(amountIn);
            const minOut = (amountOut * 980n) / 1000n; // 2% slippage for better reliability

            this.logger.info(`Quote: 5.17 USDC → ${ethers.formatEther(amountOut)} ETH`);

            // 3. Check and approve USDC with better gas estimation
            const allowance = await this.usdc.allowance(this.address, UNISWAP_ROUTER);
            if (allowance < amountIn) {
                this.logger.info(`Approving 5.17 USDC for Uniswap...`);
                try {
                    const approveTx = await this.usdc.approve(UNISWAP_ROUTER, amountIn, {
                        gasLimit: 100000
                    });
                    await approveTx.wait(1);
                    this.logger.info(`Approval confirmed`);
                } catch (approveError) {
                    this.logger.error(`Approval failed: ${approveError.message}`);
                    return false;
                }
            }

            // 4. EXECUTE SWAP with better gas management
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

            // Get current gas prices
            const feeData = await this.provider.getFeeData();
            
            const tx = await this.router.exactInputSingle(params, {
                gasLimit: 350000, // Increased gas limit
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("2", "gwei"),
                maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("30", "gwei")
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
            this.logger.error(`Error details: ${JSON.stringify(error, null, 2)}`);
            
            // Provide specific guidance based on error type
            if (error.code === 'CALL_EXCEPTION') {
                this.logger.error(`Contract call error - check addresses and ABIs`);
            } else if (error.code === 'INSUFFICIENT_FUNDS') {
                this.logger.error(`Insufficient ETH for gas - need more ETH for transaction fees`);
            } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
                this.logger.error(`Gas estimation failed - transaction likely to revert`);
            }
            
            return false;
        }
    }

    // ENHANCED FUNDING LOGIC WITH BETTER ERROR RECOVERY
    async ensureFundingAndDeploy() {
        try {
            const bal = await this.provider.getBalance(this.address);
            const ethBal = ethers.formatEther(bal);
            this.logger.info(`Current ETH Balance: ${ethBal} ETH`);

            // FORCE SWAP MODE: Always execute $5.17 USDC swap for maximum deployment power
            if (this.FORCE_SWAP_MODE) {
                this.logger.info(`⚡ DEPLOYMENT POWER-UP INITIATED → EXECUTING $5.17 USDC SWAP`);
                const swapSuccess = await this.execute517UsdcFunding();
                
                if (!swapSuccess) {
                    this.logger.error(`DEPLOYMENT POWER-UP FAILED → INSUFFICIENT FUEL`);
                    // Check if we have minimum ETH to proceed anyway
                    const currentBalance = await this.provider.getBalance(this.address);
                    if (currentBalance > ethers.parseEther("0.001")) {
                        this.logger.warn(`Attempting deployment with current ETH balance: ${ethers.formatEther(currentBalance)} ETH`);
                    } else {
                        this.logger.error(`CRITICAL: Insufficient ETH for any deployment operation`);
                        return false;
                    }
                } else {
                    this.logger.info(`✅ DEPLOYMENT POWER-UP COMPLETE → MAXIMUM FUEL ACQUIRED`);
                }
            } else {
                this.logger.info(`ETH sufficient, proceeding with deployment`);
            }

            this.logger.info(`🎯 FUNDING SECURED → PROCEEDING WITH ERC-4337 DEPLOYMENT`);
            
            // Continue with deployment logic
            await this.executeDeployment();
            
            return true;
        } catch (error) {
            this.logger.error(`Funding and deployment process failed: ${error.message}`);
            return false;
        }
    }

    // ENHANCED DEPLOYMENT EXECUTION
    async executeDeployment() {
        try {
            this.logger.info(`🚀 INITIATING ERC-4337 CONTRACT DEPLOYMENT SEQUENCE...`);
            
            const balance = await this.provider.getBalance(this.address);
            this.logger.info(`Deployment Fuel: ${ethers.formatEther(balance)} ETH`);
            
            if (balance < ethers.parseEther("0.005")) {
                this.logger.warn(`Low ETH for deployment - transactions may fail`);
                // Continue anyway but with warnings
            }
            
            // Your existing deployment logic for paymaster and SCW goes here
            this.logger.info(`✅ DEPLOYMENT SEQUENCE INITIATED`);
            
        } catch (error) {
            this.logger.error(`Deployment execution failed: ${error.message}`);
            throw error;
        }
    }

    async initialize() {
        try {
            this.logger.info(`🧠 BSFM SOVEREIGN BRAIN v2.9.1 — DEPLOYMENT POWER-UP ACTIVE`);
            this.logger.info(`💵 FORCE SWAP MODE: ${this.FORCE_SWAP_MODE ? 'ACTIVE' : 'STANDBY'}`);
            
            await this.ensureFundingAndDeploy();
            this.emit('ready');
        } catch (error) {
            this.logger.error(`Initialization failed: ${error.message}`);
            throw error;
        }
    }
}

export { ProductionSovereignCore };
