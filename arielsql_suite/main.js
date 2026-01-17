// main.js
// FINAL SOLUTION: Create WETH pool and seed both pools

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

// ===== Config =====
const TARGET_BWAEZI_PRICE = 94;
const PAIRED_VALUE_USD = 2;
const WEIGHT_BW = 0.8;
const WEIGHT_PAIRED = 0.2;
const SWAP_FEE = 0.003;

// Calculate BW amount for $94 peg with skew
const EFFECTIVE_RATIO = TARGET_BWAEZI_PRICE * (WEIGHT_PAIRED / WEIGHT_BW);
const BW_AMOUNT_BASE = PAIRED_VALUE_USD / EFFECTIVE_RATIO;

// ===== ABIs =====
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const factoryAbi = [
  "event PoolCreated(address indexed pool)",
  "function create(string name, string symbol, address[] tokens, uint256[] weights, uint256 swapFeePercentage, bool oracleEnabled, address owner) external returns (address pool)"
];
const vaultAbi = [
  "function joinPool(bytes32 poolId, address sender, address recipient, (address[] assets, uint256[] maxAmountsIn, bytes userData, bool fromInternalBalance) request)"
];
const poolAbi = ["function getPoolId() view returns (bytes32)"];

// ERC20 ABI
const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address, address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)"
];

// ===== Helper Functions =====
function sortTokens(t0, t1) {
  return t0.toLowerCase() < t1.toLowerCase() ? [t0, t1] : [t1, t0];
}

async function checkSCWBalances() {
  console.log("\n🔍 Checking SCW balances and approvals...");
  
  const signerAddress = await signer.getAddress();
  
  const tokens = [
    { address: BWZC_TOKEN, name: "BWZC", decimals: 18, needed: ethers.parseUnits("0.085106382978723402", 18) },
    { address: USDC, name: "USDC", decimals: 6, needed: ethers.parseUnits("2", 6) },
    { address: WETH, name: "WETH", decimals: 18, needed: ethers.parseUnits("0.000607", 18) }
  ];
  
  let hasAllTokens = true;
  let hasAllApprovals = true;
  
  for (const token of tokens) {
    const contract = new ethers.Contract(token.address, erc20Abi, provider);
    
    // Check SCW balance
    const scwBalance = await contract.balanceOf(SCW_ADDRESS);
    const hasBalance = scwBalance >= token.needed;
    
    // Check SCW allowance to Vault
    const scwAllowance = await contract.allowance(SCW_ADDRESS, BALANCER_VAULT);
    const hasAllowance = scwAllowance >= token.needed;
    
    console.log(`\n   ${token.name}:`);
    console.log(`     SCW Balance: ${ethers.formatUnits(scwBalance, token.decimals)}`);
    console.log(`     Needed: ${ethers.formatUnits(token.needed, token.decimals)}`);
    console.log(`     Has Balance: ${hasBalance ? "✅" : "❌"}`);
    console.log(`     SCW → Vault Allowance: ${ethers.formatUnits(scwAllowance, token.decimals)}`);
    console.log(`     Has Allowance: ${hasAllowance ? "✅" : "❌"}`);
    
    if (!hasBalance) hasAllTokens = false;
    if (!hasAllowance) hasAllApprovals = false;
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   SCW has all tokens: ${hasAllTokens ? "✅" : "❌"}`);
  console.log(`   SCW has all approvals: ${hasAllApprovals ? "✅" : "❌"}`);
  
  return { hasAllTokens, hasAllApprovals };
}

async function approveIfNeeded(tokenAddress, tokenName, neededAmount, decimals) {
  const contract = new ethers.Contract(tokenAddress, erc20Abi, signer);
  const currentAllowance = await contract.allowance(SCW_ADDRESS, BALANCER_VAULT);
  
  if (currentAllowance < neededAmount) {
    console.log(`\n   Approving ${tokenName}...`);
    
    // Use SCW's execute to approve
    const approveData = contract.interface.encodeFunctionData("approve", [BALANCER_VAULT, neededAmount]);
    const execData = new ethers.Interface(scwAbi).encodeFunctionData("execute", [tokenAddress, 0n, approveData]);
    
    const tx = await signer.sendTransaction({
      to: SCW_ADDRESS,
      data: execData,
      gasLimit: 200000
    });
    
    console.log(`   Approval TX: https://etherscan.io/tx/${tx.hash}`);
    await tx.wait();
    console.log(`   ✅ ${tokenName} approved`);
    return true;
  }
  
  console.log(`   ${tokenName} already approved`);
  return false;
}

// ===== Create Pool (force create WETH with new name) =====
async function createWeightedPool(name, symbol, tokenA, tokenB, forceCreate = false) {
  console.log(`\n🎯 ${forceCreate ? "FORCE CREATING" : "Creating"} ${name}...`);

  const [token0, token1] = sortTokens(tokenA, tokenB);
  const tokens = [token0, token1];
  const weights = token0 === BWZC_TOKEN 
    ? [ethers.parseUnits(WEIGHT_BW.toString(), 18), ethers.parseUnits(WEIGHT_PAIRED.toString(), 18)]
    : [ethers.parseUnits(WEIGHT_PAIRED.toString(), 18), ethers.parseUnits(WEIGHT_BW.toString(), 18)];

  const factory = new ethers.Contract(WEIGHTED_POOL2_FACTORY, factoryAbi, signer);

  if (!forceCreate) {
    // Check if pool already exists
    try {
      await factory.create.staticCall(
        name,
        symbol,
        tokens,
        weights,
        ethers.parseUnits(SWAP_FEE.toString(), 18),
        false,
        SCW_ADDRESS
      );
    } catch (err) {
      console.log(`   ${name} already exists — skipping`);
      return null;
    }
  }

  console.log(`   Creating pool...`);
  
  try {
    const tx = await factory.create(
      name,
      symbol,
      tokens,
      weights,
      ethers.parseUnits(SWAP_FEE.toString(), 18),
      false,
      SCW_ADDRESS,
      { gasLimit: 5000000 }
    );
    
    console.log(`   📤 TX: https://etherscan.io/tx/${tx.hash}`);
    const receipt = await tx.wait();

    const eventTopic = ethers.id("PoolCreated(address)");
    const log = receipt.logs.find(l => l.topics[0] === eventTopic);
    if (!log) {
      console.log(`   ❌ No PoolCreated event found`);
      return null;
    }

    const poolAddr = ethers.getAddress("0x" + log.topics[1].slice(-40));
    console.log(`   ✅ Pool created: ${poolAddr}`);

    const pool = new ethers.Contract(poolAddr, poolAbi, provider);
    const poolId = await pool.getPoolId();
    console.log(`   📋 Pool ID: ${poolId}`);

    return { poolAddr, poolId };
    
  } catch (error) {
    console.error(`   ❌ Creation error: ${error.message}`);
    return null;
  }
}

// ===== Seed Pool (with better error handling) =====
async function seedWeightedPool(poolId, tokenA, tokenB, amountA, amountB, label, poolAddr) {
  if (!poolId || !poolAddr) {
    console.log(`   ⚠️  Skipping seeding ${label} - no pool ID or address`);
    return false;
  }

  console.log(`\n🌱 Seeding ${label}...`);
  console.log(`   Pool: ${poolAddr}`);
  console.log(`   Pool ID: ${poolId}`);

  const [asset0, asset1] = sortTokens(tokenA, tokenB);
  const amounts = asset0 === tokenA ? [amountA, amountB] : [amountB, amountA];

  console.log(`   Amounts:`);
  console.log(`     ${asset0 === BWZC_TOKEN ? 'BWZC' : asset0 === USDC ? 'USDC' : 'WETH'}: ${ethers.formatEther(amounts[0])}`);
  console.log(`     ${asset1 === BWZC_TOKEN ? 'BWZC' : asset1 === USDC ? 'USDC' : 'WETH'}: ${ethers.formatEther(amounts[1])}`);

  const vaultIface = new ethers.Interface(vaultAbi);
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256[]"], [0n, amounts]);

  const request = [[asset0, asset1], amounts, userData, false];

  const joinData = vaultIface.encodeFunctionData("joinPool", [poolId, SCW_ADDRESS, SCW_ADDRESS, request]);
  const execData = new ethers.Interface(scwAbi).encodeFunctionData("execute", [BALANCER_VAULT, 0n, joinData]);

  try {
    console.log(`   Sending seeding transaction...`);
    const tx = await signer.sendTransaction({ 
      to: SCW_ADDRESS, 
      data: execData, 
      gasLimit: 1500000
    });
    
    console.log(`   📤 Seeding TX: https://etherscan.io/tx/${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 0) {
      console.log(`   ❌ Seeding transaction reverted`);
      console.log(`   Common reasons:`);
      console.log(`   1. SCW doesn't have enough tokens`);
      console.log(`   2. SCW hasn't approved Vault to spend tokens`);
      console.log(`   3. Token amounts are incorrect`);
      return false;
    } else {
      console.log(`   ✅ Successfully seeded ${label}`);
      
      // Wait and check balances
      console.log(`   Checking pool balances...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      try {
        const vault = new ethers.Contract(BALANCER_VAULT, vaultAbi, provider);
        const [tokens, balances] = await vault.getPoolTokens(poolId);
        console.log(`   📊 Pool balances:`);
        for (let i = 0; i < tokens.length; i++) {
          const tokenName = tokens[i] === BWZC_TOKEN ? 'BWZC' : 
                           tokens[i] === USDC ? 'USDC' : 
                           tokens[i] === WETH ? 'WETH' : tokens[i];
          console.log(`     ${tokenName}: ${ethers.formatEther(balances[i])}`);
        }
      } catch (e) {
        console.log(`   Could not check balances: ${e.message}`);
      }
      
      return true;
    }
  } catch (error) {
    console.error(`   ❌ Seeding error: ${error.message}`);
    return false;
  }
}

// ===== Main Function =====
async function runFinalSolution() {
  console.log("\n" + "=".repeat(60));
  console.log("🚀 FINAL SOLUTION: CREATE WETH POOL & SEED BOTH");
  console.log("=".repeat(60));
  
  // Calculate amounts
  const ethPrice = 3293; // From your logs
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
  
  // Step 1: Check SCW balances and approvals
  const { hasAllTokens, hasAllApprovals } = await checkSCWBalances();
  
  if (!hasAllTokens) {
    console.log("\n❌ SCW doesn't have all tokens needed!");
    console.log("   Please ensure SCW has:");
    console.log(`   - ${ethers.formatEther(bwAmount)} BWZC`);
    console.log(`   - ${ethers.formatUnits(usdcAmount, 6)} USDC`);
    console.log(`   - ${ethers.formatEther(wethAmount)} WETH`);
    return;
  }
  
  if (!hasAllApprovals) {
    console.log("\n⚠️  Setting up approvals...");
    
    // Approve BWZC
    await approveIfNeeded(BWZC_TOKEN, "BWZC", bwAmount, 18);
    
    // Approve USDC
    await approveIfNeeded(USDC, "USDC", usdcAmount, 6);
    
    // Approve WETH
    await approveIfNeeded(WETH, "WETH", wethAmount, 18);
    
    console.log("\n✅ All approvals set up");
  }
  
  // Step 2: Create WETH pool (force create with new name)
  console.log("\n" + "-".repeat(40));
  console.log("🦄 CREATING WETH/BWZC POOL");
  console.log("-".repeat(40));
  
  // Use different name to avoid "already exists" detection
  const wethPool = await createWeightedPool("bwzC-WETH-94-NEW", "bwzC-WETH94", BWZC_TOKEN, WETH, true);
  
  if (!wethPool) {
    console.log("   ❌ WETH pool creation failed");
    console.log("   Trying with another name...");
    
    // Try another name
    const wethPool2 = await createWeightedPool("bwzC-ETH-94", "bwzC-ETH94", BWZC_TOKEN, WETH, true);
    if (!wethPool2) {
      console.log("   ❌ Could not create WETH pool");
      return;
    }
  }
  
  // Step 3: Use existing USDC pool (first one from your list)
  console.log("\n" + "-".repeat(40));
  console.log("💰 USING EXISTING USDC/BWZC POOL");
  console.log("-".repeat(40));
  
  const existingUSDCPool = {
    poolAddr: "0xAaEd510C03df5A4c9d8D660fe477E01AcDC9c561",
    poolId: "0xaaed510c03df5a4c9d8d660fe477e01acdc9c5610002000000000000000006fe"
  };
  
  console.log(`   Using pool: ${existingUSDCPool.poolAddr}`);
  console.log(`   Pool ID: ${existingUSDCPool.poolId}`);
  
  // Step 4: Seed USDC pool
  console.log("\n" + "-".repeat(40));
  console.log("🌱 SEEDING USDC/BWZC POOL");
  console.log("-".repeat(40));
  
  const usdcSeeded = await seedWeightedPool(
    existingUSDCPool.poolId, 
    BWZC_TOKEN, 
    USDC, 
    bwAmount, 
    usdcAmount, 
    "USDC/BWZC pool", 
    existingUSDCPool.poolAddr
  );
  
  // Step 5: Seed WETH pool (if created)
  if (wethPool) {
    console.log("\n" + "-".repeat(40));
    console.log("🌱 SEEDING WETH/BWZC POOL");
    console.log("-".repeat(40));
    
    const wethSeeded = await seedWeightedPool(
      wethPool.poolId, 
      BWZC_TOKEN, 
      WETH, 
      bwAmount, 
      wethAmount, 
      "WETH/BWZC pool", 
      wethPool.poolAddr
    );
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("🏁 PROCESS COMPLETE");
  console.log("=".repeat(60));
  
  // Summary
  console.log("\n📋 FINAL POOL ADDRESSES:");
  console.log(`\n💰 USDC/BWZC Pool:`);
  console.log(`   Address: ${existingUSDCPool.poolAddr}`);
  console.log(`   Pool ID: ${existingUSDCPool.poolId}`);
  console.log(`   Balancer: https://app.balancer.fi/#/ethereum/pool/${existingUSDCPool.poolId}`);
  
  if (wethPool) {
    console.log(`\n🦄 WETH/BWZC Pool:`);
    console.log(`   Address: ${wethPool.poolAddr}`);
    console.log(`   Pool ID: ${wethPool.poolId}`);
    console.log(`   Balancer: https://app.balancer.fi/#/ethereum/pool/${wethPool.poolId}`);
  } else {
    console.log(`\n❌ WETH/BWZC Pool: Not created`);
  }
  
  console.log("\n⚠️  Note: If seeding failed, the SCW might not have tokens.");
  console.log("   Check token balances in the SCW address.");
}

// ===== Express Server =====
let hasRun = false;
app.get("/health", (_, res) => res.json({ status: "live", hasRun }));

app.get("/run-final", async (_, res) => {
  if (hasRun) {
    res.json({ error: "Already ran once" });
    return;
  }
  
  try {
    await runFinalSolution();
    hasRun = true;
    res.json({ success: true, message: "Final solution executed" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/check-scw", async (_, res) => {
  try {
    const signerAddress = await signer.getAddress();
    
    const tokens = [
      { address: BWZC_TOKEN, name: "BWZC", decimals: 18 },
      { address: USDC, name: "USDC", decimals: 6 },
      { address: WETH, name: "WETH", decimals: 18 }
    ];
    
    const balances = {};
    
    for (const token of tokens) {
      const contract = new ethers.Contract(token.address, erc20Abi, provider);
      balances[token.name] = {
        scwBalance: ethers.formatUnits(await contract.balanceOf(SCW_ADDRESS), token.decimals),
        scwAllowance: ethers.formatUnits(await contract.allowance(SCW_ADDRESS, BALANCER_VAULT), token.decimals),
        eoaBalance: ethers.formatUnits(await contract.balanceOf(signerAddress), token.decimals),
        eoaAllowance: ethers.formatUnits(await contract.allowance(signerAddress, BALANCER_VAULT), token.decimals)
      };
    }
    
    res.json({
      scw: SCW_ADDRESS,
      eoa: signerAddress,
      vault: BALANCER_VAULT,
      balances
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
  
  console.log(`\n📋 Endpoints:`);
  console.log(`   /health - Health check`);
  console.log(`   /run-final - Run final solution (create WETH pool & seed both)`);
  console.log(`   /check-scw - Check SCW token balances and allowances`);
  
  if (!hasRun) {
    hasRun = true;
    setTimeout(async () => {
      console.log("\n⏱️  Auto-running final solution in 3 seconds...");
      setTimeout(async () => {
        try {
          await runFinalSolution();
          console.log("\n✅ Final solution completed!");
        } catch (error) {
          console.error("\n💥 Failed:", error.message);
        }
      }, 3000);
    }, 1000);
  }
});
