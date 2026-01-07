// main.js
// ERC-4337 seeding via SCW.execute -> Uniswap V3 NonfungiblePositionManager
// Fix: derive token0/token1 + fee from the target pool to avoid AA23 reverts.
// Streamlined: no approvals/balance checks/paymaster. Single-run. Bundler gas estimation.
// Adjustment: always use a tight band around the current tick (no full-range) to avoid zero-liquidity/revert edges.

import express from "express";
import { ethers } from "ethers";

// ===== Constants =====
const NPM = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");
const ENTRY_POINT = ethers.getAddress("0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789");
const BUNDLER_RPC_URL = "https://api.pimlico.io/v2/1/rpc?apikey=pim_4NdivPuNDvvKZ1e1aNPKrb";

// ===== Env =====
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
const SCW = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");
const PORT = Number(process.env.PORT || 10000);

// ===== Pools =====
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // expected BWAEZI/USDC
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // expected BWAEZI/WETH

// ===== ABIs =====
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)"
];
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns (bytes)"];
const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const entryPointAbi = [
  "function getNonce(address sender, uint192 key) view returns (uint256)",
  "function getUserOpHash((address sender,uint256 nonce,bytes initCode,bytes callData,uint256 callGasLimit,uint256 verificationGasLimit,uint256 preVerificationGas,uint256 maxFeePerGas,uint256 maxPriorityFeePerGas,bytes paymasterAndData,bytes signature)) view returns (bytes32)"
];

// ===== Tick bounds =====
const MIN_TICK = -887272;
const MAX_TICK =  887272;

// ===== Helpers =====
function spacingForFee(fee) {
  if (fee === 100) return 1;
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  if (fee === 10000) return 200;
  return 1;
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
function nowDeadline(secs = 1200) {
  return Math.floor(Date.now() / 1000) + secs;
}
function encodeMint(paramsArray) {
  const iface = new ethers.Interface(npmAbi);
  return iface.encodeFunctionData("mint", [paramsArray]);
}
function scwEncodeExecute(to, value, data) {
  const iface = new ethers.Interface(scwAbi);
  return iface.encodeFunctionData("execute", [to, value, data]);
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

  // Bundler will estimate gas
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

  // Sign canonical hash from EntryPoint
  const userOpHash = await getUserOpHash(provider, userOp);
  userOp.signature = await wallet.signMessage(ethers.getBytes(userOpHash));

  const payload = {
    jsonrpc: "2.0",
    id: Date.now(),
    method: "eth_sendUserOperation",
    params: [userOp, ENTRY_POINT]
  };

  const res = await fetch(BUNDLER_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const json = await res.json();
  if (json.error) throw new Error(`Bundler error: ${JSON.stringify(json.error)}`);
  console.log("UserOp submitted! Hash:", json.result);
  return json.result;
}
async function waitForUserOpReceipt(userOpHash, timeoutMs = 90000, intervalMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const payload = {
      jsonrpc: "2.0",
      id: Date.now(),
      method: "eth_getUserOperationReceipt",
      params: [userOpHash]
    };
    const res = await fetch(BUNDLER_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.result) {
      console.log(`UserOp success: ${json.result.success ? "YES" : "NO"} in block ${json.result.receipt.blockNumber}`);
      if (!json.result.success) console.log("Failure receipt:", json.result.receipt);
      return json.result;
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error("UserOp timeout — check Pimlico dashboard for details");
}

// ===== Mint from pool config (always tight band) =====
async function mintFromPool(wallet, provider, poolAddr, nominalA, nominalB) {
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);

  // Read live pool config
  const [, tickRaw] = await pool.slot0().catch(() => [0n, 0n]);
  const tick = Number(tickRaw);
  const token0 = await pool.token0();
  const token1 = await pool.token1();
  const fee = Number(await pool.fee());

  console.log(`Pool ${poolAddr} tick=${tick} token0=${token0} token1=${token1} fee=${fee}`);

  const spacing = spacingForFee(fee);
  const { lower: tickLower, upper: tickUpper } = tightBandAroundTick(tick, spacing, 2);

  // Map nominal amounts into amount0Desired/amount1Desired according to token0/token1
  // nominalA corresponds to BWAEZI; nominalB corresponds to USDC/WETH depending on pool
  const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
  const isBWToken0 = token0.toLowerCase() === BWAEZI.toLowerCase();
  const amount0Desired = isBWToken0 ? nominalA : nominalB;
  const amount1Desired = isBWToken0 ? nominalB : nominalA;

  const paramsArray = [
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    0n,
    0n,
    SCW,
    nowDeadline()
  ];

  const mintData = encodeMint(paramsArray);
  const execMint = scwEncodeExecute(NPM, 0n, mintData);

  console.log(`Minting via NPM: amount0=${amount0Desired.toString()} amount1=${amount1Desired.toString()} [${tickLower}, ${tickUpper}] fee=${fee}`);
  const userOpHash = await submitUserOp(wallet, provider, execMint);
  await waitForUserOpReceipt(userOpHash);
}

// ===== Seeding runner (single-run) =====
let hasRun = false;
async function runSeedingOnce() {
  if (hasRun) return;
  hasRun = true;

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`EOA: ${wallet.address}`);
  console.log(`SCW: ${SCW}`);

  // Nominal amounts for BWAEZI vs USDC/WETH
  const nominalBW   = ethers.parseUnits("0.05", 18);
  const nominalUSDC = ethers.parseUnits("5", 6);
  const nominalWETH = ethers.parseUnits("0.001", 18);

  await mintFromPool(wallet, provider, POOL_BW_USDC, nominalBW, nominalUSDC);
  await mintFromPool(wallet, provider, POOL_BW_WETH, nominalBW, nominalWETH);

  console.log("✅ Genesis seeding complete");
}

// ===== Server =====
const app = express();
app.get("/", (_req, res) => res.send("BWAEZI seeding via ERC-4337…"));

app.listen(PORT, async () => {
  console.log(`Server bound on port ${PORT}`);
  try {
    await runSeedingOnce();
    process.exit(0);
  } catch (e) {
    console.error("Fatal error during seeding:", e?.message || e);
    process.exit(1);
  }
});
