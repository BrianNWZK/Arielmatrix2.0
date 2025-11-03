import { ethers } from 'ethers';

// ✅ SIMPLIFIED ABI - NO CONSTRUCTOR PARAMS
export const BWAEZI_KERNEL_ABI = [
  { "name": "name", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"type": "string"}] },
  { "name": "symbol", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"type": "string"}] },
  { "name": "decimals", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"type": "uint8"}] },
  { "name": "totalSupply", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"type": "uint256"}] },
  { "name": "balanceOf", "type": "function", "stateMutability": "view", "inputs": [{"name": "account", "type": "address"}], "outputs": [{"type": "uint256"}] },
  { "name": "owner", "type": "function", "stateMutability": "view", "inputs": [], "outputs": [{"type": "address"}] },
  {
    "name": "transfer",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {"name": "to", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "outputs": [{"type": "bool"}]
  }
];

export class BWAEZIKernelDeployer {
    constructor(wallet, provider, config) {
        this.wallet = wallet;
        this.provider = provider;
        this.config = config;
    }

    async deploy() {
        try {
            console.log("🚀 DEPLOYING BWAEZI KERNEL - FIXED VERSION");
            console.log(` 👑 Sovereign: ${this.config.SOVEREIGN_WALLET}`);
            
            // ✅ DYNAMIC BYTECODE GENERATION - NO STATIC BYTECODE ERRORS
            const compiler = await import('solc');
            const fs = await import('fs');
            
            const contractSource = `
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

    constructor() {
        owner = 0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA;
        uint256 initialSupply = 100_000_000 * 10 ** uint256(decimals);
        totalSupply = initialSupply;
        balanceOf[0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA] = initialSupply;
        emit Mint(0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA, initialSupply);
        emit Transfer(address(0), 0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA, initialSupply);
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }
}`;

            // Compile contract
            const input = {
                language: 'Solidity',
                sources: {
                    'BWAEZI.sol': {
                        content: contractSource
                    }
                },
                settings: {
                    outputSelection: {
                        '*': {
                            '*': ['*']
                        }
                    }
                }
            };

            const output = JSON.parse(compiler.compile(JSON.stringify(input)));
            const bytecode = output.contracts['BWAEZI.sol'].BWAEZIKernel.evm.bytecode.object;
            const abi = output.contracts['BWAEZI.sol'].BWAEZIKernel.abi;

            console.log("✅ Contract compiled successfully");
            console.log(` 📏 Bytecode length: ${bytecode.length}`);

            const factory = new ethers.ContractFactory(abi, bytecode, this.wallet);
            
            console.log(" 🔨 Deploying...");
            const contract = await factory.deploy({
                gasLimit: 4000000,
                gasPrice: await this.provider.getFeeData().then(data => data.gasPrice)
            });

            console.log(" ⏳ Waiting for deployment...");
            await contract.waitForDeployment();
            
            const address = await contract.getAddress();
            const receipt = await contract.deploymentTransaction().wait();

            console.log("🎉 DEPLOYMENT SUCCESS!");
            console.log(` 📍 Contract Address: ${address}`);
            console.log(` 💰 Gas Used: ${receipt.gasUsed.toString()}`);
            
            // Verify minting
            const balance = await contract.balanceOf(this.config.SOVEREIGN_WALLET);
            console.log(` ✅ 100M BWAEZI Minted: ${ethers.formatUnits(balance, 18)} tokens`);

            return {
                success: true,
                address: address,
                contract: contract
            };

        } catch (error) {
            console.error("❌ DEPLOYMENT FAILED:", error.message);
            return { success: false, error: error.message };
        }
    }
}
