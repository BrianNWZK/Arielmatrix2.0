// approvals_with_pimlico.js — Approvals using Pimlico bundler + paymaster sponsorship
// Requires: SOVEREIGN_PRIVATE_KEY in env (0x-prefixed EOA key)

import { ethers } from 'ethers';
import {
  EnterpriseAASDK
} from '../modules/aa-loaves-fishes.js';

const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const SCW = '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2';
const PIMLICO_BUNDLER = 'https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt';

const ROUTERS = {
  UNISWAP_V3:    '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  UNISWAP_V2:    '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  SUSHI_V2:      '0xd9e1CE17f2641f24AE83637ab66a2cca9C378B9F',
  ONE_INCH_V5:   '0x1111111254EEB25477B68fb85Ed929f73A960582',
  PARASWAP_LITE: '0xDEF1C0DE00000000000000000000000000000000'
};

const PAYMASTER = '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47';

const TOKENS = {
  USDC:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  BWAEZI: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'
};

async function run() {
  const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x')) throw new Error('Missing SOVEREIGN_PRIVATE_KEY');
  const signer = new ethers.Wallet(pk, provider);

  const aa = new EnterpriseAASDK(signer, ENTRY_POINT);
  await aa.initialize(provider, SCW, PIMLICO_BUNDLER);

  const erc20Iface = new ethers.Interface(['function approve(address,uint256)']);
  const scwIface = new ethers.Interface(['function execute(address,uint256,bytes)']);

  // Approve USDC and BWAEZI to all routers
  for (const [name, router] of Object.entries(ROUTERS)) {
    for (const [label, token] of Object.entries(TOKENS)) {
      const data = erc20Iface.encodeFunctionData('approve', [router, ethers.MaxUint256]);
      const callData = scwIface.encodeFunctionData('execute', [token, 0n, data]);
      const userOp = await aa.createUserOp(callData, { callGasLimit: 400000n });
      const signed = await aa.signUserOp(userOp);
      const hash = await aa.sendUserOpWithBackoff(signed, 5);
      console.log(`Approved ${label} → ${name} router: ${hash}`);
    }
  }

  // Approve BWAEZI to paymaster
  const data = erc20Iface.encodeFunctionData('approve', [PAYMASTER, ethers.MaxUint256]);
  const callData = scwIface.encodeFunctionData('execute', [TOKENS.BWAEZI, 0n, data]);
  const userOp = await aa.createUserOp(callData, { callGasLimit: 400000n });
  const signed = await aa.signUserOp(userOp);
  const hash = await aa.sendUserOpWithBackoff(signed, 5);
  console.log(`Approved BWAEZI → Paymaster: ${hash}`);
}

run().catch(console.error);
