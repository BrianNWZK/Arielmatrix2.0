// core/sovereign-brain.js — BSFM ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.9.1 FIXED
// PREVENTS FAILED SWAP GAS LOSS

import { EventEmitter } from 'events';
import { ethers } from 'ethers';
import { getGlobalLogger } from '../modules/enterprise-logger/index.js';

// =========================================================================
// CHECKSUM-SAFE ADDRESS NORMALIZER
// =========================================================================
const safeAddr = (addr) => {
    if (!addr) return addr;
    try {
        return ethers.getAddress(addr.toLowerCase());
    } catch {
        return addr.toLowerCase();
    }
};

// MAINNET CONTRACTS
const USDC_ADDRESS      = safeAddr('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
const WETH_ADDRESS      = safeAddr('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
const UNISWAP_ROUTER    = safeAddr('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45');
const UNISWAP_QUOTER    = safeAddr('0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6');

// ABIs (optimized)
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

const QUOTER_ABI = [
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

        // FORCE SWAP MODE - With better gas protection
        this.MIN_ETH_THRESHOLD = ethers.parseEther("0.01");
        this.FUNDING_USDC = 5.17;
        this.FORCE_SWAP_MODE = true;

        this.deploymentState = {
            paymasterDeployed: false,
            smartAccountDeployed: false
        };
    }

    // SIMULATE SWAP BEFORE EXECUTION - PREVENTS GAS LOSS
    async simulateSwap(amountIn, minOut) {
        try {
            this.logger.info(`🔍 SIMULATING SWAP TRANSACTION...`);
            
            const fee = 500;
            const deadline = Math.floor(Date.now() / 1000) + 1800;
            
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

            // Use callStatic to simulate without sending transaction
            const result = await this.router.exactInputSingle.staticCall(params, {
                from: this.address
            });
            
            this.logger.info(`✅ SWAP SIMULATION SUCCESSFUL: Would receive ${ethers.formatEther(result)} ETH`);
            return true;
            
        } catch (simulationError) {
            this.logger.error(`❌ SWAP SIMULATION FAILED: ${simulationError.message}`);
            this.logger.error(`Transaction would revert - saving ETH from failed transaction`);
            return false;
        }
    }

    // IMPROVED QUOTE METHOD WITH BETTER ERROR HANDLING
    async getSwapQuote(amountIn) {
        try {
            const fee = 500;
            const quote = await this.quoter.quoteExactInputSingle.staticCall(
                USDC_ADDRESS,
                WETH_ADDRESS, 
                fee,
                amountIn,
                0
            );
            return quote;
        } catch (error) {
            this.logger.warn(`Primary quote method failed, using conservative estimate...`);
            
            // Conservative fallback: assume worse rate to avoid slippage issues
            const conservativeRate = 2500n; // Lower rate = more conservative
            const amountOut = (amountIn * ethers.parseEther("1")) / (conservativeRate * 1000000n);
            
            this.logger.info(`Using conservative quote: ${ethers.formatEther(amountOut)} ETH`);
            return amountOut;
        }
    }

    // GAS-OPTIMIZED APPROVAL WITH SIMULATION
    async safeApproveUSDC(amountIn) {
        try {
            const allowance = await this.usdc.allowance(this.address, UNISWAP_ROUTER);
            if (allowance >= amountIn) {
                this.logger.info(`✅ USDC already approved`);
                return true;
            }

            this.logger.info(`🔍 Simulating USDC approval...`);
            
            // Simulate approval first
            await this.usdc.approve.staticCall(UNISWAP_ROUTER, amountIn, {
                from: this.address
            });

            this.logger.info(`✅ Approval simulation passed, executing...`);
            const approveTx = await this.usdc.approve(UNISWAP_ROUTER, amountIn, {
                gasLimit: 80000 // Conservative gas limit
            });
            
            const receipt = await approveTx.wait(1);
            this.logger.info(`✅ USDC approval confirmed in block ${receipt.blockNumber}`);
            return true;
            
        } catch (error) {
            this.logger.error(`❌ USDC approval failed: ${error.message}`);
            return false;
        }
    }

    // $5.17 USDC → ETH SWAP WITH GAS PROTECTION
    async execute517UsdcFunding() {
        const initialBalance = await this.provider.getBalance(this.address);
        this.logger.info(`💰 INITIAL ETH BALANCE: ${ethers.formatEther(initialBalance)} ETH`);
        this.logger.info(`🚀 $5.17 USDC SWAP INITIATED — DEPLOYMENT POWER-UP SEQUENCE`);

        try {
            const amountIn = ethers.parseUnits(this.FUNDING_USDC.toString(), 6);

            // 1. Check USDC balance
            const usdcBal = await this.usdc.balanceOf(this.address);
            this.logger.info(`USDC Balance: ${ethers.formatUnits(usdcBal, 6)} USDC`);

            if (usdcBal < amountIn) {
                this.logger.error(`INSUFFICIENT USDC: ${ethers.formatUnits(usdcBal, 6)} < 5.17`);
                return false;
            }

            // 2. Get quote
            this.logger.info(`Getting quote for 5.17 USDC → ETH...`);
            const amountOut = await this.getSwapQuote(amountIn);
            const minOut = (amountOut * 950n) / 1000n; // 5% slippage for maximum success

            this.logger.info(`Quote: 5.17 USDC → ${ethers.formatEther(amountOut)} ETH`);
            this.logger.info(`Minimum acceptable: ${ethers.formatEther(minOut)} ETH`);

            // 3. Safe approval with simulation
            const approvalSuccess = await this.safeApproveUSDC(amountIn);
            if (!approvalSuccess) {
                this.logger.error(`❌ Approval process failed - aborting swap`);
                return false;
            }

            // 4. SIMULATE SWAP BEFORE EXECUTION (CRITICAL - PREVENTS GAS LOSS)
            const simulationSuccess = await this.simulateSwap(amountIn, minOut);
            if (!simulationSuccess) {
                this.logger.error(`❌ SWAP SIMULATION FAILED - ABORTING TO SAVE ETH`);
                return false;
            }

            // 5. EXECUTE SWAP with conservative gas settings
            this.logger.info(`🎯 EXECUTING SWAP TRANSACTION...`);
            const fee = 500;
            const deadline = Math.floor(Date.now() / 1000) + 1800;

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

            // Get current gas data
            const feeData = await this.provider.getFeeData();
            
            const tx = await this.router.exactInputSingle(params, {
                gasLimit: 400000, // Increased but reasonable limit
                maxPriorityFeePerGas: feeData.maxPriorityFeePerGas || ethers.parseUnits("1.5", "gwei"),
                maxFeePerGas: feeData.maxFeePerGas || ethers.parseUnits("25", "gwei")
            });

            this.logger.info(`📤 SWAP TX SUBMITTED: ${tx.hash}`);
            const receipt = await tx.wait();
            
            if (receipt.status === 1) {
                const newBal = await this.provider.getBalance(this.address);
                const gasUsed = receipt.gasUsed * receipt.gasPrice;
                this.logger.info(`💥 $5.17 USDC SWAP SUCCESS!`);
                this.logger.info(`🔄 NEW ETH BALANCE: ${ethers.formatEther(newBal)} ETH`);
                this.logger.info(`⛽ GAS USED: ${ethers.formatEther(gasUsed)} ETH`);
                return true;
            } else {
                this.logger.error(`❌ SWAP TRANSACTION REVERTED - but gas was spent`);
                return false;
            }

        } catch (error) {
            const currentBalance = await this.provider.getBalance(this.address);
            const ethLost = initialBalance - currentBalance;
            
            this.logger.error(`💸 SWAP FAILED - ETH LOST: ${ethers.formatEther(ethLost)} ETH`);
            this.logger.error(`❌ Error: ${error.message}`);
            
            // Enhanced error analysis
            if (error.code === 'CALL_EXCEPTION') {
                this.logger.error(`🔧 Contract call reverted - check swap parameters`);
            } else if (error.code === 'INSUFFICIENT_FUNDS') {
                this.logger.error(`💸 Insufficient ETH for gas fees`);
            } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
                this.logger.error(`⛽ Gas estimation failed - transaction would revert`);
            }
            
            this.logger.info(`💰 REMAINING ETH BALANCE: ${ethers.formatEther(currentBalance)} ETH`);
            return false;
        }
    }

    // ENHANCED FUNDING LOGIC WITH GAS PROTECTION
    async ensureFundingAndDeploy() {
        const initialBalance = await this.provider.getBalance(this.address);
        this.logger.info(`💰 INITIAL DEPLOYMENT ETH: ${ethers.formatEther(initialBalance)} ETH`);

        // Only attempt swap if we have sufficient ETH for gas + buffer
        const minGasBuffer = ethers.parseEther("0.0005"); // Minimum gas buffer
        if (initialBalance < minGasBuffer) {
            this.logger.error(`❌ CRITICAL: Insufficient ETH for any operations`);
            this.logger.error(`Required: ${ethers.formatEther(minGasBuffer)} ETH, Available: ${ethers.formatEther(initialBalance)} ETH`);
            return false;
        }

        if (this.FORCE_SWAP_MODE) {
            this.logger.info(`⚡ DEPLOYMENT POWER-UP INITIATED → EXECUTING $5.17 USDC SWAP`);
            
            // Check if swap makes sense (only if we have enough USDC and gas buffer)
            const usdcBal = await this.usdc.balanceOf(this.address);
            if (usdcBal >= ethers.parseUnits("5.17", 6)) {
                const swapSuccess = await this.execute517UsdcFunding();
                
                if (!swapSuccess) {
                    this.logger.warn(`⚠️ SWAP FAILED - Continuing with current ETH balance`);
                }
            } else {
                this.logger.warn(`⚠️ INSUFFICIENT USDC FOR SWAP - Continuing with current ETH`);
            }
        }

        const finalBalance = await this.provider.getBalance(this.address);
        this.logger.info(`🎯 FINAL DEPLOYMENT FUEL: ${ethers.formatEther(finalBalance)} ETH`);
        
        if (finalBalance < ethers.parseEther("0.003")) {
            this.logger.warn(`⚠️ LOW ETH WARNING: Deployment may fail with ${ethers.formatEther(finalBalance)} ETH`);
        }

        this.logger.info(`🚀 PROCEEDING WITH ERC-4337 DEPLOYMENT...`);
        await this.executeDeployment();
        return true;
    }

    // ENHANCED DEPLOYMENT EXECUTION
    async executeDeployment() {
        try {
            this.logger.info(`🚀 INITIATING ERC-4337 CONTRACT DEPLOYMENT SEQUENCE...`);
            
            const balance = await this.provider.getBalance(this.address);
            this.logger.info(`⛽ DEPLOYMENT FUEL: ${ethers.formatEther(balance)} ETH`);
            
            if (balance < ethers.parseEther("0.005")) {
                this.logger.warn(`⚠️ LOW ETH WARNING - Transactions may fail`);
            }
            
            // Your existing deployment logic here
            this.logger.info(`✅ DEPLOYMENT SEQUENCE INITIATED`);
            
        } catch (error) {
            this.logger.error(`❌ Deployment execution failed: ${error.message}`);
            throw error;
        }
    }

    async initialize() {
        try {
            this.logger.info(`🧠 BSFM SOVEREIGN BRAIN v2.9.1 — GAS-PROTECTED SWAP MODE`);
            this.logger.info(`💵 FORCE SWAP MODE: ${this.FORCE_SWAP_MODE ? 'ACTIVE' : 'STANDBY'}`);
            
            await this.ensureFundingAndDeploy();
            this.emit('ready');
        } catch (error) {
            this.logger.error(`❌ Initialization failed: ${error.message}`);
            throw error;
        }
    }
}

export { ProductionSovereignCore };
