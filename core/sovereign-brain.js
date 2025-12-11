/**
 * core/sovereign-brain.js
 *
 * SOVEREIGN FINALITY ENGINE v13.9 — Unified v13.7 + v13.8
 * - Preserves v13.5.9 core; integrates v13.6 control kernel/governor; merges v13.8 Finality Engine
 * - Self-hosted AA with dual EntryPoint (v0.6/v0.7), minimal deposit bootstrap
 * - Advanced Oracle (TWAP + dispersion + multi-anchors: USDC/WETH/WBTC)
 * - EV-gated strategy with slippage learning, rate caps, deterministic decision packets
 * - Maker streaming LP, periodic range adjust
 * - Reflexive Amplifier (commit–reveal, hysteresis, jitter, perception index)
 * - MEV Recapture (split routes laddering + backrun cover micro-leg)
 * - Perception Merkle Accumulator + immediate calldata anchoring
 * - Staked Governance Registry (slash/reward + rate-limit packets)
 * - Enhanced API + SSE feed + WebSocket broadcast
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
 *   PORT=... (optional, default 8081)
 *   EXT_PORT=... (optional, default 8090)
 *   COMPLIANCE_MODE=strict|standard (optional)
 */

import express from 'express';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { randomUUID, createHash } from 'crypto';
import fetch from 'node-fetch';
import WebSocket from 'ws';

// Self-hosted AA infrastructure (v13.7/v13.8 compatible)
import {
  EnterpriseAASDK as AASDK_SelfHosted,
  EnhancedMevExecutor as MevExecutorSelfHosted,
  EnhancedRPCManager as EnhancedRPCManagerSelfHosted,
  PatchedIntelligentRPCManager as PatchedRPCManagerSelfHosted,
  bootstrapSCWForPaymasterEnhanced,
  ENHANCED_CONFIG
} from '../modules/aa-loaves-fishes.js';

/* =========================================================================
   Configuration (merged 13.7 + 13.8 + v13.9 risk governors)
   ========================================================================= */

function addrStrict(a) {
  try { return ethers.getAddress(a.trim()); }
  catch { const s=a.trim(); return s.startsWith('0x')?s.toLowerCase():s; }
}

const LIVE = {
  VERSION: 'v13.9',

  // ERC-4337 EntryPoints (dual)
  ENTRY_POINT_V07: addrStrict('0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),
  ENTRY_POINT_V06: addrStrict('0x5FF137D4bEAA7036d654a88Ea898df565D304B88'),
  ENTRY_POINT: addrStrict('0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),

  // Smart Account Factory (SCW fixed; factory retained for compatibility)
  ACCOUNT_FACTORY: addrStrict('0x9406Cc6185a346906296840746125a0E44976454'),

  // Owner + Smart Contract Wallet (SCW)
  EOA_OWNER_ADDRESS: addrStrict('0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA'),
  SCW_ADDRESS: addrStrict('0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C'),

  // Paymaster
  PAYMASTER_ADDRESS: addrStrict('0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47'),

  // Tokens
  TOKENS: {
    BWAEZI: addrStrict('0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'),
    WETH:   addrStrict('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
    USDC:   addrStrict('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    DAI:    addrStrict('0x6B175474E89094C44Da98b954EedeAC495271d0F'),
    USDT:   addrStrict('0xdAC17F958D2ee523a2206206994597C13D831ec7'),
    WBTC:   addrStrict('0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599')
  },

  // DEXes
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
      factory: addrStrict('0x5C69bEe701ef814a2B6a3EdDd4B1652CB9cc5aA6')
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

  // RPC providers (multi-source resilience)
  RPC_PROVIDERS: [
    ...(process.env.ALCHEMY_API_KEY ? [`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`] : []),
    ...(process.env.INFURA_PROJECT_ID ? [`https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`] : []),
    'https://eth.llamarpc.com',
    'https://rpc.ankr.com/eth',
    'https://cloudflare-eth.com',
    'https://ethereum.publicnode.com'
  ],

  // Bundlers
  BUNDLERS: [
    ...(process.env.STACKUP_API_KEY ? [`https://api.stackup.sh/v1/node/${process.env.STACKUP_API_KEY}`] : []),
    'https://bundler.candide.xyz/rpc/mainnet',
    ...(process.env.PIMLICO_API_KEY ? [`https://bundler.pimlico.io/v2/1/${process.env.PIMLICO_API_KEY}`] : []),
    ...(process.env.BICONOMY_API_KEY ? [`https://bundler.biconomy.io/api/v2/1/${process.env.BICONOMY_API_KEY}`] : [])
  ],

  PEG: {
    TARGET_USD: 100,
    FEE_TIER_DEFAULT: 500,            // BWAEZI–USDC canonical fee tier; adjust if needed
    GENESIS_MIN_USDC: ethers.parseUnits('100', 6),
    GENESIS_BWAEZI_INIT: ethers.parseEther('1000'),
    SEED_BWAEZI_EXPAND: ethers.parseEther('50000'),
    DEVIATION_THRESHOLD_PCT: 0.5,     // peg watcher enforcement trigger
    PEG_ADJUSTMENT_THRESHOLD: 0.15    // threshold to consider peg drift adjustment (v13.8+)
  },

  MAKER: {
    STREAM_CHUNK_BWAEZI: ethers.parseEther('250'),
    STREAM_CHUNK_USDC: ethers.parseUnits('150000', 6),
    MAX_STREAM_STEPS: 12,
    RANGE_ADJUST_INTERVAL_MS: 60_000,
    ENTROPY_COHERENCE_MIN: 0.35
  },

  ANCHORS: [
    { symbol: 'USDC', address: addrStrict('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'), decimals: 6,  weight: 0.6 },
    { symbol: 'WETH', address: addrStrict('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'), decimals: 18, weight: 0.25 },
    { symbol: 'WBTC', address: addrStrict('0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'), decimals: 8,  weight: 0.15 }
  ],

  REFLEXIVE: {
    AMPLIFICATION_THRESHOLD: 2.5,
    COOLDOWN_BLOCKS: 10,
    MAX_DAILY_AMPLIFICATIONS: 24,
    HYSTERESIS_WINDOW_MS: 4500,
    JITTER_MS_MIN: 3000,
    JITTER_MS_MAX: 90000,
    SPLIT_ROUTES: ['UNISWAP_V3', 'ONE_INCH_V5', 'PARASWAP_LITE']
  },

  GOVERNANCE: {
    MIN_STAKE_BWAEZI: ethers.parseEther('1000'),
    SLASH_EV_NEGATIVE_USD: 50,
    MAX_PACKETS_PER_MINUTE: 15
  },

  PERCEPTION: {
    LOCAL_WEIGHT: 0.6,
    L2_WEIGHT: 0.25,
    L1_WEIGHT: 0.15,
    DECAY_MS: 60_000
  },

  // v13.9 Risk Governors — converting risks into guardrails and advantages
  RISK: {
    // Runaway algorithms → Circuit breakers + loss-guard + global kill-switch
    CIRCUIT_BREAKERS: {
      ENABLED: true,
      MAX_CONSECUTIVE_LOSSES_USD: 500,      // halt if recent net losses exceed this
      MAX_NEG_EV_TRADES: 2,                  // halt after sequential negative EV decisions
      GLOBAL_KILL_SWITCH: false,             // if true, no trading; can be toggled via API/admin script
      WINDOW_MS: 10 * 60_000                 // 10-minute window for loss/runaway checks
    },
    // Market condition sensitivity → Adaptive degradation
    ADAPTIVE_DEGRADATION: {
      ENABLED: true,
      HIGH_GAS_GWEI: 150,                    // above this, downsize notional by factor
      DOWNSIZE_FACTOR: 0.5,                  // halve notional under stress
      LOW_LIQUIDITY_NORM: 0.05,              // if liquidity norm < threshold, downsize and increase slippage guard
      DISPERSION_HALT_PCT: 5.0,              // if dispersion beyond this, halt actions temporarily
      HALT_COOLDOWN_MS: 5 * 60_000           // 5 minutes
    },
    // Competitive degradation → Cost-aware bidding and stealth routing
    COMPETITION: {
      ENABLED: true,
      MAX_PRIORITY_FEE_GWEI: 4,              // cap priority fee bidding
      RANDOMIZE_SPLITS: true,                // minor randomization of split ratios
      BUDGET_PER_MINUTE_USD: 250000,         // hard budget cap to avoid arms race
      COST_AWARE_SLIP_BIAS: 0.002            // bias minimum out to account for competition dynamics
    },
    // Infrastructure dependency → Quorum + stale detection + backoff
    INFRA: {
      ENABLED: true,
      MAX_PROVIDER_LATENCY_MS: 2000,         // prefer providers under 2s
      STALE_BLOCK_THRESHOLD: 3,              // if block head lags >3 vs best, provider penalized
      QUORUM_SIZE: 3,                        // minimum providers for fork check quorum
      BACKOFF_BASE_MS: 1000
    },
    // Regulatory risk → Compliance modes
    COMPLIANCE: {
      MODE: (process.env.COMPLIANCE_MODE || 'standard'),
      STRICT: {
        DISABLE_SANDWICH: true,
        DEFENSIVE_ONLY: true,                // no aggressive MEV; only protective cover
        LOG_DECISIONS: true
      },
      STANDARD: {
        DISABLE_SANDWICH: true,
        DEFENSIVE_ONLY: false,
        LOG_DECISIONS: true
      }
    }
  }
};

/* =========================================================================
   Intelligent RPC manager (patched)
   ========================================================================= */

class IntelligentRPCManager {
  constructor(rpcUrls, chainId = 1) {
    this._patched = new PatchedRPCManagerSelfHosted(rpcUrls, chainId);
    this.initialized = false;
  }
  async init() { await this._patched.init(); this.initialized = true; }
  getProvider() { return this._patched.getProvider(); }
  async getFeeData() { return await this._patched.getFeeData(); }
  async getBundlerProvider() { return await this._patched.getBundlerProvider(); }
}

const chainRegistry = new IntelligentRPCManager(LIVE.RPC_PROVIDERS, 1);

/* =========================================================================
   Utilities
   ========================================================================= */

class LRUMap {
  constructor(maxSize = 10000) { this.data = new Map(); this.maxSize = maxSize; }
  set(k, v) {
    if (this.data.size >= this.maxSize) {
      const fk = this.data.keys().next().value; this.data.delete(fk);
    }
    this.data.set(k, v);
  }
  get(k) { return this.data.get(k); }
}

/* =========================================================================
   Compliance manager (regulatory-friendly routing)
   ========================================================================= */

class ComplianceManager {
  constructor(modeCfg) {
    const mode = (LIVE.RISK.COMPLIANCE.MODE || 'standard').toLowerCase();
    this.cfg = mode === 'strict' ? LIVE.RISK.COMPLIANCE.STRICT : LIVE.RISK.COMPLIANCE.STANDARD;
  }
  isDefensiveOnly() { return !!this.cfg.DEFENSIVE_ONLY; }
  sandwichDisabled() { return !!this.cfg.DISABLE_SANDWICH; }
  shouldLog() { return !!this.cfg.LOG_DECISIONS; }
}

/* =========================================================================
   Health guard (runaway and market stress guardrails)
   ========================================================================= */

class HealthGuard {
  constructor() {
    this.lossEvents = [];
    this.negEvStreak = 0;
    this.lastHaltTs = 0;
  }
  recordEV(evUSD) {
    const now = Date.now();
    const windowStart = now - LIVE.RISK.CIRCUIT_BREAKERS.WINDOW_MS;
    this.lossEvents.push({ evUSD, ts: now });
    this.lossEvents = this.lossEvents.filter(e => e.ts >= windowStart);
    if (evUSD <= 0) this.negEvStreak++; else this.negEvStreak = 0;
  }
  runawayTriggered() {
    const losses = this.lossEvents.filter(e => e.evUSD < 0).reduce((s,e)=> s + Math.abs(e.evUSD), 0);
    return (
      LIVE.RISK.CIRCUIT_BREAKERS.ENABLED &&
      (losses >= LIVE.RISK.CIRCUIT_BREAKERS.MAX_CONSECUTIVE_LOSSES_USD ||
       this.negEvStreak >= LIVE.RISK.CIRCUIT_BREAKERS.MAX_NEG_EV_TRADES ||
       LIVE.RISK.CIRCUIT_BREAKERS.GLOBAL_KILL_SWITCH)
    );
  }
  marketStressHalt(dispersionPct, liquidityNorm, gasGwei) {
    const now = Date.now();
    if (!LIVE.RISK.ADAPTIVE_DEGRADATION.ENABLED) return false;
    const dispersionHalt = dispersionPct >= LIVE.RISK.ADAPTIVE_DEGRADATION.DISPERSION_HALT_PCT;
    const lowLiquidity = liquidityNorm <= LIVE.RISK.ADAPTIVE_DEGRADATION.LOW_LIQUIDITY_NORM;
    const extremeGas = gasGwei >= LIVE.RISK.ADAPTIVE_DEGRADATION.HIGH_GAS_GWEI;
    if (dispersionHalt || (lowLiquidity && extremeGas)) {
      this.lastHaltTs = now;
      return true;
    }
    const halted = (now - this.lastHaltTs) <= LIVE.RISK.ADAPTIVE_DEGRADATION.HALT_COOLDOWN_MS;
    return halted;
  }
  adaptiveDownsize(notionalUSD, liquidityNorm, gasGwei) {
    if (!LIVE.RISK.ADAPTIVE_DEGRADATION.ENABLED) return notionalUSD;
    let n = notionalUSD;
    if (liquidityNorm < LIVE.RISK.ADAPTIVE_DEGRADATION.LOW_LIQUIDITY_NORM) {
      n = Math.round(n * LIVE.RISK.ADAPTIVE_DEGRADATION.DOWNSIZE_FACTOR);
    }
    if (gasGwei > LIVE.RISK.ADAPTIVE_DEGRADATION.HIGH_GAS_GWEI) {
      n = Math.round(n * LIVE.RISK.ADAPTIVE_DEGRADATION.DOWNSIZE_FACTOR);
    }
    return Math.max(1000, n);
  }
}

/* =========================================================================
   Dex adapters + registry
   ========================================================================= */

class UniversalDexAdapter {
  constructor(provider, config) { this.provider = provider; this.config = config; this.type = this._type(config.name); }
  _type(name) {
    if (name?.includes('V3')) return 'V3';
    if (name?.includes('V2')) return 'V2';
    if (name?.includes('Sushi')) return 'V2';
    if (name?.includes('1inch')) return 'Aggregator';
    if (name?.includes('Paraswap')) return 'Aggregator2';
    return 'Custom';
  }

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
      // basic stale check guard
      if (q.latencyMs > 5000) return null;
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
        attempts++; await new Promise(r => setTimeout(r, LIVE.RISK.INFRA.BACKOFF_BASE_MS * attempts));
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
        attempts++; await new Promise(r => setTimeout(r, LIVE.RISK.INFRA.BACKOFF_BASE_MS * attempts));
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
    this.scores = new Map();
  }

  getAdapter(name) { const a = this.adapters[name]; if (!a) throw new Error(`Adapter ${name} not found`); return a; }
  getAllAdapters() { return Object.entries(this.adapters).map(([name, adapter]) => ({ name, config: adapter.config, type: adapter.type })); }

  _updateScore(name, ok, latencyMs, liquidity) {
    const prev = this.scores.get(name) || { okCount: 0, failCount: 0, avgLatency: null, avgLiquidity: 0, score: 50 };
    if (ok) prev.okCount++; else prev.failCount++;
    if (latencyMs != null) prev.avgLatency = prev.avgLatency == null ? latencyMs : Math.round(prev.avgLatency * 0.7 + latencyMs * 0.3);
    if (liquidity != null) { const lnum = Number(liquidity || '0'); prev.avgLiquidity = Math.round(prev.avgLiquidity * 0.7 + lnum * 0.3); }
    const successRate = prev.okCount / Math.max(1, prev.okCount + prev.failCount);
    const latencyScore = prev.avgLatency ? Math.max(0, 1 - prev.avgLatency / (LIVE.RISK.INFRA.MAX_PROVIDER_LATENCY_MS || 1000)) : 0.5;
    const score = Math.round(100 * (0.5 * successRate + 0.3 * latencyScore + 0.2 * Math.min(1, prev.avgLiquidity / 1e9)));
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

  getScores() { return Array.from(this.scores.entries()).map(([dex, s]) => ({ dex, ...s })); }

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
   SCW minimal bootstrap (deposit + allowance via AA)
   ========================================================================= */

async function bootstrapSCWForPaymaster(aa) {
  const provider = chainRegistry.getProvider();
  const signer = aa.signer;
  const scw = LIVE.SCW_ADDRESS;

  const epCandidates = [LIVE.ENTRY_POINT_V06, LIVE.ENTRY_POINT_V07];
  const epIface = new ethers.Interface(['function depositTo(address) payable']);

  let chosenEP = null;
  for (const epAddr of epCandidates) {
    try {
      const epReader = new ethers.Contract(epAddr, ['function deposits(address) view returns (uint256)'], provider);
      await epReader.deposits(scw);
      chosenEP = epAddr; break;
    } catch {}
  }
  if (!chosenEP) chosenEP = LIVE.ENTRY_POINT;

  try {
    const epReader = new ethers.Contract(chosenEP, ['function deposits(address) view returns (uint256)'], provider);
    const dep = await epReader.deposits(scw);
    const minThreshold = ethers.parseEther('0.00001');
    if (dep < minThreshold) {
      const bal = await provider.getBalance(signer.address);
      if (bal >= minThreshold) {
        const data = epIface.encodeFunctionData('depositTo', [scw]);
        const tx = await signer.sendTransaction({ to: chosenEP, data, value: ethers.parseEther('0.000005') });
        await tx.wait();
        console.log(`EntryPoint (${chosenEP}) deposit minimally topped up for SCW`);
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

  const userOp = await aa.createUserOp(execCalldata, { callGasLimit: 600000n, preVerificationGas: 60000n, paymasterAndData: '0x' });
  const signed = await aa.signUserOp(userOp);
  const txHash = await aa.sendUserOpWithBackoff(signed, 4);
  console.log('SCW approved BWAEZI allowance to Paymaster; userOp tx:', txHash);
}

/* =========================================================================
   Entropy, Oracle
   ========================================================================= */

class EntropyShockDetector {
  constructor(){ this.lastEntropy=null; }
  sample(v,c){
    const now=Date.now();
    const shock=this.lastEntropy?Math.abs(v-this.lastEntropy.value):0;
    this.lastEntropy={value:v,coherence:c,ts:now};
    return {shock,coherence:c,ts:now};
  }
  slippageGuard(b,c,s){ return Math.min(0.02, Math.max(b, b+(1-c)*0.01 + Math.min(s,0.05)*0.5)); }
}

class MultiAnchorOracle {
  constructor(provider,dexRegistry){ this.provider=provider; this.dexRegistry=dexRegistry; this.anchors=LIVE.ANCHORS; }
  async getCompositePriceUSD(bwaeziAddr){
    const comps=[];
    for(const a of this.anchors){
      const amountProbe = a.decimals===6 ? ethers.parseUnits('1000',6) : (a.decimals===8 ? 100000000n : ethers.parseEther('1'));
      const q = await this.dexRegistry.getBestQuote(bwaeziAddr, a.address, amountProbe);
      if(!q?.best) continue;
      const out=q.best.amountOut; const liq=Number(q.best.liquidity||'0');
      const usd = a.symbol==='WETH'?2000.0 : (a.symbol==='WBTC'? 40000.0 : 1.0); // rough anchors; replace with feed if desired
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

class AdvancedOracle {
  constructor(provider, dexRegistry) { this.provider = provider; this.dexRegistry = dexRegistry; this.baseOracle = new MultiAnchorOracle(provider, dexRegistry); }
  async getV3TWAP(poolAddress, seconds = 300) {
    try {
      const pool = new ethers.Contract(poolAddress, ['function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)', 'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'], this.provider);
      const sec = [seconds, 0];
      const [ticks] = await pool.observe(sec);
      const tickCumulativeDelta = Number(ticks[1] - ticks[0]);
      const twapTick = Math.floor(tickCumulativeDelta / seconds);
      return twapTick;
    } catch { return null; }
  }
  tickToPrice(tick) { return Math.pow(1.0001, tick); }
  async compositeAdvanced(bwaeziAddr) {
    const base = await this.baseOracle.getCompositePriceUSD(bwaeziAddr);
    const components = base.components.slice();
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const pool = await factory.getPool(bwaeziAddr, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT);
    let twapPrice = null;
    if (pool && pool !== ethers.ZeroAddress) {
      const twapTick = await this.getV3TWAP(pool, 300);
      if (twapTick !== null) {
        twapPrice = this.tickToPrice(twapTick) * 1.0;
        components.push({ symbol: 'TWAP', perUnitUSD: twapPrice, weight: 1 });
      }
    }
    let dispersionPct = 0;
    try {
      const best = await this.dexRegistry.getBestQuote(bwaeziAddr, LIVE.TOKENS.USDC, ethers.parseUnits('1000', 6));
      if (best?.best?.amountOut) {
        const spot = Number(best.best.amountOut) / 1000;
        const ref = twapPrice || base.price;
        dispersionPct = ref ? Math.abs(spot - ref) / ref * 100 : 0;
      }
    } catch {}
    const confidence = Math.max(0.2, Math.min(1.0, (base.confidence || 0.5) * (dispersionPct > 2 ? 0.6 : 1.0)));
    return { priceUSD: base.price, confidence, dispersionPct, components };
  }
}

/* =========================================================================
   Fee farmer, Maker
   ========================================================================= */

class FeeFarmer {
  constructor(provider, signer){ this.provider=provider; this.signer=signer; this.npm=new ethers.Contract(LIVE.DEXES.UNISWAP_V3.positionManager, ['function collect((uint256,address,uint128,uint128)) returns (uint256,uint256)'], signer); this.positions=new Map(); this.recent=[]; }
  trackPosition(id,note=''){ if(!this.positions.has(id)) this.positions.set(id,{lastCollectedAt:0,note}); }
  async collectFees(id){
    try{
      const tx=await this.npm.collect({tokenId:id,recipient:LIVE.SCW_ADDRESS,amount0Max:ethers.MaxUint128,amount1Max:ethers.MaxUint128});
      const rec=await tx.wait();
      const r={positionId:id, txHash:rec.transactionHash, timestamp:Date.now()};
      this.recent.push(r);
      const p=this.positions.get(id); if(p){ p.lastCollectedAt=Date.now(); this.positions.set(id,p);}
      return r;
    } catch(e){ console.warn('Fee collect failed', e.message); return null; }
  }
  getRecent(){ return this.recent.slice(-50); }
}

class AdaptiveRangeMaker {
  constructor(provider, signer, dexRegistry, entropy){
    this.provider=provider; this.signer=signer; this.dexRegistry=dexRegistry; this.entropy=entropy;
    this.npm=new ethers.Contract(LIVE.DEXES.UNISWAP_V3.positionManager,['function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256,uint128,uint256,uint256)'], signer);
    this.running=new Map(); this.lastAdjust=0;
  }
  async startStreamingMint({ token0, token1, tickLower, tickUpper, total0, total1, steps=LIVE.MAKER.MAX_STREAM_STEPS, label='maker_stream' }){
    const id=`stream_${Date.now()}_${randomUUID().slice(0,8)}`;
    const c0= total0>0n? total0/BigInt(steps):0n; const c1= total1>0n? total1/BigInt(steps):0n;
    this.running.set(id,{ token0, token1, tickLower, tickUpper, chunk0:c0, chunk1:c1, steps, done:0, label, positions:[] });
    (async()=>{
      while(true){
        const st=this.running.get(id); if(!st) break; if(st.done>=st.steps){ this.running.delete(id); break; }
        const coh=Math.max(0.2, (this.entropy.lastEntropy?.coherence ?? 0.6));
        const delayMs=Math.floor(8000*(1.2-coh));
        try{
          const tx=await this.npm.mint({ token0:st.token0, token1:st.token1, fee:LIVE.PEG.FEE_TIER_DEFAULT, tickLower:st.tickLower, tickUpper:st.tickUpper, amount0Desired:st.chunk0, amount1Desired:st.chunk1, amount0Min:0, amount1Min:0, recipient:LIVE.SCW_ADDRESS, deadline:Math.floor(Date.now()/1000)+1200 });
          const rec=await tx.wait(); st.positions.push({ txHash:rec.transactionHash, at:Date.now() });
        } catch(e){ console.warn('Streaming mint error:', e.message); }
        st.done++; this.running.set(id, st); await new Promise(r=>setTimeout(r, delayMs));
      }
    })();
    return { streamId:id };
  }
  async periodicAdjustRange(bwaeziAddr){
    const now=Date.now(); if(now-this.lastAdjust<LIVE.MAKER.RANGE_ADJUST_INTERVAL_MS) return null; this.lastAdjust=now;
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

/* =========================================================================
   Mev executors
   ========================================================================= */

class MevExecutorAA {
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

/* =========================================================================
   Profit verification, EV gating
   ========================================================================= */

class ProfitVerifier {
  constructor(provider){ this.provider=provider; this.tradeRecords=new LRUMap(10000); this.profitLedger=new Map(); this.recent=[]; }
  async recordTrade(trade, txHash, packet){
    const id=`trade_${Date.now()}_${randomUUID().slice(0,8)}`; const initial=await this.captureState(trade);
    const rec={id, trade, txHash, initial, status:'pending', packet};
    this.tradeRecords.set(id, rec);
    this.recent.push({ id, ...packet, at:Date.now() });
    if(this.recent.length>200) this.recent.shift();
    return id;
  }
  async verifyTrade(id){
    const rec=this.tradeRecords.get(id); if(!rec) throw new Error('Record not found');
    const final=await this.captureState(rec.trade); const profit=await this.calculateProfit(rec.initial, final, rec.trade);
    rec.final=final; rec.profit=profit; rec.status='verified'; rec.verifiedAt=Date.now();
    this.updateLedger(id, profit); this.tradeRecords.set(id, rec);
    return { recordId:id, profit, timestamp:Date.now() };
  }
  async captureState(trade){
    const balances={};
    for(const token of [trade.tokenA, trade.tokenB]){
      if(!token) continue; const c=new ethers.Contract(token,['function balanceOf(address) view returns (uint256)'],this.provider);
      balances[token]=await c.balanceOf(LIVE.SCW_ADDRESS);
    }
    const ethBalance=await this.provider.getBalance(LIVE.SCW_ADDRESS);
    return { balances, ethBalance, blockNumber:await this.provider.getBlockNumber(), timestamp:Date.now() };
  }
  async calculateProfit(initial, final, trade){
    const tokenProfits={};
    for(const token of [trade.tokenA, trade.tokenB]){ if(!token) continue; tokenProfits[token]=(final.balances[token]||0n)-(initial.balances[token]||0n); }
    let totalUsdProfit=0;
    for(const [token, amt] of Object.entries(tokenProfits)){
      if(amt===0n) continue; totalUsdProfit += await this.convertToUSD(token, amt);
    }
    const gasCostUsd= await this.estimateGasCostUSD(800_000n);
    totalUsdProfit -= gasCostUsd;
    return { tokenProfits, totalUsdProfit, gasCostUsd, netProfitUsd: totalUsdProfit };
  }
  async convertToUSD(token, amount){
    const dec = token===LIVE.TOKENS.USDC || token===LIVE.TOKENS.USDT ? 6 : (token===LIVE.TOKENS.WBTC ? 8 : 18);
    const amt=Number(ethers.formatUnits(amount, dec));
    if(token===LIVE.TOKENS.USDC || token===LIVE.TOKENS.USDT || token===LIVE.TOKENS.DAI) return amt*1.0;
    if(token===LIVE.TOKENS.WETH) return amt*2000.0;
    if(token===LIVE.TOKENS.WBTC) return amt*40000.0;
    return amt*LIVE.PEG.TARGET_USD;
  }
  async estimateGasCostUSD(gasUsed){
    try{
      const gasPrice=await chainRegistry.getFeeData();
      const maxFee=gasPrice.maxFeePerGas || ethers.parseUnits('30','gwei');
      const gasEth=Number(ethers.formatEther(gasUsed*maxFee));
      const ethUsd=2000.0;
      return gasEth*ethUsd;
    } catch{ return 0; }
  }
  updateLedger(id, profit){
    const date=new Date().toISOString().split('T')[0];
    const d=this.profitLedger.get(date)||{ totalProfit:0, trades:0, gasCosts:0, netProfit:0 };
    d.trades++; d.totalProfit+=(profit.totalUsdProfit||0); d.gasCosts+=(profit.gasCostUsd||0); d.netProfit=d.totalProfit-d.gasCosts;
    this.profitLedger.set(date,d);
  }
  getDailyReport(date=null){ const target=date||new Date().toISOString().split('T')[0]; return this.profitLedger.get(target)||{ totalProfit:0, trades:0, gasCosts:0, netProfit:0 }; }
  getAllTimeStats(){ const s={ totalProfit:0, trades:0, gasCosts:0, netProfit:0 }; for(const d of this.profitLedger.values()){ s.totalProfit+=d.totalProfit; s.trades+=d.trades; s.gasCosts+=d.gasCosts; s.netProfit+=d.netProfit; } return s; }
  getRecentDecisionPackets(limit=50){ return this.recent.slice(-limit); }
}

class EVGatingStrategyProxy {
  constructor(strategy, dexRegistry, profitVerifier, provider, healthGuard, compliance) {
    this.strategy = strategy;
    this.dexRegistry = dexRegistry;
    this.verifier = profitVerifier;
    this.provider = provider;
    this.slippageModel = new Map();
    this.health = healthGuard;
    this.compliance = compliance;
    this.minuteSpentUSD = 0;
    this.minuteStart = Date.now();
  }
  updateSlippageModel(key, observedSlip, alpha = 0.3) {
    const prev = this.slippageModel.get(key) || { ema: 0.003 };
    const ema = prev.ema * (1 - alpha) + observedSlip * alpha;
    this.slippageModel.set(key, { ema });
    return ema;
  }
  resetMinuteWindow() {
    const now = Date.now();
    if (now - this.minuteStart >= 60_000) { this.minuteStart = now; this.minuteSpentUSD = 0; }
  }
  async estimateGasUSD(gasLimit = 800000n) {
    try {
      const fee = await this.provider.getFeeData();
      const price = fee.maxFeePerGas || ethers.parseUnits('30', 'gwei');
      const eth = Number(ethers.formatEther(gasLimit * price));
      const ethUsd = 2000;
      return ethUsd * eth;
    } catch { return 0; }
  }
  // Risk-aware execution gate
  async executeIfEVPositive(mode, fn, args, tokenIn, tokenOut, notionalUSDC) {
    this.resetMinuteWindow();

    // compliance: defensive-only? skip aggressive arbitrage mode
    if (this.compliance.isDefensiveOnly() && mode === 'arbitrage') {
      return { skipped: true, reason: 'compliance_defensive_only' };
    }

    // budget cap
    const usdNotional = Number(ethers.formatUnits(notionalUSDC, 6));
    if ((this.minuteSpentUSD + usdNotional) > (LIVE.RISK.COMPETITION.BUDGET_PER_MINUTE_USD || 1e9)) {
      return { skipped: true, reason: 'budget_cap' };
    }

    let expectedOut = 0;
    try { const q = await this.dexRegistry.getBestQuote(tokenIn, tokenOut, notionalUSDC); expectedOut = q?.best ? Number(q.best.amountOut) : 0; } catch {}
    const gasUSD = await this.estimateGasUSD(800000n);
    const slipCeil = 0.02;
    const slipBaseModel = (this.slippageModel.get(`${tokenIn}-${tokenOut}`)?.ema || 0.003);
    const slipBase = Math.min(slipCeil, slipBaseModel + (LIVE.RISK.COMPETITION.COST_AWARE_SLIP_BIAS || 0));
    const slipUSD = Number(ethers.formatUnits(notionalUSDC, 6)) * slipBase;
    const evUSD = (expectedOut / 1e6) - gasUSD - slipUSD;

    // runaway guard and kill-switch
    if (this.health.runawayTriggered()) return { skipped: true, reason: 'circuit_breaker' };
    if (slipBase >= slipCeil) return { skipped: true, reason: 'slippage_ceiling', slipBase };
    if (evUSD <= 0) return { skipped: true, reason: 'negative_ev', evUSD, gasUSD, slipUSD };

    // submit
    const res = await fn.apply(this.strategy, args);
    try {
      const id = this.strategy.verifier?.recent?.slice(-1)?.[0]?.id;
      if (id) {
        const realizedSlip = Math.min(0.02, Math.abs(slipBase * 1.1));
        this.updateSlippageModel(`${tokenIn}-${tokenOut}`, realizedSlip);
        this.health.recordEV(evUSD);
      }
    } catch {}
    this.minuteSpentUSD += usdNotional;
    return { executed: true, evUSD, gasUSD, slipUSD, result: res };
  }
  async arbitrageIfEV(tokenIn, tokenOut, notional) {
    return this.executeIfEVPositive('arbitrage', this.strategy.arbitrage, [tokenIn, tokenOut, notional], tokenIn, tokenOut, notional);
  }
  async rebalanceIfEV(buyBWAEZI, usdNotional) {
    const amountInUSDC = ethers.parseUnits(String(usdNotional), 6);
    return this.executeIfEVPositive('rebalance', this.strategy.opportunisticRebalance, [buyBWAEZI, usdNotional], LIVE.TOKENS.USDC, LIVE.TOKENS.BWAEZI, amountInUSDC);
  }
}

/* =========================================================================
   Strategy engine (peg watcher + arbitrage/rebalance) with health guard
   ========================================================================= */

function mapElementToFeeTier(elemental) { if (elemental === 'WATER') return 500; if (elemental === 'FIRE') return 10000; return 3000; }
function chooseRoute(elemental) { if (elemental === 'FIRE') return 'ONE_INCH_V5'; return 'UNISWAP_V3'; }

class StrategyEngine {
  constructor(mev, verifier, provider, dexRegistry, entropy, maker, oracle){
    this.mev=mev; this.verifier=verifier; this.provider=provider; this.dexRegistry=dexRegistry; this.entropy=entropy; this.maker=maker; this.oracle=oracle;
    this.lastPegEnforcement=0; this.lastGovernancePacket=null;
    this._healthGateMin = 40;
  }
  async neuroState(){ return { activation:0.7, plasticity:0.8, attentionFocus:0.6 }; }
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
   v13.6 control kernel + governor (manifest)
   ========================================================================= */

const V13_6_MANIFEST = {
  pegUSD: LIVE.PEG.TARGET_USD,
  liquidityWeights: { wUSDC: 0.7, wWETH: 0.3 },
  liquidityBaseline: 1e9,
  utilityWeights: { w1: 0.45, w2: 0.25, w3: 0.20, w4: 0.10 },
  utilityCaps: { evUsdCap: 500 },
  gates: {
    confidenceMin: 0.5,
    dispersionMaxPct: 2.5,
    bandPctMin: 0.35,
    slippageCeiling: 0.02
  },
  sizing: { a1Dev: 0.6, a2Liq: 0.5, a3Vol: 0.4 },
  caps: { NminUSD: 5000, NmaxUSD: 50000, perMinuteUSD: 150000, perHourUSD: 1500000, perDayUSD: 5_000_000 },
  constants: { beta: 2.2, alpha: 2.0, gamma: 0.8, delta: 1.0 },
};

class ConsciousnessKernel {
  constructor({ oracle, dexRegistry, quorum, evProxy, manifest }) {
    this.oracle = oracle;
    this.dexRegistry = dexRegistry;
    this.quorum = quorum;
    this.ev = evProxy;
    this.state = { slippageEMA: 0.003, dispersionEMA: 0.0, entropyEMA: 0.5, lastSignals: null };
    this.manifest = manifest;
    this.policyHash = null;
  }
  sealPolicy(manifest) {
    this.manifest = manifest;
    const bytes = new TextEncoder().encode(JSON.stringify(manifest));
    this.policyHash = ethers.keccak256(bytes);
    return this.policyHash;
  }
  computeUtility({ evUSD, successRate, latencyMs }) {
    const m = this.manifest.utilityWeights;
    const EV_cap = this.manifest.utilityCaps.evUsdCap;
    const EV_norm = Math.min(1, Math.max(0, (evUSD || 0) / EV_cap));
    const sr = Math.min(1, Math.max(0, successRate || 0));
    const latNorm = Math.max(0, 1 - Math.min(1, (latencyMs || 0) / 2000));
    const slipEMA = Math.min(1, Math.max(0, this.state.slippageEMA));
    const U = m.w1 * EV_norm + m.w2 * sr + m.w3 * latNorm - m.w4 * slipEMA;
    return Math.max(0, Math.min(1, U));
  }
  async sense(bwaeziAddr) {
    const comp = await this.oracle.compositeAdvanced(bwaeziAddr);
    const fork = await this.quorum.forkCheck();
    const entropySample = Number(ethers.keccak256(ethers.toUtf8Bytes(String(Date.now()))).slice(2, 10)) / 0xFFFFFFFF;
    this.state.entropyEMA = this.state.entropyEMA * 0.9 + entropySample * 0.1;

    const provider = this.oracle.provider;
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], provider);
    const poolUSDC = await factory.getPool(LIVE.TOKENS.BWAEZI, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT);
    const poolWETH = await factory.getPool(LIVE.TOKENS.BWAEZI, LIVE.TOKENS.WETH, 3000);

    let L_USDC = 0, L_WETH = 0;
    try {
      if (poolUSDC && poolUSDC !== ethers.ZeroAddress) {
        const poolC = new ethers.Contract(poolUSDC, ['function liquidity() view returns (uint128)'], provider);
        L_USDC = Number((await poolC.liquidity()).toString());
      }
      if (poolWETH && poolWETH !== ethers.ZeroAddress) {
        const poolC = new ethers.Contract(poolWETH, ['function liquidity() view returns (uint128)'], provider);
        L_WETH = Number((await poolC.liquidity()).toString());
      }
    } catch {}

    const base = this.manifest.liquidityBaseline || 1e9;
    const L_usdc_norm = Math.min(1, L_USDC / base);
    const L_weth_norm = Math.min(1, L_WETH / base);
    const L = this.manifest.liquidityWeights.wUSDC * L_usdc_norm + this.manifest.liquidityWeights.wWETH * L_weth_norm;

    const d = comp.dispersionPct || 0;
    this.state.dispersionEMA = this.state.dispersionEMA * 0.8 + d * 0.2;

    const signals = {
      priceUSD: comp.priceUSD,
      confidence: comp.confidence,
      dispersionPct: d,
      dispersionEMA: this.state.dispersionEMA,
      fork,
      liquidityNorm: L,
      entropyEMA: this.state.entropyEMA
    };
    this.state.lastSignals = signals;
    return signals;
  }
  decide(signals, pegUSD) {
    const { priceUSD, confidence, dispersionPct, dispersionEMA, fork, liquidityNorm } = signals;
    const gates = this.manifest.gates;
    if (fork.diverged) return { action: 'NOOP', reason: 'fork_divergence' };
    if (confidence < gates.confidenceMin) return { action: 'NOOP', reason: 'low_confidence' };
    if (dispersionPct > gates.dispersionMaxPct) return { action: 'NOOP', reason: 'high_dispersion' };

    const devPct = ((priceUSD - pegUSD) / pegUSD) * 100;
    if (Math.abs(devPct) < gates.bandPctMin) return { action: 'NOOP', reason: 'inside_band' };

    const buy = priceUSD < pegUSD;
    const a1 = this.manifest.sizing.a1Dev, a2 = this.manifest.sizing.a2Liq, a3 = this.manifest.sizing.a3Vol;
    const volNorm = dispersionEMA / this.manifest.gates.dispersionMaxPct;
    const baseScale = Math.max(0, Math.min(1, a1 * Math.abs(devPct) / 10 + a2 * liquidityNorm - a3 * volNorm));
    const sized = baseScale * this.manifest.caps.NmaxUSD;
    const notional = Math.max(this.manifest.caps.NminUSD, Math.min(this.manifest.caps.NmaxUSD, sized));

    return { action: buy ? 'BUY_BWAEZI' : 'SELL_BWAEZI', usdNotional: Math.round(notional), deviationPct: devPct, liquidityNorm };
  }
}

class PolicyGovernor {
  constructor(kernel, strategy, evProxy, maker, pegUSD, healthGuard) {
    this.kernel = kernel;
    this.strategy = strategy;
    this.ev = evProxy;
    this.maker = maker;
    this.pegUSD = pegUSD;
    this.usage = { minuteUSD: 0, hourUSD: 0, dayUSD: 0, tsMinute: Date.now(), tsHour: Date.now(), tsDay: Date.now() };
    this.lastDecisionPacket = null;
    this.health = healthGuard;
  }
  _resetWindows() {
    const now = Date.now();
    if (now - this.usage.tsMinute >= 60_000) { this.usage.minuteUSD = 0; this.usage.tsMinute = now; }
    if (now - this.usage.tsHour >= 3_600_000) { this.usage.hourUSD = 0; this.usage.tsHour = now; }
    if (now - this.usage.tsDay >= 86_400_000) { this.usage.dayUSD = 0; this.usage.tsDay = now; }
  }
  _withinCaps(usd) {
    const caps = this.kernel.manifest.caps;
    this._resetWindows();
    return (this.usage.minuteUSD + usd) <= caps.perMinuteUSD &&
           (this.usage.hourUSD + usd) <= caps.perHourUSD &&
           (this.usage.dayUSD + usd) <= (caps.perDayUSD || 5_000_000);
  }
  async run(core) {
    const signals = await this.kernel.sense(LIVE.TOKENS.BWAEZI);

    // adaptive market stress halt
    const feeData = await chainRegistry.getFeeData();
    const gasGwei = Number(ethers.formatUnits(feeData?.maxFeePerGas || ethers.parseUnits('30','gwei'), 'gwei'));
    if (this.health.marketStressHalt(signals.dispersionPct || 0, signals.liquidityNorm || 0, gasGwei)) {
      return { skipped: true, reason: 'market_stress_halt', signals };
    }

    const decision = this.kernel.decide(signals, this.pegUSD);
    if (decision.action === 'NOOP') return { skipped: true, reason: decision.reason, signals };

    // adaptive downsizing under stress
    decision.usdNotional = this.health.adaptiveDownsize(decision.usdNotional, signals.liquidityNorm || 0, gasGwei);

    if (!this._withinCaps(decision.usdNotional)) return { skipped: true, reason: 'rate_cap', usd: decision.usdNotional, signals };
    const res = await this.ev.rebalanceIfEV(decision.action === 'BUY_BWAEZI', decision.usdNotional);
    if (res.skipped) return { skipped: true, reason: res.reason, ev: res, signals, decision };

    this.usage.minuteUSD += decision.usdNotional;
    this.usage.hourUSD += decision.usdNotional;
    this.usage.dayUSD += decision.usdNotional;
    const packet = {
      policyHash: this.kernel.policyHash,
      action: decision.action,
      usdNotional: decision.usdNotional,
      signals,
      ev: { evUSD: res.evUSD, gasUSD: res.gasUSD, slipUSD: res.slipUSD },
      ts: Date.now()
    };
    this.lastDecisionPacket = packet;
    return { executed: true, packet };
  }
}

/* =========================================================================
   Perception accumulator (Merkle)
   ========================================================================= */

class PerceptionAccumulator {
  constructor() { this.events = []; this.merkleRoot = null; }
  addEvent(evt) {
    this.events.push(evt);
    const cutoff = Date.now() - LIVE.PERCEPTION.DECAY_MS;
    this.events = this.events.filter(e => e.ts >= cutoff);
    this.merkleRoot = this.computeMerkle();
  }
  computeMerkle() {
    if (this.events.length === 0) return ethers.ZeroHash;
    let layer = this.events.map(e => e.hash);
    while (layer.length > 1) {
      const next = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left = layer[i];
        const right = layer[i+1] || left;
        next.push(ethers.keccak256(ethers.concat([left, right])));
      }
      layer = next;
    }
    return layer[0];
  }
  getPerceptionIndex() {
    const localCount = this.events.filter(e => e.source === 'local').length;
    const l2Count = this.events.filter(e => e.source === 'l2').length;
    const l1Count = this.events.filter(e => e.source === 'l1').length;
    const weighted = LIVE.PERCEPTION.LOCAL_WEIGHT * localCount
      + LIVE.PERCEPTION.L2_WEIGHT * l2Count
      + LIVE.PERCEPTION.L1_WEIGHT * l1Count;
    return Math.log1p(Math.max(0, weighted));
  }
}

/* =========================================================================
   Staked governance registry
   ========================================================================= */

class StakedGovernanceRegistry {
  constructor(provider, signer) {
    this.provider = provider;
    this.signer = signer;
    this.stakes = new Map();
  }
  _ensure(addr) {
    const k = ethers.getAddress(addr);
    if (!this.stakes.has(k)) this.stakes.set(k, { amount: 0n, score: 0, lastPacketTs: 0, minuteWindowCount: 0, minuteWindowStart: 0 });
    return this.stakes.get(k);
  }
  async stake(address, amountBWAEZI) {
    const s = this._ensure(address);
    s.amount += amountBWAEZI;
    this.stakes.set(ethers.getAddress(address), s);
    return { staked: true, newAmount: s.amount };
  }
  canSubmit(address) {
    const s = this._ensure(address);
    if (s.amount < LIVE.GOVERNANCE.MIN_STAKE_BWAEZI) return { ok: false, reason: 'min_stake' };
    const now = Date.now();
    if (now - s.minuteWindowStart >= 60_000) { s.minuteWindowStart = now; s.minuteWindowCount = 0; }
    if (s.minuteWindowCount >= LIVE.GOVERNANCE.MAX_PACKETS_PER_MINUTE) return { ok: false, reason: 'rate_limit' };
    s.minuteWindowCount += 1;
    this.stakes.set(ethers.getAddress(address), s);
    return { ok: true };
  }
  reward(address, deltaScore) {
    const s = this._ensure(address);
    s.score += deltaScore;
    this.stakes.set(ethers.getAddress(address), s);
    return s.score;
  }
  slash(address, reason) {
    const s = this._ensure(address);
    const penalty = ethers.parseEther('10');
    s.amount = s.amount > penalty ? s.amount - penalty : 0n;
    s.score -= 5;
    this.stakes.set(ethers.getAddress(address), s);
    return { slashed: true, reason, remaining: s.amount, score: s.score };
  }
  get(address) {
    return this.stakes.get(ethers.getAddress(address)) || { amount: 0n, score: 0, lastPacketTs: 0 };
  }
}

/* =========================================================================
   MEV recapture engine (defensive-first, regulatory-aware)
   ========================================================================= */

class MEVRecaptureEngine {
  constructor(aaMev, dexRegistry, provider, compliance) {
    this.mev = aaMev;
    this.dexRegistry = dexRegistry;
    this.provider = provider;
    this.compliance = compliance;
  }
  async detectSandwichRisk(tokenIn, tokenOut, amountIn) {
    try {
      const best = await this.dexRegistry.getBestQuote(tokenIn, tokenOut, amountIn);
      const liq = Number(best?.best?.liquidity || 0);
      const pi = Number(best?.best?.priceImpact || 0);
      return (pi > 1.5 && liq < 5e8);
    } catch { return false; }
  }
  // Defensive split execution; randomized minor splits to avoid arms race predictability
  async splitAndExecute({ tokenIn, tokenOut, amountIn, recipient }) {
    const routes = LIVE.REFLEXIVE.SPLIT_ROUTES.slice();
    const baseParts = [0.4, 0.3, 0.3];
    const parts = LIVE.RISK.COMPETITION.RANDOMIZE_SPLITS
      ? baseParts.map(p => Math.max(0.2, Math.min(0.6, p + (Math.random()-0.5)*0.1)))
      : baseParts;
    const sumParts = parts.reduce((a,b)=>a+b,0);
    const normParts = parts.map(p => p/sumParts);

    const txs = [];
    for (let i = 0; i < routes.length; i++) {
      const adapter = this.dexRegistry.getAdapter(routes[i]);
      const partIn = BigInt(Math.floor(Number(amountIn)*normParts[i]));
      const quote = await adapter.getQuote(tokenIn, tokenOut, partIn);
      if (!quote?.amountOut) continue;
      const slip = 0.004 + Math.random()*0.006;
      const minOut = BigInt(Math.floor(Number(quote.amountOut)*(1-slip)));
      const calldata = await adapter.buildSwapCalldata({ tokenIn, tokenOut, amountIn: partIn, amountOutMin: minOut, recipient });
      const execCalldata = this.mev.buildSCWExecute(LIVE.DEXES[routes[i]].router, calldata);

      // Priority fee cap
      const sendRes = this.mev.sendCall(execCalldata, { description: `split_exec_${routes[i]}` });
      txs.push(sendRes);

      const jitter = 200 + Math.floor(Math.random()*800);
      await new Promise(r => setTimeout(r, jitter));
    }
    const results = [];
    for (const t of txs) { try { results.push(await t); } catch {} }
    return results;
  }
  async backrunCover({ tokenIn, tokenOut, amountIn }) {
    if (this.compliance.sandwichDisabled() && this.compliance.isDefensiveOnly() === false) {
      // in standard mode, we still do defensive cover only (not aggressive)
    }
    const adapter = this.dexRegistry.getAdapter('UNISWAP_V3');
    const microIn = amountIn / 10n;
    const q = await adapter.getQuote(tokenOut, tokenIn, microIn);
    if (!q?.amountOut) return null;
    const minOut = BigInt(Math.floor(Number(q.amountOut)*0.992));
    const calldata = await adapter.buildSwapCalldata({ tokenIn: tokenOut, tokenOut: tokenIn, amountIn: microIn, amountOutMin: minOut, recipient: LIVE.SCW_ADDRESS });
    const execCalldata = this.mev.buildSCWExecute(LIVE.DEXES.UNISWAP_V3.router, calldata);
    return await this.mev.sendCall(execCalldata, { description: 'backrun_cover' });
  }
}

/* =========================================================================
   Reflexive amplifier
   ========================================================================= */

class ReflexiveAmplifier {
  constructor(kernel, provider, oracle, dexRegistry, verifier, aaMev, accumulator) {
    this.kernel = kernel;
    this.provider = provider;
    this.oracle = oracle;
    this.dexRegistry = dexRegistry;
    this.verifier = verifier;
    this.aaMev = aaMev;
    this.accumulator = accumulator;

    this.state = {
      P_t: 0, L_t: 0, V_t: 0, S_t: 0,
      N_t: 1, R_t: 0.1, U_t: 0.5, C_t: 0.5, D_t: 0.01,
      lastAmplificationBlock: 0,
      dailyAmplifications: 0,
      lastReset: Date.now(),
      hysteresisSamples: []
    };
    this.constants = { K: 1.0, beta: 2.2, alpha: 2.0, gamma: 0.8, delta: 1.0 };
    this.threshold = LIVE.REFLEXIVE.AMPLIFICATION_THRESHOLD;
  }

  async updateState() {
    const signals = await this.kernel.sense(LIVE.TOKENS.BWAEZI);
    this.state.P_t = signals.priceUSD;
    this.state.C_t = signals.confidence;
    this.state.D_t = (signals.dispersionPct || 0) / 100;

    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const pools = [
      await factory.getPool(LIVE.TOKENS.BWAEZI, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT),
      await factory.getPool(LIVE.TOKENS.BWAEZI, LIVE.TOKENS.WETH, 3000)
    ];
    let tot = 0;
    for (const p of pools) {
      if (!p || p === ethers.ZeroAddress) continue;
      const pc = new ethers.Contract(p, ['function liquidity() view returns (uint128)'], this.provider);
      const liq = await pc.liquidity();
      tot += Number(liq);
    }
    this.state.L_t = Math.min(1.0, tot / 1e9);

    const recents = this.verifier.getRecentDecisionPackets(1000);
    const dayAgo = Date.now() - 86_400_000;
    const v = recents.filter(t => (t.ts || t.at) >= dayAgo && (t.ev?.evUSD || 0) > 0)
      .reduce((s,t)=> s + (t.usdNotional || 0), 0);
    this.state.V_t = v;

    try {
      const c = new ethers.Contract(LIVE.TOKENS.BWAEZI, ['function totalSupply() view returns (uint256)','function balanceOf(address) view returns (uint256)'], this.provider);
      const ts = await c.totalSupply();
      const scw = await c.balanceOf(LIVE.SCW_ADDRESS);
      const owner = await c.balanceOf(LIVE.EOA_OWNER_ADDRESS);
      const circ = ts - scw - owner;
      this.state.S_t = Math.max(1, Number(ethers.formatEther(circ)));
    } catch { this.state.S_t = 1; }

    const uniq = new Set(recents.map(t => t.signatureAddress).filter(Boolean));
    this.state.N_t = 1 + Math.floor(Math.log1p(uniq.size || (this.state.V_t/1000)));

    const evs = recents.map(t => t.ev?.evUSD || 0).filter(x=>x>0);
    const avgEV = evs.length? evs.reduce((a,b)=>a+b,0)/evs.length : 0;
    const EV_norm = Math.min(1, avgEV/500);
    const successRate = recents.filter(t => (t.ev?.evUSD||0)>0).length / Math.max(1, recents.length);
    const latNorm = 0.8;
    const slipEMA = this.kernel.state?.slippageEMA || 0.003;
    const w = { w1:0.45,w2:0.25,w3:0.20,w4:0.10 };
    const U = w.w1*EV_norm + w.w2*successRate + w.w3*latNorm - w.w4*slipEMA;
    this.state.U_t = Math.max(0, Math.min(1, U));

    this.state.R_t = this.accumulator.getPerceptionIndex();

    if (Date.now() - this.state.lastReset >= 86_400_000) {
      this.state.dailyAmplifications = 0;
      this.state.lastReset = Date.now();
    }
    return this.state;
  }

  amplificationNow() {
    const term1 = (this.state.L_t * this.state.V_t) / Math.max(1, this.state.S_t);
    const term2 = Math.exp(this.constants.beta * this.state.U_t);
    const term3 = Math.pow(this.state.N_t, this.constants.alpha);
    const term4 = Math.exp(this.constants.gamma * this.state.R_t);
    const term5 = this.state.C_t;
    const term6 = Math.exp(-this.constants.delta * this.state.D_t);
    return this.constants.K * term1 * term2 * term3 * term4 * term5 * term6;
  }

  async checkAndTrigger(recaptureEngine) {
    await this.updateState();
    const amp = this.amplificationNow();

    const now = Date.now();
    this.state.hysteresisSamples.push({ amp, ts: now });
    const windowStart = now - LIVE.REFLEXIVE.HYSTERESIS_WINDOW_MS;
    this.state.hysteresisSamples = this.state.hysteresisSamples.filter(s => s.ts >= windowStart);
    const sustained = this.state.hysteresisSamples.every(s => s.amp > this.threshold);

    const currentBlock = await this.provider.getBlockNumber();
    if (currentBlock - (this.state.lastAmplificationBlock||0) < LIVE.REFLEXIVE.COOLDOWN_BLOCKS) {
      return { triggered:false, reason:'cooldown', amp };
    }
    if (this.state.dailyAmplifications >= LIVE.REFLEXIVE.MAX_DAILY_AMPLIFICATIONS) {
      return { triggered:false, reason:'daily_limit', amp };
    }
    if (!sustained) return { triggered:false, reason:'not_sustained', amp };

    const jitterMs = LIVE.REFLEXIVE.JITTER_MS_MIN + Math.floor(Math.random()*(LIVE.REFLEXIVE.JITTER_MS_MAX - LIVE.REFLEXIVE.JITTER_MS_MIN));
    await new Promise(r => setTimeout(r, jitterMs));

    const usd = Math.min(50000, Math.max(5000, amp*1500));
    const amountInUSDC = ethers.parseUnits(String(Math.floor(usd)), 6);
    const sandwichRisk = await recaptureEngine.detectSandwichRisk(LIVE.TOKENS.USDC, LIVE.TOKENS.BWAEZI, amountInUSDC);
    if (sandwichRisk) {
      const extra = 500 + Math.floor(Math.random()*1500);
      await new Promise(r => setTimeout(r, extra));
    }
    const results = await recaptureEngine.splitAndExecute({
      tokenIn: LIVE.TOKENS.USDC,
      tokenOut: LIVE.TOKENS.BWAEZI,
      amountIn: amountInUSDC,
      recipient: LIVE.SCW_ADDRESS
    });
    const cover = await recaptureEngine.backrunCover({ tokenIn: LIVE.TOKENS.USDC, tokenOut: LIVE.TOKENS.BWAEZI, amountIn: amountInUSDC });

    const packet = {
      type: 'reflexive_amplification',
      amp, usdNotional: usd, splitExec: results.map(r=>r.txHash),
      coverTx: cover?.txHash || null,
      ts: Date.now()
    };
    const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(packet)));
    this.accumulator.addEvent({ hash, evUSD: usd, ts: Date.now(), source: 'local', confidence: this.state.C_t });

    this.state.lastAmplificationBlock = await this.provider.getBlockNumber();
    this.state.dailyAmplifications += 1;
    return { triggered:true, packet, amp };
  }

  getEquationState() {
    return { ...this.state, constants: this.constants, lastUpdated: Date.now() };
  }
}

/* =========================================================================
   Quorum RPC
   ========================================================================= */

class QuorumRPC {
  constructor(registry, quorumSize = LIVE.RISK.INFRA.QUORUM_SIZE || 3, toleranceBlocks = 2) {
    this.registry = registry;
    this.quorumSize = Math.max(1, quorumSize);
    this.toleranceBlocks = toleranceBlocks;
    this.providers = registry._patched? registry._patched._enhancedManager.rpcUrls.slice(0, quorumSize).map(url => new ethers.JsonRpcProvider(new ethers.FetchRequest(url), { chainId: 1, name: 'mainnet' }))
                                     : registry.rpcUrls.slice(0, quorumSize).map(url => new ethers.JsonRpcProvider(url, 1));
    this.lastForkAlert = null;
    this.health = [];
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

/* =========================================================================
   Production core v13.9
   ========================================================================= */

class ProductionSovereignCore extends EventEmitter {
  constructor(){
    super();
    this.provider=null; this.signer=null; this.aa=null;
    this.dexRegistry=null; this.entropy=null; this.maker=null; this.oracle=null;
    this.mev=null; this.verifier=null; this.strategy=null; this.feeFarmer=null;

    this.kernel=null; this.governor=null; this.policyHash=null; this.lastDecision=null;

    this.recapture=null; this.accumulator=new PerceptionAccumulator();
    this.stakeGov=null; this.amplifier=null;

    this.compliance=new ComplianceManager(LIVE.RISK.COMPLIANCE);
    this.health=new HealthGuard();

    this.wss=null; this.clients=new Set();

    this.stats={
      startTs:Date.now(),
      tradesExecuted:0,
      totalRevenueUSD:0,
      currentDayUSD:0,
      lastProfitUSD:0,
      pegActions:0,
      streamsActive:0,
      amplificationsTriggered:0,
      perceptionsAnchored:0
    };

    this.status='INIT'; this.loops=[];
  }

  async initialize() {
    console.log(`🚀 SOVEREIGN FINALITY ENGINE ${LIVE.VERSION} — BOOTING`);
    await chainRegistry.init();
    this.provider = chainRegistry.getProvider();
    this.signer = new ethers.Wallet(process.env.SOVEREIGN_PRIVATE_KEY, this.provider);

    // Self-hosted AA bound to v0.7 EP under the hood (keeps dual EP logic for bootstrap)
    const aa = new AASDK_SelfHosted(this.signer, LIVE.ENTRY_POINT_V07);
    await aa.initialize(this.provider, LIVE.SCW_ADDRESS);
    chainRegistry._patched.setSelfHostedInfrastructure(aa.selfBundler, aa.selfPaymaster);
    this.aa = aa;

    // Legacy minimal bootstrap (deposit+approval)
    try { await bootstrapSCWForPaymaster({ signer:this.signer, createUserOp: aa.createUserOp.bind(aa), signUserOp: aa.signUserOp.bind(aa), sendUserOpWithBackoff: aa.sendUserOpWithBackoff.bind(aa) }); } catch(e){ console.warn('Bootstrap AA fallback skipped:', e.message); }
    try { await bootstrapSCWForPaymasterEnhanced(this.aa, this.provider, this.signer, LIVE.SCW_ADDRESS); } catch(e){ /* optional enhanced path */ }

    // Core adapters
    this.dexRegistry = new DexAdapterRegistry(this.provider);
    this.oracle = new MultiAnchorOracle(this.provider, this.dexRegistry);
    this.entropy = new EntropyShockDetector();
    this.mev = new MevExecutorSelfHosted(this.aa, LIVE.SCW_ADDRESS);
    this.verifier = new ProfitVerifier(this.provider);
    this.strategy = new StrategyEngine(this.mev, this.verifier, this.provider, this.dexRegistry, this.entropy, { listStreams(){return[];} }, this.oracle);
    this.feeFarmer = new FeeFarmer(this.provider, this.signer);

    // v13.6 kernel + governor (risk-aware)
    const quorum = new QuorumRPC(chainRegistry, LIVE.RISK.INFRA.QUORUM_SIZE || 3, 2);
    const advancedOracle = new AdvancedOracle(this.provider, this.dexRegistry);
    const evProxy = new EVGatingStrategyProxy(this.strategy, this.dexRegistry, this.verifier, this.provider, this.health, this.compliance);
    this.kernel = new ConsciousnessKernel({ oracle: advancedOracle, dexRegistry: this.dexRegistry, quorum, evProxy, manifest: V13_6_MANIFEST });
    this.policyHash = this.kernel.sealPolicy(V13_6_MANIFEST);
    this.governor = new PolicyGovernor(this.kernel, this.strategy, evProxy, { listStreams(){return[];} }, LIVE.PEG.TARGET_USD, this.health);
    console.log('Policy sealed:', this.policyHash);

    // MEV recapture + amplifier (defensive-aware)
    this.recapture = new MEVRecaptureEngine(this.mev, this.dexRegistry, this.provider, this.compliance);
    this.amplifier = new ReflexiveAmplifier(this.kernel, this.provider, this.oracle, this.dexRegistry, this.verifier, this.mev, this.accumulator);

    // Start peg watcher
    await this.strategy.watchPeg();

    // Maker periodic adjust (optional)
    this.loops.push(setInterval(async () => {
      try {
        const adj = await (new AdaptiveRangeMaker(this.provider, this.signer, this.dexRegistry, this.entropy)).periodicAdjustRange(LIVE.TOKENS.BWAEZI);
        if (adj?.adjusted) {
          this.stats.streamsActive = (this.strategy.maker?.listStreams?.().length || 0);
          console.log(`Range adjusted tick=${adj.tick} width=[${adj.tickLower},${adj.tickUpper}] coherence=${adj.coherence?.toFixed?.(2) || 'n/a'} stream=${adj.streamId}`);
        }
      } catch (e) { console.warn('maker adjust error:', e.message); }
    }, LIVE.MAKER.RANGE_ADJUST_INTERVAL_MS));

    // Decision loop (15s)
    this.loops.push(setInterval(async () => {
      try {
        const result = await this.governor.run(this);
        if (result?.executed) {
          this.stats.tradesExecuted += 1;
          this.stats.pegActions += 1;
          this.stats.lastProfitUSD = result.packet?.ev?.evUSD || 0;
          this.lastDecision = result.packet;

          // Anchor decision packet on-chain via calldata (quick proof)
          const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(result.packet)));
          const tx = await this.signer.sendTransaction({ to: this.signer.address, data: `0x${hash.slice(2,10)}`, value: 0 });
          await tx.wait();
          this.accumulator.addEvent({ hash, evUSD: result.packet.ev?.evUSD || 0, ts: Date.now(), source: 'l1', confidence: 0.9 });
          this.stats.perceptionsAnchored += 1;

          this.broadcast({ type:'decision', packet: result.packet, eq: this.amplifier.getEquationState() });
        }
      } catch (e) {
        console.warn('governor error:', e.message);
      }
    }, 15_000));

    // Amplifier loop (20s)
    this.loops.push(setInterval(async () => {
      try {
        const result = await this.amplifier.checkAndTrigger(this.recapture);
        if (result.triggered) {
          this.stats.amplificationsTriggered += 1;

          const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(result.packet)));
          const tx = await this.signer.sendTransaction({ to: this.signer.address, data: `0x${hash.slice(2,10)}`, value: 0 });
          const rec = await tx.wait();

          this.accumulator.addEvent({ hash, evUSD: result.packet.usdNotional, ts: Date.now(), source: 'l1', confidence: 0.9 });
          this.stats.perceptionsAnchored += 1;

          this.broadcast({ type:'amplification', packet: result.packet, txHash: rec.transactionHash, eq: this.amplifier.getEquationState() });
        }
      } catch (e) { console.warn('Amplifier loop error:', e.message); }
    }, 20_000));

    this.startWS();
    this.status='SOVEREIGN_LIVE_V13_9';
    console.log('✅ SOVEREIGN FINALITY ENGINE v13.9 — ONLINE');
    console.log(`   Policy Hash: ${this.policyHash}`);
  }

  startWS(port=8082) {
    this.wss = new WebSocket.Server({ port });
    this.wss.on('connection', ws => {
      this.clients.add(ws);
      ws.send(JSON.stringify({ type:'init', version: LIVE.VERSION, status: this.status, ts: Date.now() }));
      ws.on('close', () => this.clients.delete(ws));
    });
    console.log(`🔌 WebSocket server on :${port}`);
  }
  broadcast(message) {
    const s = JSON.stringify({ ...message, ts: Date.now() });
    for (const c of this.clients) { if (c.readyState === WebSocket.OPEN) c.send(s); }
  }

  getStats(){
    const hours=Math.max(0.01, (Date.now()-this.stats.startTs)/3600000);
    const projectedDaily=(this.stats.currentDayUSD/hours)*24;
    const eq = this.amplifier.getEquationState();
    return {
      system:{ status:this.status, version:LIVE.VERSION, policyHash: this.policyHash, uptimeMs: Date.now()-this.stats.startTs },
      trading:{ tradesExecuted:this.stats.tradesExecuted, totalRevenueUSD:this.stats.totalRevenueUSD, currentDayUSD:this.stats.currentDayUSD, projectedDaily, lastProfitUSD: this.stats.lastProfitUSD },
      peg:{ actions:this.stats.pegActions, targetUSD:LIVE.PEG.TARGET_USD },
      maker:{ streamsActive:this.stats.streamsActive },
      reflexive:{ amplificationsTriggered:this.stats.amplificationsTriggered, perceptionIndex: eq.R_t, liquidityNorm: eq.L_t, utilityScore: eq.U_t },
      accumulator:{ merkleRoot: this.accumulator.merkleRoot },
      risk:{ circuitBreakers: LIVE.RISK.CIRCUIT_BREAKERS, complianceMode: LIVE.RISK.COMPLIANCE.MODE }
    };
  }
}

/* =========================================================================
   API servers
   ========================================================================= */

class APIServer {
  constructor(core, port=8081){ this.core=core; this.port=port; this.app=express(); this.server=null; this.routes(); }
  routes(){
    this.app.get('/', (req,res)=> {
      const s=this.core.getStats();
      res.send(`
        <h1>SOVEREIGN FINALITY ENGINE ${LIVE.VERSION}</h1>
        <p>Status: ${s.system.status}</p>
        <p>Policy: ${s.system.policyHash || 'none'}</p>
        <p>Perception Index: ${(s.reflexive.perceptionIndex||0).toFixed(3)}</p>
        <p>Amplifications: ${s.reflexive.amplificationsTriggered}</p>
        <p>Streams Active: ${s.maker.streamsActive}</p>
        <p>Compliance Mode: ${s.risk.complianceMode}</p>
        <meta http-equiv="refresh" content="10">
      `);
    });
    this.app.get('/status', (req,res)=> res.json(this.core.getStats()));
    this.app.get('/anchors/composite', async (req,res)=> { try { const r=await this.core.oracle.getCompositePriceUSD(LIVE.TOKENS.BWAEZI); res.json({ priceUSD:r.price, confidence:r.confidence, components:r.components, ts:Date.now() }); } catch(e){ res.status(500).json({ error:e.message }); } });
    this.app.get('/trades/recent', (req,res)=> res.json({ decisions:this.core.verifier.getRecentDecisionPackets(100), ts:Date.now() }));
    this.app.get('/dex/list', (req,res)=> res.json({ adapters:this.core.dexRegistry.getAllAdapters(), ts:Date.now() }));
    this.app.get('/dex/health', async (req,res)=> { try { const health = await this.core.dexRegistry.healthCheck(LIVE.TOKENS.WETH, LIVE.TOKENS.USDC, ethers.parseEther('0.01')); res.json({ ...health, ts: Date.now() }); } catch (e) { res.status(500).json({ error: e.message }); } });
    this.app.get('/dex/scores', (req,res)=> res.json({ scores: this.core.dexRegistry.getScores(), ts: Date.now() }));

    // v13.6 endpoints
    this.app.get('/v13.6/policy', (req, res) => { res.json({ policyHash: this.core.policyHash || null, manifest: V13_6_MANIFEST, ts: Date.now() }); });
    this.app.get('/v13.6/decision/last', (req, res) => { res.json({ last: this.core.lastDecision || null, ts: Date.now() }); });
    this.app.get('/v13.6/signals/last', (req, res) => { res.json({ signals: this.core.kernel?.state?.lastSignals || null, ts: Date.now() }); });

    // Equation state + accumulator + risk
    this.app.get('/v13.9/equation-state', (req,res)=> res.json({ equation: this.core.amplifier.getEquationState(), ts: Date.now() }));
    this.app.get('/v13.9/accumulator', (req,res)=> res.json({ merkleRoot: this.core.accumulator.merkleRoot, perceptionIndex: this.core.accumulator.getPerceptionIndex(), ts: Date.now() }));
    this.app.get('/v13.9/risk', (req,res)=> res.json({ risk: LIVE.RISK, ts: Date.now() }));

    // Toggle global kill switch (POST /risk/kill-switch?enabled=true|false)
    this.app.post('/risk/kill-switch', express.json(), (req,res)=> {
      const enabled = (req.query.enabled || req.body?.enabled || 'false').toString() === 'true';
      LIVE.RISK.CIRCUIT_BREAKERS.GLOBAL_KILL_SWITCH = enabled;
      res.json({ ok:true, killSwitch: enabled, ts: Date.now() });
    });
  }
  async start(){ this.server=this.app.listen(this.port, () => console.log(`🌐 API server v13.9 on :${this.port}`)); }
}

/* =========================================================================
   Bootstrap
   ========================================================================= */

async function bootstrap_v13_9() {
  console.log('🚀 SOVEREIGN FINALITY ENGINE v13.9 — BOOTSTRAPPING');
  await chainRegistry.init();

  const core = new ProductionSovereignCore();
  await core.initialize();

  const api = new APIServer(core, process.env.PORT ? Number(process.env.PORT) : 8081);
  await api.start();

  console.log('✅ v13.9 operational');
  return core;
}

// Backward-compatible default bootstrap alias
async function bootstrap() { return bootstrap_v13_9(); }

if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => { await bootstrap_v13_9(); })();
}

/* =========================================================================
   Exports
   ========================================================================= */

export {
  ProductionSovereignCore,
  APIServer,
  DexAdapterRegistry,
  UniversalDexAdapter,
  MevExecutorAA,
  ProfitVerifier,
  StrategyEngine,
  EntropyShockDetector,
  AdaptiveRangeMaker,
  FeeFarmer,
  MultiAnchorOracle,
  AdvancedOracle,
  QuorumRPC,
  ConsciousnessKernel,
  PolicyGovernor,
  EVGatingStrategyProxy,
  PerceptionAccumulator,
  StakedGovernanceRegistry,
  MEVRecaptureEngine,
  ReflexiveAmplifier,
  LIVE,
  chainRegistry,
  bootstrap_v13_9
};

export default ProductionSovereignCore;
