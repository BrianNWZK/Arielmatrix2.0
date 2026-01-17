// main.js - WETH RECOVERY ONLY (SYNTAX FIXED)
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

// ===== WETH POOL ONLY =====
const WETH_POOL = {
  poolId: "0x76ee58af556857605516aafa10c3bbd31abbb0990002000000000000000006ff",
  bptAddr: "0x76EE58AF556857605516aAFA10C3bBD31AbBB099",
  label: "WETH/BWZC"
};

const BALANCER_VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const BWZC_TOKEN = "0x54d1c2889b08cad0932266eade15ec884fa0cdc2";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

// ===== ABIs =====
const scwAbi = ["function execute(address to,uint256 value,bytes data) returns(bytes)"];
const bptAbi = [
  "function approve(address,uint256) returns(bool)", 
  "function balanceOf(address) view returns(uint256)"
];
const vaultAbi = [
  "function exitPool(bytes32 poolId,address sender,address recipient,(address[] assets,uint256[] minAmountsOut,bytes userData,bool toInternalBalance) request)"
];

// ===== WETH RECOVERY ONLY =====
async function recoverWETH() {
  console.log("Recovering WETH from WETH/BWZC pool...");
  
  // 1. Check BPT balance
  const bpt = new ethers.Contract(WETH_POOL.bptAddr, bptAbi, provider);
  const bptBalance = await bpt.balanceOf(SCW_ADDRESS);
  console.log("WETH BPT Balance:", ethers.formatEther(bptBalance));
  
  if (bptBalance === 0n) {
    console.log("No WETH BPT found");
    return;
  }
  
  // 2. SCW approves BPT to Vault (CRITICAL)
  console.log("1. SCW approves BPT...");
  const approveBptData = new ethers.Interface(bptAbi).encodeFunctionData("approve", [BALANCER_VAULT, bptBalance]);
  const scwApproveData = new ethers.Interface(scwAbi).encodeFunctionData("execute", [WETH_POOL.bptAddr, 0n, approveBptData]);
  
  const approveTx = await signer.sendTransaction({
    to: SCW_ADDRESS,
    data: scwApproveData,
    gasLimit: 200000
  });
  console.log("SCW BPT Approve TX: https://etherscan.io/tx/" + approveTx.hash);
  await approveTx.wait();
  
  // 3. SCW exitPool
  console.log("2. SCW exits WETH pool...");
  const vaultIface = new ethers.Interface(vaultAbi);
  const assets = [BWZC_TOKEN, WETH];
  
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "uint256[]"],
    [1n, bptBalance, [0n, 0n]]
  );
  
  const exitData = vaultIface.encodeFunctionData("exitPool", [
    WETH_POOL.poolId,
    SCW_ADDRESS,
    SCW_ADDRESS,
    {
      assets,
      minAmountsOut: [0n, 0n],
      userData,
      toInternalBalance: false
    }
  ]);
  
  const execData = new ethers.Interface(scwAbi).encodeFunctionData("execute", [BALANCER_VAULT, 0n, exitData]);
  
  const withdrawTx = await signer.sendTransaction({
    to: SCW_ADDRESS,
    data: execData,
    gasLimit: 3000000
  });
  
  console.log("WETH RECOVERY TX: https://etherscan.io/tx/" + withdrawTx.hash);
  const receipt = await withdrawTx.wait();
  
  if (receipt.status === 1) {
    console.log("WETH + BWZC RECOVERED from WETH pool!");
    console.log("Check SCW balances for WETH + BWZC");
  } else {
    console.log("WETH recovery failed");
  }
}

// ===== SERVER =====
let hasRun = false;

app.get("/health", (_, res) => res.json({ status: "live", ran: hasRun }));

app.get("/recover-weth", async (_, res) => {
  if (hasRun) return res.json({ error: "Already ran" });
  try {
    await recoverWETH();
    hasRun = true;
    res.json({ success: true, message: "WETH recovered!" });
  } catch (e) {
    console.error("WETH recovery error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/check-weth-bpt", async (_, res) => {
  try {
    const bpt = new ethers.Contract(WETH_POOL.bptAddr, bptAbi, provider);
    const balance = ethers.formatEther(await bpt.balanceOf(SCW_ADDRESS));
    res.json({ wethBptBalance: balance });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/reset", (_, res) => {
  hasRun = false;
  res.json({ success: true });
});

const server = app.listen(PORT, async () => {
  console.log("WETH Recovery server @ port " + PORT);
  console.log("Endpoints:");
  console.log("  GET /recover-weth  - Recover WETH pool");
  console.log("  GET /check-weth-bpt - Check WETH BPT");
  console.log("  GET /reset         - Reset");
  
  setTimeout(async () => {
    console.log("Auto-recovering WETH in 3s...");
    await recoverWETH();
  }, 3000);
});
