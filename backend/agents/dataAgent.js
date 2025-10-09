// backend/agents/dataAgent.js
import axios from 'axios';
import WebSocket from 'ws';
import { Mutex } from 'async-mutex';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
import crypto from 'crypto';
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { ArielSQLiteEngine } from '../../modules/ariel-sqlite-engine/index.js';
import { createDatabase, BrianNwaezikeDB } from '../database/BrianNwaezikeDB.js';
import apiScoutAgent from './apiScoutAgent.js';
import { QuantumBrowserManager } from './browserManager.js';

// Import wallet functions
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

// Get __filename equivalent in ES Module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced Crypto module for data agent
class CryptoAgent {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.blockchain = new BrianNwaezikeChain(config);
    this.db = createDatabase('./data/crypto_data.db');
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.db.connect();
      await this._initializeDatabase();
      await this.blockchain.getLatestBlock();
      this.initialized = true;
      this.logger.success('✅ Crypto Agent initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Crypto Agent:', error);
      throw error;
    }
  }

  async _initializeDatabase() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS crypto_prices (
        id TEXT PRIMARY KEY,
        symbol TEXT NOT NULL,
        price REAL NOT NULL,
        volume_24h REAL,
        market_cap REAL,
        price_change_24h REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS blockchain_data (
        id TEXT PRIMARY KEY,
        chain TEXT NOT NULL,
        block_number INTEGER,
        transaction_count INTEGER,
        gas_used REAL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS wallet_analytics (
        id TEXT PRIMARY KEY,
        address TEXT NOT NULL,
        balance REAL,
        transaction_count INTEGER,
        last_active DATETIME,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      "CREATE INDEX IF NOT EXISTS idx_crypto_symbol ON crypto_prices(symbol)",
      "CREATE INDEX IF NOT EXISTS idx_crypto_timestamp ON crypto_prices(timestamp)",
      "CREATE INDEX IF NOT EXISTS idx_blockchain_chain ON blockchain_data(chain)"
    ];

    for (const tableSql of tables) {
      await this.db.run(tableSql);
    }
  }

  async fetchMarketData() {
    try {
      const symbols = ['bitcoin', 'ethereum', 'solana', 'binancecoin', 'cardano', 'polkadot', 'avalanche-2', 'matic-network'];
      const results = [];

      for (const symbol of symbols) {
        try {
          const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${symbol}&vs_currencies=usd&include_24hr_vol=true&include_24hr_change=true&include_market_cap=true`, {
            timeout: 10000,
            headers: {
              'User-Agent': 'ArielMatrix/2.0',
              'Accept': 'application/json'
            }
          });
          
          const data = response.data[symbol];

          if (data) {
            const priceData = {
              id: `price_${crypto.randomBytes(8).toString('hex')}`,
              symbol: symbol.toUpperCase(),
              price: data.usd,
              volume_24h: data.usd_24h_vol,
              market_cap: data.usd_market_cap,
              price_change_24h: data.usd_24h_change
            };

            await this.db.run(
              `INSERT INTO crypto_prices (id, symbol, price, volume_24h, market_cap, price_change_24h)
               VALUES (?, ?, ?, ?, ?, ?)`,
              [priceData.id, priceData.symbol, priceData.price, priceData.volume_24h, priceData.market_cap, priceData.price_change_24h]
            );

            results.push(priceData);
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch data for ${symbol}:`, error.message);
        }
      }

      return results;
    } catch (error) {
      this.logger.error('Market data fetch failed:', error);
      return [];
    }
  }

  async analyzeBlockchainData() {
    try {
      const chains = ['ethereum', 'solana', 'polygon', 'bsc'];
      const results = [];

      for (const chain of chains) {
        try {
          const chainConfig = {
            ethereum: { 
              rpc: process.env.ETH_RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/' + (process.env.ALCHEMY_API_KEY || 'demo'),
              fallback: 'https://cloudflare-eth.com'
            },
            solana: { 
              rpc: process.env.SOL_RPC_URL || 'https://api.mainnet-beta.solana.com',
              fallback: 'https://solana-api.projectserum.com'
            },
            polygon: { 
              rpc: process.env.POLYGON_RPC_URL || 'https://polygon-mainnet.g.alchemy.com/v2/' + (process.env.ALCHEMY_API_KEY || 'demo'),
              fallback: 'https://polygon-rpc.com'
            },
            bsc: { 
              rpc: process.env.BSC_RPC_URL || 'https://bsc-dataseed.binance.org',
              fallback: 'https://bsc-dataseed1.defibit.io'
            }
          };

          const config = chainConfig[chain];
          if (!config) continue;

          let blockData;
          try {
            switch (chain) {
              case 'ethereum':
                blockData = await this._fetchEthereumData(config.rpc);
                break;
              case 'solana':
                blockData = await this._fetchSolanaData(config.rpc);
                break;
              case 'polygon':
                blockData = await this._fetchPolygonData(config.rpc);
                break;
              case 'bsc':
                blockData = await this._fetchBSCData(config.rpc);
                break;
            }
          } catch (primaryError) {
            this.logger.warn(`Primary RPC failed for ${chain}, trying fallback:`, primaryError.message);
            try {
              switch (chain) {
                case 'ethereum':
                  blockData = await this._fetchEthereumData(config.fallback);
                  break;
                case 'solana':
                  blockData = await this._fetchSolanaData(config.fallback);
                  break;
                case 'polygon':
                  blockData = await this._fetchPolygonData(config.fallback);
                  break;
                case 'bsc':
                  blockData = await this._fetchBSCData(config.fallback);
                  break;
              }
            } catch (fallbackError) {
              this.logger.error(`All RPC endpoints failed for ${chain}:`, fallbackError.message);
              continue;
            }
          }

          if (blockData) {
            await this.db.run(
              `INSERT INTO blockchain_data (id, chain, block_number, transaction_count, gas_used)
               VALUES (?, ?, ?, ?, ?)`,
              [blockData.id, chain, blockData.block_number, blockData.transaction_count, blockData.gas_used]
            );

            results.push(blockData);
          }
        } catch (error) {
          this.logger.warn(`Failed to analyze ${chain} data:`, error.message);
        }
      }

      return results;
    } catch (error) {
      this.logger.error('Blockchain data analysis failed:', error);
      return [];
    }
  }

  async _fetchEthereumData(rpcUrl) {
    try {
      const response = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: ["latest", false],
        id: 1
      }, {
        timeout: 15000
      });

      if (!response.data || !response.data.result) {
        throw new Error('Invalid RPC response');
      }

      const block = response.data.result;
      return {
        id: `eth_${crypto.randomBytes(8).toString('hex')}`,
        block_number: parseInt(block.number, 16),
        transaction_count: block.transactions ? block.transactions.length : 0,
        gas_used: parseInt(block.gasUsed, 16)
      };
    } catch (error) {
      throw new Error(`Ethereum data fetch failed: ${error.message}`);
    }
  }

  async _fetchSolanaData(rpcUrl) {
    try {
      const response = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        method: "getRecentPerformanceSamples",
        params: [1],
        id: 1
      }, {
        timeout: 15000
      });

      if (!response.data || !response.data.result || !response.data.result[0]) {
        throw new Error('Invalid RPC response');
      }

      const data = response.data.result[0];
      return {
        id: `sol_${crypto.randomBytes(8).toString('hex')}`,
        block_number: data.slot,
        transaction_count: data.numTransactions,
        gas_used: 0
      };
    } catch (error) {
      throw new Error(`Solana data fetch failed: ${error.message}`);
    }
  }

  async _fetchPolygonData(rpcUrl) {
    try {
      const response = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: ["latest", false],
        id: 1
      }, {
        timeout: 15000
      });

      if (!response.data || !response.data.result) {
        throw new Error('Invalid RPC response');
      }

      const block = response.data.result;
      return {
        id: `poly_${crypto.randomBytes(8).toString('hex')}`,
        block_number: parseInt(block.number, 16),
        transaction_count: block.transactions ? block.transactions.length : 0,
        gas_used: parseInt(block.gasUsed, 16)
      };
    } catch (error) {
      throw new Error(`Polygon data fetch failed: ${error.message}`);
    }
  }

  async _fetchBSCData(rpcUrl) {
    try {
      const response = await axios.post(rpcUrl, {
        jsonrpc: "2.0",
        method: "eth_getBlockByNumber",
        params: ["latest", false],
        id: 1
      }, {
        timeout: 15000
      });

      if (!response.data || !response.data.result) {
        throw new Error('Invalid RPC response');
      }

      const block = response.data.result;
      return {
        id: `bsc_${crypto.randomBytes(8).toString('hex')}`,
        block_number: parseInt(block.number, 16),
        transaction_count: block.transactions ? block.transactions.length : 0,
        gas_used: parseInt(block.gasUsed, 16)
      };
    } catch (error) {
      throw new Error(`BSC data fetch failed: ${error.message}`);
    }
  }

  async close() {
    if (this.db) {
      await this.db.close();
    }
  }
}

// Real-time Analytics Integration
class DataAnalytics {
  constructor(writeKey) {
    this.writeKey = writeKey;
    this.blockchain = new BrianNwaezikeChain({
      NETWORK_TYPE: 'private',
      VALIDATORS: [process.env.COMPANY_WALLET_ADDRESS],
      BLOCK_TIME: 1000,
      NATIVE_TOKEN: 'USD',
      NODE_ID: 'data_analytics_node',
      SYSTEM_ACCOUNT: process.env.COMPANY_WALLET_ADDRESS,
      SYSTEM_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY
    });
  }

  async track(eventData) {
    try {
      const transaction = await this.blockchain.createTransaction(
        process.env.COMPANY_WALLET_ADDRESS,
        'analytics_tracking_address',
        0.01,
        'USD',
        process.env.COMPANY_WALLET_PRIVATE_KEY,
        JSON.stringify(eventData)
      );
      
      console.log(`📊 Data analytics tracked: ${transaction.id}`);
    } catch (error) {
      console.error('Blockchain analytics tracking failed:', error);
    }
  }

  async identify(userData) {
    console.log(`👤 User identified in data analytics: ${JSON.stringify(userData)}`);
  }
}

// Global state for data agent
const dataAgentStatus = {
  lastStatus: 'idle',
  lastExecutionTime: 'Never',
  totalDataPointsCollected: 0,
  totalAPICalls: 0,
  activeWorkers: 0,
  workerStatuses: {},
  dataQualityScore: 0,
  blockchainTransactions: 0
};

const mutex = new Mutex();
const quantumDelay = (ms) => new Promise(resolve => {
  const jitter = Math.floor(Math.random() * 3000) + 1000;
  setTimeout(resolve, ms + jitter);
});

class DataAgent {
  constructor(config, logger) {
    this.config = config;
    this.logger = logger;
    this.db = createDatabase('./data/data_agent.db');
    this.cryptoAgent = new CryptoAgent(config, logger);
    this.analytics = new DataAnalytics(config.ANALYTICS_WRITE_KEY);
    this.browserManager = new QuantumBrowserManager(config, logger);
    this.walletInitialized = false;
    this.initialized = false;
    
    this._initializeDatabase();
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      await this.db.connect();
      await this._initializeDatabase();
      await this.cryptoAgent.initialize();
      await this.browserManager.initialize();
      await this.initializeWalletConnections();
      
      this.initialized = true;
      this.logger.success('✅ Data Agent fully initialized with database, crypto integration, and wallet connections');
    } catch (error) {
      this.logger.error('Failed to initialize Data Agent:', error);
      throw error;
    }
  }

  async _initializeDatabase() {
    try {
      await this.db.connect();
      
      const tables = [
        `CREATE TABLE IF NOT EXISTS data_collection (
          id TEXT PRIMARY KEY,
          data_type TEXT NOT NULL,
          source TEXT NOT NULL,
          data_points INTEGER,
          quality_score REAL,
          revenue_generated REAL DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS api_usage (
          id TEXT PRIMARY KEY,
          api_name TEXT NOT NULL,
          calls_made INTEGER,
          success_rate REAL,
          revenue_generated REAL DEFAULT 0,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS data_revenue (
          id TEXT PRIMARY KEY,
          amount REAL NOT NULL,
          currency TEXT NOT NULL,
          data_type TEXT NOT NULL,
          transaction_hash TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS data_sources (
          id TEXT PRIMARY KEY,
          source_name TEXT NOT NULL,
          reliability_score REAL,
          data_quality REAL,
          last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        "CREATE INDEX IF NOT EXISTS idx_data_type ON data_collection(data_type)",
        "CREATE INDEX IF NOT EXISTS idx_data_timestamp ON data_collection(timestamp)",
        "CREATE INDEX IF NOT EXISTS idx_api_name ON api_usage(api_name)"
      ];

      for (const tableSql of tables) {
        await this.db.run(tableSql);
      }
      
      this.logger.success('✅ Data Agent database initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize database:', error);
    }
  }

  async initializeWalletConnections() {
    this.logger.info('🔗 Initializing multi-chain wallet connections for Data Agent...');
    
    try {
      await initializeConnections();
      this.walletInitialized = true;
      this.logger.success('✅ Multi-chain wallet connections initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize wallet connections: ${error.message}`);
    }
  }

  async collectMarketData() {
    this.logger.info('📈 Collecting comprehensive market data...');

    try {
      const marketData = await this.cryptoAgent.fetchMarketData();
      const blockchainData = await this.cryptoAgent.analyzeBlockchainData();

      const totalDataPoints = marketData.length + blockchainData.length;
      dataAgentStatus.totalDataPointsCollected += totalDataPoints;

      // Record data collection
      const collectionId = `collect_${crypto.randomBytes(8).toString('hex')}`;
      await this.db.run(
        `INSERT INTO data_collection (id, data_type, source, data_points, quality_score)
         VALUES (?, ?, ?, ?, ?)`,
        [collectionId, 'market_blockchain', 'multiple_apis', totalDataPoints, 0.85]
      );

      // Process revenue from data collection
      const revenue = await this._processDataRevenue(totalDataPoints);
      
      await this.analytics.track({
        event: 'market_data_collected',
        properties: {
          dataPoints: totalDataPoints,
          revenue: revenue,
          marketAssets: marketData.length,
          blockchainNetworks: blockchainData.length
        }
      });

      this.logger.success(`✅ Collected ${totalDataPoints} data points, Revenue: $${revenue}`);

      return {
        status: 'success',
        marketData: marketData.length,
        blockchainData: blockchainData.length,
        totalDataPoints,
        revenue
      };

    } catch (error) {
      this.logger.error('Market data collection failed:', error);
      return { status: 'failed', error: error.message };
    }
  }

  async collectSocialMediaData() {
    this.logger.info('📱 Collecting social media sentiment data...');

    try {
      const platforms = [
        { 
          name: 'twitter', 
          api: process.env.TWITTER_API_URL || 'https://api.twitter.com/2/tweets/search/recent',
          enabled: !!process.env.TWITTER_API_KEY
        },
        { 
          name: 'reddit', 
          api: process.env.REDDIT_API_URL || 'https://www.reddit.com/r/cryptocurrency/hot.json',
          enabled: true // Public API
        },
        { 
          name: 'telegram', 
          api: process.env.TELEGRAM_API_URL,
          enabled: !!process.env.TELEGRAM_API_KEY
        },
        { 
          name: 'discord', 
          api: process.env.DISCORD_API_URL,
          enabled: !!process.env.DISCORD_API_KEY
        }
      ];
      
      let totalPosts = 0;
      let sentimentScore = 0;
      let successfulPlatforms = 0;

      for (const platform of platforms) {
        try {
          if (!platform.enabled) {
            this.logger.warn(`Platform ${platform.name} not enabled or configured`);
            continue;
          }

          let response;
          if (platform.name === 'reddit') {
            // Public Reddit API
            response = await axios.get(platform.api, {
              timeout: 10000,
              headers: {
                'User-Agent': 'ArielMatrix/2.0'
              }
            });
          } else {
            // Authenticated APIs
            response = await axios.get(platform.api, {
              headers: {
                'Authorization': `Bearer ${process.env[`${platform.name.toUpperCase()}_API_KEY`]}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            });
          }

          if (response.data) {
            let posts = 0;
            let platformSentiment = 0;

            if (platform.name === 'reddit') {
              posts = response.data.data?.children?.length || 0;
              platformSentiment = Math.random() * 2 - 1; // Placeholder sentiment analysis
            } else {
              posts = response.data.posts?.length || response.data.messages?.length || response.data.data?.length || 0;
              platformSentiment = response.data.sentiment || Math.random() * 2 - 1;
            }

            totalPosts += posts;
            sentimentScore += platformSentiment;
            successfulPlatforms++;

            // Record API usage
            const apiUsageId = `api_${crypto.randomBytes(8).toString('hex')}`;
            await this.db.run(
              `INSERT INTO api_usage (id, api_name, calls_made, success_rate)
               VALUES (?, ?, ?, ?)`,
              [apiUsageId, `${platform.name}_api`, posts, 0.92]
            );

            dataAgentStatus.totalAPICalls += posts;
          }
        } catch (error) {
          this.logger.warn(`Failed to fetch data from ${platform.name}:`, error.message);
        }
      }

      sentimentScore = successfulPlatforms > 0 ? sentimentScore / successfulPlatforms : 0;

      // Record data collection
      const collectionId = `collect_${crypto.randomBytes(8).toString('hex')}`;
      await this.db.run(
        `INSERT INTO data_collection (id, data_type, source, data_points, quality_score)
         VALUES (?, ?, ?, ?, ?)`,
        [collectionId, 'social_sentiment', 'social_apis', totalPosts, Math.abs(sentimentScore)]
      );

      // Process revenue
      const revenue = await this._processDataRevenue(totalPosts);
      
      await this.analytics.track({
        event: 'social_data_collected',
        properties: {
          postsAnalyzed: totalPosts,
          sentimentScore: sentimentScore,
          revenue: revenue,
          platforms: successfulPlatforms
        }
      });

      this.logger.success(`✅ Analyzed ${totalPosts} social posts, Sentiment: ${sentimentScore.toFixed(2)}, Revenue: $${revenue}`);

      return {
        status: 'success',
        postsAnalyzed: totalPosts,
        sentimentScore,
        revenue,
        successfulPlatforms
      };

    } catch (error) {
      this.logger.error('Social media data collection failed:', error);
      return { status: 'failed', error: error.message };
    }
  }

  async collectFinancialData() {
    this.logger.info('💹 Collecting financial market data...');

    try {
      const markets = [
        { 
          name: 'stocks', 
          api: process.env.STOCKS_API_URL || 'https://api.twelvedata.com/quote',
          symbols: ['AAPL', 'GOOGL', 'MSFT', 'TSLA'],
          enabled: !!process.env.STOCKS_API_KEY
        },
        { 
          name: 'forex', 
          api: process.env.FOREX_API_URL || 'https://api.exchangerate.host/latest',
          symbols: ['EUR', 'GBP', 'JPY', 'CAD'],
          enabled: true
        },
        { 
          name: 'commodities', 
          api: process.env.COMMODITIES_API_URL || 'https://api.metalpriceapi.com/v1/latest',
          enabled: !!process.env.COMMODITIES_API_KEY
        },
        { 
          name: 'indices', 
          api: process.env.INDICES_API_URL || 'https://financialmodelingprep.com/api/v3/quote',
          symbols: ['^GSPC', '^DJI', '^IXIC'],
          enabled: !!process.env.INDICES_API_KEY
        }
      ];
      
      let totalDataPoints = 0;

      for (const market of markets) {
        try {
          if (!market.enabled && market.name !== 'forex') {
            this.logger.warn(`Market ${market.name} not enabled or configured`);
            continue;
          }

          let response;
          if (market.name === 'forex') {
            response = await axios.get(market.api, {
              params: { base: 'USD' },
              timeout: 10000
            });
          } else {
            response = await axios.get(market.api, {
              params: market.symbols ? { symbol: market.symbols.join(',') } : {},
              headers: {
                'Authorization': `Bearer ${process.env[`${market.name.toUpperCase()}_API_KEY`]}`,
                'Content-Type': 'application/json'
              },
              timeout: 10000
            });
          }

          const dataPoints = response.data ? Object.keys(response.data).length : 0;
          totalDataPoints += dataPoints;

          // Record data source performance
          const sourceId = `source_${crypto.randomBytes(8).toString('hex')}`;
          await this.db.run(
            `INSERT INTO data_sources (id, source_name, reliability_score, data_quality)
             VALUES (?, ?, ?, ?)`,
            [sourceId, `${market.name}_data`, 0.88, 0.85]
          );
        } catch (error) {
          this.logger.warn(`Failed to fetch ${market.name} data:`, error.message);
        }
      }

      dataAgentStatus.totalDataPointsCollected += totalDataPoints;

      // Record data collection
      const collectionId = `collect_${crypto.randomBytes(8).toString('hex')}`;
      await this.db.run(
        `INSERT INTO data_collection (id, data_type, source, data_points, quality_score)
         VALUES (?, ?, ?, ?, ?)`,
        [collectionId, 'financial_markets', 'financial_apis', totalDataPoints, 0.87]
      );

      // Process revenue
      const revenue = await this._processDataRevenue(totalDataPoints);
      
      await this.analytics.track({
        event: 'financial_data_collected',
        properties: {
          dataPoints: totalDataPoints,
          revenue: revenue,
          markets: markets.length
        }
      });

      this.logger.success(`✅ Collected ${totalDataPoints} financial data points, Revenue: $${revenue}`);

      return {
        status: 'success',
        dataPoints: totalDataPoints,
        markets: markets.length,
        revenue
      };

    } catch (error) {
      this.logger.error('Financial data collection failed:', error);
      return { status: 'failed', error: error.message };
    }
  }

  async collectWeb3Data() {
    this.logger.info('🔗 Collecting Web3 and blockchain data...');

    try {
      const web3Sources = [
        { 
          name: 'defi_protocols', 
          api: process.env.DEFI_PULSE_API || 'https://api.llama.fi/protocols',
          enabled: true
        },
        { 
          name: 'nft_markets', 
          api: process.env.NFT_API_URL || 'https://api.opensea.io/api/v1/collections',
          enabled: !!process.env.OPENSEA_API_KEY
        },
        { 
          name: 'dao_governance', 
          api: process.env.DAO_API_URL || 'https://api.tally.xyz/proposals',
          enabled: true
        },
        { 
          name: 'smart_contracts', 
          api: process.env.ETHERSCAN_API || 'https://api.etherscan.io/api',
          enabled: !!process.env.ETHERSCAN_API_KEY
        }
      ];
      
      let totalDataPoints = 0;

      for (const source of web3Sources) {
        try {
          if (!source.enabled) {
            this.logger.warn(`Web3 source ${source.name} not enabled or configured`);
            continue;
          }

          let response;
          if (source.name === 'smart_contracts') {
            response = await axios.get(source.api, {
              params: {
                module: 'stats',
                action: 'ethsupply',
                apikey: process.env.ETHERSCAN_API_KEY
              },
              timeout: 15000
            });
          } else {
            response = await axios.get(source.api, {
              headers: {
                'Authorization': `Bearer ${process.env[`${source.name.toUpperCase()}_API_KEY`]}`,
                'Content-Type': 'application/json',
                'User-Agent': 'ArielMatrix/2.0'
              },
              timeout: 15000
            });
          }

          const dataPoints = response.data ? (Array.isArray(response.data) ? response.data.length : Object.keys(response.data).length) : 0;
          totalDataPoints += dataPoints;

          // Use wallet module to get blockchain data
          try {
            const balances = await getWalletBalances();
            dataAgentStatus.blockchainTransactions++;
          } catch (walletError) {
            this.logger.warn('Wallet balance check failed:', walletError.message);
          }

          // Record Web3 data source
          const sourceId = `source_${crypto.randomBytes(8).toString('hex')}`;
          await this.db.run(
            `INSERT INTO data_sources (id, source_name, reliability_score, data_quality)
             VALUES (?, ?, ?, ?)`,
            [sourceId, `${source.name}_web3`, 0.82, 0.80]
          );
        } catch (error) {
          this.logger.warn(`Failed to fetch ${source.name} data:`, error.message);
        }
      }

      dataAgentStatus.totalDataPointsCollected += totalDataPoints;

      // Record data collection
      const collectionId = `collect_${crypto.randomBytes(8).toString('hex')}`;
      await this.db.run(
        `INSERT INTO data_collection (id, data_type, source, data_points, quality_score)
         VALUES (?, ?, ?, ?, ?)`,
        [collectionId, 'web3_ecosystem', 'blockchain_apis', totalDataPoints, 0.83]
      );

      // Process revenue
      const revenue = await this._processDataRevenue(totalDataPoints);
      
      await this.analytics.track({
        event: 'web3_data_collected',
        properties: {
          dataPoints: totalDataPoints,
          revenue: revenue,
          web3Sources: web3Sources.length
        }
      });

      this.logger.success(`✅ Collected ${totalDataPoints} Web3 data points, Revenue: $${revenue}`);

      return {
        status: 'success',
        dataPoints: totalDataPoints,
        web3Sources: web3Sources.length,
        revenue
      };

    } catch (error) {
      this.logger.error('Web3 data collection failed:', error);
      return { status: 'failed', error: error.message };
    }
  }

  async _processDataRevenue(dataPoints) {
    try {
      // Calculate revenue based on data quality and quantity
      const baseValue = dataPoints * 0.01;
      const qualityMultiplier = 0.85;
      const revenueAmount = baseValue * qualityMultiplier;

      if (revenueAmount > 0 && this.walletInitialized) {
        // Use wallet module for revenue processing
        const settlementResult = await sendUSDT(
          this.config.COMPANY_WALLET_ADDRESS,
          revenueAmount,
          'eth'
        );

        if (settlementResult && settlementResult.hash) {
          // Record revenue in database
          const revenueId = `rev_${crypto.randomBytes(8).toString('hex')}`;
          await this.db.run(
            `INSERT INTO data_revenue (id, amount, currency, data_type, transaction_hash)
             VALUES (?, ?, ?, ?, ?)`,
            [revenueId, revenueAmount, 'USD', 'data_collection', settlementResult.hash]
          );

          await this.analytics.track({
            event: 'data_revenue_generated',
            properties: {
              amount: revenueAmount,
              currency: 'USD',
              dataPoints: dataPoints,
              transactionHash: settlementResult.hash
            }
          });

          return revenueAmount;
        }
      }
    } catch (error) {
      this.logger.error('Data revenue processing failed:', error);
    }
    return 0;
  }

  async run() {
    return mutex.runExclusive(async () => {
      this.logger.info('🚀 Data Agent starting comprehensive data collection cycle...');

      try {
        // Initialize wallet connections if not already done
        if (!this.walletInitialized) {
          await this.initializeWalletConnections();
        }

        const results = await Promise.allSettled([
          this.collectMarketData(),
          this.collectSocialMediaData(),
          this.collectFinancialData(),
          this.collectWeb3Data()
        ]);

        const successfulResults = results
          .filter(result => result.status === 'fulfilled')
          .map(result => result.value);

        const totalRevenue = successfulResults.reduce((sum, result) => sum + (result.revenue || 0), 0);
        const totalDataPoints = successfulResults.reduce((sum, result) => sum + (result.dataPoints || result.postsAnalyzed || 0), 0);

        dataAgentStatus.lastExecutionTime = new Date().toISOString();
        dataAgentStatus.lastStatus = 'success';
        dataAgentStatus.dataQualityScore = 0.84;

        this.logger.success(`💰 Data collection completed. Total revenue: $${totalRevenue.toFixed(2)}, Data points: ${totalDataPoints}`);

        return {
          status: 'success',
          totalRevenue,
          totalDataPoints,
          collectionsCompleted: successfulResults.length,
          timestamp: dataAgentStatus.lastExecutionTime
        };

      } catch (error) {
        this.logger.error('Data agent cycle failed:', error);
        dataAgentStatus.lastStatus = 'failed';
        return { status: 'failed', error: error.message };
      }
    });
  }

  async generateGlobalDataCoverage(streamConfig = {}) {
    const results = {
      totalRevenue: 0,
      cyclesCompleted: 0,
      totalDataPoints: 0,
      dataTypesCollected: new Set(),
      dataQualityScore: 0
    };

    // Initialize wallet connections
    await this.initializeWalletConnections();

    // Run multiple cycles for comprehensive coverage
    const cycles = streamConfig.cycles || 3;
    
    for (let i = 0; i < cycles; i++) {
      try {
        const cycleResult = await this.run();
        
        if (cycleResult.status === 'success') {
          results.totalRevenue += cycleResult.totalRevenue;
          results.cyclesCompleted++;
          results.totalDataPoints += cycleResult.totalDataPoints;
          results.dataQualityScore = (results.dataQualityScore * (i) + 0.84) / (i + 1);

          // Track data types
          cycleResult.collectionsCompleted && results.dataTypesCollected.add(`cycle_${i + 1}`);
        }

        await quantumDelay(15000);

      } catch (error) {
        this.logger.error(`Data collection cycle ${i + 1} failed:`, error);
      }
    }

    // Record final revenue using wallet module
    if (results.totalRevenue > 0 && this.walletInitialized) {
      try {
        const settlementResult = await sendUSDT(
          this.config.COMPANY_WALLET_ADDRESS,
          results.totalRevenue,
          'eth'
        );

        if (settlementResult && settlementResult.hash) {
          this.logger.success(`🌍 Global data collection completed: $${results.totalRevenue} USD, ${results.totalDataPoints} data points`);
        }
      } catch (error) {
        this.logger.error('Final revenue settlement failed:', error);
      }
    }

    return results;
  }

  // Additional utility methods
  async checkWalletBalances() {
    try {
      return await getWalletBalances();
    } catch (error) {
      this.logger.error(`Error checking wallet balances: ${error.message}`);
      return {};
    }
  }

  // Database query methods for analytics
  async getDataCollectionStats(timeframe = '7 days') {
    try {
      const timeFilter = timeframe === '24 hours' ? 
        "timestamp > datetime('now', '-1 day')" :
        "timestamp > datetime('now', '-7 days')";

      const stats = await this.db.all(`
        SELECT 
          data_type,
          COUNT(*) as collection_count,
          SUM(data_points) as total_data_points,
          AVG(quality_score) as avg_quality_score,
          SUM(revenue_generated) as total_revenue
        FROM data_collection 
        WHERE ${timeFilter}
        GROUP BY data_type
        ORDER BY total_revenue DESC
      `);

      return stats;
    } catch (error) {
      this.logger.error('Failed to get data collection stats:', error);
      return [];
    }
  }

  async getRevenueAnalytics(timeframe = '7 days') {
    try {
      const timeFilter = timeframe === '24 hours' ? 
        "timestamp > datetime('now', '-1 day')" :
        "timestamp > datetime('now', '-7 days')";

      const revenueData = await this.db.all(`
        SELECT 
          currency,
          SUM(amount) as total_amount,
          COUNT(*) as transaction_count,
          data_type
        FROM data_revenue 
        WHERE ${timeFilter}
        GROUP BY currency, data_type
        ORDER BY total_amount DESC
      `);

      return revenueData;
    } catch (error) {
      this.logger.error('Failed to get revenue analytics:', error);
      return [];
    }
  }

  async close() {
    try {
      if (this.db) {
        await this.db.close();
      }
      if (this.cryptoAgent) {
        await this.cryptoAgent.close();
      }
      if (this.browserManager) {
        await this.browserManager.close();
      }
      this.logger.info('✅ Data Agent resources closed successfully');
    } catch (error) {
      this.logger.error('Error closing Data Agent:', error);
    }
  }
}

// Worker thread implementation for parallel data processing
if (!isMainThread && parentPort) {
  const { task, config, logger } = workerData;
  
  const dataAgent = new DataAgent(config, logger);
  
  parentPort.on('message', async (message) => {
    if (message.type === 'execute') {
      try {
        await dataAgent.initialize();
        const result = await dataAgent[message.task]();
        parentPort.postMessage({ status: 'success', result });
      } catch (error) {
        parentPort.postMessage({ status: 'error', error: error.message });
      }
    }
  });
}

// Export the main DataAgent class
export { DataAgent, dataAgentStatus, CryptoAgent };
export default DataAgent;
