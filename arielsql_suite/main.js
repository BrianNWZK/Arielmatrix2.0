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

// WarehouseBalancerArb contract address (the one that needs BWZC approval)
const WAREHOUSE_CONTRACT = "0x8c659BD828FFc5c8B07E3583142629551184D36E";

// --- ABI fragments ---
const tokenIface = new ethers.Interface([
  "function approve(address spender, uint256 amount) returns (bool)"
]);

// SCW ABI (SimpleAccount style - execute function)
const scwIface = new ethers.Interface([
  "function execute(address dest, uint256 value, bytes calldata func) external"
]);

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("SCW:", SCW_ADDRESS);
  console.log("Warehouse Contract:", WAREHOUSE_CONTRACT);
  console.log("BWAEZI Token:", BWAEZI);

  const scw = new ethers.Contract(SCW_ADDRESS, scwIface, wallet);

  console.log(`Approving Warehouse contract ${WAREHOUSE_CONTRACT} for unlimited BWAEZI...`);

  // Encode approve(max) on BWAEZI token
  const approveData = tokenIface.encodeFunctionData("approve", [
    WAREHOUSE_CONTRACT,
    ethers.MaxUint256
  ]);

  // Execute via SCW
  const tx = await scw.execute(BWAEZI, 0, approveData);
  console.log("TX sent:", tx.hash);
  await tx.wait();

  console.log(`✅ Warehouse contract ${WAREHOUSE_CONTRACT} successfully approved for unlimited BWAEZI`);
  console.log("🎉 Approval complete. Warehouse operations (bootstrap/cycles) can now run.");
}

main().catch(e => {
  console.error("Fatal error:", e);
  process.exit(1);
});
