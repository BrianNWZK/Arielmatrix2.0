// main.js
// Genesis seeding script with HTTP server for deployment health

import express from "express";
import { ethers } from "ethers";

// ===== Env =====
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT        = process.env.PORT || 3000;

// ===== Pools & Tokens =====
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // fee 3000
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// ===== ABIs =====
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];
const scwAbi  = ["function execute(address to,uint256 value,bytes data) returns (bytes)"];
const npmAbi  = ["function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256,uint128,uint256,uint256)"];

// ===== Helpers =====
function spacingForFee(fee) {
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  return 1;
}
function alignTickAround(tick, spacing, spans = 6) {
  const lower = Math.floor((tick - spans * spacing) / spacing) * spacing;
  const upper = Math.floor((tick + spans * spacing) / spacing) * spacing;
  return { lower, upper };
}
function nowDeadline(secs) {
  return Math.floor(Date.now() / 1000) + secs;
}
function encodeMint(params) {
  const iface = new ethers.Interface(npmAbi);
  return iface.encodeFunctionData("mint", [params]);
}

// ===== Mint Tiny BW/USDC =====
async function mintTinyBWUSDC(wallet, provider) {
  const pool = new ethers.Contract(POOL_BW_USDC, poolAbi, provider);

  let currentTick = 0;
  try {
    const [, tick] = await pool.slot0();
    currentTick = Number(tick);
    console.log(`Current BWAEZI/USDC tick: ${currentTick}`);
  } catch {
    console.warn("slot0 unavailable — using tick=0");
  }

  const spacing = spacingForFee(500);
  let tickLower, tickUpper;
  if (Math.abs(currentTick) > 200000) {
    console.warn("Extreme tick — using full-range bootstrap");
    tickLower = -887272;
    tickUpper = 887272;
  } else {
    const { lower, upper } = alignTickAround(currentTick, spacing, 12);
    tickLower = lower;
    tickUpper = upper;
  }

  // Safe amounts: 1 USDC + 0.01 bwzC
  const amountUSDC = ethers.parseUnits("1", 6);
  const amountBW   = ethers.parseUnits("0.01", 18);

  const params = {
    token0: BWAEZI,
    token1: USDC,
    fee: 500,
    tickLower,
    tickUpper,
    amount0Desired: amountBW,
    amount1Desired: amountUSDC,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: SCW,
    deadline: nowDeadline(1200)
  };

  const mintData = encodeMint(params);
  const scwIface = new ethers.Interface(scwAbi);
  const execMint = scwIface.encodeFunctionData("execute", [POOL_BW_USDC, 0n, mintData]);

  console.log(`Minting BWAEZI/USDC: bwzC=${ethers.formatEther(amountBW)}, USDC=${ethers.formatUnits(amountUSDC,6)}`);
  const tx = await wallet.sendTransaction({ to: SCW, data: execMint, gasLimit: 900000 });
  await tx.wait();
  console.log("BWAEZI/USDC mint complete:", tx.hash);
}

// ===== Mint Tiny BW/WETH =====
async function mintTinyBWWETH(wallet, provider) {
  const pool = new ethers.Contract(POOL_BW_WETH, poolAbi, provider);

  let currentTick = 0;
  try {
    const [, tick] = await pool.slot0();
    currentTick = Number(tick);
    console.log(`Current BWAEZI/WETH tick: ${currentTick}`);
  } catch {
    console.warn("slot0 unavailable — using tick=0");
  }

  const spacing = spacingForFee(3000);
  let tickLower, tickUpper;
  if (Math.abs(currentTick) > 200000) {
    console.warn("Extreme tick — using full-range bootstrap");
    tickLower = -887272;
    tickUpper = 887272;
  } else {
    const { lower, upper } = alignTickAround(currentTick, spacing, 12);
    tickLower = lower;
    tickUpper = upper;
  }

  // Safe amounts: 0.01 bwzC + 0.0003 WETH (~peg 0.03 WETH/bwzC)
  const amountBW   = ethers.parseUnits("0.01", 18);
  const amountWETH = ethers.parseUnits("0.0003", 18);

  const params = {
    token0: BWAEZI,
    token1: WETH,
    fee: 3000,
    tickLower,
    tickUpper,
    amount0Desired: amountBW,
    amount1Desired: amountWETH,
    amount0Min: 0n,
    amount1Min: 0n,
    recipient: SCW,
    deadline: nowDeadline(1200)
  };

  const mintData = encodeMint(params);
  const scwIface = new ethers.Interface(scwAbi);
  const execMint = scwIface.encodeFunctionData("execute", [POOL_BW_WETH, 0n, mintData]);

  console.log(`Minting BWAEZI/WETH: bwzC=${ethers.formatEther(amountBW)}, WETH=${ethers.formatEther(amountWETH)}`);
  const tx = await wallet.sendTransaction({ to: SCW, data: execMint, gasLimit: 900000 });
  await tx.wait();
  console.log("BWAEZI/WETH mint complete:", tx.hash);
}

// ===== Main seeding =====
async function runSeeding() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`SCW: ${SCW}`);

  try {
    await mintTinyBWUSDC(wallet, provider);
    await mintTinyBWWETH(wallet, provider);
    console.log("✅ Genesis seeding complete");
  } catch (e) {
    console.error("Fatal error during seeding:", e.message || e);
  }
}

// ===== Server =====
const app = express();
app.get("/", (req, res) => {
  res.send("BWAEZI seeding service is running");
});

app.listen(PORT, async () => {
  console.log(`Server bound on port ${PORT}`);
  await runSeeding();
  process.exit(0); // exit once after seeding
});
