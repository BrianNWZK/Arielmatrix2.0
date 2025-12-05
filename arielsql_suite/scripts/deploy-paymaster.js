// arielsql_suite/scripts/deploy-paymaster.js
import { ethers } from "ethers";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function deployPaymaster(signer) {
    console.log('\n--- DEPLOYING BWAEZI PAYMASTER (Ethereum Mainnet) ---\n');

    const artifactPath = path.resolve(__dirname, '../../artifacts/contracts/BWAEZIPaymaster.json');
    
    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact not found! Run compile first: ${artifactPath}`);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, signer);
    const deployer = await signer.getAddress();
    const balance = await signer.provider.getBalance(deployer);

    console.log(`Deployer: ${deployer}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH\n`);

    if (balance < ethers.parseEther("0.1")) {
        throw new Error("Insufficient ETH for deployment + gas");
    }

    console.log('Deploying BWAEZIPaymaster...\n');

    // CORRECT MAINNET ADDRESSES (Dec 2025)
    const paymaster = await factory.deploy(
        "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // EntryPoint v0.7 (official)
        "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da", // BWAEZI Token (your token)
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
        "0x61fFE014bA17989E743c5F6cB21bF9697530B21e", // Uniswap V3 QuoterV2 (2025 correct)
        3000                                            // 0.3% fee tier
    );

    console.log(`Transaction sent: ${paymaster.deploymentTransaction().hash}`);
    console.log('Waiting for confirmation...');

    await paymaster.waitForDeployment();

    const address = await paymaster.getAddress();

    console.log(`\nBWAEZI PAYMASTER DEPLOYED SUCCESSFULLY`);
    console.log(`Address: ${address}`);
    console.log(`Etherscan: https://etherscan.io/address/${address}`);
    console.log(`\n--- DEPLOYMENT COMPLETE ---\n`);

    return address;
}
