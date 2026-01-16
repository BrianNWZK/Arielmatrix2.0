// main.js
// Balancer V2 Weighted Pool (2-token) genesis seeding script

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

// ===== Balancer Constants =====
const BALANCER_VAULT = ethers.getAddress("0xba12222222228d8ba445958a75a0704d566bf2c8");
// Based on Balancer docs and your transaction history, let's use the correct factory
const WEIGHTED_POOL2_FACTORY = ethers.getAddress("0x8e9aa87e45e92bad84d5f8dd5b9431736d4bfb3e"); // WeightedPool2TokensFactory
const BWZC_TOKEN = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2");
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

// ===== Config =====
const TARGET_BWAEZI_PRICE = 94;
const PAIRED_VALUE_USD = 2;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const SWAP_FEE = 0.003; // 0.3%

// ===== ABIs =====
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];

// Based on actual WeightedPool2TokensFactory contract on Etherscan
const factoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name, string symbol, address tokenX, address tokenY, uint256 weightX, uint256 weightY, uint256 swapFeePercentage, address owner) external returns (address)",
  "function getVault() view returns (address)"
];

const vaultAbi = [
  "function joinPool(bytes32 poolId, address sender, address recipient, (address[] assets, uint256[] maxAmountsIn, bytes userData, bool fromInternalBalance) request) external payable",
  "function getPoolTokens(bytes32 poolId) external view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)"
];

const poolAbi = [
  "function getPoolId() view returns (bytes32)",
  "function getVault() view returns (address)",
  "function totalSupply() view returns (uint256)"
];

// ===== Helper Functions =====
async function debugTransaction(txHash) {
  try {
    const tx = await provider.getTransaction(txHash);
    const receipt = await provider.getTransactionReceipt(txHash);
    
    console.log("\n🔍 Transaction Debug:");
    console.log("   Hash:", txHash);
    console.log("   Block:", receipt.blockNumber);
    console.log("   Status:", receipt.status === 1 ? "Success" : "Failed");
    console.log("   Gas used:", receipt.gasUsed.toString());
    console.log("   Logs count:", receipt.logs.length);
    
    if (receipt.logs.length > 0) {
      console.log("   Logs:");
      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        console.log(`     [${i}] Address: ${log.address}`);
        console.log(`         Topics: ${JSON.stringify(log.topics)}`);
        console.log(`         Data: ${log.data}`);
      }
    } else {
      console.log("   No logs emitted");
    }
    
    // Decode the input data if possible
    if (tx.data && tx.data.length > 10) {
      try {
        const factoryInterface = new ethers.Interface(factoryAbi);
        const decoded = factoryInterface.parseTransaction({ data: tx.data });
        console.log("   Decoded function:", decoded.name);
        console.log("   Decoded args:", decoded.args);
      } catch (e) {
        console.log("   Could not decode transaction data");
      }
    }
    
    return { tx, receipt };
  } catch (error) {
    console.log("Debug error:", error.message);
    return null;
  }
}

async function checkFactoryStatus() {
  console.log("\n🔍 Checking factory status...");
  
  try {
    const code = await provider.getCode(WEIGHTED_POOL2_FACTORY);
    console.log(`   Factory: ${WEIGHTED_POOL2_FACTORY}`);
    console.log(`   Has code: ${code !== "0x"} (${code.length} bytes)`);
    
    if (code === "0x") {
      console.log("❌ Factory contract doesn't exist!");
      return false;
    }
    
    // Check if it's the right factory
    const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, provider);
    
    try {
      const vault = await factory.getVault();
      console.log(`   Factory vault: ${vault}`);
      console.log(`   Matches expected: ${vault === BALANCER_VAULT}`);
    } catch (error) {
      console.log(`   Could not call getVault(): ${error.message}`);
    }
    
    return true;
  } catch (error) {
    console.log("Factory check error:", error.message);
    return false;
  }
}

async function createWeightedPool(name, symbol, tokenA, tokenB) {
  console.log(`\n🎯 Creating ${name}...`);
  
  // Sort tokens
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() 
    ? [tokenA, tokenB] 
    : [tokenB, tokenA];
  
  const weight0 = token0 === BWZC_TOKEN ? WEIGHT_BW : WEIGHT_PAIRED;
  const weight1 = token0 === BWZC_TOKEN ? WEIGHT_PAIRED : WEIGHT_BW;
  
  console.log(`   Token0: ${token0} (weight: ${weight0})`);
  console.log(`   Token1: ${token1} (weight: ${weight1})`);
  console.log(`   Swap fee: ${SWAP_FEE * 100}%`);
  console.log(`   Owner: ${SCW_ADDRESS}`);

  const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, signer);
  
  try {
    console.log("🚀 Sending creation transaction...");
    
    // First, let's try a static call to see if it would work
    try {
      console.log("🧪 Testing with static call...");
      const result = await factory.create.staticCall(
        name,
        symbol,
        token0,
        token1,
        ethers.parseUnits(weight0.toString(), 18),
        ethers.parseUnits(weight1.toString(), 18),
        ethers.parseUnits(SWAP_FEE.toString(), 18),
        SCW_ADDRESS,
        { gasLimit: 5000000 }
      );
      console.log(`✅ Static call successful, would create pool at: ${result}`);
    } catch (staticError) {
      console.log(`⚠️  Static call failed: ${staticError.message}`);
    }
    
    // Actually send the transaction
    const tx = await factory.create(
      name,
      symbol,
      token0,
      token1,
      ethers.parseUnits(weight0.toString(), 18),
      ethers.parseUnits(weight1.toString(), 18),
      ethers.parseUnits(SWAP_FEE.toString(), 18),
      SCW_ADDRESS,
      { gasLimit: 5000000 }
    );
    
    console.log(`📤 TX sent: https://etherscan.io/tx/${tx.hash}`);
    console.log("⏳ Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
    console.log("Status:", receipt.status === 1 ? "Success" : "Failed");
    
    // Debug the transaction
    await debugTransaction(tx.hash);
    
    if (receipt.status === 0) {
      console.log("❌ Transaction reverted");
      return null;
    }
    
    // Look for PoolCreated event
    const eventTopic = ethers.id("PoolCreated(address)");
    let poolAddress = null;
    
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      if (log.topics[0] === eventTopic && log.topics.length >= 2) {
        poolAddress = ethers.getAddress("0x" + log.topics[1].slice(-40));
        console.log(`🎉 Found PoolCreated event! Pool address: ${poolAddress}`);
        break;
      }
    }
    
    if (!poolAddress) {
      console.log("⚠️  No PoolCreated event found");
      
      // Check if pool was created anyway by looking at contract creations
      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        if (log.address === WEIGHTED_POOL2_FACTORY && log.topics.length === 0) {
          console.log(`   Found contract creation log from factory`);
          // This might indicate a pool was created but event wasn't emitted
        }
      }
      
      // Try to find the pool by other means
      console.log("🔍 Trying to find created pool...");
      
      // Check recent PoolCreated events from the factory
      try {
        const filter = factory.filters.PoolCreated();
        const currentBlock = await provider.getBlockNumber();
        const events = await factory.queryFilter(filter, currentBlock - 10, currentBlock);
        
        if (events.length > 0) {
          console.log(`   Found ${events.length} PoolCreated events in recent blocks`);
          for (const event of events) {
            if (event.args && event.args.pool) {
              const foundPool = event.args.pool;
              console.log(`   Found pool: ${foundPool}`);
              
              // Check if this pool has our tokens
              try {
                const pool = new ethers.Contract(foundPool, poolAbi, provider);
                const poolId = await pool.getPoolId();
                const vault = new ethers.Contract(BALANCER_VAULT, vaultAbi, provider);
                const [tokens] = await vault.getPoolTokens(poolId);
                
                if (tokens.includes(BWZC_TOKEN) && (tokens.includes(USDC) || tokens.includes(WETH))) {
                  console.log(`✅ Found our pool! Address: ${foundPool}`);
                  console.log(`   Pool ID: ${poolId}`);
                  return { poolAddr: foundPool, poolId };
                }
              } catch (e) {
                // Ignore errors
              }
            }
          }
        }
      } catch (error) {
        console.log("   Error querying events:", error.message);
      }
      
      return null;
    }
    
    // Verify pool exists
    try {
      const poolCode = await provider.getCode(poolAddress);
      if (poolCode !== "0x") {
        console.log(`✅ Pool contract exists at ${poolAddress}`);
        
        const pool = new ethers.Contract(poolAddress, poolAbi, provider);
        const poolId = await pool.getPoolId();
        console.log(`📋 Pool ID: ${poolId}`);
        
        return { poolAddr: poolAddress, poolId };
      } else {
        console.log(`❌ No contract code at ${poolAddress}`);
      }
    } catch (error) {
      console.log(`⚠️  Error verifying pool: ${error.message}`);
    }
    
    return { poolAddr: poolAddress, poolId: null };
    
  } catch (error) {
    console.error(`💥 Creation error: ${error.message}`);
    console.error("Error details:", error);
    return null;
  }
}

async function seedWeightedPool(poolId, tokenA, tokenB, amountA, amountB, label, poolAddr) {
  if (!poolId || !poolAddr) {
    console.log(`⚠️  Skipping seeding for ${label} - no pool ID or address`);
    return;
  }

  console.log(`\n🌱 Seeding ${label}...`);
  console.log(`   Pool: ${poolAddr}`);
  console.log(`   Pool ID: ${poolId}`);

  const [asset0, asset1] = tokenA.toLowerCase() < tokenB.toLowerCase() 
    ? [tokenA, tokenB] 
    : [tokenB, tokenA];
  
  const amounts = asset0 === tokenA ? [amountA, amountB] : [amountB, amountA];

  console.log(`   Amounts: ${ethers.formatEther(amounts[0])} ${asset0 === BWZC_TOKEN ? 'BWZC' : 'token0'}, ${ethers.formatEther(amounts[1])} ${asset1 === BWZC_TOKEN ? 'BWZC' : 'token1'}`);

  const vaultIface = new ethers.Interface(vaultAbi);
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256[]"], [0n, amounts]);

  const request = {
    assets: [asset0, asset1],
    maxAmountsIn: amounts,
    userData: userData,
    fromInternalBalance: false
  };

  const joinData = vaultIface.encodeFunctionData("joinPool", [poolId, SCW_ADDRESS, SCW_ADDRESS, request]);
  const execData = new ethers.Interface(scwAbi).encodeFunctionData("execute", [BALANCER_VAULT, 0n, joinData]);

  try {
    console.log("🚀 Sending seeding transaction...");
    const tx = await signer.sendTransaction({ 
      to: SCW_ADDRESS, 
      data: execData, 
      gasLimit: 5000000
    });
    
    console.log(`📤 Seeding TX: https://etherscan.io/tx/${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 0) {
      console.log(`❌ Seeding transaction reverted`);
    } else {
      console.log(`✅ Successfully seeded ${label}`);
      
      // Verify the pool has liquidity
      try {
        const vault = new ethers.Contract(BALANCER_VAULT, vaultAbi, provider);
        const [tokens, balances] = await vault.getPoolTokens(poolId);
        console.log(`📊 Pool balances after seeding:`);
        for (let i = 0; i < tokens.length; i++) {
          const tokenName = tokens[i] === BWZC_TOKEN ? 'BWZC' : 
                           tokens[i] === USDC ? 'USDC' : 
                           tokens[i] === WETH ? 'WETH' : tokens[i];
          console.log(`   ${tokenName}: ${ethers.formatEther(balances[i])}`);
        }
      } catch (e) {
        console.log("Could not verify pool balances:", e.message);
      }
    }
  } catch (error) {
    console.error(`❌ Seeding error: ${error.message}`);
  }
}

async function checkExistingPools() {
  console.log("\n🔍 Checking for existing pools...");
  
  try {
    const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, provider);
    const currentBlock = await provider.getBlockNumber();
    
    // Look for recent PoolCreated events
    const filter = factory.filters.PoolCreated();
    const events = await factory.queryFilter(filter, currentBlock - 10000, currentBlock);
    
    console.log(`   Found ${events.length} PoolCreated events in last 10k blocks`);
    
    const ourPools = [];
    for (const event of events) {
      if (event.args && event.args.pool) {
        const poolAddr = event.args.pool;
        try {
          const pool = new ethers.Contract(poolAddr, poolAbi, provider);
          const poolId = await pool.getPoolId();
          const vault = new ethers.Contract(BALANCER_VAULT, vaultAbi, provider);
          const [tokens] = await vault.getPoolTokens(poolId);
          
          if (tokens.includes(BWZC_TOKEN)) {
            console.log(`✅ Found existing BWZC pool: ${poolAddr}`);
            console.log(`   Pool ID: ${poolId}`);
            console.log(`   Tokens: ${tokens}`);
            ourPools.push({ poolAddr, poolId, tokens });
          }
        } catch (e) {
          // Skip if we can't query
        }
      }
    }
    
    return ourPools;
  } catch (error) {
    console.log("Error checking existing pools:", error.message);
    return [];
  }
}

async function runSeeding() {
  console.log("\n" + "=".repeat(60));
  console.log("🏁 STARTING BALANCER POOL CREATION & SEEDING");
  console.log("=".repeat(60));
  
  // Check factory
  await checkFactoryStatus();
  
  // Check for existing pools
  const existingPools = await checkExistingPools();
  if (existingPools.length > 0) {
    console.log(`\n📋 Found ${existingPools.length} existing BWZC pool(s)`);
    
    // Check if we have both USDC and WETH pools
    const hasUSDC = existingPools.some(p => p.tokens.includes(USDC));
    const hasWETH = existingPools.some(p => p.tokens.includes(WETH));
    
    if (hasUSDC && hasWETH) {
      console.log("✅ Both USDC and WETH pools already exist!");
      console.log("Proceeding to seed existing pools...");
      
      // Seed existing pools
      for (const pool of existingPools) {
        if (pool.tokens.includes(USDC)) {
          console.log(`\n🌱 Seeding existing USDC pool...`);
          // Calculate amounts
          const EFFECTIVE_RATIO = TARGET_BWAEZI_PRICE * (WEIGHT_PAIRED / WEIGHT_BW);
          const BW_AMOUNT_BASE = PAIRED_VALUE_USD / EFFECTIVE_RATIO;
          const usdcAmount = ethers.parseUnits(PAIRED_VALUE_USD.toString(), 6);
          const bwAmount = ethers.parseUnits(BW_AMOUNT_BASE.toFixed(18), 18);
          
          await seedWeightedPool(pool.poolId, BWZC_TOKEN, USDC, bwAmount, usdcAmount, "Existing USDC pool", pool.poolAddr);
        }
        
        if (pool.tokens.includes(WETH)) {
          console.log(`\n🌱 Seeding existing WETH pool...`);
          const EFFECTIVE_RATIO = TARGET_BWAEZI_PRICE * (WEIGHT_PAIRED / WEIGHT_BW);
          const BW_AMOUNT_BASE = PAIRED_VALUE_USD / EFFECTIVE_RATIO;
          const wethAmount = ethers.parseUnits((PAIRED_VALUE_USD / 3300).toFixed(18), 18);
          const bwAmount = ethers.parseUnits(BW_AMOUNT_BASE.toFixed(18), 18);
          
          await seedWeightedPool(pool.poolId, BWZC_TOKEN, WETH, bwAmount, wethAmount, "Existing WETH pool", pool.poolAddr);
        }
      }
      
      return;
    }
  }
  
  // Calculate amounts
  const EFFECTIVE_RATIO = TARGET_BWAEZI_PRICE * (WEIGHT_PAIRED / WEIGHT_BW);
  const BW_AMOUNT_BASE = PAIRED_VALUE_USD / EFFECTIVE_RATIO;
  
  const usdcAmount = ethers.parseUnits(PAIRED_VALUE_USD.toString(), 6);
  const wethAmount = ethers.parseUnits((PAIRED_VALUE_USD / 3300).toFixed(18), 18);
  const bwAmount = ethers.parseUnits(BW_AMOUNT_BASE.toFixed(18), 18);
  
  console.log(`\n📊 Configuration:`);
  console.log(`   Target BWAEZI price: $${TARGET_BWAEZI_PRICE}`);
  console.log(`   BW weight: ${WEIGHT_BW * 100}%`);
  console.log(`   Paired weight: ${WEIGHT_PAIRED * 100}%`);
  console.log(`   Swap fee: ${SWAP_FEE * 100}%`);
  console.log(`   BW amount: ${ethers.formatEther(bwAmount)} BWZC`);
  console.log(`   USDC amount: ${ethers.formatUnits(usdcAmount, 6)} USDC`);
  console.log(`   WETH amount: ${ethers.formatEther(wethAmount)} WETH`);
  
  // Create USDC pool
  console.log("\n" + "-".repeat(40));
  console.log("💰 CREATING USDC POOL");
  console.log("-".repeat(40));
  const usdcPool = await createWeightedPool("bwzC-USDC-94", "bwzC-USDC94", BWZC_TOKEN, USDC);
  
  if (usdcPool && usdcPool.poolId) {
    console.log("\n🌱 SEEDING USDC POOL");
    await seedWeightedPool(usdcPool.poolId, BWZC_TOKEN, USDC, bwAmount, usdcAmount, "USDC pool", usdcPool.poolAddr);
  } else {
    console.log("❌ USDC pool creation failed");
  }
  
  // Create WETH pool
  console.log("\n" + "-".repeat(40));
  console.log("🦄 CREATING WETH POOL");
  console.log("-".repeat(40));
  const wethPool = await createWeightedPool("bwzC-WETH-94", "bwzC-WETH94", BWZC_TOKEN, WETH);
  
  if (wethPool && wethPool.poolId) {
    console.log("\n🌱 SEEDING WETH POOL");
    await seedWeightedPool(wethPool.poolId, BWZC_TOKEN, WETH, bwAmount, wethAmount, "WETH pool", wethPool.poolAddr);
  } else {
    console.log("❌ WETH pool creation failed");
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🏁 PROCESS COMPLETE");
  console.log("=".repeat(60));
}

// ===== Express Server =====
let hasRun = false;
app.get("/health", (_, res) => res.json({ status: "live", hasRun }));

app.get("/debug/tx/:hash", async (req, res) => {
  try {
    const debug = await debugTransaction(req.params.hash);
    if (debug) {
      res.json({
        tx: {
          hash: debug.tx.hash,
          from: debug.tx.from,
          to: debug.tx.to,
          data: debug.tx.data
        },
        receipt: {
          blockNumber: debug.receipt.blockNumber,
          status: debug.receipt.status,
          gasUsed: debug.receipt.gasUsed.toString(),
          logsCount: debug.receipt.logs.length,
          logs: debug.receipt.logs.map(log => ({
            address: log.address,
            topics: log.topics,
            data: log.data
          }))
        }
      });
    } else {
      res.status(404).json({ error: "Transaction not found" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/retry", async (_, res) => {
  if (hasRun) {
    res.json({ error: "Already ran once" });
    return;
  }
  
  try {
    await runSeeding();
    hasRun = true;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(PORT, async () => {
  console.log(`🚀 Server live on port ${PORT}`);
  console.log(`📡 RPC: ${RPC_URL}`);
  console.log(`👛 Signer: ${await signer.getAddress()}`);
  console.log(`🏦 SCW: ${SCW_ADDRESS}`);

  if (!hasRun) {
    hasRun = true;
    setTimeout(async () => {
      console.log("\n⏱️  Auto-running in 3 seconds...");
      setTimeout(async () => {
        try {
          await runSeeding();
          console.log("\n✅ Process completed!");
        } catch (error) {
          console.error("\n💥 Process failed:", error.message);
        }
      }, 3000);
    }, 1000);
  }
});

export { createWeightedPool, seedWeightedPool };
