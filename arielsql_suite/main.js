// main.js — Paymaster approval only (SCW via paymaster sponsorship, with receipt confirmation)
import express from 'express';
import { ethers } from 'ethers';
import { EnterpriseAASDK, EnhancedRPCManager } from '../modules/aa-loaves-fishes.js';

const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const BUNDLER = 'https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt';
const SCW = ethers.getAddress(process.env.SCW_ADDRESS || '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2');

const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

// Paymaster approval target
const TOKEN = '0x998232423d0b260ac397a893b360c8a254fcdd66'; // BWAEZI token
const PAYMASTER = '0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9'; // spender

// ABIs
const erc20Iface = new ethers.Interface(['function approve(address,uint256)']);
const scwIface   = new ethers.Interface(['function execute(address,uint256,bytes)']);

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
  aa.paymasterMode = 'API'; // use paymaster sponsorship
  await aa.initialize(provider, SCW, BUNDLER);

  if (aa.fetchAndUpdateNonce) {
    await aa.fetchAndUpdateNonce();
  }

  return { provider, aa };
}

function buildApproveCallData() {
  const approveData = erc20Iface.encodeFunctionData('approve', [PAYMASTER, ethers.MaxUint256]);
  return scwIface.encodeFunctionData('execute', [TOKEN, 0n, approveData]);
}

async function approvePaymaster(provider, aa) {
  const callData = buildApproveCallData();

  const userOp = await aa.createUserOp(callData, {
    callGasLimit: 400000n,
    verificationGasLimit: 700000n,
    preVerificationGas: 80000n
  });

  const signed = await aa.signUserOp(userOp);
  const userOpHash = await aa.sendUserOpWithBackoff(signed, 5);
  console.log(`[SUBMITTED] Paymaster approval UserOp: ${userOpHash}`);

  // Resolve EntryPoint tx hash and wait for receipt
  let txHash = null;
  if (typeof aa.getUserOpTransactionHash === 'function') {
    txHash = await aa.getUserOpTransactionHash(userOpHash);
  }

  if (txHash) {
    const receipt = await provider.waitForTransaction(txHash);
    if (receipt.status === 1) {
      console.log(`✅ On-chain confirmed in EntryPoint tx ${txHash}`);
    } else {
      console.log(`❌ Reverted in EntryPoint tx ${txHash}`);
    }
  } else {
    console.log('⚠️ Could not resolve EntryPoint tx hash yet. Check bundler/Etherscan with the UserOp hash.');
  }
}

// Run worker
(async () => {
  try {
    console.log(`[FINAL] Running Paymaster approval on SCW ${SCW}`);
    const { provider, aa } = await init();
    await approvePaymaster(provider, aa);
    console.log('✅ Paymaster approval flow finished');
  } catch (e) {
    console.error('❌ Failed:', e.reason || e.message || e);
  }
})();

// Keep service alive
const app = express();
app.get('/', (req, res) => res.send('Paymaster approval worker running'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
