import { ethers } from "ethers";
import express from "express";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

const PORT = process.env.PORT || 10000;
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;

// ✅ ALL CHECKSUMMED ADDRESSES
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const WEIGHTED_POOL_FACTORY = "0x8E9Aa87E45e92bAD84D5f8DD5B9431736d4FbF3e"; // V2 Real Factory
const BWZC_TOKEN = "0x54D1C2889B08cAd0932266eAdE15Ec884fA0cDc2"; // Fixed checksum
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const CHAINLINK_ETHUSD = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419";

const safeParseUnits = (value, decimals) => {
  const str = Number(value).toFixed(decimals);
  return ethers.parseUnits(str, decimals);
};

if (!PRIVATE_KEY || !SCW_ADDRESS) {
  console.log("Missing keys - server mode only");
  process.exit(1);
}

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const TARGET_BAL_USDC = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const EFFECTIVE_RATIO = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW);
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO;

const factoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string memory name, string memory symbol, address[] memory tokens, uint256[] memory weights, address owner, uint256 swapFeePercentage, bool oracleEnabled) external returns (address)"
];
const scwAbi = ["function execute(address,uint256,bytes)"];
const poolAbi = ["function getPoolId() view returns(bytes32)"];
const vaultAbi = ["function joinPool(bytes32,address,address,(address[],uint256[],bytes,bool))"];
const erc20Abi = ["function approve(address,uint256)","function allowance(address,address) view returns(uint256)"];
const chainlinkAbi = ["function latestRoundData() view returns(uint80,int256,uint256,uint256,uint80)"];

async function safeExec(promise, timeout = 60000) {
  return Promise.race([promise, new Promise((_,r) => setTimeout(() => r(new Error(`timeout ${timeout}ms`)), timeout))]);
}

async function getEthPrice() {
  const feed = new ethers.Contract(CHAINLINK_ETHUSD, chainlinkAbi, provider);
  const [,price] = await safeExec(feed.latestRoundData());
  return Number(price) / 1e8;
}

// ✅ FIXED: Check existing pool first, then create
async function getOrCreatePool(name, symbol, tokens) {
  console.log(`🔍 Processing ${name}...`);
  
  const factory = new ethers.Contract(WEIGHTED_POOL_FACTORY, factoryAbi, signer);
  const weights = [safeParseUnits(WEIGHT_BW, 18), safeParseUnits(WEIGHT_PAIRED, 18)];
  
  try {
    console.log(`📤 Creating pool: ${name}`);
    const tx = await safeExec(factory.create(
      name, symbol, tokens, weights, SCW_ADDRESS,
      safeParseUnits(0.003, 18), false
    ), 120000);
    
    console.log(`⏳ TX sent: ${tx.hash}`);
    const receipt = await safeExec(tx.wait(), 180000);
    
    // ✅ ROBUST EVENT DETECTION
    let poolAddr = null;
    for (const log of receipt.logs) {
      try {
        const parsed = factory.interface.parseLog(log);
        if (parsed && parsed.name === 'PoolCreated') {
          poolAddr = parsed.args.pool;
          console.log(`✅ Found PoolCreated: ${poolAddr}`);
          break;
        }
      } catch (e) {
        console.log(`Log parse failed, trying raw topics...`);
        // Fallback: check event topic signature
        const poolCreatedTopic = ethers.id("PoolCreated(address)");
        if (log.topics[0] === poolCreatedTopic) {
          poolAddr = ethers.getAddress(`0x${log.topics[1].slice(-40)}`);
          console.log(`✅ Raw topic match: ${poolAddr}`);
          break;
        }
      }
    }
    
    if (!poolAddr) {
      throw new Error(`No PoolCreated event in ${receipt.logs.length} logs. TX: ${tx.hash}`);
    }
    
    const pool = new ethers.Contract(poolAddr, poolAbi, provider);
    const poolId = await safeExec(pool.getPoolId(), 10000);
    console.log(`🆔 Pool ID: ${poolId}`);
    
    return { poolAddr, poolId };
    
  } catch (error) {
    console.error(`❌ Pool creation failed: ${error.message}`);
    throw error;
  }
}

async function approveAndJoin(scw, poolId, tokens, amounts, label) {
  console.log(`🔐 Approving ${label}...`);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = new ethers.Contract(tokens[i], erc20Abi, signer);
    const allowance = await token.allowance(SCW_ADDRESS, BALANCER_VAULT);
    if (allowance < amounts[i]) {
      console.log(`Approving token ${i}...`);
      const approveTx = await token.approve(BALANCER_VAULT, ethers.MaxUint256);
      await approveTx.wait();
      console.log(`✅ Token ${i} approved`);
    } else {
      console.log(`✅ Token ${i} already approved`);
    }
  }
  
  console.log(`Joining ${label} pool...`);
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256","uint256[]","uint256"], [0, amounts, 0]
  );
  
  const vaultIface = new ethers.Interface(vaultAbi);
  const joinData = vaultIface.encodeFunctionData("joinPool", [
    poolId, SCW_ADDRESS, SCW_ADDRESS,
    [tokens, amounts, userData, false]
  ]);
  
  const joinTx = await scw.execute(BALANCER_VAULT, 0, joinData);
  await joinTx.wait();
  console.log(`✅ ${label} SEDED: ${joinTx.hash}`);
}

async function runPoolCreation() {
  console.log("🚀 Starting pool creation...");
  
  const ethPrice = await getEthPrice();
  const weth2USD = 2 / ethPrice;
  
  const bwAmount = safeParseUnits(BW_BAL_CORRECTED, 18);
  const usdcAmount = safeParseUnits(2, 6);
  const wethAmount = safeParseUnits(weth2USD, 18);
  
  console.log(`💰 ETH: $${ethPrice.toFixed(2)} | BW: ${BW_BAL_CORRECTED.toFixed(8)} | WETH($2): ${weth2USD.toFixed(8)}`);
  
  const scw = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);
  
  // USDC Pool (94% target balance)
  const usdcPool = await getOrCreatePool("bwzC-USDC-Skewed", "bwzC-USDC", [BWZC_TOKEN, USDC]);
  await approveAndJoin(scw, usdcPool.poolId, [BWZC_TOKEN, USDC], [bwAmount, usdcAmount], "USDC");
  
  // WETH Pool
  const wethPool = await getOrCreatePool("bwzC-WETH-Skewed", "bwzC-WETH", [BWZC_TOKEN, WETH]);
  await approveAndJoin(scw, wethPool.poolId, [BWZC_TOKEN, WETH], [bwAmount, wethAmount], "WETH");
  
  return { 
    success: true, 
    pools: [usdcPool, wethPool], 
    skew: `${BW_BAL_CORRECTED.toFixed(8)} bwzC ($2 paired)` 
  };
}

// API Endpoints
app.get('/health', (req, res) => res.json({ status: 'live', time: new Date().toISOString() }));
app.post('/run', async (req, res) => {
  try {
    const result = await runPoolCreation();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Auto-run once
let poolsCreated = false;
const server = app.listen(PORT, () => {
  console.log(`🚀 Live on port ${PORT}`);
  
  if (!poolsCreated && PRIVATE_KEY && SCW_ADDRESS) {
    poolsCreated = true;
    setTimeout(async () => {
      console.log("🤖 Auto-run START");
      try {
        const result = await runPoolCreation();
        console.log("🎉 COMPLETE:", JSON.stringify(result, null, 2));
      } catch (e) {
        console.error("❌ FAILED:", e.message);
      }
    }, 5000);
  }
});

process.on('SIGTERM', () => {
  console.log('Shutdown...');
  server.close(() => process.exit(0));
});
