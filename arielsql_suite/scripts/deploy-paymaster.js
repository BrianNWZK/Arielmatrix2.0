// arielsql_suite/scripts/deploy-paymaster.js
import { ethers } from "ethers";
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// === NEW SIMPLE ARTIFACT PATH ===
const artifactPath = "./BWAEZIPaymaster.json";
console.log(`📂 Loading artifact from: ${artifactPath}`);

let PaymasterArtifact;
try {
    // This looks in the same directory as deploy-paymaster.js
    PaymasterArtifact = require(artifactPath);
    console.log('✅ Artifact loaded successfully');
} catch (e) {
    console.error(`❌ Failed to load artifact from ${artifactPath}`);
    console.error('Make sure you run: npm run compile-contracts and check for compilation errors.');
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
    
    console.log(`⏳ Deployment transaction sent: ${paymaster.deploymentTransaction().hash}`);
    console.log('⌛ Waiting for confirmation...');
    
    // Wait for deployment
    const deployedContract = await paymaster.waitForDeployment();
    const addr = await deployedContract.getAddress();
    
    console.log(`✅ BWAEZI PAYMASTER DEPLOYED AT: ${addr}`);
    
    return addr;
}
