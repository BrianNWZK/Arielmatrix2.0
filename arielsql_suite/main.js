// main.js — Single-sided out-of-range mint & seed (BWAEZI-only above price)
// Direct EOA → SCW.execute — same as pool creation (direct signer)

import { ethers } from "ethers";

const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const NPM = ethers.getAddress("0xc36442b4a4522e871399cd717abdd847ab11fe88");
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const SCW = ethers.getAddress("0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");

// Pools
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562");
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa");

// ABIs
const poolAbi = ["function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)"];
const npmAbi = ["function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256,uint128,uint256,uint256)"];
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];

async function getCurrentTick(provider, poolAddr) {
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const { tick } = await pool.slot0();
  return Number(tick);
}

async function buildMintData(provider, poolAddr, tokenA, tokenB, amountA) {
  const currentTick = await getCurrentTick(provider, poolAddr);
  const feeTier = poolAddr === POOL_BW_USDC ? 500 : 3000;
  const spacing = feeTier === 500 ? 10 : 60;

  // Out-of-range above current tick (BWAEZI-only sell wall)
  const tickLower = currentTick + spacing * 10; // 10 spacings above
  const tickUpper = tickLower + spacing * 100; // wide range

  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() ? [tokenA, tokenB] : [tokenB, tokenA];
  const amount0Desired = token0.toLowerCase() === tokenA.toLowerCase() ? amountA : 0n;
  const amount1Desired = token0.toLowerCase() === tokenA.toLowerCase() ? 0n : amountA;

  const params = [
    token0, token1, feeTier,
    tickLower, tickUpper,
    amount0Desired, amount1Desired,
    0n, 0n,
    SCW,
    Math.floor(Date.now() / 1000) + 1800
  ];

  const npmIface = new ethers.Interface(npmAbi);
  return npmIface.encodeFunctionData("mint", [params]);
}

async function mintViaSCW(wallet, mintData, poolAddr) {
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);

  const tx = await wallet.sendTransaction({
    to: SCW,
    data: execData,
    gasLimit: 600000
  });

  console.log(`Mint tx for ${poolAddr}: ${tx.hash}`);
  const rc = await tx.wait();
  if (rc.status === 1) {
    console.log("✅ Mint succeeded");
  } else {
    console.log("❌ Mint reverted");
  }
}

async function main() {
  if (!PRIVATE_KEY) throw "Missing PRIVATE_KEY";

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH\n`);

  const seedAmount = ethers.parseEther("0.05");

  // 1. BWAEZI/USDC
  const usdcMintData = await buildMintData(provider, POOL_BW_USDC, BWAEZI, USDC, seedAmount);
  await mintViaSCW(wallet, usdcMintData, POOL_BW_USDC);

  // 2. BWAEZI/WETH
  const wethMintData = await buildMintData(provider, POOL_BW_WETH, BWAEZI, WETH, seedAmount);
  await mintViaSCW(wallet, wethMintData, POOL_BW_WETH);

  console.log("🎯 BOTH POOLS SEEDED — GENESIS COMPLETE");
}

main().catch(e => console.error("Fatal:", e.message || e));
