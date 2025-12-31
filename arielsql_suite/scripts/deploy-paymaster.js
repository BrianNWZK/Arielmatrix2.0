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
        throw new Error("Run compile first!");
    }

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);

    const deployer = await wallet.getAddress();
    const balance = await wallet.provider.getBalance(deployer);

    console.log(`Deployer : ${deployer}`);
    console.log(`Balance  : ${ethers.formatEther(balance)} ETH\n`);

    if (balance < ethers.parseEther("0.0009")) {
        throw new Error("Need at least 0.0009 ETH");
    }

    console.log('Deploying...\n');

    const paymaster = await factory.deploy(
        "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789", // EntryPoint v0.7
        "0x998232423d0b260ac397a893b360c8a254fcdd66", // BWAEZI Token
        "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", // WETH
        "0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6"  // QuoterV2 — CORRECT CHECKSUM
    );

    console.log(`TX: ${paymaster.deploymentTransaction().hash}`);
    console.log('Confirming...\n');

    await paymaster.waitForDeployment();
    const address = await paymaster.getAddress();

    console.log(`BWAEZI PAYMASTER LIVE`);
    console.log(`ADDRESS: ${address}`);
    console.log(`https://etherscan.io/address/${address}\n`);

    console.log(`SOVEREIGN MEV BRAIN v12 — ONLINE`);
    console.log(`You now own the gas layer.\n`);

    return address;
}
