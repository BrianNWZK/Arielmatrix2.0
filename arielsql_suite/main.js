// main.js — Remaining pending approvals for SCW on new BWAEZI token
// Focused only on cross-chain arbitrage scaffolding (Wormhole/LayerZero)

import express from 'express';
import { ethers } from 'ethers';
import { EnterpriseAASDK, EnhancedRPCManager } from '../modules/aa-loaves-fishes.js';

const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const BUNDLER     = 'https://api.pimlico.io/v2/1/rpc?apikey=pim_4NdivPuNDvvKZ1e1aNPKrb';
const SCW         = ethers.getAddress(process.env.SCW_ADDRESS || '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2');

const RPC_URLS = [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
];

const TOKENS = {
  USDC:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  BWAEZI: '0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2'
};

// Pending approvals: only bridge contracts for cross-chain arb
// Replace with the actual deployed bridge contract addresses for Wormhole/LayerZero
const PENDING = {
  BWAEZI_WORMHOLE: { token: 'BWAEZI', spender: '0x98f3c9e6E3fAce36bAAd05FE09d375Ef1464288B' }, // Wormhole TokenBridge (Ethereum)
  BWAEZI_LAYERZERO: { token: 'BWAEZI', spender: '0x3c2269811836af69497E5F486A85D7316753cf62' } // LayerZero OFT endpoint (Ethereum)
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

async function getBundlerGas(provider) {
  try {
    const res = await provider.send('pimlico_getUserOperationGasPrice', []);
    let maxFeePerGas = BigInt(res.maxFeePerGas);
    let maxPriorityFeePerGas = BigInt(res.maxPriorityFeePerGas);
    const TIP_FLOOR = 50_000_000n;
    if (maxPriorityFeePerGas < TIP_FLOOR) maxPriorityFeePerGas = TIP_FLOOR;
    maxFeePerGas = (maxFeePerGas * 12n) / 10n;
    return { maxFeePerGas, maxPriorityFeePerGas };
  } catch {
    const fd = await provider.getFeeData();
    const base = fd.maxFeePerGas ?? ethers.parseUnits('35', 'gwei');
    const tip  = fd.maxPriorityFeePerGas ?? ethers.parseUnits('3', 'gwei');
    const TIP_FLOOR = 50_000_000n;
    return {
      maxFeePerGas: BigInt(base.toString()) * 12n / 10n,
      maxPriorityFeePerGas: (BigInt(tip.toString()) < TIP_FLOOR) ? TIP_FLOOR : BigInt(tip.toString())
    };
  }
}

async function approvePending(aa) {
  for (const { token, spender } of Object.values(PENDING)) {
    const tokenAddr = TOKENS[token];
    const data = erc20Iface.encodeFunctionData('approve', [spender, ethers.MaxUint256]);
    const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, data]);

    const { maxFeePerGas, maxPriorityFeePerGas } = await getBundlerGas(aa.provider);

    const userOp = await aa.createUserOp(callData, {
      callGasLimit: 400000n,
      verificationGasLimit: 700000n,
      preVerificationGas: 80000n,
      maxFeePerGas,
      maxPriorityFeePerGas
    });
    const signed = await aa.signUserOp(userOp);
    const hash = await aa.sendUserOpWithBackoff(signed, 5);

    console.log(`[APPROVAL] ${token} → ${spender}: ${hash}`);
  }
}

(async () => {
  try {
    console.log(`[FINAL] Running bridge approvals on SCW ${SCW}`);
    const { aa } = await init();
    await approvePending(aa);
    console.log('✅ Wormhole/LayerZero approvals complete — SCW ready for cross-chain arbitrage');
  } catch (e) {
    console.error('❌ Failed:', e);
  }
})();

// Keep Render happy
const app = express();
app.get('/', (req, res) => res.send('Bridge approval worker running'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
