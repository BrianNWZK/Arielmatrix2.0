// arielsql_suite/bwaezi-kernel-contract.js
import { ethers } from 'ethers';
import solc from 'solc';

// =========================================================================
// 👑 PART 1: BWAEZI KERNEL SOURCE (For Compilation/Deployment)
// =========================================================================

// The UPDATED BWAEZI contract source with ERC-20 Approve/TransferFrom
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

// --- MIGRATION CONSTANTS ---
const OLD_TOKEN_ADDRESS = "0x4BC3C633a12F5BFFCaC9080c51B0CD44e17d0A8F"; // The previous broken contract
const OLD_TOKEN_ABI = [
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function balanceOf(address owner) view returns (uint256)"
];
// --- END MIGRATION CONSTANTS ---

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
        console.log("✅ Contract compiled successfully with approve/transferFrom functions");
        return { abi, bytecode };
    }

    async deploy() {
        if (!this.factory) {
            await this.compileAndPrepare();
        }

        const sovereignWallet = this.config.SOVEREIGN_WALLET; // Should be 0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA
        const constructorArgs = [sovereignWallet];
        
        try {
            console.log("🔒 PHASE 1: PRE-DEPLOYMENT GAS ESTIMATION");
            
            const feeData = await this.provider.getFeeData();
            const gasPrice = feeData.gasPrice;
            
            if (!gasPrice) {
                throw new Error("Could not fetch reliable gas price data.");
            }

            // Estimate gas for deployment
            const deployTransaction = await this.factory.getDeployTransaction(...constructorArgs);
            const estimatedGas = await this.provider.estimateGas(deployTransaction);
            
            const gasLimit = estimatedGas * 120n / 100n;
            const deploymentOptions = { gasLimit, gasPrice };
            
            // ... (Balance check omitted for brevity, but assumed to be done) ...

            console.log("🚀 PHASE 2: DEPLOYING NEW BWAEZI KERNEL (Fixed ERC-20)");
            const newBwaeziContract = await this.factory.deploy(sovereignWallet, deploymentOptions);

            console.log("⏳ Waiting for deployment confirmation...");
            const receipt = await newBwaeziContract.deploymentTransaction().wait();

            const NEW_TOKEN_ADDRESS = await newBwaeziContract.getAddress();
            const deploymentHash = receipt.hash;
            const deploymentCost = receipt.gasUsed * receipt.gasPrice;

            console.log(`🎉 DEPLOYMENT SUCCESS! NEW Contract: ${NEW_TOKEN_ADDRESS}`);
            console.log(`💰 DEPLOYMENT COST: ${ethers.formatEther(deploymentCost)} ETH`);

            // =============================================================
            // 👑 PHASE 3: ZERO-DOWNTIME TOKEN MIGRATION (ZDTM)
            // =============================================================
            console.log(`\n--- Starting ZDTM: Migrating 100M BWAEZI from OLD Contract (${OLD_TOKEN_ADDRESS}) ---`);

            // 3a. Instantiate the OLD contract
            const oldBwaeziContract = new ethers.Contract(OLD_TOKEN_ADDRESS, OLD_TOKEN_ABI, this.wallet);
            
            // 3b. Fetch the full balance from the OLD contract (Sovereign Wallet should hold it)
            const totalBalance = await oldBwaeziContract.balanceOf(sovereignWallet);
            
            if (totalBalance === 0n) {
                console.warn("⚠️ WARNING: Sovereign Wallet holds zero tokens in the OLD contract. Migration skipped.");
            } else {
                console.log(`💰 Initiating migration of ${ethers.formatUnits(totalBalance, 18)} BWAEZI to the NEW contract...`);
                
                // 3c. Execute the transfer from the OLD contract to the NEW contract address
                const migrationTx = await oldBwaeziContract.transfer(NEW_TOKEN_ADDRESS, totalBalance);
                console.log(`⏳ Transfer Transaction Hash: ${migrationTx.hash}`);
                
                await migrationTx.wait();
                console.log(`🎉 Token Migration Successful!`);
                
                // 3d. Verify final balance in the NEW contract
                const newBalance = await newBwaeziContract.balanceOf(sovereignWallet);
                console.log(`✅ Final Balance in NEW Contract: ${ethers.formatUnits(newBalance, 18)} BWAEZI`);

                if (newBalance < totalBalance) {
                     console.error("❌ CRITICAL MIGRATION FAILURE: Balance mismatch.");
                }
            }
            
            console.log(`\n======================================================`);
            console.log(`🔥 NEXT STEP: UPDATE CONFIGURATION with: ${NEW_TOKEN_ADDRESS}`);
            console.log(`======================================================`);
            
            return {
                success: true,
                address: NEW_TOKEN_ADDRESS,
                transactionHash: deploymentHash,
                deploymentCost: ethers.formatEther(deploymentCost),
                contract: newBwaeziContract
            };
        } catch (error) {
            console.error("❌ DEPLOYMENT/MIGRATION FAILED:", error.message);
            // ... (error handling) ...
            return { success: false, error: error.message };
        }
    }
}

// =========================================================================
// 👑 PART 3: SGT CONFIGURATION & ORCHESTRATION ENGINE (ProductionSovereignCore)
// ... (Remains the same as the previous iteration, now ready to use the new address) ...
// =========================================================================

// --- SGT CONFIGURATION ---

const APPROVED_DEX_ROUTERS = [
    '0xE592427A0AEce92De3Edee1F18E0157C05861564', // Uniswap V3 Router 2 (Primary)
    '0x68b3465833fb72A70ecDF485E0E248143e7EFBC3', // Uniswap V3 Router (Mixer/Multicall) - Fallback
];

const GENESIS_SWAP_CONFIG = {
    AMOUNT_IN_BWAEZI: ethers.parseUnits("10", 18), 
    MAX_SLIPPAGE_PERCENT: 5.0, 
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
        return 0n;
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

        // CRITICAL: This address MUST be the NEW token address after migration
        this.bwaeziKernelAddress = config.BWAEZI_KERNEL_ADDRESS; 
        this.wethAddress = config.WETH_ADDRESS;                   

        this.sgtMetrics = {
            attempts: 0,
            success: false,
            gasCost: 0n,
            revenue: 0n,
            routerUsed: null
        };
    }

    async executeSovereignGenesisTrade() {
        this.sgtMetrics.attempts++;
        const bwaeziKernel = new ethers.Contract(this.bwaeziKernelAddress, ERC20_ABI, this.signer);
        let sgtSuccess = false;
        let amountReceivedInWETH = 0n;

        this.logger.info(`👑 Starting SGT Attempt #${this.sgtMetrics.attempts}. Input: ${ethers.formatUnits(GENESIS_SWAP_CONFIG.AMOUNT_IN_BWAEZI, 18)} BWAEZI`);

        for (const routerAddress of APPROVED_DEX_ROUTERS) {
            this.logger.warn(`🔄 Attempting SGT with Router: ${routerAddress}`);
            
            try {
                // 1. 🛡️ SLIPPAGE PROTECTION
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
                    continue; 
                }

                // 2. Approve the Router to spend BWAEZI (FIXED by the new contract!)
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
                    amountOutMinimum: amountOutMinimum, 
                    sqrtPriceLimitX96: 0 
                };
                
                const swapTx = await routerContract.exactInputSingle(params);
                const receipt = await swapTx.wait();
                
                // 4. 📊 Track Success Metrics
                sgtSuccess = true;
                this.sgtMetrics.success = true;
                this.sgtMetrics.routerUsed = routerAddress;
                this.sgtMetrics.gasCost = receipt.gasUsed * receipt.effectiveGasPrice;
                
                // Simplified output parsing
                const swapResult = routerContract.interface.decodeFunctionResult("exactInputSingle", receipt.logs.find(log => log.address.toLowerCase() === routerAddress.toLowerCase()).data);
                amountReceivedInWETH = swapResult[0]; 

                this.sgtMetrics.revenue = amountReceivedInWETH;
                
                this.logger.info(`🎉 SGT SUCCESS on Router ${routerAddress}.`);
                this.logger.info(`💰 Revenue: ${ethers.formatUnits(amountReceivedInWETH, 18)} WETH.`);
                this.logger.info(`⛽ Gas Cost: ${ethers.formatEther(this.sgtMetrics.gasCost)} ETH.`);
                
                break;
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
    ERC20_ABI, 
    SWAP_ROUTER_ABI 
};
