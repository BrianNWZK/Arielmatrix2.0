// arielsql_suite/bwaezi-kernel-contract.js
import { ethers } from 'ethers';
// Note: We use the node built-in 'solc' or equivalent package here.
import solc from 'solc'; 

// The simplified, robust, and correctly initialized ERC-20 contract
const BWAEZI_SOL_SOURCE = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract BWAEZIKernel {
    string public name = "BWAEZI";
    string public symbol = "bwzC";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    address public owner;
    mapping(address => uint256) public balanceOf;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Mint(address indexed to, uint256 amount);

    // CRITICAL FIX: Constructor accepts sovereign address and assigns owner correctly
    constructor(address _sovereignWallet) {
        owner = _sovereignWallet; 
        
        // Fixed initial supply (100 Million) for minimal gas complexity
        uint256 initialSupply = 100000000 * 10 ** uint256(decimals); 
        totalSupply = initialSupply;
        balanceOf[_sovereignWallet] = initialSupply;

        emit Mint(_sovereignWallet, initialSupply);
        emit Transfer(address(0), _sovereignWallet, initialSupply);
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
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
        console.log("⚙️ COMPILING BWAEZI KERNEL (Dynamic Mode)...");
        const input = {
            language: 'Solidity',
            sources: { 'BWAEZI.sol': { content: BWAEZI_SOL_SOURCE } },
            settings: { outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } } }
        };

        const output = JSON.parse(solc.compile(JSON.stringify(input)));
        const contractOutput = output.contracts['BWAEZI.sol'].BWAEZIKernel;

        if (!contractOutput || output.errors) {
            const error = output.errors ? output.errors.map(e => e.formattedMessage).join('\n') : 'Unknown compilation error.';
            throw new Error(`Compilation Failed: ${error}`);
        }

        const bytecode = contractOutput.evm.bytecode.object;
        const abi = contractOutput.abi;

        // Factory ready to deploy with the single constructor argument
        this.factory = new ethers.ContractFactory(abi, bytecode, this.wallet);
        console.log("✅ Contract compiled successfully. Bytecode ready.");
    }

    async deploy() {
        if (!this.factory) {
            await this.compileAndPrepare();
        }

        const sovereignWallet = this.config.SOVEREIGN_WALLET;
        const constructorArgs = [sovereignWallet];
        let deploymentCost = ethers.toBigInt(0);

        try {
            console.log("🔒 PHASE 1: PRE-DEPLOYMENT GAS ESTIMATION (No ETH Spent on Revert)");
            // 🏆 GUARANTEE: If the contract logic reverts, this line will throw (revert) locally,
            // preventing the wallet.sendTransaction call from ever happening.
            const estimatedGas = await this.factory.getDeployTransaction(...constructorArgs).then(tx => {
                 return this.provider.estimateGas(tx);
            });
            
            const gasPrice = await this.provider.getFeeData().then(data => data.gasPrice);
            if (!gasPrice) {
                throw new Error("Could not fetch reliable gas price data.");
            }

            // Add a 20% buffer to the estimated gas for safety
            const gasLimit = estimatedGas + (estimatedGas / ethers.toBigInt(5)); 
            const deploymentOptions = { gasLimit, gasPrice };

            console.log(` ✅ Estimated Gas: ${estimatedGas.toString()}`);
            console.log(` ✅ Final Gas Limit (with buffer): ${gasLimit.toString()}`);
            console.log(` ⛽ Max Deployment Cost (Approx): ${ethers.formatEther(gasLimit * gasPrice)} ETH`);
            
            console.log("🚀 PHASE 2: FINAL DEPLOYMENT TRANSACTION (On-chain execution)");
            // If we reach here, Phase 1 succeeded, and the transaction is expected to pass.
            const contract = await this.factory.deploy(sovereignWallet, deploymentOptions);

            console.log("⏳ Waiting for deployment confirmation...");
            const receipt = await contract.deploymentTransaction().wait();

            const address = receipt.contractAddress;
            const deploymentHash = receipt.hash;
            deploymentCost = receipt.gasUsed * receipt.gasPrice;

            return {
                success: true,
                address: address,
                transactionHash: deploymentHash,
                deploymentCost: ethers.formatEther(deploymentCost),
                contract: contract
            };
        } catch (error) {
            // A Phase 1 error message will contain the revert reason, and no gas was consumed on-chain.
            console.error("❌ DEPLOYMENT FAILED:", error.message);
            console.log("⚠️ WARNING: Check the log above. If it failed in 'PHASE 1', no ETH was spent on a failed on-chain transaction.");

            if (error.message.includes('insufficient funds')) {
                throw new Error("FATAL: Wallet balance is less than required for the final Phase 2 transaction.");
            }
            return { success: false, error: error.message };
        }
    }
}
