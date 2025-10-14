// modules/oracle-integration.js
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { BWAEZI_CHAIN } from '../config/bwaezi-config.js';

export class OracleIntegration {
  constructor(config = {}) {
    this.config = {
      dataSources: ['coingecko', 'chainlink', 'band'],
      updateInterval: 30000,
      fallbackEnabled: true,
      priceFeeds: ['BTC/USD', 'ETH/USD', 'BWZ/USD'],
      ...config
    };
    this.priceFeeds = new Map();
    this.db = new ArielSQLiteEngine({ path: './oracle-integration.db' });
    this.events = new EventEmitter();
    this.sovereignService = null;
    this.serviceId = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await this.db.init();
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS price_feeds (
        pair TEXT PRIMARY KEY,
        price REAL NOT NULL,
        source TEXT NOT NULL,
        confidence REAL DEFAULT 1.0,
        lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS oracle_requests (
        id TEXT PRIMARY KEY,
        requester TEXT NOT NULL,
        dataType TEXT NOT NULL,
        parameters TEXT NOT NULL,
        response TEXT,
        status TEXT DEFAULT 'pending',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sovereignService = new SovereignRevenueEngine();
    await this.sovereignService.initialize();
    
    this.serviceId = await this.sovereignService.registerService({
      name: 'OracleIntegration',
      description: 'Decentralized oracle service for BWAEZI Chain',
      registrationFee: 2500,
      annualLicenseFee: 1200,
      revenueShare: 0.16
    });

    this.startPriceUpdates();
    this.initialized = true;
    this.events.emit('initialized');
  }

  async updatePrice(pair, source = 'coingecko') {
    if (!this.initialized) await this.initialize();
    
    try {
      const price = await this.fetchPriceFromSource(pair, source);
      const confidence = await this.calculateConfidence(pair, source, price);

      await this.db.run(`
        INSERT OR REPLACE INTO price_feeds (pair, price, source, confidence, lastUpdated)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [pair, price, source, confidence]);

      this.priceFeeds.set(pair, { price, source, confidence, lastUpdated: Date.now() });

      if (this.sovereignService && this.serviceId) {
        await this.sovereignService.processRevenue(this.serviceId, 0.01, 'price_update');
      }

      this.events.emit('priceUpdated', { pair, price, source, confidence });
      return { price, confidence };
    } catch (error) {
      if (this.config.fallbackEnabled) {
        return await this.fallbackPriceUpdate(pair, source);
      }
      throw error;
    }
  }

  async fetchPriceFromSource(pair, source) {
    // Simulated price fetch - in production would call actual APIs
    const basePrices = {
      'BTC/USD': 45000 + (Math.random() * 1000),
      'ETH/USD': 3000 + (Math.random() * 100),
      'BWZ/USD': 1.50 + (Math.random() * 0.1)
    };
    return basePrices[pair] || 1.0;
  }

  async calculateConfidence(pair, source, price) {
    // Simulated confidence calculation
    const sourceReliability = { 'coingecko': 0.95, 'chainlink': 0.99, 'band': 0.92 };
    return sourceReliability[source] || 0.90;
  }

  async fallbackPriceUpdate(pair, failedSource) {
    const fallbackSources = this.config.dataSources.filter(s => s !== failedSource);
    for (const source of fallbackSources) {
      try {
        return await this.updatePrice(pair, source);
      } catch (error) {
        continue;
      }
    }
    throw new Error(`All price sources failed for ${pair}`);
  }

  startPriceUpdates() {
    setInterval(async () => {
      for (const pair of this.config.priceFeeds) {
        await this.updatePrice(pair);
      }
    }, this.config.updateInterval);
  }

  async getPrice(pair) {
    if (!this.initialized) await this.initialize();
    
    const feed = this.priceFeeds.get(pair);
    if (feed) return feed;

    const record = await this.db.get(
      'SELECT * FROM price_feeds WHERE pair = ? ORDER BY lastUpdated DESC LIMIT 1',
      [pair]
    );
    
    if (record) {
      this.priceFeeds.set(pair, {
        price: record.price,
        source: record.source,
        confidence: record.confidence,
        lastUpdated: new Date(record.lastUpdated).getTime()
      });
    }

    return record || null;
  }

  async getStats() {
    if (!this.initialized) await this.initialize();
    
    const totalFeeds = await this.db.get('SELECT COUNT(*) as count FROM price_feeds');
    const activeFeeds = await this.db.get('SELECT COUNT(DISTINCT pair) as count FROM price_feeds');

    return {
      totalFeeds: totalFeeds?.count || 0,
      activeFeeds: activeFeeds?.count || 0,
      supportedPairs: this.config.priceFeeds,
      chain: BWAEZI_CHAIN.NAME,
      initialized: this.initialized
    };
  }
}

export default OracleIntegration;
