// main.js — Approvals ONLY. No EntryPoint ETH funding, uses existing EntryPoint deposit or SCW ETH.
// Requirements:
//   - SOVEREIGN_PRIVATE_KEY: 0x-prefixed EOA private key (signer for SCW userOps)
//   - SCW_ADDRESS: deployed SCW address (no fallback; must be set)

import { ethers } from 'ethers';
import { EnterpriseAASDK, EnhancedRPCManager } from '../modules/aa-loaves-fishes.js';

// ---- Runtime constants ----
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const BUNDLER = 'https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt';

// STRICT: require SCW in env (no fallback)
if (!process.env.SCW_ADDRESS || !process.env.SCW_ADDRESS.startsWith('0x') || process.env.SCW_ADDRESS.length !== 42) {
  throw new Error('SCW_ADDRESS must be set to a valid 0x-prefixed address');
}
const SCW = process.env.SCW_ADDRESS.trim();

// Preferred RPC rotation
const RPC_URLS = (process.env.RPC_URL ? [process.env.RPC_URL] : [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
]);

// Spend addresses (routers/aggregators)
const ROUTERS = {
  UNISWAP_V3:    '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  UNISWAP_V2:    '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  SUSHI_V2:      '0xd9e1CE17f2641f24AE83637ab66a2cca9C378B9F',
  ONE_INCH_V5:   '0x1111111254EEB25477B68fb85Ed929f73A960582',
  PARASWAP_LITE: '0xDEF1C0DE00000000000000000000000000000000'
};

// Paymaster address (allowance only — not used for sponsorship here)
const PAYMASTER = (process.env.PAYMASTER_ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47').trim();

// Tokens to approve
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

// EntryPoint v0.6 deposit info ABI
const entryPointIface = new ethers.Interface([
  'function getDepositInfo(address) view returns (uint256 amount, uint256 unstakeDelaySec, uint256 withdrawTime)'
]);

// ---- Helpers ----
async function initProviders() {
  const mgr = new EnhancedRPCManager(RPC_URLS, 1);
  await mgr.init();
  const provider = mgr.getProvider();

  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x') || pk.length < 66) {
    throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid (must be 0x-prefixed, 32-byte hex)');
  }
  const signer = new ethers.Wallet(pk, provider);

  return { provider, signer };
}

async function initAA(provider, signer) {
  const aa = new EnterpriseAASDK(signer, ENTRY_POINT);
  aa.paymasterMode = 'NONE'; // no sponsorship; SCW/EntryPoint deposit covers gas
  await aa.initialize(provider, SCW, BUNDLER);
  return aa;
}

// Fetch AA-aware gas prices from bundler; enforce minimums to avoid -32602
async function getBundlerGas(provider) {
  try {
    const res = await provider.send('pimlico_getUserOperationGasPrice', []);
    let maxFeePerGas = BigInt(res.maxFeePerGas);
    let maxPriorityFeePerGas = BigInt(res.maxPriorityFeePerGas);
    const TIP_FLOOR = 50_000_000n; // per Pimlico error floor
    if (maxPriorityFeePerGas < TIP_FLOOR) maxPriorityFeePerGas = TIP_FLOOR;
    // slight uplift to reduce race-condition rejections
    maxFeePerGas = (maxFeePerGas * 12n) / 10n;
    return { maxFeePerGas, maxPriorityFeePerGas };
  } catch {
    const fd = await provider.getFeeData();
    const base = fd.maxFeePerGas ?? ethers.parseUnits('35', 'gwei');
    const tip = fd.maxPriorityFeePerGas ?? ethers.parseUnits('3', 'gwei');
    const TIP_FLOOR = 50_000_000n;
    return {
      maxFeePerGas: BigInt(base.toString()) * 12n / 10n,
      maxPriorityFeePerGas: (BigInt(tip.toString()) < TIP_FLOOR) ? TIP_FLOOR : BigInt(tip.toString())
    };
  }
}

// Check funding: accept if SCW has ETH OR EntryPoint deposit > 0
async function assertFunding(provider) {
  const ethBal = await provider.getBalance(SCW);
  const ep = new ethers.Contract(ENTRY_POINT, entryPointIface, provider);
  let depositAmt = 0n;
  try {
    const info = await ep.getDepositInfo(SCW);
    depositAmt = BigInt(info.amount ?? info[0] ?? 0);
  } catch {
    depositAmt = 0n;
  }

  console.log(`[FUNDING] SCW ETH: ${ethers.formatEther(ethBal)} | EntryPoint deposit: ${ethers.formatEther(depositAmt)}`);
  if (ethBal === 0n && depositAmt === 0n) {
    throw new Error('No funding detected: SCW ETH and EntryPoint deposit are both zero.');
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
  console.log(`[APPROVAL] ${tokenLabel} → ${spenderAddr}: ${hash}`);
}

async function runApprovals(aa) {
  // Approve USDC & BWAEZI to all routers
  for (const [name, router] of Object.entries(ROUTERS)) {
    await approveToken(aa, 'USDC', TOKENS.USDC, router);
    await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, router);
  }
  // Approve BWAEZI to paymaster (allowance only)
  await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, PAYMASTER);
}

async function printAllowances(provider) {
  for (const [label, token] of Object.entries(TOKENS)) {
    const c = new ethers.Contract(token, erc20Iface, provider);
    for (const [name, spender] of Object.entries({ ...ROUTERS, PAYMASTER })) {
      const a = await c.allowance(SCW, spender);
      console.log(`[ALLOWANCE] ${label} @ ${name}: ${a.toString()}`);
    }
  }
}

// ---- Main ----
(async () => {
  try {
    console.log(`[BOOT] SCW: ${SCW}`);
    console.log(`[BOOT] Bundler: ${BUNDLER.slice(0, 60)}...`);
    const { provider, signer } = await initProviders();

    // Accept EntryPoint deposit as funding source
    await assertFunding(provider);

    const aa = await initAA(provider, signer);
    await runApprovals(aa);
    await printAllowances(provider);

    console.log('✅ Approvals complete (deposit-aware; no ETH funding required).');
    process.exit(0);
  } catch (e) {
    console.error('❌ Failed:', e);
    process.exit(1);
  }
})();// main.js — Approvals ONLY. No EntryPoint deposit, no funding.
// Requirements:
//   - SOVEREIGN_PRIVATE_KEY: 0x-prefixed EOA private key (signer for SCW userOps)
//   - SCW_ADDRESS: deployed SCW address (no fallback; must be set)
// Notes:
//   - Bundler is HARD-CODED to Pimlico mainnet with your key.
//   - Robust AA gas via pimlico_getUserOperationGasPrice.
//   - Defensive checks to prevent misconfig and low-fee rejections.

import { ethers } from 'ethers';
import { EnterpriseAASDK, EnhancedRPCManager } from '../modules/aa-loaves-fishes.js';

// ---- Runtime constants ----
const ENTRY_POINT = '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789';
const BUNDLER = 'https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt';

// STRICT: require SCW in env (no fallback)
if (!process.env.SCW_ADDRESS || process.env.SCW_ADDRESS.length !== 42) {
  throw new Error('SCW_ADDRESS must be set to a valid 0x-prefixed address');
}
const SCW = process.env.SCW_ADDRESS.trim();

// Preferred RPC rotation
const RPC_URLS = (process.env.RPC_URL ? [process.env.RPC_URL] : [
  'https://ethereum-rpc.publicnode.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com'
]);

// Spend addresses (routers/aggregators)
const ROUTERS = {
  UNISWAP_V3:    '0xE592427A0AEce92De3Edee1F18E0157C05861564',
  UNISWAP_V2:    '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
  SUSHI_V2:      '0xd9e1CE17f2641f24AE83637ab66a2cca9C378B9F',
  ONE_INCH_V5:   '0x1111111254EEB25477B68fb85Ed929f73A960582',
  PARASWAP_LITE: '0xDEF1C0DE00000000000000000000000000000000'
};

// Paymaster address (allowance only — not used for sponsorship here)
const PAYMASTER = (process.env.PAYMASTER_ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47').trim();

// Tokens to approve
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
  if (!pk || !pk.startsWith('0x') || pk.length < 66) {
    throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid (must be 0x-prefixed, 32-byte hex)');
  }
  const signer = new ethers.Wallet(pk, provider);

  return { provider, signer };
}

async function initAA(provider, signer) {
  const aa = new EnterpriseAASDK(signer, ENTRY_POINT);
  aa.paymasterMode = 'NONE'; // no sponsorship; SCW must fund gas
  await aa.initialize(provider, SCW, BUNDLER);
  return aa;
}

// Fetch AA-aware gas prices from bundler; enforce minimums to avoid -32602
async function getBundlerGas(provider) {
  try {
    const res = await provider.send('pimlico_getUserOperationGasPrice', []);
    let maxFeePerGas = BigInt(res.maxFeePerGas);
    let maxPriorityFeePerGas = BigInt(res.maxPriorityFeePerGas);

    // Defensive floor (50,000,000 wei tip per Pimlico error)
    const TIP_FLOOR = 50_000_000n;
    if (maxPriorityFeePerGas < TIP_FLOOR) {
      maxPriorityFeePerGas = TIP_FLOOR;
    }
    // Slight uplift to reduce race-condition rejections
    maxFeePerGas = (maxFeePerGas * 12n) / 10n;

    return { maxFeePerGas, maxPriorityFeePerGas };
  } catch (e) {
    // Fallback to provider fee data
    const fd = await provider.getFeeData();
    let base = fd.maxFeePerGas ?? ethers.parseUnits('35', 'gwei');
    let tip = fd.maxPriorityFeePerGas ?? ethers.parseUnits('3', 'gwei');

    // Convert to BigInt and uplift
    const maxFeePerGas = BigInt(base.toString()) * 12n / 10n;
    const maxPriorityFeePerGas = BigInt(tip.toString());
    const TIP_FLOOR = 50_000_000n;
    return {
      maxFeePerGas,
      maxPriorityFeePerGas: maxPriorityFeePerGas < TIP_FLOOR ? TIP_FLOOR : maxPriorityFeePerGas
    };
  }
}

async function approveToken(aa, tokenLabel, tokenAddr, spenderAddr) {
  const data = erc20Iface.encodeFunctionData('approve', [spenderAddr, ethers.MaxUint256]);
  const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, data]);

  // Fetch AA-aware gas from bundler
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
  console.log(`[APPROVAL] ${tokenLabel} → ${spenderAddr}: ${hash}`);
}

async function runApprovals(aa) {
  // Routers first
  for (const [name, router] of Object.entries(ROUTERS)) {
    await approveToken(aa, 'USDC', TOKENS.USDC, router);
    await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, router);
  }
  // Paymaster allowance (for future sponsorship paths; not used here for funding)
  await approveToken(aa, 'BWAEZI', TOKENS.BWAEZI, PAYMASTER);
}

async function printAllowances(provider) {
  for (const [label, token] of Object.entries(TOKENS)) {
    const c = new ethers.Contract(token, erc20Iface, provider);
    for (const [name, spender] of Object.entries({ ...ROUTERS, PAYMASTER })) {
      const a = await c.allowance(SCW, spender);
      console.log(`[ALLOWANCE] ${label} @ ${name}: ${a.toString()}`);
    }
  }
}

// ---- Main ----
(async () => {
  try {
    console.log(`[BOOT] SCW: ${SCW}`);
    console.log(`[BOOT] Bundler: ${BUNDLER.slice(0, 60)}...`);
    const { provider, signer } = await initProviders();

    // Basic SCW ETH balance check (fail-fast if zero)
    const balWei = await provider.getBalance(SCW);
    if (balWei === 0n) throw new Error('SCW has 0 ETH — approvals require gas. Fund the SCW or use sponsorship.');

    const aa = await initAA(provider, signer);

    await runApprovals(aa);
    await printAllowances(provider);

    console.log('✅ Approvals complete (no deposits executed).');
    process.exit(0);
  } catch (e) {
    console.error('❌ Failed:', e);
    process.exit(1);
  }
})();
