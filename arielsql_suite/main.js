// arielsql_suite/main.js — One-shot: adaptive drain (EOA vs contract), forward to NEW SCW,
// fund EntryPoint to fix AA31, approve router, print balances, exit.

import { ethers } from 'ethers';
import {
  ENHANCED_CONFIG as AA_CONFIG,
  EnhancedRPCManager,
  EnterpriseAASDK
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

  // Old source (can be EOA or contract)
  OLD_SOURCE_ADDRESS: addrStrict(process.env.OLD_SOURCE_ADDRESS || AA_CONFIG.SCW_ADDRESS || '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C'),
  // If the old source is a different EOA key, provide its private key
  OLD_SOVEREIGN_PRIVATE_KEY: process.env.OLD_SOVEREIGN_PRIVATE_KEY || '',

  // New SCW (already deployed)
  NEW_SCW: addrStrict(process.env.NEW_SCW_ADDRESS || '0x59bE70F1c57470D7773C3d5d27B8D165FcbE7EB2'),

  RPC_PROVIDERS: AA_CONFIG.PUBLIC_RPC_ENDPOINTS?.length ? AA_CONFIG.PUBLIC_RPC_ENDPOINTS : [
    'https://ethereum-rpc.publicnode.com',
    'https://rpc.ankr.com/eth',
    'https://eth.llamarpc.com',
  ],
  BUNDLER_RPC_URL: process.env.BUNDLER_RPC_URL || AA_CONFIG.BUNDLER?.RPC_URL || '',

  PAYMASTER_MODE: (process.env.PAYMASTER_MODE || AA_CONFIG.PAYMASTER.MODE || 'ONCHAIN').toUpperCase(), // NONE | API | ONCHAIN | PASSTHROUGH
  PAYMASTER_ADDRESS: addrStrict(process.env.PAYMASTER_ADDRESS || AA_CONFIG.PAYMASTER.ADDRESS),

  // EntryPoint deposit settings
  MIN_EP_DEPOSIT_ETH: process.env.MIN_EP_DEPOSIT_ETH || '0.005',
};

/* ------------ ERC interfaces ------------ */
const erc20Iface = new ethers.Interface([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function approve(address,uint256) returns (bool)',
]);

// Minimal Recover contract ABI (if present)
const recoverIface = new ethers.Interface([
  'function owner() view returns (address)',
  'function recoverERC20(address tokenAddress, address tokenReceiver, uint256 tokenAmount) external',
]);

/* ------------ EntryPoint ABI ------------ */
const ENTRYPOINT_ABI = [
  'function depositTo(address account) payable',
  'function getDeposit(address account) view returns (uint256)'
];

/* ------------ State ------------ */
const state = {
  provider: null,
  signer: null,  // primary sovereign EOA (receiver)
  owner: null,   // same as signer.address unless EOA_OWNER provided
  aaNew: null,   // AA context for NEW SCW approvals
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
  console.log(`Old source: ${RUNTIME.OLD_SOURCE_ADDRESS}`);
  console.log(`New SCW: ${RUNTIME.NEW_SCW}`);
  console.log(`Paymaster mode: ${RUNTIME.PAYMASTER_MODE}`);
}

/* ------------ Detect old source type ------------ */
async function detectOldSourceType() {
  const code = await state.provider.getCode(RUNTIME.OLD_SOURCE_ADDRESS);
  const isEOA = !code || code === '0x';
  if (isEOA) {
    console.log('Old source type detected: EOA');
    return 'EOA';
  }
  // Contract present: probe owner() support safely
  try {
    const recoverRO = new ethers.Contract(RUNTIME.OLD_SOURCE_ADDRESS, recoverIface, state.provider);
    const ownerAddr = await recoverRO.owner(); // will revert or decode fail if unsupported
    if (ownerAddr && ethers.isAddress(ownerAddr)) {
      console.log('Old source type detected: Recover contract (Ownable)');
      return 'RECOVER_CONTRACT';
    }
  } catch {
    console.warn('Old source contract does not implement owner() — not a Recover contract.');
  }
  console.warn('Old source is a contract without recover capability — cannot drain.');
  return 'UNSUPPORTED_CONTRACT';
}

/* ------------ Drain from old source → EOA ------------ */
async function drainToEoa(oldType) {
  const usdcRead = new ethers.Contract(RUNTIME.TOKENS.USDC, erc20Iface, state.provider);
  const bwRead = new ethers.Contract(RUNTIME.TOKENS.BWAEZI, erc20Iface, state.provider);

  const desiredUsdc = toUnits(5, RUNTIME.DECIMALS.USDC);
  const desiredBw = toUnits(100_000_000, RUNTIME.DECIMALS.BWAEZI);

  if (oldType === 'EOA') {
    const needsSeparateKey = (addrStrict(RUNTIME.OLD_SOURCE_ADDRESS).toLowerCase() !== state.owner.toLowerCase());
    let oldSigner = state.signer;
    if (needsSeparateKey) {
      const oldPk = RUNTIME.OLD_SOVEREIGN_PRIVATE_KEY;
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

  } else if (oldType === 'RECOVER_CONTRACT') {
    let ownerSigner = state.signer;
    const altPk = RUNTIME.OLD_SOVEREIGN_PRIVATE_KEY;
    if (altPk && altPk.startsWith('0x') && altPk.length >= 66) {
      ownerSigner = new ethers.Wallet(altPk, state.provider);
      console.log(`Using alt owner for recover contract: ${ownerSigner.address}`);
    }
    const recover = new ethers.Contract(RUNTIME.OLD_SOURCE_ADDRESS, recoverIface, ownerSigner);
    // Owner check — if unsupported, this would have been classified earlier
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
    console.warn('Old source unsupportable contract — skipping drain.');
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

/* ------------ Ensure gas sponsorship (fix AA31) ------------ */
async function ensureGasSponsorship() {
  const ep = new ethers.Contract(RUNTIME.ENTRY_POINT, ENTRYPOINT_ABI, state.provider);
  const epSigner = new ethers.Contract(RUNTIME.ENTRY_POINT, ENTRYPOINT_ABI, state.signer);
  const minDepositWei = ethers.parseEther(RUNTIME.MIN_EP_DEPOSIT_ETH);

  if (RUNTIME.PAYMASTER_MODE !== 'NONE') {
    const current = await ep.getDeposit(RUNTIME.PAYMASTER_ADDRESS);
    if (current < minDepositWei) {
      console.log(`Depositing ${fmtUnits(minDepositWei, 18)} ETH to paymaster ${RUNTIME.PAYMASTER_ADDRESS} on EntryPoint...`);
      const tx = await epSigner.depositTo(RUNTIME.PAYMASTER_ADDRESS, { value: minDepositWei });
      const rc = await tx.wait();
      console.log(`Paymaster deposit tx: ${rc?.transactionHash || tx.hash}`);
    } else {
      console.log('Paymaster deposit sufficient; skipping deposit.');
    }
  } else {
    const current = await ep.getDeposit(RUNTIME.NEW_SCW);
    if (current < minDepositWei) {
      console.log(`Depositing ${fmtUnits(minDepositWei, 18)} ETH to SCW ${RUNTIME.NEW_SCW} on EntryPoint...`);
      const tx = await epSigner.depositTo(RUNTIME.NEW_SCW, { value: minDepositWei });
      const rc = await tx.wait();
      console.log(`SCW deposit tx: ${rc?.transactionHash || tx.hash}`);
    } else {
      console.log('SCW deposit sufficient; skipping deposit.');
    }
  }
}

/* ------------ Approve router on NEW SCW ------------ */
async function initAaNewAndApprove() {
  const codeNew = await state.provider.getCode(RUNTIME.NEW_SCW);
  if (!codeNew || codeNew === '0x') throw new Error(`NEW SCW has no code: ${RUNTIME.NEW_SCW}`);

  const aaNew = new EnterpriseAASDK(state.signer, RUNTIME.ENTRY_POINT);
  aaNew.ownerAddress = state.owner;
  await aaNew.initialize(state.provider, RUNTIME.NEW_SCW, RUNTIME.BUNDLER_RPC_URL);
  state.aaNew = aaNew;

  const router = RUNTIME.UNISWAP_V3_ROUTER;

  const approveToken = async (tokenAddr, label) => {
    const data = erc20Iface.encodeFunctionData('approve', [router, ethers.MaxUint256]);
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
    console.log('🚀 One-shot — adaptive drain, forward, fund EntryPoint, approve, balances, exit');

    await initProviderAndSigner();

    const oldType = await detectOldSourceType();
    await drainToEoa(oldType);

    await forwardEoaToNewScwWithChecks();

    await ensureGasSponsorship();

    await initAaNewAndApprove();

    await printBalances();

    console.log('✅ Completed. Exiting.');
    process.exit(0);
  } catch (e) {
    console.error(`❌ Failed: ${e.message}`);
    process.exit(1);
  }
})();
