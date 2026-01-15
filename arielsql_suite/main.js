import { ethers } from "ethers";
import express from "express";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

const PORT = process.env.PORT || 10000;
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;

// ✅ FIXED: Safe decimal handling
const safeParseUnits = (value, decimals) => {
  const str = Number(value).toFixed(decimals);
  return ethers.parseUnits(str, decimals);
};

if (!PRIVATE_KEY || !SCW_ADDRESS) {
  console.log("Missing keys - server mode only");
}

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

// ✅ CORRECT V2 ADDRESSES
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const V2_WEIGHTED_POOL_FACTORY = "0xBA1BA1ba1ba1Ba1bA1Ba1Ba1bA1bA1Ba1BA1ba1b";
const bwzC = "0x54D1C2889B08cAd0932266eadE15eC884Fa0CdC2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const CHAINLINK_ETHUSD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

const TARGET_BAL_USDC = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const EFFECTIVE_RATIO = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW);
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO; // 0.08510638297872339

const factoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string,string,address[],uint256[],address,uint256,bool) external returns(address)"
];
const scwAbi = ["function execute(address,uint256,bytes)"];
const poolAbi = ["function getPoolId() view returns(bytes32)"];
const vaultAbi = ["function joinPool(bytes32,address,address,(address[],uint256[],bytes,bool))"];
const erc20Abi = ["function approve(address,uint256)","function allowance(address,address) view returns(uint256)"];
const chainlinkAbi = ["function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"];

async function safeExec(promise, timeout = 60000) {
  return Promise.race([promise, new Promise((_,r) => setTimeout(() => r(new Error(`timeout ${timeout}ms`)), timeout))]);
}

// ✅ FIXED: Safe ETH price + WETH calculation
async function getEthPrice() {
  const feed = new ethers.Contract(CHAINLINK_ETHUSD, chainlinkAbi, provider);
  const [,price] = await safeExec(feed.latestRoundData());
  return Number(price) / 1e8;
}

// ✅ FIXED: Robust pool creation with V2 factory
async function getOrCreatePool(name, symbol, tokens) {
  console.log(`🔍 Creating ${name}...`);
  
  const factory = new ethers.Contract(V2_WEIGHTED_POOL_FACTORY, factoryAbi, signer);
  const weights = [safeParseUnits(WEIGHT_BW, 18), safeParseUnits(WEIGHT_PAIRED, 18)];
  
  const tx = await safeExec(factory.create(
    name, symbol, tokens, weights, SCW_ADDRESS, 
    safeParseUnits(0.003, 18), false
  ));
  
  console.log(`⏳ TX: ${tx.hash}`);
  const receipt = await safeExec(tx.wait(), 120000);
  
  // Find PoolCreated event (robust parsing)
  const event = receipt.logs.find(log => {
    try {
      return factory.interface.parseLog(log).name === 'PoolCreated';
    } catch {
      return false;
    }
  });
  
  if (!event) {
    throw new Error("No PoolCreated event - check tx: " + tx.hash);
  }
  
  const { args: { pool: poolAddr } } = factory.interface.parseLog(event);
  console.log(`✅ Pool: ${poolAddr}`);
  
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const poolId = await safeExec(pool.getPoolId());
  console.log(`🆔 ID: ${poolId}`);
  
  return { poolAddr, poolId };
}

async function approveAndJoin(scw, poolId, tokens, amounts, label) {
  console.log(`🔐 ${label} approve/join...`);
  
  // Bulk approve
  for (let i = 0; i < tokens.length; i++) {
    const token = new ethers.Contract(tokens[i], erc20Abi, signer);
    const allowance = await token.allowance(SCW_ADDRESS, BALANCER_VAULT);
    if (allowance < amounts[i]) {
      const approveTx = await token.approve(BALANCER_VAULT, ethers.MaxUint256);
      await approveTx.wait();
      console.log(`✅ ${label} token ${i} approved`);
    }
  }
  
  // JoinPool via SCW
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256","uint256[]","uint256"], [0, amounts, 0]
  );
  
  const vault = new ethers.Contract(BALANCER_VAULT, vaultAbi, signer);
  const joinData = vault.interface.encodeFunctionData("joinPool", [
    poolId, SCW_ADDRESS, SCW_ADDRESS,
    [tokens, amounts, userData, false]
  ]);
  
  const joinTx = await scw.execute(BALANCER_VAULT, 0, joinData);
  await joinTx.wait();
  console.log(`✅ ${label} seeded: ${joinTx.hash}`);
}

async function runPoolCreation() {
  const ethPrice = await getEthPrice();
  const weth2USD = 2 / ethPrice;
  
  // ✅ FIXED: Safe unit conversion
  const bwAmount = safeParseUnits(BW_BAL_CORRECTED, 18);
  const usdcAmount = safeParseUnits(2, 6);
  const wethAmount = safeParseUnits(weth2USD, 18);
  
  console.log(`💰 ETH: $${ethPrice.toFixed(2)} | BW: ${BW_BAL_CORRECTED.toFixed(8)} | WETH($2): ${weth2USD.toFixed(8)}`);
  
  const scw = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);
  
  // USDC Pool (94% target balance)
  const usdcPool = await getOrCreatePool("bwzC-USDC-Skewed", "bwzC-USDC", [bwzC, USDC]);
  await approveAndJoin(scw, usdcPool.poolId, [bwzC, USDC], [bwAmount, usdcAmount], "USDC");
  
  // WETH Pool
  const wethPool = await getOrCreatePool("bwzC-WETH-Skewed", "bwzC-WETH", [bwzC, WETH]);
  await approveAndJoin(scw, wethPool.poolId, [bwzC, WETH], [bwAmount, wethAmount], "WETH");
  
  return { 
    success: true, 
    pools: [usdcPool, wethPool], 
    skew: `${BW_BAL_CORRECTED.toFixed(8)} bwzC ($2 paired)` 
  };
}

// API endpoints
app.get('/health', (req, res) => res.json({ status: 'live', time: new Date().toISOString() }));
app.post('/run', async (req, res) => {
  try {
    const result = await runPoolCreation();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto-run on startup
let poolsCreated = false;
const server = app.listen(PORT, async () => {
  console.log(`🚀 Live on port ${PORT}`);
  
  if (!poolsCreated && PRIVATE_KEY && SCW_ADDRESS) {
    poolsCreated = true;
    setTimeout(async () => {
      console.log("🤖 Auto-run START");
      try {
        const result = await runPoolCreation();
        console.log("🎉 SUCCESS:", JSON.stringify(result, null, 2));
      } catch (e) {
        console.error("❌ FAILED:", e.message);
      }
    }, 3000);
  }
});

process.on('SIGTERM', () => {
  console.log('Shutdown...');
  server.close(() => process.exit(0));
});
