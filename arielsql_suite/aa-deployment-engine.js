// arielsql_suite/aa-deployment-engine.js - The Node.js Compiler and Deployment Engine
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import solc from 'solc';

// Helper to resolve Node_modules imports for solc
function findImports(relativePath) {
    if (relativePath.startsWith('@')) {
        const fullPath = path.resolve('node_modules', relativePath);
        if (fs.existsSync(fullPath)) {
            return { contents: fs.readFileSync(fullPath, 'utf8') };
        }
    }
    // Handle local imports if any
    return { error: 'File not found' };
}

/**
 * @notice Compiles the BWAEZIPaymaster.sol contract using Node.js 'solc'.
 */
function compilePaymaster() {
    const contractPath = path.resolve('contracts', 'BWAEZIPaymaster.sol');
    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'BWAEZIPaymaster.sol': {
                content: source,
            },
        },
        settings: {
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode'],
                },
            },
        },
    };

    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
    
    const contractName = 'BWAEZIPaymaster';
    const compiledContract = output.contracts['BWAEZIPaymaster.sol'][contractName];

    if (!compiledContract || !compiledContract.evm || !compiledContract.evm.bytecode) {
        throw new Error(`Solidity Compilation Failed for ${contractName}: ${output.errors ? output.errors.map(e => e.formattedMessage).join('\n') : 'Unknown Error'}`);
    }

    console.log(`✅ COMPILATION SUCCESS: ${contractName} ABI and Bytecode generated.`);
    return {
        abi: compiledContract.abi,
        bytecode: compiledContract.evm.bytecode.object,
    };
}


/**
 * @notice Executes the deployment of the Smart Contract Wallet and BWAEZI Paymaster.
 */
export async function deployERC4337Contracts(provider, signer, config, AASDK) {
    const deployerAddress = signer.address;

    // --- 1. COMPILE CONTRACT ---
    const { abi, bytecode } = compilePaymaster();
    
    // --- 2. DEPLOY THE BWAEZI PAYMASTER CONTRACT ---
    console.log("👑 2. Deploying BWAEZIPaymaster (Loaves and Fishes Engine)...");
    
    const factory = new ethers.ContractFactory(abi, bytecode, signer);
    
    const constructorArgs = [
        config.ENTRY_POINT_ADDRESS,
        config.BWAEZI_TOKEN_ADDRESS,
        config.WETH_TOKEN_ADDRESS,
        config.UNISWAP_V3_QUOTER_ADDRESS,
        config.BWAEZI_WETH_FEE
    ];
    
    const deployTx = factory.getDeployTransaction(...constructorArgs);
    const estimatedGas = await provider.estimateGas(deployTx);
    console.log(`🔍 Deployment Gas Estimate: ${ethers.formatUnits(estimatedGas, 'gwei')} Gwei`);

    // WARNING: THIS IS THE ONE-TIME EOA GAS FEE. Ensure 0.015 ETH+ is in the EOA.
    const paymasterContract = await factory.deploy(
        ...constructorArgs,
        { gasLimit: estimatedGas * 15n / 10n } // 50% buffer for live Mainnet deployment
    );

    console.log(`🔄 Awaiting BWAEZIPaymaster deployment... Tx: ${paymasterContract.deploymentTransaction().hash}`);
    await paymasterContract.waitForDeployment();
    
    const paymasterAddress = await paymasterContract.getAddress();
    console.log(`✅ BWAEZIPaymaster Deployed at: ${paymasterAddress}`);
    
    // --- 3. DETERMINE SMART CONTRACT WALLET ADDRESS (Counterfactual) ---
    const smartAccountAddress = await AASDK.getSCWAddress(deployerAddress);
    
    console.log(`✅ Smart Contract Wallet Address (Counterfactual): ${smartAccountAddress}`);
    console.log(`\n⚠️ CRITICAL ACTION: TRANSFER BWAEZI TO SCW: Send your 100,000,000 BWAEZI to: ${smartAccountAddress}`);

    return { paymasterAddress, smartAccountAddress };
}
