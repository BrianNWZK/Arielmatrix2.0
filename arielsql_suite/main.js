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
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO;

const factoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name,string symbol,address[] tokens,uint256[] weights,address owner,uint256 swapFeePercentage,bool oracleEnabled) external"
];
const poolAbi = ["function getPoolId() view returns(bytes32)"];
const vaultAbi = ["function joinPool(bytes32,address,address,(address[],uint256[],bytes,bool))"];
const erc20Abi = ["function approve(address,uint256)","function allowance(address,address) view returns(uint256)"];
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

// ✅ **CORRECT** - Event parsing + receipt inspection
async function getOrCreatePool(name, symbol, tokens) {
  console.log(`🔍 Creating ${name}...`);
  
  const factory = new ethers.Contract(V2_WEIGHTED_POOL_FACTORY, factoryAbi, signer);
  const weights = [toUnits(WEIGHT_BW, 18), toUnits(WEIGHT_PAIRED, 18)];

  const tx = await factory.create(name, symbol, tokens, weights, SCW_ADDRESS, toUnits(0.003, 18), false);
  console.log(`⏳ TX: ${tx.hash}`);
  
  const receipt = await timeout(tx.wait(), 120000);
  console.log(`📄 ${receipt.logs.length} logs`);

  // **CRITICAL**: Parse ALL logs for PoolCreated event
  let poolAddr = null;
  const factoryIface = new ethers.Interface(factoryAbi);
  
  for (const log of receipt.logs) {
    try {
      const parsed = factoryIface.parseLog(log);
      if (parsed.name === 'PoolCreated') {
        poolAddr = parsed.args.pool;
        console.log(`✅ PoolCreated event: ${poolAddr}`);
        break;
      }
    } catch (e) {
      // Try raw topic signature
      if (log.topics[0] === ethers.id("PoolCreated(address)")) {
        poolAddr = ethers.getAddress(`0x${log.topics[1].slice(-40)}`);
        console.log(`✅ Raw topic PoolCreated: ${poolAddr}`);
        break;
      }
    }
  }
  
  // **FALLBACK 1**: New contract address (most reliable)
  if (!poolAddr) {
    const newContracts = receipt.logs.filter(log => 
      log.address.toLowerCase() !== V2_WEIGHTED_POOL_FACTORY.toLowerCase()
    );
    if (newContracts[0]) {
      poolAddr = newContracts[0].address;
      console.log(`✅ New contract address: ${poolAddr}`);
    }
  }
  
  // **FALLBACK 2**: CREATE2 salt prediction
  if (!poolAddr) {
    const salt = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["string"], [name]));
    poolAddr = ethers.getCreate2Address(V2_WEIGHTED_POOL_FACTORY, salt, ethers.keccak256("0x"));
    console.log(`✅ CREATE2 predicted: ${poolAddr}`);
  }

  if (!poolAddr) {
    throw new Error(`No pool found in TX: ${tx.hash}`);
  }

  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const poolId = await timeout(pool.getPoolId(), 10000);
  console.log(`🆔 Pool ID: ${poolId}`);
  
  return { poolAddr, poolId };
}

async function approveAndJoin(scw, poolId, tokens, amounts, label) {
  console.log(`🔐 ${label} setup...`);
  
  for (let i = 0; i < tokens.length; i++) {
    const token = new ethers.Contract(tokens[i], erc20Abi, signer);
    const allowance = await token.allowance(SCW_ADDRESS, BALANCER_VAULT);
    if (allowance < amounts[i]) {
      const tx = await token.approve(BALANCER_VAULT, ethers.MaxUint256);
      await tx.wait();
      console.log(`✅ Approved ${label} token ${i}`);
    }
  }
  
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256[]", "uint256"], [0n, amounts, 0n]
  );
  
  const vaultIface = new ethers.Interface(vaultAbi);
  const callData = vaultIface.encodeFunctionData("joinPool", [
    poolId, SCW_ADDRESS, SCW_ADDRESS,
    [tokens, amounts, userData, false]
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

  console.log(`💰 ETH: $${ethPrice.toFixed(2)} | BW: ${BW_BAL_CORRECTED.toFixed(8)} | WETH($2): ${ethers.formatEther(wethFor2USD)}`);

  const scw = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);

  const usdcPool = await getOrCreatePool("bwzC-USDC-WP", "bwzC-USDC", [BWZC_TOKEN, USDC]);
  await approveAndJoin(scw, usdcPool.poolId, [BWZC_TOKEN, USDC], [bwzAmount, usdcAmount], "bwzC/USDC");

  const wethPool = await getOrCreatePool("bwzC-WETH-WP", "bwzC-WETH", [BWZC_TOKEN, WETH]);
  await approveAndJoin(scw, wethPool.poolId, [BWZC_TOKEN, WETH], [bwzAmount, wethFor2USD], "bwzC/WETH");

  return { 
    success: true,
    pools: [usdcPool, wethPool], 
    skew: `${BW_BAL_CORRECTED.toFixed(8)} bwzC ($2 paired)`
  };
}

app.post("/create-pools", async (req, res) => {
  try {
    const result = await runPoolCreation();
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/health", (req, res) => res.json({ status: "live" }));

let poolsCreated = false;
const server = app.listen(PORT, async () => {
  console.log(`🚀 Server live on port ${PORT}`);
  
  if (!poolsCreated && PRIVATE_KEY && SCW_ADDRESS) {
    poolsCreated = true;
    setTimeout(async () => {
      console.log("🤖 AUTO-RUNNING POOL CREATION...");
      try {
        const result = await runPoolCreation();
        console.log("✅ COMPLETE:", JSON.stringify(result, null, 2));
      } catch (err) {
        console.error("❌ FAILED:", err.message);
      }
    }, 5000);
  }
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received");
  server.close(() => process.exit(0));
});
