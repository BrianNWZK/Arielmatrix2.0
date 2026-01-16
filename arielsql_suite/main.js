// main.js
// Balancer V2 Weighted Pool genesis seeding script

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
const WEIGHTED_POOL2_FACTORY = ethers.getAddress("0xa5bf2ddf098bb0ef6d120c98217dd6b141c74ee0");
const BWZC_TOKEN = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2");
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

// ===== ABIs =====
const factoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name, string symbol, address[] tokens, uint256[] weights, uint256 swapFeePercentage, bool oracleEnabled, address owner) external returns (address pool)"
];

const vaultAbi = [
  "function getPoolTokens(bytes32 poolId) external view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)",
  "function getPool(bytes32 poolId) view returns (address, uint8)"
];

const poolAbi = [
  "function getPoolId() view returns (bytes32)",
  "function getVault() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

// ===== Find Existing Pools =====
async function findExistingPools() {
  console.log("\n🔍 Searching for existing BWZC pools...");
  
  const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, provider);
  const vault = new ethers.Contract(BALANCER_VAULT, vaultAbi, provider);
  
  // Get recent PoolCreated events
  const currentBlock = await provider.getBlockNumber();
  console.log(`   Current block: ${currentBlock}`);
  
  // Look back 5000 blocks (about 1 day)
  const fromBlock = currentBlock - 5000;
  const filter = factory.filters.PoolCreated();
  
  try {
    const events = await factory.queryFilter(filter, fromBlock, currentBlock);
    console.log(`   Found ${events.length} PoolCreated events in last 5000 blocks`);
    
    const bwzcPools = [];
    
    for (const event of events) {
      if (event.args && event.args.pool) {
        const poolAddr = event.args.pool;
        
        try {
          // Check if it's a Balancer pool
          const pool = new ethers.Contract(poolAddr, poolAbi, provider);
          const poolId = await pool.getPoolId();
          const poolName = await pool.name();
          const poolSymbol = await pool.symbol();
          
          // Get pool tokens from vault
          const [tokens, balances] = await vault.getPoolTokens(poolId);
          
          // Check if pool contains BWZC_TOKEN
          if (tokens.includes(BWZC_TOKEN)) {
            console.log(`\n🎯 Found BWZC pool!`);
            console.log(`   Address: ${poolAddr}`);
            console.log(`   Name: ${poolName}`);
            console.log(`   Symbol: ${poolSymbol}`);
            console.log(`   Pool ID: ${poolId}`);
            console.log(`   Tokens: ${tokens}`);
            console.log(`   Balances:`);
            
            for (let i = 0; i < tokens.length; i++) {
              const tokenName = tokens[i] === BWZC_TOKEN ? 'BWZC' : 
                               tokens[i] === USDC ? 'USDC' : 
                               tokens[i] === WETH ? 'WETH' : tokens[i];
              console.log(`     ${tokenName}: ${ethers.formatEther(balances[i])}`);
            }
            
            // Check if it's USDC or WETH pool
            const isUSDCPool = tokens.includes(USDC);
            const isWETHPool = tokens.includes(WETH);
            
            bwzcPools.push({
              address: poolAddr,
              name: poolName,
              symbol: poolSymbol,
              poolId: poolId,
              tokens: tokens,
              balances: balances,
              type: isUSDCPool ? 'USDC' : (isWETHPool ? 'WETH' : 'UNKNOWN')
            });
          }
        } catch (error) {
          // Skip pools that can't be queried
          continue;
        }
      }
    }
    
    return bwzcPools;
    
  } catch (error) {
    console.log(`   Error searching for pools: ${error.message}`);
    return [];
  }
}

async function findSpecificPool(tokenA, tokenB) {
  console.log(`\n🔍 Searching for pool with ${tokenA === BWZC_TOKEN ? 'BWZC' : '?'} and ${tokenB === USDC ? 'USDC' : tokenB === WETH ? 'WETH' : '?'}...`);
  
  const [token0, token1] = tokenA.toLowerCase() < tokenB.toLowerCase() 
    ? [tokenA, tokenB] 
    : [tokenB, tokenA];
  
  const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, provider);
  const vault = new ethers.Contract(BALANCER_VAULT, vaultAbi, provider);
  
  const currentBlock = await provider.getBlockNumber();
  const fromBlock = currentBlock - 10000; // Look back further
  
  const filter = factory.filters.PoolCreated();
  
  try {
    const events = await factory.queryFilter(filter, fromBlock, currentBlock);
    console.log(`   Checking ${events.length} pools...`);
    
    for (const event of events) {
      if (event.args && event.args.pool) {
        const poolAddr = event.args.pool;
        
        try {
          const pool = new ethers.Contract(poolAddr, poolAbi, provider);
          const poolId = await pool.getPoolId();
          const [tokens] = await vault.getPoolTokens(poolId);
          
          // Check if pool has exactly these two tokens
          if (tokens.length === 2 && 
              tokens.includes(tokenA) && 
              tokens.includes(tokenB)) {
            
            const poolName = await pool.name();
            const poolSymbol = await pool.symbol();
            const [tokens, balances] = await vault.getPoolTokens(poolId);
            
            console.log(`\n✅ Found matching pool!`);
            console.log(`   Address: ${poolAddr}`);
            console.log(`   Name: ${poolName}`);
            console.log(`   Symbol: ${poolSymbol}`);
            console.log(`   Pool ID: ${poolId}`);
            console.log(`   Balancer URL: https://app.balancer.fi/#/ethereum/pool/${poolId}`);
            console.log(`   Etherscan: https://etherscan.io/address/${poolAddr}`);
            console.log(`   Balances:`);
            
            for (let i = 0; i < tokens.length; i++) {
              const tokenName = tokens[i] === BWZC_TOKEN ? 'BWZC' : 
                               tokens[i] === USDC ? 'USDC' : 
                               tokens[i] === WETH ? 'WETH' : tokens[i];
              console.log(`     ${tokenName}: ${ethers.formatEther(balances[i])}`);
            }
            
            return {
              address: poolAddr,
              poolId: poolId,
              name: poolName,
              symbol: poolSymbol,
              tokens: tokens,
              balances: balances
            };
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    console.log(`   No matching pool found`);
    return null;
    
  } catch (error) {
    console.log(`   Error: ${error.message}`);
    return null;
  }
}

async function getAllPoolsFromFactory() {
  console.log("\n📋 Getting all pools from factory...");
  
  const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, provider);
  
  // Get all PoolCreated events from the beginning
  try {
    const filter = factory.filters.PoolCreated();
    const events = await factory.queryFilter(filter, 0, 'latest');
    
    console.log(`   Total pools created by factory: ${events.length}`);
    
    const poolsByOwner = {};
    
    for (const event of events) {
      if (event.args && event.args.pool) {
        const poolAddr = event.args.pool;
        
        try {
          const pool = new ethers.Contract(poolAddr, poolAbi, provider);
          const poolName = await pool.name();
          
          // Check if name contains "bwzC" (case insensitive)
          if (poolName.toLowerCase().includes('bwzc')) {
            console.log(`\n   Found BWZC pool: ${poolName}`);
            console.log(`      Address: ${poolAddr}`);
            
            try {
              const poolId = await pool.getPoolId();
              console.log(`      Pool ID: ${poolId}`);
              console.log(`      Balancer URL: https://app.balancer.fi/#/ethereum/pool/${poolId}`);
            } catch (e) {
              console.log(`      Could not get pool ID`);
            }
          }
        } catch (error) {
          // Skip if we can't query
          continue;
        }
      }
    }
    
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
}

// ===== Main Function =====
async function findAndDisplayPools() {
  console.log("\n" + "=".repeat(60));
  console.log("🔍 FINDING EXISTING BALANCER POOLS");
  console.log("=".repeat(60));
  
  console.log(`\n📊 Configuration:`);
  console.log(`   Factory: ${WEIGHTED_POOL2_FACTORY}`);
  console.log(`   BWZC Token: ${BWZC_TOKEN}`);
  console.log(`   USDC: ${USDC}`);
  console.log(`   WETH: ${WETH}`);
  console.log(`   SCW Owner: ${SCW_ADDRESS}`);
  
  // Method 1: Find all BWZC pools
  const allBwzcPools = await findExistingPools();
  
  if (allBwzcPools.length > 0) {
    console.log(`\n✅ Found ${allBwzcPools.length} BWZC pool(s):`);
    
    for (const pool of allBwzcPools) {
      console.log(`\n   ${pool.type} Pool:`);
      console.log(`      Address: ${pool.address}`);
      console.log(`      Name: ${pool.name}`);
      console.log(`      Symbol: ${pool.symbol}`);
      console.log(`      Pool ID: ${pool.poolId}`);
      console.log(`      Balancer URL: https://app.balancer.fi/#/ethereum/pool/${pool.poolId}`);
      console.log(`      Etherscan: https://etherscan.io/address/${pool.address}`);
    }
  } else {
    console.log("\n❌ No BWZC pools found in recent blocks");
  }
  
  // Method 2: Specifically look for USDC pool
  console.log("\n" + "-".repeat(40));
  console.log("💰 SPECIFICALLY LOOKING FOR USDC POOL");
  console.log("-".repeat(40));
  
  const usdcPool = await findSpecificPool(BWZC_TOKEN, USDC);
  
  // Method 3: Specifically look for WETH pool
  console.log("\n" + "-".repeat(40));
  console.log("🦄 SPECIFICALLY LOOKING FOR WETH POOL");
  console.log("-".repeat(40));
  
  const wethPool = await findSpecificPool(BWZC_TOKEN, WETH);
  
  // Method 4: Get all pools from factory
  console.log("\n" + "-".repeat(40));
  console.log("📋 ALL FACTORY POOLS WITH 'bwzC' IN NAME");
  console.log("-".repeat(40));
  
  await getAllPoolsFromFactory();
  
  console.log("\n" + "=".repeat(60));
  console.log("🏁 SEARCH COMPLETE");
  console.log("=".repeat(60));
  
  // Summary
  console.log("\n📋 SUMMARY:");
  
  if (usdcPool) {
    console.log(`\n✅ USDC/BWZC Pool Found:`);
    console.log(`   Address: ${usdcPool.address}`);
    console.log(`   Pool ID: ${usdcPool.poolId}`);
    console.log(`   Balancer: https://app.balancer.fi/#/ethereum/pool/${usdcPool.poolId}`);
  } else {
    console.log(`\n❌ USDC/BWZC Pool Not Found`);
  }
  
  if (wethPool) {
    console.log(`\n✅ WETH/BWZC Pool Found:`);
    console.log(`   Address: ${wethPool.address}`);
    console.log(`   Pool ID: ${wethPool.poolId}`);
    console.log(`   Balancer: https://app.balancer.fi/#/ethereum/pool/${wethPool.poolId}`);
  } else {
    console.log(`\n❌ WETH/BWZC Pool Not Found`);
  }
  
  if (!usdcPool && !wethPool) {
    console.log(`\n💡 Tips:`);
    console.log(`   1. Pools might have been created earlier (beyond block search range)`);
    console.log(`   2. Check Etherscan for factory events: https://etherscan.io/address/${WEIGHTED_POOL2_FACTORY}#events`);
    console.log(`   3. The pools might have different names or parameters`);
    console.log(`   4. Try increasing the block search range`);
  }
}

// ===== Express Server =====
let hasRun = false;
app.get("/health", (_, res) => res.json({ status: "live", hasRun }));

app.get("/find-pools", async (_, res) => {
  try {
    await findAndDisplayPools();
    res.json({ success: true, message: "Pool search completed" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/pool-info", async (_, res) => {
  try {
    const usdcPool = await findSpecificPool(BWZC_TOKEN, USDC);
    const wethPool = await findSpecificPool(BWZC_TOKEN, WETH);
    
    res.json({
      usdcPool: usdcPool ? {
        address: usdcPool.address,
        poolId: usdcPool.poolId,
        name: usdcPool.name,
        balancerUrl: `https://app.balancer.fi/#/ethereum/pool/${usdcPool.poolId}`,
        etherscanUrl: `https://etherscan.io/address/${usdcPool.address}`
      } : null,
      wethPool: wethPool ? {
        address: wethPool.address,
        poolId: wethPool.poolId,
        name: wethPool.name,
        balancerUrl: `https://app.balancer.fi/#/ethereum/pool/${wethPool.poolId}`,
        etherscanUrl: `https://etherscan.io/address/${wethPool.address}`
      } : null,
      factory: WEIGHTED_POOL2_FACTORY,
      tokens: {
        bwzc: BWZC_TOKEN,
        usdc: USDC,
        weth: WETH
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const server = app.listen(PORT, async () => {
  console.log(`🚀 Server live on port ${PORT}`);
  console.log(`📡 RPC: ${RPC_URL}`);
  console.log(`👛 Signer: ${await signer.getAddress()}`);
  console.log(`🏦 SCW: ${SCW_ADDRESS}`);
  
  console.log(`\n📋 Endpoints:`);
  console.log(`   /health - Health check`);
  console.log(`   /find-pools - Find and display all BWZC pools`);
  console.log(`   /pool-info - Get USDC and WETH pool info (JSON)`);
  
  if (!hasRun) {
    hasRun = true;
    setTimeout(async () => {
      console.log("\n⏱️  Auto-running pool search in 3 seconds...");
      setTimeout(async () => {
        try {
          await findAndDisplayPools();
          console.log("\n✅ Pool search completed!");
          console.log("\n⚠️  Server remains running");
          console.log("    Visit /pool-info for JSON pool data");
          console.log("    Visit /find-pools to search again");
        } catch (error) {
          console.error("\n💥 Search failed:", error.message);
        }
      }, 3000);
    }, 1000);
  }
});
