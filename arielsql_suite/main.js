// revoke-factory.js
// Run this ONCE to stop Balancer factory from creating new pools

import { ethers } from "ethers";
import dotenv from "dotenv";
dotenv.config();

// ===== CONFIGURATION =====
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY in .env");

// Addresses
const FACTORY_ADDRESS = "0xA5bf2ddF098bb0Ef6d120C98217dD6B141c74EE0"; // Balancer Pool Factory
const TOKENS = {
  BWAEZI: "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2",
  USDC: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  WETH: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
};

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

async function revokeFactoryApproval() {
  console.log("\n🔧 REVOKING BALANCER FACTORY APPROVAL");
  console.log("======================================");
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const address = await wallet.getAddress();
  
  console.log(`EOA: ${address}`);
  console.log(`Factory: ${FACTORY_ADDRESS}\n`);

  for (const [name, tokenAddr] of Object.entries(TOKENS)) {
    try {
      console.log(`\n📝 Processing ${name}...`);
      
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
      
      // Check current allowance
      const currentAllowance = await token.allowance(address, FACTORY_ADDRESS);
      console.log(`   Current allowance: ${ethers.formatUnits(currentAllowance, name === 'USDC' ? 6 : 18)} ${name}`);
      
      if (currentAllowance === 0n) {
        console.log(`   ✅ Already revoked`);
        continue;
      }
      
      // Revoke to 0
      console.log(`   Sending revocation transaction...`);
      const tx = await token.approve(FACTORY_ADDRESS, 0n, {
        gasLimit: 100_000n,
        maxFeePerGas: ethers.parseUnits("0.5", "gwei"),
        maxPriorityFeePerGas: ethers.parseUnits("0.1", "gwei")
      });
      
      console.log(`   Tx: ${tx.hash}`);
      console.log(`   View: https://etherscan.io/tx/${tx.hash}`);
      
      await tx.wait();
      console.log(`   ✅ ${name} factory approval revoked`);
      
    } catch (error) {
      console.error(`   ❌ Failed for ${name}: ${error.message}`);
    }
  }
  
  console.log("\n✅ ALL DONE - Factory can no longer create pools");
  console.log("   Your existing pools and Vault interactions still work");
}

revokeFactoryApproval().catch(console.error);
