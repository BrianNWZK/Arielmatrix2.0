// arielsql_suite/aa-deployment-engine.js - The Node.js Compiler and Deployment Engine
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import solc from 'solc';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ────────────────────────────────────────────────────────────────
// 🔧 FULLY FIXED IMPORT RESOLVER (Handles @openzeppelin & @account-abstraction)
// ────────────────────────────────────────────────────────────────
function findImports(importPath) {
    try {
        let resolvedPath;

        // Case 1: @openzeppelin/contracts/...
        if (importPath.startsWith('@openzeppelin/')) {
            resolvedPath = path.resolve(__dirname, '..', 'node_modules', importPath);
        }
        // Case 2: @account-abstraction/contracts/...
        else if (importPath.startsWith('@account-abstraction/')) {
            resolvedPath = path.resolve(__dirname, '..', 'node_modules', importPath);
        }
        // Case 3: Relative paths (should not happen, but safe)
        else if (importPath.startsWith('./') || importPath.startsWith('../')) {
            resolvedPath = path.resolve(path.dirname(contractPath), importPath);
        }
        else {
            return { error: `Unsupported import: ${importPath}` };
        }

        // Ensure .sol extension if missing
        if (!resolvedPath.endsWith('.sol')) {
            resolvedPath += '.sol';
        }

        if (fs.existsSync(resolvedPath)) {
            return { contents: fs.readFileSync(resolvedPath, 'utf8') };
        } else {
            return { error: `File not found: ${resolvedPath}` };
        }
    } catch (err) {
        return { error: `Import failed: ${err.message}` };
    }
}

// Store contract path globally for import callback
let contractPath;

/**
 * @notice Compiles the BWAEZIPaymaster.sol contract using Node.js 'solc'.
 */
function compilePaymaster() {
    contractPath = path.join(__dirname, 'contracts', 'BWAEZIPaymaster.sol');
    
    if (!fs.existsSync(contractPath)) {
        throw new Error(`COMPILATION FAILED: Contract not found at: ${contractPath}\n` +
            `Ensure 'arielsql_suite/contracts/BWAEZIPaymaster.sol' exists.`);
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
            optimizer: { enabled: true, runs: 200 },
            outputSelection: { '*': { '*': ['abi', 'evm.bytecode'] } },
        },
    };

    console.log("🔧 Compiling BWAEZIPaymaster.sol with full import resolution...");

    const output = JSON.parse(
        solc.compile(JSON.stringify(input), { import: findImports })
    );

    // Print warnings (non-fatal)
    if (output.errors) {
        const warnings = output.errors.filter(e => e.severity === 'warning');
        const errors = output.errors.filter(e => e.severity === 'error');

        if (warnings.length > 0) {
            console.warn("⚠️ Compilation Warnings:\n", warnings.map(w => w.formattedMessage).join('\n'));
        }

        if (errors.length > 0) {
            throw new Error(`❌ SOLIDITY ERRORS:\n${errors.map(e => e.formattedMessage).join('\n')}`);
        }
    }

    const contractName = 'BWAEZIPaymaster';
    const compiled = output.contracts['BWAEZIPaymaster.sol'][contractName];

    console.log(`✅ COMPILED: ${contractName} → ABI + Bytecode ready.`);
    return {
        abi: compiled.abi,
        bytecode: compiled.evm.bytecode.object,
    };
}

/**
 * @notice Deploys Paymaster + Returns SCW counterfactual address
 */
export async function deployERC4337Contracts(provider, signer, config, AASDK) {
    if (!config.PRIVATE_KEY) {
        throw new Error("PRIVATE_KEY not set in environment.");
    }

    const deployerAddress = signer.address;
    console.log(`\n👑 Deployer: ${deployerAddress} | Balance: ${ethers.formatEther(await provider.getBalance(deployerAddress))} ETH`);

    // 1. COMPILE
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

    const deployTx = factory.getDeployTransaction(...constructorArgs);
    const gasEstimate = await provider.estimateGas(deployTx);
    console.log(`⛽ Gas Estimate: ${gasEstimate.toString()} (~${ethers.formatUnits(gasEstimate * 20n, 'gwei')} Gwei @ 20 gwei)`);

    const paymasterContract = await factory.deploy(...constructorArgs, {
        gasLimit: gasEstimate + gasEstimate / 2n // 50% buffer
    });

    console.log(`⏳ Tx Hash: ${paymasterContract.deploymentTransaction().hash}`);
    await paymasterContract.waitForDeployment();

    const paymasterAddress = await paymasterContract.getAddress();
    console.log(`✅ BWAEZIPaymaster DEPLOYED: ${paymasterAddress}`);

    // 3. GET SCW ADDRESS
    const smartAccountAddress = await AASDK.getSCWAddress(deployerAddress);
    console.log(`🔮 SCW Counterfactual Address: ${smartAccountAddress}`);
    console.log(`\n⚠️  ACTION REQUIRED: Send 100,000,000 BWAEZI → ${smartAccountAddress}`);

    return { paymasterAddress, smartAccountAddress };
}
