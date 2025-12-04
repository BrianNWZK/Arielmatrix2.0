// arielsql_suite/scripts/deploy-paymaster.js
import { ethers } from "ethers";
import { createRequire } from 'node:module';
import * as path from 'path';
import * as fs from 'fs';

const require = createRequire(import.meta.url);

// --- ARTIFACT PATH CHECK ---
const ARTIFACT_FILE_NAME = "BWAEZIPaymaster.json";
// Dynamically resolve the absolute path to the artifact
// path.dirname(import.meta.url) is the directory of the current file (scripts/)
const ARTIFACT_PATH_ABSOLUTE = path.join(path.dirname(import.meta.url).replace('file://', ''), ARTIFACT_FILE_NAME);

console.log(`\n--- DEPLOYMENT START ---`);
console.log(`📂 Checking for artifact at absolute path: ${ARTIFACT_PATH_ABSOLUTE}`);

let PaymasterArtifact;
try {
    // 1. Explicitly check if the file exists on the filesystem
    if (!fs.existsSync(ARTIFACT_PATH_ABSOLUTE)) {
        throw new Error(`ARTIFACT FILE IS MISSING. Compilation (npm run compile-contracts) failed or the file was not written.`);
    }
    
    // 2. Use require() with the simple local path (which works if the file exists)
    PaymasterArtifact = require(`./${ARTIFACT_FILE_NAME}`);
    console.log('✅ Artifact loaded successfully.');
} catch (e) {
    console.error(`\n❌ FATAL DEPLOYMENT ERROR: Artifact could not be loaded.`);
    console.error('Error Details:', e.message);
    console.error('ACTION REQUIRED: Re-check the output of "npm run compile-contracts" for Solc errors.');
    throw e;
}

/**
 * Deploys the BWAEZIPaymaster contract
 * @param {ethers.Wallet} wallet - Ethers Wallet with provider already attached
 * @returns {Promise<string>} The deployed contract address
 */
export async function deployPaymaster(wallet) {
    const deployerAddress = await wallet.getAddress();
    console.log(`🚀 Deploying Paymaster with deployer: ${deployerAddress}`);
    
    const balance = await wallet.provider.getBalance(deployerAddress);
    console.log(`💰 Deployer balance: ${ethers.formatEther(balance)} ETH`);
    
    if (balance === 0n) {
        throw new Error('Insufficient balance for deployment');
    }

    // Create ContractFactory
    const Paymaster = new ethers.ContractFactory(
        PaymasterArtifact.abi,
        PaymasterArtifact.bytecode,
        wallet
    );

    console.log('📝 Deploying contract with constructor arguments...');
    
    // Deploy with constructor arguments (using the addresses from the BWAEZIPaymaster.sol file)
    const paymaster = await Paymaster.deploy(
        "0x5FF137D4bEAA7036d654a88Ea898df565D304B88",  // EntryPoint
        "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da",  // BWAEZI
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  // WETH
        "0xb27308f9F90d607463bb33eA1BeBb41C27CE5AB6",  // Quoter
        3000                                           // 0.3% pool
    );
    
    console.log('⌛ Waiting for confirmation...');
    
    // Wait for deployment
    const deployedContract = await paymaster.waitForDeployment();
    const addr = await deployedContract.getAddress();
    
    console.log(`✅ BWAEZI PAYMASTER DEPLOYED AT: ${addr}`);
    console.log(`--- DEPLOYMENT END (SUCCESS) ---`);
    
    return addr;
}
