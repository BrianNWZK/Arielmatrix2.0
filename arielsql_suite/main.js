// main.js
// Standalone script: check pool initialization and price

import { ethers } from "ethers";

// ===== Env =====
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// ===== Pools =====
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // fee 3000

// ===== ABI =====
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)"
];

// ===== Helpers =====
async function checkPool(provider, poolAddr, label) {
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  try {
    const slot0 = await pool.slot0();
    console.log(`Pool ${label} initialized:`);
    console.log(`  sqrtPriceX96: ${slot0[0].toString()}`);
    console.log(`  tick: ${slot0[1]}`);
  } catch (e) {
    console.log(`Pool ${label} not initialized (slot0 call reverted).`);
  }
}

// ===== Main =====
async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);

  await checkPool(provider, POOL_BW_USDC, "BWAEZI/USDC");
  await checkPool(provider, POOL_BW_WETH, "BWAEZI/WETH");
}

main().catch(e => {
  console.error("Fatal:", e.message || e);
  process.exit(1);
});
