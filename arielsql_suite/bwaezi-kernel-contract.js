// arielsql_suite/bwaezi-kernel-contract.js
import { ethers } from 'ethers';
import solc from 'solc';

// =========================================================================
// 👑 PART 1: BWAEZI KERNEL SOURCE (For Compilation/Deployment)
// =========================================================================

// The UPDATED BWAEZI contract with approve() function and allowance mapping
const BWAEZI_SOL_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BWAEZIKernel {
    string public name = "BWAEZI";
    string public symbol = "bwzC";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    address public owner;

    // ✅ ADDED: ERC-20 Standard Allowance Mapping
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => bool) public verifiedIdentities;
    mapping(bytes32 => bool) public activeModules;
    mapping(address => bool) public registeredDEXs;

    // ✅ ADDED: ERC-20 Standard Approval Event
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed to, uint256 amount);
    event IdentityVerified(address indexed user);
    event ModuleActivated(bytes32 indexed moduleId);
    event AccessGranted(address indexed user, string service);
    event DEXRegistered(address indexed dex);
    event ArbitrageLogged(address indexed user, uint256 bwaeziAmount, uint256 ethEquivalent);
    event AIExecutionRequested(string task, address indexed requester);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    constructor(address founder) {
        require(founder != address(0), "Founder address cannot be zero"); 
        
        owner = founder; 
        uint256 initialSupply = 100_000_000 * 10 ** uint256(decimals);
        totalSupply = initialSupply;
        balanceOf[founder] = initialSupply;
        
        emit Mint(founder, initialSupply);
        emit Transfer(address(0), founder, initialSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    // ✅ ADDED: ERC-20 Standard Approve Function
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    // ✅ ADDED: ERC-20 Standard TransferFrom Function
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        require(balanceOf[from] >= amount, "Insufficient balance");
        
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        
        emit Transfer(from, to, amount);
        return true;
    }

    function verifyIdentity(address user) external onlyOwner {
        verifiedIdentities[user] = true;
        emit IdentityVerified(user);
    }

    function activateModule(bytes32 moduleId) external onlyOwner {
        activeModules[moduleId] = true;
        emit ModuleActivated(moduleId);
    }

    function grantAccess(address user, string memory service) external view {
        require(verifiedIdentities[user], "Identity not verified");
        require(balanceOf[user] > 0, "Insufficient BWAEZI");
        emit AccessGranted(user, service);
    }

    function registerDEX(address dex) external onlyOwner {
        registeredDEXs[dex] = true;
        emit DEXRegistered(dex);
    }

    function logArbitrage(address user, uint256 bwaeziAmount, uint256 ethEquivalent) external onlyOwner {
        emit ArbitrageLogged(user, bwaeziAmount, ethEquivalent);
    }

    function requestAIExecution(string memory task) external {
        emit AIExecutionRequested(task, msg.sender);
    }
}
`;

// =========================================================================
// 👑 PART 2: DEPLOYMENT ENGINE (BWAEZIKernelDeployer)
// =========================================================================

export class BWAEZIKernelDeployer {
    constructor(wallet, provider, config) {
        this.wallet = wallet;
        this.provider = provider;
        this.config = config;
        this.factory = null;
    }

    async compileAndPrepare() {
        console.log("⚙️ COMPILING UPDATED BWAEZI KERNEL (With Approve Function)...");
        const input = {
            language: 'Solidity',
            sources: { 'BWAEZI.sol': { content: BWAEZI_SOL_SOURCE } },
            settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } }
        };

        const output = JSON.parse(solc.compile(JSON.stringify(input)));
        
        // Check for compilation errors
        if (output.errors) {
            const errors = output.errors.filter(error => error.severity === 'error');
            if (errors.length > 0) {
                throw new Error(`Compilation Failed: ${errors.map(e => e.formattedMessage).join('\n')}`);
            }
        }

        const contractOutput = output.contracts['BWAEZI.sol'].BWAEZIKernel;

        if (!contractOutput) {
            throw new Error('Compilation Failed: No contract output generated');
        }

        const bytecode = contractOutput.evm.bytecode.object;
        const abi = contractOutput.abi;

        this.factory = new ethers.ContractFactory(abi, bytecode, this.wallet);
        console.log("✅ Contract compiled successfully with approve() function");
        return { abi, bytecode };
    }

    async deploy() {
        if (!this.factory) {
            await this.compileAndPrepare();
        }

        const sovereignWallet = this.config.SOVEREIGN_WALLET;
        const constructorArgs = [sovereignWallet];
        
        try {
            console.log("🔒 PHASE 1: PRE-DEPLOYMENT GAS ESTIMATION");
            
            const feeData = await this.provider.getFeeData();
            const gasPrice = feeData.gasPrice;
            
            if (!gasPrice) {
                throw new Error("Could not fetch reliable gas price data.");
            }

            const deployTransaction = await this.factory.getDeployTransaction(...constructorArgs);
            const estimatedGas = await this.provider.estimateGas(deployTransaction);
            
            const gasLimit = estimatedGas * 120n / 100n;
            const deploymentOptions = { gasLimit, gasPrice };

            console.log(` ✅ Estimated Gas: ${estimatedGas.toString()}`);
            console.log(` ✅ Final Gas Limit: ${gasLimit.toString()}`);
            console.log(` ⛽ Max Deployment Cost: ${ethers.formatEther(gasLimit * gasPrice)} ETH`);
            
            const balance = await this.provider.getBalance(this.wallet.address);
            const requiredBalance = gasLimit * gasPrice;
            
            if (balance < requiredBalance) {
                throw new Error(`Insufficient ETH. Need ${ethers.formatEther(requiredBalance)} ETH, have ${ethers.formatEther(balance)} ETH`);
            }

            console.log("🚀 PHASE 2: DEPLOYING UPDATED CONTRACT WITH APPROVE() FUNCTION");
            const contract = await this.factory.deploy(sovereignWallet, deploymentOptions);

            console.log("⏳ Waiting for deployment confirmation...");
            const receipt = await contract.deploymentTransaction().wait();

            const address = await contract.getAddress();
            const deploymentHash = receipt.hash;
            const deploymentCost = receipt.gasUsed * receipt.gasPrice;

            console.log(`🎉 DEPLOYMENT SUCCESS! Contract: ${address}`);
            console.log(`💰 FINAL COST: ${ethers.formatEther(deploymentCost)} ETH`);

            return {
                success: true,
                address: address,
                transactionHash: deploymentHash,
                deploymentCost: ethers.formatEther(deploymentCost),
                contract: contract
            };
        } catch (error) {
            console.error("❌ DEPLOYMENT FAILED:", error.message);
            
            if (error.message.includes('insufficient funds')) {
                throw new Error(`Insufficient ETH for deployment. Check wallet balance.`);
            }
            
            return { success: false, error: error.message };
        }
    }
}

// =========================================================================
// 👑 PART 3: SGT CONFIGURATION & ORCHESTRATION ENGINE (ProductionSovereignCore)
// =========================================================================

// --- SGT CONFIGURATION ---

// Critical Dependency Fix: Fallback Routers for SGT resilience
const APPROVED_DEX_ROUTERS = [
    '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 Router 2 (Primary)
    '0x68b3465833fb72A70ecDF485E0E248143e7EFBC3', // Uniswap V3 Router (Mixer/Multicall) - Fallback
];

const GENESIS_SWAP_CONFIG = {
    AMOUNT_IN_BWAEZI: ethers.parseUnits("10", 18), 
    MAX_SLIPPAGE_PERCENT: 5.0, // 5% max slippage
    DEADLINE_MINUTES: 5,
    V3_FEE_TIER: 3000
};

// --- MINIMAL ABIS ---
const ERC20_ABI = [
    "function approve(address spender, uint256 amount) returns (bool)",
    "function balanceOf(address owner) view returns (uint256)"
];

const SWAP_ROUTER_ABI = [
    "function quoteExactInputSingle(uint256 amountIn, address tokenIn, address tokenOut, uint24 fee) view returns (uint256 amountOut, uint160 sqrtPriceX96AfterList, uint32 gasEstimate, uint32 initSqrtRatioX96)",
    "function exactInputSingle(tuple(address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96) params) external payable returns (uint256 amountOut)"
];

const logger = {
    info: (...args) => console.log('✅ [INFO]', ...args),
    error: (...args) => console.error('❌ [ERROR]', ...args),
    warn: (...args) => console.warn('⚠️ [WARN]', ...args)
};

// --- SLIPPAGE GUARDRAIL FUNCTION ---

async function calculateMinOutput(provider, routerAddress, amountIn, tokenIn, tokenOut, maxSlippagePercent) {
    const routerContract = new ethers.Contract(routerAddress, SWAP_ROUTER_ABI, provider);

    try {
        const [idealOutput] = await routerContract.quoteExactInputSingle(
            amountIn,
            tokenIn,
            tokenOut,
            GENESIS_SWAP_CONFIG.V3_FEE_TIER
        );
        
        const factor = BigInt(Math.floor(100 - maxSlippagePercent));
        const minOutput = (idealOutput * factor) / 100n;

        return minOutput;
    } catch (error) {
        logger.error(`💥 Price Quote Simulation Failed on Router ${routerAddress}: ${error.message}`);
        return 0n; // Fail-safe: Cannot guarantee price protection
    }
}


// --- PRODUCTION CORE CLASS (The Sovereign Brain) ---

export class ProductionSovereignCore {
    constructor(provider, signer, config) {
        this.ethersProvider = provider;
        this.signer = signer;
        this.walletAddress = signer.address;
        this.config = config; 
        this.logger = logger;

        this.bwaeziKernelAddress = config.BWAEZI_KERNEL_ADDRESS; // Assumed deployed address
        this.wethAddress = config.WETH_ADDRESS;                   

        // 📊 SGT Metrics Tracking
        this.sgtMetrics = {
            attempts: 0,
            success: false,
            gasCost: 0n,
            revenue: 0n,
            routerUsed: null
        };
    }

    /**
     * Executes the Sovereign Genesis Trade (SGT) to acquire initial gas funds.
     * Implements Multi-Router Resilience and Slippage Protection.
     * @returns {object} The result of the trade and the final metrics.
     */
    async executeSovereignGenesisTrade() {
        this.sgtMetrics.attempts++;
        const bwaeziKernel = new ethers.Contract(this.bwaeziKernelAddress, ERC20_ABI, this.signer);
        let sgtSuccess = false;
        let amountReceivedInWETH = 0n;

        this.logger.info(`👑 Starting SGT Attempt #${this.sgtMetrics.attempts}. Input: ${ethers.formatUnits(GENESIS_SWAP_CONFIG.AMOUNT_IN_BWAEZI, 18)} BWAEZI`);

        for (const routerAddress of APPROVED_DEX_ROUTERS) {
            this.logger.warn(`🔄 Attempting SGT with Router: ${routerAddress}`);
            
            try {
                // 1. 🛡️ SLIPPAGE PROTECTION: Calculate minimum output
                const amountOutMinimum = await calculateMinOutput(
                    this.ethersProvider, 
                    routerAddress,
                    GENESIS_SWAP_CONFIG.AMOUNT_IN_BWAEZI,
                    this.bwaeziKernelAddress,
                    this.wethAddress,
                    GENESIS_SWAP_CONFIG.MAX_SLIPPAGE_PERCENT
                );

                if (amountOutMinimum === 0n) {
                    this.logger.error(`Skipping router ${routerAddress}: Price quote failed or returned zero.`);
                    continue; // Try next router
                }

                // 2. Approve the Router to spend BWAEZI
                const approveTx = await bwaeziKernel.approve(routerAddress, GENESIS_SWAP_CONFIG.AMOUNT_IN_BWAEZI);
                await approveTx.wait();
                this.logger.info(`✅ Approval confirmed.`);

                // 3. Execute the Swap (Sovereign Genesis Trade)
                const routerContract = new ethers.Contract(routerAddress, SWAP_ROUTER_ABI, this.signer);
                const deadline = Math.floor(Date.now() / 1000) + (GENESIS_SWAP_CONFIG.DEADLINE_MINUTES * 60);

                const params = {
                    tokenIn: this.bwaeziKernelAddress,
                    tokenOut: this.wethAddress,
                    fee: GENESIS_SWAP_CONFIG.V3_FEE_TIER,
                    recipient: this.walletAddress,
                    deadline: deadline,
                    amountIn: GENESIS_SWAP_CONFIG.AMOUNT_IN_BWAEZI,
                    amountOutMinimum: amountOutMinimum, // SLIPPAGE GUARDRAIL
                    sqrtPriceLimitX96: 0 
                };
                
                const swapTx = await routerContract.exactInputSingle(params);
                const receipt = await swapTx.wait();
                
                // 4. 📊 Track Success Metrics
                sgtSuccess = true;
                this.sgtMetrics.success = true;
                this.sgtMetrics.routerUsed = routerAddress;
                this.sgtMetrics.gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
                
                // Note: Real-world implementation requires robust log parsing to get amountReceivedInWETH
                // For now, we assume the first return value is the output.
                const swapResult = routerContract.interface.decodeFunctionResult("exactInputSingle", receipt.logs[receipt.logs.length - 1].data);
                amountReceivedInWETH = swapResult[0]; 

                this.sgtMetrics.revenue = amountReceivedInWETH;
                
                this.logger.info(`🎉 SGT SUCCESS on Router ${routerAddress}.`);
                this.logger.info(`💰 Revenue: ${ethers.formatUnits(amountReceivedInWETH, 18)} WETH.`);
                this.logger.info(`⛽ Gas Cost: ${ethers.formatEther(this.sgtMetrics.gasCost)} ETH.`);
                
                break; // Exit the loop on first successful trade
            } catch (error) {
                this.logger.error(`💥 SGT FAILURE on Router ${routerAddress}: ${error.message}`);
                this.logger.warn('Trying next approved DEX router (Multi-Router Resilience active)...');
            }
        }

        if (!sgtSuccess) {
            this.logger.error('❌ CRITICAL: ALL SGT ATTEMPTS FAILED. CANNOT SELF-FUND.');
        }

        return { 
            success: sgtSuccess, 
            metrics: this.sgtMetrics 
        };
    }
}

// Export both the Deployer and the Orchestrator
export { 
    BWAEZIKernelDeployer,
    ProductionSovereignCore,
    ERC20_ABI, 
    SWAP_ROUTER_ABI 
};
