// backend/agents/dataAgent.js
import axios from 'axios';
import crypto from 'crypto';

// Import the browser manager for robust and stealthy browser operations
import browserManager from '../browserManager.js';

// === 🌀 Quantum Jitter (Anti-Robot) ===
const quantumDelay = (ms) => new Promise(resolve => {
    // Add a random delay (jitter) between 1 to 5 seconds to the base delay
    const jitter = crypto.randomInt(1000, 5000);
    setTimeout(resolve, ms + jitter);
});

// === 📊 Data Agent (Revenue-Optimized) ===
/**
 * @function dataAgent
 * @description Gathers market data from news and weather APIs, generates signals,
 * and distributes them via various platforms after shortening the link.
 * Integrates with browserManager for Linkvertise interaction and a global logger.
 * @param {object} CONFIG - The global configuration object, including API keys and URLs.
 * @param {object} logger - The global logger instance for consistent logging.
 * @param {object} [redisClient=null] - Optional Redis client for caching data.
 * @returns {Promise<object>} An object containing fetched news, weather data, and generated signals.
 */
export const dataAgent = async (CONFIG, logger, redisClient = null) => {
    try {
        logger.info('📊 Starting dataAgent...');

        // Validate required keys
        if (!CONFIG.NEWS_API_KEY || !CONFIG.WEATHER_API_KEY || !CONFIG.AI_EMAIL || !CONFIG.AI_PASSWORD) {
            logger.warn('❌ Missing NEWS_API_KEY, WEATHER_API_KEY or AI credentials. Skipping dataAgent.');
            return { news: [], weather: {}, signals: [] };
        }

        // Fetch data with clean URLs
        const [newsRes, weatherRes] = await Promise.all([
            axios.get('https://newsapi.org/v2/top-headlines', {
                params: { country: 'us', category: 'business', pageSize: 20 },
                headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
                timeout: 10000
            }).catch(error => {
                logger.warn(`⚠️ News API fetch failed: ${error.message}. Continuing without news data.`);
                return { data: { articles: [] } }; // Return empty articles on error
            }),
            axios.get('https://api.openweathermap.org/data/2.5/weather', {
                params: { q: CONFIG.WEATHER_LOCATION || 'London', appid: CONFIG.WEATHER_API_KEY, units: 'metric' }, // Added configurable location, units
                timeout: 10000
            }).catch(error => {
                logger.warn(`⚠️ Weather API fetch failed: ${error.message}. Continuing without weather data.`);
                return { data: {} }; // Return empty object on error
            })
        ]);

        // Sentiment analysis from news articles
        const sentimentScores = newsRes.data.articles.map(article => {
            const title = (article.title || '').toLowerCase();
            const desc = (article.description || '').toLowerCase();
            const positive = ['rises', 'growth', 'bullish', 'strong', 'increase', 'surge', 'gain', 'positive', 'boom'];
            const negative = ['falls', 'crash', 'bearish', 'decline', 'drop', 'plunge', 'loss', 'negative', 'slump'];
            const pos = positive.filter(w => title.includes(w) || desc.includes(w)).length;
            const neg = negative.filter(w => title.includes(w) || desc.includes(w)).length;
            return { title, score: (pos - neg) / (pos + neg + 1) };
        });

        const avgSentiment = sentimentScores.length > 0
            ? sentimentScores.reduce((acc, s) => acc + s.score, 0) / sentimentScores.length
            : 0; // Default to 0 if no articles

        // Weather-based signals
        const tempC = weatherRes.data.main?.temp || 20; // Default to 20C if no temp
        let weatherSignal = 'Hold';
        if (tempC > 25) {
            weatherSignal = 'Buy'; // Warm weather, potentially good for retail, construction etc.
        } else if (tempC < 10) {
            weatherSignal = 'Sell'; // Cold weather, potential negative impact on certain sectors
        }

        // Generate signals
        const signals = [
            {
                type: 'Market Sentiment',
                value: avgSentiment > 0.3 ? 'Buy' : avgSentiment < -0.3 ? 'Sell' : 'Hold',
                confidence: parseFloat(Math.abs(avgSentiment).toFixed(2)),
                source: 'newsapi.org',
                timestamp: new Date().toISOString()
            },
            {
                type: 'Weather Influence',
                value: weatherSignal,
                confidence: '0.70', // Assign a static confidence for weather for now
                source: 'openweathermap.org',
                timestamp: new Date().toISOString()
            }
        ];

        // === 🔗 Shorten link using Short.io (Primary), AdFly, Linkvertise Fallback ===
        const baseSignalLink = `${CONFIG.STORE_URL || 'https://arielmatrix.io'}/signals`; // Ensure a fallback URL
        let finalLink = baseSignalLink;

        // === PRIMARY: Short.io API ===
        if (CONFIG.SHORTIO_API_KEY && CONFIG.SHORTIO_USER_ID) {
            try {
                const response = await axios.post(
                    `${CONFIG.SHORTIO_URL}/links/public`,
                    {
                        domain: CONFIG.SHORTIO_DOMAIN || 'qgs.gs',
                        originalURL: baseSignalLink
                    },
                    {
                        headers: {
                            'accept': 'application/json',
                            'content-type': 'application/json',
                            'authorization': CONFIG.SHORTIO_API_KEY,
                            'userId': CONFIG.SHORTIO_USER_ID
                        },
                        timeout: 8000
                    }
                );
                finalLink = response.data.shortURL;
                logger.success(`✅ Short.io success: ${finalLink}`);
            } catch (error) {
                logger.warn(`⚠️ Short.io failed (${error.message?.substring(0, 50)}...) → falling back to AdFly.`);
            }
        } else {
            logger.warn('⚠️ Short.io API keys missing. Skipping Short.io.');
        }

        // === SECONDARY: AdFly API ===
        if (finalLink === baseSignalLink && CONFIG.ADFLY_API_KEY && CONFIG.ADFLY_USER_ID) {
            try {
                const response = await axios.get(CONFIG.ADFLY_URL || 'https://api.adf.ly/api.php', {
                    params: {
                        aid: CONFIG.ADFLY_USER_ID,
                        key: CONFIG.ADFLY_API_KEY,
                        url: baseSignalLink,
                        type: 'int', // Interstitial ads
                        domain: 'adf.ly'
                    },
                    timeout: 8000
                });
                finalLink = response.data;
                logger.success(`✅ AdFly success: ${finalLink}`);
            } catch (error) {
                logger.warn(`⚠️ AdFly failed (${error.message?.substring(0, 50)}...) → falling back to Linkvertise.`);
            }
        } else {
            logger.warn('⚠️ AdFly API keys missing. Skipping AdFly.');
        }

        // === TERTIARY: Linkvertise (via Browser Automation) ===
        if (finalLink === baseSignalLink) {
            let page = null;
            try {
                logger.info('Attempting Linkvertise automation via browser...');
                // Acquire a page from the browser manager
                page = await browserManager.getNewPage();
                if (!page) {
                    throw new Error('Failed to acquire a browser page from browserManager.');
                }

                // Navigate to Linkvertise login
                await page.goto('https://linkvertise.com/auth/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
                await quantumDelay(3000);

                // Type email and password
                await browserManager.safeType(page, ['input[name="email"]', '#email', 'input[type="email"]'], CONFIG.AI_EMAIL);
                await browserManager.safeType(page, ['input[name="password"]', '#password', 'input[type="password"]'], CONFIG.AI_PASSWORD);
                logger.info('Typed Linkvertise credentials.');

                // Click login button
                await browserManager.safeClick(page, ['button[type="submit"]', '.btn-primary', 'text="Sign in"']);
                await quantumDelay(8000);

                // Navigate to link creation page
                await page.goto('https://linkvertise.com/dashboard/links/create', { waitUntil: 'domcontentloaded', timeout: 60000 });
                await quantumDelay(4000);

                // Type the original URL into the link creation input
                await browserManager.safeType(page, ['input[name="target_url"]', '#target_url', 'input[placeholder="Your target URL"]'], baseSignalLink);
                logger.info('Typed target URL for Linkvertise.');

                // Click the create link button
                await browserManager.safeClick(page, ['button[type="submit"]', '.btn-success', 'text="Create Link"']);
                await quantumDelay(5000);

                // Extract the shortened link
                const shortLink = await page.evaluate(() =>
                    document.querySelector('input[readonly], input.share-link-input, #shortenedUrlDisplay')?.value || null
                );

                if (shortLink) {
                    finalLink = shortLink;
                    logger.success(`✅ Linkvertise success: ${finalLink}`);
                } else {
                    logger.warn('⚠️ Linkvertise automation succeeded, but could not find shortened link on page.');
                }
            } catch (error) {
                logger.warn(`⚠️ Linkvertise automation failed: ${error.message?.substring(0, 80)}... → using long URL.`);
                if (error.name === 'TimeoutError') {
                    logger.error('Linkvertise operation timed out. This might indicate bot detection or slow page loads.');
                }
            } finally {
                // Ensure the page is returned to the pool or truly closed
                if (page) {
                    await browserManager.closePage(page);
                }
            }
        } else {
            logger.info('Link already shortened by Short.io or AdFly. Skipping Linkvertise.');
        }

        // === 📌 Post to Reddit (if API key available) ===
        if (CONFIG.REDDIT_API_KEY) {
            const topSignals = signals.map(s => `📊 ${s.type} | ${s.value} | Confidence: ${s.confidence}`).join('\n');
            const postTitle = `AI Market Signals: Daily Update for ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            const postBody = `Here are today's AI-generated market signals based on global news and weather patterns:\n\n${topSignals}\n\nAccess detailed insights: 🔗 ${finalLink}\n\n${CONFIG.UPTIMEROBOT_AFFILIATE_LINK || ''}\n\n#MarketAnalysis #AISignals #Invest #Crypto #News #Weather`;
            try {
                await axios.post(
                    'https://oauth.reddit.com/api/submit',
                    {
                        sr: CONFIG.REDDIT_SUBREDDIT || 'investing', // Default to 'investing'
                        kind: 'self',
                        title: postTitle,
                        text: postBody
                    },
                    {
                        headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}`, 'User-Agent': 'ArielMatrixDataAgent/1.0' },
                        timeout: 15000
                    }
                );
                logger.success('✅ Posted market signals to Reddit.');
            } catch (e) {
                logger.warn(`⚠️ Reddit post failed: ${e.response?.data?.message || e.message?.substring(0, 60)}`);
                if (e.response?.status === 403) {
                    logger.warn('Reddit API returned 403 Forbidden. Check Reddit API key and permissions.');
                }
            }
        } else {
            logger.warn('⚠️ Reddit API key not provided. Skipping Reddit post.');
        }

        // === 💸 Trigger Payout ===
        // Simulate earnings based on signal generation and link shortening success
        const earnings = signals.length > 0 && finalLink !== baseSignalLink ? Math.random() * 15 + 3 : 0; // Adjusted earnings potential
        if (earnings > 0) {
            logger.info(`🎯 Payout triggered: $${earnings.toFixed(2)}`);
            const payoutAgentModule = await import('./payoutAgent.js');
            await payoutAgentModule.payoutAgent({ ...CONFIG, earnings }, logger);
        } else {
            logger.info('💰 No significant earnings to trigger payout this cycle.');
        }

        // === 🗄️ Save to Redis ===
        if (redisClient) {
            try {
                await redisClient.set('data:news', JSON.stringify(newsRes.data), { EX: 3600 });
                await redisClient.set('data:weather', JSON.stringify(weatherRes.data), { EX: 3600 });
                await redisClient.set('data:signals', JSON.stringify(signals), { EX: 3600 });
                logger.info('✅ Saved data and signals to Redis.');
            } catch (redisError) {
                logger.error(`🚨 Failed to save to Redis: ${redisError.message}`);
            }
        }

        logger.info(`📈 Generated ${signals.length} market signals.`);
        return { news: newsRes.data, weather: weatherRes.data, signals };
    } catch (error) {
        logger.error(`🚨 dataAgent critical ERROR: ${error.message}`);
        return { news: [], weather: {}, signals: [] };
    }
};
