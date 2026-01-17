// main.js - MANUAL ABI ENCODING (NO Interface)
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
const POOL_ID = "0x76ee58af556857605516aafa10c3bbd31abbb0990002000000000000000006ff";
const BPT = "0x76ee58af556857605516aafa10c3bbd31abbb099";
const VAULT = "0xba12222222228d8ba445958a75a0704d566bf2c8";
const BWZC = "0x54d1c2889b08cad0932266eade15ec884fa0cdc2";
const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

// ===== MANUAL ABI ENCODING =====
async function recoverWETH() {
  console.log("🚀 MANUAL ABI RECOVERY");
  
  // 1. Get BPT balance
  const bptAbi = ["function balanceOf(address) view returns(uint256)"];
  const bpt = new ethers.Contract(BPT, bptAbi, provider);
  const bptAmount = await bpt.balanceOf(SCW_ADDRESS);
  console.log("BPT:", ethers.formatEther(bptAmount));
  
  if (bptAmount === 0n) return console.log("✅ Already recovered");
  
  // 2. Approve BPT (this works)
  const approveAbi = ["function approve(address,uint256) returns(bool)"];
  const approveSelector = "0x095ea7b3";
  const approveData = approveSelector + 
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256"],
      [VAULT, bptAmount]
    ).slice(2);
  
  const scwAbi = ["function execute(address,uint256,bytes) returns(bytes)"];
  const scwSelector = "0x12537bbb";
  const approveExec = scwSelector + 
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "bytes"],
      [BPT, 0, "0x" + approveData.slice(10)] // skip selector
    ).slice(2);
  
  console.log("Approve calldata:", approveExec.slice(0, 20) + "...");
  const approveTx = await signer.sendTransaction({
    to: SCW_ADDRESS, data: "0x" + approveExec, gasLimit: 300000
  });
  console.log("APPROVE TX:", "https://etherscan.io/tx/" + approveTx.hash);
  await approveTx.wait();
  
  // 3. MANUAL exitPool encoding
  console.log("🚪 MANUAL exitPool...");
  
  // exitPool selector: keccak256("exitPool(bytes32,address,address,(address[],uint256[],bytes,bool))")
  const exitSelector = "0x3ec6d9d3";
  
  // Assets array: WETH(0), BWZC(1) - CRITICAL ORDER
  const assets = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]"], [[WETH, BWZC]]
  );
  
  // minAmountsOut
  const minAmounts = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256[]"], [[0n, 0n]]
  );
  
  // userData: kind=1 (EXACT_BPT_IN_FOR_TOKENS_OUT)
  const userData = ethers.AbiCoder.defaultAbiCoder().encode(
    ["uint256", "uint256", "uint256[]"],
    [1n, bptAmount, [0n, 0n]]
  );
  
  // exitRequest tuple
  const exitRequest = ethers.AbiCoder.defaultAbiCoder().encode(
    ["address[]", "uint256[]", "bytes", "bool"],
    [assets.slice(2), minAmounts.slice(2), userData.slice(2), false]
  );
  
  // exitPool args: poolId, sender, recipient, exitRequest
  const exitArgs = ethers.AbiCoder.defaultAbiCoder().encode(
    ["bytes32", "address", "address", "bytes"],
    [POOL_ID, SCW_ADDRESS, SCW_ADDRESS, "0x" + exitRequest.slice(2)]
  );
  
  const exitData = exitSelector + exitArgs.slice(2);
  
  // SCW execute
  const exitExec = scwSelector + 
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "uint256", "bytes"],
      [VAULT, 0, "0x" + exitData.slice(10)]
    ).slice(2);
  
  console.log("Exit calldata:", "0x" + exitExec.slice(0, 40));
  console.log("Calldata length:", ("0x" + exitExec).length);
  
  const exitTx = await signer.sendTransaction({
    to: SCW_ADDRESS, 
    data: "0x" + exitExec, 
    gasLimit: 5000000
  });
  
  console.log("EXIT TX:", "https://etherscan.io/tx/" + exitTx.hash);
  const receipt = await exitTx.wait();
  
  console.log("Status:", receipt.status === 1 ? "✅ SUCCESS" : "❌ FAILED");
}

// ===== ENDPOINTS =====
let hasRun = false;

app.get("/health", (_, res) => res.json({ status: "live", ran: hasRun }));
app.get("/recover-weth", async (_, res) => {
  if (hasRun) return res.json({ error: "Already ran" });
  hasRun = true;
  res.json({ success: true, message: "Manual recovery started..." });
  recoverWETH().catch(console.error);
});
app.get("/reset", (_, res) => { hasRun = false; res.json({ success: true }); });

app.listen(PORT, () => {
  console.log("Manual ABI server @ port " + PORT);
  setTimeout(recoverWETH, 3000);
});
