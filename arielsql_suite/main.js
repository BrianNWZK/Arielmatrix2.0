// =====================================================================
// ETH TRANSFER: SCW -> EOA (Topping up Gas)
// =====================================================================

import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // EOA private key
const SCW = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2";
const EOA = "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA";

// The SCW execute function: execute(address to, uint256 value, bytes data)
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];

async function main() {
  try {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    const ethToTransfer = "0.003";
    const amountWei = ethers.parseEther(ethToTransfer);

    console.log(`\n⛽ GAS TOP-UP: Moving ETH to EOA`);
    console.log(`=================================`);
    console.log(`From SCW: ${SCW}`);
    console.log(`To EOA:   ${EOA}`);
    console.log(`Amount:   ${ethToTransfer} ETH`);

    const scwContract = new ethers.Contract(SCW, scwAbi, wallet);

    // execute(target, value, data) 
    // target is EOA, value is the ETH, data is empty "0x"
    console.log(`\n📤 Sending transaction...`);
    
    const tx = await scwContract.execute(
      EOA, 
      amountWei, 
      "0x", 
      {
        gasLimit: 100_000n, // Simple ETH transfer via SCW is low gas
        maxFeePerGas: ethers.parseUnits("0.3", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("0.05", "gwei")
      }
    );

    console.log(`✅ TX Sent: ${tx.hash}`);
    console.log(`🔍 View: https://etherscan.io/tx/${tx.hash}`);

    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      const newBalance = await provider.getBalance(EOA);
      console.log(`\n🎉 SUCCESS!`);
      console.log(`New EOA Balance: ${ethers.formatEther(newBalance)} ETH`);
    } else {
      console.log(`\n❌ Transaction failed at the EVM level.`);
    }

  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}`);
  }
}

main();
