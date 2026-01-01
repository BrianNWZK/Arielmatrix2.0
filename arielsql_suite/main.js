// main.js — Direct approval (no AA, EOA pays gas)
import express from 'express';
import { ethers } from "ethers";

const RPC_URL = "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const TOKEN = "0x998232423d0b260ac397a893b360c8a254fcdd66";
const PAYMASTER = "0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9";
const SCW = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2";

const erc20Abi = ["function approve(address,uint256)"];
const scwAbi = ["function execute(address,uint256,bytes)"];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  const token = new ethers.Contract(TOKEN, erc20Abi, provider);
  const approveData = token.interface.encodeFunctionData("approve", [PAYMASTER, ethers.MaxUint256]);

  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [TOKEN, 0n, approveData]);

  const tx = await wallet.sendTransaction({ to: SCW, data: execData, gasLimit: 200000 });
  console.log(`Submitted: ${tx.hash}`);
  await tx.wait();
  console.log("✅ Paymaster approved from SCW (direct)");
}

main().catch(e => console.error("Fatal:", e.message || e));

// Keep alive
const app = express();
app.get('/', (req, res) => res.send('Direct approval worker'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
