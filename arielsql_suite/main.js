// main.js — Direct approval for new paymaster (EOA pays gas — succeeds)
import express from 'express';
import { ethers } from "ethers";

const RPC_URL = "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // EOA owner

const TOKEN = "0x998232423d0b260ac397a893b360c8a254fcdd66"; // Current BWAEZI
const PAYMASTER = "0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9"; // New paymaster
const SCW = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2";

async function main() {
  if (!PRIVATE_KEY) throw "Missing PRIVATE_KEY";

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA owner: ${wallet.address}`);

  // ERC20 approve
  const erc20Iface = new ethers.Interface(["function approve(address spender, uint256 amount) returns (bool)"]);
  const approveData = erc20Iface.encodeFunctionData("approve", [PAYMASTER, ethers.MaxUint256]);

  // SCW execute (SimpleAccount standard ABI)
  const scwIface = new ethers.Interface(["function execute(address dest, uint256 value, bytes func) external"]);
  const execData = scwIface.encodeFunctionData("execute", [TOKEN, 0n, approveData]);

  console.log(`Calldata: ${execData}`); // Verify not empty

  const tx = await wallet.sendTransaction({
    to: SCW,
    data: execData,
    gasLimit: 300000
  });

  console.log(`Submitted: ${tx.hash}`);
  const rc = await tx.wait();

  if (rc.status === 1) {
    console.log("✅ New paymaster approved from SCW");
  } else {
    console.log("❌ Reverted");
  }
}

main().catch(e => console.error("Fatal:", e.message || e));

// Keep alive
const app = express();
app.get('/', (req, res) => res.send('Direct approval worker'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
