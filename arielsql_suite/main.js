// main.js - Balancer pool creator/seeder with Express server for Render
import { ethers } from "ethers";
import express from "express";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

const PORT = process.env.PORT || 10000;
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
if (!SCW_ADDRESS) throw new Error("Missing SCW_ADDRESS");

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// ✅ Correct Ethereum mainnet addresses
const BALANCER_VAULT = ethers.getAddress("0xba12222222228d8ba445958a75a0704d566bf2c8");
const V2_WEIGHTED_POOL_FACTORY = ethers.getAddress("0x8e9aa87e45e92bad84d5f8dd5b9431736d4bfb3e");
const BWZC_TOKEN = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2");
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const CHAINLINK_ETHUSD = ethers.getAddress("0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419");

const TARGET_BAL_USDC = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const EFFECTIVE_RATIO = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW);
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO; // ~0.0851 bwzC for skew

// ABIs
const factoryAbi = [
  "function create(string name,string symbol,address[] tokens,uint256[] weights,address owner,uint256 swapFeePercentage,bool oracleEnabled) external returns (address)"
];
const poolAbi = ["function getPoolId() view returns(bytes32)"];
const vaultAbi = [
  "function joinPool(bytes32 poolId,address sender,address recipient,(address[] assets,uint256[] maxAmountsIn,bytes userData,bool fromInternalBalance) request) external payable"
];
const erc20Abi = [
  "function approve(address spender,uint256 amount) returns(bool)",
  "function allowance(address owner,address spender) view returns(uint256)"
];
const chainlinkAbi = ["function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"];
const scwAbi = ["function execute(address,uint256,bytes)"];

const round = (x, d) => Number(Number(x).toFixed(d));
const toUnits = (x, decimals) => ethers.parseUnits(round(x, decimals).toString(), decimals);

async function timeout(promise, ms) {
  return Promise.race([promise, new Promise((_, r) => setTimeout(() => r(new Error(`Timeout ${ms}ms`)), ms))]);
}

async function getEthPrice() {
  const feed = new ethers.Contract(CHAINLINK_ETHUSD, chainlinkAbi, provider);
  const [, price] = await timeout(feed.latestRoundData(), 10000);
  return Number(price) / 1e8;
}

// Deterministic pool creation via callStatic
async function getOrCreatePool(name, symbol, tokens) {
  const factory = new ethers.Contract(V2_WEIGHTED_POOL_FACTORY, factoryAbi, signer);
  const weights = [toUnits(WEIGHT_BW, 18), toUnits(WEIGHT_PAIRED, 18)];

  // Predict pool address deterministically
  const predictedAddr = await factory.callStatic.create(
    name,
    symbol,
    tokens,
    weights,
    SCW_ADDRESS,
    toUnits(0.003, 18),
    false
  );
  console.log(`🔮 Predicted pool address: ${predictedAddr}`);

  let poolId;
  try {
    const pool = new ethers.Contract(predictedAddr, poolAbi, provider);
    poolId = await pool.getPoolId();
    console.log(`✅ Pool already exists: ${predictedAddr}, poolId=${poolId}`);
  } catch {
    console.log(`⚠️ Pool not found, creating...`);
    const tx = await factory.create(
      name,
      symbol,
      tokens,
      weights,
      SCW_ADDRESS,
      toUnits(0.003, 18),
      false
    );
    console.log(`⏳ Create tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`✅ Pool created at block ${receipt.blockNumber}`);

    const pool = new ethers.Contract(predictedAddr, poolAbi, provider);
    poolId = await pool.getPoolId();
    console.log(`📌 PoolId fetched: ${poolId}`);
  }

  return { poolAddr: predictedAddr, poolId };
}

async function approveAndJoin(scw, poolId, tokens, amounts, label) {
  const vault = new ethers.Contract(BALANCER_VAULT, vaultAbi, signer);

  for (let i = 0; i < tokens.length; i++) {
    const token = new ethers.Contract(tokens[i], erc20Abi, signer);
    const allow = await token.allowance(SCW_ADDRESS, BALANCER_VAULT);
    if (allow < amounts[i]) {
      const tx = await token.approve(BALANCER_VAULT, ethers.MaxUint256);
      await tx.wait();
      console.log(`✅ Approved ${label} token ${i}`);
    }
  }

  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256[]", "uint256"], [0, amounts, 0]
  );
  const callData = vault.interface.encodeFunctionData("joinPool", [
    poolId, SCW_ADDRESS, SCW_ADDRESS,
    { assets: tokens, maxAmountsIn: amounts, userData, fromInternalBalance: false }
  ]);

  const tx = await scw.execute(BALANCER_VAULT, 0, callData);
  await tx.wait();
  console.log(`✅ ${label} seeded: ${tx.hash}`);
}

async function runPoolCreation() {
  const ethPrice = await getEthPrice();
  const wethFor2USD = toUnits(2 / ethPrice, 18);
  const bwzAmount = toUnits(BW_BAL_CORRECTED, 18);
  const usdcAmount = toUnits(2, 6);

  console.log(`ETH: $${ethPrice}, BW: ${ethers.formatUnits(bwzAmount, 18)}, WETH($2): ${ethers.formatEther(wethFor2USD)}`);

  const scw = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);

  const usdcPool = await getOrCreatePool("bwzC-USDC-WP", "bwzC-USDC", [BWZC_TOKEN, USDC]);
  await approveAndJoin(scw, usdcPool.poolId, [BWZC_TOKEN, USDC], [bwzAmount, usdcAmount], "bwzC/USDC");

  const wethPool = await getOrCreatePool("bwzC-WETH-WP", "bwzC-WETH", [BWZC_TOKEN, WETH]);
  await approveAndJoin(scw, wethPool.poolId, [BWZC_TOKEN, WETH], [bwzAmount, wethFor2USD], "bwzC/WETH");

  return { pools: [usdcPool, wethPool], skew: `${BW_BAL_CORRECTED.toFixed(6)} bwzC` };
}

// Express endpoints
app.post("/create-pools", async (req, res) => {
  try {
    const result = await runPoolCreation();
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/health", (req, res) => res.json({ status: "live" }));

// Startup with direct auto-run
let poolsCreated = false;
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server live on port ${PORT}`);
  if (!poolsCreated && PRIVATE_KEY && SCW_ADDRESS) {
    poolsCreated = true;
    try {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Sync delay
      console.log("🤖 Auto-running pool creation...");
      const result = await runPoolCreation();
      console.log("✅ Auto-run complete:", JSON.stringify(result, null, 2));
    } catch (err) {
      console.error("❌ Auto-run failed:", err.message, err.stack);
    }
  }
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
