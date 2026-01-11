// scripts/approve-paymasters.js
import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

// --- CONFIG ---
const RPC_URL = process.env.RPC_URL || "https://eth.llamarpc.com";
const PRIVATE_KEY = process.env.SOVEREIGN_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing SOVEREIGN_PRIVATE_KEY");

// Treasury token (BWAEZI)
const BWAEZI = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";

// Paymaster addresses (both deployments)
const PAYMASTERS = [
  "0x6dF3163ac3502E9Ab077b4a47978bDE7ed56d51C",
  "0x595CA25b5917723d20003a5a1c0271B40734b28F"
];

async function main() {
  console.log("=== APPROVING PAYMASTERS ===");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("SCW/Owner:", wallet.address);
  console.log("Balance:", ethers.formatEther(await provider.getBalance(wallet.address)), "ETH");

  const tokenAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
  const token = new ethers.Contract(BWAEZI, tokenAbi, wallet);

  for (const pm of PAYMASTERS) {
    console.log(`\n⛽ Approving Paymaster ${pm}...`);
    const tx = await token.approve(pm, ethers.MaxUint256);
    console.log("TX:", tx.hash);
    await tx.wait();
    console.log(`✅ Approved BWAEZI for Paymaster ${pm}`);
  }

  console.log("\n🎉 All paymasters approved successfully.");
}

main().catch(e => {
  console.error("Fatal:", e);
  process.exit(1);
});
