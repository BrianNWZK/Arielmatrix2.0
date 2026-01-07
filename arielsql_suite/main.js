// main.js
// One-shot: initialize BWAEZI/USDC and BWAEZI/WETH pools with peg prices

import { ethers } from "ethers";

// ===== Env =====
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");

// ===== Pools =====
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // fee 3000

// ===== Tokens =====
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"); // bwzC
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// ===== ABIs =====
const scwAbi  = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const poolAbi = ["function initialize(uint160 sqrtPriceX96)"];

// ===== Helpers =====
function encodeInitialize(sqrtPriceX96) {
  const iface = new ethers.Interface(poolAbi);
  return iface.encodeFunctionData("initialize", [sqrtPriceX96]);
}

// Compute sqrtPriceX96 from price (token1 per token0)
function priceToSqrtPriceX96(price, decimals0, decimals1) {
  // price = token1/token0
  const ratio = price * (10 ** decimals0) / (10 ** decimals1);
  const sqrtRatio = Math.sqrt(ratio);
  return BigInt(Math.floor(sqrtRatio * 2 ** 96));
}

// ===== Main =====
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const scwIface = new ethers.Interface(scwAbi);

  console.log(`EOA: ${wallet.address}`);
  console.log(`SCW: ${SCW}`);

  // Initialize BWAEZI/USDC at peg: 1 bwzC = 100 USDC
  const sqrtPriceUSDC = priceToSqrtPriceX96(100, 18, 6); // bwzC has 18 decimals, USDC has 6
  const initUSDC = encodeInitialize(sqrtPriceUSDC);
  const execUSDC = scwIface.encodeFunctionData("execute", [POOL_BW_USDC, 0n, initUSDC]);
  console.log("Initializing BWAEZI/USDC pool...");
  const tx1 = await wallet.sendTransaction({ to: SCW, data: execUSDC, gasLimit: 300000 });
  await tx1.wait();
  console.log("BWAEZI/USDC initialized:", tx1.hash);

  // Initialize BWAEZI/WETH at peg: 1 bwzC = 0.03 WETH
  const sqrtPriceWETH = priceToSqrtPriceX96(0.03, 18, 18); // both bwzC and WETH have 18 decimals
  const initWETH = encodeInitialize(sqrtPriceWETH);
  const execWETH = scwIface.encodeFunctionData("execute", [POOL_BW_WETH, 0n, initWETH]);
  console.log("Initializing BWAEZI/WETH pool...");
  const tx2 = await wallet.sendTransaction({ to: SCW, data: execWETH, gasLimit: 300000 });
  await tx2.wait();
  console.log("BWAEZI/WETH initialized:", tx2.hash);

  console.log("✅ Both pools initialized at peg prices");
}

main().catch(e => {
  console.error("Fatal:", e.message || e);
  process.exit(1);
});
