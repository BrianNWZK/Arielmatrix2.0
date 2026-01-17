// main.js - FIXED WITH ALLOWANCE ABI
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

// ===== CONSTANTS =====
const BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const BWZC_TOKEN = "0x54d1c2889b08cad0932266eade15ec884fa0cdc2";
const USDC = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

// ===== YOUR POOLS (from BPT tokens) =====
const POOLS = [
  {
    poolId: "0xaaed510c03df5a4c9d8d660fe477e01acdc9c5610002000000000000000006fe",
    bptAddr: "0xAaEd510C03df5A4c9D8D660fe477E01AcDC9c561",
    label: "USDC/BWZC",
    pairedToken: USDC
  },
  {
    poolId: "0x76ee58af556857605516aafa10c3bbd31abbb0990002000000000000000006ff",
    bptAddr: "0x76EE58AF556857605516aAFA10C3bBD31AbBB099", 
    label: "WETH/BWZC",
    pairedToken: WETH
  }
];

// ===== ABIs =====
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns(bytes)"];
const bptAbi = [
  "function approve(address,uint256) returns(bool)", 
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address owner, address spender) view returns(uint256)",
  "function decimals() view returns(uint8)"
];
const vaultAbi = [
  "function exitPool(bytes32 poolId,address sender,address recipient,(address[] assets,uint256[] minAmountsOut,bytes userData,bool toInternalBalance) request)"
];

// ===== Helper function to get checksum address =====
function getChecksumAddress(address) {
  try {
    return ethers.getAddress(address);
  } catch (e) {
    return ethers.getAddress(address.toLowerCase());
  }
}

// ===== RECOVER FUNDS =====
async function recoverFunds() {
  console.log("🔄 RECOVERING ALL FUNDS FROM BUGGED POOLS...");
  
  for (const pool of POOLS) {
    console.log(`\n💸 WITHDRAWING ${pool.label}...`);
    
    try {
      // Get checksum addresses
      const bptAddress = getChecksumAddress(pool.bptAddr);
      const scwAddress = getChecksumAddress(SCW_ADDRESS);
      const vaultAddress = getChecksumAddress(BALANCER_VAULT);
      
      // 1. Get BPT balance
      const bpt = new ethers.Contract(bptAddress, bptAbi, provider);
      const bptBalance = await bpt.balanceOf(scwAddress);
      console.log(`   BPT Balance: ${ethers.formatEther(bptBalance)}`);
      
      if (bptBalance === 0n) {
        console.log(`   ✅ Already withdrawn - skipping`);
        continue;
      }
      
      // 2. Check if approval is needed (call directly from signer for allowance)
      console.log(`   Checking allowance...`);
      const currentAllowance = await bpt.allowance(scwAddress, vaultAddress);
      console.log(`   Current allowance: ${ethers.formatEther(currentAllowance)}`);
      
      if (currentAllowance < bptBalance) {
        console.log(`   Needs approval for: ${ethers.formatEther(bptBalance)}`);
        
        // Approve BPT to Vault (via EOA)
        const bptSigner = new ethers.Contract(bptAddress, bptAbi, signer);
        const approveTx = await bptSigner.approve(vaultAddress, bptBalance);
        console.log(`   BPT Approve TX: https://etherscan.io/tx/${approveTx.hash}`);
        const approveReceipt = await approveTx.wait();
        
        if (approveReceipt.status !== 1) {
          console.log(`   ❌ Approval failed for ${pool.label}`);
          continue;
        }
        console.log(`   ✅ Approval confirmed`);
        
        // Wait for confirmation
        await new Promise(resolve => setTimeout(resolve, 5000));
      } else {
        console.log(`   ✅ Already approved (allowance: ${ethers.formatEther(currentAllowance)})`);
      }
      
      // 3. Execute exitPool via SCW
      const vaultIface = new ethers.Interface(vaultAbi);
      
      // For exitPool, assets need to be in correct order (check pool composition)
      // Typically: [token0, token1] sorted by address
      const assets = [BWZC_TOKEN, pool.pairedToken].sort();
      console.log(`   Assets: ${assets}`);
      
      const userData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "uint256[]"],
        [1n, bptBalance, [0n, 0n]] // EXACT_BPT_IN_FOR_TOKENS_OUT
      );
      
      const exitData = vaultIface.encodeFunctionData("exitPool", [
        pool.poolId,
        scwAddress, // sender
        scwAddress, // recipient
        {
          assets,
          minAmountsOut: [0n, 0n],
          userData,
          toInternalBalance: false
        }
      ]);
      
      const scwIface = new ethers.Interface(scwAbi);
      const execData = scwIface.encodeFunctionData("execute", [
        vaultAddress, 
        0n, 
        exitData
      ]);
      
      // Simulate the transaction first
      console.log(`   Simulating transaction...`);
      try {
        await provider.call({
          from: await signer.getAddress(),
          to: scwAddress,
          data: execData
        });
        console.log(`   ✅ Simulation successful`);
      } catch (simError) {
        console.log(`   ⚠️ Simulation failed: ${simError.message}`);
        console.log(`   Will attempt with higher gas anyway...`);
      }
      
      // Send transaction with generous gas
      const withdrawTx = await signer.sendTransaction({
        to: scwAddress,
        data: execData,
        gasLimit: 3000000, // Fixed high gas limit
      });
      
      console.log(`   WITHDRAW TX: https://etherscan.io/tx/${withdrawTx.hash}`);
      const receipt = await withdrawTx.wait();
      
      if (receipt.status === 1) {
        console.log(`   ✅ ${pool.label} FUNDS RECOVERED!`);
        console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
      } else {
        console.log(`   ❌ ${pool.label} withdraw failed`);
        console.log(`   Receipt status: ${receipt.status}`);
        console.log(`   Logs:`, receipt.logs);
      }
      
      // Add delay between pool withdrawals
      await new Promise(resolve => setTimeout(resolve, 5000));
      
    } catch (error) {
      console.error(`   ❌ Error with ${pool.label}:`);
      console.error(`   Message: ${error.message}`);
      if (error.shortMessage) console.error(`   Short: ${error.shortMessage}`);
      if (error.receipt) console.error(`   Receipt status: ${error.receipt.status}`);
      console.log(`   Continuing...`);
    }
  }
  
  console.log("\n🎉 RECOVERY ATTEMPT COMPLETE!");
  console.log("✅ Check SCW balances for recovered funds");
}

// ===== CHECK BALANCES =====
async function checkBalances() {
  console.log("\n📊 CHECKING TOKEN BALANCES...");
  
  const tokenAbi = ["function balanceOf(address) view returns(uint256)"];
  
  const tokens = [
    { address: BWZC_TOKEN, name: "BWZC" },
    { address: WETH, name: "WETH" },
    { address: USDC, name: "USDC" }
  ];
  
  for (const token of tokens) {
    const tokenContract = new ethers.Contract(token.address, tokenAbi, provider);
    const balance = await tokenContract.balanceOf(getChecksumAddress(SCW_ADDRESS));
    console.log(`   ${token.name}: ${ethers.formatEther(balance)}`);
  }
}

// ===== MAIN EXECUTION =====
async function main() {
  console.log("🚀 BALANCER POOL FUND RECOVERY");
  console.log(`SCW Address: ${SCW_ADDRESS}`);
  console.log(`Signer Address: ${await signer.getAddress()}`);
  await recoverFunds();
  await checkBalances();
  console.log("\n✅ PROCESS COMPLETED!");
}

// ===== SERVER =====
let hasRun = false;

app.get("/health", (_, res) => res.json({ 
  status: "live", 
  ran: hasRun,
  signer: signer.address,
  scw: SCW_ADDRESS
}));

app.get("/recover", async (_, res) => {
  if (hasRun) return res.json({ error: "Already ran" });
  try {
    hasRun = true;
    res.json({ 
      success: true, 
      message: "Recovery started in background...",
      note: "Check server logs for progress"
    });
    
    // Run in background
    setTimeout(async () => {
      try {
        await main();
      } catch (e) {
        console.error("Background recovery error:", e);
      }
    }, 100);
    
  } catch (e) {
    console.error("Recovery error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-bpt", async (_, res) => {
  try {
    const balances = {};
    for (const pool of POOLS) {
      const bptAddress = getChecksumAddress(pool.bptAddr);
      const scwAddress = getChecksumAddress(SCW_ADDRESS);
      const bpt = new ethers.Contract(bptAddress, bptAbi, provider);
      const balance = await bpt.balanceOf(scwAddress);
      balances[pool.label] = {
        raw: balance.toString(),
        formatted: ethers.formatEther(balance)
      };
    }
    res.json(balances);
  } catch (e) {
    console.error("Check BPT error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-allowances", async (_, res) => {
  try {
    const allowances = {};
    for (const pool of POOLS) {
      const bptAddress = getChecksumAddress(pool.bptAddr);
      const scwAddress = getChecksumAddress(SCW_ADDRESS);
      const vaultAddress = getChecksumAddress(BALANCER_VAULT);
      const bpt = new ethers.Contract(bptAddress, bptAbi, provider);
      const allowance = await bpt.allowance(scwAddress, vaultAddress);
      allowances[pool.label] = {
        raw: allowance.toString(),
        formatted: ethers.formatEther(allowance)
      };
    }
    res.json(allowances);
  } catch (e) {
    console.error("Check allowances error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-token-balances", async (_, res) => {
  try {
    const tokenAbi = ["function balanceOf(address) view returns(uint256)"];
    const balances = {};
    
    const tokens = [
      { address: BWZC_TOKEN, name: "BWZC" },
      { address: WETH, name: "WETH" },
      { address: USDC, name: "USDC" }
    ];
    
    for (const token of tokens) {
      const tokenContract = new ethers.Contract(token.address, tokenAbi, provider);
      const balance = await tokenContract.balanceOf(getChecksumAddress(SCW_ADDRESS));
      balances[token.name] = {
        raw: balance.toString(),
        formatted: ethers.formatEther(balance)
      };
    }
    
    res.json(balances);
  } catch (e) {
    console.error("Check token balances error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/reset", (_, res) => {
  hasRun = false;
  res.json({ success: true, message: "Reset complete" });
});

app.get("/debug-exit/:poolIndex", async (req, res) => {
  try {
    const poolIndex = parseInt(req.params.poolIndex);
    if (poolIndex < 0 || poolIndex >= POOLS.length) {
      return res.status(400).json({ error: "Invalid pool index" });
    }
    
    const pool = POOLS[poolIndex];
    console.log(`Debug exit for ${pool.label}...`);
    
    const bptAddress = getChecksumAddress(pool.bptAddr);
    const scwAddress = getChecksumAddress(SCW_ADDRESS);
    const vaultAddress = getChecksumAddress(BALANCER_VAULT);
    
    const bpt = new ethers.Contract(bptAddress, bptAbi, provider);
    const bptBalance = await bpt.balanceOf(scwAddress);
    
    const vaultIface = new ethers.Interface(vaultAbi);
    const assets = [BWZC_TOKEN, pool.pairedToken].sort();
    
    const userData = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "uint256", "uint256[]"],
      [1n, bptBalance, [0n, 0n]]
    );
    
    const exitData = vaultIface.encodeFunctionData("exitPool", [
      pool.poolId,
      scwAddress,
      scwAddress,
      {
        assets,
        minAmountsOut: [0n, 0n],
        userData,
        toInternalBalance: false
      }
    ]);
    
    const scwIface = new ethers.Interface(scwAbi);
    const execData = scwIface.encodeFunctionData("execute", [
      vaultAddress, 
      0n, 
      exitData
    ]);
    
    // Try to simulate
    let simulationResult = "Not attempted";
    try {
      const result = await provider.call({
        from: await signer.getAddress(),
        to: scwAddress,
        data: execData
      });
      simulationResult = result;
    } catch (simError) {
      simulationResult = simError.message;
    }
    
    res.json({
      pool: pool.label,
      bptBalance: bptBalance.toString(),
      assets: assets,
      userData: userData,
      exitData: exitData,
      execData: execData,
      simulation: simulationResult,
      note: "Use /recover endpoint to actually execute"
    });
    
  } catch (e) {
    console.error("Debug exit error:", e);
    res.status(500).json({ error: e.message });
  }
});

const server = app.listen(PORT, async () => {
  console.log(`🚀 Recovery server @ port ${PORT}`);
  console.log("Endpoints:");
  console.log("  GET /recover               → Recover ALL funds");
  console.log("  GET /check-bpt             → Check BPT balances");
  console.log("  GET /check-allowances      → Check BPT allowances");
  console.log("  GET /check-token-balances  → Check token balances (BWZC, WETH, USDC)");
  console.log("  GET /debug-exit/:0         → Debug exit for USDC/BWZC pool");
  console.log("  GET /debug-exit/:1         → Debug exit for WETH/BWZC pool");
  console.log("  GET /health                → Status");
  console.log("  GET /reset                 → Reset recovery flag");
  console.log(`\nSigner: ${signer.address}`);
  console.log(`SCW: ${SCW_ADDRESS}`);
  
  // Check initial balances
  setTimeout(async () => {
    console.log("\n📊 Initial BPT Balances:");
    for (const pool of POOLS) {
      const bptAddress = getChecksumAddress(pool.bptAddr);
      const scwAddress = getChecksumAddress(SCW_ADDRESS);
      const bpt = new ethers.Contract(bptAddress, bptAbi, provider);
      const balance = await bpt.balanceOf(scwAddress);
      console.log(`   ${pool.label}: ${ethers.formatEther(balance)} BPT`);
    }
    
    // Auto-run recovery
    setTimeout(async () => {
      console.log("\n⏱️  Auto-recovering funds in 3s...");
      setTimeout(async () => {
        try {
          console.log("\n🚀 Starting auto-recovery...");
          await main();
        } catch (e) {
          console.error("Auto-recovery failed:", e.message);
        }
      }, 3000);
    }, 1000);
  }, 1000);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});
