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
const WEIGHTED_POOL2_FACTORY = ethers.getAddress("0x8e9aa87e45e92bad84d5f8dd5b9431736d4bfb3e");
const BWZC_TOKEN = ethers.getAddress("0x54d1c2889b08cad0932266eade15ec884fa0cdc2");
const USDC = ethers.getAddress("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
const WETH = ethers.getAddress("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2");

// ===== Config =====
const TARGET_BWAEZI_PRICE = 94;
const PAIRED_VALUE_USD = 2;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const SWAP_FEE = 0.003;

// ===== ABIs =====
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const factoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name, string symbol, address token0, address token1, uint256 weight0, uint256 weight1, uint256 swapFeePercentage, address owner) external returns (address)",
  "function isPoolFromFactory(address pool) external view returns (bool)"
];
const vaultAbi = [
  "function joinPool(bytes32 poolId, address sender, address recipient, (address[] assets, uint256[] maxAmountsIn, bytes userData, bool fromInternalBalance) request)",
  "function getPoolTokens(bytes32 poolId) external view returns (address[] tokens, uint256[] balances, uint256 lastChangeBlock)"
];
const poolAbi = [
  "function getPoolId() view returns (bytes32)",
  "function getVault() view returns (address)",
  "function totalSupply() view returns (uint256)",
  "function name() view returns (string)",
  "function symbol() view returns (string)"
];

// Debug: Print all event signatures
console.log("📋 Event signatures for debugging:");
console.log("PoolCreated:", ethers.id("PoolCreated(address)"));

// Helper to decode transaction input
async function debugTransaction(txHash) {
  try {
    const tx = await provider.getTransaction(txHash);
    console.log("\n🔍 Transaction debug:");
    console.log("To:", tx.to);
    console.log("From:", tx.from);
    console.log("Value:", tx.value.toString());
    console.log("Gas Limit:", tx.gasLimit.toString());
    
    if (tx.data) {
      console.log("Data length:", tx.data.length);
      // Try to decode with factory ABI
      const factoryInterface = new ethers.Interface(factoryAbi);
      try {
        const decoded = factoryInterface.parseTransaction({ data: tx.data });
        console.log("Decoded call:", decoded.name);
        console.log("Args:", decoded.args);
      } catch (e) {
        console.log("Could not decode with factory ABI");
      }
    }
  } catch (error) {
    console.log("Debug error:", error.message);
  }
}

async function createWeightedPool(name, symbol, tokenA, tokenB) {
  console.log(`\n🎯 Creating ${name}...`);
  
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
  
  // First, try to simulate
  try {
    console.log("🧪 Simulating creation...");
    const simulateResult = await factory.create.staticCall(
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
    console.log("✅ Simulation successful, predicted address:", simulateResult);
  } catch (simError) {
    console.log("❌ Simulation failed:", simError.message);
    console.log("This might indicate invalid parameters or pool already exists");
    
    // Check if pool already exists by checking factory registry
    try {
      const factoryCheck = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, provider);
      // We can't check easily without address, but we can try a different approach
    } catch (e) {
      console.log("Factory check error:", e.message);
    }
  }

  // Actually create
  try {
    console.log("🚀 Sending creation transaction...");
    const tx = await factory.create(
      name,
      symbol,
      token0,
      token1,
      ethers.parseUnits(weight0.toString(), 18),
      ethers.parseUnits(weight1.toString(), 18),
      ethers.parseUnits(SWAP_FEE.toString(), 18),
      SCW_ADDRESS,
      { gasLimit: 10000000 } // Very high gas limit
    );
    
    console.log(`📤 TX sent: https://etherscan.io/tx/${tx.hash}`);
    
    // Debug the transaction
    await debugTransaction(tx.hash);
    
    console.log("⏳ Waiting for confirmation...");
    const receipt = await tx.wait();
    
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
    console.log("Status:", receipt.status === 1 ? "Success" : "Failed");
    
    if (receipt.status === 0) {
      console.log("❌ Transaction reverted");
      // Try to get revert reason
      try {
        const txObj = await provider.getTransaction(tx.hash);
        const code = await provider.call(txObj);
        console.log("Revert reason (raw):", code);
      } catch (e) {
        console.log("Could not extract revert reason");
      }
      return null;
    }
    
    // Check logs
    console.log(`Logs count: ${receipt.logs.length}`);
    
    // Look for PoolCreated event
    const eventTopic = ethers.id("PoolCreated(address)");
    console.log("Looking for event topic:", eventTopic);
    
    let poolAddress = null;
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      console.log(`Log ${i}: address=${log.address}, topics=${JSON.stringify(log.topics)}`);
      
      if (log.topics[0] === eventTopic) {
        poolAddress = ethers.getAddress("0x" + log.topics[1].slice(-40));
        console.log(`🎉 Found PoolCreated event! Pool address: ${poolAddress}`);
        break;
      }
    }
    
    if (!poolAddress) {
      console.log("⚠️ No PoolCreated event found. Checking if pool was created anyway...");
      
      // Try to find any contract creation in the receipt
      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        if (log.topics.length === 0) {
          // This might be a contract creation log
          console.log(`Log ${i} has no topics, might be contract creation`);
        }
      }
      
      // Check the factory contract for any new pools
      console.log("Checking factory contract events directly...");
      const filter = factory.filters.PoolCreated();
      const events = await factory.queryFilter(filter, receipt.blockNumber - 1, receipt.blockNumber + 1);
      console.log(`Found ${events.length} PoolCreated events in recent blocks`);
      
      for (const event of events) {
        console.log("Event:", event.args);
        if (event.args && event.args.pool) {
          poolAddress = event.args.pool;
          console.log(`Found pool via event query: ${poolAddress}`);
          break;
        }
      }
    }
    
    if (poolAddress) {
      // Verify pool exists
      console.log(`Verifying pool at ${poolAddress}...`);
      try {
        const pool = new ethers.Contract(poolAddress, poolAbi, provider);
        const poolName = await pool.name();
        const poolSymbol = await pool.symbol();
        const poolId = await pool.getPoolId();
        
        console.log(`✅ Pool verified:`);
        console.log(`   Name: ${poolName}`);
        console.log(`   Symbol: ${poolSymbol}`);
        console.log(`   Pool ID: ${poolId}`);
        console.log(`   Balancer URL: https://app.balancer.fi/#/ethereum/pool/${poolId}`);
        
        return { poolAddr: poolAddress, poolId };
      } catch (error) {
        console.log(`⚠️ Could not verify pool: ${error.message}`);
        // Return anyway since we found the address
        return { poolAddr: poolAddress, poolId: null };
      }
    }
    
    console.log("❌ No pool address found");
    return null;
    
  } catch (error) {
    console.error(`💥 Creation error: ${error.message}`);
    console.error("Full error:", error);
    return null;
  }
}

async function seedWeightedPool(poolId, tokenA, tokenB, amountA, amountB, label, poolAddr) {
  if (!poolId || !poolAddr) {
    console.log(`⚠️ Skipping seeding for ${label} - no pool ID or address`);
    return;
  }

  console.log(`\n🌱 Seeding ${label}...`);
  console.log(`   Pool: ${poolAddr}`);
  console.log(`   Pool ID: ${poolId}`);

  const [asset0, asset1] = tokenA.toLowerCase() < tokenB.toLowerCase() 
    ? [tokenA, tokenB] 
    : [tokenB, tokenA];
  
  const amounts = asset0 === tokenA ? [amountA, amountB] : [amountB, amountA];

  console.log(`   Amounts: ${ethers.formatEther(amounts[0])} of ${asset0}, ${ethers.formatEther(amounts[1])} of ${asset1}`);

  const vaultIface = new ethers.Interface(vaultAbi);
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256[]"], [0n, amounts]);

  const request = [[asset0, asset1], amounts, userData, false];

  const joinData = vaultIface.encodeFunctionData("joinPool", [poolId, SCW_ADDRESS, SCW_ADDRESS, request]);
  const execData = new ethers.Interface(scwAbi).encodeFunctionData("execute", [BALANCER_VAULT, 0n, joinData]);

  try {
    console.log("🚀 Sending seeding transaction...");
    const tx = await signer.sendTransaction({ 
      to: SCW_ADDRESS, 
      data: execData, 
      gasLimit: 3000000
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
          console.log(`   ${tokens[i]}: ${ethers.formatEther(balances[i])}`);
        }
      } catch (e) {
        console.log("Could not verify pool balances");
      }
    }
  } catch (error) {
    console.error(`❌ Seeding error: ${error.message}`);
  }
}

async function checkExistingPools() {
  console.log("\n🔍 Checking for existing pools...");
  
  // Check factory for existing pools owned by SCW_ADDRESS
  const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, provider);
  
  // Get recent PoolCreated events
  const currentBlock = await provider.getBlockNumber();
  const filter = factory.filters.PoolCreated();
  
  try {
    const events = await factory.queryFilter(filter, currentBlock - 10000, currentBlock);
    console.log(`Found ${events.length} PoolCreated events in last 10k blocks`);
    
    const ourPools = [];
    for (const event of events) {
      if (event.args && event.args.pool) {
        const poolAddr = event.args.pool;
        try {
          const pool = new ethers.Contract(poolAddr, poolAbi, provider);
          // Check if it contains BWZC_TOKEN
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
  
  // First check for existing pools
  const existingPools = await checkExistingPools();
  
  if (existingPools.length > 0) {
    console.log(`\n📋 Found ${existingPools.length} existing BWZC pool(s)`);
    
    // Check if we have both USDC and WETH pools
    const hasUSDC = existingPools.some(p => p.tokens.includes(USDC));
    const hasWETH = existingPools.some(p => p.tokens.includes(WETH));
    
    if (hasUSDC && hasWETH) {
      console.log("✅ Both USDC and WETH pools already exist!");
      console.log("Skipping creation, proceeding to seeding...");
      
      // TODO: Implement seeding for existing pools
      return;
    }
  }
  
  // Calculate amounts
  const ethPrice = 3300; // Hardcode for now
  const EFFECTIVE_RATIO = TARGET_BWAEZI_PRICE * (WEIGHT_PAIRED / WEIGHT_BW);
  const BW_AMOUNT_BASE = PAIRED_VALUE_USD / EFFECTIVE_RATIO;
  
  const usdcAmount = ethers.parseUnits(PAIRED_VALUE_USD.toString(), 6);
  const wethAmount = ethers.parseUnits((PAIRED_VALUE_USD / ethPrice).toFixed(18), 18);
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
  }
  
  // Create WETH pool
  console.log("\n" + "-".repeat(40));
  console.log("🦄 CREATING WETH POOL");
  console.log("-".repeat(40));
  const wethPool = await createWeightedPool("bwzC-WETH-94", "bwzC-WETH94", BWZC_TOKEN, WETH);
  
  if (wethPool && wethPool.poolId) {
    console.log("\n🌱 SEEDING WETH POOL");
    await seedWeightedPool(wethPool.poolId, BWZC_TOKEN, WETH, bwAmount, wethAmount, "WETH pool", wethPool.poolAddr);
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🏁 PROCESS COMPLETE");
  console.log("=".repeat(60));
  
  // Final check
  const finalPools = await checkExistingPools();
  console.log(`\n📋 Final state: ${finalPools.length} BWZC pool(s) found`);
}

// ===== Express Server =====
let hasRun = false;
app.get("/health", (_, res) => res.json({ status: "live", hasRun }));

app.get("/debug", async (_, res) => {
  try {
    const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, provider);
    const code = await provider.getCode(WEIGHTED_POOL2_FACTORY);
    
    res.json({
      factory: WEIGHTED_POOL2_FACTORY,
      hasCode: code !== "0x",
      codeLength: code.length,
      signer: await signer.getAddress(),
      scw: SCW_ADDRESS,
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

const server = app.listen(PORT, () => {
  console.log(`🚀 Server live on port ${PORT}`);
  console.log(`📡 RPC: ${RPC_URL}`);
  console.log(`👛 Signer: ${signer.address}`);
  console.log(`🏦 SCW: ${SCW_ADDRESS}`);

  if (!hasRun) {
    hasRun = true;
    setTimeout(async () => {
      console.log("\n⏱️ Auto-running in 3 seconds...");
      setTimeout(async () => {
        try {
          await runSeeding();
          console.log("\n✅ Process completed!");
        } catch (error) {
          console.error("\n💥 Process failed:", error.message);
          console.error(error);
        }
      }, 3000);
    }, 1000);
  }
});
