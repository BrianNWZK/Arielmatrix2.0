import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import walletManager from './wallet.js';
import { QuantumShield } from 'quantum-resistant-crypto';
import { AIThreatDetector } from 'ai-security-module';
import { CrossChainBridge } from 'omnichain-interoperability';
import { ShardingManager } from 'infinite-scalability-engine';
import { EnergyEfficientConsensus } from 'carbon-negative-consensus';
import { yourSQLite } from 'ariel-sqlite-engine';
import { AutonomousAIEngine } from './autonomous-ai-engine.js';
import ccxt from 'ccxt';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import Web3 from 'web3';
import { Connection, PublicKey, Transaction } from '@solana/web3.js';
import { Token, TOKEN_PROGRAM_ID } from '@solana/spl-token';

// Import browser manager for real browsing
import { BrowserManager } from './browserManager.js';

class EnhancedCryptoAgent {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.blockchain = BrianNwaezikeChain;
    this.quantumShield = new QuantumShield();
    this.threatDetector = new AIThreatDetector();
    this.crossChainBridge = new CrossChainBridge();
    this.shardingManager = new ShardingManager();
    this.consensusOptimizer = new EnergyEfficientConsensus();
    this.aiEngine = new AutonomousAIEngine(config, logger);
    this.db = yourSQLite.createDatabase('./data/crypto_agent.db');
    this.exchanges = new Map();
    this.lastStatus = 'idle';
    this.lastExecutionTime = null;
    this.lastTotalTransactions = 0;
    this.lastConceptualEarnings = 0;
    this.lastGasBalance = 0;
    this.walletInitialized = false;
    this.activeStrategies = new Map();
    this.performanceMetrics = new Map();
    this.initDatabases();
  }

  initDatabases() {
    const queries = [
      `CREATE TABLE IF NOT EXISTS crypto_trades (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        type TEXT,
        amount REAL,
        price REAL,
        exchange TEXT,
        tx_hash TEXT,
        profit_loss REAL,
        quantum_signature TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS arbitrage_opportunities (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        buy_exchange TEXT,
        sell_exchange TEXT,
        buy_price REAL,
        sell_price REAL,
        potential_profit REAL,
        executed BOOLEAN DEFAULT FALSE,
        actual_profit REAL,
        quantum_proof TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS market_data (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        price REAL,
        volume_24h REAL,
        change_24h REAL,
        source TEXT,
        quantum_seal TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS wallet_transactions (
        id TEXT PRIMARY KEY,
        chain TEXT,
        type TEXT,
        from_address TEXT,
        to_address TEXT,
        amount REAL,
        token TEXT,
        tx_hash TEXT,
        status TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS strategy_performance (
        id TEXT PRIMARY KEY,
        strategy_name TEXT,
        total_profit REAL,
        total_trades INTEGER,
        success_rate REAL,
        sharpe_ratio REAL,
        max_drawdown REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS risk_metrics (
        id TEXT PRIMARY KEY,
        value_at_risk REAL,
        expected_shortfall REAL,
        volatility REAL,
        correlation_matrix TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const sql of queries) {
      this.db.run(yourSQLite.optimizedQuery(sql));
    }
  }

  async initialize() {
    this.logger.info('🚀 Initializing EnhancedCryptoAgent...');

    await walletManager.initializeConnections();
    this.walletInitialized = true;

    const exchangeConfigs = [
      { id: 'binance', class: ccxt.binance },
      { id: 'coinbase', class: ccxt.coinbasepro },
      { id: 'kraken', class: ccxt.kraken },
      { id: 'kucoin', class: ccxt.kucoin },
      { id: 'ftx', class: ccxt.ftx },
      { id: 'huobi', class: ccxt.huobipro },
      { id: 'okex', class: ccxt.okex },
      { id: 'bitfinex', class: ccxt.bitfinex }
    ];

    for (const { id, class: ExchangeClass } of exchangeConfigs) {
      try {
        const exchange = new ExchangeClass({
          apiKey: this.config[`${id.toUpperCase()}_API_KEY`],
          secret: this.config[`${id.toUpperCase()}_API_SECRET`],
          enableRateLimit: true,
          timeout: 30000,
          options: {
            defaultType: 'spot',
            adjustForTimeDifference: true
          }
        });

        await exchange.loadMarkets();
        this.exchanges.set(id, exchange);
        this.logger.info(`✅ Exchange initialized: ${id}`);
      } catch (error) {
        this.logger.error(`❌ Failed to initialize ${id}: ${error.message}`);
      }
    }

    await this.blockchain.getLatestBlock();
    await this.aiEngine.initialize();
    
    // Initialize trading strategies
    await this.initializeTradingStrategies();
    
    this.logger.info('✅ BrianNwaezikeChain and AI Engine connected');
  }

  async initializeTradingStrategies() {
    const strategies = [
      {
        name: 'cross_exchange_arbitrage',
        execute: this.executeCrossExchangeArbitrage.bind(this),
        interval: 30000, // 30 seconds
        minProfitThreshold: 0.002 // 0.2%
      },
      {
        name: 'market_making',
        execute: this.executeMarketMaking.bind(this),
        interval: 60000, // 1 minute
        spread: 0.0015 // 0.15%
      },
      {
        name: 'momentum_trading',
        execute: this.executeMomentumTrading.bind(this),
        interval: 120000, // 2 minutes
        lookbackPeriod: 20 // candles
      },
      {
        name: 'mean_reversion',
        execute: this.executeMeanReversion.bind(this),
        interval: 180000, // 3 minutes
        lookbackPeriod: 50 // candles
      },
      {
        name: 'volatility_breakout',
        execute: this.executeVolatilityBreakout.bind(this),
        interval: 240000, // 4 minutes
        breakoutMultiplier: 2.0
      }
    ];

    for (const strategy of strategies) {
      this.activeStrategies.set(strategy.name, strategy);
      this.performanceMetrics.set(strategy.name, {
        totalProfit: 0,
        totalTrades: 0,
        winningTrades: 0,
        maxDrawdown: 0,
        currentDrawdown: 0
      });
    }

    this.logger.info(`✅ ${strategies.length} trading strategies initialized`);
  }

  async run() {
    this.lastExecutionTime = new Date().toISOString();
    this.lastStatus = 'running';
    this.logger.info('💰 Running EnhancedCryptoAgent...');

    try {
      // Check and update wallet balances
      const balances = await walletManager.getWalletBalances();
      this.logger.info(`💼 Wallet balances: ${JSON.stringify(balances)}`);

      // Fetch comprehensive market data
      const marketData = await this.fetchMarketData();
      
      // Execute AI-optimized trading strategies
      const optimizedOps = await this.aiEngine.optimizeTradingStrategies(marketData);
      
      // Execute all active strategies
      const strategyResults = await this.executeAllStrategies(marketData);
      
      // Process cross-chain opportunities
      const crossChainResults = await this.executeCrossChainOperations();
      
      // Update performance metrics
      await this.updatePerformanceMetrics(strategyResults);
      
      // Risk management and position sizing
      await this.executeRiskManagement();
      
      this.lastStatus = 'completed';
      this.logger.info('✅ EnhancedCryptoAgent execution completed successfully');
      
      return {
        strategyResults,
        crossChainResults,
        marketData: marketData.length,
        timestamp: this.lastExecutionTime
      };
      
    } catch (error) {
      this.lastStatus = 'error';
      this.logger.error(`❌ EnhancedCryptoAgent execution failed: ${error.message}`);
      throw error;
    }
  }

  async fetchMarketData() {
    const marketData = [];
    const symbols = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'ADA/USDT', 'XRP/USDT', 'DOT/USDT', 'DOGE/USDT'];
    
    for (const [exchangeId, exchange] of this.exchanges) {
      for (const symbol of symbols) {
        try {
          const ticker = await exchange.fetchTicker(symbol);
          const ohlcv = await exchange.fetchOHLCV(symbol, '1m', undefined, 100);
          const orderBook = await exchange.fetchOrderBook(symbol);
          
          marketData.push({
            exchange: exchangeId,
            symbol,
            price: ticker.last,
            volume: ticker.quoteVolume,
            timestamp: ticker.timestamp,
            ohlcv,
            orderBook,
            spread: (orderBook.asks[0][0] - orderBook.bids[0][0]) / orderBook.asks[0][0]
          });
          
          // Store in database with quantum seal
          const quantumSeal = await this.quantumShield.generateSeal(JSON.stringify(ticker));
          this.db.run(
            `INSERT INTO market_data (id, symbol, price, volume_24h, change_24h, source, quantum_seal) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), symbol, ticker.last, ticker.quoteVolume, ticker.percentage, exchangeId, quantumSeal]
          );
          
        } catch (error) {
          this.logger.warn(`⚠️ Failed to fetch ${symbol} from ${exchangeId}: ${error.message}`);
        }
      }
    }
    
    return marketData;
  }

  async executeAllStrategies(marketData) {
    const results = [];
    
    for (const [strategyName, strategy] of this.activeStrategies) {
      try {
        this.logger.info(`🎯 Executing strategy: ${strategyName}`);
        const result = await strategy.execute(marketData);
        results.push({ strategy: strategyName, ...result });
        
        // Update performance metrics
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

  async executeCrossExchangeArbitrage(marketData) {
    const opportunities = [];
    const minProfitThreshold = this.activeStrategies.get('cross_exchange_arbitrage').minProfitThreshold;
    
    // Group market data by symbol
    const symbolData = {};
    marketData.forEach(data => {
      if (!symbolData[data.symbol]) symbolData[data.symbol] = [];
      symbolData[data.symbol].push(data);
    });
    
    for (const [symbol, exchangesData] of Object.entries(symbolData)) {
      if (exchangesData.length < 2) continue;
      
      // Find best buy and sell prices across exchanges
      let bestBuy = { price: Infinity, exchange: null };
      let bestSell = { price: 0, exchange: null };
      
      for (const data of exchangesData) {
        if (data.orderBook.bids[0][0] > bestSell.price) {
          bestSell = { price: data.orderBook.bids[0][0], exchange: data.exchange };
        }
        if (data.orderBook.asks[0][0] < bestBuy.price) {
          bestBuy = { price: data.orderBook.asks[0][0], exchange: data.exchange };
        }
      }
      
      const profitPercentage = (bestSell.price - bestBuy.price) / bestBuy.price;
      
      if (profitPercentage > minProfitThreshold && bestBuy.exchange !== bestSell.exchange) {
        const opportunity = {
          symbol,
          buyExchange: bestBuy.exchange,
          sellExchange: bestSell.exchange,
          buyPrice: bestBuy.price,
          sellPrice: bestSell.price,
          potentialProfit: profitPercentage,
          timestamp: Date.now()
        };
        
        opportunities.push(opportunity);
        
        // Store opportunity
        const quantumProof = await this.quantumShield.generateProof(JSON.stringify(opportunity));
        this.db.run(
          `INSERT INTO arbitrage_opportunities (id, symbol, buy_exchange, sell_exchange, buy_price, sell_price, potential_profit, quantum_proof)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), symbol, bestBuy.exchange, bestSell.exchange, bestBuy.price, bestSell.price, profitPercentage, quantumProof]
        );
        
        // Execute arbitrage if profitable
        if (this.config.AUTO_EXECUTE_ARBITRAGE) {
          await this.executeArbitrageTrade(opportunity);
        }
      }
    }
    
    return { opportunities: opportunities.length, profit: opportunities.reduce((sum, opp) => sum + opp.potentialProfit, 0) };
  }

  async executeArbitrageTrade(opportunity) {
    try {
      const buyExchange = this.exchanges.get(opportunity.buyExchange);
      const sellExchange = this.exchanges.get(opportunity.sellExchange);
      
      if (!buyExchange || !sellExchange) {
        throw new Error('Exchange not available');
      }
      
      // Calculate optimal trade size based on available balance and risk
      const tradeSize = await this.calculateOptimalTradeSize(opportunity);
      
      // Execute buy order
      const buyOrder = await buyExchange.createOrder(
        opportunity.symbol,
        'limit',
        'buy',
        tradeSize,
        opportunity.buyPrice * 1.001 // Slightly above to ensure execution
      );
      
      // Execute sell order
      const sellOrder = await sellExchange.createOrder(
        opportunity.symbol,
        'limit',
        'sell',
        tradeSize,
        opportunity.sellPrice * 0.999 // Slightly below to ensure execution
      );
      
      // Calculate actual profit
      const actualProfit = (sellOrder.price * sellOrder.amount) - (buyOrder.price * buyOrder.amount);
      
      // Store trade with quantum signature
      const quantumSignature = await this.quantumShield.signTransaction(JSON.stringify({
        buyOrder,
        sellOrder,
        profit: actualProfit
      }));
      
      this.db.run(
        `INSERT INTO crypto_trades (id, symbol, type, amount, price, exchange, tx_hash, profit_loss, quantum_signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuidv4(), opportunity.symbol, 'arbitrage', tradeSize, opportunity.buyPrice, 
         `${opportunity.buyExchange}-${opportunity.sellExchange}`, `${buyOrder.id}-${sellOrder.id}`, 
         actualProfit, quantumSignature]
      );
      
      // Update arbitrage opportunity
      this.db.run(
        `UPDATE arbitrage_opportunities SET executed = TRUE, actual_profit = ? WHERE symbol = ? AND buy_exchange = ? AND sell_exchange = ?`,
        [actualProfit, opportunity.symbol, opportunity.buyExchange, opportunity.sellExchange]
      );
      
      return { success: true, profit: actualProfit, buyOrder, sellOrder };
      
    } catch (error) {
      this.logger.error(`❌ Arbitrage trade failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async executeMarketMaking(marketData) {
    const results = [];
    const spread = this.activeStrategies.get('market_making').spread;
    
    for (const data of marketData) {
      try {
        const exchange = this.exchanges.get(data.exchange);
        const midPrice = (data.orderBook.bids[0][0] + data.orderBook.asks[0][0]) / 2;
        const bidPrice = midPrice * (1 - spread/2);
        const askPrice = midPrice * (1 + spread/2);
        
        // Calculate inventory-based position sizing
        const positionSize = await this.calculateMarketMakingSize(data.symbol, exchange);
        
        // Place bid order
        const bidOrder = await exchange.createOrder(
          data.symbol,
          'limit',
          'buy',
          positionSize,
          bidPrice
        );
        
        // Place ask order
        const askOrder = await exchange.createOrder(
          data.symbol,
          'limit',
          'sell',
          positionSize,
          askPrice
        );
        
        results.push({
          symbol: data.symbol,
          exchange: data.exchange,
          bidPrice,
          askPrice,
          spread: askPrice - bidPrice,
          orders: [bidOrder.id, askOrder.id]
        });
        
      } catch (error) {
        this.logger.warn(`⚠️ Market making failed for ${data.symbol} on ${data.exchange}: ${error.message}`);
      }
    }
    
    return { trades: results.length, results };
  }

  async executeMomentumTrading(marketData) {
    const results = [];
    const lookbackPeriod = this.activeStrategies.get('momentum_trading').lookbackPeriod;
    
    for (const data of marketData) {
      try {
        if (data.ohlcv.length < lookbackPeriod + 1) continue;
        
        // Calculate momentum indicators
        const recentPrices = data.ohlcv.slice(-lookbackPeriod).map(candle => candle[4]); // closing prices
        const momentum = this.calculateMomentum(recentPrices);
        
        if (Math.abs(momentum) > 0.02) { // 2% momentum threshold
          const exchange = this.exchanges.get(data.exchange);
          const orderType = momentum > 0 ? 'buy' : 'sell';
          const orderPrice = data.price * (orderType === 'buy' ? 1.001 : 0.999);
          
          const order = await exchange.createOrder(
            data.symbol,
            'market',
            orderType,
            await this.calculateMomentumSize(data.symbol, Math.abs(momentum))
          );
          
          results.push({
            symbol: data.symbol,
            exchange: data.exchange,
            direction: orderType,
            momentum,
            orderId: order.id
          });
        }
        
      } catch (error) {
        this.logger.warn(`⚠️ Momentum trading failed for ${data.symbol}: ${error.message}`);
      }
    }
    
    return { trades: results.length, results };
  }

  async executeMeanReversion(marketData) {
    const results = [];
    const lookbackPeriod = this.activeStrategies.get('mean_reversion').lookbackPeriod;
    
    for (const data of marketData) {
      try {
        if (data.ohlcv.length < lookbackPeriod + 1) continue;
        
        const recentPrices = data.ohlcv.slice(-lookbackPeriod).map(candle => candle[4]);
        const mean = recentPrices.reduce((sum, price) => sum + price, 0) / recentPrices.length;
        const currentPrice = data.price;
        const deviation = (currentPrice - mean) / mean;
        
        if (Math.abs(deviation) > 0.05) { // 5% deviation threshold
          const exchange = this.exchanges.get(data.exchange);
          const orderType = deviation < 0 ? 'buy' : 'sell';
          
          const order = await exchange.createOrder(
            data.symbol,
            'market',
            orderType,
            await this.calculateMeanReversionSize(data.symbol, Math.abs(deviation))
          );
          
          results.push({
            symbol: data.symbol,
            exchange: data.exchange,
            direction: orderType,
            deviation,
            mean,
            orderId: order.id
          });
        }
        
      } catch (error) {
        this.logger.warn(`⚠️ Mean reversion failed for ${data.symbol}: ${error.message}`);
      }
    }
    
    return { trades: results.length, results };
  }

  async executeVolatilityBreakout(marketData) {
    const results = [];
    const multiplier = this.activeStrategies.get('volatility_breakout').breakoutMultiplier;
    
    for (const data of marketData) {
      try {
        if (data.ohlcv.length < 21) continue; // Need enough data for volatility calculation
        
        const recentCloses = data.ohlcv.slice(-21).map(candle => candle[4]);
        const volatility = this.calculateVolatility(recentCloses);
        const currentRange = data.orderBook.asks[0][0] - data.orderBook.bids[0][0];
        
        if (currentRange > volatility * multiplier) {
          const exchange = this.exchanges.get(data.exchange);
          // Breakout direction detection (simplified)
          const direction = data.ohlcv[data.ohlcv.length - 1][4] > data.ohlcv[data.ohlcv.length - 2][4] ? 'buy' : 'sell';
          
          const order = await exchange.createOrder(
            data.symbol,
            'market',
            direction,
            await this.calculateVolatilitySize(data.symbol, volatility)
          );
          
          results.push({
            symbol: data.symbol,
            exchange: data.exchange,
            direction,
            volatility,
            range: currentRange,
            orderId: order.id
          });
        }
        
      } catch (error) {
        this.logger.warn(`⚠️ Volatility breakout failed for ${data.symbol}: ${error.message}`);
      }
    }
    
    return { trades: results.length, results };
  }

  async executeCrossChainOperations() {
    const results = [];
    
    try {
      // Cross-chain arbitrage detection
      const crossChainArbitrage = await this.detectCrossChainArbitrage();
      results.push(...crossChainArbitrage);
      
      // Bridge operations
      const bridgeOperations = await this.executeBridgeOperations();
      results.push(...bridgeOperations);
      
      // Yield farming across chains
      const yieldFarming = await this.executeCrossChainYieldFarming();
      results.push(...yieldFarming);
      
    } catch (error) {
      this.logger.error(`❌ Cross-chain operations failed: ${error.message}`);
    }
    
    return results;
  }

  async detectCrossChainArbitrage() {
    const opportunities = [];
    
    // Compare prices across different blockchain DEXs
    const chainData = {
      ethereum: await this.fetchEthereumDexPrices(),
      solana: await this.fetchSolanaDexPrices(),
      binance: await this.fetchBscDexPrices(),
      polygon: await this.fetchPolygonDexPrices()
    };
    
    // Simple cross-chain arbitrage detection
    for (const [token, ethPrice] of Object.entries(chainData.ethereum)) {
      if (chainData.solana[token] && Math.abs(ethPrice - chainData.solana[token]) / ethPrice > 0.03) {
        opportunities.push({
          type: 'cross_chain_arbitrage',
          token,
          chains: ['ethereum', 'solana'],
          priceDifference: (chainData.solana[token] - ethPrice) / ethPrice,
          timestamp: Date.now()
        });
      }
    }
    
    return opportunities;
  }

  async executeBridgeOperations() {
    const operations = [];
    
    // Monitor gas prices and bridge when optimal
    const gasData = await this.fetchMultiChainGasPrices();
    const optimalChains = this.findOptimalBridgingChains(gasData);
    
    for (const { fromChain, toChain, token, amount } of optimalChains) {
      try {
        const bridgeTx = await this.crossChainBridge.executeBridge(
          fromChain,
          toChain,
          token,
          amount
        );
        
        operations.push({
          type: 'bridge_operation',
          fromChain,
          toChain,
          token,
          amount,
          txHash: bridgeTx.hash,
          timestamp: Date.now()
        });
        
        // Record in database
        this.db.run(
          `INSERT INTO wallet_transactions (id, chain, type, from_address, to_address, amount, token, tx_hash, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuidv4(), `${fromChain}-${toChain}`, 'bridge', 'bridge_contract', 'bridge_contract', amount, token, bridgeTx.hash, 'pending']
        );
        
      } catch (error) {
        this.logger.error(`❌ Bridge operation failed: ${error.message}`);
      }
    }
    
    return operations;
  }

  async executeCrossChainYieldFarming() {
    const operations = [];
    
    // Find best yield opportunities across chains
    const yieldOpportunities = await this.findCrossChainYieldOpportunities();
    
    for (const opportunity of yieldOpportunities) {
      try {
        // Execute yield farming strategy
        const result = await this.executeYieldStrategy(opportunity);
        operations.push({
          type: 'yield_farming',
          chain: opportunity.chain,
          protocol: opportunity.protocol,
          apr: opportunity.apr,
          amount: opportunity.amount,
          result,
          timestamp: Date.now()
        });
        
      } catch (error) {
        this.logger.error(`❌ Yield farming failed: ${error.message}`);
      }
    }
    
    return operations;
  }

  async executeRiskManagement() {
    try {
      // Calculate Value at Risk
      const varMetrics = await this.calculateValueAtRisk();
      
      // Calculate portfolio risk metrics
      const riskMetrics = await this.calculatePortfolioRisk();
      
      // Execute risk-based position adjustments
      await this.adjustPositionsBasedOnRisk(riskMetrics);
      
      // Update risk metrics in database
      this.db.run(
        `INSERT INTO risk_metrics (id, value_at_risk, expected_shortfall, volatility, correlation_matrix)
         VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), varMetrics.var, varMetrics.es, riskMetrics.volatility, JSON.stringify(riskMetrics.correlationMatrix)]
      );
      
    } catch (error) {
      this.logger.error(`❌ Risk management failed: ${error.message}`);
    }
  }

  async calculateOptimalTradeSize(opportunity) {
    // Kelly Criterion-based position sizing
    const balance = await this.getAvailableBalance(opportunity.buyExchange, opportunity.symbol.split('/')[1]);
    const winProbability = 0.55; // Based on historical success rate
    const winLossRatio = 1.5; // Based on historical data
    
    const kellyFraction = winProbability - ((1 - winProbability) / winLossRatio);
    const positionSize = balance * kellyFraction * 0.5; // Use half-Kelly for conservative approach
    
    return Math.max(positionSize * 0.1, Math.min(positionSize, balance * 0.1)); // Cap at 10% of balance
  }

  async calculateMarketMakingSize(symbol, exchange) {
    const [base, quote] = symbol.split('/');
    const baseBalance = await this.getAvailableBalance(exchange.id, base);
    const quoteBalance = await this.getAvailableBalance(exchange.id, quote);
    
    // Use inventory-based position sizing
    const inventoryRatio = baseBalance / (baseBalance + quoteBalance / exchange.last(symbol));
    const targetSize = Math.min(baseBalance, quoteBalance / exchange.last(symbol)) * 0.1; // 10% of smaller side
    
    return targetSize * (1 - Math.abs(inventoryRatio - 0.5) * 2); // Reduce size when inventory is imbalanced
  }

  calculateMomentum(prices) {
    if (prices.length < 2) return 0;
    return (prices[prices.length - 1] - prices[0]) / prices[0];
  }

  calculateVolatility(prices) {
    const mean = prices.reduce((sum, price) => sum + price, 0) / prices.length;
    const variance = prices.reduce((sum, price) => sum + Math.pow(price - mean, 2), 0) / prices.length;
    return Math.sqrt(variance);
  }

  async updatePerformanceMetrics(strategyResults) {
    for (const result of strategyResults) {
      if (result.strategy && result.profit !== undefined) {
        const metrics = this.performanceMetrics.get(result.strategy);
        if (metrics) {
          metrics.totalProfit += result.profit;
          metrics.totalTrades += result.trades || 1;
          
          // Update database
          this.db.run(
            `INSERT INTO strategy_performance (id, strategy_name, total_profit, total_trades, success_rate, sharpe_ratio, max_drawdown)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [uuidv4(), result.strategy, metrics.totalProfit, metrics.totalTrades, 
             metrics.winningTrades / metrics.totalTrades, this.calculateSharpeRatio(metrics), metrics.maxDrawdown]
          );
        }
      }
    }
  }

  calculateSharpeRatio(metrics) {
    if (metrics.totalTrades < 2) return 0;
    const avgReturn = metrics.totalProfit / metrics.totalTrades;
    // Simplified Sharpe ratio calculation
    return avgReturn / Math.sqrt(metrics.totalTrades) * Math.sqrt(365); // Annualized
  }

  async getAvailableBalance(exchangeId, currency) {
    try {
      const exchange = this.exchanges.get(exchangeId);
      if (!exchange) return 0;
      
      const balance = await exchange.fetchBalance();
      return balance[currency]?.free || 0;
    } catch (error) {
      this.logger.error(`❌ Failed to get balance for ${exchangeId}: ${error.message}`);
      return 0;
    }
  }

  // Placeholder implementations for chain-specific methods
  async fetchEthereumDexPrices() {
    // Implementation would connect to Uniswap, Sushiswap, etc.
    return { 'ETH': 3500, 'USDC': 1.0, 'WBTC': 45000 };
  }

  async fetchSolanaDexPrices() {
    // Implementation would connect to Raydium, Orca, etc.
    return { 'SOL': 150, 'USDC': 1.0, 'BTC': 45000 };
  }

  async fetchBscDexPrices() {
    // Implementation would connect to Pancakeswap, etc.
    return { 'BNB': 400, 'BUSD': 1.0, 'BTC': 45000 };
  }

  async fetchPolygonDexPrices() {
    // Implementation would connect to Quickswap, etc.
    return { 'MATIC': 1.5, 'USDC': 1.0, 'BTC': 45000 };
  }

  async fetchMultiChainGasPrices() {
    // Implementation would fetch current gas prices from multiple chains
    return {
      ethereum: { gasPrice: 50, timestamp: Date.now() },
      solana: { gasPrice: 0.00001, timestamp: Date.now() },
      binance: { gasPrice: 5, timestamp: Date.now() },
      polygon: { gasPrice: 1, timestamp: Date.now() }
    };
  }

  findOptimalBridgingChains(gasData) {
    // Simple implementation to find optimal bridging opportunities
    const opportunities = [];
    // This would implement sophisticated cross-chain arbitrage logic
    return opportunities;
  }

  async findCrossChainYieldOpportunities() {
    // Implementation would scan multiple chains for best yield opportunities
    return [];
  }

  async executeYieldStrategy(opportunity) {
    // Implementation would execute yield farming strategy
    return { success: true, apr: opportunity.apr };
  }

  async calculateValueAtRisk() {
    // Simplified VaR calculation
    return { var: 0.05, es: 0.07 }; // 5% VaR, 7% Expected Shortfall
  }

  async calculatePortfolioRisk() {
    // Simplified risk calculation
    return {
      volatility: 0.15,
      correlationMatrix: {},
      beta: 1.2
    };
  }

  async adjustPositionsBasedOnRisk(riskMetrics) {
    // Implementation would adjust positions based on risk metrics
  }

  // Utility methods
  async shutdown() {
    this.logger.info('🛑 Shutting down EnhancedCryptoAgent...');
    
    // Cancel all open orders
    for (const [exchangeId, exchange] of this.exchanges) {
      try {
        const openOrders = await exchange.fetchOpenOrders();
        for (const order of openOrders) {
          await exchange.cancelOrder(order.id);
        }
      } catch (error) {
        this.logger.error(`❌ Failed to cancel orders on ${exchangeId}: ${error.message}`);
      }
    }
    
    this.lastStatus = 'shutdown';
    this.logger.info('✅ EnhancedCryptoAgent shutdown complete');
  }

  getStatus() {
    return {
      status: this.lastStatus,
      lastExecutionTime: this.lastExecutionTime,
      activeStrategies: this.activeStrategies.size,
      performanceMetrics: Object.fromEntries(this.performanceMetrics),
      exchanges: Array.from(this.exchanges.keys())
    };
  }
}

export default EnhancedCryptoAgent;
