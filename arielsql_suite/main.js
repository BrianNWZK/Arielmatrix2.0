// main.js
// Check initialization and price of BWAEZI/USDC and BWAEZI/WETH pools

import { ethers } from "ethers";

// ===== Env =====
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

// ===== Pools =====
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // fee 3000

// ===== Tokens =====
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"); // bwzC
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// ===== ABIs =====
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];
const erc20Abi = ["function decimals() view returns (uint8)"];

// ===== Helpers =====
function sqrtPriceX96ToPrice(sqrtPriceX96, decimals0, decimals1) {
  // price = (sqrtPriceX96^2 / 2^192) * (10^decimals0 / 10^decimals1)
  const numerator = BigInt(sqrtPriceX96) * BigInt(sqrtPriceX96);
  const denominator = BigInt(2) ** BigInt(192);
  const ratio = Number(numerator) / Number(denominator);
  return ratio * (10 ** decimals0) / (10 ** decimals1);
}

async function checkPool(provider, poolAddr, label) {
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  try {
    const slot0 = await pool.slot0();
    const token0 = await pool.token0();
    const token1 = await pool.token1();

    const dec0 = await new ethers.Contract(token0, erc20Abi, provider).decimals();
    const dec1 = await new ethers.Contract(token1, erc20Abi, provider).decimals();

    const sqrtPriceX96 = slot0[0];
    const tick = slot0[1];

    const price = sqrtPriceX96ToPrice(sqrtPriceX96, dec0, dec1);

    console.log(`Pool ${label} initialized:`);
    console.log(`  token0=${token0}, token1=${token1}`);
    console.log(`  sqrtPriceX96=${sqrtPriceX96.toString()}`);
    console.log(`  tick=${tick}`);
    console.log(`  price(token1 per token0) ≈ ${price}`);
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
