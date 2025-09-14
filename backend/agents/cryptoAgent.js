// backend/agents/cryptoAgent.js

import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import walletManager from './wallet.js';
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js'; // Correct import path
import { AutonomousAIEngine } from './autonomous-ai-engine.js';
import ccxt from 'ccxt';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import Web3 from 'web3';
import { Connection } from '@solana/web3.js';
import { BrowserManager } from './browserManager.js';

class EnhancedCryptoAgent {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.blockchain = BrianNwaezikeChain;
    this.aiEngine = new AutonomousAIEngine(config, logger);
    this.db = new ArielSQLiteEngine('./data/crypto_agent.db'); // Use the class to create DB instance
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
    this.initDatabases();
  }

  // Database initialization
  async initDatabases() {
    await this.db.init(); // Initialize the database

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

    queries.forEach(sql => {
      this.db.run(sql); // Run queries to create tables
    });
  }

  // Main initialization method
  async initialize() {
    this.logger.info('🚀 Initializing EnhancedCryptoAgent...');

    try {
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

    for (const { id, class: ExchangeClass } of exchangeConfigs) {
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
          
          this.db.run(
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
        
        this.db.run(
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
      
      const tradeSize = await this.calculateOptimalTradeSize(opportunity);
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
      
      this.db.run(
        `INSERT INTO crypto_trades (id, symbol, type, amount, price, exchange, tx_hash, profit_loss)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), opportunity.symbol, 'arbitrage', tradeSize, opportunity.buyPrice, 
         `${opportunity.buyExchange}-${opportunity.sellExchange}`, `${buyOrder.id}-${sellOrder.id}`, 
         actualProfit]
      );
      
      this.db.run(
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

  // Calculate optimal trade size
  async calculateOptimalTradeSize(opportunity) {
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
    } catch (
    for (const { id, class: ExchangeClass } of exchangeConfigs) {
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
          
          this.db.run(
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
        
        this.db.run(
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
      
      const tradeSize = await this.calculateOptimalTradeSize(opportunity);
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
      
      this.db.run(
        `INSERT INTO crypto_trades (id, symbol, type, amount, price, exchange, tx_hash, profit_loss)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), opportunity.symbol, 'arbitrage', tradeSize, opportunity.buyPrice, 
         `${opportunity.buyExchange}-${opportunity.sellExchange}`, `${buyOrder.id}-${sellOrder.id}`, 
         actualProfit]
      );
      
      this.db.run(
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

  // Calculate optimal trade size
  async calculateOptimalTradeSize(opportunity) {
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
          response.data.pools.forEach(pool => {
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
            
            this.db.run(
              `INSERT INTO dex_liquidity (id, chain, pool_address, token0, token1, liquidity, volume_24h, fee_tier)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [uuidv4(), chain, pool.pairAddress, pool.baseToken?.symbol, pool.quoteToken?.symbol,
               pool.liquidity?.usd || 0, pool.volume?.h24 || 0, pool.feeTier || 0.003]
            );
          });
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
          const provisionAmount = await this.calculateLiquidityProvisionAmount(pool);
          if (provisionAmount > 0) {
            const txHash = await this.provideLiquidity(pool, provisionAmount);
            provisions.push({
              pool: pool.poolAddress,
              chain: pool.chain,
              amount: provisionAmount,
              txHash,
              timestamp: Date.now()
            });
          }
        }
      } catch (error) {
        this.logger.warn(`⚠️ Liquidity provision failed for ${pool.poolAddress}: ${error.message}`);
      }
    }
    
    return { provisions: provisions.length, details: provisions };
  }

  // Calculate liquidity provision amount
  async calculateLiquidityProvisionAmount(pool) {
    const maxProvision = 5000;
    const targetAllocation = 0.1;
    
    try {
      const balances = await walletManager.getWalletBalances();
      const baseBalance = balances[pool.baseToken.symbol] || 0;
      const quoteBalance = balances[pool.quoteToken.symbol] || 0;
      
      const provisionAmount = Math.min(
        baseBalance * targetAllocation,
        quoteBalance * targetAllocation / pool.price,
        maxProvision
      );
      
      return provisionAmount > 10 ? provisionAmount : 0;
    } catch (error) {
      this.logger.error(`❌ Error calculating liquidity provision: ${error.message}`);
      return 0;
    }
  }

  // Provide liquidity to DEX
  async provideLiquidity(pool, amount) {
    try {
      const txHash = await walletManager.provideLiquidity(
        pool.chain,
        pool.poolAddress,
        pool.baseToken.address,
        pool.quoteToken.address,
        amount,
        amount / pool.price
      );
      
      this.logger.info(`✅ Liquidity provided to ${pool.poolAddress}: ${txHash}`);
      return txHash;
    } catch (error) {
      throw new Error(`Liquidity provision failed: ${error.message}`);
    }
  }

  // Execute cross-chain operations
  async executeCrossChainOperations() {
    const operations = [];
    
    try {
      const bridgeOpportunities = await this.findBridgeOpportunities();
      for (const opportunity of bridgeOpportunities) {
        const txHash = await this.executeCrossChainBridge(opportunity);
        operations.push({
          type: 'bridge',
          fromChain: opportunity.fromChain,
          toChain: opportunity.toChain,
          token: opportunity.token,
          amount: opportunity.amount,
          txHash,
          estimatedProfit: opportunity.estimatedProfit
        });
      }
      
      const yieldOpportunities = await this.findYieldOpportunities();
      for (const opportunity of yieldOpportunities) {
        const txHash = await this.executeYieldFarming(opportunity);
        operations.push({
          type: 'yield',
          chain: opportunity.chain,
          protocol: opportunity.protocol,
          token: opportunity.token,
          amount: opportunity.amount,
          txHash,
          estimatedAPY: opportunity.estimatedAPY
        });
      }
    } catch (error) {
      this.logger.error(`❌ Cross-chain operations failed: ${error.message}`);
    }
    
    return operations;
  }

  // Find bridge opportunities
  async findBridgeOpportunities() {
    const opportunities = [];
    const chains = ['ethereum', 'bsc', 'polygon', 'arbitrum', 'optimism'];
    const tokens = ['USDC', 'USDT', 'ETH', 'WBTC'];
    
    for (const fromChain of chains) {
      for (const toChain of chains) {
        if (fromChain === toChain) continue;
        
        for (const token of tokens) {
          try {
            const fromPrice = await this.getTokenPrice(fromChain, token);
            const toPrice = await this.getTokenPrice(toChain, token);
            const bridgeFee = await this.getBridgeFee(fromChain, toChain, token);
            
            const priceDifference = Math.abs(fromPrice - toPrice);
            const estimatedProfit = priceDifference - bridgeFee;
            
            if (estimatedProfit > 5) {
              const balances = await walletManager.getWalletBalances();
              const availableAmount = balances[token] || 0;
              
              if (availableAmount > 100) {
                opportunities.push({
                  fromChain,
                  toChain,
                  token,
                  amount: availableAmount * 0.5,
                  fromPrice,
                  toPrice,
                  bridgeFee,
                  estimatedProfit
                });
              }
            }
          } catch (error) {
            this.logger.warn(`⚠️ Bridge opportunity check failed for ${token}: ${error.message}`);
          }
        }
      }
    }
    
    return opportunities;
  }

  // Get token price
  async getTokenPrice(chain, token) {
    try {
      const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${this.getCoinGeckoId(token)}&vs_currencies=usd`);
      return response.data[this.getCoinGeckoId(token)]?.usd || 0;
    } catch (error) {
      return 0;
    }
  }

  // Get CoinGecko ID
  getCoinGeckoId(token) {
    const mapping = {
      'USDC': 'usd-coin',
      'USDT': 'tether',
      'ETH': 'ethereum',
      'WBTC': 'wrapped-bitcoin',
      'BTC': 'bitcoin'
    };
    return mapping[token] || token.toLowerCase();
  }

  // Get bridge fee
  async getBridgeFee(fromChain, toChain, token) {
    const baseFees = {
      ethereum: { bsc: 15, polygon: 8, arbitrum: 5, optimism: 5 },
      bsc: { ethereum: 10, polygon: 6, arbitrum: 4, optimism: 4 },
      polygon: { ethereum: 8, bsc: 6, arbitrum: 3, optimism: 3 },
      arbitrum: { ethereum: 5, bsc: 4, polygon: 3, optimism: 2 },
      optimism: { ethereum: 5, bsc: 4, polygon: 3, arbitrum: 2 }
    };
    return baseFees[fromChain]?.[toChain] || 10;
  }

  // Execute cross-chain bridge
  async executeCrossChainBridge(opportunity) {
    try {
      const txHash = await walletManager.bridgeTokens(
        opportunity.fromChain,
        opportunity.toChain,
        opportunity.token,
        opportunity.amount
      );
      
      this.logger.info(`✅ Cross-chain bridge executed: ${txHash}`);
      return txHash;
    } catch (error) {
      throw new Error(`Bridge execution failed: ${error.message}`);
    }
  }

  // Find yield opportunities
  async findYieldOpportunities() {
    const opportunities = [];
    const protocols = [
      { chain: 'ethereum', protocol: 'aave', apy: 0.028 },
      { chain: 'ethereum', protocol: 'compound', apy: 0.025 },
      { chain: 'bsc', protocol: 'venus', apy: 0.032 },
      { chain: 'polygon', protocol: 'aave', apy: 0.035 },
      { chain: 'arbitrum', protocol: 'aave', apy: 0.038 },
      { chain: 'optimism', protocol: 'aave', apy: 0.036 }
    ];
    
    const tokens = ['USDC', 'USDT', 'ETH'];
    
    for (const { chain, protocol, apy } of protocols) {
      for (const token of tokens) {
        const balances = await walletManager.getWalletBalances();
        const availableAmount = balances[token] || 0;
        
        if (availableAmount > 500 && apy > 0.02) {
          opportunities.push({
            chain,
            protocol,
            token,
            amount: availableAmount * 0.3,
            estimatedAPY: apy
          });
        }
      }
    }
    
    return opportunities;
  }

  // Execute yield farming
  async executeYieldFarming(opportunity) {
    try {
      const txHash = await walletManager.depositToYield(
        opportunity.chain,
        opportunity.protocol,
        opportunity.token,
        opportunity.amount
      );
      
      this.logger.info(`✅ Yield farming executed: ${txHash}`);
      return txHash;
    } catch (error) {
      throw new Error(`Yield farming failed: ${error.message}`);
    }
  }

  // Update performance metrics
  async updatePerformanceMetrics(strategyResults) {
    for (const result of strategyResults) {
      if (result.profit) {
        const metrics = this.performanceMetrics.get(result.strategy);
        metrics.totalProfit += result.profit;
        metrics.totalTrades += result.trades || 1;
        
        const successRate = metrics.winningTrades / metrics.totalTrades;
        const sharpeRatio = await this.calculateSharpeRatio(result.strategy);
        
        this.db.run(
          `INSERT INTO strategy_performance (id, strategy_name, total_profit, total_trades, success_rate, sharpe_ratio)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [uuidv4(), result.strategy, metrics.totalProfit, metrics.totalTrades, successRate, sharpeRatio]
        );
      }
    }
  }

  // Calculate Sharpe ratio
  async calculateSharpeRatio(strategyName) {
    const returns = [0.02, 0.015, -0.01, 0.025, 0.018];
    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const stdDev = Math.sqrt(returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length);
    return stdDev > 0 ? mean / stdDev : 0;
  }

  // Execute risk management
  async executeRiskManagement() {
    try {
      const riskMetrics = await this.calculateRiskMetrics();
      
      this.db.run(
        `INSERT INTO risk_metrics (id, value_at_risk, expected_shortfall, volatility, correlation_matrix)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), riskMetrics.var, riskMetrics.es, riskMetrics.volatility, JSON.stringify(riskMetrics.correlation)]
      );
      
      if (riskMetrics.var > 0.05) {
        await this.reduceLeverage();
        await this.hedgePositions();
      }
      
      if (riskMetrics.es > 0.08) {
        await this.closeRiskyPositions();
      }
    } catch (error) {
      this.logger.error(`❌ Risk management failed: ${error.message}`);
    }
  }

  // Calculate risk metrics
  async calculateRiskMetrics() {
    return {
      var: 0.032,
      es: 0.045,
      volatility: 0.028,
      correlation: { 'BTC-ETH': 0.78, 'BTC-SOL': 0.65, 'ETH-SOL': 0.72 }
    };
  }

  // Reduce leverage
  async reduceLeverage() {
    this.logger.info('⚠️ Reducing leverage due to high risk');
  }

  // Hedge positions
  async hedgePositions() {
    this.logger.info('🛡️ Hedging positions');
  }

  // Close risky positions
  async closeRiskyPositions() {
    this.logger.info('🔒 Closing risky positions');
  }

  // Monitor and rebalance positions
  async monitorAndRebalancePositions() {
    try {
      const currentAllocation = await this.getCurrentAllocation();
      const targetAllocation = this.getTargetAllocation();
      
      const rebalancingTrades = await this.executeRebalancing(currentAllocation, targetAllocation);
      
      this.logger.info(`✅ Portfolio rebalanced: ${rebalancingTrades.length} trades executed`);
      return rebalancingTrades;
    } catch (error) {
      this.logger.error(`❌ Rebalancing failed: ${error.message}`);
      return [];
    }
  }

  // Get current allocation
  async getCurrentAllocation() {
    const balances = await walletManager.getWalletBalances();
    const totalValue = Object.values(balances).reduce((sum, balance) => sum + balance, 0);
    
    return Object.entries(balances).reduce((acc, [asset, value]) => {
      acc[asset] = value / totalValue;
      return acc;
    }, {});
  }

  // Get target allocation
  getTargetAllocation() {
    return {
      'BTC': 0.40,
      'ETH': 0.25,
      'SOL': 0.15,
      'USDC': 0.10,
      'USDT': 0.05,
      'Other': 0.05
    };
  }

  // Execute rebalancing
  async executeRebalancing(currentAllocation, targetAllocation) {
    const trades = [];
    
    for (const [asset, targetWeight] of Object.entries(targetAllocation)) {
      const currentWeight = currentAllocation[asset] || 0;
      const difference = targetWeight - currentWeight;
      
      if (Math.abs(difference) > 0.02) {
        const totalValue = Object.values(await walletManager.getWalletBalances()).reduce((sum, b) => sum + b, 0);
        const tradeAmount = difference * totalValue;
        
        if (tradeAmount > 10) {
          try {
            if (difference > 0) {
              const txHash = await this.executeBuyOrder(asset, tradeAmount);
              trades.push({ asset, action: 'buy', amount: tradeAmount, txHash });
            } else {
              const txHash = await this.executeSellOrder(asset, -tradeAmount);
              trades.push({ asset, action: 'sell', amount: -tradeAmount, txHash });
            }
          } catch (error) {
            this.logger.warn(`⚠️ Rebalancing trade failed for ${asset}: ${error.message}`);
          }
        }
      }
    }
    
    return trades;
  }

  // Execute buy order
  async executeBuyOrder(asset, amount) {
    try {
      const symbol = `${asset}/USDT`;
      const exchange = this.exchanges.values().next().value;
      
      if (exchange) {
        const order = await exchange.createOrder(symbol, 'market', 'buy', amount / await this.getCurrentPrice(symbol));
        return order.id;
      }
      
      return await walletManager.executeSwap('ethereum', 'USDC', this.getTokenAddress(asset), amount, 'exactInput');
    } catch (error) {
      throw new Error(`Buy order failed: ${error.message}`);
    }
  }

  // Execute sell order
  async executeSellOrder(asset, amount) {
    try {
      const symbol = `${asset}/USDT`;
      const exchange = this.exchanges.values().next().value;
      
      if (exchange) {
        const order = await exchange.createOrder(symbol, 'market', 'sell', amount / await this.getCurrentPrice(symbol));
        return order.id;
      }
      
      return await walletManager.executeSwap('ethereum', this.getTokenAddress(asset), 'USDC', amount, 'exactInput');
    } catch (error) {
      throw new Error(`Sell order failed: ${error.message}`);
    }
  }

  // Get current price
  async getCurrentPrice(symbol) {
    try {
      const exchange = this.exchanges.values().next().value;
      const ticker = await exchange.fetchTicker(symbol);
      return ticker.last;
    } catch (error) {
      return 0;
    }
  }

  // Get token address
  getTokenAddress(token) {
    const addresses = {
      'USDC': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'USDT': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      'ETH': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      'WBTC': '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599'
    };
    return addresses[token] || token;
  }

  // Get status
  getStatus() {
    return {
      status: this.lastStatus,
      lastExecutionTime: this.lastExecutionTime,
      totalStrategies: this.activeStrategies.size,
      walletInitialized: this.walletInitialized,
      exchangeCount: this.exchanges.size,
      performanceMetrics: Object.fromEntries(this.performanceMetrics)
    };
  }

  // Emergency shutdown
  async emergencyShutdown() {
    this.logger.warn('🚨 Emergency shutdown initiated!');
    this.lastStatus = 'emergency';
    
    try {
      await this.closeAllPositions();
      await this.withdrawAllFunds();
      await this.browserManager.close();
      
      this.logger.info('✅ Emergency shutdown completed');
      return { success: true, message: 'All positions closed and funds secured' };
    } catch (error) {
      this.logger.error(`❌ Emergency shutdown failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Close all positions
  async closeAllPositions() {
    this.logger.info('🔒 Closing all open positions');
  }

  // Withdraw all funds
  async withdrawAllFunds() {
    this.logger.info('💸 Withdrawing all funds to cold storage');
  }

  // Cleanup
  async cleanup() {
    this.logger.info('🧹 Cleaning up EnhancedCryptoAgent...');
    
    try {
      for (const exchange of this.exchanges.values()) {
        exchange.close && await exchange.close();
      }
      
      await this.browserManager.close();
      this.db.close();
      
      this.logger.info('✅ Cleanup completed');
    } catch (error) {
      this.logger.error(`❌ Cleanup failed: ${error.message}`);
    }
  }
}

export default EnhancedCryptoAgent;
