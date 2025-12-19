// approvals_with_pimlico_and_deposit.js
// One-shot approvals for USDC & BWAEZI → all routers + BWAEZI → paymaster
// Fixes AA21 by depositing minimal ETH to EntryPoint for the paymaster.
// Env required:
//   - SOVEREIGN_PRIVATE_KEY: 0x-prefixed EOA private key
// Optional env:
//   - SCW_ADDRESS, PAYMASTER_ADDRESS, BUNDLER_RPC_URL, PM_DEPOSIT_ETH

import { ethers } from 'ethers';
import { EnterpriseAASDK } from '../modules/aa-loaves-fishes.js';

// Constants (override via env if needed)
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

// Minimal EntryPoint ABI for deposit checks
const ENTRYPOINT_ABI = [
  'function depositTo(address account) payable',
  'function getDeposit(address account) view returns (uint256)'
];

const erc20Iface = new ethers.Interface([
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)'
]);
const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);

async function ensurePaymasterDeposit(provider, signer, paymasterAddr, minEth = '0.001', topUpEth = null) {
  const ep = new ethers.Contract(ENTRY_POINT, ENTRYPOINT_ABI, provider);
  let current = 0n;
  try { current = await ep.getDeposit(paymasterAddr); } catch {}
  const need = ethers.parseEther(minEth);
  if (current >= need) {
    console.log(`Paymaster deposit OK: ${ethers.formatEther(current)} ETH`);
    return;
  }
  const amount = ethers.parseEther((topUpEth || process.env.PM_DEPOSIT_ETH || '0.002').toString());
  console.log(`Depositing ${ethers.formatEther(amount)} ETH to EntryPoint for paymaster ${paymasterAddr}...`);
  const epWrite = ep.connect(signer);
  const tx = await epWrite.depositTo(paymasterAddr, { value: amount });
  const rc = await tx.wait();
  console.log(`Deposit tx: ${rc.transactionHash}`);
}

async function approveToken(aa, tokenLabel, tokenAddr, spenderAddr) {
  const approveData = erc20Iface.encodeFunctionData('approve', [spenderAddr, ethers.MaxUint256]);
  const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, approveData]);
  const userOp = await aa.createUserOp(callData, {
    callGasLimit: 350_000n,
    verificationGasLimit: 700_000n,
    preVerificationGas: 80_000n
  });
  const signed = await aa.signUserOp(userOp);
  const hash = await aa.sendUserOpWithBackoff(signed, 5);
  console.log(`Approved ${tokenLabel} → ${spenderAddr}: ${hash}`);
}

async function printAllowances(provider, scw) {
  for (const [label, token] of Object.entries(TOKENS)) {
    const c = new ethers.Contract(token, erc20Iface, provider);
    for (const [name, router] of Object.entries(ROUTERS)) {
      const a = await c.allowance(scw, router);
      console.log(`Allowance ${label} @ ${name}: ${a.toString()}`);
    }
    const pm = await c.allowance(scw, PAYMASTER);
    console.log(`Allowance ${label} @ PAYMASTER: ${pm.toString()}`);
  }
}

async function run() {
  const provider = new ethers.JsonRpcProvider('https://eth.llamarpc.com');

  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x') || pk.length < 66) throw new Error('Missing/invalid SOVEREIGN_PRIVATE_KEY');
  const signer = new ethers.Wallet(pk, provider);

  console.log(`Using SCW sender: ${SCW}`);

  // Initialize AA with Pimlico bundler
  const aa = new EnterpriseAASDK(signer, ENTRY_POINT);
  // Force PASSTHROUGH paymaster so paymasterAndData includes the on-chain paymaster address
  aa.paymasterMode = 'PASSTHROUGH';
  // initialize(provider, scw, bundlerUrl)
  await aa.initialize(provider, SCW, PIMLICO_BUNDLER);

  // Ensure prefund via paymaster deposit (prevents AA21)
  await ensurePaymasterDeposit(provider, signer, PAYMASTER, '0.001', '0.003');

  // Approve USDC & BWAEZI to all routers
  for (const [name, router] of Object.entries(ROUTERS)) {
    await approveToken(aa, 'USDC', TOKENS.USDC, router);
    await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, router);
  }

  // Approve BWAEZI to paymaster (required for sponsorship charging)
  await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, PAYMASTER);

  // Verify on-chain allowances
  await printAllowances(provider, SCW);

  console.log('✅ All approvals dispatched.');
}

run().catch((e) => {
  console.error(`❌ Failed: ${e.message}`);
  process.exit(1);
});
