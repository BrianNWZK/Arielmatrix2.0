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
const BWAEZI = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"; // 18 decimals
const USDC   = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // 6 decimals
const WETH   = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"; // 18 decimals

// --- Routers / Vault ---
const UNIV2_ROUTER   = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
const SUSHI_ROUTER   = "0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F";
const BALANCER_VAULT = "0xba12222222228d8Ba445958a75a0704d566bf2C8";

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

  // Approvals for Uniswap V2 Router
  await ensureApproval(scw, BWAEZI, UNIV2_ROUTER, "BWAEZI (Uniswap V2)");
  await ensureApproval(scw, USDC,   UNIV2_ROUTER, "USDC (Uniswap V2)");
  await ensureApproval(scw, WETH,   UNIV2_ROUTER, "WETH (Uniswap V2)");

  // Approvals for SushiSwap Router
  await ensureApproval(scw, BWAEZI, SUSHI_ROUTER, "BWAEZI (SushiSwap)");
  await ensureApproval(scw, USDC,   SUSHI_ROUTER, "USDC (SushiSwap)");
  await ensureApproval(scw, WETH,   SUSHI_ROUTER, "WETH (SushiSwap)");

  // Approvals for Balancer Vault
  await ensureApproval(scw, BWAEZI, BALANCER_VAULT, "BWAEZI (Balancer)");
  await ensureApproval(scw, USDC,   BALANCER_VAULT, "USDC (Balancer)");
  await ensureApproval(scw, WETH,   BALANCER_VAULT, "WETH (Balancer)");

  console.log("🎉 Approval scan complete. Exiting.");
}

main().catch(e => {
  console.error("Fatal:", e.reason || e.message || e);
  process.exit(1);
});
