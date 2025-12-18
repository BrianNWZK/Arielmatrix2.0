// arielsql_suite/main.js — Settlement-only (SCW deploy + approvals only, no transfers, no loops)
//
// Env required:
//   - SOVEREIGN_PRIVATE_KEY: EOA private key (0x-prefixed hex)
// Optional:
//   - SCW_ADDRESS, EOA_OWNER, ACCOUNT_FACTORY, BUNDLER_RPC_URL, PORT

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

function nowTs() { return Date.now(); }
function addrStrict(a) { try { return ethers.getAddress(String(a).trim()); } catch { return String(a).trim(); } }

const RUNTIME = {
  NETWORK: AA_CONFIG.NETWORK,
  ENTRY_POINT: addrStrict(AA_CONFIG.ENTRY_POINTS?.V07 || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),
  TOKENS: {
    USDC: addrStrict(AA_CONFIG.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    BWAEZI: addrStrict(AA_CONFIG.BWAEZI_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da')
  },
  UNISWAP_V3_ROUTER: addrStrict(AA_CONFIG.UNISWAP?.V3_ROUTER_ADDRESS || '0xE592427A0AEce92De3Edee1F18E0157C05861564'),
  SCW_ADDRESS: addrStrict(process.env.SCW_ADDRESS || AA_CONFIG.SCW_ADDRESS || '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C'),
  ACCOUNT_FACTORY: addrStrict(process.env.ACCOUNT_FACTORY || AA_CONFIG.ACCOUNT_FACTORY || '0x9406Cc6185a346906296840746125a0E44976454'),
  EOA_OWNER: (() => {
    const eo = process.env.EOA_OWNER || AA_CONFIG.EOA_OWNER || '';
    return eo && eo.startsWith('0x') ? addrStrict(eo) : null;
  })(),
  RPC_PROVIDERS: AA_CONFIG.PUBLIC_RPC_ENDPOINTS?.length ? AA_CONFIG.PUBLIC_RPC_ENDPOINTS : [
    'https://ethereum-rpc.publicnode.com',
    'https://rpc.ankr.com/eth',
    'https://eth.llamarpc.com'
  ],
  BUNDLER_RPC_URL: process.env.BUNDLER_RPC_URL || AA_CONFIG.BUNDLER?.RPC_URL || '',
  PORT: Number(process.env.PORT || 10000),
  VERSION: 'settlement-only-v1'
};

const state = {
  startTs: nowTs(),
  provider: null,
  signer: null,
  aa: null,
  scwAddress: RUNTIME.SCW_ADDRESS,
  scwDeployed: false,
  approvalsSent: { USDC: false, BWAEZI: false },
  lastTxHashes: { deploy: null, approveUSDC: null, approveBWAEZI: null }
};

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

  // Optional: try alignment, but NEVER align to factory address
  try {
    const factory = new ethers.Contract(RUNTIME.ACCOUNT_FACTORY, SCW_FACTORY_ABI, provider);
    const predictedRaw = await factory.getAddress(aa.ownerAddress, 0n);
    const predicted = addrStrict(predictedRaw);
    const factoryAddr = addrStrict(RUNTIME.ACCOUNT_FACTORY);
    if (predicted.toLowerCase() === factoryAddr.toLowerCase()) {
      console.warn(`SCW coalescing guard: predicted equals factory (invalid). Keeping configured SCW ${RUNTIME.SCW_ADDRESS}`);
    } else if (addrStrict(RUNTIME.SCW_ADDRESS) !== predicted) {
      console.warn(`Aligning SCW: ${RUNTIME.SCW_ADDRESS} → predicted ${predicted}`);
      RUNTIME.SCW_ADDRESS = predicted;
      state.scwAddress = predicted;
      aa.scwAddress = predicted;
    } else {
      state.scwAddress = RUNTIME.SCW_ADDRESS;
    }
  } catch (e) {
    console.warn(`SCW coalescing skipped: ${e.message}`);
  }

  state.provider = provider;
  state.signer = signer;
  state.aa = aa;
}

async function ensureScwDeployed() {
  const provider = state.provider;
  const aa = state.aa;

  // 1) If already deployed, exit
  const current = addrStrict(state.scwAddress);
  const code = await provider.getCode(current);
  if (code && code !== '0x') {
    state.scwDeployed = true;
    return { deployed: true, address: current, txHash: null };
  }

  // 2) Determine a valid predicted sender (must NOT be factory address)
  const owner = aa.ownerAddress || state.signer.address;
  const factoryAddr = RUNTIME.ACCOUNT_FACTORY;
  const factory = new ethers.Contract(factoryAddr, SCW_FACTORY_ABI, provider);

  const salt = await findSaltForSCW(provider, factoryAddr, owner, current, AA_CONFIG.MAX_SALT_TRIES);
  const predictedRaw = await factory.getAddress(owner, salt ?? 0n);
  const predicted = addrStrict(predictedRaw);

  // If predicted equals factory (bad ABI or factory bug), DO NOT realign
  if (predicted.toLowerCase() === factoryAddr.toLowerCase()) {
    console.warn(`Predicted sender equals factory (${predicted}). Skipping realignment; will use configured SCW ${current}`);
  } else if (predicted.toLowerCase() !== current.toLowerCase()) {
    console.warn(`Realigning sender: ${current} → ${predicted} (salt=${salt ?? 0n})`);
    state.scwAddress = predicted;
    aa.scwAddress = predicted;
  }

  const sender = addrStrict(state.scwAddress);

  // 3) Build initCode for (owner, salt) to deploy 'sender'
  const { initCode } = await buildInitCodeForSCW(provider, factoryAddr, owner, sender, salt ?? 0n);
  console.log(`Prepared initCode for deployment`);

  // Sanity: if sender currently has code, avoid AA10
  const senderCode = await provider.getCode(sender);
  if (senderCode && senderCode !== '0x') {
    console.warn(`Sender ${sender} already has code. Skipping deployment step.`);
    state.scwDeployed = true;
    return { deployed: true, address: sender, txHash: null };
  }

  // 4) NOOP execute; PASS initCode in options
  const scwIface = new ethers.Interface(['function execute(address,uint256,bytes)']);
  const noop = scwIface.encodeFunctionData('execute', [sender, 0n, '0x']);

  const userOp = await aa.createUserOp(noop, {
    forceDeploy: true,
    initCode: initCode,
    callGasLimit: 400_000n,
    verificationGasLimit: 700_000n,
    preVerificationGas: 80_000n
  });

  const signed = await aa.signUserOp(userOp);
  const txHash = await aa.sendUserOpWithBackoff(signed, 5);

  console.log(`SCW deployed: ${txHash}`);

  state.scwDeployed = true;
  state.lastTxHashes.deploy = txHash;
  return { deployed: true, address: sender, txHash };
}

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
      const result = await sendApprovals();
      res.json({ ok: true, result, scwAddress: state.scwAddress, lastTxs: state.lastTxHashes });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  app.post('/bootstrap', async (req, res) => {
    try {
      await ensureScwDeployed();
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

/* =========================================================================
   Bootstrap (auto deploy + approvals on startup)
   ========================================================================= */
(async () => {
  console.log(`🚀 Settlement-only init — ${RUNTIME.VERSION}`);
  try {
    await initProviderAndAA();

    // Proactively deploy SCW (force-deploy) then approvals
    await ensureScwDeployed();
    await sendApprovals();

    // Start minimal server
    createServer();
    console.log('✅ Ready — SCW deployed and approvals set.');
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
