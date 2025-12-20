// main.js — Approvals ONLY. No EntryPoint deposit, no funding.
// Requirements:
//   - SOVEREIGN_PRIVATE_KEY: 0x-prefixed EOA private key (signer for SCW userOps)
//   - SCW_ADDRESS: deployed SCW address
// Optional:
//   - BUNDLER_RPC_URL, RPC_URL, PAYMASTER_ADDRESS

import { ethers } from 'ethers';
import { EnterpriseAASDK, EnhancedRPCManager } from '../modules/aa-loaves-fishes.js';

const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
if (!process.env.SCW_ADDRESS) throw new Error("SCW_ADDRESS must be set");
const SCW = process.env.SCW_ADDRESS.trim();
const BUNDLER = (process.env.BUNDLER_RPC_URL || 'https://api.pimlico.io/v2/1/rpc?apikey=YOUR_KEY').trim();
const RPC_URLS = (process.env.RPC_URL ? [process.env.RPC_URL] : [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
]);

const ROUTERS = {
  UNISWAP_V3:    '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  UNISWAP_V2:    '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  SUSHI_V2:      '0xd9e1CE17f2641f24AE83637ab66a2cca9C378B9F',
  ONE_INCH_V5:   '0x1111111254EEB25477B68fb85Ed929f73A960582',
  PARASWAP_LITE: '0xDEF1C0DE00000000000000000000000000000000'
};

const PAYMASTER = (process.env.PAYMASTER_ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47').trim();

const TOKENS = {
  USDC:   '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  BWAEZI: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'
};

const erc20Iface = new ethers.Interface([
  'function approve(address,uint256) returns (bool)',
  'function allowance(address,address) view returns (uint256)'
]);
const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);

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
  aa.paymasterMode = 'NONE';
  await aa.initialize(provider, SCW, BUNDLER);
  return aa;
}

// Fetch AA gas prices from bundler
async function getBundlerGas(provider) {
  try {
    const res = await provider.send('pimlico_getUserOperationGasPrice', []);
    return {
      maxFeePerGas: BigInt(res.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(res.maxPriorityFeePerGas)
    };
  } catch {
    const fd = await provider.getFeeData();
    return {
      maxFeePerGas: fd.maxFeePerGas ?? ethers.parseUnits('30', 'gwei'),
      maxPriorityFeePerGas: fd.maxPriorityFeePerGas ?? ethers.parseUnits('2', 'gwei')
    };
  }
}

async function approveToken(aa, tokenLabel, tokenAddr, spenderAddr) {
  const data = erc20Iface.encodeFunctionData('approve', [spenderAddr, ethers.MaxUint256]);
  const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, data]);

  const { maxFeePerGas, maxPriorityFeePerGas } = await getBundlerGas(aa.provider);

  const userOp = await aa.createUserOp(callData, {
    callGasLimit: 350_000n,
    verificationGasLimit: 700_000n,
    preVerificationGas: 80_000n,
    maxFeePerGas,
    maxPriorityFeePerGas
  });

  const signed = await aa.signUserOp(userOp);
  const hash = await aa.sendUserOpWithBackoff(signed, 5);
  console.log(`Approved ${tokenLabel} → ${spenderAddr}: ${hash}`);
}

async function runApprovals(aa) {
  for (const [name, router] of Object.entries(ROUTERS)) {
    await approveToken(aa, 'USDC', TOKENS.USDC, router);
    await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, router);
  }
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

(async () => {
  try {
    console.log(`Using SCW sender: ${SCW}`);
    const { provider, signer } = await initProviders();
    const aa = await initAA(provider, signer);
    await runApprovals(aa);
    await printAllowances(provider);
    console.log('✅ Approvals complete (no deposits executed).');
    process.exit(0);
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
})();
