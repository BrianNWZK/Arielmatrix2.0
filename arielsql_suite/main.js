// main.js — Asymmetric mint & seed only (BWAEZI/USDC + BWAEZI/WETH)
// Direct EOA owner → SCW.execute — same as pool creation
// Out-of-range above current price (BWAEZI-only sell wall for peg defense)
// No checksum enforcement on addresses

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // EOA owner with gas

// Core contracts (plain strings)
const NPM  = "0xc36442b4a4522e871399cd717abdd847ab11fe88";
const BWAEZI = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";
const USDC   = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH   = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const SCW    = process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2";

// Pools (plain strings)
const POOL_BW_USDC = "0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"; // fee 500, spacing 10
const POOL_BW_WETH = "0x142C3dce0a5605Fb385fAe7760302fab761022aa"; // fee 3000, spacing 60

// ABIs
const poolAbi = ["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)"];
const npmAbi  = ["function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"];
const scwAbi  = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];

// Helpers
function feeTierForPool(addr) {
  return addr.toLowerCase() === POOL_BW_USDC.toLowerCase() ? 500 : 3000;
}
function spacingForFeeTier(feeTier) {
  switch (feeTier) {
    case 500: return 10;
    case 3000: return 60;
    default: throw new Error(`Unsupported fee tier: ${feeTier}`);
  }
}

async function getCurrentTick(provider, poolAddr) {
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const [, tick] = await pool.slot0();
  return Number(tick);
}

async function buildMintData(provider, poolAddr, tokenA, tokenB, amountADesired) {
  const currentTick = await getCurrentTick(provider, poolAddr);
  const feeTier = feeTierForPool(poolAddr);
  const spacing = spacingForFeeTier(feeTier);

  // Out-of-range above current tick to enforce BWAEZI-only
  // Lower set above current, wide upper range
  const tickLower = Math.floor((currentTick + spacing * 10) / spacing) * spacing;
  const tickUpperAligned = Math.ceil((currentTick + spacing * 110) / spacing) * spacing;
  const tickUpper = tickUpperAligned <= tickLower ? tickLower + spacing : tickUpperAligned;

  // Lexicographic token order required by Uniswap
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];

  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountADesired : 0n;
  const amount1Desired = token0.toLowerCase() === tokenA.toLowerCase() ? 0n : amountADesired;

  console.log(`Pool ${poolAddr}: currentTick=${currentTick} lower=${tickLower} upper=${tickUpper} spacing=${spacing}`);

  const params = [
    token0,
    token1,
    feeTier,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    0n, // amount0Min
    0n, // amount1Min
    SCW,
    Math.floor(Date.now() / 1000) + 1800
  ];

  const npmIface = new ethers.Interface(npmAbi);
  return npmIface.encodeFunctionData("mint", [params]);
}

async function mintViaSCW(wallet, mintData, poolAddr, label) {
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);

  console.log(`Calldata length: ${execData.length}`);

  const tx = await wallet.sendTransaction({
    to: SCW,
    data: execData,
    gasLimit: 800000 // give SCW enough gas to forward and mint
  });

  console.log(`Mint tx (${label}) for ${poolAddr}: ${tx.hash}`);
  const rc = await tx.wait();
  if (rc.status === 1) {
    console.log(`✅ Mint (${label}) succeeded`);
  } else {
    console.log(`❌ Mint (${label}) reverted`);
  }
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH\n`);

  const seedAmount = ethers.parseEther("0.05"); // Adjust for more depth if desired

  // 1. BWAEZI/USDC — BWAEZI-only out-of-range above price
  const usdcMintData = await buildMintData(provider, POOL_BW_USDC, BWAEZI, USDC, seedAmount);
  await mintViaSCW(wallet, usdcMintData, POOL_BW_USDC, "BWAEZI/USDC (asym BW only)");

  // 2. BWAEZI/WETH — BWAEZI-only out-of-range above price
  const wethMintData = await buildMintData(provider, POOL_BW_WETH, BWAEZI, WETH, seedAmount);
  await mintViaSCW(wallet, wethMintData, POOL_BW_WETH, "BWAEZI/WETH (asym BW only)");

  console.log("🎯 BOTH POOLS SEEDED — GENESIS COMPLETE");
}

main().catch(e => console.error("Fatal:", e.message || e));
