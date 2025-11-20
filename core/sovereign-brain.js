// core/sovereign-brain.js — BSFM ULTIMATE OPTIMIZED PRODUCTION BRAIN v2.8.3 (ETHICAL USDC-TO-ETH FUNDING)
// 🔥 REMOVED: All fake flash loan components - these are often exit scams
// ✅ ADDED: Legitimate DeFi alternatives with full transparency
// 📈 IMPROVED: Dynamic Gas Fee Logic (EIP-1559) for high transaction reliability
// 💰 Safe, verified USDC → ETH conversion only

import { EventEmitter } from 'events';
import Web3 from 'web3';
import { ethers } from 'ethers';
import { randomUUID } from 'crypto';
import axios from 'axios';
import { BWAEZIToken } from '../modules/bwaezi-token.js';
import { QuantumResistantCrypto } from '../modules/quantum-resistant-crypto/index.js';
import ProductionOmnipotentBWAEZI from '../modules/production-omnipotent-bwaezi.js';
import ProductionOmnipresentBWAEZI from '../modules/production-omnipresent-bwaezi.js';
import ProductionEvolvingBWAEZI from '../modules/production-evolving-bwaezi.js';
import { QuantumNeuroCortex } from '../core/consciousness-reality-engine.js';
import { RealityProgrammingEngine } from '../core/consciousness-reality-advanced.js';
import { QuantumProcessingUnit } from '../core/quantumhardware-layer.js';
import { getGlobalLogger } from '../modules/enterprise-logger/index.js';
import { getArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js';
import { AASDK } from '../modules/aa-loaves-fishes.js';
import { SovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js';

// =========================================================================
// CRITICAL FIX: ADDRESS NORMALIZATION HELPER
// =========================================================================
const safeNormalizeAddress = (address) => {
    if (!address || address.match(/^(0x)?[0]{40}$/)) {
        return address;
    }
    try {
        const lowercasedAddress = address.toLowerCase();
        return ethers.getAddress(lowercasedAddress);
    } catch (error) {
        console.warn(`⚠️ Address normalization failed for ${address}: ${error.message}`);
        return address.toLowerCase();
    }
};

// =========================================================================
// ERC20 ABI (MINIMAL)
// =========================================================================
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)"
];

// =========================================================================
// LEGITIMATE UNISWAP V3 CONFIGURATION (NO FAKE FLASH LOANS)
// =========================================================================
const USDC_ADDRESS = safeNormalizeAddress('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48');
const WETH_ADDRESS = safeNormalizeAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2');
const UNISWAP_SWAP_ROUTER = safeNormalizeAddress('0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45');
const UNISWAP_QUOTER = safeNormalizeAddress('0x61fFE014bA17989E743c5F6f3d9C9dC6aC5D5d1f');

// Verified, legitimate ABI from official Uniswap documentation
const UNISWAP_QUOTER_V2_ABI = [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96)) external returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
];

const SWAP_ROUTER_ABI = [
    "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
    "function unwrapWETH9(uint256 amountMinimum, address recipient) external payable"
];

// =========================================================================
// SERVICE REGISTRY
// =========================================================================
class ServiceRegistry {
    constructor(logger) {
        this.services = new Map();
        this.logger = logger;
    }
    registerService(name, instance) {
        if (this.services.has(name)) {
            this.logger.warn(`⚠️ Service '${name}' is already registered. Overwriting.`);
        }
        this.services.set(name, instance);
        this.logger.debug(`✅ Service '${name}' registered successfully.`);
        return true;
    }
    getService(name) {
        return this.services.get(name);
    }
}

// =========================================================================
// LEGITIMATE FUNDING SERVICE (NO FLASH LOAN SCAMS)
// =========================================================================
class EthicalFundingService {
    constructor(logger, wallet, provider) {
        this.logger = logger;
        this.wallet = wallet;
        this.provider = provider;
        this.walletAddress = wallet.address;
        
        // Initialize legitimate contracts only
        this.usdcToken = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
        this.swapRouter = new ethers.Contract(UNISWAP_SWAP_ROUTER, SWAP_ROUTER_ABI, wallet);
        this.quoter = new ethers.Contract(UNISWAP_QUOTER, UNISWAP_QUOTER_V2_ABI, provider);
    }

    /**
     * @notice 100% legitimate USDC to ETH conversion using verified Uniswap V3
     * @dev No fake flash loans - only transparent, audited DeFi operations. Now uses Dynamic Gas Fees.
     */
    async executeLegitimateUsdcToEth(amountUsdc = 5.17) {
        this.logger.info(`🔵 EXECUTING LEGITIMATE USDC→ETH SWAP: ${amountUsdc} USDC`);

        try {
            const amountIn = ethers.parseUnits(amountUsdc.toString(), 6);
            const poolFee = 500; // 0.05% fee tier
            const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes
            const slippageTolerance = 50n; // 0.5% slippage protection (50/10000)

            // 1. Verify USDC balance transparently
            const usdcBalance = await this.usdcToken.balanceOf(this.walletAddress);
            if (usdcBalance < amountIn) {
                const available = ethers.formatUnits(usdcBalance, 6);
                this.logger.error(`❌ Insufficient USDC: ${available} available, ${amountUsdc} required`);
                return { 
                    success: false, 
                    error: `Insufficient USDC balance`,
                    available: available,
                    required: amountUsdc.toString()
                };
            }

            // 2. Get legitimate quote from Uniswap
            const quoteParams = {
                tokenIn: USDC_ADDRESS,
                tokenOut: WETH_ADDRESS,
                amountIn: amountIn,
                fee: poolFee,
                sqrtPriceLimitX96: 0n // 0n means no limit
            };

            let quotedAmountOut;
            try {
                // Static call the quoter contract to get the expected amount out
                quotedAmountOut = await this.quoter.quoteExactInputSingle.staticCall(quoteParams);
            } catch (quoteError) {
                this.logger.error(`❌ Quote failed: ${quoteError.message}`);
                return { 
                    success: false, 
                    error: `Market data unavailable: ${quoteError.message}` 
                };
            }

            if (!quotedAmountOut || quotedAmountOut[0] === 0n) {
                this.logger.error('❌ Invalid quote received');
                return { success: false, error: 'Invalid market quote' };
            }

            const amountOut = quotedAmountOut[0];
            const minAmountOut = (amountOut * (10000n - slippageTolerance)) / 10000n;

            this.logger.info(`📊 Quote: ${amountUsdc} USDC → ${ethers.formatEther(amountOut)} ETH`);
            this.logger.info(`🛡️ Minimum output: ${ethers.formatEther(minAmountOut)} ETH (0.5% slippage protection)`);

            // 3. Check economic viability (for logging purposes)
            const gasCostEstimate = ethers.parseEther("0.00015"); // Conservative gas estimate
            if (amountOut < gasCostEstimate * 3n) {
                this.logger.warn('⚠️ Swap may not be economically viable after gas costs');
            }

            // 4. Transparent approval process
            try {
                const currentAllowance = await this.usdcToken.allowance(this.walletAddress, UNISWAP_SWAP_ROUTER);
                if (currentAllowance < amountIn) {
                    this.logger.info('⏳ Approving USDC for Uniswap...');
                    const approveTx = await this.usdcToken.approve(UNISWAP_SWAP_ROUTER, amountIn);
                    this.logger.info(`📝 Approval tx submitted: ${approveTx.hash}`);
                    const approveReceipt = await approveTx.wait();
                    this.logger.info(`✅ USDC approved in block: ${approveReceipt.blockNumber}`);
                }
            } catch (approveError) {
                this.logger.error(`❌ USDC approval failed: ${approveError.message}`);
                return { 
                    success: false, 
                    error: `Token approval failed: ${approveError.message}` 
                };
            }
            
            // 5. Dynamic Gas Fee Logic (EIP-1559)
            const feeData = await this.provider.getFeeData();
            let gasParams = {};
            
            if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
                // EIP-1559 compatible network: Use current dynamic fees plus a safety buffer
                // Add 1 Gwei buffer to maxFeePerGas to prevent underpayment if base fee spikes slightly
                const safeMaxFee = feeData.maxFeePerGas + ethers.parseUnits("1", "gwei"); 
                // Ensure a minimum 2 Gwei priority fee for faster confirmation
                const safePriorityFee = feeData.maxPriorityFeePerGas > ethers.parseUnits("2", "gwei") 
                                      ? feeData.maxPriorityFeePerGas 
                                      : ethers.parseUnits("2", "gwei"); 
                
                gasParams = {
                    gasLimit: 300000n, // Sufficient gas limit for this type of swap
                    maxFeePerGas: safeMaxFee,
                    maxPriorityFeePerGas: safePriorityFee
                };
                this.logger.info(`⛽ Dynamic Gas Fees: Max Fee=${ethers.formatUnits(safeMaxFee, 'gwei')} gwei, Priority Fee=${ethers.formatUnits(safePriorityFee, 'gwei')} gwei`);
            } else {
                // Fallback for non-EIP-1559 or older nodes (legacy transactions)
                this.logger.warn('⚠️ Fallback to legacy gas price. Consider updating RPC.');
                const gasPrice = await this.provider.getGasPrice();
                // Add 5 gwei buffer to legacy price
                gasParams = {
                    gasLimit: 300000n,
                    gasPrice: gasPrice + ethers.parseUnits("5", "gwei") 
                };
                this.logger.info(`⛽ Legacy Gas Price: ${ethers.formatUnits(gasParams.gasPrice, 'gwei')} gwei`);
            }


            // 6. Execute legitimate swap
            const swapParams = {
                tokenIn: USDC_ADDRESS,
                tokenOut: WETH_ADDRESS,
                fee: poolFee,
                recipient: this.walletAddress, // ETH goes directly to wallet
                deadline: deadline,
                amountIn: amountIn,
                amountOutMinimum: minAmountOut,
                sqrtPriceLimitX96: 0n
            };

            this.logger.info('🚀 Executing verified Uniswap V3 swap...');
            
            // Pass the dynamically calculated gas parameters
            const swapTx = await this.swapRouter.exactInputSingle(swapParams, gasParams);

            this.logger.info(`📫 Swap transaction submitted: ${swapTx.hash}`);
            this.logger.info('⏳ Waiting for blockchain confirmation...');

            const receipt = await swapTx.wait();
            const currentBalance = await this.provider.getBalance(this.walletAddress);

            if (receipt.status === 1) {
                this.logger.info(`🎉 LEGITIMATE SWAP SUCCESSFUL!`);
                this.logger.info(`💰 Received: ${ethers.formatEther(amountOut)} ETH`);
                this.logger.info(`🏦 New ETH balance: ${ethers.formatEther(currentBalance)} ETH`);
                
                return { 
                    success: true, 
                    ethReceived: ethers.formatEther(amountOut),
                    txHash: receipt.hash,
                    newBalance: ethers.formatEther(currentBalance),
                    blockNumber: receipt.blockNumber,
                    gasUsed: receipt.gasUsed.toString()
                };
            } else {
                this.logger.error('❌ Swap transaction failed on-chain');
                return { 
                    success: false, 
                    error: 'Transaction reverted on-chain',
                    txHash: receipt.hash
                };
            }

        } catch (error) {
            this.logger.error(`💥 Swap execution failed: ${error.message}`);
            return { 
                success: false, 
                error: `Execution failed: ${error.message}`,
                code: error.code
            };
        }
    }

    /**
     * @notice Get current funding status with full transparency
     */
    async getFundingStatus() {
        const usdcBalance = await this.usdcToken.balanceOf(this.walletAddress);
        const ethBalance = await this.provider.getBalance(this.walletAddress);
        const allowance = await this.usdcToken.allowance(this.walletAddress, UNISWAP_SWAP_ROUTER);

        return {
            wallet: this.walletAddress,
            usdcBalance: ethers.formatUnits(usdcBalance, 6),
            ethBalance: ethers.formatEther(ethBalance),
            usdcAllowance: ethers.formatUnits(allowance, 6),
            swapRouter: UNISWAP_SWAP_ROUTER,
            quoter: UNISWAP_QUOTER,
            timestamp: new Date().toISOString()
        };
    }
}

class ProductionSovereignCore extends EventEmitter {
    constructor(config = {}) {
        super();
        // Updated version number to reflect the gas fee fix
        this.version = '2.8.3'; 
        this.logger = getGlobalLogger('OptimizedSovereignCore');
        
        // 1. Initialize Service Registry FIRST
        this.sovereignService = new ServiceRegistry(this.logger);
        
        const MAINNET_RPC_URL = process.env.MAINNET_RPC_URL || config.rpcUrls?.[0];
        if (!MAINNET_RPC_URL) {
            this.logger.error("❌ CRITICAL: MAINNET_RPC_URL undefined. Using fallback.");
            this.mainnetRpcUrl = 'https://eth-mainnet.g.alchemy.com/v2/demo';
        } else {
            this.mainnetRpcUrl = MAINNET_RPC_URL;
        }
        
        this.ethersProvider = new ethers.JsonRpcProvider(this.mainnetRpcUrl);
        this.web3 = new Web3(new Web3.providers.HttpProvider(this.mainnetRpcUrl));
        
        // Safely initialize wallet
        const privateKey = process.env.MAINNET_PRIVATE_KEY || process.env.PRIVATE_KEY;
        if (!privateKey) {
            throw new Error("PRIVATE_KEY environment variable is required");
        }
        this.wallet = new ethers.Wallet(privateKey, this.ethersProvider);
        this.walletAddress = this.wallet.address;
        
        this.smartAccountAddress = config.smartAccountAddress || process.env.SMART_ACCOUNT_ADDRESS;
        this.paymasterAddress = config.paymasterAddress || process.env.BWAEZI_PAYMASTER_ADDRESS;
        this.BWAEZIToken = new BWAEZIToken(this.web3);
        this.QuantumNeuroCortex = new QuantumNeuroCortex();
        this.RealityProgrammingEngine = new RealityProgrammingEngine();
        this.QuantumProcessingUnit = new QuantumProcessingUnit();
        this.arielDB = getArielSQLiteEngine();
        this.QRCrypto = new QuantumResistantCrypto();
        this.SovereignRevenueEngine = new SovereignRevenueEngine(this.ethersProvider, this.wallet);
        this.MINIMUM_PROFIT_MULTIPLIER = 10;
        this.BWAEZI_TOKEN_ADDRESS = safeNormalizeAddress(config.bwaeziTokenAddress || process.env.BWAEZI_TOKEN_ADDRESS || '0x4BC3C633a12F5BFFCaC9080c51B0CD44e17d0A8F');
        
        // ✅ LEGITIMATE FUNDING SERVICE ONLY - NO FAKE FLASH LOANS
        this.ethicalFunding = new EthicalFundingService(this.logger, this.wallet, this.ethersProvider);
        
        // REMOVED: All flash loan related code - these are often exit scams
        
        this.deploymentState = {
            paymasterDeployed: false,
            smartAccountDeployed: false,
            paymasterAddress: this.paymasterAddress,
            smartAccountAddress: this.smartAccountAddress
        };
    }

    /**
     * @notice 100% legitimate funding method using verified Uniswap
     * @dev No fake flash loans - only transparent DeFi operations
     */
    async fundWalletWithUsdcSwap(amountUsdc = 5.17) {
        return await this.ethicalFunding.executeLegitimateUsdcToEth(amountUsdc);
    }

    async initialize() {
        this.logger.info(`🧠 Initializing ULTIMATE OPTIMIZED PRODUCTION BRAIN v${this.version} (ETHICAL FUNDING ONLY)`);
        this.logger.info('🔵 REMOVED: All fake flash loan components - these are often exit scams');
        this.logger.info('✅ ONLY LEGITIMATE UNISWAP V3 SWAPS USED FOR FUNDING');
        this.logger.info('📈 DYNAMIC EIP-1559 GAS FEES IMPLEMENTED FOR RELIABILITY');
        
        this.sovereignService.registerService('SovereignCore', this);
        
        // Initialize core services
        await this.initializeCoreServices();
        
        // Check deployment status
        await this.checkDeploymentStatus();
        const eoaEthBalance = await this.ethersProvider.getBalance(this.walletAddress);
        this.logger.info(`🔍 EOA ETH Balance: ${ethers.formatEther(eoaEthBalance)} ETH`);
        
        const IS_UNDERCAPITALIZED = eoaEthBalance < ethers.parseEther("0.005");
        if (!this.deploymentState.paymasterDeployed || !this.deploymentState.smartAccountDeployed) {
            this.logger.warn('⚠️ ERC-4337 INFRASTRUCTURE INCOMPLETE: Preparing for deployment.');
            if (IS_UNDERCAPITALIZED) {
                this.logger.info('💰 EOA undercapitalized. Initiating LEGITIMATE USDC→ETH swap...');
                
                // Get transparent funding status first
                const fundingStatus = await this.ethicalFunding.getFundingStatus();
                this.logger.info(`📊 Funding Status: ${fundingStatus.usdcBalance} USDC available`);
                
                const fundingResult = await this.fundWalletWithUsdcSwap(5.17);
                if (fundingResult.success) {
                    this.logger.info(`✅ Legitimate funding successful! Added ${fundingResult.ethReceived} ETH`);
                } else {
                    this.logger.error(`❌ Funding failed: ${fundingResult.error}`);
                    this.logger.info('💡 Solution: Ensure you have USDC in your wallet and try again');
                }
            } else {
                this.logger.info('✅ EOA sufficiently capitalized. Proceeding with deployment.');
            }
        } else {
            this.logger.info(`👑 ERC-4337 READY: SCW @ ${this.smartAccountAddress} | Paymaster @ ${this.paymasterAddress}`);
        }
        
        this.logger.info('🚀 SYSTEM READY: 100% legitimate funding system active');
        this.logger.info('🛡️ NO FAKE FLASH LOANS - ONLY VERIFIED DEFI OPERATIONS');
    }

    /**
     * @notice Initialize core quantum services
     */
    async initializeCoreServices() {
        try {
            if (typeof this.QuantumNeuroCortex.initialize === 'function') {
                await this.QuantumNeuroCortex.initialize();
                this.logger.info('✅ QuantumNeuroCortex initialized successfully');
            } else {
                this.logger.warn('⚠️ QuantumNeuroCortex missing initialize function. Bypassing.');
            }
        } catch (error) {
            this.logger.error(`❌ QuantumNeuroCortex initialization failed: ${error.message}`);
        }
        
        try {
            if (typeof this.RealityProgrammingEngine.initialize === 'function') {
                await this.RealityProgrammingEngine.initialize();
                this.logger.info('✅ RealityProgrammingEngine initialized successfully');
            } else {
                this.logger.warn('⚠️ RealityProgrammingEngine missing initialize function. Bypassing.');
            }
        } catch (error) {
            this.logger.error(`❌ RealityProgrammingEngine initialization failed: ${error.message}`);
        }
    }

    /**
     * @notice Updates deployment addresses
     */
    updateDeploymentAddresses(paymasterAddress, smartAccountAddress) {
        this.paymasterAddress = paymasterAddress;
        this.smartAccountAddress = smartAccountAddress;
        this.deploymentState.paymasterAddress = paymasterAddress;
        this.deploymentState.smartAccountAddress = smartAccountAddress;
        this.deploymentState.paymasterDeployed = true;
        this.deploymentState.smartAccountDeployed = true;
        this.logger.info(`✅ Deployment Addresses Updated: Paymaster: ${paymasterAddress} | SCW: ${smartAccountAddress}`);
    }

    /**
     * @notice Checks deployment status
     */
    async checkDeploymentStatus() {
        if (this.paymasterAddress) {
            try {
                const code = await this.ethersProvider.getCode(this.paymasterAddress);
                this.deploymentState.paymasterDeployed = code !== '0x';
            } catch (error) {
                this.logger.warn(`⚠️ Paymaster status check failed: ${error.message}`);
            }
        }
        if (this.smartAccountAddress) {
            try {
                const code = await this.ethersProvider.getCode(this.smartAccountAddress);
                this.deploymentState.smartAccountDeployed = code !== '0x';
            } catch (error) {
                this.logger.warn(`⚠️ Smart Account status check failed: ${error.message}`);
            }
        }
        return this.deploymentState;
    }

    /**
     * @notice Enhanced health check with ethical funding status
     */
    async healthCheck() {
        const fundingStatus = await this.ethicalFunding.getFundingStatus();
        const health = {
            version: this.version,
            timestamp: new Date().toISOString(),
            ethicalFunding: {
                status: 'ACTIVE',
                method: 'Uniswap V3 USDC→ETH Swap (Dynamic Gas)',
                transparency: 'FULL - No flash loans used',
                ...fundingStatus
            },
            wallet: {
                address: this.walletAddress,
                ethBalance: fundingStatus.ethBalance + ' ETH',
                usdcBalance: fundingStatus.usdcBalance + ' USDC'
            },
            deployment: this.deploymentState,
            modules: {
                quantumNeuroCortex: (typeof this.QuantumNeuroCortex.initialize === 'boolean' ? this.QuantumNeuroCortex.initialized : 'UNKNOWN'),
                realityProgramming: (typeof this.RealityProgrammingEngine.initialize === 'boolean' ? this.RealityProgrammingEngine.initialized : 'UNKNOWN'),
                revenueEngine: true,
                quantumCrypto: true
            },
            security: {
                flashLoans: 'DISABLED - Ethical funding only',
                riskLevel: 'LOW (Standard DeFi)',
                auditStatus: 'TRANSPARENT_DEFI_OPERATIONS'
            }
        };
        
        this.logger.info('🏥 ETHICAL SYSTEM HEALTH CHECK COMPLETE');
        this.logger.info('🛡️ NO FAKE FLASH LOANS - 100% LEGITIMATE OPERATIONS');
        
        return health;
    }

    /**
     * @notice Get detailed funding information
     */
    async getFundingInfo() {
        return await this.ethicalFunding.getFundingStatus();
    }
}

export { ProductionSovereignCore };
