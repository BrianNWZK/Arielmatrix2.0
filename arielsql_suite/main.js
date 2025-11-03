import express from 'express';
import { ethers } from 'ethers';
import { BWAEZIKernelDeployer } from './bwaezi-kernel-contract.js';

const CONFIG = {
    SOVEREIGN_WALLET: "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA",
    PORT: process.env.PORT || 10000,
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    RPC_URL: "https://eth.llamarpc.com"
};

async function deployImmediately() {
    console.log("🚀 STARTING IMMEDIATE DEPLOYMENT...");
    
    try {
        // Initialize provider and wallet
        const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
        const wallet = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
        
        const balance = await provider.getBalance(wallet.address);
        console.log(` 💰 Wallet Balance: ${ethers.formatEther(balance)} ETH`);
        
        if (balance < ethers.parseEther("0.005")) {
            throw new Error("Insufficient ETH for deployment");
        }

        // Deploy contract
        const deployer = new BWAEZIKernelDeployer(wallet, provider, CONFIG);
        const result = await deployer.deploy();
        
        if (result.success) {
            console.log("\n🎉 🎉 🎉 DEPLOYMENT COMPLETE! 🎉 🎉 🎉");
            console.log(` ✅ 100,000,000 BWAEZI tokens minted to: ${CONFIG.SOVEREIGN_WALLET}`);
            console.log(` 📍 Contract: ${result.address}`);
            return result;
        } else {
            throw new Error(result.error);
        }
        
    } catch (error) {
        console.error("💥 DEPLOYMENT FAILED:", error);
        throw error;
    }
}

// START DEPLOYMENT IMMEDIATELY
deployImmediately().then(result => {
    console.log("\n✨ MISSION ACCOMPLISHED!");
    console.log("✅ Your 100M BWAEZI tokens are now deployed and minted!");
    process.exit(0);
}).catch(error => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
});
