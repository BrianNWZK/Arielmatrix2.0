// modules/aa-loaves-fishes.js — CLEANED AA INFRASTRUCTURE v15.14 (deployment-free, MEV v15-8 aligned)
// Focus: pure execution for an already-deployed SCW. No factory/initCode/salt logic.
// Preserves bundler + paymaster wiring, RPC management, and price oracle.
// Upgrades in v15.14:
// - Explicit paymaster override support: opts.paymasterAndData is honored end-to-end
// - EnterpriseAASDK.getPaymasterData(userOpLikeOrCalldata, gasHints) helper
// - Dynamic EntryPoint deposit sizing with margin and optional auto-stake
// - Slightly lowered initial gas caps; bundler lifts if needed
// - Tip floor and fee sanity retained
// - Telemetry-friendly return values (unchanged exports and capabilities)
// Corrections for SCW update:
// - Mode-aware EntryPoint deposit target (SCW in NONE mode; paymaster otherwise)
// - Added depositToEntryPointFor(target) helper
// - EnhancedMevExecutor honors allowNoPaymaster (deposit-funded SCW path)
// - Compatible with SponsorGuard routing via core.mev.sendUserOp
//
// 🔥 NEW: Integrated adaptive genesis solutions & resilience
// - GenesisGasOptimizer: env overrides + external fee oracle (Etherscan or custom URL) → fees = current +10%
// - DepositBalancer: automatic fund rebalancing + retry; fallback to paymaster after 3 failed top-ups
// - Pre-simulation of mint calldata before userOp to catch upfront issues
// - Precise logging: required vs actual EntryPoint prefund
// - WEB_CONCURRENCY default = 1 (soft hint; no operational impact)
//
// Confirmed mainnet runtime: Pimlico bundlers executing via EntryPoint v0.6.0.
// This build aligns AA to EP v0.6 for health checks, deposits, and userOp submission.

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
  VERSION: 'v15.14-LIVE-CLEAN-ADAPTIVE',

  NETWORK: {
    name: process.env.NETWORK_NAME || 'mainnet',
    chainId: Number(process.env.NETWORK_CHAIN_ID || 1)
  },

  // CORRECTED: ENTRY_POINTS must be a property of ENHANCED_CONFIG (not "const" inside the object)
  ENTRY_POINTS: {
    // Current mainnet standard (v0.6.0) — used by Pimlico and your txs
    V06: addrStrict(process.env.ENTRY_POINT_V06 || process.env.ENTRY_POINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),

    // Newer v0.7.0 (deployed, used on some chains/L2s, optional for future features)
    V07: addrStrict(process.env.ENTRY_POINT_V07 || '0x0000000071727De22E5E9d8BAf0edAc6f37da032'),

    // Default to v0.6 (safe/compatible with your SCW and bundlers)
    DEFAULT: addrStrict(process.env.ENTRY_POINT_ADDRESS || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789')
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

  BWAEZI_ADDRESS: addrStrict(process.env.BWAEZI_ADDRESS || '0x54D1c2889B08caD0932266eaDE15EC884FA0CdC2'),
  USDC_ADDRESS: addrStrict(process.env.USDC_ADDRESS || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
  WETH_ADDRESS: addrStrict(process.env.WETH_ADDRESS || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),

  PAYMASTER: {
    MODE: (process.env.PAYMASTER_MODE || 'ONCHAIN').toUpperCase(), // NONE | API | ONCHAIN | PASSTHROUGH
    ADDRESS: addrStrict(process.env.PAYMASTER_ADDRESS || '0x76e81CB971BDd0d8D51995CA458A1eAfb6B29FB9'),
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

  // 🔥 NEW: Genesis-specific settings + fee optimizer overrides
  GENESIS: {
    MIN_SCW_DEPOSIT: ethers.parseEther(process.env.MIN_SCW_DEPOSIT || '0.0015'),
    MIN_PM_DEPOSIT: ethers.parseEther(process.env.MIN_PM_DEPOSIT || '0.002'),
    GAS_BUFFER_PCT: Number(process.env.GENESIS_GAS_BUFFER || 25),
    AUTO_REBALANCE: process.env.AUTO_REBALANCE === 'true',
    // Fee optimizer environment overrides
    MAX_FEE_GWEI: Number(process.env.GENESIS_MAX_FEE_GWEI || 0),             // 0 means no explicit cap
    MAX_TIP_GWEI: Number(process.env.GENESIS_MAX_TIP_GWEI || 0),
    // External gas oracle options (optional)
    GAS_ORACLE_URL: process.env.GAS_ORACLE_URL || '',                        // custom endpoint that returns { maxFeePerGasWei, maxPriorityFeePerGasWei }
    ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY || '',                  // when present, uses Etherscan gas oracle
    USE_PIMLICO_FEE: process.env.USE_PIMLICO_FEE === 'true'                  // when true, query Pimlico RPC feeData and add +10%
  },

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

// v0.6 ABI-compatible functions used by Pimlico mainnet bundlers
const ENTRYPOINT_ABI = [
  'function depositTo(address account) payable',
  'function addStake(uint32 unstakeDelaySec) payable',
  'function getDeposit(address account) view returns (uint256)',
  'function getNonce(address sender, uint192 key) view returns (uint256)'
];

function getEntryPoint(provider) {
  // Mainnet alignment: use EntryPoint v0.6
  return new ethers.Contract(ENHANCED_CONFIG.ENTRY_POINTS.V06, ENTRYPOINT_ABI, provider);
}

// NEW: deposit to a specific account (SCW or paymaster), not always PM
async function depositToEntryPointFor(signer, targetAddress, amountWei) {
  const ep = new ethers.Contract(ENHANCED_CONFIG.ENTRY_POINTS.V06, ENTRYPOINT_ABI, signer);
  const tx = await ep.depositTo(ethers.getAddress(targetAddress), { value: amountWei });
  const rec = await tx.wait();
  return rec.transactionHash;
}

// Legacy (kept for compatibility; targets PM)
async function depositToEntryPoint(signer, amountWei) {
  const ep = new ethers.Contract(ENHANCED_CONFIG.ENTRY_POINTS.V06, ENTRYPOINT_ABI, signer);
  const tx = await ep.depositTo(ENHANCED_CONFIG.PAYMASTER.ADDRESS, { value: amountWei });
  const rec = await tx.wait();
  return rec.transactionHash;
}

async function addStakeToEntryPoint(signer, delaySec, amountWei) {
  const ep = new ethers.Contract(ENHANCED_CONFIG.ENTRY_POINTS.V06, ENTRYPOINT_ABI, signer);
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
      const ok = Array.isArray(eps) && eps.some((addr) => ethers.getAddress(addr) === ethers.getAddress(ENHANCED_CONFIG.ENTRY_POINTS.V06));
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
      entryPoint: ENHANCED_CONFIG.ENTRY_POINTS.V06,
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
      [ethers.keccak256(packed), ENHANCED_CONFIG.ENTRY_POINTS.V06, ENHANCED_CONFIG.NETWORK.chainId]
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
   🔥 NEW: External fee oracle integration
   ========================================================================= */

async function fetchExternalFees(provider) {
  // Try prioritization order: Custom URL -> Etherscan -> Pimlico provider feeData -> fallback provider feeData
  const add10pct = (wei) => (wei * 110n) / 100n;

  try {
    const url = ENHANCED_CONFIG.GENESIS.GAS_ORACLE_URL;
    if (url) {
      const res = await fetch(url, { headers: { 'accept': 'application/json' } });
      if (res.ok) {
        const j = await res.json();
        const mf = BigInt(j.maxFeePerGasWei || j.maxFeePerGas || 0);
        const mp = BigInt(j.maxPriorityFeePerGasWei || j.maxPriorityFeePerGas || 0);
        if (mf > 0n && mp > 0n) {
          return {
            maxFeePerGas: add10pct(mf),
            maxPriorityFeePerGas: add10pct(mp)
          };
        }
      }
    }
  } catch {}

  try {
    const apiKey = ENHANCED_CONFIG.GENESIS.ETHERSCAN_API_KEY;
    if (apiKey) {
      const res = await fetch(`https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${apiKey}`);
      if (res.ok) {
        const j = await res.json();
        const safe = Number(j?.result?.SafeGasPrice || 0);
        const propose = Number(j?.result?.ProposeGasPrice || 0);
        const priority = Number(j?.result?.FastGasPrice || 0);
        const baseGwei = Math.max(safe, propose);
        const tipGwei = Math.max(1, priority);
        const mf = add10pct(ethers.parseUnits(String(baseGwei), 'gwei'));
        const mp = add10pct(ethers.parseUnits(String(tipGwei), 'gwei'));
        return { maxFeePerGas: mf, maxPriorityFeePerGas: mp };
      }
    }
  } catch {}

  try {
    if (ENHANCED_CONFIG.GENESIS.USE_PIMLICO_FEE) {
      const fd = await provider.getFeeData();
      const mf = add10pct(fd?.maxFeePerGas || ethers.parseUnits('15', 'gwei'));
      const mp = add10pct(fd?.maxPriorityFeePerGas || ethers.parseUnits('1', 'gwei'));
      return { maxFeePerGas: mf, maxPriorityFeePerGas: mp };
    }
  } catch {}

  try {
    const fd = await provider.getFeeData();
    const mf = add10pct(fd?.maxFeePerGas || ethers.parseUnits('15', 'gwei'));
    const mp = add10pct(fd?.maxPriorityFeePerGas || ethers.parseUnits('1', 'gwei'));
    return { maxFeePerGas: mf, maxPriorityFeePerGas: mp };
  } catch {
    const mf = add10pct(ethers.parseUnits('15', 'gwei'));
    const mp = add10pct(ethers.parseUnits('1.5', 'gwei'));
    return { maxFeePerGas: mf, maxPriorityFeePerGas: mp };
  }
}

/* =========================================================================
   🔥 NEW: Genesis Gas Optimizer (Live Data Adaptation + env overrides)
   — UPDATED with bundler-aware minimum gas probing and profiles
   ========================================================================= */

class GenesisGasOptimizer {
  constructor(provider, bundler = null) {
    this.provider = provider;
    this.bundler = bundler; // optional; when present, enables bundler-aware minima
    this.lastBaseFee = ethers.parseUnits('15', 'gwei');
  }

  async getBundlerMinimumGas() {
    // Probe bundler for minimal preVerification/verification gas requirements
    if (!this.bundler) {
      // Conservative defaults when no bundler is available at construction time
      return {
        minPreVerificationGas: 45000n,
        minVerificationGas: 100000n
      };
    }
    try {
      const dummyOp = {
        sender: '0x0000000000000000000000000000000000000000',
        nonce: '0x0',
        initCode: '0x',
        callData: '0x',
        callGasLimit: '0x1',
        verificationGasLimit: '0x1',
        preVerificationGas: '0x1',
        maxFeePerGas: '0x1',
        maxPriorityFeePerGas: '0x1',
        paymasterAndData: '0x',
        signature: '0x'
      };
      const est = await this.bundler.estimateUserOperationGas(dummyOp, ENHANCED_CONFIG.ENTRY_POINTS.V06);
      return {
        minPreVerificationGas: BigInt(est.preVerificationGas || 45000),
        minVerificationGas: BigInt(est.verificationGasLimit || 100000)
      };
    } catch {
      return {
        minPreVerificationGas: 45000n,
        minVerificationGas: 100000n
      };
    }
  }

  async getGenesisCaps(operationType = 'pool_creation') {
    // External fees with +10% buffer, then env caps
    let fees = await fetchExternalFees(this.provider);

    // Env caps
    const capMaxFee = ENHANCED_CONFIG.GENESIS.MAX_FEE_GWEI > 0
      ? ethers.parseUnits(String(ENHANCED_CONFIG.GENESIS.MAX_FEE_GWEI), 'gwei')
      : null;
    const capMaxTip = ENHANCED_CONFIG.GENESIS.MAX_TIP_GWEI > 0
      ? ethers.parseUnits(String(ENHANCED_CONFIG.GENESIS.MAX_TIP_GWEI), 'gwei')
      : null;

    if (capMaxFee && fees.maxFeePerGas > capMaxFee) fees.maxFeePerGas = capMaxFee;
    if (capMaxTip && fees.maxPriorityFeePerGas > capMaxTip) fees.maxPriorityFeePerGas = capMaxTip;
    if (fees.maxFeePerGas < fees.maxPriorityFeePerGas) fees.maxFeePerGas = fees.maxPriorityFeePerGas;

    // Bundler minimum requirements
    const bundlerMins = await this.getBundlerMinimumGas();

    // Operation-specific, bundler-aware profiles
    const profiles = {
      'pool_creation': {
        callGasLimit: 300_000n,
        verificationGasLimit: Math.max(250_000n, bundlerMins.minVerificationGas * 2n),
        preVerificationGas: Math.max(60_000n, (bundlerMins.minPreVerificationGas * 130n) / 100n),
        bufferPercent: ENHANCED_CONFIG.GENESIS.GAS_BUFFER_PCT || 35
      },
      'mint_liquidity': {
        callGasLimit: 220_000n,
        verificationGasLimit: Math.max(180_000n, (bundlerMins.minVerificationGas * 150n) / 100n),
        preVerificationGas: Math.max(50_000n, (bundlerMins.minPreVerificationGas * 120n) / 100n),
        bufferPercent: 25
      },
      'microseed_swap': {
        callGasLimit: 150_000n,
        verificationGasLimit: Math.max(120_000n, bundlerMins.minVerificationGas),
        preVerificationGas: Math.max(45_000n, bundlerMins.minPreVerificationGas),
        bufferPercent: 20
      },
      'default': {
        callGasLimit: 250_000n,
        verificationGasLimit: Math.max(180_000n, bundlerMins.minVerificationGas),
        preVerificationGas: Math.max(50_000n, bundlerMins.minPreVerificationGas),
        bufferPercent: 25
      }
    };

    const profile = profiles[operationType] || profiles.default;
    const bufferMultiplier = (100n + BigInt(profile.bufferPercent)) / 100n;

    const callGasLimit = profile.callGasLimit * bufferMultiplier;
    const verificationGasLimit = profile.verificationGasLimit * bufferMultiplier;
    const preVerificationGas = profile.preVerificationGas * bufferMultiplier;

    return {
      callGasLimit: callGasLimit < 200_000n ? 200_000n : callGasLimit,
      verificationGasLimit,
      preVerificationGas,
      maxFeePerGas: fees.maxFeePerGas,
      maxPriorityFeePerGas: fees.maxPriorityFeePerGas
    };
  }

  async adjustForBundler(userOp, bundler) {
    try {
      const est = await bundler.estimateUserOperationGas(userOp, ENHANCED_CONFIG.ENTRY_POINTS.V06);
      const toBig = (v, d) => (typeof v === 'string' ? BigInt(v) : BigInt(v ?? d));

      const estCall = toBig(est.callGasLimit, userOp.callGasLimit);
      const estVeri = toBig(est.verificationGasLimit, userOp.verificationGasLimit);
      const estPrev = toBig(est.preVerificationGas, userOp.preVerificationGas);

      const buffer = (100n + BigInt(ENHANCED_CONFIG.GENESIS.GAS_BUFFER_PCT)) / 100n;
      return {
        callGasLimit: (estCall * buffer) > 200_000n ? estCall * buffer : 200_000n,
        verificationGasLimit: estVeri * buffer,
        preVerificationGas: estPrev * buffer,
        maxFeePerGas: userOp.maxFeePerGas,
        maxPriorityFeePerGas: userOp.maxPriorityFeePerGas
      };
    } catch (e) {
      console.warn(`Bundler estimation failed: ${e.message}, using original caps`);
      return userOp;
    }
  }
}

/* =========================================================================
   🔥 NEW: Deposit Balancer (Automatic Fund Rebalancing + fallback)
   ========================================================================= */

class DepositBalancer {
  constructor(signer, scwAddress, paymasterAddress) {
    this.signer = signer;
    this.scwAddress = scwAddress;
    this.paymasterAddress = paymasterAddress;
    this.ep = getEntryPoint(signer.provider);
    this._topupFailures = 0;
  }

  async rebalanceForGenesis() {
    const balances = {
      eoa: await this.signer.provider.getBalance(this.signer.address),
      scwDeposit: await this.ep.getDeposit(this.scwAddress),
      pmDeposit: await this.ep.getDeposit(this.paymasterAddress)
    };

    console.log('💰 Current Balances:', {
      eoa: ethers.formatEther(balances.eoa),
      scwDeposit: ethers.formatEther(balances.scwDeposit),
      pmDeposit: ethers.formatEther(balances.pmDeposit)
    });

    const mode = (ENHANCED_CONFIG.PAYMASTER.MODE || 'NONE').toUpperCase();

    // Prefer SCW deposit in NONE mode
    if (mode === 'NONE') {
      if (balances.scwDeposit < ENHANCED_CONFIG.GENESIS.MIN_SCW_DEPOSIT &&
          balances.eoa > ethers.parseEther('0.002')) {
        const needed = ENHANCED_CONFIG.GENESIS.MIN_SCW_DEPOSIT - balances.scwDeposit;
        const transferAmount = needed > (balances.eoa * 70n / 100n) ? (balances.eoa * 70n / 100n) : needed;

        console.log(`🔄 Transferring ${ethers.formatEther(transferAmount)} ETH to SCW deposit (required=${ethers.formatEther(needed)}, actual=${ethers.formatEther(balances.scwDeposit)})`);

        try {
          const tx = await this.ep.depositTo(this.scwAddress, {
            value: transferAmount,
            gasLimit: 100000
          });
          const rec = await tx.wait();
          this._topupFailures = 0;
          return { rebalanced: true, txHash: rec.transactionHash, target: 'SCW', fallbackToPaymaster: false };
        } catch (e) {
          this._topupFailures++;
          console.warn(`SCW top-up failed [${this._topupFailures}]: ${e.message}`);
          if (this._topupFailures >= 3) {
            // Signal caller to fallback to paymaster mode submission
            return { rebalanced: false, reason: 'scw_topup_failed', fallbackToPaymaster: true };
          }
        }
      }
      return { rebalanced: false, reason: 'balances_optimal', fallbackToPaymaster: false };
    }

    // Paymaster mode: ensure both have minimum
    const needs = [];
    if (balances.scwDeposit < ethers.parseEther('0.0005')) {
      needs.push({ target: this.scwAddress, amount: ethers.parseEther('0.0005') - balances.scwDeposit });
    }
    if (balances.pmDeposit < ENHANCED_CONFIG.GENESIS.MIN_PM_DEPOSIT) {
      needs.push({ target: this.paymasterAddress, amount: ENHANCED_CONFIG.GENESIS.MIN_PM_DEPOSIT - balances.pmDeposit });
    }

    if (needs.length > 0 && balances.eoa > ethers.parseEther('0.003')) {
      const totalNeeded = needs.reduce((sum, n) => sum + n.amount, 0n);
      const available = balances.eoa * 70n / 100n;

      try {
        for (const need of needs) {
          const proportion = (need.amount * available) / totalNeeded;
          if (proportion > 0) {
            console.log(`🔄 Transferring ${ethers.formatEther(proportion)} ETH to ${need.target} (required=${ethers.formatEther(need.amount)})`);
            const tx = await this.ep.depositTo(need.target, {
              value: proportion,
              gasLimit: 100000
            });
            await tx.wait();
          }
        }
        this._topupFailures = 0;
        return { rebalanced: true, txHash: 'multiple', target: 'both', fallbackToPaymaster: false };
      } catch (e) {
        this._topupFailures++;
        console.warn(`PM/SCW top-up failed [${this._topupFailures}]: ${e.message}`);
        if (this._topupFailures >= 3) {
          return { rebalanced: false, reason: 'pm_topup_failed', fallbackToPaymaster: true };
        }
      }
    }

    return { rebalanced: false, reason: 'balances_optimal', fallbackToPaymaster: false };
  }
}

/* =========================================================================
   Enterprise AA SDK (deployment-free; pure execution)
   ========================================================================= */

class EnterpriseAASDK {
  constructor(signer, entryPoint = ENHANCED_CONFIG.ENTRY_POINTS.V06) {
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

    // 🔥 NEW: Genesis optimizer
    this.genesisOptimizer = null;

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

    // 🔥 NEW: Initialize genesis optimizer (bundler-aware)
    this.genesisOptimizer = new GenesisGasOptimizer(this.provider, this.bundler);

    if (process.env.WEB_CONCURRENCY == null) {
      // Soft hint log; does not change process env
      console.log('WEB_CONCURRENCY defaulting to 1');
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
    // NONE mode: explicitly no sponsorship
    if (this.paymasterMode === 'NONE') return '0x';
    if (this.paymasterMode === 'API') return await this.paymasterAPI.sponsor(userOp);
    if (this.paymasterMode === 'ONCHAIN') return await this.verifyingPaymaster.buildPaymasterAndData(userOp);
    if (this.paymasterMode === 'PASSTHROUGH') return await this.passthroughPaymaster.buildPaymasterAndData();
    return '0x';
  }

  // Explicit helper to construct paymasterAndData for external callers (e.g., genesis path)
  async getPaymasterData(userOpLikeOrCalldata, gasHints = {}) {
    const sender = ethers.getAddress(this.scwAddress || ENHANCED_CONFIG.SCW_ADDRESS);
    const nonce = await this.getNonce(sender);

    // External fee oracle
    const extFees = await fetchExternalFees(this.provider);
    let hintMaxFee = extFees.maxFeePerGas;
    let hintMaxTip = extFees.maxPriorityFeePerGas;

    const toUserOpLike = (calldata) => ({
      sender,
      nonce,
      initCode: '0x',
      callData: calldata,
      // Reduced hints to keep prefund low when probing sponsorship
      callGasLimit: gasHints.callGasLimit ?? 250_000n,
      verificationGasLimit: gasHints.verificationGasLimit ?? 180_000n,
      preVerificationGas: gasHints.preVerificationGas ?? 50_000n,
      maxFeePerGas: gasHints.maxFeePerGas ?? hintMaxFee,
      maxPriorityFeePerGas: gasHints.maxPriorityFeePerGas ?? hintMaxTip,
      paymasterAndData: '0x',
      signature: '0x'
    });

    const fakeOp = typeof userOpLikeOrCalldata === 'string'
      ? toUserOpLike(userOpLikeOrCalldata)
      : userOpLikeOrCalldata;

    // NONE mode: return zero data immediately
    if (this.paymasterMode === 'NONE') return '0x';
    return await this._sponsor(fakeOp);
  }

  /**
   * Create user operation — deployment-free:
   * - No initCode usage; assumes SCW is already deployed.
   * - Pure execution userOps only.
   * - Honors explicit opts.paymasterAndData override if provided.
   * - Allows deposit-funded NONE mode without sponsorship.
   */
  async createUserOp(callData, opts = {}) {
    if (!this.initialized) throw new Error('EnterpriseAASDK not initialized');

    const sender = ethers.getAddress(this.scwAddress || ENHANCED_CONFIG.SCW_ADDRESS);
    let nonce = await this.getNonce(sender);
    if (nonce == null) nonce = 0n;

    // External fee oracle with +10% buffer, then env caps
    const extFees = await fetchExternalFees(this.provider);
    let maxFee = opts.maxFeePerGas || extFees.maxFeePerGas;
    let maxTip = opts.maxPriorityFeePerGas || extFees.maxPriorityFeePerGas;

    const TIP_FLOOR = 50_000_000n; // ~0.05 gwei
    if (BigInt(maxTip) < TIP_FLOOR) maxTip = TIP_FLOOR;
    if (maxFee < maxTip) maxFee = maxTip;

    const userOp = {
      sender,
      nonce,
      initCode: '0x',
      callData,
      // UPDATED: Slightly higher preVerificationGas to avoid underestimation issues
      callGasLimit: opts.callGasLimit ?? 250_000n,
      verificationGasLimit: opts.verificationGasLimit ?? 180_000n,
      preVerificationGas: opts.preVerificationGas ?? 55_000n,
      maxFeePerGas: maxFee,
      maxPriorityFeePerGas: maxTip,
      paymasterAndData: '0x',
      signature: '0x'
    };

    // Paymaster strategy:
    // 1) If explicit override provided, honor it.
    // 2) If NONE mode or allowNoPaymaster, keep '0x' (deposit-funded).
    // 3) Else try sponsorship; if sponsor fails, gracefully fall back to '0x'.
    const allowNoPM = (opts.allowNoPaymaster === true) || (this.paymasterMode === 'NONE');

    if (opts.paymasterAndData && ethers.isHexString(opts.paymasterAndData)) {
      userOp.paymasterAndData = opts.paymasterAndData;
    } else if (allowNoPM) {
      userOp.paymasterAndData = '0x';
    } else {
      try {
        const pmData = await this._sponsor(userOp);
        if (pmData && ethers.isHexString(pmData)) {
          userOp.paymasterAndData = pmData;
        } else {
          userOp.paymasterAndData = '0x';
        }
      } catch {
        userOp.paymasterAndData = '0x';
      }
    }

    // Dummy signature to let bundler estimate prevGas correctly (size-aware)
    userOp.signature = '0x01';

    try {
      const est = await this.bundler.estimateUserOperationGas(this._formatUserOpForBundler(userOp), this.entryPoint);
      const toBig = (v, d) => (typeof v === 'string' ? BigInt(v) : BigInt(v ?? d));

      const estCall = toBig(est.callGasLimit, userOp.callGasLimit);
      const estVeri = toBig(est.verificationGasLimit, userOp.verificationGasLimit);
      const estPrev = toBig(est.preVerificationGas, userOp.preVerificationGas);

      // Fully adaptive: apply proportional buffers (+GENESIS_GAS_BUFFER%) to estimates
      const buffer = (100n + BigInt(ENHANCED_CONFIG.GENESIS.GAS_BUFFER_PCT)) / 100n;
      userOp.callGasLimit = estCall * buffer;
      userOp.verificationGasLimit = estVeri * buffer;
      userOp.preVerificationGas = estPrev * buffer;

      // Minimal safety floor for call gas
      if (userOp.callGasLimit < 200_000n) userOp.callGasLimit = 200_000n;
    } catch {
      // proceed with provided defaults if estimate fails
    }

    // Clear dummy signature; caller will sign via signUserOp()
    userOp.signature = '0x';

    return userOp;
  }

  // 🔥 NEW: Genesis-optimized user op creation
  async createGenesisUserOp(callData, operationType = 'pool_creation', opts = {}) {
    if (!this.initialized) throw new Error('EnterpriseAASDK not initialized');
    if (!this.genesisOptimizer) throw new Error('Genesis optimizer not initialized');

    const genesisCaps = await this.genesisOptimizer.getGenesisCaps(operationType);

    // Merge genesis caps with any explicit overrides
    const mergedOpts = {
      callGasLimit: opts.callGasLimit || genesisCaps.callGasLimit,
      verificationGasLimit: opts.verificationGasLimit || genesisCaps.verificationGasLimit,
      preVerificationGas: opts.preVerificationGas || genesisCaps.preVerificationGas,
      maxFeePerGas: opts.maxFeePerGas || genesisCaps.maxFeePerGas,
      maxPriorityFeePerGas: opts.maxPriorityFeePerGas || genesisCaps.maxPriorityFeePerGas,
      ...opts
    };

    return await this.createUserOp(callData, mergedOpts);
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
      paymasterAddress: ENHANCED_CONFIG.PAYMASTER.ADDRESS,
      genesisOptimizer: !!this.genesisOptimizer
    };
  }
}

/* =========================================================================
   Enhanced MEV executor (deployment-free) with Genesis Optimization & pre-sim
   ========================================================================= */

class EnhancedMevExecutor {
  constructor(aa, scwAddress) {
    this.aa = aa;
    this.scw = scwAddress;
    this.depositBalancer = new DepositBalancer(
      aa.signer,
      scwAddress,
      ENHANCED_CONFIG.PAYMASTER.ADDRESS
    );
  }

  buildSCWExecute(target, calldata, value = 0n) {
    const iface = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);
    return iface.encodeFunctionData('execute', [target, value, calldata]);
  }

  // Try a light simulation: eth_call of target with provided calldata, from SCW
  async preSimulate(target, calldata) {
    try {
      const rc = await this.aa.provider.call({
        to: ethers.getAddress(target),
        data: calldata,
        from: this.scw
      });
      return { ok: true, result: rc };
    } catch (e) {
      return { ok: false, error: String(e?.message || e) };
    }
  }

  async sendCall(calldata, opts = {}) {
    const desc = String(opts.description || '').toLowerCase();
    const isGenesis =
      desc.includes('force_genesis') ||
      desc.includes('init_pool_scw') ||
      desc.includes('init_pool_scw_retry') ||
      desc.includes('init_pool_bwz_weth_scw') ||
      desc.includes('init_pool_bwz_weth_retry') ||
      desc.includes('bootstrap_multihop_usdc_weth_bwzc');

    // Auto-rebalance before genesis if enabled; fallback to paymaster if topups fail 3 times
    if (isGenesis && ENHANCED_CONFIG.GENESIS.AUTO_REBALANCE) {
      try {
        const rebalance = await this.depositBalancer.rebalanceForGenesis();
        if (rebalance.rebalanced) {
          console.log(`✅ Auto-rebalanced: ${rebalance.txHash}`);
          await new Promise(r => setTimeout(r, 1500));
        } else if (rebalance.fallbackToPaymaster) {
          console.warn('Top-ups failed repeatedly — will allow paymaster sponsorship if provided.');
          opts.allowNoPaymaster = false;
        }
      } catch (e) {
        console.warn(`Auto-rebalance failed: ${e.message}`);
      }
    }

    // Pre-simulate mints to catch upfront encoding/state issues
    const looksMint = desc.includes('mint');
    if (looksMint && opts.target && opts.rawCalldata) {
      const sim = await this.preSimulate(opts.target, opts.rawCalldata);
      if (!sim.ok) {
        console.warn(`Mint pre-simulation failed: ${sim.error}`);
        // slight uplift might help verification phase
        opts.verificationGasLimit = (opts.verificationGasLimit || 180_000n) + 40_000n;
        opts.preVerificationGas = (opts.preVerificationGas || 55_000n) + 10_000n;
      }
    }

    // Default caps — AA SDK will lift via optimizer/bundler
    let callGasLimit = opts.callGasLimit || 250_000n;
    let verificationGasLimit = opts.verificationGasLimit || 180_000n;
    let preVerificationGas = opts.preVerificationGas || 55_000n;

    // Genesis optimizer caps
    if (isGenesis && this.aa.genesisOptimizer) {
      try {
        const operationType = desc.includes('pool') ? 'pool_creation' :
                            desc.includes('mint') ? 'mint_liquidity' :
                            desc.includes('swap') ? 'microseed_swap' : 'default';

        const genesisCaps = await this.aa.genesisOptimizer.getGenesisCaps(operationType);

        callGasLimit = genesisCaps.callGasLimit;
        verificationGasLimit = genesisCaps.verificationGasLimit;
        preVerificationGas = genesisCaps.preVerificationGas;

        opts.maxFeePerGas = genesisCaps.maxFeePerGas;
        opts.maxPriorityFeePerGas = genesisCaps.maxPriorityFeePerGas;

        console.log(`🎯 Genesis caps ${operationType}:`, {
          callGas: Number(callGasLimit),
          verificationGas: Number(verificationGasLimit),
          preVerificationGas: Number(preVerificationGas),
          maxFee: ethers.formatUnits(genesisCaps.maxFeePerGas, 'gwei') + ' gwei',
          maxTip: ethers.formatUnits(genesisCaps.maxPriorityFeePerGas, 'gwei') + ' gwei'
        });
      } catch (e) {
        console.warn(`Genesis optimizer failed: ${e.message}, using defaults`);
      }
    }

    const userOp = await this.aa.createUserOp(calldata, {
      callGasLimit,
      verificationGasLimit,
      preVerificationGas,
      maxFeePerGas: opts.maxFeePerGas,
      maxPriorityFeePerGas: opts.maxPriorityFeePerGas,
      // Honor explicit paymaster override and allow deposit-funded NONE mode
      paymasterAndData: opts.paymasterAndData,
      allowNoPaymaster: opts.allowNoPaymaster === true
    });

    // Bundler adjustment for genesis ops
    if (isGenesis && this.aa.genesisOptimizer) {
      try {
        const adjusted = await this.aa.genesisOptimizer.adjustForBundler(
          this.aa._formatUserOpForBundler(userOp),
          this.aa.bundler
        );
        userOp.callGasLimit = adjusted.callGasLimit;
        userOp.verificationGasLimit = adjusted.verificationGasLimit;
        userOp.preVerificationGas = adjusted.preVerificationGas;
        console.log(`📊 Bundler-adjusted genesis caps:`, {
          callGas: Number(userOp.callGasLimit),
          verificationGas: Number(userOp.verificationGasLimit),
          preVerificationGas: Number(userOp.preVerificationGas)
        });
      } catch (e) {
        console.warn(`Bundler adjustment failed: ${e.message}`);
      }
    }

    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);
    return { txHash, timestamp: Date.now(), description: opts.description || 'enhanced_scw_execute' };
  }

  async sendGenesisCall(calldata, operationType = 'pool_creation', opts = {}) {
    if (!this.aa.genesisOptimizer) {
      throw new Error('Genesis optimizer not available');
    }

    const rebalance = await this.depositBalancer.rebalanceForGenesis();
    if (rebalance.rebalanced) {
      console.log(`✅ Pre-genesis rebalance: ${rebalance.txHash}`);
      await new Promise(r => setTimeout(r, 1500));
    } else if (rebalance.fallbackToPaymaster) {
      opts.allowNoPaymaster = false;
    }

    const genesisCaps = await this.aa.genesisOptimizer.getGenesisCaps(operationType);

    const userOp = await this.aa.createGenesisUserOp(calldata, operationType, {
      ...genesisCaps,
      ...opts
    });

    const adjusted = await this.aa.genesisOptimizer.adjustForBundler(
      this.aa._formatUserOpForBundler(userOp),
      this.aa.bundler
    );

    userOp.callGasLimit = adjusted.callGasLimit;
    userOp.verificationGasLimit = adjusted.verificationGasLimit;
    userOp.preVerificationGas = adjusted.preVerificationGas;

    console.log(`🚀 Genesis execution with fully adaptive caps:`, {
      operationType,
      callGas: Number(userOp.callGasLimit),
      verificationGas: Number(userOp.verificationGasLimit),
      preVerificationGas: Number(userOp.preVerificationGas),
      maxFee: ethers.formatUnits(userOp.maxFeePerGas, 'gwei') + ' gwei',
      maxTip: ethers.formatUnits(userOp.maxPriorityFeePerGas, 'gwei') + ' gwei'
    });

    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);
    return {
      txHash,
      timestamp: Date.now(),
      description: `genesis_${operationType}`,
      optimized: true
    };
  }
}

/* =========================================================================
   Bootstrap helper (mode-aware deposit target; SCW in NONE mode, PM otherwise)
   UPDATED: Unified deposit-first strategy with SCW priority in NONE mode
   ========================================================================= */

function _computeRequiredDeposit({ callGasLimit, verificationGasLimit, preVerificationGas, maxFeePerGas, marginPct = 25 }) {
  const totalGas = BigInt(callGasLimit) + BigInt(verificationGasLimit) + BigInt(preVerificationGas);
  const base = totalGas * BigInt(maxFeePerGas);
  return (base * BigInt(100 + marginPct)) / 100n;
}

async function bootstrapSCWForPaymasterEnhanced(aa, provider, signer, scwAddress) {
  const ep = getEntryPoint(provider);
  const mode = (ENHANCED_CONFIG.PAYMASTER.MODE || 'NONE').toUpperCase();

  const scwDeposit = await ep.getDeposit(scwAddress);

  if (mode === 'NONE') {
    console.log(`🎯 NONE mode detected - prioritizing SCW deposit`);
    // Compute a typical required envelope for a mid-weight genesis op
    const fd = await fetchExternalFees(provider);
    const required = _computeRequiredDeposit({
      callGasLimit: 320_000n,
      verificationGasLimit: 220_000n,
      preVerificationGas: 60_000n,
      maxFeePerGas: fd.maxFeePerGas,
      marginPct: Number(process.env.AUTO_PM_MARGIN_PCT || ENHANCED_CONFIG.GENESIS.GAS_BUFFER_PCT || 25)
    });

    console.log(`[AA PREFUND] required=${ethers.formatEther(required)} ETH vs scwDeposit=${ethers.formatEther(scwDeposit)} ETH`);

    if (scwDeposit < ENHANCED_CONFIG.GENESIS.MIN_SCW_DEPOSIT) {
      const topup = ENHANCED_CONFIG.GENESIS.MIN_SCW_DEPOSIT - scwDeposit;
      const eoaBalance = await provider.getBalance(signer.address);

      console.log(`⚠️  SCW deposit low: ${ethers.formatEther(scwDeposit)} ETH`);
      console.log(`💰 EOA balance: ${ethers.formatEther(eoaBalance)} ETH`);
      console.log(`📈 Needed for SCW: ${ethers.formatEther(topup)} ETH`);

      let attempts = 0;
      while (attempts < 3) {
        try {
          const tx = await ep.depositTo(scwAddress, {
            value: topup,
            gasLimit: 100000
          });
          const rec = await tx.wait();
          console.log(`✅ SCW deposit topped up to ${ethers.formatEther(ENHANCED_CONFIG.GENESIS.MIN_SCW_DEPOSIT)} ETH`);
          console.log(`📝 Transaction: ${rec.transactionHash}`);
          const newDeposit = await ep.getDeposit(scwAddress);
          return {
            entryPoint: ENHANCED_CONFIG.ENTRY_POINTS.V06,
            depositTarget: scwAddress,
            scwDeposit: newDeposit,
            mode: 'NONE',
            action: 'scw_topped_up'
          };
        } catch (e) {
          attempts++;
          console.warn(`SCW deposit attempt ${attempts} failed: ${e.message}`);
          await new Promise(r => setTimeout(r, 1000 * attempts));
        }
      }

      // After 3 failures, indicate fallback to paymaster for later calls
      console.warn('SCW deposit top-up failed 3 times — fallback to paymaster for subsequent userOps.');
      return {
        entryPoint: ENHANCED_CONFIG.ENTRY_POINTS.V06,
        depositTarget: scwAddress,
        scwDeposit,
        mode: 'NONE',
        action: 'fallback_to_paymaster'
      };
    }

    console.log(`✅ SCW deposit sufficient: ${ethers.formatEther(scwDeposit)} ETH`);
    return {
      entryPoint: ENHANCED_CONFIG.ENTRY_POINTS.V06,
      depositTarget: scwAddress,
      scwDeposit,
      mode: 'NONE',
      action: 'no_action_needed'
    };
  }

  // Paymaster mode logic
  const depositTarget = ENHANCED_CONFIG.PAYMASTER.ADDRESS;
  let deposit = 0n;
  try { deposit = await ep.getDeposit(depositTarget); } catch {}

  const AUTO_PM_DEPOSIT = process.env.AUTO_PM_DEPOSIT === 'true';
  const AUTO_PM_STAKE = process.env.AUTO_PM_STAKE === 'true';

  const fd = await fetchExternalFees(provider);
  const required = _computeRequiredDeposit({
    callGasLimit: 850_000n,
    verificationGasLimit: 650_000n,
    preVerificationGas: 100_000n,
    maxFeePerGas: fd.maxFeePerGas,
    marginPct: Number(process.env.AUTO_PM_MARGIN_PCT || 25)
  });

  console.log(`[AA PREFUND] required=${ethers.formatEther(required)} ETH vs paymasterDeposit=${ethers.formatEther(deposit)} ETH`);

  if (AUTO_PM_DEPOSIT && deposit < required) {
    const delta = required - deposit;
    console.log(`[AA TOPUP] target=${depositTarget} deposit=${ethers.formatEther(deposit)} required=${ethers.formatEther(required)} topping=${ethers.formatEther(delta)}`);
    try {
      const txh = await depositToEntryPointFor(signer, depositTarget, delta);
      console.log(`[AA TOPUP] tx=${txh}`);
      try { deposit = await ep.getDeposit(depositTarget); } catch {}
    } catch (e) {
      console.warn(`[AA TOPUP] depositToEntryPointFor failed: ${e.message}`);
    }
  } else if (AUTO_PM_DEPOSIT && deposit < ethers.parseEther('0.001')) {
    const top = ethers.parseEther(process.env.AUTO_PM_DEPOSIT_WEI || '0.002');
    const txh = await depositToEntryPointFor(signer, depositTarget, top);
    console.log(`[AA TOPUP] tiny top-up=${ethers.formatEther(top)} tx=${txh}`);
    try { deposit = await ep.getDeposit(depositTarget); } catch {}
  }

  if (AUTO_PM_STAKE && mode !== 'NONE') {
    const delay = Number(process.env.AUTO_PM_UNSTAKE_DELAY || 86400);
    const amount = ethers.parseEther(process.env.AUTO_PM_STAKE_WEI || '0.002');
    try {
      const txh = await addStakeToEntryPoint(signer, delay, amount);
      console.log(`[AA STAKE] staked=${ethers.formatEther(amount)} tx=${txh}`);
    } catch (e) {
      console.warn(`[AA STAKE] stake failed: ${e.message}`);
    }
  }

  return {
    entryPoint: ENHANCED_CONFIG.ENTRY_POINTS.V06,
    depositTarget,
    paymasterDeposit: deposit,
    scwDeposit,
    mode
  };
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
   Exports (exact names expected by MEV v15-8) + NEW adaptive modules
   ========================================================================= */

export {
  // Core classes
  EnterpriseAASDK,
  EnhancedMevExecutor,

  // RPC managers
  EnhancedRPCManager,

  // 🔥 NEW: Adaptive genesis modules
  GenesisGasOptimizer,
  DepositBalancer,

  // Helpers
  bootstrapSCWForPaymasterEnhanced,
  createNetworkForcedProvider,
  depositToEntryPoint,
  depositToEntryPointFor,
  addStakeToEntryPoint,
  pickHealthyBundler,

  // Config
  ENHANCED_CONFIG,

  // Utilities
  PriceOracleAggregator
};

export default ENHANCED_CONFIG;
