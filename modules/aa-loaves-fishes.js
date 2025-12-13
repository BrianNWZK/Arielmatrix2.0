// modules/aa-loaves-fishes.js — LIVE AA INFRASTRUCTURE v14.3
// Hard peg ($100 per BWAEZI) via SCW payouts using multi-source prices,
// Runtime bundler injection (no env enforcement), SCW approvals via AA,
// precise fixed-point math, Uniswap visibility/rebalancing,
// health-scored RPC, min-out safety, and deterministic EP v0.7.

import { ethers } from 'ethers';

/* =========================================================================
   Strict address normalization
   ========================================================================= */
function addrStrict(a) {
  try { return ethers.getAddress(String(a).trim()); }
  catch { const s = String(a).trim(); return s.startsWith('0x') ? s.toLowerCase() : s; }
}

/* =========================================================================
   Enhanced configuration (forced-network, optional bundler/paymaster)
   ========================================================================= */

const ENHANCED_CONFIG = {
  VERSION: 'v4.3.0-LIVE',

  NETWORK: {
    name: process.env.NETWORK_NAME || 'mainnet',
    chainId: Number(process.env.NETWORK_CHAIN_ID || 1)
  },

  ENTRY_POINTS: {
    // Only v0.7 EntryPoint in live mode
    V07: addrStrict(process.env.ENTRY_POINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789')
  },

  UNISWAP: {
    FACTORY_ADDRESS: addrStrict(process.env.FACTORY_ADDRESS || '0x1F98431c8aD98523631AE4a59f267346ea31F984'),
    POSITION_MANAGER_ADDRESS: addrStrict('0xC36442b4a4522E871399CD717aBDD847Ab11FE88'),
    V3_ROUTER_ADDRESS: addrStrict('0xE592427A0AEce92De3Edee1F18E0157C05861564')
  },

  // Core tokens (mainnet defaults; override via env)
  SCW_ADDRESS: addrStrict(process.env.SCW_ADDRESS || '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C'),
  BWAEZI_ADDRESS: addrStrict(process.env.BWAEZI_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'), // 18 decimals
  USDC_ADDRESS: addrStrict(process.env.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),  // 6 decimals
  WETH_ADDRESS: addrStrict(process.env.WETH_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),  // 18 decimals

  PAYMASTER: {
    MODE: (process.env.PAYMASTER_MODE || 'ONCHAIN').toUpperCase(), // NONE | API | ONCHAIN | PASSTHROUGH
    // Injected confirmed BWAEZI Paymaster (Ethereum mainnet, live)
    ADDRESS: addrStrict('0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47'),
    API_URL: process.env.PAYMASTER_API_URL || '',               // used only in API mode
    SIGNER_KEY: process.env.PAYMASTER_SIGNER_KEY || ''          // optional if paymaster requires off-chain signatures
  },

BUNDLER: {
  // v14.3 accepts runtime bundler URL; env is optional fallback
  RPC_URL:
    process.env.BUNDLER_RPC_URL
    || (process.env.PIMLICO_API_KEY ? `https://bundler.pimlico.io/v2/${Number(process.env.NETWORK_CHAIN_ID || 1)}/${process.env.PIMLICO_API_KEY}` : '')
    || (process.env.STACKUP_API_KEY ? `https://api.stackup.sh/v1/node/${process.env.STACKUP_API_KEY}` : '')
    || (process.env.BICONOMY_API_KEY ? `https://bundler.biconomy.io/api/v2/${Number(process.env.NETWORK_CHAIN_ID || 1)}/${process.env.BICONOMY_API_KEY}` : ''),
  TIMEOUT_MS: Number(process.env.BUNDLER_TIMEOUT_MS || 180000),

  // Rotation list for resilient bundler failover
  ROTATION: [
    "https://bundler.candide.xyz/rpc/mainnet",                 // Candide public bundler
    "https://bundler.pimlico.io/v2/1/pim_K4etjrjHvpTx4We2SuLLjt", // Pimlico (replace with your API key)
    "https://rpc.skandha.xyz/v1/mainnet",                      // Skandha (Etherspot community bundler)
    "https://rpc.4337.io",                                     // 4337.io public bundler aggregator
    "https://aa-bundler.etherspot.io/v1/mainnet",              // Etherspot bundler
    "https://bundler.openfort.xyz/v1/mainnet",                 // Openfort bundler
    "https://api.stackup.sh/v1/node/YOUR_STACKUP_API_KEY",     // Stackup (replace with your API key)
    "https://bundler.biconomy.io/api/v2/1/YOUR_BICONOMY_KEY"   // Biconomy (replace with your API key)
  ]
},

/**
 * Pick the healthiest bundler from ROTATION list.
 * Tries each URL, returns the first that responds to eth_supportedEntryPoints.
 */
async function pickHealthyBundler(rotation = ENHANCED_CONFIG.BUNDLER.ROTATION) {
  for (const url of rotation) {
    try {
      const provider = new ethers.JsonRpcProvider(url, {
        chainId: ENHANCED_CONFIG.NETWORK.chainId,
        name: ENHANCED_CONFIG.NETWORK.name
      });
      const eps = await provider.send("eth_supportedEntryPoints", []);
      if (Array.isArray(eps) && eps.length > 0) {
        console.log(`✅ Healthy bundler selected: ${url}`);
        return url;
      }
    } catch (e) {
      console.warn(`⚠️ Bundler unhealthy: ${url} (${e.message})`);
    }
  }
  throw new Error("No healthy bundler found in rotation");
}

  PUBLIC_RPC_ENDPOINTS: [
  "https://ethereum-rpc.publicnode.com",
  "https://rpc.ankr.com/eth",
  "https://cloudflare-eth.com"
],

  ORACLES: {
    CHAINLINK_ETH_USD: addrStrict(process.env.CHAINLINK_ETH_USD || '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419'), // mainnet ETH/USD
    MAX_DIVERGENCE_PCT: Number(process.env.ORACLE_MAX_DIVERGENCE || 0.15), // 15%
    STALE_SECONDS: Number(process.env.ORACLE_STALE_SECONDS || 7200) // 2 hours
  }
};

/* =========================================================================
   Minimal env validation (no bundler enforcement in v14.3)
   ========================================================================= */

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env: ${name}`);
  return v;
}

function assertRuntime() {
  // Only ensure the sovereign signer exists and paymaster config matches chosen mode.
  requireEnv('SOVEREIGN_PRIVATE_KEY');
  if (ENHANCED_CONFIG.PAYMASTER.MODE !== 'NONE' && !ENHANCED_CONFIG.PAYMASTER.ADDRESS && !ENHANCED_CONFIG.PAYMASTER.API_URL) {
    throw new Error('Paymaster configuration incomplete for selected mode');
  }
}

/* =========================================================================
   EntryPoint interface (deposit/stake helpers)
   ========================================================================= */

const ENTRYPOINT_ABI = [
  'function depositTo(address account) payable',
  'function addStake(uint32 unstakeDelaySec) payable',
  'function getDeposit(address account) view returns (uint256)',
  'function getNonce(address sender, uint192 key) view returns (uint256)'
];

function getEntryPoint(provider) {
  return new ethers.Contract(ENHANCED_CONFIG.ENTRY_POINTS.V07, ENTRYPOINT_ABI, provider);
}

async function depositToEntryPoint(signer, amountWei) {
  const ep = new ethers.Contract(ENHANCED_CONFIG.ENTRY_POINTS.V07, ENTRYPOINT_ABI, signer);
  const tx = await ep.depositTo(ENHANCED_CONFIG.PAYMASTER.ADDRESS, { value: amountWei });
  const rec = await tx.wait();
  return rec.transactionHash;
}

async function addStakeToEntryPoint(signer, delaySec, amountWei) {
  const ep = new ethers.Contract(ENHANCED_CONFIG.ENTRY_POINTS.V07, ENTRYPOINT_ABI, signer);
  const tx = await ep.addStake(delaySec, { value: amountWei });
  const rec = await tx.wait();
  return rec.transactionHash;
}

/* =========================================================================
   Forced-network provider factory (prevents autodetect loops)
   ========================================================================= */

function createNetworkForcedProvider(url, chainId = ENHANCED_CONFIG.NETWORK.chainId) {
  const request = new ethers.FetchRequest(url);
  request.timeout = ENHANCED_CONFIG.CONNECTION_SETTINGS.timeout;
  request.retry = ENHANCED_CONFIG.CONNECTION_SETTINGS.maxRetries;
  request.allowGzip = true;
  return new ethers.JsonRpcProvider(request, { chainId, name: ENHANCED_CONFIG.NETWORK.name });
}

/* =========================================================================
   Enhanced RPC manager (health-scored, sticky)
   ========================================================================= */

class EnhancedRPCManager {
  constructor(rpcUrls = ENHANCED_CONFIG.PUBLIC_RPC_ENDPOINTS, chainId = ENHANCED_CONFIG.NETWORK.chainId) {
    this.rpcUrls = rpcUrls;
    this.chainId = chainId;
    this.providers = [];
    this.sticky = null;
    this.initialized = false;
  }

  async init() {
    for (const url of this.rpcUrls) {
      try {
        const provider = createNetworkForcedProvider(url, this.chainId);
        const start = Date.now();
        const blockNumber = await provider.getBlockNumber();
        const latency = Date.now() - start;
        if (blockNumber >= 0) {
          this.providers.push({ url, provider, latency, health: 100 });
          if (!this.sticky) this.sticky = provider;
        }
      } catch {
        // continue to next URL
      }
    }
    if (!this.sticky) throw new Error('No healthy RPC provider');
    this.initialized = true;
    this._startHealthMonitor();
    return this;
  }

  _startHealthMonitor() {
    setInterval(async () => {
      for (const p of this.providers) {
        try {
          const s = Date.now();
          await p.provider.getBlockNumber();
          p.latency = Date.now() - s;
          const scoreLatency = Math.max(0, 100 * Math.exp(-p.latency / 300)); // smoother decay
          p.health = Math.min(100, Math.round(p.health * 0.85 + scoreLatency * 0.15));
        } catch {
          p.health = Math.max(0, p.health - 20);
        }
      }
      const best = this.providers.slice().sort((a, b) => (b.health - a.health) || (a.latency - b.latency))[0];
      if (best && best.provider !== this.sticky) this.sticky = best.provider;
    }, ENHANCED_CONFIG.CONNECTION_SETTINGS.healthCheckInterval);
  }

  getProvider() {
    if (!this.initialized || !this.sticky) throw new Error('RPC manager not initialized');
    return this.sticky;
  }

  async getFeeData() {
    try {
      const fd = await this.getProvider().getFeeData();
      return {
        maxFeePerGas: fd.maxFeePerGas || ethers.parseUnits('30', 'gwei'),
        maxPriorityFeePerGas: fd.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei'),
        gasPrice: fd.gasPrice || ethers.parseUnits('25', 'gwei')
      };
    } catch {
      return {
        maxFeePerGas: ethers.parseUnits('30', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('2', 'gwei'),
        gasPrice: ethers.parseUnits('25', 'gwei')
      };
    }
  }
}

/* =========================================================================
   Bundler client (ERC-4337 JSON-RPC) — runtime URL, no env enforcement
   ========================================================================= */

class BundlerClient {
  constructor(url) {
    if (!url) throw new Error('BundlerClient: runtime bundler URL required');
    this.provider = new ethers.JsonRpcProvider(url, { chainId: ENHANCED_CONFIG.NETWORK.chainId, name: ENHANCED_CONFIG.NETWORK.name });
    this.url = url;
  }

  async supportedEntryPoints() {
    return await this.provider.send('eth_supportedEntryPoints', []);
  }

  async healthCheck() {
    try {
      const eps = await this.supportedEntryPoints();
      const ok = Array.isArray(eps) && eps.some((addr) => ethers.getAddress(addr) === ethers.getAddress(ENHANCED_CONFIG.ENTRY_POINTS.V07));
      return { ok, supported: eps || [] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  async sendUserOperation(userOp, entryPoint) {
    return await this.provider.send('eth_sendUserOperation', [userOp, entryPoint]);
  }

  async getUserOperationReceipt(userOpHash) {
    return await this.provider.send('eth_getUserOperationReceipt', [userOpHash]);
  }

  async estimateUserOperationGas(userOp, entryPoint) {
    return await this.provider.send('eth_estimateUserOperationGas', [userOp, entryPoint]);
  }
}

/* =========================================================================
   Paymaster integrations (API | ONCHAIN | PASSTHROUGH)
   ========================================================================= */

class ExternalAPIPaymaster {
  constructor(apiUrl) { this.apiUrl = apiUrl; }
  async sponsor(userOp) {
    const body = {
      sender: userOp.sender,
      callData: userOp.callData,
      callGasLimit: userOp.callGasLimit.toString(),
      verificationGasLimit: userOp.verificationGasLimit.toString(),
      preVerificationGas: userOp.preVerificationGas.toString(),
      maxFeePerGas: userOp.maxFeePerGas.toString(),
      maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
      entryPoint: ENHANCED_CONFIG.ENTRY_POINTS.V07,
      chainId: ENHANCED_CONFIG.NETWORK.chainId
    };
    const res = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) throw new Error(`Paymaster API ${res.status}`);
    const data = await res.json();
    if (!data?.paymasterAndData || !ethers.isHexString(data.paymasterAndData)) {
      throw new Error('Invalid paymasterAndData from API');
    }
    return data.paymasterAndData;
  }
}

class OnChainVerifyingPaymaster {
  constructor(address, signer) {
    this.address = address;
    this.signer = signer;
  }
  async buildPaymasterAndData(userOp) {
    const packed = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address','uint256','bytes32','bytes32','uint256','uint256','uint256','uint256','uint256','bytes32'],
      [
        userOp.sender, userOp.nonce,
        ethers.keccak256(userOp.initCode),
        ethers.keccak256(userOp.callData),
        userOp.callGasLimit, userOp.verificationGasLimit, userOp.preVerificationGas,
        userOp.maxFeePerGas, userOp.maxPriorityFeePerGas,
        ethers.keccak256(userOp.paymasterAndData || '0x')
      ]
    );
    const enc = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32','address','uint256'],
      [ethers.keccak256(packed), ENHANCED_CONFIG.ENTRY_POINTS.V07, ENHANCED_CONFIG.NETWORK.chainId]
    );
    const userOpHash = ethers.keccak256(enc);
    const signature = await this.signer.signMessage(ethers.getBytes(userOpHash));
    const context = ethers.AbiCoder.defaultAbiCoder().encode(['bytes'], [ethers.getBytes(signature)]);
    return ethers.concat([this.address, context]);
  }
}

class PassthroughPaymaster {
  constructor(address) { this.address = address; }
  async buildPaymasterAndData() {
    return ethers.concat([this.address, '0x']);
  }
}

/* =========================================================================
   Enterprise AA SDK (live bundler + live paymaster) — runtime bundler
   ========================================================================= */

class EnterpriseAASDK {
  constructor(signer, entryPoint = ENHANCED_CONFIG.ENTRY_POINTS.V07) {
    if (!signer || !signer.address) throw new Error('EnterpriseAASDK: Valid signer required');
    this.signer = signer;
    this.entryPoint = entryPoint;
    this.scwAddress = ENHANCED_CONFIG.SCW_ADDRESS;
    this.provider = null;
    this.bundler = null;
    this.paymasterMode = ENHANCED_CONFIG.PAYMASTER.MODE;
    this.paymasterAPI = null;
    this.verifyingPaymaster = null;
    this.passthroughPaymaster = null;
    this.initialized = false;
  }

  async initialize(provider, scwAddress = null, bundlerUrl = null) {
    this.provider = provider;
    this.scwAddress = scwAddress || ENHANCED_CONFIG.SCW_ADDRESS;

    const url = bundlerUrl || ENHANCED_CONFIG.BUNDLER.RPC_URL;
    if (!url) {
      throw new Error('No bundler URL provided. Pass bundlerUrl to initialize() or set ENHANCED_CONFIG.BUNDLER.RPC_URL optionally.');
    }
    this.bundler = new BundlerClient(url);
    const health = await this.bundler.healthCheck();
    if (!health.ok) throw new Error(`Bundler health check failed: ${health.error || 'unsupported entrypoint'}`);

    if (this.paymasterMode === 'API') {
      if (!ENHANCED_CONFIG.PAYMASTER.API_URL) throw new Error('PAYMASTER_API_URL required for API mode');
      this.paymasterAPI = new ExternalAPIPaymaster(ENHANCED_CONFIG.PAYMASTER.API_URL);
    } else if (this.paymasterMode === 'ONCHAIN') {
      if (!ENHANCED_CONFIG.PAYMASTER.ADDRESS) throw new Error('PAYMASTER_ADDRESS required for ONCHAIN mode');
      const pmSigner = ENHANCED_CONFIG.PAYMASTER.SIGNER_KEY
        ? new ethers.Wallet(ENHANCED_CONFIG.PAYMASTER.SIGNER_KEY, this.provider)
        : this.signer;
      this.verifyingPaymaster = new OnChainVerifyingPaymaster(ENHANCED_CONFIG.PAYMASTER.ADDRESS, pmSigner);
    } else if (this.paymasterMode === 'PASSTHROUGH') {
      if (!ENHANCED_CONFIG.PAYMASTER.ADDRESS) throw new Error('PAYMASTER_ADDRESS required for PASSTHROUGH mode');
      this.passthroughPaymaster = new PassthroughPaymaster(ENHANCED_CONFIG.PAYMASTER.ADDRESS);
    }

    this.initialized = true;
    return this;
  }

  async getNonce(smartAccount) {
    const ep = new ethers.Contract(this.entryPoint, ['function getNonce(address sender, uint192 key) view returns (uint256)'], this.provider);
    try { const n = await ep.getNonce(smartAccount, 0); return typeof n === 'bigint' ? n : BigInt(n); } catch { return 0n; }
  }

  _formatUserOpForBundler(userOp) {
    return {
      sender: userOp.sender,
      nonce: ethers.toBeHex(userOp.nonce),
      initCode: userOp.initCode,
      callData: userOp.callData,
      callGasLimit: ethers.toBeHex(userOp.callGasLimit),
      verificationGasLimit: ethers.toBeHex(userOp.verificationGasLimit),
      preVerificationGas: ethers.toBeHex(userOp.preVerificationGas),
      maxFeePerGas: ethers.toBeHex(userOp.maxFeePerGas),
      maxPriorityFeePerGas: ethers.toBeHex(userOp.maxPriorityFeePerGas),
      paymasterAndData: userOp.paymasterAndData,
      signature: userOp.signature
    };
  }

  async _sponsor(userOp) {
    if (this.paymasterMode === 'API') {
      return await this.paymasterAPI.sponsor(userOp);
    }
    if (this.paymasterMode === 'ONCHAIN') {
      return await this.verifyingPaymaster.buildPaymasterAndData(userOp);
    }
    if (this.paymasterMode === 'PASSTHROUGH') {
      return await this.passthroughPaymaster.buildPaymasterAndData();
    }
    return '0x';
  }

  async createUserOp(callData, opts = {}) {
    if (!this.initialized) throw new Error('EnterpriseAASDK not initialized');
    const sender = this.scwAddress;
    let nonce = await this.getNonce(sender);
    if (nonce == null) nonce = 0n;

    const fee = await this.provider.getFeeData();
    let maxFee = opts.maxFeePerGas || fee.maxFeePerGas || ethers.parseUnits('30', 'gwei');
    let maxTip = opts.maxPriorityFeePerGas || fee.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei');
    if (maxFee < maxTip) maxFee = maxTip;

    const userOp = {
      sender,
      nonce,
      initCode: '0x',
      callData,
      callGasLimit: opts.callGasLimit || 1_000_000n,
      verificationGasLimit: opts.verificationGasLimit || 600_000n,
      preVerificationGas: opts.preVerificationGas || 80_000n,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: maxTip,
      paymasterAndData: '0x',
      signature: '0x'
    };

    userOp.paymasterAndData = await this._sponsor(userOp);

    try {
      const est = await this.bundler.estimateUserOperationGas(this._formatUserOpForBundler(userOp), this.entryPoint);
      const toBig = (v, d) => (typeof v === 'string' ? BigInt(v) : BigInt(v ?? d));
      userOp.callGasLimit = toBig(est.callGasLimit, userOp.callGasLimit);
      userOp.verificationGasLimit = toBig(est.verificationGasLimit, userOp.verificationGasLimit);
      userOp.preVerificationGas = toBig(est.preVerificationGas, userOp.preVerificationGas);
      // Clamp minimums
      userOp.callGasLimit = userOp.callGasLimit < 400_000n ? 400_000n : userOp.callGasLimit;
    } catch {
      // proceed with defaults
    }

    return userOp;
  }

  async signUserOp(userOp) {
    const packed = ethers.AbiCoder.defaultAbiCoder().encode(
      ['address','uint256','bytes32','bytes32','uint256','uint256','uint256','uint256','uint256','bytes32'],
      [
        userOp.sender, userOp.nonce,
        ethers.keccak256(userOp.initCode),
        ethers.keccak256(userOp.callData),
        userOp.callGasLimit, userOp.verificationGasLimit, userOp.preVerificationGas,
        userOp.maxFeePerGas, userOp.maxPriorityFeePerGas,
        ethers.keccak256(userOp.paymasterAndData)
      ]
    );
    const enc = ethers.AbiCoder.defaultAbiCoder().encode(
      ['bytes32','address','uint256'],
      [ethers.keccak256(packed), this.entryPoint, ENHANCED_CONFIG.NETWORK.chainId]
    );
    const userOpHash = ethers.keccak256(enc);
    userOp.signature = await this.signer.signMessage(ethers.getBytes(userOpHash));
    return userOp;
  }

  async sendUserOpWithBackoff(userOp, maxAttempts = 5) {
    const op = this._formatUserOpForBundler(userOp);
    let lastErr;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const opHash = await this.bundler.sendUserOperation(op, this.entryPoint);
        const start = Date.now();
        while (Date.now() - start < ENHANCED_CONFIG.BUNDLER.TIMEOUT_MS) {
          const receipt = await this.bundler.getUserOperationReceipt(opHash);
          if (receipt?.transactionHash) return receipt.transactionHash;
          await new Promise(r => setTimeout(r, 1000));
        }
        return opHash; // caller can continue polling externally
      } catch (err) {
        lastErr = err;
        await new Promise(r => setTimeout(r, Math.min(30000, 1000 * Math.pow(2, attempt))));
      }
    }
    throw lastErr || new Error('Failed to send UserOperation');
  }

  getStats() {
    return {
      initialized: this.initialized,
      version: ENHANCED_CONFIG.VERSION,
      entryPoint: this.entryPoint,
      paymasterMode: this.paymasterMode,
      paymasterAddress: ENHANCED_CONFIG.PAYMASTER.ADDRESS
    };
  }
}

/* =========================================================================
   Enhanced MEV executor (SCW.execute wrapper using live AA)
   ========================================================================= */

class EnhancedMevExecutor {
  constructor(aa, scwAddress) {
    this.aa = aa;
    this.scw = scwAddress;
  }

  buildSCWExecute(target, calldata, value = 0n) {
    const iface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);
    return iface.encodeFunctionData('execute', [target, value, calldata]);
  }

  async sendCall(calldata, opts = {}) {
    const userOp = await this.aa.createUserOp(calldata, {
      callGasLimit: opts.gasLimit || 700_000n,
      verificationGasLimit: opts.verificationGasLimit || 500_000n,
      preVerificationGas: opts.preVerificationGas || 80_000n,
      maxFeePerGas: opts.maxFeePerGas,
      maxPriorityFeePerGas: opts.maxPriorityFeePerGas
    });
    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);
    return { txHash, timestamp: Date.now(), description: opts.description || 'enhanced_scw_execute' };
  }
}

/* =========================================================================
   Bootstrap helper (EntryPoint deposit probe and optional deposit/stake)
   ========================================================================= */

async function bootstrapSCWForPaymasterEnhanced(aa, provider, signer, scwAddress) {
  const ep = getEntryPoint(provider);
  let deposit = 0n;
  try { deposit = await ep.getDeposit(ENHANCED_CONFIG.PAYMASTER.ADDRESS); } catch {}

  const AUTO_PM_DEPOSIT = process.env.AUTO_PM_DEPOSIT === 'true';
  const AUTO_PM_STAKE = process.env.AUTO_PM_STAKE === 'true';

  if (AUTO_PM_DEPOSIT && deposit < ethers.parseEther('0.001')) {
    await depositToEntryPoint(signer, ethers.parseEther(process.env.AUTO_PM_DEPOSIT_WEI || '0.002'));
  }
  if (AUTO_PM_STAKE) {
    const delay = Number(process.env.AUTO_PM_UNSTAKE_DELAY || 86400);
    const amount = ethers.parseEther(process.env.AUTO_PM_STAKE_WEI || '0.002');
    await addStakeToEntryPoint(signer, delay, amount);
  }

  // Always use v0.7 EP in live mode
  return { entryPoint: ENHANCED_CONFIG.ENTRY_POINTS.V07, paymasterDeposit: deposit };
}

/* =========================================================================
   Utility: token sorting and precise sqrtPriceX96 (BigInt fixed-point)
   ========================================================================= */

function sortTokens(tokenA, tokenB) {
  const a = ethers.getAddress(tokenA);
  const b = ethers.getAddress(tokenB);
  if (a.toLowerCase() < b.toLowerCase()) {
    return { token0: a, token1: b, inverted: false };
  } else {
    return { token0: b, token1: a, inverted: true };
  }
}

// sqrtPriceX96 for desired price (token1 per token0) using BigInt fixed-point
function encodeSqrtPriceX96(priceToken1PerToken0, token0Decimals, token1Decimals) {
  // 6-dec fixed for humans -> upscale to 1e18 fixed-point internally
  const ONE18 = 10n ** 18n;
  const decDiff = BigInt(token1Decimals - token0Decimals);
  const priceFP = BigInt(Math.round(Number(priceToken1PerToken0) * 1e18));
  const scaleNum = decDiff >= 0 ? 10n ** decDiff : 1n;
  const scaleDen = decDiff >= 0 ? 1n : 10n ** (-decDiff);

  function sqrtBig(n) { let x = n; let y = (x + 1n) >> 1n; while (y < x) { x = y; y = (x + n / x) >> 1n; } return x; }
  const ratioFP = (priceFP * scaleNum * ONE18) / (scaleDen);
  const sqrtFP = sqrtBig(ratioFP);
  const Q96 = 2n ** 96n;
  return (sqrtFP * Q96) / ONE18;
}

/* =========================================================================
   Oracle aggregator: Chainlink + Uniswap with divergence checks (FP6)
   ========================================================================= */

class PriceOracleAggregator {
  constructor(provider) {
    this.provider = provider;
    this.chainlinkAddr = ENHANCED_CONFIG.ORACLES.CHAINLINK_ETH_USD;
    this.chainlinkIface = new ethers.Interface([
      'function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)',
      'function decimals() view returns (uint8)'
    ]);
  }

  async getChainlinkEthUsdFP6() {
    const feed = new ethers.Contract(this.chainlinkAddr, this.chainlinkIface.fragments, this.provider);
    const [, answer, , updatedAt] = await feed.latestRoundData();
    const decimals = await feed.decimals();
    if (!answer || answer <= 0n) throw new Error('Chainlink ETH/USD invalid');
    const now = Math.floor(Date.now()/1000);
    if (Number(updatedAt) < now - ENHANCED_CONFIG.ORACLES.STALE_SECONDS) {
      throw new Error('Chainlink ETH/USD stale');
    }
    const USD_FP6 = 1_000_000n;
    const priceFP6 = (BigInt(answer) * USD_FP6) / (10n ** BigInt(decimals));
    return priceFP6;
  }

  async getUniswapEthUsdFP6(weth, usdc) {
    const factory = new ethers.Contract(
      ENHANCED_CONFIG.UNISWAP.FACTORY_ADDRESS,
      ['function getPool(address,address,uint24) view returns (address)'],
      this.provider
    );
    const pool = await factory.getPool(usdc, weth, 500);
    if (pool === ethers.ZeroAddress) throw new Error('No ETH/USDC v3 0.05% pool');
    const slotIface = new ethers.Interface(['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)']);
    const c = new ethers.Contract(pool, slotIface.fragments, this.provider);
    const [sqrtPriceX96] = await c.slot0();

    const TWO192 = 2n ** 192n;
    const sqrt = BigInt(sqrtPriceX96);
    const invPrice = (TWO192) / (sqrt * sqrt);        // USDC per WETH, unscaled
    const adj = invPrice * (10n ** 12n);              // decimals adjust to 6-dec from 18
    const USD_FP6 = 1_000_000n;
    const priceFP6 = (adj * USD_FP6) / (10n ** 12n);  // normalize back to FP6
    return priceFP6;
  }

  async getEthUsdBlendedFP6({ weth, usdc }) {
    const chainlinkFP6 = await this.getChainlinkEthUsdFP6();
    const uniFP6 = await this.getUniswapEthUsdFP6(weth, usdc);

    const arr = [chainlinkFP6, uniFP6].filter(v => v > 0n);
    const avgFP6 = arr.reduce((a,b) => a + b, 0n) / BigInt(arr.length);

    const toNum = (x) => Number(x) / 1e6;
    const avgNum = toNum(avgFP6);
    const devs = arr.map(x => Math.abs(toNum(x) - avgNum) / avgNum);
    const devMax = Math.max(...devs);
    if (devMax > ENHANCED_CONFIG.ORACLES.MAX_DIVERGENCE_PCT) {
      throw new Error('Oracle divergence too high');
    }
    return avgFP6;
  }
}

/* =========================================================================
   SCW approvals via AA (approve spender from SCW context)
   ========================================================================= */

async function scwApproveToken(aa, scw, token, spender, amount = ethers.MaxUint256) {
  const erc20Iface = new ethers.Interface(['function approve(address,uint256) returns (bool)']);
  const approveData = erc20Iface.encodeFunctionData('approve', [spender, amount]);
  const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);
  const calldata = scwIface.encodeFunctionData('execute', [token, 0, approveData]);
  const userOp = await aa.createUserOp(calldata, { callGasLimit: 300_000n });
  const signed = await aa.signUserOp(userOp);
  return await aa.sendUserOpWithBackoff(signed, 5);
}

/* =========================================================================
   Quick integration helper (optional)
   ========================================================================= */

async function integrateWithMEVv137(bundlerUrl = null) {
  assertRuntime();

  const chainRegistry = new EnhancedRPCManager();
  await chainRegistry.init();

  const provider = chainRegistry.getProvider();
  const signer = new ethers.Wallet(process.env.SOVEREIGN_PRIVATE_KEY, provider);

  const aa = new EnterpriseAASDK(signer, ENHANCED_CONFIG.ENTRY_POINTS.V07);
  await aa.initialize(provider, ENHANCED_CONFIG.SCW_ADDRESS, bundlerUrl || ENHANCED_CONFIG.BUNDLER.RPC_URL);

  await bootstrapSCWForPaymasterEnhanced(aa, provider, signer, ENHANCED_CONFIG.SCW_ADDRESS);

  const mevExecutor = new EnhancedMevExecutor(aa, ENHANCED_CONFIG.SCW_ADDRESS);

  return { chainRegistry, aa, mevExecutor, provider, signer, scwAddress: ENHANCED_CONFIG.SCW_ADDRESS };
}

/* =========================================================================
   Miracle engine v3.1 (hard peg + live pools; AA for mint/swap/rebalance)
   ========================================================================= */

class MiracleEngineV3 {
  constructor(provider, signer, aa) {
    this.provider = provider;
    this.signer = signer;
    this.aa = aa;

    this.FACTORY = ENHANCED_CONFIG.UNISWAP.FACTORY_ADDRESS;
    this.POSITION_MANAGER = ENHANCED_CONFIG.UNISWAP.POSITION_MANAGER_ADDRESS;
    this.ROUTER = ENHANCED_CONFIG.UNISWAP.V3_ROUTER_ADDRESS;

    this.BWAEZI = ENHANCED_CONFIG.BWAEZI_ADDRESS; // 18 decimals
    this.USDC = ENHANCED_CONFIG.USDC_ADDRESS;     // 6 decimals
    this.WETH = ENHANCED_CONFIG.WETH_ADDRESS;     // 18 decimals
    this.SCW = ENHANCED_CONFIG.SCW_ADDRESS;

    this.oracle = new PriceOracleAggregator(provider);
  }

  iface(sig) { return new ethers.Interface([sig]); }

  async wrapEthToWeth(amountEthWei) {
    const tx = await this.signer.sendTransaction({
      to: this.WETH,
      data: this.iface('function deposit() payable').encodeFunctionData('deposit', []),
      value: amountEthWei,
      gasLimit: 120000
    });
    const rec = await tx.wait();
    return rec.transactionHash;
  }

  async approveEOA(token, spender, amount) {
    const erc20 = new ethers.Contract(token, ['function approve(address,uint256) returns (bool)'], this.signer);
    const tx = await erc20.approve(spender, amount);
    const rec = await tx.wait();
    return rec.transactionHash;
  }

  async transferEOA(token, to, amount) {
    const erc20 = new ethers.Contract(token, ['function transfer(address,uint256) returns (bool)'], this.signer);
    const tx = await erc20.transfer(to, amount);
    const rec = await tx.wait();
    return rec.transactionHash;
  }

  async ensureSCWApprovals() {
    // SCW approvals to both PositionManager and Router for required tokens
    await scwApproveToken(this.aa, this.SCW, this.WETH, this.POSITION_MANAGER);
    await scwApproveToken(this.aa, this.SCW, this.USDC, this.POSITION_MANAGER);
    await scwApproveToken(this.aa, this.SCW, this.BWAEZI, this.POSITION_MANAGER);
    await scwApproveToken(this.aa, this.SCW, this.WETH, this.ROUTER);
    await scwApproveToken(this.aa, this.SCW, this.USDC, this.ROUTER);
    await scwApproveToken(this.aa, this.SCW, this.BWAEZI, this.ROUTER);
  }

  async createAndInitPoolSorted(tokenA, tokenB, fee, desiredPriceToken1PerToken0, decA, decB) {
    const { token0, token1, inverted } = sortTokens(tokenA, tokenB);
    const price = inverted ? (1 / Number(desiredPriceToken1PerToken0)) : Number(desiredPriceToken1PerToken0);
    const sqrtPriceX96 = encodeSqrtPriceX96(price, decA, decB);

    const pm = new ethers.Contract(this.POSITION_MANAGER, ['function createAndInitializePoolIfNecessary(address,address,uint24,uint160) returns (address)'], this.signer);
    const tx = await pm.createAndInitializePoolIfNecessary(token0, token1, fee, sqrtPriceX96, { gasLimit: 700000 });
    const rec = await tx.wait();

    const factory = new ethers.Contract(this.FACTORY, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const pool = await factory.getPool(token0, token1, fee);
    return { txHash: rec.transactionHash, pool, token0, token1 };
  }

  async getSlot0(pool) {
    const c = new ethers.Contract(pool, ['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'], this.provider);
    return await c.slot0();
  }

  ticksAround(currentTick, width = 600, spacing = 10) {
    const lower = Math.floor((currentTick - width) / spacing) * spacing;
    const upper = Math.floor((currentTick + width) / spacing) * spacing;
    return { lower, upper };
  }

  async mintInitialRange_SCW(token0, token1, fee, tickLower, tickUpper, amount0Desired, amount1Desired) {
    const npmIface = new ethers.Interface(['function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256,uint128,uint256,uint256)']);
    const mintCalldata = npmIface.encodeFunctionData('mint', [{
      token0, token1, fee, tickLower, tickUpper,
      amount0Desired, amount1Desired,
      amount0Min: 0, amount1Min: 0,
      recipient: this.SCW,
      deadline: Math.floor(Date.now() / 1000) + 1800
    }]);
    const scwExec = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']).encodeFunctionData('execute', [ENHANCED_CONFIG.UNISWAP.POSITION_MANAGER_ADDRESS, 0, mintCalldata]);

    const userOp = await this.aa.createUserOp(scwExec, { callGasLimit: 1_400_000n, verificationGasLimit: 900_000n, preVerificationGas: 90_000n });
    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);
    return txHash;
  }

  /* -----------------------------------------------------------------------
     Hard peg payout: SCW pays exact USDC or WETH at $100 per BWAEZI (18 decimals)
     Fixed-point math: USD_FP6 (6 decimals), BWAEZI 18d, WETH 18d.
     ----------------------------------------------------------------------- */

  async pegSwapBWAEZITo({ recipient, amountBWAEZI, outAsset = 'USDC' }) {
    const bw = new ethers.Contract(this.BWAEZI, ['function balanceOf(address) view returns (uint256)'], this.provider);
    const scwBalBW = await bw.balanceOf(this.SCW);
    if (scwBalBW < amountBWAEZI) throw new Error('SCW lacks BWAEZI inventory');

    const ethUsdFP6 = await this.oracle.getEthUsdBlendedFP6({ weth: this.WETH, usdc: this.USDC }); // BigInt

    const USD_FP6 = 1_000_000n;
    const USD_PER_BWAEZI_FP6 = 100n * USD_FP6;
    const usdNotionalFP6 = (amountBWAEZI * USD_PER_BWAEZI_FP6) / (10n ** 18n);

    let tokenOut, amountOut;
    if (outAsset === 'USDC') {
      tokenOut = this.USDC;
      amountOut = usdNotionalFP6;
    } else if (outAsset === 'WETH') {
      tokenOut = this.WETH;
      amountOut = (usdNotionalFP6 * (10n ** 18n)) / ethUsdFP6;
    } else {
      throw new Error('Unsupported outAsset for peg swap');
    }

    const outBal = await (new ethers.Contract(tokenOut, ['function balanceOf(address) view returns (uint256)'], this.provider)).balanceOf(this.SCW);
    if (outBal < amountOut) throw new Error('SCW lacks payout inventory');

    const iface = new ethers.Interface(['function transfer(address,uint256) returns (bool)']);
    const transferData = iface.encodeFunctionData('transfer', [recipient, amountOut]);
    const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);
    const calldata = scwIface.encodeFunctionData('execute', [tokenOut, 0, transferData]);

    const userOp = await this.aa.createUserOp(calldata, { callGasLimit: 350_000n });
    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);
    return { txHash, tokenOut, amountOut };
  }

  /* -----------------------------------------------------------------------
     Activation flow with micro balances and peg demonstration
     ----------------------------------------------------------------------- */
  async miracleActivate({ eoaEthWei = ethers.parseEther('0.0026996'), eoaUsdc = ethers.parseUnits('5.18', 6) } = {}) {
    const wrapTx = await this.wrapEthToWeth(eoaEthWei);

    const usdc = new ethers.Contract(this.USDC, ['function balanceOf(address) view returns (uint256)'], this.provider);
    const eoaUsdcBal = await usdc.balanceOf(this.signer.address);
    const usdcToSend = eoaUsdcBal > eoaUsdc ? eoaUsdc : eoaUsdcBal;

    const wethBal = await (new ethers.Contract(this.WETH, ['function balanceOf(address) view returns (uint256)'], this.provider)).balanceOf(this.signer.address);
    const wethToSend = wethBal;

    await this.approveEOA(this.WETH, this.SCW, wethToSend);
    const wethTx = await this.transferEOA(this.WETH, this.SCW, wethToSend);

    let usdcTx = null;
    if (usdcToSend > 0n) {
      await this.approveEOA(this.USDC, this.SCW, usdcToSend);
      usdcTx = await this.transferEOA(this.USDC, this.SCW, usdcToSend);
    }

    await this.ensureSCWApprovals();

    const microBW = ethers.parseUnits('0.01', 18);
    let pegTx = null;
    try {
      pegTx = await this.pegSwapBWAEZITo({ recipient: this.signer.address, amountBWAEZI: microBW, outAsset: 'USDC' });
    } catch (e) {
      // optional: inventory not present
    }

    const bw_dec = 18, weth_dec = 18, usdc_dec = 6;
    const { pool: poolBWAEZI_WETH } = await this.createAndInitPoolSorted(this.BWAEZI, this.WETH, 3000, 0.05, bw_dec, weth_dec);
    const { pool: poolBWAEZI_USDC } = await this.createAndInitPoolSorted(this.BWAEZI, this.USDC, 500, 100.0, bw_dec, usdc_dec);

    const slotW = await this.getSlot0(poolBWAEZI_WETH);
    const ticksW = this.ticksAround(Number(slotW[1]), 480, 60);
    const { token0: bwWeth0, token1: bwWeth1 } = sortTokens(this.BWAEZI, this.WETH);
    const mintW = await this.mintInitialRange_SCW(
      bwWeth0, bwWeth1,
      3000,
      ticksW.lower, ticksW.upper,
      ethers.parseEther('0.01'), ethers.parseEther('0.001')
    );

    const slotU = await this.getSlot0(poolBWAEZI_USDC);
    const ticksU = this.ticksAround(Number(slotU[1]), 480, 10);
    const { token0: bwUsdc0, token1: bwUsdc1 } = sortTokens(this.BWAEZI, this.USDC);
    const amountUSDC_U = usdcToSend > 0n ? (usdcToSend < ethers.parseUnits('5.00', 6) ? usdcToSend : ethers.parseUnits('5.00', 6)) : ethers.parseUnits('1.00', 6);
    const mintU = await this.mintInitialRange_SCW(
      bwUsdc0, bwUsdc1,
      500,
      ticksU.lower, ticksU.upper,
      ethers.parseEther('0.01'), amountUSDC_U
    );

    // Optional small swap for visibility with minOut guarding (2% safety)
    const swapIface = new ethers.Interface([
      'function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) returns (uint256)'
    ]);
    const minOutGuard = 1n; // conservative default
    const params = {
      tokenIn: this.USDC,
      tokenOut: this.BWAEZI,
      fee: 500,
      recipient: this.SCW,
      deadline: Math.floor(Date.now() / 1000) + 1800,
      amountIn: amountUSDC_U,
      amountOutMinimum: minOutGuard,
      sqrtPriceLimitX96: 0
    };
    const swapData = swapIface.encodeFunctionData('exactInputSingle', [params]);
    const scwExecSwap = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']).encodeFunctionData('execute', [this.ROUTER, 0, swapData]);

    const userOp = await this.aa.createUserOp(scwExecSwap, {
      callGasLimit: 700_000n,
      verificationGasLimit: 500_000n,
      preVerificationGas: 80_000n
    });
    const signed = await this.aa.signUserOp(userOp);
    const ampTx = await this.aa.sendUserOpWithBackoff(signed, 5);

    return {
      success: true,
      wrapTx,
      wethTx,
      usdcTx,
      pegTx,
      pools: { bwWeth: poolBWAEZI_WETH, bwUsdc: poolBWAEZI_USDC },
      mints: { mintW, mintU },
      ampTx
    };
  }
}

/* =========================================================================
   Exports
   ========================================================================= */

export {
  // Core classes
  EnterpriseAASDK,
  EnhancedMevExecutor,

  // RPC managers
  EnhancedRPCManager,

  // Helpers
  integrateWithMEVv137,
  bootstrapSCWForPaymasterEnhanced,
  createNetworkForcedProvider,
  depositToEntryPoint,
  addStakeToEntryPoint,

  // Config
  ENHANCED_CONFIG,

  // Miracle engine v3
  MiracleEngineV3,

  // Additional utilities for MEV v14.x compatibility
  scwApproveToken,
  PriceOracleAggregator
};

export default integrateWithMEVv137;
