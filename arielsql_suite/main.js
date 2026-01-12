import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

// --- CONFIG ---
const RPC_URL = process.env.RPC_URL || "https://eth.llamarpc.com";
const PRIVATE_KEY = process.env.SOVEREIGN_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing SOVEREIGN_PRIVATE_KEY");

const SCW_ADDRESS   = process.env.SCW_ADDRESS; // your Smart Contract Wallet
const BWAEZI        = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"; // BWAEZI token

// Only Balancer Vault approval
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";

// --- ABI fragments ---
const tokenIface = new ethers.Interface([
  "function approve(address spender, uint256 amount) returns (bool)"
]);

// SCW ABI (SimpleAccount style)
const scwIface = new ethers.Interface([
  "function execute(address dest, uint256 value, bytes calldata func) external"
]);

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("SCW:", SCW_ADDRESS);
  console.log("Approving Balancer Vault:", BALANCER_VAULT);

  const scw = new ethers.Contract(SCW_ADDRESS, scwIface, wallet);

  const approveData = tokenIface.encodeFunctionData("approve", [BALANCER_VAULT, ethers.MaxUint256]);
  const tx = await scw.execute(BWAEZI, 0, approveData);
  console.log("TX sent:", tx.hash);
  await tx.wait();
  console.log(`✅ Approved Balancer Vault ${BALANCER_VAULT}`);

  console.log("🎉 Balancer approval completed. Exiting.");
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
