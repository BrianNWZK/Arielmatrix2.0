// arielsql_suite/transfer-100m-to-scw.js - ONE-TIME CAPITAL MIGRATION
import { ethers } from 'ethers';
import process from 'process';

// 🔥 CRITICAL ADDRESSES
const CONFIG = {
    RPC_URL: "https://eth.llamarpc.com",
    PRIVATE_KEY: process.env.MAINNET_PRIVATE_KEY,
    
    // Your addresses
    EOA_ADDRESS: "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA", // Current token holder (Sovereign Wallet)
    SMART_ACCOUNT_KERNEL_ADDRESS: "0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C", // Destination SCW (Placeholder for deployed address)
    
    // Token contract
    BWAEZI_TOKEN_ADDRESS: "0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da"
};

// BWAEZI Token ABI (minimal for transfer)
const BWAEZI_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

async function transferAllBWAEZIToSCW() {
    console.log("🔥 INITIATING BWAEZI TRANSFER TO SMART CONTRACT WALLET");
    console.log("============================================================");
    
    if (!CONFIG.PRIVATE_KEY) {
        console.error("❌ ERROR: MAINNET_PRIVATE_KEY environment variable is not set.");
        return;
    }

    const provider = new ethers.JsonRpcProvider(CONFIG.RPC_URL);
    const signer = new ethers.Wallet(CONFIG.PRIVATE_KEY, provider);
    
    // Validate addresses
    console.log(`📍 EOA Address: ${CONFIG.EOA_ADDRESS}`);
    // NOTE: Update SMART_ACCOUNT_KERNEL_ADDRESS in CONFIG with the actual deployed address from main.js output
    console.log(`🎯 SCW Address: ${CONFIG.SMART_ACCOUNT_KERNEL_ADDRESS}`);
    console.log(`💎 Token Address: ${CONFIG.BWAEZI_TOKEN_ADDRESS}`);
    
    const bwaeziContract = new ethers.Contract(CONFIG.BWAEZI_TOKEN_ADDRESS, BWAEZI_ABI, signer);
    
    // Check balances BEFORE transfer
    const decimals = await bwaeziContract.decimals();
    const eoaBalance = await bwaeziContract.balanceOf(CONFIG.EOA_ADDRESS);
    const scwBalance = await bwaeziContract.balanceOf(CONFIG.SMART_ACCOUNT_KERNEL_ADDRESS);
    
    console.log(`\n📊 BALANCES BEFORE TRANSFER:`);
    console.log(`    EOA Balance: ${ethers.formatUnits(eoaBalance, decimals)} BWAEZI`);
    console.log(`    SCW Balance: ${ethers.formatUnits(scwBalance, decimals)} BWAEZI`);
    
    if (eoaBalance === 0n) {
        console.log("❌ EOA has 0 BWAEZI balance. Cannot transfer.");
        return;
    }
    
    // Calculate transfer amount (100,000,000 tokens)
    const transferAmount = ethers.parseUnits("100000000", decimals);
    
    console.log(`\n🔄 TRANSFER DETAILS:`);
    console.log(`    Requested Amount: ${ethers.formatUnits(transferAmount, decimals)} BWAEZI`);
    console.log(`    From: ${CONFIG.EOA_ADDRESS} (EOA)`);
    console.log(`    To: ${CONFIG.SMART_ACCOUNT_KERNEL_ADDRESS} (SCW)`);
    
    let actualTransferAmount = transferAmount;
    
    // Check if EOA has enough balance
    if (eoaBalance < transferAmount) {
        console.log(`⚠️ WARNING: EOA only has ${ethers.formatUnits(eoaBalance, decimals)} BWAEZI.`);
        console.log(`    Transferring ALL available balance instead...`);
        // Transfer the full available balance
        actualTransferAmount = eoaBalance; 
        console.log(`    Actual Transfer Amount: ${ethers.formatUnits(actualTransferAmount, decimals)} BWAEZI`);
        
        if (actualTransferAmount === 0n) {
             console.log("🛑 EOA balance is 0. Transfer aborted.");
             return;
        }

    }

    await executeTransfer(bwaeziContract, actualTransferAmount, provider, signer);
}

async function executeTransfer(bwaeziContract, amount, provider, signer) {
    try {
        // Estimate gas cost
        const gasEstimate = await bwaeziContract.transfer.estimateGas(
            CONFIG.SMART_ACCOUNT_KERNEL_ADDRESS, 
            amount
        );
        
        const feeData = await provider.getFeeData();
        // Use maxFeePerGas for EIP-1559 compatibility, fallback to gasPrice
        const gasPrice = feeData.maxFeePerGas || feeData.gasPrice; 
        const gasCost = gasEstimate * gasPrice;
        
        console.log(`⛽ Estimated gas cost: ${ethers.formatEther(gasCost)} ETH`);
        
        // Check EOA ETH balance
        const ethBalance = await provider.getBalance(CONFIG.EOA_ADDRESS);
        console.log(`💰 EOA ETH balance: ${ethers.formatEther(ethBalance)} ETH`);
        
        if (ethBalance < gasCost) {
            throw new Error(`❌ Insufficient ETH for gas. Need ~${ethers.formatEther(gasCost).substring(0, 10)} ETH, have ${ethers.formatEther(ethBalance)} ETH`);
        }
        
        // Execute transfer
        console.log(`\n🚀 EXECUTING TRANSFER...`);
        
        const tx = await bwaeziContract.transfer(
            CONFIG.SMART_ACCOUNT_KERNEL_ADDRESS, 
            amount,
            { 
                gasLimit: gasEstimate + 5000n, // Add buffer
                // Set EIP-1559 params if available
                ...(feeData.maxFeePerGas && {
                    maxFeePerGas: feeData.maxFeePerGas,
                    maxPriorityFeePerGas: feeData.maxPriorityFeePerGas
                })
            } 
        );
        
        console.log(`✅ TRANSFER INITIATED!`);
        console.log(`    Transaction Hash: ${tx.hash}`);
        console.log(`    Waiting for confirmation...`);
        
        const receipt = await tx.wait();
        console.log(`\n🎉 TRANSFER CONFIRMED!`);
        console.log(`    Block: ${receipt.blockNumber}`);
        console.log(`    Gas Used: ${receipt.gasUsed.toString()}`);
        console.log(`    Status: ${receipt.status === 1 ? 'Success' : 'Failed'}`);
        
        // Verify balances AFTER transfer
        const decimals = await bwaeziContract.decimals();
        console.log(`\n📊 BALANCES AFTER TRANSFER:`);
        const newEoaBalance = await bwaeziContract.balanceOf(CONFIG.EOA_ADDRESS);
        const newScwBalance = await bwaeziContract.balanceOf(CONFIG.SMART_ACCOUNT_KERNEL_ADDRESS);
        
        console.log(`    EOA Balance: ${ethers.formatUnits(newEoaBalance, decimals)} BWAEZI`);
        console.log(`    SCW Balance: ${ethers.formatUnits(newScwBalance, decimals)} BWAEZI`);
        
    } catch (error) {
        console.error(`\n❌ CRITICAL ERROR DURING TRANSFER: ${error.message}`);
        if (error.reason) {
            console.error(`    Reason: ${error.reason}`);
        }
        console.error("Please ensure your EOA has enough ETH for gas.");
    }
    console.log("============================================================");
}

transferAllBWAEZIToSCW();
