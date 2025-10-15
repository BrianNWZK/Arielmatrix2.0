// modules/decentralized-exchange.js
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import SovereignRevenueEngine from './sovereign-revenue-engine.js';
import { BWAEZI_CHAIN } from '../config/bwaezi-config.js';

export class DecentralizedExchange {
  constructor(config = {}) {
    this.config = {
      tradingPairs: ['bwzC/ETH', 'bwzC/USDT', 'ETH/USDT'],
      feePercentage: 0.3,
      minTradeAmount: 0.001,
      priceImpactProtection: 2.0,
      ...config
    };
    this.tradingPairs = new Map();
    this.orderBooks = new Map();
    this.db = new ArielSQLiteEngine({ path: './decentralized-exchange.db' });
    this.events = new EventEmitter();
    this.sovereignService = null;
    this.serviceId = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await this.db.init();
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS trading_pairs (
        pair TEXT PRIMARY KEY,
        baseAsset TEXT NOT NULL,
        quoteAsset TEXT NOT NULL,
        minPrice DECIMAL(18,8),
        maxPrice DECIMAL(18,8),
        priceDecimals INTEGER DEFAULT 8,
        isActive BOOLEAN DEFAULT true,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS limit_orders (
        id TEXT PRIMARY KEY,
        pair TEXT NOT NULL,
        type TEXT NOT NULL,
        price DECIMAL(18,8) NOT NULL,
        amount DECIMAL(18,8) NOT NULL,
        filledAmount DECIMAL(18,8) DEFAULT 0,
        status TEXT DEFAULT 'open',
        maker TEXT NOT NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        pair TEXT NOT NULL,
        price DECIMAL(18,8) NOT NULL,
        amount DECIMAL(18,8) NOT NULL,
        takerOrderId TEXT NOT NULL,
        makerOrderId TEXT NOT NULL,
        fee DECIMAL(18,8) NOT NULL,
        taker TEXT NOT NULL,
        maker TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sovereignService = new SovereignRevenueEngine();
    await this.sovereignService.initialize();
    
    this.serviceId = await this.sovereignService.registerService({
      name: 'DecentralizedExchange',
      description: 'Decentralized exchange for BWAEZI Chain',
      registrationFee: 6000,
      annualLicenseFee: 3000,
      revenueShare: 0.2
    });

    await this.initializeTradingPairs();
    this.startOrderMatching();
    this.initialized = true;
    this.events.emit('initialized');
  }

  async initializeTradingPairs() {
    for (const pair of this.config.tradingPairs) {
      const [baseAsset, quoteAsset] = pair.split('/');
      await this.db.run(`
        INSERT OR REPLACE INTO trading_pairs (pair, baseAsset, quoteAsset, isActive)
        VALUES (?, ?, ?, ?)
      `, [pair, baseAsset, quoteAsset, true]);
      
      this.tradingPairs.set(pair, { baseAsset, quoteAsset, isActive: true });
      this.orderBooks.set(pair, { bids: [], asks: [] });
    }
  }

  async createLimitOrder(pair, type, price, amount, maker) {
    if (!this.initialized) await this.initialize();
    
    await this.validateOrder(pair, type, price, amount);

    const orderId = randomBytes(32).toString('hex');
    await this.db.run(`
      INSERT INTO limit_orders (id, pair, type, price, amount, maker)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [orderId, pair, type, price, amount, maker]);

    const order = { id: orderId, pair, type, price, amount, filledAmount: 0, status: 'open', maker };
    
    const orderBook = this.orderBooks.get(pair);
    if (type === 'buy') {
      orderBook.bids.push(order);
      orderBook.bids.sort((a, b) => b.price - a.price);
    } else {
      orderBook.asks.push(order);
      orderBook.asks.sort((a, b) => a.price - b.price);
    }

    this.events.emit('orderCreated', { orderId, pair, type, price, amount, maker });
    return orderId;
  }

  async validateOrder(pair, type, price, amount) {
    if (!this.tradingPairs.has(pair)) {
      throw new Error(`Trading pair not supported: ${pair}`);
    }
    if (amount < this.config.minTradeAmount) {
      throw new Error(`Amount below minimum trade amount: ${this.config.minTradeAmount}`);
    }
    if (price <= 0) {
      throw new Error('Price must be positive');
    }
  }

  startOrderMatching() {
    setInterval(async () => {
      for (const [pair, orderBook] of this.orderBooks) {
        await this.matchOrders(pair, orderBook);
      }
    }, 1000);
  }

  async matchOrders(pair, orderBook) {
    while (orderBook.bids.length > 0 && orderBook.asks.length > 0) {
      const bestBid = orderBook.bids[0];
      const bestAsk = orderBook.asks[0];

      if (bestBid.price >= bestAsk.price) {
        const tradeAmount = Math.min(bestBid.amount - bestBid.filledAmount, bestAsk.amount - bestAsk.filledAmount);
        const tradePrice = bestAsk.price;

        await this.executeTrade(pair, bestBid, bestAsk, tradeAmount, tradePrice);

        if (bestBid.filledAmount >= bestBid.amount) {
          orderBook.bids.shift();
        }
        if (bestAsk.filledAmount >= bestAsk.amount) {
          orderBook.asks.shift();
        }
      } else {
        break;
      }
    }
  }

  async executeTrade(pair, bidOrder, askOrder, amount, price) {
    const tradeId = randomBytes(32).toString('hex');
    const fee = amount * price * (this.config.feePercentage / 100);

    await this.db.run(`
      INSERT INTO trades (id, pair, price, amount, takerOrderId, makerOrderId, fee, taker, maker)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [tradeId, pair, price, amount, bidOrder.id, askOrder.id, fee, bidOrder.maker, askOrder.maker]);

    await this.updateOrderFilledAmount(bidOrder.id, amount);
    await this.updateOrderFilledAmount(askOrder.id, amount);

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, fee, 'trade_execution');
    }

    this.events.emit('tradeExecuted', {
      tradeId, pair, price, amount, fee,
      taker: bidOrder.maker, maker: askOrder.maker
    });
  }

  async updateOrderFilledAmount(orderId, filledAmount) {
    await this.db.run(`
      UPDATE limit_orders 
      SET filledAmount = filledAmount + ?, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [filledAmount, orderId]);

    const order = await this.getOrder(orderId);
    if (order && order.filledAmount >= order.amount) {
      await this.db.run(`UPDATE limit_orders SET status = 'filled' WHERE id = ?`, [orderId]);
    }
  }

  async getOrder(orderId) {
    return await this.db.get('SELECT * FROM limit_orders WHERE id = ?', [orderId]);
  }

  async getOrderBook(pair, depth = 50) {
    if (!this.initialized) await this.initialize();
    
    const bids = await this.db.all(`
      SELECT * FROM limit_orders 
      WHERE pair = ? AND type = 'buy' AND status = 'open'
      ORDER BY price DESC LIMIT ?
    `, [pair, depth]);

    const asks = await this.db.all(`
      SELECT * FROM limit_orders 
      WHERE pair = ? AND type = 'sell' AND status = 'open'
      ORDER BY price ASC LIMIT ?
    `, [pair, depth]);

    return { bids, asks };
  }

  async getRecentTrades(pair, limit = 100) {
    if (!this.initialized) await this.initialize();
    
    return await this.db.all(`
      SELECT * FROM trades 
      WHERE pair = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `, [pair, limit]);
  }

  async getStats() {
    if (!this.initialized) await this.initialize();
    
    const totalTrades = await this.db.get('SELECT COUNT(*) as count FROM trades');
    const totalVolume = await this.db.get('SELECT SUM(amount * price) as volume FROM trades');
    const totalFees = await this.db.get('SELECT SUM(fee) as fees FROM trades');

    return {
      totalTrades: totalTrades?.count || 0,
      totalVolume: totalVolume?.volume || 0,
      totalFees: totalFees?.fees || 0,
      tradingPairs: this.config.tradingPairs,
      chain: BWAEZI_CHAIN.NAME,
      initialized: this.initialized
    };
  }
}

export default DecentralizedExchange;
