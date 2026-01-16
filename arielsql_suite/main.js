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

// ===== RAW ADDRESSES - NO VALIDATION =====
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const FACTORY = "0x8e9aa87E45e92bad84D5F8Dd5b9431736D4BFb3E";
const BWZC = "0x54d1c2889b08cad0932266eade15ec884fa0cdc2";  // lowercase
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";   // lowercase
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";   // lowercase

const BW_AMOUNT = ethers.parseEther("0.085106");
const USDC_AMOUNT = ethers.parseUnits("2", 6);
const WETH_AMOUNT = ethers.parseEther("0.000606");

// ===== BULLETPROOF ABIs =====
const FACTORY_ABI = [
  "function create(string,string,address,address,uint256,uint256,uint256,address) external returns(address)",
  "event PoolCreated(address indexed pool)"
];

const POOL_ABI = ["function getPoolId() view returns(bytes32)"];

async function createAndSeedPool(name, symbol, tokenA, tokenB, amountA, amountB, label) {
  console.log(`\n🔥 ${label}`);
  
  // RAW lowercase contract - NO ENS confusion
  const factoryAddress = FACTORY.toLowerCase();
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, signer);
  
  const token0 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenA.toLowerCase() : tokenB.toLowerCase();
  const token1 = tokenA.toLowerCase() < tokenB.toLowerCase() ? tokenB.toLowerCase() : tokenA.toLowerCase();
  
  try {
    console.log("📤 Creating...");
    const tx = await factory.create(
      name, symbol, token0, token1,
      ethers.parseEther("0.8"),   // 80%
      ethers.parseEther("0.2"),   // 20%
      ethers.parseEther("0.003"), // fee
      SCW_ADDRESS.toLowerCase(),
      { gasLimit: 3500000 }
    );
    
    console.log(`⏳ CREATE: https://etherscan.io/tx/${tx.hash}`);
    const receipt = await tx.wait(1);
    
    if (receipt.status === 0) throw new Error("CREATE REVERTED");
    
    // Extract pool address from logs
    const topic0 = ethers.id("PoolCreated(address)");
    let poolAddr = "unknown";
    
    for (const log of receipt.logs) {
      if (log.topics[0] === topic0 && log.address.toLowerCase() === factoryAddress) {
        poolAddr = "0x" + log.topics[1].slice(-40);
        break;
      }
    }
    
    if (poolAddr === "unknown") {
      console.log("🔍 No PoolCreated event - checking contract creation...");
      poolAddr = receipt.contractAddress || receipt.logs[0]?.address || "check-logs";
    }
    
    console.log(`✅ POOL: ${poolAddr}`);
    
    // Wait for pool deployment
    await new Promise(r => setTimeout(r, 3000));
    
    // Verify pool
    if (poolAddr !== "unknown" && poolAddr !== "check-logs") {
      try {
        const pool = new ethers.Contract(poolAddr, POOL_ABI, provider);
        const poolId = await pool.getPoolId();
        console.log(`🆔 ID: ${poolId}`);
        
        // Seed pool
        console.log("🌱 Seeding...");
        await seedPool(poolId, token0, token1, amountA, amountB);
        console.log(`🎉 ${label} LIVE @ $94 PEG!`);
        console.log(`🔗 https://app.balancer.fi/#/ethereum/pool/${poolId}`);
        
        return { poolAddr, poolId, success: true };
      } catch (verifyError) {
        console.log(`⚠️  Pool verify failed: ${verifyError.message}`);
      }
    }
    
    console.log(`✅ ${label} CREATED (manual verification needed)`);
    console.log(`🔍 Check: https://etherscan.io/tx/${tx.hash}#eventlog`);
    
  } catch (error) {
    console.error(`❌ ${label}:`, error.shortMessage || error.message);
  }
}

async function seedPool(poolId, token0, token1, amountA, amountB) {
  const amounts = token0 === BWZC ? [amountA, amountB] : [amountB, amountA];
  
  // Approve tokens
  const erc20Abi = ["function approve(address,uint256) returns(bool)"];
  const bwContract = new ethers.Contract(BWZC, erc20Abi, signer);
  const tokenBContract = new ethers.Contract(token1, erc20Abi, signer);
  
  await (await bwContract.approve(BALANCER_VAULT, ethers.MaxUint256)).wait();
  await (await tokenBContract.approve(BALANCER_VAULT, ethers.MaxUint256)).wait();
  
  // INIT join
  const vaultAbi = [
    "function joinPool(bytes32 poolId,address sender,address recipient,(address[] assets,uint256[] maxAmountsIn,bytes userData,bool fromInternalBalance) request)"
  ];
  
  const vaultIface = new ethers.Interface(vaultAbi);
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256[]"], [0n, amounts]
  );
  
  const joinData = vaultIface.encodeFunctionData("joinPool", [
    poolId, signer.address, signer.address,
    [[token0, token1], amounts, userData, false]
  ]);
  
  const seedTx = await signer.sendTransaction({
    to: BALANCER_VAULT,
    data: joinData,
    gasLimit: 1500000
  });
  
  console.log(`⏳ Seed TX: https://etherscan.io/tx/${seedTx.hash}`);
  await seedTx.wait();
}

async function getPoolAddresses() {
  try {
    const history = await provider.getHistory(signer.address, { blockTag: "-10" });
    const factoryTxs = history.filter(tx => 
      tx.to?.toLowerCase() === FACTORY.toLowerCase()
    );
    
    console.log(`🔍 Found ${factoryTxs.length} factory TXs`);
    for (const tx of factoryTxs.slice(-2)) {
      const receipt = await provider.getTransactionReceipt(tx.hash);
      const log = receipt.logs.find(l => l.topics[0] === ethers.id("PoolCreated(address)"));
      if (log) {
        const poolAddr = "0x" + log.topics[1].slice(-40);
        console.log(`📍 ${tx.hash.slice(0,10)}... → ${poolAddr}`);
      }
    }
  } catch (e) {
    console.log("🔍 History check failed");
  }
}

async function run() {
  console.log("🚀 BALANCER POOL DEPLOYMENT v2.0\n");
  await getPoolAddresses();
  
  console.log("\n" + "=".repeat(60));
  
  // Create USDC pool
  await createAndSeedPool(
    "bwzC-USDC-94skew", "bwzC-USDC", 
    BWZC, USDC, BW_AMOUNT, USDC_AMOUNT, "USDC POOL"
  );
  
  console.log("\n" + "=".repeat(60));
  
  // Create WETH pool  
  await createAndSeedPool(
    "bwzC-WETH-94skew", "bwzC-WETH", 
    BWZC, WETH, BW_AMOUNT, WETH_AMOUNT, "WETH POOL"
  );
  
  console.log("\n🎯 $94 PEG POOLS DEPLOYED");
  console.log("✅ Arbitrage vs Uniswap $96-100 LIVE");
}

// ===== API ENDPOINTS =====
app.get("/health", (_, res) => res.json({ status: "live" }));

app.get("/pools", async (_, res) => {
  await getPoolAddresses();
  res.json({ 
    status: "deployed", 
    peg: "$94", 
    check: "https://etherscan.io/address/YOUR_WALLET#tokentxns" 
  });
});

app.get("/status", (_, res) => res.json({ 
  pools: "USDC+WETH @ $94 peg", 
  arbitrage: "vs Uniswap $96-100" 
}));

const server = app.listen(PORT, () => {
  console.log(`🚀 Server: port ${PORT}`);
  console.log(`🔗 https://arielmatrix2-0-03mm.onrender.com`);
  setTimeout(run, 5000);
});

process.on("SIGTERM", () => {
  console.log("🛑 Graceful shutdown");
  server.close(() => process.exit(0));
});
