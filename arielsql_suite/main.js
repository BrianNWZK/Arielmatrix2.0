// main.js
// Goal: Mint & seed BWAEZI/USDC (fee 500) and BWAEZI/WETH (fee 3000) via SCW.execute
// Pools are already created and initialized. Caller signs; SCW executes.
// No checksum enforcement on addresses. No AA/bundler — same path as pool creation (EOA → SCW.execute).

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Core contracts (plain strings)
const NPM    = "0xc36442b4a4522e871399cd717abdd847ab11fe88"; // NonfungiblePositionManager
const SCW    = process.env.SCW_ADDRESS || "0x59be70f1c57470d7773c3d5d27b8d165fcbe7eb2";

// Tokens
const BWAEZI = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";
const USDC   = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH   = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

// Pools (already created and initialized)
const POOL_BW_USDC = "0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"; // fee 500, spacing 10
const POOL_BW_WETH = "0x142C3dce0a5605Fb385fAe7760302fab761022aa"; // fee 3000, spacing 60

// ABIs
const scwAbi  = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const poolAbi = ["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)"];
const npmAbi  = ["function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline))"];

// Helpers
function getTickSpacing(feeTier) {
  switch (feeTier) {
    case 100: return 1;
    case 500: return 10;
    case 3000: return 60;
    case 10000: return 200;
    default: throw new Error(`Unsupported fee tier: ${feeTier}`);
  }
}
function nearestUsableTick(tick, spacing) {
  const q = Math.floor(tick / spacing);
  return q * spacing;
}
function feeForPool(addr) {
  return addr.toLowerCase() === POOL_BW_USDC.toLowerCase() ? 500 : 3000;
}
function spacingForPool(addr) {
  return getTickSpacing(feeForPool(addr));
}

async function buildMintCalldata(provider, poolAddr, tokenA, tokenB, amountADesired, amountBDesired) {
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const [sqrtPriceX96, tick] = await pool.slot0();
  if (sqrtPriceX96 === 0n) throw new Error(`Pool ${poolAddr} not initialized`);
  const spacing = spacingForPool(poolAddr);

  const halfWidth = 120;
  const lowerAligned = nearestUsableTick(Number(tick) - halfWidth, spacing);
  const upperAligned = nearestUsableTick(Number(tick) + halfWidth, spacing);
  const tickLower = BigInt(lowerAligned);
  const tickUpper = BigInt(upperAligned === lowerAligned ? lowerAligned + spacing : upperAligned);

  // Lexicographic order required by Uniswap
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountADesired : amountBDesired;
  const amount1Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountBDesired : amountADesired;

  const feeTier = feeForPool(poolAddr);

  const params = {
    token0,
    token1,
    fee: feeTier,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    amount0Min: 0,
    amount1Min: 0,
    recipient: SCW,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 1800)
  };

  console.log(`Pool=${poolAddr} tick=${Number(tick)} spacing=${spacing} range=[${tickLower},${tickUpper}]`);
  console.log(`token0=${token0} amount0=${amount0Desired.toString()} | token1=${token1} amount1=${amount1Desired.toString()} fee=${feeTier}`);

  const iface = new ethers.Interface(npmAbi);
  return iface.encodeFunctionData("mint", [params]);
}

async function mintViaSCW(signer, mintData, label) {
  const scw = new ethers.Contract(SCW, scwAbi, signer);
  const tx = await scw.execute(NPM, 0n, mintData, { gasLimit: 800000 });
  console.log(`SCW execute (${label}) tx: ${tx.hash}`);
  const rc = await tx.wait();
  if (rc.status === 1) {
    console.log(`✅ Mint (${label}) succeeded — block ${rc.blockNumber}`);
  } else {
    console.log(`❌ Mint (${label}) reverted`);
  }
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const signer   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`Signer: ${signer.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(signer.address))} ETH`);

  // BWAEZI/USDC — asymmetric BWAEZI-only seed
  const usdcMintData = await buildMintCalldata(
    provider,
    POOL_BW_USDC,
    BWAEZI,
    USDC,
    ethers.parseEther("0.05"), // BWAEZI (18 decimals)
    0n                          // USDC (6 decimals)
  );
  await mintViaSCW(signer, usdcMintData, "BWAEZI/USDC (asym BW only)");

  // BWAEZI/WETH — asymmetric BWAEZI-only seed
  const wethMintData = await buildMintCalldata(
    provider,
    POOL_BW_WETH,
    BWAEZI,
    WETH,
    ethers.parseEther("0.05"), // BWAEZI
    0n                          // WETH
  );
  await mintViaSCW(signer, wethMintData, "BWAEZI/WETH (asym BW only)");

  console.log("🎯 BOTH POOLS SEEDED — GENESIS COMPLETE");
}

main().catch(err => {
  console.error("Fatal:", err.reason || err.message || err);
  process.exit(1);
});
