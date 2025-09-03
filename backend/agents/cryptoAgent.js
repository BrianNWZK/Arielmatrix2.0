// backend/agents/cryptoAgent.js
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { BrianNwaezikePayoutSystem } from '../blockchain/BrianNwaezikePayoutSystem.js';
import { BrianNwaezikeDB } from '../database/BrianNwaezikeDB.js';
import ccxt from 'ccxt';
import axios from 'axios';
import { ethers } from 'ethers';
import winston from 'winston';

// Import wallet functions
import {
  initializeConnections,
  getSolanaBalance,
  sendSOL,
  getUSDTBalance,
  sendUSDT,
  testAllConnections
} from '../wallet.js';

class EnhancedCryptoAgent {
  constructor(config = {}, logger) {
    this.config = {
      DRY_RUN: config.dryRun ?? true,
      PAYMENT_CHAIN: config.paymentChain || 'eth',
      BSC_NODE: config.bscNode || 'https://bsc-dataseed.binance.org',
      DATABASE_PATH: config.dbPath || './data/crypto-agent',
      DATABASE_SHARDS: config.dbShards || 3,
      PAYOUT_WALLET: config.payoutWallet || process.env.PAYOUT_WALLET_ADDRESS
    };

    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [new winston.transports.Console()]
    });

    // Initialize BrianNwaezikeDB
    this.db = new BrianNwaezikeDB({
      database: {
        path: this.config.DATABASE_PATH,
        numberOfShards: this.config.DATABASE_SHARDS
      }
    });

    // Blockchain & payout system
    this.blockchain = new BrianNwaezikeChain('https://rpc.bwaezi.com/mainnet');
    this.payoutSystem = new BrianNwaezikePayoutSystem(this.blockchain, '0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e');

    // Wallet state
    this.walletInitialized = false;
    this.lastExecutionTime = 'Never';
    this.lastStatus = 'idle';
    this.lastTotalTransactions = 0;
    this.lastConceptualEarnings = 0;
    this.lastGasBalance = 0;

    this.initDatabases();
  }

  initDatabases() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS crypto_trades (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        type TEXT,
        amount REAL,
        price REAL,
        exchange TEXT,
        tx_hash TEXT,
        profit_loss REAL,
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
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS market_data (
        id TEXT PRIMARY KEY,
        symbol TEXT,
        price REAL,
        volume_24h REAL,
        change_24h REAL,
        source TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const sql of tables) {
      for (let i = 0; i < this.config.DATABASE_SHARDS; i++) {
        this.db.runOnShard(`shard_key_${i}`, sql);
      }
    }
  }

  async initialize() {
    this.logger.info('🚀 Initializing Enhanced Crypto Agent with BrianNwaezikeChain Integration...');
    if (this.config.DRY_RUN) {
      this.logger.warn('⚠️ DRY RUN MODE ENABLED - No real trades will be executed');
    }

    try {
      await this.db.init();
      await this.initializeWallets();
      this.lastStatus = 'initialized';
    } catch (error) {
      this.logger.error('Initialization failed:', error);
      this.lastStatus = 'failed';
      throw error;
    }
  }

  async initializeWallets() {
    if (this.walletInitialized) return;

    try {
      await testAllConnections();
      await initializeConnections();
      this.walletInitialized = true;
      this.logger.info('✅ Wallet system initialized');
    } catch (error) {
      this.logger.error('Wallet initialization failed:', error);
      throw error;
    }
  }

  async _checkGasWalletBalance() {
    try {
      const bnbBalance = await getUSDTBalance('eth');
      this.lastGasBalance = bnbBalance;
      return bnbBalance >= 0.05;
    } catch (error) {
      this.logger.error('Gas check failed:', error);
      return false;
    }
  }

  async executeArbitrageStrategy() {
    const results = [];
    const exchanges = ['binance', 'kraken', 'coinbase'];

    // Simulate arbitrage detection
    const opportunity = {
      symbol: 'BTC/USDT',
      buy_exchange: 'binance',
      sell_exchange: 'coinbase',
      buy_price: 60000,
      sell_price: 60500,
      potential_profit: 500
    };

    if (!this.config.DRY_RUN) {
      const profit = opportunity.potential_profit;
      const payoutResult = await this.distributePayout(profit);
      results.push({
        type: 'arbitrage',
        symbol: opportunity.symbol,
        profit,
        payout: payoutResult
      });
    } else {
      results.push({
        type: 'arbitrage (simulated)',
        symbol: opportunity.symbol,
        profit: opportunity.potential_profit
      });
    }

    return results;
  }

  async executeBlockchainStrategies() {
    const results = [];
    const profit = Math.random() * 100 + 50; // Simulate profit from staking, yield, etc.

    if (!this.config.DRY_RUN) {
      const payoutResult = await this.distributePayout(profit);
      results.push({
        type: 'blockchain_yield',
        amount: profit,
        payout: payoutResult
      });
    } else {
      results.push({
        type: 'blockchain_yield (simulated)',
        amount: profit
      });
    }

    return results;
  }

  async distributePayout(amount) {
    if (!this.config.PAYOUT_WALLET) {
      throw new Error('PAYOUT_WALLET not configured');
    }

    try {
      let result;

      switch (this.config.PAYMENT_CHAIN.toLowerCase()) {
        case 'eth':
        case 'ethereum':
          result = await sendUSDT(this.config.PAYOUT_WALLET, amount, 'eth');
          break;

        case 'sol':
        case 'solana':
          result = await sendUSDT(this.config.PAYOUT_WALLET, amount, 'sol');
          break;

        case 'bwaezi':
          result = await this.payoutSystem.distributePayout(
            this.config.PAYOUT_WALLET,
            amount,
            'USD',
            { type: 'profit_distribution', timestamp: new Date().toISOString() }
          );
          break;

        default:
          throw new Error(`Unsupported payment chain: ${this.config.PAYMENT_CHAIN}`);
      }

      this.logger.info(`💸 Profit of $${amount} distributed to ${this.config.PAYOUT_WALLET}`);
      return { success: true, amount, transactionId: result.hash || result.signature || result.transactionHash };
    } catch (error) {
      this.logger.error('Payout distribution failed:', error);
      return { success: false, error: error.message };
    }
  }

  async run() {
    const startTime = Date.now();
    this.lastStatus = 'running';

    try {
      if (!this.walletInitialized) await this.initialize();

      const hasFunds = await this._checkGasWalletBalance();
      if (!this.config.DRY_RUN && !hasFunds) {
        throw new Error('insufficient_capital_for_onchain_ops');
      }

      const arbitrageResults = await this.executeArbitrageStrategy();
      const blockchainResults = await this.executeBlockchainStrategies();

      const allResults = [...arbitrageResults, ...blockchainResults];
      const totalProfit = allResults
        .filter(r => r.profit || r.amount)
        .reduce((sum, r) => sum + (r.profit || r.amount), 0);

      const durationMs = Date.now() - startTime;
      this.lastTotalTransactions = allResults.length;
      this.lastConceptualEarnings = totalProfit;
      this.lastExecutionTime = new Date().toISOString();
      this.lastStatus = 'completed';

      this.logger.info(`✅ Enhanced Crypto Agent Completed | Profit: $${totalProfit.toFixed(2)} | Duration: ${durationMs}ms`);

      return {
        status: 'success',
        transactions: allResults,
        totalProfit,
        durationMs
      };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.lastStatus = 'failed';
      this.logger.error(`🚨 Crypto Agent Failed: ${error.message} | Duration: ${durationMs}ms`);
      throw error;
    }
  }

  getStatus() {
    return {
      agent: 'EnhancedCryptoAgent',
      lastExecution: this.lastExecutionTime,
      lastStatus: this.lastStatus,
      lastTotalTransactions: this.lastTotalTransactions,
      lastConceptualEarnings: this.lastConceptualEarnings,
      lastGasBalance: this.lastGasBalance,
      dryRun: this.config.DRY_RUN
    };
  }

  async close() {
    if (this.walletInitialized) {
      // No cleanup needed for wallet.js
    }
    await this.db.close();
  }
}

export default EnhancedCryptoAgent;
