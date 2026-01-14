// main.js - Balancer pool creator/seeder with Express server for Render
import { ethers } from "ethers";
import express from "express";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;
const CREATOR_EOA = ethers.getAddress("0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA");

if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");
if (!SCW_ADDRESS) throw new Error("Missing SCW_ADDRESS");

const app = express();
app.use(express.json());

// Provider and signer setup
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// Constants
const BALANCER_VAULT = ethers.getAddress("0xba12222222228d8ba445958a75a0704d566bf2c8");
const WEIGHTED_POOL_FACTORY = ethers.getAddress("0x8e9aa87e45e92bad84d5f8dd5b9431736d4bfb3e");
const bwzC = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2");
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");
const CHAINLINK_ETHUSD = ethers.getAddress("0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419");

// ABIs
const balancerFactoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string,string,address[],uint256[],address,uint256,bool) external returns (address)"
];
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const erc20Abi = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
];
const balancerVaultAbi = ["function joinPool(bytes32,address,address,(address[],uint256[],bytes,bool))"];
const balancerPoolAbi = ["function getPoolId() view returns (bytes32)"];

// Skew targets
const TARGET_BAL_USDC = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const EFFECTIVE_RATIO = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW);
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO;

// Helpers
const round = (x, d) => Number(Number(x).toFixed(d));
const toBW = (x) => ethers.parseUnits(round(x, 18).toString(), 18);
const toUSDC = (x) => ethers.parseUnits(round(x, 6).toString(), 6);
const toWETH = (x) => ethers.parseUnits(round(x, 18).toString(), 18);

const withTimeout = (promise, ms = 120000) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms))
]);

async function getEthUsdReference() {
  const chainlinkAbi = ["function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)"];
  const feed = new ethers.Contract(CHAINLINK_ETHUSD, chainlinkAbi, provider);
  const [, answer] = await withTimeout(feed.latestRoundData());
  if (answer <= 0n) throw new Error("Invalid Chainlink ETH/USD price");
  return Number(answer) / 1e8;
}

async function ensureApproval(tokenAddr, spender, label) {
  const token = new ethers.Contract(tokenAddr, erc20Abi, signer);
  const allowance = await withTimeout(token.allowance(SCW_ADDRESS, spender));
  if (allowance > 0n) {
    console.log(`✅ ${label} already approved for ${spender}`);
    return;
  }
  console.log(`⚠️ Approving ${label} for ${spender}`);
  const tx = await withTimeout(token.approve(spender, ethers.MaxUint256), 60000);
  await withTimeout(tx.wait());
  console.log(`✅ ${label} approved`);
}

async function createWeightedPool(name, symbol, tokens, timeoutMs = 120000) {
  const balFactory = new ethers.Contract(WEIGHTED_POOL_FACTORY, balancerFactoryAbi, signer);
  const weights = [ethers.parseUnits("0.8", 18), ethers.parseUnits("0.2", 18)];

  const txPromise = balFactory.create(name, symbol, tokens, weights, CREATOR_EOA, ethers.parseUnits("0.003", 18), false);
  const tx = await withTimeout(txPromise, timeoutMs);
  
  const receipt = await withTimeout(tx.wait(), 120000);
  const poolCreatedEvent = receipt.logs.find(log => {
    try {
      return balFactory.interface.parseLog(log).name === "PoolCreated";
    } catch {
      return false;
    }
  });

  if (!poolCreatedEvent) throw new Error("PoolCreated event not found");

  const poolAddr = balFactory.interface.parseLog(poolCreatedEvent).args.pool;
  console.log(`✅ Pool created: ${poolAddr}`);

  const pool = new ethers.Contract(poolAddr, balancerPoolAbi, provider);
  const poolId = await withTimeout(pool.getPoolId());
  return { poolAddr, poolId };
}

async function joinBalancerViaSCW(scw, vaultAddr, poolId, assets, amounts, poolName) {
  for (let i = 0; i < assets.length; i++) {
    await ensureApproval(assets[i], vaultAddr, `${poolName} asset ${i}`);
  }
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(["uint8", "uint256[]", "uint256"], [0, amounts, 0n]);
  const request = [assets, amounts, userData, false];
  const vaultIface = new ethers.Interface(balancerVaultAbi);
  const data = vaultIface.encodeFunctionData("joinPool", [poolId, SCW_ADDRESS, SCW_ADDRESS, request]);
  
  const tx = await withTimeout(scw.execute(vaultAddr, 0n, data));
  console.log(`${poolName} tx: ${tx.hash}`);
  await withTimeout(tx.wait());
  console.log(`✅ ${poolName} seeded`);
}

// Endpoint to create pools
app.post('/create-pools', async (req, res) => {
  try {
    console.log(`EOA: ${signer.address}, SCW: ${SCW_ADDRESS}`);
    const ETH_USD_REFERENCE = await getEthUsdReference();
    const WETH_EQ = 2 / ETH_USD_REFERENCE;
    console.log(`ETH/USD: $${ETH_USD_REFERENCE}, WETH eq $2: ${WETH_EQ.toFixed(8)}`);

    const scw = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);

    // BWAEZI/USDC pool
    const usdcTokens = [bwzC, USDC];
    const usdcPool = await createWeightedPool("bwzC/USDC Weighted", "bwzC-USDC-WP", usdcTokens);
    await joinBalancerViaSCW(scw, BALANCER_VAULT, usdcPool.poolId, usdcTokens, [toBW(BW_BAL_CORRECTED), toUSDC(2)], "BWAEZI/USDC");

    // BWAEZI/WETH pool
    const wethTokens = [bwzC, WETH];
    const wethPool = await createWeightedPool("bwzC/WETH Weighted", "bwzC-WETH-WP", wethTokens);
    await joinBalancerViaSCW(scw, BALANCER_VAULT, wethPool.poolId, wethTokens, [toBW(BW_BAL_CORRECTED), toWETH(WETH_EQ)], "BWAEZI/WETH");

    res.json({ success: true, pools: [usdcPool, wethPool] });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Startup
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server running on port ${PORT}`);
  if (process.env.NODE_ENV !== 'production') {
    await new Promise(resolve => setTimeout(resolve, 5000));
    console.log("🤖
