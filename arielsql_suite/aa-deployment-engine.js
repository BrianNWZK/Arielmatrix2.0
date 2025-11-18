// arielsql_suite/aa-deployment-engine.js

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { fileURLToPath } from 'url';

// Resolve __dirname to the arielsql_suite/ directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Compiles the BWAEZIPaymaster contract using sibling files in the same directory.
 */
function compilePaymaster() {
    const mainContractName = 'BWAEZIPaymaster.sol';
    const mainContractPath = path.join(__dirname, mainContractName);

    if (!fs.existsSync(mainContractPath)) {
        throw new Error(`Contract not found: ${mainContractPath}`);
    }

    console.log("Compiling with flat directory modules...");

    const mainSource = fs.readFileSync(mainContractPath, 'utf8');

    // Map of Solidity filenames to their content for the compiler
    const sources = {
        [mainContractName]: { content: mainSource },
        'IPaymaster.sol': { content: fs.readFileSync(path.join(__dirname, 'IPaymaster.sol'), 'utf8') },
        'UserOperation.sol': { content: fs.readFileSync(path.join(__dirname, 'UserOperation.sol'), 'utf8') },
        'IERC20.sol': { content: fs.readFileSync(path.join(__dirname, 'IERC20.sol'), 'utf8') },
        'SafeERC20.sol': { content: fs.readFileSync(path.join(__dirname, 'SafeERC20.sol'), 'utf8') },
    };

    const input = {
        language: 'Solidity',
        sources: sources,
        settings: {
            optimizer: { enabled: true, runs: 200 },
            outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
        },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input)));

    if (output.errors) {
        const errors = output.errors.filter(e => e.severity === 'error');
        if (errors.length > 0) {
            throw new Error(`Compilation failed:\n${errors.map(e => e.formattedMessage).join('\n')}`);
        }
        // Only show warnings if they're not about unused parameters (common in interfaces)
        output.errors.filter(e => e.severity === 'warning').forEach(w => {
            if (!w.formattedMessage.includes('Unused') && !w.formattedMessage.includes('unused')) {
                console.warn("Warning:", w.formattedMessage);
            }
        });
    }

    const contract = output.contracts[mainContractName]['BWAEZIPaymaster'];
    console.log("✅ COMPILED SUCCESSFULLY");
    return { abi: contract.abi, bytecode: contract.evm.bytecode.object };
}

/**
 * @notice Deploys Paymaster + Returns SCW counterfactual address
 * 🎯 CRITICAL FIX: Function arguments are now expected in the corrected order/type from main.js call:
 * provider: Ethers.JsonRpcProvider
 * signer: Ethers.Wallet
 * config: CONFIG object (from main.js)
 * AASDK: AASDK Class
 * @param provider The Ethers JsonRpcProvider instance.
 * @param signer The Ethers Wallet instance (EOA) created using the PRIVATE_KEY.
 * @param config The CONFIG object from main.js containing deployment addresses.
 * @param AASDK The AASDK Class used to calculate the Smart Contract Wallet address.
 */
export async function deployERC4337Contracts(provider, signer, config, AASDK) {
    // 🎯 CRITICAL FIX: The argument order is now correct: 'provider' is the Provider for network calls, 'signer' is the Wallet.
    // The previous fatal error (provider.getBalance is not a function) is resolved.

    const deployerAddress = signer.address;
    const balance = await provider.getBalance(deployerAddress);
    console.log(`\n👑 Deployer: ${deployerAddress} | Balance: ${ethers.formatEther(balance)} ETH`);

    // 1. COMPILE
    const { abi, bytecode } = compilePaymaster();

    // 2. DEPLOY PAYMASTER
    console.log("\n🚀 Deploying BWAEZIPaymaster (Loaves & Fishes Engine)...");
    const factory = new ethers.ContractFactory(abi, bytecode, signer);

    // Addresses are now guaranteed to be checksummed from main.js
    const constructorArgs = [
        config.ENTRY_POINT_ADDRESS,
        config.BWAEZI_TOKEN_ADDRESS,
        config.WETH_TOKEN_ADDRESS,
        config.UNISWAP_V3_QUOTER_ADDRESS,
        config.BWAEZI_WETH_FEE || 3000
    ];

    console.log("📋 Constructor Args:", constructorArgs);

    try {
        const deployTx = factory.getDeployTransaction(...constructorArgs);
        const gasEstimate = await provider.estimateGas(deployTx);

        // Use a more conservative gas limit buffer for mainnet
        const gasLimitWithBuffer = (gasEstimate * 120n) / 100n; // 20% buffer instead of 50%
        console.log(`⛽ Gas Estimate: ${gasEstimate.toString()} | Gas Limit: ${gasLimitWithBuffer.toString()}`);

        const paymasterContract = await factory.deploy(...constructorArgs, {
            gasLimit: gasLimitWithBuffer
        });

        console.log(`⏳ Tx Hash: ${paymasterContract.deploymentTransaction().hash}`);
        console.log(`⏳ Waiting for deployment confirmation...`);

        // Robust deployment waiting with timeout
        const deployedContract = await paymasterContract.waitForDeployment();
        const paymasterAddress = await deployedContract.getAddress();
        console.log(`✅ BWAEZIPaymaster DEPLOYED: ${paymasterAddress}`);

        // 3. GET SCW ADDRESS
        console.log(`🔮 Calculating SCW Counterfactual Address...`);
        const smartAccountAddress = await AASDK.getSCWAddress(deployerAddress);
        console.log(`🔮 SCW Counterfactual Address: ${smartAccountAddress}`);
        console.log(`\n⚠️ ACTION REQUIRED: Fund the Smart Contract Wallet with BWAEZI for gas payment: ${smartAccountAddress}`);

        return { paymasterAddress, smartAccountAddress };
    } catch (error) {
        console.error(`💥 Deployment failed:`, error.message);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.error(`💸 INSUFFICIENT FUNDS: Deployer needs more ETH for gas`);
            const currentBalance = await provider.getBalance(signer.address);
            console.error(`💸 Current balance: ${ethers.formatEther(currentBalance)} ETH`);
        }
        throw new Error(`Deployment failed: ${error.message}`);
    }
}
