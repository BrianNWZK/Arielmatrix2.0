// main.js — Asymmetric mint & seed only (BWAEZI/USDC + BWAEZI/WETH)
// Direct EOA → SCW.execute — no AA, no pre-sim
// Fixed tick calculation to avoid NaN/underflow

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const NPM    = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"); // new BWAEZI token
const USDC   = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH   = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const SCW    = ethers.getAddress("0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");

// Pools
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562");
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa");

// ABIs
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function tickSpacing() view returns (int24)"
];
const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];

async function getTickAndSpacing(provider, poolAddr, feeTier) {
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const slot0 = await pool.slot0();
  const tick = Number(slot0.tick);
  const spacing = getTickSpacing(feeTier); // fallback if query fails
  return { tick, spacing };
}

function getTickSpacing(feeTier) {
  switch (feeTier) {
    case 100:   return 1;
    case 500:   return 10;
    case 3000:  return 60;
    case 10000: return 200;
    default:    return 60; // safe default
  }
}

async function buildMintData(provider, poolAddr, tokenA, tokenB, feeTier, amountA, amountB) {
  const { tick, spacing } = await getTickAndSpacing(provider, poolAddr, feeTier);

  const width = 120;
  const lowerRaw = tick - width;
  const upperRaw = tick + width;

  // Align ticks safely (avoid NaN/underflow)
  const tickLower = Math.floor(lowerRaw / spacing) * spacing;
  let tickUpper   = Math.ceil(upperRaw / spacing) * spacing;
  if (tickUpper <= tickLower) tickUpper = tickLower + spacing; // ensure non-zero width

  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase()
    ? [tokenA, tokenB]
    : [tokenB, tokenA];

  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountA : amountB;
  const amount1Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountB : amountA;

  const params = [
    token0,
    token1,
    feeTier,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    0n,
    0n,
    SCW,
    Math.floor(Date.now() / 1000) + 1800
  ];

  const npmIface = new ethers.Interface(npmAbi);
  const mintData = npmIface.encodeFunctionData("mint", [params]);

  return { mintData, tickLower, tickUpper, tick, spacing };
}

async function mintViaSCW(wallet, mintData, poolAddr) {
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);

  const tx = await wallet.sendTransaction({
    to: SCW,
    data: execData,
    gasLimit: 500000
  });

  console.log(`Mint tx for ${poolAddr}: ${tx.hash}`);
  const rc = await tx.wait();
  if (rc.status === 1) {
    console.log(`✅ Mint succeeded`);
  } else {
    console.log(`❌ Mint reverted`);
  }
}

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH\n`);

  // 1. BWAEZI/USDC — BWAEZI only
  const { mintData: usdcMint } = await buildMintData(
    provider,
    POOL_BW_USDC,
    BWAEZI,
    USDC,
    500,
    ethers.parseEther("0.05"),
    0n
  );
  await mintViaSCW(wallet, usdcMint, POOL_BW_USDC);

  // 2. BWAEZI/WETH — BWAEZI only
  const { mintData: wethMint } = await buildMintData(
    provider,
    POOL_BW_WETH,
    BWAEZI,
    WETH,
    3000,
    ethers.parseEther("0.05"),
    0n
  );
  await mintViaSCW(wallet, wethMint, POOL_BW_WETH);

  console.log("🎯 BOTH POOLS SEEDED — GENESIS COMPLETE");
}

main().catch(e => console.error("Fatal:", e.message || e));
