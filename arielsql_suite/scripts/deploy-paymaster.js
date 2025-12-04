// arielsql_suite/scripts/deploy-paymaster.js
import { ethers } from "ethers";
import * as fs from 'fs';

/**
 * Deploys the BWAEZIPaymaster contract
 * @param {ethers.Wallet} wallet - Ethers Wallet with provider already attached
 * @param {string} artifactPath - Absolute path to the artifact file created in the same process.
 * @returns {Promise<string>} The deployed contract address
 */
export async function deployPaymaster(wallet, artifactPath) {
    console.log(`\n--- DEPLOYMENT START (In-Process) ---`);
    console.log(`📂 Loading artifact from: ${artifactPath}`);

    let PaymasterArtifact;
    try {
        // Load the JSON file content directly using fs.readFileSync
        const artifactContent = fs.readFileSync(artifactPath, 'utf8');
        PaymasterArtifact = JSON.parse(artifactContent);
        
        console.log('✅ Artifact loaded successfully.');
    } catch (e) {
        console.error(`\n❌ FATAL DEPLOYMENT ERROR: Artifact could not be loaded.`);
        console.error('Error Details:', e.message);
        throw e;
    }

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
    
    // Deploy with constructor arguments (using the hardcoded values from your prior attempts)
    const paymaster = await Paymaster.deploy(
        "0x5FF137D4bEAA7036d654a88Ea898df565D304B88",  // EntryPoint
        "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da",  // BWAEZI (Updated to use the address in your old main.js)
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  // WETH
        "0xb27308f9F90d607463bb33eA1BeBb41C27CE5AB6",  // Quoter
        3000                                           // 0.3% pool
    );
    
    console.log('⌛ Waiting for confirmation...');
    
    const deployedContract = await paymaster.waitForDeployment();
    const addr = await deployedContract.getAddress();
    
    console.log(`✅ BWAEZI PAYMASTER DEPLOYED AT: ${addr}`);
    console.log(`--- DEPLOYMENT END (SUCCESS) ---`);
    
    return addr;
}
