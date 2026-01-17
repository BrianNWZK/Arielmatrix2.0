// main.js - WETH RECOVERY (CORRECT ABI ENCODING)
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

// ===== ADDRESSES (ALL LOWERCASE) =====
const WETH_POOL = {
  poolId: "0x76ee58af556857605516aafa10c3bbd31abbb0990002000000000000000006ff",
  bptAddr: "0x76ee58af556857605516aafa10c3bbd31abbb099"
};
const BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const BWZC_TOKEN = "0x54d1c2889b08cad0932266eade15ec884fa0cdc2";
const WETH_TOKEN = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

// ===== CORRECT ABIs =====
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns(bytes)"];
const bptAbi = [
  "function approve(address spender,uint256 amount) returns(bool)",
  "function balanceOf(address owner) view returns(uint256)"
];

// CORRECT exitPool ABI - PROPERLY FORMATTED
const vaultAbi = [
  "function exitPool(bytes32 poolId, address sender, address recipient, tuple(address[] assets,uint256[] minAmountsOut,bytes userData,bool toInternalBalance) request) external payable"
];

// ===== RECOVER WETH =====
async function recoverWETH() {
  console.log("Recovering WETH from WETH/BWZC pool...");
  
  // 1. Get BPT balance
  const bptContract = new ethers.Contract(WETH_POOL.bptAddr, bptAbi, provider);
  const bptBalance = await bptContract.balanceOf(SCW_ADDRESS);
  console.log("WETH BPT Balance:", ethers.formatEther(bptBalance));
  
  if (bptBalance === 0n) {
    console.log("No BPT found");
    return;
  }
  
  // 2. SCW approves BPT to Vault
  console.log("1. SCW approves BPT to Vault...");
  const bptInterface = new ethers.Interface(bptAbi);
  const approveData = bptInterface.encodeFunctionData("approve", [BALANCER_VAULT, bptBalance]);
  
  const scwInterface = new ethers.Interface(scwAbi);
  const approveExecData = scwInterface.encodeFunctionData("execute", [WETH_POOL.bptAddr, 0, approveData]);
  
  const approveTx = await signer.sendTransaction({
    to: SCW_ADDRESS,
    data: approveExecData,
    gasLimit: 300000
  });
  console.log("BPT Approve TX: https://etherscan.io/tx/" + approveTx.hash);
  await approveTx.wait();
  console.log("BPT approved");
  
  // 3. SCW calls exitPool - CORRECT ENCODING
  console.log("2. SCW exits pool...");
  const vaultInterface = new ethers.Interface(vaultAbi);
  
  const assets = [BWZC_TOKEN, WETH_TOKEN];
  const minAmountsOut = [0n, 0n];
  
  // EXACT_BPT_IN_FOR_TOKENS_OUT (kind=1)
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "uint256[]"],
    [1n, bptBalance, [0n, 0n]]
  );
  
  const exitRequest = {
    assets: assets,
    minAmountsOut: minAmountsOut,
    userData: userData,
    toInternalBalance: false
  };
  
  const exitData = vaultInterface.encodeFunctionData("exitPool", [
    WETH_POOL.poolId,
    SCW_ADDRESS,
    SCW_ADDRESS,
    exitRequest
  ]);
  
  const exitExecData = scwInterface.encodeFunctionData("execute", [BALANCER_VAULT, 0, exitData]);
  
  console.log("Exit calldata length:", "0x" + exitExecData.slice(2).length + " chars");
  
  const exitTx = await signer.sendTransaction({
    to: SCW_ADDRESS,
    data: exitExecData,
    gasLimit: 3500000
  });
  
  console.log("WETH Exit TX: https://etherscan.io/tx/" + exitTx.hash);
  const receipt = await exitTx.wait();
  
  if (receipt.status === 1) {
    console.log("SUCCESS! WETH + BWZC recovered to SCW");
    console.log("Expected: ~0.000607 WETH + ~0.085 BWZC");
  } else {
    console.log("Exit failed - check logs");
  }
}

// ===== ENDPOINTS =====
let hasRun = false;

app.get("/health", (_, res) => res.json({ status: "live", ran: hasRun }));

app.get("/recover-weth", async (_, res) => {
  if (hasRun) return res.json({ error: "Already ran once" });
  try {
    await recoverWETH();
    hasRun = true;
    res.json({ success: true, message: "Recovery complete" });
  } catch (e) {
    console.error("Recovery error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-bpt", async (_, res) => {
  try {
    const bptContract = new ethers.Contract(WETH_POOL.bptAddr, bptAbi, provider);
    const balance = ethers.formatEther(await bptContract.balanceOf(SCW_ADDRESS));
    res.json({ bptBalance: balance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/reset", (_, res) => {
  hasRun = false;
  res.json({ success: true });
});

const server = app.listen(PORT, () => {
  console.log("WETH Recovery server live on port " + PORT);
  console.log("GET /recover-weth - Recover WETH");
  console.log("GET /check-bpt - Check BPT balance");
  console.log("GET /reset - Reset");
  
  // Auto-run
  setTimeout(async () => {
    console.log("Auto-recovery starting...");
    try {
      await recoverWETH();
    } catch (e) {
      console.error("Auto-recovery failed:", e.message);
    }
  }, 4000);
});
