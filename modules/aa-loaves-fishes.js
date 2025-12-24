// modules/aa-loaves-fishes.js — CLEANED AA INFRASTRUCTURE v15.13 (deployment-free, MEV v15-8 aligned)
// Focus: pure execution for an already-deployed SCW. No factory/initCode/salt logic.
// Preserves bundler + paymaster wiring, RPC management, and price oracle.
// Upgrades in v15.13:
// - Explicit paymaster override support: opts.paymasterAndData is honored end-to-end
// - EnterpriseAASDK.getPaymasterData(userOpLikeOrCalldata, gasHints) helper
// - Dynamic EntryPoint deposit sizing with margin and optional auto-stake
// - Slightly lowered initial gas caps; bundler lifts if needed
// - Tip floor and fee sanity retained
// - Telemetry-friendly return values (unchanged exports and capabilities)
// Correction:
// - Auto stake default lowered to 0.002 ETH (configurable via AUTO_PM_STAKE_WEI) to fit low-deposit environments

import { ethers } from 'ethers';
import fetch from 'node-fetch';

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
  VERSION: 'v15.13-LIVE-CLEAN',

  NETWORK: {
    name: process.env.NETWORK_NAME || 'mainnet',
    chainId: Number(process.env.NETWORK_CHAIN_ID || 1)
  },

  ENTRY_POINTS: {
    V07: addrStrict(process.env.ENTRY_POINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789')
  },

  UNISWAP: {
    FACTORY_ADDRESS: addrStrict(process.env.FACTORY_ADDRESS || '0x1F98431c8aD98523631AE4a59f267346ea31F984'),
    POSITION_MANAGER_ADDRESS: addrStrict('0xC36442b4a4522E871399CD717aBDD847Ab11FE88'),
    V3_ROUTER_ADDRESS: addrStrict('0xE592427A0AEce92De3Edee1F18E0157C05861564')
  },

  // SCW must be explicitly provided — no fallback, no auto-deploy
  SCW_ADDRESS: (() => {
    const v = process.env.SCW_ADDRESS;
    if (!v || !v.startsWith('0x') || v.length !== 42) {
      throw new Error('SCW_ADDRESS must be set to a valid 0x-prefixed address (deployment-free mode)');
    }
    return addrStrict(v);
  })(),

  BWAEZI_ADDRESS: addrStrict(process.env.BWAEZI_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'),
  USDC_ADDRESS: addrStrict(process.env.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
  WETH_ADDRESS: addrStrict(process.env.WETH_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),

  PAYMASTER: {
    MODE: (process.env.PAYMASTER_MODE || 'ONCHAIN').toUpperCase(), // NONE | API | ONCHAIN | PASSTHROUGH
    ADDRESS: addrStrict(process.env.PAYMASTER_ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47'),
    API_URL: process.env.PAYMASTER_API_URL || '',
    SIGNER_KEY: process.env.PAYMASTER_SIGNER_KEY || ''
  },

  BUNDLER: {
    RPC_URL:
      process.env.BUNDLER_RPC_URL
      || 'https://api.pimlico.io/v2/1/rpc?apikey=pim_4NdivPuNDvvKZ1e1aNPKrb',
    TIMEOUT_MS: Number(process.env.BUNDLER_TIMEOUT_MS || 180000),
    ROTATION: [] // optional; pickHealthyBundler exported for MEV compatibility
  },

  PUBLIC_RPC_ENDPOINTS: [
    'https://ethereum-rpc.publicnode.com',
    'https://rpc.ankr.com/eth',
    'https://eth.llamarpc.com'
  ],

  CONNECTION_SETTINGS: {
    timeout: Number(process.env.RPC_TIMEOUT_MS || 15000),
    maxRetries: Number(process.env.RPC_MAX_RETRIES || 3),
    healthCheckInterval: Number(process.env.RPC_HEALTH_INTERVAL_MS || 30000)
  },

  ORACLES: {
    CHAINLINK_ETH_USD: addrStrict(process.env.CHAINLINK_ETH_USD || '0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419'),
    MAX_DIVERGENCE_PCT: Number(process.env.ORACLE_MAX_DIVERGENCE || 0.15),
    STALE_SECONDS: Number(process.env.ORACLE_STALE_SECONDS || 7200)
  },

  // Owner EOA of the SCW (checksummed if provided, otherwise signer.address is used)
  EOA_OWNER: addrStrict(process.env.EOA_OWNER || ''),

  // CLEAN MODE: always deployment-free
  NEW_SCW_LOOP: true
};

/* =========================================================================
   pickHealthyBundler (kept for MEV v15-8 wiring)
   ========================================================================= */

async function pickHealthyBundler(rotation = ENHANCED_CONFIG.BUNDLER.ROTATION) {
  for (const url of rotation) {
    try {
      const network = ethers.Network.from({ chainId: ENHANCED_CONFIG.NETWORK.chainId, name: ENHANCED_CONFIG.NETWORK.name });
      const provider = new ethers.JsonRpcProvider(url, network, { staticNetwork: network });
      const eps = await provider.send('eth_supportedEntryPoints', []);
      if (Array.isArray(eps) && eps.length > 0) {
        console.log(`✅ Healthy bundler selected: ${url}`);
        return url;
      }
    } catch (e) {
      console.warn(`⚠️ Bundler unhealthy: ${url} (${e.message})`);
    }
  }
  throw new Error('No healthy bundler found in rotation');
}

/* =========================================================================
   EntryPoint helpers
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
   Forced-network provider (patched: static network)
   ========================================================================= */

function createNetworkForcedProvider(url, chainId = ENHANCED_CONFIG.NETWORK.chainId) {
  const request = new ethers.FetchRequest(url);
  request.timeout = ENHANCED_CONFIG.CONNECTION_SETTINGS.timeout;
  request.retry = ENHANCED_CONFIG.CONNECTION_SETTINGS.maxRetries;
  request.allowGzip = true;
  const network = ethers.Network.from({ name: ENHANCED_CONFIG.NETWORK.name, chainId });
  return new ethers.JsonRpcProvider(request, network, {
    staticNetwork: network,
    pollingInterval: ENHANCED_CONFIG.CONNECTION_SETTINGS.healthCheckInterval
  });
}

/* =========================================================================
   Enhanced RPC manager
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
      } catch { /* continue */ }
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
          const scoreLatency = Math.max(0, 100 * Math.exp(-p.latency / 300));
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
   Bundler client (patched: static network)
   ========================================================================= */

class BundlerClient {
  constructor(url) {
    if (!url) throw new Error('BundlerClient: runtime bundler URL required');
    const network = ethers.Network.from({
      chainId: ENHANCED_CONFIG.NETWORK.chainId,
      name: ENHANCED_CONFIG.NETWORK.name
    });
    this.provider = new ethers.JsonRpcProvider(url, network, {
      staticNetwork: network,
      pollingInterval: ENHANCED_CONFIG.BUNDLER.TIMEOUT_MS / 30
    });
    this.url = url;
  }
  async supportedEntryPoints() { return await this.provider.send('eth_supportedEntryPoints', []); }
  async healthCheck() {
    try {
      const eps = await this.supportedEntryPoints();
      const ok = Array.isArray(eps) && eps.some((addr) => ethers.getAddress(addr) === ethers.getAddress(ENHANCED_CONFIG.ENTRY_POINTS.V07));
      return { ok, supported: eps || [] };
    } catch (e) { return { ok: false, error: e.message }; }
  }
  async sendUserOperation(userOp, entryPoint) { return await this.provider.send('eth_sendUserOperation', [userOp, entryPoint]); }
  async getUserOperationReceipt(userOpHash) { return await this.provider.send('eth_getUserOperationReceipt', [userOpHash]); }
  async estimateUserOperationGas(userOp, entryPoint) { return await this.provider.send('eth_estimateUserOperationGas', [userOp, entryPoint]); }
}

/* =========================================================================
   Paymaster integrations
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
    const res = await fetch(this.apiUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`Paymaster API ${res.status}`);
    const data = await res.json();
    if (!data?.paymasterAndData || !ethers.isHexString(data.paymasterAndData)) throw new Error('Invalid paymasterAndData from API');
    return data.paymasterAndData;
  }
}

class OnChainVerifyingPaymaster {
  constructor(address, signer) { this.address = address; this.signer = signer; }
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
    return ethers.concat([ethers.getAddress(this.address), context]);
  }
}

class PassthroughPaymaster {
  constructor(address) { this.address = address; }
  async buildPaymasterAndData() { return ethers.concat([ethers.getAddress(this.address), '0x']); }
}

/* =========================================================================
   Enterprise AA SDK (deployment-free; pure execution)
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

    try {
      this.ownerAddress =
        ENHANCED_CONFIG.EOA_OWNER && ENHANCED_CONFIG.EOA_OWNER.startsWith('0x')
          ? ethers.getAddress(ENHANCED_CONFIG.EOA_OWNER)
          : signer.address;
    } catch {
      this.ownerAddress = signer.address;
    }
  }

  setSCWSender(address) {
    this.scwAddress = ethers.getAddress(address);
    return this.scwAddress;
  }

  async initialize(provider, scwAddress = null, bundlerUrl = null) {
    this.provider = provider;
    this.scwAddress = scwAddress ? ethers.getAddress(scwAddress) : ENHANCED_CONFIG.SCW_ADDRESS;

    const url = bundlerUrl || ENHANCED_CONFIG.BUNDLER.RPC_URL;
    this.bundler = new BundlerClient(url);
    const health = await this.bundler.healthCheck();
    if (!health.ok) throw new Error(`Bundler health check failed: ${health.error || 'unsupported entrypoint'}`);

    // Paymaster setup
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

    console.log(`Using SCW sender: ${this.scwAddress}`);
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
    if (this.paymasterMode === 'API') return await this.paymasterAPI.sponsor(userOp);
    if (this.paymasterMode === 'ONCHAIN') return await this.verifyingPaymaster.buildPaymasterAndData(userOp);
    if (this.paymasterMode === 'PASSTHROUGH') return await this.passthroughPaymaster.buildPaymasterAndData();
    return '0x';
  }

  // Explicit helper to construct paymasterAndData for external callers (e.g., genesis path)
  async getPaymasterData(userOpLikeOrCalldata, gasHints = {}) {
    const sender = ethers.getAddress(this.scwAddress || ENHANCED_CONFIG.SCW_ADDRESS);
    const nonce = await this.getNonce(sender);

    const toUserOpLike = (calldata) => ({
      sender,
      nonce,
      initCode: '0x',
      callData: calldata,
      // Reduced hints to keep prefund low when probing sponsorship
      callGasLimit: gasHints.callGasLimit ?? 250_000n,
      verificationGasLimit: gasHints.verificationGasLimit ?? 180_000n,
      preVerificationGas: gasHints.preVerificationGas ?? 45_000n,
      maxFeePerGas: gasHints.maxFeePerGas ?? ethers.parseUnits('15', 'gwei'),
      maxPriorityFeePerGas: gasHints.maxPriorityFeePerGas ?? ethers.parseUnits('1', 'gwei'),
      paymasterAndData: '0x',
      signature: '0x'
    });

    const fakeOp = typeof userOpLikeOrCalldata === 'string'
      ? toUserOpLike(userOpLikeOrCalldata)
      : userOpLikeOrCalldata;

    return await this._sponsor(fakeOp);
  }

  /**
   * Create user operation — deployment-free:
   * - No initCode usage; assumes SCW is already deployed.
   * - Pure execution userOps only.
   * - Honors explicit opts.paymasterAndData override if provided.
   */
  async createUserOp(callData, opts = {}) {
    if (!this.initialized) throw new Error('EnterpriseAASDK not initialized');

    const sender = ethers.getAddress(this.scwAddress || ENHANCED_CONFIG.SCW_ADDRESS);
    let nonce = await this.getNonce(sender);
    if (nonce == null) nonce = 0n;

    const fee = await this.provider.getFeeData();
    let maxFee = opts.maxFeePerGas || fee.maxFeePerGas || ethers.parseUnits('30', 'gwei');
    let maxTip = opts.maxPriorityFeePerGas || fee.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei');
    const TIP_FLOOR = 50_000_000n; // floor tip in wei (~0.05 gwei)
    if (BigInt(maxTip) < TIP_FLOOR) maxTip = TIP_FLOOR;
    if (maxFee < maxTip) maxFee = maxTip;

    const userOp = {
      sender,
      nonce,
      initCode: '0x', // always empty in deployment-free mode
      callData,
      // Lower initial caps; bundler estimation will lift if needed
      callGasLimit: opts.callGasLimit ?? 250_000n,
      verificationGasLimit: opts.verificationGasLimit ?? 180_000n,
      preVerificationGas: opts.preVerificationGas ?? 45_000n,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: maxTip,
      paymasterAndData: '0x',
      signature: '0x'
    };

    // Force paymaster sponsorship; never send "0x" unless mode NONE upstream adjusts
    if (opts.paymasterAndData && ethers.isHexString(opts.paymasterAndData)) {
      userOp.paymasterAndData = opts.paymasterAndData;
    } else {
      try {
        const pmData = await this._sponsor(userOp);
        if (pmData && ethers.isHexString(pmData)) {
          userOp.paymasterAndData = pmData;
        } else {
          throw new Error('Invalid paymasterAndData from sponsor');
        }
      } catch (err) {
        console.error('Paymaster sponsor failed:', err.message);
        throw err;
      }
    }

    try {
      const est = await this.bundler.estimateUserOperationGas(this._formatUserOpForBundler(userOp), this.entryPoint);
      const toBig = (v, d) => (typeof v === 'string' ? BigInt(v) : BigInt(v ?? d));
      userOp.callGasLimit = toBig(est.callGasLimit, userOp.callGasLimit);
      userOp.verificationGasLimit = toBig(est.verificationGasLimit, userOp.verificationGasLimit);
      userOp.preVerificationGas = toBig(est.preVerificationGas, userOp.preVerificationGas);
      userOp.callGasLimit = userOp.callGasLimit < 200_000n ? 200_000n : userOp.callGasLimit;
    } catch { /* proceed with defaults */ }

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
        return opHash;
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
   Enhanced MEV executor (deployment-free)
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
      callGasLimit: opts.gasLimit || 250_000n,
      verificationGasLimit: opts.verificationGasLimit || 180_000n,
      preVerificationGas: opts.preVerificationGas || 45_000n,
      maxFeePerGas: opts.maxFeePerGas ?? ethers.parseUnits('15', 'gwei'),
      maxPriorityFeePerGas: opts.maxPriorityFeePerGas ?? ethers.parseUnits('1', 'gwei'),
      // Honor explicit paymaster override
      paymasterAndData: opts.paymasterAndData
      // No initCode in deployment-free mode
    });
    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);
    return { txHash, timestamp: Date.now(), description: opts.description || 'enhanced_scw_execute' };
  }
}

/* =========================================================================
   Bootstrap helper (paymaster-only; no SCW deployment)
   ========================================================================= */

function _computeRequiredDeposit({ callGasLimit, verificationGasLimit, preVerificationGas, maxFeePerGas, marginPct = 25 }) {
  const totalGas = BigInt(callGasLimit) + BigInt(verificationGasLimit) + BigInt(preVerificationGas);
  const base = totalGas * BigInt(maxFeePerGas);
  return (base * BigInt(100 + marginPct)) / 100n;
}

async function bootstrapSCWForPaymasterEnhanced(aa, provider, signer, scwAddress) {
  const ep = getEntryPoint(provider);
  let deposit = 0n;
  try { deposit = await ep.getDeposit(ENHANCED_CONFIG.PAYMASTER.ADDRESS); } catch {}

  const AUTO_PM_DEPOSIT = process.env.AUTO_PM_DEPOSIT === 'true';
  const AUTO_PM_STAKE = process.env.AUTO_PM_STAKE === 'true';

  // Dynamic sizing: target envelope similar to heavy ops
  const fd = await provider.getFeeData();
  const maxFee = fd.maxFeePerGas || ethers.parseUnits('35', 'gwei');
  const required = _computeRequiredDeposit({
    callGasLimit: 850_000n,
    verificationGasLimit: 650_000n,
    preVerificationGas: 100_000n,
    maxFeePerGas: maxFee,
    marginPct: Number(process.env.AUTO_PM_MARGIN_PCT || 25)
  });

  if (AUTO_PM_DEPOSIT && deposit < required) {
    const delta = required - deposit;
    const prettyDep = ethers.formatEther(deposit);
    const prettyReq = ethers.formatEther(required);
    const prettyDelta = ethers.formatEther(delta);
    console.log(`[AA PM TOPUP] deposit=${prettyDep} required=${prettyReq} topping=${prettyDelta}`);
    const txh = await depositToEntryPoint(signer, delta);
    console.log(`[AA PM TOPUP] tx=${txh}`);
    // refresh
    try { deposit = await ep.getDeposit(ENHANCED_CONFIG.PAYMASTER.ADDRESS); } catch {}
  } else if (AUTO_PM_DEPOSIT && deposit < ethers.parseEther('0.001')) {
    // Legacy tiny top-up fallback
    const top = ethers.parseEther(process.env.AUTO_PM_DEPOSIT_WEI || '0.002');
    const txh = await depositToEntryPoint(signer, top);
    console.log(`[AA PM TOPUP] tiny top-up=${ethers.formatEther(top)} tx=${txh}`);
    try { deposit = await ep.getDeposit(ENHANCED_CONFIG.PAYMASTER.ADDRESS); } catch {}
  }

  // Correction: default stake lowered to 0.002 ETH, configurable via AUTO_PM_STAKE_WEI
  if (AUTO_PM_STAKE) {
    const delay = Number(process.env.AUTO_PM_UNSTAKE_DELAY || 86400);
    const amount = ethers.parseEther(process.env.AUTO_PM_STAKE_WEI || '0.002');
    try {
      const txh = await addStakeToEntryPoint(signer, delay, amount);
      console.log(`[AA PM STAKE] staked=${ethers.formatEther(amount)} tx=${txh}`);
    } catch (e) {
      console.warn(`[AA PM STAKE] stake failed: ${e.message}`);
    }
  }
  return { entryPoint: ENHANCED_CONFIG.ENTRY_POINTS.V07, paymasterDeposit: deposit };
}

/* =========================================================================
   Price Oracle aggregator (Chainlink + Uniswap blending with divergence check)
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
    if (Number(updatedAt) < now - ENHANCED_CONFIG.ORACLES.STALE_SECONDS) throw new Error('Chainlink ETH/USD stale');
    const USD_FP6 = 1_000_000n;
    const priceFP6 = (BigInt(answer) * USD_FP6) / (10n ** BigInt(decimals));
    return priceFP6;
  }

  async getUniswapEthUsdFP6(weth, usdc) {
    const factory = new ethers.Contract(ENHANCED_CONFIG.UNISWAP.FACTORY_ADDRESS, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const pool = await factory.getPool(usdc, weth, 500);
    if (pool === ethers.ZeroAddress) throw new Error('No ETH/USDC v3 0.05% pool');
    const slotIface = new ethers.Interface(['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)']);
    const c = new ethers.Contract(pool, slotIface.fragments, this.provider);
    const [sqrtPriceX96] = await c.slot0();

    const TWO192 = 2n ** 192n;
    const sqrt = BigInt(sqrtPriceX96);
    const invPrice = (TWO192) / (sqrt * sqrt);
    const adj = invPrice * (10n ** 12n);
    const USD_FP6 = 1_000_000n;
    const priceFP6 = (adj * USD_FP6) / (10n ** 12n);
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
    if (devMax > ENHANCED_CONFIG.ORACLES.MAX_DIVERGENCE_PCT) throw new Error('Oracle divergence too high');
    return avgFP6;
  }
}

/* =========================================================================
   Exports (exact names expected by MEV v15-8)
   ========================================================================= */

export {
  // Core classes
  EnterpriseAASDK,
  EnhancedMevExecutor,

  // RPC managers
  EnhancedRPCManager,

  // Helpers
  bootstrapSCWForPaymasterEnhanced,
  createNetworkForcedProvider,
  depositToEntryPoint,
  addStakeToEntryPoint,
  pickHealthyBundler,

  // Config
  ENHANCED_CONFIG,

  // Utilities
  PriceOracleAggregator
};

export default ENHANCED_CONFIG;
