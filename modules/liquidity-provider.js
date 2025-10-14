// modules/liquidity-provider.js
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { BWAEZI_CHAIN } from '../config/bwaezi-config.js';

export class LiquidityProvider {
  constructor(config = {}) {
    this.config = {
      supportedDexes: ['uniswap', 'pancakeswap', 'sushiswap'],
      minLiquidity: 1000,
      maxSlippage: 0.5,
      rebalanceThreshold: 0.1,
      ...config
    };
    this.liquidityPools = new Map();
    this.providerPositions = new Map();
    this.db = new ArielSQLiteEngine({ path: './liquidity-provider.db' });
    this.events = new EventEmitter();
    this.sovereignService = null;
    this.serviceId = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await this.db.init();
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS liquidity_pools (
        id TEXT PRIMARY KEY,
        dex TEXT NOT NULL,
        tokenA TEXT NOT NULL,
        tokenB TEXT NOT NULL,
        poolAddress TEXT NOT NULL,
        totalLiquidity REAL DEFAULT 0,
        apr REAL DEFAULT 0,
        isActive BOOLEAN DEFAULT true,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS provider_positions (
        id TEXT PRIMARY KEY,
        poolId TEXT NOT NULL,
        provider TEXT NOT NULL,
        tokenAAmount REAL NOT NULL,
        tokenBAmount REAL NOT NULL,
        liquidityTokens REAL NOT NULL,
        feesEarned REAL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sovereignService = new SovereignRevenueEngine();
    await this.sovereignService.initialize();
    
    this.serviceId = await this.sovereignService.registerService({
      name: 'LiquidityProvider',
      description: 'Automated liquidity provision for BWAEZI Chain',
      registrationFee: 3000,
      annualLicenseFee: 1500,
      revenueShare: 0.14
    });

    await this.initializeLiquidityPools();
    this.startLiquidityMonitoring();
    this.initialized = true;
    this.events.emit('initialized');
  }

  async initializeLiquidityPools() {
    const defaultPools = [
      {
        id: 'bwzC_eth_uni',
        dex: 'uniswap',
        tokenA: 'bwzC',
        tokenB: 'ETH',
        poolAddress: '0x742C2F0B6Ee409E8C0e34F5d6aD0A8f2936e57A4',
        totalLiquidity: 1000000,
        apr: 15.5
      },
      {
        id: 'bwzC_usdt_pancake',
        dex: 'pancakeswap',
        tokenA: 'bwzC',
        tokenB: 'USDT',
        poolAddress: '0x842C2F0B6Ee409E8C0e34F5d6aD0A8f2936e57A5',
        totalLiquidity: 500000,
        apr: 12.3
      }
    ];

    for (const pool of defaultPools) {
      await this.db.run(`
        INSERT OR REPLACE INTO liquidity_pools (id, dex, tokenA, tokenB, poolAddress, totalLiquidity, apr, isActive)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [pool.id, pool.dex, pool.tokenA, pool.tokenB, pool.poolAddress, pool.totalLiquidity, pool.apr, true]);
      this.liquidityPools.set(pool.id, pool);
    }
  }

  async addLiquidity(poolId, provider, tokenAAmount, tokenBAmount) {
    if (!this.initialized) await this.initialize();
    
    const pool = await this.getPool(poolId);
    if (!pool || !pool.isActive) {
      throw new Error(`Liquidity pool not found or inactive: ${poolId}`);
    }

    if (tokenAAmount < this.config.minLiquidity || tokenBAmount < this.config.minLiquidity) {
      throw new Error(`Liquidity amount below minimum: ${this.config.minLiquidity}`);
    }

    const positionId = randomBytes(16).toString('hex');
    const liquidityTokens = await this.calculateLiquidityTokens(pool, tokenAAmount, tokenBAmount);

    await this.db.run(`
      INSERT INTO provider_positions (id, poolId, provider, tokenAAmount, tokenBAmount, liquidityTokens)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [positionId, poolId, provider, tokenAAmount, tokenBAmount, liquidityTokens]);

    await this.updatePoolLiquidity(poolId, tokenAAmount, tokenBAmount, liquidityTokens);

    this.providerPositions.set(positionId, {
      poolId, provider, tokenAAmount, tokenBAmount, liquidityTokens, feesEarned: 0, createdAt: Date.now()
    });

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, tokenAAmount * 0.001, 'liquidity_addition');
    }

    this.events.emit('liquidityAdded', { positionId, poolId, provider, tokenAAmount, tokenBAmount });
    return positionId;
  }

  async calculateLiquidityTokens(pool, tokenAAmount, tokenBAmount) {
    const totalLiquidity = pool.totalLiquidity || 1;
    const positionValue = tokenAAmount + tokenBAmount;
    return (positionValue / totalLiquidity) * 100;
  }

  async updatePoolLiquidity(poolId, tokenAChange, tokenBChange, liquidityChange) {
    await this.db.run(`
      UPDATE liquidity_pools 
      SET totalLiquidity = totalLiquidity + ?
      WHERE id = ?
    `, [liquidityChange, poolId]);

    const pool = this.liquidityPools.get(poolId);
    if (pool) {
      pool.totalLiquidity += liquidityChange;
    }
  }

  async getPool(poolId) {
    if (this.liquidityPools.has(poolId)) {
      return this.liquidityPools.get(poolId);
    }

    const pool = await this.db.get('SELECT * FROM liquidity_pools WHERE id = ?', [poolId]);
    if (pool) {
      this.liquidityPools.set(poolId, pool);
    }
    return pool;
  }

  startLiquidityMonitoring() {
    setInterval(async () => {
      await this.harvestFees();
      await this.rebalanceLiquidity();
    }, 5 * 60 * 1000);
  }

  async harvestFees() {
    const positions = await this.db.all('SELECT * FROM provider_positions');
    
    for (const position of positions) {
      const fees = await this.calculateAccruedFees(position);
      if (fees > 0) {
        await this.db.run(`
          UPDATE provider_positions 
          SET feesEarned = feesEarned + ?
          WHERE id = ?
        `, [fees, position.id]);

        if (this.sovereignService && this.serviceId) {
          await this.sovereignService.processRevenue(this.serviceId, fees * 0.05, 'fee_harvesting');
        }

        this.events.emit('feesHarvested', { positionId: position.id, fees });
      }
    }
  }

  async calculateAccruedFees(position) {
    const pool = await this.getPool(position.poolId);
    const timeSinceCreation = Date.now() - position.createdAt;
    const days = timeSinceCreation / (24 * 60 * 60 * 1000);
    return (position.liquidityTokens * pool.apr * days) / 36500;
  }

  async rebalanceLiquidity() {
    const pools = await this.db.all('SELECT * FROM liquidity_pools WHERE isActive = true');
    
    for (const pool of pools) {
      const positions = await this.db.all('SELECT * FROM provider_positions WHERE poolId = ?', [pool.id]);
      for (const position of positions) {
        await this.checkAndRebalancePosition(position);
      }
    }
  }

  async checkAndRebalancePosition(position) {
    // Simplified rebalance logic
    const currentRatio = 1.0; // Would calculate actual ratio
    const positionRatio = position.tokenAAmount / position.tokenBAmount;
    const deviation = Math.abs((positionRatio - currentRatio) / currentRatio);
    
    if (deviation > this.config.rebalanceThreshold) {
      console.log(`Rebalancing position ${position.id}`);
    }
  }

  async getStats() {
    if (!this.initialized) await this.initialize();
    
    const totalPools = await this.db.get('SELECT COUNT(*) as count FROM liquidity_pools WHERE isActive = true');
    const totalPositions = await this.db.get('SELECT COUNT(*) as count FROM provider_positions');
    const totalLiquidity = await this.db.get('SELECT SUM(totalLiquidity) as liquidity FROM liquidity_pools');

    return {
      totalPools: totalPools?.count || 0,
      totalPositions: totalPositions?.count || 0,
      totalLiquidity: totalLiquidity?.liquidity || 0,
      supportedDexes: this.config.supportedDexes,
      chain: BWAEZI_CHAIN.NAME,
      initialized: this.initialized
    };
  }
}

export default LiquidityProvider;
