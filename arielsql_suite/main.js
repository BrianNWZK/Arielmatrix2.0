// main.js — Direct approval for new paymaster (EOA pays gas, SCW approves)
import express from 'express';
import { ethers } from "ethers";

const RPC_URL = "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // EOA (owner of SCW)

const TOKEN = "0x998232423d0b260ac397a893b360c8a254fcdd66"; // BWAEZI
const PAYMASTER = "0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9"; // New paymaster
const SCW = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2";

const erc20Abi = ["function approve(address spender, uint256 amount) returns (bool)"];
const scwAbi = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];

async function main() {
  if (!PRIVATE_KEY) throw "Missing PRIVATE_KEY";

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA (owner): ${wallet.address}`);

  const token = new ethers.Contract(TOKEN, erc20Abi, wallet);
  const approveData = token.interface.encodeFunctionData("approve", [PAYMASTER, ethers.MaxUint256]);

  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [TOKEN, 0n, approveData]);

  const tx = await wallet.sendTransaction({
    to: SCW,
    data: execData,
    gasLimit: 300000 // Safe buffer
  });

  console.log(`Submitted: ${tx.hash}`);
  const rc = await tx.wait();
  if (rc.status === 1) {
    console.log("✅ Approval succeeded on-chain");
  } else {
    console.log("❌ Reverted");
  }
}

main().catch(e => console.error("Fatal:", e.message || e));

// Keep Render alive
const app = express();
app.get('/', (req, res) => res.send('Direct approval running'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
