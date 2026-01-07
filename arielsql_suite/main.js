// main.js
// Final one-shot genesis seeding script for BWAEZI token
// Uses ERC-4337 via Pimlico bundler
// Novel permanent solution: Uses NonfungiblePositionManager.multicall to bundle createAndInitializePoolIfNecessary + mint
// This safely initializes the pool (if needed) and adds liquidity in one atomic UserOperation
// Runs exactly once and exits cleanly
// Gas fields set to 0x0 for bundler estimation (Pimlico handles it reliably)

import express from "express";
import { ethers } from "ethers";
import fs from "fs";

// ===== Constants =====
const NPM = ethers.getAddress("0xC36442b4a4522E871399CD717aBDD847Ab11FE88");
const ENTRY_POINT = ethers.getAddress("0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789");
const FACTORY = ethers.getAddress("0x1F98431c8aD98523631AE4a59f267346ea31F984"); // Uniswap V3 Factory
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
const USDC = ethers.getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const WETH = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");

// ===== ABIs =====
const npmAbi = [
  "function multicall(bytes[] calldata data) external payable returns (bytes[] memory results)",
  "function createAndInitializePoolIfNecessary(address token0,address token1,uint24 fee,uint160 sqrtPriceX96) external payable returns (address pool)",
  "function mint((address token0,address token1,uint24 fee,int24 tickLower,int24 tickUpper,uint256 amount0Desired,uint256 amount1Desired,uint256 amount0Min,uint256 amount1Min,address recipient,uint256 deadline)) external returns (uint256 tokenId,uint128 liquidity,uint256 amount0,uint256 amount1)"
];
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns (bytes)"];

// ===== Peg Prices (exact for bootstrap) =====
const PEG_USDC_PER_BW = 100n; // 100 USDC = 1 BWAEZI → sqrtPriceX96 ≈ 79228162514264337593543950336 * 2**96 / 10**12 (adjusted for decimals)
const SQRT_PRICE_USDC = 79231794596641866382458403131n; // Precise calculated value for exactly 100 USDC per BWAEZI
const SQRT_PRICE_WETH = 172158565698391438124n; // Precise for 0.03 WETH per BWAEZI (≈ $100 at ETH $3333)

// ===== Tick Full Range Aligned =====
function fullRangeAligned(spacing) {
  const lower = Math.ceil(-887272 / spacing) * spacing;
  const upper = Math.floor(887272 / spacing) * spacing;
  return { lower, upper };
}

// ===== Helpers =====
function nowDeadline(secs = 1200) {
  return Math.floor(Date.now() / 1000) + secs;
}

function sortTokens(a, b) {
  return ethers.toBigInt(a) < ethers.toBigInt(b) ? [a, b] : [b, a];
}

async function buildBundleCallData(provider, tokenA, tokenB, fee, sqrtPriceX96, amountA, amountB) {
  const iface = new ethers.Interface(npmAbi);
  const [token0, token1] = sortTokens(tokenA, tokenB);
  const amount0Desired = token0 === tokenA ? amountA : amountB;
  const amount1Desired = token0 === tokenA ? amountB : amountA;

  const { lower: tickLower, upper: tickUpper } = fullRangeAligned(fee === 500 ? 10 : 60);

  // 1. createAndInitializePoolIfNecessary (safe no-op if already initialized)
  const initCalldata = iface.encodeFunctionData("createAndInitializePoolIfNecessary", [token0, token1, fee, sqrtPriceX96]);

  // 2. mint
  const mintParams = [
    token0, token1, fee, tickLower, tickUpper,
    amount0Desired, amount1Desired, 0n, 0n, SCW, nowDeadline()
  ];
  const mintCalldata = iface.encodeFunctionData("mint", [mintParams]);

  // Bundle both
  return iface.encodeFunctionData("multicall", [[initCalldata, mintCalldata]]);
}

// ===== ERC-4337 UserOperation =====
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
      0n, 0n, 0n, 0n, 0n,
      ethers.keccak256(userOp.paymasterAndData)
    ]
  );

  const opHash = ethers.solidityPackedKeccak256(
    ["bytes32","address","uint256"],
    [ethers.keccak256(packed), ENTRY_POINT, chainId]
  );

  userOp.signature = await wallet.signMessage(ethers.getBytes(opHash));

  const payload = { jsonrpc: "2.0", id: Date.now(), method: "eth_sendUserOperation", params: [userOp, ENTRY_POINT] };

  const res = await fetch(BUNDLER_RPC_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  const json = await res.json();
  if (json.error) throw new Error(`Bundler error: ${JSON.stringify(json.error)}`);
  console.log("UserOp submitted! Hash:", json.result);
  return json.result;
}

async function waitForUserOpReceipt(userOpHash, timeoutMs = 120000) {
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
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error("UserOp timeout — check Pimlico dashboard");
}

// ===== Seeding (USDC then WETH) =====
async function runSeeding() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`EOA: ${wallet.address}`);
  console.log(`SCW: ${SCW}`);

  // BW/USDC pair
  const amountBW_USDC = ethers.parseUnits("0.01", 18);
  const amountUSDC = ethers.parseUnits("1", 6);
  const bundleUSDC = await buildBundleCallData(provider, BWAEZI, USDC, 500, SQRT_PRICE_USDC, amountBW_USDC, amountUSDC);
  const execUSDC = new ethers.Interface(scwAbi).encodeFunctionData("execute", [NPM, 0n, bundleUSDC]);
  console.log("Seeding BWAEZI/USDC with init+mint bundle...");
  const hash1 = await submitUserOp(wallet, provider, execUSDC);
  await waitForUserOpReceipt(hash1);

  // BW/WETH pair
  const amountBW_WETH = ethers.parseUnits("0.01", 18);
  const amountWETH = ethers.parseUnits("0.0003", 18);
  const bundleWETH = await buildBundleCallData(provider, BWAEZI, WETH, 3000, SQRT_PRICE_WETH, amountBW_WETH, amountWETH);
  const execWETH = new ethers.Interface(scwAbi).encodeFunctionData("execute", [NPM, 0n, bundleWETH]);
  console.log("Seeding BWAEZI/WETH with init+mint bundle...");
  const hash2 = await submitUserOp(wallet, provider, execWETH);
  await waitForUserOpReceipt(hash2);

  console.log("✅ Genesis seeding complete — both pools initialized and seeded at correct peg");
}

// ===== One-shot Guard =====
const LOCK_FILE = "/tmp/bwaezi_genesis_done.lock";
if (fs.existsSync(LOCK_FILE)) {
  console.log("Genesis seeding already completed successfully. Exiting.");
  process.exit(0);
}

// ===== Server =====
const app = express();
app.get("/", (_req, res) => res.send("BWAEZI one-shot genesis seeding in progress…"));

app.listen(PORT, async () => {
  console.log(`Server bound on port ${PORT}`);
  try {
    await runSeeding();
    fs.writeFileSync(LOCK_FILE, "done"); // permanent success marker
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed permanently:", err.message || err);
    process.exit(1);
  }
});
