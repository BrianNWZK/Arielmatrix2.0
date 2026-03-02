import { ethers } from "ethers";

// Configuration - Using public RPC that works
const RPC_URL = "https://ethereum-rpc.publicnode.com"; // ✅ Works without API key

const PRIVATE_KEY = "YOUR_PRIVATE_KEY"; // Your EOA private key (0xd8e1Fa4d...)

const ENTRY_POINT = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
const PAYMASTER_ADDRESS = "0x4e073AAA36Cd51fD37298F87E3Fce8437a08DD71"; // Your paymaster
const RECIPIENT = "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA"; // Your EOA

async function main() {
  try {
    // Connect to provider
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    console.log("🔄 Withdrawing 0.0021 ETH from EntryPoint deposit...");
    console.log(`   Paymaster: ${PAYMASTER_ADDRESS}`);
    console.log(`   Recipient: ${RECIPIENT}`);
    console.log(`   Connected as: ${wallet.address}`);
    
    // Check current balance in EntryPoint
    const entryPoint = new ethers.Contract(
      ENTRY_POINT,
      ["function balanceOf(address account) view returns (uint256)"],
      provider
    );
    
    const currentDeposit = await entryPoint.balanceOf(PAYMASTER_ADDRESS);
    console.log(`💰 Current EntryPoint deposit: ${ethers.formatEther(currentDeposit)} ETH`);
    
    if (currentDeposit < ethers.parseEther("0.0021")) {
      console.log("❌ Deposit is less than 0.0021 ETH!");
      return;
    }
    
    // Amount to withdraw
    const amount = ethers.parseEther("0.0021"); // 2100000000000000 wei
    
    console.log(`\n📤 Sending withdrawal transaction...`);
    
    // Withdraw from EntryPoint to paymaster
    const entryPointWithdraw = new ethers.Contract(
      ENTRY_POINT,
      ["function withdrawTo(address payable withdrawAddress, uint256 withdrawAmount) external"],
      wallet
    );
    
    const tx = await entryPointWithdraw.withdrawTo(PAYMASTER_ADDRESS, amount);
    
    console.log(`⏳ Transaction sent: ${tx.hash}`);
    console.log(`🔍 View: https://etherscan.io/tx/${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`\n✅✅✅ WITHDRAWAL SUCCESSFUL! ✅✅✅`);
      console.log(`   Block: ${receipt.blockNumber}`);
      console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
      
      // Check new balance
      const newDeposit = await entryPoint.balanceOf(PAYMASTER_ADDRESS);
      console.log(`💰 New EntryPoint deposit: ${ethers.formatEther(newDeposit)} ETH`);
      
      console.log(`\n📌 0.0021 ETH has been moved from EntryPoint to your paymaster.`);
      console.log(`   It is now in the paymaster contract at: ${PAYMASTER_ADDRESS}`);
      
    } else {
      console.log(`❌ Transaction failed`);
    }
    
  } catch (error) {
    console.error("❌ Error:", error.message);
  }
}

main();
