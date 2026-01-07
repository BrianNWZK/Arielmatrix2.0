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
//
// Usage: set RPC_URL, PRIVATE_KEY, SCW_ADDRESS, optional FLAG_CONTRACT, then run once.

import { ethers } from "ethers";
import http from "http";

// ===== Env =====
const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT        = Number(process.env.PORT || 8080);
const FLAG_CONTRACT = process.env.FLAG_CONTRACT || null; // optional on-chain run-once flag contract

// ===== Core contracts =====
const NPM     = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88"); // NonfungiblePositionManager
const ROUTER  = ethers.getAddress("0xE592427A0AEce92De3Edee1F18E0157C05861564"); // Uniswap V3 router
const FACTORY = ethers.getAddress("0x1F98431c8aD98523631AE4a59f267346ea31F984"); // Uniswap V3 factory

// ===== Tokens =====
// On-chain token address (used for contract calls)
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
// Human-readable symbol used in logs and labels to avoid reverts or confusion
const BWAEZI_SYMBOL = "bwzC";

const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// ===== Pools (known) =====
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500, spacing 10
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // fee 3000, spacing 60

// ===== Fee tiers =====
const FEE_USDC = 500;   // bwzC/USDC
const FEE_WETH = 3000;  // bwzC/WETH

// ===== Peg anchors =====
// 1 bwzC = 100 USDC = 0.03 WETH (operational peg used for sizing)
const PEG_USDC_PER_BWZ = 100;
const PEG_WETH_PER_BWZ = 0.03;

// ===== Thresholds and sizes (tune if needed) =====
const LIQ_THRESHOLD = 1n; // if pool.liquidity >= this, treat pool as live (very small sentinel)
const MINT_USDC_DESIRED = ethers.parseUnits("6", 6);   // target USDC for bwzC/USDC mint
const MINT_BW_DESIRED   = ethers.parseEther("0.001");  // target bwzC for bwzC/USDC mint
const BW_WETH_BW_TINY   = ethers.parseEther("0.02");   // tiny bwzC for bwzC/WETH mint
const BW_WETH_WETH_TINY = ethers.parseEther("0.0005"); // tiny WETH for bwzC/WETH mint
const MICRO_USDC_BW     = ethers.parseUnits("5", 6);   // microseed USDC->bwzC
const MICRO_USDC_WETH   = ethers.parseUnits("3", 6);   // microseed USDC->WETH
const MICRO_WETH_BW     = ethers.parseEther("0.0005"); // microseed WETH->bwzC

// ===== ABIs =====
const scwAbi  = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const npmAbi  = [
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner,uint256 index) view returns (uint256)",
  "function positions(uint256 tokenId) view returns (uint96 nonce,address operator,address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint128 liquidity,uint256 feeGrowthInside0LastX128,uint256 feeGrowthInside1LastX128,uint128 tokensOwed0,uint128 tokensOwed1)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const routerAbi = ["function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"];
const poolAbi = ["function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)","function liquidity() view returns (uint128)"];
const erc20Abi = ["function balanceOf(address) view returns (uint256)","function decimals() view returns (uint8)","function allowance(address owner,address spender) view returns (uint256)","function approve(address spender,uint256 amount) returns (bool)"];

// Optional flag contract ABI (if you deploy a tiny flag contract)
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
async function ensureApproval(wallet, token, spender, amount, label) {
  // Read allowance from token contract (owner = SCW)
  const provider = wallet.provider;
  const c = new ethers.Contract(token, erc20Abi, provider);
  const allowance = BigInt((await c.allowance(SCW, spender)).toString());
  if (allowance >= amount) {
    console.log(`Approval already present for ${label}`);
    return;
  }
  // Build approve calldata and call via SCW.execute so SCW (owner) executes approve
  const ercIface = new ethers.Interface(erc20Abi);
  const approveData = ercIface.encodeFunctionData("approve", [spender, amount]);
  const scwIface = new ethers.Interface(scwAbi);
  const exec = scwIface.encodeFunctionData("execute", [token, 0n, approveData]);
  console.log(`Issuing approve via SCW for ${label} -> spender ${spender}`);
  const tx = await wallet.sendTransaction({ to: SCW, data: exec, gasLimit: 250000 });
  await tx.wait();
  console.log(`Approval tx mined for ${label}: ${tx.hash}`);
}

// Scan SCW positions for an in-range position for a given pair+fee
async function scwOwnsInRangePosition(provider, tokenA, tokenB, fee) {
  try {
    const npm = new ethers.Contract(NPM, npmAbi, provider);
    const count = Number((await npm.balanceOf(SCW)).toString());
    if (count === 0) return false;
    // get pool tick if possible
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
      if (poolTick === null) return true; // position exists with liquidity; treat as in-range
      if (tickLower <= poolTick && poolTick <= tickUpper) return true;
    }
    return false;
  } catch (e) {
    console.warn("Position scan failed:", e.message || e);
    // conservative: if scan fails, return false so other guards still apply
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
  } catch (e) {
    console.warn("Setting on-chain flag failed:", e.message || e);
  }
}

// ===== Actions =====
async function mintTinyBWUSDC(wallet, provider) {
  // Read pool tick and spacing
  const tick = await getPoolTick(provider, POOL_BW_USDC);
  const spacing = spacingForFee(FEE_USDC);
  const { lower, upper } = alignTickAround(tick, spacing, 6);

  // decimals
  const bwDec = await getDecimals(provider, BWAEZI);
  const usDec = await getDecimals(provider, USDC);

  // desired tiny amounts (peg-aware)
  // default: 0.001 bwzC -> ~0.1 USDC at peg; but we scale to available SCW USDC
  const desiredBW = ethers.parseUnits("0.001", bwDec);
  const desiredUS = ethers.parseUnits("0.1", usDec);

  const scwUSDC = await tokenBalance(provider, USDC, SCW);
  const scwBW   = await tokenBalance(provider, BWAEZI, SCW);

  if (scwUSDC === 0n || scwBW === 0n) {
    console.log(`Skipping ${BWAEZI_SYMBOL}/USDC mint: SCW lacks USDC or ${BWAEZI_SYMBOL}`);
    return;
  }

  // scale to available USDC if needed
  let amountUS = desiredUS;
  if (scwUSDC < desiredUS) amountUS = scwUSDC;
  // compute BW from USDC at peg: BW = USDC / 100
  // convert USDC(6) -> BW(18): multiply by 1e12
  let amountBW = (amountUS * 10n ** 12n) / BigInt(PEG_USDC_PER_BWZ);
  if (amountBW === 0n) amountBW = desiredBW;
  if (amountBW > scwBW) amountBW = scwBW;

  // Approvals via SCW.execute (SCW is token owner)
  await ensureApproval(wallet, BWAEZI, NPM, amountBW, `${BWAEZI_SYMBOL}->NPM`);
  await ensureApproval(wallet, USDC,   NPM, amountUS, `${BWAEZI_SYMBOL}/USDC->NPM`);

  // token0/token1 ordering
  const pool = new ethers.Contract(POOL_BW_USDC, poolAbi, provider);
  const token0 = (await pool.token0()).toLowerCase();
  const t0 = token0 === BWAEZI.toLowerCase() ? BWAEZI : USDC;
  const t1 = token0 === BWAEZI.toLowerCase() ? USDC : BWAEZI;

  const amount0Desired = t0.toLowerCase() === BWAEZI.toLowerCase() ? amountBW : amountUS;
  const amount1Desired = t0.toLowerCase() === BWAEZI.toLowerCase() ? amountUS : amountBW;

  // set conservative minimums (90%)
  const amount0Min = (amount0Desired * 90n) / 100n;
  const amount1Min = (amount1Desired * 90n) / 100n;

  const params = [t0, t1, FEE_USDC, lower, upper, amount0Desired, amount1Desired, amount0Min, amount1Min, SCW, nowDeadline(1200)];
  const mintData = encodeMint(params);
  const scwIface = new ethers.Interface(scwAbi);
  const execMint = scwIface.encodeFunctionData("execute", [NPM, 0n, mintData]);

  console.log(`Sending SCW.execute mint ${BWAEZI_SYMBOL}/USDC:`, { amountBW: ethers.formatUnits(amountBW, bwDec), amountUS: ethers.formatUnits(amountUS, usDec), lower, upper });
  const tx = await wallet.sendTransaction({ to: SCW, data: execMint, gasLimit: 900000 });
  const rc = await tx.wait();
  if (rc.status === 1) console.log(`${BWAEZI_SYMBOL}/USDC mint succeeded:`, tx.hash);
  else console.warn(`${BWAEZI_SYMBOL}/USDC mint reverted:`, tx.hash);
}

async function mintTinyBWWETH(wallet, provider) {
  const tick = await getPoolTick(provider, POOL_BW_WETH);
  const spacing = spacingForFee(FEE_WETH);
  const { lower, upper } = alignTickAround(tick, spacing, 6);

  const scwBW = await tokenBalance(provider, BWAEZI, SCW);
  let scwWETH = await tokenBalance(provider, WETH, SCW);

  // If no WETH, we will attempt to seed WETH via a small USDC->WETH swap before mint (handled outside)
  if (scwBW === 0n) {
    console.log(`Skipping ${BWAEZI_SYMBOL}/WETH mint: SCW has no ${BWAEZI_SYMBOL}`);
    return;
  }
  if (scwWETH === 0n) {
    console.log(`No WETH present for ${BWAEZI_SYMBOL}/WETH mint; skipping mint (WETH seeding may be attempted earlier)`);
    return;
  }

  // choose tiny amounts, cap by balances
  let amountBW = BW_WETH_BW_TINY;
  if (amountBW > scwBW) amountBW = scwBW;
  let amountWETH = BW_WETH_WETH_TINY;
  if (amountWETH > scwWETH) amountWETH = scwWETH;

  // Approvals
  await ensureApproval(wallet, BWAEZI, NPM, amountBW, `${BWAEZI_SYMBOL}->NPM (BW/WETH)`);
  await ensureApproval(wallet, WETH,   NPM, amountWETH, "WETH->NPM (BW/WETH)");

  // token0/token1 ordering
  const pool = new ethers.Contract(POOL_BW_WETH, poolAbi, provider);
  const token0 = (await pool.token0()).toLowerCase();
  const t0 = token0 === BWAEZI.toLowerCase() ? BWAEZI : WETH;
  const t1 = token0 === BWAEZI.toLowerCase() ? WETH : BWAEZI;

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
  if (rc.status === 1) console.log(`${BWAEZI_SYMBOL}/WETH mint succeeded:`, tx.hash);
  else console.warn(`${BWAEZI_SYMBOL}/WETH mint reverted:`, tx.hash);
}

async function microseedSwaps(wallet, provider) {
  const scwIface = new ethers.Interface(scwAbi);
  const usDec = await getDecimals(provider, USDC);
  const bwDec = await getDecimals(provider, BWAEZI);
  const weDec = await getDecimals(provider, WETH);

  const scwUSDC = await tokenBalance(provider, USDC, SCW);

  // 1) 5 USDC -> bwzC (fee 500)
  const usdcForBw = ethers.parseUnits("5", usDec);
  if (scwUSDC >= usdcForBw) {
    const minBwz = (ethers.parseUnits("0.05", bwDec) * 70n) / 100n; // 70% safety
    await ensureApproval(wallet, USDC, ROUTER, usdcForBw, `USDC->Router (USDC->${BWAEZI_SYMBOL})`);
    const swap1 = encodeExactInputSingle({ tokenIn: USDC, tokenOut: BWAEZI, fee: FEE_USDC, recipient: SCW, amountIn: usdcForBw, amountOutMinimum: minBwz });
    const exec1 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap1]);
    console.log(`Microseed: 5 USDC -> ${BWAEZI_SYMBOL}`);
    const tx1 = await wallet.sendTransaction({ to: SCW, data: exec1, gasLimit: 600000 });
    await tx1.wait();
    console.log(`USDC->${BWAEZI_SYMBOL} swap:`, tx1.hash);
  } else {
    console.log(`Skipping 5 USDC->${BWAEZI_SYMBOL} (insufficient USDC)`);
  }

  // 2) 3 USDC -> WETH (fee 3000)
  const usdcForWeth = ethers.parseUnits("3", usDec);
  const scwUSDCAfter = await tokenBalance(provider, USDC, SCW);
  if (scwUSDCAfter >= usdcForWeth) {
    const minWeth = (ethers.parseUnits("0.0009", weDec) * 80n) / 100n; // 80% safety
    await ensureApproval(wallet, USDC, ROUTER, usdcForWeth, "USDC->Router (USDC->WETH)");
    const swap2 = encodeExactInputSingle({ tokenIn: USDC, tokenOut: WETH, fee: FEE_WETH, recipient: SCW, amountIn: usdcForWeth, amountOutMinimum: minWeth });
    const exec2 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap2]);
    console.log("Microseed: 3 USDC -> WETH");
    const tx2 = await wallet.sendTransaction({ to: SCW, data: exec2, gasLimit: 600000 });
    await tx2.wait();
    console.log("USDC->WETH swap:", tx2.hash);
  } else {
    console.log("Skipping 3 USDC->WETH (insufficient USDC)");
  }

  // 3) tiny WETH -> bwzC
  const scwWETH = await tokenBalance(provider, WETH, SCW);
  const tinyWeth = MICRO_WETH_BW;
  const tinyWethIn = scwWETH >= tinyWeth ? tinyWeth : scwWETH;
  if (tinyWethIn > 0n) {
    const minBwFromWeth = (ethers.parseUnits("0.0166665", bwDec) * 70n) / 100n; // ~70% safety
    await ensureApproval(wallet, WETH, ROUTER, tinyWethIn, `WETH->Router (WETH->${BWAEZI_SYMBOL})`);
    const swap3 = encodeExactInputSingle({ tokenIn: WETH, tokenOut: BWAEZI, fee: FEE_WETH, recipient: SCW, amountIn: tinyWethIn, amountOutMinimum: minBwFromWeth });
    const exec3 = scwIface.encodeFunctionData("execute", [ROUTER, 0n, swap3]);
    console.log(`Microseed: tiny WETH -> ${BWAEZI_SYMBOL}`);
    const tx3 = await wallet.sendTransaction({ to: SCW, data: exec3, gasLimit: 600000 });
    await tx3.wait();
    console.log(`WETH->${BWAEZI_SYMBOL} swap:`, tx3.hash);
  } else {
    console.log(`Skipping tiny WETH->${BWAEZI_SYMBOL} (no WETH available)`);
  }
}

// ===== Main (one-shot) =====
async function main() {
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
  await mintTinyBWUSDC(wallet, provider);

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
      console.log("USDC->WETH seed swap complete:", tx.hash);
    } catch (e) {
      console.warn("USDC->WETH seed swap failed:", e.message || e);
    }
  }

  // 3) Mint bwzC/WETH tiny in-range (if WETH available)
  await mintTinyBWWETH(wallet, provider);

  // 4) Microseed swaps
  await microseedSwaps(wallet, provider);

  // 5) Set on-chain flag if provided
  if (FLAG_CONTRACT) {
    await setFlag(wallet);
  }

  console.log("✅ One-shot genesis seeding complete. Verify on-chain: pool.liquidity, slot0.tick, and SCW balances.");

  // Keep a lightweight HTTP server alive to signal completion
  http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, status: "genesis-seeding-complete", ts: Date.now() }));
  }).listen(PORT, () => {
    console.log(`🌐 Server listening on port ${PORT}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error("Fatal:", e?.message || e);
    process.exit(1);
  });
}
