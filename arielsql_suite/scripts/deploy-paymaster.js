// arielsql_suite/scripts/deploy-paymaster.js
import { ethers } from "ethers";
import * as path from 'path';
import * as fs from 'fs';

// === ABSOLUTE PATH TO STANDARD ARTIFACT LOCATION ===
const ARTIFACT_PATH_ABSOLUTE = path.resolve(
    process.cwd(), 
    'artifacts/arielsql_suite/contracts/BWAEZIPaymaster.sol/BWAEZIPaymaster.json'
);

console.log(`\n--- DEPLOYMENT START ---`);
console.log(`📂 Checking for artifact at absolute path: ${ARTIFACT_PATH_ABSOLUTE}`);

let PaymasterArtifact;
try {
    // 1. Explicitly check if the file exists on the filesystem
    if (!fs.existsSync(ARTIFACT_PATH_ABSOLUTE)) {
        throw new Error(`ARTIFACT FILE IS MISSING. Compilation (npm run compile-contracts) failed or the artifact folder was cleared by the build system. Path: ${ARTIFACT_PATH_ABSOLUTE}`);
    }
    
    // 2. Load the JSON file content directly using fs.readFileSync, bypassing the Node.js module loader
    const artifactContent = fs.readFileSync(ARTIFACT_PATH_ABSOLUTE, 'utf8');
    PaymasterArtifact = JSON.parse(artifactContent);
    
    console.log('✅ Artifact loaded successfully using fs/JSON.parse.');
} catch (e) {
    console.error(`\n❌ FATAL DEPLOYMENT ERROR: Artifact could not be loaded.`);
    console.error('Error Details:', e.message);
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
    
    // Deploy with constructor arguments
    const paymaster = await Paymaster.deploy(
        "0x5FF137D4bEAA7036d654a88Ea898df565D304B88",  // EntryPoint
        "0x9bE921e5eFacd53bc4EEbCfdc4494D296cFab5da",  // BWAEZI
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
