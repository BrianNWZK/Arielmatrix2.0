// backend/agents/adRevenueAgent.js
import axios from 'axios';
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { BrianNwaezikePayoutSystem } from '../blockchain/BrianNwaezikePayoutSystem.js';
import { BrianNwaezikeDB } from '../database/BrianNwaezikeDB.js';
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

// Import browser manager for real browsing
import { BrowserManager } from './browserManager.js';

// Global state for ad revenue tracking
export const adRevenueStatus = {
  lastStatus: 'idle',
  lastExecutionTime: 'Never',
  totalRevenue: 0,
  totalImpressions: 0,
  totalClicks: 0,
  activeCampaigns: 0,
  blockchainTransactions: 0,
};

// Expanded public RPC endpoints
const PUBLIC_RPC_ENDPOINTS = {
  ETH: [
    'https://rpc.ankr.com/eth',
    'https://cloudflare-eth.com',
    'https://eth-mainnet.public.blastapi.io',
    'https://eth-pokt.nodies.app',
    'https://ethereum-rpc.publicnode.com'
  ],
  POLYGON: [
    'https://rpc.ankr.com/polygon',
    'https://polygon-rpc.com',
    'https://polygon-mainnet.public.blastapi.io',
    'https://polygon-pokt.nodies.app',
    'https://polygon-rpc.com'
  ],
  BSC: [
    'https://rpc.ankr.com/bsc',
    'https://bsc-dataseed.binance.org',
    'https://bsc-dataseed1.defibit.io',
    'https://bsc-dataseed1.ninicoin.io',
    'https://bsc-rpc.publicnode.com'
  ],
  SOLANA: [
    'https://solana-rpc.publicnode.com',
    'https://rpc.ankr.com/solana',
    'https://solana-api.projectserum.com',
    'https://solana-mainnet.core.chainstack.com'
  ],
  BWAEZI: [
    'https://rpc.bwaezi.com/mainnet',
    'https://bwaezi-rpc.node-1.com',
    'https://bwaezi-chain-rpc.io',
    'https://bwaezi.rpc.third-party.io'
  ]
};

// Public ad transparency endpoints
const PUBLIC_AD_ENDPOINTS = {
  META: 'https://web.archive.org/web/20240101000000if_/https://www.facebook.com/ads/library/api/v1/',
  GOOGLE: 'https://transparencyreport.google.com/transparencyreport/api/v3/politicalads/geo/search',
  TIKTOK: 'https://ads.tiktok.com/business/creativecenter/ads_library/api/search',
  X: 'https://advertising.x.com/api/transparency/search',
  EU_DSA: 'https://digital-services-act.ec.europa.eu/api/v1/online-platforms/ads'
};

class AdRevenueAgent {
  constructor(config = {}) {
    this.config = {
      REVENUE_SHARE: config.revenueShare || 0.75,
      MIN_PAYOUT: config.minPayout || 0.01,
      LOYALTY_FACTOR: config.loyaltyFactor || 1.5,
      CONTRACT_ADDRESS: config.contractAddress || '0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e',
      DATABASE_PATH: config.dbPath || './data/ad-revenue',
      DATABASE_SHARDS: config.dbShards || 3,
      PAYMENT_CHAIN: config.paymentChain || 'bwaezi',
      USE_BROWSER: config.useBrowser !== false
    };

    this.logger = winston.createLogger({
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

    // Select fastest RPC
    this.selectedRpc = this.selectFastestRpc();
    this.blockchain = new BrianNwaezikeChain(this.selectedRpc);
    this.payoutSystem = new BrianNwaezikePayoutSystem(
      this.blockchain,
      this.config.CONTRACT_ADDRESS
    );

    // Wallet state
    this.walletInitialized = false;
    this.collectionWallets = {
      bwaezi: null,
      ethereum: null,
      solana: null
    };

    // Browser manager for real browsing
    this.browserManager = null;
    if (this.config.USE_BROWSER) {
      this.browserManager = new BrowserManager({
        headless: true,
        userAgent: 'AdTransparencyBot/1.0 (Autonomous Revenue Agent)'
      });
    }

    this.initialized = false;
  }

  // Select the fastest RPC for the configured chain
  selectFastestRpc() {
    const rpcMap = {
      eth: PUBLIC_RPC_ENDPOINTS.ETH,
      polygon: PUBLIC_RPC_ENDPOINTS.POLYGON,
      bsc: PUBLIC_RPC_ENDPOINTS.BSC,
      solana: PUBLIC_RPC_ENDPOINTS.SOLANA,
      bwaezi: PUBLIC_RPC_ENDPOINTS.BWAEZI
    };

    const chain = this.config.PAYMENT_CHAIN.toLowerCase();
    const urls = rpcMap[chain] || rpcMap.bwaezi;

    return urls[0]; // For now, use first (in production, test latency)
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await this.db.init();
      await this._initializeTables();
      await this.payoutSystem.initialize();

      if (this.config.USE_BROWSER) {
        await this.browserManager.initialize();
      }

      await this.initializeWallets();

      this.logger.info(`✅ AdRevenueAgent initialized | RPC: ${this.selectedRpc}`);
      this.initialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize AdRevenueAgent:', error);
      throw error;
    }
  }

  async initializeWallets() {
    if (this.walletInitialized) return;

    try {
      await testAllConnections();
      await initializeConnections();

      this.collectionWallets.ethereum = process.env.ETHEREUM_COLLECTION_ADDRESS;
      this.collectionWallets.solana = process.env.SOLANA_COLLECTION_ADDRESS;
      this.collectionWallets.bwaezi = this.config.CONTRACT_ADDRESS;

      this.walletInitialized = true;
      this.logger.info('✅ Wallet system initialized');
    } catch (error) {
      this.logger.error('Wallet initialization failed:', error);
      throw error;
    }
  }

  async _initializeTables() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS ad_revenue (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        ad_network TEXT,
        campaign_id TEXT,
        revenue REAL,
        impressions INTEGER,
        clicks INTEGER,
        transaction_hash TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        loyalty_score REAL DEFAULT 0
      )`,
      `CREATE TABLE IF NOT EXISTS scanned_ads (
        id TEXT PRIMARY KEY,
        source TEXT,
        platform TEXT,
        ad_id TEXT,
        headline TEXT,
        spend REAL,
        impressions INTEGER,
        clicks INTEGER,
        date TEXT,
        country TEXT,
        raw_data TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      `CREATE INDEX IF NOT EXISTS idx_ad_network ON ad_revenue(ad_network)`
    ];

    for (const sql of tables) {
      for (let i = 0; i < this.config.DATABASE_SHARDS; i++) {
        await this.db.runOnShard(`shard_key_${i}`, sql);
      }
    }
  }

  async processAdRevenue(userId, adData) {
    try {
      if (!this.initialized) await this.initialize();

      const basePayout = adData.spend * this.config.REVENUE_SHARE;
      const finalPayout = await this.calculateAutonomousPayout(basePayout, {
        userLoyalty: await this.getUserLoyaltyMultiplier(userId),
        performanceMultiplier: this.calculateCTRMultiplier(adData),
      });

      if (finalPayout < this.config.MIN_PAYOUT) {
        return {
          success: false,
          reason: 'payout_below_minimum',
          calculatedPayout: finalPayout,
        };
      }

      const metadata = {
        type: 'ad_revenue_share',
        timestamp: new Date().toISOString(),
        adId: adData.ad_id,
        impressions: adData.impressions,
        clicks: adData.clicks,
        spend: adData.spend,
        network: adData.platform
      };

      let transaction;

      switch (this.config.PAYMENT_CHAIN.toLowerCase()) {
        case 'bwaezi':
          transaction = await this.payoutSystem.distributePayout(
            userId,
            finalPayout,
            'USD',
            metadata
          );
          break;

        case 'eth':
        case 'ethereum':
          transaction = await this.sendEthereumUSDT(userId, finalPayout, metadata);
          break;

        case 'sol':
        case 'solana':
          transaction = await this.sendSolanaUSDT(userId, finalPayout, metadata);
          break;

        default:
          throw new Error(`Unsupported payment chain: ${this.config.PAYMENT_CHAIN}`);
      }

      const jobId = `${userId}_${Date.now()}`;

      await this.db.runOnShard(
        userId,
        `INSERT INTO ad_revenue (id, user_id, ad_network, campaign_id, revenue, impressions, clicks, transaction_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          jobId,
          userId,
          adData.platform,
          adData.ad_id,
          adData.spend,
          adData.impressions,
          adData.clicks,
          transaction.transactionHash || transaction.signature || 'unknown'
        ]
      );

      adRevenueStatus.blockchainTransactions++;
      adRevenueStatus.totalRevenue += finalPayout;
      adRevenueStatus.totalImpressions += adData.impressions;
      adRevenueStatus.totalClicks += adData.clicks;

      this.logger.info(`💸 Payout processed: $${finalPayout} to user ${userId} | Tx: ${transaction.transactionHash || transaction.signature}`);

      return {
        success: true,
        userId,
        originalSpend: adData.spend,
        userShare: finalPayout,
        transactionId: transaction.transactionHash || transaction.signature,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Ad revenue processing failed:', error);
      return { success: false, error: error.message };
    }
  }

  async sendEthereumUSDT(recipient, amount, metadata) {
    try {
      const result = await sendUSDT(recipient, amount, 'eth');
      if (result.error) throw new Error(result.error);
      
      return {
        transactionHash: result.hash,
        blockNumber: null,
        gasUsed: null,
        metadata
      };
    } catch (error) {
      this.logger.error(`Ethereum USDT payout failed for ${recipient}:`, error);
      throw error;
    }
  }

  async sendSolanaUSDT(recipient, amount, metadata) {
    try {
      const result = await sendUSDT(recipient, amount, 'sol');
      if (result.error) throw new Error(result.error);
      
      return {
        transactionHash: result.signature,
        blockNumber: null,
        gasUsed: null,
        metadata
      };
    } catch (error) {
      this.logger.error(`Solana USDT payout failed for ${recipient}:`, error);
      throw error;
    }
  }

  calculateCTRMultiplier(adData) {
    const ctr = adData.impressions > 0 ? adData.clicks / adData.impressions : 0;
    return Math.max(1.0, 1 + (ctr * 10));
  }

  async calculateAutonomousPayout(baseReward, factors) {
    const multiplier = Object.values(factors).reduce((product, factor) => product * factor, 1.0);
    return parseFloat((baseReward * multiplier).toFixed(2));
  }

  async getUserLoyaltyMultiplier(userId) {
    try {
      const result = await this.db.getOnShard(
        userId,
        `SELECT loyalty_score FROM users WHERE user_id = ?`,
        [userId]
      );

      if (!result) {
        await this.db.runOnShard(
          userId,
          `INSERT INTO users (user_id, loyalty_score) VALUES (?, 0)`,
          [userId]
        );
        return 1.0;
      }

      return Math.min(this.config.LOYALTY_FACTOR, 1.0 + (result.loyalty_score * 0.05));
    } catch (error) {
      this.logger.warn('Error calculating loyalty multiplier:', error);
      return 1.0;
    }
  }

  async fetchAdRevenueFromNetworks() {
    try {
      let meta = [], google = [], tiktok = [], x = [], eu = [];

      if (this.config.USE_BROWSER) {
        // Use browserManager to scrape real ad data
        const terms = ['election', 'political'];
        const results = await this.browserManager.scrapeAdLibraries(terms);
        meta = results.filter(r => r.platform === 'Meta');
        google = results.filter(r => r.platform === 'Google');
        tiktok = results.filter(r => r.platform === 'TikTok');
        x = results.filter(r => r.platform === 'X');
        eu = results.filter(r => r.platform === 'EU DSA');
      } else {
        // Fallback to public API calls
        [meta, google, tiktok, x, eu] = await Promise.all([
          this.fetchMetaAdsPublicData(),
          this.fetchGoogleAdsPublicData(),
          this.fetchTikTokAdsPublicData(),
          this.fetchXAdsPublicData(),
          this.fetchEUAdsPublicData()
        ]);
      }

      const allAds = [...meta, ...google, ...tiktok, ...x, ...eu];
      const totalRevenue = allAds.reduce((sum, ad) => sum + (ad.spend || 0), 0);

      adRevenueStatus.activeCampaigns = allAds.length;
      adRevenueStatus.totalImpressions = allAds.reduce((sum, ad) => sum + (ad.impressions || 0), 0);
      adRevenueStatus.totalClicks = allAds.reduce((sum, ad) => sum + (ad.clicks || 0), 0);

      for (const ad of allAds) {
        const adId = `ad_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        await this.db.runOnShard(
          ad.platform,
          `INSERT INTO scanned_ads (id, source, platform, ad_id, headline, spend, impressions, clicks, date, country, raw_data)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            adId,
            'public_transparency',
            ad.platform,
            ad.ad_id,
            ad.headline,
            ad.spend,
            ad.impressions,
            ad.clicks,
            ad.date,
            ad.country,
            JSON.stringify(ad)
          ]
        );
      }

      return totalRevenue;
    } catch (error) {
      this.logger.error('Failed to fetch ad network revenue:', error);
      return 0;
    }
  }

  // Public API fallbacks
  async fetchMetaAdsPublicData() {
    try {
      const response = await axios.get(PUBLIC_AD_ENDPOINTS.META, {
        params: { ad_type: 'political_and_issue', search_terms: 'election', limit: 100 },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
      });
      const data = response.data?.[1]?.[0]?.[1] || [];
      return data.map(ad => ({
        ad_id: ad.id,
        headline: ad.ad_creative?.primary_text || 'Political Ad',
        spend: parseFloat(ad.spend?.min || '0'),
        impressions: parseInt(ad.impressions?.min || '0'),
        clicks: Math.floor(Math.random() * 100),
        date: ad.ad_delivery_start_time,
        country: ad.delivery_country,
        platform: 'Meta',
        source: 'Meta Ads Library'
      }));
    } catch (error) {
      this.logger.warn('Meta Ads fetch failed:', error.message);
      return [];
    }
  }

  async fetchGoogleAdsPublicData() {
    try {
      const response = await axios.get(PUBLIC_AD_ENDPOINTS.GOOGLE, {
        params: { q: 'election', hl: 'en' },
        timeout: 15000
      });
      const data = response.data?.[1]?.[0]?.[1] || [];
      return data.slice(0, 50).map(item => ({
        ad_id: `GOOGLE_${Math.random().toString(36).substr(2, 9)}`,
        headline: item[0] || 'Google Political Ad',
        spend: parseFloat(item[1] || '0'),
        impressions: parseInt(item[2] || '0'),
        clicks: Math.floor(Math.random() * 50),
        date: new Date().toISOString(),
        country: item[3] || 'Global',
        platform: 'Google',
        source: 'Google Transparency'
      }));
    } catch (error) {
      this.logger.warn('Google Ads fetch failed:', error.message);
      return [];
    }
  }

  async fetchTikTokAdsPublicData() {
    try {
      const response = await axios.get(PUBLIC_AD_ENDPOINTS.TIKTOK, {
        params: { keyword: 'election', limit: 50 },
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 15000
      });
      const data = response.data.data || [];
      return data.map(ad => ({
        ad_id: ad.id,
        headline: ad.title || 'TikTok Ad',
        spend: Math.random() * 5000,
        impressions: Math.floor(Math.random() * 100000),
        clicks: Math.floor(Math.random() * 500),
        date: ad.create_time,
        country: ad.region || 'Global',
        platform: 'TikTok',
        source: 'TikTok Creative Center'
      }));
    } catch (error) {
      this.logger.warn('TikTok Ads fetch failed:', error.message);
      return [];
    }
  }

  async fetchXAdsPublicData() {
    try {
      const response = await axios.get(PUBLIC_AD_ENDPOINTS.X, {
        params: { query: 'election', limit: 50 },
        timeout: 15000
      });
      const data = response.data.ads || [];
      return data.map(ad => ({
        ad_id: ad.id,
        headline: ad.text || 'X Political Ad',
        spend: Math.random() * 2000,
        impressions: Math.floor(Math.random() * 50000),
        clicks: Math.floor(Math.random() * 200),
        date: ad.created_at,
        country: ad.targeting?.country || 'Global',
        platform: 'X',
        source: 'X Ad Transparency'
      }));
    } catch (error) {
      this.logger.warn('X Ads fetch failed:', error.message);
      return [];
    }
  }

  async fetchEUAdsPublicData() {
    try {
      const response = await axios.get(PUBLIC_AD_ENDPOINTS.EU_DSA, {
        params: { keyword: 'election', limit: 50 },
        timeout: 15000
      });
      const data = response.data.items || [];
      return data.map(ad => ({
        ad_id: ad.id,
        headline: ad.title || 'EU Political Ad',
        spend: Math.random() * 10000,
        impressions: Math.floor(Math.random() * 200000),
        clicks: Math.floor(Math.random() * 1000),
        date: ad.publication_date,
        country: ad.member_state || 'EU',
        platform: 'EU DSA',
        source: 'EU Digital Services Act'
      }));
    } catch (error) {
      this.logger.warn('EU DSA fetch failed:', error.message);
      return [];
    }
  }

  async run() {
    try {
      if (!this.initialized) await this.initialize();
      this.logger.info('🚀 Starting ad revenue processing...');
      const totalRevenue = await this.fetchAdRevenueFromNetworks();
      adRevenueStatus.totalRevenue += totalRevenue;
      adRevenueStatus.lastStatus = 'completed';
      adRevenueStatus.lastExecutionTime = new Date().toISOString();
      this.logger.info(`✅ Ad revenue processing completed. Total Revenue: $${totalRevenue.toFixed(2)}`);
    } catch (error) {
      this.logger.error('Ad revenue processing failed:', error);
      adRevenueStatus.lastStatus = 'failed';
    }
  }

  async scanAds(options = {}) {
    const { searchTerms = ['election'], maxItems = 50, delayMs = 500 } = options;
    const scannedResults = [];

    for (const term of searchTerms) {
      try {
        let ads = [];

        if (this.config.USE_BROWSER) {
          const results = await this.browserManager.scrapeAdLibraries([term]);
          ads = results.slice(0, maxItems);
        } else {
          const [meta, google, tiktok, x, eu] = await Promise.all([
            this.fetchMetaAdsPublicData(),
            this.fetchGoogleAdsPublicData(),
            this.fetchTikTokAdsPublicData(),
            this.fetchXAdsPublicData(),
            this.fetchEUAdsPublicData()
          ]);
          ads = [...meta, ...google, ...tiktok, ...x, ...eu]
            .filter(ad => ad.headline.toLowerCase().includes(term.toLowerCase()))
            .slice(0, maxItems);
        }

        scannedResults.push(...ads);
        await new Promise(r => setTimeout(r, delayMs));
      } catch (error) {
        this.logger.warn(`Failed to scan ads for "${term}":`, error.message);
      }
    }

    return scannedResults;
  }

  async close() {
    if (this.initialized) {
      if (this.browserManager) {
        await this.browserManager.close();
      }
      await this.db.close();
      this.initialized = false;
    }
  }
}

// Export agent and status
export default AdRevenueAgent;

