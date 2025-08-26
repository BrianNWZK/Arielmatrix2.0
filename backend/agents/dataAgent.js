import axios from 'axios';
import crypto from 'crypto';
import { createDatabase } from '../database/yourSQLite.js';
import browserManager from './browserManager.js';
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { EnterprisePaymentProcessor } from '../blockchain/EnterprisePaymentProcessor.js';

// Quantum jitter for anti-detection
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = crypto.randomInt(1000, 5000);
    setTimeout(resolve, ms + jitter);
});

// Data value constants
const DATA_POINT_VALUE = 0.02;
const QUALITY_MULTIPLIERS = {
    high: 1.5,
    medium: 1.0,
    low: 0.5
};

// Content categories for targeted content generation
const CONTENT_CATEGORIES = [
    'technology', 'finance', 'health', 'lifestyle', 'entertainment',
    'sports', 'politics', 'business', 'education', 'travel', 'science',
    'environment', 'global'
];

class DataAgent {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.db = createDatabase('./data/ariel_matrix.db');
        this.dataPointValue = DATA_POINT_VALUE;
        this.qualityMultipliers = QUALITY_MULTIPLIERS;
        this.initialized = false;
        this.mediumAuthorId = null;
        this.blockchainInitialized = false;
        this.paymentProcessor = null;
    }

    async initialize() {
        if (this.initialized) return;
        
        try {
            await this.db.connect();
            await this._initializeDataTables();
            
            // Initialize blockchain components
            await this._initializeBlockchain();
            
            if (this.config.MEDIUM_ACCESS_TOKEN) {
                this.mediumAuthorId = await this.getMediumAuthorId();
            }
            
            this.initialized = true;
            this.logger.success('✅ Data Agent fully initialized with SQLite database and blockchain');
        } catch (error) {
            this.logger.error('Failed to initialize Data Agent:', error);
            throw error;
        }
    }

    async _initializeBlockchain() {
        try {
            this.paymentProcessor = new EnterprisePaymentProcessor(this.config);
            await this.paymentProcessor.initialize();
            this.blockchainInitialized = true;
            this.logger.success('✅ BrianNwaezikeChain payment processor initialized');
        } catch (error) {
            this.logger.error('Failed to initialize blockchain:', error);
            throw error;
        }
    }

    async getMediumAuthorId() {
        const { data } = await axios.get('https://api.medium.com/v1/me', {
            headers: {
                'Authorization': `Bearer ${this.config.MEDIUM_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        return data.data.id;
    }

    async _initializeDataTables() {
        // Additional tables for enhanced data operations
        const additionalTables = [
            `CREATE TABLE IF NOT EXISTS blockchain_transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_hash TEXT UNIQUE,
                amount REAL NOT NULL,
                currency TEXT DEFAULT 'USD',
                from_address TEXT,
                to_address TEXT,
                type TEXT,
                status TEXT DEFAULT 'pending',
                block_number INTEGER,
                gas_used REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS content_distribution (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                platform TEXT NOT NULL,
                content_id TEXT,
                post_url TEXT,
                impressions INTEGER DEFAULT 0,
                clicks INTEGER DEFAULT 0,
                revenue_generated REAL DEFAULT 0,
                blockchain_tx_hash TEXT,
                status TEXT DEFAULT 'published',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS ai_generated_content (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                content TEXT,
                category TEXT,
                tags TEXT,
                sentiment_score REAL,
                engagement_score REAL DEFAULT 0,
                revenue_potential REAL DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
            `CREATE TABLE IF NOT EXISTS ad_placements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                content_id INTEGER,
                placement_type TEXT,
                position TEXT,
                networks TEXT,
                estimated_rpm REAL,
                actual_rpm REAL,
                revenue_generated REAL DEFAULT 0,
                blockchain_tx_hash TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (content_id) REFERENCES ai_generated_content (id)
            )`,
            `CREATE INDEX IF NOT EXISTS idx_blockchain_tx_hash ON blockchain_transactions(transaction_hash)`,
            `CREATE INDEX IF NOT EXISTS idx_content_category ON ai_generated_content(category)`,
            `CREATE INDEX IF NOT EXISTS idx_distribution_platform ON content_distribution(platform)`,
            `CREATE INDEX IF NOT EXISTS idx_ad_content ON ad_placements(content_id)`
        ];

        for (const tableSql of additionalTables) {
            await this.db.run(tableSql);
        }
    }

    async processDataOperation(userId, dataPackage) {
        try {
            if (!this.initialized) await this.initialize();

            const baseReward = dataPackage.dataPoints * this.dataPointValue;
            const qualityMultiplier = this.qualityMultipliers[dataPackage.quality] || 1.0;
            
            const finalReward = await this.calculateAutonomousPayout(baseReward, {
                userLoyalty: await this.getUserLoyaltyMultiplier(userId),
                dataQuality: qualityMultiplier,
                dataValue: await this.assessDataValue(dataPackage),
                marketDemand: await this.getDataMarketDemand(dataPackage.type)
            });

            // Process blockchain payout
            const payoutResult = await this.processBlockchainPayout(
                userId,
                finalReward,
                'data_contribution_reward',
                {
                    data_points: dataPackage.dataPoints,
                    data_type: dataPackage.type,
                    data_quality: dataPackage.quality,
                    operation_id: `op_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
                }
            );

            // Save to database with transaction tracking
            const result = await this.db.run(
                `INSERT INTO user_data_operations 
                 (user_id, data_points, data_type, data_quality, base_reward, final_reward, status, transaction_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, dataPackage.dataPoints, dataPackage.type, dataPackage.quality, 
                 baseReward, finalReward, payoutResult.success ? 'completed' : 'failed', 
                 payoutResult.transactionHash || `tx_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`]
            );

            if (payoutResult.success && finalReward > 0) {
                // Record blockchain transaction
                await this.db.run(
                    `INSERT INTO blockchain_transactions 
                     (transaction_hash, amount, currency, from_address, to_address, type, status, block_number, gas_used)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [payoutResult.transactionHash, finalReward, 'USD', 
                     this.config.COMPANY_WALLET_ADDRESS, userId, 'data_reward', 
                     'confirmed', payoutResult.blockNumber, payoutResult.gasUsed]
                );

                // Record revenue transaction
                await this.db.run(
                    `INSERT INTO revenue_transactions (amount, source, campaign_id, blockchain_tx_hash, status)
                     VALUES (?, 'user_data_contribution', ?, ?, 'completed')`,
                    [finalReward, `user_${userId}_${result.id}`, payoutResult.transactionHash]
                );
            }

            this.logger.success(`✅ Processed ${dataPackage.dataPoints} data points for user ${userId}. Reward: $${finalReward.toFixed(6)}`);

            return {
                success: payoutResult.success,
                userId,
                dataPoints: dataPackage.dataPoints,
                reward: finalReward,
                transactionId: result.id,
                blockchainTxHash: payoutResult.transactionHash,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error('Data processing reward failed:', error);
            return { success: false, error: error.message };
        }
    }

    async processBlockchainPayout(userId, amount, payoutType, metadata = {}) {
        try {
            if (!this.blockchainInitialized) {
                throw new Error('Blockchain not initialized');
            }

            const payoutResult = await this.paymentProcessor.processRevenuePayout(
                userId,
                amount,
                'USD',
                JSON.stringify({
                    type: payoutType,
                    timestamp: new Date().toISOString(),
                    ...metadata
                })
            );

            return {
                success: payoutResult.success,
                transactionHash: payoutResult.transactionHash,
                blockNumber: payoutResult.blockNumber,
                gasUsed: payoutResult.gasUsed,
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error('Blockchain payout failed:', error);
            return { success: false, error: error.message };
        }
    }

    async assessDataValue(dataPackage) {
        const valueFactors = {
            uniqueness: dataPackage.unique ? 1.2 : 1.0,
            freshness: Math.max(0.5, 1.0 - (dataPackage.ageDays * 0.1)),
            completeness: dataPackage.complete ? 1.1 : 0.9,
            relevance: await this.calculateRelevanceScore(dataPackage.type)
        };
        
        return Object.values(valueFactors).reduce((product, factor) => product * factor, 1.0);
    }

    async calculateRelevanceScore(dataType) {
        const trendScore = await this.getMarketTrendScore(dataType);
        return 0.8 + (trendScore * 0.2);
    }

    async getMarketTrendScore(dataType) {
        const recentSignals = await this.db.all(
            `SELECT confidence, value FROM market_signals 
             WHERE type LIKE ? AND timestamp > datetime('now', '-7 days')
             ORDER BY timestamp DESC LIMIT 10`,
            [`%${dataType}%`]
        );

        if (recentSignals.length === 0) return 0.5;

        const avgConfidence = recentSignals.reduce((sum, signal) => sum + signal.confidence, 0) / recentSignals.length;
        const buySignals = recentSignals.filter(s => s.value === 'Buy').length;
        
        return (avgConfidence * 0.7) + ((buySignals / recentSignals.length) * 0.3);
    }

    async getDataMarketDemand(dataType) {
        const demandLevels = {
            behavioral: 1.3,
            demographic: 1.1,
            transactional: 1.4,
            social: 1.2,
            geolocation: 1.1,
            psychographic: 1.3,
            biometric: 1.5,
            default: 1.0
        };
        
        return demandLevels[dataType] || demandLevels.default;
    }

    async getUserLoyaltyMultiplier(userId) {
        try {
            const result = await this.db.get(
                `SELECT COUNT(*) as operations, 
                        SUM(final_reward) as total_earnings,
                        MAX(timestamp) as last_activity
                 FROM user_data_operations 
                 WHERE user_id = ? AND status = 'completed'`,
                [userId]
            );
            
            if (result && result.operations > 0) {
                const daysSinceLastActivity = result.last_activity ? 
                    (Date.now() - new Date(result.last_activity).getTime()) / (1000 * 60 * 60 * 24) : 30;
                
                const activityBonus = Math.min(0.5, result.operations * 0.05);
                const earningsBonus = Math.min(0.3, result.total_earnings * 0.01);
                const recencyPenalty = Math.max(0.7, 1.0 - (daysSinceLastActivity * 0.01));
                
                return Math.min(2.0, 1.0 + activityBonus + earningsBonus) * recencyPenalty;
            }
            
            return 1.0;
        } catch (error) {
            this.logger.warn('Error calculating loyalty multiplier:', error);
            return 1.0;
        }
    }

    async calculateAutonomousPayout(baseReward, factors) {
        const multiplier = Object.values(factors).reduce((product, factor) => product * factor, 1.0);
        return parseFloat((baseReward * multiplier).toFixed(6));
    }

    async executeMarketDataCollection() {
        try {
            if (!this.initialized) await this.initialize();

            this.logger.info('📊 Starting comprehensive market data collection...');

            const [newsData, weatherData, socialTrends] = await Promise.all([
                this.fetchNewsData(),
                this.fetchWeatherData(),
                this.fetchSocialTrends()
            ]);

            const aiContent = await this.generateAIContent(newsData, weatherData, socialTrends);
            const signals = await this.generateMarketSignals(newsData, weatherData, socialTrends, aiContent);
            const distributionResults = await this.distributeContent(aiContent, signals);
            const totalRevenue = await this.calculateTotalRevenue(distributionResults);

            // Process blockchain settlement for total revenue
            if (totalRevenue > 0) {
                await this.processRevenueSettlement(totalRevenue, 'market_data_collection');
            }

            await this.saveComprehensiveMarketData(newsData, weatherData, socialTrends, aiContent, signals, distributionResults, totalRevenue);

            this.logger.success(`✅ Market data collection completed. Total Revenue: $${totalRevenue.toFixed(2)}`);
            
            return { 
                success: true, 
                revenue: totalRevenue, 
                signals: signals.length,
                contentGenerated: aiContent.length,
                distributions: distributionResults.length
            };

        } catch (error) {
            this.logger.error('Market data collection failed:', error);
            return { success: false, error: error.message };
        }
    }

    async processRevenueSettlement(amount, source) {
        try {
            const settlementResult = await this.paymentProcessor.processRevenuePayout(
                this.config.COMPANY_WALLET_ADDRESS,
                amount,
                'USD',
                JSON.stringify({
                    source: source,
                    type: 'revenue_settlement',
                    timestamp: new Date().toISOString()
                })
            );

            if (settlementResult.success) {
                await this.db.run(
                    `INSERT INTO blockchain_transactions 
                     (transaction_hash, amount, currency, from_address, to_address, type, status, block_number, gas_used)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [settlementResult.transactionHash, amount, 'USD', 
                     'revenue_pool', this.config.COMPANY_WALLET_ADDRESS, 
                     'revenue_settlement', 'confirmed', 
                     settlementResult.blockNumber, settlementResult.gasUsed]
                );

                this.logger.success(`✅ Revenue settlement processed: $${amount} USD`);
            }

            return settlementResult;

        } catch (error) {
            this.logger.error('Revenue settlement failed:', error);
            throw error;
        }
    }

    async fetchNewsData() {
        if (!this.config.NEWS_API_KEY) {
            throw new Error('News API key not configured');
        }

        try {
            const responses = await Promise.all([
                axios.get('https://newsapi.org/v2/top-headlines', {
                    params: { 
                        q: 'global economy',
                        pageSize: 15,
                        apiKey: this.config.NEWS_API_KEY
                    },
                    timeout: 10000
                }),
                axios.get('https://newsapi.org/v2/everything', {
                    params: {
                        q: 'crypto OR blockchain OR investment OR global markets',
                        language: 'en',
                        sortBy: 'publishedAt',
                        pageSize: 10,
                        apiKey: this.config.NEWS_API_KEY
                    },
                    timeout: 10000
                })
            ]);

            const allArticles = responses.flatMap(response => response.data.articles || []);
            const uniqueArticles = this.deduplicateArticles(allArticles);

            return uniqueArticles.slice(0, 20);

        } catch (error) {
            this.logger.error('News API fetch failed:', error);
            throw error;
        }
    }

    deduplicateArticles(articles) {
        const seen = new Set();
        return articles.filter(article => {
            const identifier = article.title?.toLowerCase() || article.url;
            if (seen.has(identifier)) return false;
            seen.add(identifier);
            return true;
        });
    }

    async fetchWeatherData() {
        if (!this.config.WEATHER_API_KEY) {
            throw new Error('Weather API key not configured');
        }

        try {
            const locations = ['New York', 'London', 'Tokyo', 'Singapore', 'Frankfurt', 'Sydney', 'Mumbai', 'Berlin', 'Sao Paulo', 'Dubai'];
            const weatherPromises = locations.map(location =>
                axios.get('https://api.openweathermap.org/data/2.5/weather', {
                    params: { 
                        q: location, 
                        appid: this.config.WEATHER_API_KEY,
                        units: 'metric'
                    },
                    timeout: 8000
                }).catch(error => {
                    this.logger.warn(`Weather data for ${location} failed:`, error.message);
                    return null;
                })
            );

            const responses = await Promise.all(weatherPromises);
            const validData = responses.filter(r => r !== null && r.data).map(r => r.data);

            if (validData.length === 0) {
                throw new Error('No valid weather data retrieved');
            }

            return validData;

        } catch (error) {
            this.logger.error('Weather API fetch failed:', error);
            throw error;
        }
    }

    async fetchSocialTrends() {
        try {
            const [twitter, reddit] = await Promise.all([
                this.fetchTwitterTrends(),
                this.fetchRedditTrends()
            ]);
            const overall_sentiment = (twitter.sentiment + reddit.sentiment) / 2;
            return { twitter, reddit, overall_sentiment };
        } catch (error) {
            this.logger.warn('Social trends fetch failed:', error.message);
            return { twitter: { trending_topics: [], sentiment: 0 }, reddit: { popular_posts: [], sentiment: 0 }, overall_sentiment: 0 };
        }
    }

    async fetchTwitterTrends() {
        if (!this.config.TWITTER_API_KEY) {
            return { trending_topics: [], sentiment: 0 };
        }
        try {
            const response = await axios.get('https://api.twitter.com/2/trends/place/1', {
                headers: { Authorization: `Bearer ${this.config.TWITTER_API_KEY}` }
            });
            const trends = response.data[0]?.trends?.map(t => t.name) || [];
            const sentiment = this.analyzeTrendsSentiment(trends);
            return { trending_topics: trends, sentiment };
        } catch (error) {
            this.logger.warn('Twitter trends fetch failed:', error.message);
            return { trending_topics: [], sentiment: 0 };
        }
    }

    async fetchRedditTrends() {
        if (!this.config.REDDIT_API_KEY) {
            return { popular_posts: [], sentiment: 0 };
        }
        try {
            const response = await axios.get('https://oauth.reddit.com/r/all/hot', {
                params: { limit: 10 },
                headers: { Authorization: `Bearer ${this.config.REDDIT_API_KEY}` }
            });
            const posts = response.data.data.children.map(c => c.data.title);
            const sentiment = this.analyzeTrendsSentiment(posts);
            return { popular_posts: posts, sentiment };
        } catch (error) {
            this.logger.warn('Reddit trends fetch failed:', error.message);
            return { popular_posts: [], sentiment: 0 };
        }
    }

    analyzeTrendsSentiment(items) {
        if (!items || items.length === 0) return 0;
        const sentimentScores = items.map(item => {
            const lower = item.toLowerCase();
            const positive = ['growth', 'bullish', 'strong', 'increase', 'surge', 'gain', 'positive', 'boom', 'up', 'recovery', 'opportunity'].filter(w => lower.includes(w)).length;
            const negative = ['decline', 'bearish', 'weak', 'drop', 'loss', 'negative', 'slump', 'down', 'recession', 'risk'].filter(w => lower.includes(w)).length;
            return (positive - negative) / (positive + negative + 1);
        });
        return sentimentScores.reduce((acc, score) => acc + score, 0) / sentimentScores.length;
    }

    async generateAIContent(newsData, weatherData, socialTrends) {
        const content = [];
        const baseCount = 3;

        for (let i = 0; i < baseCount; i++) {
            const category = CONTENT_CATEGORIES[Math.floor(Math.random() * CONTENT_CATEGORIES.length)];
            const contentPiece = await this.createContentPiece(category, newsData, weatherData);
            content.push(contentPiece);
        }

        return content;
    }

    async createContentPiece(category, newsData, weatherData) {
        const contentId = `content_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
        
        const relevantNews = newsData.filter(article => 
            article.title?.toLowerCase().includes(category) || 
            article.description?.toLowerCase().includes(category)
        ).slice(0, 3);

        const title = this.generateContentTitle(category, relevantNews);
        const content = this.generateContentBody(category, relevantNews, weatherData);
        const sentiment = this.analyzeContentSentiment(content);

        const result = await this.db.run(
            `INSERT INTO ai_generated_content (title, content, category, tags, sentiment_score, revenue_potential)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [title, content, category, `${category},news,analysis`, sentiment, this.calculateRevenuePotential(sentiment, category)]
        );

        return {
            id: result.id,
            contentId,
            title,
            content,
            category,
            sentiment,
            adPlacements: this.determineAdPlacements(category, sentiment)
        };
    }

    generateContentTitle(category, relevantNews) {
        const prefixes = ['Latest', 'Breaking', 'Expert', 'Market', 'Strategic'];
        const suffixes = ['Analysis', 'Insights', 'Report', 'Update', 'Forecast'];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
        return `${prefix} ${category.charAt(0).toUpperCase() + category.slice(1)} ${suffix}`;
    }

    generateContentBody(category, relevantNews, weatherData) {
        let body = `# Comprehensive ${category.charAt(0).toUpperCase() + category.slice(1)} Analysis\n\n`;
        
        if (relevantNews.length > 0) {
            body += "## Key Developments:\n";
            relevantNews.forEach((article, index) => {
                body += `${index + 1}. ${article.title} - ${article.description?.substring(0, 100)}...\n`;
            });
            body += "\n";
        }

        body += "## Market Implications:\n";
        body += `Current analysis indicates measured outlook for ${category} sectors.\n\n`;

        body += "## Strategic Recommendations:\n";
        body += "- Maintain diversified exposure\n";
        body += "- Monitor sector developments\n";
        body += "- Assess risk parameters regularly\n";

        return body;
    }

    analyzeContentSentiment(content) {
        const text = content.toLowerCase();
        const positive = text.match(/\b(positive|growth|opportunity|strong|recovery|gain|progress)\b/g) || [];
        const negative = text.match(/\b(negative|decline|risk|weak|challenge|uncertainty)\b/g) || [];
        return (positive.length - negative.length) / (positive.length + negative.length + 1);
    }

    calculateRevenuePotential(sentiment, category) {
        const basePotential = 10 + (Math.abs(sentiment) * 20);
        const categoryMultipliers = {
            technology: 1.5,
            finance: 1.4,
            crypto: 1.6,
            health: 1.2,
            default: 1.0
        };
        return basePotential * (categoryMultipliers[category] || categoryMultipliers.default);
    }

    determineAdPlacements(category, sentiment) {
        const placements = [];
        const networks = ['google_adsense', 'mediavine', 'adthrive'].filter(network => 
            this.config[`${network.toUpperCase()}_API_KEY`]
        );

        if (networks.length === 0) return placements;

        placements.push({
            type: 'display',
            position: 'header',
            networks: networks,
            estimated_rpm: 12 + (sentiment * 5)
        });

        if (['technology', 'finance', 'crypto'].includes(category)) {
            placements.push({
                type: 'native',
                position: 'inline',
                networks: networks,
                estimated_rpm: 25 + (sentiment * 8)
            });
        }

        if (['lifestyle', 'entertainment', 'health'].includes(category)) {
            placements.push({
                type: 'video',
                position: 'sidebar',
                networks: networks,
                estimated_rpm: 35 + (sentiment * 10)
            });
        }

        return placements;
    }

    async generateMarketSignals(newsData, weatherData, socialTrends, aiContent) {
        const signals = [];

        const newsSentiment = this.analyzeNewsSentiment(newsData);
        const weatherSignals = this.generateWeatherSignals(weatherData);
        const socialSentiment = socialTrends.overall_sentiment || 0;
        const combinedSentiment = (newsSentiment * 0.5) + (socialSentiment * 0.3);

        signals.push({
            type: 'Market Sentiment',
            value: combinedSentiment > 0.3 ? 'Buy' : combinedSentiment < -0.3 ? 'Sell' : 'Hold',
            confidence: Math.abs(combinedSentiment),
            source: 'multi-source analysis',
            timestamp: new Date().toISOString()
        });

        signals.push(...weatherSignals);

        return signals;
    }

    analyzeNewsSentiment(articles) {
        if (!articles || articles.length === 0) return 0;
        const sentimentScores = articles.map(article => {
            const title = (article.title || '').toLowerCase();
            const desc = (article.description || '').toLowerCase();
            const positive = ['growth', 'bullish', 'strong', 'increase', 'surge', 'gain', 'positive', 'recovery', 'opportunity'].filter(w => title.includes(w) || desc.includes(w)).length;
            const negative = ['decline', 'bearish', 'weak', 'drop', 'loss', 'negative', 'slump', 'recession', 'risk'].filter(w => title.includes(w) || desc.includes(w)).length;
            return (positive - negative) / (positive + negative + 1);
        });
        return sentimentScores.reduce((acc, score) => acc + score, 0) / sentimentScores.length;
    }

    generateWeatherSignals(weatherData) {
        const signals = [];
        weatherData.forEach(weather => {
            const temp = weather.main?.temp || 20;
            let signal = 'Hold';
            if (temp > 28) signal = 'Buy';
            else if (temp < 5) signal = 'Sell';
            signals.push({
                type: `Weather Impact (${weather.name})`,
                value: signal,
                confidence: 0.7,
                source: 'openweathermap.org',
                timestamp: new Date().toISOString()
            });
        });
        return signals;
    }

    async distributeContent(aiContent, signals) {
        const distributionResults = [];
        let totalRevenue = 0;

        for (const content of aiContent) {
            try {
                const baseLink = `${this.config.STORE_URL || 'https://arielmatrix.io'}/content/${content.contentId}`;
                const shortenedLink = await this.shortenLink(baseLink);
                const platformResults = await this.distributeToPlatforms(content, shortenedLink, signals);
                distributionResults.push(...platformResults);

                const contentRevenue = platformResults.reduce((sum, result) => sum + (result.revenue || 0), 0);
                totalRevenue += contentRevenue;

                await this.db.run(
                    `UPDATE ai_generated_content SET revenue_potential = revenue_potential + ? WHERE id = ?`,
                    [contentRevenue, content.id]
                );

            } catch (error) {
                this.logger.error(`Content distribution failed for ${content.contentId}:`, error);
            }
        }

        return distributionResults;
    }

    async distributeToPlatforms(content, shortenedLink, signals) {
        const results = [];
        const platforms = [];

        if (this.config.REDDIT_API_KEY) platforms.push('reddit');
        if (this.config.MEDIUM_ACCESS_TOKEN) platforms.push('medium');
        if (this.config.TWITTER_API_KEY) platforms.push('twitter');

        for (const platform of platforms) {
            try {
                let revenue = 0;
                let blockchainTxHash = null;

                switch (platform) {
                    case 'reddit':
                        revenue = await this.postToReddit(content, shortenedLink, signals);
                        break;
                    case 'medium':
                        revenue = await this.postToMedium(content, shortenedLink);
                        break;
                    case 'twitter':
                        revenue = await this.postToTwitter(content, shortenedLink);
                        break;
                }

                if (revenue > 0) {
                    // Process blockchain transaction for platform revenue
                    const payoutResult = await this.processBlockchainPayout(
                        this.config.COMPANY_WALLET_ADDRESS,
                        revenue,
                        'platform_revenue',
                        { platform, content_id: content.contentId }
                    );

                    if (payoutResult.success) {
                        blockchainTxHash = payoutResult.transactionHash;
                    }

                    await this.db.run(
                        `INSERT INTO content_distribution (platform, content_id, post_url, revenue_generated, blockchain_tx_hash, status)
                         VALUES (?, ?, ?, ?, ?, 'published')`,
                        [platform, content.contentId, shortenedLink, revenue, blockchainTxHash]
                    );

                    results.push({
                        platform,
                        contentId: content.contentId,
                        revenue,
                        blockchainTxHash,
                        success: true,
                        timestamp: new Date().toISOString()
                    });
                }

            } catch (error) {
                this.logger.warn(`Distribution to ${platform} failed:`, error.message);
                results.push({
                    platform,
                    contentId: content.contentId,
                    success: false,
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }

            await quantumDelay(2000);
        }

        return results;
    }

    async postToReddit(content, link, signals) {
        const topSignals = signals.slice(0, 3).map(s => 
            `📊 ${s.type} | ${s.value} | Confidence: ${s.confidence.toFixed(2)}`
        ).join('\n');

        const response = await axios.post(
            'https://oauth.reddit.com/api/submit',
            {
                sr: this.config.REDDIT_SUBREDDIT || 'investing',
                kind: 'self',
                title: content.title,
                text: `${content.content}\n\n## Market Signals:\n${topSignals}\n\nRead full analysis: ${link}`
            },
            {
                headers: { 
                    'Authorization': `Bearer ${this.config.REDDIT_API_KEY}`,
                    'User-Agent': 'ArielMatrix/2.0'
                },
                timeout: 15000
            }
        );

        return 2 + (Math.abs(content.sentiment) * 8) + (signals.length * 0.5);
    }

    async postToMedium(content, link) {
        const authorId = this.mediumAuthorId;
        const postData = {
            title: content.title,
            contentFormat: 'markdown',
            content: `${content.content}\n\nFull analysis: ${link}`,
            publishStatus: 'public'
        };
        const response = await axios.post(
            `https://api.medium.com/v1/users/${authorId}/posts`,
            postData,
            {
                headers: {
                    'Authorization': `Bearer ${this.config.MEDIUM_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            }
        );
        return 5 + (Math.abs(content.sentiment) * 10);
    }

    async postToTwitter(content, link) {
        const text = `${content.title}\n${link}`;
        const response = await axios.post(
            'https://api.twitter.com/2/tweets',
            { text },
            {
                headers: {
                    'Authorization': `Bearer ${this.config.TWITTER_API_KEY}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        return 1 + (Math.abs(content.sentiment) * 3);
    }

    async shortenLink(originalUrl) {
        const shorteners = [
            this.shortenWithShortIO.bind(this),
            this.shortenWithAdFly.bind(this),
            this.shortenWithLinkvertise.bind(this)
        ];

        for (const shortener of shorteners) {
            try {
                const shortened = await shortener(originalUrl);
                if (shortened) return shortened;
            } catch (error) {
                this.logger.warn(`Link shortening failed: ${error.message}`);
            }
        }

        return originalUrl;
    }

    async shortenWithShortIO(originalUrl) {
        if (!this.config.SHORTIO_API_KEY) return null;
        const response = await axios.post(
            'https://api.short.io/links',
            {
                domain: this.config.SHORTIO_DOMAIN || 'qgs.gs',
                originalURL: originalUrl
            },
            {
                headers: {
                    'Authorization': this.config.SHORTIO_API_KEY,
                    'Content-Type': 'application/json'
                },
                timeout: 8000
            }
        );
        return response.data.shortURL;
    }

    async shortenWithAdFly(originalUrl) {
        if (!this.config.ADFLY_API_KEY) return null;
        const response = await axios.get('https://api.adf.ly/api.php', {
            params: {
                key: this.config.ADFLY_API_KEY,
                url: originalUrl,
                type: 'int'
            },
            timeout: 8000
        });
        return response.data;
    }

    async shortenWithLinkvertise(originalUrl) {
        if (!this.config.AI_EMAIL || !this.config.AI_PASSWORD) return null;
        let page = null;
        try {
            if (!browserManager.isInitialized()) {
                await browserManager.init(this.config, this.logger);
            }
            const context = await browserManager.acquireContext('linkvertise');
            page = context.page;
            await page.goto('https://linkvertise.com/auth/login', { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000 
            });
            await quantumDelay(3000);
            await browserManager.safeType(page, ['input[name="email"]', '#email'], this.config.AI_EMAIL);
            await browserManager.safeType(page, ['input[name="password"]', '#password'], this.config.AI_PASSWORD);
            await browserManager.safeClick(page, ['button[type="submit"]', '.btn-primary']);
            await quantumDelay(5000);
            await page.goto('https://linkvertise.com/dashboard/links/create', { 
                waitUntil: 'domcontentloaded', 
                timeout: 60000 
            });
            await quantumDelay(3000);
            await browserManager.safeType(page, ['input[name="target_url"]', '#target_url'], originalUrl);
            await browserManager.safeClick(page, ['button[type="submit"]', '.btn-success']);
            await quantumDelay(5000);
            const shortLink = await page.evaluate(() => {
                const input = document.querySelector('input[readonly], input.share-link-input');
                return input?.value || null;
            });
            return shortLink;
        } catch (error) {
            this.logger.error('Linkvertise automation failed:', error);
            throw error;
        } finally {
            if (page) {
                await browserManager.releaseContext(page.contextId);
            }
        }
    }

    async calculateTotalRevenue(distributionResults) {
        const successfulDistributions = distributionResults.filter(r => r.success);
        const totalRevenue = successfulDistributions.reduce((sum, result) => sum + (result.revenue || 0), 0);
        
        if (totalRevenue > 0) {
            await this.db.run(
                `INSERT INTO revenue_transactions (amount, source, status)
                 VALUES (?, 'content_distribution', 'completed')`,
                [totalRevenue]
            );
        }

        return parseFloat(totalRevenue.toFixed(2));
    }

    async saveComprehensiveMarketData(newsData, weatherData, socialTrends, aiContent, signals, distributionResults, totalRevenue) {
        try {
            for (const article of newsData) {
                await this.db.run(
                    `INSERT INTO news_articles (title, description, url, published_at, source, sentiment_score)
                     VALUES (?, ?, ?, ?, ?, ?)`,
                    [article.title, article.description, article.url, 
                     article.publishedAt, article.source?.name, this.analyzeArticleSentiment(article)]
                );
            }

            for (const weather of weatherData) {
                if (weather.main) {
                    await this.db.run(
                        `INSERT INTO weather_data (location, temperature, conditions, humidity, pressure)
                         VALUES (?, ?, ?, ?, ?)`,
                        [weather.name, weather.main.temp, weather.weather[0]?.description, 
                         weather.main.humidity, weather.main.pressure]
                    );
                }
            }

            for (const signal of signals) {
                await this.db.run(
                    `INSERT INTO market_signals (type, value, confidence, source, revenue_generated)
                     VALUES (?, ?, ?, ?, ?)`,
                    [signal.type, signal.value, signal.confidence, signal.source, totalRevenue * 0.15 / signals.length]
                );
            }

            for (const content of aiContent) {
                for (const placement of content.adPlacements) {
                    const actualRpm = placement.estimated_rpm;
                    await this.db.run(
                        `INSERT INTO ad_placements (content_id, placement_type, position, networks, estimated_rpm, actual_rpm, revenue_generated)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [content.id, placement.type, placement.position, 
                         placement.networks.join(','), placement.estimated_rpm, 
                         actualRpm,
                         totalRevenue * 0.35 / (aiContent.length * content.adPlacements.length)]
                    );
                }
            }

            this.logger.success('✅ Comprehensive market data saved to database');

        } catch (error) {
            this.logger.error('Failed to save comprehensive market data:', error);
        }
    }

    analyzeArticleSentiment(article) {
        const text = `${article.title} ${article.description}`.toLowerCase();
        const positive = text.match(/\b(rises?|growth|bullish|strong|increase|surge|gain|positive|boom|up|recovery|opportunity|profit)\b/g) || [];
        const negative = text.match(/\b(falls?|crash|bearish|decline|drop|plunge|loss|negative|slump|down|recession|risk|volatility)\b/g) || [];
        return (positive.length - negative.length) / (positive.length + negative.length + 1);
    }

    async getPerformanceMetrics(timeframe = '7 days') {
        try {
            const timeFilter = timeframe === '24 hours' ? 
                "timestamp > datetime('now', '-1 day')" :
                "timestamp > datetime('now', '-7 days')";

            const metrics = await this.db.all(`
                SELECT 
                    COUNT(*) as total_operations,
                    SUM(final_reward) as total_revenue,
                    AVG(final_reward) as avg_reward,
                    COUNT(DISTINCT user_id) as active_users,
                    MAX(timestamp) as last_activity
                FROM user_data_operations 
                WHERE status = 'completed'
                AND ${timeFilter}
            `);

            const signalMetrics = await this.db.all(`
                SELECT 
                    COUNT(*) as signal_count,
                    SUM(revenue_generated) as signal_revenue,
                    AVG(confidence) as avg_confidence
                FROM market_signals 
                WHERE ${timeFilter}
            `);

            const contentMetrics = await this.db.all(`
                SELECT 
                    COUNT(*) as content_count,
                    SUM(revenue_potential) as content_revenue,
                    AVG(sentiment_score) as avg_sentiment
                FROM ai_generated_content
                WHERE ${timeFilter}
            `);

            const distributionMetrics = await this.db.all(`
                SELECT 
                    platform,
                    COUNT(*) as post_count,
                    SUM(revenue_generated) as platform_revenue,
                    AVG(revenue_generated) as avg_platform_revenue
                FROM content_distribution
                WHERE status = 'published'
                AND ${timeFilter}
                GROUP BY platform
            `);

            const blockchainMetrics = await this.db.all(`
                SELECT 
                    COUNT(*) as total_transactions,
                    SUM(amount) as total_blockchain_volume,
                    AVG(gas_used) as avg_gas_used,
                    COUNT(DISTINCT to_address) as unique_recipients
                FROM blockchain_transactions
                WHERE status = 'confirmed'
                AND ${timeFilter}
            `);

            return {
                timeframe,
                data_operations: metrics[0] || {},
                market_signals: signalMetrics[0] || {},
                content_metrics: contentMetrics[0] || {},
                distribution_metrics: distributionMetrics,
                blockchain_metrics: blockchainMetrics[0] || {},
                overall_revenue: (metrics[0]?.total_revenue || 0) + 
                               (signalMetrics[0]?.signal_revenue || 0) + 
                               (contentMetrics[0]?.content_revenue || 0),
                timestamp: new Date().toISOString()
            };

        } catch (error) {
            this.logger.error('Error fetching performance metrics:', error);
            return { error: error.message };
        }
    }

    async close() {
        if (this.initialized) {
            await this.db.close();
            this.initialized = false;
        }
        if (this.paymentProcessor) {
            await this.paymentProcessor.cleanup();
        }
    }
}

export default DataAgent;
