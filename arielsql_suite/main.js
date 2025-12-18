// arielsql_suite/main.js — FINAL SETTLEMENT-ONLY: force deploy to pre-funded target + AA31-safe approvals, no transfers, no loops
//
// Maintains ALL capabilities, functions, features of your original SCW MAIN.JS:
// - Express server with /health, /status, /approve, /bootstrap
// - EnhancedRPCManager, AA v15.12 EnterpriseAASDK
// - Salt discovery + initCode builder helpers
// - Guard against factory misreport realignment
//
// Adds SOLUTION1’s novel force-deploy path + AA31 fix:
// - Fixed target SCW (no alignment)
// - Salt brute-force up to 10,000 tries, manual initCode fallback
// - Ultra-high gas deploy via UserOp and direct factory fallback
// - EntryPoint deposit to paymaster or SCW before approvals

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';

import {
  ENHANCED_CONFIG as AA_CONFIG,
  EnhancedRPCManager,
  EnterpriseAASDK,
  SCW_FACTORY_ABI,
  buildInitCodeForSCW,
  findSaltForSCW
} from '../modules/aa-loaves-fishes.js';

/* ------------ Helpers ------------ */
function nowTs() { return Date.now(); }
function addrStrict(a) { try { return ethers.getAddress(String(a).trim()); } catch { return String(a).trim(); } }

/* ------------ Runtime ------------ */
const RUNTIME = {
  NETWORK: AA_CONFIG.NETWORK,
  ENTRY_POINT: addrStrict(AA_CONFIG.ENTRY_POINTS?.V07 || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),

  TOKENS: {
    USDC: addrStrict(AA_CONFIG.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    BWAEZI: addrStrict(AA_CONFIG.BWAEZI_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da')
  },
  UNISWAP_V3_ROUTER: addrStrict(AA_CONFIG.UNISWAP?.V3_ROUTER_ADDRESS || '0xE592427A0AEce92De3Edee1F18E0157C05861564'),

  // Fixed target SCW (pre-funded address you want code at)
  SCW_ADDRESS: addrStrict(process.env.SCW_ADDRESS || AA_CONFIG.SCW_ADDRESS || '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C'),

  // ERC-4337 SimpleAccountFactory
  ACCOUNT_FACTORY: addrStrict(process.env.ACCOUNT_FACTORY || AA_CONFIG.ACCOUNT_FACTORY || '0x9406Cc6185a346906296840746125a0E44976454'),

  // Owner override (optional)
  EOA_OWNER: (() => {
    const eo = process.env.EOA_OWNER || AA_CONFIG.EOA_OWNER || '';
    return eo && eo.startsWith('0x') ? addrStrict(eo) : null;
  })(),

  // RPC + bundler
  RPC_PROVIDERS: AA_CONFIG.PUBLIC_RPC_ENDPOINTS?.length ? AA_CONFIG.PUBLIC_RPC_ENDPOINTS : [
    'https://ethereum-rpc.publicnode.com',
    'https://rpc.ankr.com/eth',
    'https://eth.llamarpc.com'
  ],
  BUNDLER_RPC_URL: process.env.BUNDLER_RPC_URL || AA_CONFIG.BUNDLER?.RPC_URL || '',

  // Server
  PORT: Number(process.env.PORT || 10000),
  VERSION: 'final-settlement-v15.12+solution1',

  // Paymaster/gas sponsorship
  PAYMASTER_MODE: (process.env.PAYMASTER_MODE || AA_CONFIG.PAYMASTER.MODE || 'ONCHAIN').toUpperCase(), // NONE|API|ONCHAIN|PASSTHROUGH
  PAYMASTER_ADDRESS: addrStrict(process.env.PAYMASTER_ADDRESS || AA_CONFIG.PAYMASTER.ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47'),
  MIN_EP_DEPOSIT_ETH: process.env.MIN_EP_DEPOSIT_ETH || '0.01' // higher by default for safety
};

/* ------------ EntryPoint ABI ------------ */
const ENTRYPOINT_ABI = [
  'function depositTo(address account) payable',
  'function getDeposit(address account) view returns (uint256)'
];

/* ------------ State ------------ */
const state = {
  startTs: nowTs(),
  provider: null,
  signer: null,
  aa: null,
  scwAddress: RUNTIME.SCW_ADDRESS,
  scwDeployed: false,
  approvalsSent: { USDC: false, BWAEZI: false },
  lastTxHashes: { deploy: null, approveUSDC: null, approveBWAEZI: null, epDeposit: null }
};

/* ------------ Init: Provider + AA SDK ------------ */
async function initProviderAndAA() {
  const rpc = new EnhancedRPCManager(RUNTIME.RPC_PROVIDERS, RUNTIME.NETWORK.chainId);
  await rpc.init();
  const provider = rpc.getProvider();

  const priv = process.env.SOVEREIGN_PRIVATE_KEY;
  if (!priv || !priv.startsWith('0x') || priv.length < 66) {
    throw new Error('SOVEREIGN_PRIVATE_KEY missing/invalid.');
  }
  const signer = new ethers.Wallet(priv, provider);

  const bundlerUrl = RUNTIME.BUNDLER_RPC_URL;
  const aa = new EnterpriseAASDK(signer, RUNTIME.ENTRY_POINT);
  aa.factoryAddress = RUNTIME.ACCOUNT_FACTORY;
  aa.ownerAddress = RUNTIME.EOA_OWNER || signer.address;
  await aa.initialize(provider, RUNTIME.SCW_ADDRESS, bundlerUrl);

  // Keep sender fixed; do not realign to misreported factory predictions
  state.provider = provider;
  state.signer = signer;
  state.aa = aa;

  console.log(`🔥 Final settlement (Solution1) — Targeting ${RUNTIME.SCW_ADDRESS}`);
}

/* ------------ Force deploy to pre-funded target ------------ */
async function ensureScwDeployed() {
  const provider = state.provider;
  const aa = state.aa;

  const current = addrStrict(state.scwAddress);
  const code = await provider.getCode(current);
  if (code && code !== '0x' && code !== '0x00') {
    state.scwDeployed = true;
    return { deployed: true, address: current, txHash: null };
  }

  // Salt discovery: try up to 10,000
  const owner = aa.ownerAddress || state.signer.address;
  const factoryAddr = RUNTIME.ACCOUNT_FACTORY;
  let salt = await findSaltForSCW(provider, factoryAddr, owner, current, Math.max(AA_CONFIG.MAX_SALT_TRIES, 10000));
  if (salt == null) {
    console.log('No matching salt found — using salt=0 fallback');
  }
  salt = salt ?? 0n;

  // Build initCode (fallback to manual if helper fails)
  let initCode;
  try {
    ({ initCode } = await buildInitCodeForSCW(provider, factoryAddr, owner, current, salt));
  } catch {
    const iface = new ethers.Interface(SCW_FACTORY_ABI);
    const data = iface.encodeFunctionData('createAccount', [owner, salt]);
    initCode = ethers.concat([factoryAddr, data]);
    console.log('Manual initCode constructed (fallback)');
  }

  // If sender already has code (race), skip deploy
  const senderCode = await provider.getCode(current);
  if (senderCode && senderCode !== '0x' && senderCode !== '0x00') {
    state.scwDeployed = true;
    return { deployed: true, address: current, txHash: null };
  }

  // Aggressive UserOp deploy attempt
  const scwIface = new ethers.Interface(['function execute(address,uint256,bytes)']);
  const noop = scwIface.encodeFunctionData('execute', [current, 0n, '0x']);
  try {
    const userOp = await aa.createUserOp(noop, {
      forceDeploy: true,
      initCode,
      callGasLimit: 3_000_000n,
      verificationGasLimit: 4_000_000n,
      preVerificationGas: 600_000n
    });
    const signed = await aa.signUserOp(userOp);
    const txHash = await aa.sendUserOpWithBackoff(signed, 15);
    console.log(`Aggressive deploy UserOp sent: ${txHash}`);

    // Long polling for code appearance
    for (let i = 0; i < 90; i++) {
      const newCode = await provider.getCode(current);
      if (newCode && newCode !== '0x' && newCode !== '0x00') {
        state.scwDeployed = true;
        state.lastTxHashes.deploy = txHash;
        console.log(`SCW code detected at ${current}`);
        return { deployed: true, address: current, txHash };
      }
      await new Promise(r => setTimeout(r, 4000));
    }
  } catch (e) {
    console.warn(`UserOp deploy failed: ${e.message}`);
  }

  // Direct factory fallback
  console.log(`Direct factory fallback: createAccount(owner, salt=${salt})...`);
  const factorySigned = new ethers.Contract(factoryAddr, SCW_FACTORY_ABI, state.signer);
  try {
    const tx = await factorySigned.createAccount(owner, salt, { gasLimit: 8_000_000 });
    console.log(`Direct deploy tx: ${tx.hash}`);
    await tx.wait();
    const finalCode = await provider.getCode(current);
    if (finalCode && finalCode !== '0x' && finalCode !== '0x00') {
      state.scwDeployed = true;
      state.lastTxHashes.deploy = tx.hash;
      console.log(`Direct deploy success — SCW live at ${current}`);
      return { deployed: true, address: current, txHash: tx.hash };
    }
  } catch (e) {
    console.error(`Direct deploy failed: ${e.message}`);
  }

  throw new Error('SCW deploy failed — target remains without code.');
}

/* ------------ EntryPoint deposit (fix AA31) ------------ */
async function ensureEpDepositForApprovals() {
  const epRO = new ethers.Contract(RUNTIME.ENTRY_POINT, ENTRYPOINT_ABI, state.provider);
  const ep = new ethers.Contract(RUNTIME.ENTRY_POINT, ENTRYPOINT_ABI, state.signer);
  const minDepositWei = ethers.parseEther(RUNTIME.MIN_EP_DEPOSIT_ETH);

  if (RUNTIME.PAYMASTER_MODE !== 'NONE') {
    const current = await epRO.getDeposit(RUNTIME.PAYMASTER_ADDRESS);
    if (current < minDepositWei) {
      console.log(`Depositing ${ethers.formatEther(minDepositWei)} ETH to paymaster ${RUNTIME.PAYMASTER_ADDRESS}...`);
      const tx = await ep.depositTo(RUNTIME.PAYMASTER_ADDRESS, { value: minDepositWei });
      const rc = await tx.wait();
      state.lastTxHashes.epDeposit = rc?.transactionHash || tx.hash;
      console.log(`Paymaster deposit: ${state.lastTxHashes.epDeposit}`);
    } else {
      console.log('Paymaster deposit sufficient.');
    }
  } else {
    const current = await epRO.getDeposit(state.scwAddress);
    if (current < minDepositWei) {
      console.log(`Depositing ${ethers.formatEther(minDepositWei)} ETH to SCW ${state.scwAddress}...`);
      const tx = await ep.depositTo(state.scwAddress, { value: minDepositWei });
      const rc = await tx.wait();
      state.lastTxHashes.epDeposit = rc?.transactionHash || tx.hash;
      console.log(`SCW deposit: ${state.lastTxHashes.epDeposit}`);
    } else {
      console.log('SCW deposit sufficient.');
    }
  }
}

/* ------------ Approvals (USDC, BWAEZI) ------------ */
async function sendApprovals() {
  const aa = state.aa;
  const router = RUNTIME.UNISWAP_V3_ROUTER;
  const erc20Iface = new ethers.Interface(['function approve(address,uint256) returns (bool)']);
  const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);

  const approveToken = async (tokenAddr, label) => {
    const approveData = erc20Iface.encodeFunctionData('approve', [router, ethers.MaxUint256]);
    const callData = scwIface.encodeFunctionData('execute', [tokenAddr, 0n, approveData]);

    const userOp = await aa.createUserOp(callData, {
      forceDeploy: !state.scwDeployed,
      callGasLimit: 300_000n
    });
    const signed = await aa.signUserOp(userOp);
    const txHash = await aa.sendUserOpWithBackoff(signed, 5);
    console.log(`Approved ${label}: ${txHash}`);

    if (label === 'USDC') { state.approvalsSent.USDC = true; state.lastTxHashes.approveUSDC = txHash; }
    if (label === 'BWAEZI') { state.approvalsSent.BWAEZI = true; state.lastTxHashes.approveBWAEZI = txHash; }
    return txHash;
  };

  const res = { ok: true, txs: {} };
  if (!state.approvalsSent.USDC) res.txs.USDC = await approveToken(RUNTIME.TOKENS.USDC, 'USDC');
  if (!state.approvalsSent.BWAEZI) res.txs.BWAEZI = await approveToken(RUNTIME.TOKENS.BWAEZI, 'BWAEZI');
  return res;
}

/* ------------ Server ------------ */
function createServer() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get('/health', (req, res) => {
    res.json({
      status: 'OPERATIONAL',
      version: RUNTIME.VERSION,
      network: RUNTIME.NETWORK,
      scwAddress: state.scwAddress,
      scwDeployed: state.scwDeployed,
      approvalsSent: state.approvalsSent,
      lastTxs: state.lastTxHashes,
      uptimeMs: nowTs() - state.startTs,
      timestamp: new Date().toISOString()
    });
  });

  app.get('/status', async (req, res) => {
    try {
      const blockNumber = await state.provider.getBlockNumber();
      res.json({
        connected: true,
        chainId: RUNTIME.NETWORK.chainId,
        blockNumber,
        scwAddress: state.scwAddress,
        scwDeployed: state.scwDeployed,
        approvalsSent: state.approvalsSent,
        lastTxs: state.lastTxHashes,
        timestamp: new Date().toISOString()
      });
    } catch (e) {
      res.status(500).json({ connected: false, error: e.message });
    }
  });

  app.post('/approve', async (req, res) => {
    try {
      await ensureScwDeployed();
      await ensureEpDepositForApprovals();
      const result = await sendApprovals();
      res.json({ ok: true, result, scwAddress: state.scwAddress, lastTxs: state.lastTxHashes });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/bootstrap', async (req, res) => {
    try {
      await ensureScwDeployed();
      await ensureEpDepositForApprovals();
      const approvals = await sendApprovals();
      res.json({ ok: true, scwDeployed: state.scwDeployed, approvals, scwAddress: state.scwAddress, lastTxs: state.lastTxHashes });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  const server = app.listen(RUNTIME.PORT, '0.0.0.0', () => {
    console.log(`✅ Settlement-only server on :${RUNTIME.PORT}`);
    console.log(`→ Health:    http://localhost:${RUNTIME.PORT}/health`);
    console.log(`→ Status:    http://localhost:${RUNTIME.PORT}/status`);
    console.log(`→ Approvals: POST http://localhost:${RUNTIME.PORT}/approve`);
    console.log(`→ Bootstrap: POST http://localhost:${RUNTIME.PORT}/bootstrap`);
  });

  return { app, server };
}

/* ------------ Bootstrap ------------ */
(async () => {
  console.log(`🚀 Settlement-only init — ${RUNTIME.VERSION}`);
  try {
    await initProviderAndAA();

    // Force deploy (if needed), ensure EntryPoint deposit, then approvals
    await ensureScwDeployed();
    await ensureEpDepositForApprovals();
    await sendApprovals();

    // Start server for monitoring and re-triggering
    createServer();
    console.log('✅ Ready — SCW deployed (or verified) and approvals set.');
  } catch (e) {
    console.error(`❌ Initialization failed: ${e.message}`);
    // Fallback server to keep service alive for logs/inspection
    const app = express();
    app.get('/', (req, res) => res.json({ status: 'FAILED_INIT', error: e.message }));
    const port = RUNTIME.PORT || 10000;
    app.listen(port, () => console.log(`🛑 Fallback server on :${port}`));
  }
})();

export {};
