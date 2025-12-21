// scwmain.js — PositionManager approval ONLY. No deposits, no funding.
// Requirements:
//   - SOVEREIGN_PRIVATE_KEY: 0x-prefixed EOA private key (signer for SCW userOps)
// Optional:
//   - SCW_ADDRESS, BUNDLER_RPC_URL, RPC_URL

import { ethers } from 'ethers';
import { EnterpriseAASDK, EnhancedRPCManager } from '../modules/aa-loaves-fishes.js';

// ---- Runtime constants (override via env) ----
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';   // EntryPoint v0.6 (align with bundler)
const SCW = (process.env.SCW_ADDRESS || '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2').trim();
const BUNDLER = (process.env.BUNDLER_RPC_URL || 'https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt').trim();
const RPC_URLS = (process.env.RPC_URL ? [process.env.RPC_URL] : [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
]);

// PositionManager (Uniswap V3)
const POSITION_MANAGER = '0xC36442b4a4522E871399CD717aBDD847Ab11FE88';

// Tokens to approve (SCW as owner)
const TOKENS = {
  USDC:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  BWAEZI: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'
};

// Interfaces
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

async function initAA(provider, signer) {
  const aa = new EnterpriseAASDK(signer, ENTRY_POINT);
  // No paymaster sponsorship — approvals rely on existing prefund; this script does not fund.
  aa.paymasterMode = 'NONE';
  await aa.initialize(provider, SCW, BUNDLER);
  return aa;
}

async function approveTokenToPM(aa, tokenLabel, tokenAddr) {
  const data = erc20Iface.encodeFunctionData('approve', [POSITION_MANAGER, ethers.MaxUint256]);
  const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, data]);

  // Conservative gas params; bundler may override via simulation
  const userOp = await aa.createUserOp(callData, {
    callGasLimit: 350_000n,
    verificationGasLimit: 700_000n,
    preVerificationGas: 80_000n
  });

  const signed = await aa.signUserOp(userOp);
  const hash = await aa.sendUserOpWithBackoff(signed, 5);
  console.log(`[APPROVAL] ${tokenLabel} → PositionManager: ${hash}`);
}

async function runPositionManagerApprovals(aa) {
  // Approve USDC & BWAEZI to Uniswap V3 PositionManager
  await approveTokenToPM(aa, 'USDC', TOKENS.USDC);
  await approveTokenToPM(aa, 'BWAEZI', TOKENS.BWAEZI);
}

async function printPMAllowances(provider) {
  for (const [label, token] of Object.entries(TOKENS)) {
    const c = new ethers.Contract(token, erc20Iface, provider);
    const a = await c.allowance(SCW, POSITION_MANAGER);
    console.log(`Allowance ${label} → PositionManager: ${a.toString()}`);
  }
}

// ---- Main ----
(async () => {
  try {
    console.log(`Using SCW sender: ${SCW}`);

    const { provider, signer } = await initProviders();

    // Initialize AA (no deposit logic)
    const aa = await initAA(provider, signer);

    // Approvals ONLY: Uniswap V3 PositionManager
    await runPositionManagerApprovals(aa);

    // Verify allowances
    await printPMAllowances(provider);

    console.log('✅ PositionManager approvals complete (no deposits executed).');
    process.exit(0);
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
})();
