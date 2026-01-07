// main.js
// Genesis seeding script with HTTP server for deployment health (ERC-4337 UserOperation via Pimlico)
// Streamlined for deployment:
// - Bundler-driven gas estimation (all gas fields "0x0")
// - Proper token ordering for Uniswap V3 (token0 < token1)
// - Valid tick bounds aligned to fee spacing
// - Single-run deployment: executes once then exits without retries
// - No approvals or balance checks (you confirmed conditions are met)

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

// ===== Pools & Tokens =====
const POOL_BW_USDC = ethers.getAddress("0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562"); // fee 500
const POOL_BW_WETH = ethers.getAddress("0x142C3dce0a5605Fb385fAe7760302fab761022aa"); // fee 3000
const BWAEZI = ethers.getAddress("0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2");
const USDC   = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// ===== ABIs =====
const poolAbi = [
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16,uint16,uint16,uint8,bool)"
];
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns (bytes)"];
const npmAbi = [
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];

// ===== Tick bounds =====
const MIN_TICK = -887272;
const MAX_TICK =  887272;

// ===== Helpers =====
function spacingForFee(fee) {
  if (fee === 500) return 10;
  if (fee === 3000) return 60;
  return 1;
}
function clampAndAlignTicksAround(currentTick, spacing, spans = 12) {
  const lowerProposed = Math.floor((currentTick - spans * spacing) / spacing) * spacing;
  const upperProposed = Math.floor((currentTick + spans * spacing) / spacing) * spacing + spacing;
  const minAligned = Math.ceil(MIN_TICK / spacing) * spacing;
  const maxAligned = Math.floor(MAX_TICK / spacing) * spacing;
  const lower = Math.max(lowerProposed, minAligned);
  const upper = Math.min(upperProposed, maxAligned);
  return { lower, upper };
}
function fullRangeAligned(spacing) {
  const lower = Math.ceil(MIN_TICK / spacing) * spacing;
  const upper = Math.floor(MAX_TICK / spacing) * spacing;
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
function sortTokens(a, b) {
  return ethers.toBigInt(a) < ethers.toBigInt(b)
    ? { token0: a, token1: b, isSorted: true }
    : { token0: b, token1: a, isSorted: false };
}
function buildMintParams({
  tokenA, tokenB, fee, tickLower, tickUpper, amountA, amountB, recipient
}) {
  const { token0, token1, isSorted } = sortTokens(tokenA, tokenB);
  const amount0Desired = isSorted ? amountA : amountB;
  const amount1Desired = isSorted ? amountB : amountA;

  return [
    token0,
    token1,
    fee,
    tickLower,
    tickUpper,
    amount0Desired,
    amount1Desired,
    0n,
    0n,
    recipient,
    nowDeadline()
  ];
}

// ===== ERC-4337 UserOperation submission =====
async function getNonce(provider, sender) {
  const epAbi = ["function getNonce(address sender,uint192 key) view returns (uint256)"];
  const ep = new ethers.Contract(ENTRY_POINT, epAbi, provider);
  return await ep.getNonce(sender, 0);
}

async function submitUserOp(wallet, provider, callData) {
  const { chainId } = await provider.getNetwork();
  const nonce = await getNonce(provider, SCW);

  const userOp = {
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

  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const packed = abiCoder.encode(
    ["address","uint256","bytes32","bytes32","uint256","uint256","uint256","uint256","uint256","bytes32"],
    [
      userOp.sender,
      BigInt(userOp.nonce),
      ethers.keccak256(userOp.initCode),
      ethers.keccak256(userOp.callData),
      BigInt(userOp.callGasLimit),
      BigInt(userOp.verificationGasLimit),
      BigInt(userOp.preVerificationGas),
      BigInt(userOp.maxFeePerGas),
      BigInt(userOp.maxPriorityFeePerGas),
      ethers.keccak256(userOp.paymasterAndData)
    ]
  );
  const opHash = ethers.solidityPackedKeccak256(
    ["bytes32","address","uint256"],
    [ethers.keccak256(packed), ENTRY_POINT, chainId]
  );
  userOp.signature = await wallet.signMessage(ethers.getBytes(opHash));

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

  const spacing = spacingForFee(500); // 10
  let tickLower, tickUpper;
  if (Math.abs(currentTick) > 200000) {
    console.warn("Extreme tick — using aligned full-range bootstrap");
    ({ lower: tickLower, upper: tickUpper } = fullRangeAligned(spacing));
  } else {
    ({ lower: tickLower, upper: tickUpper } = clampAndAlignTicksAround(currentTick, spacing));
  }

  const amountBW   = ethers.parseUnits("0.01", 18);
  const amountUSDC = ethers.parseUnits("1", 6);

  const paramsArray = buildMintParams({
    tokenA: BWAEZI,
    tokenB: USDC,
    fee: 500,
    tickLower,
    tickUpper,
    amountA: amountBW,
    amountB: amountUSDC,
    recipient: SCW
  });

  const mintData = encodeMint(paramsArray);
  const execMint = scwEncodeExecute(NPM, 0n, mintData);

  console.log(`Minting BWAEZI/USDC: ${ethers.formatEther(amountBW)} BWAEZI + ${ethers.formatUnits(amountUSDC,6)} USDC [${tickLower}, ${tickUpper}]`);
  const userOpHash = await submitUserOp(wallet, provider, execMint);
  await waitForUserOpReceipt(userOpHash);
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

  const spacing = spacingForFee(3000); // 60
  let tickLower, tickUpper;
  if (Math.abs(currentTick) > 200000) {
    console.warn("Extreme tick — using aligned full-range bootstrap");
    ({ lower: tickLower, upper: tickUpper } = fullRangeAligned(spacing));
  } else {
    ({ lower: tickLower, upper: tickUpper } = clampAndAlignTicksAround(currentTick, spacing));
  }

  const amountBW   = ethers.parseUnits("0.01", 18);
  const amountWETH = ethers.parseUnits("0.0003", 18);

  const paramsArray = buildMintParams({
    tokenA: BWAEZI,
    tokenB: WETH,
    fee: 3000,
    tickLower,
    tickUpper,
    amountA: amountBW,
    amountB: amountWETH,
    recipient: SCW
  });

  const mintData = encodeMint(paramsArray);
  const execMint = scwEncodeExecute(NPM, 0n, mintData);

  console.log(`Minting BWAEZI/WETH: ${ethers.formatEther(amountBW)} BWAEZI + ${ethers.formatEther(amountWETH)} WETH [${tickLower}, ${tickUpper}]`);
  const userOpHash = await submitUserOp(wallet, provider, execMint);
  await waitForUserOpReceipt(userOpHash);
}

// ===== Seeding runner (single-run guard) =====
let hasRun = false;
async function runSeedingOnce() {
  if (hasRun) {
    console.log("Seeding already executed. Skipping.");
    return;
  }
  hasRun = true;

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`EOA: ${wallet.address}`);
  console.log(`SCW: ${SCW}`);

  try {
    await mintTinyBWUSDC(wallet, provider);
    await mintTinyBWWETH(wallet, provider);
    console.log("✅ Genesis seeding complete");
  } catch (e) {
    console.error("Fatal error during seeding:", e?.message || e);
    throw e;
  }
}

// ===== Server =====
const app = express();
app.get("/", (_req, res) => res.send("BWAEZI seeding via ERC-4337…"));

app.listen(PORT, async () => {
  console.log(`Server bound on port ${PORT}`);
  try {
    await runSeedingOnce();
    process.exit(0); // exit immediately after single deployment
  } catch {
    process.exit(1);
  }
});
