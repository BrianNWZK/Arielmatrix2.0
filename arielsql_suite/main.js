// eoa-create-initialize.js
import { ethers } from "ethers";

// RPC and signer
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Token addresses
const TOKEN_A = (process.env.TOKEN_A || "0x9be921e5efacd53bc4eebcfdc4494d257cfab5da").toLowerCase(); // BWAEZI (18d)
const TOKEN_B = (process.env.TOKEN_B || "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48").toLowerCase(); // USDC (6d)
const FEE_TIER = Number(process.env.FEE_TIER || 500);

// sqrtPriceX96 for peg (uint160 hex string)
const SQRT_PRICE_X96 = process.env.SQRT_PRICE_X96;

// Uniswap V3 Factory
const FACTORY = "0x1f98431c8ad98523631ae4a59f267346ea31f984";
const factoryAbi = [
  "function getPool(address,address,uint24) view returns (address)",
  "function createPool(address,address,uint24) returns (address)"
];
const poolAbi = [ "function initialize(uint160)" ];

// Helpers
function normalize(a) { return ethers.getAddress(a.toLowerCase()); }
function sortTokens(a, b) {
  const na = normalize(a), nb = normalize(b);
  return na < nb ? [na, nb] : [nb, na];
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
  if (!SQRT_PRICE_X96 || !SQRT_PRICE_X96.startsWith("0x")) {
    throw new Error("Missing/invalid SQRT_PRICE_X96 (must be uint160 hex string)");
  }

  // Validate length (<= 40 hex chars after 0x for uint160)
  const raw = SQRT_PRICE_X96.slice(2);
  if (raw.length === 0 || raw.length > 40) {
    throw new Error("SQRT_PRICE_X96 must be uint160 (<=40 hex chars after 0x)");
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  const [token0, token1] = sortTokens(TOKEN_A, TOKEN_B);
  console.log(`Token0=${token0}, Token1=${token1}, FeeTier=${FEE_TIER}`);

  const factory = new ethers.Contract(FACTORY, factoryAbi, wallet);

  // Step 1: Get or create pool
  let pool = await factory.getPool(token0, token1, FEE_TIER);
  if (pool === ethers.ZeroAddress) {
    console.log("Pool missing. Creating...");
    const tx = await factory.createPool(token0, token1, FEE_TIER);
    const rc = await tx.wait();
    pool = await factory.getPool(token0, token1, FEE_TIER);
    if (pool === ethers.ZeroAddress) throw new Error("Pool still zero after create");
    console.log(`✅ Pool created: ${pool} (tx=${rc.hash})`);
  } else {
    console.log(`ℹ️ Pool exists: ${pool}`);
  }

  // Step 2: Initialize pool
  const poolCtr = new ethers.Contract(pool, poolAbi, wallet);
  try {
    console.log(`Initializing pool with sqrtPriceX96=${SQRT_PRICE_X96}`);
    const itx = await poolCtr.initialize(SQRT_PRICE_X96);
    const irc = await itx.wait();
    console.log(`✅ Pool initialized at peg. tx=${irc.hash}`);
  } catch (e) {
    if (String(e?.message || "").includes("already initialized")) {
      console.log("ℹ️ Pool already initialized; skipping.");
    } else {
      console.error("❌ Initialization failed:", e.message);
      throw e;
    }
  }

  console.log("🎯 Done: pool created+initialized. Next step: mint liquidity via PositionManager.");
}

main().catch(e => {
  console.error("Fatal:", e.message);
  process.exit(1);
});
