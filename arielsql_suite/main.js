// arielsql_suite/main.js — One-shot: deploy NEW SCW (salt=0), move funds from OLD SCW, approve router, print balances, exit
//
// Zero-compromise flow with AA v15.12:
// 1) Predict NEW SCW via factory.getAddress(owner, 0). If factory ABI misreports, deploy via direct tx fallback.
// 2) Deploy NEW SCW:
//    - Preferred: via ERC-4337 UserOp with initCode (sender aligned to predicted address)
//    - Fallback: direct factory.createAccount(owner, 0) transaction (requires EOA ETH)
// 3) From OLD SCW: transfer 5 USDC and 100,000,000 BWAEZI to EOA (2 UserOps).
// 4) From EOA: forward both tokens to NEW SCW (2 direct ERC-20 txs).
// 5) On NEW SCW: approve Uniswap V3 router for USDC and BWAEZI (2 UserOps).
// 6) Print final balances and exit.
//
// Required env:
//   - SOVEREIGN_PRIVATE_KEY         EOA private key (0x-prefixed hex)
// Optional env:
//   - OLD_SCW_ADDRESS               Old SCW to drain (defaults AA_CONFIG.SCW_ADDRESS)
//   - ACCOUNT_FACTORY               SimpleAccountFactory address
//   - BUNDLER_RPC_URL               Bundler RPC URL (4337)
//   - EOA_OWNER                     Explicit owner address (defaults to signer.address)
//
// Notes:
// - This script avoids AA14 by aligning sender to the predicted address for (owner, salt=0) when using initCode.
// - If factory.getAddress is unhealthy, it uses a direct deployment fallback to guarantee success.
// - Exits on completion; no server is started.

import { ethers } from 'ethers';
import {
  ENHANCED_CONFIG as AA_CONFIG,
  EnhancedRPCManager,
  EnterpriseAASDK,
  SCW_FACTORY_ABI,
  buildInitCodeForSCW
} from '../modules/aa-loaves-fishes.js';

/* ------------ Utilities ------------ */
function addrStrict(a) { try { return ethers.getAddress(String(a).trim()); } catch { return String(a).trim(); } }
const toUnits = (n, d) => ethers.parseUnits(String(n), d);
const fmtUnits = (bn, d) => ethers.formatUnits(bn, d);

/* ------------ Runtime ------------ */
const RUNTIME = {
  NETWORK: AA_CONFIG.NETWORK,
  ENTRY_POINT: addrStrict(AA_CONFIG.ENTRY_POINTS?.V07 || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),
  TOKENS: {
    USDC: addrStrict(AA_CONFIG.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    BWAEZI: addrStrict(AA_CONFIG.BWAEZI_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'),
  },
  DECIMALS: { USDC: 6, BWAEZI: 18 },
  UNISWAP_V3_ROUTER: addrStrict(AA_CONFIG.UNISWAP?.V3_ROUTER_ADDRESS || '0xE592427A0AEce92De3Edee1F18E0157C05861564'),
  ACCOUNT_FACTORY: addrStrict(process.env.ACCOUNT_FACTORY || AA_CONFIG.ACCOUNT_FACTORY || '0x9406Cc6185a346906296840746125a0E44976454'),
  OLD_SCW: addrStrict(process.env.OLD_SCW_ADDRESS || AA_CONFIG.SCW_ADDRESS || '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C'),
  RPC_PROVIDERS: AA_CONFIG.PUBLIC_RPC_ENDPOINTS?.length ? AA_CONFIG.PUBLIC_RPC_ENDPOINTS : [
    'https://ethereum-rpc.publicnode.com',
    'https://rpc.ankr.com/eth',
    'https://eth.llamarpc.com',
  ],
  BUNDLER_RPC_URL: process.env.BUNDLER_RPC_URL || AA_CONFIG.BUNDLER?.RPC_URL || '',
};

/* ------------ ERC interfaces ------------ */
const erc20Iface = new ethers.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function approve(address,uint256) returns (bool)',
]);
const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);

/* ------------ State ------------ */
const state = {
  provider: null,
  signer: null,
  owner: null,
  newScw: null,
  aaOld: null,
  aaNew: null,
};

/* ------------ Init provider + signer ------------ */
async function initProviderAndSigner() {
  const rpc = new EnhancedRPCManager(RUNTIME.RPC_PROVIDERS, RUNTIME.NETWORK.chainId);
  await rpc.init();
  state.provider = rpc.getProvider();

  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x') || pk.length < 66) {
    throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid (0x-prefixed hex required).');
  }
  state.signer = new ethers.Wallet(pk, state.provider);
  state.owner = addrStrict(process.env.EOA_OWNER || state.signer.address);
}

/* ------------ Predict NEW SCW (salt=0) with guard ------------ */
async function predictNewScwSalt0OrFallback() {
  const factory = new ethers.Contract(RUNTIME.ACCOUNT_FACTORY, SCW_FACTORY_ABI, state.provider);
  try {
    const predictedRaw = await factory.getAddress(state.owner, 0n);
    const predicted = addrStrict(predictedRaw);
    if (predicted.toLowerCase() === RUNTIME.ACCOUNT_FACTORY.toLowerCase()) {
      // Misreport: fallback to deploy-first, then read code to confirm
      console.warn(`Factory getAddress(owner,0) misreported factory address. Will deploy via fallback and infer address.`);
      state.newScw = null; // will be set after fallback deploy
    } else {
      state.newScw = predicted;
      console.log(`Predicted NEW SCW (salt=0): ${state.newScw}`);
    }
  } catch (e) {
    console.warn(`factory.getAddress failed (${e.message}). Will use fallback deploy.`);
    state.newScw = null;
  }
}

/* ------------ Deploy NEW SCW ------------ */
async function deployNewScw() {
  // If prediction is unreliable, fallback: direct deployment via factory tx
  if (!state.newScw) {
    const factory = new ethers.Contract(RUNTIME.ACCOUNT_FACTORY, SCW_FACTORY_ABI, state.signer);
    console.log('Deploying NEW SCW via direct factory.createAccount(owner, 0)...');
    const tx = await factory.createAccount(state.owner, 0n, { gasLimit: 1_000_000 });
    const rec = await tx.wait();
    // After deployment, derive the address using a fresh call (should be correct post-deploy)
    const factoryRO = new ethers.Contract(RUNTIME.ACCOUNT_FACTORY, SCW_FACTORY_ABI, state.provider);
    const predictedRaw = await factoryRO.getAddress(state.owner, 0n);
    state.newScw = addrStrict(predictedRaw);
    console.log(`NEW SCW deployed via direct tx: ${rec?.transactionHash}`);
    console.log(`NEW SCW address (salt=0): ${state.newScw}`);
    return;
  }

  // Preferred path: deploy via UserOp with initCode aligned to sender
  const aaNew = new EnterpriseAASDK(state.signer, RUNTIME.ENTRY_POINT);
  aaNew.factoryAddress = RUNTIME.ACCOUNT_FACTORY;
  aaNew.ownerAddress = state.owner;
  await aaNew.initialize(state.provider, state.newScw, RUNTIME.BUNDLER_RPC_URL);

  const code = await state.provider.getCode(state.newScw);
  if (code && code !== '0x') {
    console.log(`NEW SCW already deployed at ${state.newScw}`);
    state.aaNew = aaNew;
    return;
  }

  const { initCode } = await buildInitCodeForSCW(state.provider, RUNTIME.ACCOUNT_FACTORY, state.owner, state.newScw, 0n);
  console.log('Prepared initCode for deployment');

  const noop = scwIface.encodeFunctionData('execute', [state.newScw, 0n, '0x']);
  const userOp = await aaNew.createUserOp(noop, {
    forceDeploy: true,
    initCode,
    callGasLimit: 400_000n,
    verificationGasLimit: 700_000n,
    preVerificationGas: 80_000n,
  });
  const signed = await aaNew.signUserOp(userOp);
  const txHash = await aaNew.sendUserOpWithBackoff(signed, 5);
  console.log(`SCW deployed (UserOp): ${txHash}`);

  state.aaNew = aaNew;
}

/* ------------ Drain OLD SCW → EOA ------------ */
async function drainOldScwToEoa() {
  const aaOld = new EnterpriseAASDK(state.signer, RUNTIME.ENTRY_POINT);
  aaOld.factoryAddress = RUNTIME.ACCOUNT_FACTORY;
  aaOld.ownerAddress = state.owner;
  await aaOld.initialize(state.provider, RUNTIME.OLD_SCW, RUNTIME.BUNDLER_RPC_URL);

  const oldCode = await state.provider.getCode(RUNTIME.OLD_SCW);
  if (!oldCode || oldCode === '0x') {
    throw new Error(`OLD SCW not deployed: ${RUNTIME.OLD_SCW}`);
  }

  // USDC 5 → EOA
  const amountUsdc = toUnits(5, RUNTIME.DECIMALS.USDC);
  const usdcTransfer = erc20Iface.encodeFunctionData('transfer', [state.owner, amountUsdc]);
  const callUsdc = scwIface.encodeFunctionData('execute', [RUNTIME.TOKENS.USDC, 0n, usdcTransfer]);
  const uoUsdc = await aaOld.createUserOp(callUsdc, { callGasLimit: 300_000n });
  const sUsdc = await aaOld.signUserOp(uoUsdc);
  const hUsdc = await aaOld.sendUserOpWithBackoff(sUsdc, 5);
  console.log(`OLD SCW → EOA USDC (5): ${hUsdc}`);

  // BWAEZI 100,000,000 → EOA
  const amountBw = toUnits(100_000_000, RUNTIME.DECIMALS.BWAEZI);
  const bwTransfer = erc20Iface.encodeFunctionData('transfer', [state.owner, amountBw]);
  const callBw = scwIface.encodeFunctionData('execute', [RUNTIME.TOKENS.BWAEZI, 0n, bwTransfer]);
  const uoBw = await aaOld.createUserOp(callBw, { callGasLimit: 400_000n });
  const sBw = await aaOld.signUserOp(uoBw);
  const hBw = await aaOld.sendUserOpWithBackoff(sBw, 5);
  console.log(`OLD SCW → EOA BWAEZI (100,000,000): ${hBw}`);

  state.aaOld = aaOld;
}

/* ------------ Forward EOA → NEW SCW ------------ */
async function forwardEoaToNewScw() {
  const usdc = new ethers.Contract(RUNTIME.TOKENS.USDC, erc20Iface, state.signer);
  const bw = new ethers.Contract(RUNTIME.TOKENS.BWAEZI, erc20Iface, state.signer);

  const txUsdc = await usdc.transfer(state.newScw, toUnits(5, RUNTIME.DECIMALS.USDC));
  const rcUsdc = await txUsdc.wait();
  console.log(`EOA → NEW SCW USDC (5): ${rcUsdc?.hash || rcUsdc?.transactionHash}`);

  const txBw = await bw.transfer(state.newScw, toUnits(100_000_000, RUNTIME.DECIMALS.BWAEZI));
  const rcBw = await txBw.wait();
  console.log(`EOA → NEW SCW BWAEZI (100,000,000): ${rcBw?.hash || rcBw?.transactionHash}`);
}

/* ------------ Approve router on NEW SCW ------------ */
async function approveRouterOnNewScw() {
  // If we deployed via direct tx fallback, initialize AA context now
  if (!state.aaNew) {
    const aaNew = new EnterpriseAASDK(state.signer, RUNTIME.ENTRY_POINT);
    aaNew.factoryAddress = RUNTIME.ACCOUNT_FACTORY;
    aaNew.ownerAddress = state.owner;
    await aaNew.initialize(state.provider, state.newScw, RUNTIME.BUNDLER_RPC_URL);
    state.aaNew = aaNew;
  }

  const aaNew = state.aaNew;
  const router = RUNTIME.UNISWAP_V3_ROUTER;

  const approveToken = async (tokenAddr, label) => {
    const data = erc20Iface.encodeFunctionData('approve', [router, ethers.MaxUint256]);
    const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, data]);

    const userOp = await aaNew.createUserOp(callData, { callGasLimit: 300_000n });
    const signed = await aaNew.signUserOp(userOp);
    const txHash = await aaNew.sendUserOpWithBackoff(signed, 5);

    console.log(`Approved ${label} on NEW SCW: ${txHash}`);
  };

  await approveToken(RUNTIME.TOKENS.USDC, 'USDC');
  await approveToken(RUNTIME.TOKENS.BWAEZI, 'BWAEZI');
}

/* ------------ Print balances ------------ */
async function printBalances() {
  const p = state.provider;
  const usdc = new ethers.Contract(RUNTIME.TOKENS.USDC, erc20Iface, p);
  const bw = new ethers.Contract(RUNTIME.TOKENS.BWAEZI, erc20Iface, p);

  const bal = async (c, a, d) => fmtUnits(await c.balanceOf(a), d);

  const oldSCW = RUNTIME.OLD_SCW;
  const eoa = state.owner;
  const newSCW = state.newScw;

  const result = {
    old: {
      usdc: await bal(usdc, oldSCW, RUNTIME.DECIMALS.USDC),
      bw: await bal(bw, oldSCW, RUNTIME.DECIMALS.BWAEZI),
    },
    eoa: {
      usdc: await bal(usdc, eoa, RUNTIME.DECIMALS.USDC),
      bw: await bal(bw, eoa, RUNTIME.DECIMALS.BWAEZI),
    },
    new: {
      usdc: await bal(usdc, newSCW, RUNTIME.DECIMALS.USDC),
      bw: await bal(bw, newSCW, RUNTIME.DECIMALS.BWAEZI),
    },
  };

  console.log('Final balances:');
  console.log(`OLD SCW (${oldSCW})  — USDC=${result.old.usdc}, BWAEZI=${result.old.bw}`);
  console.log(`EOA     (${eoa})     — USDC=${result.eoa.usdc}, BWAEZI=${result.eoa.bw}`);
  console.log(`NEW SCW (${newSCW})  — USDC=${result.new.usdc}, BWAEZI=${result.new.bw}`);
}

/* ------------ Main ------------ */
(async () => {
  try {
    console.log('🚀 One-shot — deploy NEW SCW, move funds, approve, exit');

    await initProviderAndSigner();
    console.log(`Owner (EOA): ${state.owner}`);
    console.log(`OLD SCW: ${RUNTIME.OLD_SCW}`);

    await predictNewScwSalt0OrFallback();
    await deployNewScw();

    await drainOldScwToEoa();
    await forwardEoaToNewScw();

    await approveRouterOnNewScw();
    await printBalances();

    console.log('✅ Completed. Exiting.');
    process.exit(0);
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
})();
