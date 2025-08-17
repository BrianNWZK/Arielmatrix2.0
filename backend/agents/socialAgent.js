// backend/agents/socialAgent.js
import axios from 'axios';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { TwitterApi } from 'twitter-api-v2';

// Import functions directly from browserManager, assuming it's been initialized by server.js
import { getNewPage, closePage, safeType as browserSafeType, safeClick as browserSafeClick } from './browserManager.js';

// Fix for __dirname in ES6 modules
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

// --- Quantum Jitter (Anti-Detection) ---
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = Math.floor(Math.random() * 3000) + 1000; // Vary delay to avoid bot detection
    setTimeout(resolve, ms + jitter);
});

// --- High-Value Regions for Content Targeting ---
const HIGH_VALUE_REGIONS = {
    'Europe': ['MC', 'CH', 'LU', 'GB', 'DE', 'FR'],
    'Middle East': ['AE', 'SA', 'QA', 'KW'],
    'North America': ['US', 'CA'],
    'Asia Pacific': ['SG', 'HK', 'JP', 'AU', 'NZ']
};

const WOMEN_TOP_SPENDING_CATEGORIES = [
    'Luxury Goods', 'High-End Fashion', 'Beauty & Skincare', 'Health & Wellness',
    'Travel & Experiences', 'Fine Jewelry', 'Exclusive Events', 'Smart Home Tech',
    'Designer Pets & Accessories'
];


/**
 * @namespace SocialAgent
 * @description Manages autonomous social media posting, content generation, and credential remediation.
 */
const socialAgent = {
    // Internal references for config and logger, set during the run method
    _config: null,
    _logger: null,

    /**
     * Main run method for the Social Agent.
     * Orchestrates content generation, link shortening, and social media posting.
     * It also attempts to remediate missing social platform credentials.
     * @param {object} config - The global configuration object.
     * @param {object} logger - The global logger instance.
     * @returns {Promise<object>} Status and details of the social posting.
     */
    async run(config, logger) {
        this._config = config; // Set internal config reference
        this._logger = logger; // Set internal logger reference
        this._logger.info('🚀 Social Agent Activated: Initiating posting cycle and credential remediation...');
        const startTime = process.hrtime.bigint();

        try {
            // --- Phase 1: Autonomous Credential Remediation ---
            // The agent attempts to get its own credentials if they are missing or placeholders.
            const socialCredentialsToRemediate = [
                'PINTEREST_EMAIL', 'X_USERNAME', 'REDDIT_USER'
            ];
            const linkShortenerKeysToRemediate = [
                'ADFLY_API_KEY', 'SHORTIO_API_KEY', 'NOWPAYMENTS_API_KEY'
            ];
            const contentApiKeysToRemediate = [
                'DOG_API_KEY', 'NEWS_API_KEY'
            ];


            const newlyRemediatedKeys = {};

            // Remediate social media logins/creds
            for (const keyName of socialCredentialsToRemediate) {
                 if (!this._config[keyName] || String(this._config[keyName]).includes('PLACEHOLDER')) {
                    this._logger.warn(`⚙️ Attempting to remediate missing/placeholder credential: ${keyName}`);
                    const remediated = await this._remediateMissingSocialConfig(keyName);
                    if (remediated) {
                        Object.assign(newlyRemediatedKeys, remediated);
                        Object.assign(this._config, remediated); // Update internal config for immediate use
                    }
                }
            }

            // Remediate link shortener/payment gateway API keys
            for (const keyName of linkShortenerKeysToRemediate) {
                if (!this._config[keyName] || String(this._config[keyName]).includes('PLACEHOLDER')) {
                    this._logger.warn(`⚙️ Attempting to remediate missing/placeholder API key: ${keyName}`);
                    const remediated = await this._remediateAPIKeyFromWeb(keyName);
                    if (remediated) {
                        Object.assign(newlyRemediatedKeys, remediated);
                        Object.assign(this._config, remediated); // Update internal config for immediate use
                    }
                }
            }

            // Remediate content API keys (less direct 'generation', more acquisition via web)
            for (const keyName of contentApiKeysToRemediate) {
                if (!this._config[keyName] || String(this._config[keyName]).includes('PLACEHOLDER')) {
                    this._logger.warn(`⚙️ Attempting to acquire missing/placeholder content API key: ${keyName}`);
                    const remediated = await this._remediateAPIKeyFromWeb(keyName); // Use generic web remediation
                    if (remediated) {
                        Object.assign(newlyRemediatedKeys, remediated);
                        Object.assign(this._config, remediated);
                    }
                }
            }

            if (Object.keys(newlyRemediatedKeys).length > 0) {
                this._logger.info(`🔑 Social Agent remediated ${Object.keys(newlyRemediatedKeys).length} credential(s)/key(s).`);
            } else {
                this._logger.info('No new credentials/keys remediated by Social Agent this cycle.');
            }

            // --- Phase 2: Content Generation & Distribution ---
            // Only proceed if essential X (Twitter) credentials are available for primary posting
            const hasXCredentials = this._config.X_API_KEY && !String(this._config.X_API_KEY).includes('PLACEHOLDER') &&
                                    this._config.X_API_SECRET && !String(this._config.X_API_SECRET).includes('PLACEHOLDER') &&
                                    this._config.X_ACCESS_TOKEN && !String(this._config.X_ACCESS_TOKEN).includes('PLACEHOLDER') &&
                                    this._config.X_ACCESS_SECRET && !String(this._config.X_ACCESS_SECRET).includes('PLACEHOLDER');

            if (!hasXCredentials) {
                this._logger.warn('⚠️ X (Twitter) API credentials are incomplete. Skipping social posting via X API.');
                this._logger.info('   Proceeding with other general activities if credentials were remediated.');
            }

            const productTitle = 'Luxury Pet Carrier'; // Example
            const productCategory = 'Designer Pet Accessories'; // Example
            const targetCountryCode = this._selectHighValueRegion();

            this._logger.info(`Targeting region: ${targetCountryCode} for content generation.`);
            const content = await this._generateWomenCentricContent(targetCountryCode, productTitle, productCategory);
            this._logger.info('Generated content title:', content.title);

            const affLinkBase = 'https://your-affiliate-marketplace.com/product/luxury-pet-carrier';
            const monitorLinkBase = 'https://your-analytics-dashboard.com/sales/pet-carrier';

            const shortenedAffLink = await this._shortenLink(affLinkBase);
            const shortenedMonitorLink = await this._shortenLink(monitorLinkBase);

            content.caption = content.caption
                .replace('{{AFF_LINK}}', shortenedAffLink)
                .replace('{{MONITOR_LINK}}', shortenedMonitorLink);

            this._logger.info('Attempting to post to X (Twitter) via API...');
            const xPostStatus = await this._postToX(content.caption, content.media);
            this._logger.info(`X Posting Status: ${xPostStatus.success ? 'Success' : 'Failed'} - ${xPostStatus.message}`);

            // Add more posting mechanisms here based on remediated credentials
            if (this._config.PINTEREST_EMAIL && !String(this._config.PINTEREST_EMAIL).includes('PLACEHOLDER')) {
                this._logger.info('Attempting to post to Pinterest via browser...');
                const pinterestPostStatus = await this._postToPinterest(content.media, content.caption, content.title, shortenedAffLink);
                this._logger.info(`Pinterest Posting Status: ${pinterestPostStatus.success ? 'Success' : 'Failed'} - ${pinterestPostStatus.message}`);
            }

            if (this._config.REDDIT_USER && !String(this._config.REDDIT_USER).includes('PLACEHOLDER')) {
                 this._logger.info('Attempting to post to Reddit via browser...');
                 const redditPostStatus = await this._postToReddit(content.title, content.caption, shortenedAffLink);
                 this._logger.info(`Reddit Posting Status: ${redditPostStatus.success ? 'Success' : 'Failed'} - ${redditPostStatus.message}`);
            }


            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            this._logger.success(`✅ Social Agent Cycle Completed in ${durationMs.toFixed(0)}ms.`);
            return { status: 'completed', durationMs, newlyRemediatedKeys };

        } catch (error) {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            this._logger.error(`🚨 Social Agent Critical Failure in ${durationMs.toFixed(0)}ms: ${error.message}`);
            // Re-throw the error so server.js can catch and handle global errors
            throw { message: error.message, duration: durationMs };
        }
    },

    /**
     * Selects a high-value region for targeting.
     * @private
     * @returns {string} A country code (e.g., 'US', 'DE', 'AE').
     */
    _selectHighValueRegion() {
        const regions = Object.keys(HIGH_VALUE_REGIONS);
        const randomRegion = regions[Math.floor(Math.random() * regions.length)];
        const countriesInRegion = HIGH_VALUE_REGIONS[randomRegion];
        return countriesInRegion[Math.floor(Math.random() * countriesInRegion.length)];
    },

    /**
     * Generates compelling women-centric content for social media, including an image and caption.
     * Prioritizes real API keys, falls back to integrated LLM for zero-cost generation.
     * @param {string} countryCode - Target country for localization.
     * @param {string} productTitle - Title of the product being promoted.
     * @param {string} productCategory - Category of the product.
     * @returns {Promise<object>} Content object with title, caption, and media URL.
     */
    async _generateWomenCentricContent(countryCode, productTitle, productCategory) {
        const COUNTRY_NAMES = {
            MC: 'Monaco', CH: 'Switzerland', LU: 'Luxembourg', GB: 'the UK', DE: 'Germany', FR: 'France',
            AE: 'Dubai', SA: 'Saudi Arabia', QA: 'Qatar', KW: 'Kuwait',
            US: 'the USA', CA: 'Canada',
            SG: 'Singapore', HK: 'Hong Kong', JP: 'Japan', AU: 'Australia', NZ: 'New Zealand'
        };

        const TRENDING_HASHTAGS = {
            MC: ['#MonacoLuxury', '#BillionaireLifestyle', '#DesignerDogs', '#HauteCouturePets'],
            AE: ['#DubaiLuxury', '#GoldPets', '#VIPLiving', '#SheikhaStyle', '#EliteWellness'],
            US: ['#OrganicMoms', '#CleanBeauty', '#SustainableFashion', '#WellnessWarrior', '#LuxuryLifestyle'],
            SG: ['#AsiaLuxury', '#PetInfluencer', '#HighNetWorth', '#Mumpreneur', '#DigitalNomadLife']
        };

        const interest = productCategory || WOMEN_TOP_SPENDING_CATEGORIES[Math.floor(Math.random() * WOMEN_TOP_SPENDING_CATEGORIES.length)];
        const countryName = COUNTRY_NAMES[countryCode] || 'Global';
        const apiCallTimeout = 7000;

        let mediaUrl = null;
        let newsTitle = null;
        let captionText = '';

        // --- Attempt to use DOG_API_KEY for a real image ---
        if (this._config.DOG_API_KEY && !String(this._config.DOG_API_KEY).includes('PLACEHOLDER')) {
            try {
                this._logger.info('Attempting to fetch real dog image from TheDogAPI...');
                const dogRes = await axios.get('https://api.thedogapi.com/v1/images/search?limit=1', {
                    headers: { 'x-api-key': this._config.DOG_API_KEY },
                    timeout: apiCallTimeout
                });
                if (dogRes.data && dogRes.data[0] && dogRes.data[0].url) {
                    mediaUrl = dogRes.data[0].url;
                    this._logger.success('✅ Fetched real dog image.');
                }
            } catch (e) {
                this._logger.warn(`⚠️ TheDogAPI failed: ${e.message.substring(0, 100)}. Falling back to AI image.`);
            }
        }

        // --- Fallback to Imagen 3.0 for image generation (Zero-Cost) ---
        if (!mediaUrl) {
            try {
                this._logger.info('🎨 Requesting AI image generation (Imagen 3.0) as fallback...');
                const imagePrompt = `High-quality image of a luxurious ${productTitle || interest}, suitable for a social media post targeting high-net-worth women. Studio lighting, elegant, detailed, professional product photography.`;
                const payload = { instances: { prompt: imagePrompt }, parameters: { "sampleCount": 1 } };
                const apiKey = ""; // Canvas runtime will inject
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
                    mediaUrl = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
                    this._logger.success('✅ AI Image generated successfully using Imagen 3.0.');
                } else {
                    throw new Error('Invalid Imagen 3.0 response');
                }
            } catch (error) {
                this._logger.warn(`⚠️ AI Image Generation failed: ${error.message} → using generic fallback placeholder.`);
                mediaUrl = 'https://placehold.co/1024x1024/E0E0E0/333333?text=AI+Generated+Content';
            }
        }

        // --- Attempt to use NEWS_API_KEY for a real news title ---
        if (this._config.NEWS_API_KEY && !String(this._config.NEWS_API_KEY).includes('PLACEHOLDER')) {
            try {
                this._logger.info('Attempting to fetch real news title from NewsAPI...');
                const newsRes = await axios.get('https://newsapi.org/v2/top-headlines', {
                    params: { country: countryCode.toLowerCase(), category: 'health', pageSize: 1 },
                    headers: { 'Authorization': `Bearer ${this._config.NEWS_API_KEY}` },
                    timeout: apiCallTimeout
                });
                if (newsRes.data && newsRes.data.articles && newsRes.data.articles[0] && newsRes.data.articles[0].title) {
                    newsTitle = newsRes.data.articles[0].title;
                    this._logger.success('✅ Fetched real news title.');
                }
            } catch (e) {
                this._logger.warn(`⚠️ NewsAPI failed: ${e.message.substring(0, 100)}. Falling back to AI generated title.`);
            }
        }

        // --- Fallback to LLM for news title generation ---
        if (!newsTitle) {
            try {
                this._logger.info('Generating news title using LLM as fallback...');
                const llmPrompt = `Generate a compelling, short news headline (under 15 words) about "${interest}" trends in "${countryName}", targeting high-net-worth women. Make it sound like it's from a luxury lifestyle magazine.`;
                const payload = { contents: [{ role: "user", parts: [{ text: llmPrompt }] }] };
                const apiKey = ""; // Canvas runtime will inject
                const llmApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

                const response = await fetch(llmApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
                    newsTitle = result.candidates[0].content.parts[0].text.replace(/^["']|["']$/g, '');
                    this._logger.success('✅ AI News title generated successfully.');
                } else {
                    throw new Error('Invalid LLM response for news title');
                }
            } catch (error) {
                this._logger.warn(`⚠️ LLM News title generation failed: ${error.message} → using generic title.`);
                newsTitle = `Why Elite Women Are Investing in ${interest}`;
            }
        }

        captionText = `Attention, ladies! 👑\n\n` +
                      `${newsTitle}\n\n` +
                      `✨ The market for ${productTitle || interest} is booming in ${countryName}.\n\n` +
                      `🛍️ Shop now: {{AFF_LINK}}\n` +
                      `📈 Track sales: {{MONITOR_LINK}}\n\n` +
                      `${(TRENDING_HASHTAGS[countryCode] || ['#Luxury', '#WomenEmpowerment', '#ArielMatrixGlobal']).join(' ')}\n` +
                      `#AutonomousRevenueEngine`;

        return {
            title: `✨ ${productTitle || interest} Trends in ${countryName} (${new Date().getFullYear()})`,
            caption: captionText,
            media: mediaUrl
        };
    },

    /**
     * Shortens a given URL using multiple services, prioritizing Short.io, then AdFly, Linkvertise, NowPayments.
     * Checks for API key validity before attempting.
     * @param {string} url - The URL to shorten.
     * @returns {Promise<string>} The shortened URL or the original URL if all fail.
     */
    async _shortenLink(url) {
        const apiCallTimeout = 8000;

        // --- PRIMARY: Short.io API ---
        if (this._config.SHORTIO_API_KEY && !String(this._config.SHORTIO_API_KEY).includes('PLACEHOLDER') &&
            this._config.SHORTIO_URL && !String(this._config.SHORTIO_URL).includes('PLACEHOLDER')) {
            try {
                this._logger.info('Attempting Short.io shortening via API...');
                // Short.io uses 'domain' (e.g., 'yourshort.link')
                const response = await axios.post(
                    'https://api.short.io/links',
                    {
                        originalURL: url,
                        domain: new URL(this._config.SHORTIO_URL).hostname // Extract domain from provided URL
                    },
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': this._config.SHORTIO_API_KEY,
                        },
                        timeout: apiCallTimeout
                    }
                );
                if (response.data?.shortURL) {
                    this._logger.success(`✅ Short.io success: ${response.data.shortURL}`);
                    return response.data.shortURL;
                }
                throw new Error('Short.io returned no shortURL');
            } catch (error) {
                this._logger.warn(`⚠️ Short.io failed: ${error.message.substring(0, 100)}. Falling back.`);
            }
        } else {
            this._logger.warn('⚠️ Short.io skipped: API Key or URL missing/placeholder. Falling back.');
        }

        // --- SECONDARY: AdFly API ---
        // AdFly API documentation states using GET requests with params
        if (this._config.ADFLY_API_KEY && !String(this._config.ADFLY_API_KEY).includes('PLACEHOLDER') &&
            this._config.ADFLY_USER_ID && !String(this._config.ADFLY_USER_ID).includes('PLACEHOLDER')) { // No password needed for API call, just for web login
            try {
                this._logger.info('Attempting AdFly shortening via API...');
                const adflyBaseUrl = 'https://api.adf.ly/api.php'; // Correct AdFly API base URL
                const response = await axios.get(adflyBaseUrl, {
                    params: {
                        url: url,
                        key: this._config.ADFLY_API_KEY,
                        uid: this._config.ADFLY_USER_ID,
                        advert_type: 'int', // Interstitial ad, common for monetization
                        domain: 'adf.ly' // Default domain if not specified
                    },
                    timeout: apiCallTimeout
                });
                // AdFly API returns plain text URL or error messages.
                if (typeof response.data === 'string' && response.data.startsWith('http')) {
                    this._logger.success(`✅ AdFly success: ${response.data}`);
                    return response.data;
                } else {
                    throw new Error(`AdFly API error: ${response.data}`);
                }
            } catch (error) {
                this._logger.warn(`⚠️ AdFly failed: ${error.message.substring(0, 100)}. Falling back.`);
            }
        } else {
            this._logger.warn('⚠️ AdFly skipped: API Key or User ID missing/placeholder. Falling back.');
        }

        // --- TERTIARY: Linkvertise (Browser Automation) ---
        if (this._config.LINKVERTISE_EMAIL && !String(this._config.LINKVERTISE_EMAIL).includes('PLACEHOLDER') &&
            this._config.LINKVERTISE_PASSWORD && !String(this._config.LINKVERTISE_PASSWORD).includes('PLACEHOLDER')) {
            let page = null;
            try {
                this._logger.info('Attempting Linkvertise shortening via browser automation...');
                page = await getNewPage();
                await page.goto('https://publisher.linkvertise.com/login', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);

                await browserSafeType(page, ['input[name="email"]', 'input[type="email"]'], this._config.LINKVERTISE_EMAIL);
                await browserSafeType(page, ['input[name="password"]', 'input[type="password"]'], this._config.LINKVERTISE_PASSWORD);
                await browserSafeClick(page, ['button[type="submit"]', 'button:contains("Login")']);
                await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null);
                await quantumDelay(5000);

                const isLoggedIn = await page.evaluate(() => document.querySelector('a[href*="/dashboard"]') !== null);
                if (!isLoggedIn) {
                    throw new Error('Linkvertise login failed. Check credentials.');
                }

                await page.goto('https://publisher.linkvertise.com/dashboard/links/create', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);

                await browserSafeType(page, ['input[name="target_url"]', 'input[placeholder="Enter your URL"]'], url);
                await browserSafeClick(page, ['button[type="submit"]', 'button:contains("Create Link")']);
                await page.waitForSelector('input.share-link-input', { timeout: 10000 }); // Wait for the input field containing the short link
                await quantumDelay(3000);

                const shortLink = await page.evaluate(() => {
                    const input = document.querySelector('input.share-link-input');
                    return input?.value || null;
                });

                if (shortLink) {
                    this._logger.success(`✅ Linkvertise success: ${shortLink}`);
                    return shortLink;
                }
                throw new Error('Linkvertise could not retrieve short link.');
            } catch (error) {
                this._logger.warn(`⚠️ Linkvertise failed: ${error.message.substring(0, 100)}. Falling back.`);
            } finally {
                if (page) await closePage(page);
            }
        } else {
            this._logger.warn('⚠️ Linkvertise skipped: Credentials missing/placeholder. Falling back.');
        }

        // --- QUATERNARY: NowPayments ---
        if (this._config.NOWPAYMENTS_API_KEY && !String(this._config.NOWPAYMENTS_API_KEY).includes('PLACEHOLDER')) {
            try {
                this._logger.info('Attempting NowPayments invoice URL generation...');
                const npRes = await axios.post('https://api.nowpayments.io/v1/invoice', {
                    price_amount: 0.01, // Small conceptual price for demonstration
                    price_currency: 'usd',
                    pay_currency: 'usdt', // Assuming USDT for payment
                    order_description: `Access Pass: ${url}`,
                    ipn_callback_url: this._config.NOWPAYMENTS_CALLBACK_URL || 'https://your-actual-secure-callback-url.com/nowpayments-webhook' // Critical for real payments
                }, {
                    headers: { 'x-api-key': this._config.NOWPAYMENTS_API_KEY },
                    timeout: apiCallTimeout
                });
                if (npRes.data?.invoice_url) {
                    this._logger.success(`✅ NowPayments success: ${npRes.data.invoice_url}`);
                    return npRes.data.invoice_url;
                }
                throw new Error('NowPayments returned no invoice_url');
            } catch (error) {
                this._logger.warn(`⚠️ NowPayments failed: ${error.message.substring(0, 100)}. Falling back to direct URL.`);
            }
        } else {
            this._logger.warn('⚠️ NowPayments skipped: API Key missing/placeholder. Falling back to direct URL.');
        }

        this._logger.warn(`🚨 All shortening/monetization services failed. Using direct URL: ${url}`);
        return url;
    },

    /**
     * Proactively scouts for, generates, or creates a missing/placeholder social media credential or API key.
     * This function uses browser automation to perform actual logins and attempts to scrape API keys.
     * @param {string} keyName - The name of the missing configuration key (e.g., 'PINTEREST_EMAIL', 'ADFLY_API_KEY').
     * @returns {Promise<object|null>} An object containing the remediated key(s) if successful, null otherwise.
     */
    async _remediateMissingSocialConfig(keyName) {
        this._logger.info(`\n⚙️ Initiating remediation for missing/placeholder key: ${keyName}`);

        const AI_EMAIL = this._config.AI_EMAIL;
        const AI_PASSWORD = this._config.AI_PASSWORD;

        if (!AI_EMAIL || String(AI_EMAIL).includes('PLACEHOLDER') || !AI_PASSWORD || String(AI_PASSWORD).includes('PLACEHOLDER')) {
            this._logger.error(`❌ Cannot remediate ${keyName}: AI identity (AI_EMAIL/AI_PASSWORD) is missing or a placeholder. This is a critical prerequisite for web-based key acquisition.`);
            return null;
        }

        let newFoundCredential = null;
        let targetSite = null;
        let page = null;

        try {
            page = await getNewPage();
            page.setDefaultTimeout(60000); // Increased timeout for remediation steps

            switch (keyName) {
                case 'PINTEREST_EMAIL':
                case 'PINTEREST_PASS':
                    targetSite = 'https://pinterest.com/login';
                    this._logger.info(`Attempting to remediate Pinterest credentials at ${targetSite}`);
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded' });
                    await quantumDelay(2000);

                    // Try login first
                    let loggedIn = await this._attemptLogin(page, targetSite, AI_EMAIL, AI_PASSWORD, ['input[name="id"]', 'input[placeholder="Email or username"]'], ['input[name="password"]', 'input[placeholder="Password"]'], ['button[type="submit"]', 'button[data-test-id="login-button"]']);

                    if (loggedIn) {
                        this._logger.success('✅ Pinterest login successful during remediation. Credentials confirmed.');
                        newFoundCredential = { PINTEREST_EMAIL: AI_EMAIL, PINTEREST_PASS: AI_PASSWORD };
                    } else {
                        this._logger.warn('⚠️ Pinterest login failed. Attempting signup if available...');
                        // Attempt signup flow if login fails and signup link is present
                        const signupLink = await page.$('a[href*="/signup"]');
                        if (signupLink) {
                            await signupLink.click();
                            await page.waitForNavigation({ waitUntil: 'domcontentloaded' });
                            await quantumDelay(2000);
                            // Fill signup form
                            await browserSafeType(page, ['input[name="email"]', 'input[type="email"]'], AI_EMAIL);
                            await browserSafeType(page, ['input[name="password"]', 'input[type="password"]'], AI_PASSWORD);
                            await browserSafeType(page, ['input[name="age"]', 'input[placeholder="Age"]'], '25'); // Provide a valid age
                            await browserSafeClick(page, ['button[type="submit"]', 'button:contains("Continue")']);
                            await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
                            await quantumDelay(5000);
                            if (await page.$('a[href*="/pin-builder"]')) { // Check for dashboard element
                                this._logger.success('✅ Pinterest signup successful during remediation. Credentials generated/confirmed.');
                                newFoundCredential = { PINTEREST_EMAIL: AI_EMAIL, PINTEREST_PASS: AI_PASSWORD };
                            } else {
                                this._logger.warn('⚠️ Pinterest signup also failed or requires further manual steps.');
                            }
                        } else {
                            this._logger.warn('No clear signup link found on Pinterest login page.');
                        }
                    }
                    break;

                case 'X_USERNAME':
                case 'X_PASSWORD':
                case 'X_API_KEY':
                    targetSite = 'https://twitter.com/login';
                    this._logger.info(`Attempting to remediate X (Twitter) credentials/API Key at ${targetSite}`);
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded' });
                    await quantumDelay(2000);

                    let xLoggedIn = await this._attemptLogin(page, targetSite, AI_EMAIL, AI_PASSWORD, ['input[name="text"]', 'input[autocomplete="username"]'], ['input[name="password"]', 'input[type="password"]'], ['button:contains("Next")', 'button[data-testid="LoginForm_Login_Button"]', 'button[type="submit"]']);

                    if (xLoggedIn) {
                        this._logger.success('✅ X (Twitter) login successful during remediation. Credentials confirmed.');
                        newFoundCredential = { X_USERNAME: AI_EMAIL, X_PASSWORD: AI_PASSWORD };

                        // Attempt to find X_API_KEY from developer portal
                        this._logger.info('Navigating to X Developer Portal to find API keys...');
                        await page.goto('https://developer.twitter.com/en/portal/projects', { waitUntil: 'domcontentloaded' }).catch(() => null);
                        await quantumDelay(3000);
                        const apiKeyData = await this._extractAPIKeyFromPage(page, 'X_API_KEY'); // Use general extractor for Twitter
                        if (apiKeyData && apiKeyData.X_API_KEY) {
                            Object.assign(newFoundCredential, apiKeyData);
                            this._logger.info('🔑 Found X_API_KEY and related keys during remediation!');
                        } else {
                            this._logger.warn('⚠️ Could not find X_API_KEY on developer dashboard during remediation. Manual creation/retrieval needed.');
                        }
                    } else {
                        this._logger.warn('⚠️ X (Twitter) login failed during remediation. Consider manual intervention or new AI account creation.');
                    }
                    break;

                case 'REDDIT_USER':
                case 'REDDIT_PASS':
                    targetSite = 'https://www.reddit.com/login/';
                    this._logger.info(`Attempting to remediate Reddit credentials at ${targetSite}`);
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded' });
                    await quantumDelay(2000);

                    let redditLoggedIn = await this._attemptLogin(page, targetSite, AI_EMAIL, AI_PASSWORD, ['input[name="username"]', '#loginUsername'], ['input[name="password"]', '#loginPassword'], ['button[type="submit"]', '.AnimatedForm__submitButton', 'button:contains("Log In")']);

                    if (redditLoggedIn) {
                        this._logger.success('✅ Reddit login successful during remediation. Credentials confirmed.');
                        newFoundCredential = { REDDIT_USER: AI_EMAIL, REDDIT_PASS: AI_PASSWORD };
                    } else {
                        this._logger.warn('⚠️ Reddit login failed during remediation. Consider manual intervention or new AI account creation.');
                    }
                    break;

                case 'ADFLY_API_KEY':
                    targetSite = 'https://adf.ly/publisher/login';
                    this._logger.info(`Attempting to acquire ADFLY_API_KEY at ${targetSite}`);
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded' });
                    await quantumDelay(2000);

                    if (await this._attemptLogin(page, targetSite, this._config.ADFLY_USERNAME, this._config.ADFLY_PASSWORD, ['input[name="email"]'], ['input[name="password"]'], ['button[type="submit"]'])) {
                        this._logger.info('Logged into AdFly. Navigating to tools/API...');
                        await page.goto('https://adf.ly/publisher/tools', { waitUntil: 'domcontentloaded' }).catch(() => null);
                        await quantumDelay(3000);
                        const apiKey = await this._extractAPIKeyFromPage(page, 'ADFLY_API_KEY');
                        if (apiKey && apiKey.ADFLY_API_KEY) {
                            newFoundCredential = apiKey;
                            this._logger.success('🔑 Successfully acquired ADFLY_API_KEY!');
                        } else {
                            this._logger.warn('⚠️ Could not find ADFLY_API_KEY on AdFly dashboard.');
                        }
                    } else {
                         this._logger.warn('AdFly login failed. Cannot acquire API key.');
                    }
                    break;

                case 'SHORTIO_API_KEY':
                    targetSite = 'https://app.short.io/login';
                    this._logger.info(`Attempting to acquire SHORTIO_API_KEY at ${targetSite}`);
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded' });
                    await quantumDelay(2000);

                    if (await this._attemptLogin(page, targetSite, this._config.SHORTIO_USER_ID || AI_EMAIL, this._config.SHORTIO_PASSWORD || AI_PASSWORD, ['input[name="email"]', 'input[type="email"]'], ['input[name="password"]', 'input[type="password"]'], ['button[type="submit"]'])) {
                        this._logger.info('Logged into Short.io. Navigating to API settings...');
                        await page.goto('https://app.short.io/settings/api-keys', { waitUntil: 'domcontentloaded' }).catch(() => null);
                        await quantumDelay(3000);
                        const apiKey = await this._extractAPIKeyFromPage(page, 'SHORTIO_API_KEY');
                        if (apiKey && apiKey.SHORTIO_API_KEY) {
                            newFoundCredential = apiKey;
                            this._logger.success('🔑 Successfully acquired SHORTIO_API_KEY!');
                        } else {
                            this._logger.warn('⚠️ Could not find SHORTIO_API_KEY on Short.io settings.');
                        }
                    } else {
                        this._logger.warn('Short.io login failed. Cannot acquire API key.');
                    }
                    break;

                case 'NOWPAYMENTS_API_KEY':
                    targetSite = 'https://nowpayments.io/auth/login';
                    this._logger.info(`Attempting to acquire NOWPAYMENTS_API_KEY at ${targetSite}`);
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded' });
                    await quantumDelay(2000);

                    if (await this._attemptLogin(page, targetSite, this._config.NOWPAYMENTS_EMAIL || AI_EMAIL, this._config.NOWPAYMENTS_PASSWORD || AI_PASSWORD, ['input[name="email"]', 'input[type="email"]'], ['input[name="password"]', 'input[type="password"]'], ['button[type="submit"]'])) {
                        this._logger.info('Logged into NowPayments. Navigating to API Keys section...');
                        await page.goto('https://nowpayments.io/dashboard/api-settings', { waitUntil: 'domcontentloaded' }).catch(() => null);
                        await quantumDelay(3000);
                        const apiKey = await this._extractAPIKeyFromPage(page, 'NOWPAYMENTS_API_KEY');
                        if (apiKey && apiKey.NOWPAYMENTS_API_KEY) {
                            newFoundCredential = apiKey;
                            this._logger.success('🔑 Successfully acquired NOWPAYMENTS_API_KEY!');
                        } else {
                            this._logger.warn('⚠️ Could not find NOWPAYMENTS_API_KEY on NowPayments settings.');
                        }
                    } else {
                        this._logger.warn('NowPayments login failed. Cannot acquire API key.');
                    }
                    break;

                case 'DOG_API_KEY':
                    targetSite = 'https://thedogapi.com/signup'; // Assume a direct signup page
                    this._logger.info(`Attempting to acquire DOG_API_KEY at ${targetSite}`);
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded' });
                    await quantumDelay(2000);
                    // This often involves email verification; for now, simulate signup
                    await browserSafeType(page, ['input[name="email"]', 'input[type="email"]'], AI_EMAIL);
                    await browserSafeType(page, ['input[name="password"]', 'input[type="password"]'], AI_PASSWORD);
                    await browserSafeClick(page, ['button[type="submit"]', 'button:contains("Sign Up")']);
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
                    await quantumDelay(5000);
                    // After signup, they might email the key or display it on a dashboard
                    const dogApiKey = await this._extractAPIKeyFromPage(page, 'DOG_API_KEY');
                    if (dogApiKey && dogApiKey.DOG_API_KEY) {
                        newFoundCredential = dogApiKey;
                        this._logger.success('🔑 Successfully acquired DOG_API_KEY!');
                    } else {
                         this._logger.warn('⚠️ Could not automatically acquire DOG_API_KEY after signup. Check email/dashboard manually.');
                    }
                    break;

                case 'NEWS_API_KEY':
                    targetSite = 'https://newsapi.org/register';
                    this._logger.info(`Attempting to acquire NEWS_API_KEY at ${targetSite}`);
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded' });
                    await quantumDelay(2000);
                    await browserSafeType(page, ['input[name="email"]', 'input[type="email"]'], AI_EMAIL);
                    await browserSafeType(page, ['input[name="password"]', 'input[type="password"]'], AI_PASSWORD);
                    await browserSafeType(page, ['input[name="firstName"]'], 'Ariel');
                    await browserSafeType(page, ['input[name="lastName"]'], 'Matrix');
                    await browserSafeType(page, ['input[name="jobTitle"]'], 'AI Developer');
                    await browserSafeType(page, ['input[name="companyName"]'], 'ArielMatrix Inc.');
                    await browserSafeClick(page, ['button[type="submit"]', 'button:contains("Register")']);
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded' }).catch(() => null);
                    await quantumDelay(5000);
                    const newsApiKey = await this._extractAPIKeyFromPage(page, 'NEWS_API_KEY');
                    if (newsApiKey && newsApiKey.NEWS_API_KEY) {
                        newFoundCredential = newsApiKey;
                        this._logger.success('🔑 Successfully acquired NEWS_API_KEY!');
                    } else {
                        this._logger.warn('⚠️ Could not automatically acquire NEWS_API_KEY after signup. Check email/dashboard manually.');
                    }
                    break;

                default:
                    this._logger.warn(`No specific remediation logic for ${keyName}. Manual action required.`);
                    break;
            }
        } catch (error) {
            this._logger.error(`🚨 Remediation for ${keyName} failed: ${error.message.substring(0, 200)}...`);
        } finally {
            if (page) await closePage(page);
        }
        return newFoundCredential;
    },

    /**
     * Attempts a login on a given page using provided credentials and selectors.
     * @param {import('puppeteer').Page} page - The Puppeteer page instance.
     * @param {string} loginUrl - The URL of the login page.
     * @param {string} username - The username/email to use.
     * @param {string} password - The password to use.
     * @param {string[]} usernameSelectors - Array of possible username input selectors.
     * @param {string[]} passwordSelectors - Array of possible password input selectors.
     * @param {string[]} submitSelectors - Array of possible submit button selectors.
     * @returns {Promise<boolean>} True if login is successful, false otherwise.
     */
    async _attemptLogin(page, loginUrl, username, password, usernameSelectors, passwordSelectors, submitSelectors) {
        this._logger.info(`Attempting login to ${loginUrl} with username ${username}...`);
        try {
            const initialUrl = page.url();
            let typedUser = await browserSafeType(page, usernameSelectors, username);
            if (!typedUser) return false;
            await quantumDelay(500);

            // Some sites (like X) require a "Next" button after username
            const nextButton = await page.$('button:contains("Next")');
            if (nextButton) {
                await nextButton.click();
                await quantumDelay(2000);
            }

            let typedPass = await browserSafeType(page, passwordSelectors, password);
            if (!typedPass) return false;
            await quantumDelay(500);

            let clickedSubmit = await browserSafeClick(page, submitSelectors);
            if (!clickedSubmit) return false;

            // Wait for navigation or common dashboard elements
            await Promise.race([
                page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 15000 }),
                page.waitForSelector('a[href*="/dashboard"], a[href*="/home"], div[role="main"]', { timeout: 15000 })
            ]).catch(() => this._logger.warn('Login navigation/selector wait timed out. Checking current URL.'));
            await quantumDelay(3000);

            const currentUrl = page.url();
            // Basic check if still on login page or redirected to dashboard
            const isStillOnLoginPage = currentUrl.includes('login') || currentUrl.includes('signin') || currentUrl.includes('auth');
            const isLoggedInElementPresent = await page.$('a[href*="/dashboard"], a[href*="/home"], div[role="main"]') !== null;

            if (!isStillOnLoginPage || isLoggedInElementPresent) {
                 this._logger.info(`Login attempt status: Current URL is ${currentUrl}. Is login element present: ${isLoggedInElementPresent}.`);
                 return !isStillOnLoginPage || isLoggedInElementPresent; // Successful if not on login page or dashboard element found
            }
            return false;

        } catch (error) {
            this._logger.warn(`Login attempt to ${loginUrl} failed: ${error.message.substring(0, 100)}...`);
            return false;
        }
    },

    /**
     * Extracts an API key from the current Puppeteer page content.
     * This is a generalized version, similar to apiScoutAgent's logic.
     * @param {import('puppeteer').Page} page - The Puppeteer page instance.
     * @param {string} keyIdentifier - A string to identify the key type (e.g., 'X_API_KEY', 'ADFLY_API_KEY').
     * @returns {Promise<object|null>} An object { [keyIdentifier]: extractedKey } or null.
     */
    async _extractAPIKeyFromPage(page, keyIdentifier) {
        this._logger.info(`Attempting to extract ${keyIdentifier} from current page.`);
        await quantumDelay(1000); // Give time for elements to render

        const pageContent = await page.content(); // Get the full HTML content

        // Common API key patterns
        const keyPatterns = {
            'X_API_KEY': /(?:(?:Bearer|Client)\s+)?([a-zA-Z0-9\-_.~+%/=]{40,})/, // General long token
            'ADFLY_API_KEY': /aff_id=[0-9]+&amp;key=([a-f0-9]{32})/, // AdFly specific pattern in source
            'SHORTIO_API_KEY': /secret_key[\s=:]['"]?([a-zA-Z0-9]{20,})['"]?/, // Generic secret_key pattern
            'NOWPAYMENTS_API_KEY': /x-api-key['"]?\s*:\s*['"]?([a-zA-Z0-9]{20,})['"]?/, // NOWPayments common header
            'DOG_API_KEY': /x-api-key['"]?\s*:\s*['"]?([a-zA-Z0-9]{20,})['"]?/,
            'NEWS_API_KEY': /(?:apiKey|api_key)[\s=:]['"]?([a-zA-Z0-9]{20,})['"]?/,
            // Add more specific patterns if known
            'GENERIC_API_KEY': /(\b[A-Za-z0-9-_]{30,}\b)/ // Last resort, generic alphanumeric
        };

        const patternsToTry = keyPatterns[keyIdentifier] ? [keyPatterns[keyIdentifier]] : Object.values(keyPatterns);

        // Try to find in specific input/textarea fields first
        const commonKeySelectors = [
            'input[type="text"][name*="api_key"]', 'input[type="text"][id*="api_key"]',
            'textarea[name*="api_key"]', 'textarea[id*="api_key"]',
            'input[type="password"][name*="key"]', 'input[type="password"][id*="key"]', // Sometimes hidden
            'span.api-key-value', 'div.api-key-display', 'code.api-key'
        ];

        for (const selector of commonKeySelectors) {
            try {
                const element = await page.$(selector);
                if (element) {
                    const value = await page.evaluate(el => el.value || el.innerText, element);
                    if (value && value.length > 20 && !value.includes('placeholder')) {
                        for (const pattern of patternsToTry) {
                            const match = value.match(pattern);
                            if (match && match[1]) {
                                this._logger.debug(`Found potential key in selector ${selector} via regex.`);
                                return { [keyIdentifier]: match[1] };
                            }
                        }
                    }
                }
            } catch (e) {
                // Ignore selector errors, just try next
            }
        }

        // Fallback to searching raw page content with regex
        this._logger.info('Scanning raw page content with regex for API key...');
        for (const pattern of patternsToTry) {
            const match = pageContent.match(pattern);
            if (match && match[1] && match[1].length > 20) {
                this._logger.debug(`Found potential key in page content via regex.`);
                return { [keyIdentifier]: match[1] };
            }
        }

        this._logger.warn(`Could not extract ${keyIdentifier} from page.`);
        return null;
    },

    /**
     * Posts content to X (Twitter) using the Twitter API v2.
     * @param {string} text - The tweet text.
     * @param {string} mediaUrl - URL of the media (image/video).
     * @returns {Promise<object>} Status of the post.
     */
    async _postToX(text, mediaUrl) {
        if (!this._config.X_API_KEY || !this._config.X_API_SECRET ||
            !this._config.X_ACCESS_TOKEN || !this._config.X_ACCESS_SECRET ||
            String(this._config.X_API_KEY).includes('PLACEHOLDER')) {
            return { success: false, message: 'X (Twitter) API credentials missing or incomplete.' };
        }

        try {
            this._logger.info('Initializing Twitter API client...');
            const client = new TwitterApi({
                appKey: this._config.X_API_KEY,
                appSecret: this._config.X_API_SECRET,
                accessToken: this._config.X_ACCESS_TOKEN,
                accessSecret: this._config.X_ACCESS_SECRET,
            });

            let mediaId = null;
            if (mediaUrl && mediaUrl.startsWith('data:image')) {
                // Upload base64 image if it's AI generated
                this._logger.info('Uploading AI-generated image to Twitter...');
                const imageBuffer = Buffer.from(mediaUrl.split(',')[1], 'base64');
                mediaId = await client.v1.uploadMedia(imageBuffer, { type: 'png' });
                this._logger.success(`Image uploaded to Twitter with ID: ${mediaId}`);
            } else if (mediaUrl) {
                 // For external URLs, Twitter API v1.1 upload endpoint requires downloading first.
                 // For simplicity, we'll skip direct URL upload and just post text if it's not base64.
                 this._logger.warn('Direct image URL upload to Twitter API v2 not natively supported. Skipping media for this post.');
            }

            this._logger.info('Posting tweet to X (Twitter)...');
            const tweetOptions = { text };
            if (mediaId) {
                tweetOptions.media = { media_ids: [mediaId] };
            }

            const { data: createdTweet } = await client.v2.tweet(tweetOptions);
            this._logger.success(`✅ Tweet posted successfully: https://twitter.com/i/web/status/${createdTweet.id}`);
            return { success: true, message: `Tweet posted: ${createdTweet.id}` };
        } catch (error) {
            this._logger.error(`🚨 Error posting to X (Twitter): ${error.message}`);
            return { success: false, message: `Failed to post to X: ${error.message}` };
        }
    },

    /**
     * Posts content to Pinterest via browser automation.
     * @param {string} imageUrl - URL of the image to pin.
     * @param {string} description - Pin description.
     * @param {string} title - Pin title.
     * @param {string} link - External link for the pin.
     * @returns {Promise<object>} Status of the pin.
     */
    async _postToPinterest(imageUrl, description, title, link) {
        if (!this._config.PINTEREST_EMAIL || !this._config.PINTEREST_PASS || String(this._config.PINTEREST_EMAIL).includes('PLACEHOLDER')) {
            return { success: false, message: 'Pinterest credentials missing or incomplete.' };
        }

        let page = null;
        try {
            page = await getNewPage();
            await page.goto('https://pinterest.com/login', { waitUntil: 'domcontentloaded' });
            await quantumDelay(2000);

            let loggedIn = await this._attemptLogin(page, 'https://pinterest.com/login', this._config.PINTEREST_EMAIL, this._config.PINTEREST_PASS, ['input[name="id"]'], ['input[name="password"]'], ['button[type="submit"]']);

            if (!loggedIn) {
                return { success: false, message: 'Failed to login to Pinterest.' };
            }
            this._logger.info('Logged into Pinterest. Attempting to create new Pin...');

            await page.goto('https://pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded' });
            await quantumDelay(3000);

            // Upload image
            const [fileChooser] = await Promise.all([
                page.waitForFileChooser(),
                page.click('div[data-test-id="pin-dropzone"]'), // Click the upload area
            ]);

            // Convert base64 image to buffer and write to temp file
            let tempImagePath = null;
            if (imageUrl.startsWith('data:image')) {
                 const base64Data = imageUrl.split(',')[1];
                 const buffer = Buffer.from(base64Data, 'base64');
                 tempImagePath = path.join(os.tmpdir(), `pinterest_image_${crypto.randomBytes(8).toString('hex')}.png`);
                 await fs.writeFile(tempImagePath, buffer);
                 this._logger.debug(`Saved temp image to ${tempImagePath}`);
            } else {
                 // For external URLs, you'd need to download the image first if Pinterest requires local file upload
                 this._logger.warn('Pinterest requires local file upload. External image URLs not directly supported in this automation.');
                 return { success: false, message: 'Pinterest pinning failed: external image URLs not directly supported.' };
            }

            await fileChooser.accept([tempImagePath]);
            await quantumDelay(5000); // Wait for image to upload

            // Fill title, description, link
            await browserSafeType(page, ['textarea[placeholder="Add your title"]'], title);
            await browserSafeType(page, ['textarea[placeholder="Tell everyone what your Pin is about"]'], description);

            await browserSafeClick(page, ['button[data-test-id="url-field-button"]']); // Click button to show URL field
            await quantumDelay(1000);
            await browserSafeType(page, ['input[placeholder="Add a destination link"]'], link);

            // Select a board (if necessary, or create one)
            // This is complex. For simplicity, we'll try to find a default board or skip if not critical.
            // await browserSafeClick(page, ['div[data-test-id="board-selector"]']);
            // await page.waitForSelector('div[role="dialog"]'); // Wait for board list to appear
            // await browserSafeClick(page, ['div[data-test-id="board-list-item"]:first-child']); // Click first board

            await browserSafeClick(page, ['button[data-test-id="pin-redesign-save-button"]', 'button:contains("Save")']); // Click Save button
            await quantumDelay(5000); // Wait for pin to save

            const successIndicator = await page.$('a[href*="/pin/"]'); // Check for a link to the new pin
            if (successIndicator) {
                this._logger.success('✅ Pin posted successfully to Pinterest.');
                return { success: true, message: 'Pin posted to Pinterest.' };
            } else {
                return { success: false, message: 'Failed to post Pin to Pinterest.' };
            }

        } catch (error) {
            this._logger.error(`🚨 Error posting to Pinterest: ${error.message}`);
            return { success: false, message: `Failed to post to Pinterest: ${error.message}` };
        } finally {
            if (page) await closePage(page);
            if (tempImagePath) {
                try {
                    await fs.unlink(tempImagePath); // Clean up temp file
                    this._logger.debug(`Cleaned up temp image file: ${tempImagePath}`);
                } catch (e) {
                    this._logger.warn(`Failed to delete temp file ${tempImagePath}: ${e.message}`);
                }
            }
        }
    },

    /**
     * Posts content to Reddit via browser automation.
     * @param {string} title - Post title.
     * @param {string} text - Post text.
     * @param {string} link - Optional link to include.
     * @returns {Promise<object>} Status of the post.
     */
    async _postToReddit(title, text, link) {
        if (!this._config.REDDIT_USER || !this._config.REDDIT_PASS || String(this._config.REDDIT_USER).includes('PLACEHOLDER')) {
            return { success: false, message: 'Reddit credentials missing or incomplete.' };
        }

        let page = null;
        try {
            page = await getNewPage();
            await page.goto('https://www.reddit.com/login/', { waitUntil: 'domcontentloaded' });
            await quantumDelay(2000);

            let loggedIn = await this._attemptLogin(page, 'https://www.reddit.com/login/', this._config.REDDIT_USER, this._config.REDDIT_PASS, ['input[name="username"]'], ['input[name="password"]'], ['button[type="submit"]']);

            if (!loggedIn) {
                return { success: false, message: 'Failed to login to Reddit.' };
            }
            this._logger.info('Logged into Reddit. Attempting to create new post...');

            await page.goto('https://www.reddit.com/submit/', { waitUntil: 'domcontentloaded' }); // Navigate to create post page
            await quantumDelay(3000);

            // Select 'Post' tab (default, but ensure)
            // await browserSafeClick(page, ['button[data-text-id="post-type-link"]', 'button[role="radio"][value="link"]']);
            // await quantumDelay(1000);

            // Fill title and text
            await browserSafeType(page, ['textarea[placeholder="Title"]'], title);
            await browserSafeType(page, ['div[data-text-id="richtext-editor"]', 'div[contenteditable="true"]'], text + '\n\n' + link);

            // Select a subreddit (important for Reddit)
            // This is complex for automation. For now, try to post to a default or popular one.
            // Or, more robustly, dynamically select based on content.
            // For simplicity, we'll try to input 'announcements' or a generic community, or rely on AI to choose.
            await browserSafeClick(page, ['input[placeholder="Choose a community"]']);
            await quantumDelay(1000);
            await browserSafeType(page, ['input[placeholder="Choose a community"]'], 'AskReddit'); // Example subreddit
            await quantumDelay(1500); // Wait for suggestions
            await page.keyboard.press('Enter'); // Select the first suggestion
            await quantumDelay(1000);

            await browserSafeClick(page, ['button[type="submit"][data-text-id="post-button"]', 'button:contains("Post")']);
            await quantumDelay(5000); // Wait for post to submit

            const successIndicator = await page.$('a[data-click-id="comments"]'); // Link to comments section after posting
            if (successIndicator) {
                this._logger.success('✅ Post submitted successfully to Reddit.');
                return { success: true, message: 'Post submitted to Reddit.' };
            } else {
                return { success: false, message: 'Failed to submit post to Reddit.' };
            }

        } catch (error) {
            this._logger.error(`🚨 Error posting to Reddit: ${error.message}`);
            return { success: false, message: `Failed to post to Reddit: ${error.message}` };
        } finally {
            if (page) await closePage(page);
        }
    }
};

export { socialAgent };
