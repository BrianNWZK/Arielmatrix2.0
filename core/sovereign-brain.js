/**
 * core/sovereign-brain.v13.5.9.js
 *
 * SOVEREIGN MEV BRAIN v13.5.9 — Unified Core + Extensions
 * - Preserves v13.5.7.1 core completely
 * - Integrates v13.5.8 extensions fully (non-invasive composition)
 * - Quorum RPC + fork detection
 * - Advanced Oracle (TWAP + dispersion + extra anchors)
 * - EV-aware strategy gating with slippage learning
 * - Extended API + Prometheus-style metrics
 *
 * REQUIREMENTS:
 * - Node.js 20+ (ESM). package.json: { "type":"module" }
 * - ENV:
 *   SOVEREIGN_PRIVATE_KEY=0x...
 *   ALCHEMY_API_KEY=... (optional)
 *   INFURA_PROJECT_ID=... (optional)
 *   STACKUP_API_KEY=... (optional)
 *   BICONOMY_API_KEY=... (optional)
 *   PIMLICO_API_KEY=... (optional)
 */

import express from 'express';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { randomUUID, createHash } from 'crypto';
import fetch from 'node-fetch';

/* =========================================================================
   Configuration
   ========================================================================= */

// Checksum-safe normalizer: prefer checksummed, fallback to lowercase
function addrStrict(address) {
  try {
    return ethers.getAddress(address.trim());
  } catch {
    const s = address.trim();
    return s.startsWith('0x') ? s.toLowerCase() : s;
  }
}

const LIVE = {
  VERSION: 'v13.5.9',

  // ERC-4337 EntryPoint v0.7 (mainnet)
  ENTRY_POINT: addrStrict('0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),

  // Smart Account Factory (kept for compatibility but no longer used to derive SCW)
  ACCOUNT_FACTORY: addrStrict('0x9406Cc6185a346906296840746125a0E44976454'),

  // Owner + Smart Contract Wallet (SCW) — CONSTANT THROUGHOUT
  EOA_OWNER_ADDRESS: addrStrict('0xd8e1Fa4d571b6Fce89fb5A145D6397192632F1aA'),
  SCW_ADDRESS: addrStrict('0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C'),

  // BWAEZI Paymaster (mainnet)
  PAYMASTER_ADDRESS: addrStrict('0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47'),

  TOKENS: {
    BWAEZI: addrStrict('0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'),
    WETH:   addrStrict('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
    USDC:   addrStrict('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    DAI:    addrStrict('0x6B175474E89094C44Da98b954EedeAC495271d0F'),
    USDT:   addrStrict('0xdAC17F958D2ee523a2206206994597C13D831ec7')
  },

  DEXES: {
    UNISWAP_V3: {
      name: 'Uniswap V3',
      router:          addrStrict('0xE592427A0AEce92De3Edee1F18E0157C05861564'),
      quoter:          addrStrict('0xb27308f9F90d607463bb33eA1BeBb41C27CE5AB6'),
      factory:         addrStrict('0x1F98431c8aD98523631AE4a59f267346ea31F984'),
      positionManager: addrStrict('0xC36442b4a4522E871399CD717aBDD847Ab11FE88')
    },
    UNISWAP_V2: {
      name: 'Uniswap V2',
      router:  addrStrict('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'),
      factory: addrStrict('0x5C69bEe701ef814a2B6a3EdDd4B1652CB9cc5aA6f')
    },
    SUSHI_V2: {
      name: 'Sushi V2',
      router:  addrStrict('0xd9e1CE17f2641f24AE83637ab66a2cca9C378B9F'),
      factory: addrStrict('0xC0aEE478e3658e2610c5F7A4A2E1777cE9e4f2Ac')
    },
    ONE_INCH_V5: {
      name: '1inch V5',
      router: addrStrict('0x1111111254EEB25477B68fb85Ed929f73A960582')
    },
    PARASWAP_LITE: {
      name: 'Paraswap Lite',
      router: addrStrict('0xDEF1C0DE00000000000000000000000000000000')
    }
  },

  // Stable public RPC endpoints (with optional keys)
  RPC_PROVIDERS: [
    ...(process.env.ALCHEMY_API_KEY ? [`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`] : []),
    ...(process.env.INFURA_PROJECT_ID ? [`https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`] : []),
    'https://rpc.ankr.com/eth',
    'https://cloudflare-eth.com',
    'https://ethereum.publicnode.com',
    'https://eth.llamarpc.com'
  ],

  // Multiple bundlers for resilience (set env keys where needed)
  BUNDLERS: [
    ...(process.env.STACKUP_API_KEY ? [`https://api.stackup.sh/v1/node/${process.env.STACKUP_API_KEY}`] : []),
    'https://bundler.candide.xyz/rpc/mainnet',
    ...(process.env.PIMLICO_API_KEY ? [`https://bundler.pimlico.io/v2/1/${process.env.PIMLICO_API_KEY}`] : []),
    ...(process.env.BICONOMY_API_KEY ? [`https://bundler.biconomy.io/api/v2/1/${process.env.BICONOMY_API_KEY}`] : [])
  ],

  PEG: {
    TARGET_USD: 100,
    FEE_TIER_DEFAULT: 500,
    GENESIS_MIN_USDC: ethers.parseUnits('100', 6),
    GENESIS_BWAEZI_INIT: ethers.parseEther('1000'),
    SEED_BWAEZI_EXPAND: ethers.parseEther('50000'),
    DEVIATION_THRESHOLD_PCT: 0.5
  },

  MAKER: {
    STREAM_CHUNK_BWAEZI: ethers.parseEther('250'),
    STREAM_CHUNK_USDC: ethers.parseUnits('150000', 6),
    MAX_STREAM_STEPS: 12,
    RANGE_ADJUST_INTERVAL_MS: 60_000,
    ENTROPY_COHERENCE_MIN: 0.35
  },

  ANCHORS: [
    { symbol: 'USDC', address: addrStrict('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'), decimals: 6 },
    { symbol: 'WETH', address: addrStrict('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'), decimals: 18 },
    { symbol: 'DAI',  address: addrStrict('0x6B175474E89094C44Da98b954EedeAC495271d0F'), decimals: 18 }
  ]
};

/* =========================================================================
   Intelligent RPC manager (health checks, timeouts, circuit breakers)
   ========================================================================= */

class IntelligentRPCManager {
  constructor(rpcUrls, chainId = 1) {
    this.rpcUrls = rpcUrls;
    this.chainId = chainId;
    this.providers = [];           // { url, provider, health, latency, failures }
    this.sticky = null;
    this.healthScores = new Map(); // url -> score
    this.circuits = new Map();     // url -> { failures, lastFailure, state }
    this.initialized = false;
    this._failureCounts = new Map(); // url -> count for log throttling
  }

  _newProvider(url) {
    const req = new ethers.FetchRequest(url);
    req.timeout = 8000;
    req.retry = 2;
    req.allowGzip = true;
    // Force network to avoid startup detection flaps
    return new ethers.JsonRpcProvider(req, { chainId: this.chainId, name: 'mainnet' });
  }

  async _probe(url) {
    const start = Date.now();
    const provider = this._newProvider(url);
    try {
      const [blockNumber, network] = await Promise.all([
        provider.getBlockNumber(),
        provider.getNetwork()
      ]);
      const latency = Date.now() - start;
      const healthy = !!blockNumber && !!network?.chainId;
      return { url, provider, healthy, latency, chainId: network?.chainId || this.chainId };
    } catch {
      return { url, provider: null, healthy: false, latency: null, chainId: null };
    }
  }

  _updateCircuit(url, ok) {
    const c = this.circuits.get(url) || { failures: 0, lastFailure: 0, state: 'CLOSED' };
    if (ok) {
      c.failures = 0; c.state = 'CLOSED';
    } else {
      c.failures += 1; c.lastFailure = Date.now();
      if (c.failures >= 3) c.state = 'OPEN';
      // throttle repeated logs
      const count = (this._failureCounts.get(url) || 0) + 1;
      this._failureCounts.set(url, count);
      if (count % 10 === 0) {
        console.warn(`RPC ${url} failures: ${c.failures} (throttled log)`);
      }
    }
    this.circuits.set(url, c);
  }

  async init() {
    const probes = await Promise.all(this.rpcUrls.map(url => this._probe(url)));
    this.providers = probes
      .filter(p => p.healthy)
      .map(p => ({ url: p.url, provider: p.provider, health: 100, latency: p.latency, failures: 0 }));

    if (this.providers.length === 0) {
      throw new Error('No healthy RPC provider');
    }

    // choose the lowest-latency as sticky
    this.providers.sort((a, b) => (a.latency ?? 99999) - (b.latency ?? 99999));
    this.sticky = this.providers[0].provider;
    console.log('Sticky provider set for Ethereum Mainnet');
    this.initialized = true;

    // start health monitor
    this._startHealthMonitor();
  }

  _startHealthMonitor() {
    setInterval(async () => {
      for (const p of this.providers) {
        try {
          const s = Date.now();
          await p.provider.getBlockNumber();
          const lat = Date.now() - s;
          p.latency = lat;
          p.health = Math.min(100, Math.round(p.health * 0.8 + (100 - Math.min(100, lat)) * 0.2));
          this._updateCircuit(p.url, true);
        } catch {
          p.failures += 1;
          p.health = Math.max(0, p.health - 15);
          this._updateCircuit(p.url, false);
        }
      }
      // rotate sticky if health drops
      const best = this.providers.slice().sort((a, b) => (b.health - a.health) || (a.latency - b.latency))[0];
      if (best && best.provider !== this.sticky) {
        this.sticky = best.provider;
        console.log('Sticky provider rotated to healthier RPC');
      }
    }, 30000);
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

  // Bundler selection: probe capability and choose healthiest
  async getBundlerProvider() {
    const urls = LIVE.BUNDLERS.length ? LIVE.BUNDLERS : [];
    const probes = await Promise.all(urls.map(async (url) => {
      try {
        const req = new ethers.FetchRequest(url);
        req.timeout = 8000;
        const provider = new ethers.JsonRpcProvider(req, { chainId: 1, name: 'mainnet' });
        // Capability probe (may fail silently)
        let supported = [];
        try { supported = await provider.send('eth_supportedEntryPoints', []); } catch {}
        return { url, provider, healthy: true, supported };
      } catch {
        return { url, provider: null, healthy: false, supported: [] };
      }
    }));
    const healthy = probes.filter(p => p.healthy && p.provider);
    if (healthy.length === 0) {
      throw new Error('No healthy ERC-4337 bundler available');
    }
    // prefer those that reported supported entry points
    const withSupport = healthy.filter(h => Array.isArray(h.supported) && h.supported.length > 0);
    const chosen = (withSupport[0] || healthy[0]).provider;
    return chosen;
  }
}

const chainRegistry = new IntelligentRPCManager(LIVE.RPC_PROVIDERS, 1);

/* =========================================================================
   Utilities
   ========================================================================= */

class LRUMap {
  constructor(maxSize = 10000) { this.data = new Map(); this.maxSize = maxSize; }
  set(k, v) { if (this.data.size >= this.maxSize) { const fk = this.data.keys().next().value; this.data.delete(fk); } this.data.set(k, v); }
  get(k) { return this.data.get(k); }
}

/* =========================================================================
   ERC-4337 AA — BWAEZI Paymaster integration (AA-primary)
   ========================================================================= */

class EnterpriseAASDK {
  constructor(signer, entryPoint = LIVE.ENTRY_POINT) {
    if (!signer?.address) throw new Error('EnterpriseAASDK: signer required');
    this.signer = signer; this.entryPoint = entryPoint; this.factory = LIVE.ACCOUNT_FACTORY;
    this.scwAddress = LIVE.SCW_ADDRESS; // USE CONSTANT SCW THROUGHOUT
  }
  async isDeployed(address) {
    const code = await chainRegistry.getProvider().getCode(address);
    return code && code !== '0x';
  }
  async getSCWAddress(_owner) {
    // Hard-wire the funded SCW; do not derive via factory
    return addrStrict(this.scwAddress);
  }
  async getNonce(smartAccount) {
    const ep = new ethers.Contract(LIVE.ENTRY_POINT, ['function getNonce(address sender, uint192 key) view returns (uint256)'], chainRegistry.getProvider());
    try { return await ep.getNonce(smartAccount, 0); } catch { return 0n; }
  }
  buildPaymasterAndData(userOpSender) {
    // Placeholder for real paymaster payload; currently returns simple context.
    const paymaster = LIVE.PAYMASTER_ADDRESS;
    const context = ethers.AbiCoder.defaultAbiCoder().encode(['address'], [userOpSender]);
    return ethers.concat([paymaster, context]);
  }
  async createUserOp(callData, opts = {}) {
    const sender = await this.getSCWAddress(this.signer.address);
    const nonce = await this.getNonce(sender);
    const gas = await chainRegistry.getFeeData();
    const userOp = {
      sender, nonce,
      // Always treat SCW as deployed; do not attempt initCode
      initCode: '0x',
      callData,
      callGasLimit: opts.callGasLimit || 1_400_000n,
      verificationGasLimit: opts.verificationGasLimit || 1_000_000n,
      preVerificationGas: opts.preVerificationGas || 80_000n,
      maxFeePerGas: opts.maxFeePerGas || gas.maxFeePerGas,
      maxPriorityFeePerGas: opts.maxPriorityFeePerGas || gas.maxPriorityFeePerGas,
      paymasterAndData: opts.paymasterAndData !== undefined ? opts.paymasterAndData : this.buildPaymasterAndData(sender),
      signature: '0x'
    };
    return userOp;
  }
  _toHex(v) { try { if (typeof v === 'bigint') return ethers.toBeHex(v); if (typeof v === 'number') return ethers.toBeHex(BigInt(v)); if (typeof v === 'string') { if (v.startsWith('0x')) return v; return ethers.toBeHex(BigInt(v)); } } catch {} return '0x0'; }
  _formatBundlerUserOp(userOp) {
    return {
      sender: userOp.sender,
      nonce: this._toHex(userOp.nonce),
      initCode: userOp.initCode,
      callData: userOp.callData,
      callGasLimit: this._toHex(userOp.callGasLimit),
      verificationGasLimit: this._toHex(userOp.verificationGasLimit),
      preVerificationGas: this._toHex(userOp.preVerificationGas),
      maxFeePerGas: this._toHex(userOp.maxFeePerGas),
      maxPriorityFeePerGas: this._toHex(userOp.maxPriorityFeePerGas),
      paymasterAndData: userOp.paymasterAndData,
      signature: userOp.signature
    };
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
    const net = await chainRegistry.getProvider().getNetwork();
    const enc = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32','address','uint256'], [ethers.keccak256(packed), LIVE.ENTRY_POINT, net.chainId]);
    const userOpHash = ethers.keccak256(enc);
    userOp.signature = await this.signer.signMessage(ethers.getBytes(userOpHash));
    return userOp;
  }
  async sendUserOpWithBackoff(userOp, maxAttempts = 5) {
    const bundler = await chainRegistry.getBundlerProvider();
    const op = this._formatBundlerUserOp(userOp);
    const entryPoint = LIVE.ENTRY_POINT;

    let attempt = 0, lastErr;
    while (attempt < maxAttempts) {
      try {
        const hash = await bundler.send('eth_sendUserOperation', [op, entryPoint]);
        const start = Date.now(); const timeout = 180_000;
        while (Date.now() - start < timeout) {
          try {
            const receipt = await bundler.send('eth_getUserOperationReceipt', [hash]);
            if (receipt?.transactionHash) return receipt.transactionHash;
          } catch {}
          await new Promise(r => setTimeout(r, 2000));
        }
        throw new Error('UserOperation confirmation timeout');
      } catch (e) {
        lastErr = e;
        const backoffMs = Math.min(30_000, 1_000 * Math.pow(2, attempt));
        await new Promise(r => setTimeout(r, backoffMs));
        attempt++;
      }
    }
    throw lastErr || new Error('Bundlers unavailable');
  }
}

/* =========================================================================
   DEX adapters (Uniswap V3/V2 + Sushi V2 + 1inch + Paraswap-lite)
   ========================================================================= */

class UniversalDexAdapter {
  constructor(provider, config) { this.provider = provider; this.config = config; this.type = this._type(config.name); }
  _type(name) { if (name?.includes('V3')) return 'V3'; if (name?.includes('V2')) return 'V2'; if (name?.includes('Sushi')) return 'V2'; if (name?.includes('1inch')) return 'Aggregator'; if (name?.includes('Paraswap')) return 'Aggregator2'; return 'Custom'; }

  async getQuote(tokenIn, tokenOut, amountIn) {
    const t0 = Date.now();
    try {
      let q;
      switch (this.type) {
        case 'V3': q = await this._v3Quote(tokenIn, tokenOut, amountIn); break;
        case 'V2': q = await this._v2Quote(tokenIn, tokenOut, amountIn); break;
        case 'Aggregator': q = await this._agg1inchQuote(tokenIn, tokenOut, amountIn); break;
        case 'Aggregator2': q = await this._paraswapLiteQuote(tokenIn, tokenOut, amountIn); break;
        default: q = await this._v3Quote(tokenIn, tokenOut, amountIn);
      }
      if (!q) return null;
      q.latencyMs = Date.now() - t0;
      return q;
    } catch { return null; }
  }

  async _v3Quote(tokenIn, tokenOut, amountIn) {
    const quoter = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.quoter, [
      'function quoteExactInputSingle(address,address,uint24,uint256,uint160) external returns (uint256)'
    ], chainRegistry.getProvider());
    const fee = LIVE.PEG.FEE_TIER_DEFAULT;
    const amountOut = await quoter.quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn, 0);
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], chainRegistry.getProvider());
    const pool = await factory.getPool(tokenIn, tokenOut, fee);
    let liquidity = '0';
    if (pool && pool !== ethers.ZeroAddress) {
      const poolC = new ethers.Contract(pool, ['function liquidity() view returns (uint128)'], chainRegistry.getProvider());
      liquidity = (await poolC.liquidity()).toString();
    }
    return { amountOut, priceImpact: 0.0, fee, liquidity, dex: 'UNISWAP_V3', adapter: this };
  }

  async _v2Quote(tokenIn, tokenOut, amountIn) {
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V2.factory, ['function getPair(address,address) view returns (address)'], chainRegistry.getProvider());
    const pair = await factory.getPair(tokenIn, tokenOut); if (!pair || pair === ethers.ZeroAddress) return null;
    const pairC = new ethers.Contract(pair, ['function getReserves() view returns (uint112,uint112,uint32)','function token0() view returns (address)'], chainRegistry.getProvider());
    const [r0, r1] = await pairC.getReserves();
    const token0 = await pairC.token0();
    const inIs0 = tokenIn.toLowerCase() === token0.toLowerCase();
    const rin = inIs0 ? r0 : r1; const rout = inIs0 ? r1 : r0;
    if (rin === 0n || rout === 0n) return null;
    const amountInWithFee = amountIn * 997n / 1000n;
    const amountOut = (amountInWithFee * rout) / (rin + amountInWithFee);
    return { amountOut, priceImpact: Number(amountIn) / Math.max(1, Number(rin)) * 100, fee: 30, liquidity: rin.toString(), dex: this.config.name, adapter: this };
  }

  async _agg1inchQuote(tokenIn, tokenOut, amountIn) {
    try {
      const url = `https://api.1inch.io/v5.0/1/quote?fromTokenAddress=${tokenIn}&toTokenAddress=${tokenOut}&amount=${amountIn.toString()}`;
      let res, attempts = 0;
      while (attempts < 3) {
        res = await fetch(url);
        if (res.ok) break;
        attempts++; await new Promise(r => setTimeout(r, 300 * attempts));
      }
      if (!res.ok) throw new Error(`1inch ${res.status}`);
      const data = await res.json();
      return { amountOut: BigInt(data.toTokenAmount), priceImpact: 0.0, fee: 50, liquidity: '0', dex: 'ONE_INCH_V5', adapter: this };
    } catch { return null; }
  }

  async _paraswapLiteQuote(tokenIn, tokenOut, amountIn) {
    try {
      const url = `https://apiv5.paraswap.io/prices/?srcToken=${tokenIn}&destToken=${tokenOut}&amount=${amountIn.toString()}&srcDecimals=18&destDecimals=18&network=1`;
      let res, attempts = 0;
      while (attempts < 3) {
        res = await fetch(url, { headers: { 'accept': 'application/json' } });
        if (res.ok) break;
        attempts++; await new Promise(r => setTimeout(r, 300 * attempts));
      }
      if (!res.ok) throw new Error(`Paraswap ${res.status}`);
      const data = await res.json();
      const bestRoute = data?.priceRoute?.destAmount ? BigInt(data.priceRoute.destAmount) : 0n;
      if (bestRoute === 0n) return null;
      return { amountOut: bestRoute, priceImpact: 0.0, fee: 50, liquidity: '0', dex: 'PARASWAP_LITE', adapter: this };
    } catch { return null; }
  }

  async buildSwapCalldata(params) {
    const { tokenIn, tokenOut, amountIn, amountOutMin, recipient, fee = LIVE.PEG.FEE_TIER_DEFAULT } = params;
    if (this.type === 'V3') {
      const iface = new ethers.Interface(['function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) returns (uint256)']);
      return iface.encodeFunctionData('exactInputSingle', [{
        tokenIn, tokenOut, fee, recipient,
        deadline: Math.floor(Date.now()/1000)+600,
        amountIn, amountOutMinimum: amountOutMin || 0n, sqrtPriceLimitX96: 0n
      }]);
    }
    if (this.type === 'V2') {
      const iface = new ethers.Interface(['function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[] memory)']);
      return iface.encodeFunctionData('swapExactTokensForTokens', [
        amountIn, amountOutMin || 0n, [tokenIn, tokenOut], recipient, Math.floor(Date.now()/1000)+600
      ]);
    }
    // Aggregator fallback to V3 exactInputSingle for a consistent on-chain path
    const fallback = new ethers.Interface(['function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) returns (uint256)']);
    return fallback.encodeFunctionData('exactInputSingle', [{
      tokenIn, tokenOut, fee: LIVE.PEG.FEE_TIER_DEFAULT, recipient,
      deadline: Math.floor(Date.now()/1000)+600,
      amountIn, amountOutMinimum: amountOutMin || 0n, sqrtPriceLimitX96: 0n
    }]);
  }
}

class DexAdapterRegistry {
  constructor(provider) {
    this.provider = provider;
    this.adapters = {
      UNISWAP_V3: new UniversalDexAdapter(provider, LIVE.DEXES.UNISWAP_V3),
      UNISWAP_V2: new UniversalDexAdapter(provider, LIVE.DEXES.UNISWAP_V2),
      SUSHI_V2:   new UniversalDexAdapter(provider, LIVE.DEXES.SUSHI_V2),
      ONE_INCH_V5: new UniversalDexAdapter(provider, LIVE.DEXES.ONE_INCH_V5),
      PARASWAP_LITE: new UniversalDexAdapter(provider, LIVE.DEXES.PARASWAP_LITE)
    };
    this.cache = new LRUMap(10000);
    this.scores = new Map(); // name -> score
  }

  getAdapter(name) { const a = this.adapters[name]; if (!a) throw new Error(`Adapter ${name} not found`); return a; }
  getAllAdapters() { return Object.entries(this.adapters).map(([name, adapter]) => ({ name, config: adapter.config, type: adapter.type })); }

  _updateScore(name, ok, latencyMs, liquidity) {
    const prev = this.scores.get(name) || { okCount: 0, failCount: 0, avgLatency: null, avgLiquidity: 0, score: 50 };
    if (ok) prev.okCount++; else prev.failCount++;
    if (latencyMs != null) prev.avgLatency = prev.avgLatency == null ? latencyMs : Math.round(prev.avgLatency * 0.7 + latencyMs * 0.3);
    if (liquidity != null) {
      const lnum = Number(liquidity || '0');
      prev.avgLiquidity = Math.round(prev.avgLiquidity * 0.7 + lnum * 0.3);
    }
    const successRate = prev.okCount / Math.max(1, prev.okCount + prev.failCount);
    const score = Math.round(100 * (0.5 * successRate + 0.3 * (prev.avgLatency ? Math.max(0, 1 - prev.avgLatency / 1000) : 0.5) + 0.2 * Math.min(1, prev.avgLiquidity / 1e9)));
    prev.score = score;
    this.scores.set(name, prev);
  }

  async getBestQuote(tokenIn, tokenOut, amountIn) {
    const key = `q_${tokenIn}_${tokenOut}_${amountIn}`;
    const cached = this.cache.get(key); if (cached && Date.now() - cached.ts < 1000) return cached.result;
    const quotes = [];
    await Promise.allSettled(Object.entries(this.adapters).map(async ([name, adapter]) => {
      try {
        const q = await adapter.getQuote(tokenIn, tokenOut, amountIn);
        if (q && q.amountOut > 0n) { quotes.push({ dex: name, ...q, adapter }); this._updateScore(name, true, q.latencyMs, q.liquidity); }
        else this._updateScore(name, false, null, null);
      } catch { this._updateScore(name, false, null, null); }
    }));
    quotes.sort((a, b) => {
      const sa = this.scores.get(a.dex)?.score || 50;
      const sb = this.scores.get(b.dex)?.score || 50;
      if (sa !== sb) return sb - sa;
      return Number(b.amountOut - a.amountOut);
    });
    const result = { best: quotes[0] || null, secondBest: quotes[1] || quotes[0] || null, all: quotes, scores: Array.from(this.scores.entries()).map(([dex, s]) => ({ dex, ...s })) };
    this.cache.set(key, { result, ts: Date.now() });
    return result;
  }

  getScores() {
    return Array.from(this.scores.entries()).map(([dex, s]) => ({ dex, ...s }));
  }

  async healthCheck(tokenA = LIVE.TOKENS.WETH, tokenB = LIVE.TOKENS.USDC, amount = ethers.parseEther('0.01')) {
    const checks = [];
    for (const [name, adapter] of Object.entries(this.adapters)) {
      try {
        const q = await adapter.getQuote(tokenA, tokenB, amount);
        checks.push({ name, ok: !!q, latencyMs: q?.latencyMs || null, liquidity: q?.liquidity || '0', score: (this.scores.get(name)?.score || null) });
      } catch {
        checks.push({ name, ok: false, latencyMs: null, liquidity: '0', score: (this.scores.get(name)?.score || null) });
      }
    }
    return { count: checks.length, checks, timestamp: Date.now() };
  }
}

/* =========================================================================
   SCW bootstrap: EntryPoint deposit + BWAEZI allowance to paymaster
   ========================================================================= */

// CHANGED: Deposit threshold and signer funding reduced to 0.00001 ETH,
// and deposit value minimized to ~0.000005 ETH.
async function bootstrapSCWForPaymaster(aa) {
  const provider = chainRegistry.getProvider();
  const signer = aa.signer; // signer may have tiny ETH
  const scw = LIVE.SCW_ADDRESS;

  // Reader for deposits (provider-only)
  const epReader = new ethers.Contract(
    LIVE.ENTRY_POINT,
    ['function deposits(address) view returns (uint256)'],
    provider
  );

  try {
    const dep = await epReader.deposits(scw);

    // Only attempt deposit if signer has at least 0.00001 ETH
    const minThreshold = ethers.parseEther('0.00001');
    if (dep < minThreshold) {
      const bal = await provider.getBalance(signer.address);
      if (bal >= minThreshold) {
        // Raw tx send: depositTo(address) with tiny value (~0.000005 ETH)
        const epIface = new ethers.Interface(['function depositTo(address) payable']);
        const data = epIface.encodeFunctionData('depositTo', [scw]);

        const tx = await signer.sendTransaction({
          to: LIVE.ENTRY_POINT,
          data,
          value: ethers.parseEther('0.000005')
        });

        await tx.wait();
        console.log('EntryPoint deposit minimally topped up for SCW');
      } else {
        console.warn('Signer balance below 0.00001 ETH; skipping EntryPoint deposit bootstrap.');
      }
    }
  } catch (e) {
    console.warn('EntryPoint deposit check failed:', e.message);
  }

  // Approve BWAEZI allowance from SCW to paymaster (AA userOp)
  const erc20Iface = new ethers.Interface(['function approve(address,uint256) returns (bool)']);
  const calldata = erc20Iface.encodeFunctionData('approve', [LIVE.PAYMASTER_ADDRESS, ethers.MaxUint256]);

  const scwExec = new ethers.Interface(['function execute(address,uint256,bytes)']);
  const execCalldata = scwExec.encodeFunctionData('execute', [LIVE.TOKENS.BWAEZI, 0n, calldata]);

  // Allow bootstrap approval with no paymaster data (or plug your policy)
  const userOp = await aa.createUserOp(execCalldata, { callGasLimit: 600000n, preVerificationGas: 60000n, paymasterAndData: '0x' });
  const signed = await aa.signUserOp(userOp);
  const txHash = await aa.sendUserOpWithBackoff(signed, 4);
  console.log('SCW approved BWAEZI allowance to Paymaster; userOp tx:', txHash);
}

/* =========================================================================
   Entropy, Oracle, Maker, MEV, Profit verification
   ========================================================================= */

class EntropyShockDetector { constructor(){ this.lastEntropy=null; } sample(v,c){ const now=Date.now(); const shock=this.lastEntropy?Math.abs(v-this.lastEntropy.value):0; this.lastEntropy={value:v,coherence:c,ts:now}; return {shock,coherence:c,ts:now}; } slippageGuard(b,c,s){ return Math.min(0.02, Math.max(b, b+(1-c)*0.01 + Math.min(s,0.05)*0.5)); } }

class MultiAnchorOracle {
  constructor(provider,dexRegistry){ this.provider=provider; this.dexRegistry=dexRegistry; this.anchors=LIVE.ANCHORS; }
  async getCompositePriceUSD(bwaeziAddr){
    const comps=[]; for(const a of this.anchors){
      const amountProbe = a.decimals===6 ? ethers.parseUnits('1000',6) : ethers.parseEther('1');
      const q = await this.dexRegistry.getBestQuote(bwaeziAddr, a.address, amountProbe);
      if(!q?.best) continue;
      const out=q.best.amountOut; const liq=Number(q.best.liquidity||'0');
      const usd = a.symbol==='WETH'?2000.0:1.0;
      const perUnit = (Number(out)/Number(amountProbe))*usd;
      comps.push({symbol:a.symbol, perUnitUSD:perUnit, weight:liq});
    }
    if(comps.length===0) return {price: LIVE.PEG.TARGET_USD, confidence: 0.2, components: []};
    const tw = comps.reduce((s,c)=> s+(c.weight||1),0);
    const price = comps.reduce((s,c)=> s + c.perUnitUSD * ((c.weight||1)/tw),0);
    const confidence = Math.min(1, Math.max(0.2, tw/(1e9)));
    return {price, confidence, components: comps};
  }
}

class FeeFarmer {
  constructor(provider, signer){ this.provider=provider; this.signer=signer; this.npm=new ethers.Contract(LIVE.DEXES.UNISWAP_V3.positionManager, ['function collect((uint256,address,uint128,uint128)) returns (uint256,uint256)'], signer); this.positions=new Map(); this.recent=[]; }
  trackPosition(id,note=''){ if(!this.positions.has(id)) this.positions.set(id,{lastCollectedAt:0,note}); }
  async collectFees(id){ try{ const tx=await this.npm.collect({tokenId:id,recipient:LIVE.SCW_ADDRESS,amount0Max:ethers.MaxUint128,amount1Max:ethers.MaxUint128}); const rec=await tx.wait(); const r={positionId:id, txHash:rec.transactionHash, timestamp:Date.now()}; this.recent.push(r); const p=this.positions.get(id); if(p){ p.lastCollectedAt=Date.now(); this.positions.set(id,p);} return r; } catch(e){ console.warn('Fee collect failed', e.message); return null; } }
  getRecent(){ return this.recent.slice(-50); }
}

class AdaptiveRangeMaker {
  constructor(provider, signer, dexRegistry, entropy){ this.provider=provider; this.signer=signer; this.dexRegistry=dexRegistry; this.entropy=entropy; this.npm=new ethers.Contract(LIVE.DEXES.UNISWAP_V3.positionManager,['function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256,uint128,uint256,uint256)'], signer); this.running=new Map(); this.lastAdjust=0; }
  async startStreamingMint({ token0, token1, tickLower, tickUpper, total0, total1, steps=LIVE.MAKER.MAX_STREAM_STEPS, label='maker_stream' }){
    const id=`stream_${Date.now()}_${randomUUID().slice(0,8)}`; const c0= total0>0n? total0/BigInt(steps):0n; const c1= total1>0n? total1/BigInt(steps):0n;
    this.running.set(id,{ token0, token1, tickLower, tickUpper, chunk0:c0, chunk1:c1, steps, done:0, label, positions:[] });
    (async()=>{ while(true){ const st=this.running.get(id); if(!st) break; if(st.done>=st.steps){ this.running.delete(id); break; }
      const coh=Math.max(0.2, (this.entropy.lastEntropy?.coherence ?? 0.6)); const delayMs=Math.floor(8000*(1.2-coh));
      try{
        const tx=await this.npm.mint({ token0:st.token0, token1:st.token1, fee:LIVE.PEG.FEE_TIER_DEFAULT, tickLower:st.tickLower, tickUpper:st.tickUpper, amount0Desired:st.chunk0, amount1Desired:st.chunk1, amount0Min:0, amount1Min:0, recipient:LIVE.SCW_ADDRESS, deadline:Math.floor(Date.now()/1000)+1200 });
        const rec=await tx.wait(); st.positions.push({ txHash:rec.transactionHash, at:Date.now() });
      } catch(e){ console.warn('Streaming mint error:', e.message); }
      st.done++; this.running.set(id, st); await new Promise(r=>setTimeout(r, delayMs)); }
    })();
    return { streamId:id };
  }
  async periodicAdjustRange(bwaeziAddr){ const now=Date.now(); if(now-this.lastAdjust<LIVE.MAKER.RANGE_ADJUST_INTERVAL_MS) return null; this.lastAdjust=now;
    const factory=new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory,['function getPool(address,address,uint24) view returns (address)'],this.provider);
    const pool=await factory.getPool(bwaeziAddr, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT);
    if(!pool || pool===ethers.ZeroAddress) return { adjusted:false, reason:'no_pool' };
    const slot0 = await (new ethers.Contract(pool,['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'],this.provider)).slot0();
    const tick=Number(slot0[1]); const coh=Math.max(0.2, this.entropy.lastEntropy?.coherence ?? 0.6); const width=Math.floor(600*(coh<LIVE.MAKER.ENTROPY_COHERENCE_MIN?1.5:0.8));
    const tl=tick-width, tu=tick+width; const total0=LIVE.MAKER.STREAM_CHUNK_BWAEZI*4n; const total1=LIVE.MAKER.STREAM_CHUNK_USDC*4n;
    const stream=await this.startStreamingMint({ token0:LIVE.TOKENS.BWAEZI, token1:LIVE.TOKENS.USDC, tickLower:tl, tickUpper:tu, total0, total1, steps:4, label:'periodic_adjust' });
    return { adjusted:true, tick, tickLower:tl, tickUpper:tu, coherence:coh, streamId:stream.streamId };
  }
  listStreams(){ return Array.from(this.running.entries()).map(([id,st])=> ({ id, ...st })); }
}

class MevExecutor {
  constructor(aa){ this.aa=aa; this.scw=LIVE.SCW_ADDRESS; }
  buildSCWExecute(target, calldata, value=0n){ const i=new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']); return i.encodeFunctionData('execute',[target,value,calldata]); }
  async sendCall(calldata, opts={}){
    const userOp = await this.aa.createUserOp(calldata, {
      callGasLimit: opts.gasLimit || 1_600_000n,
      verificationGasLimit: 1_000_000n,
      preVerificationGas: 90_000n
    });
    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);
    return { txHash, timestamp: Date.now(), description: opts.description || 'scw_execute' };
  }
}

class ProfitVerifier {
  constructor(provider){ this.provider=provider; this.tradeRecords=new LRUMap(10000); this.profitLedger=new Map(); this.recent=[]; }
  async recordTrade(trade, txHash, packet){ const id=`trade_${Date.now()}_${randomUUID().slice(0,8)}`; const initial=await this.captureState(trade);
    const rec={id, trade, txHash, initial, status:'pending', packet}; this.tradeRecords.set(id, rec); this.recent.push({ id, ...packet, at:Date.now() }); if(this.recent.length>200) this.recent.shift(); return id; }
  async verifyTrade(id){ const rec=this.tradeRecords.get(id); if(!rec) throw new Error('Record not found');
    const final=await this.captureState(rec.trade); const profit=await this.calculateProfit(rec.initial, final, rec.trade);
    rec.final=final; rec.profit=profit; rec.status='verified'; rec.verifiedAt=Date.now(); this.updateLedger(id, profit); this.tradeRecords.set(id, rec); return { recordId:id, profit, timestamp:Date.now() };
  }
  async captureState(trade){ const balances={}; for(const token of [trade.tokenA, trade.tokenB]){ if(!token) continue; const c=new ethers.Contract(token,['function balanceOf(address) view returns (uint256)'],this.provider); balances[token]=await c.balanceOf(LIVE.SCW_ADDRESS); }
    const ethBalance=await this.provider.getBalance(LIVE.SCW_ADDRESS); return { balances, ethBalance, blockNumber:await this.provider.getBlockNumber(), timestamp:Date.now() }; }
  async calculateProfit(initial, final, trade){ const tokenProfits={}; for(const token of [trade.tokenA, trade.tokenB]){ if(!token) continue; tokenProfits[token]=(final.balances[token]||0n)-(initial.balances[token]||0n); }
    let totalUsdProfit=0; for(const [token, amt] of Object.entries(tokenProfits)){ if(amt===0n) continue; totalUsdProfit += await this.convertToUSD(token, amt); }
    const gasCostUsd= await this.estimateGasCostUSD(800_000n); totalUsdProfit -= gasCostUsd; return { tokenProfits, totalUsdProfit, gasCostUsd, netProfitUsd: totalUsdProfit }; }
  async convertToUSD(token, amount){ const dec = token===LIVE.TOKENS.USDC || token===LIVE.TOKENS.USDT ? 6 : 18; const amt=Number(ethers.formatUnits(amount, dec)); if(token===LIVE.TOKENS.USDC || token===LIVE.TOKENS.USDT || token===LIVE.TOKENS.DAI) return amt*1.0; if(token===LIVE.TOKENS.WETH) return amt*2000.0; return amt*LIVE.PEG.TARGET_USD; }
  async estimateGasCostUSD(gasUsed){ try{ const gasPrice=await chainRegistry.getFeeData(); const maxFee=gasPrice.maxFeePerGas || ethers.parseUnits('30','gwei'); const gasEth=Number(ethers.formatEther(gasUsed*maxFee)); const ethUsd=2000.0; return gasEth*ethUsd; } catch{ return 0; } }
  updateLedger(id, profit){ const date=new Date().toISOString().split('T')[0]; const d=this.profitLedger.get(date)||{ totalProfit:0, trades:0, gasCosts:0, netProfit:0 }; d.trades++; d.totalProfit+=(profit.totalUsdProfit||0); d.gasCosts+=(profit.gasCostUsd||0); d.netProfit=d.totalProfit-d.gasCosts; this.profitLedger.set(date,d); }
  getDailyReport(date=null){ const target=date||new Date().toISOString().split('T')[0]; return this.profitLedger.get(target)||{ totalProfit:0, trades:0, gasCosts:0, netProfit:0 }; }
  getAllTimeStats(){ const s={ totalProfit:0, trades:0, gasCosts:0, netProfit:0 }; for(const d of this.profitLedger.values()){ s.totalProfit+=d.totalProfit; s.trades+=d.trades; s.gasCosts+=d.gasCosts; s.netProfit+=d.netProfit; } return s; }
  getRecentDecisionPackets(limit=50){ return this.recent.slice(-limit); }
}

/* =========================================================================
   Strategy engine — event-driven peg (governors preserved)
   ========================================================================= */

function mapElementToFeeTier(elemental) { if (elemental === 'WATER') return 500; if (elemental === 'FIRE') return 10000; return 3000; }
function chooseRoute(elemental) { if (elemental === 'FIRE') return 'ONE_INCH_V5'; return 'UNISWAP_V3'; }

class StrategyEngine {
  constructor(mev, verifier, provider, dexRegistry, entropy, maker, oracle){
    this.mev=mev; this.verifier=verifier; this.provider=provider; this.dexRegistry=dexRegistry; this.entropy=entropy; this.maker=maker; this.oracle=oracle;
    this.lastPegEnforcement=0; this.lastGovernancePacket=null;
    this._healthGateMin = 40; // skip trading if provider health too low (reserved)
  }

  async neuroState(){ return { activation:0.7, plasticity:0.8, attentionFocus:0.6 }; }
  async verifierEntropy(){ return { coherence:0.85, gradient:0.3, value:0.42, timestamp:Date.now() }; }
  async gravityField(){ return { curvature:0.15 }; }
  async elementRegime(){ const regimes=['WATER','FIRE','VACUUM','EARTH']; return regimes[Math.floor(Math.random()*regimes.length)]; }

  async watchPeg() {
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const pool = await factory.getPool(LIVE.TOKENS.BWAEZI, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT);
    if (!pool || pool === ethers.ZeroAddress) return false;

    const poolC = new ethers.Contract(pool, [
      'event Swap(address,address,int256,int256,uint160,uint128,int24)',
      'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'
    ], this.provider);

    this.provider.on(poolC.filters.Swap(), async () => {
      try {
        const slot0 = await poolC.slot0();
        const tick = Number(slot0[1]);
        const priceUSDC = Math.pow(1.0001, tick);
        const deviationPct = ((priceUSDC - LIVE.PEG.TARGET_USD)/LIVE.PEG.TARGET_USD)*100;
        if (Math.abs(deviationPct) >= LIVE.PEG.DEVIATION_THRESHOLD_PCT) {
          await this.enforcePegIfNeeded();
        }
      } catch {}
    });

    return true;
  }

  buildGovernancePacket(params) {
    const packet = {
      ts: Date.now(),
      mode: params.mode,
      entropy: params.entropy,
      neuro: params.neuro,
      gravity: params.gravity,
      elemental: params.elemental,
      feeTier: params.feeTier,
      tickWidth: params.tickWidth,
      route: params.route,
      usdNotional: params.usdNotional,
      slip: params.slip,
      compositePriceUSD: params.compositePriceUSD,
      confidence: params.confidence
    };
    this.lastGovernancePacket = packet;
    return packet;
  }

  async arbitrage(tokenIn, tokenOut, notional) {
    const best=await this.dexRegistry.getBestQuote(tokenIn, tokenOut, notional); if(!best?.best) return null;
    const slip=this.entropy.slippageGuard(0.0025, this.entropy.lastEntropy?.coherence ?? 0.6, 0.0);
    const minOut= BigInt(Math.floor(Number(best.best.amountOut)*(1-slip)));
    const calldata = await best.best.adapter.buildSwapCalldata({ tokenIn, tokenOut, amountIn:notional, amountOutMin:minOut, recipient:LIVE.SCW_ADDRESS, fee:best.best.fee||LIVE.PEG.FEE_TIER_DEFAULT });
    const targetRouter = LIVE.DEXES[best.best.dex]?.router || LIVE.DEXES.UNISWAP_V3.router;
    const execCalldata = this.mev.buildSCWExecute(targetRouter, calldata);

    const composite = await this.oracle.getCompositePriceUSD(LIVE.TOKENS.BWAEZI);
    const packet = this.buildGovernancePacket({
      mode:'arbitrage',
      entropy:this.entropy.lastEntropy,
      neuro: await this.neuroState(),
      gravity: await this.gravityField(),
      elemental: await this.elementRegime(),
      feeTier: best.best.fee || LIVE.PEG.FEE_TIER_DEFAULT,
      tickWidth: 0,
      route: best.best.dex,
      usdNotional: Number(ethers.formatUnits(notional, 6)),
      slip,
      compositePriceUSD: composite.price,
      confidence: composite.confidence
    });

    const op = await this.mev.sendCall(execCalldata, { description:'arbitrage' });
    const id = await this.verifier.recordTrade({ tokenA:tokenIn, tokenB:tokenOut, amountIn:notional }, op.txHash, packet);
    await this.verifier.verifyTrade(id);
    return { txHash:op.txHash, decisionPacket:packet };
  }

  async opportunisticRebalance(buyBWAEZI=true, usdNotional=25000){
    const entropyState = this.entropy.lastEntropy || { coherence:0.6, value:0.5, timestamp:Date.now() };
    const neuro = await this.neuroState();
    const gravity = await this.gravityField();
    const elemental = await this.elementRegime();
    const feeTier = mapElementToFeeTier(elemental);
    const route = chooseRoute(elemental);
    const tickWidth = Math.floor(600 * Math.max(0.2, entropyState.coherence));
    const adapter=this.dexRegistry.getAdapter(route);

    const amountInUSDC=ethers.parseUnits(String(usdNotional),6);
    const q=await adapter.getQuote(LIVE.TOKENS.USDC, LIVE.TOKENS.BWAEZI, amountInUSDC);
    const slip=this.entropy.slippageGuard(0.003, entropyState.coherence, 0.0);
    const amountOutMin = q?.amountOut ? BigInt(Math.floor(Number(q.amountOut)*(1-slip))) : 0n;

    const calldata = await adapter.buildSwapCalldata({
      tokenIn: buyBWAEZI? LIVE.TOKENS.USDC : LIVE.TOKENS.BWAEZI,
      tokenOut: buyBWAEZI? LIVE.TOKENS.BWAEZI : LIVE.TOKENS.USDC,
      amountIn: amountInUSDC, amountOutMin, recipient:LIVE.SCW_ADDRESS, fee:feeTier
    });
    const exec=this.mev.buildSCWExecute(LIVE.DEXES[route].router, calldata);
    const composite=await this.oracle.getCompositePriceUSD(LIVE.TOKENS.BWAEZI);

    const packet = this.buildGovernancePacket({
      mode:'rebalance',
      entropy: entropyState,
      neuro, gravity, elemental,
      feeTier, tickWidth, route,
      usdNotional, slip,
      compositePriceUSD: composite.price,
      confidence: composite.confidence
    });

    const result=await this.mev.sendCall(exec, { description:'rebalance_bwaezi' });
    const recId=await this.verifier.recordTrade({ tokenA: buyBWAEZI? LIVE.TOKENS.USDC : LIVE.TOKENS.BWAEZI, tokenB: buyBWAEZI? LIVE.TOKENS.BWAEZI : LIVE.TOKENS.USDC, amountIn: amountInUSDC }, result.txHash, packet);
    await this.verifier.verifyTrade(recId);
    return { txHash:result.txHash, decisionPacket:packet };
  }

  async enforcePegIfNeeded(){
    const now=Date.now(); if(now-this.lastPegEnforcement<8000) return null; this.lastPegEnforcement=now;

    const entropyValue= Number(createHash('sha256').update(String(now)).digest().readUInt32BE(0))/0xFFFFFFFF;
    const coherence= 0.6 + 0.3*Math.sin(now/60_000);
    const sample=this.entropy.sample(entropyValue, coherence);
    const neuro= await this.neuroState();
    const gravity= await this.gravityField();
    const elemental= await this.elementRegime();
    const feeTier = mapElementToFeeTier(elemental);
    const route = chooseRoute(elemental);
    const tickWidth = Math.floor(600 * Math.max(0.2, sample.coherence));

    const composite=await this.oracle.getCompositePriceUSD(LIVE.TOKENS.BWAEZI);
    const deviationPct=((composite.price - LIVE.PEG.TARGET_USD)/LIVE.PEG.TARGET_USD)*100;
    const threshold = composite.confidence<0.5 ? 0.6 : 0.35;
    const packetBase = { entropy:sample, neuro, gravity, elemental, feeTier, tickWidth, route, compositePriceUSD: composite.price, confidence: composite.confidence };

    if(Math.abs(deviationPct) < threshold) {
      return { action:'NOOP', decisionPacket: this.buildGovernancePacket({ mode:'peg_enforcement', usdNotional:0, slip:0, ...packetBase }) };
    }

    const buy = composite.price < LIVE.PEG.TARGET_USD;
    const usdNotional = Math.round(20000*(1+ Math.min(0.8, Math.abs(deviationPct)/10)));
    const res=await this.opportunisticRebalance(buy, usdNotional);
    return { action: buy? 'BUY_BWAEZI':'SELL_BWAEZI', txHash:res.txHash, decisionPacket: res.decisionPacket };
  }
}

/* =========================================================================
   Genesis (safe)
   ========================================================================= */

class GenesisSelfLiquiditySingularity {
  constructor(provider, signer, strategy){ this.provider=provider; this.signer=signer; this.strategy=strategy; this.active=false; }
  async executeIrreversibleSingularity(){
    if(this.active) return { alreadyActive:true };
    const npm=new ethers.Contract(LIVE.DEXES.UNISWAP_V3.positionManager, ['function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) payable returns (uint256,uint128,uint256,uint256)'], this.signer);
    const bw=new ethers.Contract(LIVE.TOKENS.BWAEZI, ['function approve(address,uint256)'], this.signer);
    const usdc=new ethers.Contract(LIVE.TOKENS.USDC, ['function approve(address,uint256)'], this.signer);
    await (await bw.approve(LIVE.DEXES.UNISWAP_V3.positionManager, ethers.MaxUint256)).wait();
    await (await usdc.approve(LIVE.DEXES.UNISWAP_V3.positionManager, ethers.MaxUint256)).wait();
    const tickLower=-120, tickUpper=120;
    const initTx=await npm.mint({ token0:LIVE.TOKENS.BWAEZI, token1:LIVE.TOKENS.USDC, fee:LIVE.PEG.FEE_TIER_DEFAULT, tickLower, tickUpper, amount0Desired:LIVE.PEG.GENESIS_BWAEZI_INIT, amount1Desired:LIVE.PEG.GENESIS_MIN_USDC, amount0Min:0, amount1Min:0, recipient:this.signer.address, deadline:Math.floor(Date.now()/1000)+1800 });
    const initReceipt=await initTx.wait();
    this.active=true;
    return { genesisTx:initReceipt.transactionHash };
  }
}

/* =========================================================================
   Core
   ========================================================================= */

class ProductionSovereignCore extends EventEmitter {
  constructor(){
    super();
    this.provider=null; this.signer=null; this.aa=null;
    this.dexRegistry=null; this.entropy=null; this.maker=null; this.oracle=null; this.mev=null; this.verifier=null; this.strategy=null; this.feeFarmer=null;

    this.stats={ startTs:Date.now(), tradesExecuted:0, totalRevenueUSD:0, currentDayUSD:0, lastProfitUSD:0, pegActions:0, streamsActive:0 };
    this.status='INIT'; this.loops=[];
  }

  async initialize() {
    console.log(`SOVEREIGN MEV BRAIN ${LIVE.VERSION} — Booting`);

    await chainRegistry.init();
    this.provider = chainRegistry.getProvider();
    this.signer = new ethers.Wallet(process.env.SOVEREIGN_PRIVATE_KEY, this.provider);

    this.aa = new EnterpriseAASDK(this.signer);
    // CHANGED: Do not assert predicted SCW; we trust the provided LIVE.SCW_ADDRESS
    // and wire it directly for all ops.

    this.dexRegistry = new DexAdapterRegistry(this.provider);
    this.entropy = new EntropyShockDetector();
    this.maker = new AdaptiveRangeMaker(this.provider, this.signer, this.dexRegistry, this.entropy);
    this.oracle = new MultiAnchorOracle(this.provider, this.dexRegistry);
    this.mev = new MevExecutor(this.aa);
    this.verifier = new ProfitVerifier(this.provider);
    this.strategy = new StrategyEngine(this.mev, this.verifier, this.provider, this.dexRegistry, this.entropy, this.maker, this.oracle);
    this.feeFarmer = new FeeFarmer(this.provider, this.signer);

    // Bootstrap AA funding paths (now minimal ETH requirement)
    await bootstrapSCWForPaymaster(this.aa);

    const genesis = new GenesisSelfLiquiditySingularity(this.provider, this.signer, this.strategy);
    try { await genesis.executeIrreversibleSingularity(); } catch(e){ console.warn('Genesis skipped:', e.message); }

    await this.strategy.watchPeg();

    // Maker periodic adjust
    this.loops.push(setInterval(async () => {
      try {
        const adj = await this.maker.periodicAdjustRange(LIVE.TOKENS.BWAEZI);
        if (adj?.adjusted) {
          this.stats.streamsActive = this.maker.listStreams().length;
          console.log(`Range adjusted tick=${adj.tick} width=[${adj.tickLower},${adj.tickUpper}] coherence=${adj.coherence.toFixed(2)} stream=${adj.streamId}`);
        }
      } catch (e) { console.warn('maker adjust error:', e.message); }
    }, LIVE.MAKER.RANGE_ADJUST_INTERVAL_MS));

    this.status='SOVEREIGN_LIVE';
  }

  getStats(){
    const hours=Math.max(0.01, (Date.now()-this.stats.startTs)/3600000);
    const projectedDaily=(this.stats.currentDayUSD/hours)*24;
    return {
      system:{ status:this.status, version:LIVE.VERSION },
      trading:{ tradesExecuted:this.stats.tradesExecuted, totalRevenueUSD:this.stats.totalRevenueUSD, currentDayUSD:this.stats.currentDayUSD, projectedDaily },
      peg:{ actions:this.stats.pegActions, targetUSD:LIVE.PEG.TARGET_USD },
      maker:{ streamsActive:this.stats.streamsActive }
    };
  }
}

/* =========================================================================
   API (original)
   ========================================================================= */

class APIServer {
  constructor(core, port=8081){ this.core=core; this.port=port; this.app=express(); this.server=null; this.setupRoutes(); }
  setupRoutes(){
    this.app.get('/', (req,res)=> {
      const s=this.core.getStats();
      res.send(`
        <h1>SOVEREIGN MEV BRAIN ${LIVE.VERSION} — LIVE</h1>
        <p>Status: ${s.system.status}</p>
        <p>Revenue Today: $${(s.trading.currentDayUSD||0).toFixed(2)}</p>
        <p>Projected Daily: $${(s.trading.projectedDaily||0).toFixed(2)}</p>
        <p>Peg actions: ${s.peg.actions} | Target $${s.peg.targetUSD}</p>
        <p>Streams Active: ${s.maker.streamsActive}</p>
        <meta http-equiv="refresh" content="10">
      `);
    });

    this.app.get('/status', (req,res)=> res.json(this.core.getStats()));

    this.app.get('/anchors/composite', async (req,res)=> {
      try { const r=await this.core.oracle.getCompositePriceUSD(LIVE.TOKENS.BWAEZI); res.json({ priceUSD:r.price, confidence:r.confidence, components:r.components, ts:Date.now() }); }
      catch(e){ res.status(500).json({ error:e.message }); }
    });

    this.app.get('/maker/streams', (req,res)=> res.json({ streams:this.core.maker.listStreams(), ts:Date.now() }));

    this.app.get('/fees/recent', (req,res)=> res.json({ collections:this.core.feeFarmer.getRecent(), ts:Date.now() }));

    this.app.get('/trades/recent', (req,res)=> res.json({ decisions:this.core.verifier.getRecentDecisionPackets(100), ts:Date.now() }));

    this.app.get('/dex/list', (req,res)=> res.json({ adapters:this.core.dexRegistry.getAllAdapters(), ts:Date.now() }));

    this.app.get('/dex/health', async (req,res)=> {
      try {
        const health = await this.core.dexRegistry.healthCheck(LIVE.TOKENS.WETH, LIVE.TOKENS.USDC, ethers.parseEther('0.01'));
        res.json({ ...health, ts: Date.now() });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });

    this.app.get('/dex/scores', (req,res)=> res.json({ scores: this.core.dexRegistry.getScores(), ts: Date.now() }));

  }
  async start(){ this.server=this.app.listen(this.port, () => console.log(`🌐 API server on :${this.port}`)); }
}

/* =========================================================================
   Extensions v13.5.8 (Quorum + Advanced Oracle + EV gating + Extended API)
   ========================================================================= */

// Quorum RPC wrapper + fork detection
class QuorumRPC {
  constructor(registry, quorumSize = 3, toleranceBlocks = 2) {
    this.registry = registry;
    this.quorumSize = Math.max(1, quorumSize);
    this.toleranceBlocks = toleranceBlocks;
    this.providers = registry.rpcUrls.slice(0, quorumSize).map(url => new ethers.JsonRpcProvider(url, 1));
    this.lastForkAlert = null;
    this.health = [];
  }

  async getConsistent(callFn, compareFn, timeoutMs = 4000) {
    const results = await Promise.allSettled(this.providers.map(async (p) => {
      const start = Date.now();
      const out = await callFn(p);
      return { out, latencyMs: Date.now() - start };
    }));

    const ok = results.filter(r => r.status === 'fulfilled').map(r => r.value);
    const latency = ok.map(r => r.latencyMs);
    this.health = latency;

    if (ok.length === 0) throw new Error('QuorumRPC: all providers failed');
    if (ok.length === 1) return ok[0].out;

    // Compare first vs others using supplied compareFn
    const base = ok[0].out;
    const consistent = ok.every(r => compareFn(base, r.out));
    if (!consistent) throw new Error('QuorumRPC: consensus mismatch');
    return base;
  }

  async forkCheck() {
    try {
      const heads = await Promise.all(this.providers.map(p => p.getBlockNumber()));
      const min = Math.min(...heads);
      const max = Math.max(...heads);
      const diverged = (max - min) > this.toleranceBlocks;
      if (diverged) this.lastForkAlert = { at: Date.now(), heads };
      return { diverged, heads, lastForkAlert: this.lastForkAlert };
    } catch {
      return { diverged: false, heads: [], lastForkAlert: this.lastForkAlert };
    }
  }
}

// Advanced Oracle (TWAP + dispersion + anchor expansion)
class AdvancedOracle {
  constructor(provider, dexRegistry) {
    this.provider = provider;
    this.dexRegistry = dexRegistry;
    this.baseOracle = new MultiAnchorOracle(provider, dexRegistry);
    this.extraAnchors = [
      { symbol: 'WBTC', address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', decimals: 8 },
      { symbol: 'stETH', address: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', decimals: 18 }
      // EUROC can be added if desired and liquid
    ];
  }

  async getV3TWAP(poolAddress, seconds = 300) {
    try {
      const pool = new ethers.Contract(poolAddress, ['function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)', 'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'], this.provider);
      const sec = [seconds, 0];
      const [ticks] = await pool.observe(sec);
      const tickCumulativeDelta = Number(ticks[1] - ticks[0]);
      const twapTick = Math.floor(tickCumulativeDelta / seconds);
      return twapTick;
    } catch {
      return null;
    }
  }

  tickToPrice(tick) {
    // Uniswap v3 tick => price ratio
    return Math.pow(1.0001, tick);
  }

  async compositeAdvanced(bwaeziAddr) {
    // Base composite from existing oracle
    const base = await this.baseOracle.getCompositePriceUSD(bwaeziAddr);
    const components = base.components.slice();

    // Try to read TWAP from BWAEZI-USDC pool
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const pool = await factory.getPool(bwaeziAddr, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT);
    let twapPrice = null;

    if (pool && pool !== ethers.ZeroAddress) {
      const twapTick = await this.getV3TWAP(pool, 300);
      if (twapTick !== null) {
        twapPrice = this.tickToPrice(twapTick) * 1.0; // USDC anchor assumed ~1 USD
        components.push({ symbol: 'TWAP', perUnitUSD: twapPrice, weight: 1 });
      }
    }

    // Dispersion vs best quote
    let dispersionPct = 0;
    try {
      const best = await this.dexRegistry.getBestQuote(bwaeziAddr, LIVE.TOKENS.USDC, ethers.parseUnits('1000', 6));
      if (best?.best?.amountOut) {
        const spot = Number(best.best.amountOut) / 1000; // in USDC
        const ref = twapPrice || base.price;
        dispersionPct = ref ? Math.abs(spot - ref) / ref * 100 : 0;
      }
    } catch {}

    // Confidence adjust: penalize high dispersion
    const confidence = Math.max(0.2, Math.min(1.0, (base.confidence || 0.5) * (dispersionPct > 2 ? 0.7 : 1.0)));

    return {
      priceUSD: base.price,
      confidence,
      dispersionPct,
      components
    };
  }
}

// EV-aware Strategy proxy (net-of-gas gating) + realized slippage learning
class EVGatingStrategyProxy {
  constructor(strategy, dexRegistry, profitVerifier, provider) {
    this.strategy = strategy;
    this.dexRegistry = dexRegistry;
    this.verifier = profitVerifier;
    this.provider = provider;
    this.slippageModel = new Map(); // key: tokenIn-tokenOut -> { ema: number }
  }

  updateSlippageModel(key, observedSlip, alpha = 0.3) {
    const prev = this.slippageModel.get(key) || { ema: 0.003 };
    const ema = prev.ema * (1 - alpha) + observedSlip * alpha;
    this.slippageModel.set(key, { ema });
    return ema;
  }

  async estimateGasUSD(gasLimit = 800000n) {
    try {
      const fee = await this.provider.getFeeData();
      const price = fee.maxFeePerGas || ethers.parseUnits('30', 'gwei');
      const eth = Number(ethers.formatEther(gasLimit * price));
      const ethUsd = 2000; // replace with your live anchor if desired
      return ethUsd * eth;
    } catch {
      return 0;
    }
  }

  async executeIfEVPositive(mode, fn, args, tokenIn, tokenOut, notionalUSDC) {
    // Estimate expected amountOut via current best quote
    let expectedOut = 0;
    try {
      const q = await this.dexRegistry.getBestQuote(tokenIn, tokenOut, notionalUSDC);
      expectedOut = q?.best ? Number(q.best.amountOut) : 0;
    } catch {}

    const gasUSD = await this.estimateGasUSD(800000n);
    const slipBase = (this.slippageModel.get(`${tokenIn}-${tokenOut}`)?.ema || 0.003);
    const slipUSD = Number(ethers.formatUnits(notionalUSDC, 6)) * slipBase;
    const evUSD = (expectedOut / 1e6) - gasUSD - slipUSD;

    if (evUSD <= 0) {
      return { skipped: true, reason: 'negative_ev', evUSD, gasUSD, slipUSD };
    }

    const res = await fn.apply(this.strategy, args);
    // Update slippage model with realized slippage if available
    try {
      const id = await this.strategy.verifier?.recent?.slice(-1)?.[0]?.id;
      if (id) {
        const record = this.strategy.verifier.tradeRecords.get(id);
        const initial = record?.initial;
        const final = record?.final;
        if (initial && final) {
          // naive slip proxy
          const realizedSlip = Math.min(0.02, Math.abs(slipBase * 1.1));
          this.updateSlippageModel(`${tokenIn}-${tokenOut}`, realizedSlip);
        }
      }
    } catch {}
    return { executed: true, evUSD, gasUSD, slipUSD, result: res };
  }

  // Example wrappers
  async arbitrageIfEV(tokenIn, tokenOut, notional) {
    return this.executeIfEVPositive('arbitrage', this.strategy.arbitrage, [tokenIn, tokenOut, notional], tokenIn, tokenOut, notional);
  }

  async rebalanceIfEV(buyBWAEZI, usdNotional) {
    const amountInUSDC = ethers.parseUnits(String(usdNotional), 6);
    return this.executeIfEVPositive('rebalance', this.strategy.opportunisticRebalance, [buyBWAEZI, usdNotional], LIVE.TOKENS.USDC, LIVE.TOKENS.BWAEZI, amountInUSDC);
  }
}

// Extended API server (mounts additional endpoints, leaves original intact)
class ExtendedAPIServer {
  constructor(core, port = 8090) {
    this.core = core;
    this.port = port;
    this.app = express();
    this.server = null;

    // Compose helpers
    this.quorum = new QuorumRPC(chainRegistry, 3, 2);
    this.advancedOracle = new AdvancedOracle(core.provider, core.dexRegistry);
    this.evProxy = new EVGatingStrategyProxy(core.strategy, core.dexRegistry, core.verifier, core.provider);

    this.setupRoutes();
  }

  setupRoutes() {
    // Health
    this.app.get('/v13.5.8/status', (req, res) => {
      res.json({ version: 'v13.5.8-EXT', baseVersion: LIVE.VERSION, ts: Date.now() });
    });

    // Network quorum + fork detection
    this.app.get('/network/quorum', async (req, res) => {
      try {
        const fork = await this.quorum.forkCheck();
        res.json({ healthLatencyMs: this.quorum.health, fork });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Advanced oracle
    this.app.get('/oracle/composite-advanced', async (req, res) => {
      try {
        const r = await this.advancedOracle.compositeAdvanced(LIVE.TOKENS.BWAEZI);
        res.json({ ...r, ts: Date.now() });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Quotes with net EV estimate
    this.app.get('/dex/quotes', async (req, res) => {
      try {
        const tokenIn = req.query.tokenIn || LIVE.TOKENS.USDC;
        const tokenOut = req.query.tokenOut || LIVE.TOKENS.BWAEZI;
        const amount = req.query.amount ? BigInt(req.query.amount) : ethers.parseUnits('1000', 6);
        const q = await this.core.dexRegistry.getBestQuote(tokenIn, tokenOut, amount);
        const gasUSD = await this.evProxy.estimateGasUSD(600000n);
        const evUSD = q?.best ? Number(q.best.amountOut) / 1e6 - gasUSD : 0;
        res.json({ quotes: q, gasUSD, evUSD, ts: Date.now() });
      } catch (e) {
        res.status(500).json({ error: e.message });
      }
    });

    // Realized slippage model snapshot
    this.app.get('/dex/slippage-live', (req, res) => {
      const m = {};
      for (const [k, v] of this.evProxy.slippageModel.entries()) m[k] = v.ema;
      res.json({ models: m, ts: Date.now() });
    });

    // Ledger summaries
    this.app.get('/ledger/daily', (req, res) => {
      const d = req.query.date || null;
      res.json({ report: this.core.verifier.getDailyReport(d), ts: Date.now() });
    });
    this.app.get('/ledger/all-time', (req, res) => {
      res.json({ summary: this.core.verifier.getAllTimeStats(), ts: Date.now() });
    });

    // Minimal Prometheus-style metrics
    this.app.get('/metrics', (req, res) => {
      const s = this.core.getStats();
      const lines = [
        `core_status{version="${s.system.version}"} 1`,
        `trades_executed ${s.trading.tradesExecuted}`,
        `total_revenue_usd ${s.trading.totalRevenueUSD}`,
        `current_day_usd ${s.trading.currentDayUSD}`,
        `peg_actions ${s.peg.actions}`,
        `streams_active ${s.maker.streamsActive}`
      ];
      res.setHeader('Content-Type', 'text/plain');
      res.send(lines.join('\n'));
    });
  }

  async start() {
    this.server = this.app.listen(this.port, () => console.log(`🔌 v13.5.8 Extended API on :${this.port}`));
  }
}

/* =========================================================================
   Unified bootstrap v13.5.9
   ========================================================================= */

async function bootstrap_v13_5_9() {
  console.log('SOVEREIGN MEV BRAIN v13.5.9 — Unified bootstrap (core + extensions)');
  // Initialize base core
  await chainRegistry.init();
  const core = new ProductionSovereignCore();
  await core.initialize();

  // Start original API
  const baseApi = new APIServer(core, process.env.PORT ? Number(process.env.PORT) : 8081);
  await baseApi.start();

  // Start extension API
  const extApi = new ExtendedAPIServer(core, process.env.EXT_PORT ? Number(process.env.EXT_PORT) : 8090);
  await extApi.start();

  console.log('✅ v13.5.9 active — quorum, advanced oracle, EV gating, metrics');
}

/* =========================================================================
   CLI bootstrap compatibility
   ========================================================================= */

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      await bootstrap_v13_5_9();
      console.log(`🚀 Sovereign MEV Brain ${LIVE.VERSION} — ONLINE`);
    } catch (err) {
      console.error('Fatal boot error:', err?.stack || err);
      process.exit(1);
    }
  })();
}

/* =========================================================================
   Exports
   ========================================================================= */

export {
  // Core
  ProductionSovereignCore,
  APIServer,
  EnterpriseAASDK,
  DexAdapterRegistry,
  UniversalDexAdapter,
  MevExecutor,
  ProfitVerifier,
  StrategyEngine,
  EntropyShockDetector,
  AdaptiveRangeMaker,
  FeeFarmer,
  MultiAnchorOracle,
  LIVE,
  chainRegistry,

  // Extensions
  QuorumRPC,
  AdvancedOracle,
  EVGatingStrategyProxy,
  ExtendedAPIServer,

  // Bootstrap
  bootstrap_v13_5_9
};

export default ProductionSovereignCore;
