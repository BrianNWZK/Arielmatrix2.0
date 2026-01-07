// main.js
// Genesis seeding script with HTTP server for deployment health (no approvals)

import express from "express";
import { ethers } from "ethers";

// ===== Constants =====
const NPM = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88"); // NonfungiblePositionManager

// ===== Env =====
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT        = process.env.PORT || 10000;

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
const scwAbi = [
  "function execute(address to,uint256 value,bytes data) returns (bytes)"
];
// Named tuple ABI; we will pass positional array (works in ethers v6)
const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];

// ===== Helpers =====
function spacingForFee(fee) {
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  return 1;
}
function alignTickAround(tick, spacing, spans = 12) {
  const lower = Math.floor((tick - spans * spacing) / spacing) * spacing;
  const upper = Math.floor((tick + spans * spacing) / spacing) * spacing + spacing; // ensure upper > lower
  return { lower, upper };
}
function nowDeadline(secs = 1200) {
  return Math.floor(Date.now() / 1000) + secs;
}
function encodeMint(paramsArray) {
  const iface = new ethers.Interface(npmAbi);
  return iface.encodeFunctionData("mint", [paramsArray]); // positional array in correct order
}
function scwEncodeExecute(to, value, data) {
  const iface = new ethers.Interface(scwAbi);
  return iface.encodeFunctionData("execute", [to, value, data]);
}

// ===== Mint Tiny BW/USDC =====
async function mintTinyBWUSDC(wallet, provider) {
  const pool = new ethers.Contract(POOL_BW_USDC, poolAbi, provider);

  let currentTick = 0;
  try {
    const [, tick] = await pool.slot0();
    currentTick = Number(tick);
    console.log(`Current BWAEZI/USDC tick: ${currentTick}`);
  } catch (e) {
    console.warn("slot0 unavailable — using tick=0", e.message);
  }

  const spacing = spacingForFee(500);
  let tickLower, tickUpper;
  if (Math.abs(currentTick) > 200000) {
    console.warn("Extreme tick — using full-range bootstrap");
    tickLower = -887272;
    tickUpper = 887272;
  } else {
    const { lower, upper } = alignTickAround(currentTick, spacing);
    tickLower = lower;
    tickUpper = upper;
  }

  // Safe amounts: 1 USDC + 0.01 bwzC
  const amountUSDC = ethers.parseUnits("1", 6);
  const amountBW   = ethers.parseUnits("0.01", 18);

  // Positional array in correct order (token0=BWAEZI, token1=USDC)
  const paramsArray = [
    BWAEZI,           // token0
    USDC,             // token1
    500,              // fee
    tickLower,        // tickLower
    tickUpper,        // tickUpper
    amountBW,         // amount0Desired (bwzC)
    amountUSDC,       // amount1Desired (USDC)
    0n,               // amount0Min
    0n,               // amount1Min
    SCW,              // recipient
    nowDeadline()     // deadline
  ];

  const mintData = encodeMint(paramsArray);
  if (!mintData || mintData.length < 10) throw new Error("mintData encoding failed");

  const execMint = scwEncodeExecute(NPM, 0n, mintData);
  if (!execMint || execMint.length < 10) throw new Error("SCW execute encoding failed");

  console.log(`Minting BWAEZI/USDC full-range: ${ethers.formatEther(amountBW)} bwzC + ${ethers.formatUnits(amountUSDC,6)} USDC`);
  console.log(`execMint hex length: ${execMint.length}`);

  const tx = await wallet.sendTransaction({ to: SCW, data: execMint, gasLimit: 900000 });
  const rc = await tx.wait();
  console.log("BWAEZI/USDC mint tx:", tx.hash, "status:", rc.status);
  if (rc.status !== 1) throw new Error("BW/USDC mint reverted");
}

// ===== Mint Tiny BW/WETH =====
async function mintTinyBWWETH(wallet, provider) {
  const pool = new ethers.Contract(POOL_BW_WETH, poolAbi, provider);

  let currentTick = 0;
  try {
    const [, tick] = await pool.slot0();
    currentTick = Number(tick);
    console.log(`Current BWAEZI/WETH tick: ${currentTick}`);
  } catch (e) {
    console.warn("slot0 unavailable — using tick=0", e.message);
  }

  const spacing = spacingForFee(3000);
  let tickLower, tickUpper;
  if (Math.abs(currentTick) > 200000) {
    console.warn("Extreme tick — using full-range bootstrap");
    tickLower = -887272;
    tickUpper = 887272;
  } else {
    const { lower, upper } = alignTickAround(currentTick, spacing);
    tickLower = lower;
    tickUpper = upper;
  }

  const amountBW   = ethers.parseUnits("0.01", 18);
  const amountWETH = ethers.parseUnits("0.0003", 18); // ~0.03 WETH per bwzC

  // Positional array in correct order (token0=BWAEZI, token1=WETH)
  const paramsArray = [
    BWAEZI,           // token0
    WETH,             // token1
    3000,             // fee
    tickLower,        // tickLower
    tickUpper,        // tickUpper
    amountBW,         // amount0Desired (bwzC)
    amountWETH,       // amount1Desired (WETH)
    0n,               // amount0Min
    0n,               // amount1Min
    SCW,              // recipient
    nowDeadline()     // deadline
  ];

  const mintData = encodeMint(paramsArray);
  if (!mintData || mintData.length < 10) throw new Error("mintData encoding failed");

  const execMint = scwEncodeExecute(NPM, 0n, mintData);
  if (!execMint || execMint.length < 10) throw new Error("SCW execute encoding failed");

  console.log(`Minting BWAEZI/WETH: ${ethers.formatEther(amountBW)} bwzC + ${ethers.formatEther(amountWETH)} WETH`);
  console.log(`execMint hex length: ${execMint.length}`);

  const tx = await wallet.sendTransaction({ to: SCW, data: execMint, gasLimit: 900000 });
  const rc = await tx.wait();
  console.log("BWAEZI/WETH mint tx:", tx.hash, "status:", rc.status);
  if (rc.status !== 1) throw new Error("BW/WETH mint reverted");
}

// ===== Seeding runner =====
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
    throw e; // let server exit with error
  }
}

// ===== Server (run once then exit) =====
const app = express();
app.get("/", (req, res) => res.send("BWAEZI seeding in progress..."));

app.listen(PORT, async () => {
  console.log(`Server bound on port ${PORT}`);
  try {
    await runSeeding();
    process.exit(0); // success exit
  } catch {
    process.exit(1); // failure exit
  }
});
