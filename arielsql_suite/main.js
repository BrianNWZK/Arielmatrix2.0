import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
dotenvExpand.expand(dotenv.config());

// --- CONFIG ---
const RPC_URL = process.env.RPC_URL || "https://eth.llamarpc.com";
const PRIVATE_KEY = process.env.SOVEREIGN_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing SOVEREIGN_PRIVATE_KEY");

// Your EOA address (derived from PRIVATE_KEY) - this is the account that will approve
const BWAEZI = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"; // BWAEZI token

// WarehouseBalancerArb contract address (the one that needs BWZC approval)
const WAREHOUSE_CONTRACT = "0x39539214246390bA6F852c519b6AB4DC45dF0469";

// --- ABI fragments ---
const tokenIface = new ethers.Interface([
  "function approve(address spender, uint256 amount) returns (bool)"
]);

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const eoaAddress = await wallet.getAddress();

  console.log("EOA (approver):", eoaAddress);
  console.log("Warehouse Contract:", WAREHOUSE_CONTRACT);
  console.log("BWAEZI Token:", BWAEZI);

  // Connect directly to the token contract with the EOA wallet
  const token = new ethers.Contract(BWAEZI, tokenIface, wallet);

  console.log(`\n📝 Approving Warehouse contract ${WAREHOUSE_CONTRACT} for unlimited BWAEZI from EOA...`);
  console.log(`   This approval allows the warehouse to spend your EOA's BWAEZI tokens.`);

  // Approve directly from EOA
  const tx = await token.approve(WAREHOUSE_CONTRACT, ethers.MaxUint256, {
    gasLimit: 100_000n,
    maxFeePerGas: ethers.parseUnits("0.1", "gwei"),
    maxPriorityFeePerGas: ethers.parseUnits("0.01", "gwei")
  });
  
  console.log("   TX sent:", tx.hash);
  console.log(`   View: https://etherscan.io/tx/${tx.hash}`);
  
  await tx.wait();

  console.log(`\n✅ Warehouse contract ${WAREHOUSE_CONTRACT} successfully approved for unlimited BWAEZI from EOA!`);
  console.log("🎉 EOA approval complete. You can now run the bootstrap sequence where the contract pulls from your EOA.");
  
  // Optional: Check allowance
  const allowance = await token.allowance(eoaAddress, WAREHOUSE_CONTRACT);
  console.log(`\n📊 Current allowance: ${ethers.formatEther(allowance)} BWAEZI`);
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
