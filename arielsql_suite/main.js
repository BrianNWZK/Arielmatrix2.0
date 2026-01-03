// main.js — Transfer BWAEZI tokens
// 1. Transfer 100M BWAEZI from SCW to EOA (old token 0x998232...)
// 2. Transfer 30M BWAEZI from EOA to SCW (new token 0x54D1c288...)

import { ethers } from "ethers";

const RPC_URL     = "https://ethereum-rpc.publicnode.com";
const PRIVATE_KEY = process.env.PRIVATE_KEY; // EOA private key

const OLD_TOKEN = "0x998232423d0b260ac397a893b360c8a254fcdd66"; // old BWAEZI
const NEW_TOKEN = "0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2"; // new BWAEZI
const SCW       = "0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2"; // smart contract wallet
const EOA       = "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA"; // your EOA

const erc20Abi = ["function transfer(address to, uint256 amount) returns (bool)"];
const scwAbi   = ["function execute(address to, uint256 value, bytes data) returns (bytes)"];

async function main() {
  if (!PRIVATE_KEY) throw new Error("Missing PRIVATE_KEY");

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log(`EOA: ${wallet.address}`);
  console.log(`ETH balance: ${ethers.formatEther(await provider.getBalance(wallet.address))} ETH\n`);

  // === 1. Transfer 100M BWAEZI from SCW → EOA (old token) ===
  const amount100M = ethers.parseEther("100000000"); // 100M with 18 decimals

  const erc20Iface = new ethers.Interface(erc20Abi);
  const transferData = erc20Iface.encodeFunctionData("transfer", [EOA, amount100M]);

  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData("execute", [OLD_TOKEN, 0n, transferData]);

  const tx1 = await wallet.sendTransaction({
    to: SCW,
    data: execData,
    gasLimit: 300000
  });

  console.log(`1. Transfer 100M from SCW → EOA submitted: ${tx1.hash}`);
  await tx1.wait();
  console.log("✅ 100M transferred from SCW to EOA\n");

  // === 2. Transfer 30M BWAEZI from EOA → SCW (new token) ===
  const amount30M = ethers.parseEther("30000000"); // 30M with 18 decimals

  const newToken = new ethers.Contract(NEW_TOKEN, erc20Abi, wallet);
  const tx2 = await newToken.transfer(SCW, amount30M, { gasLimit: 200000 });

  console.log(`2. Transfer 30M from EOA → SCW submitted: ${tx2.hash}`);
  await tx2.wait();
  console.log("✅ 30M transferred from EOA to SCW");

  console.log("🎯 BOTH TRANSFERS COMPLETE");
}

main().catch(e => console.error("Fatal:", e.message || e));
