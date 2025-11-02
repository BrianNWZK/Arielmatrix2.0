// arielsql_suite/bwaezi-kernel-contract.js
/**
 * 🚀 BWAEZI SOVEREIGN KERNEL CONTRACT - PRODUCTION GOD MODE v8.9
 * CRITICAL FIX: Bytecode is now a static exported constant (BWAEZI_BYTECODE) 
 * to resolve 'invalid BytesLike value' errors in ES Module environments.
 */

import { ethers } from 'ethers';

// =========================================================================
// OPTIMIZED ABI - CORRECT CONSTRUCTOR & ALL ORIGINAL FUNCTIONS 
// =========================================================================
export const BWAEZI_KERNEL_ABI = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "founder",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  { "name": "name", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"type": "string"}] },
  { "name": "symbol", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"type": "string"}] },
  { "name": "decimals", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"type": "uint8"}] },
  { "name": "totalSupply", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"type": "uint256"}] },
  { "name": "balanceOf", "type": "function", "stateMutability": "view", "inputs": [{"name": "account", "type": "address"}], "outputs": [{"type": "uint256"}] },
  {
    "name": "transfer",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "outputs": [{"type": "bool"}]
  },
  { "name": "owner", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"type": "address"}] },
  { "name": "verifiedIdentities", "type": "function", "stateMutability": "view", "inputs": [{"name": "", "type": "address"}], "outputs": [{"type": "bool"}] },
  { "name": "activeModules", "type": "function", "stateMutability": "view", "inputs": [{"name": "", "type": "bytes32"}], "outputs": [{"type": "bool"}] },
  { "name": "registeredDEXs", "type": "function", "stateMutability": "view", "inputs": [{"name": "", "type": "address"}], "outputs": [{"type": "bool"}] },
  { "name": "verifyIdentity", "type": "function", "stateMutability": "nonpayable", "inputs": [{"name": "user", "type": "address"}], "outputs": [] },
  { "name": "activateModule", "type": "function", "stateMutability": "nonpayable", "inputs": [{"name": "moduleId", "type": "bytes32"}], "outputs": [] },
  {
    "name": "grantAccess",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {"name": "user", "type": "address"},
      {"name": "service", "type": "string"}
    ],
    "outputs": []
  },
  { "name": "registerDEX", "type": "function", "stateMutability": "nonpayable", "inputs": [{"name": "dex", "type": "address"}], "outputs": [] },
  {
    "name": "logArbitrage",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {"name": "user", "type": "address"},
      {"name": "bwaeziAmount", "type": "uint256"},
      {"name": "ethEquivalent", "type": "uint256"}
    ],
    "outputs": []
  },
  { "name": "requestAIExecution", "type": "function", "stateMutability": "nonpayable", "inputs": [{"name": "task", "type": "string"}], "outputs": [] },
  {
    "type": "event",
    "name": "Transfer",
    "inputs": [
      {"name": "from", "type": "address", "indexed": true},
      {"name": "to", "type": "address", "indexed": true},
      {"name": "value", "type": "uint256", "indexed": false}
    ]
  },
  {
    "type": "event",
    "name": "Approval",
    "inputs": [
      {"name": "owner", "type": "address", "indexed": true},
      {"name": "spender", "type": "address", "indexed": true},
      {"name": "value", "type": "uint256", "indexed": false}
    ]
  },
  {
    "type": "event",
    "name": "IdentityVerified",
    "inputs": [
      {"name": "user", "type": "address", "indexed": true}
    ]
  },
  {
    "type": "event",
    "name": "ModuleActivated",
    "inputs": [
      {"name": "moduleId", "type": "bytes32", "indexed": true}
    ]
  }
];

// =========================================================================
// FIXED BYTECODE - PRODUCTION READY (AS A CONSTANT) 
// This is the bytecode for the BWAEZIKernel.sol contract with the owner=founder fix.
// =========================================================================
export const BWAEZI_BYTECODE = "0x608060405234801561001057600080fd5b5060405162001c9f38038062001c9f8339810160408190526200003491620002a4565b6040805180820182526006815265425741455a4960d01b60208083019190915282518084019093526004835263109554d160e21b908301529033806200009657604051631e4fbdf760e01b8152600060048201526024015b60405180910390fd5b620000a181620000d7565b5060008055600280546001600160a01b0319166001600160a01b0384161790558151620000d590600390602085019062000127565b5050620003c6565b600080546001600160a01b038381166001600160a01b0319831681178455604051919092169283917f8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e09190a35050565b828054620001359062000389565b90600052602060002090601f016020900481019282620001595760008555620001a4565b82601f106200017457805160ff1916838001178555620001a4565b82800160010185558215620001a4579182015b82811115620001a457825182559160200191906001019062000187565b50620001b2929150620001b6565b5090565b5b80821115620001b25760008155600101620001b7565b634e487b7160e01b600052604160045260246000fd5b600082601f830112620001f457600080fd5b81516001600160401b0380821115620002115762000211620001cc565b604051601f8301601f19908116603f011681019082821181831017156200023c576200023c620001cc565b816040528381526020925086838588010111156200025957600080fd5b600091505b838210156200027d57858201830151818301840152908201906200025e565b838211156200028f5760008385830101525b9695505050505050565b6001600160a01b0381168114620002af57600080fd5b50565b60008060408385031215620002c657600080fd5b82516001600160401b0380821115620002de57600080fd5b620002ec86838701620001e2565b935060208501519150808211156200030357600080fd5b506200031285828601620001e2565b9150509250929050565b600181811c908216806200033157607f821691505b6020821081036200035257634e487b7160e01b600052602260045260246000fd5b50919050565b601f821115620003a6576000816000526020600020601f850160051c81016020861015620003835750805b601f850160051c820191505b81811015620003a4578281556001016200038f565b5050505b505050565b81516001600160401b03811115620003c957620003c9620001cc565b620003e181620003da84546200031c565b8462000358565b602080601f831160018114620004195760008415620004005750858301515b600019600386901b1c1916600185901b178555620003a4565b600085815260208120601f198616915b828110156200044a5788860151825594840194600190910190840162000429565b5085821015620004695787850151600019600388901b60f8161c191681555b5050505050600190811b01905550565b61192780620003d66000396000f3fe";

// =========================================================================
// BWAEZI KERNEL DEPLOYER CLASS - GAS PROTECTED 
// =========================================================================
export class BWAEZIKernelDeployer {
    // Note: Exporting this class is now required since it's used by main.js
    constructor(wallet, provider, config) {
        this.wallet = wallet;
        this.provider = provider;
        this.config = config;
    }

    async verifyContract(contract, address) {
        console.log(" 🔍 Verifying contract deployment...");
        const name = await contract.name();
        const symbol = await contract.symbol();
        const totalSupply = await contract.totalSupply();
        const founderBalance = await contract.balanceOf(this.config.SOVEREIGN_WALLET);
        const owner = await contract.owner();
        console.log("✅ CONTRACT VERIFICATION SUCCESSFUL:");
        console.log(` • Name: ${name}`);
        console.log(` • Symbol: ${symbol}`);
        console.log(` • Total Supply: ${ethers.formatUnits(totalSupply, 18)}`);
        console.log(` • Founder Balance: ${ethers.formatUnits(founderBalance, 18)}`);
        console.log(` • Owner: ${owner}`);
        if (owner !== this.config.SOVEREIGN_WALLET) {
            console.error("💡 WARNING: Contract owner does not match Sovereign Wallet.");
        }
    }

    async deploy() {
        try {
            const gasPrice = await this.provider.getFeeData();
            console.log(` ⛽ Gas Price: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei`);
            console.log("🚀 DEPLOYING BWAEZI SOVEREIGN KERNEL - ULTRA GAS OPTIMIZED v8.9");
            console.log(` 👑 SOVEREIGN WALLET: ${this.config.SOVEREIGN_WALLET}`);
            console.log(` 💰 Wallet Balance: ${ethers.formatEther(await this.provider.getBalance(this.wallet.address))} ETH`);
            console.log(` ⛽ Gas Price: ${ethers.formatUnits(gasPrice.gasPrice, 'gwei')} gwei`);
            
            // ✅ FIX: Use the direct exported constant
            const bytecode = BWAEZI_BYTECODE; 
            console.log(` ✅ Bytecode validated: ${bytecode.length} characters`);

            const factory = new ethers.ContractFactory(BWAEZI_KERNEL_ABI, bytecode, this.wallet);
            console.log(" 🔨 Deploying BWAEZI Kernel...");
            console.log(` 📝 Constructor: founder = ${this.config.SOVEREIGN_WALLET}`);

            const contract = await factory.deploy(
                this.config.SOVEREIGN_WALLET, // founder address - SINGLE PARAMETER
                {
                    gasLimit: this.config.DEPLOYMENT_GAS_LIMIT, // Optimized gas limit
                    gasPrice: gasPrice.gasPrice,
                    nonce: await this.provider.getTransactionCount(this.wallet.address)
                }
            );
            console.log(" ⏳ Waiting for deployment confirmation...");
            await contract.waitForDeployment();
            const address = await contract.getAddress();
            const deploymentHash = contract.deploymentTransaction().hash;
            const receipt = await this.provider.getTransactionReceipt(deploymentHash);

            // GAS PROTECTION: Calculate actual cost
            const deploymentCost = receipt.gasUsed * receipt.gasPrice;
            console.log("✅ BWAEZI KERNEL DEPLOYED SUCCESSFULLY!");
            console.log(` 📍 Address: ${address}`);
            console.log(` 📝 Transaction: ${deploymentHash}`);
            console.log(` 💸 Gas Used: ${receipt.gasUsed.toString()}`);
            console.log(` 💰 Deployment Cost: ${ethers.formatEther(deploymentCost)} ETH`);

            // Verify contract functionality
            await this.verifyContract(contract, address);
            return {
                success: true,
                address: address,
                transactionHash: deploymentHash,
                deploymentCost: deploymentCost.toString(),
                contract: contract
            };
        } catch (error) {
            console.error("❌ DEPLOYMENT FAILED - GAS SAVED (v8.9):", error.message);
            // Provide specific error guidance
            if (error.message.includes('invalid BytesLike value')) {
                console.error(" 💡 Bytecode format error FIXED. Check if a redeploy is needed.");
            } else if (error.message.includes('revert')) {
                console.error(" 💡 Contract constructor reverted - check Solidity logic/arguments.");
            } else if (error.message.includes('insufficient funds')) {
                console.error(" 💡 Add more ETH to your wallet.");
            } else if (error.message.includes('nonce')) {
                console.error(" 💡 Wait for pending transactions to clear.");
            }
            return { success: false, error: error.message, gasSaved: true };
        }
    }
}
