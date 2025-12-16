// modules/aa-loaves-fishes.js — LIVE AA INFRASTRUCTURE v15.10 (AA14-safe, full capabilities)
// Maintains ALL v14.3/v15.7 features, and hardens AA behavior:
// - Always use SCW as sender.
// - InitCode only when deploying.
// - AA14 guard: initCode must construct exactly sender (predict & enforce).
// - Canonical factory + ABI sanity checks.
// - Configurable salt discovery window.
// - Optional token admin recovery hook (safe, non-invasive).

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
   Enhanced configuration
   ========================================================================= */

const ENHANCED_CONFIG = {
  VERSION: 'v15.10-LIVE',

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

  // Configured SCW (what you want to use). This may be aligned to predicted during init.
  SCW_ADDRESS: addrStrict(process.env.SCW_ADDRESS || '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C'),

  // Canonical ERC-4337 SimpleAccountFactory (mainnet infinitism)
  ACCOUNT_FACTORY: addrStrict(process.env.ACCOUNT_FACTORY || '0x9406Cc6185a346906296840746125a0E44976454'),

  // Owner EOA of the SCW (checksummed if provided, otherwise signer.address is used)
  EOA_OWNER: addrStrict(process.env.EOA_OWNER || ''),

  // Tokens
  BWAEZI_ADDRESS: addrStrict(process.env.BWAEZI_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'),
  USDC_ADDRESS: addrStrict(process.env.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
  WETH_ADDRESS: addrStrict(process.env.WETH_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),

  // Paymaster settings
  PAYMASTER: {
    MODE: (process.env.PAYMASTER_MODE || 'ONCHAIN').toUpperCase(), // NONE | API | ONCHAIN | PASSTHROUGH
    ADDRESS: addrStrict(process.env.PAYMASTER_ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47'),
    API_URL: process.env.PAYMASTER_API_URL || '',
    SIGNER_KEY: process.env.PAYMASTER_SIGNER_KEY || ''
  },

  // Bundler
  BUNDLER: {
    RPC_URL:
      process.env.BUNDLER_RPC_URL
      || 'https://api.pimlico.io/v2/1/rpc?apikey=pim_K4etjrjHvpTx4We2SuLLjt',
    TIMEOUT_MS: Number(process.env.BUNDLER_TIMEOUT_MS || 180000),
    ROTATION: [] // disable rotation for reliability
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

  // Salt discovery window
  MAX_SALT_TRIES: Number(process.env.MAX_SALT_TRIES || 1024),

  // Optional token admin recovery hook (if your token exposes such an owner-only function)
  // Example config:
  // RECOVERY: {
  //   ENABLED: true,
  //   TOKEN: '0xYourBWAEZI',
  //   CONTRACT: '0xAdminContractOrTokenItself',
  //   METHOD: 'rescueFrom(address,address,uint256)',
  //   FROM: '0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C',
  //   TO: '<will use SCW>',
  // }
  RECOVERY: {
    ENABLED: String(process.env.RECOVERY_ENABLED || 'false').toLowerCase() === 'true',
    TOKEN: addrStrict(process.env.RECOVERY_TOKEN || ''),
    CONTRACT: addrStrict(process.env.RECOVERY_CONTRACT || ''),
    METHOD: (process.env.RECOVERY_METHOD || '').trim(),
    FROM: addrStrict(process.env.RECOVERY_FROM || ''),
    // TO is set dynamically to the active SCW at runtime
  }
};

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
   Forced-network provider (static network)
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
   Bundler client
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
   SCW factory (minimal ABI) + salt discovery + initCode builder
   ========================================================================= */

const SCW_FACTORY_ABI = [
  'function createAccount(address owner, uint256 salt) returns (address)',
  'function getAddress(address owner, uint256 salt) view returns (address)'
];

async function findSaltForSCW(provider, factoryAddress, ownerAddress, targetScwAddress, MAX_SALT_TRIES = ENHANCED_CONFIG.MAX_SALT_TRIES) {
  const factory = new ethers.Contract(factoryAddress, SCW_FACTORY_ABI, provider);
  const target = ethers.getAddress(targetScwAddress);
  for (let i = 0; i < MAX_SALT_TRIES; i++) {
    const salt = BigInt(i);
    try {
      const predicted = await factory.getAddress(ownerAddress, salt);
      if (ethers.getAddress(predicted) === target) return salt;
    } catch { /* continue */ }
  }
  return null;
}

async function buildInitCodeForSCW(provider, factoryAddress, ownerAddress, targetScwAddress, saltOverride = null) {
  const factoryAddrNorm = ethers.getAddress(factoryAddress);
  const iface = new ethers.Interface(SCW_FACTORY_ABI);

  let salt = saltOverride;
  if (salt == null && targetScwAddress) {
    salt = await findSaltForSCW(provider, factoryAddrNorm, ownerAddress, targetScwAddress);
  }
  if (salt == null) salt = 0n;

  const data = iface.encodeFunctionData('createAccount', [ownerAddress, salt]);
  return { initCode: ethers.concat([factoryAddrNorm, data]), salt };
}

/* =========================================================================
   Enterprise AA SDK (AA14-safe)
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

    this.factoryAddress = ENHANCED_CONFIG.ACCOUNT_FACTORY || null;

    try {
      this.ownerAddress =
        ENHANCED_CONFIG.EOA_OWNER && ENHANCED_CONFIG.EOA_OWNER.startsWith('0x')
          ? ethers.getAddress(ENHANCED_CONFIG.EOA_OWNER)
          : signer.address;
    } catch {
      this.ownerAddress = signer.address;
    }
  }

  async initialize(provider, scwAddress = null, bundlerUrl = null) {
    this.provider = provider;
    this.scwAddress = scwAddress || ENHANCED_CONFIG.SCW_ADDRESS;

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

    // AA14-safe SCW alignment at init
    if (this.factoryAddress && this.ownerAddress && this.scwAddress) {
      try {
        const factory = new ethers.Contract(this.factoryAddress, SCW_FACTORY_ABI, this.provider);
        // salt=0 prediction
        const predictedRaw = await factory.getAddress(this.ownerAddress, 0n);
        const predicted = ethers.getAddress(predictedRaw);
        const factoryAddr = ethers.getAddress(this.factoryAddress);

        // Factory ABI/address sanity
        if (predicted.toLowerCase() === factoryAddr.toLowerCase()) {
          throw new Error('Factory.getAddress(owner,0) equals factory address — verify ACCOUNT_FACTORY and ABI');
        }

        // If configured SCW is not derivable, align to predicted
        if (ethers.getAddress(this.scwAddress) !== predicted) {
          console.warn(`SCW ${ethers.getAddress(this.scwAddress)} not derivable; aligning to predicted ${predicted}`);
          this.scwAddress = predicted;
        } else {
          console.log(`SCW address matched predicted: ${predicted}`);
        }
      } catch (e) {
        console.warn(`SCW alignment skipped: ${e.message}`);
      }
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
    if (this.paymasterMode === 'API') return await this.paymasterAPI.sponsor(userOp);
    if (this.paymasterMode === 'ONCHAIN') return await this.verifyingPaymaster.buildPaymasterAndData(userOp);
    if (this.paymasterMode === 'PASSTHROUGH') return await this.passthroughPaymaster.buildPaymasterAndData();
    return '0x';
  }

  /**
   * Create user operation — AA14 safe:
   * - If SCW undeployed, we ensure initCode constructs exactly 'sender'.
   * - Paths:
   *   a) salt found that produces configured SCW → keep sender=scw and include initCode with that salt.
   *   b) salt not found → compute predicted with salt=0; if valid (not factory), align sender=scwAddress=predicted and include initCode.
   *   c) prediction equals factory → throw descriptive error (bad factory/ABI) to avoid AA14.
   */
  async createUserOp(callData, opts = {}) {
    if (!this.initialized) throw new Error('EnterpriseAASDK not initialized');

    let sender = ethers.getAddress(this.scwAddress || ENHANCED_CONFIG.SCW_ADDRESS);

    let nonce = await this.getNonce(sender);
    if (nonce == null) nonce = 0n;

    const codeAtAddress = await this.provider.getCode(sender);
    const undeployed = (codeAtAddress === '0x');

    let initCode = '0x';

    if ((undeployed || opts.forceDeploy) && this.factoryAddress) {
      const factoryAddr = ethers.getAddress(this.factoryAddress);
      const factory = new ethers.Contract(factoryAddr, SCW_FACTORY_ABI, this.provider);

      // Try to find a salt that produces the configured SCW
      let salt = await findSaltForSCW(this.provider, factoryAddr, this.ownerAddress, sender, ENHANCED_CONFIG.MAX_SALT_TRIES);

      if (salt == null) {
        // Fallback: predict salt=0 and align sender to predicted if valid
        const predictedRaw = await factory.getAddress(this.ownerAddress, 0n);
        const predicted = ethers.getAddress(predictedRaw);
        if (predicted.toLowerCase() === factoryAddr.toLowerCase()) {
          throw new Error(`AA14 guard: factory.getAddress(owner,0) equals factory — check ACCOUNT_FACTORY address/ABI`);
        }
        if (predicted !== sender) {
          console.warn(`SCW AA14 alignment: configured SCW ${sender} not derivable. Aligning sender to predicted ${predicted}.`);
          sender = predicted;
          this.scwAddress = predicted;
        }
        salt = 0n;
      }

      // Build initCode with the decided salt; verify it constructs 'sender'
      const data = new ethers.Interface(SCW_FACTORY_ABI).encodeFunctionData('createAccount', [this.ownerAddress, salt]);
      initCode = ethers.concat([factoryAddr, data]);

      const checkPred = await factory.getAddress(this.ownerAddress, salt);
      const checkAddr = ethers.getAddress(checkPred);
      if (checkAddr !== sender) {
        throw new Error(`AA14 guard: initCode (salt=${salt}) would deploy ${checkAddr}, but sender is ${sender}. Aborting to prevent AA14.`);
      }
    }

    const fee = await this.provider.getFeeData();
    let maxFee = opts.maxFeePerGas || fee.maxFeePerGas || ethers.parseUnits('30', 'gwei');
    let maxTip = opts.maxPriorityFeePerGas || fee.maxPriorityFeePerGas || ethers.parseUnits('2', 'gwei');
    if (maxFee < maxTip) maxFee = maxTip;

    const userOp = {
      sender, // always SCW (aligned to initCode prediction when needed)
      nonce,
      initCode,
      callData,
      callGasLimit: opts.callGasLimit || 1_000_000n,
      verificationGasLimit: opts.verificationGasLimit || 700_000n,
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
      userOp.callGasLimit = userOp.callGasLimit < 400_000n ? 400_000n : userOp.callGasLimit;
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
        await new Promise(r => setTimeout(r, Math.min(30000, 1000 * Math.pow(2, attempt)) ));
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
   Enhanced MEV executor
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
      maxPriorityFeePerGas: opts.maxPriorityFeePerGas,
      forceDeploy: opts.forceDeploy === true // allow first-call deployment when SCW code is empty
    });
    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);
    return { txHash, timestamp: Date.now(), description: opts.description || 'enhanced_scw_execute' };
  }
}

/* =========================================================================
   Bootstrap helper
   ========================================================================= */

async function bootstrapSCWForPaymasterEnhanced(aa, provider, signer) {
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
  return { entryPoint: ENHANCED_CONFIG.ENTRY_POINTS.V07, paymasterDeposit: deposit };
}

/* =========================================================================
   SCW approvals helper
   ========================================================================= */

async function scwApproveToken(aa, scw, token, spender, amount = ethers.MaxUint256) {
  const erc20Iface = new ethers.Interface(['function approve(address,uint256) returns (bool)']);
  const approveData = erc20Iface.encodeFunctionData('approve', [spender, amount]);
  const scwIface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);
  const calldata = scwIface.encodeFunctionData('execute', [token, 0n, approveData]);
  const userOp = await aa.createUserOp(calldata, { callGasLimit: 300_000n });
  const signed = await aa.signUserOp(userOp);
  return await aa.sendUserOpWithBackoff(signed, 5);
}

/* =========================================================================
   Optional token admin recovery hook (safe)
   ========================================================================= */

async function tryAdminRecoveryIfConfigured(provider, signer, activeScw) {
  const cfg = ENHANCED_CONFIG.RECOVERY;
  if (!cfg.ENABLED) {
    console.log('Recovery disabled: RECOVERY_ENABLED=false');
    return { skipped: true, reason: 'disabled' };
  }
  if (!cfg.TOKEN || !cfg.CONTRACT || !cfg.METHOD || !cfg.FROM) {
    console.warn('Recovery misconfigured: TOKEN/CONTRACT/METHOD/FROM required.');
    return { skipped: true, reason: 'misconfigured' };
  }

  // NOTE: This assumes your token or admin contract exposes an owner-only method
  // that can move tokens from arbitrary addresses (e.g., rescueFrom).
  // Without such a method, recovery cannot be done programmatically.
  const method = cfg.METHOD.trim();
  const sig = `${method}`; // e.g. 'rescueFrom(address,address,uint256)'
  const iface = new ethers.Interface([`function ${sig}`]);

  // Query balances to compute amount if your method needs it (optional)
  const erc20Iface = new ethers.Interface([
    'function balanceOf(address) view returns (uint256)',
    'function decimals() view returns (uint8)'
  ]);
  const token = new ethers.Contract(cfg.TOKEN, erc20Iface.fragments, provider);
  let amount = 0n;
  try {
    amount = await token.balanceOf(cfg.FROM);
  } catch {
    console.warn('Could not read balance; proceeding with amount=0 (your rescue may compute internally).');
  }

  const to = activeScw;
  const calldata = iface.encodeFunctionData(method.split('(')[0], [cfg.FROM, to, amount]);

  const admin = new ethers.Contract(cfg.CONTRACT, iface.fragments, signer);
  console.log(`Attempting admin recovery via ${cfg.CONTRACT}.${method} FROM=${cfg.FROM} TO=${to} AMOUNT=${amount.toString()}`);
  const tx = await admin[method.split('(')[0]](cfg.FROM, to, amount);
  const rec = await tx.wait();
  console.log(`Admin recovery tx confirmed: ${rec.transactionHash}`);
  return { ok: true, txHash: rec.transactionHash };
}

/* =========================================================================
   Price Oracle aggregator
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
   Exports
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

  // Config
  ENHANCED_CONFIG,

  // Utilities
  scwApproveToken,
  PriceOracleAggregator,

  // SCW deploy helpers
  SCW_FACTORY_ABI,
  buildInitCodeForSCW,
  findSaltForSCW,

  // Optional recovery hook
  tryAdminRecoveryIfConfigured
};

export default ENHANCED_CONFIG;
