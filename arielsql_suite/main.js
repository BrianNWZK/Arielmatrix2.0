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
// Try the correct factory address - Based on Balancer docs
const WEIGHTED_POOL2_FACTORY = ethers.getAddress("0x0f3e0c4218b7b0108a3643cfe9d3ec0d4f57c54e"); // WeightedPoolFactory
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

// Correct ABI for Balancer WeightedPoolFactory from verified contract
const factoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name, string symbol, address[] tokens, uint256[] normalizedWeights, address[] rateProviders, uint256 swapFeePercentage, address owner) returns (address)",
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
async function simulateTransaction(txData) {
  try {
    const callResult = await provider.call({
      from: await signer.getAddress(),
      to: WEIGHTED_POOL2_FACTORY,
      data: txData
    });
    console.log("Simulation result:", callResult);
    return callResult;
  } catch (error) {
    console.log("Simulation error:", error.message);
    return null;
  }
}

async function createWeightedPool(name, symbol, tokenA, tokenB) {
  console.log(`\n🎯 Creating ${name}...`);
  
  // Sort tokens according to Balancer convention
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
  
  // Prepare parameters for the actual factory method
  const tokens = [token0, token1];
  const normalizedWeights = [
    ethers.parseUnits(weight0.toString(), 18),
    ethers.parseUnits(weight1.toString(), 18)
  ];
  const rateProviders = [ethers.ZeroAddress, ethers.ZeroAddress]; // Default rate providers
  const swapFeePercentage = ethers.parseUnits(SWAP_FEE.toString(), 18);
  
  // Encode the transaction manually to see what's being sent
  const factoryInterface = new ethers.Interface(factoryAbi);
  const encodedData = factoryInterface.encodeFunctionData("create", [
    name,
    symbol,
    tokens,
    normalizedWeights,
    rateProviders,
    swapFeePercentage,
    SCW_ADDRESS
  ]);
  
  console.log(`   Encoded data length: ${encodedData.length}`);
  console.log(`   Normalized weights: ${normalizedWeights}`);
  console.log(`   Rate providers: ${rateProviders}`);
  
  // Simulate the transaction
  console.log("🧪 Simulating transaction...");
  const simulation = await simulateTransaction(encodedData);
  
  if (simulation && simulation !== "0x") {
    try {
      const decoded = factoryInterface.decodeFunctionResult("create", simulation);
      console.log("✅ Simulation successful, predicted pool:", decoded[0]);
    } catch (e) {
      console.log("⚠️  Simulation returned data but couldn't decode:", simulation);
    }
  } else if (simulation === "0x") {
    console.log("⚠️  Simulation returned empty result (0x)");
  }
  
  // Actually create
  try {
    console.log("🚀 Sending creation transaction...");
    
    // Send transaction directly with higher gas
    const tx = await factory.create(
      name,
      symbol,
      tokens,
      normalizedWeights,
      rateProviders,
      swapFeePercentage,
      SCW_ADDRESS,
      { gasLimit: 5000000 }
    );
    
    console.log(`📤 TX sent: https://etherscan.io/tx/${tx.hash}`);
    console.log("⏳ Waiting for confirmation...");
    
    const receipt = await tx.wait();
    console.log("✅ Transaction confirmed in block:", receipt.blockNumber);
    console.log("Status:", receipt.status === 1 ? "Success" : "Failed");
    
    if (receipt.status === 0) {
      console.log("❌ Transaction reverted");
      return null;
    }
    
    console.log(`📊 Transaction details:`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
    console.log(`   Effective gas price: ${ethers.formatUnits(receipt.gasPrice, 9)} gwei`);
    console.log(`   Logs: ${receipt.logs.length}`);
    
    // Look for PoolCreated event
    const eventTopic = ethers.id("PoolCreated(address)");
    console.log(`🔍 Looking for PoolCreated event (topic: ${eventTopic})...`);
    
    for (let i = 0; i < receipt.logs.length; i++) {
      const log = receipt.logs[i];
      
      if (log.topics[0] === eventTopic && log.topics.length >= 2) {
        const poolAddress = ethers.getAddress("0x" + log.topics[1].slice(-40));
        console.log(`🎉 Found PoolCreated event! Pool address: ${poolAddress}`);
        
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
      }
    }
    
    console.log("⚠️  No PoolCreated event found in logs");
    if (receipt.logs.length > 0) {
      console.log("Available events:");
      for (let i = 0; i < receipt.logs.length; i++) {
        const log = receipt.logs[i];
        console.log(`   [${i}] From: ${log.address}, Topics: ${JSON.stringify(log.topics)}`);
      }
    }
    
    return null;
    
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

async function checkFactoryStatus() {
  console.log("\n🔍 Checking factory status...");
  
  try {
    // Check factory code
    const code = await provider.getCode(WEIGHTED_POOL2_FACTORY);
    console.log(`   Factory address: ${WEIGHTED_POOL2_FACTORY}`);
    console.log(`   Factory code exists: ${code !== "0x"} (${code.length} bytes)`);
    
    if (code === "0x") {
      console.log("❌ Factory contract doesn't exist at this address!");
      return false;
    }
    
    // Try to create factory contract and call a method
    const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, provider);
    
    // Check vault
    try {
      const vault = await factory.getVault();
      console.log(`   Factory vault: ${vault}`);
      console.log(`   Matches expected: ${vault === BALANCER_VAULT}`);
    } catch (error) {
      console.log(`   Could not call getVault(): ${error.message}`);
    }
    
    return true;
  } catch (error) {
    console.log(`   Factory check error: ${error.message}`);
    return false;
  }
}

async function runSeeding() {
  console.log("\n" + "=".repeat(60));
  console.log("🏁 STARTING BALANCER POOL CREATION & SEEDING");
  console.log("=".repeat(60));
  
  // Check factory
  console.log("\n🔍 Checking contract addresses...");
  console.log(`   Vault: ${BALANCER_VAULT}`);
  console.log(`   Factory: ${WEIGHTED_POOL2_FACTORY}`);
  console.log(`   BWZC: ${BWZC_TOKEN}`);
  console.log(`   USDC: ${USDC}`);
  console.log(`   WETH: ${WETH}`);
  
  await checkFactoryStatus();
  
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

app.get("/debug", async (_, res) => {
  try {
    const code = await provider.getCode(WEIGHTED_POOL2_FACTORY);
    const signerAddress = await signer.getAddress();
    const signerBalance = await provider.getBalance(signerAddress);
    
    res.json({
      factory: WEIGHTED_POOL2_FACTORY,
      factoryHasCode: code !== "0x",
      signer: signerAddress,
      signerBalance: ethers.formatEther(signerBalance),
      scw: SCW_ADDRESS,
      tokens: {
        bwzc: BWZC_TOKEN,
        usdc: USDC,
        weth: WETH
      },
      config: {
        targetPrice: TARGET_BWAEZI_PRICE,
        bwWeight: WEIGHT_BW,
        pairedWeight: WEIGHT_PAIRED,
        swapFee: SWAP_FEE
      }
    });
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
