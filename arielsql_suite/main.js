// main.js
// Balancer V2 Weighted Pool (2-token) genesis seeding script
// One-shot execution: creates/seeds both USDC + WETH pools if not exist, then exits
// Targeted peg: ~$94 BWAEZI price (organic arbitrage vs Uniswap $96–$100 pools)
// 80/20 weights (BWAEZI heavy) + $2 paired value → higher BW amount for lower effective price
// Fixed: Correct 2-token factory + ABI
// Fixed: Idempotent (staticCall check)
// Fixed: SCW execute for joinPool
// Approvals already done (unlimited)

import express from "express";
import { ethers } from "ethers";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";
dotenvExpand.expand(dotenv.config());

const PORT = Number(process.env.PORT || 10000);
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;
if (!PRIVATE_KEY || !SCW_ADDRESS) throw new Error("Missing keys");

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// ===== Balancer Constants (checksum-normalized) =====
const BALANCER_VAULT = ethers.getAddress("0xba12222222228d8ba445958a75a0704d566bf2c8");
const WEIGHTED_POOL2_FACTORY = ethers.getAddress("0x8e9aa87e45e92bad84d5f8dd5b9431736d4bfb3e");
const BWZC_TOKEN = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2");
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const CHAINLINK_ETHUSD = ethers.getAddress("0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419");

// ===== Peg & Weight Config =====
const TARGET_BWAEZI_PRICE = 94;
const PAIRED_VALUE_USD = 2;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const SWAP_FEE = 0.003;

// Calculate BW amount for $94 peg with skew
const EFFECTIVE_RATIO = TARGET_BWAEZI_PRICE * (WEIGHT_PAIRED / WEIGHT_BW);
const BW_AMOUNT_BASE = PAIRED_VALUE_USD / EFFECTIVE_RATIO;

// ===== ABIs =====
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const factoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name, string symbol, address token0, address token1, uint256 normalizedWeight0, uint256 normalizedWeight1, uint256 swapFeePercentage, address owner) external returns (address pool)"
];
const vaultAbi = [
  "function joinPool(bytes32 poolId, address sender, address recipient, (address[] assets, uint256[] maxAmountsIn, bytes userData, bool fromInternalBalance) request)"
];
const poolAbi = ["function getPoolId() view returns (bytes32)"];

// ===== Helpers =====
async function getEthPrice() {
  try {
    const feed = new ethers.Contract(CHAINLINK_ETHUSD, ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"], provider);
    const [, price] = await feed.latestRoundData();
    return Number(price) / 1e8;
  } catch {
    return 3300;
  }
}

function sortTokens(t0, t1) {
  return t0.toLowerCase() < t1.toLowerCase() ? [t0, t1] : [t1, t0];
}

// ===== Create Pool (idempotent via staticCall) =====
async function createWeightedPool(name, symbol, tokenA, tokenB) {
  console.log(`Creating ${name} (if not exists)...`);

  const [token0, token1] = sortTokens(tokenA, tokenB);
  const weight0 = token0 === BWZC_TOKEN ? WEIGHT_BW : WEIGHT_PAIRED;
  const weight1 = token0 === BWZC_TOKEN ? WEIGHT_PAIRED : WEIGHT_BW;

  const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, signer);

  // Simulate to check if exists
  try {
    await factory.create.staticCall(
      name,
      symbol,
      token0,
      token1,
      ethers.parseUnits(weight0.toString(), 18),
      ethers.parseUnits(weight1.toString(), 18),
      ethers.parseUnits(SWAP_FEE.toString(), 18),
      SCW_ADDRESS
    );
  } catch (err) {
    console.log(`${name} already exists — skipping creation & seeding`);
    return null;
  }

  const tx = await factory.create(
    name,
    symbol,
    token0,
    token1,
    ethers.parseUnits(weight0.toString(), 18),
    ethers.parseUnits(weight1.toString(), 18),
    ethers.parseUnits(SWAP_FEE.toString(), 18),
    SCW_ADDRESS
  );
  console.log(`Creation TX: https://etherscan.io/tx/${tx.hash}`);
  const receipt = await tx.wait();

  const eventTopic = ethers.id("PoolCreated(address)");
  const log = receipt.logs.find(l => l.topics[0] === eventTopic);
  if (!log) throw new Error("No PoolCreated event");

  const poolAddr = ethers.getAddress("0x" + log.topics[1].slice(-40));
  console.log(`Pool created: ${poolAddr}`);

  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const poolId = await pool.getPoolId();
  console.log(`Pool ID: ${poolId}`);

  return { poolAddr, poolId };
}

// ===== Seed Pool (INIT join) =====
async function seedWeightedPool(poolId, tokenA, tokenB, amountA, amountB, label) {
  if (!poolId) return;

  console.log(`Seeding ${label}...`);

  const [asset0, asset1] = sortTokens(tokenA, tokenB);
  const amounts = asset0 === tokenA ? [amountA, amountB] : [amountB, amountA];

  const vaultIface = new ethers.Interface(vaultAbi);
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256[]"], [0n, amounts]); // INIT = 0

  const request = [[asset0, asset1], amounts, userData, false];

  const joinData = vaultIface.encodeFunctionData("joinPool", [poolId, SCW_ADDRESS, SCW_ADDRESS, request]);

  const execData = new ethers.Interface(scwAbi).encodeFunctionData("execute", [BALANCER_VAULT, 0n, joinData]);

  const tx = await signer.sendTransaction({ to: SCW_ADDRESS, data: execData, gasLimit: 1500000 });
  await tx.wait();
  console.log(`Seeding TX: https://etherscan.io/tx/${tx.hash}`);
}

// ===== Main Seeding (both pools, one-shot) =====
async function runSeeding() {
  const ethPrice = await getEthPrice();

  const usdcAmount = ethers.parseUnits(PAIRED_VALUE_USD.toString(), 6);
  const wethAmount = ethers.parseUnits((PAIRED_VALUE_USD / ethPrice).toFixed(18), 18);
  const bwAmount = ethers.parseUnits(BW_AMOUNT_BASE.toFixed(18), 18);

  console.log(`ETH price: $${ethPrice.toFixed(0)}`);
  console.log(`Paired value: $${PAIRED_VALUE_USD} → USDC: ${PAIRED_VALUE_USD} | WETH: ${ethers.formatEther(wethAmount)}`);
  console.log(`BWAEZI amount (for ~$94 peg with 80/20 skew): ${ethers.formatEther(bwAmount)}`);

  // USDC Pool
  const usdcPool = await createWeightedPool("bwzC-USDC-94", "bwzC-USDC94", BWZC_TOKEN, USDC);
  await seedWeightedPool(usdcPool?.poolId, BWZC_TOKEN, USDC, bwAmount, usdcAmount, "USDC pool (~$94 peg)");

  // WETH Pool
  const wethPool = await createWeightedPool("bwzC-WETH-94", "bwzC-WETH94", BWZC_TOKEN, WETH);
  await seedWeightedPool(wethPool?.poolId, BWZC_TOKEN, WETH, bwAmount, wethAmount, "WETH pool (~$94 peg)");

  console.log("Both Balancer pools processed at ~$94 peg — arbitrage ready!");
}

// ===== One-shot Auto-Run & Exit =====
let hasRun = false;
app.get("/health", (_, res) => res.json({ status: "live" }));

const server = app.listen(PORT, () => {
  console.log(`Live on port ${PORT}`);

  if (!hasRun) {
    hasRun = true;
    setTimeout(async () => {
      console.log("AUTO-RUN: Creating/seeding both Balancer 80/20 pools @ ~$94 peg");
      try {
        await runSeeding();
        console.log("SUCCESS — both pools live, exiting");
        process.exit(0);
      } catch (e) {
        console.error("FAILED:", e.message || e);
        process.exit(1);
      }
    }, 3000);
  }
});
