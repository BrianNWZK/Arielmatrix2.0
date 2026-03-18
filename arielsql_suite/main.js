import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
dotenvExpand.expand(dotenv.config());

// --- CONFIG ---
const RPC_URL = process.env.RPC_URL || "https://eth.llamarpc.com";
const PRIVATE_KEY = process.env.SOVEREIGN_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing SOVEREIGN_PRIVATE_KEY");

const SCW_ADDRESS = process.env.SCW_ADDRESS; // your Smart Contract Wallet (required)
if (!SCW_ADDRESS) throw new Error("Missing SCW_ADDRESS in .env");

const BWAEZI = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"; // BWAEZI token
const WAREHOUSE_CONTRACT = "0x78043417f7E15CF29cbB52cC584e11Ae33FE1542";

// --- ABI fragments ---
const tokenIface = new ethers.Interface([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
]);

const scwIface = new ethers.Interface([
  "function execute(address dest, uint256 value, bytes calldata func) external"
]);

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("SCW:", SCW_ADDRESS);
  console.log("Warehouse Contract:", WAREHOUSE_CONTRACT);
  console.log("BWAEZI Token:", BWAEZI);

  // =====================================================================
  // CHECK IF APPROVAL ALREADY EXISTS
  // =====================================================================
  console.log("\n🔍 Checking existing allowance...");
  
  const token = new ethers.Contract(BWAEZI, [
    'function allowance(address owner, address spender) view returns (uint256)'
  ], provider);
  
  const currentAllowance = await token.allowance(SCW_ADDRESS, WAREHOUSE_CONTRACT);
  console.log(`   Current allowance: ${ethers.formatEther(currentAllowance)} BWAEZI`);

  // If allowance is already max (or very large), skip
  if (currentAllowance >= ethers.parseUnits("1000000", 18)) {
    console.log(`   ✅ Sufficient allowance already exists - skipping approval`);
    console.log(`🎉 Warehouse contract ${WAREHOUSE_CONTRACT} already approved`);
    return;
  }

  // =====================================================================
  // SEND APPROVAL IF NEEDED
  // =====================================================================
  console.log(`\n📝 Approving Warehouse contract ${WAREHOUSE_CONTRACT} for unlimited BWAEZI...`);

  const scw = new ethers.Contract(SCW_ADDRESS, scwIface, wallet);
  const approveData = tokenIface.encodeFunctionData("approve", [
    WAREHOUSE_CONTRACT,
    ethers.MaxUint256
  ]);

  const tx = await scw.execute(BWAEZI, 0, approveData, {
    gasLimit: 200_000n,
    maxFeePerGas: ethers.parseUnits("0.3", "gwei")
  });
  
  console.log("   TX sent:", tx.hash);
  console.log(`   View: https://etherscan.io/tx/${tx.hash}`);
  
  await tx.wait();

  console.log(`\n✅ Warehouse contract ${WAREHOUSE_CONTRACT} successfully approved for unlimited BWAEZI`);
  console.log("🎉 Approval complete. Warehouse operations (bootstrap/cycles) can now run.");
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
