// arielsql_suite/aa-deployment-engine.js - FIXED VERSION
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { fileURLToPath } from 'url';

// Node.js path helpers for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IMPROVED Import resolver that handles node_modules properly
function findImports(importPath) {
    try {
        // Handle @openzeppelin imports
        if (importPath.startsWith('@openzeppelin/')) {
            const fullPath = path.resolve(process.cwd(), 'node_modules', importPath);
            if (fs.existsSync(fullPath)) {
                return { contents: fs.readFileSync(fullPath, 'utf8') };
            }
        }
        
        // Handle @account-abstraction imports  
        if (importPath.startsWith('@account-abstraction/')) {
            const fullPath = path.resolve(process.cwd(), 'node_modules', importPath);
            if (fs.existsSync(fullPath)) {
                return { contents: fs.readFileSync(fullPath, 'utf8') };
            }
        }
        
        // Handle relative imports
        if (importPath.startsWith('./') || importPath.startsWith('../')) {
            const fullPath = path.resolve(__dirname, 'contracts', importPath);
            if (fs.existsSync(fullPath)) {
                return { contents: fs.readFileSync(fullPath, 'utf8') };
            }
        }
        
        return { error: `File not found: ${importPath}` };
    } catch (error) {
        return { error: `Error reading ${importPath}: ${error.message}` };
    }
}

/**
 * @notice Compiles the BWAEZIPaymaster.sol contract using Node.js 'solc'.
 */
function compilePaymaster() {
    // Check if node_modules exists
    const nodeModulesPath = path.resolve(process.cwd(), 'node_modules');
    if (!fs.existsSync(nodeModulesPath)) {
        throw new Error(`COMPILATION FAILED: node_modules directory not found at ${nodeModulesPath}. 
        Run 'npm install' to install dependencies first.`);
    }

    const contractPath = path.join(__dirname, 'contracts', 'BWAEZIPaymaster.sol');
    
    if (!fs.existsSync(contractPath)) {
        throw new Error(`COMPILATION FAILED: Contract not found at expected path: ${contractPath}. 
        Ensure you have created the directory 'arielsql_suite/contracts/' and saved BWAEZIPaymaster.sol inside it.`);
    }

    const source = fs.readFileSync(contractPath, 'utf8');

    const input = {
        language: 'Solidity',
        sources: {
            'BWAEZIPaymaster.sol': {
                content: source,
            },
        },
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
            outputSelection: {
                '*': {
                    '*': ['abi', 'evm.bytecode'],
                },
            },
        },
    };

    console.log('🔧 Compiling contract with improved import resolver...');
    
    const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
    
    if (output.errors) {
        const errorList = output.errors.filter(e => e.severity === 'error');
        if (errorList.length > 0) {
            throw new Error(`Solidity Compilation Errors:\n${errorList.map(e => e.formattedMessage).join('\n')}`);
        }
    }

    const contractName = 'BWAEZIPaymaster';
    const compiledContract = output.contracts['BWAEZIPaymaster.sol'][contractName];

    if (!compiledContract) {
        throw new Error(`COMPILATION FAILED: Could not find ${contractName} in compilation output`);
    }

    console.log(`✅ COMPILATION SUCCESS: ${contractName} ABI and Bytecode generated.`);
    return {
        abi: compiledContract.abi,
        bytecode: compiledContract.evm.bytecode.object,
    };
}

// Rest of your deployment function remains the same...
export async function deployERC4337Contracts(provider, signer, config, AASDK) {
    if (!config.PRIVATE_KEY) {
        throw new Error("Cannot deploy contracts: PRIVATE_KEY environment variable is not set.");
    }
    const deployerAddress = signer.address;
    
    console.log(`\n👑 Deployer EOA: ${deployerAddress}. Balance: ${ethers.formatEther(await provider.getBalance(deployerAddress))} ETH.`);

    // --- 1. COMPILE CONTRACT (Node.js Execution) ---
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

    const paymasterContract = await factory.deploy(
        ...constructorArgs,
        { gasLimit: estimatedGas * 15n / 10n } // 50% buffer
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
