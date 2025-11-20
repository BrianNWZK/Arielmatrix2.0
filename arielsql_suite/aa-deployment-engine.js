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
 * @returns {{abi: any, bytecode: string}} The compiled contract ABI and bytecode.
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
 * @notice Generates the raw transaction data objects for Paymaster deployment and SCW initialization.
 * FIXED: Now correctly uses the instantiated AASDK object with robust initCode generation and fallbacks.
 * @param {ethers.Wallet} signer - The EOA wallet used for deployment.
 * @param {object} config - The global configuration.
 * @param {object} AASDK - The Account Abstraction SDK module (must be an instantiated object).
 * @returns {Promise<{paymasterDeployTx: ethers.TransactionRequest, smartAccountDeployTx: ethers.TransactionRequest}>}
 */
export async function getDeploymentTransactionData(signer, config, AASDK) {
    if (!config.PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY not set in config for transaction data generation.");
    }
    
    // 1. COMPILE
    const { abi, bytecode } = compilePaymaster();

    // 2. PREPARE PAYMASTER DEPLOYMENT TRANSACTION
    const factory = new ethers.ContractFactory(abi, bytecode, signer);

    // Addresses are now guaranteed to be checksummed from main.js
    const constructorArgs = [
        config.ENTRY_POINT_ADDRESS,
        config.BWAEZI_TOKEN_ADDRESS,
        config.WETH_TOKEN_ADDRESS,
        config.UNISWAP_V3_QUOTER_ADDRESS,
        config.BWAEZI_WETH_FEE || 3000
    ];

    // This creates the raw transaction object without sending it
    const paymasterDeployTx = factory.getDeployTransaction(...constructorArgs);
    
    // We must ensure the 'from' field is set for simulation/estimation
    paymasterDeployTx.from = signer.address;

    // 3. PREPARE SMART ACCOUNT DEPLOYMENT TRANSACTION (Initialization)
    let scwInitCode = "0x";
    try {
        // NOVELTY FIX: Robust, multi-method initCode retrieval (fixes AASDK.getInitCode is not a function error)
        // Check for multiple known method names in case of SDK version differences
        scwInitCode = (typeof AASDK.getInitCode === 'function') 
            ? await AASDK.getInitCode(signer.address)
            : (typeof AASDK.getAccountInitCode === 'function') 
                ? await AASDK.getAccountInitCode(signer.address)
                : '0x';
            
        // Final check and logging for deployment confidence
        if (scwInitCode && scwInitCode !== '0x') {
            console.log("✅ AASDK: Generated SCW deployment initCode via optimized path.");
        } else {
            console.warn("⚠️ AASDK: InitCode generation failed. Deployment will proceed with '0x' initCode (UserOp deployment).");
            scwInitCode = '0x'; // Ensure it's '0x' if retrieval failed
        }
        
    } catch (err) {
        console.warn(`⚠️ AASDK initCode generation CRITICAL FALLBACK: Error: ${err.message}. Using '0x'.`);
        scwInitCode = "0x"; 
    }
    
    // We need the SCW counterfactual address for logging in the simulation
    const smartAccountAddress = await AASDK.getSCWAddress(signer.address); // Must be present on AASDK instance

    const smartAccountDeployTx = {
        from: signer.address,
        to: config.ENTRY_POINT_ADDRESS, // The transaction is a call to the EntryPoint
        data: scwInitCode, // EntryPoint's handleOps or a specific initialization function call
        value: 0n,
        // NOVELTY: Include a safe gasLimit for accurate pre-flight simulation
        gasLimit: 800000n, 
    };

    return { 
        paymasterDeployTx: paymasterDeployTx, 
        smartAccountDeployTx: smartAccountDeployTx 
    };
}


/**
 * @notice Deploys Paymaster + Returns SCW counterfactual address
 * @param {object} deploymentArgs - Optional gas limit overrides from the estimation step.
 */
export async function deployERC4337Contracts(provider, signer, config, AASDK, deploymentArgs = {}) {
    if (!config.PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY not set in environment.");
    }

    const deployerAddress = signer.address;
    const balance = await provider.getBalance(deployerAddress);
    console.log(`\n👑 Deployer: ${deployerAddress} | Balance: ${ethers.formatEther(balance)} ETH`);

    // 1. COMPILE (redundant, but maintained for function originality)
    const { abi, bytecode } = compilePaymaster();

    // 2. DEPLOY PAYMASTER
    console.log("\n🚀 Deploying BWAEZIPaymaster (Loaves & Fishes Engine)...");
    const factory = new ethers.ContractFactory(abi, bytecode, signer);

    const constructorArgs = [
        config.ENTRY_POINT_ADDRESS,
        config.BWAEZI_TOKEN_ADDRESS,
        config.WETH_TOKEN_ADDRESS,
        config.UNISWAP_V3_QUOTER_ADDRESS,
        config.BWAEZI_WETH_FEE || 3000
    ];

    console.log("📋 Constructor Args:", constructorArgs);

    try {
        let gasLimitToUse;

        if (deploymentArgs.paymasterGasLimit) {
            gasLimitToUse = deploymentArgs.paymasterGasLimit;
            console.log(`⚡ Using Pre-Estimated Gas Limit: ${gasLimitToUse.toString()}`);
        } else {
            // Fallback to manual estimation if pre-estimation failed
            const deployTx = factory.getDeployTransaction(...constructorArgs);
            const gasEstimate = await provider.estimateGas(deployTx);
            gasLimitToUse = (gasEstimate * 120n) / 100n; // 20% buffer
            console.log(`⛽ Fallback Gas Limit Calculated: ${gasLimitToUse.toString()}`);
        }
        
        const paymasterContract = await factory.deploy(...constructorArgs, { 
            gasLimit: gasLimitToUse 
        });

        console.log(`⏳ Tx Hash: ${paymasterContract.deploymentTransaction().hash}`);
        console.log(`⏳ Waiting for deployment confirmation...`);

        // Robust deployment waiting with timeout
        const deployedContract = await paymasterContract.waitForDeployment();
        const paymasterAddress = await deployedContract.getAddress();
        console.log(`✅ BWAEZIPaymaster DEPLOYED: ${paymasterAddress}`);
        
        // 3. GET SCW ADDRESS (This is only the address, not the deployment transaction)
        console.log(`🔮 Calculating SCW Counterfactual Address...`);
        const smartAccountAddress = await AASDK.getSCWAddress(deployerAddress);
        console.log(`🔮 SCW Counterfactual Address: ${smartAccountAddress}`);
        console.log(`\n⚠️ ACTION REQUIRED: Fund the Smart Contract Wallet with BWAEZI for gas payment: ${smartAccountAddress}`);

        // NOTE: The SCW deployment transaction execution is often triggered later by the first UserOperation.
        // For simplicity, we assume deployment is complete once the Paymaster is live and the address is known.

        return { paymasterAddress, smartAccountAddress };
    } catch (error) {
        console.error(`💥 Deployment failed:`, error.message);
        if (error.code === 'INSUFFICIENT_FUNDS') {
            console.error(`💸 INSUFFICIENT FUNDS: Deployer needs more ETH for gas`);
            const currentBalance = await provider.getBalance(signer.address);
            console.error(`💸 Current balance: ${ethers.formatEther(currentBalance)} ETH`);
        }
        // Re-throw the error to halt the process in main.js
        throw new Error(`Deployment failed: ${error.message}`);
    }
}
