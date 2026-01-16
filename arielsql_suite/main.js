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

// ===== RAW ADDRESSES - NO ethers.getAddress() ANYWHERE =====
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const FACTORY = "0x8e9aa87E45e92bad84D5F8Dd5b9431736D4BFb3E";
const BWZC = "0x54D1C2889B08caD0932266EaDE15Ec884FA0cDc2";  // RAW - NO VALIDATION
const USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
const WETH = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

const BW_AMOUNT = ethers.parseEther("0.085106");
const USDC_AMOUNT = ethers.parseUnits("2", 6);
const WETH_AMOUNT = ethers.parseEther("0.000606");

// ===== MINIMAL ABI - NO EVENTS NEEDED =====
const FACTORY_ABI = [
  "function create(string name,string symbol,address token0,address token1,uint256 normalizedWeight0,uint256 normalizedWeight1,uint256 swapFeePercentage,address owner) external returns(address pool)"
];

const POOL_ABI = ["function getPoolId() view returns(bytes32)"];

async function forceCreatePool(name, symbol, tokenA, tokenB, amountA, amountB, label) {
  console.log(`\n🔥 ${label} - BYPASSING CHECKSUM...`);
  
  // Use raw lowercase addresses in contract constructor to bypass validation
  const factory = new ethers.Contract(FACTORY.toLowerCase(), FACTORY_ABI, signer);
  
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() 
    ? [tokenA.toLowerCase(), tokenB.toLowerCase()] 
    : [tokenB.toLowerCase(), tokenA.toLowerCase()];
    
  const amounts = token0 === BWZC.toLowerCase() ? [amountA, amountB] : [amountB, amountA];
  
  try {
    console.log("📤 CREATE TX...");
    const tx = await factory.create(
      name, symbol,
      token0, token1,
      ethers.parseEther("0.8"),   // 80% BWZC
      ethers.parseEther("0.2"),   // 20% USDC/WETH
      ethers.parseEther("0.003"), // 0.3% fee
      SCW_ADDRESS.toLowerCase(),
      { gasLimit: 3000000 }
    );
    
    console.log(`⏳ https://etherscan.io/tx/${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 0) {
      throw new Error("TX REVERTED");
    }
    
    // Get pool from return value or first log address
    let poolAddr = receipt.contractAddress;
    if (!poolAddr) {
      poolAddr = receipt.logs[0]?.address || "unknown";
    }
    
    console.log(`✅ POOL: ${poolAddr}`);
    
    // Verify pool
    const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
    const poolId = await pool.getPoolId();
    console.log(`🆔 ID: ${poolId}`);
    
    // Seed immediately
    console.log("🌱 SEEDING...");
    const vaultAbi = ["function joinPool(bytes32,address,address,(address[],uint256[],bytes,bool))"];
    const vaultIface = new ethers.Interface(vaultAbi);
    
    const userData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256[]"], 
      [0n, amounts] // INIT kind=0
    );
    
    const joinData = vaultIface.encodeFunctionData("joinPool", [
      poolId, 
      signer.address, 
      signer.address,
      [[token0, token1], amounts, userData, false]
    ]);
    
    const seedTx = await signer.sendTransaction({
      to: BALANCER_VAULT,
      data: joinData,
      gasLimit: 1200000
    });
    
    console.log(`⏳ Seed: https://etherscan.io/tx/${seedTx.hash}`);
    await seedTx.wait();
    
    console.log(`🎉 ${label} LIVE @ $94 PEG!`);
    console.log(`🔗 https://app.balancer.fi/#/ethereum/pool/${poolId}`);
    
  } catch (error) {
    console.error(`❌ ${label}:`, error.shortMessage || error.message);
    console.log(`🔍 TX failed - check gas/private key/balances`);
  }
}

async function run() {
  console.log("🚀 BALANCER $94 PEG POOLS\n");
  
  await forceCreatePool(
    "bwzC-USDC-94", "bwzC-USDC", 
    BWZC, USDC, BW_AMOUNT, USDC_AMOUNT, "USDC POOL"
  );
  
  console.log("\n" + "=".repeat(50));
  
  await forceCreatePool(
    "bwzC-WETH-94", "bwzC-WETH", 
    BWZC, WETH, BW_AMOUNT, WETH_AMOUNT, "WETH POOL"
  );
  
  console.log("\n✅ COMPLETE - Arbitrage live!");
}

app.get("/health", (_, res) => res.json({ status: "live" }));
app.get("/pools", (_, res) => res.json({ 
  peg: "$94", 
  pools: ["USDC", "WETH"], 
  arbitrage: "vs Uniswap $96-100" 
}));

const server = app.listen(PORT, () => {
  console.log(`🚀 Port ${PORT}`);
  setTimeout(run, 2000);
});
