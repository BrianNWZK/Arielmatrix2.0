// main.js - WETH RECOVERY (CORRECT ABI + ASSET ORDER)
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

// ===== CORRECTED ADDRESSES =====
const WETH_POOL_ID = "0x76ee58af556857605516aafa10c3bbd31abbb0990002000000000000000006ff";
const BPT_ADDR = "0x76ee58af556857605516aafa10c3bbd31abbb099";
const VAULT_ADDR = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const BWZC_TOKEN = "0x54d1c2889b08cad0932266eade15ec884fa0cdc2";
const WETH_TOKEN = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

// CRITICAL: Assets MUST be sorted by address (WETH < BWZC)
const ASSETS = [
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // WETH (index 0)
  "0x54d1c2889b08cad0932266eade15ec884fa0cdc2"  // BWZC (index 1)
];

// ===== ABIs =====
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns(bytes)"];
const bptAbi = [
  "function approve(address spender,uint256 amount) returns(bool)",
  "function balanceOf(address owner) view returns(uint256)",
  "function allowance(address owner,address spender) view returns(uint256)"
];

// CORRECT exitPool ABI for ethers v6
const vaultAbi = [
  "function exitPool(bytes32 poolId,address sender,address recipient,(address[] assets,uint256[] minAmountsOut,bytes userData,bool toInternalBalance) request)"
];

// ===== MAIN RECOVERY =====
async function recoverWETH() {
  console.log("🚀 WETH RECOVERY START");
  
  // 1. Check BPT balance
  const bpt = new ethers.Contract(BPT_ADDR, bptAbi, provider);
  const bptBalance = await bpt.balanceOf(SCW_ADDRESS);
  console.log("BPT Balance:", ethers.formatEther(bptBalance));
  
  if (bptBalance === 0n) {
    console.log("✅ No BPT - already recovered");
    return;
  }
  
  // 2. Check/Approve BPT
  const allowance = await bpt.allowance(SCW_ADDRESS, VAULT_ADDR);
  console.log("Allowance:", ethers.formatEther(allowance));
  
  if (allowance < bptBalance) {
    console.log("🔓 Approving BPT...");
    const bptIface = new ethers.Interface(bptAbi);
    const approveData = bptIface.encodeFunctionData("approve", [VAULT_ADDR, bptBalance]);
    
    const scwIface = new ethers.Interface(scwAbi);
    const execData = scwIface.encodeFunctionData("execute", [BPT_ADDR, 0, approveData]);
    
    const approveTx = await signer.sendTransaction({
      to: SCW_ADDRESS,
      data: execData,
      gasLimit: 300000
    });
    console.log("Approve TX:", "https://etherscan.io/tx/" + approveTx.hash);
    await approveTx.wait();
    console.log("✅ BPT approved");
  }
  
  // 3. Exit pool - EXACT_BPT_IN_FOR_TOKENS_OUT
  console.log("🚪 Exiting pool...");
  const vaultIface = new ethers.Interface(vaultAbi);
  
  // userData: kind=1 (EXACT_BPT_IN_FOR_TOKENS_OUT), bptAmount, minAmounts=[0,0]
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "uint256[]"],
    [1n, bptBalance, [0n, 0n]]
  );
  
  const exitRequest = {
    assets: ASSETS,
    minAmountsOut: [0n, 0n],
    userData: userData,
    toInternalBalance: false
  };
  
  const exitData = vaultIface.encodeFunctionData("exitPool", [
    WETH_POOL_ID,
    SCW_ADDRESS,
    SCW_ADDRESS,
    exitRequest
  ]);
  
  const scwIface = new ethers.Interface(scwAbi);
  const finalExecData = scwIface.encodeFunctionData("execute", [VAULT_ADDR, 0, exitData]);
  
  console.log("Calldata length:", finalExecData.length, "chars");
  
  const exitTx = await signer.sendTransaction({
    to: SCW_ADDRESS,
    data: finalExecData,
    gasLimit: 4000000
  });
  
  console.log("EXIT TX:", "https://etherscan.io/tx/" + exitTx.hash);
  const receipt = await exitTx.wait();
  
  if (receipt.status === 1) {
    console.log("🎉 SUCCESS! WETH + BWZC recovered!");
    console.log("Expected: 0.000607 WETH + 0.085 BWZC");
  } else {
    console.log("❌ Exit failed");
  }
}

// ===== SERVER ENDPOINTS =====
let hasRun = false;

app.get("/health", (_, res) => res.json({ status: "live", ran: hasRun }));

app.get("/recover-weth", async (_, res) => {
  if (hasRun) return res.json({ error: "Already ran" });
  try {
    hasRun = true;
    res.json({ success: true, message: "Recovery started..." });
    recoverWETH().catch(console.error);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-bpt", async (_, res) => {
  try {
    const bpt = new ethers.Contract(BPT_ADDR, bptAbi, provider);
    const balance = await bpt.balanceOf(SCW_ADDRESS);
    const allowance = await bpt.allowance(SCW_ADDRESS, VAULT_ADDR);
    res.json({
      bptBalance: ethers.formatEther(balance),
      allowance: ethers.formatEther(allowance),
      needsApproval: allowance < balance
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/reset", (_, res) => {
  hasRun = false;
  res.json({ success: true });
});

const server = app.listen(PORT, () => {
  console.log("WETH Recovery server @ port " + PORT);
  console.log("GET /recover-weth");
  console.log("GET /check-bpt");
  
  setTimeout(() => {
    console.log("Auto-recovery in 3s...");
    recoverWETH().catch(console.error);
  }, 3000);
});
