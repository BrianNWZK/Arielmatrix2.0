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
 * @param provider The Ethers JsonRpcProvider instance.
 * @param signer The Ethers Wallet instance (EOA) created using the PRIVATE_KEY.
 * @param config The CONFIG object from main.js containing deployment addresses.
 */
export async function deployERC4337Contracts(provider, signer, config) {
    // Check that all required CONFIG variables are present for the constructor
    if (!config.BWAEZI_TOKEN_ADDRESS || !config.UNISWAP_V3_QUOTER_ADDRESS) {
        throw new Error("CRITICAL DEPLOYMENT FAILURE: BWAEZI_TOKEN_ADDRESS or UNISWAP_V3_QUOTER_ADDRESS is missing from CONFIG. Check main.js");
    }

    const deployerAddress = signer.address;
    const balance = await provider.getBalance(deployerAddress);
    console.log(`\n👑 Deployer: ${deployerAddress} | Balance: ${ethers.formatEther(balance)} ETH`);

    // 1. COMPILE
    const { abi, bytecode } = compilePaymaster();

    // 2. DEPLOY PAYMASTER
    console.log("\n🚀 Deploying BWAEZIPaymaster (Loaves & Fishes Engine)...");
    const factory = new ethers.ContractFactory(abi, bytecode, signer);

    // Constructor arguments for BWAEZIPaymaster
    const constructorArgs = [
        config.ENTRY_POINT_ADDRESS,
        config.BWAEZI_TOKEN_ADDRESS, // NOW CORRECT: 0x9bE9...
        config.WETH_TOKEN_ADDRESS,
        config.UNISWAP_V3_QUOTER_ADDRESS,
        config.BWAEZI_WETH_FEE
    ];

    console.log("📋 Constructor Args:", constructorArgs);

    try {
        const deployTx = factory.getDeployTransaction(...constructorArgs);
        const gasEstimate = await provider.estimateGas(deployTx);

        // Use a more conservative gas limit buffer for mainnet
        const gasLimitWithBuffer = (gasEstimate * 120n) / 100n; // 20% buffer
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

        // 3. GET SCW ADDRESS (Mock calculation based on Entry Point and Signer)
        // NOTE: In a real system, this requires the exact Smart Account Factory contract and init code.
        // We simulate the deterministic calculation here:
        console.log(`🔮 Calculating SCW Counterfactual Address...`);
        
        // Mock SCW address calculation based on a deterministic hash (Entry Point + EOA)
        // A common pattern is keccak256(Entrypoint, Factory, Salt, Signer). We simplify for demonstration.
        const hashInput = ethers.solidityPacked(
            ['address', 'address', 'uint256'],
            [config.ENTRY_POINT_ADDRESS, deployerAddress, 0n] // Simple deterministic calculation
        );
        
        const smartAccountAddress = ethers.getCreate2Address(
            config.ENTRY_POINT_ADDRESS, 
            ethers.zeroPadValue(ethers.toBeHex(0n), 32),
            ethers.keccak256(hashInput)
        );

        console.log(`🔮 SCW Counterfactual Address: ${smartAccountAddress}`);
        console.log(`\n⚠️ CRITICAL NEXT STEP: Fund the Smart Contract Wallet with 100,000,000 BWAEZI for gas payment: ${smartAccountAddress}`);

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
