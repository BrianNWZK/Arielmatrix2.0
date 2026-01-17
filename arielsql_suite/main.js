// main.js - FIXED DIRECTION ISSUE
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
    pairedToken: USDC,
    assets: [BWZC_TOKEN, USDC] // BWZC < USDC
  },
  {
    poolId: "0x76ee58af556857605516aafa10c3bbd31abbb0990002000000000000000006ff",
    bptAddr: "0x76EE58AF556857605516aAFA10C3bBD31AbBB099", 
    label: "WETH/BWZC",
    pairedToken: WETH,
    assets: [WETH, BWZC_TOKEN] // WETH < BWZC
  }
];

// ===== ABIs =====
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns(bytes)"];
const bptAbi = [
  "function approve(address,uint256) returns(bool)", 
  "function balanceOf(address) view returns(uint256)",
  "function allowance(address owner, address spender) view returns(uint256)"
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

// ===== CHECK ALLOWANCE =====
async function checkAndApprove(bptAddress, scwAddress, vaultAddress, bptBalance) {
  const bpt = new ethers.Contract(bptAddress, bptAbi, provider);
  const currentAllowance = await bpt.allowance(scwAddress, vaultAddress);
  
  if (currentAllowance >= bptBalance) {
    console.log(`   ✅ Already approved (allowance: ${ethers.formatEther(currentAllowance)})`);
    return true;
  }
  
  console.log(`   Current allowance: ${ethers.formatEther(currentAllowance)}`);
  console.log(`   Needs approval for: ${ethers.formatEther(bptBalance)}`);
  
  const bptSigner = new ethers.Contract(bptAddress, bptAbi, signer);
  const approveTx = await bptSigner.approve(vaultAddress, bptBalance);
  console.log(`   BPT Approve TX: https://etherscan.io/tx/${approveTx.hash}`);
  const receipt = await approveTx.wait();
  
  if (receipt.status === 1) {
    console.log(`   ✅ Approval confirmed`);
    // Wait for state update
    await new Promise(resolve => setTimeout(resolve, 5000));
    return true;
  } else {
    console.log(`   ❌ Approval failed`);
    return false;
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
      const eoaAddress = await signer.getAddress();
      
      // 1. Get BPT balance
      const bpt = new ethers.Contract(bptAddress, bptAbi.slice(0, 2), provider);
      const bptBalance = await bpt.balanceOf(scwAddress);
      console.log(`   BPT Balance: ${ethers.formatEther(bptBalance)}`);
      
      if (bptBalance === 0n) {
        console.log(`   ✅ Already withdrawn - skipping`);
        continue;
      }
      
      // 2. Check and approve if needed
      const approved = await checkAndApprove(bptAddress, scwAddress, vaultAddress, bptBalance);
      if (!approved) {
        console.log(`   ❌ Skipping due to approval failure`);
        continue;
      }
      
      // 3. Execute exitPool via SCW - IMPORTANT: recipient should be SCW to receive tokens
      const vaultIface = new ethers.Interface(vaultAbi);
      
      // Use correct asset order for this pool
      const assets = pool.assets;
      console.log(`   Assets: ${assets.map(addr => addr.substring(0, 10) + '...')}`);
      
      const userData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["uint256", "uint256", "uint256[]"],
        [1n, bptBalance, [0n, 0n]] // EXACT_BPT_IN_FOR_TOKENS_OUT
      );
      
      // Try BOTH approaches
      
      // APPROACH 1: Direct to SCW (this worked for USDC)
      console.log(`   Trying Approach 1: SCW as recipient...`);
      const exitData1 = vaultIface.encodeFunctionData("exitPool", [
        pool.poolId,
        scwAddress,     // sender = SCW (has BPT)
        scwAddress,     // recipient = SCW (should receive tokens)
        {
          assets,
          minAmountsOut: [0n, 0n],
          userData,
          toInternalBalance: false
        }
      ]);
      
      const scwIface = new ethers.Interface(scwAbi);
      const execData1 = scwIface.encodeFunctionData("execute", [
        vaultAddress, 
        0n, 
        exitData1
      ]);
      
      // Try simulation
      try {
        console.log(`   Simulating Approach 1...`);
        const simResult1 = await provider.call({
          from: eoaAddress,
          to: scwAddress,
          data: execData1
        });
        console.log(`   ✅ Simulation passed: ${simResult1.substring(0, 50)}...`);
        
        const tx1 = await signer.sendTransaction({
          to: scwAddress,
          data: execData1,
          gasLimit: 3500000,
        });
        
        console.log(`   WITHDRAW TX: https://etherscan.io/tx/${tx1.hash}`);
        const receipt1 = await tx1.wait();
        
        if (receipt1.status === 1) {
          console.log(`   ✅ ${pool.label} FUNDS RECOVERED to SCW!`);
          console.log(`   Gas used: ${receipt1.gasUsed.toString()}`);
          continue; // Success, move to next pool
        } else {
          console.log(`   ❌ Approach 1 failed, status: ${receipt1.status}`);
        }
      } catch (error) {
        console.log(`   ❌ Approach 1 simulation/execution failed: ${error.shortMessage || error.message}`);
      }
      
      // APPROACH 2: Try recipient as EOA (maybe SCW has issues)
      console.log(`   Trying Approach 2: EOA as recipient...`);
      const exitData2 = vaultIface.encodeFunctionData("exitPool", [
        pool.poolId,
        scwAddress,     // sender = SCW (has BPT)
        eoaAddress,     // recipient = EOA (receive tokens directly)
        {
          assets,
          minAmountsOut: [0n, 0n],
          userData,
          toInternalBalance: false
        }
      ]);
      
      const execData2 = scwIface.encodeFunctionData("execute", [
        vaultAddress, 
        0n, 
        exitData2
      ]);
      
      try {
        console.log(`   Simulating Approach 2...`);
        await provider.call({
          from: eoaAddress,
          to: scwAddress,
          data: execData2
        });
        console.log(`   ✅ Simulation passed`);
        
        const tx2 = await signer.sendTransaction({
          to: scwAddress,
          data: execData2,
          gasLimit: 3500000,
        });
        
        console.log(`   WITHDRAW TX (EOA): https://etherscan.io/tx/${tx2.hash}`);
        const receipt2 = await tx2.wait();
        
        if (receipt2.status === 1) {
          console.log(`   ✅ ${pool.label} FUNDS RECOVERED to EOA!`);
          console.log(`   Gas used: ${receipt2.gasUsed.toString()}`);
          continue; // Success
        } else {
          console.log(`   ❌ Approach 2 failed, status: ${receipt2.status}`);
        }
      } catch (error) {
        console.log(`   ❌ Approach 2 failed: ${error.shortMessage || error.message}`);
      }
      
      // Wait between attempts
      await new Promise(resolve => setTimeout(resolve, 3000));
      
    } catch (error) {
      console.error(`   ❌ Error with ${pool.label}:`);
      console.error(`   ${error.message}`);
      if (error.shortMessage) console.error(`   ${error.shortMessage}`);
      console.log(`   Continuing to next pool...`);
    }
  }
  
  console.log("\n🎉 RECOVERY ATTEMPT COMPLETE!");
  console.log("✅ Check token balances");
}

// ===== CHECK TOKEN BALANCES =====
async function checkTokenBalances() {
  console.log("\n📊 CHECKING TOKEN BALANCES...");
  
  const tokenAbi = ["function balanceOf(address) view returns(uint256)"];
  const scwAddress = getChecksumAddress(SCW_ADDRESS);
  const eoaAddress = await signer.getAddress();
  
  const addresses = [
    { address: scwAddress, name: "SCW" },
    { address: eoaAddress, name: "EOA" }
  ];
  
  const tokens = [
    { address: BWZC_TOKEN, name: "BWZC" },
    { address: WETH, name: "WETH" },
    { address: USDC, name: "USDC", decimals: 6 }
  ];
  
  for (const addr of addresses) {
    console.log(`\n   ${addr.name} (${addr.address.substring(0, 10)}...):`);
    for (const token of tokens) {
      const tokenContract = new ethers.Contract(token.address, tokenAbi, provider);
      const balance = await tokenContract.balanceOf(addr.address);
      const formatted = token.decimals === 6 
        ? ethers.formatUnits(balance, 6)
        : ethers.formatEther(balance);
      console.log(`     ${token.name}: ${formatted}`);
    }
  }
}

// ===== CHECK SPECIFIC BPT =====
async function checkSpecificBPT(poolIndex) {
  const pool = POOLS[poolIndex];
  const bptAddress = getChecksumAddress(pool.bptAddr);
  const scwAddress = getChecksumAddress(SCW_ADDRESS);
  const bpt = new ethers.Contract(bptAddress, bptAbi.slice(0, 2), provider);
  const balance = await bpt.balanceOf(scwAddress);
  return { pool: pool.label, balance: ethers.formatEther(balance) };
}

// ===== MAIN EXECUTION =====
async function main() {
  console.log("🚀 BALANCER POOL FUND RECOVERY");
  console.log(`SCW Address: ${SCW_ADDRESS}`);
  console.log(`EOA Address: ${await signer.getAddress()}`);
  
  // Check initial BPT balances
  console.log("\n📊 INITIAL BPT BALANCES:");
  for (let i = 0; i < POOLS.length; i++) {
    const result = await checkSpecificBPT(i);
    console.log(`   ${result.pool}: ${result.balance} BPT`);
  }
  
  await recoverFunds();
  await checkTokenBalances();
  console.log("\n✅ RECOVERY COMPLETE!");
}

// ===== SERVER =====
let hasRun = false;

app.get("/health", (_, res) => res.json({ 
  status: "live", 
  ran: hasRun,
  signer: signer.address,
  scw: SCW_ADDRESS,
  note: "WETH/BWZC BPT was already withdrawn but tokens went to wrong place"
}));

app.get("/recover", async (_, res) => {
  if (hasRun) return res.json({ error: "Already ran" });
  try {
    hasRun = true;
    res.json({ 
      success: true, 
      message: "Recovery started in background...",
      note: "Trying different approaches to fix direction issue",
      checkUrl: "/check-token-balances"
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
    for (let i = 0; i < POOLS.length; i++) {
      const result = await checkSpecificBPT(i);
      balances[result.pool] = result.balance;
    }
    res.json(balances);
  } catch (e) {
    console.error("Check BPT error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-token-balances", async (_, res) => {
  try {
    const tokenAbi = ["function balanceOf(address) view returns(uint256)"];
    const scwAddress = getChecksumAddress(SCW_ADDRESS);
    const eoaAddress = await signer.getAddress();
    
    const addresses = [
      { address: scwAddress, name: "scw" },
      { address: eoaAddress, name: "eoa" }
    ];
    
    const tokens = [
      { address: BWZC_TOKEN, name: "bwzc" },
      { address: WETH, name: "weth" },
      { address: USDC, name: "usdc", decimals: 6 }
    ];
    
    const result = {};
    
    for (const addr of addresses) {
      result[addr.name] = {};
      for (const token of tokens) {
        const tokenContract = new ethers.Contract(token.address, tokenAbi, provider);
        const balance = await tokenContract.balanceOf(addr.address);
        result[addr.name][token.name] = {
          raw: balance.toString(),
          formatted: token.decimals === 6 
            ? ethers.formatUnits(balance, 6)
            : ethers.formatEther(balance)
        };
      }
    }
    
    res.json(result);
  } catch (e) {
    console.error("Check token balances error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/debug-tx/:hash", async (req, res) => {
  try {
    const hash = req.params.hash;
    const receipt = await provider.getTransactionReceipt(hash);
    
    // Decode logs if any
    const logs = [];
    if (receipt.logs) {
      for (const log of receipt.logs) {
        logs.push({
          address: log.address,
          data: log.data,
          topics: log.topics
        });
      }
    }
    
    res.json({
      hash: hash,
      status: receipt.status,
      from: receipt.from,
      to: receipt.to,
      gasUsed: receipt.gasUsed.toString(),
      logs: logs,
      raw: receipt
    });
  } catch (e) {
    console.error("Debug TX error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/reset", (_, res) => {
  hasRun = false;
  res.json({ success: true, message: "Reset complete" });
});

const server = app.listen(PORT, async () => {
  console.log(`🚀 Recovery server @ port ${PORT}`);
  console.log("Endpoints:");
  console.log("  GET /recover              → Recover funds (tries 2 approaches)");
  console.log("  GET /check-bpt            → Check BPT balances");
  console.log("  GET /check-token-balances → Check token balances for SCW & EOA");
  console.log("  GET /debug-tx/:hash       → Debug transaction");
  console.log("  GET /health               → Status");
  console.log("  GET /reset                → Reset recovery flag");
  console.log(`\nIMPORTANT: Previous WETH/BWZC withdrawal sent tokens TO Balancer instead of FROM Balancer`);
  console.log(`We need to fix the direction.`);
  console.log(`\nSigner: ${signer.address}`);
  console.log(`SCW: ${SCW_ADDRESS}`);
  
  // Check initial state
  setTimeout(async () => {
    console.log("\n📊 Checking initial state...");
    
    const bptChecks = [];
    for (let i = 0; i < POOLS.length; i++) {
      bptChecks.push(await checkSpecificBPT(i));
    }
    
    console.log(`\nBPT Balances:`);
    bptChecks.forEach(check => {
      console.log(`   ${check.pool}: ${check.balance} BPT`);
    });
    
    // Check if WETH/BWZC still has BPT
    const wethBwzcBPT = bptChecks.find(c => c.pool === "WETH/BWZC");
    if (wethBwzcBPT && wethBwzcBPT.balance !== "0.0") {
      console.log(`\n⏱️  Auto-recovering WETH/BWZC in 3s...`);
      setTimeout(async () => {
        try {
          console.log("\n🚀 Starting recovery...");
          await main();
        } catch (e) {
          console.error("Auto-recovery failed:", e.message);
        }
      }, 3000);
    } else {
      console.log(`\n✅ No BPT to recover`);
      console.log(`   Checking token balances...`);
      setTimeout(async () => {
        await checkTokenBalances();
      }, 1000);
    }
  }, 1000);
});

// Handle server errors
server.on('error', (error) => {
  console.error('Server error:', error);
});
