// main.js — Final 6 approvals only (optimized for Render timeout)
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

// Only the 6 pending approvals
const PENDING = {
  BWAEZI_SUSHI:   { token: 'BWAEZI', spender: '0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F' },
  USDC_1INCH:     { token: 'USDC',   spender: '0x1111111254EEB25477B68fb85Ed929f73A960582' },
  BWAEZI_1INCH:   { token: 'BWAEZI', spender: '0x1111111254EEB25477B68fb85Ed929f73A960582' },
  USDC_PARASWAP:  { token: 'USDC',   spender: '0xDEF1C0DE00000000000000000000000000000000' },
  BWAEZI_PARASWAP:{ token: 'BWAEZI', spender: '0xDEF1C0DE00000000000000000000000000000000' },
  BWAEZI_PAYMASTER:{ token: 'BWAEZI', spender: '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47' }
};

const TOKENS = {
  USDC:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  BWAEZI: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'
};

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
  aa.paymasterMode = 'NONE';
  await aa.initialize(provider, SCW, BUNDLER);
  return { provider, aa };
}

async function approvePending(aa) {
  for (const { token, spender } of Object.values(PENDING)) {
    const tokenAddr = TOKENS[token];
    const data = erc20Iface.encodeFunctionData('approve', [spender, ethers.MaxUint256]);
    const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, data]);

    const userOp = await aa.createUserOp(callData, { callGasLimit: 400000n });
    const signed = await aa.signUserOp(userOp);
    const hash = await aa.sendUserOpWithBackoff(signed, 5);

    console.log(`[PENDING] ${token} → ${spender}: ${hash}`);
  }
}

(async () => {
  try {
    console.log(`[FINAL] Running 6 pending approvals on SCW ${SCW}`);
    const { aa } = await init();
    await approvePending(aa);
    console.log('✅ All approvals complete — BWAEZI gasless live!');
  } catch (e) {
    console.error('❌ Failed:', e);
  }
})();

// Keep Render happy
const app = express();
app.get('/', (req, res) => res.send('Approvals worker running'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
