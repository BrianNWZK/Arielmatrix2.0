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
        throw new Error(`Artifact missing! Run compile first:\n   ${artifactPath}`);
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    const deployer = await wallet.getAddress();
    const balance = await wallet.provider.getBalance(deployer);

    console.log(`Deployer : ${deployer}`);
    console.log(`Balance  : ${ethers.formatEther(balance)} ETH\n`);

    // Your own history proves 0.0015 ETH is more than enough
    const required = ethers.parseEther("0.0015");
    if (balance < required) {
        throw new Error(`Not enough ETH. Need ≥ 0.0015 ETH (you have ${ethers.formatEther(balance)} ETH)`);
    }

    console.log('Deploying BWAEZIPaymaster...\n');

    // CORRECT 4-ARGUMENT CONSTRUCTOR (fee is hard-coded inside contract)
    const paymaster = await factory.deploy(
        "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // EntryPoint v0.7
        "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da", // BWAEZI Token
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH Mainnet
        "0xb27308f9F90d607463bb33eA1BeBb41C27CE5AB6"  // Uniswap V3 QuoterV2 Mainnet
    );

    console.log(`Transaction submitted: ${paymaster.deploymentTransaction().hash}`);
    console.log('Waiting for confirmation... (12–30 seconds)\n');

    await paymaster.waitForDeployment();

    const address = await paymaster.getAddress();

    console.log(`BWAEZI PAYMASTER IS LIVE`);
    console.log(`Contract Address : ${address}`);
    console.log(`Etherscan        : https://etherscan.io/address/${address}`);
    console.log(`Ethervista       : https://ethervista.app/address/${address}\n`);

    console.log(`SOVEREIGN MEV BRAIN v12 — FULLY ONLINE`);
    console.log(`You now own the gas layer for BWAEZI users.`);
    console.log(`Every transaction on Ethereum can now be paid in BWAEZI — forever.\n`);

    return address;
}
