// main.js — Direct EOA → SCW.execute approvals (contract call; robust encoding)
// EOA pays gas; no AA, no deposit checks

import express from 'express';
import { ethers } from 'ethers';

// Config
const RPC_URL = 'https://ethereum-rpc.publicnode.com';
const PRIVATE_KEY = process.env.SOVEREIGN_PRIVATE_KEY; // must be 0x... hex
const SCW = '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2';
const TOKEN = '0x998232423d0b260ac397a893b360c8a254fcdd66'; // BWAEZI
const SPENDER = '0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9'; // Paymaster

// ABIs
const erc20Abi = ['function approve(address spender, uint256 value)'];
const scwAbi = ['function execute(address _to, uint256 _value, bytes _data)'];

async function main() {
  if (!PRIVATE_KEY || !PRIVATE_KEY.startsWith('0x') || PRIVATE_KEY.length < 66) {
    throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid');
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // Prepare approve calldata
  const token = new ethers.Contract(TOKEN, erc20Abi, provider);
  const approveData = token.interface.encodeFunctionData('approve', [SPENDER, ethers.MaxUint256]);

  // Call SCW.execute via contract (ensures proper encoding + gas estimation)
  const scw = new ethers.Contract(SCW, scwAbi, wallet);

  // Populate transaction to ensure non-empty data and correct gas
  const txRequest = await scw.populateTransaction.execute(TOKEN, 0n, approveData);

  // Optional: set max fee caps from network (no hardcoded gasLimit)
  const fees = await provider.getFeeData();
  txRequest.maxFeePerGas = fees.maxFeePerGas ?? undefined;
  txRequest.maxPriorityFeePerGas = fees.maxPriorityFeePerGas ?? undefined;

  // Send
  const tx = await wallet.sendTransaction(txRequest);
  console.log(`Submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  if (receipt.status === 1) {
    console.log('✅ Paymaster approved from SCW (direct EOA → execute)');
  } else {
    console.log('❌ Reverted on-chain. Check SCW permissions for execute and token approve constraints.');
  }
}

main().catch((e) => {
  // Print revert data if present
  const msg = e?.reason || e?.shortMessage || e?.message || String(e);
  console.error('Fatal:', msg);
});

// Keep alive
const app = express();
app.get('/', (req, res) => res.send('Direct approval worker'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
