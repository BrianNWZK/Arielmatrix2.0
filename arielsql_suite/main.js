// approvals_only/main.js — Approve USDC & BWAEZI for all routers + paymaster (SCW already deployed)
// Requirements:
//   - SOVEREIGN_PRIVATE_KEY: 0x-prefixed EOA private key (signer)
// Optional:
//   - SCW_ADDRESS, BUNDLER_RPC_URL (will fall back to AA_CONFIG)

import { ethers } from 'ethers';
import {
  ENHANCED_CONFIG as AA_CONFIG,
  EnhancedRPCManager,
  EnterpriseAASDK
} from '../modules/aa-loaves-fishes.js';

function addrStrict(a) { try { return ethers.getAddress(String(a).trim()); } catch { return String(a).trim(); } }

const RUNTIME = {
  // EntryPoint v0.7 (mainnet)
  ENTRY_POINT: addrStrict(AA_CONFIG.ENTRY_POINTS?.V07 || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),

  // Tokens
  TOKENS: {
    USDC:  addrStrict(AA_CONFIG.USDC_ADDRESS   || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    BWAEZI: addrStrict(AA_CONFIG.BWAEZI_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'),
  },

  // Routers and aggregators
  ROUTERS: {
    UNISWAP_V3:    addrStrict('0xE592427A0AEce92De3Edee1F18E0157C05861564'),
    UNISWAP_V2:    addrStrict('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'),
    SUSHI_V2:      addrStrict('0xd9e1CE17f2641f24AE83637ab66a2cca9C378B9F'),
    ONE_INCH_V5:   addrStrict('0x1111111254EEB25477B68fb85Ed929f73A960582'),
    PARASWAP_LITE: addrStrict('0xDEF1C0DE00000000000000000000000000000000')
  },

  // Paymaster (verifying) for BWAEZI sponsorship
  PAYMASTER: addrStrict(AA_CONFIG.PAYMASTER?.ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47'),

  // SCW (already deployed)
  SCW: addrStrict(process.env.SCW_ADDRESS || AA_CONFIG.SCW_ADDRESS || '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2'),

  // RPC and bundler
  RPCS: AA_CONFIG.PUBLIC_RPC_ENDPOINTS?.length ? AA_CONFIG.PUBLIC_RPC_ENDPOINTS : [
    'https://ethereum-rpc.publicnode.com',
    'https://rpc.ankr.com/eth',
    'https://eth.llamarpc.com'
  ],
  BUNDLER: process.env.BUNDLER_RPC_URL || AA_CONFIG.BUNDLER?.RPC_URL || ''
};

// Interfaces
const erc20Iface = new ethers.Interface([
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)'
]);
const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);

async function init() {
  const rpc = new EnhancedRPCManager(RUNTIME.RPCS, Number(AA_CONFIG.NETWORK.chainId || 1));
  await rpc.init();
  const provider = rpc.getProvider();

  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x') || pk.length < 66) {
    throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid');
  }
  const signer = new ethers.Wallet(pk, provider);

  const aa = new EnterpriseAASDK(signer, RUNTIME.ENTRY_POINT);
  await aa.initialize(provider, RUNTIME.SCW, RUNTIME.BUNDLER);

  return { provider, aa };
}

async function approveToken(aa, tokenLabel, tokenAddr, spenderAddr) {
  const approveData = erc20Iface.encodeFunctionData('approve', [spenderAddr, ethers.MaxUint256]);
  const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, approveData]);
  const userOp = await aa.createUserOp(callData, { callGasLimit: 300_000n });
  const signed = await aa.signUserOp(userOp);
  const txHash = await aa.sendUserOpWithBackoff(signed, 5);
  console.log(`Approved ${tokenLabel} → ${spenderAddr}: ${txHash}`);
}

async function runApprovals(aa) {
  // Approve USDC and BWAEZI to all routers
  for (const [name, router] of Object.entries(RUNTIME.ROUTERS)) {
    await approveToken(aa, 'USDC', RUNTIME.TOKENS.USDC, router);
    await approveToken(aa, 'BWAEZI', RUNTIME.TOKENS.BWAEZI, router);
  }
  // Approve BWAEZI to the verifying paymaster (required for sponsorship charging)
  await approveToken(aa, 'BWAEZI', RUNTIME.TOKENS.BWAEZI, RUNTIME.PAYMASTER);
}

async function printAllowances(provider) {
  for (const [label, token] of Object.entries(RUNTIME.TOKENS)) {
    const c = new ethers.Contract(token, erc20Iface, provider);
    // Routers
    for (const [name, router] of Object.entries(RUNTIME.ROUTERS)) {
      const a = await c.allowance(RUNTIME.SCW, router);
      console.log(`Allowance ${label} @ ${name}: ${a.toString()}`);
    }
    // Paymaster (only relevant for BWAEZI)
    const pm = await c.allowance(RUNTIME.SCW, RUNTIME.PAYMASTER);
    console.log(`Allowance ${label} @ PAYMASTER: ${pm.toString()}`);
  }
}

(async () => {
  try {
    console.log('🚀 Approvals-only run (SCW already deployed)');
    const { provider, aa } = await init();

    await runApprovals(aa);
    await printAllowances(provider);

    console.log('✅ All approvals dispatched. Exiting.');
    process.exit(0);
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
})();
