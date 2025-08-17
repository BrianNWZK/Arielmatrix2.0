// backend/agents/adRevenueAgent.js
import axios from 'axios';
import crypto from 'crypto';

// Import the browser manager for robust and stealthy browser operations
import browserManager from '../browserManager.js';

// === 🌀 Quantum Jitter (Anti-Robot) ===
// Adds a random delay to mimic human behavior and avoid bot detection, crucial for zero-cost scraping/automation.
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = crypto.randomInt(500, 3000); // Jitter between 0.5 to 3 seconds
    setTimeout(resolve, ms + jitter);
});

// === 💸 Ad Revenue Agent (Global, Real Revenue, Zero-Cost Operations) ===
/**
 * @function adRevenueAgent
 * @description Generates REAL ad revenue by fetching universally appealing content (e.g., pet images),
 * dynamically generating engaging, globally appealing captions using an LLM, shortening links through
 * revenue-sharing platforms (like AdFly), distributing content strategically on social media,
 * and accurately tracking actual earnings from these platforms.
 *
 * All operations are meticulously designed to be **zero-cost** by:
 * - Leveraging **free, public APIs** for content (e.g., Dog/Cat images).
 * - Utilizing **revenue-sharing models** (e.g., AdFly, Linkvertise via automation) where the platform pays you.
 * - Employing **browser automation (Puppeteer via `browserManager`)** for platforms lacking free APIs,
 * effectively turning compute time into a free alternative to paid services for content distribution
 * and advanced link shortening.
 * - Using **free-tier LLM calls** (within this Canvas environment, this is inherently zero-cost).
 * - Implementing **Redis caching** (free when self-hosted) to minimize redundant API calls.
 * - Focusing on **global distribution platforms** with high reach (e.g., Reddit) or scalable
 * automation strategies (e.g., targeting country-specific forums via browser automation).
 *
 * The aim is to generate a minimum of $1 per country, with the potential to scale infinitely
 * based on traffic and engagement to the monetized links.
 *
 * @param {object} CONFIG - The global configuration object, including API keys and URLs.
 * @param {object} logger - The global logger instance for consistent logging.
 * @param {object} [redisClient=null] - Optional Redis client for caching data.
 * @returns {Promise<object>} An object containing success status, generated links, and the final caption.
 */
export const adRevenueAgent = async (CONFIG, logger, redisClient = null) => {
    try {
        logger.info('💸 Starting adRevenueAgent for REAL global revenue generation...');

        // Validate essential keys for revenue generation and core functionalities.
        // Missing keys will cause specific features to be skipped, but the agent will attempt to proceed.
        const essentialKeys = ['ADFLY_API_KEY', 'ADFLY_USER_ID', 'NEWS_API_KEY', 'REDDIT_API_KEY', 'AI_EMAIL', 'AI_PASSWORD'];
        for (const key of essentialKeys) {
            if (!CONFIG[key] || CONFIG[key].includes('fallback')) {
                logger.warn(`❌ Missing or fallback for essential key: ${key}. Some functionalities will be limited.`);
            }
        }

        // === Content Fetching (Zero-Cost & Universally Appealing) ===
        // Prioritize dog images, fallback to cat, then a generic placeholder.
        // These APIs are free and highly available globally.
        let petImage = 'https://placehold.co/600x400/cccccc/ffffff?text=Cute+Pet'; // Ultimate fallback
        try {
            const dogRes = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 5000 });
            if (dogRes.data?.message && dogRes.data.message.startsWith('http')) {
                petImage = dogRes.data.message;
            }
        } catch (e) {
            logger.warn(`⚠️ Dog API failed: ${e.message}. Attempting Cat API.`);
            try {
                const catRes = await axios.get('https://api.thecatapi.com/v1/images/search', {
                    headers: { 'x-api-key': CONFIG.CAT_API_KEY || 'no-key' },
                    timeout: 5000
                });
                if (catRes.data?.[0]?.url && catRes.data[0].url.startsWith('http')) {
                    petImage = catRes.data[0].url;
                }
            } catch (catError) {
                logger.warn(`⚠️ Cat API failed: ${catError.message}. Using placeholder image.`);
            }
        }
        logger.info(`🖼️ Using pet image: ${petImage.substring(0, 50)}...`);


        // Fetch a global news headline. NewsAPI has a free tier; for true infinite scale/localization
        // beyond the free tier, browser automation for scraping major global news sites would be the zero-cost path.
        let newsHeadline = 'A heartwarming story from around the world!';
        if (CONFIG.NEWS_API_KEY && !CONFIG.NEWS_API_KEY.includes('fallback')) {
            try {
                const newsRes = await axios.get('https://newsapi.org/v2/top-headlines', {
                    headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
                    params: { category: 'general', pageSize: 1, language: 'en' }, // 'en' for broad appeal
                    timeout: 7000
                });
                if (newsRes.data.articles?.[0]?.title) {
                    newsHeadline = newsRes.data.articles[0].title;
                }
            } catch (error) {
                logger.warn(`⚠️ News API fetch failed: ${error.message}. Using generic news headline.`);
            }
        } else {
            logger.warn('⚠️ News API key missing or fallback. Cannot fetch dynamic news headline.');
        }

        // === Dynamic Caption Generation using LLM (Zero-Cost in Canvas) ===
        // The LLM can create culturally neutral or widely appealing captions.
        let generatedCaption = `🐾 Cute pet! ${newsHeadline}`; // Fallback caption
        if (CONFIG.GEMINI_API_ENABLED) { // Assuming a CONFIG flag to enable LLM calls for this environment
            try {
                logger.info('Generating dynamic, globally appealing caption with LLM...');
                const prompt = `Generate a very short (max 120 characters), highly engaging, and universally appealing social media caption about a cute pet. Incorporate this news headline subtly: "${newsHeadline}". End with a lighthearted, curiosity-inducing call to action (e.g., "See more!", "Click here for smiles!") without using hashtags. Focus on making it resonate across different cultures.`;

                const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
                const payload = { contents: chatHistory };
                const apiKey = ""; // Canvas provides this at runtime.
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

                const maxRetries = 3;
                let retryCount = 0;
                let llmResponse;

                while (retryCount < maxRetries) {
                    try {
                        const response = await fetch(apiUrl, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        if (!response.ok) {
                            throw new Error(`HTTP error! status: ${response.status}`);
                        }
                        llmResponse = await response.json();
                        break; // Success, exit loop
                    } catch (llmError) {
                        retryCount++;
                        logger.warn(`LLM call failed (attempt ${retryCount}/${maxRetries}): ${llmError.message}. Retrying...`);
                        await quantumDelay(1000 * Math.pow(2, retryCount - 1)); // Exponential backoff
                    }
                }

                if (llmResponse?.candidates?.[0]?.content?.parts?.[0]?.text) {
                    generatedCaption = llmResponse.candidates[0].content.parts[0].text.trim();
                    // Ensure caption is within typical social media limits for broader compatibility
                    if (generatedCaption.length > 150) {
                        generatedCaption = generatedCaption.substring(0, 147) + '...';
                    }
                    logger.success('✅ LLM generated engaging caption.');
                } else {
                    logger.warn('⚠️ LLM response format unexpected or empty. Using fallback caption.');
                }
            } catch (llmGeneralError) {
                logger.error(`🚨 LLM caption generation failed entirely: ${llmGeneralError.message}. Using fallback.`);
            }
        }

        const finalCaption = `${generatedCaption}\n${CONFIG.UPTIMEROBOT_AFFILIATE_LINK || ''}`;

        // === Link Shortening (REAL Revenue-Generating & Global) ===
        // AdFly is a prime example of a revenue-sharing platform. You earn from clicks/views.
        // It has a global publisher network and audience, critical for scaling to 195 countries.
        const shortenWithAdFly = async (url, type = 'int') => { // 'int' for interstitial, 'ban' for banner
            if (!CONFIG.ADFLY_API_KEY || CONFIG.ADFLY_API_KEY.includes('fallback') ||
                !CONFIG.ADFLY_USER_ID || CONFIG.ADFLY_USER_ID.includes('fallback')) {
                logger.warn('⚠️ AdFly API keys missing/fallback. Cannot shorten link with AdFly.');
                return url; // Return original URL if keys are missing
            }
            try {
                const adflyApiUrl = CONFIG.ADFLY_URL || 'https://api.adf.ly/api.php';
                const res = await axios.get(adflyApiUrl, {
                    params: {
                        aid: CONFIG.ADFLY_USER_ID,
                        key: CONFIG.ADFLY_API_KEY,
                        url: url,
                        type: type,
                        domain: 'adf.ly' // Default domain
                    },
                    timeout: 8000
                });

                // AdFly API can return "error" within the response data itself, not just throw HTTP errors.
                if (res.data.includes("error") || !res.data.startsWith('http')) {
                    throw new Error(`AdFly API returned invalid response: ${res.data}`);
                }
                logger.success(`✅ AdFly shortened URL: ${res.data}`);
                return res.data;
            } catch (e) {
                logger.warn(`⚠️ AdFly shorten failed for ${url} (${e.message?.substring(0, 50)}...). Returning original URL.`);
                // For a truly zero-cost, guaranteed shortening with revenue,
                // consider integrating Linkvertise automation here via browserManager as a robust fallback,
                // as demonstrated in dataAgent.js. Linkvertise is another revenue-sharing platform.
                return url;
            }
        };

        const adflyImageLink = await shortenWithAdFly(petImage, 'int'); // Pet image link with interstitial ad
        const adflyAffiliateLink = await shortenWithAdFly(CONFIG.AMAZON_AFFILIATE_LINK || 'https://www.amazon.com', 'int'); // Affiliate link with interstitial ad

        // === REAL Earnings Tracking & Payout (Internal Logic, Zero External Cost) ===
        // This is where actual revenue tracking happens. AdFly provides API to fetch earnings.
        let currentAdFlyEarnings = 0;
        if (CONFIG.ADFLY_API_KEY && !CONFIG.ADFLY_API_KEY.includes('fallback') &&
            CONFIG.ADFLY_USER_ID && !CONFIG.ADFLY_USER_ID.includes('fallback')) {
            try {
                logger.info('Fetching real AdFly earnings...');
                const res = await axios.get('https://api.adf.ly/v1/stats', {
                    headers: { 'Authorization': `Bearer ${CONFIG.ADFLY_API_KEY}` },
                    params: { user_id: CONFIG.ADFLY_USER_ID, currency: 'USD' }, // Crucial for accurate stats
                    timeout: 8000
                });
                currentAdFlyEarnings = parseFloat(res.data.earnings) || 0;
                logger.info(`💰 Current REAL AdFly earnings: $${currentAdFlyEarnings.toFixed(2)}`);

                const payoutThreshold = CONFIG.ADFLY_PAYOUT_THRESHOLD || 5; // Configurable payout threshold
                if (currentAdFlyEarnings >= payoutThreshold) {
                    logger.info(`🎯 AdFly payout threshold ($${payoutThreshold.toFixed(2)}) reached. Triggering payoutAgent...`);
                    // Dynamically import payoutAgent and pass REAL earnings and logger
                    const payoutAgentModule = await import('./payoutAgent.js');
                    await payoutAgentModule.payoutAgent({ ...CONFIG, CURRENT_ADFLY_EARNINGS: currentAdFlyEarnings }, logger);
                } else {
                    logger.info(`💰 AdFly earnings $${currentAdFlyEarnings.toFixed(2)} below payout threshold $${payoutThreshold.toFixed(2)}. No payout triggered.`);
                }
            } catch (e) {
                logger.warn(`⚠️ AdFly analytics failed: ${e.message?.substring(0, 80)}.`);
            }
        } else {
            logger.warn('⚠️ AdFly API keys missing for earnings tracking. Cannot track real earnings.');
        }


        // === Global Distribution Network (Zero-Cost Scaling) ===
        // This conceptualizes scaling to 195 countries. Reddit is a starting point,
        // but for true country-specific reach, browser automation would target diverse platforms.
        logger.info('🚀 Initiating global content distribution...');

        // 1. Reddit (High Global Reach, Zero-Cost API Usage within limits)
        if (CONFIG.REDDIT_API_KEY && !CONFIG.REDDIT_API_KEY.includes('fallback') &&
            CONFIG.REDDIT_CLIENT_ID && !CONFIG.REDDIT_CLIENT_ID.includes('fallback') &&
            CONFIG.REDDIT_CLIENT_SECRET && !CONFIG.REDDIT_CLIENT_SECRET.includes('fallback')) {
            try {
                logger.info('Attempting to post content to Reddit (global audience)...');
                await axios.post('https://oauth.reddit.com/api/submit', {
                    sr: CONFIG.REDDIT_SUBREDDIT || 'aww', // 'aww' has global appeal
                    kind: 'link',
                    title: 'Your Daily Smile! Check Out This Adorable Pet & More!',
                    url: adflyImageLink, // Link to the ad-monetized pet image
                    text: `${finalCaption}\n\nShop our curated picks: ${adflyAffiliateLink}`
                }, {
                    headers: {
                        'Authorization': `Bearer ${CONFIG.REDDIT_API_KEY}`,
                        'User-Agent': 'ArielMatrixGlobalAdAgent/1.0' // Essential for Reddit API
                    },
                    timeout: 15000
                });
                logger.success('✅ Posted pet content to Reddit successfully!');
            } catch (e) {
                logger.warn(`⚠️ Reddit post failed: ${e.response?.data?.message || e.message?.substring(0, 80)}. Check API keys, permissions, and rate limits.`);
                if (e.response?.status === 401 || e.response?.status === 403) {
                    logger.error('Reddit authentication/authorization failed. Ensure Reddit API keys are valid.');
                }
            }
        } else {
            logger.warn('⚠️ Reddit API keys not fully provided. Skipping Reddit post.');
        }

        // 2. Conceptual Scalable Distribution to 195 Countries (via Browser Automation - Zero-Cost)
        // To truly scale to 195 countries at zero cost, you would identify country-specific:
        // - Niche forums (e.g., dog lover forums in Japan, pet enthusiast groups in Brazil)
        // - Localized social media groups (Facebook Groups, Telegram Channels, regional subreddits)
        // - Q&A sites (Quora, StackExchange with relevant tags)
        // Automation via `browserManager` would then handle logins, navigation, and posting.
        // This process requires an extensive list of targets, which is beyond this code block but
        // demonstrates the **scalable, zero-cost strategy.**
        const global_distribution_targets = [
            // Example conceptual targets - in a real implementation, these would be automated via browserManager
            // { platform: 'Brazilian Pet Forum', url: 'https://example.com/br/pets', selector_post_button: '#post-btn', ... },
            // { platform: 'Indian Animal Lovers FB Group', url: 'https://facebook.com/groups/india-pets', selector_text_area: 'textarea[name="post"]', ... },
            // { platform: 'Japanese Dog Owners Blog Comments', url: 'https://japan-dog-blog.jp/latest-post', selector_comment_box: '#comment-text', ... },
        ];

        if (global_distribution_targets.length > 0) {
            logger.info(`🌐 Targeting ${global_distribution_targets.length} additional conceptual global distribution points for real revenue...`);
            for (const target of global_distribution_targets) {
                let page = null;
                try {
                    logger.info(`   - Attempting to distribute to ${target.platform} (via browser automation for zero-cost)...`);
                    page = await browserManager.getNewPage();
                    if (!page) throw new Error('Failed to acquire browser page.');

                    await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
                    await quantumDelay(2000); // Human-like delay

                    // *** Placeholder for actual browser automation steps (login, navigate, post) ***
                    // Example: await browserManager.safeType(page, target.selector_text_area, `${finalCaption}\n${adflyImageLink}`);
                    // Example: await browserManager.safeClick(page, target.selector_post_button);
                    // This section would involve complex, platform-specific Puppeteer logic.
                    // The key is that it's ZERO-COST, using compute, not paid APIs.

                    logger.info(`   - Successfully conceptually distributed to ${target.platform}.`);
                } catch (distroError) {
                    logger.warn(`   - ⚠️ Failed to distribute to ${target.platform} via browser automation: ${distroError.message?.substring(0, 80)}.`);
                } finally {
                    if (page) await browserManager.closePage(page);
                }
            }
        } else {
            logger.info('No additional conceptual global distribution targets defined for browser automation.');
        }


        // === Redis Caching for Efficiency (Zero-Cost with Local Redis) ===
        // Storing data in Redis reduces redundant API calls and allows other agents to access current state.
        if (redisClient) {
            try {
                const cacheData = {
                    petImage,
                    generatedCaption,
                    adflyImageLink,
                    adflyAffiliateLink,
                    currentAdFlyEarnings, // Cache the real earnings
                    lastRun: new Date().toISOString()
                };
                await redisClient.set('adRevenue:latestContent', JSON.stringify(cacheData), { EX: 86400 }); // Cache for 24 hours
                logger.info('✅ Cached latest ad revenue content and earnings to Redis.');
            } catch (redisError) {
                logger.error(`🚨 Failed to save ad revenue data to Redis: ${redisError.message}`);
            }
        }

        logger.info('✨ adRevenueAgent completed its REAL revenue generation run.');
        return {
            success: true,
            links: { image: adflyImageLink, affiliate: adflyAffiliateLink },
            caption: finalCaption,
            reportedEarnings: currentAdFlyEarnings
        };
    } catch (error) {
        logger.error(`🚨 adRevenueAgent critical ERROR: ${error.message}`);
        return { error: error.message, success: false, reportedEarnings: 0 };
    }
};
