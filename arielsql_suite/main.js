import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

// --- CONFIG ---
const RPC_URL = process.env.RPC_URL || "https://eth.llamarpc.com";
const PRIVATE_KEY = process.env.SOVEREIGN_PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing SOVEREIGN_PRIVATE_KEY");

const SCW_ADDRESS = process.env.SCW_ADDRESS; // your Smart Contract Wallet

// --- Tokens ---
const BWAEZI = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2"); // 18 decimals
const USDC   = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"); // 6 decimals
const WETH   = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"); // 18 decimals

// --- Balancer Vault ---
const BALANCER_VAULT = ethers.getAddress("0xba12222222228d8ba445958a75a0704d566bf2c8");

// --- ABI fragments ---
const tokenAbi = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];
const scwAbi = [
  "function execute(address dest, uint256 value, bytes calldata func) external"
];

async function ensureApproval(scw, tokenAddr, spender, label) {
  const token = new ethers.Contract(tokenAddr, tokenAbi, scw.runner.provider);
  const allowance = await token.allowance(SCW_ADDRESS, spender);
  if (allowance > 0n) {
    console.log(`✅ ${label} already approved for ${spender}`);
    return;
  }
  console.log(`⚠️ ${label} not approved — sending approval`);
  const iface = new ethers.Interface(tokenAbi);
  const approveData = iface.encodeFunctionData("approve", [spender, ethers.MaxUint256]);
  const tx = await scw.execute(tokenAddr, 0, approveData);
  console.log(`TX sent: ${tx.hash}`);
  await tx.wait();
  console.log(`✅ ${label} approved for ${spender}`);
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const scw      = new ethers.Contract(SCW_ADDRESS, scwAbi, wallet);

  console.log("SCW:", SCW_ADDRESS);
  console.log("Balancer Vault:", BALANCER_VAULT);

  // Approvals for Balancer Vault
  await ensureApproval(scw, BWAEZI, BALANCER_VAULT, "BWAEZI (Balancer)");
  await ensureApproval(scw, USDC,   BALANCER_VAULT, "USDC (Balancer)");
  await ensureApproval(scw, WETH,   BALANCER_VAULT, "WETH (Balancer)");

  console.log("🎉 Balancer approvals complete. Exiting.");
}

main().catch(e => {
  console.error("Fatal:", e.reason || e.message || e);
  process.exit(1);
});
