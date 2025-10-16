// modules/ai-oracle-engine.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createHmac } from 'crypto';

export class AIOracleEngine {
    constructor(config = {}) {
        this.config = {
            oracleTypes: ['price', 'weather', 'sports', 'financial', 'custom'],
            updateIntervals: {
                price: 30000,
                weather: 300000,
                sports: 60000,
                financial: 15000,
                custom: 60000
            },
            dataSources: {
                price: ['coinbase', 'binance', 'kraken', 'uniswap'],
                weather: ['openweather', 'accuweather', 'weatherbit'],
                sports: ['thesportsdb', 'sportradar', 'api-sports'],
                financial: ['alphavantage', 'iexcloud', 'finnhub'],
                custom: ['webhook', 'api', 'blockchain']
            },
            consensusThreshold: 0.67,
            maxDataAge: 60000,
            ...config
        };
        this.oracleFeeds = new Map();
        this.dataSubscriptions = new Map();
        this.consensusResults = new Map();
        this.priceCache = new Map();
        this.websocketConnections = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/ai-oracle-engine.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.dataFetchIntervals = new Map();
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'AIOracleEngine',
            description: 'Decentralized AI-powered oracle system with multi-source consensus',
            registrationFee: 15000,
            annualLicenseFee: 7500,
            revenueShare: 0.20,
            serviceType: 'oracle_infrastructure',
            dataPolicy: 'Aggregated oracle data only - No raw source data storage',
            compliance: ['Data Integrity', 'Multi-Source Verification']
        });

        await this.initializeDataFeeds();
        await this.startConsensusEngine();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            oracleTypes: this.config.oracleTypes,
            dataSources: this.config.dataSources
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS oracle_feeds (
                id TEXT PRIMARY KEY,
                feedType TEXT NOT NULL,
                description TEXT,
                dataSources TEXT NOT NULL,
                updateInterval INTEGER NOT NULL,
                consensusThreshold REAL NOT NULL,
                isActive BOOLEAN DEFAULT true,
                lastUpdate DATETIME,
                currentValue TEXT,
                confidenceScore REAL DEFAULT 0,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS oracle_data_points (
                id TEXT PRIMARY KEY,
                feedId TEXT NOT NULL,
                source TEXT NOT NULL,
                value TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                signature TEXT,
                dataHash TEXT NOT NULL,
                confidence REAL DEFAULT 1.0,
                FOREIGN KEY (feedId) REFERENCES oracle_feeds (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS consensus_results (
                id TEXT PRIMARY KEY,
                feedId TEXT NOT NULL,
                consensusValue TEXT NOT NULL,
                confidenceScore REAL NOT NULL,
                participatingSources TEXT NOT NULL,
                totalSources INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                blockNumber INTEGER,
                transactionHash TEXT,
                FOREIGN KEY (feedId) REFERENCES oracle_feeds (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS oracle_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                feedId TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                responseTime INTEGER,
                accuracyScore REAL,
                availability REAL,
                errorCount INTEGER DEFAULT 0
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS data_subscriptions (
                id TEXT PRIMARY KEY,
                subscriber TEXT NOT NULL,
                feedId TEXT NOT NULL,
                callbackUrl TEXT,
                subscriptionType TEXT DEFAULT 'push',
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastNotified DATETIME
            )
        `);
    }

    async initializeDataFeeds() {
        const defaultFeeds = [
            {
                id: 'bwz_usd_price',
                feedType: 'price',
                description: 'BWZ to USD price feed',
                dataSources: JSON.stringify(['coinbase', 'binance', 'kraken']),
                updateInterval: 30000,
                consensusThreshold: 0.67
            },
            {
                id: 'eth_usd_price',
                feedType: 'price',
                description: 'ETH to USD price feed',
                dataSources: JSON.stringify(['coinbase', 'binance', 'uniswap']),
                updateInterval: 30000,
                consensusThreshold: 0.67
            },
            {
                id: 'btc_usd_price',
                feedType: 'price',
                description: 'BTC to USD price feed',
                dataSources: JSON.stringify(['coinbase', 'binance', 'kraken']),
                updateInterval: 30000,
                consensusThreshold: 0.67
            }
        ];

        for (const feed of defaultFeeds) {
            await this.db.run(`
                INSERT OR REPLACE INTO oracle_feeds (id, feedType, description, dataSources, updateInterval, consensusThreshold, isActive)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [feed.id, feed.feedType, feed.description, feed.dataSources, feed.updateInterval, feed.consensusThreshold, true]);

            this.oracleFeeds.set(feed.id, {
                ...feed,
                dataSources: JSON.parse(feed.dataSources),
                currentValue: null,
                confidenceScore: 0,
                lastUpdate: null
            });

            await this.startFeedUpdates(feed.id);
        }
    }

    async startFeedUpdates(feedId) {
        const feed = this.oracleFeeds.get(feedId);
        if (!feed) return;

        const interval = setInterval(async () => {
            try {
                await this.updateFeedData(feedId);
            } catch (error) {
                console.error(`Error updating feed ${feedId}:`, error);
                await this.recordFeedError(feedId, error.message);
            }
        }, feed.updateInterval);

        this.dataFetchIntervals.set(feedId, interval);
    }

    async updateFeedData(feedId) {
        const feed = this.oracleFeeds.get(feedId);
        if (!feed) return;

        const startTime = Date.now();
        const dataPromises = feed.dataSources.map(source => 
            this.fetchDataFromSource(feedId, source, feed.feedType)
        );

        try {
            const results = await Promise.allSettled(dataPromises);
            const successfulResults = results
                .filter(result => result.status === 'fulfilled')
                .map(result => result.value);

            if (successfulResults.length > 0) {
                const consensus = await this.calculateConsensus(feedId, successfulResults);
                await this.storeConsensusResult(feedId, consensus);
                
                feed.currentValue = consensus.value;
                feed.confidenceScore = consensus.confidence;
                feed.lastUpdate = new Date();

                await this.db.run(`
                    UPDATE oracle_feeds 
                    SET currentValue = ?, confidenceScore = ?, lastUpdate = CURRENT_TIMESTAMP
                    WHERE id = ?
                `, [JSON.stringify(consensus.value), consensus.confidence, feedId]);

                await this.notifySubscribers(feedId, consensus);
                
                const responseTime = Date.now() - startTime;
                await this.recordFeedMetrics(feedId, responseTime, consensus.confidence, 1, 0);
            }
        } catch (error) {
            await this.recordFeedError(feedId, error.message);
        }
    }

    async fetchDataFromSource(feedId, source, feedType) {
        const sourceConfig = this.getSourceConfig(source, feedType);
        const startTime = Date.now();

        try {
            let data;
            switch (feedType) {
                case 'price':
                    data = await this.fetchPriceData(source, feedId);
                    break;
                case 'weather':
                    data = await this.fetchWeatherData(source, feedId);
                    break;
                case 'sports':
                    data = await this.fetchSportsData(source, feedId);
                    break;
                case 'financial':
                    data = await this.fetchFinancialData(source, feedId);
                    break;
                default:
                    throw new Error(`Unsupported feed type: ${feedType}`);
            }

            const responseTime = Date.now() - startTime;
            const dataHash = this.hashData(data);
            const signature = this.signData(data, source);

            await this.db.run(`
                INSERT INTO oracle_data_points (id, feedId, source, value, signature, dataHash, confidence)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                this.generateDataPointId(),
                feedId,
                source,
                JSON.stringify(data),
                signature,
                dataHash,
                this.calculateSourceConfidence(source, responseTime)
            ]);

            return {
                source,
                data,
                responseTime,
                confidence: this.calculateSourceConfidence(source, responseTime),
                timestamp: new Date()
            };
        } catch (error) {
            await this.recordSourceError(feedId, source, error.message);
            throw error;
        }
    }

    async fetchPriceData(source, feedId) {
        const symbol = feedId.split('_')[0].toUpperCase();
        const currency = feedId.split('_')[1].toUpperCase();
        
        let priceData;
        switch (source) {
            case 'coinbase':
                priceData = await this.fetchCoinbasePrice(symbol, currency);
                break;
            case 'binance':
                priceData = await this.fetchBinancePrice(symbol, currency);
                break;
            case 'kraken':
                priceData = await this.fetchKrakenPrice(symbol, currency);
                break;
            case 'uniswap':
                priceData = await this.fetchUniswapPrice(symbol, currency);
                break;
            default:
                throw new Error(`Unsupported price source: ${source}`);
        }

        return {
            price: priceData.price,
            volume: priceData.volume,
            timestamp: priceData.timestamp,
            symbol,
            currency
        };
    }

    async fetchCoinbasePrice(symbol, currency) {
        const response = await fetch(`https://api.coinbase.com/v2/prices/${symbol}-${currency}/spot`);
        if (!response.ok) throw new Error(`Coinbase API error: ${response.status}`);
        
        const data = await response.json();
        return {
            price: parseFloat(data.data.amount),
            volume: 0,
            timestamp: new Date().toISOString(),
            source: 'coinbase',
            symbol,
            currency
        };
    }

    async fetchBinancePrice(symbol, currency) {
        const tradingPair = `${symbol}${currency}`;
        const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${tradingPair}`);
        if (!response.ok) throw new Error(`Binance API error: ${response.status}`);
        
        const data = await response.json();
        
        const statsResponse = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${tradingPair}`);
        let volume = 0;
        if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            volume = parseFloat(statsData.volume) || 0;
        }
        
        return {
            price: parseFloat(data.price),
            volume: volume,
            timestamp: new Date().toISOString(),
            source: 'binance',
            symbol,
            currency
        };
    }

    async fetchKrakenPrice(symbol, currency) {
        const pair = `${symbol}${currency}`.toUpperCase();
        const response = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${pair}`);
        if (!response.ok) throw new Error(`Kraken API error: ${response.status}`);
        
        const data = await response.json();
        
        if (data.error && data.error.length > 0) {
            throw new Error(`Kraken API error: ${data.error.join(', ')}`);
        }
        
        const resultKey = Object.keys(data.result)[0];
        const ticker = data.result[resultKey];
        
        return {
            price: parseFloat(ticker.c[0]),
            volume: parseFloat(ticker.v[1]),
            timestamp: new Date().toISOString(),
            source: 'kraken',
            symbol,
            currency
        };
    }

    async fetchUniswapPrice(symbol, currency) {
        const coingeckoId = this.getCoinGeckoId(symbol);
        if (!coingeckoId) {
            throw new Error(`Unsupported symbol for Uniswap price: ${symbol}`);
        }
        
        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${coingeckoId}&vs_currencies=${currency.toLowerCase()}`
        );
        
        if (!response.ok) throw new Error(`CoinGecko API error: ${response.status}`);
        
        const data = await response.json();
        const priceData = data[coingeckoId];
        
        if (!priceData || !priceData[currency.toLowerCase()]) {
            throw new Error(`Price data not available for ${symbol}`);
        }
        
        return {
            price: priceData[currency.toLowerCase()],
            volume: 0,
            timestamp: new Date().toISOString(),
            source: 'coingecko',
            symbol,
            currency
        };
    }

    getCoinGeckoId(symbol) {
        const mapping = {
            'BWZ': 'bwaezi',
            'ETH': 'ethereum',
            'BTC': 'bitcoin',
            'USDT': 'tether',
            'USDC': 'usd-coin',
            'DAI': 'dai'
        };
        return mapping[symbol.toUpperCase()];
    }

    async fetchWeatherData(source, feedId) {
        const location = feedId.replace('weather_', '');
        
        switch (source) {
            case 'openweather':
                return await this.fetchOpenWeatherData(location);
            case 'accuweather':
                return await this.fetchAccuWeatherData(location);
            case 'weatherbit':
                return await this.fetchWeatherBitData(location);
            default:
                throw new Error(`Unsupported weather source: ${source}`);
        }
    }

    async fetchOpenWeatherData(location) {
        const apiKey = process.env.OPENWEATHER_API_KEY;
        if (!apiKey) throw new Error('OpenWeather API key not configured');

        const response = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${apiKey}&units=metric`
        );
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenWeather API error: ${response.status} - ${errorData.message || 'Unknown error'}`);
        }
        
        const data = await response.json();
        return {
            temperature: data.main.temp,
            humidity: data.main.humidity,
            pressure: data.main.pressure,
            description: data.weather[0].description,
            windSpeed: data.wind.speed,
            visibility: data.visibility,
            timestamp: new Date(data.dt * 1000).toISOString(),
            location: data.name,
            country: data.sys.country
        };
    }

    async fetchAccuWeatherData(location) {
        const apiKey = process.env.ACCUWEATHER_API_KEY;
        if (!apiKey) throw new Error('AccuWeather API key not configured');

        const locationResponse = await fetch(
            `https://dataservice.accuweather.com/locations/v1/cities/search?q=${encodeURIComponent(location)}&apikey=${apiKey}`
        );
        
        if (!locationResponse.ok) throw new Error(`AccuWeather location API error: ${locationResponse.status}`);
        
        const locationData = await locationResponse.json();
        if (!locationData || locationData.length === 0) {
            throw new Error(`Location not found: ${location}`);
        }
        
        const locationKey = locationData[0].Key;
        
        const weatherResponse = await fetch(
            `https://dataservice.accuweather.com/currentconditions/v1/${locationKey}?apikey=${apiKey}&details=true`
        );
        
        if (!weatherResponse.ok) throw new Error(`AccuWeather conditions API error: ${weatherResponse.status}`);
        
        const weatherData = await weatherResponse.json();
        const current = weatherData[0];
        
        return {
            temperature: current.Temperature.Metric.Value,
            humidity: current.RelativeHumidity,
            pressure: current.Pressure.Metric.Value,
            description: current.WeatherText,
            windSpeed: current.Wind.Speed.Metric.Value,
            visibility: current.Visibility.Metric.Value,
            timestamp: new Date(current.EpochTime * 1000).toISOString(),
            location: locationData[0].LocalizedName,
            country: locationData[0].Country.LocalizedName
        };
    }

    async fetchWeatherBitData(location) {
        const apiKey = process.env.WEATHERBIT_API_KEY;
        if (!apiKey) throw new Error('WeatherBit API key not configured');

        const response = await fetch(
            `https://api.weatherbit.io/v2.0/current?city=${encodeURIComponent(location)}&key=${apiKey}`
        );
        
        if (!response.ok) throw new Error(`WeatherBit API error: ${response.status}`);
        
        const data = await response.json();
        const current = data.data[0];
        
        return {
            temperature: current.temp,
            humidity: current.rh,
            pressure: current.pres,
            description: current.weather.description,
            windSpeed: current.wind_spd,
            visibility: current.vis,
            timestamp: new Date(current.ts * 1000).toISOString(),
            location: current.city_name,
            country: current.country_code
        };
    }

    async fetchSportsData(source, feedId) {
        const [sport, league] = feedId.split('_').slice(1);
        
        switch (source) {
            case 'thesportsdb':
                return await this.fetchSportsDBData(sport, league);
            case 'sportradar':
                return await this.fetchSportRadarData(sport, league);
            case 'api-sports':
                return await this.fetchAPISportsData(sport, league);
            default:
                throw new Error(`Unsupported sports source: ${source}`);
        }
    }

    async fetchSportsDBData(sport, league) {
        const apiKey = process.env.THESPORTSDB_API_KEY;
        
        let endpoint;
        if (sport === 'football' && league === 'nfl') {
            endpoint = 'https://www.thesportsdb.com/api/v1/json/2/search_all_teams.php?l=NFL';
        } else if (sport === 'basketball' && league === 'nba') {
            endpoint = 'https://www.thesportsdb.com/api/v1/json/2/search_all_teams.php?l=NBA';
        } else {
            throw new Error(`Unsupported sport/league combination: ${sport}/${league}`);
        }
        
        if (apiKey) {
            endpoint += `&apiKey=${apiKey}`;
        }
        
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`TheSportsDB API error: ${response.status}`);
        
        const data = await response.json();
        
        return {
            sport,
            league,
            teams: data.teams ? data.teams.length : 0,
            lastUpdated: new Date().toISOString(),
            data: data.teams ? data.teams.slice(0, 10) : []
        };
    }

    async fetchSportRadarData(sport, league) {
        const apiKey = process.env.SPORTRADAR_API_KEY;
        if (!apiKey) throw new Error('SportRadar API key not configured');

        let endpoint;
        if (sport === 'basketball' && league === 'nba') {
            endpoint = `https://api.sportradar.us/nba/trial/v8/en/league/standings.json?api_key=${apiKey}`;
        } else {
            throw new Error(`Unsupported sport/league combination: ${sport}/${league}`);
        }
        
        const response = await fetch(endpoint);
        if (!response.ok) throw new Error(`SportRadar API error: ${response.status}`);
        
        const data = await response.json();
        
        return {
            sport,
            league,
            standings: data.standings || [],
            lastUpdated: new Date().toISOString()
        };
    }

    async fetchFinancialData(source, feedId) {
        const symbol = feedId.replace('financial_', '');
        
        switch (source) {
            case 'alphavantage':
                return await this.fetchAlphaVantageData(symbol);
            case 'iexcloud':
                return await this.fetchIEXCloudData(symbol);
            case 'finnhub':
                return await this.fetchFinnhubData(symbol);
            default:
                throw new Error(`Unsupported financial source: ${source}`);
        }
    }

    async fetchAlphaVantageData(symbol) {
        const apiKey = process.env.ALPHAVANTAGE_API_KEY;
        if (!apiKey) throw new Error('AlphaVantage API key not configured');

        const response = await fetch(
            `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${apiKey}`
        );
        
        if (!response.ok) throw new Error(`AlphaVantage API error: ${response.status}`);
        
        const data = await response.json();
        
        if (data['Error Message']) {
            throw new Error(`AlphaVantage error: ${data['Error Message']}`);
        }
        
        if (data['Note']) {
            throw new Error(`AlphaVantage rate limit: ${data['Note']}`);
        }
        
        const quote = data['Global Quote'];
        if (!quote) {
            throw new Error('No quote data available');
        }
        
        return {
            symbol: quote['01. symbol'],
            price: parseFloat(quote['05. price']),
            change: parseFloat(quote['09. change']),
            changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
            volume: parseInt(quote['06. volume']),
            latestTradingDay: quote['07. latest trading day'],
            timestamp: new Date().toISOString()
        };
    }

    async fetchIEXCloudData(symbol) {
        const apiKey = process.env.IEXCLOUD_API_KEY;
        if (!apiKey) throw new Error('IEX Cloud API key not configured');

        const response = await fetch(
            `https://cloud.iexapis.com/stable/stock/${symbol}/quote?token=${apiKey}`
        );
        
        if (!response.ok) throw new Error(`IEX Cloud API error: ${response.status}`);
        
        const data = await response.json();
        
        return {
            symbol: data.symbol,
            price: data.latestPrice,
            change: data.change,
            changePercent: data.changePercent * 100,
            volume: data.volume,
            marketCap: data.marketCap,
            latestTradingDay: data.latestTime,
            timestamp: new Date().toISOString()
        };
    }

    async calculateConsensus(feedId, dataPoints) {
        const feed = this.oracleFeeds.get(feedId);
        if (!feed) throw new Error(`Feed not found: ${feedId}`);

        if (dataPoints.length === 0) {
            throw new Error('No data points for consensus calculation');
        }

        const valueGroups = new Map();
        
        for (const point of dataPoints) {
            const key = this.normalizeValue(point.data, feed.feedType);
            if (!valueGroups.has(key)) {
                valueGroups.set(key, []);
            }
            valueGroups.get(key).push(point);
        }

        let bestGroup = null;
        let maxConfidence = 0;

        for (const [value, points] of valueGroups) {
            const totalConfidence = points.reduce((sum, point) => sum + point.confidence, 0);
            const participationRatio = points.length / feed.dataSources.length;

            if (participationRatio >= feed.consensusThreshold && totalConfidence > maxConfidence) {
                maxConfidence = totalConfidence;
                bestGroup = { value, points, confidence: totalConfidence / points.length };
            }
        }

        if (!bestGroup) {
            throw new Error('No consensus reached for feed data');
        }

        return {
            value: this.parseValue(bestGroup.value, feed.feedType),
            confidence: bestGroup.confidence,
            participatingSources: bestGroup.points.map(p => p.source),
            totalSources: feed.dataSources.length,
            timestamp: new Date()
        };
    }

    normalizeValue(data, feedType) {
        switch (feedType) {
            case 'price':
                return data.price.toFixed(6);
            case 'weather':
                return `${data.temperature.toFixed(1)}_${data.humidity}`;
            case 'sports':
            case 'financial':
                return JSON.stringify(data);
            default:
                return JSON.stringify(data);
        }
    }

    parseValue(value, feedType) {
        switch (feedType) {
            case 'price':
                return parseFloat(value);
            case 'weather':
                return parseFloat(value.split('_')[0]);
            default:
                return value;
        }
    }

    async storeConsensusResult(feedId, consensus) {
        const resultId = this.generateConsensusId();
        
        await this.db.run(`
            INSERT INTO consensus_results (id, feedId, consensusValue, confidenceScore, participatingSources, totalSources)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            resultId,
            feedId,
            JSON.stringify(consensus.value),
            consensus.confidence,
            JSON.stringify(consensus.participatingSources),
            consensus.totalSources
        ]);

        this.consensusResults.set(resultId, {
            id: resultId,
            feedId,
            ...consensus
        });

        return resultId;
    }

    async notifySubscribers(feedId, consensus) {
        const subscriptions = await this.db.all(
            'SELECT * FROM data_subscriptions WHERE feedId = ? AND isActive = true',
            [feedId]
        );

        for (const subscription of subscriptions) {
            try {
                await this.sendNotification(subscription, consensus);
                
                await this.db.run(`
                    UPDATE data_subscriptions SET lastNotified = CURRENT_TIMESTAMP WHERE id = ?
                `, [subscription.id]);
            } catch (error) {
                console.error(`Failed to notify subscriber ${subscription.id}:`, error);
            }
        }
    }

    async sendNotification(subscription, consensus) {
        const notification = {
            feedId: subscription.feedId,
            value: consensus.value,
            confidence: consensus.confidence,
            timestamp: consensus.timestamp,
            subscriptionId: subscription.id
        };

        if (subscription.subscriptionType === 'webhook' && subscription.callbackUrl) {
            await fetch(subscription.callbackUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notification)
            });
        }
    }

    async createDataFeed(feedConfig) {
        if (!this.initialized) await this.initialize();

        const feedId = this.generateFeedId(feedConfig.feedType);
        
        await this.db.run(`
            INSERT INTO oracle_feeds (id, feedType, description, dataSources, updateInterval, consensusThreshold, isActive)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            feedId,
            feedConfig.feedType,
            feedConfig.description,
            JSON.stringify(feedConfig.dataSources),
            feedConfig.updateInterval || this.config.updateIntervals[feedConfig.feedType],
            feedConfig.consensusThreshold || this.config.consensusThreshold,
            true
        ]);

        const feed = {
            id: feedId,
            ...feedConfig,
            currentValue: null,
            confidenceScore: 0,
            lastUpdate: null
        };

        this.oracleFeeds.set(feedId, feed);
        await this.startFeedUpdates(feedId);

        this.events.emit('feedCreated', {
            feedId,
            config: feedConfig,
            timestamp: new Date()
        });

        return feedId;
    }

    async subscribeToFeed(subscriber, feedId, callbackUrl = null, subscriptionType = 'push') {
        if (!this.initialized) await this.initialize();

        const subscriptionId = this.generateSubscriptionId();
        
        await this.db.run(`
            INSERT INTO data_subscriptions (id, subscriber, feedId, callbackUrl, subscriptionType)
            VALUES (?, ?, ?, ?, ?)
        `, [subscriptionId, subscriber, feedId, callbackUrl, subscriptionType]);

        this.events.emit('subscriptionCreated', {
            subscriptionId,
            subscriber,
            feedId,
            subscriptionType,
            timestamp: new Date()
        });

        return subscriptionId;
    }

    async getFeedData(feedId) {
        if (!this.initialized) await this.initialize();

        const feed = this.oracleFeeds.get(feedId);
        if (!feed) throw new Error(`Feed not found: ${feedId}`);

        const recentConsensus = await this.db.get(`
            SELECT * FROM consensus_results 
            WHERE feedId = ? 
            ORDER BY timestamp DESC 
            LIMIT 1
        `, [feedId]);

        return {
            feedId,
            currentValue: feed.currentValue,
            confidenceScore: feed.confidenceScore,
            lastUpdate: feed.lastUpdate,
            recentConsensus: recentConsensus ? {
                value: JSON.parse(recentConsensus.consensusValue),
                confidence: recentConsensus.confidenceScore,
                timestamp: recentConsensus.timestamp
            } : null
        };
    }

    async getFeedHistory(feedId, limit = 100) {
        if (!this.initialized) await this.initialize();

        const history = await this.db.all(`
            SELECT * FROM consensus_results 
            WHERE feedId = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `, [feedId, limit]);

        return history.map(record => ({
            value: JSON.parse(record.consensusValue),
            confidence: record.confidenceScore,
            participatingSources: JSON.parse(record.participatingSources),
            timestamp: record.timestamp,
            transactionHash: record.transactionHash
        }));
    }

    calculateSourceConfidence(source, responseTime) {
        const baseConfidence = 1.0;
        const responsePenalty = Math.min(responseTime / 1000, 0.5);
        return Math.max(0.1, baseConfidence - responsePenalty);
    }

    getSourceConfig(source, feedType) {
        return {
            timeout: 10000,
            retries: 3,
            apiKey: process.env[`${source.toUpperCase()}_API_KEY`]
        };
    }

    async recordFeedMetrics(feedId, responseTime, accuracy, availability, errorCount) {
        await this.db.run(`
            INSERT INTO oracle_metrics (feedId, responseTime, accuracyScore, availability, errorCount)
            VALUES (?, ?, ?, ?, ?)
        `, [feedId, responseTime, accuracy, availability, errorCount]);
    }

    async recordFeedError(feedId, error) {
        await this.db.run(`
            INSERT INTO oracle_metrics (feedId, errorCount)
            VALUES (?, 1)
        `, [feedId]);

        this.events.emit('feedError', {
            feedId,
            error,
            timestamp: new Date()
        });
    }

    async recordSourceError(feedId, source, error) {
        console.error(`Source error for ${feedId} from ${source}:`, error);
    }

    hashData(data) {
        return createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    signData(data, source) {
        const secret = process.env[`${source.toUpperCase()}_SIGNING_SECRET`];
        if (!secret) return 'unsigned';
        
        return createHmac('sha256', secret)
            .update(JSON.stringify(data))
            .digest('hex');
    }

    generateFeedId(feedType) {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `${feedType}_feed_${timestamp}_${random}`;
    }

    generateDataPointId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `data_point_${timestamp}_${random}`;
    }

    generateConsensusId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `consensus_${timestamp}_${random}`;
    }

    generateSubscriptionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `subscription_${timestamp}_${random}`;
    }

    async startConsensusEngine() {
        setInterval(async () => {
            await this.cleanupOldData();
        }, 3600000);
    }

    async cleanupOldData() {
        const cutoffTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        await this.db.run(`
            DELETE FROM oracle_data_points WHERE timestamp < ?
        `, [cutoffTime]);

        await this.db.run(`
            DELETE FROM oracle_metrics WHERE timestamp < ?
        `, [cutoffTime]);

        console.log('✅ Cleaned up old oracle data');
    }

    async getOracleStats() {
        if (!this.initialized) await this.initialize();

        const feedStats = await this.db.all(`
            SELECT 
                feedType,
                COUNT(*) as totalFeeds,
                AVG(confidenceScore) as avgConfidence,
                SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeFeeds
            FROM oracle_feeds 
            GROUP BY feedType
        `);

        const performanceStats = await this.db.get(`
            SELECT 
                AVG(responseTime) as avgResponseTime,
                AVG(accuracyScore) as avgAccuracy,
                AVG(availability) as avgAvailability,
                SUM(errorCount) as totalErrors
            FROM oracle_metrics 
            WHERE timestamp >= datetime('now', '-1 hour')
        `);

        return {
            feeds: feedStats,
            performance: performanceStats,
            totalSubscriptions: await this.getTotalSubscriptions(),
            timestamp: new Date()
        };
    }

    async getTotalSubscriptions() {
        const result = await this.db.get(`
            SELECT COUNT(*) as count FROM data_subscriptions WHERE isActive = true
        `);
        return result?.count || 0;
    }
}

export default AIOracleEngine;
