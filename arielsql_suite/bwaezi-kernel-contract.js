// arielsql_suite/bwaezi-kernel-contract.js
import { ethers } from 'ethers';
import solc from 'solc'; 

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

    function grantAccess(address user, string memory service) external {
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
            
            // Get current gas price
            const feeData = await this.provider.getFeeData();
            const gasPrice = feeData.gasPrice;
            
            if (!gasPrice) {
                throw new Error("Could not fetch reliable gas price data.");
            }

            // Estimate gas for deployment
            const deployTransaction = await this.factory.getDeployTransaction(...constructorArgs);
            const estimatedGas = await this.provider.estimateGas(deployTransaction);
            
            // Add 20% buffer
            const gasLimit = estimatedGas * 120n / 100n;
            const deploymentOptions = { gasLimit, gasPrice };

            console.log(` ✅ Estimated Gas: ${estimatedGas.toString()}`);
            console.log(` ✅ Final Gas Limit: ${gasLimit.toString()}`);
            console.log(` ⛽ Max Deployment Cost: ${ethers.formatEther(gasLimit * gasPrice)} ETH`);
            
            // Check balance
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
