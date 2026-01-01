// main.js — Direct paymaster approval from SCW (EOA owner pays gas)
import express from 'express';
import { ethers } from "ethers";

const RPC_URL = "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // EOA — SCW owner

const TOKEN = "0x998232423d0b260ac397a893b360c8a254fcdd66"; // Current BWAEZI
const PAYMASTER = "0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9"; // New paymaster
const SCW = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2";

async function main() {
  if (!PRIVATE_KEY) throw "Missing PRIVATE_KEY";

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA (SCW owner): ${wallet.address}`);

  // ERC20 approve ABI
  const erc20Iface = new ethers.Interface(["function approve(address spender, uint256 amount) returns (bool)"]);
  const approveData = erc20Iface.encodeFunctionData("approve", [PAYMASTER, ethers.MaxUint256]);

  // SCW execute ABI
  const scwIface = new ethers.Interface(["function execute(address to, uint256 value, bytes data) returns (bytes)"]);
  const execData = scwIface.encodeFunctionData("execute", [TOKEN, 0n, approveData]);

  // Send
  const tx = await wallet.sendTransaction({
    to: SCW,
    data: execData,
    gasLimit: 300000 // Safe buffer
  });

  console.log(`Submitted direct approval tx: ${tx.hash}`);
  const rc = await tx.wait();

  if (rc.status === 1) {
    console.log("✅ Paymaster approved from SCW — on-chain success!");
  } else {
    console.log("❌ Reverted");
  }
}

main().catch(e => console.error("Fatal:", e.message || e));

// Keep Render alive
const app = express();
app.get('/', (req, res) => res.send('Direct approval worker'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
