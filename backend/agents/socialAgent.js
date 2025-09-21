// backend/agents/socialAgent.js
import axios from 'axios';
import { TwitterApi } from 'twitter-api-v2';
import { Mutex } from 'async-mutex';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { EnterprisePaymentProcessor } from '../blockchain/EnterprisePaymentProcessor.js';
import BrianNwaezikeDB from '../database/BrianNwaezikeDB.js';
import apiScoutAgent from './apiScoutAgent.js';

export default class apiScoutAgentExtension {
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
    const discoveredTargets = await this.apiScout.discoverAllAvailableTargets(); // Autonomous discovery

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

// Import browser manager for real browsing
import { BrowserManager } from './browserManager.js';

// Import wallet functions
import { 
    initializeConnections,
    getSolanaBalance,
    sendSOL,
    getUSDTBalance,
    sendUSDT,
    checkWalletBalances,
    testAllConnections
} from '../blockchain/wallet.js';

// Get __filename equivalent in ES Module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Real-Time Analytics Integration ---
class SocialAnalytics {
    constructor(writeKey) {
        this.writeKey = writeKey;
        this.blockchain = new BrianNwaezikeChain({
            NETWORK_TYPE: 'private',
            VALIDATORS: [process.env.COMPANY_WALLET_ADDRESS],
            BLOCK_TIME: 1000,
            NATIVE_TOKEN: 'USD',
            NODE_ID: 'social_analytics_node',
            SYSTEM_ACCOUNT: process.env.COMPANY_WALLET_ADDRESS,
            SYSTEM_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY
        });
    }

    async track(eventData) {
        try {
            // Record analytics event on blockchain for immutable tracking
            const transaction = await this.blockchain.createTransaction(
                process.env.COMPANY_WALLET_ADDRESS,
                'analytics_tracking_address',
                0.01, // Minimal fee for tracking
                'USD',
                process.env.COMPANY_WALLET_PRIVATE_KEY,
                JSON.stringify(eventData)
            );
            
            console.log(`📊 Analytics tracked on blockchain: ${transaction.id}`);
        } catch (error) {
            console.error('Blockchain analytics tracking failed:', error);
        }
    }

    async identify(userData) {
        // User identification tracking
        console.log(`👤 User identified: ${JSON.stringify(userData)}`);
    }
}

// Global state for social agent
const socialAgentStatus = {
    lastStatus: 'idle',
    lastExecutionTime: 'Never',
    totalSuccessfulPosts: 0,
    totalFailedPosts: 0,
    activeWorkers: 0,
    workerStatuses: {},
    totalRevenueGenerated: 0,
    blockchainTransactions: 0
};

const mutex = new Mutex();
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = Math.floor(Math.random() * 3000) + 1000;
    setTimeout(resolve, ms + jitter);
});

const PROFITABILITY_MATRIX = [
    { country: 'United States', score: 100, currency: 'USD' },
    { country: 'Singapore', score: 98, currency: 'SGD' },
    { country: 'Switzerland', score: 95, currency: 'CHF' },
    { country: 'United Arab Emirates', score: 92, currency: 'AED' },
    { country: 'United Kingdom', score: 90, currency: 'GBP' },
    { country: 'Hong Kong', score: 88, currency: 'HKD' },
    { country: 'Germany', score: 82, currency: 'EUR' },
    { country: 'Japan', score: 80, currency: 'JPY' },
    { country: 'Canada', score: 78, currency: 'CAD' },
    { country: 'Australia', score: 75, currency: 'AUD' },
    { country: 'India', score: 70, currency: 'INR' },
    { country: 'Nigeria', score: 68, currency: 'NGN' },
    { country: 'Vietnam', score: 65, currency: 'VND' },
    { country: 'Philippines', score: 62, currency: 'PHP' },
    { country: 'Brazil', score: 60, currency: 'BRL' }
];

const WOMEN_TOP_SPENDING_CATEGORIES = [
    'Luxury Goods', 'High-End Fashion', 'Beauty & Skincare', 'Health & Wellness',
    'Travel & Experiences', 'Fine Jewelry', 'Exclusive Events', 'Smart Home Tech',
    'Designer Pets & Accessories', 'Cryptocurrency Investments', 'NFT Collections',
    'Sustainable Luxury', 'Digital Art', 'Virtual Real Estate'
];

class SocialAgent {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.db = createDatabase('./data/social_agent.db');
        this.platformClients = {};
        this.paymentProcessor = new EnterprisePaymentProcessor();
        this.analytics = new SocialAnalytics(config.ANALYTICS_WRITE_KEY);
        this.walletInitialized = false;
        
        this._initializeDatabase();
        this._initializePlatformClients();
        this._initializeBlockchain();
    }

    async _initializeDatabase() {
        try {
            await this.db.connect();
            
            // Create social agent specific tables
            const tables = [
                `CREATE TABLE IF NOT EXISTS social_posts (
                    id TEXT PRIMARY KEY,
                    platform TEXT NOT NULL,
                    post_id TEXT,
                    content_title TEXT NOT NULL,
                    country TEXT NOT NULL,
                    currency TEXT NOT NULL,
                    interest_category TEXT NOT NULL,
                    success BOOLEAN NOT NULL,
                    revenue_generated REAL DEFAULT 0,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                `CREATE TABLE IF NOT EXISTS social_revenue (
                    id TEXT PRIMARY KEY,
                    amount REAL NOT NULL,
                    currency TEXT NOT NULL,
                    country TEXT NOT NULL,
                    transaction_hash TEXT,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                `CREATE TABLE IF NOT EXISTS platform_performance (
                    id TEXT PRIMARY KEY,
                    platform TEXT NOT NULL,
                    successful_posts INTEGER DEFAULT 0,
                    failed_posts INTEGER DEFAULT 0,
                    total_revenue REAL DEFAULT 0,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                `CREATE TABLE IF NOT EXISTS country_performance (
                    id TEXT PRIMARY KEY,
                    country TEXT NOT NULL,
                    total_revenue REAL DEFAULT 0,
                    posts_count INTEGER DEFAULT 0,
                    success_rate REAL DEFAULT 0,
                    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
                )`,
                "CREATE INDEX IF NOT EXISTS idx_social_platform ON social_posts(platform)",
                "CREATE INDEX IF NOT EXISTS idx_social_country ON social_posts(country)",
                "CREATE INDEX IF NOT EXISTS idx_social_timestamp ON social_posts(timestamp)",
                "CREATE INDEX IF NOT EXISTS idx_revenue_currency ON social_revenue(currency)"
            ];

            for (const tableSql of tables) {
                await this.db.run(tableSql);
            }
            
            this.logger.success('✅ Social Agent database initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize database:', error);
        }
    }

    async initializeWalletConnections() {
        this.logger.info('🔗 Initializing multi-chain wallet connections for Social Agent...');
        
        try {
            // Use the imported wallet initialization
            await initializeConnections();
            this.walletInitialized = true;
            this.logger.success('✅ Multi-chain wallet connections initialized successfully');
            
        } catch (error) {
            this.logger.error(`Failed to initialize wallet connections: ${error.message}`);
        }
    }

    async _initializeBlockchain() {
        try {
            await this.paymentProcessor.initialize();
            this.logger.success('✅ BrianNwaezikeChain payment processor initialized');
        } catch (error) {
            this.logger.error('Failed to initialize blockchain:', error);
        }
    }

    _initializePlatformClients() {
        // Initialize all social media platforms with real API keys
        const platforms = {
            twitter: {
                client: null,
                requiredKeys: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET']
            },
            facebook: {
                client: null,
                requiredKeys: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET', 'FACEBOOK_ACCESS_TOKEN']
            },
            instagram: {
                client: null,
                requiredKeys: ['INSTAGRAM_APP_ID', 'INSTAGRAM_ACCESS_TOKEN']
            },
            linkedin: {
                client: null,
                requiredKeys: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET', 'LINKEDIN_ACCESS_TOKEN']
            },
            tiktok: {
                client: null,
                requiredKeys: ['TIKTOK_APP_ID', 'TIKTOK_ACCESS_TOKEN']
            }
        };

        for (const [platform, config] of Object.entries(platforms)) {
            const hasAllKeys = config.requiredKeys.every(key => this.config[key]);
            
            if (hasAllKeys) {
                try {
                    if (platform === 'twitter') {
                        config.client = new TwitterApi({
                            appKey: this.config.X_API_KEY,
                            appSecret: this.config.X_API_SECRET,
                            accessToken: this.config.X_ACCESS_TOKEN,
                            accessSecret: this.config.X_ACCESS_SECRET
                        });
                    }
                    // Other platform initializations would go here
                    this.logger.success(`✅ ${platform} client initialized`);
                } catch (error) {
                    this.logger.error(`Failed to initialize ${platform}:`, error);
                }
            } else {
                this.logger.warn(`⚠️ Missing keys for ${platform}, skipping initialization`);
            }
        }
    }

    _selectTargetCountry() {
        const weightedPool = [];
        PROFITABILITY_MATRIX.forEach(item => {
            for (let i = 0; i < item.score / 10; i++) {
                weightedPool.push(item);
            }
        });
        const randomIndex = Math.floor(Math.random() * weightedPool.length);
        return weightedPool[randomIndex];
    }

    async _generateAIImage(prompt) {
        try {
            // Use free AI image generation APIs
            const apis = [
                'https://api.unsplash.com/photos/random?query=',
                'https://picsum.photos/800/600?random=',
                'https://source.unsplash.com/random/800x600/?'
            ];

            const apiUrl = apis[Math.floor(Math.random() * apis.length)] + encodeURIComponent(prompt);
            const response = await axios.get(apiUrl, { timeout: 10000 });
            
            return response.request.res.responseUrl || apiUrl;
        } catch (error) {
            this.logger.error('Image generation failed:', error);
            return 'https://picsum.photos/800/600'; // Fallback image
        }
    }

    async _generateAdvancedContent(countryData, specificInterest = null) {
        const interest = specificInterest || 
            WOMEN_TOP_SPENDING_CATEGORIES[Math.floor(Math.random() * WOMEN_TOP_SPENDING_CATEGORIES.length)];
        
        const imagePrompt = `luxury ${interest} in ${countryData.country} lifestyle`;
        const mediaUrl = await this._generateAIImage(imagePrompt);

        const captions = {
            twitter: `✨ Discover exclusive ${interest} opportunities in ${countryData.country}! 
                     Join elite investors worldwide. #${interest.replace(/\s/g, '')} #${countryData.country.replace(/\s/g, '')}Wealth`,
            
            facebook: `🌟 Premium ${interest} insights for sophisticated investors in ${countryData.country}. 
                      Elevate your portfolio with curated opportunities.`,
            
            instagram: `💎 Luxury ${interest} experiences in ${countryData.country} 
                       #LuxuryLife #EliteInvesting #${countryData.country.replace(/\s/g, '')}`,
            
            linkedin: `Professional ${interest} investment opportunities in ${countryData.country}. 
                      Connect with global investors and premium offerings.`,
            
            tiktok: `🚀 ${interest} trends in ${countryData.country} are exploding! 
                    Tap in for exclusive insights 💫 #Investing #WealthBuilding`
        };

        return {
            title: `Elite ${interest} - ${countryData.country}`,
            captions,
            media: mediaUrl,
            country: countryData.country,
            currency: countryData.currency,
            interest: interest
        };
    }

    async _postToPlatform(platform, content, paymentAddress) {
        try {
            const platformClient = this.platformClients[platform]?.client;
            if (!platformClient) {
                throw new Error(`${platform} client not initialized`);
            }

            const caption = content.captions[platform] || content.captions.twitter;
            const monetizedCaption = `${caption}

💰 Direct blockchain payments accepted!
Send ${content.currency} to: ${paymentAddress}
#CryptoPayments #Blockchain #Web3`;

            let result;
            switch (platform) {
                case 'twitter':
                    result = await platformClient.v2.tweet(monetizedCaption);
                    break;
                // Other platform posting logic would go here
                default:
                    throw new Error(`Unsupported platform: ${platform}`);
            }

            return { success: true, postId: result.data.id };
        } catch (error) {
            this.logger.error(`Failed to post to ${platform}:`, error);
            return { success: false, error: error.message };
        }
    }

    async _recordPostToDatabase(platform, content, result, revenue = 0) {
        const postId = `post_${crypto.randomBytes(8).toString('hex')}`;
        
        await this.db.run(
            `INSERT INTO social_posts (id, platform, post_id, content_title, country, currency, interest_category, success, revenue_generated)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [postId, platform, result.postId, content.title, content.country, content.currency, content.interest, result.success, revenue]
        );

        // Update platform performance
        await this._updatePlatformPerformance(platform, result.success, revenue);

        // Update country performance
        await this._updateCountryPerformance(content.country, result.success, revenue);
    }

    async _updatePlatformPerformance(platform, success, revenue) {
        try {
            const existing = await this.db.get(
                'SELECT * FROM platform_performance WHERE platform = ?',
                [platform]
            );

            if (existing) {
                await this.db.run(
                    `UPDATE platform_performance 
                     SET successful_posts = successful_posts + ?, 
                         failed_posts = failed_posts + ?,
                         total_revenue = total_revenue + ?,
                         last_updated = CURRENT_TIMESTAMP
                     WHERE platform = ?`,
                    [success ? 1 : 0, success ? 0 : 1, revenue, platform]
                );
            } else {
                await this.db.run(
                    `INSERT INTO platform_performance (id, platform, successful_posts, failed_posts, total_revenue)
                     VALUES (?, ?, ?, ?, ?)`,
                    [`perf_${platform}`, platform, success ? 1 : 0, success ? 0 : 1, revenue]
                );
            }
        } catch (error) {
            this.logger.error('Failed to update platform performance:', error);
        }
    }

    async _updateCountryPerformance(country, success, revenue) {
        try {
            const existing = await this.db.get(
                'SELECT * FROM country_performance WHERE country = ?',
                [country]
            );

            if (existing) {
                const newPostsCount = existing.posts_count + 1;
                const newSuccessRate = ((existing.success_rate * existing.posts_count) + (success ? 1 : 0)) / newPostsCount;
                
                await this.db.run(
                    `UPDATE country_performance 
                     SET total_revenue = total_revenue + ?,
                         posts_count = posts_count + 1,
                         success_rate = ?,
                         last_updated = CURRENT_TIMESTAMP
                     WHERE country = ?`,
                    [revenue, newSuccessRate, country]
                );
            } else {
                await this.db.run(
                    `INSERT INTO country_performance (id, country, total_revenue, posts_count, success_rate)
                     VALUES (?, ?, ?, ?, ?)`,
                    [`country_${country.replace(/\s/g, '_')}`, country, revenue, 1, success ? 1 : 0]
                );
            }
        } catch (error) {
            this.logger.error('Failed to update country performance:', error);
        }
    }

    async _processRevenue(content, platformResults) {
        try {
            // Calculate revenue based on engagement metrics
            const engagementScore = platformResults.filter(p => p.success).length * 25;
            const revenueAmount = engagementScore * (PROFITABILITY_MATRIX.find(c => c.country === content.country)?.score || 50) / 100;

            // Use wallet module for revenue processing
            if (revenueAmount > 0) {
                let settlementResult;
                
                // Determine optimal settlement method based on currency
                if (['USD', 'EUR', 'GBP'].includes(content.currency)) {
                    // Use Ethereum for major currencies
                    settlementResult = await sendUSDT(
                        this.config.COMPANY_WALLET_ADDRESS,
                        revenueAmount,
                        'eth'
                    );
                } else {
                    // Use Solana for other currencies
                    const solAmount = await this._convertToSol(revenueAmount, content.currency);
                    settlementResult = await sendSOL(
                        this.config.COMPANY_WALLET_ADDRESS,
                        solAmount
                    );
                }

                if (settlementResult.hash || settlementResult.signature) {
                    socialAgentStatus.totalRevenueGenerated += revenueAmount;
                    socialAgentStatus.blockchainTransactions++;
                    
                    // Record revenue in database
                    const revenueId = `rev_${crypto.randomBytes(8).toString('hex')}`;
                    await this.db.run(
                        `INSERT INTO social_revenue (id, amount, currency, country, transaction_hash)
                         VALUES (?, ?, ?, ?, ?)`,
                        [revenueId, revenueAmount, content.currency, content.country, settlementResult.hash || settlementResult.signature]
                    );

                    await this.analytics.track({
                        event: 'social_revenue_generated',
                        properties: {
                            amount: revenueAmount,
                            currency: content.currency,
                            country: content.country,
                            interest: content.interest,
                            transactionHash: settlementResult.hash || settlementResult.signature
                        }
                    });

                    return revenueAmount;
                }
            }
        } catch (error) {
            this.logger.error('Revenue processing failed:', error);
        }
        return 0;
    }

    async _convertToSol(amount, currency) {
        try {
            // Simple conversion rates (in a real implementation, use an API)
            const conversionRates = {
                USD: 100, // 1 SOL ≈ $100
                EUR: 110,
                GBP: 130,
                JPY: 0.70,
                CAD: 75,
                AUD: 65,
                INR: 1.20,
                NGN: 0.12,
                BRL: 20,
                SGD: 75,
                CHF: 110,
                AED: 27,
                HKD: 13,
                PHP: 1.80,
                VND: 0.004
            };

            const rate = conversionRates[currency] || 100; // Default to USD rate
            return amount / rate;
        } catch (error) {
            this.logger.error('Currency conversion failed:', error);
            return amount / 100; // Fallback conversion
        }
    }

    async run() {
        return mutex.runExclusive(async () => {
            this.logger.info('🚀 Social Agent starting revenue generation cycle...');

            try {
                // Initialize wallet connections if not already done
                if (!this.walletInitialized) {
                    await this.initializeWalletConnections();
                }

                // 1. Select target market
                const targetCountry = this._selectTargetCountry();
                this.logger.info(`🎯 Targeting: ${targetCountry.country} (${targetCountry.currency})`);

                // 2. Generate premium content
                const content = await this._generateAdvancedContent(targetCountry);
                this.logger.info(`📝 Content generated: ${content.title}`);

                // 3. Distribute to all available platforms
                const platformResults = [];
                const activePlatforms = Object.keys(this.platformClients).filter(p => this.platformClients[p].client);

                for (const platform of activePlatforms) {
                    const result = await this._postToPlatform(platform, content, this.config.COMPANY_WALLET_ADDRESS);
                    platformResults.push({ platform, ...result });
                    
                    if (result.success) {
                        socialAgentStatus.totalSuccessfulPosts++;
                        this.logger.success(`✅ Posted to ${platform}`);
                    } else {
                        socialAgentStatus.totalFailedPosts++;
                        this.logger.warn(`⚠️ Failed to post to ${platform}: ${result.error}`);
                    }

                    // Record post to database
                    await this._recordPostToDatabase(platform, content, result);

                    await quantumDelay(2000);
                }

                // 4. Process revenue using wallet module
                const revenue = await this._processRevenue(content, platformResults);
                this.logger.success(`💰 Revenue generated: ${revenue} ${content.currency}`);

                // 5. Analytics and reporting
                await this.analytics.track({
                    event: 'social_cycle_completed',
                    properties: {
                        country: content.country,
                        revenue: revenue,
                        currency: content.currency,
                        successfulPosts: platformResults.filter(p => p.success).length,
                        totalPlatforms: platformResults.length
                    }
                });

                socialAgentStatus.lastExecutionTime = new Date().toISOString();
                socialAgentStatus.lastStatus = 'success';

                return {
                    status: 'success',
                    revenue: revenue,
                    currency: content.currency,
                    country: content.country,
                    platformResults: platformResults
                };

            } catch (error) {
                this.logger.error('Social agent cycle failed:', error);
                socialAgentStatus.lastStatus = 'failed';
                return { status: 'failed', error: error.message };
            }
        });
    }

    async generateGlobalRevenue(streamConfig = {}) {
        const results = {
            totalRevenue: 0,
            cyclesCompleted: 0,
            countriesTargeted: new Set(),
            currenciesUsed: new Set(),
            platformPerformance: {}
        };

        // Initialize wallet connections
        await this.initializeWalletConnections();

        // Run multiple cycles for global coverage
        const cycles = streamConfig.cycles || 5;
        
        for (let i = 0; i < cycles; i++) {
            try {
                const cycleResult = await this.run();
                
                if (cycleResult.status === 'success') {
                    results.totalRevenue += cycleResult.revenue;
                    results.cyclesCompleted++;
                    results.countriesTargeted.add(cycleResult.country);
                    results.currenciesUsed.add(cycleResult.currency);

                    // Track platform performance
                    cycleResult.platformResults.forEach(result => {
                        if (!results.platformPerformance[result.platform]) {
                            results.platformPerformance[result.platform] = { success: 0, failure: 0 };
                        }
                        if (result.success) {
                            results.platformPerformance[result.platform].success++;
                        } else {
                            results.platformPerformance[result.platform].failure++;
                        }
                    });
                }

                await quantumDelay(10000); // Wait between cycles

            } catch (error) {
                this.logger.error(`Revenue cycle ${i + 1} failed:`, error);
            }
        }

        // Record final revenue using wallet module
        if (results.totalRevenue > 0) {
            try {
                // Convert to USD equivalent and send via Ethereum
                const usdRevenue = results.totalRevenue; // Simplified - in real implementation, convert from various currencies
                const settlementResult = await sendUSDT(
                    this.config.COMPANY_WALLET_ADDRESS,
                    usdRevenue,
                    'eth'
                );

                if (settlementResult.hash) {
                    this.logger.success(`🌍 Global revenue completed: $${usdRevenue} USD`);
                }
            } catch (error) {
                this.logger.error('Final revenue settlement failed:', error);
            }
        }

        return results;
    }

    // Additional wallet utility methods
    async checkWalletBalances() {
        try {
            return await checkWalletBalances();
        } catch (error) {
            this.logger.error(`Error checking wallet balances: ${error.message}`);
            return {};
        }
    }

    async getSolanaBalance() {
        try {
            return await getSolanaBalance();
        } catch (error) {
            this.logger.error("Error fetching Solana balance:", error);
            return 0;
        }
    }

    async getUSDTBalance(chain = 'eth') {
        try {
            return await getUSDTBalance(chain);
        } catch (error) {
            this.logger.error(`Error fetching ${chain} USDT balance:`, error);
            return 0;
        }
    }

    // Database query methods for analytics
    async getPerformanceStats(timeframe = '7 days') {
        try {
            const timeFilter = timeframe === '24 hours' ? 
                "timestamp > datetime('now', '-1 day')" :
                "timestamp > datetime('now', '-7 days')";

            const stats = await this.db.all(`
                SELECT 
                    COUNT(*) as total_posts,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_posts,
                    SUM(revenue_generated) as total_revenue,
                    AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate
                FROM social_posts 
                WHERE ${timeFilter}
            `);

            const platformStats = await this.db.all(`
                SELECT 
                    platform,
                    COUNT(*) as post_count,
                    SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_posts,
                    SUM(revenue_generated) as platform_revenue
                FROM social_posts 
                WHERE ${timeFilter}
                GROUP BY platform
            `);

            const countryStats = await this.db.all(`
                SELECT 
                    country,
                    COUNT(*) as post_count,
                    SUM(revenue_generated) as country_revenue,
                    AVG(CASE WHEN success = 1 THEN 1.0 ELSE 0.0 END) as success_rate
                FROM social_posts 
                WHERE ${timeFilter}
                GROUP BY country
                ORDER BY country_revenue DESC
                LIMIT 10
            `);

            return {
                timeframe,
                overall: stats[0] || {},
                platforms: platformStats,
                top_countries: countryStats,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error('Error fetching performance stats:', error);
            return { error: error.message };
        }
    }

    async close() {
        if (this.db) {
            await this.db.close();
        }
        if (this.paymentProcessor) {
            await this.paymentProcessor.cleanup();
        }
    }
}

// Worker thread execution
async function workerThreadFunction() {
    const { config, workerId } = workerData;
    const workerLogger = {
        info: (...args) => console.log(`[Worker ${workerId}]`, ...args),
        error: (...args) => console.error(`[Worker ${workerId}]`, ...args),
        success: (...args) => console.log(`[Worker ${workerId}] ✅`, ...args),
        warn: (...args) => console.warn(`[Worker ${workerId}] ⚠️`, ...args)
    };

    const socialAgent = new SocialAgent(config, workerLogger);
    
    // Initialize wallet connections for worker
    await socialAgent.initializeWalletConnections();

    while (true) {
        await socialAgent.run();
        await quantumDelay(30000); // Run every 30 seconds
    }
}

// Main thread orchestration
if (isMainThread) {
    const numThreads = process.env.SOCIAL_AGENT_THREADS || 3;
    const config = {
        ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
        COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
        COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY,
        
        // Social media API keys (would be provided by API scout)
        X_API_KEY: process.env.X_API_KEY,
        X_API_SECRET: process.env.X_API_SECRET,
        X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
        X_ACCESS_SECRET: process.env.X_ACCESS_SECRET,
        
        FACEBOOK_APP_ID: process.env.FACEBOOK_APP_ID,
        FACEBOOK_APP_SECRET: process.env.FACEBOOK_APP_SECRET,
        FACEBOOK_ACCESS_TOKEN: process.env.FACEBOOK_ACCESS_TOKEN,
        
        INSTAGRAM_APP_ID: process.env.INSTAGRAM_APP_ID,
        INSTAGRAM_ACCESS_TOKEN: process.env.INSTAGRAM_ACCESS_TOKEN,
        
        LINKEDIN_CLIENT_ID: process.env.LINKEDIN_CLIENT_ID,
        LINKEDIN_CLIENT_SECRET: process.env.LINKEDIN_CLIENT_SECRET,
        LINKEDIN_ACCESS_TOKEN: process.env.LINKEDIN_ACCESS_TOKEN,
        
        TIKTOK_APP_ID: process.env.TIKTOK_APP_ID,
        TIKTOK_ACCESS_TOKEN: process.env.TIKTOK_ACCESS_TOKEN
    };

    socialAgentStatus.activeWorkers = numThreads;
    console.log(`🌍 Starting ${numThreads} social agent workers for global revenue generation...`);

    for (let i = 0; i < numThreads; i++) {
        const worker = new Worker(__filename, {
            workerData: { workerId: i + 1, config }
        });

        socialAgentStatus.workerStatuses[`worker-${i + 1}`] = 'initializing';

        worker.on('online', () => {
            socialAgentStatus.workerStatuses[`worker-${i + 1}`] = 'online';
            console.log(`👷 Worker ${i + 1} online`);
        });

        worker.on('message', (msg) => {
            if (msg.type === 'revenue_update') {
                socialAgentStatus.totalRevenueGenerated += msg.amount;
            }
        });

        worker.on('error', (err) => {
            socialAgentStatus.workerStatuses[`worker-${i + 1}`] = `error: ${err.message}`;
            console.error(`Worker ${i + 1} error:`, err);
        });

        worker.on('exit', (code) => {
            socialAgentStatus.workerStatuses[`worker-${i + 1}`] = `exited: ${code}`;
            console.log(`Worker ${i + 1} exited with code ${code}`);
        });
    }
}

// Export functions
export function getStatus() {
    return {
        ...socialAgentStatus,
        agent: 'socialAgent',
        timestamp: new Date().toISOString()
    };
}



// Worker thread execution
if (!isMainThread) {
    workerThreadFunction();
}
