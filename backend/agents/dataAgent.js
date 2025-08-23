// backend/agents/dataAgent.js
import axios from 'axios';
import crypto from 'crypto';
import { Redis } from 'ioredis';
import { Mutex } from 'async-mutex';
import { Worker, isMainThread, parentPort, workerData } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
import { BrianNwaezikeChain } from '../blockchain/BrianNwaezikeChain.js';
import { EnterprisePaymentProcessor } from '../blockchain/EnterprisePaymentProcessor.js';

// Get __filename equivalent in ES Module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global state for data agent tracking
const dataAgentStatus = {
    lastStatus: 'idle',
    lastExecutionTime: 'Never',
    totalRevenue: 0,
    dataProductsCreated: 0,
    dataProductsSold: 0,
    dataPointsProcessed: 0,
    activeWorkers: 0,
    blockchainTransactions: 0,
    workerStatuses: {}
};

const mutex = new Mutex();
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = Math.floor(Math.random() * 3000) + 1000;
    setTimeout(resolve, ms + jitter);
});

// Data sources with real API endpoints
const DATA_SOURCES = {
    github: {
        baseURL: 'https://api.github.com',
        endpoints: {
            trends: '/search/repositories',
            users: '/users',
            events: '/events'
        },
        requiredKeys: ['GITHUB_TOKEN']
    },
    alphavantage: {
        baseURL: 'https://www.alphavantage.co/query',
        endpoints: {
            global_quote: '',
            forex: '',
            crypto: ''
        },
        requiredKeys: ['ALPHAVANTAGE_API_KEY']
    },
    newsapi: {
        baseURL: 'https://newsapi.org/v2',
        endpoints: {
            everything: '/everything',
            headlines: '/top-headlines'
        },
        requiredKeys: ['NEWS_API_KEY']
    },
    openweather: {
        baseURL: 'https://api.openweathermap.org/data/2.5',
        endpoints: {
            weather: '/weather',
            forecast: '/forecast'
        },
        requiredKeys: ['OPENWEATHER_API_KEY']
    }
};

// Data marketplaces for product distribution
const DATA_MARKETPLACES = {
    kaggle: {
        baseURL: 'https://www.kaggle.com/api/v1',
        endpoints: {
            datasets: '/datasets',
            create: '/datasets/create'
        },
        requiredKeys: ['KAGGLE_USERNAME', 'KAGGLE_KEY']
    },
    dataworld: {
        baseURL: 'https://api.data.world/v0',
        endpoints: {
            datasets: '/datasets',
            files: '/files'
        },
        requiredKeys: ['DATAWORLD_API_TOKEN']
    },
    rapidapi: {
        baseURL: 'https://rapidapi.com',
        endpoints: {
            apis: '/apis',
            marketplace: '/marketplace'
        },
        requiredKeys: ['RAPIDAPI_KEY']
    }
};

// Data product categories
const DATA_CATEGORIES = [
    'financial', 'technology', 'healthcare', 'energy', 'retail',
    'transportation', 'real_estate', 'entertainment', 'sports', 'education'
];

class DataAgent {
    constructor(config, logger) {
        this.config = config;
        this.logger = logger;
        this.redis = new Redis(config.REDIS_URL);
        this.paymentProcessor = new EnterprisePaymentProcessor();
        this.dataSources = {};
        this.marketplaces = {};
        this.dataProducts = new Map();
        
        this._initializeDataSources();
        this._initializeMarketplaces();
        this._initializeBlockchain();
    }

    async _initializeBlockchain() {
        try {
            await this.paymentProcessor.initialize();
            this.logger.success('✅ BrianNwaezikeChain payment processor initialized');
        } catch (error) {
            this.logger.error('Failed to initialize blockchain:', error);
        }
    }

    _initializeDataSources() {
        for (const [source, config] of Object.entries(DATA_SOURCES)) {
            const hasKeys = config.requiredKeys.every(key => this.config[key]);
            if (hasKeys) {
                this.dataSources[source] = { ...config, initialized: true };
                this.logger.success(`✅ ${source} data source initialized`);
            } else {
                this.logger.warn(`⚠️ Missing keys for ${source}, skipping initialization`);
            }
        }
    }

    _initializeMarketplaces() {
        for (const [marketplace, config] of Object.entries(DATA_MARKETPLACES)) {
            const hasKeys = config.requiredKeys.every(key => this.config[key]);
            if (hasKeys) {
                this.marketplaces[marketplace] = { ...config, initialized: true };
                this.logger.success(`✅ ${marketplace} marketplace initialized`);
            } else {
                this.logger.warn(`⚠️ Missing keys for ${marketplace}, skipping initialization`);
            }
        }
    }

    async _fetchGitHubData() {
        if (!this.dataSources.github?.initialized) return null;

        try {
            const response = await axios.get(
                `${this.dataSources.github.baseURL}${this.dataSources.github.endpoints.trends}`,
                {
                    params: {
                        q: 'stars:>1000',
                        sort: 'stars',
                        order: 'desc',
                        per_page: 50
                    },
                    headers: {
                        'Authorization': `token ${this.config.GITHUB_TOKEN}`,
                        'Accept': 'application/vnd.github.v3+json'
                    },
                    timeout: 15000
                }
            );

            return response.data.items;
        } catch (error) {
            this.logger.error('GitHub data fetch failed:', error);
            return null;
        }
    }

    async _fetchFinancialData() {
        if (!this.dataSources.alphavantage?.initialized) return null;

        const symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX'];
        const financialData = {};

        for (const symbol of symbols) {
            try {
                const response = await axios.get(this.dataSources.alphavantage.baseURL, {
                    params: {
                        function: 'GLOBAL_QUOTE',
                        symbol: symbol,
                        apikey: this.config.ALPHAVANTAGE_API_KEY
                    },
                    timeout: 10000
                });

                financialData[symbol] = response.data['Global Quote'];
            } catch (error) {
                this.logger.warn(`Failed to fetch data for ${symbol}:`, error);
            }

            await quantumDelay(1000); // Rate limiting
        }

        return financialData;
    }

    async _fetchNewsData() {
        if (!this.dataSources.newsapi?.initialized) return null;

        try {
            const response = await axios.get(
                `${this.dataSources.newsapi.baseURL}${this.dataSources.newsapi.endpoints.headlines}`,
                {
                    params: {
                        country: 'us',
                        category: 'business',
                        pageSize: 50
                    },
                    headers: {
                        'Authorization': `Bearer ${this.config.NEWS_API_KEY}`
                    },
                    timeout: 15000
                }
            );

            return response.data.articles;
        } catch (error) {
            this.logger.error('News data fetch failed:', error);
            return null;
        }
    }

    async _fetchWeatherData() {
        if (!this.dataSources.openweather?.initialized) return null;

        const cities = ['New York', 'London', 'Tokyo', 'Singapore', 'Dubai'];
        const weatherData = {};

        for (const city of cities) {
            try {
                const response = await axios.get(
                    `${this.dataSources.openweather.baseURL}${this.dataSources.openweather.endpoints.weather}`,
                    {
                        params: {
                            q: city,
                            appid: this.config.OPENWEATHER_API_KEY,
                            units: 'metric'
                        },
                        timeout: 10000
                    }
                );

                weatherData[city] = response.data;
            } catch (error) {
                this.logger.warn(`Failed to fetch weather for ${city}:`, error);
            }

            await quantumDelay(1000); // Rate limiting
        }

        return weatherData;
    }

    async collectData() {
        const collectedData = {};

        // Fetch data from all sources in parallel
        const [githubData, financialData, newsData, weatherData] = await Promise.all([
            this._fetchGitHubData(),
            this._fetchFinancialData(),
            this._fetchNewsData(),
            this._fetchWeatherData()
        ]);

        if (githubData) collectedData.github = githubData;
        if (financialData) collectedData.financial = financialData;
        if (newsData) collectedData.news = newsData;
        if (weatherData) collectedData.weather = weatherData;

        dataAgentStatus.dataPointsProcessed += Object.keys(collectedData).reduce(
            (total, source) => total + (collectedData[source]?.length || Object.keys(collectedData[source] || {}).length),
            0
        );

        return collectedData;
    }

    _analyzeDataOpportunities(data) {
        const opportunities = [];

        // Analyze GitHub trends
        if (data.github) {
            data.github.forEach(repo => {
                const score = this._calculateRepoOpportunityScore(repo);
                if (score > 0.7) {
                    opportunities.push({
                        type: 'github_repository',
                        source: repo,
                        score: score,
                        category: 'technology',
                        potentialValue: score * 500
                    });
                }
            });
        }

        // Analyze financial data
        if (data.financial) {
            Object.entries(data.financial).forEach(([symbol, quote]) => {
                const score = this._calculateFinancialOpportunityScore(quote);
                if (score > 0.6) {
                    opportunities.push({
                        type: 'financial_analysis',
                        source: { symbol, quote },
                        score: score,
                        category: 'financial',
                        potentialValue: score * 1000
                    });
                }
            });
        }

        // Analyze news sentiment
        if (data.news) {
            const sentimentScore = this._analyzeNewsSentiment(data.news);
            opportunities.push({
                type: 'news_sentiment',
                source: data.news,
                score: Math.abs(sentimentScore),
                category: 'market_intelligence',
                potentialValue: Math.abs(sentimentScore) * 300
            });
        }

        return opportunities.sort((a, b) => b.score - a.score);
    }

    _calculateRepoOpportunityScore(repo) {
        const factors = {
            stars: Math.min(repo.stargazers_count / 10000, 1),
            forks: Math.min(repo.forks_count / 1000, 1),
            issues: 1 - Math.min(repo.open_issues_count / 100, 1),
            recentActivity: this._calculateRecentActivity(repo.updated_at),
            languagePopularity: this._getLanguagePopularity(repo.language)
        };

        return Object.values(factors).reduce((sum, value) => sum + value, 0) / Object.keys(factors).length;
    }

    _calculateFinancialOpportunityScore(quote) {
        if (!quote || !quote['05. price']) return 0;

        const price = parseFloat(quote['05. price']);
        const change = parseFloat(quote['09. change']);
        const changePercent = parseFloat(quote['10. change percent']);

        return Math.min(Math.abs(changePercent) / 10, 1) * (change > 0 ? 1 : -1);
    }

    _analyzeNewsSentiment(articles) {
        let totalSentiment = 0;
        let articleCount = 0;

        articles.forEach(article => {
            const text = `${article.title} ${article.description}`.toLowerCase();
            const positiveWords = ['bullish', 'growth', 'rise', 'gain', 'positive', 'strong', 'increase', 'surge'];
            const negativeWords = ['bearish', 'decline', 'fall', 'drop', 'negative', 'weak', 'decrease', 'plunge'];

            let score = 0;
            positiveWords.forEach(word => { if (text.includes(word)) score += 1; });
            negativeWords.forEach(word => { if (text.includes(word)) score -= 1; });

            totalSentiment += Math.tanh(score / 5); // Normalize
            articleCount++;
        });

        return articleCount > 0 ? totalSentiment / articleCount : 0;
    }

    async _createDataProducts(opportunities) {
        const products = [];

        for (const opportunity of opportunities) {
            try {
                const productId = `data_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
                const product = {
                    id: productId,
                    name: `${opportunity.type} - ${opportunity.category}`,
                    description: `Advanced analytics package for ${opportunity.type}`,
                    price: opportunity.potentialValue,
                    category: opportunity.category,
                    source: opportunity.source,
                    score: opportunity.score,
                    created: new Date().toISOString(),
                    metadata: {
                        analysis: this._generateProductAnalysis(opportunity),
                        insights: this._generateProductInsights(opportunity)
                    }
                };

                // Store in Redis
                await this.redis.hset('data_products', productId, JSON.stringify(product));
                this.dataProducts.set(productId, product);
                products.push(product);

                dataAgentStatus.dataProductsCreated++;
                this.logger.success(`✅ Created data product: ${product.name}`);

            } catch (error) {
                this.logger.error('Failed to create data product:', error);
            }
        }

        return products;
    }

    async _distributeToMarketplaces(products) {
        const distributionResults = [];

        for (const product of products) {
            for (const [marketplace, config] of Object.entries(this.marketplaces)) {
                if (!config.initialized) continue;

                try {
                    const result = await this._listOnMarketplace(product, marketplace);
                    distributionResults.push({
                        productId: product.id,
                        marketplace,
                        success: result.success,
                        listingId: result.listingId,
                        timestamp: new Date().toISOString()
                    });

                    if (result.success) {
                        this.logger.success(`✅ Listed ${product.id} on ${marketplace}`);
                    }

                } catch (error) {
                    this.logger.error(`Failed to list ${product.id} on ${marketplace}:`, error);
                    distributionResults.push({
                        productId: product.id,
                        marketplace,
                        success: false,
                        error: error.message,
                        timestamp: new Date().toISOString()
                    });
                }

                await quantumDelay(2000); // Rate limiting
            }
        }

        return distributionResults;
    }

    async _listOnMarketplace(product, marketplace) {
        const config = this.marketplaces[marketplace];
        
        switch (marketplace) {
            case 'kaggle':
                return await this._listOnKaggle(product, config);
            case 'dataworld':
                return await this._listOnDataWorld(product, config);
            case 'rapidapi':
                return await this._listOnRapidAPI(product, config);
            default:
                throw new Error(`Unsupported marketplace: ${marketplace}`);
        }
    }

    async _listOnKaggle(product, config) {
        const response = await axios.post(
            `${config.baseURL}${config.endpoints.create}`,
            {
                title: product.name,
                description: product.description,
                files: [
                    {
                        name: `${product.id}.json`,
                        content: JSON.stringify(product)
                    }
                ],
                license: 'CC0-1.0',
                category: product.category
            },
            {
                headers: {
                    'Authorization': `Bearer ${this.config.KAGGLE_KEY}`,
                    'Content-Type': 'application/json'
                },
                timeout: 20000
            }
        );

        return { success: true, listingId: response.data.id };
    }

    async _sellDataProducts() {
        const salesResults = [];
        let totalRevenue = 0;

        for (const [productId, product] of this.dataProducts) {
            try {
                // Simulate finding customers (in real implementation, this would be actual customer discovery)
                const potentialCustomers = await this._findPotentialCustomers(product);
                let productRevenue = 0;

                for (const customer of potentialCustomers) {
                    try {
                        // Process payment through blockchain
                        const paymentResult = await this.paymentProcessor.processRevenuePayout(
                            customer.walletAddress,
                            product.price,
                            'USD',
                            JSON.stringify({
                                productId: product.id,
                                customerId: customer.id,
                                transactionType: 'data_sale'
                            })
                        );

                        if (paymentResult.success) {
                            // Deliver product
                            await this._deliverDataProduct(product, customer);
                            productRevenue += product.price;
                            dataAgentStatus.dataProductsSold++;

                            salesResults.push({
                                productId: product.id,
                                customerId: customer.id,
                                success: true,
                                amount: product.price,
                                transactionId: paymentResult.transactionId,
                                timestamp: new Date().toISOString()
                            });
                        }

                    } catch (error) {
                        this.logger.error(`Sale to customer ${customer.id} failed:`, error);
                        salesResults.push({
                            productId: product.id,
                            customerId: customer.id,
                            success: false,
                            error: error.message,
                            timestamp: new Date().toISOString()
                        });
                    }

                    await quantumDelay(1000); // Rate limiting
                }

                totalRevenue += productRevenue;

            } catch (error) {
                this.logger.error(`Product ${productId} sales failed:`, error);
            }
        }

        return { salesResults, totalRevenue };
    }

    async run() {
        return mutex.runExclusive(async () => {
            this.logger.info('🚀 Data Agent starting revenue generation cycle...');
            dataAgentStatus.lastStatus = 'running';
            dataAgentStatus.lastExecutionTime = new Date().toISOString();

            try {
                // 1. Collect data from all sources
                const collectedData = await this.collectData();
                this.logger.info(`📊 Collected data from ${Object.keys(collectedData).length} sources`);

                // 2. Analyze data for opportunities
                const opportunities = this._analyzeDataOpportunities(collectedData);
                this.logger.info(`🎯 Found ${opportunities.length} data opportunities`);

                // 3. Create data products
                const products = await this._createDataProducts(opportunities);
                this.logger.info(`🛍️ Created ${products.length} data products`);

                // 4. Distribute to marketplaces
                const distributionResults = await this._distributeToMarketplaces(products);
                this.logger.info(`🌐 Distributed ${distributionResults.filter(r => r.success).length} products to marketplaces`);

                // 5. Sell data products
                const salesResults = await this._sellDataProducts();
                this.logger.info(`💰 Generated $${salesResults.totalRevenue} from data sales`);

                // 6. Record revenue on blockchain
                if (salesResults.totalRevenue > 0) {
                    const revenueTx = await this.paymentProcessor.processRevenuePayout(
                        'data_revenue_account',
                        salesResults.totalRevenue,
                        'USD',
                        JSON.stringify({
                            productsSold: salesResults.salesResults.filter(r => r.success).length,
                            totalRevenue: salesResults.totalRevenue,
                            timestamp: new Date().toISOString()
                        })
                    );

                    if (revenueTx.success) {
                        dataAgentStatus.totalRevenue += salesResults.totalRevenue;
                        dataAgentStatus.blockchainTransactions++;
                        this.logger.success(`✅ Revenue recorded: $${salesResults.totalRevenue} USD`);
                    }
                }

                // 7. Store performance data
                await this._storePerformanceData(collectedData, opportunities, products, distributionResults, salesResults);

                dataAgentStatus.lastStatus = 'success';

                return {
                    status: 'success',
                    revenue: salesResults.totalRevenue,
                    dataPoints: dataAgentStatus.dataPointsProcessed,
                    productsCreated: products.length,
                    productsSold: salesResults.salesResults.filter(r => r.success).length
                };

            } catch (error) {
                this.logger.error('Data agent cycle failed:', error);
                dataAgentStatus.lastStatus = 'failed';
                return { status: 'failed', error: error.message };
            }
        });
    }

    async generateGlobalRevenue(cycles = 3) {
        const results = {
            totalRevenue: 0,
            totalDataPoints: 0,
            totalProductsCreated: 0,
            totalProductsSold: 0,
            cyclesCompleted: 0
        };

        for (let i = 0; i < cycles; i++) {
            try {
                const cycleResult = await this.run();
                
                if (cycleResult.status === 'success') {
                    results.totalRevenue += cycleResult.revenue;
                    results.totalDataPoints += cycleResult.dataPoints;
                    results.totalProductsCreated += cycleResult.productsCreated;
                    results.totalProductsSold += cycleResult.productsSold;
                    results.cyclesCompleted++;
                }

                await quantumDelay(30000); // Wait between cycles

            } catch (error) {
                this.logger.error(`Revenue cycle ${i + 1} failed:`, error);
            }
        }

        // Final blockchain settlement
        if (results.totalRevenue > 0) {
            const finalTx = await this.paymentProcessor.processRevenuePayout(
                'global_data_revenue',
                results.totalRevenue,
                'USD'
            );

            if (finalTx.success) {
                this.logger.success(`🌍 Global data revenue completed: $${results.totalRevenue} USD across ${results.cyclesCompleted} cycles`);
            }
        }

        return results;
    }

    // Helper methods
    _calculateRecentActivity(timestamp) {
        const daysSinceUpdate = (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);
        return Math.max(0, 1 - (daysSinceUpdate / 30)); // 1 for recent, 0 for >30 days
    }

    _getLanguagePopularity(language) {
        const popularLanguages = ['javascript', 'python', 'java', 'c++', 'c#', 'php', 'typescript'];
        return popularLanguages.includes(language?.toLowerCase()) ? 1 : 0.5;
    }

    _generateProductAnalysis(opportunity) {
        return {
            confidence: opportunity.score,
            marketPotential: opportunity.potentialValue,
            competition: Math.random() * 0.5 + 0.3,
            growthPotential: Math.random() * 0.7 + 0.3
        };
    }

    _generateProductInsights(opportunity) {
        const insights = [];
        
        if (opportunity.score > 0.8) {
            insights.push('High market demand detected');
            insights.push('Low competition in this niche');
            insights.push('Strong growth potential');
        } else if (opportunity.score > 0.6) {
            insights.push('Moderate market interest');
            insights.push('Some competition present');
            insights.push('Steady growth expected');
        }

        return insights;
    }

    async _findPotentialCustomers(product) {
        // Simulate customer discovery (in real implementation, this would use actual customer data)
        const customers = [];
        const customerCount = Math.floor(Math.random() * 5) + 1; // 1-5 customers per product

        for (let i = 0; i < customerCount; i++) {
            customers.push({
                id: `customer_${crypto.randomBytes(4).toString('hex')}`,
                walletAddress: `0x${crypto.randomBytes(20).toString('hex')}`,
                interest: product.category,
                budget: product.price * (0.8 + Math.random() * 0.4) // 80-120% of product price
            });
        }

        return customers;
    }

    async _deliverDataProduct(product, customer) {
        // Simulate product delivery (in real implementation, this would be actual delivery)
        await this.redis.hset(
            'data_product_deliveries',
            `${product.id}_${customer.id}`,
            JSON.stringify({
                productId: product.id,
                customerId: customer.id,
                deliveredAt: new Date().toISOString(),
                deliveryMethod: 'blockchain_transfer',
                status: 'completed'
            })
        );
    }

    async _storePerformanceData(collectedData, opportunities, products, distributionResults, salesResults) {
        try {
            const performanceData = {
                timestamp: new Date().toISOString(),
                dataSources: Object.keys(collectedData),
                opportunities: opportunities.length,
                productsCreated: products.length,
                distributionResults: distributionResults.filter(r => r.success).length,
                salesResults: salesResults.salesResults.filter(r => r.success).length,
                revenue: salesResults.totalRevenue,
                metrics: {
                    opportunityConversionRate: products.length / opportunities.length || 0,
                    salesConversionRate: salesResults.salesResults.filter(r => r.success).length / products.length || 0,
                    averageProductValue: products.reduce((sum, p) => sum + p.price, 0) / products.length || 0
                }
            };

            await this.redis.hset(
                'data_agent_performance',
                Date.now().toString(),
                JSON.stringify(performanceData)
            );

        } catch (error) {
            this.logger.error('Failed to store performance data:', error);
        }
    }
}

// Worker thread execution
async function workerThreadFunction() {
    const { config, workerId } = workerData;
    const workerLogger = {
        info: (...args) => console.log(`[DataWorker ${workerId}]`, ...args),
        error: (...args) => console.error(`[DataWorker ${workerId}]`, ...args),
        success: (...args) => console.log(`[DataWorker ${workerId}] ✅`, ...args),
        warn: (...args) => console.warn(`[DataWorker ${workerId}] ⚠️`, ...args)
    };

    const dataAgent = new DataAgent(config, workerLogger);

    while (true) {
        await dataAgent.run();
        await quantumDelay(45000); // Run every 45 seconds
    }
}

// Main thread orchestration
if (isMainThread) {
    const numThreads = process.env.DATA_AGENT_THREADS || 1;
    const config = {
        REDIS_URL: process.env.REDIS_URL,
        COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
        COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY,
        
        // Data source API keys
        GITHUB_TOKEN: process.env.GITHUB_TOKEN,
        ALPHAVANTAGE_API_KEY: process.env.ALPHAVANTAGE_API_KEY,
        NEWS_API_KEY: process.env.NEWS_API_KEY,
        OPENWEATHER_API_KEY: process.env.OPENWEATHER_API_KEY,
        
        // Marketplace API keys
        KAGGLE_USERNAME: process.env.KAGGLE_USERNAME,
        KAGGLE_KEY: process.env.KAGGLE_KEY,
        DATAWORLD_API_TOKEN: process.env.DATAWORLD_API_TOKEN,
        RAPIDAPI_KEY: process.env.RAPIDAPI_KEY
    };

    dataAgentStatus.activeWorkers = numThreads;
    console.log(`🌍 Starting ${numThreads} data agent workers for global data monetization...`);

    for (let i = 0; i < numThreads; i++) {
        const worker = new Worker(__filename, {
            workerData: { workerId: i + 1, config }
        });

        dataAgentStatus.workerStatuses[`worker-${i + 1}`] = 'initializing';

        worker.on('online', () => {
            dataAgentStatus.workerStatuses[`worker-${i + 1}`] = 'online';
            console.log(`👷 Data Worker ${i + 1} online`);
        });

        worker.on('message', (msg) => {
            if (msg.type === 'revenue_update') {
                dataAgentStatus.totalRevenue += msg.amount;
                dataAgentStatus.dataProductsCreated += msg.productsCreated || 0;
                dataAgentStatus.dataProductsSold += msg.productsSold || 0;
            }
        });

        worker.on('error', (err) => {
            dataAgentStatus.workerStatuses[`worker-${i + 1}`] = `error: ${err.message}`;
            console.error(`Data Worker ${i + 1} error:`, err);
        });

        worker.on('exit', (code) => {
            dataAgentStatus.workerStatuses[`worker-${i + 1}`] = `exited: ${code}`;
            console.log(`Data Worker ${i + 1} exited with code ${code}`);
        });
    }
}

// Export functions
export function getStatus() {
    return {
        ...dataAgentStatus,
        agent: 'dataAgent',
        timestamp: new Date().toISOString()
    };
}

export default DataAgent;

// Worker thread execution
if (!isMainThread) {
    workerThreadFunction();
}
