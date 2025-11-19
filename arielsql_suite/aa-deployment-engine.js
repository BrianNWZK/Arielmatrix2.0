// arielsql_suite/aa-deployment-engine.js

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { fileURLToPath } from 'url';

// Resolve __dirname to the arielsql_suite/ directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ... (compilePaymaster function is retained, it is correct) ...
function compilePaymaster() {
    // ... (compilation logic remains unchanged) ...
    const mainContractName = 'BWAEZIPaymaster.sol';
    const mainContractPath = path.join(__dirname, mainContractName);
    // ... (compilation setup) ...
    const output = JSON.parse(solc.compile(JSON.stringify(input)));
    // ... (error/warning handling) ...
    const contract = output.contracts[mainContractName]['BWAEZIPaymaster'];
    console.log("✅ COMPILED SUCCESSFULLY");
    return { abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

/**
 * @notice Deploys Paymaster + Returns SCW counterfactual address
 * @param provider The Ethers JsonRpcProvider instance.
 * @param signer The Ethers Wallet instance (EOA) created using the PRIVATE_KEY.
 * @param config The CONFIG object from main.js containing deployment addresses.
 */
export async function deployERC4337Contracts(provider, signer, config) {
    if (!config.BWAEZI_TOKEN_ADDRESS || !config.UNISWAP_V3_QUOTER_ADDRESS || !config.BWAEZI_WETH_FEE) {
        throw new Error("CRITICAL DEPLOYMENT FAILURE: Required Paymaster config (Token, Quoter, or Fee) is missing. Check main.js");
    }

    const deployerAddress = signer.address;
    const balance = await provider.getBalance(deployerAddress);
    console.log(`\n👑 Deployer: ${deployerAddress} | Balance: ${ethers.formatEther(balance)} ETH`);

    // 1. COMPILE
    const { abi, bytecode } = compilePaymaster();

    // 2. DEPLOY PAYMASTER
    console.log("\n🚀 Deploying BWAEZIPaymaster (Loaves & Fishes Engine)...");
    const factory = new ethers.ContractFactory(abi, bytecode, signer);

    // Constructor arguments for BWAEZIPaymaster (now using the correct 0x9bE9 address)
    const constructorArgs = [
        config.ENTRY_POINT_ADDRESS,
        config.BWAEZI_TOKEN_ADDRESS, 
        config.WETH_TOKEN_ADDRESS,
        config.UNISWAP_V3_QUOTER_ADDRESS,
        config.BWAEZI_WETH_FEE
    ];

    console.log("📋 Constructor Args:", constructorArgs);

    try {
        const deployTx = factory.getDeployTransaction(...constructorArgs);
        const gasEstimate = await provider.estimateGas(deployTx);
        const gasLimitWithBuffer = (gasEstimate * 120n) / 100n; // 20% buffer

        console.log(`⛽ Gas Estimate: ${gasEstimate.toString()} | Gas Limit: ${gasLimitWithBuffer.toString()}`);

        const paymasterContract = await factory.deploy(...constructorArgs, {
            gasLimit: gasLimitWithBuffer
        });

        console.log(`⏳ Tx Hash: ${paymasterContract.deploymentTransaction().hash}`);
        console.log(`⏳ Waiting for deployment confirmation...`);

        const deployedContract = await paymasterContract.waitForDeployment();
        const paymasterAddress = await deployedContract.getAddress();
        console.log(`✅ BWAEZIPaymaster DEPLOYED: ${paymasterAddress}`);

        // 3. GET SCW ADDRESS
        console.log(`🔮 Calculating SCW Counterfactual Address...`);
        
        // This calculation is deterministic (no transaction required)
        const hashInput = ethers.solidityPacked(
            ['address', 'address', 'uint256'],
            [config.ENTRY_POINT_ADDRESS, deployerAddress, 0n] 
        );
        
        const smartAccountAddress = ethers.getCreate2Address(
            config.ENTRY_POINT_ADDRESS, 
            ethers.zeroPadValue(ethers.toBeHex(0n), 32),
            ethers.keccak256(hashInput)
        );

        console.log(`🔮 SCW Counterfactual Address: ${smartAccountAddress}`);
        
        return { paymasterAddress, smartAccountAddress };
    } catch (error) {
        console.error(`💥 Deployment failed:`, error.message);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.error(`💸 INSUFFICIENT FUNDS: Deployer needs more ETH for gas`);
        }
        throw new Error(`Deployment failed: ${error.message}`);
    }
}
