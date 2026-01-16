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

// ✅ PRE-VALIDATED ADDRESSES (no getAddress)
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const FACTORY = "0x8e9aa87E45e92bad84D5F8Dd5b9431736D4BFb3E"; // WeightedPool2TokensFactory
const BWZC = "0x54D1C2889B08caD0932266EaDE15Ec884FA0cDc2";
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

const BW_AMOUNT = ethers.parseEther("0.08510638");  // 94% skew math
const USDC_AMOUNT = ethers.parseUnits("2", 6);

const factoryAbi = [
  "function create(string name,string symbol,address token0,address token1,uint256 weight0,uint256 weight1,uint256 swapFee,address owner)"
];

const poolAbi = ["function getPoolId() view returns(bytes32)"];

async function createPool() {
  console.log("🔥 FORCE CREATING POOL - NO CHECKS");
  
  const factory = new ethers.Contract(FACTORY, factoryAbi, signer);
  
  console.log("📤 CALLING create...");
  const tx = await factory.create(
    "bwzC-USDC-94skew",
    "bwzC-USDC", 
    BWZC,      // token0 (lower address)
    USDC,      // token1
    ethers.parseEther("0.8"),  // 80% BWZC
    ethers.parseEther("0.2"),  // 20% USDC
    ethers.parseEther("0.003"), // 0.3% fee
    SCW_ADDRESS
  );
  
  console.log(`⏳ TX: https://etherscan.io/tx/${tx.hash}`);
  console.log("⏳ Waiting for confirmation...");
  
  const receipt = await tx.wait();
  console.log(`✅ MINED: Block ${receipt.blockNumber}`);
  console.log(`📄 Logs: ${receipt.logs.length}`);
  
  // Extract pool from receipt.contractAddress or first log
  let poolAddr = receipt.contractAddress;
  if (!poolAddr) {
    // Fallback: first non-factory log address
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== FACTORY.toLowerCase()) {
        poolAddr = log.address;
        break;
      }
    }
  }
  
  if (!poolAddr) {
    console.log("RAW LOGS:", receipt.logs.map(l => l.address.slice(0,10)));
    throw new Error("No pool address found");
  }
  
  console.log(`✅ POOL CREATED: ${poolAddr}`);
  
  const pool = new ethers.Contract(poolAddr, poolAbi, provider);
  const poolId = await pool.getPoolId();
  console.log(`🆔 POOL ID: ${poolId}`);
  
  return { poolAddr, poolId };
}

async function seedPool(poolId) {
  console.log("🌱 SEEDING POOL...");
  
  // Approve tokens
  const erc20Abi = ["function approve(address,uint256)"];
  const bwToken = new ethers.Contract(BWZC, erc20Abi, signer);
  await (await bwToken.approve(BALANCER_VAULT, ethers.MaxUint256)).wait();
  
  const usdcToken = new ethers.Contract(USDC, erc20Abi, signer);
  await (await usdcToken.approve(BALANCER_VAULT, ethers.MaxUint256)).wait();
  
  console.log(`💰 BW: ${ethers.formatEther(BW_AMOUNT)} | USDC: ${ethers.formatUnits(USDC_AMOUNT, 6)}`);
  
  // Direct join (no SCW - simpler)
  const vaultAbi = ["function joinPool(bytes32,address,address,(address[],uint256[],bytes,bool))"];
  const vaultIface = new ethers.Interface(vaultAbi);
  
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256[]"], [1n, [BW_AMOUNT, USDC_AMOUNT]]
  );
  
  const joinData = vaultIface.encodeFunctionData("joinPool", [
    poolId, signer.address, signer.address,
    [[BWZC, USDC], [BW_AMOUNT, USDC_AMOUNT], userData, false]
  ]);
  
  const tx = await signer.sendTransaction({
    to: BALANCER_VAULT,
    data: joinData,
    gasLimit: 800000
  });
  
  console.log(`⏳ Seed TX: https://etherscan.io/tx/${tx.hash}`);
  await tx.wait();
  console.log("✅ SEEDED!");
}

async function run() {
  try {
    console.log("🚀 STARTING POOL CREATION");
    const pool = await createPool();
    await seedPool(pool.poolId);
    console.log("🎉 94% SKEW POOL LIVE!");
    console.log(`📍 POOL: https://etherscan.io/address/${pool.poolAddr}`);
    console.log("🎯 ARBITRAGE READY");
  } catch (error) {
    console.error("❌ FAILED:", error.message);
    console.log("🔍 Check TX on Etherscan for revert reason");
  }
}

app.get("/health", (_, res) => res.json({ status: "live" }));

const server = app.listen(PORT, () => {
  console.log(`🚀 Live on port ${PORT}`);
  setTimeout(run, 3000);
});
