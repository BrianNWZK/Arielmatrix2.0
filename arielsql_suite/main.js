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

const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const WEIGHTED_POOL2_FACTORY = "0x8e9aa87E45e92bad84D5F8Dd5b9431736D4BFb3E"; // 2-token factory
const BWZC_TOKEN = "0x54D1C2889B08caD0932266EaDE15Ec884FA0CdC2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

// 94 USD skew math
const TARGET_PEG = 94;
const WEIGHT_BW = 0.8;
const WEIGHT_USDC = 0.2;
const USDC_AMOUNT = ethers.parseUnits("2", 6);
const BW_AMOUNT = ethers.parseEther((2 / (TARGET_PEG * WEIGHT_USDC / WEIGHT_BW)).toFixed(18));

// ✅ CORRECT 2-TOKEN ABI
const factoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name,string symbol,address token0,address token1,uint256 normalizedWeight0,uint256 normalizedWeight1,uint256 swapFeePercentage,address owner) external returns(address)"
];

const erc20Abi = ["function approve(address,uint256) external returns(bool)"];
const poolAbi = ["function getPoolId() view returns(bytes32)"];

async function createPool() {
  console.log("🔍 Creating bwzC-USDC-94...");
  
  // BWZC < USDC (alphabetical)
  const token0 = BWZC_TOKEN;
  const token1 = USDC;
  
  const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, signer);
  
  const tx = await factory.create(
    "bwzC-USDC-94skew",
    "bwzC-USDC",
    token0, token1,
    ethers.parseEther(WEIGHT_BW.toFixed(18)),   // 80%
    ethers.parseEther(WEIGHT_USDC.toFixed(18)), // 20%
    ethers.parseEther("0.003"),                 // 0.3%
    SCW_ADDRESS
  );
  
  console.log(`⏳ TX: https://etherscan.io/tx/${tx.hash}`);
  const receipt = await tx.wait();
  console.log(`📄 Logs: ${receipt.logs.length}`);
  
  // Parse PoolCreated event
  const iface = new ethers.Interface(factoryAbi);
  const log = receipt.logs.find(l => l.topics[0] === iface.getEvent("PoolCreated").topicHash);
  
  if (!log) {
    console.log("RAW LOGS:", receipt.logs.map(l => l.address.slice(0,10)));
    throw new Error("No PoolCreated event");
  }
  
  const poolAddr = iface.parseLog(log).args.pool;
  console.log(`✅ Pool: ${poolAddr}`);
  
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const poolId = await pool.getPoolId();
  console.log(`🆔 ID: ${poolId}`);
  
  return { poolAddr, poolId };
}

async function seedPool(poolId) {
  console.log("🌱 Seeding pool...");
  
  // Approve tokens
  const bwToken = new ethers.Contract(BWZC_TOKEN, erc20Abi, signer);
  await (await bwToken.approve(BALANCER_VAULT, ethers.MaxUint256)).wait();
  
  const usdcToken = new ethers.Contract(USDC, erc20Abi, signer);
  await (await usdcToken.approve(BALANCER_VAULT, ethers.MaxUint256)).wait();
  
  console.log(`💰 BW: ${ethers.formatEther(BW_AMOUNT)} | USDC: ${ethers.formatUnits(USDC_AMOUNT, 6)}`);
  
  // Direct Vault join (no SCW complexity)
  const vaultAbi = ["function joinPool(bytes32 poolId,address sender,address recipient,(address[] assets,uint256[] maxAmountsIn,bytes userData,bool fromInternalBalance))"];
  const vaultIface = new ethers.Interface(vaultAbi);
  
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256[]"], 
    [1n, [BW_AMOUNT, USDC_AMOUNT]] // INIT join kind=1
  );
  
  const joinData = vaultIface.encodeFunctionData("joinPool", [
    poolId,
    signer.address,
    signer.address,
    [[BWZC_TOKEN, USDC], [BW_AMOUNT, USDC_AMOUNT], userData, false]
  ]);
  
  const tx = await signer.sendTransaction({
    to: BALANCER_VAULT,
    data: joinData,
    gasLimit: 800000
  });
  
  await tx.wait();
  console.log(`✅ Seeded: https://etherscan.io/tx/${tx.hash}`);
}

async function run() {
  try {
    const pool = await createPool();
    await seedPool(pool.poolId);
    console.log("🎯 94% USDC SKEW COMPLETE");
  } catch (error) {
    console.error("❌ FAILED:", error.message);
  }
}

app.get("/health", (_, res) => res.json({ status: "live" }));

const server = app.listen(PORT, () => {
  console.log(`🚀 Live on port ${PORT}`);
  
  // Auto-run
  setTimeout(run, 2000);
});
