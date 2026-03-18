// main.js — Transfer ETH from SCW to EOA
// NO RETRIES - Exits immediately on any failure

import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // EOA private key
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// Addresses
const SCW = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2";
const EOA = "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA";

// SCW ABI (execute function)
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];

async function main() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`\n🔍 ETH TRANSFER: SCW → EOA`);
    console.log(`=================================`);
    console.log(`EOA (sender): ${wallet.address}`);
    console.log(`SCW: ${SCW}`);
    console.log(`EOA (recipient): ${EOA}`);

    // Check initial balances
    const scwBalance = await provider.getBalance(SCW);
    const eoaBalance = await provider.getBalance(EOA);

    console.log(`\n💰 Initial Balances:`);
    console.log(`   SCW: ${ethers.formatEther(scwBalance)} ETH`);
    console.log(`   EOA: ${ethers.formatEther(eoaBalance)} ETH`);

    // Amount to transfer (0.003 ETH)
    const transferAmount = ethers.parseEther("0.003");

    console.log(`\n📤 Transferring ${ethers.formatEther(transferAmount)} ETH from SCW → EOA...`);

    // Encode a simple ETH transfer (empty data)
    const execData = "0x";

    const scwIface = new ethers.Interface(scwAbi);
    const executeData = scwIface.encodeFunctionData("execute", [EOA, transferAmount, execData]);

    const tx = await wallet.sendTransaction({
      to: SCW,
      data: executeData,
      gasLimit: 100_000n,  // Simple transfer needs minimal gas
      maxFeePerGas: ethers.parseUnits("0.3", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("0.05", "gwei")
    });

    console.log(`   TX sent: ${tx.hash}`);
    console.log(`   View: https://etherscan.io/tx/${tx.hash}`);
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`   ✅ TRANSFER SUCCESSFUL`);
    } else {
      throw new Error(`Transfer failed - transaction reverted`);
    }

    // Final balances
    const scwBalanceFinal = await provider.getBalance(SCW);
    const eoaBalanceFinal = await provider.getBalance(EOA);

    console.log(`\n💰 Final Balances:`);
    console.log(`   SCW: ${ethers.formatEther(scwBalanceFinal)} ETH`);
    console.log(`   EOA: ${ethers.formatEther(eoaBalanceFinal)} ETH`);
    console.log(`   EOA received: ${ethers.formatEther(eoaBalanceFinal - eoaBalance)} ETH`);

    console.log(`\n🎯 TRANSFER COMPLETE`);
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
    if (error.transactionHash) {
      console.log(`Failed tx: https://etherscan.io/tx/${error.transactionHash}`);
    }
    console.log(`\n🛑 Stopping immediately - no retries`);
    process.exit(1);
  }
}

main();
