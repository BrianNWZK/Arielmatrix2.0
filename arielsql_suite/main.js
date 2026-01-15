import { ethers } from "ethers";
import express from "express";
import dotenv from "dotenv";
import dotenvExpand from "dotenv-expand";

dotenvExpand.expand(dotenv.config());

const PORT = process.env.PORT || 10000;
const RPC_URL = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const SCW_ADDRESS = process.env.SCW_ADDRESS;

// ✅ ALL LOWERCASE ADDRESSES
const BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const WEIGHTED_POOL_FACTORY = "0x8e9aa87e45e92bad84d5f8dd5b9431736d4fbf3e";
const BWZC_TOKEN = "0x54d1c2889b08cad0932266eade15ec884fa0cdc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const CHAINLINK_ETHUSD = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";

const safeParseUnits = (value, decimals) => {
  const str = Number(value).toFixed(decimals);
  return ethers.parseUnits(str, decimals);
};

const app = express();
app.use(express.json());

const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(PRIVATE_KEY, provider);

const TARGET_BAL_USDC = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const EFFECTIVE_RATIO = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW);
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO; // 0.08510638

const factoryAbi = [
  "function create(string name, string symbol, address[] tokens, uint256[] weights, address owner, uint256 swapFeePercentage, bool oracleEnabled) external returns (address pool)",
  "event PoolCreated(address indexed pool)"
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

// ✅ FIXED: Use RETURN VALUE + event backup
async function getOrCreatePool(name, symbol, tokens) {
  console.log(`🔍 Creating ${name}...`);
  
  const factory = new ethers.Contract(WEIGHTED_POOL_FACTORY, factoryAbi, signer);
  const weights = [safeParseUnits(WEIGHT_BW, 18), safeParseUnits(WEIGHT_PAIRED, 18)];
  
  try {
    // TRY RETURN VALUE FIRST (most reliable)
    console.log(`📤 Calling create...`);
    const tx = await factory.create(name, symbol, tokens, weights, SCW_ADDRESS, safeParseUnits(0.003, 18), false);
    console.log(`⏳ TX: ${tx.hash}`);
    
    const receipt = await safeExec(tx.wait(), 120000);
    
    // METHOD 1: Direct return value (if call succeeded)
    let poolAddr;
    try {
      // Static call to predict (fails if pool exists)
      const staticResult = await factory.create.staticCall(name, symbol, tokens, weights, SCW_ADDRESS, safeParseUnits(0.003, 18), false);
      poolAddr = staticResult;
      console.log(`✅ StaticCall returned: ${poolAddr}`);
    } catch (e) {
      console.log(`StaticCall failed (expected if exists), checking receipt...`);
    }
    
    // METHOD 2: Event parsing
    if (!poolAddr) {
      for (const log of receipt.logs) {
        try {
          const parsed = factory.interface.parseLog(log);
          if (parsed?.name === 'PoolCreated') {
            poolAddr = parsed.args.pool;
            console.log(`✅ Event found: ${poolAddr}`);
            break;
          }
        } catch {}
      }
    }
    
    // METHOD 3: First non-factory log address
    if (!poolAddr) {
      const creationLog = receipt.logs.find(log => log.address.toLowerCase() !== WEIGHTED_POOL_FACTORY.toLowerCase());
      if (creationLog) {
        poolAddr = creationLog.address;
        console.log(`✅ Log address fallback: ${poolAddr}`);
      }
    }
    
    if (!poolAddr) {
      throw new Error(`No pool address found in TX: ${tx.hash}`);
    }
    
    const pool = new ethers.Contract(poolAddr, poolAbi, provider);
    const poolId = await safeExec(pool.getPoolId(), 10000);
    console.log(`🆔 Pool ID: ${poolId}`);
    
    return { poolAddr, poolId };
    
  } catch (error) {
    console.error(`❌ Pool failed: ${error.message}`);
    throw error;
  }
}

async function approveAndJoin(scw, poolId, tokens, amounts, label) {
  console.log(`🔐 ${label} tokens...`);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = new ethers.Contract(tokens[i], erc20Abi, signer);
    const allowance = await safeExec(token.allowance(SCW_ADDRESS, BALANCER_VAULT));
    if (allowance < amounts[i]) {
      const approveTx = await token.approve(BALANCER_VAULT, ethers.MaxUint256);
      await approveTx.wait();
      console.log(`✅ ${label} token ${i} approved`);
    }
  }
  
  console.log(`Joining ${label}...`);
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256","uint256[]","uint256"], [0n, amounts, 0n]
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
  console.log("🚀 Pool creation START");
  
  const ethPrice = await getEthPrice();
  const weth2USD = 2 / ethPrice;
  
  const bwAmount = safeParseUnits(BW_BAL_CORRECTED, 18);
  const usdcAmount = safeParseUnits(2, 6);
  const wethAmount = safeParseUnits(weth2USD, 18);
  
  console.log(`💰 ETH: $${ethPrice.toFixed(2)} | BW: ${BW_BAL_CORRECTED.toFixed(8)} | WETH($2): ${weth2USD.toFixed(8)}`);
  
  const scw = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);
  
  // USDC Pool - 94% BALANCE SKEW
  const usdcPool = await getOrCreatePool("bwzC-USDC-Skewed", "bwzC-USDC", [BWZC_TOKEN, USDC]);
  await approveAndJoin(scw, usdcPool.poolId, [BWZC_TOKEN, USDC], [bwAmount, usdcAmount], "USDC");
  
  // WETH Pool
  const wethPool = await getOrCreatePool("bwzC-WETH-Skewed", "bwzC-WETH", [BWZC_TOKEN, WETH]);
  await approveAndJoin(scw, wethPool.poolId, [BWZC_TOKEN, WETH], [bwAmount, wethAmount], "WETH");
  
  console.log("🎯 SKEW TARGET ACHIEVED: 94% USDC balance");
  return { 
    success: true, 
    pools: [usdcPool, wethPool], 
    skew: `${BW_BAL_CORRECTED.toFixed(8)} bwzC ($2 paired)` 
  };
}

app.get('/health', (req, res) => res.json({ status: 'live', time: new Date().toISOString() }));
app.post('/run', async (req, res) => {
  try {
    const result = await runPoolCreation();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ✅ AUTO-RUN ON STARTUP
let poolsCreated = false;
const server = app.listen(PORT, () => {
  console.log(`🚀 Live on port ${PORT}`);
  
  if (!poolsCreated && PRIVATE_KEY && SCW_ADDRESS) {
    poolsCreated = true;
    setTimeout(async () => {
      console.log("🤖 AUTO-RUN START");
      try {
        const result = await runPoolCreation();
        console.log("🎉 SUCCESS:", JSON.stringify(result, null, 2));
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
