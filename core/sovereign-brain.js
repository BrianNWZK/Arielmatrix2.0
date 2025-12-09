/**
 * core/sovereign-brain.js
 *
 * SOVEREIGN MEV BRAIN v13.5 — Maker–Taker Hybrid + Composite Oracle + AA
 *
 * REQUIREMENTS:
 * - Node.js 20+ (ESM). package.json: { "type":"module" }
 * - ENV:
 *   SOVEREIGN_PRIVATE_KEY=0x...
 *   ALCHEMY_API_KEY=...
 *   INFURA_API_KEY=...
 *   PIMLICO_API_KEY=... (optional)
 *   STACKUP_API_KEY=... (optional)
 */

import express from 'express';
import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { randomUUID, createHash } from 'crypto';
import fetch from 'node-fetch';

/* =========================================================================
   Configuration
   ========================================================================= */

function getAddressSafely(address) {
  try {
    if (ethers.isAddress(address)) {
      try { return ethers.getAddress(address); } catch { return address.toLowerCase(); }
    }
    return address;
  } catch { return address; }
}

const LIVE = {
  ENTRY_POINT: getAddressSafely('0x5FF137D4bEAA7036d654a88Ea898df565D304B88'),
  ACCOUNT_FACTORY: getAddressSafely('0x9406Cc6185a346906296840746125a0E44976454'),
  EOA_OWNER_ADDRESS: getAddressSafely('0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA'),
  SCW_ADDRESS: getAddressSafely('0x5Ae673b4101c6FEC025C19215E1072C23Ec42A3C'),

  TOKENS: {
    BWAEZI: getAddressSafely('0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'),
    WETH:   getAddressSafely('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'),
    USDC:   getAddressSafely('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'),
    DAI:    getAddressSafely('0x6B175474E89094C44Da98b954EedeAC495271d0F'),
    USDT:   getAddressSafely('0xdAC17F958D2ee523a2206206994597C13D831ec7')
  },

  DEXES: {
    UNISWAP_V3: {
      name: 'Uniswap V3',
      router:          getAddressSafely('0xE592427A0AEce92De3Edee1F18E0157C05861564'),
      quoter:          getAddressSafely('0xb27308f9F90d607463bb33eA1BeBb41C27CE5AB6'),
      factory:         getAddressSafely('0x1F98431c8aD98523631AE4a59f267346ea31F984'),
      positionManager: getAddressSafely('0xC36442b4a4522E871399CD717aBDD847Ab11FE88')
    },
    UNISWAP_V2: {
      name: 'Uniswap V2',
      router:  getAddressSafely('0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'),
      factory: getAddressSafely('0x5C69bEe701ef814a2B6a3Edd4B1652CB9cc5aA6f')
    },
    ONE_INCH_V5: {
      name: '1inch V5',
      router: getAddressSafely('0x1111111254EEB25477B68fb85Ed929f73A960582')
    }
  },

  RPC_PROVIDERS: [
    'https://eth-mainnet.g.alchemy.com/v2/' + (process.env.ALCHEMY_API_KEY || 'demo'),
    'https://mainnet.infura.io/v3/' + (process.env.INFURA_API_KEY || '84842078b09946638c03157f83405213'),
    'https://ethereum.publicnode.com',
    'https://rpc.ankr.com/eth'
  ],

  BUNDLERS: [
    `https://api.pimlico.io/v1/eth/rpc?apikey=${process.env.PIMLICO_API_KEY || ''}`,
    'https://bundler.candide.dev/rpc/mainnet',
    `https://api.stackup.sh/v1/node/${process.env.STACKUP_API_KEY || ''}`
  ].filter(url => !url.includes('demo') && url.length > 30),

  PEG: {
    TARGET_USD: 100,
    FEE_TIER_DEFAULT: 500,
    GENESIS_MIN_USDC: ethers.parseUnits('100', 6),
    GENESIS_BWAEZI_INIT: ethers.parseEther('1000'),
    SEED_BWAEZI_EXPAND: ethers.parseEther('50000')
  },

  MAKER: {
    STREAM_CHUNK_BWAEZI: ethers.parseEther('250'),
    STREAM_CHUNK_USDC: ethers.parseUnits('150000', 6),
    MAX_STREAM_STEPS: 12,
    RANGE_ADJUST_INTERVAL_MS: 60_000,
    ENTROPY_COHERENCE_MIN: 0.35
  },

  ANCHORS: [
    { symbol: 'USDC', address: getAddressSafely('0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'), decimals: 6 },
    { symbol: 'WETH', address: getAddressSafely('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'), decimals: 18 },
    { symbol: 'DAI',  address: getAddressSafely('0x6B175474E89094C44Da98b954EedeAC495271d0F'), decimals: 18 } // optional
  ]
};

/* =========================================================================
   Connections
   ========================================================================= */

class BlockchainConnections {
  constructor() {
    this.providers = LIVE.RPC_PROVIDERS.map(url => {
      try {
        if (url.startsWith('wss://')) return new ethers.WebSocketProvider(url);
        return new ethers.JsonRpcProvider(url);
      } catch { return new ethers.JsonRpcProvider(url); }
    });
    this.bundlers = LIVE.BUNDLERS.map(url => new ethers.JsonRpcProvider(url));
    this._pi = 0; this._bi = 0;
  }
  getProvider() {
    const p = this.providers[this._pi % this.providers.length];
    this._pi = (this._pi + 1) % this.providers.length;
    return p;
  }
  getBundler() {
    if (this.bundlers.length === 0) return this.getProvider();
    const b = this.bundlers[this._bi % this.bundlers.length];
    this._bi = (this._bi + 1) % this.bundlers.length;
    return b;
  }
  async getFeeData() {
    try {
      const fd = await this.getProvider().getFeeData();
      return {
        maxFeePerGas: fd.maxFeePerGas || ethers.parseUnits('30','gwei'),
        maxPriorityFeePerGas: fd.maxPriorityFeePerGas || ethers.parseUnits('2','gwei'),
        gasPrice: fd.gasPrice || ethers.parseUnits('25','gwei')
      };
    } catch {
      return {
        maxFeePerGas: ethers.parseUnits('30','gwei'),
        maxPriorityFeePerGas: ethers.parseUnits('2','gwei'),
        gasPrice: ethers.parseUnits('25','gwei')
      };
    }
  }
}
const chain = new BlockchainConnections();

/* =========================================================================
   Utilities
   ========================================================================= */

class LRUMap {
  constructor(maxSize = 10000) { this.data = new Map(); this.maxSize = maxSize; }
  set(k,v){ if(this.data.size>=this.maxSize){ const fk=this.data.keys().next().value; this.data.delete(fk);} this.data.set(k,v); }
  get(k){ return this.data.get(k); }
  entries(){ return this.data.entries(); }
}

class EnterpriseRateLimiter {
  constructor(config = {}) {
    this.config = { requestsPerSecond: 1000, blockDuration: 60000, ...config };
    this.requests = new LRUMap(10000);
    this.blocks = new LRUMap(1000);
    this.adaptive = new Map();
  }
  async setAdaptiveLimit(operation, limits) {
    this.adaptive.set(operation, {
      base: Math.max(1, limits.base),
      burst: Math.max(0, limits.burst),
      recovery: Math.max(0.01, Math.min(1, limits.recovery))
    });
  }
  async checkLimit(identifier, operation='default') {
    const now = Date.now();
    if (this.blocks.get(identifier)) throw new Error(`Rate limit blocked: ${identifier}`);
    const windowStart = now - 1000;
    const arr = this.requests.get(identifier) || [];
    const recent = arr.filter(t => t > windowStart);
    const eff = this.adaptive.get(operation)?.base || this.config.requestsPerSecond;
    if (recent.length >= eff) {
      this.blocks.set(identifier, now + this.config.blockDuration);
      throw new Error(`Rate limit exceeded: ${identifier}`);
    }
    recent.push(now);
    this.requests.set(identifier, recent);
    return true;
  }
}

class EnterpriseCircuitBreaker {
  constructor(config = {}) {
    this.config = { failureThreshold: 5, successThreshold: 3, timeout: 30000, ...config };
    this.states = new LRUMap(1000);
  }
  async execute(operation, fn, options = {}) {
    const state = this.states.get(operation) || { status: 'CLOSED', failures: 0, successes: 0, nextAttempt: 0 };
    if (state.status === 'OPEN' && Date.now() < state.nextAttempt) {
      if (options.fallback) return options.fallback();
      throw new Error(`Circuit breaker open: ${operation}`);
    }
    if (state.status === 'OPEN') state.status = 'HALF_OPEN';
    try {
      const result = await Promise.race([
        fn(),
        new Promise((_, rej)=>setTimeout(()=>rej(new Error('Timeout')), options.timeout || this.config.timeout))
      ]);
      state.successes++; state.failures = 0;
      if (state.status === 'HALF_OPEN' && state.successes >= this.config.successThreshold) state.status = 'CLOSED';
      this.states.set(operation, state);
      return result;
    } catch (error) {
      state.failures++;
      if (state.failures >= this.config.failureThreshold) {
        state.status = 'OPEN'; state.nextAttempt = Date.now() + (options.timeout || this.config.timeout);
      }
      this.states.set(operation, state);
      if (options.fallback) return options.fallback();
      throw new Error(`Operation ${operation} failed: ${error.message}`);
    }
  }
}

/* =========================================================================
   ERC-4337 AA
   ========================================================================= */

class EnterpriseAASDK {
  constructor(signer, entryPoint = LIVE.ENTRY_POINT) {
    if (!signer?.address) throw new Error('EnterpriseAASDK: signer required');
    this.signer = signer;
    this.entryPoint = entryPoint;
    this.factory = LIVE.ACCOUNT_FACTORY;
  }
  async isDeployed(address) {
    const code = await chain.getProvider().getCode(address);
    return code && code !== '0x';
  }
  async getSCWAddress(owner) {
    const salt = ethers.zeroPadValue(ethers.toBeArray(0), 32);
    const initAbi = new ethers.Interface(['function createAccount(address owner, uint256 salt) returns (address)']);
    const initCall = initAbi.encodeFunctionData('createAccount', [owner, 0]);
    const initCode = ethers.concat([this.factory, initCall]);
    const bytecode = `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${this.factory.slice(2)}5af43d82803e903d91602b57fd5bf3`;
    const addr = ethers.getCreate2Address(this.factory, salt,
      ethers.keccak256(ethers.concat([ethers.keccak256(bytecode), ethers.keccak256(initCode)])));
    return getAddressSafely(addr);
  }
  async getNonce(smartAccount) {
    const ep = new ethers.Contract(this.entryPoint, ['function getNonce(address sender, uint192 key) view returns (uint256)'], chain.getProvider());
    try { return await ep.getNonce(smartAccount, 0); } catch { return 0n; }
  }
  async createUserOp(callData, opts = {}) {
    const sender = await this.getSCWAddress(this.signer.address);
    const deployed = await this.isDeployed(sender);
    const nonce = await this.getNonce(sender);
    const gas = await chain.getFeeData();
    return {
      sender, nonce,
      initCode: deployed ? '0x' : (() => {
        const i = new ethers.Interface(['function createAccount(address owner, uint256 salt) returns (address)']);
        return ethers.concat([this.factory, i.encodeFunctionData('createAccount', [this.signer.address, 0])]);
      })(),
      callData,
      callGasLimit: opts.callGasLimit || 1_400_000n,
      verificationGasLimit: opts.verificationGasLimit || 1_000_000n,
      preVerificationGas: opts.preVerificationGas || 80_000n,
      maxFeePerGas: opts.maxFeePerGas || gas.maxFeePerGas,
      maxPriorityFeePerGas: opts.maxPriorityFeePerGas || gas.maxPriorityFeePerGas,
      paymasterAndData: opts.paymasterAndData || '0x',
      signature: '0x'
    };
  }
  _toHex(v) {
    try {
      if (typeof v === 'bigint') return ethers.toBeHex(v);
      if (typeof v === 'number') return ethers.toBeHex(BigInt(v));
      if (typeof v === 'string') { if (v.startsWith('0x')) return v; return ethers.toBeHex(BigInt(v)); }
    } catch {}
    return '0x0';
  }
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
  async sponsorUserOpViaHttp(userOp) {
    const pimlico = process.env.PIMLICO_API_KEY ? `https://api.pimlico.io/v2/eth/sponsorUserOperation?apikey=${process.env.PIMLICO_API_KEY}` : null;
    const stackup = process.env.STACKUP_API_KEY ? `https://api.stackup.sh/v1/sponsor/${process.env.STACKUP_API_KEY}` : null;
    const payload = { userOperation: this._formatBundlerUserOp(userOp), entryPoint: this.entryPoint };
    const tryEndpoint = async (url) => {
      const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(`Sponsor HTTP failed: ${res.status}`);
      const data = await res.json();
      if (!data?.paymasterAndData) throw new Error('Sponsor returned no paymasterAndData');
      return data.paymasterAndData;
    };
    if (pimlico) { try { return await tryEndpoint(pimlico); } catch {} }
    if (stackup) { try { return await tryEndpoint(stackup); } catch {} }
    return '0x';
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
    const chainId = (await chain.getProvider().getNetwork()).chainId;
    const enc = ethers.AbiCoder.defaultAbiCoder().encode(['bytes32','address','uint256'], [ethers.keccak256(packed), this.entryPoint, chainId]);
    const userOpHash = ethers.keccak256(enc);
    userOp.signature = await this.signer.signMessage(ethers.getBytes(userOpHash));
    return userOp;
  }
  async sendUserOpWithBackoff(userOp, maxAttempts = 5) {
    const bundlers = chain.bundlers.length ? chain.bundlers : [chain.getProvider()];
    const op = this._formatBundlerUserOp(userOp);
    const entryPoint = this.entryPoint;
    let attempt = 0; let lastErr;
    while (attempt < maxAttempts) {
      const b = bundlers[attempt % bundlers.length];
      try {
        const hash = await b.send('eth_sendUserOperation', [op, entryPoint]);
        const start = Date.now(); const timeout = 180_000;
        while (Date.now() - start < timeout) {
          try {
            const receipt = await b.send('eth_getUserOperationReceipt', [hash]);
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
   Adapters (Uniswap V3/V2 + 1inch)
   ========================================================================= */

class UniversalDexAdapter {
  constructor(provider, config) { this.provider = provider; this.config = config; this.type = this._type(config.name); }
  _type(name) {
    if (name?.includes('V3')) return 'V3';
    if (name?.includes('V2')) return 'V2';
    if (name?.includes('1inch')) return 'Aggregator';
    return 'Custom';
  }
  async getQuote(tokenIn, tokenOut, amountIn) {
    try {
      switch (this.type) {
        case 'V3': return await this._v3Quote(tokenIn, tokenOut, amountIn);
        case 'V2': return await this._v2Quote(tokenIn, tokenOut, amountIn);
        case 'Aggregator': return await this._aggQuote(tokenIn, tokenOut, amountIn);
        default: return await this._v3Quote(tokenIn, tokenOut, amountIn);
      }
    } catch { return null; }
  }
  async _v3Quote(tokenIn, tokenOut, amountIn) {
    const quoter = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.quoter, [
      'function quoteExactInputSingle(address,address,uint24,uint256,uint160) external returns (uint256)'
    ], this.provider);
    const fee = LIVE.PEG.FEE_TIER_DEFAULT;
    const amountOut = await quoter.quoteExactInputSingle(tokenIn, tokenOut, fee, amountIn, 0);
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const pool = await factory.getPool(tokenIn, tokenOut, fee);
    let liquidity = '0';
    if (pool && pool !== ethers.ZeroAddress) {
      const poolC = new ethers.Contract(pool, ['function liquidity() view returns (uint128)'], this.provider);
      liquidity = (await poolC.liquidity()).toString();
    }
    return { amountOut, priceImpact: 0.0, fee, liquidity };
  }
  async _v2Quote(tokenIn, tokenOut, amountIn) {
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V2.factory, ['function getPair(address,address) view returns (address)'], this.provider);
    const pair = await factory.getPair(tokenIn, tokenOut); if (!pair || pair === ethers.ZeroAddress) return null;
    const pairC = new ethers.Contract(pair, ['function getReserves() view returns (uint112,uint112,uint32)','function token0() view returns (address)'], this.provider);
    const [r0, r1] = await pairC.getReserves();
    const token0 = await pairC.token0();
    const inIs0 = tokenIn.toLowerCase() === token0.toLowerCase();
    const rin = inIs0 ? r0 : r1; const rout = inIs0 ? r1 : r0;
    if (rin === 0n || rout === 0n) return null;
    const amountInWithFee = amountIn * 997n / 1000n;
    const amountOut = (amountInWithFee * rout) / (rin + amountInWithFee);
    return { amountOut, priceImpact: Number(amountIn) / Math.max(1, Number(rin)) * 100, fee: 30, liquidity: rin.toString() };
  }
  async _aggQuote(tokenIn, tokenOut, amountIn) {
    try {
      const url = `https://api.1inch.io/v5.0/1/quote?fromTokenAddress=${tokenIn}&toTokenAddress=${tokenOut}&amount=${amountIn.toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`1inch ${res.status}`);
      const data = await res.json();
      return { amountOut: BigInt(data.toTokenAmount), priceImpact: 0.0, fee: 50, liquidity: '0' };
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
    const iface = new ethers.Interface([
      'function swap(address,(address,address,address,address,uint256,uint256,uint256,bytes),bytes) external payable returns (uint256,uint256)'
    ]);
    return iface.encodeFunctionData('swap', [
      recipient,
      {
        srcToken: tokenIn, dstToken: tokenOut,
        srcReceiver: recipient, dstReceiver: recipient,
        amount: amountIn, minReturnAmount: amountOutMin || 0n, flags: 0, permit: '0x'
      },
      '0x'
    ]);
  }
}

class DexAdapterRegistry {
  constructor(provider) {
    this.provider = provider;
    this.adapters = {
      UNISWAP_V3: new UniversalDexAdapter(this.provider, LIVE.DEXES.UNISWAP_V3),
      UNISWAP_V2: new UniversalDexAdapter(this.provider, LIVE.DEXES.UNISWAP_V2),
      ONE_INCH_V5: new UniversalDexAdapter(this.provider, LIVE.DEXES.ONE_INCH_V5)
    };
    this.cache = new LRUMap(10000);
  }
  getAdapter(name) { const a = this.adapters[name]; if (!a) throw new Error(`Adapter ${name} not found`); return a; }
  getAllAdapters() { return Object.entries(this.adapters).map(([name, adapter]) => ({ name, config: adapter.config, type: adapter.type })); }
  async getBestQuote(tokenIn, tokenOut, amountIn) {
    const key = `q_${tokenIn}_${tokenOut}_${amountIn}`;
    const cached = this.cache.get(key); if (cached && Date.now() - cached.ts < 1500) return cached.result;
    const quotes = [];
    await Promise.allSettled(Object.entries(this.adapters).map(async ([name, adapter]) => {
      try {
        const q = await adapter.getQuote(tokenIn, tokenOut, amountIn);
        if (q && q.amountOut > 0n) quotes.push({ dex: name, ...q, adapter });
      } catch {}
    }));
    quotes.sort((a,b)=> Number(b.amountOut - a.amountOut));
    const result = { best: quotes[0] || null, secondBest: quotes[1] || quotes[0] || null, all: quotes };
    this.cache.set(key, { result, ts: Date.now() });
    return result;
  }
}

/* =========================================================================
   Approvals
   ========================================================================= */

async function ensureApprovals(signer) {
  const erc20Iface = new ethers.Interface(['function approve(address,uint256) returns (bool)','function allowance(address,address) view returns (uint256)']);
  const tokens = [LIVE.TOKENS.BWAEZI, LIVE.TOKENS.USDC, LIVE.TOKENS.WETH];
  const spenders = [LIVE.DEXES.UNISWAP_V3.router, LIVE.DEXES.UNISWAP_V3.positionManager];
  for (const token of tokens) {
    const c = new ethers.Contract(token, erc20Iface, signer);
    for (const sp of spenders) {
      try {
        const allowance = await c.allowance(signer.address, sp);
        if (allowance < ethers.MaxUint256 / 2n) {
          const tx = await c.approve(sp, ethers.MaxUint256);
          await tx.wait();
          console.log(`Approved ${token} -> ${sp}`);
        }
      } catch (e) { console.warn(`Approval failed: ${token} -> ${sp}: ${e.message}`); }
    }
  }
}

/* =========================================================================
   Entropy shock detector
   ========================================================================= */

class EntropyShockDetector {
  constructor() { this.lastEntropy = null; }
  sample(entropyValue, coherence) {
    const now = Date.now();
    const shock = this.lastEntropy ? Math.abs(entropyValue - this.lastEntropy.value) : 0;
    this.lastEntropy = { value: entropyValue, coherence, ts: now };
    return { shock, coherence, ts: now };
  }
  slippageGuard(baseSlip, coherence, shock) {
    const slip = Math.min(0.02, Math.max(baseSlip, baseSlip + (1 - coherence) * 0.01 + Math.min(shock, 0.05) * 0.5));
    return slip;
  }
}

/* =========================================================================
   Composite anchor oracle (liquidity-weighted)
   ========================================================================= */

class MultiAnchorOracle {
  constructor(provider, dexRegistry) {
    this.provider = provider;
    this.dexRegistry = dexRegistry;
    this.anchors = LIVE.ANCHORS;
  }
  async getCompositePriceUSD(bwaeziAddr) {
    const components = [];
    for (const a of this.anchors) {
      const amountProbe = a.decimals === 6 ? ethers.parseUnits('1000', 6) : ethers.parseEther('1');
      const q = await this.dexRegistry.getBestQuote(bwaeziAddr, a.address, amountProbe);
      if (!q?.best) continue;
      const quoteOut = q.best.amountOut;
      const liquidityScore = Number(q.best.liquidity || '0');
      const usd = await this.anchorUSD(a);
      const perUnit = (Number(quoteOut) / Number(amountProbe)) * usd;
      components.push({ symbol: a.symbol, perUnitUSD: perUnit, weight: liquidityScore });
    }
    if (components.length === 0) return { price: LIVE.PEG.TARGET_USD, confidence: 0.2, components: [] };
    const totalWeight = components.reduce((s, c) => s + (c.weight || 1), 0);
    const price = components.reduce((s, c) => s + c.perUnitUSD * ((c.weight || 1) / totalWeight), 0);
    const confidence = Math.min(1, Math.max(0.2, totalWeight / (1e9))); // heuristic
    return { price, confidence, components };
  }
  async anchorUSD(a) {
    if (a.symbol === 'USDC') return 1.0;
    if (a.symbol === 'DAI') return 1.0;
    if (a.symbol === 'USDT') return 1.0;
    if (a.symbol === 'WETH') return 2000.0;
    return 1.0;
  }
}

/* =========================================================================
   Fee farming
   ========================================================================= */

class FeeFarmer {
  constructor(provider, signer) {
    this.provider = provider;
    this.signer = signer;
    this.npm = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.positionManager, [
      'function collect((uint256,address,uint128,uint128)) returns (uint256 amount0, uint256 amount1)'
    ], signer);
    this.positions = new Map();
    this.recentCollections = [];
  }
  trackPosition(positionId, note = '') {
    if (!this.positions.has(positionId)) this.positions.set(positionId, { lastCollectedAt: 0, note });
  }
  async collectFees(positionId) {
    try {
      const tx = await this.npm.collect({ tokenId: positionId, recipient: LIVE.SCW_ADDRESS, amount0Max: ethers.MaxUint128, amount1Max: ethers.MaxUint128 });
      const rec = await tx.wait();
      const r = { positionId, txHash: rec.transactionHash, timestamp: Date.now() };
      this.recentCollections.push(r);
      const p = this.positions.get(positionId); if (p) { p.lastCollectedAt = Date.now(); this.positions.set(positionId, p); }
      return r;
    } catch (e) { console.warn(`Fee collect failed pos ${positionId}: ${e.message}`); return null; }
  }
  getRecent() { return this.recentCollections.slice(-50); }
}

/* =========================================================================
   Adaptive range-maker (streaming mints)
   ========================================================================= */

class AdaptiveRangeMaker {
  constructor(provider, signer, dexRegistry, entropy) {
    this.provider = provider; this.signer = signer; this.dexRegistry = dexRegistry; this.entropy = entropy;
    this.npm = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.positionManager, [
      'function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) returns (uint256,uint128,uint256,uint256)'
    ], signer);
    this.runningStreams = new Map();
    this.lastAdjust = 0;
  }
  async startStreamingMint({ token0, token1, tickLower, tickUpper, total0, total1, steps = LIVE.MAKER.MAX_STREAM_STEPS, label = 'maker_stream' }) {
    const streamId = `stream_${Date.now()}_${randomUUID().slice(0,8)}`;
    const chunk0 = total0 > 0n ? total0 / BigInt(steps) : 0n;
    const chunk1 = total1 > 0n ? total1 / BigInt(steps) : 0n;
    this.runningStreams.set(streamId, { token0, token1, tickLower, tickUpper, chunk0, chunk1, steps, done: 0, label, positions: [] });
    (async () => {
      while (true) {
        const st = this.runningStreams.get(streamId);
        if (!st) break;
        if (st.done >= st.steps) { this.runningStreams.delete(streamId); break; }
        const coherence = Math.max(0.2, (this.entropy.lastEntropy?.coherence ?? 0.6));
        const delayMs = Math.floor(8000 * (1.2 - coherence));
        try {
          const mintTx = await this.npm.mint({
            token0: st.token0, token1: st.token1, fee: LIVE.PEG.FEE_TIER_DEFAULT,
            tickLower: st.tickLower, tickUpper: st.tickUpper,
            amount0Desired: st.chunk0, amount1Desired: st.chunk1,
            amount0Min: 0, amount1Min: 0, recipient: LIVE.SCW_ADDRESS,
            deadline: Math.floor(Date.now()/1000)+1200
          });
          const rec = await mintTx.wait();
          st.positions.push({ txHash: rec.transactionHash, at: Date.now() });
        } catch (e) { console.warn(`Streaming mint error: ${e.message}`); }
        st.done++; this.runningStreams.set(streamId, st);
        await new Promise(r=>setTimeout(r, delayMs));
      }
    })();
    return { streamId };
  }
  async periodicAdjustRange(bwaeziAddr) {
    const now = Date.now();
    if (now - this.lastAdjust < LIVE.MAKER.RANGE_ADJUST_INTERVAL_MS) return null;
    this.lastAdjust = now;
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const pool = await factory.getPool(bwaeziAddr, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT);
    if (!pool || pool === ethers.ZeroAddress) return { adjusted: false, reason: 'no_pool' };
    const poolC = new ethers.Contract(pool, ['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'], this.provider);
    const slot0 = await poolC.slot0();
    const tick = Number(slot0[1]);
    const coherence = Math.max(0.2, this.entropy.lastEntropy?.coherence ?? 0.6);
    const width = Math.floor(600 * (coherence < LIVE.MAKER.ENTROPY_COHERENCE_MIN ? 1.5 : 0.8));
    const tickLower = tick - width, tickUpper = tick + width;
    const total0 = LIVE.MAKER.STREAM_CHUNK_BWAEZI * 4n;
    const total1 = LIVE.MAKER.STREAM_CHUNK_USDC * 4n;
    const stream = await this.startStreamingMint({ token0: LIVE.TOKENS.BWAEZI, token1: LIVE.TOKENS.USDC, tickLower, tickUpper, total0, total1, steps: 4, label: 'periodic_adjust' });
    return { adjusted: true, tick, tickLower, tickUpper, coherence, streamId: stream.streamId };
  }
  listStreams() { return Array.from(this.runningStreams.entries()).map(([id, st]) => ({ id, ...st })); }
}

/* =========================================================================
   MEV executor
   ========================================================================= */

class MevExecutor {
  constructor(aa, provider) { this.aa = aa; this.provider = provider; this.scw = LIVE.SCW_ADDRESS; }
  buildSCWExecute(target, calldata, value = 0n) {
    const i = new ethers.Interface(['function execute(address,uint256,bytes) returns (bytes)']);
    return i.encodeFunctionData('execute', [target, value, calldata]);
  }
  async sendCall(calldata, opts = {}) {
    const userOp = await this.aa.createUserOp(calldata, {
      callGasLimit: opts.gasLimit || 1_600_000n,
      verificationGasLimit: 1_000_000n,
      preVerificationGas: 90_000n
    });
    userOp.paymasterAndData = await this.aa.sponsorUserOpViaHttp(userOp).catch(()=> '0x');
    const signed = await this.aa.signUserOp(userOp);
    const txHash = await this.aa.sendUserOpWithBackoff(signed, 5);
    return { txHash, timestamp: Date.now(), description: opts.description || 'scw_execute' };
  }
}

/* =========================================================================
   Profit verification + decision packets
   ========================================================================= */

class ProfitVerifier {
  constructor(provider) {
    this.provider = provider;
    this.tradeRecords = new LRUMap(10000);
    this.profitLedger = new Map();
    this.recentPackets = [];
  }
  async recordTrade(trade, txHash, decisionPacket) {
    const id = `trade_${Date.now()}_${randomUUID().slice(0,8)}`;
    const initial = await this.captureState(trade);
    const rec = { id, trade, txHash, initial, status: 'pending', packet: decisionPacket };
    this.tradeRecords.set(id, rec);
    this.recentPackets.push({ id, ...decisionPacket, at: Date.now() });
    if (this.recentPackets.length > 200) this.recentPackets.shift();
    return id;
  }
  async verifyTrade(id) {
    const rec = this.tradeRecords.get(id);
    if (!rec) throw new Error('Record not found');
    const final = await this.captureState(rec.trade);
    const profit = await this.calculateProfit(rec.initial, final, rec.trade);
    rec.final = final; rec.profit = profit; rec.status = 'verified'; rec.verifiedAt = Date.now();
    this.updateLedger(id, profit);
    this.tradeRecords.set(id, rec);
    return { recordId: id, profit, timestamp: Date.now() };
  }
  async captureState(trade) {
    const balances = {};
    for (const token of [trade.tokenA, trade.tokenB]) {
      if (!token) continue;
      const contract = new ethers.Contract(token, ['function balanceOf(address) view returns (uint256)'], this.provider);
      balances[token] = await contract.balanceOf(LIVE.SCW_ADDRESS);
    }
    const ethBalance = await this.provider.getBalance(LIVE.SCW_ADDRESS);
    return { balances, ethBalance, blockNumber: await this.provider.getBlockNumber(), timestamp: Date.now() };
  }
  async calculateProfit(initial, final, trade) {
    const tokenProfits = {};
    for (const token of [trade.tokenA, trade.tokenB]) {
      if (!token) continue;
      tokenProfits[token] = (final.balances[token] || 0n) - (initial.balances[token] || 0n);
    }
    let totalUsdProfit = 0;
    for (const [token, amount] of Object.entries(tokenProfits)) {
      if (amount === 0n) continue;
      totalUsdProfit += await this.convertToUSD(token, amount);
    }
    const gasCostUsd = await this.estimateGasCostUSD(800_000n);
    totalUsdProfit -= gasCostUsd;
    return { tokenProfits, totalUsdProfit, gasCostUsd, netProfitUsd: totalUsdProfit };
  }
  async convertToUSD(token, amount) {
    const dec = token === LIVE.TOKENS.USDC || token === LIVE.TOKENS.USDT ? 6 : 18;
    const amt = Number(ethers.formatUnits(amount, dec));
    if (token === LIVE.TOKENS.USDC || token === LIVE.TOKENS.USDT || token === LIVE.TOKENS.DAI) return amt * 1.0;
    if (token === LIVE.TOKENS.WETH) return amt * 2000.0;
    return amt * LIVE.PEG.TARGET_USD;
  }
  async estimateGasCostUSD(gasUsed) {
    try {
      const gasPrice = await chain.getFeeData();
      const gasEth = Number(ethers.formatEther(gasUsed * gasPrice.maxFeePerGas));
      const ethUsd = 2000.0;
      return gasEth * ethUsd;
    } catch { return 0; }
  }
  updateLedger(id, profit) {
    const date = new Date().toISOString().split('T')[0];
    const d = this.profitLedger.get(date) || { totalProfit: 0, trades: 0, gasCosts: 0, netProfit: 0 };
    d.trades++; d.totalProfit += profit.totalUsdProfit || 0; d.gasCosts += profit.gasCostUsd || 0; d.netProfit = d.totalProfit - d.gasCosts;
    this.profitLedger.set(date, d);
  }
  getDailyReport(date = null) {
    const target = date || new Date().toISOString().split('T')[0];
    return this.profitLedger.get(target) || { totalProfit: 0, trades: 0, gasCosts: 0, netProfit: 0 };
  }
  getAllTimeStats() {
    const s = { totalProfit: 0, trades: 0, gasCosts: 0, netProfit: 0 };
    for (const d of this.profitLedger.values()) { s.totalProfit += d.totalProfit; s.trades += d.trades; s.gasCosts += d.gasCosts; s.netProfit += d.netProfit; }
    return s;
  }
  getRecentDecisionPackets(limit = 50) { return this.recentPackets.slice(-limit); }
}

/* =========================================================================
   Strategy engine
   ========================================================================= */

function entropySeed(e) {
  try {
    const h = createHash('sha256').update(`${e.value}:${e.coherence}:${e.timestamp}`).digest();
    return h.readUInt32BE(0) / 0xFFFFFFFF;
  } catch { return Math.random(); }
}

class StrategyEngine {
  constructor(mev, verifier, provider, dexRegistry, entropy, maker, oracle) {
    this.mev = mev; this.verifier = verifier; this.provider = provider; this.dexRegistry = dexRegistry;
    this.entropy = entropy; this.maker = maker; this.oracle = oracle;
    this.lastPegEnforcement = 0;
  }

  async neuroState() { return { activation: 0.7, plasticity: 0.8, attentionFocus: 0.6 }; }
  async verifierEntropy() { return { coherence: 0.85, gradient: 0.3, value: 0.42, timestamp: Date.now() }; }
  async gravityField() { return { curvature: 0.15 }; }
  async elementRegime() {
    const regimes = ['WATER','FIRE','VACUUM','EARTH'];
    return regimes[Math.floor(Math.random()*regimes.length)];
  }

  async arbitrage(tokenIn, tokenOut, notional) {
    const best = await this.dexRegistry.getBestQuote(tokenIn, tokenOut, notional);
    if (!best?.best) return null;
    const slip = this.entropy.slippageGuard(0.0025, this.entropy.lastEntropy?.coherence ?? 0.6, 0.0);
    const minOut = BigInt(Math.floor(Number(best.best.amountOut) * (1 - slip)));
    const calldata = await best.best.adapter.buildSwapCalldata({
      tokenIn, tokenOut, amountIn: notional, amountOutMin: minOut, recipient: LIVE.SCW_ADDRESS, fee: best.best.fee || LIVE.PEG.FEE_TIER_DEFAULT
    });
    const execCalldata = this.mev.buildSCWExecute(LIVE.DEXES[best.best.dex]?.router || LIVE.DEXES.UNISWAP_V3.router, calldata);
    const decisionPacket = { mode: 'arbitrage', dex: best.best.dex, slip, minOut: minOut.toString(), entropy: this.entropy.lastEntropy };
    const op = await this.mev.sendCall(execCalldata, { description: 'arbitrage' });
    const tradeId = await this.verifier.recordTrade({ tokenA: tokenIn, tokenB: tokenOut, amountIn: notional }, op.txHash, decisionPacket);
    await this.verifier.verifyTrade(tradeId);
    return { txHash: op.txHash, decisionPacket };
  }

  async opportunisticRebalance(buyBWAEZI = true, usdNotional = 25000) {
    const adapter = this.dexRegistry.getAdapter('UNISWAP_V3');
    const amountInUSDC = ethers.parseUnits(String(usdNotional), 6);
    const q = await adapter.getQuote(LIVE.TOKENS.USDC, LIVE.TOKENS.BWAEZI, amountInUSDC);
    const slip = this.entropy.slippageGuard(0.003, this.entropy.lastEntropy?.coherence ?? 0.6, 0.0);
    const amountOutMin = q?.amountOut ? BigInt(Math.floor(Number(q.amountOut) * (1 - slip))) : 0n;

    const calldata = await adapter.buildSwapCalldata({
      tokenIn: buyBWAEZI ? LIVE.TOKENS.USDC : LIVE.TOKENS.BWAEZI,
      tokenOut: buyBWAEZI ? LIVE.TOKENS.BWAEZI : LIVE.TOKENS.USDC,
      amountIn: amountInUSDC, amountOutMin, recipient: LIVE.SCW_ADDRESS, fee: LIVE.PEG.FEE_TIER_DEFAULT
    });
    const exec = this.mev.buildSCWExecute(LIVE.DEXES.UNISWAP_V3.router, calldata);
    const composite = await this.oracle.getCompositePriceUSD(LIVE.TOKENS.BWAEZI);
    const decisionPacket = { mode: 'rebalance', buyBWAEZI, usdNotional, compositePriceUSD: composite.price, confidence: composite.confidence, slip, entropy: this.entropy.lastEntropy };
    const result = await this.mev.sendCall(exec, { description: 'rebalance_bwaezi' });
    const recId = await this.verifier.recordTrade({ tokenA: buyBWAEZI ? LIVE.TOKENS.USDC : LIVE.TOKENS.BWAEZI, tokenB: buyBWAEZI ? LIVE.TOKENS.BWAEZI : LIVE.TOKENS.USDC, amountIn: amountInUSDC }, result.txHash, decisionPacket);
    await this.verifier.verifyTrade(recId);
    return { txHash: result.txHash, decisionPacket };
  }

  async enforcePegIfNeeded() {
    const now = Date.now();
    if (now - this.lastPegEnforcement < 8000) return null;
    this.lastPegEnforcement = now;

    const entropyValue = Number(createHash('sha256').update(String(now)).digest().readUInt32BE(0)) / 0xFFFFFFFF;
    const coherence = 0.6 + 0.3 * Math.sin(now / 60_000);
    const sample = this.entropy.sample(entropyValue, coherence);

    const composite = await this.oracle.getCompositePriceUSD(LIVE.TOKENS.BWAEZI);
    const deviationPct = ((composite.price - LIVE.PEG.TARGET_USD) / LIVE.PEG.TARGET_USD) * 100;
    const decisionPacket = {
      mode: 'peg_enforcement',
      observedPriceUSD: composite.price,
      confidence: composite.confidence,
      targetUSD: LIVE.PEG.TARGET_USD,
      deviationPct,
      entropy: sample
    };

    const threshold = composite.confidence < 0.5 ? 0.6 : 0.35;
    if (Math.abs(deviationPct) < threshold) return { action: 'NOOP', decisionPacket };

    const buy = composite.price < LIVE.PEG.TARGET_USD;
    const usdNotional = Math.round(20000 * (1 + Math.min(0.8, Math.abs(deviationPct) / 10)));
    const res = await this.opportunisticRebalance(buy, usdNotional);
    return { action: buy ? 'BUY_BWAEZI' : 'SELL_BWAEZI', txHash: res.txHash, decisionPacket: { ...decisionPacket, ...res.decisionPacket } };
  }
}

/* =========================================================================
   Genesis (safe)
   ========================================================================= */

class GenesisSelfLiquiditySingularity {
  constructor(provider, signer, strategy) { this.provider = provider; this.signer = signer; this.strategy = strategy; this.active = false; }
  async executeIrreversibleSingularity() {
    if (this.active) return { alreadyActive: true };
    const npm = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.positionManager, [
      'function mint((address,address,uint24,int24,int24,uint256,uint256,uint256,uint256,address,uint256)) payable returns (uint256,uint128,uint256,uint256)'
    ], this.signer);
    const bw = new ethers.Contract(LIVE.TOKENS.BWAEZI, ['function approve(address,uint256)'], this.signer);
    const usdc = new ethers.Contract(LIVE.TOKENS.USDC, ['function approve(address,uint256)'], this.signer);
    await (await bw.approve(LIVE.DEXES.UNISWAP_V3.positionManager, ethers.MaxUint256)).wait();
    await (await usdc.approve(LIVE.DEXES.UNISWAP_V3.positionManager, ethers.MaxUint256)).wait();
    const tickLower = -120, tickUpper = 120;
    const initTx = await npm.mint({
      token0: LIVE.TOKENS.BWAEZI, token1: LIVE.TOKENS.USDC, fee: LIVE.PEG.FEE_TIER_DEFAULT,
      tickLower, tickUpper,
      amount0Desired: LIVE.PEG.GENESIS_BWAEZI_INIT, amount1Desired: LIVE.PEG.GENESIS_MIN_USDC,
      amount0Min: 0, amount1Min: 0, recipient: this.signer.address, deadline: Math.floor(Date.now()/1000)+1800
    });
    const initReceipt = await initTx.wait();
    const factory = new ethers.Contract(LIVE.DEXES.UNISWAP_V3.factory, ['function getPool(address,address,uint24) view returns (address)'], this.provider);
    const pool = await factory.getPool(LIVE.TOKENS.BWAEZI, LIVE.TOKENS.USDC, LIVE.PEG.FEE_TIER_DEFAULT);
    const poolC = new ethers.Contract(pool, ['function slot0() view returns (uint160,int24,uint16,uint16,uint16,uint8,bool)'], this.provider);
    const slot0 = await poolC.slot0();
    const expand = await this.strategy.maker.startStreamingMint({
      token0: LIVE.TOKENS.BWAEZI,
      token1: LIVE.TOKENS.USDC,
      tickLower: Number(slot0[1]) - 600,
      tickUpper: Number(slot0[1]) + 600,
      total0: LIVE.PEG.SEED_BWAEZI_EXPAND,
      total1: 0n,
      steps: 6,
      label: 'genesis_expand'
    });
    this.active = true;
    return { genesisTx: initReceipt.transactionHash, expansionStream: expand.streamId };
  }
}

/* =========================================================================
   Core
   ========================================================================= */

class ProductionSovereignCore extends EventEmitter {
  constructor() {
    super();
    this.provider = chain.getProvider();
    this.signer = new ethers.Wallet(process.env.SOVEREIGN_PRIVATE_KEY, this.provider);
    this.aa = new EnterpriseAASDK(this.signer);
    this.dexRegistry = new DexAdapterRegistry(this.provider);
    this.entropy = new EntropyShockDetector();
    this.maker = new AdaptiveRangeMaker(this.provider, this.signer, this.dexRegistry, this.entropy);
    this.oracle = new MultiAnchorOracle(this.provider, this.dexRegistry);
    this.mev = new MevExecutor(this.aa, this.provider);
    this.verifier = new ProfitVerifier(this.provider);
    this.strategy = new StrategyEngine(this.mev, this.verifier, this.provider, this.dexRegistry, this.entropy, this.maker, this.oracle);
    this.feeFarmer = new FeeFarmer(this.provider, this.signer);
    this.stats = { startTs: Date.now(), tradesExecuted: 0, totalRevenueUSD: 0, currentDayUSD: 0, lastProfitUSD: 0, pegActions: 0, streamsActive: 0 };
    this.status = 'INIT';
    this.loops = [];
  }

  async initialize() {
    console.log('SOVEREIGN MEV BRAIN v13.5 — Booting');
    await ensureApprovals(this.signer);
    const genesis = new GenesisSelfLiquiditySingularity(this.provider, this.signer, this.strategy);
    const anchor = await genesis.executeIrreversibleSingularity();
    if (!anchor.alreadyActive) console.log('Genesis anchored:', anchor);

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

    // Peg enforcement loop
    this.loops.push(setInterval(async () => {
      try {
        const res = await this.strategy.enforcePegIfNeeded();
        if (!res || res.action === 'NOOP') return;
        this.stats.pegActions++;
        const daily = this.verifier.getDailyReport();
        this.stats.currentDayUSD = daily.netProfit || 0;
        this.stats.totalRevenueUSD += daily.netProfit || 0;
        console.log(`Peg ${res.action} tx=${res.txHash}`);
      } catch (e) { console.warn('peg loop error:', e.message); }
    }, 10_000));

    this.status = 'SOVEREIGN_LIVE';
  }

  getStats() {
    const hours = Math.max(0.01, (Date.now() - this.stats.startTs) / 3600000);
    const projectedDaily = (this.stats.currentDayUSD / hours) * 24;
    return {
      system: { status: this.status, version: 'v13.5 — Maker+Composite+AA' },
      trading: {
        tradesExecuted: this.stats.tradesExecuted,
        totalRevenueUSD: this.stats.totalRevenueUSD,
        currentDayUSD: this.stats.currentDayUSD,
        projectedDaily
      },
      peg: { actions: this.stats.pegActions, targetUSD: LIVE.PEG.TARGET_USD },
      maker: { streamsActive: this.stats.streamsActive }
    };
  }
}

/* =========================================================================
   API
   ========================================================================= */

class APIServer {
  constructor(core, port = 8081) { this.core = core; this.port = port; this.app = express(); this.server = null; this.setupRoutes(); }
  setupRoutes() {
    this.app.get('/', (req,res) => {
      const s = this.core.getStats();
      res.send(`
        <h1>SOVEREIGN MEV BRAIN v13.5 — LIVE</h1>
        <p>Status: ${s.system.status}</p>
        <p>Trades Executed: ${s.trading.tradesExecuted}</p>
        <p>Revenue Today: $${(s.trading.currentDayUSD||0).toFixed(2)}</p>
        <p>Projected Daily: $${(s.trading.projectedDaily||0).toFixed(2)}</p>
        <p>Peg actions: ${s.peg.actions} | Target $${s.peg.targetUSD}</p>
        <p>Streams Active: ${s.maker.streamsActive}</p>
        <meta http-equiv="refresh" content="10">
      `);
    });
    this.app.get('/status', (req,res)=> res.json(this.core.getStats()));
    this.app.get('/anchors/composite', async (req,res)=> {
      try {
        const r = await this.core.oracle.getCompositePriceUSD(LIVE.TOKENS.BWAEZI);
        res.json({ priceUSD: r.price, confidence: r.confidence, components: r.components, ts: Date.now() });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
    this.app.get('/maker/streams', (req,res)=> res.json({ streams: this.core.maker.listStreams(), ts: Date.now() }));
    this.app.get('/fees/recent', (req,res)=> res.json({ collections: this.core.feeFarmer.getRecent(), ts: Date.now() }));
    this.app.get('/trades/recent', (req,res)=> res.json({ decisions: this.core.verifier.getRecentDecisionPackets(100), ts: Date.now() }));
    this.app.get('/dex/list', (req,res)=> res.json({ adapters: this.core.dexRegistry.getAllAdapters(), ts: Date.now() }));
    this.app.get('/dex/health', async (req,res)=> {
      const adapters = this.core.dexRegistry.getAllAdapters();
      const probeA = LIVE.TOKENS.WETH, probeB = LIVE.TOKENS.USDC, amount = ethers.parseEther('0.01');
      const checks = await Promise.all(adapters.map(async (a) => {
        try { const q = await this.core.dexRegistry.getAdapter(a.name).getQuote(probeA, probeB, amount); return { name: a.name, ok: !!q, liquidity: q?.liquidity ?? '0' }; }
        catch { return { name: a.name, ok: false, liquidity: '0' }; }
      }));
      res.json({ count: checks.length, checks, timestamp: Date.now() });
    });
    this.app.post('/routes/preview', express.json(), async (req,res)=> {
      try {
        const { tokenIn, tokenOut, amount } = req.body || {};
        const ain = BigInt(amount || '0');
        const quotes = await this.core.dexRegistry.getBestQuote(tokenIn, tokenOut, ain);
        res.json({ quotes, ts: Date.now() });
      } catch (e) { res.status(500).json({ error: e.message }); }
    });
  }
  async start() { this.server = this.app.listen(this.port, ()=> console.log(`🌐 API server on :${this.port}`)); }
}

/* =========================================================================
   Bootstrap
   ========================================================================= */

if (import.meta.url === `file://${process.argv[1]}`) {
  (async ()=>{
    try {
      const core = new ProductionSovereignCore();
      await core.initialize();
      const api = new APIServer(core, process.env.PORT ? Number(process.env.PORT) : 8081);
      await api.start();
      console.log('🚀 Sovereign MEV Brain v13.5 — ONLINE');
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
  chain
};

export default ProductionSovereignCore;
