// arielsql_suite/scripts/deploy-paymaster.js
import { ethers } from "ethers";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function deployPaymaster(wallet) {
    console.log('\nSOVEREIGN MEV BRAIN v12 — FINAL LAUNCH');
    console.log('DEPLOYING BWAEZI PAYMASTER (Ethereum Mainnet 2025)\n');

    const artifactPath = path.join(__dirname, '..', '..', 'artifacts', 'contracts', 'BWAEZIPaymaster.json');

    if (!fs.existsSync(artifactPath)) {
        throw new Error(`Artifact missing! Run compile first: ${artifactPath}`);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    const deployer = await wallet.getAddress();
    const balance = await wallet.provider.getBalance(deployer);

    console.log(`Deployer: ${deployer}`);
    console.log(`Balance: ${ethers.formatEther(balance)} ETH`);

    // REALISTIC CHECK — based on your own 30+ deployments
    const required = ethers.parseEther("0.0015"); // 0.0015 ETH is more than enough
    if (balance < required) {
        throw new Error(`Insufficient balance. Need at least 0.0015 ETH (you have ${ethers.formatEther(balance)})`);
    }

    console.log('Deploying BWAEZIPaymaster (gas-optimized, v0.8.28)...\n');

    // OFFICIAL MAINNET ADDRESSES — Dec 2025
    const paymaster = await factory.deploy(
        "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789",  // EntryPoint v0.7
        "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da",  // BWAEZI Token
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",  // WETH
        "0x61fFE014bA17989E743c5F6cB21bF9697530B21e",  // Uniswap V3 QuoterV2
        3000                                             // 0.3% fee
    );

    console.log(`Transaction submitted: ${paymaster.deploymentTransaction().hash}`);
    console.log('Waiting for confirmation... (usually 12–30 seconds)\n');

    await paymaster.waitForDeployment();
    const address = await paymaster.getAddress();

    console.log(`BWAEZI PAYMASTER DEPLOYED SUCCESSFULLY`);
    console.log(`Contract: ${address}`);
    console.log(`Etherscan: https://etherscan.io/address/${address}`);
    console.log(`Explorer: https://ethervista.app/address/${address}`);
    console.log(`\nSOVEREIGN MEV BRAIN v12 — ONLINE`);
    console.log(`You now control gasless UX for millions of users.\n`);

    return address;
}
