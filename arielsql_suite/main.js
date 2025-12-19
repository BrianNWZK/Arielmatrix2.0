// approvals_scw_deposit.js — Deposit 0.001 ETH to EntryPoint for SCW, then run approvals
// Env required: SOVEREIGN_PRIVATE_KEY (EOA key with ≥0.002 ETH balance)

import { ethers } from 'ethers';
import { EnterpriseAASDK } from '../modules/aa-loaves-fishes.js';

const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const SCW = process.env.SCW_ADDRESS || '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2';
const PIMLICO_BUNDLER = process.env.BUNDLER_RPC_URL || 'https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt';

const ROUTERS = {
  UNISWAP_V3:    '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  UNISWAP_V2:    '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  SUSHI_V2:      '0xd9e1CE17f2641f24AE83637ab66a2cca9C378B9F',
  ONE_INCH_V5:   '0x1111111254EEB25477B68fb85Ed929f73A960582',
  PARASWAP_LITE: '0xDEF1C0DE00000000000000000000000000000000'
};

const PAYMASTER = process.env.PAYMASTER_ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47';

const TOKENS = {
  USDC:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  BWAEZI: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'
};

const ENTRYPOINT_ABI = [
  'function depositTo(address account) payable',
  'function getDeposit(address account) view returns (uint256)'
];

const erc20Iface = new ethers.Interface(['function approve(address,uint256)']);
const scwIface = new ethers.Interface(['function execute(address,uint256,bytes)']);

async function ensureScwDeposit(provider, signer, scwAddr, minEth = '0.001') {
  const ep = new ethers.Contract(ENTRY_POINT, ENTRYPOINT_ABI, provider);
  let current = 0n;
  try { current = await ep.getDeposit(scwAddr); } catch {}
  const need = ethers.parseEther(minEth);
  if (current >= need) {
    console.log(`SCW deposit OK: ${ethers.formatEther(current)} ETH`);
    return;
  }
  const amount = need;
  console.log(`Depositing ${ethers.formatEther(amount)} ETH to EntryPoint for SCW ${scwAddr}...`);
  const epWrite = ep.connect(signer);
  const tx = await epWrite.depositTo(scwAddr, { value: amount });
  const rc = await tx.wait();
  console.log(`Deposit tx: ${rc.transactionHash}`);
}

async function approveToken(aa, tokenLabel, tokenAddr, spenderAddr) {
  const data = erc20Iface.encodeFunctionData('approve', [spenderAddr, ethers.MaxUint256]);
  const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, data]);
  const userOp = await aa.createUserOp(callData, { callGasLimit: 350000n });
  const signed = await aa.signUserOp(userOp);
  const hash = await aa.sendUserOpWithBackoff(signed, 5);
  console.log(`Approved ${tokenLabel} → ${spenderAddr}: ${hash}`);
}

async function run() {
  const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');
  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x')) throw new Error('Missing SOVEREIGN_PRIVATE_KEY');
  const signer = new ethers.Wallet(pk, provider);

  console.log(`Using SCW sender: ${SCW}`);

  // Deposit 0.001 ETH to EntryPoint for SCW
  await ensureScwDeposit(provider, signer, SCW, '0.001');

  // Initialize AA with Pimlico bundler
  const aa = new EnterpriseAASDK(signer, ENTRY_POINT);
  aa.paymasterMode = 'PASSTHROUGH';
  await aa.initialize(provider, SCW, PIMLICO_BUNDLER);

  // Approve USDC & BWAEZI to all routers
  for (const [name, router] of Object.entries(ROUTERS)) {
    await approveToken(aa, 'USDC', TOKENS.USDC, router);
    await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, router);
  }

  // Approve BWAEZI to paymaster
  await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, PAYMASTER);

  console.log('✅ All approvals dispatched.');
}

run().catch((e) => {
  console.error(`❌ Failed: ${e.message}`);
  process.exit(1);
});
