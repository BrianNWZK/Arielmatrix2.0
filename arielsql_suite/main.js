// main.js
// One-shot deploy:
// - Path A: Initialize BWAEZI/USDC at peg (1 BWAEZI = 100 USDC) via NPM.createAndInitializePoolIfNecessary
// - Mint tight-band positions (resilient retries) for USDC and WETH pools
// - Wake-up swaps for price discovery on both legs
// - No approvals; assumes SCW already approved NPM and SwapRouter
// - ERC-4337 via EntryPoint with canonical getUserOpHash signing

import express from "express";
import { ethers } from "ethers";

// ===== Addresses & env =====
const ENTRY_POINT = ethers.getAddress("0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789");
const FACTORY     = ethers.getAddress("0x1F98431c8aD98523631AE4a59f267346ea31F984");
const NPM         = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");
const SWAP_ROUTER = ethers.getAddress("0xE592427A0AEce92De3Edee1F18E0157C05861564");

const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// Known pools
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // Fee 500 (0.05%)
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // Fee 3000 (0.3%)

// Pegs
const PEG_USD   = 100;     // 1 BWAEZI = 100 USDC
const PEG_WETH  = 0.03;    // 1 BWAEZI = 0.03 WETH

// Runtime
const RPC_URL         = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const BUNDLER_RPC_URL = process.env.BUNDLER_RPC_URL || "https://api.pimlico.io/v2/1/rpc?apikey=pim_4NdivPuNDvvKZ1e1aNPKrb";
const PRIVATE_KEY     = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
const SCW             = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT            = Number(process.env.PORT || 10000);

// ===== Minimal ABIs =====
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)"
];
const factoryAbi = [
  "function getPool(address,address,uint24) view returns (address)"
];
const npmAbi = [
  "function createAndInitializePoolIfNecessary(address token0,address token1,uint24 fee,uint160 sqrtPriceX96) returns (address pool)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const scwAbi = [
  "function execute(address to,uint256 value,bytes data) returns (bytes)"
];
const entryPointAbi = [
  "function getNonce(address sender, uint192 key) view returns (uint256)",
  "function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)) view returns (bytes32)"
];
const swapRouterAbi = [
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"
];

// ===== Math & peg helpers =====
const MIN_TICK = -887272;
const MAX_TICK =  887272;

function spacingForFee(fee) {
  if (fee === 100) return 1;
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  if (fee === 10000) return 200;
  return 60;
}
function clampAlign(value, spacing) {
  return Math.floor(value / spacing) * spacing;
}
function tightBandAroundTick(currentTick, spacing, bandSpans = 2) {
  let lower = clampAlign(currentTick - bandSpans * spacing, spacing);
  let upper = clampAlign(currentTick + bandSpans * spacing, spacing) + spacing;
  const minAligned = Math.ceil(MIN_TICK / spacing) * spacing;
  const maxAligned = Math.floor(MAX_TICK / spacing) * spacing;
  lower = Math.max(lower, minAligned);
  upper = Math.min(upper, maxAligned);
  if (upper <= lower) upper = lower + spacing;
  return { lower, upper };
}
function sqrtBigInt(n) {
  if (n <= 0n) return 0n;
  let x = n, y = (x + 1n) >> 1n;
  while (y < x) { x = y; y = (x + n / x) >> 1n; }
  return x;
}
function decs(addr) {
  const a = addr.toLowerCase();
  if (a === USDC.toLowerCase()) return 6n;
  return 18n; // BWAEZI, WETH
}
function encodePegSqrtPriceX96(token0, token1, pegUSD, pegWETH = null) {
  // If token1 is USDC: price token1 per token0 = pegUSD
  // If token1 is WETH: price token1 per token0 = pegWETH
  const isUSDC = token1.toLowerCase() === USDC.toLowerCase();
  const target = isUSDC ? pegUSD : (pegWETH ?? PEG_WETH);
  const dec0 = decs(token0);
  const dec1 = decs(token1);
  const Q192 = 2n ** 192n;
  const fp6 = 1_000_000n;
  const targetScaled = BigInt(Math.round(target * 1e6));
  const numerator   = targetScaled * (10n ** dec1);
  const denominator = fp6 * (10n ** dec0);
  const priceX192 = (numerator * Q192) / denominator;
  return sqrtBigInt(priceX192);
}
function nowDeadline(secs = 1200) {
  return Math.floor(Date.now() / 1000) + secs;
}

// ===== Encoding helpers =====
function scwEncodeExecute(to, value, data) {
  const iface = new ethers.Interface(scwAbi);
  return iface.encodeFunctionData("execute", [to, value, data]);
}
function encodeMint(paramsArray) {
  const iface = new ethers.Interface(npmAbi);
  return iface.encodeFunctionData("mint", [paramsArray]);
}
function encodeExactInputSingle({ tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMinimum = 0n, sqrtPriceLimitX96 = 0n }) {
  const iface = new ethers.Interface(swapRouterAbi);
  const params = { tokenIn, tokenOut, fee, recipient, deadline, amountIn, amountOutMinimum, sqrtPriceLimitX96 };
  return iface.encodeFunctionData("exactInputSingle", [params]);
}

// ===== ERC-4337 helpers =====
async function getNonce(provider, sender) {
  const ep = new ethers.Contract(ENTRY_POINT, entryPointAbi, provider);
  return await ep.getNonce(sender, 0);
}
async function getUserOpHash(provider, userOp) {
  const ep = new ethers.Contract(ENTRY_POINT, entryPointAbi, provider);
  return await ep.getUserOpHash({ ...userOp, signature: "0x" });
}
async function submitUserOp(wallet, provider, callData) {
  const nonce = await getNonce(provider, SCW);
  let userOp = {
    sender: SCW,
    nonce: "0x" + BigInt(nonce).toString(16),
    initCode: "0x",
    callData,
    callGasLimit: "0x0",
    verificationGasLimit: "0x0",
    preVerificationGas: "0x0",
    maxFeePerGas: "0x0",
    maxPriorityFeePerGas: "0x0",
    paymasterAndData: "0x",
    signature: "0x"
  };
  const userOpHash = await getUserOpHash(provider, userOp);
  userOp.signature = await wallet.signMessage(ethers.getBytes(userOpHash));

  const payload = { jsonrpc: "2.0", id: Date.now(), method: "eth_sendUserOperation", params: [userOp, ENTRY_POINT] };
  const res = await fetch(BUNDLER_RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = await res.json();
  if (json.error) throw new Error(`Bundler error: ${JSON.stringify(json.error)}`);
  console.log("UserOp submitted! Hash:", json.result);
  return json.result;
}
async function waitForUserOpReceipt(userOpHash, timeoutMs = 120000, intervalMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const payload = { jsonrpc: "2.0", id: Date.now(), method: "eth_getUserOperationReceipt", params: [userOpHash] };
    const res = await fetch(BUNDLER_RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const json = await res.json();
    if (json.result) {
      console.log(`UserOp ${json.result.success ? "SUCCESS" : "FAILED"} in block ${json.result.receipt.blockNumber}`);
      if (!json.result.success) console.log("Failure:", JSON.stringify(json.result.receipt));
      return json.result;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error("UserOp timeout — check Pimlico dashboard");
}

// ===== Path A: initialize USDC pool at peg =====
async function initUsdcPoolAtPegIfNeeded(provider, wallet, fee = 500) {
  // Sort tokens
  const [t0, t1] = BWAEZI.toLowerCase() < USDC.toLowerCase() ? [BWAEZI, USDC] : [USDC, BWAEZI];
  const factory = new ethers.Contract(FACTORY, factoryAbi, provider);
  const npmIface = new ethers.Interface(npmAbi);

  let pool = await factory.getPool(t0, t1, fee);
  if (!pool || pool === ethers.ZeroAddress) {
    const sqrtPriceX96 = encodePegSqrtPriceX96(t0, t1, PEG_USD);
    const data = npmIface.encodeFunctionData("createAndInitializePoolIfNecessary", [t0, t1, fee, sqrtPriceX96]);
    const exec = scwEncodeExecute(NPM, 0n, data);
    console.log(`Initializing BWAEZI/USDC at peg $${PEG_USD} (fee ${fee})...`);
    const h = await submitUserOp(wallet, provider, exec);
    await waitForUserOpReceipt(h);
    pool = await factory.getPool(t0, t1, fee);
    console.log(`USDC pool initialized: ${pool}`);
  } else {
    console.log(`USDC pool exists: ${pool}`);
  }
  return pool;
}

// ===== Resilient tight-band mint =====
async function mintFromPool(wallet, provider, poolAddr, nominalA, nominalB) {
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const [, tickRaw] = await pool.slot0().catch(() => [0n, 0n]);
  const tick = Number(tickRaw);
  const token0 = await pool.token0();
  const token1 = await pool.token1();
  const fee = Number(await pool.fee());
  const spacing = spacingForFee(fee);

  console.log(`Pool ${poolAddr} tick=${tick} token0=${token0} token1=${token1} fee=${fee}`);

  const isBWToken0 = token0.toLowerCase() === BWAEZI.toLowerCase();
  let amount0Desired = isBWToken0 ? nominalA : nominalB;
  let amount1Desired = isBWToken0 ? nominalB : nominalA;

  const tiny = 1n;
  if (amount0Desired === 0n) amount0Desired = tiny;
  if (amount1Desired === 0n) amount1Desired = tiny;

  for (const spans of [2, 3, 4]) {
    const { lower: tickLower, upper: tickUpper } = tightBandAroundTick(tick, spacing, spans);

    const paramsArray = [
      token0, token1, fee, tickLower, tickUpper,
      amount0Desired, amount1Desired, 0n, 0n, SCW, nowDeadline()
    ];

    const mintData = encodeMint(paramsArray);
    const execMint = scwEncodeExecute(NPM, 0n, mintData);

    console.log(`Minting: amount0=${amount0Desired.toString()} amount1=${amount1Desired.toString()} [${tickLower}, ${tickUpper}] fee=${fee} spans=${spans}`);
    try {
      const h = await submitUserOp(wallet, provider, execMint);
      const rc = await waitForUserOpReceipt(h);
      if (rc.success) return;
      amount0Desired = amount0Desired > tiny ? amount0Desired / 2n : amount0Desired;
      amount1Desired = amount1Desired > tiny ? amount1Desired / 2n : amount1Desired;
    } catch (e) {
      console.warn(`Mint spans=${spans} failed: ${e?.message || e}`);
      amount0Desired = amount0Desired > tiny ? amount0Desired / 2n : amount0Desired;
      amount1Desired = amount1Desired > tiny ? amount1Desired / 2n : amount1Desired;
      continue;
    }
  }
  throw new Error("Mint failed after retries");
}

// ===== Wake-up swaps =====
async function wakeRouting(wallet, provider) {
  // USDC -> BWAEZI (2 USDC)
  {
    const data = encodeExactInputSingle({
      tokenIn: USDC, tokenOut: BWAEZI, fee: 500,
      recipient: SCW, deadline: nowDeadline(900),
      amountIn: ethers.parseUnits("2", 6), amountOutMinimum: 0n
    });
    const exec = scwEncodeExecute(SWAP_ROUTER, 0n, data);
    console.log("Swap: USDC -> BWAEZI (2 USDC)");
    const h = await submitUserOp(wallet, provider, exec);
    await waitForUserOpReceipt(h);
  }

  // USDC -> WETH (2 USDC), then WETH -> BWAEZI (0.0005 WETH)
  {
    const data1 = encodeExactInputSingle({
      tokenIn: USDC, tokenOut: WETH, fee: 500, // adjust to 3000 if needed
      recipient: SCW, deadline: nowDeadline(900),
      amountIn: ethers.parseUnits("2", 6), amountOutMinimum: 0n
    });
    const exec1 = scwEncodeExecute(SWAP_ROUTER, 0n, data1);
    console.log("Swap: USDC -> WETH (2 USDC)");
    const h1 = await submitUserOp(wallet, provider, exec1);
    await waitForUserOpReceipt(h1);

    const data2 = encodeExactInputSingle({
      tokenIn: WETH, tokenOut: BWAEZI, fee: 3000,
      recipient: SCW, deadline: nowDeadline(900),
      amountIn: ethers.parseEther("0.0005"), amountOutMinimum: 0n
    });
    const exec2 = scwEncodeExecute(SWAP_ROUTER, 0n, data2);
    console.log("Swap: WETH -> BWAEZI (0.0005 WETH)");
    const h2 = await submitUserOp(wallet, provider, exec2);
    await waitForUserOpReceipt(h2);
  }
}

// ===== Main flow =====
let hasRun = false;
async function runSeedingOnce() {
  if (hasRun) return; hasRun = true;

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`EOA: ${wallet.address}`);
  console.log(`SCW: ${SCW}`);

  // 1) Path A: initialize BWAEZI/USDC at peg (safe no-op if already present)
  await initUsdcPoolAtPegIfNeeded(provider, wallet, 500);

  // 2) Mint peg-aware amounts
  // USDC pool: 0.05 BW + 5 USDC (fits SCW balance)
  await mintFromPool(wallet, provider, POOL_BW_USDC, ethers.parseEther("0.05"), ethers.parseUnits("5", 6));

  // WETH pool: 0.02 BW + 0.0006 WETH (fits SCW balance, matches 0.03 WETH/BW peg)
  await mintFromPool(wallet, provider, POOL_BW_WETH, ethers.parseEther("0.02"), ethers.parseEther("0.0006"));

  // 3) Wake routing & price discovery
  await wakeRouting(wallet, provider);

  console.log("✅ Deploy complete — pools initialized/minted, swaps executed");
}

// ===== Server =====
const app = express();
app.get("/", (_req, res) => res.send("BWAEZI quick deploy (Path A + WETH seeding) via ERC-4337…"));

app.listen(PORT, async () => {
  console.log(`Server bound on port ${PORT}`);
  try {
    await runSeedingOnce();
    process.exit(0);
  } catch (e) {
    console.error("Fatal:", e?.message || e);
    process.exit(1);
  }
});
