// backend/agents/cryptoAgent.js

import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { ArielSQLiteEngine } from '../../modules/ariel-sqlite-engine/index.js';
import { AutonomousAIEngine } from './autonomous-ai-engine.js';
import ccxt from 'ccxt';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import Web3 from 'web3';
import { Connection } from '@solana/web3.js';
import apiScoutAgent from './apiScoutAgent.js';
import { QuantumBrowserManager } from './browserManager.js';
import {
  initializeConnections,
    getWalletBalances,
    getWalletAddresses,
    sendSOL,
    sendETH,
    sendUSDT,
    processRevenuePayment,
    checkBlockchainHealth,
    validateAddress,
    formatBalance,
    testAllConnections,
} from './wallet.js';

class apiScoutAgentExtension {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.apiScout = new apiScoutAgent(config, logger);
  }

  async initialize() {
    this.logger.info('🧠 Initializing apiScoutAgentExtension...');
    await this.apiScout.initialize();
  }

  async executeAcrossAllTargets() {
    const discoveredTargets = await this.apiScout.discoverAllAvailableTargets();

    for (const target of discoveredTargets) {
      try {
        const credentials = await this.apiScout.discoverCredentials(target.type, target.domain);

        if (credentials?.apiKey) {
          this.logger.info(`🔑 Retrieved API key for ${target.type}: ${credentials.apiKey}`);
          await this._executeTargetLogic(target, credentials.apiKey);
        } else {
          this.logger.warn(`⚠️ No valid API key retrieved for ${target.type}`);
        }
      } catch (error) {
        this.logger.error(`❌ Error executing ${target.type}: ${error.message}`);
      }
    }
  }

  async _executeTargetLogic(target, apiKey) {
    const handler = await this.apiScout.loadHandlerFor(target.type);
    if (!handler || typeof handler.execute !== 'function') {
      throw new Error(`No executable handler found for ${target.type}`);
    }

    const result = await handler.execute(apiKey);
    this.logger.info(`📊 Execution result for ${target.type}: ${JSON.stringify(result)}`);
  }
}

class EnhancedCryptoAgent {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.blockchain = BrianNwaezikeChain;
    this.aiEngine = new AutonomousAIEngine(config, logger);
    this.db = new ArielSQLiteEngine('./data/crypto_agent.db');
    this.exchanges = new Map();
    this.lastStatus = 'idle';
    this.lastExecutionTime = null;
    this.lastTotalTransactions = 0;
    this.lastConceptualEarnings = 0;
    this.lastGasBalance = 0;
    this.walletInitialized = false;
    this.activeStrategies = new Map();
    this.performanceMetrics = new Map();
    this.browserManager = new BrowserManager(config, logger);
    this.chainConnections = {};
  }

  // Database initialization
  async initDatabases() {
    await this.db.init();

    const queries = [
      `CREATE TABLE IF NOT EXISTS crypto_trades (
        id TEXT PRIMARY KEY, symbol TEXT, type TEXT, amount REAL, price REAL,
        exchange TEXT, tx_hash TEXT, profit_loss REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
        id TEXT PRIMARY KEY, symbol TEXT, buy_exchange TEXT, sell_exchange TEXT,
        buy_price REAL, sell_price REAL, potential_profit REAL, executed BOOLEAN DEFAULT FALSE,
        actual_profit REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS market_data (
        id TEXT PRIMARY KEY, symbol TEXT, price REAL, volume_24h REAL,
        change_24h REAL, source TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS wallet_transactions (
        id TEXT PRIMARY KEY, chain TEXT, type TEXT, from_address TEXT, to_address TEXT,
        amount REAL, token TEXT, tx_hash TEXT, status TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS strategy_performance (
        id TEXT PRIMARY KEY, strategy_name TEXT, total_profit REAL, total_trades INTEGER,
        success_rate REAL, sharpe_ratio REAL, max_drawdown REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS risk_metrics (
        id TEXT PRIMARY KEY, value_at_risk REAL, expected_shortfall REAL,
        volatility REAL, correlation_matrix TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS dex_liquidity (
        id TEXT PRIMARY KEY, chain TEXT, pool_address TEXT, token0 TEXT, token1 TEXT,
        liquidity REAL, volume_24h REAL, fee_tier REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS wallet_payments (
        id TEXT PRIMARY KEY, payment_type TEXT, chain TEXT, token TEXT, amount REAL,
        recipient TEXT, tx_hash TEXT, status TEXT, fee REAL, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const sql of queries) {
      await this.db.run(sql);
    }
  }

  // Main initialization method
  async initialize() {
    this.logger.info('🚀 Initializing EnhancedCryptoAgent...');

    try {
      await this.initDatabases();
      await walletManager.initializeConnections();
      this.walletInitialized = true;

      await this.browserManager.initialize();
      await this.initializeExchanges();
      await this.blockchain.getLatestBlock();
      await this.aiEngine.initialize();
      await this.initializeTradingStrategies();
      await this.initializeChainConnections();

      this.logger.info('✅ EnhancedCryptoAgent initialized successfully');
    } catch (error) {
      this.logger.error(`❌ Initialization failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculates the optimal trade size based on minimum thresholds.
   * @param {number} tradeSize - Proposed trade size.
   * @param {number} minTradeSize - Minimum allowed trade size.
   * @returns {number} - The adjusted trade size.
   */
  calculateOptimalTradeSize(tradeSize, minTradeSize) {
    try {
      return Math.max(tradeSize, minTradeSize);
    } catch (error) {
      this.logger.error(`❌ Error calculating optimal trade size: ${error.message}`);
      return 0;
    }
  }

    /**
   * Uses the AI engine to evaluate trade viability.
   * @param {object} marketData - Real-time market data.
   * @returns {boolean} - Whether to proceed with trade.
   */
  async evaluateTradeWithAI(marketData) {
    try {
      const decision = await this.aiEngine.analyzeMarket(marketData);
      this.logger.info(`🧠 AI decision: ${decision.action}`);
      return decision.action === 'buy' || decision.action === 'sell';
    } catch (error) {
      this.logger.error(`❌ AI evaluation failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Logs a trade record to the local SQLite database.
   * @param {object} tradeDetails - Trade metadata.
   */
  async logTradeToDatabase(tradeDetails) {
    try {
      await this.db.insert('trades', tradeDetails);
      this.logger.info(`📘 Trade logged: ${JSON.stringify(tradeDetails)}`);
    } catch (error) {
      this.logger.error(`❌ Failed to log trade: ${error.message}`);
    }
  }

  /**
   * Checks Ethereum wallet balance using Web3.
   * @param {string} walletAddress - Ethereum wallet address.
   * @returns {string} - Balance in ETH.
   */
  async getEthereumBalance(walletAddress) {
    try {
      const balanceWei = await this.web3.eth.getBalance(walletAddress);
      const balanceEth = this.web3.utils.fromWei(balanceWei, 'ether');
      this.logger.info(`💰 ETH Balance: ${balanceEth}`);
      return balanceEth;
    } catch (error) {
      this.logger.error(`❌ Failed to fetch ETH balance: ${error.message}`);
      return '0';
    }
  }

  /**
   * Checks Solana wallet balance using Solana RPC.
   * @param {string} walletAddress - Solana wallet address.
   * @returns {number} - Balance in SOL.
   */
  async getSolanaBalance(walletAddress) {
    try {
      const balanceLamports = await this.solanaConnection.getBalance(new PublicKey(walletAddress));
      const balanceSol = balanceLamports / 1e9;
      this.logger.info(`💰 SOL Balance: ${balanceSol}`);
      return balanceSol;
    } catch (error) {
      this.logger.error(`❌ Failed to fetch SOL balance: ${error.message}`);
      return 0;
    }
  }

  
  // Initialize cryptocurrency exchanges
  async initializeExchanges() {
    const exchangeConfigs = [
      { id: 'binance', class: ccxt.binance },
      { id: 'coinbase', class: ccxt.coinbasepro },
      { id: 'kraken', class: ccxt.kraken },
      { id: 'kucoin', class: ccxt.kucoin },
      { id: 'huobi', class: ccxt.huobipro },
      { id: 'okex', class: ccxt.okex },
      { id: 'bitfinex', class: ccxt.bitfinex },
      { id: 'bybit', class: ccxt.bybit },
      { id: 'gateio', class: ccxt.gateio },
      { id: 'mexc', class: ccxt.mexc }
    ];

    for (const config of exchangeConfigs) {
      const id = config.id;
      const ExchangeClass = config.class;
      
      try {
        const exchange = new ExchangeClass({
          apiKey: this.config[`${id.toUpperCase()}_API_KEY`],
          secret: this.config[`${id.toUpperCase()}_API_SECRET`],
          enableRateLimit: true,
          timeout: 30000,
          options: { defaultType: 'spot', adjustForTimeDifference: true }
        });

        await exchange.loadMarkets();
        this.exchanges.set(id, exchange);
        this.logger.info(`✅ Exchange initialized: ${id}`);
      } catch (error) {
        this.logger.error(`❌ Failed to initialize ${id}: ${error.message}`);
      }
    }
  }

  // Initialize blockchain connections
  async initializeChainConnections() {
    this.chainConnections = {
      ethereum: new Web3(this.config.ETHEREUM_RPC_URL),
      solana: new Connection(this.config.SOLANA_RPC_URL, 'confirmed'),
      bsc: new Web3(this.config.BSC_RPC_URL),
      polygon: new Web3(this.config.POLYGON_RPC_URL),
      arbitrum: new Web3(this.config.ARBITRUM_RPC_URL),
      optimism: new Web3(this.config.OPTIMISM_RPC_URL)
    };
    this.logger.info('✅ Blockchain connections established');
  }

  // Initialize trading strategies
  async initializeTradingStrategies() {
    const strategies = [
      {
        name: 'cross_exchange_arbitrage',
        execute: this.executeCrossExchangeArbitrage.bind(this),
        interval: 30000,
        minProfitThreshold: 0.002
      },
      {
        name: 'market_making',
        execute: this.executeMarketMaking.bind(this),
        interval: 60000,
        spread: 0.0015
      },
      {
        name: 'momentum_trading',
        execute: this.executeMomentumTrading.bind(this),
        interval: 120000,
        lookbackPeriod: 20
      },
      {
        name: 'mean_reversion',
        execute: this.executeMeanReversion.bind(this),
        interval: 180000,
        lookbackPeriod: 50
      },
      {
        name: 'volatility_breakout',
        execute: this.executeVolatilityBreakout.bind(this),
        interval: 240000,
        breakoutMultiplier: 2.0
      },
      {
        name: 'dex_arbitrage',
        execute: this.executeDexArbitrage.bind(this),
        interval: 45000,
        minProfitThreshold: 0.015
      },
      {
        name: 'liquidity_provision',
        execute: this.executeLiquidityProvision.bind(this),
        interval: 300000,
        targetPairs: ['ETH/USDT', 'BTC/USDT', 'SOL/USDT']
      }
    ];

    strategies.forEach(strategy => {
      this.activeStrategies.set(strategy.name, strategy);
      this.performanceMetrics.set(strategy.name, {
        totalProfit: 0,
        totalTrades: 0,
        winningTrades: 0,
        maxDrawdown: 0,
        currentDrawdown: 0
      });
    });

    this.logger.info(`✅ ${strategies.length} trading strategies initialized`);
  }

  // Main execution method
  async run() {
    this.lastExecutionTime = new Date().toISOString();
    this.lastStatus = 'running';
    this.logger.info('💰 Running EnhancedCryptoAgent...');

    try {
      const balances = await walletManager.getWalletBalances();
      this.logger.info(`💼 Wallet balances: ${JSON.stringify(balances)}`);

      const marketData = await this.fetchMarketData();
      const dexData = await this.fetchDexLiquidityData();
      const optimizedOps = await this.aiEngine.optimizeTradingStrategies(marketData);
      
      const strategyResults = await this.executeAllStrategies(marketData, dexData);
      const crossChainResults = await this.executeCrossChainOperations();
      
      await this.updatePerformanceMetrics(strategyResults);
      await this.executeRiskManagement();
      await this.monitorAndRebalancePositions();
      
      this.lastStatus = 'completed';
      this.logger.info('✅ EnhancedCryptoAgent execution completed successfully');
      
      return {
        strategyResults,
        crossChainResults,
        marketData: marketData.length,
        dexData: dexData.length,
        timestamp: this.lastExecutionTime
      };
    } catch (error) {
      this.lastStatus = 'error';
      this.logger.error(`❌ Execution failed: ${error.message}`);
      throw error;
    }
  }

  // Fetch market data from exchanges
  async fetchMarketData() {
    const marketData = [];
    const symbols = [
      'BTC/USDT', 'ETH/USDT', 'BNB/USDT', 'SOL/USDT', 'XRP/USDT',
      'ADA/USDT', 'DOGE/USDT', 'MATIC/USDT', 'DOT/USDT', 'LTC/USDT',
      'AVAX/USDT', 'LINK/USDT', 'ATOM/USDT', 'UNI/USDT', 'XLM/USDT'
    ];
    
    for (const [exchangeId, exchange] of this.exchanges) {
      for (const symbol of symbols) {
        try {
          const ticker = await exchange.fetchTicker(symbol);
          const ohlcv = await exchange.fetchOHLCV(symbol, '1m', undefined, 100);
          const orderBook = await exchange.fetchOrderBook(symbol, 50);
          
          marketData.push({
            exchange: exchangeId,
            symbol,
            price: ticker.last,
            volume: ticker.quoteVolume,
            timestamp: ticker.timestamp,
            ohlcv,
            orderBook,
            spread: (orderBook.asks[0][0] - orderBook.bids[0][0]) / orderBook.asks[0][0],
            liquidity: orderBook.bids[0][1] + orderBook.asks[0][1]
          });
          
          await this.db.run(
            `INSERT INTO market_data (id, symbol, price, volume_24h, change_24h, source) 
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uuidv4(), symbol, ticker.last, ticker.quoteVolume, ticker.percentage, exchangeId]
          );
        } catch (error) {
          this.logger.warn(`⚠️ Failed to fetch ${symbol} from ${exchangeId}: ${error.message}`);
        }
      }
    }
    return marketData;
  }

  // Execute all trading strategies
  async executeAllStrategies(marketData, dexData) {
    const results = [];
    
    for (const [strategyName, strategy] of this.activeStrategies) {
      try {
        this.logger.info(`🎯 Executing strategy: ${strategyName}`);
        let result;
        
        if (strategyName === 'dex_arbitrage' || strategyName === 'liquidity_provision') {
          result = await strategy.execute(dexData);
        } else {
          result = await strategy.execute(marketData);
        }
        
        results.push({ strategy: strategyName, ...result });
        
        const metrics = this.performanceMetrics.get(strategyName);
        metrics.totalTrades += result.trades || 0;
        metrics.totalProfit += result.profit || 0;
        if (result.profit > 0) metrics.winningTrades++;
      } catch (error) {
        this.logger.error(`❌ Strategy ${strategyName} failed: ${error.message}`);
        results.push({ strategy: strategyName, error: error.message });
      }
    }
    return results;
  }

  // Cross-exchange arbitrage strategy
  async executeCrossExchangeArbitrage(marketData) {
    const opportunities = [];
    const minProfitThreshold = this.activeStrategies.get('cross_exchange_arbitrage').minProfitThreshold;
    
    const symbolData = {};
    marketData.forEach(data => {
      if (!symbolData[data.symbol]) symbolData[data.symbol] = [];
      symbolData[data.symbol].push(data);
    });
    
    for (const [symbol, exchangesData] of Object.entries(symbolData)) {
      if (exchangesData.length < 2) continue;
      
      let bestBuy = { price: Infinity, exchange: null, liquidity: 0 };
      let bestSell = { price: 0, exchange: null, liquidity: 0 };
      
      for (const data of exchangesData) {
        if (data.orderBook.bids[0][0] > bestSell.price && data.liquidity > 10000) {
          bestSell = { price: data.orderBook.bids[0][0], exchange: data.exchange, liquidity: data.liquidity };
        }
        if (data.orderBook.asks[0][0] < bestBuy.price && data.liquidity > 10000) {
          bestBuy = { price: data.orderBook.asks[0][0], exchange: data.exchange, liquidity: data.liquidity };
        }
      }
      
      const profitPercentage = (bestSell.price - bestBuy.price) / bestBuy.price;
      const fees = await this.calculateTradingFees(bestBuy.exchange, bestSell.exchange);
      const netProfit = profitPercentage - fees;
      
      if (netProfit > minProfitThreshold && bestBuy.exchange !== bestSell.exchange) {
        const opportunity = {
          symbol,
          buyExchange: bestBuy.exchange,
          sellExchange: bestSell.exchange,
          buyPrice: bestBuy.price,
          sellPrice: bestSell.price,
          potentialProfit: netProfit,
          buyLiquidity: bestBuy.liquidity,
          sellLiquidity: bestSell.liquidity,
          timestamp: Date.now()
        };
        
        opportunities.push(opportunity);
        
        await this.db.run(
          `INSERT INTO arbitrage_opportunities (id, symbol, buy_exchange, sell_exchange, buy_price, sell_price, potential_profit)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), symbol, bestBuy.exchange, bestSell.exchange, bestBuy.price, bestSell.price, netProfit]
        );
        
        if (this.config.AUTO_EXECUTE_ARBITRAGE && netProfit > minProfitThreshold * 1.5) {
          await this.executeArbitrageTrade(opportunity);
        }
      }
    }
    
    return { opportunities: opportunities.length, profit: opportunities.reduce((sum, opp) => sum + opp.potentialProfit, 0) };
  }

  // Calculate trading fees
  async calculateTradingFees(buyExchangeId, sellExchangeId) {
    const feeRates = {
      binance: 0.001, coinbase: 0.005, kraken: 0.0026, kucoin: 0.001,
      huobi: 0.002, okex: 0.0015, bitfinex: 0.002, bybit: 0.001,
      gateio: 0.002, mexc: 0.002
    };
    return (feeRates[buyExchangeId] || 0.002) + (feeRates[sellExchangeId] || 0.002);
  }

  // Execute arbitrage trade
  async executeArbitrageTrade(opportunity) {
    try {
      const buyExchange = this.exchanges.get(opportunity.buyExchange);
      const sellExchange = this.exchanges.get(opportunity.sellExchange);
      
      if (!buyExchange || !sellExchange) {
        throw new Error('Exchange not available');
      }
      
      const tradeSize = await this.calculateOptimalTradeSizeForArbitrage(opportunity);
      if (tradeSize <= 0) {
        throw new Error('Insufficient balance for arbitrage');
      }
      
      const buyOrder = await buyExchange.createOrder(
        opportunity.symbol,
        'limit',
        'buy',
        tradeSize,
        opportunity.buyPrice * 1.001
      );
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const sellOrder = await sellExchange.createOrder(
        opportunity.symbol,
        'limit',
        'sell',
        tradeSize,
        opportunity.sellPrice * 0.999
      );
      
      const buyCost = buyOrder.price * buyOrder.amount;
      const sellProceeds = sellOrder.price * sellOrder.amount;
      const fees = buyCost * 0.001 + sellProceeds * 0.001;
      const actualProfit = sellProceeds - buyCost - fees;
      
      await this.db.run(
        `INSERT INTO crypto_trades (id, symbol, type, amount, price, exchange, tx_hash, profit_loss)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), opportunity.symbol, 'arbitrage', tradeSize, opportunity.buyPrice, 
         `${opportunity.buyExchange}-${opportunity.sellExchange}`, `${buyOrder.id}-${sellOrder.id}`, 
         actualProfit]
      );
      
      await this.db.run(
        `UPDATE arbitrage_opportunities SET executed = TRUE, actual_profit = ? WHERE symbol = ? AND buy_exchange = ? AND sell_exchange = ?`,
        [actualProfit, opportunity.symbol, opportunity.buyExchange, opportunity.sellExchange]
      );
      
      this.logger.info(`✅ Arbitrage executed: ${actualProfit.toFixed(4)} profit on ${opportunity.symbol}`);
      return { success: true, profit: actualProfit };
    } catch (error) {
      this.logger.error(`❌ Arbitrage execution failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Calculate optimal trade size for arbitrage
  async calculateOptimalTradeSizeForArbitrage(opportunity) {
    const minTradeSize = 50;
    const maxTradeSize = 5000;
    const riskPerTrade = 0.02;
    
    try {
      const buyExchange = this.exchanges.get(opportunity.buyExchange);
      const balance = await buyExchange.fetchBalance();
      const availableBalance = balance.USDT ? balance.USDT.free : 0;
      
      const tradeSize = Math.min(
        availableBalance * riskPerTrade / opportunity.buyPrice,
        maxTradeSize,
        opportunity.buyLiquidity * 0.1,
        opportunity.sellLiquidity * 0.1
      );
      
      return Math.max(tradeSize, minTradeSize);
    } catch (error) {
      this.logger.error(`❌ Error calculating trade size: ${error.message}`);
      return 0;
    }
  }

  // Market making strategy
  async executeMarketMaking(marketData) {
    const spread = this.activeStrategies.get('market_making').spread;
    const trades = [];
    
    for (const data of marketData.filter(d => d.liquidity > 50000)) {
      try {
        const midPrice = (data.orderBook.bids[0][0] + data.orderBook.asks[0][0]) / 2;
        const bidPrice = midPrice * (1 - spread);
        const askPrice = midPrice * (1 + spread);
        
        const exchange = this.exchanges.get(data.exchange);
        if (!exchange) continue;
        
        const balance = await exchange.fetchBalance();
        const baseCurrency = data.symbol.split('/')[0];
        const quoteCurrency = data.symbol.split('/')[1];
        
        if (balance[baseCurrency]?.free > 0.1 * data.orderBook.asks[0][1]) {
          const sellOrder = await exchange.createOrder(
            data.symbol,
            'limit',
            'sell',
            Math.min(balance[baseCurrency].free * 0.1, data.orderBook.asks[0][1] * 0.05),
            askPrice
          );
          trades.push({ type: 'sell', price: askPrice, amount: sellOrder.amount });
        }
        
        if (balance[quoteCurrency]?.free > bidPrice * data.orderBook.bids[0][1] * 0.1) {
          const buyOrder = await exchange.createOrder(
            data.symbol,
            'limit',
            'buy',
            Math.min(balance[quoteCurrency].free / bidPrice * 0.1, data.orderBook.bids[0][1] * 0.05),
            bidPrice
          );
          trades.push({ type: 'buy', price: bidPrice, amount: buyOrder.amount });
        }
      } catch (error) {
        this.logger.warn(`⚠️ Market making failed for ${data.symbol}: ${error.message}`);
      }
    }
    
    return { trades: trades.length, details: trades };
  }

  // Momentum trading strategy
  async executeMomentumTrading(marketData) {
    const trades = [];
    const lookbackPeriod = this.activeStrategies.get('momentum_trading').lookbackPeriod;
    
    for (const data of marketData) {
      try {
        if (data.ohlcv.length < lookbackPeriod + 1) continue;
        
        const recentPrices = data.ohlcv.slice(-lookbackPeriod).map(candle => candle[4]);
        const momentum = (recentPrices[recentPrices.length - 1] / recentPrices[0] - 1) * 100;
        
        if (Math.abs(momentum) > 2) {
          const exchange = this.exchanges.get(data.exchange);
          if (!exchange) continue;
          
          const order = await exchange.createOrder(
            data.symbol,
            'market',
            momentum > 0 ? 'buy' : 'sell',
            this.calculatePositionSize(data.price, 0.05),
            null
          );
          
          trades.push({
            symbol: data.symbol,
            direction: momentum > 0 ? 'long' : 'short',
            momentum,
            price: data.price,
            amount: order.amount
          });
        }
      } catch (error) {
        this.logger.warn(`⚠️ Momentum trading failed for ${data.symbol}: ${error.message}`);
      }
    }
    
    return { trades: trades.length, details: trades };
  }

  // Calculate position size
  calculatePositionSize(price, riskPercentage = 0.02) {
    const accountSize = 10000;
    return (accountSize * riskPercentage) / price;
  }

  // Mean reversion strategy
  async executeMeanReversion(marketData) {
    const trades = [];
    const lookbackPeriod = this.activeStrategies.get('mean_reversion').lookbackPeriod;
    
    for (const data of marketData) {
      try {
        if (data.ohlcv.length < lookbackPeriod + 1) continue;
        
        const recentPrices = data.ohlcv.slice(-lookbackPeriod).map(candle => candle[4]);
        const mean = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
        const currentPrice = data.price;
        const deviation = (currentPrice - mean) / mean;
        
        if (Math.abs(deviation) > 0.03) {
          const exchange = this.exchanges.get(data.exchange);
          if (!exchange) continue;
          
          const order = await exchange.createOrder(
            data.symbol,
            'market',
            deviation > 0 ? 'sell' : 'buy',
            this.calculatePositionSize(data.price, 0.03),
            null
          );
          
          trades.push({
            symbol: data.symbol,
            action: deviation > 0 ? 'sell' : 'buy',
            deviation: deviation * 100,
            price: data.price,
            amount: order.amount
          });
        }
      } catch (error) {
        this.logger.warn(`⚠️ Mean reversion failed for ${data.symbol}: ${error.message}`);
      }
    }
    
    return { trades: trades.length, details: trades };
  }

  // Volatility breakout strategy
  async executeVolatilityBreakout(marketData) {
    const trades = [];
    const breakoutMultiplier = this.activeStrategies.get('volatility_breakout').breakoutMultiplier;
    
    for (const data of marketData) {
      try {
        if (data.ohlcv.length < 20) continue;
        
        const recentHigh = Math.max(...data.ohlcv.slice(-20).map(candle => candle[2]));
        const recentLow = Math.min(...data.ohlcv.slice(-20).map(candle => candle[3]));
        const volatility = recentHigh - recentLow;
        const breakoutLevel = data.price + volatility * breakoutMultiplier;
        
        if (data.price > breakoutLevel) {
          const exchange = this.exchanges.get(data.exchange);
          if (!exchange) continue;
          
          const order = await exchange.createOrder(
            data.symbol,
            'market',
            'buy',
            this.calculatePositionSize(data.price, 0.04),
            null
          );
          
          trades.push({
            symbol: data.symbol,
            breakout: true,
            level: breakoutLevel,
            price: data.price,
            amount: order.amount
          });
        }
      } catch (error) {
        this.logger.warn(`⚠️ Volatility breakout failed for ${data.symbol}: ${error.message}`);
      }
    }
    
    return { trades: trades.length, details: trades };
  }

  // Fetch DEX liquidity data
  async fetchDexLiquidityData() {
    const dexData = [];
    const chains = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism'];
    const popularPools = [
      '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', // ETH/USDC
      '0x4585fe77225b41b697c938b018e2ac67ac5a20c0', // WBTC/USDC
      '0x3416cf6c708da44db2624d63ea0aaef7113527c6', // USDC/USDT
      '0x5777d92f208679db4b9778590fa3cab3ac9e2168', // DAI/USDC
      '0x4e68ccd3e89f51c3074ca5072bbac773960dfa36'  // ETH/USDT
    ];
    
    for (const chain of chains) {
      try {
        const response = await axios.get(`https://api.dexscreener.com/latest/dex/pools/${chain}/${popularPools.join(',')}`);
        if (response.data && response.data.pools) {
          for (const pool of response.data.pools) {
            dexData.push({
              chain,
              poolAddress: pool.pairAddress,
              baseToken: pool.baseToken,
              quoteToken: pool.quoteToken,
              liquidity: pool.liquidity?.usd || 0,
              volume24h: pool.volume?.h24 || 0,
              price: pool.priceUsd || 0,
              feeTier: pool.feeTier || 0.003
            });
            
            await this.db.run(
              `INSERT INTO dex_liquidity (id, chain, pool_address, token0, token1, liquidity, volume_24h, fee_tier)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [uuidv4(), chain, pool.pairAddress, pool.baseToken?.symbol, pool.quoteToken?.symbol,
               pool.liquidity?.usd || 0, pool.volume?.h24 || 0, pool.feeTier || 0.003]
            );
          }
        }
      } catch (error) {
        this.logger.warn(`⚠️ Failed to fetch DEX data for ${chain}: ${error.message}`);
      }
    }
    return dexData;
  }

  // DEX arbitrage strategy
  async executeDexArbitrage(dexData) {
    const opportunities = [];
    const minProfitThreshold = this.activeStrategies.get('dex_arbitrage').minProfitThreshold;
    
    const tokenPairs = {};
    dexData.forEach(data => {
      const pairKey = `${data.baseToken.symbol}-${data.quoteToken.symbol}`;
      if (!tokenPairs[pairKey]) tokenPairs[pairKey] = [];
      tokenPairs[pairKey].push(data);
    });
    
    for (const [pair, pools] of Object.entries(tokenPairs)) {
      if (pools.length < 2) continue;
      
      let bestBuy = { price: Infinity, pool: null, liquidity: 0 };
      let bestSell = { price: 0, pool: null, liquidity: 0 };
      
      for (const pool of pools) {
        if (pool.price > bestSell.price && pool.liquidity > 100000) {
          bestSell = { price: pool.price, pool, liquidity: pool.liquidity };
        }
        if (pool.price < bestBuy.price && pool.liquidity > 100000) {
          bestBuy = { price: pool.price, pool, liquidity: pool.liquidity };
        }
      }
      
      const profitPercentage = (bestSell.price - bestBuy.price) / bestBuy.price;
      const fees = bestBuy.pool.feeTier + bestSell.pool.feeTier;
      const netProfit = profitPercentage - fees;
      
      if (netProfit > minProfitThreshold && bestBuy.pool.chain !== bestSell.pool.chain) {
        opportunities.push({
          pair,
          buyChain: bestBuy.pool.chain,
          sellChain: bestSell.pool.chain,
          buyPrice: bestBuy.price,
          sellPrice: bestSell.price,
          potentialProfit: netProfit,
          buyLiquidity: bestBuy.liquidity,
          sellLiquidity: bestSell.liquidity
        });
        
        if (this.config.AUTO_EXECUTE_DEX_ARBITRAGE && netProfit > minProfitThreshold * 1.5) {
          await this.executeDexArbitrageTrade({
            pair,
            buyPool: bestBuy.pool,
            sellPool: bestSell.pool,
            expectedProfit: netProfit
          });
        }
      }
    }
    
    return { opportunities: opportunities.length, profit: opportunities.reduce((sum, opp) => sum + opp.potentialProfit, 0) };
  }

  // Execute DEX arbitrage trade
  async executeDexArbitrageTrade(opportunity) {
    try {
      const { buyPool, sellPool, expectedProfit } = opportunity;
      
      const tradeSize = await this.calculateDexTradeSize(opportunity);
      if (tradeSize <= 0) {
        throw new Error('Insufficient balance for DEX arbitrage');
      }
      
      const buyTxHash = await this.executeDexSwap(
        buyPool.chain,
        buyPool.quoteToken.address,
        buyPool.baseToken.address,
        tradeSize,
        'exactInput'
      );
      
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const sellTxHash = await this.executeDexSwap(
        sellPool.chain,
        sellPool.baseToken.address,
        sellPool.quoteToken.address,
        tradeSize * buyPool.price,
        'exactInput'
      );
      
      const actualProfit = await this.calculateActualProfit(
        tradeSize,
        buyPool.price,
        sellPool.price,
        buyPool.feeTier,
        sellPool.feeTier
      );
      
      this.logger.info(`✅ DEX arbitrage executed: ${actualProfit.toFixed(4)} profit on ${opportunity.pair}`);
      return { success: true, profit: actualProfit, buyTxHash, sellTxHash };
    } catch (error) {
      this.logger.error(`❌ DEX arbitrage execution failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Calculate DEX trade size
  async calculateDexTradeSize(opportunity) {
    const minTradeSize = 100;
    const maxTradeSize = 10000;
    const riskPerTrade = 0.015;
    
    try {
      const balances = await walletManager.getWalletBalances();
      const quoteTokenBalance = balances[opportunity.buyPool.quoteToken.symbol] || 0;
      
      const tradeSize = Math.min(
        quoteTokenBalance * riskPerTrade,
        maxTradeSize,
        opportunity.buyPool.liquidity * 0.05,
        opportunity.sellPool.liquidity * 0.05
      );
      
      return Math.max(tradeSize, minTradeSize);
    } catch (error) {
      this.logger.error(`❌ Error calculating DEX trade size: ${error.message}`);
      return 0;
    }
  }

  // Execute DEX swap
  async executeDexSwap(chain, tokenIn, tokenOut, amount, swapType) {
    try {
      const txHash = await walletManager.executeSwap(chain, tokenIn, tokenOut, amount, swapType);
      this.logger.info(`✅ DEX swap executed on ${chain}: ${txHash}`);
      return txHash;
    } catch (error) {
      throw new Error(`DEX swap failed: ${error.message}`);
    }
  }

  // Calculate actual profit
  async calculateActualProfit(amount, buyPrice, sellPrice, buyFee, sellFee) {
    const buyCost = amount * buyPrice * (1 + buyFee);
    const sellProceeds = amount * sellPrice * (1 - sellFee);
    return sellProceeds - buyCost;
  }

  // Liquidity provision strategy
  async executeLiquidityProvision(dexData) {
    const provisions = [];
    const targetPairs = this.activeStrategies.get('liquidity_provision').targetPairs;
    
    for (const pool of dexData.filter(p => targetPairs.includes(`${p.baseToken.symbol}/${p.quoteToken.symbol}`))) {
      try {
        if (pool.liquidity > 1000000 && pool.volume24h > 500000) {
          const amount = await this.calculateLiquidityAmount(pool);
          if (amount > 0) {
            const txHash = await walletManager.provideLiquidity(
              pool.chain,
              pool.baseToken.address,
              pool.quoteToken.address,
              amount,
              amount / pool.price,
              pool.feeTier
            );
            
            provisions.push({
              chain: pool.chain,
              pair: `${pool.baseToken.symbol}/${pool.quoteToken.symbol}`,
              amount,
              txHash
            });
          }
        }
      } catch (error) {
        this.logger.warn(`⚠️ Liquidity provision failed for ${pool.baseToken.symbol}/${pool.quoteToken.symbol}: ${error.message}`);
      }
    }
    
    return { provisions: provisions.length, details: provisions };
  }

  // Calculate liquidity amount
  async calculateLiquidityAmount(pool) {
    const minProvision = 1000;
    const maxProvision = 20000;
    const provisionPercentage = 0.02;
    
    try {
      const balances = await walletManager.getWalletBalances();
      const baseBalance = balances[pool.baseToken.symbol] || 0;
      const quoteBalance = balances[pool.quoteToken.symbol] || 0;
      
      const provisionAmount = Math.min(
        baseBalance * provisionPercentage,
        quoteBalance * provisionPercentage * pool.price,
        maxProvision
      );
      
      return Math.max(provisionAmount, minProvision);
    } catch (error) {
      this.logger.error(`❌ Error calculating liquidity amount: ${error.message}`);
      return 0;
    }
  }

  // Execute cross-chain operations
  async executeCrossChainOperations() {
    const operations = [];
    const chains = Object.keys(this.chainConnections);
    
    for (const fromChain of chains) {
      for (const toChain of chains) {
        if (fromChain === toChain) continue;
        
        try {
          const bridgeResult = await this.executeCrossChainBridge(fromChain, toChain);
          operations.push(bridgeResult);
        } catch (error) {
          this.logger.warn(`⚠️ Cross-chain bridge from ${fromChain} to ${toChain} failed: ${error.message}`);
        }
      }
    }
    
    return operations;
  }

  // Execute cross-chain bridge
  async executeCrossChainBridge(fromChain, toChain) {
    try {
      const bridgeAmount = await this.calculateBridgeAmount(fromChain);
      if (bridgeAmount <= 0) {
        throw new Error('Insufficient balance for bridging');
      }
      
      const txHash = await walletManager.bridgeAssets(fromChain, toChain, bridgeAmount);
      
      this.logger.info(`✅ Cross-chain bridge executed: ${bridgeAmount} from ${fromChain} to ${toChain}`);
      return { fromChain, toChain, amount: bridgeAmount, txHash };
    } catch (error) {
      throw new Error(`Cross-chain bridge failed: ${error.message}`);
    }
  }

  // Calculate bridge amount
  async calculateBridgeAmount(chain) {
    const minBridge = 50;
    const maxBridge = 5000;
    const bridgePercentage = 0.1;
    
    try {
      const balances = await walletManager.getWalletBalances();
      const chainBalance = balances[chain.toUpperCase()] || 0;
      
      const bridgeAmount = Math.min(chainBalance * bridgePercentage, maxBridge);
      return Math.max(bridgeAmount, minBridge);
    } catch (error) {
      this.logger.error(`❌ Error calculating bridge amount: ${error.message}`);
      return 0;
    }
  }

  // Update performance metrics
  async updatePerformanceMetrics(strategyResults) {
    for (const result of strategyResults) {
      if (result.profit) {
        const metrics = this.performanceMetrics.get(result.strategy);
        metrics.totalProfit += result.profit;
        metrics.totalTrades += result.trades || 0;
        
        await this.db.run(
          `INSERT INTO strategy_performance (id, strategy_name, total_profit, total_trades, success_rate, sharpe_ratio, max_drawdown)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), result.strategy, metrics.totalProfit, metrics.totalTrades,
           metrics.winningTrades / Math.max(metrics.totalTrades, 1), 1.2, metrics.maxDrawdown]
        );
      }
    }
  }

  // Execute risk management
  async executeRiskManagement() {
    try {
      const riskMetrics = await this.calculateRiskMetrics();
      
      await this.db.run(
        `INSERT INTO risk_metrics (id, value_at_risk, expected_shortfall, volatility, correlation_matrix)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), riskMetrics.var, riskMetrics.es, riskMetrics.volatility, JSON.stringify(riskMetrics.correlation)]
      );
      
      if (riskMetrics.var > 0.05) {
        await this.reduceExposure();
      }
      
      this.logger.info('✅ Risk management executed successfully');
    } catch (error) {
      this.logger.error(`❌ Risk management failed: ${error.message}`);
    }
  }

  // Calculate risk metrics
  async calculateRiskMetrics() {
    const trades = await this.db.all(`SELECT profit_loss FROM crypto_trades WHERE timestamp > datetime('now', '-7 day')`);
    const profits = trades.map(t => t.profit_loss || 0);
    
    const mean = profits.reduce((sum, p) => sum + p, 0) / profits.length;
    const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / profits.length;
    const volatility = Math.sqrt(variance);
    
    const sortedProfits = [...profits].sort((a, b) => a - b);
    const varIndex = Math.floor(sortedProfits.length * 0.05);
    const varValue = sortedProfits[varIndex];
    
    const esValue = sortedProfits.slice(0, varIndex).reduce((sum, p) => sum + p, 0) / varIndex;
    
    return {
      var: Math.abs(varValue),
      es: Math.abs(esValue),
      volatility,
      correlation: { BTC: 1, ETH: 0.85, SOL: 0.7 }
    };
  }

  // Reduce exposure
  async reduceExposure() {
    this.logger.warn('⚠️ High risk detected, reducing exposure');
    
    for (const [exchangeId, exchange] of this.exchanges) {
      try {
        const positions = await exchange.fetchPositions();
        for (const position of positions) {
          if (position.notional > 1000) {
            await exchange.createOrder(
              position.symbol,
              'market',
              position.side === 'long' ? 'sell' : 'buy',
              Math.abs(position.contracts) * 0.5
            );
          }
        }
      } catch (error) {
        this.logger.warn(`⚠️ Failed to reduce exposure on ${exchangeId}: ${error.message}`);
      }
    }
  }

  // Monitor and rebalance positions
  async monitorAndRebalancePositions() {
    try {
      const targetAllocation = {
        'BTC/USDT': 0.3,
        'ETH/USDT': 0.25,
        'SOL/USDT': 0.15,
        'Other': 0.3
      };
      
      const currentAllocation = await this.calculateCurrentAllocation();
      const rebalanceActions = this.calculateRebalanceActions(currentAllocation, targetAllocation);
      
      for (const action of rebalanceActions) {
        await this.executeRebalance(action);
      }
      
      this.logger.info('✅ Portfolio rebalanced successfully');
    } catch (error) {
      this.logger.error(`❌ Portfolio rebalancing failed: ${error.message}`);
    }
  }

  // Calculate current allocation
  async calculateCurrentAllocation() {
    const allocation = {};
    let totalValue = 0;
    
    for (const [exchangeId, exchange] of this.exchanges) {
      try {
        const balance = await exchange.fetchBalance();
        const tickers = await exchange.fetchTickers();
        
        for (const [currency, amount] of Object.entries(balance.total)) {
          if (amount > 0) {
            const symbol = currency + '/USDT';
            const price = tickers[symbol]?.last || 1;
            const value = amount * price;
            
            allocation[currency] = (allocation[currency] || 0) + value;
            totalValue += value;
          }
        }
      } catch (error) {
        this.logger.warn(`⚠️ Failed to calculate allocation for ${exchangeId}: ${error.message}`);
      }
    }
    
    for (const currency in allocation) {
      allocation[currency] /= totalValue;
    }
    
    return allocation;
  }

  // Calculate rebalance actions
  calculateRebalanceActions(current, target) {
    const actions = [];
    const threshold = 0.02;
    
    for (const [asset, targetWeight] of Object.entries(target)) {
      const currentWeight = current[asset] || 0;
      const difference = currentWeight - targetWeight;
      
      if (Math.abs(difference) > threshold) {
        actions.push({
          asset,
          action: difference > 0 ? 'sell' : 'buy',
          amount: Math.abs(difference)
        });
      }
    }
    
    return actions;
  }

  // Execute rebalance
  async executeRebalance(action) {
    try {
      for (const [exchangeId, exchange] of this.exchanges) {
        const symbol = action.asset + '/USDT';
        if (exchange.markets[symbol]) {
          const order = await exchange.createOrder(
            symbol,
            'market',
            action.action,
            action.amount
          );
          
          this.logger.info(`✅ Rebalance ${action.action} ${action.amount} ${action.asset} on ${exchangeId}`);
          return order;
        }
      }
    } catch (error) {
      this.logger.warn(`⚠️ Rebalance failed for ${action.asset}: ${error.message}`);
    }
  }

  // Get performance report
  async getPerformanceReport() {
    const strategies = Array.from(this.activeStrategies.keys());
    const report = {};
    
    for (const strategy of strategies) {
      const metrics = this.performanceMetrics.get(strategy);
      const trades = await this.db.all(
        `SELECT COUNT(*) as count, SUM(profit_loss) as total_profit FROM crypto_trades 
         WHERE type = ? AND timestamp > datetime('now', '-1 day')`,
        [strategy]
      );
      
      report[strategy] = {
        totalProfit: metrics?.totalProfit || 0,
        totalTrades: metrics?.totalTrades || 0,
        dailyTrades: trades[0]?.count || 0,
        dailyProfit: trades[0]?.total_profit || 0,
        successRate: metrics ? metrics.winningTrades / Math.max(metrics.totalTrades, 1) : 0
      };
    }
    
    return report;
  }

  // Emergency shutdown
  async emergencyShutdown() {
    this.logger.error('🚨 EMERGENCY SHUTDOWN INITIATED');
    
    for (const [exchangeId, exchange] of this.exchanges) {
      try {
        const openOrders = await exchange.fetchOpenOrders();
        for (const order of openOrders) {
          await exchange.cancelOrder(order.id, order.symbol);
        }
        
        const positions = await exchange.fetchPositions();
        for (const position of positions) {
          if (position.notional > 0) {
            await exchange.createOrder(
              position.symbol,
              'market',
              position.side === 'long' ? 'sell' : 'buy',
              Math.abs(position.contracts)
            );
          }
        }
      } catch (error) {
        this.logger.error(`❌ Emergency shutdown failed on ${exchangeId}: ${error.message}`);
      }
    }
    
    this.lastStatus = 'emergency_shutdown';
    this.logger.info('✅ Emergency shutdown completed');
  }

  // Cleanup
  async cleanup() {
    this.logger.info('🧹 Cleaning up EnhancedCryptoAgent...');
    
    try {
      // Close all exchange connections
      for (const exchange of this.exchanges.values()) {
        try {
          if (exchange.close && typeof exchange.close === 'function') {
            await exchange.close();
          }
        } catch (error) {
          this.logger.warn(`⚠️ Failed to close exchange connection: ${error.message}`);
        }
      }
      
      // Close browser manager
      await this.browserManager.close();
      
      // Close database connection
      this.db.close();
      
      this.logger.info('✅ Cleanup completed');
    } catch (error) {
      this.logger.error(`❌ Cleanup failed: ${error.message}`);
    }
  }
}

export { EnhancedCryptoAgent, apiScoutAgentExtension };
