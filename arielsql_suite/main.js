// eoa-create-initialize-mint.js
import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const FACTORY = "0x1f98431c8ad98523631ae4a59f267346ea31f984";
const NPM     = "0xC36442b4a4522e871399cd717abdd847ab11fe88"; // NonfungiblePositionManager

const factoryAbi = [
  "function getPool(address,address,uint24) view returns (address)",
  "function createPool(address,address,uint24) returns (address)"
];
const poolAbi = [ "function initialize(uint160)" ];
const npmAbi  = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];

function normalize(a){ return ethers.getAddress(a.toLowerCase()); }
function sortTokens(a,b){ const na=normalize(a), nb=normalize(b); return na<nb?[na,nb]:[nb,na]; }

async function createInitMint(wallet, tokenA, tokenB, feeTier, sqrtPriceX96, amountA, amountB) {
  const [token0, token1] = sortTokens(tokenA, tokenB);
  console.log(`Pair: token0=${token0}, token1=${token1}, fee=${feeTier}`);

  const factory = new ethers.Contract(FACTORY, factoryAbi, wallet);

  // Step 1: Get or create pool
  let pool = await factory.getPool(token0, token1, feeTier);
  if (pool === ethers.ZeroAddress) {
    console.log("Pool missing. Creating...");
    const tx = await factory.createPool(token0, token1, feeTier); // gas auto-estimated
    const rc = await tx.wait();
    pool = await factory.getPool(token0, token1, feeTier);
    if (pool === ethers.ZeroAddress) throw new Error("Pool still zero after create");
    console.log(`✅ Pool created: ${pool} (tx=${rc.hash})`);
  } else {
    console.log(`ℹ️ Pool exists: ${pool}`);
  }

  // Step 2: Initialize pool
  const poolCtr = new ethers.Contract(pool, poolAbi, wallet);
  try {
    console.log(`Initializing pool with sqrtPriceX96=${sqrtPriceX96}`);
    const itx = await poolCtr.initialize(sqrtPriceX96); // gas auto-estimated
    const irc = await itx.wait();
    console.log(`✅ Pool initialized. tx=${irc.hash}`);
  } catch (e) {
    if (String(e?.message||"").includes("already initialized")) {
      console.log("ℹ️ Pool already initialized; skipping.");
    } else {
      throw e;
    }
  }

  // Step 3: Mint liquidity
  const npm = new ethers.Contract(NPM, npmAbi, wallet);

  const slotIface = new ethers.Interface(["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"]);
  const poolView  = new ethers.Contract(pool, slotIface.fragments, wallet.provider);
  const [, tick]  = await poolView.slot0();
  const width     = 120;
  const tickLower = tick - width;
  const tickUpper = tick + width;

  const erc20Abi = ["function approve(address spender,uint256 amount) returns (bool)"];
  const tokenAContract = new ethers.Contract(tokenA, erc20Abi, wallet);
  const tokenBContract = new ethers.Contract(tokenB, erc20Abi, wallet);
  await tokenAContract.approve(NPM, amountA);
  await tokenBContract.approve(NPM, amountB);

  const params = {
    token0,
    token1,
    fee: feeTier,
    tickLower,
    tickUpper,
    amount0Desired: amountA,
    amount1Desired: amountB,
    amount0Min: 0,
    amount1Min: 0,
    recipient: wallet.address,
    deadline: Math.floor(Date.now() / 1000) + 600
  };

  console.log(`Minting liquidity: amount0=${amountA.toString()} amount1=${amountB.toString()} ticks [${tickLower},${tickUpper}]`);
  const txMint = await npm.mint(params); // gas auto-estimated
  const rcMint = await txMint.wait();
  console.log(`✅ Liquidity minted. tx=${rcMint.hash}`);

  return pool;
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  // BWAEZI/USDC
  const BWAEZI = "0x9be921e5efacd53bc4eebcfdc4494d257cfab5da";
  const USDC   = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
  const sqrtBWUSDC = "0x2b5e3af16b1880000"; // peg: 1 BWAEZI = 100 USDC
  const bwAmtUSDC  = ethers.parseEther("0.05");
  const usdcAmt    = ethers.parseUnits("5", 6);

  console.log("=== BWAEZI/USDC ===");
  await createInitMint(wallet, BWAEZI, USDC, 500, sqrtBWUSDC, bwAmtUSDC, usdcAmt);

  // BWAEZI/WETH
  const WETH   = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
  const sqrtBWWETH = "0x2f3c8e0a7f0c000000000000"; // peg: 1 BWAEZI = $100, ETH/USD ≈ 3015
  const bwAmtWETH  = ethers.parseEther("0.05");
  const wethAmt    = ethers.parseEther("0.0016");

  console.log("=== BWAEZI/WETH ===");
  await createInitMint(wallet, BWAEZI, WETH, 3000, sqrtBWWETH, bwAmtWETH, wethAmt);

  console.log("🎯 Done: both pools created, initialized, and seeded with liquidity.");
}

main().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
