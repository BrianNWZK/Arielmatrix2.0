// arielsql_suite/main.js
// Minimal script: compile and deploy Paymaster, approve treasury token

import { deployPaymaster } from "./scripts/deploy-paymaster.js";
import { compilePaymasterContract } from "./scripts/compile-paymaster.js";
import { ethers } from "ethers";
import * as dotenv from "dotenv";
import * as dotenvExpand from "dotenv-expand";

// Load environment variables
const env = dotenv.config();
dotenvExpand.expand(env);

(async () => {
  console.log("=== PAYMASTER DEPLOYMENT ===");

  try {
    // STEP 1: Compile Paymaster contract
    console.log("--- Compiling Paymaster contract ---");
    const artifactPath = await compilePaymasterContract();

    // STEP 2: Wallet setup
    const provider = new ethers.JsonRpcProvider("https://eth.llamarpc.com");
    const privateKey = process.env.SOVEREIGN_PRIVATE_KEY;

    if (!privateKey || privateKey.length < 32) {
      throw new Error("Missing or invalid SOVEREIGN_PRIVATE_KEY env var");
    }
    const wallet = new ethers.Wallet(privateKey, provider);

    // STEP 3: Deploy Paymaster with capped gas settings
    console.log("--- Deploying Paymaster ---");
    const paymasterAddr = await deployPaymaster(wallet, artifactPath, {
      gasLimit: 1_000_000,
      maxFeePerGas: ethers.parseUnits("5", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("1", "gwei")
    });
    console.log(`✅ Paymaster deployed at: ${paymasterAddr}`);

    // STEP 4: Approve Paymaster to spend treasury token
    const tokenAddress = "0x998232423d0b260ac397a893b360c8a254fcdd66"; // Treasury token
    const tokenAbi = ["function approve(address spender, uint256 amount) returns (bool)"];
    const token = new ethers.Contract(tokenAddress, tokenAbi, wallet);

    console.log("⛽ Approving Paymaster to spend treasury token...");
    const approveTx = await token.approve(paymasterAddr, ethers.MaxUint256, {
      gasLimit: 100_000,
      maxFeePerGas: ethers.parseUnits("5", "gwei"),
      maxPriorityFeePerGas: ethers.parseUnits("1", "gwei")
    });
    await approveTx.wait();
    console.log("✅ Paymaster approved successfully.");

    console.log("\n🎉 PAYMASTER DEPLOYMENT COMPLETE");
    console.log("Treasury token:", tokenAddress);
    console.log("Paymaster:", paymasterAddr);
  } catch (error) {
    console.error("❌ Fatal error during Paymaster deployment:", error.message);
    process.exit(1);
  }
})();
