// backend/agents/forexSignalAgent.js
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

// === 📊 Forex Signal Agent (Revenue-Optimized) ===
/**
 * @function forexSignalAgent
 * @description Generates forex trading signals based on economic data, news sentiment,
 * and distributes them via various platforms after shortening the link.
 * Integrates with browserManager for Linkvertise interaction and a global logger.
 * @param {object} CONFIG - The global configuration object, including API keys and URLs.
 * @param {object} logger - The global logger instance for consistent logging.
 * @param {object} [redisClient=null] - Optional Redis client for caching data.
 * @returns {Promise<Array<object>>} A list of generated forex signals.
 */
export const forexSignalAgent = async (CONFIG, logger, redisClient = null) => {
    try {
        logger.info('📊 Starting forexSignalAgent...');

        // Validate required keys
        if (!CONFIG.NEWS_API_KEY || !CONFIG.AI_EMAIL || !CONFIG.AI_PASSWORD) {
            logger.warn('❌ Missing NEWS_API_KEY or AI credentials. Skipping forexSignalAgent.');
            return [];
        }

        // Fetch data with clean URLs
        const [countriesRes, ratesRes, newsRes] = await Promise.all([
            axios.get('https://restcountries.com/v3.1/all', { timeout: 10000 }),
            axios.get('https://api.exchangerate.host/latest?base=USD', { timeout: 10000 }),
            axios.get('https://newsapi.org/v2/top-headlines', {
                params: { category: 'business', language: 'en', pageSize: 20 },
                headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
                timeout: 10000
            }).catch(error => {
                logger.warn(`⚠️ News API fetch failed: ${error.message}. Continuing without news sentiment.`);
                return { data: { articles: [] } }; // Return empty articles on error
            })
        ]);

        // Sentiment analysis of news articles
        const sentimentScores = newsRes.data.articles.map(article => {
            const title = (article.title || '').toLowerCase();
            const desc = (article.description || '').toLowerCase();
            const positive = ['rises', 'growth', 'bullish', 'strong', 'increase', 'surge', 'gain', 'positive'];
            const negative = ['falls', 'crash', 'bearish', 'decline', 'drop', 'plunge', 'loss', 'negative'];

            // Count positive and negative keywords
            const pos = positive.filter(w => title.includes(w) || desc.includes(w)).length;
            const neg = negative.filter(w => title.includes(w) || desc.includes(w)).length;

            // Calculate a simple sentiment score, avoiding division by zero
            return { title, score: (pos - neg) / (pos + neg + 1) };
        });

        // Target high-net-worth countries for more valuable signals
        const HIGH_VALUE_COUNTRIES = ['MC', 'CH', 'AE', 'SG', 'LU', 'US', 'GB', 'DE', 'QA', 'IE', 'NO', 'KW', 'BN']; // Added more high-value countries
        const signals = countriesRes.data
            .filter(country => {
                const cc = country.cca2;
                // Filter for high-value countries or independent countries (broader reach)
                return HIGH_VALUE_COUNTRIES.includes(cc) || country.independent;
            })
            .map(country => {
                const currencyCode = Object.keys(country.currencies || {})[0];
                if (!currencyCode) return null; // Skip if no currency is defined for the country

                const rate = ratesRes.data.rates[currencyCode] || 1; // Default to 1 if rate not found
                const countryName = country.name.common;
                // Filter news specific to this country for sentiment
                const countryNews = sentimentScores.filter(s =>
                    s.title.includes(countryName.toLowerCase()) ||
                    s.title.includes(country.cca2.toLowerCase())
                );
                const avgSentiment = countryNews.length > 0
                    ? countryNews.reduce((acc, s) => acc + s.score, 0) / countryNews.length
                    : 0; // Default sentiment to 0 if no relevant news

                let signal = 'Hold';
                if (avgSentiment > 0.3) signal = 'Buy'; // Strong positive sentiment
                else if (avgSentiment < -0.3) signal = 'Sell'; // Strong negative sentiment

                return {
                    country: countryName,
                    cca2: country.cca2,
                    currency: currencyCode,
                    rate: parseFloat(rate.toFixed(4)),
                    sentiment: parseFloat(avgSentiment.toFixed(4)),
                    signal,
                    timestamp: new Date().toISOString()
                };
            })
            .filter(Boolean); // Remove any null entries (countries without currency)

        // === 🔗 Shorten link using Short.io (Primary), AdFly, Linkvertise Fallback ===
        const baseSignalLink = `${CONFIG.STORE_URL || 'https://arielmatrix.io'}/forex`; // Ensure a fallback URL
        let finalLink = baseSignalLink;

        // === PRIMARY: Short.io API ===
        if (CONFIG.SHORTIO_API_KEY && CONFIG.SHORTIO_USER_ID) {
            try {
                const response = await axios.post(
                    `${CONFIG.SHORTIO_URL}/links/public`,
                    {
                        domain: CONFIG.SHORTIO_DOMAIN || 'qgs.gs', // Default domain, can be configured
                        originalURL: baseSignalLink
                    },
                    {
                        headers: {
                            'accept': 'application/json',
                            'content-type': 'application/json',
                            'authorization': CONFIG.SHORTIO_API_KEY,
                            'userId': CONFIG.SHORTIO_USER_ID
                        },
                        timeout: 8000 // Set a reasonable timeout
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
                        type: 'int', // Interstitial ads (higher revenue)
                        domain: 'adf.ly' // Can be configured if custom domain is used
                    },
                    timeout: 8000
                });
                // AdFly API returns the shortened URL directly in the response data
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
                await quantumDelay(3000); // Simulate human-like delay

                // Type email and password using safeType from browserManager
                await browserManager.safeType(page, ['input[name="email"]', '#email', 'input[type="email"]'], CONFIG.AI_EMAIL);
                await browserManager.safeType(page, ['input[name="password"]', '#password', 'input[type="password"]'], CONFIG.AI_PASSWORD);
                logger.info('Typed Linkvertise credentials.');

                // Click login button using safeClick from browserManager
                await browserManager.safeClick(page, ['button[type="submit"]', '.btn-primary', 'text="Sign in"']);
                await quantumDelay(8000); // Longer delay for login processing and page load

                // Navigate to link creation page
                await page.goto('https://linkvertise.com/dashboard/links/create', { waitUntil: 'domcontentloaded', timeout: 60000 });
                await quantumDelay(4000); // Delay for page content to load

                // Type the original URL into the link creation input
                await browserManager.safeType(page, ['input[name="target_url"]', '#target_url', 'input[placeholder="Your target URL"]'], baseSignalLink);
                logger.info('Typed target URL for Linkvertise.');

                // Click the create link button
                await browserManager.safeClick(page, ['button[type="submit"]', '.btn-success', 'text="Create Link"']);
                await quantumDelay(5000); // Wait for link creation and display

                // Extract the shortened link (adjust selector if needed based on Linkvertise UI)
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
            const topSignals = signals.slice(0, 3).map(s => `🌍 ${s.country} | ${s.currency} | ${s.signal}`).join('\n');
            const postTitle = `AI Forex Signals: Market Insights for ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
            const postBody = `Here are today's top AI-generated forex signals:\n\n${topSignals}\n\nGet more insights and start trading: 🔗 ${finalLink}\n\n${CONFIG.UPTIMEROBOT_AFFILIATE_LINK || ''}\n\n#Forex #Trading #AISignals #Crypto #Invest`;
            try {
                await axios.post(
                    'https://oauth.reddit.com/api/submit',
                    {
                        sr: CONFIG.REDDIT_SUBREDDIT || 'forex', // Use configurable subreddit, default to 'forex'
                        kind: 'self', // Self-post (text content)
                        title: postTitle,
                        text: postBody
                    },
                    {
                        headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}`, 'User-Agent': 'ArielMatrixForexAgent/1.0' }, // Add User-Agent
                        timeout: 15000 // Increased timeout
                    }
                );
                logger.success('✅ Posted forex signals to Reddit.');
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
        // Simulate earnings based on signal generation success and link shortening success
        const earnings = signals.length > 0 && finalLink !== baseSignalLink ? Math.random() * 20 + 5 : 0; // Higher potential earnings if signals are generated and link is shortened
        if (earnings > 0) {
            logger.info(`🎯 Payout triggered: $${earnings.toFixed(2)}`);
            // Dynamically import payoutAgent to prevent circular dependencies if payoutAgent also imports forexSignalAgent
            const payoutAgentModule = await import('./payoutAgent.js');
            await payoutAgentModule.payoutAgent({ ...CONFIG, earnings }, logger); // Pass logger to payout agent
        } else {
            logger.info('💰 No significant earnings to trigger payout this cycle.');
        }


        // === 🗄️ Save to Redis ===
        if (redisClient) {
            try {
                await redisClient.set('forex:signals', JSON.stringify(signals), { EX: 3600 }); // Store for 1 hour
                await redisClient.set('forex:stats', JSON.stringify({ earnings: earnings.toFixed(2), numSignals: signals.length }), { EX: 300 }); // Store stats for 5 mins
                logger.info('✅ Saved forex signals and stats to Redis.');
            } catch (redisError) {
                logger.error(`🚨 Failed to save to Redis: ${redisError.message}`);
            }
        }

        logger.info(`📈 Generated ${signals.length} forex signals.`);
        return signals;
    } catch (error) {
        logger.error(`🚨 forexSignalAgent critical ERROR: ${error.message}`);
        return [];
    }
};
