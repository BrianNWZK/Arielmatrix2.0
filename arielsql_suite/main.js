// main.js — AA approvals with standard tx receipt confirmation
// SCW pays its own gas via EntryPoint deposit; no paymaster sponsorship
// No balance/prefund checks; confirms on-chain via EntryPoint tx receipt

import express from 'express';
import { ethers } from 'ethers';
import { EnterpriseAASDK, EnhancedRPCManager } from '../modules/aa-loaves-fishes.js';

const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const BUNDLER = 'https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt';
const SCW = ethers.getAddress(process.env.SCW_ADDRESS);

const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

const PENDING = {
  BWAEZI_PAYMASTER: { token: 'BWAEZI', spender: '0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9' }
};

const TOKENS = {
  BWAEZI: '0x998232423d0b260ac397a893b360c8a254fcdd66'
};

const erc20Iface = new ethers.Interface(['function approve(address,uint256)']);
const scwIface   = new ethers.Interface(['function execute(address _to,uint256 _value,bytes _data)']);

// EntryPoint event ABI to resolve txHash if SDK helper isn't available
const entryPointIface = new ethers.Interface([
  'event UserOperationEvent(bytes32 userOpHash, address sender, address paymaster, uint256 nonce, bool success, uint256 actualGasCost, uint256 actualGasUsed)'
]);

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
  aa.paymasterMode = 'NONE'; // SCW deposit pays gas
  await aa.initialize(provider, SCW, BUNDLER);

  // Keep nonce fresh to avoid validation reverts
  if (aa.fetchAndUpdateNonce) {
    await aa.fetchAndUpdateNonce();
  }

  return { provider, aa };
}

// Build SCW.execute( token, 0, approve(spender, MaxUint256) )
function buildApproveCallData(tokenAddr, spender) {
  const approveData = erc20Iface.encodeFunctionData('approve', [spender, ethers.MaxUint256]);
  return scwIface.encodeFunctionData('execute', [tokenAddr, 0n, approveData]);
}

// Try to resolve the EntryPoint transaction hash for a given UserOp hash
async function resolveEntryPointTxHash(provider, userOpHash) {
  // 1) Prefer SDK helper if available
  try {
    // Some SDKs expose this; if not present, it will throw
    if (typeof EnterpriseAASDK.prototype.getUserOpTransactionHash === 'function') {
      // We don't have the instance here; caller will pass aa when needed
      throw new Error('Use aa.getUserOpTransactionHash from caller');
    }
  } catch {
    // fallthrough to log scan
  }

  // 2) Scan recent EntryPoint logs for UserOperationEvent with userOpHash
  const eventTopic = entryPointIface.getEvent('UserOperationEvent').topicHash;
  const filter = {
    address: ENTRY_POINT,
    topics: [eventTopic, ethers.hexlify(userOpHash)], // indexed userOpHash
    // scan a reasonable recent range; adjust if needed
    fromBlock: 'latest',
    toBlock: 'latest'
  };

  // If single-block scan misses, widen the window
  try {
    const latest = await provider.getBlockNumber();
    const from = Math.max(0, latest - 5000);
    const logs = await provider.getLogs({
      address: ENTRY_POINT,
      topics: [eventTopic, ethers.hexlify(userOpHash)],
      fromBlock: from,
      toBlock: latest
    });
    if (logs.length > 0) {
      // transactionHash is directly on the log
      return logs[0].transactionHash;
    }
  } catch {
    // Ignore and let caller handle null
  }

  return null;
}

// Wait for the EntryPoint transaction receipt using a tx hash
async function waitForTxReceipt(provider, txHash, { pollMs = 4000, timeoutMs = 180000 } = {}) {
  const start = Date.now();
  while (true) {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (receipt) return receipt;
    if (Date.now() - start > timeoutMs) {
      throw new Error(`EntryPoint tx not mined within ${Math.floor(timeoutMs / 1000)}s: ${txHash}`);
    }
    await new Promise(r => setTimeout(r, pollMs));
  }
}

// Submit and confirm on-chain via tx receipt
async function submitAndConfirm(provider, aa, callData, label) {
  // First attempt: no manual gas overrides — let bundler estimate
  const userOp = await aa.createUserOp(callData, {});
  const signed = await aa.signUserOp(userOp);
  const userOpHash = await aa.sendUserOpWithBackoff(signed, 5);
  console.log(`[SUBMITTED] ${label}: ${userOpHash}`);

  // Resolve tx hash (SDK helper if present, else logs scan)
  let txHash = null;
  if (typeof aa.getUserOpTransactionHash === 'function') {
    txHash = await aa.getUserOpTransactionHash(userOpHash);
  }
  if (!txHash) {
    txHash = await resolveEntryPointTxHash(provider, userOpHash);
  }
  if (!txHash) {
    console.log(`⏳ Waiting for bundler to emit EntryPoint tx for ${label}...`);
    // Optional small delay before re-scan
    await new Promise(r => setTimeout(r, 5000));
    txHash = await resolveEntryPointTxHash(provider, userOpHash);
  }
  if (!txHash) {
    console.log(`⚠️ Could not resolve EntryPoint tx for ${label} yet. It may still be pending.`);
    return;
  }

  const receipt = await waitForTxReceipt(provider, txHash);
  if (receipt.status === 1) {
    console.log(`✅ On-chain confirmed: ${label} in EntryPoint tx ${txHash}`);
  } else {
    console.log(`❌ Reverted on-chain: ${label} in EntryPoint tx ${txHash}`);
  }
}

async function approvePending(provider, aa) {
  for (const { token, spender } of Object.values(PENDING)) {
    const tokenAddr = TOKENS[token];
    const callData = buildApproveCallData(tokenAddr, spender);
    await submitAndConfirm(provider, aa, callData, `${token} → ${spender}`);
  }
}

// Run worker
(async () => {
  try {
    console.log(`[FINAL] Running Paymaster approval on SCW ${SCW}`);
    const { provider, aa } = await init();
    await approvePending(provider, aa);
    console.log('✅ Approval flow finished');
  } catch (e) {
    console.error('❌ Failed:', e.reason || e.message || e);
  }
})();

// Keep service alive
const app = express();
app.get('/', (req, res) => res.send('Approvals worker running'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
