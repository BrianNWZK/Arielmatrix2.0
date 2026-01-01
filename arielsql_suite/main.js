// main.js — AA approvals with corrected callData and nonce handling
// SCW pays its own gas via EntryPoint deposit

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
const scwIface   = new ethers.Interface(['function execute(address dest,uint256 value,bytes func)']);

async function init() {
  const mgr = new EnhancedRPCManager(RPC_URLS, 1);
  await mgr.init();
  const provider = mgr.getProvider();

  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  const signer = new ethers.Wallet(pk, provider);

  const aa = new EnterpriseAASDK(signer, ENTRY_POINT);
  aa.paymasterMode = 'NONE';
  await aa.initialize(provider, SCW, BUNDLER);

  // Always refresh nonce before building UserOp
  if (aa.fetchAndUpdateNonce) {
    await aa.fetchAndUpdateNonce();
  }

  return { provider, aa };
}

async function approvePending(provider, aa) {
  for (const { token, spender } of Object.values(PENDING)) {
    const tokenAddr = TOKENS[token];
    const approveData = erc20Iface.encodeFunctionData('approve', [spender, ethers.MaxUint256]);

    // Correct SCW.execute encoding
    const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, approveData]);

    // Build UserOp with safe gas buffers
    const userOp = await aa.createUserOp(callData, {
      callGasLimit: 150000n,
      verificationGasLimit: 400000n,
      preVerificationGas: 120000n
    });

    const signed = await aa.signUserOp(userOp);
    const hash = await aa.sendUserOpWithBackoff(signed, 5);
    console.log(`[SUBMITTED] ${token} → ${spender}: ${hash}`);

    // Wait for receipt
    const receipt = await provider.send('eth_getUserOperationReceipt', [hash]);
    if (receipt && receipt.success) {
      console.log(`✅ On-chain confirmed: ${token} approval in tx ${receipt.receipt.transactionHash}`);
    } else {
      console.log(`❌ Reverted again: check SCW owner/signature or token contract`);
    }
  }
}

(async () => {
  try {
    console.log(`[FINAL] Running approval on SCW ${SCW}`);
    const { provider, aa } = await init();
    await approvePending(provider, aa);
  } catch (e) {
    console.error('❌ Failed:', e.reason || e.message || e);
  }
})();

const app = express();
app.get('/', (req, res) => res.send('Approvals worker running'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
