import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  // Connect to Ethereum mainnet using a fast public RPC
  // LlamaNodes and Ankr are generally reliable and low-latency
  const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");
  // Load your funded EOA (make sure PRIVATE_KEY is in .env)
  const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
  // Paymaster address
  const paymasterAddress = "0x4e073AAA36Cd51fD37298F87E3Fce8437a08DD71";
  console.log("EOA:", wallet.address);
  console.log("Paymaster:", paymasterAddress);
  // ABI with the exact function name from your contract
  const abi = [
    "function withdrawDepositTo(address payable withdrawAddress, uint256 amount) external"
  ];
  const contract = new ethers.Contract(paymasterAddress, abi, wallet);
  try {
    console.log("Sending withdrawal...");
    // Estimate gas to avoid underfunding
    const gasEstimate = await contract.estimateGas.withdrawDepositTo(wallet.address, amount);
    console.log(`Estimated gas: ${gasEstimate.toString()}`);
    // Send transaction
    const tx = await contract.withdrawDepositTo(wallet.address, amount, { gasLimit: gasEstimate });
    console.log("Tx sent:", tx.hash);
    const receipt = await tx.wait();
    if (receipt.status === 1) {
      console.log(`✅ Confirmed in block: ${receipt.blockNumber}`);
      console.log(`✅ Withdrawn ${ethers.formatEther(amount)} ETH to ${wallet.address}`);
    } else {
      console.error("❌ Transaction reverted");
    }
  } catch (error) {
    console.error("❌ Withdrawal failed:", error.message);
  }
}
main();
