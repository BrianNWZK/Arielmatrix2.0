// arielsql_suite/main.js — One-shot: move funds to EOA from old source (EOA or Recover contract),
// forward to NEW SCW, approve router, print balances, exit.
//
// Flow:
// 1) Initialize provider + signer (sovereign EOA = receiver).
// 2) Drain from old source → EOA:
//    - If OLD_SOURCE_TYPE=EOA: send ERC-20 transfers from old EOA (requires OLD_SOVEREIGN_PRIVATE_KEY unless same as signer).
//    - If OLD_SOURCE_TYPE=RECOVER_CONTRACT: call recoverERC20(token, receiver, amount) as contract owner.
//    - Amounts are balance-aware to avoid reverts.
// 3) Forward EOA → NEW SCW (balance-aware).
// 4) Approve Uniswap V3 router for USDC and BWAEZI on NEW SCW via AA v15.12.
// 5) Print final balances and exit.
//
// Required env:
//   - SOVEREIGN_PRIVATE_KEY           Primary EOA private key (receiver) — 0x-prefixed hex
//
// Optional env:
//   - OLD_SOURCE_ADDRESS              Old source address (EOA or Recover contract). Default: AA_CONFIG.SCW_ADDRESS
//   - OLD_SOURCE_TYPE                 'EOA' | 'RECOVER_CONTRACT'. Default: 'EOA'
//   - OLD_SOVEREIGN_PRIVATE_KEY       If old source is an EOA different from receiver, provide its key
//   - NEW_SCW_ADDRESS                 New SCW address (already deployed). Default: 0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2
//   - BUNDLER_RPC_URL                 Bundler RPC (for approvals)
//   - EOA_OWNER                       Explicit owner address for approvals context (defaults to SOVEREIGN_PRIVATE_KEY address)
//
// Notes:
// - USDC decimals=6; BWAEZI decimals=18.
// - All token moves are balance-aware (min(actual, desired)).
// - Approvals run regardless of whether partial or full amounts were forwarded.

import { ethers } from 'ethers';
import {
  ENHANCED_CONFIG as AA_CONFIG,
  EnhancedRPCManager,
  EnterpriseAASDK
} from '../modules/aa-loaves-fishes.js';

/* ------------ Utilities ------------ */
function addrStrict(a) {
  try { return ethers.getAddress(String(a).trim()); } catch { return String(a).trim(); }
}
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

  // Old source
  OLD_SOURCE_ADDRESS: addrStrict(process.env.OLD_SOURCE_ADDRESS || AA_CONFIG.SCW_ADDRESS || '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C'),
  OLD_SOURCE_TYPE: String(process.env.OLD_SOURCE_TYPE || 'EOA').toUpperCase(), // EOA | RECOVER_CONTRACT

  // New SCW (fixed)
  NEW_SCW: addrStrict(process.env.NEW_SCW_ADDRESS || '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2'),

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
const recoverIface = new ethers.Interface([
  'function owner() view returns (address)',
  'function recoverERC20(address tokenAddress, address tokenReceiver, uint256 tokenAmount) external',
]);

/* ------------ State ------------ */
const state = {
  provider: null,
  signer: null,        // primary sovereign EOA (receiver)
  owner: null,         // same as signer.address unless EOA_OWNER provided
  aaNew: null,         // AA context for NEW SCW approvals
};

/* ------------ Init provider + signer ------------ */
async function initProviderAndSigner() {
  const rpc = new EnhancedRPCManager(RUNTIME.RPC_PROVIDERS, RUNTIME.NETWORK.chainId);
  await rpc.init();
  state.provider = rpc.getProvider();

  const pk = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!pk || !pk.startsWith('0x') || pk.length < 66) throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid (0x-prefixed hex).');

  state.signer = new ethers.Wallet(pk, state.provider);
  state.owner = addrStrict(process.env.EOA_OWNER || state.signer.address);

  console.log(`Owner/Receiver (EOA): ${state.owner}`);
  console.log(`Old source: ${RUNTIME.OLD_SOURCE_ADDRESS} (${RUNTIME.OLD_SOURCE_TYPE})`);
  console.log(`New SCW: ${RUNTIME.NEW_SCW}`);
}

/* ------------ Drain from old source → EOA (balance-aware) ------------ */
async function drainToEoa() {
  const usdcRead = new ethers.Contract(RUNTIME.TOKENS.USDC, erc20Iface, state.provider);
  const bwRead = new ethers.Contract(RUNTIME.TOKENS.BWAEZI, erc20Iface, state.provider);

  const desiredUsdc = toUnits(5, RUNTIME.DECIMALS.USDC);
  const desiredBw = toUnits(100_000_000, RUNTIME.DECIMALS.BWAEZI);

  if (RUNTIME.OLD_SOURCE_TYPE === 'EOA') {
    // If old source equals receiver EOA, we can sign directly; else require OLD_SOVEREIGN_PRIVATE_KEY.
    const needsSeparateKey = (addrStrict(RUNTIME.OLD_SOURCE_ADDRESS).toLowerCase() !== state.owner.toLowerCase());
    let oldSigner = state.signer;
    if (needsSeparateKey) {
      const oldPk = process.env.OLD_SOVEREIGN_PRIVATE_KEY;
      if (!oldPk || !oldPk.startsWith('0x') || oldPk.length < 66) {
        console.warn('OLD_SOVEREIGN_PRIVATE_KEY missing/invalid for EOA source; skipping drain.');
        return;
      }
      oldSigner = new ethers.Wallet(oldPk, state.provider);
      if (addrStrict(oldSigner.address).toLowerCase() !== addrStrict(RUNTIME.OLD_SOURCE_ADDRESS).toLowerCase()) {
        console.warn('OLD_SOVEREIGN_PRIVATE_KEY does not match OLD_SOURCE_ADDRESS; skipping drain.');
        return;
      }
    }

    const usdc = new ethers.Contract(RUNTIME.TOKENS.USDC, erc20Iface, oldSigner);
    const bw = new ethers.Contract(RUNTIME.TOKENS.BWAEZI, erc20Iface, oldSigner);

    const balUsdc = await usdcRead.balanceOf(RUNTIME.OLD_SOURCE_ADDRESS);
    const balBw = await bwRead.balanceOf(RUNTIME.OLD_SOURCE_ADDRESS);

    const sendUsdc = balUsdc < desiredUsdc ? balUsdc : desiredUsdc;
    const sendBw = balBw < desiredBw ? balBw : desiredBw;

    if (sendUsdc > 0n) {
      const tx = await usdc.transfer(state.owner, sendUsdc);
      const rc = await tx.wait();
      console.log(`EOA drain USDC (${fmtUnits(sendUsdc, RUNTIME.DECIMALS.USDC)}) → EOA: ${rc.hash}`);
    } else {
      console.warn('EOA drain: USDC balance 0 — skipping.');
    }

    if (sendBw > 0n) {
      const tx = await bw.transfer(state.owner, sendBw);
      const rc = await tx.wait();
      console.log(`EOA drain BWAEZI (${fmtUnits(sendBw, RUNTIME.DECIMALS.BWAEZI)}) → EOA: ${rc.hash}`);
    } else {
      console.warn('EOA drain: BWAEZI balance 0 — skipping.');
    }

  } else if (RUNTIME.OLD_SOURCE_TYPE === 'RECOVER_CONTRACT') {
    // Contract must be owned by sovereign key (or OLD_SOVEREIGN_PRIVATE_KEY if provided)
    let ownerSigner = state.signer;
    const altPk = process.env.OLD_SOVEREIGN_PRIVATE_KEY;
    if (altPk && altPk.startsWith('0x') && altPk.length >= 66) {
      ownerSigner = new ethers.Wallet(altPk, state.provider);
      console.log(`Using alt owner for recover contract: ${ownerSigner.address}`);
    }
    const recover = new ethers.Contract(RUNTIME.OLD_SOURCE_ADDRESS, recoverIface, ownerSigner);
    const currentOwner = await recover.owner();
    if (addrStrict(currentOwner).toLowerCase() !== addrStrict(ownerSigner.address).toLowerCase()) {
      console.warn(`Recover contract owner mismatch (owner=${currentOwner}, signer=${ownerSigner.address}); skipping drain.`);
      return;
    }

    const balUsdc = await usdcRead.balanceOf(RUNTIME.OLD_SOURCE_ADDRESS);
    const balBw = await bwRead.balanceOf(RUNTIME.OLD_SOURCE_ADDRESS);

    const sendUsdc = balUsdc < desiredUsdc ? balUsdc : desiredUsdc;
    const sendBw = balBw < desiredBw ? balBw : desiredBw;

    if (sendUsdc > 0n) {
      const tx = await recover.recoverERC20(RUNTIME.TOKENS.USDC, state.owner, sendUsdc);
      const rc = await tx.wait();
      console.log(`Recover USDC (${fmtUnits(sendUsdc, RUNTIME.DECIMALS.USDC)}) → EOA: ${rc.hash}`);
    } else {
      console.warn('Recover drain: USDC balance 0 — skipping.');
    }

    if (sendBw > 0n) {
      const tx = await recover.recoverERC20(RUNTIME.TOKENS.BWAEZI, state.owner, sendBw);
      const rc = await tx.wait();
      console.log(`Recover BWAEZI (${fmtUnits(sendBw, RUNTIME.DECIMALS.BWAEZI)}) → EOA: ${rc.hash}`);
    } else {
      console.warn('Recover drain: BWAEZI balance 0 — skipping.');
    }

  } else {
    console.warn(`Unknown OLD_SOURCE_TYPE '${RUNTIME.OLD_SOURCE_TYPE}'. Supported: 'EOA' | 'RECOVER_CONTRACT'. Skipping drain.`);
  }
}

/* ------------ Forward EOA → NEW SCW (balance-aware) ------------ */
async function forwardEoaToNewScwWithChecks() {
  const usdcRead = new ethers.Contract(RUNTIME.TOKENS.USDC, erc20Iface, state.provider);
  const bwRead = new ethers.Contract(RUNTIME.TOKENS.BWAEZI, erc20Iface, state.provider);

  const eoaUsdcBal = await usdcRead.balanceOf(state.owner);
  const eoaBwBal = await bwRead.balanceOf(state.owner);

  const desiredUsdc = toUnits(5, RUNTIME.DECIMALS.USDC);
  const desiredBw = toUnits(100_000_000, RUNTIME.DECIMALS.BWAEZI);

  const sendUsdc = eoaUsdcBal < desiredUsdc ? eoaUsdcBal : desiredUsdc;
  const sendBw = eoaBwBal < desiredBw ? eoaBwBal : desiredBw;

  const usdc = new ethers.Contract(RUNTIME.TOKENS.USDC, erc20Iface, state.signer);
  const bw = new ethers.Contract(RUNTIME.TOKENS.BWAEZI, erc20Iface, state.signer);

  if (sendUsdc === 0n) {
    console.warn('EOA → NEW SCW: USDC balance 0 — skipping.');
  } else {
    const tx = await usdc.transfer(RUNTIME.NEW_SCW, sendUsdc);
    const rc = await tx.wait();
    console.log(`EOA → NEW SCW USDC (${fmtUnits(sendUsdc, RUNTIME.DECIMALS.USDC)}): ${rc.hash}`);
  }

  if (sendBw === 0n) {
    console.warn('EOA → NEW SCW: BWAEZI balance 0 — skipping.');
  } else {
    const tx = await bw.transfer(RUNTIME.NEW_SCW, sendBw);
    const rc = await tx.wait();
    console.log(`EOA → NEW SCW BWAEZI (${fmtUnits(sendBw, RUNTIME.DECIMALS.BWAEZI)}): ${rc.hash}`);
  }
}

/* ------------ Initialize AA for NEW SCW and approve router ------------ */
async function initAaNewAndApprove() {
  // Ensure NEW SCW has code
  const codeNew = await state.provider.getCode(RUNTIME.NEW_SCW);
  if (!codeNew || codeNew === '0x') throw new Error(`NEW SCW has no code: ${RUNTIME.NEW_SCW}`);

  const aaNew = new EnterpriseAASDK(state.signer, RUNTIME.ENTRY_POINT);
  aaNew.ownerAddress = state.owner;
  await aaNew.initialize(state.provider, RUNTIME.NEW_SCW, RUNTIME.BUNDLER_RPC_URL);
  state.aaNew = aaNew;

  const router = RUNTIME.UNISWAP_V3_ROUTER;

  const approveToken = async (tokenAddr, label) => {
    const data = erc20Iface.encodeFunctionData('approve', [router, ethers.MaxUint256]);
    // SCW.execute(address,uint256,bytes) → approvals live on SCW
    const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);
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

  const oldSrc = RUNTIME.OLD_SOURCE_ADDRESS;
  const eoa = state.owner;
  const newSCW = RUNTIME.NEW_SCW;

  const result = {
    old: {
      usdc: await bal(usdc, oldSrc, RUNTIME.DECIMALS.USDC),
      bw: await bal(bw, oldSrc, RUNTIME.DECIMALS.BWAEZI),
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
  console.log(`OLD SRC (${oldSrc})  — USDC=${result.old.usdc}, BWAEZI=${result.old.bw}`);
  console.log(`EOA     (${eoa})     — USDC=${result.eoa.usdc}, BWAEZI=${result.eoa.bw}`);
  console.log(`NEW SCW (${newSCW})  — USDC=${result.new.usdc}, BWAEZI=${result.new.bw}`);
}

/* ------------ Main ------------ */
(async () => {
  try {
    console.log('🚀 One-shot — drain → EOA, forward → NEW SCW, approve, balances, exit');

    await initProviderAndSigner();

    // Step 1: Drain old source to EOA (EOA or Recover contract)
    await drainToEoa();

    // Step 2: Forward from EOA to NEW SCW (balance-aware)
    await forwardEoaToNewScwWithChecks();

    // Step 3: Approve router on NEW SCW via AA v15.12
    await initAaNewAndApprove();

    // Step 4: Print final balances
    await printBalances();

    console.log('✅ Completed. Exiting.');
    process.exit(0);
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
})();
