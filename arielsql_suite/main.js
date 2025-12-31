// main.js — Final approval only (Paymaster BWAEZI) — SCW pays its own gas
// No EOA top-ups. Hardened preflight + safe gas settings.

import express from 'express';
import { ethers } from 'ethers';
import { EnterpriseAASDK, EnhancedRPCManager } from '../modules/aa-loaves-fishes.js';

// Constants
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const BUNDLER = 'https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt';
const SCW = ethers.getAddress(process.env.SCW_ADDRESS || '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2');

const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

// Pending approvals
const PENDING = {
  BWAEZI_PAYMASTER: { token: 'BWAEZI', spender: '0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9' }
};

// Token addresses
const TOKENS = {
  USDC:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  BWAEZI: '0x998232423d0b260ac397a893b360c8a254fcdd66'
};

// Interfaces
const erc20Iface = new ethers.Interface(['function approve(address,uint256)']);
const scwIface   = new ethers.Interface(['function execute(address,uint256,bytes)']);

// Initialize AA SDK
async function init() {
  const mgr = new EnhancedRPCManager(RPC_URLS, 1);
  await mgr.init();
  const provider = mgr.getProvider();

  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x') || pk.length < 66) {
    throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid');
  }
  const signer = new ethers.Wallet(pk, provider);

  const aa = new EnterpriseAASDK(signer, ENTRY_POINT);
  aa.paymasterMode = 'NONE'; // SCW pays its own prefund
  await aa.initialize(provider, SCW, BUNDLER);

  // Ensure nonce is fresh
  if (aa.fetchAndUpdateNonce) {
    await aa.fetchAndUpdateNonce();
  }

  return { provider, aa, signer };
}

// Bundler gas fees (fallback to modest values)
async function getBundlerGas(provider) {
  try {
    const res = await provider.send('pimlico_getUserOperationGasPrice', []);
    return {
      maxFeePerGas: BigInt(res.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(res.maxPriorityFeePerGas)
    };
  } catch {
    return {
      maxFeePerGas: ethers.parseUnits('3', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei')
    };
  }
}

// Preflight checks to avoid on-chain revert
async function preflightChecks(provider, scwAddress, tokenAddr, spender, data) {
  // 1) Ensure SCW, token, and spender have code where expected
  const [codeSCW, codeToken, codeSpender] = await Promise.all([
    provider.getCode(scwAddress),
    provider.getCode(tokenAddr),
    provider.getCode(spender)
  ]);

  if (codeSCW === '0x') throw new Error(`SCW has no code at ${scwAddress}`);
  if (codeToken === '0x') throw new Error(`Token has no code at ${tokenAddr}`);
  if (codeSpender === '0x') console.warn(`Warning: spender ${spender} has no code (EOA). Approve still OK, but verify address.`);

  // 2) Dry-run the token approve from SCW context
  // This simulates whether the token would accept the approve call from SCW.
  try {
    await provider.call({ to: tokenAddr, from: scwAddress, data });
  } catch (e) {
    throw new Error(`Preflight approve reverted: ${e.shortMessage || e.message}`);
  }
}

// Approve pending tokens — safer preVerificationGas + preflight
async function approvePending(aa, provider) {
  for (const { token, spender } of Object.values(PENDING)) {
    const tokenAddr = TOKENS[token];
    const approveData = erc20Iface.encodeFunctionData('approve', [spender, ethers.MaxUint256]);
    const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, approveData]);

    // Preflight checks
    await preflightChecks(aa.provider, SCW, tokenAddr, spender, approveData);

    const { maxFeePerGas, maxPriorityFeePerGas } = await getBundlerGas(aa.provider);

    // Safe gas settings: enough to avoid bundler “preVerificationGas too low”
    const userOp = await aa.createUserOp(callData, {
      callGasLimit: 50000n,            // buffer for SCW.execute + ERC20 approve
      verificationGasLimit: 120000n,   // ample for validation paths
      preVerificationGas: 65000n,      // > required 46155 observed in logs
      maxFeePerGas,
      maxPriorityFeePerGas
    });

    const signed = await aa.signUserOp(userOp);
    const hash = await aa.sendUserOpWithBackoff(signed, 3);
    console.log(`[PENDING] ${token} → ${spender}: ${hash}`);
  }
}

// Run worker
(async () => {
  try {
    console.log(`[FINAL] Running Paymaster approval on SCW ${SCW}`);
    const { aa, provider } = await init();
    await approvePending(aa, provider);
    console.log('✅ Paymaster approval complete — BWAEZI gasless live!');
  } catch (e) {
    console.error('❌ Failed:', e);
  }
})();

// Keep Render happy
const app = express();
app.get('/', (req, res) => res.send('Approvals worker running'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
