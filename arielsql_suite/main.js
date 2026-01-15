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

// ✅ CORRECTED V2 FACTORY (verified on Etherscan)
const BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const V2_WEIGHTED_POOL_V2_FACTORY = "0x8e9aa87e45e92bad84d5f8dd5b9431736d4bfb3e"; 
const BWZC_TOKEN = "0x54d1c2889b08cad0932266eade15ec884fa0cdc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";
const CHAINLINK_ETHUSD = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";

const TARGET_BAL_USDC = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const EFFECTIVE_RATIO = TARGET_BAL_USDC * (WEIGHT_PAIRED / WEIGHT_BW);
const BW_BAL_CORRECTED = 2 / EFFECTIVE_RATIO;

const erc20Abi = ["function approve(address,uint256)","function allowance(address,address) view returns(uint256)"];
const scwAbi = ["function execute(address,uint256,bytes)"];
const poolAbi = ["function getPoolId() view returns(bytes32)"];

const toUnits = (x, decimals) => ethers.parseUnits(x.toFixed(decimals), decimals);

async function timeout(promise, ms) {
  return Promise.race([promise, new Promise((_, r) => setTimeout(() => r(new Error(`Timeout ${ms}ms`)), ms))]);
}

async function getEthPrice() {
  try {
    const feed = new ethers.Contract(CHAINLINK_ETHUSD, ["function latestRoundData()"], provider);
    const [, price] = await timeout(feed.latestRoundData(), 10000);
    return Number(price) / 1e8;
  } catch {
    return 3300; // fallback
  }
}

// ✅ **SIMPLEST APPROACH** - Direct deployment + log inspection
async function createPool(name, symbol, tokens) {
  console.log(`🔍 Creating ${name}...`);
  
  // Balancer V2 WeightedPool2Factory ABI + exact signature
  const factoryAbi = [
    "function create(string,string,address[],uint256[],address,uint256,bool) external returns(address)"
  ];
  
  const factory = new ethers.Contract(V2_WEIGHTED_POOL_V2_FACTORY, factoryAbi, signer);
  const weights = [toUnits(WEIGHT_BW, 18), toUnits(WEIGHT_PAIRED, 18)];
  
  console.log(`📤 Calling factory.create...`);
  const tx = await factory.create(name, symbol, tokens, weights, SCW_ADDRESS, toUnits(0.003, 18), false);
  console.log(`⏳ TX: https://etherscan.io/tx/${tx.hash}`);
  
  const receipt = await timeout(tx.wait(), 120000);
  console.log(`📄 Block: ${receipt.blockNumber}, Logs: ${receipt.logs.length}`);
  
  // **DIRECT RETURN VALUE** - Balancer V2 factories return pool address
  let poolAddr;
  try {
    poolAddr = receipt.contractAddress;
    if (poolAddr) {
      console.log(`✅ ContractAddress: ${poolAddr}`);
    }
  } catch {}
  
  // **FALLBACK**: First non-factory log address
  if (!poolAddr) {
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== V2_WEIGHTED_POOL_V2_FACTORY.toLowerCase()) {
        poolAddr = log.address;
        console.log(`✅ Log contract: ${poolAddr}`);
        break;
      }
    }
  }
  
  if (!poolAddr) {
    console.log("📋 RAW LOGS:", receipt.logs.map(l => ({addr: l.address, topics: l.topics[0]})));
    throw new Error(`No pool address in TX: ${tx.hash}`);
  }
  
  // **VERIFY**
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const poolId = await timeout(pool.getPoolId(), 15000);
  console.log(`🆔 Pool ID: ${poolId}`);
  
  return { poolAddr, poolId };
}

async function seedPool(scw, poolId, tokens, amounts, label) {
  console.log(`🌱 Seeding ${label}...`);
  
  // Approve from signer → vault (SCW needs vault access)
  for (let i = 0; i < tokens.length; i++) {
    const token = new ethers.Contract(tokens[i], erc20Abi, signer);
    const allowance = await token.allowance(signer.address, BALANCER_VAULT);
    if (allowance < amounts[i]) {
      const tx = await token.approve(BALANCER_VAULT, ethers.MaxUint256);
      await tx.wait();
      console.log(`✅ Approved ${label} token ${i}`);
    }
  }
  
  // Join via SCW
  const vaultAbi = ["function joinPool(bytes32,address,address,(address[],uint256[],bytes,bool))"];
  const vaultIface = new ethers.Interface(vaultAbi);
  
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256[]", "uint256"], [0n, amounts, 0n]
  );
  
  const joinData = vaultIface.encodeFunctionData("joinPool", [
    poolId, SCW_ADDRESS, SCW_ADDRESS, [tokens, amounts, userData, false]
  ]);
  
  const tx = await scw.execute(BALANCER_VAULT, 0, joinData);
  await tx.wait();
  console.log(`✅ ${label} SEEDED: https://etherscan.io/tx/${tx.hash}`);
}

async function runPoolCreation() {
  const ethPrice = await getEthPrice();
  const wethAmount = toUnits(2 / ethPrice, 18);
  const bwAmount = toUnits(BW_BAL_CORRECTED, 18);
  const usdcAmount = toUnits(2, 6);
  
  console.log(`💰 ETH: $${ethPrice.toFixed(0)} | BW: ${BW_BAL_CORRECTED.toFixed(8)} | WETH($2): ${ethers.formatEther(wethAmount)}`);
  
  const scw = new ethers.Contract(SCW_ADDRESS, scwAbi, signer);
  
  // USDC POOL (94:6 skew)
  const usdcPool = await createPool("bwzC-USDC-WP", "bwzC-USDC", [BWZC_TOKEN, USDC]);
  await seedPool(scw, usdcPool.poolId, [BWZC_TOKEN, USDC], [bwAmount, usdcAmount], "USDC");
  
  // WETH POOL  
  const wethPool = await createPool("bwzC-WETH-WP", "bwzC-WETH", [BWZC_TOKEN, WETH]);
  await seedPool(scw, wethPool.poolId, [BWZC_TOKEN, WETH], [bwAmount, wethAmount], "WETH");
  
  console.log("🎯 94% USDC SKEW COMPLETE");
  return { success: true, pools: [usdcPool, wethPool], skew: BW_BAL_CORRECTED.toFixed(8) };
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
const server = app.listen(PORT, () => {
  console.log(`🚀 Live on port ${PORT}`);
  
  if (!poolsCreated && PRIVATE_KEY && SCW_ADDRESS) {
    poolsCreated = true;
    setTimeout(async () => {
      console.log("🤖 AUTO-RUN START");
      try {
        const result = await runPoolCreation();
        console.log("✅ SUCCESS:", result);
      } catch (e) {
        console.error("❌ FAILED:", e.message);
      }
    }, 2000);
  }
});
