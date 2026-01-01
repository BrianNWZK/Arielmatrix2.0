import express from 'express';
import { ethers } from 'ethers';

const RPC_URL = 'https://ethereum-rpc.publicnode.com';
const PRIVATE_KEY = process.env.SOVEREIGN_PRIVATE_KEY;
const SCW = '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2';
const TOKEN = '0x998232423d0b260ac397a893b360c8a254fcdd66';
const SPENDER = '0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9';

const erc20Abi = ['function approve(address spender,uint256 value)'];
const scwAbi = ['function execute(address _to,uint256 _value,bytes _data)'];

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // Encode approve
  const token = new ethers.Contract(TOKEN, erc20Abi, provider);
  const approveData = token.interface.encodeFunctionData('approve', [SPENDER, ethers.MaxUint256]);

  // Encode SCW.execute
  const scwIface = new ethers.Interface(scwAbi);
  const execData = scwIface.encodeFunctionData('execute', [TOKEN, 0n, approveData]);

  // Send transaction directly
  const tx = await wallet.sendTransaction({
    to: SCW,
    data: execData
  });

  console.log(`Submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status === 1) {
    console.log('✅ Paymaster approved from SCW');
  } else {
    console.log('❌ Reverted on-chain');
  }
}

main().catch(e => console.error('Fatal:', e.message || e));

const app = express();
app.get('/', (req, res) => res.send('Direct approval worker'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
