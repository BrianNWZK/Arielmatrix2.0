// main.js - WETH RECOVERY WITH CORRECT ADDRESSES
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

// ===== ADDRESSES WITH PROPER CHECKSUM =====
const WETH_POOL = {
  poolId: "0x76ee58af556857605516aafa10c3bbd31abbb0990002000000000000000006ff",
  bptAddr: "0x76EE58AF556857605516aAFA10C3bBD31AbBB099" // CORRECT CHECKSUM
};
const BALANCER_VAULT = "0xBA12222222228d8Ba445958a75a0704d566BF2C8";
const BWZC_TOKEN = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2";
const WETH_TOKEN = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";

// ===== ABIs =====
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns(bytes)"];
const bptAbi = [
  "function approve(address spender,uint256 amount) returns(bool)",
  "function balanceOf(address owner) view returns(uint256)",
  "function allowance(address owner, address spender) view returns(uint256)"
];
const vaultAbi = [
  "function exitPool(bytes32 poolId, address sender, address recipient, (address[] assets, uint256[] minAmountsOut, bytes userData, bool toInternalBalance) request) external"
];

// ===== Helper function =====
function getChecksumAddress(address) {
  return ethers.getAddress(address);
}

// ===== CHECK AND APPROVE =====
async function checkAndApprove() {
  console.log("🔍 Checking BPT status...");
  
  const bptContract = new ethers.Contract(WETH_POOL.bptAddr, bptAbi, provider);
  const scwChecksum = getChecksumAddress(SCW_ADDRESS);
  
  const bptBalance = await bptContract.balanceOf(scwChecksum);
  console.log("BPT Balance:", ethers.formatEther(bptBalance));
  
  if (bptBalance === 0n) {
    console.log("✅ Already withdrawn");
    return { success: true, bptBalance: 0n };
  }
  
  // Check allowance
  const allowance = await bptContract.allowance(scwChecksum, BALANCER_VAULT);
  console.log("Current allowance:", ethers.formatEther(allowance));
  
  if (allowance >= bptBalance) {
    console.log("✅ Already approved");
    return { success: true, bptBalance };
  }
  
  console.log("🔓 Approving BPT...");
  const bptInterface = new ethers.Interface(bptAbi);
  const approveData = bptInterface.encodeFunctionData("approve", [BALANCER_VAULT, bptBalance]);
  
  const scwInterface = new ethers.Interface(scwAbi);
  const approveExecData = scwInterface.encodeFunctionData("execute", [WETH_POOL.bptAddr, 0, approveData]);
  
  const approveTx = await signer.sendTransaction({
    to: scwChecksum,
    data: approveExecData,
    gasLimit: 300000
  });
  
  console.log("Approve TX: https://etherscan.io/tx/" + approveTx.hash);
  const receipt = await approveTx.wait();
  
  if (receipt.status === 1) {
    console.log("✅ BPT approved");
    // Wait for state update
    await new Promise(resolve => setTimeout(resolve, 5000));
    return { success: true, bptBalance };
  } else {
    console.log("❌ Approval failed");
    return { success: false, bptBalance: 0n };
  }
}

// ===== EXIT POOL =====
async function exitPool(bptBalance) {
  console.log("\n🚪 Exiting pool with", ethers.formatEther(bptBalance), "BPT...");
  
  const scwChecksum = getChecksumAddress(SCW_ADDRESS);
  const vaultInterface = new ethers.Interface(vaultAbi);
  const scwInterface = new ethers.Interface(scwAbi);
  
  // CRITICAL: Assets must be sorted by address
  // WETH: 0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2
  // BWZC: 0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2
  // WETH < BWZC, so WETH comes FIRST
  const assets = [WETH_TOKEN, BWZC_TOKEN];
  const minAmountsOut = [0n, 0n];
  
  console.log("Assets (sorted):", assets.map(a => a.substring(0, 10) + "..."));
  
  // Try different exit strategies
  const strategies = [
    {
      name: "EXACT_BPT_IN_FOR_TOKENS_OUT",
      kind: 1n,
      userData: ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "uint256[]"],
        [1n, bptBalance, [0n, 0n]]
      )
    },
    {
      name: "EXACT_BPT_IN_FOR_ONE_TOKEN_OUT (WETH)",
      kind: 0n,
      userData: ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "uint256"],
        [0n, bptBalance, 0n] // 0 = WETH (first in assets array)
      )
    }
  ];
  
  for (const strategy of strategies) {
    console.log(`\n🔄 Trying ${strategy.name}...`);
    
    try {
      const exitRequest = {
        assets: assets,
        minAmountsOut: minAmountsOut,
        userData: strategy.userData,
        toInternalBalance: false
      };
      
      const exitData = vaultInterface.encodeFunctionData("exitPool", [
        WETH_POOL.poolId,
        scwChecksum,
        scwChecksum,
        exitRequest
      ]);
      
      const exitExecData = scwInterface.encodeFunctionData("execute", [BALANCER_VAULT, 0, exitData]);
      
      // Try simulation
      try {
        console.log("Simulating...");
        const gasEstimate = await provider.estimateGas({
          from: await signer.getAddress(),
          to: scwChecksum,
          data: exitExecData
        });
        console.log("✅ Simulation passed, gas:", gasEstimate.toString());
      } catch (simError) {
        console.log("⚠️ Simulation warning:", simError.shortMessage || simError.message);
      }
      
      const exitTx = await signer.sendTransaction({
        to: scwChecksum,
        data: exitExecData,
        gasLimit: 4000000,
      });
      
      console.log("Exit TX: https://etherscan.io/tx/" + exitTx.hash);
      const receipt = await exitTx.wait();
      
      if (receipt.status === 1) {
        console.log(`✅ SUCCESS with ${strategy.name}!`);
        console.log("Expected to receive:");
        console.log("   WETH: ~0.000607");
        console.log("   BWZC: ~0.085");
        return true;
      } else {
        console.log(`❌ Failed, status: ${receipt.status}`);
      }
      
    } catch (error) {
      console.log(`❌ Error: ${error.shortMessage || error.message}`);
    }
    
    // Wait between attempts
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  return false;
}

// ===== MAIN RECOVERY =====
async function recoverWETH() {
  console.log("🚀 WETH/BWZC POOL RECOVERY");
  console.log("SCW:", SCW_ADDRESS);
  console.log("Signer:", await signer.getAddress());
  console.log("Pool ID:", WETH_POOL.poolId);
  
  // 1. Check and approve
  const approveResult = await checkAndApprove();
  if (!approveResult.success) {
    console.log("❌ Cannot proceed without approval");
    return;
  }
  
  if (approveResult.bptBalance === 0n) {
    console.log("✅ Already recovered");
    return;
  }
  
  // 2. Exit pool
  const exitSuccess = await exitPool(approveResult.bptBalance);
  
  if (exitSuccess) {
    console.log("\n🎉 RECOVERY SUCCESSFUL!");
  } else {
    console.log("\n⚠️ All strategies failed");
    console.log("The pool may be in a corrupted state");
    console.log("Consider emergency options:");
    console.log("1. Try transferring BPT to EOA first");
    console.log("2. Contact Balancer support");
  }
  
  // 3. Check final balances
  console.log("\n📊 Checking final balances...");
  await checkBalances();
}

// ===== CHECK BALANCES =====
async function checkBalances() {
  const tokenAbi = ["function balanceOf(address owner) view returns(uint256)"];
  const scwChecksum = getChecksumAddress(SCW_ADDRESS);
  
  const tokens = [
    { address: BWZC_TOKEN, name: "BWZC" },
    { address: WETH_TOKEN, name: "WETH" }
  ];
  
  for (const token of tokens) {
    const tokenContract = new ethers.Contract(token.address, tokenAbi, provider);
    const balance = await tokenContract.balanceOf(scwChecksum);
    console.log(`   ${token.name}: ${ethers.formatEther(balance)}`);
  }
}

// ===== SERVER =====
let hasRun = false;

app.get("/health", (_, res) => res.json({ 
  status: "live", 
  ran: hasRun,
  scw: SCW_ADDRESS,
  signer: signer.address,
  pool: "WETH/BWZC"
}));

app.get("/recover-weth", async (_, res) => {
  if (hasRun) return res.json({ error: "Already ran" });
  try {
    hasRun = true;
    res.json({ 
      success: true, 
      message: "Recovery started in background...",
      note: "Check server logs for progress"
    });
    
    setTimeout(async () => {
      try {
        await recoverWETH();
      } catch (e) {
        console.error("Background recovery error:", e);
      }
    }, 100);
    
  } catch (e) {
    console.error("API error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-bpt", async (_, res) => {
  try {
    const bptContract = new ethers.Contract(WETH_POOL.bptAddr, bptAbi, provider);
    const scwChecksum = getChecksumAddress(SCW_ADDRESS);
    
    const balance = await bptContract.balanceOf(scwChecksum);
    const allowance = await bptContract.allowance(scwChecksum, BALANCER_VAULT);
    
    res.json({
      bptBalance: ethers.formatEther(balance),
      allowance: ethers.formatEther(allowance),
      needsApproval: allowance < balance
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-balances", async (_, res) => {
  try {
    const tokenAbi = ["function balanceOf(address owner) view returns(uint256)"];
    const scwChecksum = getChecksumAddress(SCW_ADDRESS);
    
    const tokens = [
      { address: BWZC_TOKEN, name: "bwzc" },
      { address: WETH_TOKEN, name: "weth" }
    ];
    
    const result = {};
    for (const token of tokens) {
      const tokenContract = new ethers.Contract(token.address, tokenAbi, provider);
      const balance = await tokenContract.balanceOf(scwChecksum);
      result[token.name] = ethers.formatEther(balance);
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
  console.log("🚀 WETH Recovery Server @ port", PORT);
  console.log("Endpoints:");
  console.log("  GET /recover-weth   → Recover WETH pool");
  console.log("  GET /check-bpt      → Check BPT balance & allowance");
  console.log("  GET /check-balances → Check token balances");
  console.log("  GET /health         → Status");
  console.log("  GET /reset          → Reset");
  console.log("\nAddresses:");
  console.log("  SCW:", SCW_ADDRESS);
  console.log("  BPT:", WETH_POOL.bptAddr);
  console.log("  Pool ID:", WETH_POOL.poolId);
  
  // Auto-check and recover
  setTimeout(async () => {
    console.log("\n📊 Checking initial state...");
    
    const bptContract = new ethers.Contract(WETH_POOL.bptAddr, bptAbi, provider);
    const scwChecksum = getChecksumAddress(SCW_ADDRESS);
    
    try {
      const balance = await bptContract.balanceOf(scwChecksum);
      console.log("WETH/BWZC BPT:", ethers.formatEther(balance));
      
      if (balance > 0n) {
        console.log("\n⏱️  Auto-recovering in 3s...");
        setTimeout(async () => {
          console.log("\n🚀 Starting auto-recovery...");
          try {
            await recoverWETH();
          } catch (e) {
            console.error("Auto-recovery failed:", e.message);
          }
        }, 3000);
      } else {
        console.log("\n✅ Nothing to recover");
      }
    } catch (e) {
      console.error("Initial check failed:", e.message);
    }
  }, 1000);
});
