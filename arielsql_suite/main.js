// main.js - DIAGNOSTIC AND EMERGENCY RECOVERY
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

// ===== ADDRESSES =====
const WETH_POOL = {
  poolId: "0x76ee58af556857605516aafa10c3bbd31abbb0990002000000000000000006ff",
  bptAddr: "0x76EE58AF556857605516aAFA10C3bBD31AbBB099"
};
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const BWZC_TOKEN = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";
const WETH_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// ===== Helper to get valid address =====
function getValidAddress(address) {
  try {
    return ethers.getAddress(address);
  } catch (e) {
    return ethers.getAddress(address.toLowerCase());
  }
}

// ===== FIXED ADDRESSES =====
const ADDR = {
  bpt: getValidAddress(WETH_POOL.bptAddr),
  vault: getValidAddress(BALANCER_VAULT),
  bwzc: getValidAddress(BWZC_TOKEN),
  weth: getValidAddress(WETH_TOKEN),
  scw: getValidAddress(SCW_ADDRESS),
  eoa: signer.address,
  poolId: WETH_POOL.poolId
};

// ===== ABIs =====
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns(bytes)"];
const bptAbi = [
  "function approve(address spender,uint256 amount) returns(bool)",
  "function balanceOf(address owner) view returns(uint256)",
  "function allowance(address owner, address spender) view returns(uint256)",
  "function getPoolId() view returns(bytes32)",
  "function totalSupply() view returns(uint256)",
  "function symbol() view returns(string)",
  "function name() view returns(string)"
];
const vaultAbi = [
  "function exitPool(bytes32 poolId, address sender, address recipient, (address[] assets, uint256[] minAmountsOut, bytes userData, bool toInternalBalance) request) external",
  "function joinPool(bytes32 poolId, address sender, address recipient, (address[] assets, uint256[] maxAmountsIn, bytes userData, bool fromInternalBalance) request) external payable",
  "function getPoolTokens(bytes32 poolId) view returns(address[] tokens, uint256[] balances, uint256 lastChangeBlock)",
  "function getPool(bytes32 poolId) view returns(address, uint8)"
];
const erc20Abi = [
  "function balanceOf(address owner) view returns(uint256)",
  "function symbol() view returns(string)",
  "function decimals() view returns(uint8)"
];

// ===== DIAGNOSTIC FUNCTIONS =====
async function diagnosePool() {
  console.log("\n🔍 DIAGNOSING POOL...");
  
  // 1. Check BPT contract
  const bpt = new ethers.Contract(ADDR.bpt, bptAbi, provider);
  
  try {
    console.log("1. Checking BPT contract...");
    const symbol = await bpt.symbol();
    const name = await bpt.name();
    const totalSupply = await bpt.totalSupply();
    console.log(`   Symbol: ${symbol}`);
    console.log(`   Name: ${name}`);
    console.log(`   Total Supply: ${ethers.formatEther(totalSupply)}`);
    
    try {
      const poolIdFromBpt = await bpt.getPoolId();
      console.log(`   Pool ID from BPT: ${poolIdFromBpt}`);
      console.log(`   Expected Pool ID: ${ADDR.poolId}`);
      
      if (poolIdFromBpt.toLowerCase() !== ADDR.poolId.toLowerCase()) {
        console.log(`   ⚠️ MISMATCH! BPT thinks it's in different pool`);
      }
    } catch (e) {
      console.log(`   ❌ Cannot get pool ID from BPT: ${e.message}`);
    }
  } catch (e) {
    console.log(`   ❌ Cannot query BPT: ${e.message}`);
  }
  
  // 2. Try to get pool tokens from vault
  const vault = new ethers.Contract(ADDR.vault, vaultAbi, provider);
  
  console.log("\n2. Checking pool in vault...");
  try {
    const [poolAddress, poolType] = await vault.getPool(ADDR.poolId);
    console.log(`   Pool Address: ${poolAddress}`);
    console.log(`   Pool Type: ${poolType}`);
    
    if (poolAddress.toLowerCase() !== ADDR.bpt.toLowerCase()) {
      console.log(`   ⚠️ MISMATCH! Pool address != BPT address`);
    }
  } catch (e) {
    console.log(`   ❌ Cannot get pool from vault: ${e.message}`);
  }
  
  // 3. Try to get pool tokens
  console.log("\n3. Trying to get pool tokens...");
  try {
    const [tokens, balances] = await vault.getPoolTokens(ADDR.poolId);
    console.log(`   ✅ Got ${tokens.length} tokens:`);
    tokens.forEach((token, i) => {
      console.log(`     ${i}: ${token} (${ethers.formatEther(balances[i])})`);
    });
    return tokens;
  } catch (e) {
    console.log(`   ❌ Cannot get pool tokens: ${e.message}`);
    
    // Try alternative pool ID format
    console.log("\n4. Trying alternative pool ID...");
    try {
      // Pool ID might need to be bytes32 padded
      const poolIdBytes32 = ethers.zeroPadValue(ADDR.poolId, 32);
      const [tokens, balances] = await vault.getPoolTokens(poolIdBytes32);
      console.log(`   ✅ Got tokens with bytes32 ID:`);
      tokens.forEach((token, i) => {
        console.log(`     ${i}: ${token} (${ethers.formatEther(balances[i])})`);
      });
      return tokens;
    } catch (e2) {
      console.log(`   ❌ Also failed: ${e2.message}`);
    }
  }
  
  return null;
}

// ===== EMERGENCY RECOVERY: TRANSFER BPT OUT =====
async function emergencyTransferBPT() {
  console.log("\n🚨 EMERGENCY: Transferring BPT to EOA...");
  
  const bpt = new ethers.Contract(ADDR.bpt, bptAbi, provider);
  const bptBalance = await bpt.balanceOf(ADDR.scw);
  
  console.log(`BPT in SCW: ${ethers.formatEther(bptBalance)}`);
  
  if (bptBalance === 0n) {
    console.log("✅ No BPT to transfer");
    return true;
  }
  
  // Try to transfer BPT from SCW to EOA
  const transferAbi = ["function transfer(address to, uint256 amount) returns(bool)"];
  const transferIface = new ethers.Interface(transferAbi);
  const transferData = transferIface.encodeFunctionData("transfer", [ADDR.eoa, bptBalance]);
  
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [ADDR.bpt, 0, transferData]);
  
  try {
    console.log("Attempting BPT transfer...");
    const tx = await signer.sendTransaction({
      to: ADDR.scw,
      data: execData,
      gasLimit: 200000,
    });
    
    console.log(`Transfer TX: https://etherscan.io/tx/${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log("✅ BPT transferred to EOA!");
      
      // Check new balance
      const newBalance = await bpt.balanceOf(ADDR.eoa);
      console.log(`BPT in EOA now: ${ethers.formatEther(newBalance)}`);
      
      if (newBalance > 0n) {
        console.log("\n⚠️ IMPORTANT: BPT is now in EOA.");
        console.log("You can now try to handle it differently:");
        console.log("1. Try to exit from EOA directly");
        console.log("2. Swap BPT on a DEX");
        console.log("3. Contact Balancer support");
      }
      
      return true;
    } else {
      console.log("❌ Transfer failed");
      return false;
    }
  } catch (error) {
    console.log(`❌ Transfer error: ${error.message}`);
    return false;
  }
}

// ===== TRY JOIN INSTEAD OF EXIT =====
async function tryJoinInstead() {
  console.log("\n🔄 TRYING JOIN INSTEAD OF EXIT (reverse logic)...");
  
  const bpt = new ethers.Contract(ADDR.bpt, bptAbi, provider);
  const bptBalance = await bpt.balanceOf(ADDR.scw);
  
  if (bptBalance === 0n) {
    console.log("No BPT to work with");
    return false;
  }
  
  const vault = new ethers.Contract(ADDR.vault, vaultAbi, provider);
  const vaultIface = new ethers.Interface(vaultAbi);
  const scwIface = new ethers.Interface(scwAbi);
  
  // Maybe we need to "join" with BPT to get tokens out?
  // This is unusual but the pool might be backwards
  
  const assets = [ADDR.weth, ADDR.bwzc];
  const maxAmountsIn = [0n, 0n]; // We're not putting tokens in
  
  // JOIN_EXACT_TOKENS_IN_FOR_BPT_OUT = 0
  // JOIN_ALL_TOKENS_IN_FOR_EXACT_BPT_OUT = 1
  // JOIN_ONE_TOKEN_IN_FOR_EXACT_BPT_OUT = 2
  
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256"],
    [1n, bptBalance] // JOIN_ALL_TOKENS_IN_FOR_EXACT_BPT_OUT
  );
  
  try {
    const joinRequest = {
      assets: assets,
      maxAmountsIn: maxAmountsIn,
      userData: userData,
      fromInternalBalance: false
    };
    
    const joinData = vaultIface.encodeFunctionData("joinPool", [
      ADDR.poolId,
      ADDR.scw,
      ADDR.scw,
      joinRequest
    ]);
    
    const execData = scwIface.encodeFunctionData("execute", [ADDR.vault, 0, joinData]);
    
    console.log("Simulating join...");
    try {
      await provider.estimateGas({
        from: ADDR.eoa,
        to: ADDR.scw,
        data: execData
      });
      console.log("✅ Simulation passed");
    } catch (simError) {
      console.log(`⚠️ Simulation: ${simError.shortMessage || simError.message}`);
    }
    
    const tx = await signer.sendTransaction({
      to: ADDR.scw,
      data: execData,
      gasLimit: 3000000,
    });
    
    console.log(`Join TX: https://etherscan.io/tx/${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log("✅ JOIN SUCCESSFUL!");
      return true;
    } else {
      console.log("❌ Join failed");
      return false;
    }
  } catch (error) {
    console.log(`❌ Join error: ${error.message}`);
    return false;
  }
}

// ===== DIRECT SWAP ATTEMPT =====
async function tryDirectSwap() {
  console.log("\n💱 TRYING DIRECT SWAP (if pool supports swaps)...");
  
  // Some pools allow swapping BPT directly for one token
  const swapAbi = [
    "function swap((bytes32 poolId,uint8 kind,address assetIn,address assetOut,uint256 amount,bytes userData) request, (address sender, bool fromInternalBalance, address recipient, bool toInternalBalance) funds, uint256 limit, uint256 deadline) external returns(uint256 amountCalculated)"
  ];
  
  const vault = new ethers.Contract(ADDR.vault, swapAbi, provider);
  const vaultIface = new ethers.Interface(swapAbi);
  const scwIface = new ethers.Interface(scwAbi);
  
  const bpt = new ethers.Contract(ADDR.bpt, bptAbi, provider);
  const bptBalance = await bpt.balanceOf(ADDR.scw);
  
  if (bptBalance === 0n) return false;
  
  // Try to swap BPT for WETH
  const request = {
    poolId: ADDR.poolId,
    kind: 0, // GIVEN_IN
    assetIn: ADDR.bpt,
    assetOut: ADDR.weth,
    amount: bptBalance,
    userData: "0x"
  };
  
  const funds = {
    sender: ADDR.scw,
    fromInternalBalance: false,
    recipient: ADDR.scw,
    toInternalBalance: false
  };
  
  try {
    const swapData = vaultIface.encodeFunctionData("swap", [
      request,
      funds,
      0n, // limit = 0 (minimum out)
      9999999999n // far future deadline
    ]);
    
    const execData = scwIface.encodeFunctionData("execute", [ADDR.vault, 0, swapData]);
    
    console.log("Trying swap...");
    const tx = await signer.sendTransaction({
      to: ADDR.scw,
      data: execData,
      gasLimit: 3000000,
    });
    
    console.log(`Swap TX: https://etherscan.io/tx/${tx.hash}`);
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log("✅ SWAP SUCCESSFUL!");
      return true;
    }
  } catch (error) {
    console.log(`❌ Swap error: ${error.message}`);
  }
  
  return false;
}

// ===== MAIN RECOVERY =====
async function recoverWETH() {
  console.log("🚀 EMERGENCY WETH RECOVERY");
  console.log("SCW:", ADDR.scw);
  console.log("EOA:", ADDR.eoa);
  console.log("BPT Balance in SCW:", ethers.formatEther(await new ethers.Contract(ADDR.bpt, bptAbi, provider).balanceOf(ADDR.scw)));
  
  // 1. Diagnose
  await diagnosePool();
  
  // 2. Emergency transfer BPT to EOA
  const transferred = await emergencyTransferBPT();
  
  if (transferred) {
    console.log("\n✅ BPT moved to EOA. Try handling from there.");
    return;
  }
  
  // 3. Try alternative approaches
  console.log("\n🔄 Trying alternative approaches...");
  
  const approaches = [
    { name: "Join instead of exit", func: tryJoinInstead },
    { name: "Direct swap", func: tryDirectSwap }
  ];
  
  for (const approach of approaches) {
    console.log(`\n--- Trying: ${approach.name} ---`);
    const success = await approach.func();
    if (success) {
      console.log(`✅ ${approach.name} worked!`);
      break;
    }
  }
  
  // 4. Final check
  console.log("\n📊 Final balances:");
  await checkBalances();
}

// ===== CHECK BALANCES =====
async function checkBalances() {
  const erc20 = new ethers.Contract(ADDR.bpt, erc20Abi, provider);
  
  const addresses = [
    { addr: ADDR.scw, name: "SCW" },
    { addr: ADDR.eoa, name: "EOA" }
  ];
  
  const tokens = [
    { addr: ADDR.bpt, name: "BPT" },
    { addr: ADDR.bwzc, name: "BWZC" },
    { addr: ADDR.weth, name: "WETH" }
  ];
  
  for (const address of addresses) {
    console.log(`\n${address.name} (${address.addr.substring(0, 10)}...):`);
    for (const token of tokens) {
      try {
        const contract = new ethers.Contract(token.addr, erc20Abi, provider);
        const balance = await contract.balanceOf(address.addr);
        console.log(`  ${token.name}: ${ethers.formatEther(balance)}`);
      } catch (e) {
        console.log(`  ${token.name}: Error`);
      }
    }
  }
}

// ===== SERVER =====
let hasRun = false;

app.get("/health", (_, res) => res.json({ 
  status: "live", 
  ran: hasRun,
  scw: ADDR.scw,
  eoa: ADDR.eoa
}));

app.get("/recover", async (_, res) => {
  if (hasRun) return res.json({ error: "Already ran" });
  try {
    hasRun = true;
    res.json({ 
      success: true, 
      message: "Emergency recovery started...",
      approaches: [
        "1. Diagnose pool state",
        "2. Emergency BPT transfer to EOA", 
        "3. Try join instead of exit",
        "4. Try direct swap"
      ]
    });
    
    setTimeout(async () => {
      try {
        await recoverWETH();
      } catch (e) {
        console.error("Recovery error:", e);
      }
    }, 100);
    
  } catch (e) {
    console.error("API error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/diagnose", async (_, res) => {
  try {
    const tokens = await diagnosePool();
    res.json({
      poolId: ADDR.poolId,
      bpt: ADDR.bpt,
      possibleTokens: tokens,
      note: "If tokens is null, pool may be corrupted"
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/transfer-bpt", async (_, res) => {
  try {
    const success = await emergencyTransferBPT();
    res.json({ success, message: success ? "BPT transferred to EOA" : "Transfer failed" });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-balances", async (_, res) => {
  try {
    const result = {};
    
    const addresses = [
      { addr: ADDR.scw, name: "scw" },
      { addr: ADDR.eoa, name: "eoa" }
    ];
    
    const tokens = [
      { addr: ADDR.bpt, name: "bpt" },
      { addr: ADDR.bwzc, name: "bwzc" },
      { addr: ADDR.weth, name: "weth" }
    ];
    
    for (const address of addresses) {
      result[address.name] = {};
      for (const token of tokens) {
        try {
          const contract = new ethers.Contract(token.addr, erc20Abi, provider);
          const balance = await contract.balanceOf(address.addr);
          result[address.name][token.name] = ethers.formatEther(balance);
        } catch (e) {
          result[address.name][token.name] = "error";
        }
      }
    }
    
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/reset", (_, res) => {
  hasRun = false;
  res.json({ success: true });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 Emergency Recovery Server @ port ${PORT}`);
  console.log("Endpoints:");
  console.log("  GET /recover        → Try all emergency approaches");
  console.log("  GET /diagnose       → Diagnose pool state");
  console.log("  GET /transfer-bpt   → Emergency transfer BPT to EOA");
  console.log("  GET /check-balances → Check all balances");
  console.log("  GET /health         → Status");
  console.log("  GET /reset          → Reset");
  console.log("\nIMPORTANT: Pool appears corrupted. Trying emergency options.");
  
  setTimeout(async () => {
    console.log("\n📊 Initial state...");
    await checkBalances();
    
    const bpt = new ethers.Contract(ADDR.bpt, bptAbi, provider);
    const bptInScw = await bpt.balanceOf(ADDR.scw);
    
    if (bptInScw > 0n) {
      console.log(`\n⏱️  Auto-recovering in 5s...`);
      setTimeout(async () => {
        console.log("\n🚀 Starting emergency recovery...");
        try {
          await recoverWETH();
        } catch (e) {
          console.error("Auto-recovery failed:", e.message);
        }
      }, 5000);
    }
  }, 1000);
});
