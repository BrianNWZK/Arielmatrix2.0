// main.js
// One-shot genesis seeding (hardened + idempotent)
// Token symbol: bwzC (BWAEZI token address variable kept for on-chain calls)
// - tiny bwzC/USDC and bwzC/WETH mints (in-range)
// - microseed swaps (USDC->bwzC, USDC->WETH, tiny WETH->bwzC)
// Guards and safety:
//  - pool liquidity guard (skip if pool already live)
//  - SCW in-range position scan (skip if SCW already has in-range positions)
//  - optional on-chain run-once flag contract (set via FLAG_CONTRACT env)
//  - balance gating, approvals, conservative deadlines and gas limits
// Additional safety:
//  - local lock file to avoid concurrent runs on the same host
//  - robust allowance checks using BigInt and re-check after mining
//  - early HTTP server start so hosting platforms see the process as alive
//  - tx logging to a local file for audit
//
// Usage: set RPC_URL, PRIVATE_KEY, SCW_ADDRESS, optional FLAG_CONTRACT, then run once.

import { ethers } from "ethers";
import http from "http";
import fs from "fs";
import path from "path";

// ===== Env =====
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT        = Number(process.env.PORT || 8080);
const FLAG_CONTRACT = process.env.FLAG_CONTRACT || null; // optional on-chain run-once flag contract

// ===== Local lock & tx log =====
const LOCK_FILE = process.env.LOCK_FILE || path.join("/tmp", "genesis_seeding_lock");
const TX_LOG_FILE = process.env.TX_LOG_FILE || path.join(process.cwd(), "genesis-tx-log.jsonl");

function acquireLocalLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      console.log("Local lock present — another instance may be running. Exiting.");
      process.exit(0);
    }
    fs.writeFileSync(LOCK_FILE, String(Date.now()));
    process.on("exit", () => { try { fs.unlinkSync(LOCK_FILE); } catch {} });
    process.on("SIGINT", () => process.exit(0));
    process.on("SIGTERM", () => process.exit(0));
  } catch (e) {
    console.warn("Could not acquire local lock:", e?.message || e);
  }
}
function recordTx(label, hash) {
  try {
    const entry = { label, hash, ts: Date.now() };
    fs.appendFileSync(TX_LOG_FILE, JSON.stringify(entry) + "\n");
  } catch (e) {
    console.warn("Failed to write tx log:", e?.message || e);
  }
}

// ===== Core contracts =====
const NPM     = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88"); // NonfungiblePositionManager
const ROUTER  = ethers.getAddress("0xE592427A0AEce92De3Edee1F18E0157C05861564"); // Uniswap V3 router
const FACTORY = ethers.getAddress("0x1F98431c8aD98523631AE4a59f267346ea31F984"); // Uniswap V3 factory

// ===== Tokens =====
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"); // on-chain address
const BWAEZI_SYMBOL = "bwzC"; // human-readable symbol for logs
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// ===== Pools (known) =====
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500, spacing 10
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // fee 3000, spacing 60

// ===== Fee tiers =====
const FEE_USDC = 500;   // bwzC/USDC
const FEE_WETH = 3000;  // bwzC/WETH

// ===== Peg anchors =====
const PEG_USDC_PER_BWZ = 100;
const PEG_WETH_PER_BWZ = 0.03;

// ===== Thresholds and sizes (tune if needed) =====
const LIQ_THRESHOLD = 1n;
const MINT_USDC_DESIRED = ethers.parseUnits("6", 6);
const MINT_BW_DESIRED   = ethers.parseEther("0.001");
const BW_WETH_BW_TINY   = ethers.parseEther("0.02");
const BW_WETH_WETH_TINY = ethers.parseEther("0.0005");
const MICRO_USDC_BW     = ethers.parseUnits("5", 6);
const MICRO_USDC_WETH   = ethers.parseUnits("3", 6);
const MICRO_WETH_BW     = ethers.parseEther("0.0005");

// ===== ABIs =====
const scwAbi  = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const npmAbi  = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner,uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const routerAbi = ["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"];
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)"
];
const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)"
];
const flagAbi = ["function isInitialized() view returns (bool)","function setInitialized()"];

// ===== Helpers =====
function nowDeadline(secs = 600) { return Math.floor(Date.now() / 1000) + secs; }
function sortLex(a, b) { return a.toLowerCase() < b.toLowerCase() ? [a, b] : [b, a]; }
function spacingForFee(fee) { if (fee === 500) return 10; if (fee === 3000) return 60; throw new Error(`Unsupported fee ${fee}`); }
function alignTickAround(tick, spacing, widthSpans = 6) {
  const lower = Math.floor((tick - spacing * widthSpans) / spacing) * spacing;
  let upper = Math.ceil((tick + spacing * widthSpans) / spacing) * spacing;
  if (upper <= lower) upper = lower + spacing;
  return { lower, upper };
}
function encodeExactInputSingle({ tokenIn, tokenOut, fee, recipient, amountIn, amountOutMinimum = 0n, sqrtPriceLimitX96 = 0n }) {
  const iface = new ethers.Interface(routerAbi);
  const params = [tokenIn, tokenOut, fee, recipient, nowDeadline(600), amountIn, amountOutMinimum, sqrtPriceLimitX96];
  return iface.encodeFunctionData("exactInputSingle", [params]);
}
function encodeMint(params) {
  const iface = new ethers.Interface(npmAbi);
  return iface.encodeFunctionData("mint", [params]);
}
async function getPoolTick(provider, poolAddr) {
  const p = new ethers.Contract(poolAddr, poolAbi, provider);
  const [, tick] = await p.slot0();
  return Number(tick);
}
async function getPoolLiquidity(provider, poolAddr) {
  const p = new ethers.Contract(poolAddr, poolAbi, provider);
  const liq = await p.liquidity();
  return BigInt(liq.toString());
}
async function tokenBalance(provider, token, owner) {
  const c = new ethers.Contract(token, erc20Abi, provider);
  const bal = await c.balanceOf(owner);
  return BigInt(bal.toString());
}
async function getDecimals(provider, token) {
  const c = new ethers.Contract(token, erc20Abi, provider);
  return Number(await c.decimals());
}

// Read pool token0/token1/fee safely
async function readPoolTokens(provider, poolAddr) {
  try {
    const pool = new ethers.Contract(poolAddr, poolAbi, provider);
    const [t0, t1, fee] = await Promise.all([pool.token0(), pool.token1(), pool.fee()]);
    return { token0: t0, token1: t1, fee: Number(fee) };
  } catch (e) {
    throw new Error(`Failed to read pool tokens for ${poolAddr}: ${e.message || e}`);
  }
}

// ensureApproval: uses BigInt consistently and re-checks allowance after mining
async function ensureApproval(wallet, token, spender, amount, label) {
  const provider = wallet.provider;
  const c = new ethers.Contract(token, erc20Abi, provider);
  const allowanceBn = BigInt((await c.allowance(SCW, spender)).toString());
  const amountBn = BigInt(amount.toString());
  if (allowanceBn >= amountBn) {
    console.log(`Approval already present for ${label}`);
    return;
  }
  // Build approve calldata and call via SCW.execute so SCW (owner) executes approve
  const ercIface = new ethers.Interface(erc20Abi);
  const approveData = ercIface.encodeFunctionData("approve", [spender, amountBn]);
  const scwIface = new ethers.Interface(scwAbi);
  const exec = scwIface.encodeFunctionData("execute", [token, 0n, approveData]);
  console.log(`Issuing approve via SCW for ${label} -> spender ${spender}`);
  const tx = await wallet.sendTransaction({ to: SCW, data: exec, gasLimit: 250000 });
  await tx.wait();
  // re-check allowance
  const allowanceAfter = BigInt((await c.allowance(SCW, spender)).toString());
  if (allowanceAfter < amountBn) throw new Error(`Approval for ${label} did not take effect`);
  console.log(`Approval tx mined for ${label}: ${tx.hash}`);
  recordTx(`approve:${label}`, tx.hash);
}

// Scan SCW positions for an in-range position for a given pair+fee
async function scwOwnsInRangePosition(provider, tokenA, tokenB, fee) {
  try {
    const npm = new ethers.Contract(NPM, npmAbi, provider);
    const count = Number((await npm.balanceOf(SCW)).toString());
    if (count === 0) return false;
    let poolTick = null;
    if ((tokenA.toLowerCase() === BWAEZI.toLowerCase() && tokenB.toLowerCase() === USDC.toLowerCase()) ||
        (tokenB.toLowerCase() === BWAEZI.toLowerCase() && tokenA.toLowerCase() === USDC.toLowerCase())) {
      try { poolTick = await getPoolTick(provider, POOL_BW_USDC); } catch {}
    } else if ((tokenA.toLowerCase() === BWAEZI.toLowerCase() && tokenB.toLowerCase() === WETH.toLowerCase()) ||
               (tokenB.toLowerCase() === BWAEZI.toLowerCase() && tokenA.toLowerCase() === WETH.toLowerCase())) {
      try { poolTick = await getPoolTick(provider, POOL_BW_WETH); } catch {}
    }
    for (let i = 0; i < count; i++) {
      const tokenId = Number((await npm.tokenOfOwnerByIndex(SCW, i)).toString());
      const pos = await npm.positions(tokenId);
      const token0 = pos.token0.toLowerCase();
      const token1 = pos.token1.toLowerCase();
      const posFee = Number(pos.fee);
      const tickLower = Number(pos.tickLower);
      const tickUpper = Number(pos.tickUpper);
      const liquidity = BigInt(pos.liquidity.toString());
      if (liquidity === 0n) continue;
      const pairMatch = ((token0 === tokenA.toLowerCase() && token1 === tokenB.toLowerCase()) ||
                         (token0 === tokenB.toLowerCase() && token1 === tokenA.toLowerCase()));
      if (!pairMatch) continue;
      if (posFee !== fee) continue;
      if (poolTick === null) return true;
      if (tickLower <= poolTick && poolTick <= tickUpper) return true;
    }
    return false;
  } catch (e) {
    console.warn("Position scan failed:", e.message || e);
    return false;
  }
}

// Optional on-chain flag helpers (if FLAG_CONTRACT provided)
async function checkFlag(provider) {
  if (!FLAG_CONTRACT) return false;
  try {
    const f = new ethers.Contract(FLAG_CONTRACT, flagAbi, provider);
    return await f.isInitialized();
  } catch (e) {
    console.warn("Flag check failed:", e.message || e);
    return false;
  }
}
async function setFlag(wallet) {
  if (!FLAG_CONTRACT) return;
  try {
    const iface = new ethers.Interface(flagAbi);
    const data = iface.encodeFunctionData("setInitialized", []);
    const tx = await wallet.sendTransaction({ to: FLAG_CONTRACT, data, gasLimit: 100000 });
    await tx.wait();
    console.log("On-chain flag set:", tx.hash);
    recordTx("setFlag", tx.hash);
  } catch (e) {
    console.warn("Setting on-chain flag failed:", e.message || e);
  }
}

// ===== Actions =====
async function mintTinyBWUSDC(wallet, provider) {
  // Read pool tick and spacing
  let tick;
  try { tick = await getPoolTick(provider, POOL_BW_USDC); } catch (e) { throw new Error("Failed to read pool tick for BW/USDC: " + (e.message || e)); }
  const spacing = spacingForFee(FEE_USDC);
  const { lower, upper } = alignTickAround(tick, spacing, 6);

  const bwDec = await getDecimals(provider, BWAEZI);
  const usDec = await getDecimals(provider, USDC);

  const desiredBW = ethers.parseUnits("0.001", bwDec);
  const desiredUS = ethers.parseUnits("0.1", usDec);

  const scwUSDC = await tokenBalance(provider, USDC, SCW);
  const scwBW   = await tokenBalance(provider, BWAEZI, SCW);

  if (scwUSDC === 0n || scwBW === 0n) {
    console.log(`Skipping ${BWAEZI_SYMBOL}/USDC mint: SCW lacks USDC or ${BWAEZI_SYMBOL}`);
    return;
  }

  let amountUS = desiredUS;
  if (scwUSDC < desiredUS) amountUS = scwUSDC;
  let amountBW = (amountUS * 10n ** 12n) / BigInt(PEG_USDC_PER_BWZ);
  if (amountBW === 0n) amountBW = desiredBW;
  if (amountBW > scwBW) amountBW = scwBW;

  await ensureApproval(wallet, BWAEZI, NPM, amountBW, `${BWAEZI_SYMBOL}->NPM`);
  await ensureApproval(wallet, USDC,   NPM, amountUS, `${BWAEZI_SYMBOL}/USDC->NPM`);

  // token0/token1 ordering: try safe read, fallback to lexicographic
  let token0;
  try {
    const tokens = await readPoolTokens(provider, POOL_BW_USDC);
    token0 = tokens.token0;
  } catch (e) {
    console.warn("Could not read pool token0/token1; falling back to lexicographic ordering:", e.message || e);
    [token0] = sortLex(BWAEZI, USDC);
  }
  const t0 = token0.toLowerCase() === BWAEZI.toLowerCase() ? BWAEZI : USDC;
  const t1 = token0.toLowerCase() === BWAEZI.toLowerCase() ? USDC : BWAEZI;

  const amount0Desired = t0.toLowerCase() === BWAEZI.toLowerCase() ? amountBW : amountUS;
  const amount1Desired = t0.toLowerCase() === BWAEZI.toLowerCase() ? amountUS : amountBW;

  const amount0Min = (amount0Desired * 90n) / 100n;
  const amount1Min = (amount1Desired * 90n) / 100n;

  const params = [t0, t1, FEE_USDC, lower, upper, amount0Desired, amount1Desired, amount0Min, amount1Min, SCW, nowDeadline(1200)];
  const mintData = encodeMint(params);
  const scwIface = new ethers.Interface(scwAbi);
  const execMint = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);

  console.log(`Sending SCW.execute mint ${BWAEZI_SYMBOL}/USDC:`, { amountBW: ethers.formatUnits(amountBW, bwDec), amountUS: ethers.formatUnits(amountUS, usDec), lower, upper });
  const tx = await wallet.sendTransaction({ to: SCW, data: execMint, gasLimit: 900000 });
  const rc = await tx.wait();
  recordTx("mint:BW/USDC", tx.hash);
  if (rc.status === 1) console.log(`${BWAEZI_SYMBOL}/USDC mint succeeded:`, tx.hash);
  else console.warn(`${BWAEZI_SYMBOL}/USDC mint reverted:`, tx.hash);
}

async function mintTinyBWWETH(wallet, provider) {
  let tick;
  try { tick = await getPoolTick(provider, POOL_BW_WETH); } catch (e) { throw new Error("Failed to read pool tick for BW/WETH: " + (e.message || e)); }
  const spacing = spacingForFee(FEE_WETH);
  const { lower, upper } = alignTickAround(tick, spacing, 6);

  const scwBW = await tokenBalance(provider, BWAEZI, SCW);
  let scwWETH = await tokenBalance(provider, WETH, SCW);

  if (scwBW === 0n) {
    console.log(`Skipping ${BWAEZI_SYMBOL}/WETH mint: SCW has no ${BWAEZI_SYMBOL}`);
    return;
  }
  if (scwWETH === 0n) {
    console.log(`No WETH present for ${BWAEZI_SYMBOL}/WETH mint; skipping mint (WETH seeding may be attempted earlier)`);
    return;
  }

  let amountBW = BW_WETH_BW_TINY;
  if (amountBW > scwBW) amountBW = scwBW;
  let amountWETH = BW_WETH_WETH_TINY;
  if (amountWETH > scwWETH) amountWETH = scwWETH;

  await ensureApproval(wallet, BWAEZI, NPM, amountBW, `${BWAEZI_SYMBOL}->NPM (BW/WETH)`);
  await ensureApproval(wallet, WETH,   NPM, amountWETH, "WETH->NPM (BW/WETH)");

  let token0;
  try {
    const tokens = await readPoolTokens(provider, POOL_BW_WETH);
    token0 = tokens.token0;
  } catch (e) {
    console.warn("Could not read pool token0/token1 for BW/WETH; falling back to lexicographic ordering:", e.message || e);
    [token0] = sortLex(BWAEZI, WETH);
  }
  const t0 = token0.toLowerCase() === BWAEZI.toLowerCase() ? BWAEZI : WETH;
  const t1 = token0.toLowerCase() === BWAEZI.toLowerCase() ? WETH : BWAEZI;

  const amount0Desired = t0.toLowerCase() === BWAEZI.toLowerCase() ? amountBW : amountWETH;
  const amount1Desired = t0.toLowerCase() === BWAEZI.toLowerCase() ? amountWETH : amountBW;

  const amount0Min = (amount0Desired * 90n) / 100n;
  const amount1Min = (amount1Desired * 90n) / 100n;

  const params = [t0, t1, FEE_WETH, lower, upper, amount0Desired, amount1Desired, amount0Min, amount1Min, SCW, nowDeadline(1200)];
  const mintData = encodeMint(params);
  const scwIface = new ethers.Interface(scwAbi);
  const execMint = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);

  console.log(`Sending SCW.execute mint ${BWAEZI_SYMBOL}/WETH:`, { amountBW: ethers.formatEther(amountBW), amountWETH: ethers.formatEther(amountWETH), lower, upper });
  const tx = await wallet.sendTransaction({ to: SCW, data: execMint, gasLimit: 900000 });
  const rc = await tx.wait();
  recordTx("mint:BW/WETH", tx.hash);
  if (rc.status === 1) console.log(`${BWAEZI_SYMBOL}/WETH mint succeeded:`, tx.hash);
  else console.warn(`${BWAEZI_SYMBOL}/WETH mint reverted:`, tx.hash);
}

async function microseedSwaps(wallet, provider) {
  const scwIface = new ethers.Interface(scwAbi);
  const usDec = await getDecimals(provider, USDC);
  const bwDec = await getDecimals(provider, BWAEZI);
  const weDec = await getDecimals(provider, WETH);

  let scwUSDC = await tokenBalance(provider, USDC, SCW);

  // 1) 5 USDC -> bwzC (fee 500)
  const usdcForBw = ethers.parseUnits("5", usDec);
  if (scwUSDC >= usdcForBw) {
    const minBwz = (ethers.parseUnits("0.05", bwDec) * 70n) / 100n;
    await ensureApproval(wallet, USDC, ROUTER, usdcForBw, `USDC->Router (USDC->${BWAEZI_SYMBOL})`);
    const swap1 = encodeExactInputSingle({ tokenIn: USDC, tokenOut: BWAEZI, fee: FEE_USDC, recipient: SCW, amountIn: usdcForBw, amountOutMinimum: minBwz });
    const exec1 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap1]);
    console.log(`Microseed: 5 USDC -> ${BWAEZI_SYMBOL}`);
    const tx1 = await wallet.sendTransaction({ to: SCW, data: exec1, gasLimit: 600000 });
    await tx1.wait();
    recordTx("swap:USDC->BW", tx1.hash);
    console.log(`USDC->${BWAEZI_SYMBOL} swap:`, tx1.hash);
    scwUSDC = await tokenBalance(provider, USDC, SCW);
  } else {
    console.log(`Skipping 5 USDC->${BWAEZI_SYMBOL} (insufficient USDC)`);
  }

  // 2) 3 USDC -> WETH (fee 3000)
  const usdcForWeth = ethers.parseUnits("3", usDec);
  if (scwUSDC >= usdcForWeth) {
    const minWeth = (ethers.parseUnits("0.0009", weDec) * 80n) / 100n;
    await ensureApproval(wallet, USDC, ROUTER, usdcForWeth, "USDC->Router (USDC->WETH)");
    const swap2 = encodeExactInputSingle({ tokenIn: USDC, tokenOut: WETH, fee: FEE_WETH, recipient: SCW, amountIn: usdcForWeth, amountOutMinimum: minWeth });
    const exec2 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap2]);
    console.log("Microseed: 3 USDC -> WETH");
    const tx2 = await wallet.sendTransaction({ to: SCW, data: exec2, gasLimit: 600000 });
    await tx2.wait();
    recordTx("swap:USDC->WETH", tx2.hash);
    console.log("USDC->WETH swap:", tx2.hash);
  } else {
    console.log("Skipping 3 USDC->WETH (insufficient USDC)");
  }

  // 3) tiny WETH -> bwzC
  const scwWETH = await tokenBalance(provider, WETH, SCW);
  const tinyWeth = MICRO_WETH_BW;
  const tinyWethIn = scwWETH >= tinyWeth ? tinyWeth : scwWETH;
  if (tinyWethIn > 0n) {
    const minBwFromWeth = (ethers.parseUnits("0.0166665", bwDec) * 70n) / 100n;
    await ensureApproval(wallet, WETH, ROUTER, tinyWethIn, `WETH->Router (WETH->${BWAEZI_SYMBOL})`);
    const swap3 = encodeExactInputSingle({ tokenIn: WETH, tokenOut: BWAEZI, fee: FEE_WETH, recipient: SCW, amountIn: tinyWethIn, amountOutMinimum: minBwFromWeth });
    const exec3 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap3]);
    console.log(`Microseed: tiny WETH -> ${BWAEZI_SYMBOL}`);
    const tx3 = await wallet.sendTransaction({ to: SCW, data: exec3, gasLimit: 600000 });
    await tx3.wait();
    recordTx("swap:WETH->BW", tx3.hash);
    console.log(`WETH->${BWAEZI_SYMBOL} swap:`, tx3.hash);
  } else {
    console.log(`Skipping tiny WETH->${BWAEZI_SYMBOL} (no WETH available)`);
  }
}

// ===== Server helper (start early) =====
function startServer(port) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "genesis-seeding-running", ts: Date.now() }));
  });
  server.listen(port, () => console.log(`🌐 Server listening on port ${port}`));
  return server;
}

// ===== Main (one-shot) =====
async function main() {
  // Acquire local lock to avoid concurrent runs on same host
  acquireLocalLock();

  // Start server early so hosting platform sees process as alive
  startServer(PORT);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`SCW: ${SCW}`);
  console.log(`Token symbol used in logs: ${BWAEZI_SYMBOL}`);

  // Optional on-chain flag check
  if (FLAG_CONTRACT) {
    const initialized = await checkFlag(provider);
    if (initialized) {
      console.log("On-chain flag indicates initialization already done — aborting.");
      return;
    }
  }

  // Pool liquidity guard
  try {
    const poolLiq = await getPoolLiquidity(provider, POOL_BW_USDC);
    console.log("POOL_BW_USDC liquidity:", poolLiq.toString());
    if (poolLiq >= LIQ_THRESHOLD) {
      console.log("Pool already has liquidity above threshold — aborting to avoid double-run.");
      return;
    }
  } catch (e) {
    console.warn("Could not read pool liquidity; continuing with additional guards:", e.message || e);
  }

  // Position scan guard
  try {
    const hasBwUsdc = await scwOwnsInRangePosition(provider, BWAEZI, USDC, FEE_USDC);
    if (hasBwUsdc) { console.log(`SCW already owns an in-range ${BWAEZI_SYMBOL}/USDC position — aborting.`); return; }
    const hasBwWeth = await scwOwnsInRangePosition(provider, BWAEZI, WETH, FEE_WETH);
    if (hasBwWeth) { console.log(`SCW already owns an in-range ${BWAEZI_SYMBOL}/WETH position — aborting.`); return; }
  } catch (e) {
    console.warn("Position scan failed; continuing with caution:", e.message || e);
  }

  // Read SCW balances
  const scwUsdc = await tokenBalance(provider, USDC, SCW);
  const scwBw   = await tokenBalance(provider, BWAEZI, SCW);
  const scwWeth = await tokenBalance(provider, WETH, SCW);
  console.log(`SCW balances (USDC, ${BWAEZI_SYMBOL}, WETH):`, ethers.formatUnits(scwUsdc, 6), ethers.formatEther(scwBw), ethers.formatEther(scwWeth));

  // 1) Mint bwzC/USDC tiny in-range
  try {
    await mintTinyBWUSDC(wallet, provider);
  } catch (e) {
    console.warn("mintTinyBWUSDC failed:", e.message || e);
  }

  // 2) If no WETH, attempt to seed WETH from USDC (small swap) so bwzC/WETH mint can run
  const scwWethAfter = await tokenBalance(provider, WETH, SCW);
  if (scwWethAfter === 0n && scwUsdc >= MICRO_USDC_WETH) {
    try {
      await ensureApproval(wallet, USDC, ROUTER, MICRO_USDC_WETH, "USDC->Router (seed WETH)");
      const swapCalldata = encodeExactInputSingle({ tokenIn: USDC, tokenOut: WETH, fee: FEE_WETH, recipient: SCW, amountIn: MICRO_USDC_WETH, amountOutMinimum: 0n });
      const scwIface = new ethers.Interface(scwAbi);
      const execSwap = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swapCalldata]);
      console.log("Seeding WETH via USDC->WETH swap:", ethers.formatUnits(MICRO_USDC_WETH, 6));
      const tx = await wallet.sendTransaction({ to: SCW, data: execSwap, gasLimit: 600000 });
      await tx.wait();
      recordTx("swap:seed:USDC->WETH", tx.hash);
      console.log("USDC->WETH seed swap complete:", tx.hash);
    } catch (e) {
      console.warn("USDC->WETH seed swap failed:", e.message || e);
    }
  }

  // 3) Mint bwzC/WETH tiny in-range (if WETH available)
  try {
    await mintTinyBWWETH(wallet, provider);
  } catch (e) {
    console.warn("mintTinyBWWETH failed:", e.message || e);
  }

  // 4) Microseed swaps
  try {
    await microseedSwaps(wallet, provider);
  } catch (e) {
    console.warn("microseedSwaps failed:", e.message || e);
  }

  // 5) Set on-chain flag if provided
  if (FLAG_CONTRACT) {
    await setFlag(wallet);
  }

  console.log("✅ One-shot genesis seeding complete. Verify on-chain: pool.liquidity, slot0.tick, and SCW balances.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error("Fatal:", e?.message || e);
    process.exit(1);
  });
}
