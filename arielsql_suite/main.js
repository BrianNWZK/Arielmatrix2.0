// main.js
// One-shot: approve WETH for SCW via Uniswap V3 router

import { ethers } from "ethers";

const RPC_URL     = process.env.RPC_URL || "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2");

// Contracts
const WETH   = ethers.getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2");
const ROUTER = ethers.getAddress("0xE592427A0AEce92De3Edee1F18E0157C05861564"); // Uniswap V3 router

// ABIs
const scwAbi  = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];
const erc20Abi= ["function approve(address spender, uint256 amount) returns (bool)"];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const scwIface = new ethers.Interface(scwAbi);
  const ercIface = new ethers.Interface(erc20Abi);

  console.log(`EOA: ${wallet.address}`);
  console.log(`SCW: ${SCW}`);

  // Approve router to spend WETH from SCW
  const approveData = ercIface.encodeFunctionData("approve", [ROUTER, ethers.MaxUint256]);
  const execData    = scwIface.encodeFunctionData("execute", [WETH, 0n, approveData]);

  console.log("Sending SCW.execute -> approve WETH for router...");
  const tx = await wallet.sendTransaction({ to: SCW, data: execData, gasLimit: 200000 });
  console.log("Approval tx:", tx.hash);
  await tx.wait();
  console.log("✅ WETH approval complete");
}

main().catch(e => {
  console.error("Fatal:", e.message || e);
  process.exit(1);
});
