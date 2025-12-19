// main.js — Idempotent EntryPoint deposit for SCW (single check + single send) and approvals to all spenders
// Requirements:
//   - SOVEREIGN_PRIVATE_KEY: 0x-prefixed EOA private key (must have ≥ 0.002 ETH)
// Optional:
//   - SCW_ADDRESS, BUNDLER_RPC_URL, DEPOSIT_ETH, DEPOSIT_MIN_ETH, RPC_URL, PAYMASTER_ADDRESS

import { ethers } from 'ethers';
import {
  EnterpriseAASDK,
  EnhancedRPCManager
} from '../modules/aa-loaves-fishes.js';

// ---- Runtime constants (override via env) ----
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const SCW = (process.env.SCW_ADDRESS || '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2').trim();
const BUNDLER = (process.env.BUNDLER_RPC_URL || 'https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt').trim();
const RPC_URLS = (process.env.RPC_URL ? [process.env.RPC_URL] : [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
]);

// Spend addresses
const ROUTERS = {
  UNISWAP_V3:    '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  UNISWAP_V2:    '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  SUSHI_V2:      '0xd9e1CE17f2641f24AE83637ab66a2cca9C378B9F',
  ONE_INCH_V5:   '0x1111111254EEB25477B68fb85Ed929f73A960582',
  PARASWAP_LITE: '0xDEF1C0DE00000000000000000000000000000000'
};

const PAYMASTER = (process.env.PAYMASTER_ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47').trim();

// Tokens
const TOKENS = {
  USDC:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  BWAEZI: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'
};

// EntryPoint ABI (deposit helpers)
const ENTRYPOINT_ABI = [
  'function depositTo(address account) payable',
  'function getDeposit(address account) view returns (uint256)'
];

// ERC20 + SCW execute interfaces
const erc20Iface = new ethers.Interface([
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)'
]);
const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);

// ---- Helpers ----

async function initProviders() {
  const mgr = new EnhancedRPCManager(RPC_URLS, 1);
  await mgr.init();
  const provider = mgr.getProvider();
  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x') || pk.length < 66) throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid');
  const signer = new ethers.Wallet(pk, provider);
  return { provider, signer };
}

// Idempotent deposit: check SCW deposit; if below min, send exactly one deposit tx from EOA
async function ensureScwDepositOnce(provider, signer) {
  const ep = new ethers.Contract(ENTRY_POINT, ENTRYPOINT_ABI, provider);
  const minEthStr = (process.env.DEPOSIT_MIN_ETH || '0.001');
  const sendEthStr = (process.env.DEPOSIT_ETH || '0.001');

  let current = 0n;
  try { current = await ep.getDeposit(SCW); } catch {}
  const minWei = ethers.parseEther(minEthStr);

  if (current >= minWei) {
    console.log(`EntryPoint deposit OK for SCW: ${ethers.formatEther(current)} ETH (>= ${minEthStr})`);
    return;
  }

  console.log(`Depositing ${sendEthStr} ETH to EntryPoint for SCW ${SCW}...`);
  const epWrite = ep.connect(signer);
  const tx = await epWrite.depositTo(SCW, { value: ethers.parseEther(sendEthStr) });
  console.log(`Deposit sent, txHash=${tx.hash}`);
  const rc = await tx.wait();
  console.log(`Deposit confirmed. Block=${rc.blockNumber}, txHash=${rc.transactionHash}`);

  // Post-check
  const updated = await ep.getDeposit(SCW);
  console.log(`New SCW deposit: ${ethers.formatEther(updated)} ETH`);
}

async function initAA(provider, signer) {
  const aa = new EnterpriseAASDK(signer, ENTRY_POINT);
  // Force approvals to rely on SCW deposit only (avoid AA31 on paymaster)
  aa.paymasterMode = 'NONE';
  await aa.initialize(provider, SCW, BUNDLER);
  return aa;
}

async function approveToken(aa, tokenLabel, tokenAddr, spenderAddr) {
  const data = erc20Iface.encodeFunctionData('approve', [spenderAddr, ethers.MaxUint256]);
  const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, data]);
  const userOp = await aa.createUserOp(callData, {
    callGasLimit: 350_000n,
    verificationGasLimit: 700_000n,
    preVerificationGas: 80_000n
  });
  const signed = await aa.signUserOp(userOp);
  const txHash = await aa.sendUserOpWithBackoff(signed, 5);
  console.log(`Approved ${tokenLabel} → ${spenderAddr}: ${txHash}`);
}

async function runApprovals(aa) {
  // Approve USDC & BWAEZI to all routers
  for (const [name, router] of Object.entries(ROUTERS)) {
    await approveToken(aa, 'USDC', TOKENS.USDC, router);
    await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, router);
  }
  // Approve BWAEZI to paymaster (allowance only; userOps use SCW deposit)
  await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, PAYMASTER);
}

async function printAllowances(provider) {
  for (const [label, token] of Object.entries(TOKENS)) {
    const c = new ethers.Contract(token, erc20Iface, provider);
    for (const [name, spender] of Object.entries({ ...ROUTERS, PAYMASTER })) {
      const a = await c.allowance(SCW, spender);
      console.log(`Allowance ${label} @ ${name}: ${a.toString()}`);
    }
  }
}

// ---- Main ----

(async () => {
  try {
    console.log(`Using SCW sender: ${SCW}`);

    const { provider, signer } = await initProviders();

    // 1) Check EntryPoint deposit for SCW; if below min, fund once from EOA
    await ensureScwDepositOnce(provider, signer);

    // 2) Initialize AA with Pimlico bundler, paymasterMode NONE for approvals
    const aa = await initAA(provider, signer);

    // 3) Deploy all approvals needed (routers + paymaster)
    await runApprovals(aa);

    // 4) Verify allowances
    await printAllowances(provider);

    console.log('✅ Approvals complete.');
    process.exit(0);
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
})();
