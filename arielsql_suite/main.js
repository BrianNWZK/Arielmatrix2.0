// main.js — Remaining pending approvals for SCW on new BWAEZI token
// Removes confirmed approvals

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

// Only keep addresses that are still pending.
// Replace any "..." placeholders with full valid addresses.
const PENDING = {
  BWAEZI_EXTRA2:   { token: 'BWAEZI', spender: '0x9181ca603cee93c79ec3e4f5e62e5babe60bf28b' },
  BWAEZI_EXTRA3:   { token: 'BWAEZI', spender: '0x12f3c40759d89b3fe6753588a06f641e941fe028' },
  BWAEZI_EXTRA4:   { token: 'BWAEZI', spender: '0x675ea9ccf99a956ab65cbd6181e18e399dbc1161' },
  BWAEZI_EXTRA5:   { token: 'BWAEZI', spender: '0xbe2b8ae078fded245cc9f8be32499a48a6d77f1a' },
  BWAEZI_EXTRA6:   { token: 'BWAEZI', spender: '0xe4980a4ea5803f882b524b1beedd112f2afc0dae' }
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
    console.log(`[FINAL] Running remaining approvals on SCW ${SCW}`);
    const { aa } = await init();
    await approvePending(aa);
    console.log('✅ Remaining BWAEZI approvals complete — SCW ready for minting/liquidity');
  } catch (e) {
    console.error('❌ Failed:', e);
  }
})();

// Keep Render happy
const app = express();
app.get('/', (req, res) => res.send('Approval worker running'));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
