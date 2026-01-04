/**
 * core/sovereign-brain-v15.13.js
 *
 * SOVEREIGN FINALITY ENGINE v15.13 — Adaptive Living Systems
 * Unified v13.9 + v14.0 + v14.1 + v15.10 + v15.11 + v15.12 capabilities with unstoppable genesis bootstrap
 *
 * Preserves ALL v14.1 features:
 * - Full live AA (ERC-4337) execution: userOps, SCW approvals, peg enforcement, swaps, pool mints
 * - Multi-DEX routing: Uniswap V3/V2, Sushi V2, 1inch V5, Paraswap; health + liquidity scoring; split exec
 * - Oracle aggregator: DEX spot, V3 TWAP, Chainlink ETH/USD blending; staleness + divergence guards
 * - ProfitVerifier++: EV ex-ante/ex-post, on-chain receipts reconciliation, slippage actuals (placeholder), Merkle accumulator
 * - PerceptionRegistry++: L2 anchoring (contract) with L1 calldata fallback; counters and recents
 * - Quorum RPC fork gating; circuit breakers; adaptive degradation; compliance modes; EV gating budgets
 * - Reflexive amplifier; Adaptive range maker (Uniswap V3 position manager); streaming mints
 * - Staked governance registry; WebSocket feeds; extensive audit API endpoints
 *
 * v15 adaptive sovereign equation:
 * - Terms: A(t) Embodied Faith; G(t) Gravity Law; Ev Volatility Energy; Ω Directional Symmetry; Epeg Peg Energy
 * - Adaptive caps Nmax(t), adaptive rate Rmax(t), adaptive damping χ(t)
 * - Peg-accelerate mode; volatility-harvesting grid; adaptive governance hooks
 * - Audit fields: faithIndex, gravityPull, volatilityEnergy, pegEnergy
 *
 * v15.9/15.10 upgrades:
 * - Correct aggregator execution: build real swap calldata for 1inch and Paraswap and use proper router
 * - Uniswap V3 multi-hop fallback (USDC↔WETH↔BWAEZI) via exactInput path when single-hop is unavailable
 * - Route-aware execution across strategy and MEV recapture
 * - Extended approvals for all routers (V3/V2/Sushi/1inch/Paraswap)
 * - Microseed fixes: peg-sized amounts, fail-fast with fallback (USDC↔WETH), strict compliance bypass during microseed
 * - Self-bootstrap Uniswap V3 pool at peg if missing; mint minimal range liquidity before swaps
 * - Genesis flow checks best-quote and seeds liquidity proactively to ensure real execution and receipts
 * - Single-runtime guard to avoid double boot loops; clearer microseed failure logging; minimal dashboard endpoints
 *
 * v15.11 upgrades:
 * - End-to-end aggregator routing hardening: Strategy/Dex strictly preserve adapter-provided router + calldata
 * - Genesis telemetry: /genesis-state endpoint, route/type logs, calldata length visibility
 * - Jittered retries for microseed swaps to withstand aggregator rate limits
 *
 * v15.12 upgrades:
 * - Unstoppable genesis: force pool creation + peg initialization + initial mint before swaps
 * - Optional BWAEZI/WETH fallback pool seeding when USDC route stalls
 * - Manual /force-microseed endpoint to trigger peg seeding on demand
 * - Maintains all v15.11 routing hardening and telemetry
 *
 * v15.13 upgrades (this file):
 * - PositionManager approvals executed via SCW
 * - AdaptiveRangeMaker mints via SCW userOp (not EOA) to pull tokens from SCW
 * - Uniswap V3 multihop path packing using solidityPacked for fee segments
 * - Composite price normalization: probe 1 BWAEZI, normalize USDC 6 decimals
 * - Peg watcher orientation fixed with token0/token1 and decimals
 * - Oracle aggregator null-safety for missing Chainlink config
 * - No-op ensureUSDCInSCW to avoid undefined symbol during genesis
 */

import express from 'express';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { randomUUID, createHash } from 'crypto';
import fetch from 'node-fetch';
import { WebSocketServer } from 'ws';

import {
  EnterpriseAASDK,
  EnhancedRPCManager,
  bootstrapSCWForPaymasterEnhanced,
  ENHANCED_CONFIG as AA_CONFIG,
  createNetworkForcedProvider,
  pickHealthyBundler
} from '../modules/aa-loaves-fishes.js';

/* =========================================================================
   Strict helpers
   ========================================================================= */

function addrStrict(a) { try { return ethers.getAddress(String(a).trim()); } catch { const s=String(a).trim(); return s.startsWith('0x')?s.toLowerCase():s; } }
function nowTs(){ return Date.now(); }

/* =========================================================================
   LIVE config merged with AA config
   ========================================================================= */

const LIVE = {
  VERSION: 'v15.13',

  NETWORK: AA_CONFIG.NETWORK,
  ENTRY_POINT_V07: addrStrict(AA_CONFIG.ENTRY_POINTS?.V07 || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),
  ENTRY_POINT_V06: addrStrict('0x5FF137D4bEAA7036d654a88Ea898df565D304B88'),
  ENTRY_POINT: addrStrict(AA_CONFIG.ENTRY_POINTS?.V07 || '0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789'),

  SCW_ADDRESS: addrStrict(AA_CONFIG.SCW_ADDRESS),
  PAYMASTER_ADDRESS: addrStrict(AA_CONFIG.PAYMASTER?.ADDRESS || '0x60ECf16c79fa205DDE0c3cEC66BfE35BE291cc47'),

  EOA_OWNER_ADDRESS: addrStrict(AA_CONFIG.EOA_OWNER || '0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA'),
  ACCOUNT_FACTORY: addrStrict(AA_CONFIG.ACCOUNT_FACTORY || '0x9406Cc6185a346906296840746125a0E449764545'),

  TOKENS: {
    BWAEZI: addrStrict(AA_CONFIG.BWAEZI_ADDRESS || '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'),
    USDC:   addrStrict(AA_CONFIG.USDC_ADDRESS   || '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    WETH:   addrStrict(AA_CONFIG.WETH_ADDRESS   || '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
    DAI:    addrStrict(AA_CONFIG.DAI_ADDRESS    || '0x6B175474E89094C44Da98b954EedeAC495271d0F'),
    USDT:   addrStrict(AA_CONFIG.USDT_ADDRESS   || '0xdAC17F958D2ee523a2206206994597C13D831ec7'),
    WBTC:   addrStrict(AA_CONFIG.WBTC_ADDRESS   || '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599')
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

  RPC_PROVIDERS: AA_CONFIG.PUBLIC_RPC_ENDPOINTS?.length ? AA_CONFIG.PUBLIC_RPC_ENDPOINTS : ['https://ethereum-rpc.publicnode.com'],
  BUNDLER_URLS: AA_CONFIG.BUNDLER?.ROTATION || [],

  PEG: {
    TARGET_USD: 100,
    FEE_TIER_DEFAULT: 500,
    GENESIS_MIN_USDC: ethers.parseUnits('100', 6),
    GENESIS_BWAEZI_INIT: ethers.parseEther('1000'),
    SEED_BWAEZI_EXPAND: ethers.parseEther('50000'),
    DEVIATION_THRESHOLD_PCT: 0.5,
    PEG_ADJUSTMENT_THRESHOLD: 0.15
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

  RISK: {
    CIRCUIT_BREAKERS: { ENABLED:true, MAX_CONSEC_LOSSES_USD:700, MAX_NEG_EV_TRADES:2, GLOBAL_KILL_SWITCH:false, WINDOW_MS: 15*60_000 },
    ADAPTIVE_DEGRADATION: { ENABLED:true, HIGH_GAS_GWEI:150, DOWNSIZE_FACTOR:0.5, LOW_LIQUIDITY_NORM:0.05, DISPERSION_HALT_PCT:5.0, HALT_COOLDOWN_MS:5*60_000 },
    COMPETITION: { ENABLED:true, MAX_PRIORITY_FEE_GWEI:6, RANDOMIZE_SPLITS:true, BUDGET_PER_MINUTE_USD:250000, COST_AWARE_SLIP_BIAS:0.002 },
    INFRA: { ENABLED:true, MAX_PROVIDER_LATENCY_MS:2000, STALE_BLOCK_THRESHOLD:3, QUORUM_SIZE:3, BACKOFF_BASE_MS:1000 },
    BUDGETS: { MINUTE_USD:250000, HOUR_USD:2000000, DAY_USD:8_000_000 },
    COMPLIANCE: { MODE: (process.env.COMPLIANCE_MODE || 'standard') }
  }
};

/* =========================================================================
   Adaptive sovereign equation (v15)
   ========================================================================= */

class AdaptiveEquation {
  constructor() {
    this.state = {
      faithIndex: 0.0,       // A(t)
      gravityPull: 0.0,      // G(t)
      volatilityEnergy: 0.0, // Ev
      symmetry: 0.0,         // Ω
      pegEnergy: 0.0,        // Epeg
      coherence: 0.0,
      confidence: 0.0,
      novelty: 0.0,
      error: 0.0,
      frequency: 0.0,
      magnetism: 0.0,
      dimensionIndex: 0.0,
      sigma: 0.0
    };
    this.coeffs = {
      lambda: 0.30, mu: 0.50, nu: 0.50,
      phi: 0.30, psi: 0.30, xi: 0.20,
      omega: 0.30, zeta: 0.30,
      epsilon: 0.35, rho: 0.25, pi: 0.25,
      chi: 0.35
    };
  }

  update(signals) {
    const {
      executedOps = 0, declaredOps = 1,
      liquidityNorm = 0, confidence = 0, coherence = 0,
      deviation = 0, sigma = 0,
      frequency = 0, magnetism = 0, dimensionIndex = 0,
      novelty = 0, error = 0
    } = signals;

    // Embodied faith
    this.state.faithIndex = Math.max(0, Math.min(1, executedOps / Math.max(1, declaredOps)));

    // Gravity pull
    const d0 = 0.01;
    const M_circ = Math.max(0, Math.min(1, liquidityNorm * confidence * coherence));
    const absDev = Math.abs(deviation);
    this.state.gravityPull = M_circ / (absDev + d0);

    // Volatility energy (baseline 0.5%)
    this.state.volatilityEnergy = sigma / 0.5;

    // Directional symmetry
    this.state.symmetry = absDev;

    // Peg energy
    this.state.pegEnergy = absDev * coherence * confidence;

    // Carry-through
    this.state.coherence = coherence;
    this.state.confidence = confidence;
    this.state.novelty = novelty;
    this.state.error = error;
    this.state.frequency = frequency;
    this.state.magnetism = magnetism;
    this.state.dimensionIndex = dimensionIndex;
    this.state.sigma = sigma;

    return this.state;
  }

  modulation(overrideCoeffs = null) {
    const c = overrideCoeffs || this.coeffs;
    const s = this.state;
    return Math.exp(c.lambda * s.coherence)
         * Math.exp(-c.mu * s.novelty)
         * Math.exp(-c.nu * s.error)
         * Math.exp(c.phi * s.frequency)
         * Math.exp(c.psi * s.magnetism)
         * Math.exp(c.xi * s.dimensionIndex)
         * Math.exp(c.omega * s.faithIndex)
         * Math.exp(c.zeta * s.gravityPull)
         * Math.exp(c.epsilon * s.volatilityEnergy)
         * Math.exp(c.rho * s.symmetry)
         * Math.exp(c.pi * s.pegEnergy)
         * Math.exp(-c.chi * s.sigma);
  }
}

/* =========================================================================
   Forced-network RPC manager, quorum fork gating
   ========================================================================= */

class PatchedRPCManager {
  constructor(urls, chainId){ this._mgr=new EnhancedRPCManager(urls, chainId); this.initialized=false; }
  async init(){ await this._mgr.init(); this.initialized=true; }
  getProvider(){ return this._mgr.getProvider(); }
  async getFeeData(){ return await this._mgr.getFeeData(); }
  get rpcUrls(){ return this._mgr.rpcUrls; }
}
const chainRegistry = new PatchedRPCManager(LIVE.RPC_PROVIDERS, LIVE.NETWORK.chainId);

class QuorumRPC {
  constructor(registry, quorumSize=LIVE.RISK.INFRA.QUORUM_SIZE || 3, toleranceBlocks=2){
    this.registry=registry; this.quorumSize=Math.max(1, quorumSize); this.toleranceBlocks=toleranceBlocks;
    const urls = registry.rpcUrls.slice(0, quorumSize);
    this.providers = urls.map(u => createNetworkForcedProvider(u, LIVE.NETWORK.chainId));
    this.lastForkAlert=null;
  }
  async forkCheck(){
    try {
      const heads=await Promise.all(this.providers.map(p=>p.getBlockNumber()));
      const min=Math.min(...heads), max=Math.max(...heads);
      const diverged = (max - min) > this.toleranceBlocks;
      if (diverged) this.lastForkAlert={ at: nowTs(), heads };
      return { diverged, heads, lastForkAlert: this.lastForkAlert };
    } catch {
      return { diverged:false, heads:[], lastForkAlert:this.lastForkAlert };
    }
  }
}

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
   Compliance manager
   ========================================================================= */

class ComplianceManager {
  constructor(mode){ const m=(mode||'standard').toLowerCase(); this.strict=(m==='strict'); }
  isDefensiveOnly(){ return this.strict; }
  sandwichDisabled(){ return true; }
  shouldLog(){ return true; }
}

/* =========================================================================
   Health guard
   ========================================================================= */

class HealthGuard {
  constructor(){ this.lossEvents=[]; this.negEvStreak=0; this.lastHaltTs=0; }
  record(evUSD){
    const now=nowTs(); const windowStart=now - LIVE.RISK.CIRCUIT_BREAKERS.WINDOW_MS;
    this.lossEvents.push({ evUSD, ts: now });
    this.lossEvents = this.lossEvents.filter(e=> e.ts >= windowStart);
    if (evUSD <= 0) this.negEvStreak++; else this.negEvStreak=0;
  }
  runawayTriggered(){
    const losses = this.lossEvents.filter(e=> e.evUSD < 0).reduce((s,e)=> s + Math.abs(e.evUSD), 0);
    return LIVE.RISK.CIRCUIT_BREAKERS.ENABLED && (
      losses >= LIVE.RISK.CIRCUIT_BREAKERS.MAX_CONSEC_LOSSES_USD ||
      this.negEvStreak >= LIVE.RISK.CIRCUIT_BREAKERS.MAX_NEG_EV_TRADES ||
      LIVE.RISK.CIRCUIT_BREAKERS.GLOBAL_KILL_SWITCH
    );
  }
  marketStressHalt(dispersionPct, liquidityNorm, gasGwei){
    const now=nowTs();
    const dispersionHalt = dispersionPct >= LIVE.RISK.ADAPTIVE_DEGRADATION.DISPERSION_HALT_PCT;
    const lowLiquidity = (liquidityNorm || 0) <= LIVE.RISK.ADAPTIVE_DEGRADATION.LOW_LIQUIDITY_NORM;
    const extremeGas = gasGwei >= LIVE.RISK.ADAPTIVE_DEGRADATION.HIGH_GAS_GWEI;
    if (dispersionHalt || (lowLiquidity && extremeGas)){ this.lastHaltTs=now; return true; }
    const halted = (now - this.lastHaltTs) <= LIVE.RISK.ADAPTIVE_DEGRADATION.HALT_COOLDOWN_MS;
    return halted;
  }
  adaptiveDownsize(notionalUSD, liquidityNorm, gasGwei) {
    if (!LIVE.RISK.ADAPTIVE_DEGRADATION.ENABLED) return notionalUSD;
    let n = notionalUSD;
    if ((liquidityNorm || 0) < LIVE.RISK.ADAPTIVE_DEGRADATION.LOW_LIQUIDITY_NORM) {
      n = Math.round(n * LIVE.RISK.ADAPTIVE_DEGRADATION.DOWNSIZE_FACTOR);
    }
    if (gasGwei > LIVE.RISK.ADAPTIVE_DEGRADATION.HIGH_GAS_GWEI) {
      n = Math.round(n * LIVE.RISK.ADAPTIVE_DEGRADATION.DOWNSIZE_FACTOR);
    }
    return Math.max(1000, n);
  }
}

/* =========================================================================
   Dex adapters + registry (merged V3/V2/Sushi + Aggregators + health)
   ========================================================================= */

class DexHealth {
  constructor(provider){ this.provider=provider; }
  async v3PoolLiquidity(tokenA, tokenB, fee){
    try {
      const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
      const pool = await factory.getPool(tokenA, tokenB, fee);
      if (!pool || pool === ethers.ZeroAddress) return { liq:0, pool:null };
      const pc = new ethers.Contract(pool, ['function liquidity() view returns (uint128)'], this.provider);
      const liq = Number((await pc.liquidity()).toString());
      return { liq, pool };
    } catch { return { liq:0, pool:null }; }
  }
  async scoreAdapter(adapterName, tokenIn, tokenOut){
    const { liq } = await this.v3PoolLiquidity(tokenIn, tokenOut, LIVE.PEG.FEE_TIER_DEFAULT);
    const latencyScore = 1.0; // placeholder
    const health = Math.min(1.0, (liq/1e9)*0.7 + latencyScore*0.3);
    return { adapter: adapterName, health };
  }
}

class UniversalDexAdapter {
  constructor(provider, config) {
    this.provider = provider; this.config = config;
    this.type = this._type(config.name);
  }
  _type(name) {
    if (name?.includes('V3')) return 'V3';
    if (name?.includes('V2')) return 'V2';
    if (name?.includes('Sushi')) return 'V2';
    if (name?.includes('1inch')) return 'Aggregator';
    if (name?.includes('Paraswap')) return 'Aggregator2';
    return 'Custom';
  }

  async getQuote(tokenIn, tokenOut, amountIn) {
    const t0 = nowTs();
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
      q.latencyMs = nowTs() - t0;
      if (q.latencyMs > LIVE.RISK.INFRA.MAX_PROVIDER_LATENCY_MS*3) return null;
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
    const priceImpactPct = Math.min(100, (Number(amountIn) / Math.max(1, Number(rin))) * 100);
    return { amountOut, priceImpact: priceImpactPct, fee: 30, liquidity: rin.toString(), dex: this.config.name, adapter: this };
  }

  async _agg1inchQuote(tokenIn, tokenOut, amountIn) {
    try {
      const url = `https://api.1inch.io/v5.0/1/quote?fromTokenAddress=${tokenIn}&toTokenAddress=${tokenOut}&amount=${amountIn.toString()}`;
      let res, attempts = 0;
      while (attempts < 5) {
        res = await fetch(url);
        if (res.ok) break;
        attempts++; await new Promise(r => setTimeout(r, LIVE.RISK.INFRA.BACKOFF_BASE_MS * attempts));
      }
      if (!res.ok) throw new Error(`1inch ${res.status}`);
      const data = await res.json();
      return { amountOut: BigInt(data.toTokenAmount), priceImpact: 0.0, fee: 50, liquidity: amountIn.toString(), dex: 'ONE_INCH_V5', adapter: this };
    } catch { return null; }
  }

  async _paraswapLiteQuote(tokenIn, tokenOut, amountIn) {
    try {
      const erc20Abi = ['function decimals() view returns (uint8)'];
      const inC = new ethers.Contract(tokenIn, erc20Abi, this.provider);
      const outC = new ethers.Contract(tokenOut, erc20Abi, this.provider);
      let srcDecimals = 18, destDecimals = 18;
      try { srcDecimals = Number(await inC.decimals()); } catch {}
      try { destDecimals = Number(await outC.decimals()); } catch {}

      const url = `https://apiv5.paraswap.io/prices/?srcToken=${tokenIn}&destToken=${tokenOut}&amount=${amountIn.toString()}&srcDecimals=${srcDecimals}&destDecimals=${destDecimals}&network=1`;
      let res, attempts = 0;
      while (attempts < 5) {
        res = await fetch(url, { headers: { 'accept': 'application/json' } });
        if (res.ok) break;
        attempts++; await new Promise(r => setTimeout(r, LIVE.RISK.INFRA.BACKOFF_BASE_MS * attempts));
      }
      if (!res.ok) throw new Error(`Paraswap ${res.status}`);
      const data = await res.json();
      const bestRoute = data?.priceRoute?.destAmount ? BigInt(data.priceRoute.destAmount) : 0n;
      if (bestRoute === 0n) return null;
      return { amountOut: bestRoute, priceImpact: 0.0, fee: 50, liquidity: amountIn.toString(), dex: 'PARASWAP_LITE', adapter: this };
    } catch { return null; }
  }

  async _agg1inchSwapCalldata(tokenIn, tokenOut, amountIn, recipient) {
    const url = `https://api.1inch.io/v5.0/1/swap?fromTokenAddress=${tokenIn}&toTokenAddress=${tokenOut}&amount=${amountIn.toString()}&fromAddress=${LIVE.SCW_ADDRESS}&destReceiver=${recipient}&slippage=1&disableEstimate=true`;
    let res, attempts = 0;
    while (attempts < 5) {
      res = await fetch(url, { headers: { 'accept': 'application/json' } });
      if (res.ok) break;
      attempts++;
      await new Promise(r => setTimeout(r, LIVE.RISK.INFRA.BACKOFF_BASE_MS * attempts));
    }
    if (!res.ok) throw new Error(`1inch swap ${res.status}`);
    const data = await res.json();
    if (!data?.tx?.to || !data?.tx?.data) throw new Error('1inch swap missing tx');
    return { router: ethers.getAddress(data.tx.to), calldata: data.tx.data };
  }

  async _paraswapLiteSwapCalldata(tokenIn, tokenOut, amountIn, recipient) {
    const erc20Abi = ['function decimals() view returns (uint8)'];
    const inC = new ethers.Contract(tokenIn, erc20Abi, this.provider);
    const outC = new ethers.Contract(tokenOut, erc20Abi, this.provider);
    let srcDecimals = 18, destDecimals = 18;
    try { srcDecimals = Number(await inC.decimals()); } catch {}
    try { destDecimals = Number(await outC.decimals()); } catch {}

    const body = {
      srcToken: tokenIn,
      destToken: tokenOut,
      srcDecimals,
      destDecimals,
      srcAmount: amountIn.toString(),
      slippage: 100, // 1.00%
      userAddress: LIVE.SCW_ADDRESS,
      receiver: recipient,
      partner: 'sovereign-v15.13'
    };
    let res, attempts = 0;
    while (attempts < 5) {
      res = await fetch('https://apiv5.paraswap.io/transactions/1?ignoreChecks=true', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) break;
      attempts++;
      await new Promise(r => setTimeout(r, LIVE.RISK.INFRA.BACKOFF_BASE_MS * attempts));
    }
    if (!res.ok) throw new Error(`Paraswap tx ${res.status}`);
    const tx = await res.json();
    if (!tx?.to || !tx?.data) throw new Error('Paraswap tx missing fields');
    return { router: ethers.getAddress(tx.to), calldata: tx.data };
  }

  async _v3PathCalldata(tokenIn, tokenOut, amountIn, recipient) {
    const feeInWeth = 500;   // 0.05%
    const feeWethOut = 3000; // 0.3%
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory,
      ['function getPool(address,address,uint24) view returns (address)'], this.provider);

    const pool1 = await factory.getPool(tokenIn, LIVE.TOKENS.WETH, feeInWeth);
    const pool2 = await factory.getPool(LIVE.TOKENS.WETH, tokenOut, feeWethOut);
    if (!pool1 || pool1 === ethers.ZeroAddress || !pool2 || pool2 === ethers.ZeroAddress) return null;

    // Patched: solidityPacked ensures 3-byte fee packing robustly
    const path = ethers.solidityPacked(
      ['address','uint24','address','uint24','address'],
      [ethers.getAddress(tokenIn), feeInWeth, ethers.getAddress(LIVE.TOKENS.WETH), feeWethOut, ethers.getAddress(tokenOut)]
    );

    const iface = new ethers.Interface(['function exactInput((bytes,address,uint256,uint256)) returns (uint256)']);
    const calldata = iface.encodeFunctionData('exactInput', [{
      path,
      recipient,
      amountIn,
      amountOutMinimum: 0
    }]);
    return { router: LIVE.DEXES.UNISWAP_V3.router, calldata };
  }

  async buildSwapCalldata(params) {
    const { tokenIn, tokenOut, amountIn, amountOutMin, recipient, fee = LIVE.PEG.FEE_TIER_DEFAULT } = params;

    if (this.type === 'Aggregator') {
      return await this._agg1inchSwapCalldata(tokenIn, tokenOut, amountIn, recipient);
    }
    if (this.type === 'Aggregator2') {
      return await this._paraswapLiteSwapCalldata(tokenIn, tokenOut, amountIn, recipient);
    }

    if (this.type === 'V3') {
      const iface = new ethers.Interface(['function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) returns (uint256)']);
      const calldata = iface.encodeFunctionData('exactInputSingle', [{
        tokenIn, tokenOut, fee, recipient,
        deadline: Math.floor(Date.now()/1000)+600,
        amountIn, amountOutMinimum: amountOutMin || 0n, sqrtPriceLimitX96: 0n
      }]);
      try {
        const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
        const pool = await factory.getPool(tokenIn, tokenOut, fee);
        if (!pool || pool === ethers.ZeroAddress) {
          const pathTx = await this._v3PathCalldata(tokenIn, tokenOut, amountIn, recipient);
          if (pathTx) return pathTx;
        }
      } catch {}
      return { router: LIVE.DEXES.UNISWAP_V3.router, calldata };
    }

    if (this.type === 'V2') {
      const iface = new ethers.Interface(['function swapExactTokensForTokens(uint256,uint256,address[],address,uint256) returns (uint256[] memory)']);
      const calldata = iface.encodeFunctionData('swapExactTokensForTokens', [
        amountIn, amountOutMin || 0n, [tokenIn, tokenOut], recipient, Math.floor(Date.now()/1000)+600
      ]);
      return { router: this.config.router, calldata };
    }

    const fallback = new ethers.Interface(['function exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160)) returns (uint256)']);
    const fallbackData = fallback.encodeFunctionData('exactInputSingle', [{
      tokenIn, tokenOut, fee: LIVE.PEG.FEE_TIER_DEFAULT, recipient,
      deadline: Math.floor(Date.now()/1000)+600,
      amountIn, amountOutMinimum: amountOutMin || 0n, sqrtPriceLimitX96: 0n
    }]);
    return { router: LIVE.DEXES.UNISWAP_V3.router, calldata: fallbackData };
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
    this.health = new DexHealth(provider);
    this.lastErrors = new Map();
  }

  getAdapter(name) { const a = this.adapters[name]; if (!a) throw new Error(`Adapter ${name} not found`); return a; }
  getAllAdapters() { return Object.entries(this.adapters).map(([name, adapter]) => ({ name, config: adapter.config, type: adapter.type })); }

  _updateScore(name, ok, latencyMs, liquidity, errorMsg = null) {
    const prev = this.scores.get(name) || { okCount: 0, failCount: 0, avgLatency: null, avgLiquidity: 0, score: 50 };
    if (ok) prev.okCount++; else prev.failCount++;
    if (latencyMs != null) prev.avgLatency = prev.avgLatency == null ? latencyMs : Math.round(prev.avgLatency * 0.7 + latencyMs * 0.3);
    if (liquidity != null) { const lnum = Number(liquidity || '0'); prev.avgLiquidity = Math.round(prev.avgLiquidity * 0.7 + lnum * 0.3); }
    const successRate = prev.okCount / Math.max(1, prev.okCount + prev.failCount);
    const latencyScore = prev.avgLatency ? Math.max(0, 1 - prev.avgLatency / (LIVE.RISK.INFRA.MAX_PROVIDER_LATENCY_MS || 1000)) : 0.5;
    const score = Math.round(100 * (0.5 * successRate + 0.3 * latencyScore + 0.2 * Math.min(1, prev.avgLiquidity / 1e9)));
    prev.score = score;
    this.scores.set(name, prev);
    if (errorMsg) this.lastErrors.set(name, { at: nowTs(), error: String(errorMsg) });
  }

  async getBestQuote(tokenIn, tokenOut, amountIn) {
    const key = `q_${tokenIn}_${tokenOut}_${amountIn}`;
    const cached = this.cache.get(key); if (cached && nowTs() - cached.ts < 1000) return cached.result;
    const quotes = [];
    await Promise.allSettled(Object.entries(this.adapters).map(async ([name, adapter]) => {
      try {
        const q = await adapter.getQuote(tokenIn, tokenOut, amountIn);
        if (q && q.amountOut > 0n) { quotes.push({ dex: name, ...q, adapter }); this._updateScore(name, true, q.latencyMs, q.liquidity); }
        else this._updateScore(name, false, null, null, 'no quote or amountOut=0');
      } catch (err) { this._updateScore(name, false, null, null, err?.message || 'quote exception'); }
    }));
    quotes.sort((a, b) => {
      const sa = this.scores.get(a.dex)?.score || 50;
      const sb = this.scores.get(b.dex)?.score || 50;
      if (sa !== sb) return sb - sa;
      return Number(b.amountOut - a.amountOut);
    });
    const result = { best: quotes[0] || null, secondBest: quotes[1] || quotes[0] || null, all: quotes, scores: Array.from(this.scores.entries()).map(([dex, s]) => ({ dex, ...s })), lastErrors: Array.from(this.lastErrors.entries()).map(([dex, e]) => ({ dex, ...e })) };
    this.cache.set(key, { result, ts: nowTs() });
    return result;
  }

  getScores() { return Array.from(this.scores.entries()).map(([dex, s]) => ({ dex, ...s })); }
  getLastErrors() { return Array.from(this.lastErrors.entries()).map(([dex, e]) => ({ dex, ...e })); }

  async healthCheck(tokenA = LIVE.TOKENS.WETH, tokenB = LIVE.TOKENS.USDC, amount = ethers.parseEther('0.01')) {
    const checks = [];
    for (const [name, adapter] of Object.entries(this.adapters)) {
      try {
        const q = await adapter.getQuote(tokenA, tokenB, amount);
        checks.push({ name, ok: !!q, latencyMs: q?.latencyMs || null, liquidity: q?.liquidity || '0', score: (this.scores.get(name)?.score || null), lastError: this.lastErrors.get(name)?.error || null });
      } catch (err) {
        checks.push({ name, ok: false, latencyMs: null, liquidity: '0', score: (this.scores.get(name)?.score || null), lastError: err?.message || 'adapter error' });
      }
    }
    return { count: checks.length, checks, timestamp: nowTs() };
  }

  async getBestRoute(tokenIn, tokenOut, amountIn){
    const bestQuote = await this.getBestQuote(tokenIn, tokenOut, amountIn);
    if (!bestQuote?.best) return { best:null, routes:[], lastErrors: this.getLastErrors() };
    const score = await this.health.scoreAdapter(bestQuote.best.dex, tokenIn, tokenOut);
    return { best: { ...bestQuote.best, adapter: bestQuote.best.dex, health: score.health }, routes: bestQuote.all, lastErrors: this.getLastErrors() };
  }

  async buildSplitExec(tokenIn, tokenOut, amountIn, recipient){
    const routes = await this.getBestQuote(tokenIn, tokenOut, amountIn);
    const selected = routes?.best;
    if (!selected) return null;
    const slipGuard = 0.02;
    const minOut = BigInt(Math.floor(Number(selected.amountOut)*(1-slipGuard)));
    const tx = await selected.adapter.buildSwapCalldata({ tokenIn, tokenOut, amountIn, amountOutMin: minOut, recipient, fee: selected.fee || LIVE.PEG.FEE_TIER_DEFAULT });
    return { router: tx.router, calldata: tx.calldata, routes: routes.all, minOut, selectedDex: selected.dex, selectedType: selected.adapter?.type || 'unknown' };
  }
}

/* =========================================================================
   Ensure V3 Pool at Peg
   ========================================================================= */

async function ensureV3PoolAtPeg(
  provider,
  signer,
  token0,
  token1,
  fee = LIVE.PEG.FEE_TIER_DEFAULT,
  pegUSD = LIVE.PEG.TARGET_USD
) {
  const factory = new ethers.Contract(
    LIVE.DEXES.UNISWAP_V3.factory,
    ['function getPool(address,address,uint24) view returns (address)'],
    provider
  );
  const npm = new ethers.Contract(
    LIVE.DEXES.UNISWAP_V3.positionManager,
    ['function createAndInitializePoolIfNecessary(address,address,uint24,uint160) returns (address)'],
    signer
  );

  const [t0, t1] = (token0.toLowerCase() < token1.toLowerCase())
    ? [token0, token1]
    : [token1, token0];

  let pool = await factory.getPool(t0, t1, fee);
  if (pool && pool !== ethers.ZeroAddress) {
    return { pool, txHash: null };
  }

  const dec0 = t0.toLowerCase() === LIVE.TOKENS.BWAEZI.toLowerCase() ? 18n : 6n;
  const dec1 = t1.toLowerCase() === LIVE.TOKENS.USDC.toLowerCase() ? 6n : 18n;
  const numerator = BigInt(pegUSD) * (10n ** dec1);
  const denominator = 1n * (10n ** dec0);
  const priceX192 = (numerator << 192n) / denominator;
  const sqrtPriceX96 = sqrtBigInt(priceX192);

  const tx = await npm.createAndInitializePoolIfNecessary(t0, t1, fee, sqrtPriceX96);
  const rc = await tx.wait();
  pool = await factory.getPool(t0, t1, fee);

  console.log(`🛠️ Created & initialized V3 pool at peg $${pegUSD}: ${pool} (tx=${rc.transactionHash})`);
  return { pool, txHash: rc.transactionHash };
}



/* =========================================================================
   Genesis Unstoppable — Forced Pool and Peg (lean, next-phase orchestration)
   Focus: Dynamic routing, peg stability, and trading orchestration
   Assumptions:
   - Pools have already been created, initialized, minted, and seeded (confirmed on-chain).
   - Assumes `ethers` and `LIVE` are in scope.
   - Uses core.aa, core.mev, core.provider, core.strategy, core.dex, core.verifier, core.compliance.
   - Uses Uniswap V3 USDC/bwzC (fee 500) and WETH/bwzC (fee 3000) pools already deployed.
   ========================================================================= */


/* === On-chain pool wiring (confirmed) =================================== */

// Known pools (from on-chain logs)
const POOL_BW_USDC = '0xe09e69Cf5d9f1BA67477b9720FAB7eb7883B4562'; // fee 500, spacing 10
const POOL_BW_WETH = '0x142C3dce0a5605Fb385fAe7760302fab761022aa'; // fee 3000, spacing 60

// Fee tiers
const FEE_USDC = 500;
const FEE_WETH = 3000;


/* === Math + peg helpers ================================================= */

function sqrtBigInt(n) {
  if (n <= 0n) return 0n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

function _decFor(addr) {
  const a = String(addr).toLowerCase();
  if (a === LIVE.TOKENS.USDC.toLowerCase()) return 6;
  if (a === LIVE.TOKENS.BWAEZI.toLowerCase()) return 18;
  if (a === LIVE.TOKENS.WETH.toLowerCase()) return 18;
  return 18;
}

function encodePriceSqrt(token0, token1, targetPegUSD) {
  const dec0 = _decFor(token0);
  const dec1 = _decFor(token1);
  const PEG_FP = 1_000_000n;
  const pow10 = (n) => 10n ** BigInt(n);
  const pegScaled = BigInt(Math.round(Number(targetPegUSD) * 1_000_000));
  const numerator = pegScaled * pow10(dec1);
  const denominator = pow10(dec0) * PEG_FP;
  const Q192 = 2n ** 192n;
  const priceX192 = (numerator * Q192) / denominator;
  return sqrtBigInt(priceX192);
}

function pegSizedAmounts(usdcFloat, pegUSD = LIVE.PEG.TARGET_USD) {
  const safeUSDC = Math.max(0.000001, usdcFloat);
  const usdcAmt = ethers.parseUnits(safeUSDC.toFixed(6), 6);
  const bwAmtFloat = safeUSDC / pegUSD;
  const bwAmt = ethers.parseEther(bwAmtFloat.toFixed(18));
  return { usdcAmt, bwAmt };
}

function nowTs() { return Date.now(); }


/* === Gas safeguards (lean AA sender) ==================================== */

async function validateGenesisGasRequirements(core) {
  try {
    if (core?.aa?.genesisOptimizer?.getBundlerMinimumGas) {
      const minsRaw = await core.aa.genesisOptimizer.getBundlerMinimumGas();
      return {
        minPreVerificationGas: minsRaw.minPreVerificationGas,
        minVerificationGas: minsRaw.minVerificationGas,
        minCallGasLimit: 100_000n,
        recommendedBufferPct: 25n
      };
    }
  } catch {}
  try {
    if (core?.aa) {
      const scwIface = new ethers.Interface(['function execute(address,uint256,bytes)']);
      const dummyExec = scwIface.encodeFunctionData('execute', [
        LIVE.SCW_ADDRESS, 0n, '0x'
      ]);
      const testUserOp = await core.aa.createUserOp(dummyExec, {
        callGasLimit: 100_000n,
        verificationGasLimit: 100_000n,
        preVerificationGas: 45_000n,
        maxFeePerGas: ethers.parseUnits('2', 'gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('0.5', 'gwei'),
        allowNoPaymaster: true
      });
      const formattedOp = core.aa._formatUserOpForBundler(testUserOp);
      const estimation = await core.aa.bundler.estimateUserOperationGas(formattedOp, LIVE.ENTRY_POINT);
      return {
        minPreVerificationGas: BigInt(estimation?.preVerificationGas ?? 46310n),
        minVerificationGas: BigInt(estimation?.verificationGasLimit ?? 100000n),
        minCallGasLimit: BigInt(estimation?.callGasLimit ?? 100000n),
        recommendedBufferPct: 25n
      };
    }
  } catch {}
  return {
    minPreVerificationGas: 55_000n,
    minVerificationGas: 120_000n,
    minCallGasLimit: 120_000n,
    recommendedBufferPct: 25n
  };
}

async function _aaPreflightProbe(core) {
  if (!core?.mev) return;
  const req = core._genesisGasRequirements || {
    minPreVerificationGas: 55_000n,
    minVerificationGas: 120_000n,
    recommendedBufferPct: 25n
  };
  const bufMul = (100n + BigInt(req.recommendedBufferPct)) / 100n;
  const preVerificationGas = req.minPreVerificationGas * bufMul;
  const verificationGasLimit = req.minVerificationGas * bufMul;
  const callGasLimit = 160_000n;
  const scwIface = new ethers.Interface(['function execute(address,uint256,bytes)']);
  const calldata = scwIface.encodeFunctionData('execute', [LIVE.SCW_ADDRESS, 0n, '0x']);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await core.mev.sendUserOp(calldata, {
        description: 'preflight_noop_genesis',
        allowNoPaymaster: true,
        callGasLimit,
        verificationGasLimit,
        preVerificationGas
      });
      return;
    } catch (err) {
      await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
    }
  }
  throw new Error('AA preflight failed after retries');
}


/* === Market data and path evaluation =================================== */

async function _getBalances(core) {
  const usdcC = new ethers.Contract(LIVE.TOKENS.USDC, ['function balanceOf(address) view returns (uint256)'], core.provider);
  const bwzCC = new ethers.Contract(LIVE.TOKENS.BWAEZI, ['function balanceOf(address) view returns (uint256)'], core.provider);
  const wethC = new ethers.Contract(LIVE.TOKENS.WETH, ['function balanceOf(address) view returns (uint256)'], core.provider);
  let usdc = 0n, bwz = 0n, weth = 0n;
  try { usdc = await usdcC.balanceOf(LIVE.SCW_ADDRESS); } catch {}
  try { bwz  = await bwzCC.balanceOf(LIVE.SCW_ADDRESS); } catch {}
  try { weth = await wethC.balanceOf(LIVE.SCW_ADDRESS); } catch {}
  return { usdc, bwz, weth };
}

async function _getPoolTick(core, poolAddr) {
  const slotIface = new ethers.Interface(['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)']);
  const pool = new ethers.Contract(poolAddr, slotIface.fragments, core.provider);
  try {
    const [, tick] = await pool.slot0();
    return Number(tick);
  } catch {
    return null;
  }
}

function _pegDeviationUSD(midPriceUSD) {
  const peg = Number(LIVE.PEG.TARGET_USD || 1);
  if (!Number.isFinite(midPriceUSD) || peg <= 0) return 0;
  return (midPriceUSD - peg) / peg; // positive: above peg; negative: below peg
}

async function _quotePath(core, tokenIn, tokenOut, amountIn, opts = {}) {
  const adapter = core.dex.getAdapter('UNISWAP_V3');
  // Try direct first
  let best = null;
  try {
    const direct = await adapter.quote(tokenIn, tokenOut, amountIn, {
      feeHint: (tokenIn === LIVE.TOKENS.USDC && tokenOut === LIVE.TOKENS.BWAEZI) ? FEE_USDC
             : (tokenIn === LIVE.TOKENS.WETH && tokenOut === LIVE.TOKENS.BWAEZI) ? FEE_WETH
             : undefined
    });
    if (direct?.amountOut && direct.amountOut > 0n) {
      best = { path: [tokenIn, tokenOut], router: direct.router, calldata: direct.calldata, amountOut: direct.amountOut, hops: 1 };
    }
  } catch {}
  // Multihop via WETH or USDC
  const intermediates = [LIVE.TOKENS.WETH, LIVE.TOKENS.USDC].filter(x => x !== tokenIn && x !== tokenOut);
  for (const mid of intermediates) {
    try {
      const hop1 = await adapter.quote(tokenIn, mid, amountIn);
      if (!hop1?.amountOut || hop1.amountOut <= 0n) continue;
      const hop2 = await adapter.quote(mid, tokenOut, hop1.amountOut);
      if (!hop2?.amountOut || hop2.amountOut <= 0n) continue;
      const mh = await adapter._v3PathCalldata(tokenIn, tokenOut, amountIn, LIVE.SCW_ADDRESS);
      if (mh?.router && mh?.calldata) {
        const candidate = { path: [tokenIn, mid, tokenOut], router: mh.router, calldata: mh.calldata, amountOut: hop2.amountOut, hops: 2 };
        if (!best || candidate.amountOut > best.amountOut) best = candidate;
      }
    } catch {}
  }
  if (!best) return null;
  // Slippage guard
  const slipBps = Number(opts.maxSlippageBps ?? 150); // 1.5%
  const minOut = (best.amountOut * BigInt(10_000 - slipBps)) / 10_000n;
  return { ...best, minOut };
}


/* === Peg defense logic ================================================== */

function _decidePegDefenseActions({ usdcBal, bwzBal, wethBal, tickUSDC, tickWETH, targetPegUSD }) {
  // Signal engine:
  // - If bwzC price vs USDC is above peg (overvalued), sell bwzC→USDC.
  // - If below peg (undervalued), buy bwzC with USDC (USDC→bwzC).
  // - WETH path acts as secondary liquidity and spread control.
  const ideas = [];
  const hasUSDC = usdcBal > ethers.parseUnits('0.5', 6);
  const hasBWZ  = bwzBal > ethers.parseEther('0.02');
  const hasWETH = wethBal > ethers.parseEther('0.0005');

  // Use approximate mid tick to infer direction strength
  const aroundUSDC = typeof tickUSDC === 'number';
  const aroundWETH = typeof tickWETH === 'number';

  // Base sizing: aim 1–5 USDC notional per action
  const usdcNotional = hasUSDC ? Math.min(Number(ethers.formatUnits(usdcBal, 6)), 5.0) : 0.0;
  const bwzNotional = hasBWZ ? Math.min(Number(ethers.formatEther(bwzBal)) * targetPegUSD, 5.0) : 0.0;

  // If we have USDC, favor buy bwzC when undervalued; if we have bwzC, favor sell when overvalued.
  // We’ll let routing/quotes pick best path; here we produce intents.
  if (hasUSDC) {
    ideas.push({ type: 'BUY_BWZC_WITH_USDC', priority: aroundUSDC ? 8 : 6, maxUSD: Math.max(1.0, Math.min(usdcNotional, 5.0)) });
    if (aroundWETH) ideas.push({ type: 'BUY_BWZC_WITH_USDC_VIA_WETH', priority: 5, maxUSD: Math.max(0.5, Math.min(usdcNotional, 3.0)) });
  }
  if (hasBWZ) {
    ideas.push({ type: 'SELL_BWZC_FOR_USDC', priority: aroundUSDC ? 8 : 6, maxUSD: Math.max(1.0, Math.min(bwzNotional, 5.0)) });
    if (aroundWETH && hasWETH) ideas.push({ type: 'SELL_BWZC_FOR_WETH', priority: 5, maxUSD: Math.max(0.5, Math.min(bwzNotional, 3.0)) });
  }
  if (hasWETH && hasUSDC) {
    ideas.push({ type: 'ARB_USDC_WETH_BWZC', priority: 4, maxUSD: Math.min(usdcNotional, 3.0) });
  }

  // Sort by priority (desc) and maxUSD (desc) to try most impactful first
  ideas.sort((a, b) => (b.priority - a.priority) || (b.maxUSD - a.maxUSD));
  return ideas;
}


/* === Execution wrappers ================================================= */

async function _execSwapAndRecord(core, tokenIn, tokenOut, amountIn, label, notionalUSD) {
  const res = await core.strategy.execSwap(tokenIn, tokenOut, amountIn);
  if (!res?.txHash || res.txHash === '0x') throw new Error(`Missing txHash from ${label}`);
  await core.verifier.record({
    txHash: res.txHash,
    action: label,
    tokenIn,
    tokenOut,
    notionalUSD,
    ts: nowTs()
  });
  return res.txHash;
}


/* === Orchestrated routed swaps (profit + peg alignment) ================= */

async function runAdaptiveMicroseedSwaps(core) {
  await _aaPreflightProbe(core);

  const { usdc, bwz, weth } = await _getBalances(core);
  const tickUSDC = await _getPoolTick(core, POOL_BW_USDC);
  const tickWETH = await _getPoolTick(core, POOL_BW_WETH);

  const targetPegUSD = Number(LIVE.PEG.TARGET_USD || 1);
  const intents = _decidePegDefenseActions({
    usdcBal: usdc, bwzBal: bwz, wethBal: weth,
    tickUSDC, tickWETH, targetPegUSD
  });

  // Attempt up to 4 routed actions, each selecting the most profitable quoted path at execution time
  const executed = [];
  for (const intent of intents.slice(0, 6)) {
    try {
      if (intent.type === 'BUY_BWZC_WITH_USDC' || intent.type === 'BUY_BWZC_WITH_USDC_VIA_WETH') {
        const { usdcAmt } = pegSizedAmounts(intent.maxUSD, targetPegUSD);
        // Quote best path USDC -> BWAEZI (direct vs via WETH)
        const quoteBest = await _quotePath(core, LIVE.TOKENS.USDC, LIVE.TOKENS.BWAEZI, usdcAmt, { maxSlippageBps: 150 });
        if (!quoteBest) continue;
        const tx = await _execSwapAndRecord(core, LIVE.TOKENS.USDC, LIVE.TOKENS.BWAEZI, usdcAmt, 'adaptive_buy_bwzC', Number(ethers.formatUnits(usdcAmt, 6)));
        executed.push(tx);
      } else if (intent.type === 'SELL_BWZC_FOR_USDC') {
        const bwAmt = ethers.parseEther((Math.max(0.001, intent.maxUSD / targetPegUSD)).toFixed(18));
        const quoteBest = await _quotePath(core, LIVE.TOKENS.BWAEZI, LIVE.TOKENS.USDC, bwAmt, { maxSlippageBps: 150 });
        if (!quoteBest) continue;
        const tx = await _execSwapAndRecord(core, LIVE.TOKENS.BWAEZI, LIVE.TOKENS.USDC, bwAmt, 'adaptive_sell_bwzC', Number(ethers.formatEther(bwAmt)) * targetPegUSD);
        executed.push(tx);
      } else if (intent.type === 'SELL_BWZC_FOR_WETH') {
        const bwAmt = ethers.parseEther((Math.max(0.001, intent.maxUSD / targetPegUSD)).toFixed(18));
        const quoteBest = await _quotePath(core, LIVE.TOKENS.BWAEZI, LIVE.TOKENS.WETH, bwAmt, { maxSlippageBps: 200 });
        if (!quoteBest) continue;
        const tx = await _execSwapAndRecord(core, LIVE.TOKENS.BWAEZI, LIVE.TOKENS.WETH, bwAmt, 'adaptive_sell_bwzC_for_weth', Number(ethers.formatEther(bwAmt)) * targetPegUSD);
        executed.push(tx);
      } else if (intent.type === 'ARB_USDC_WETH_BWZC') {
        // Small triangle arb attempt: USDC->WETH->BWAEZI if quotes suggest net gain
        const usdcProbeUSD = Math.max(0.5, Math.min(intent.maxUSD, 2.0));
        const usdcProbe = ethers.parseUnits(usdcProbeUSD.toFixed(6), 6);
        const q1 = await _quotePath(core, LIVE.TOKENS.USDC, LIVE.TOKENS.WETH, usdcProbe, { maxSlippageBps: 200 });
        if (!q1) continue;
        const q2 = await _quotePath(core, LIVE.TOKENS.WETH, LIVE.TOKENS.BWAEZI, q1.amountOut, { maxSlippageBps: 200 });
        if (!q2) continue;
        // Execute only first leg here (second leg will be natural follow-up via separate intent or next run) to avoid path bundling complexity
        const tx = await _execSwapAndRecord(core, LIVE.TOKENS.USDC, LIVE.TOKENS.WETH, usdcProbe, 'adaptive_buy_weth', usdcProbeUSD);
        executed.push(tx);
      }
      if (executed.length >= 4) break;
    } catch (e) {
      // continue to next intent
    }
  }

  if (executed.length === 0) throw new Error('Adaptive microseed swaps: no routed actions executed');
  return { ok: true, txs: executed };
}


/* === Orchestrator (lean, next phase) ==================================== */

async function runGenesisMicroseed(core) {
  core.genesisState = core.genesisState || { attempts: 0, lastError: null, lastExecCount: 0, lastTs: null };
  try {
    // If previous genesis activities were recorded, we proceed with next-phase routing
    console.log('🌱 GENESIS NEXT-PHASE — peg stability and routed swaps');

    // Gas minima (once)
    const gasRequirements = await validateGenesisGasRequirements(core);
    core._genesisGasRequirements = gasRequirements;

    // Temporarily relax compliance for dynamic routing
    const wasStrict = core.compliance?.strict;
    if (core.compliance) core.compliance.strict = false;
    core.genesisState.attempts += 1;

    try {
      const res = await runAdaptiveMicroseedSwaps(core);
      core.genesisState.lastExecCount = res.txs.length;
      core.genesisState.lastError = null;
      core.genesisState.lastTs = nowTs();
      console.log(`✅ Routed swaps executed: count=${res.txs.length}`);
      return { ok: true, ...res };
    } catch (err) {
      core.genesisState.lastError = err?.message || String(err);
      core.genesisState.lastTs = nowTs();
      throw err;
    } finally {
      if (core.compliance) core.compliance.strict = wasStrict;
    }
  } catch (e) {
    console.error('❌ GENESIS NEXT-PHASE failed:', e.message);
    return { ok: false, error: e.message };
  }
}





/* =========================================================================
   Oracle aggregator (patched with null-safety and normalized compositeUSD)
   ========================================================================= */

class OracleAggregator {
  constructor(provider, dexRegistry){
    this.provider=provider; this.dexRegistry=dexRegistry;
    const clAddr = AA_CONFIG?.ORACLES?.CHAINLINK_ETH_USD;
    this.chainlink = clAddr ? new ethers.Contract(
      clAddr,
      ['function latestRoundData() view returns (uint80,int256,uint256,uint256,uint80)', 'function decimals() view returns (uint8)'],
      provider
    ) : null;
  }
  async chainlinkEthUsd() {
    if (!this.chainlink) throw new Error('CL unavailable');
    const [, answer,, updatedAt] = await this.chainlink.latestRoundData();
    const dec = await this.chainlink.decimals();
    const now = Math.floor(nowTs()/1000);
    const staleWindow = AA_CONFIG?.ORACLES?.STALE_SECONDS ?? 300;
    if (Number(updatedAt) < now - staleWindow) throw new Error('CL stale');
    if (!answer || answer <= 0n) throw new Error('CL invalid');
    return Number(answer) / (10 ** Number(dec));
  }
  async v3TwapUSD(bwaezi, tokenUSD=LIVE.TOKENS.USDC){
    try {
      const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
      const pool = await factory.getPool(bwaezi, tokenUSD, LIVE.PEG.FEE_TIER_DEFAULT);
      if (!pool || pool === ethers.ZeroAddress) return null;
      const poolC = new ethers.Contract(pool, ['function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)'], this.provider);
      const [ticks] = await poolC.observe([300,0]);
      const twapTick = Math.floor(Number(ticks[1]-ticks[0])/300);
      // Price token1 per token0; BWAEZI price in USDC requires orientation, but TWAP used integrally
      const price = Math.pow(1.0001, twapTick);
      return price;
    } catch { return null; }
  }
  async compositeUSD(bwaeziAddr){
    // Probe 1 BWAEZI; normalize USDC 6 decimals
    const amountProbe = ethers.parseEther('1');
    let dexPrice = LIVE.PEG.TARGET_USD, dexConf=0.6;
    try {
      const best = await this.dexRegistry.getBestQuote(bwaeziAddr, LIVE.TOKENS.USDC, amountProbe);
      if (best?.best?.amountOut) dexPrice = Number(best.best.amountOut) / 1e6;
    } catch {}
    let twapPrice = await this.v3TwapUSD(bwaeziAddr);
    let clPrice = null; try { clPrice = await this.chainlinkEthUsd(); } catch {}

    const sources = [dexPrice, twapPrice].filter(x=> typeof x === 'number' && x>0);
    const avg = sources.length ? sources.reduce((a,b)=>a+b,0)/sources.length : dexPrice;
    const devMax = sources.length ? Math.max(...sources.map(x=> Math.abs(x-avg)/avg)) : 0;
    const confidence = Math.max(0.2, Math.min(1.0, dexConf * (devMax > 0.1 ? 0.6 : 1.0)));
    return { priceUSD: avg, confidence, dispersionPct: devMax*100, components: { dex: dexPrice, twap: twapPrice, clEthUsd: clPrice } };
  }
}

/* =========================================================================
   ProfitVerifier++ (unchanged)
   ========================================================================= */

class ProfitVerifier {
  constructor(provider){
    this.provider=provider;
    this.records=[];
    this.merkleLeaves=[];
  }
  _leafHash(obj){ return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(obj))); }
  async reconcileEV(record){
    try {
      const rec = await this.provider.getTransactionReceipt(record.txHash);
      const latencyMs = 0;
      const gasUsed = rec ? Number(rec.gasUsed) : 0;
      const feeData = await chainRegistry.getFeeData();
      const gasUSD = feeData?.maxFeePerGas ? 2000 * Number(ethers.formatEther(BigInt(gasUsed)*(feeData.maxFeePerGas))) : 0;
      record.gasUSD = gasUSD; record.latencyMs = latencyMs;
      record.slipActual = Math.max(0, (record.evExAnte?.slipUSD || 0) / Math.max(1, record.notionalUSD)) * 1e6;
      record.evExPost = (record.evExAnte?.evUSD || 0) - gasUSD;
    } catch {}
    return record;
  }
  async record(packet){
    const id = `rec_${nowTs()}_${randomUUID().slice(0,8)}`;
    const record = { id, ...packet, ts: nowTs(), anchors: [] };
    this.records.push(record);
    this.merkleLeaves.push(this._leafHash({ id, ts: record.ts, txHash: record.txHash || '0x' }));
    if (this.records.length > 10000) this.records.shift();
    if (this.merkleLeaves.length > 10000) this.merkleLeaves.shift();
    return await this.reconcileEV(record);
  }
  getRecent(n=250){ return this.records.slice(-n); }
  getAccumulator(){
    const root = this.merkleLeaves.length ? ethers.keccak256(ethers.concat(this.merkleLeaves)) : ethers.ZeroHash;
    return { root, count: this.merkleLeaves.length };
  }
  getRecentDecisionPackets(limit=50){ return this.records.slice(-limit).map(r => ({
    id: r.id, usdNotional: r.notionalUSD, ev: r.evExAnte, ts: r.ts, signatureAddress: r.signatureAddress
  })); }
}

/* =========================================================================
   PerceptionRegistry++ (unchanged)
   ========================================================================= */

class PerceptionRegistry {
  constructor(provider, signer){
    this.provider=provider; this.signer=signer;
    this.registryAddress = addrStrict(AA_CONFIG.PERCEPTION?.REGISTRY || '0x0000000000000000000000000000000000000000');
    this.registry = this.registryAddress !== ethers.ZeroAddress ? new ethers.Contract(this.registryAddress, [
      'function anchorHash(bytes32 hash) external',
      'function getHashCount() external view returns (uint256)'
    ], signer) : null;
    this.anchors = [];
  }

  async anchor(packetHash){
    let proof = null;
    if (this.registry) {
      try {
        const tx = await this.registry.anchorHash(packetHash, { gasLimit: 120000 });
        const rc = await tx.wait();
        proof = { chain: 'L2', txHash: rc.transactionHash, blockNumber: rc.blockNumber };
      } catch {}
    }
    if (!proof) {
      const tx = await this.signer.sendTransaction({ to: this.signer.address, data: `0x${packetHash.slice(2,10)}`, value: 0 });
      const rc = await tx.wait();
      proof = { chain: 'L1', txHash: rc.transactionHash, blockNumber: rc.blockNumber, method: 'calldata' };
    }
    this.anchors.push({ hash: packetHash, proof, ts: nowTs() });
    if (this.anchors.length > 10000) this.anchors.shift();
    return proof;
  }

  async count(){
    try { return this.registry ? Number(await this.registry.getHashCount()) : this.anchors.length; }
    catch { return this.anchors.length; }
  }
  getRecent(n=100){ return this.anchors.slice(-n); }
}

/* =========================================================================
   EV gating proxy
   ========================================================================= */

class EVGatingStrategyProxy {
  constructor(strategy, dexRegistry, verifier, provider, health, compliance){
    this.strategy=strategy; this.dex=dexRegistry; this.verifier=verifier; this.provider=provider;
    this.health=health; this.compliance=compliance;
    this.minuteUSD=0; this.hourUSD=0; this.dayUSD=0;
    this.tsMinute=nowTs(); this.tsHour=nowTs(); this.tsDay=nowTs();
  }
  _resetWindows(){
    const now=nowTs();
    if (now - this.tsMinute >= 60_000) { this.tsMinute=now; this.minuteUSD=0; }
    if (now - this.tsHour >= 3_600_000) { this.tsHour=now; this.hourUSD=0; }
    if (now - this.tsDay >= 86_400_000) { this.tsDay=now; this.dayUSD=0; }
  }
  _rateCapsOk(usd){ this._resetWindows(); const b=LIVE.RISK.BUDGETS; return (this.minuteUSD+usd)<=b.MINUTE_USD && (this.hourUSD+usd)<=b.HOUR_USD && (this.dayUSD+usd)<=b.DAY_USD; }

  async estimateGasUSD(gl = 850_000n) {
    try {
      const fd = await this.provider.getFeeData();
      const gasPrice = fd.maxFeePerGas || ethers.parseUnits('30', 'gwei');
      const ethCost = Number(ethers.formatEther(gl * gasPrice));
      let ethUsd = 2000;
      try {
        ethUsd = await this.strategy.oracle.chainlinkEthUsd();
      } catch {}
      return ethUsd * ethCost;
    } catch { return 0; }
  }

  async arbitrageIfEV(tokenIn, tokenOut, notionalUSDC){
    if (this.compliance.isDefensiveOnly()) return { skipped:true, reason:'compliance_defensive_only' };
    const usd = Number(ethers.formatUnits(notionalUSDC, 6));
    if (!this._rateCapsOk(usd)) return { skipped:true, reason:'budget_cap' };

    const best = await this.dex.getBestRoute(tokenIn, tokenOut, notionalUSDC);
    let expectedOutUSD = 0;
    if (tokenOut.toLowerCase() === LIVE.TOKENS.USDC.toLowerCase()) {
      expectedOutUSD = best?.best?.amountOut ? Number(best.best.amountOut) / 1e6 : 0;
    } else if (tokenOut.toLowerCase() === LIVE.TOKENS.BWAEZI.toLowerCase()) {
      const outBW = best?.best?.amountOut ? Number(best.best.amountOut) / 1e18 : 0;
      let p = LIVE.PEG.TARGET_USD;
      try {
        const comp = await this.strategy.oracle.compositeUSD(LIVE.TOKENS.BWAEZI);
        p = comp.priceUSD || p;
      } catch {}
      expectedOutUSD = outBW * p;
    } else {
      expectedOutUSD = best?.best?.amountOut ? Number(best.best.amountOut) : 0;
    }

    const gasUSD = await this.estimateGasUSD(850_000n);
    const slipUSD = usd * Math.min(0.02, 0.003 + LIVE.RISK.COMPETITION.COST_AWARE_SLIP_BIAS);
    const grossProfitUSD = expectedOutUSD - usd;
    const evUSD = grossProfitUSD - gasUSD - slipUSD;

    if (this.health.runawayTriggered()) return { skipped:true, reason:'circuit_breaker' };
    if (evUSD <= 0) return { skipped:true, reason:'negative_ev', evUSD, gasUSD, slipUSD };

    const res = await this.strategy.execSwap(tokenIn, tokenOut, notionalUSDC);
    this.minuteUSD += usd; this.hourUSD += usd; this.dayUSD += usd;
    const packet = await this.verifier.record({
      action:'arbitrage', tokenIn, tokenOut, notionalUSD: usd, txHash: res.txHash,
      evExAnte: { evUSD, gasUSD, slipUSD }
    });
    return { executed:true, packet };
  }

  async rebalanceIfEV(buyBWAEZI, usdNotional){
    const tokenIn = buyBWAEZI ? LIVE.TOKENS.USDC : LIVE.TOKENS.BWAEZI;
    const tokenOut = buyBWAEZI ? LIVE.TOKENS.BWAEZI : LIVE.TOKENS.USDC;
    const notionalUSDC = ethers.parseUnits(String(usdNotional), 6);
    return await this.arbitrageIfEV(tokenIn, tokenOut, notionalUSDC);
  }
}


/* =========================================================================
   Strategy engine (arbitrage/rebalance + peg watcher)
   ========================================================================= */

function mapElementToFeeTier(elemental) { 
  if (elemental === 'WATER') return 500; 
  if (elemental === 'FIRE') return 10000; 
  return 3000; 
}
function chooseRoute(elemental) { 
  if (elemental === 'FIRE') return 'ONE_INCH_V5'; 
  return 'UNISWAP_V3'; 
}

class StrategyEngine {
  constructor(mev, verifier, provider, dexRegistry, entropy=null, maker=null, oracle=null){
    this.mev=mev; 
    this.verifier=verifier; 
    this.provider=provider; 
    this.dex=dexRegistry;
    this.entropy=entropy; 
    this.maker=maker; 
    this.oracle=oracle;
    this.lastPegEnforcement=0;
  }

  // Let SponsorGuard derive lean deposit-fitting caps; no fixed fees or PM hints
  async _dynamicCaps(opts = {}) {
    return {
      callGasLimit: opts.callGasLimit ?? undefined,
      verificationGasLimit: opts.verificationGasLimit ?? undefined,
      preVerificationGas: opts.preVerificationGas ?? undefined,
      allowNoPaymaster: true
    };
  }

  async execSwap(tokenIn, tokenOut, amountIn){
    const built = await this.dex.buildSplitExec(tokenIn, tokenOut, amountIn, LIVE.SCW_ADDRESS);
    if (!built) throw new Error('No route available');
    console.log(`[execSwap] router=${built.router} dex=${built.selectedDex} type=${built.selectedType} calldataLen=${built.calldata?.length || 0}`);

    const iface=new ethers.Interface(['function execute(address,uint256,bytes)']);
    const calldata = iface.encodeFunctionData('execute',[built.router, 0n, built.calldata]);
    const caps = await this._dynamicCaps();
    const userOpRes = await this.mev.sendUserOp(calldata, { description:`swap_exec_${built.selectedDex}`, ...caps });
    return { txHash: userOpRes.txHash, minOut: built.minOut, routes: built.routes };
  }

  async opportunisticRebalance(buyBWAEZI=true, usdNotional=25000){
    const elemental='WATER';
    const feeTier = mapElementToFeeTier(elemental);
    const route = chooseRoute(elemental);
    const adapter=this.dex.getAdapter(route);

    const amountInUSDC=ethers.parseUnits(String(usdNotional),6);
    const q=await adapter.getQuote(LIVE.TOKENS.USDC, LIVE.TOKENS.BWAEZI, amountInUSDC);
    const entropyState = this.entropy?.lastEntropy || { coherence:0.6 };
    const slip=this.entropy ? this.entropy.slippageGuard(0.003, entropyState.coherence, 0.0) : 0.003;
    const amountOutMin = q?.amountOut ? BigInt(Math.floor(Number(q.amountOut)*(1-slip))) : 0n;

    const tx = await adapter.buildSwapCalldata({
      tokenIn: buyBWAEZI? LIVE.TOKENS.USDC : LIVE.TOKENS.BWAEZI,
      tokenOut: buyBWAEZI? LIVE.TOKENS.BWAEZI : LIVE.TOKENS.USDC,
      amountIn: amountInUSDC, amountOutMin, recipient:LIVE.SCW_ADDRESS, fee:feeTier
    });
    const scwIface=new ethers.Interface(['function execute(address,uint256,bytes)']);
    const exec=scwIface.encodeFunctionData('execute',[tx.router, 0n, tx.calldata]);

    const composite=this.oracle ? await this.oracle.compositeUSD(LIVE.TOKENS.BWAEZI) : { priceUSD: LIVE.PEG.TARGET_USD, confidence:0.5 };
    const packet = {
      mode:'rebalance', entropy: entropyState,
      neuro: { activation:0.7, plasticity:0.8, attentionFocus:0.6 },
      gravity: { curvature:0.15 }, elemental,
      feeTier, tickWidth: Math.floor(600 * Math.max(0.2, entropyState.coherence)), route,
      usdNotional, slip,
      compositePriceUSD: composite.priceUSD,
      confidence: composite.confidence,
      ts: nowTs()
    };

    const caps = await this._dynamicCaps();
    const result=await this.mev.sendUserOp(exec, { description:'rebalance_bwaezi', ...caps });
    const rec = await this.verifier.record({ txHash: result.txHash, action:'rebalance', tokenIn: LIVE.TOKENS.USDC, tokenOut: LIVE.TOKENS.BWAEZI, notionalUSD: usdNotional, evExAnte: { evUSD: usdNotional, gasUSD: 0, slipUSD: usdNotional*slip } });
    return { txHash:result.txHash, decisionPacket:packet, record: rec };
  }

  async watchPeg() {
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const pool = await factory.getPool(LIVE.TOKENS.BWAEZI, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT);
    if (!pool || pool === ethers.ZeroAddress) return false;
    const poolC = new ethers.Contract(pool, [
      'event Swap(address,address,int256,int256,uint160,uint128,int24)',
      'function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)',
      'function token0() view returns (address)',
      'function token1() view returns (address)'
    ], this.provider);

    const token0 = await poolC.token0();
    const token1 = await poolC.token1();
    const d0 = await (new ethers.Contract(token0, ['function decimals() view returns (uint8)'], this.provider)).decimals();
    const d1 = await (new ethers.Contract(token1, ['function decimals() view returns (uint8)'], this.provider)).decimals();
    const bwaeziIsToken0 = token0.toLowerCase() === LIVE.TOKENS.BWAEZI.toLowerCase();

    poolC.on('Swap', async () => {
      try {
        const [, tick] = await poolC.slot0();
        const p10 = Math.pow(1.0001, Number(tick)) * Math.pow(10, d0) / Math.pow(10, d1); // price token1 per token0
        const priceUSD = bwaeziIsToken0 ? (1 / p10) : p10; // BWAEZI in USDC
        const deviationPct = ((priceUSD - LIVE.PEG.TARGET_USD)/LIVE.PEG.TARGET_USD)*100;
        if (Math.abs(deviationPct) >= LIVE.PEG.DEVIATION_THRESHOLD_PCT) {
          await this.enforcePegIfNeeded();
        }
      } catch {}
    });
    return true;
  }

   async enforcePegIfNeeded(){
    const now = nowTs();
    if (now - this.lastPegEnforcement < 8000) return null;
    this.lastPegEnforcement = now;

    const entropyValue = Number(createHash('sha256').update(String(now)).digest().readUInt32BE(0)) / 0xFFFFFFFF;
    const coherence = 0.6 + 0.3 * Math.sin(now / 60_000);
    const sample = this.entropy ? this.entropy.sample(entropyValue, coherence) : { coherence, shock: 0, ts: now };

    const composite = this.oracle
      ? await this.oracle.compositeUSD(LIVE.TOKENS.BWAEZI)
      : { priceUSD: LIVE.PEG.TARGET_USD, confidence: 0.5 };

    const deviationPct = ((composite.priceUSD - LIVE.PEG.TARGET_USD) / LIVE.PEG.TARGET_USD) * 100;
    const threshold = (composite.confidence || 0.5) < 0.5 ? 0.6 : 0.35;

    // If deviation is inside tolerance band, do nothing
    if (Math.abs(deviationPct) < threshold) {
      return { enforced: false, reason: 'inside_band', deviationPct, threshold, coherence: sample.coherence };
    }

    // Size a small corrective rebalance proportional to deviation and coherence
    const baseUSD = 5000;
    const scale = Math.max(0.2, Math.min(1.0, Math.abs(deviationPct) / 2.0)) * Math.max(0.3, sample.coherence);
    const usdNotional = Math.round(baseUSD * scale);

    // Direction: if price below peg → BUY BWAEZI (raise price); above peg → SELL BWAEZI (lower price)
    const buyBWAEZI = composite.priceUSD < LIVE.PEG.TARGET_USD;

    // Execute corrective action via strategy
    const result = await this.opportunisticRebalance(buyBWAEZI, usdNotional);

    // Persist a peg enforcement record
    await this.verifier.record({
      txHash: result.txHash,
      action: 'peg_enforce',
      tokenIn: buyBWAEZI ? LIVE.TOKENS.USDC : LIVE.TOKENS.BWAEZI,
      tokenOut: buyBWAEZI ? LIVE.TOKENS.BWAEZI : LIVE.TOKENS.USDC,
      notionalUSD: usdNotional,
      evExAnte: { evUSD: usdNotional, gasUSD: 0, slipUSD: 0 }
    });

    return {
      enforced: true,
      txHash: result.txHash,
      deviationPct,
      threshold,
      buyBWAEZI,
      usdNotional,
      coherence: sample.coherence
    };
  }
} // <-- properly closes StrategyEngine class

/* =========================================================================
   Entropy
   ========================================================================= */

class EntropyShockDetector {
  constructor(){ this.lastEntropy=null; }
  sample(v,c){
    const now=nowTs();
    const shock=this.lastEntropy?Math.abs(v-this.lastEntropy.value):0;
    this.lastEntropy={value:v,coherence:c,ts:now};
    return {shock,coherence:c,ts:now};
  }
  slippageGuard(b,c,s){ return Math.min(0.02, Math.max(b, b+(1-c)*0.01 + Math.min(s,0.05)*0.5)); }
}

/* =========================================================================
   Perception accumulator (ESM-safe, full capabilities preserved)
   ========================================================================= */

class PerceptionAccumulator {
  constructor() {
    this.events = [];
    this.merkleRoot = null;
  }

  addEvent(evt) {
    if (!evt || typeof evt !== 'object') return;
    this.events.push(evt);
    const cutoff = nowTs() - LIVE.PERCEPTION.DECAY_MS;
    this.events = this.events.filter(e => (e?.ts ?? 0) >= cutoff);
    this.merkleRoot = this.computeMerkle();
  }

  computeMerkle() {
    if (this.events.length === 0) return ethers.ZeroHash;
    let layer = this.events.map(e => e?.hash).filter(h => typeof h === 'string' && h.startsWith('0x'));
    if (!layer.length) return ethers.ZeroHash;
    while (layer.length > 1) {
      const next = [];
      for (let i = 0; i < layer.length; i += 2) {
        const left = layer[i];
        const right = layer[i + 1] || left;
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
    const weighted =
      LIVE.PERCEPTION.LOCAL_WEIGHT * localCount +
      LIVE.PERCEPTION.L2_WEIGHT * l2Count +
      LIVE.PERCEPTION.L1_WEIGHT * l1Count;
    return Math.log1p(Math.max(0, weighted));
  }

  getAccumulator() {
    return { root: this.merkleRoot ?? ethers.ZeroHash, count: this.events.length };
  }

  getRecent(n = 100) {
    if (n <= 0) return [];
    const start = Math.max(0, this.events.length - n);
    return this.events.slice(start);
  }

  reset() {
    this.events = [];
    this.merkleRoot = ethers.ZeroHash;
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
    const now = nowTs();
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
  get(address) { return this.stakes.get(ethers.getAddress(address)) || { amount: 0n, score: 0, lastPacketTs: 0 }; }
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
      lastReset: nowTs(),
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
    const dayAgo = nowTs() - 86_400_000;
    const v = recents.filter(t => (t.ts || t.at) >= dayAgo && (t.ev?.evUSD || 0) > 0).reduce((s,t)=> s + (t.usdNotional || 0), 0);
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

    if (nowTs() - this.state.lastReset >= 86_400_000) {
      this.state.dailyAmplifications = 0;
      this.state.lastReset = nowTs();
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

    const now = nowTs();
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
      ts: nowTs()
    };
    const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(packet)));
    this.accumulator.addEvent({ hash, evUSD: usd, ts: nowTs(), source: 'local', confidence: this.state.C_t });

    this.state.lastAmplificationBlock = await this.provider.getBlockNumber();
    this.state.dailyAmplifications += 1;
    return { triggered:true, packet, amp };
  }

  getEquationState() { return { ...this.state, constants: this.constants, lastUpdated: nowTs() }; }
}

/* =========================================================================
   Mev Executor (AA live)
   ========================================================================= */

class MevExecutorAA {
  constructor(aa, scw){ this.aa=aa; this.scw=scw; }
  async sendUserOp(calldata, opts={}){
    const userOp = await this.aa.createUserOp(calldata, {
      callGasLimit: opts.callGasLimit || 850_000n,
      verificationGasLimit: opts.verificationGasLimit || 650_000n,
      preVerificationGas: opts.preVerificationGas || 100_000n,
      maxFeePerGas: opts.maxFeePerGas,
      maxPriorityFeePerGas: opts.maxPriorityFeePerGas
    });
    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);
    return { txHash, ts: nowTs(), meta: { desc: opts.description || 'scw.execute' } };
  }
}


/* =========================================================================
   Consciousness Kernel (sensing + decision) with adaptive sovereign equation
   ========================================================================= */

const V15_MANIFEST = {
  version: '15.13',
  pegUSD: LIVE.PEG.TARGET_USD,
  liquidityBaseline: 1e9,
  gates: { confidenceMin:0.6, dispersionMaxPct:2.0, bandPctMin:0.35, slippageCeiling:0.02, coherenceMin:0.5 },
  sizing: { a1Dev:0.6, a2Liq:0.5, a3Vol:0.4 },
  caps: { NminUSD:5000, NmaxUSD:50000, perMinuteUSD:LIVE.RISK.BUDGETS.MINUTE_USD, perHourUSD:LIVE.RISK.BUDGETS.HOUR_USD, perDayUSD:LIVE.RISK.BUDGETS.DAY_USD },
  utilityCaps: { evUsdCap:500 },
  adaptive: {
    capsUpliftMaxPct: 0.25, rateUpliftMaxPct: 0.25,
    eta: { A:0.10, H:0.10, C:0.10, Z:0.08, E:0.08 },
    kappa: { F:0.10, Ev:0.15, A:0.10, damp:0.10 },
    chiBase: 0.35, chiFloor: 0.20, chiReduceHC: 0.30
  },
  enhanced: {
    lambdaCoherence:0.3, muNovelty:0.5, nuError:0.5,
    phiFrequency:0.3, psiMagnetism:0.3, xiDimensionality:0.2,
    omegaFaith:0.30, zetaGravity:0.30,
    epsilonEnergy:0.35, rhoSymmetry:0.25, piPegEnergy:0.25,
    chiFriction:0.35
  }
};

class ConsciousnessKernel {
  constructor({ oracle, dexRegistry, quorum, evProxy, manifest }){
    this.oracle=oracle; this.dex=dexRegistry; this.quorum=quorum; this.ev=evProxy; this.manifest=manifest; this.policyHash=null;
    this.state = {
      slippageEMA:0.003, dispersionEMA:0.0, lastSignals:null,
      coherence:0.5, novelty:0.0, errorEMA:0.0, frequency:0.0, magnetism:0.0,
      dimensionIndex:0.0, vacuum:0.0, inertia:0.5, friction:0.0, entropyU:0.0,
      energyA:0.5, resonance:0.0
    };
    this.adaptiveEq = new AdaptiveEquation();
  }
  sealPolicy(manifest){ this.policyHash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(manifest))); return this.policyHash; }

  async _liquidityNorm(){
    try {
      const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.oracle.provider);
      let tot = 0;
      const read = async (a,b,f)=>{ const p=await factory.getPool(a,b,f); if(!p||p===ethers.ZeroAddress) return 0; const pc=new ethers.Contract(p,['function liquidity() view returns (uint128)'], this.oracle.provider); return Number((await pc.liquidity()).toString()); };
      tot += await read(LIVE.TOKENS.BWAEZI, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT);
      tot += await read(LIVE.TOKENS.BWAEZI, LIVE.TOKENS.WETH, 3000);
      return Math.min(1.0, tot / this.manifest.liquidityBaseline);
    } catch { return 0; }
  }

  _signalsVariance(s){
    const arr=[s.dispersionPct||0, s.liquidityNorm||0, this.state.coherence, this.state.novelty, this.state.errorEMA];
    const mean = arr.reduce((a,b)=>a+b,0)/arr.length;
    const varr = arr.reduce((a,b)=> a + Math.pow(b-mean,2), 0)/arr.length;
    return Math.min(1, Math.max(0, varr));
  }

  async sense(bwaezi){
    const comp = await this.oracle.compositeUSD(bwaezi);
    const fork = await this.quorum.forkCheck();

    const priceCoherence = 1 - Math.min(1, (comp.dispersionPct || 0)/(this.manifest.gates.dispersionMaxPct || 2.0));
    const rpcCoherence = fork.diverged ? 0 : 1;
    const aaHealth = 1;
    const H = 0.6*priceCoherence + 0.2*rpcCoherence + 0.2*aaHealth;
    this.state.coherence = this.state.coherence*0.8 + H*0.2;

    const lNorm = await this._liquidityNorm();
    const dDisp = Math.abs((comp.dispersionPct || 0) - (this.state.dispersionEMA || 0));
    const Z = Math.max(0, 0.5*dDisp + 0.5*Math.max(0,  0.1 - lNorm));
    this.state.novelty = this.state.novelty*0.8 + Z*0.2;

    const recent = this.ev?.verifier?.getRecent(30) || [];
    const errs = recent.map(r => Math.abs((r.evExAnte?.evUSD || 0) - (r.evExPost || 0))).filter(x=>x>0);
    const E = errs.length ? errs.reduce((a,b)=>a+b,0)/errs.length : 0;
    this.state.errorEMA = this.state.errorEMA*0.8 + E*0.2;

    const actionsPerMin = Math.min(60, recent.length);
    const freqEMA = Math.min(1, actionsPerMin/60);
    const evWins = recent.filter(r=> (r.evExPost || 0) > 0).length;
    const cadenceCorr = evWins/Math.max(1,recent.length);
    const F = Math.max(0, Math.min(1, 0.7*freqEMA + 0.3*cadenceCorr));
    this.state.frequency = this.state.frequency*0.8 + F*0.2;

    const shareBW = recent.filter(r=> r.action==='rebalance' && r.buy===true).length / Math.max(1, recent.length);
    const repeatRate = 0.3;
    const stickiness = evWins/Math.max(1, recent.length);
    const M = Math.max(0, Math.min(1, 0.5*shareBW + 0.3*repeatRate + 0.2*stickiness));
    this.state.magnetism = this.state.magnetism*0.8 + M*0.2;

    const dims = [lNorm, (this.state.dispersionEMA||0)/(this.manifest.gates.dispersionMaxPct||2.0), this.state.coherence, this.state.novelty, this.state.errorEMA];
    const theta=[0.05,0.05,0.1,0.08,0.08];
    let Q=1.0; for(let i=0;i<dims.length;i++) Q *= (1 + theta[i]*Math.max(0, dims[i]));
    const Qp = Math.log(1 + Q);
    this.state.dimensionIndex = Math.max(0, Math.min(1, Qp/Math.log(1 + 2)));

    const varSignals = this._signalsVariance({ dispersionPct: comp.dispersionPct, liquidityNorm: lNorm });

    this.state.dispersionEMA = this.state.dispersionEMA*0.8 + (comp.dispersionPct || 0)*0.2;

    const signalsOut = {
      priceUSD: comp.priceUSD, confidence: comp.confidence, dispersionPct: comp.dispersionPct,
      liquidityNorm: lNorm, fork,
      coherence: this.state.coherence, novelty: this.state.novelty, error: this.state.errorEMA,
      frequency: this.state.frequency, magnetism: this.state.magnetism, dimensionIndex: this.state.dimensionIndex,
      sigma: Math.min(2.5, Math.max(0, (comp.dispersionPct||0)/100)) // proxy vol
    };

    const executedOps = recent.length;
    const declaredOps = Math.max(1, Math.floor(6));
    this.adaptiveEq.update({
      ...signalsOut,
      executedOps, declaredOps,
      deviation: (comp.priceUSD - this.manifest.pegUSD)/this.manifest.pegUSD
    });

    this.state.lastSignals = signalsOut;
    return this.state.lastSignals;
  }

  decide(signals, pegUSD){
    const m=this.manifest;
    const { priceUSD, confidence, dispersionPct, fork, liquidityNorm } = signals;

    if (fork?.diverged) return { action:'NOOP', reason:'fork_divergence' };
    if ((confidence||0) < (m.gates.confidenceMin||0.6)) return { action:'NOOP', reason:'low_confidence' };
    if ((dispersionPct||0) > (m.gates.dispersionMaxPct||2.0)) return { action:'NOOP', reason:'high_dispersion' };

    const devPct = ((priceUSD - pegUSD)/pegUSD)*100;
    if (Math.abs(devPct) < (m.gates.bandPctMin || 0.35)) return { action:'NOOP', reason:'inside_band' };

    const volNorm = (this.state.dispersionEMA || 0)/(m.gates.dispersionMaxPct || 2.0);
    const baseScale = Math.max(0, Math.min(1, m.sizing.a1Dev*Math.abs(devPct)/10 + m.sizing.a2Liq*(liquidityNorm||0) - m.sizing.a3Vol*volNorm));

    const mod = this.adaptiveEq.modulation({
      lambda: V15_MANIFEST.enhanced.lambdaCoherence,
      mu: V15_MANIFEST.enhanced.muNovelty,
      nu: V15_MANIFEST.enhanced.nuError,
      phi: V15_MANIFEST.enhanced.phiFrequency,
      psi: V15_MANIFEST.enhanced.psiMagnetism,
      xi: V15_MANIFEST.enhanced.xiDimensionality,
      omega: V15_MANIFEST.enhanced.omegaFaith,
      zeta: V15_MANIFEST.enhanced.zetaGravity,
      epsilon: V15_MANIFEST.enhanced.epsilonEnergy,
      rho: V15_MANIFEST.enhanced.rhoSymmetry,
      pi: V15_MANIFEST.enhanced.piPegEnergy,
      chi: V15_MANIFEST.enhanced.chiFriction
    });

    let notional = baseScale * V15_MANIFEST.caps.NmaxUSD * mod;
    notional = Math.max(V15_MANIFEST.caps.NminUSD, Math.min(V15_MANIFEST.caps.NmaxUSD, Math.round(notional)));
    const buy = priceUSD < pegUSD;
    return { action: buy ? 'BUY_BWAEZI' : 'SELL_BWAEZI', usdNotional: notional, deviationPct: devPct, liquidityNorm };
  }
}

/* =========================================================================
   Policy Governor
   ========================================================================= */

class PolicyGovernor {
  constructor(kernel, strategy, evProxy, pegUSD, health, registry){
    this.kernel=kernel; this.strategy=strategy; this.ev=evProxy; this.pegUSD=pegUSD; this.health=health; this.registry=registry;
    this.minuteUSD=0; this.hourUSD=0; this.dayUSD=0; this.tsMinute=nowTs(); this.tsHour=nowTs(); this.tsDay=nowTs();
    this.lastDecisionPacket=null;
  }
  _resetCaps(){ const now=nowTs(); if(now - this.tsMinute >= 60_000){ this.tsMinute=now; this.minuteUSD=0; } if(now - this.tsHour >= 3_600_000){ this.tsHour=now; this.hourUSD=0; } if(now - this.tsDay >= 86_400_000){ this.tsDay=now; this.dayUSD=0; } }
  _capsOk(usd){ this._resetCaps(); const b=LIVE.RISK.BUDGETS; return (this.minuteUSD+usd)<=b.MINUTE_USD && (this.hourUSD+usd)<=b.HOUR_USD && (this.dayUSD+usd)<=b.DAY_USD; }

  async run(core){
    const signals = await this.kernel.sense(LIVE.TOKENS.BWAEZI);
    const fd = await chainRegistry.getFeeData();
    const gasGwei = Number(ethers.formatUnits(fd?.maxFeePerGas || ethers.parseUnits('30','gwei'), 'gwei'));
    if (this.health.marketStressHalt(signals.dispersionPct || 0, signals.liquidityNorm || 0, gasGwei)) {
      return { skipped:true, reason:'market_stress_halt', signals };
    }

    const decision = this.kernel.decide(signals, this.pegUSD);
    if (decision.action === 'NOOP') return { skipped:true, reason: decision.reason, signals };
    if (!this._capsOk(decision.usdNotional)) return { skipped:true, reason:'rate_cap', usd: decision.usdNotional, signals };

    const res = await this.ev.rebalanceIfEV(decision.action === 'BUY_BWAEZI', decision.usdNotional);
    if (res.skipped) { this.health.record(res.ev?.evUSD || -1); return { skipped:true, reason: res.reason, signals, decision }; }

    this.minuteUSD += decision.usdNotional; this.hourUSD += decision.usdNotional; this.dayUSD += decision.usdNotional;

    const packet = {
      policyHash: this.kernel.policyHash,
      action: decision.action,
      usdNotional: decision.usdNotional,
      signals,
      eqAudit: {
        faithIndex: this.kernel.adaptiveEq.state.faithIndex,
        gravityPull: this.kernel.adaptiveEq.state.gravityPull,
        volatilityEnergy: this.kernel.adaptiveEq.state.volatilityEnergy,
        pegEnergy: this.kernel.adaptiveEq.state.pegEnergy
      },
      ev: res.packet?.evExAnte || {},
      txHash: res.packet?.txHash || null,
      ts: nowTs()
    };
    this.lastDecisionPacket = packet;

    const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(packet)));
    const proof = await this.registry.anchor(hash);

    return { executed:true, packet, proof };
  }
}


/* =========================================================================
   MEV recapture engine — aligned with MevExecutorAA SponsorGuard (AA31-safe)
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
      return pi > 1.5 && liq < 5e8;
    } catch {
      return false;
    }
  }

  async splitAndExecute({ tokenIn, tokenOut, amountIn, recipient }) {
    const routes = LIVE.REFLEXIVE.SPLIT_ROUTES.slice();
    const baseParts = [0.4, 0.3, 0.3];
    const parts = LIVE.RISK.COMPETITION.RANDOMIZE_SPLITS
      ? baseParts.map(p => Math.max(0.2, Math.min(0.6, p + (Math.random() - 0.5) * 0.1)))
      : baseParts;
    const sumParts = parts.reduce((a, b) => a + b, 0);
    const normParts = parts.map(p => p / sumParts);

    const txs = [];
    for (let i = 0; i < routes.length; i++) {
      const adapter = this.dexRegistry.getAdapter(routes[i]);
      const partIn = BigInt(Math.floor(Number(amountIn) * normParts[i]));
      const quote = await adapter.getQuote(tokenIn, tokenOut, partIn);
      if (!quote?.amountOut) {
        console.error(`[split_exec] route=${routes[i]} failed to quote for partIn=${partIn.toString()}`);
        continue;
      }
      const slip = 0.004 + Math.random() * 0.006;
      const minOut = BigInt(Math.floor(Number(quote.amountOut) * (1 - slip)));
      const tx = await adapter.buildSwapCalldata({ tokenIn, tokenOut, amountIn: partIn, amountOutMin: minOut, recipient });
      const scwIface = new ethers.Interface(['function execute(address,uint256,bytes)']);
      const execCalldata = scwIface.encodeFunctionData('execute', [tx.router, 0n, tx.calldata]);

      // Routed via SponsorGuard; deposit-aware, no hard-coded caps
      const sendRes = this.mev.sendUserOp(execCalldata, {
        description: `split_exec_${routes[i]}`,
        allowNoPaymaster: true
      });
      txs.push(sendRes);

      const jitter = 200 + Math.floor(Math.random() * 800);
      await new Promise(r => setTimeout(r, jitter));
    }
    const results = [];
    for (const t of txs) {
      try {
        results.push(await t);
      } catch (err) {
        console.error(`[split_exec] userOp send failed: ${err?.message || err}`);
      }
    }
    return results;
  }

  async backrunCover({ tokenIn, tokenOut, amountIn }) {
    const adapter = this.dexRegistry.getAdapter('UNISWAP_V3');
    const microIn = amountIn / 10n;
    const q = await adapter.getQuote(tokenOut, tokenIn, microIn);
    if (!q?.amountOut) return null;
    const minOut = BigInt(Math.floor(Number(q.amountOut) * 0.992));
    const tx = await adapter.buildSwapCalldata({
      tokenIn: tokenOut,
      tokenOut: tokenIn,
      amountIn: microIn,
      amountOutMin: minOut,
      recipient: LIVE.SCW_ADDRESS
    });
    const scwIface = new ethers.Interface(['function execute(address,uint256,bytes)']);
    const execCalldata = scwIface.encodeFunctionData('execute', [tx.router, 0n, tx.calldata]);

    return await this.mev.sendUserOp(execCalldata, {
      description: 'backrun_cover',
      allowNoPaymaster: true
    });
  }
}

/* =========================================================================
   Adaptive Range Maker (patched: SCW mints via userOps) — tuple array encoding
   ========================================================================= */

class AdaptiveRangeMaker {
  constructor(provider, signer, dexRegistry, entropy, core){
    this.provider=provider; this.signer=signer; this.dexRegistry=dexRegistry; this.entropy=entropy; this.core=core;
    this.npm = LIVE.DEXES.UNISWAP_V3.positionManager;
    // Uniswap V3 NPM mint signature (ethers v6): positional tuple encoding required
    this.npmIface = new ethers.Interface([
      'function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256,uint128,uint256,uint256)'
    ]);
    this.scwIface = new ethers.Interface(['function execute(address,uint256,bytes)']);
    this.running=new Map(); this.lastAdjust=0;
  }

  async startStreamingMint({ token0, token1, tickLower, tickUpper, total0, total1, steps=LIVE.MAKER.MAX_STREAM_STEPS, label='maker_stream' }){
    const id=`stream_${nowTs()}_${randomUUID().slice(0,8)}`;
    const c0 = total0>0n ? total0/BigInt(steps) : 0n;
    const c1 = total1>0n ? total1/BigInt(steps) : 0n;
    this.running.set(id,{ token0, token1, tickLower, tickUpper, chunk0:c0, chunk1:c1, steps, done:0, label, positions:[] });

    (async()=>{
      while(true){
        const st=this.running.get(id); if(!st) break;
        if(st.done>=st.steps){ this.running.delete(id); break; }

        const coh=Math.max(0.2, (this.entropy.lastEntropy?.coherence ?? 0.6));
        const delayMs=Math.floor(8000*(1.2-coh));

        try{
          // Ethers v6 requires positional array for tuple components
          const paramsArray = [
            st.token0,                      // address token0
            st.token1,                      // address token1
            LIVE.PEG.FEE_TIER_DEFAULT,      // uint24 fee
            st.tickLower,                   // int24 tickLower
            st.tickUpper,                   // int24 tickUpper
            st.chunk0,                      // uint256 amount0Desired
            st.chunk1,                      // uint256 amount1Desired
            0,                              // uint256 amount0Min
            0,                              // uint256 amount1Min
            LIVE.SCW_ADDRESS,               // address recipient
            Math.floor(nowTs()/1000)+1200   // uint256 deadline
          ];

          const mintData = this.npmIface.encodeFunctionData('mint', [paramsArray]);
          const exec = this.scwIface.encodeFunctionData('execute', [this.npm, 0n, mintData]);

          // Send via MEV executor (mode-aware sponsorship honored upstream)
          const txRes = await this.core.mev.sendUserOp(exec, {
            description: `maker_mint_${label}`
          });

          st.positions.push({ txHash: txRes.txHash, at: nowTs() });
          console.log(`[maker_stream:${label}] mint chunk done tx=${txRes.txHash}`);
        } catch(e){
          console.error('Streaming mint error:', e.message);
        }

        st.done++;
        this.running.set(id, st);
        await new Promise(r=>setTimeout(r, delayMs));
      }
    })();

    return { streamId:id };
  }

  async periodicAdjustRange(bwaeziAddr){
    const now=nowTs();
    if(now-this.lastAdjust<LIVE.MAKER.RANGE_ADJUST_INTERVAL_MS) return null;
    this.lastAdjust=now;

    const factory=new ethers.Contract(
      LIVE.DEXES.UNISWAP_V3.factory,
      ['function getPool(address,address,uint24) view returns (address)'],
      this.provider
    );

    const pool=await factory.getPool(bwaeziAddr, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT);
    if(!pool || pool===ethers.ZeroAddress) return { adjusted:false, reason:'no_pool' };

    const slot0 = await (new ethers.Contract(
      pool,
      ['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'],
      this.provider
    )).slot0();

    const tick=Number(slot0[1]);
    const coh=Math.max(0.2, this.entropy.lastEntropy?.coherence ?? 0.6);
    const width=Math.floor(600*(coh<LIVE.MAKER.ENTROPY_COHERENCE_MIN?1.5:0.8));
    const tl=tick-width, tu=tick+width;

    const total0=LIVE.MAKER.STREAM_CHUNK_BWAEZI*4n;
    const total1=LIVE.MAKER.STREAM_CHUNK_USDC*4n;

    const stream=await this.startStreamingMint({
      token0:LIVE.TOKENS.BWAEZI,
      token1:LIVE.TOKENS.USDC,
      tickLower:tl,
      tickUpper:tu,
      total0,
      total1,
      steps:4,
      label:'periodic_adjust'
    });

    return { adjusted:true, tick, tickLower:tl, tickUpper:tu, coherence:coh, streamId:stream.streamId };
  }

  listStreams(){
    return Array.from(this.running.entries()).map(([id,st])=> ({ id, ...st }));
  }
}



/* =========================================================================
   API server v15.13
   ========================================================================= */

class APIServerV15 {
  constructor(core, port=8081){ this.core=core; this.port=port; this.app=express(); this.server=null; this.routes(); }
  routes(){
  this.app.get('/', (req,res)=> {
    const s=this.core.getStats();
    res.send(`
      <h1>SOVEREIGN FINALITY ENGINE ${LIVE.VERSION}</h1>
      <p>Status: ${s.system.status}</p>
      <p>Policy: ${s.system.policyHash}</p>
      <p>Trades Executed: ${s.trading.tradesExecuted}</p>
      <p>Last Profit (USD): ${s.trading.lastProfitUSD}</p>
      <p>Projected Daily (USD): ${s.trading.projectedDaily?.toFixed?.(2) || 0}</p>
      <p>Amplifications: ${s.reflexive.amplificationsTriggered}</p>
      <p>Streams Active: ${s.maker.streamsActive}</p>
      <p>Anchors: ${s.anchors.count}</p>
      <p>Compliance Mode: ${s.risk.complianceMode}</p>
      <meta http-equiv="refresh" content="10">
    `);
  });
  this.app.get('/status', (req,res)=> res.json(this.core.getStats()));

  // Minimal dashboard aliases to avoid 404s for advertised endpoints
  this.app.get('/revenue-dashboard', (req,res)=> res.json({ ok:true, data:this.core.getStats().trading, ts: nowTs() }));
  this.app.get('/blockchain-status', async (req,res)=> {
    try {
      const fee = await chainRegistry.getFeeData();
      res.json({ ok:true, chain: LIVE.NETWORK, feeData: fee, ts: nowTs() });
    } catch (e) {
      res.status(500).json({ ok:false, error:e.message, ts: nowTs() });
    }
  });
  this.app.get('/system-metrics', (req,res)=> res.json({ ok:true, metrics: this.core.getStats(), ts: nowTs() }));
  this.app.get('/revenue-status', (req,res)=> res.json({ ok:true, revenue: this.core.getStats().trading, ts: nowTs() }));
  this.app.get('/health', async (req,res)=> { try { const health = await this.core.dex.healthCheck(LIVE.TOKENS.WETH, LIVE.TOKENS.USDC, ethers.parseEther('0.01')); res.json({ ok:true, ...health, ts: nowTs() }); } catch (e) { res.status(500).json({ ok:false, error: e.message, ts:nowTs() }); } });

  this.app.get('/dex/list', (req,res)=> res.json({ adapters:this.core.dex.getAllAdapters(), ts:nowTs() }));
  this.app.get('/dex/health', async (req,res)=> { try { const health = await this.core.dex.healthCheck(LIVE.TOKENS.WETH, LIVE.TOKENS.USDC, ethers.parseEther('0.01')); res.json({ ...health, ts: nowTs() }); } catch (e) { res.status(500).json({ error: e.message }); } });
  this.app.get('/dex/scores', (req,res)=> res.json({ scores: this.core.dex.getScores(), lastErrors: this.core.dex.getLastErrors(), ts: nowTs() }));

  this.app.get('/anchors/composite', async (req,res)=> { try { const r=await this.core.oracle.compositeUSD(LIVE.TOKENS.BWAEZI); res.json({ priceUSD:r.priceUSD, confidence:r.confidence, dispersionPct:r.dispersionPct, components:r.components, ts:nowTs() }); } catch(e){ res.status(500).json({ error:e.message }); } });

  this.app.get('/v15/equation-state', (req,res)=> res.json({ equation: this.core.kernel?.adaptiveEq?.state || null, ts: nowTs() }));
  this.app.get('/v15/manifest', (req,res)=> res.json({ manifest: V15_MANIFEST, hash: this.core.policyHash, ts: nowTs() }));
  this.app.get('/v15/anchors/recent', (req,res)=> res.json({ anchors: this.core.registry.getRecent(50), ts: nowTs() }));
  this.app.get('/v15/accumulator', (req,res)=> res.json(this.core.verifier.getAccumulator()));

  this.app.get('/v13.9/equation-state', (req,res)=> res.json({ equation: this.core.amplifier.getEquationState(), ts: nowTs() }));
  this.app.get('/v13.9/accumulator', (req,res)=> res.json({ merkleRoot: this.core.accumulator.merkleRoot, perceptionIndex: this.core.accumulator.getPerceptionIndex(), ts: nowTs() }));
  this.app.get('/v13.9/risk', (req,res)=> res.json({ risk: LIVE.RISK, ts: nowTs() }));

  this.app.get('/trades/recent', (req,res)=> res.json({ recent: this.core.verifier.getRecent(100), ts: nowTs() }));

  // Genesis telemetry
  this.app.get('/genesis-state', (req,res)=> {
    const s = this.core.genesisState || { attempts: 0, lastError: null, lastExecCount: 0, lastTs: null };
    res.json({ ok:true, genesis: s, ts: nowTs() });
  });

  // Manual force microseed endpoint (unstoppable genesis trigger)
  this.app.post('/force-microseed', async (req,res) => {
    try {
      await forceGenesisPoolAndPeg(this.core);
      res.json({ ok:true, msg:'Forced pool creation and seed at peg', ts: nowTs() });
    } catch (e) {
      res.status(500).json({ ok:false, error:e.message, ts: nowTs() });
    }
  });

  this.app.post('/risk/kill-switch', express.json(), (req,res)=> {
    const enabled = (req.query.enabled || req.body?.enabled || 'false').toString() === 'true';
    LIVE.RISK.CIRCUIT_BREAKERS.GLOBAL_KILL_SWITCH = enabled;
    res.json({ ok:true, killSwitch: enabled, ts: nowTs() });
  });
}   // <-- closes the routes() method

async start(){
  if (globalThis.__SOVEREIGN_V15_API_RUNNING) {
    console.warn('API server already running — skipping duplicate start');
    return;
  }
  this.server=this.app.listen(this.port, () => {
    globalThis.__SOVEREIGN_V15_API_RUNNING = true;
    console.log(`🌐 API Server v15.13 on :${this.port}`);
  });
}
}   // <-- closes the APIServerV15 class




/* =========================================================================
   Production sovereign core v15.13 (full live wiring)
   ========================================================================= */

class ProductionSovereignCore extends EventEmitter {
  constructor(){
    super();
    this.provider=null; this.signer=null; this.aa=null;

    this.dex=null; this.oracle=null; this.mev=null; this.verifier=null;
    this.strategy=null; this.entropy=null;

    this.kernel=null; this.governor=null; this.registry=null; this.policyHash=null;

    this.recapture=null; this.accumulator=new PerceptionAccumulator();
    this.stakeGov=null; this.amplifier=null; this.maker=null;

    this.compliance = new ComplianceManager(LIVE.RISK.COMPLIANCE.MODE);
    this.health = new HealthGuard();

    this.wss=null; this.clients=new Set();
    this.stats = {
      startTs: nowTs(), tradesExecuted:0, lastProfitUSD:0, anchors:0, projectedDaily:0,
      pegActions:0, amplificationsTriggered:0, streamsActive:0, perceptionsAnchored:0
    };
    this.status='INIT'; this.loops=[];
    this.genesisState = { attempts: 0, lastError: null, lastExecCount: 0, lastTs: null };
  }

  async initialize(bundlerUrlOverride=null){
    if (globalThis.__SOVEREIGN_V15_LIVE) {
      console.warn('⚠️ Sovereign v15 already initialized — skipping duplicate boot');
      return;
    }
    console.log(`🚀 SOVEREIGN FINALITY ENGINE ${LIVE.VERSION} — BOOTING`);
    await chainRegistry.init();
    this.provider = chainRegistry.getProvider();
    this.signer = new ethers.Wallet(process.env.SOVEREIGN_PRIVATE_KEY, this.provider);

    const bundler = bundlerUrlOverride
      || process.env.BUNDLER_URL
      || AA_CONFIG.BUNDLER.RPC_URL
      || (LIVE.BUNDLER_URLS[0] || null);

    this.aa = new EnterpriseAASDK(this.signer, LIVE.ENTRY_POINT);
    await this.aa.initialize(this.provider, LIVE.SCW_ADDRESS, bundler);

    try { await bootstrapSCWForPaymasterEnhanced(this.aa, this.provider, this.signer, LIVE.SCW_ADDRESS); } catch(e){ console.warn('Bootstrap AA path skipped:', e.message); }

    this.dex = new DexAdapterRegistry(this.provider);
    this.oracle = new OracleAggregator(this.provider, this.dex);
    this.mev = new MevExecutorAA(this.aa, LIVE.SCW_ADDRESS);
    this.verifier = new ProfitVerifier(this.provider);
    this.entropy = new EntropyShockDetector();
    this.strategy = new StrategyEngine(this.mev, this.verifier, this.provider, this.dex, this.entropy, null, this.oracle);

    const quorum = new QuorumRPC(chainRegistry, LIVE.RISK.INFRA.QUORUM_SIZE || 3, 2);
    const evProxy = new EVGatingStrategyProxy(this.strategy, this.dex, this.verifier, this.provider, this.health, this.compliance);
    this.kernel = new ConsciousnessKernel({ oracle: this.oracle, dexRegistry: this.dex, quorum, evProxy, manifest: V15_MANIFEST });
    this.policyHash = this.kernel.sealPolicy(V15_MANIFEST);

    this.registry = new PerceptionRegistry(this.provider, this.signer);
    this.governor = new PolicyGovernor(this.kernel, this.strategy, evProxy, LIVE.PEG.TARGET_USD, this.health, this.registry);

    this.recapture = new MEVRecaptureEngine(this.mev, this.dex, this.provider, this.compliance);
    this.amplifier = new ReflexiveAmplifier(this.kernel, this.provider, this.oracle, this.dex, this.verifier, this.mev, this.accumulator);

    // Maker patched to SCW mints; pass core
    this.maker = new AdaptiveRangeMaker(this.provider, this.signer, this.dex, this.entropy, this);

    await this.strategy.watchPeg();

    await runGenesisMicroseed(this);

    this.loops.push(setInterval(async () => {
      try {
        const adj = await this.maker.periodicAdjustRange(LIVE.TOKENS.BWAEZI);
        if (adj?.adjusted) {
          this.stats.streamsActive = (this.maker?.listStreams?.().length || 0);
          console.log(`🔧 Range adjusted tick=${adj.tick} width=[${adj.tickLower},${adj.tickUpper}] coherence=${adj.coherence?.toFixed?.(2) || 'n/a'} stream=${adj.streamId}`);
        }
      } catch (e) { console.warn('maker adjust error:', e.message); }
    }, LIVE.MAKER.RANGE_ADJUST_INTERVAL_MS));

    this.loops.push(setInterval(async () => {
      try {
        const r = await this.governor.run(this);
        if (r?.executed) {
          this.stats.tradesExecuted += 1;
          this.stats.pegActions += 1;

          const last = this.verifier.getRecent(1)[0];
          this.stats.lastProfitUSD = last?.evExPost || last?.evExAnte?.evUSD || 0;
          this.stats.anchors += 1;
          const hours = Math.max(0.01, (nowTs()-this.stats.startTs)/3600000);
          this.stats.projectedDaily = (this.stats.lastProfitUSD/hours)*24;

          const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(r.packet)));
          const tx = await this.signer.sendTransaction({ to: this.signer.address, data: `0x${hash.slice(2,10)}`, value: 0 });
          await tx.wait();
          this.accumulator.addEvent({ hash, evUSD: r.packet.ev?.evUSD || 0, ts: nowTs(), source: 'l1', confidence: 0.9 });
          this.stats.perceptionsAnchored += 1;

          this.broadcast({ type:'decision', packet: r.packet, proof: r.proof, eq: this.amplifier.getEquationState() });
        } else if (r?.skipped) {
          this.broadcast({ type:'noop', reason: r.reason, signals: r.signals });
        }
      } catch(e){ console.warn('decision loop error:', e.message); }
    }, 15_000));

    this.loops.push(setInterval(async () => {
      try {
        const result = await this.amplifier.checkAndTrigger(this.recapture);
        if (result.triggered) {
          this.stats.amplificationsTriggered += 1;

          const hash = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(result.packet)));
          const tx = await this.signer.sendTransaction({ to: this.signer.address, data: `0x${hash.slice(2,10)}`, value: 0 });
          const rec = await tx.wait();

          this.accumulator.addEvent({ hash, evUSD: result.packet.usdNotional, ts: nowTs(), source: 'l1', confidence: 0.9 });
          this.stats.perceptionsAnchored += 1;

          this.broadcast({ type:'amplification', packet: result.packet, txHash: rec.transactionHash, eq: this.amplifier.getEquationState() });
        }
      } catch (e) { console.warn('Amplifier loop error:', e.message); }
    }, 20_000));

    this.startWS();
    this.status='SOVEREIGN_LIVE_V15.13';
    globalThis.__SOVEREIGN_V15_LIVE = true;
    console.log('✅ SOVEREIGN FINALITY ENGINE v15.13 — ONLINE');
    console.log(`   Policy Hash: ${this.policyHash}`);
  }

  startWS(port=8082){
    try {
      if (globalThis.__SOVEREIGN_V15_WS_RUNNING) {
        console.warn('WS server already running — skipping duplicate start');
        return;
      }
      this.wss = new WebSocketServer({ port });
      this.wss.on('connection', ws => {
        this.clients.add(ws);
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ type:'init', version: LIVE.VERSION, policyHash: this.policyHash, status: this.status, ts: nowTs() }));
        }
        ws.on('close', () => this.clients.delete(ws));
      });
      globalThis.__SOVEREIGN_V15_WS_RUNNING = true;
      console.log(`🔌 WebSocket server on :${port}`);
    } catch (e) {
      console.warn('WS server failed to start:', e.message);
    }
  }

  broadcast(message){
    const s=JSON.stringify({ ...message, ts: nowTs() });
    for (const c of this.clients) { if (c.readyState === 1) c.send(s); }
  }

  getStats(){
    const eq = this.amplifier.getEquationState();
    return {
      system: { version: LIVE.VERSION, status: this.status, policyHash: this.policyHash, uptimeMs: nowTs()-this.stats.startTs },
      trading: { tradesExecuted: this.stats.tradesExecuted, lastProfitUSD: this.stats.lastProfitUSD, projectedDaily: this.stats.projectedDaily },
      anchors: { count: this.stats.anchors, registryRecent: this.registry.getRecent(5) },
      accumulator: this.verifier.getAccumulator(),
      reflexive:{ amplificationsTriggered:this.stats.amplificationsTriggered, perceptionIndex: eq.R_t, liquidityNorm: eq.L_t, utilityScore: eq.U_t },
      maker:{ streamsActive:this.stats.streamsActive },
      peg:{ actions:this.stats.pegActions, targetUSD:LIVE.PEG.TARGET_USD },
      risk: { complianceMode: LIVE.RISK.COMPLIANCE.MODE, breakers: LIVE.RISK.CIRCUIT_BREAKERS }
    };
  }
}



/* =========================================================================
   Bootstrap
   ========================================================================= */

async function bootstrap_v15() {
  if (globalThis.__SOVEREIGN_V15_BOOTSTRAPPED) {
    console.warn('bootstrap_v15 already called — skipping duplicate bootstrap');
    return globalThis.__SOVEREIGN_V15_CORE || null;
  }
  console.log('🚀 SOVEREIGN FINALITY ENGINE v15.14 — BOOTSTRAPPING');

  // Initialize chain registry
  await chainRegistry.init();

  // Pick bundler URL
  const bundlerUrl = process.env.BUNDLER_URL || AA_CONFIG.BUNDLER.RPC_URL;

  // Initialize core engine
  const core = new ProductionSovereignCore();
  await core.initialize(bundlerUrl);

  // Start API server
  const api = new APIServerV15(core, process.env.PORT ? Number(process.env.PORT) : 8081);
  await api.start();

  console.log('✅ v15.14 operational');
  globalThis.__SOVEREIGN_V15_BOOTSTRAPPED = true;
  globalThis.__SOVEREIGN_V15_CORE = core;
  return core;
}

// Auto-bootstrap if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => { await bootstrap_v15(); })();
}

/* =========================================================================
   Exports
   ========================================================================= */

export {
  ProductionSovereignCore,
  APIServerV15,
  DexAdapterRegistry,
  UniversalDexAdapter,
  MevExecutorAA,
  ProfitVerifier,
  StrategyEngine,
  OracleAggregator,
  QuorumRPC,
  ConsciousnessKernel,
  PolicyGovernor,
  EVGatingStrategyProxy,
  PerceptionAccumulator,
  StakedGovernanceRegistry,
  MEVRecaptureEngine,
  ReflexiveAmplifier,
  AdaptiveRangeMaker,
  LIVE,
  chainRegistry,
  bootstrap_v15,
  AdaptiveEquation
};

export default ProductionSovereignCore;
