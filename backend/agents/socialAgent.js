// backend/agents/socialAgent.js
import axios from 'axios';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import { TwitterApi } from 'twitter-api-v2';

// Import functions directly from browserManager, assuming it's been initialized by server.js
import { getNewPage, closePage } from './browserManager.js';

/**
 * @namespace SocialAgent
 * @description Manages autonomous social media posting, content generation, and credential remediation.
 */
const socialAgent = {
    // Internal references for config and logger, set during the run method
    _config: null,
    _logger: null,

    /**
     * Helper function for safe typing into input fields using Puppeteer.
     * @param {import('puppeteer').Page} page - The Puppeteer page instance.
     * @param {string[]} selectors - An array of CSS selectors to try.
     * @param {string} text - The text to type.
     */
    async safeType(page, selectors, text) {
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { timeout: 3000 });
                await page.type(selector, text);
                this._logger.debug(`Typed into selector: ${selector}`);
                return true;
            } catch (e) {
                // this._logger.debug(`Selector ${selector} not found or type failed: ${e.message.substring(0, 50)}...`);
            }
        }
        this._logger.warn(`⚠️ Failed to type into any of the provided selectors: ${selectors.join(', ')}`);
        return false;
    },

    /**
     * Helper function for safe clicking on elements using Puppeteer.
     * @param {import('puppeteer').Page} page - The Puppeteer page instance.
     * @param {string[]} selectors - An array of CSS selectors to try.
     */
    async safeClick(page, selectors) {
        for (const selector of selectors) {
            try {
                await page.waitForSelector(selector, { timeout: 3000 });
                await page.click(selector);
                this._logger.debug(`Clicked selector: ${selector}`);
                return true;
            } catch (e) {
                // this._logger.debug(`Selector ${selector} not found or click failed: ${e.message.substring(0, 50)}...`);
            }
        }
        this._logger.warn(`⚠️ Failed to click any of the provided selectors: ${selectors.join(', ')}`);
        return false;
    },

    /**
     * Main run method for the Social Agent.
     * Orchestrates content generation, link shortening, and social media posting.
     * @param {object} config - The global configuration object.
     * @param {object} logger - The global logger instance.
     * @returns {Promise<object>} Status and details of the social posting.
     */
    async run(config, logger) {
        this._config = config; // Set internal config reference
        this._logger = logger; // Set internal logger reference
        this._logger.info('🚀 Social Agent Activated: Initiating posting cycle...');
        const startTime = process.hrtime.bigint();

        try {
            // Remediation for critical social media keys if they are missing or placeholders
            const keysToRemediate = [
                'PINTEREST_EMAIL', 'PINTEREST_PASS',
                'X_USERNAME', 'X_PASSWORD', 'X_API_KEY',
                'REDDIT_USER', 'REDDIT_PASS',
                'DOG_API_KEY', 'NEWS_API_KEY', // Check content generation API keys
                'ADFLY_API_KEY', 'ADFLY_USER_ID', 'ADFLY_PASS',
                'SHORTIO_API_KEY', 'SHORTIO_URL', 'SHORTIO_USER_ID'
            ];

            const newlyRemediatedKeys = {};
            for (const keyName of keysToRemediate) {
                // Only attempt remediation if the key is missing or is a placeholder
                if (!this._config[keyName] || String(this._config[keyName]).includes('PLACEHOLDER')) {
                    this._logger.warn(`⚙️ Attempting to remediate missing/placeholder config: ${keyName}`);
                    const remediatedValue = await this._remediateMissingSocialConfig(keyName);
                    if (remediatedValue) {
                        // Merge remediated values into newlyRemediatedKeys
                        Object.assign(newlyRemediatedKeys, remediatedValue);
                        // Update internal config for immediate use
                        Object.assign(this._config, remediatedValue);
                    }
                }
            }

            // Return any newly remediated keys to server.js for persistence to Render ENV
            if (Object.keys(newlyRemediatedKeys).length > 0) {
                this._logger.info(`🔑 Social Agent remediated ${Object.keys(newlyRemediatedKeys).length} key(s).`);
            } else {
                this._logger.info('No new keys remediated by Social Agent this cycle.');
            }

            // Proceed with content generation and posting only if essential credentials are met
            if (!this._config.X_API_KEY || String(this._config.X_API_KEY).includes('PLACEHOLDER')) {
                this._logger.warn('⚠️ X_API_KEY is missing or a placeholder. Skipping social posting via X API.');
                // We will still attempt browser-based posting for Linkvertise/other sites if configured
            }


            const productTitle = 'Luxury Pet Carrier';
            const productCategory = 'Luxury Pets';
            const targetCountryCode = this._selectHighValueRegion();

            this._logger.info(`Targeting region: ${targetCountryCode} for content generation.`);
            const content = await this._generateWomenCentricContent(targetCountryCode, productTitle, productCategory);
            this._logger.info('Generated content:', content.title);

            const affLinkPlaceholder = 'https://your-affiliate-marketplace.com/product/luxury-pet-carrier';
            const monitorLinkPlaceholder = 'https://your-analytics-dashboard.com/sales/pet-carrier';

            const shortenedAffLink = await this._shortenLink(affLinkPlaceholder);
            const shortenedMonitorLink = await this._shortenLink(monitorLinkPlaceholder);

            content.caption = content.caption
                .replace('{{AFF_LINK}}', shortenedAffLink)
                .replace('{{MONITOR_LINK}}', shortenedMonitorLink);

            this._logger.info('Attempting to post to X (Twitter)...');
            const xPostStatus = await this._postToX(content.caption, content.media);
            this._logger.info(`X Posting Status: ${xPostStatus.success ? 'Success' : 'Failed'} - ${xPostStatus.message}`);

            // You can add more posting mechanisms here (e.g., Pinterest, Reddit, etc.)
            // based on the successfully remediated credentials.

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
                    this._logger.info('✅ Fetched real dog image.');
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
                const apiKey = "";
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
                    mediaUrl = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
                    this._logger.info('✅ AI Image generated successfully using Imagen 3.0.');
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
                    this._logger.info('✅ Fetched real news title.');
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
                const apiKey = "";
                const llmApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

                const response = await fetch(llmApiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
                    newsTitle = result.candidates[0].content.parts[0].text.replace(/^["']|["']$/g, '');
                    this._logger.info('✅ AI News title generated successfully.');
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
                this._logger.info('Attempting Short.io shortening...');
                const shortIoUrl = this._config.SHORTIO_URL.trim();
                const response = await axios.post(
                    'https://api.short.io/links', // Corrected Short.io API endpoint
                    {
                        originalURL: url,
                        domain: this._config.SHORTIO_DOMAIN || 'qgs.gs',
                        // Assuming Short.io uses 'path' for custom shortcodes, not in this example.
                    },
                    {
                        headers: {
                            'accept': 'application/json',
                            'content-type': 'application/json',
                            'authorization': this._config.SHORTIO_API_KEY,
                            // 'userId': this._config.SHORTIO_USER_ID || 'autonomous_agent' // Short.io might not use userId in header
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
        if (this._config.ADFLY_API_KEY && !String(this._config.ADFLY_API_KEY).includes('PLACEHOLDER') &&
            this._config.ADFLY_USER_ID && !String(this._config.ADFLY_USER_ID).includes('PLACEHOLDER') &&
            this._config.ADFLY_PASS && !String(this._config.ADFLY_PASS).includes('PLACEHOLDER')) {
            try {
                this._logger.info('Attempting AdFly shortening...');
                const adflyBaseUrl = this._config.ADFLY_URL?.trim() || 'https://api.adf.ly/api.php'; // Correct AdFly API base URL
                const response = await axios.get(adflyBaseUrl, {
                    params: {
                        url: url,
                        key: this._config.ADFLY_API_KEY, // AdFly uses 'key' for the API key
                        uid: this._config.ADFLY_USER_ID,
                        // Additional parameters as per AdFly API docs, if needed
                        advert_type: 'int', // Interstitial ad
                        domain: 'adf.ly' // Default domain
                    },
                    timeout: apiCallTimeout
                });
                // AdFly API returns plain text or JSON. Parse based on expected output.
                // Assuming it returns a simple string URL or JSON with 'url' or 'short_url'
                if (typeof response.data === 'string' && response.data.startsWith('http')) { // Plain URL response
                    this._logger.success(`✅ AdFly success: ${response.data}`);
                    return response.data;
                } else if (response.data?.short_url) { // JSON response
                    this._logger.success(`✅ AdFly success: ${response.data.short_url}`);
                    return response.data.short_url;
                }
                throw new Error('AdFly returned no valid short URL');
            } catch (error) {
                this._logger.warn(`⚠️ AdFly failed: ${error.message.substring(0, 100)}. Falling back.`);
            }
        } else {
            this._logger.warn('⚠️ AdFly skipped: API Key, User ID, or Password missing/placeholder. Falling back.');
        }

        // --- TERTIARY: Linkvertise (Browser Automation) ---
        if (this._config.LINKVERTISE_EMAIL && !String(this._config.LINKVERTISE_EMAIL).includes('PLACEHOLDER') &&
            this._config.LINKVERTISE_PASSWORD && !String(this._config.LINKVERTISE_PASSWORD).includes('PLACEHOLDER')) {
            let page = null;
            try {
                this._logger.info('Attempting Linkvertise shortening via browser automation...');
                page = await getNewPage(); // Use central manager
                await page.goto('https://publisher.linkvertise.com/login', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);

                await this.safeType(page, ['input[name="email"]', 'input[type="email"]'], this._config.LINKVERTISE_EMAIL);
                await this.safeType(page, ['input[name="password"]', 'input[type="password"]'], this._config.LINKVERTISE_PASSWORD);
                await this.safeClick(page, ['button[type="submit"]', 'button:contains("Login")']);
                await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null);
                await quantumDelay(5000);

                const isLoggedIn = await page.evaluate(() => document.querySelector('a[href*="/dashboard"]') !== null);
                if (!isLoggedIn) {
                    throw new Error('Linkvertise login failed.');
                }

                await page.goto('https://publisher.linkvertise.com/dashboard/links/create', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);

                await this.safeType(page, ['input[name="target_url"]', 'input[placeholder="Enter your URL"]'], url);
                await this.safeClick(page, ['button[type="submit"]', 'button:contains("Create Link")']);
                await page.waitForSelector('input.share-link-input', { timeout: 10000 });
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
                if (page) await closePage(page); // Close via central manager
            }
        } else {
            this._logger.warn('⚠️ Linkvertise skipped: Credentials missing/placeholder. Falling back.');
        }

        // --- QUATERNARY: NowPayments ---
        if (this._config.NOWPAYMENTS_API_KEY && !String(this._config.NOWPAYMENTS_API_KEY).includes('PLACEHOLDER')) {
            try {
                this._logger.info('Attempting NowPayments invoice URL generation...');
                const npRes = await axios.post('https://api.nowpayments.io/v1/invoice', {
                    price_amount: 0.01,
                    price_currency: 'usd',
                    pay_currency: 'usdt',
                    order_description: `Access Pass: ${url}`,
                    ipn_callback_url: this._config.NOWPAYMENTS_CALLBACK_URL || 'https://your-actual-secure-callback-url.com/nowpayments-webhook'
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

        this._logger.warn(`🚨 All shortening services failed. Using direct URL: ${url}`);
        return url;
    },

    /**
     * Proactively scouts for, generates, or creates a missing/placeholder social media credential or API key.
     * This function will return the remediated credentials, but will NOT update Render ENV directly.
     * @param {string} keyName - The name of the missing configuration key (e.g., 'PINTEREST_EMAIL').
     * @returns {Promise<object|null>} An object containing the remediated key(s) if successful, null otherwise.
     */
    async _remediateMissingSocialConfig(keyName) {
        this._logger.info(`\n⚙️ Initiating remediation for missing/placeholder social key: ${keyName}`);

        const AI_EMAIL = this._config.AI_EMAIL;
        const AI_PASSWORD = this._config.AI_PASSWORD;

        if (!AI_EMAIL || String(AI_EMAIL).includes('PLACEHOLDER') || !AI_PASSWORD || String(AI_PASSWORD).includes('PLACEHOLDER')) {
            this._logger.error(`❌ Cannot remediate ${keyName}: AI identity (AI_EMAIL/AI_PASSWORD) is missing or a placeholder. This is a critical prerequisite for web-based key generation.`);
            return null;
        }

        let newFoundCredential = null;
        let targetSite = null;
        let page = null;

        try {
            switch (keyName) {
                case 'PINTEREST_EMAIL':
                case 'PINTEREST_PASS':
                    targetSite = 'https://pinterest.com/login';
                    this._logger.info(`Attempting to remediate Pinterest credentials at ${targetSite}`);
                    page = await getNewPage();
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(2000);
                    await this.safeType(page, ['input[placeholder="Email or username"]', 'input[type="text"]', 'input[name="id"]'], AI_EMAIL);
                    await this.safeType(page, ['input[placeholder="Password"]', 'input[type="password"]', 'input[name="password"]'], AI_PASSWORD);
                    await this.safeClick(page, ['button[type="submit"]', 'button:contains("Log In")', 'button[data-test-id="login-button"]']);
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: page.getDefaultTimeout() }).catch(() => null);
                    await quantumDelay(5000);

                    const pinterestLoggedIn = await page.evaluate(() => document.querySelector('a[href*="/pin-builder"]') !== null);
                    if (pinterestLoggedIn) {
                        this._logger.success('✅ Pinterest login successful during remediation. Credentials confirmed.');
                        newFoundCredential = { PINTEREST_EMAIL: AI_EMAIL, PINTEREST_PASS: AI_PASSWORD };
                    } else {
                        this._logger.warn('⚠️ Pinterest login failed during remediation.');
                    }
                    break;

                case 'X_USERNAME':
                case 'X_PASSWORD':
                case 'X_API_KEY':
                    targetSite = 'https://twitter.com/login';
                    this._logger.info(`Attempting to remediate X (Twitter) credentials/API Key at ${targetSite}`);
                    page = await getNewPage();
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(2000);

                    const useOtherLogin = await page.$('a[href*="flow/login?input_flow_data"]');
                    if (useOtherLogin) {
                        await useOtherLogin.click();
                        await quantumDelay(1000);
                    }

                    await this.safeType(page, ['input[name="text"]', 'input[type="text"]', 'input[autocomplete="username"]'], AI_EMAIL);
                    await this.safeClick(page, ['button:contains("Next")']);
                    await quantumDelay(2000);

                    await this.safeType(page, ['input[name="password"]', 'input[type="password"]'], AI_PASSWORD);
                    await this.safeClick(page, ['button[data-testid="LoginForm_Login_Button"]', 'button:contains("Log in")', 'button[type="submit"]']);
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null);
                    await quantumDelay(5000);

                    const xLoggedIn = await page.evaluate(() => document.querySelector('a[data-testid="AppTabBar_Home_Link"]') !== null);
                    if (xLoggedIn) {
                        this._logger.success('✅ X (Twitter) login successful during remediation. Credentials confirmed.');
                        newFoundCredential = { X_USERNAME: AI_EMAIL, X_PASSWORD: AI_PASSWORD };
                        await page.goto('https://developer.twitter.com/en/portal/dashboard', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null);
                        await quantumDelay(3000);
                        const pageContent = await page.evaluate(() => document.body.innerText);
                        const foundApiKey = pageContent.match(/bearer\s+([a-zA-Z0-9\-_.~+%/=]{40,})/i);
                        if (foundApiKey && foundApiKey[1]) {
                            newFoundCredential.X_API_KEY = foundApiKey[1];
                            this._logger.info('🔑 Found X_API_KEY during remediation!');
                        } else {
                            this._logger.warn('⚠️ Could not find X_API_KEY on developer dashboard during remediation.');
                        }
                    } else {
                        this._logger.warn('⚠️ X (Twitter) login failed during remediation.');
                    }
                    break;

                case 'REDDIT_USER':
                case 'REDDIT_PASS':
                    targetSite = 'https://www.reddit.com/login/';
                    this._logger.info(`Attempting to remediate Reddit credentials at ${targetSite}`);
                    page = await getNewPage();
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(2000);
                    await this.safeType(page, ['input[name="username"]', '#loginUsername'], AI_EMAIL);
                    await this.safeType(page, ['input[name="password"]', '#loginPassword'], AI_PASSWORD);
                    await this.safeClick(page, ['button[type="submit"]', '.AnimatedForm__submitButton', 'button:contains("Log In")']);
                    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: page.getDefaultTimeout() }).catch(() => null);
                    await quantumDelay(5000);

                    const redditLoggedIn = await page.evaluate(() => document.querySelector('a[href="/r/all/"]') !== null);
                    if (redditLoggedIn) {
                        this._logger.success('✅ Reddit login successful during remediation. Credentials confirmed.');
                        newFoundCredential = { REDDIT_USER: AI_EMAIL, REDDIT_PASS: AI_PASSWORD };
                    } else {
                        this._logger.warn('⚠️ Reddit login failed during remediation.');
                    }
                    break;

                case 'DOG_API_KEY':
                    targetSite = 'https://thedogapi.com/signup';
                    this._logger.info(`Attempting to scout for DOG_API_KEY at ${targetSite}`);
                    page = await getNewPage();
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(2000);
                    const pageContentDog = await page.evaluate(() => document.body.innerText);
                    const foundDogKey = pageContentDog.match(/(ak|sk)_[a-zA-Z0-9]{32,64}/);
                    if (foundDogKey && foundDogKey[0]) {
                        newFoundCredential = { DOG_API_KEY: foundDogKey[0] };
                        this._logger.info('🔑 Found DOG_API_KEY during remediation!');
                    } else {
                        this._logger.warn('⚠️ Could not find DOG_API_KEY on signup page directly. Manual signup might be needed.');
                    }
                    break;

                case 'NEWS_API_KEY':
                    targetSite = 'https://newsapi.org/register';
                    this._logger.info(`Attempting to scout for NEWS_API_KEY at ${targetSite}`);
                    page = await getNewPage();
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(2000);
                    const pageContentNews = await page.evaluate(() => document.body.innerText);
                    const foundNewsKey = pageContentNews.match(/[a-f0-9]{32}/i);
                    if (foundNewsKey && foundNewsKey[0]) {
                        newFoundCredential = { NEWS_API_KEY: foundNewsKey[0] };
                        this._logger.info('🔑 Found NEWS_API_KEY during remediation!');
                    } else {
                        this._logger.warn('⚠️ Could not find NEWS_API_KEY on signup page directly. Manual signup might be needed.');
                    }
                    break;
                case 'ADFLY_API_KEY':
                case 'ADFLY_USER_ID':
                case 'ADFLY_PASS':
                case 'ADFLY_URL':
                    targetSite = 'https://adf.ly/publisher/register';
                    this._logger.info(`Attempting to remediate AdFly credentials at ${targetSite}`);
                    page = await getNewPage();
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(2000);
                    const adflyPageContent = await page.evaluate(() => document.body.innerText);
                    const adflyFoundKey = adflyPageContent.match(/publisher_api_key:\s*([a-zA-Z0-9]{16,})/i);
                    if (adflyFoundKey && adflyFoundKey[1]) {
                        newFoundCredential = { ADFLY_API_KEY: adflyFoundKey[1] };
                        this._logger.info('🔑 Found AdFly API Key during remediation!');
                        // Note: User ID and Pass are harder to extract programmatically post-signup without a specific API call.
                        // Assuming they are set manually or derived from AI_EMAIL/AI_PASSWORD for login purposes only.
                    } else {
                        this._logger.warn('⚠️ AdFly key not found, full signup flow not automated. Manual setup likely needed due to bot detection.');
                    }
                    break;

                case 'SHORTIO_API_KEY':
                case 'SHORTIO_URL':
                case 'SHORTIO_USER_ID':
                    targetSite = 'https://app.short.io/signup';
                    this._logger.info(`Attempting to remediate Short.io credentials at ${targetSite}`);
                    page = await getNewPage();
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(2000);
                    const shortioPageContent = await page.evaluate(() => document.body.innerText);
                    const shortioFoundKey = shortioPageContent.match(/API_KEY:\s*([a-zA-Z0-9]{32,})/);
                    if (shortioFoundKey && shortioFoundKey[1]) {
                        newFoundCredential = { SHORTIO_API_KEY: shortioFoundKey[1] };
                        const dashboardUrlMatch = page.url().match(/https:\/\/(.*?)\.short\.io/);
                        if (dashboardUrlMatch && dashboardUrlMatch[0]) {
                            newFoundCredential.SHORTIO_URL = dashboardUrlMatch[0]; // Capture dynamic Short.io URL
                        }
                        this._logger.info('🔑 Found Short.io API Key during remediation!');
                    } else {
                        this._logger.warn('⚠️ Short.io key/URL not found, full signup flow not automated.');
                    }
                    break;
                case 'LINKVERTISE_EMAIL':
                case 'LINKVERTISE_PASSWORD':
                    // Linkvertise credentials are primarily handled and potentially remediated by apiScoutAgent.
                    // Here, we just check if they exist, returning them if found.
                    if (this._config.LINKVERTISE_EMAIL && !String(this._config.LINKVERTISE_EMAIL).includes('PLACEHOLDER') &&
                        this._config.LINKVERTISE_PASSWORD && !String(this._config.LINKVERTISE_PASSWORD).includes('PLACEHOLDER')) {
                        this._logger.info('✅ Linkvertise credentials confirmed as present and valid during Social Agent remediation check.');
                        return { LINKVERTISE_EMAIL: this._config.LINKVERTISE_EMAIL, LINKVERTISE_PASSWORD: this._config.LINKVERTISE_PASSWORD };
                    }
                    this._logger.warn('⚠️ Linkvertise credentials are still missing/placeholder. Check apiScoutAgent remediation results.');
                    return null; // Explicitly return null if not found/remediated by this agent
                default:
                    this._logger.warn(`⚠️ No specific remediation strategy defined for social key: ${keyName}. Manual intervention might be required.`);
                    return null;
            }

            return newFoundCredential; // Return the found credentials to the caller (server.js)

        } catch (error) {
            this._logger.warn(`⚠️ Remediation attempt for ${keyName} failed: ${error.message}`);
            // browserManager.reportNavigationFailure(); // This function does not exist in browserManager
            return null;
        } finally {
            if (page) await closePage(page);
        }
    },

    /**
     * Posts content to X (Twitter) using the API.
     * @param {string} caption - The text caption for the post.
     * @param {string} mediaUrl - The URL of the media (image). Can be base64.
     * @returns {Promise<object>} Status of the posting attempt.
     */
    async _postToX(caption, mediaUrl) {
        if (!this._config.X_API_KEY || String(this._config.X_API_KEY).includes('PLACEHOLDER')) {
            return { success: false, message: 'X_API_KEY is missing or a placeholder.' };
        }
        if (!this._config.X_USERNAME || String(this._config.X_USERNAME).includes('PLACEHOLDER') ||
            !this._config.X_PASSWORD || String(this._config.X_PASSWORD).includes('PLACEHOLDER')) {
            // While we have X_API_KEY, some operations might still need user auth or we need to ensure the key is for the correct user.
            this._logger.warn('⚠️ X (Twitter) Username or Password missing/placeholder. API posting might be limited if key needs user context.');
            // Proceed assuming X_API_KEY is a Bearer Token for app-only authentication if applicable.
        }

        try {
            const client = new TwitterApi(this._config.X_API_KEY);
            const rwClient = client.readWrite; // Or `appOnly` if it's a bearer token for app-only ops

            let mediaId = null;
            if (mediaUrl && mediaUrl.startsWith('data:image/')) {
                // If media is base64, upload it first
                const base64Data = mediaUrl.split(',')[1];
                const buffer = Buffer.from(base64Data, 'base64');
                const tempFilePath = path.join(process.cwd(), `temp_image_${Date.now()}.png`);
                await fs.writeFile(tempFilePath, buffer);

                // Assuming Twitter API client can upload from a file path or buffer directly
                // Note: The `v2` client generally requires media to be uploaded via the `uploadMedia` endpoint.
                // This example uses a simplified upload; actual implementation might vary based on Twitter API v1.1 vs v2.
                // For simplicity, let's mock the upload for now or assume a public URL.
                // If using v2, you'd typically need the "media" endpoint.
                // Placeholder for actual media upload if not a direct URL
                // mediaId = await client.v1.uploadMedia(tempFilePath); // This is v1.1
                this._logger.warn('Base64 media upload to Twitter API is complex for v2. Assuming direct URL or skipping media for now.');
                // For a real scenario, you'd use `client.v2.uploadMedia` (if available in twitter-api-v2) or fallback to v1.1 upload.
                // For the scope of this refactor, we'll proceed assuming it's a direct URL or handle it conceptually.
                mediaId = null; // Reset for now if base64 upload not fully implemented
                await fs.unlink(tempFilePath); // Clean up temp file
            } else if (mediaUrl) {
                // If it's a regular URL, it needs to be uploaded or linked if Twitter supports direct linking
                // Twitter API typically requires media to be uploaded, not directly linked.
                this._logger.warn('Direct media URL linking to Twitter is not standard. Media needs to be uploaded first. Skipping media upload for now.');
                mediaId = null;
            }


            const tweetConfig = { text: caption };
            if (mediaId) {
                tweetConfig.media = { media_ids: [mediaId] };
            }

            const { data: createdTweet } = await rwClient.v2.tweet(tweetConfig);
            this._logger.success(`✅ Tweet posted successfully: ${createdTweet.id}`);
            return { success: true, message: `Tweet ID: ${createdTweet.id}` };
        } catch (error) {
            this._logger.error(`🚨 Failed to post to X (Twitter): ${error.message}`);
            // Check for specific error codes related to invalid API keys or tokens
            if (error.code === 401 || error.code === 403) {
                this._logger.error('X API key/token might be invalid or expired. Please check environment variables.');
                // Here, you might trigger a remediation for X_API_KEY if needed.
                // But as per current design, this agent only remediates missing/placeholder on startup.
                // Re-running remediation would be a separate, more complex logic.
            }
            return { success: false, message: error.message };
        }
    }
};


// === 🌍 HIGH-VALUE WOMEN-CENTRIC MARKETS (Revenue-Optimized) ===
const HIGH_VALUE_REGIONS = {
    WESTERN_EUROPE: ['MC', 'CH', 'LU', 'GB', 'DE', 'FR'],
    MIDDLE_EAST: ['AE', 'SA', 'QA', 'KW'],
    NORTH_AMERICA: ['US', 'CA'],
    ASIA_PACIFIC: ['SG', 'HK', 'JP', 'AU', 'NZ'],
    OCEANIA: ['AU', 'NZ']
};

// === 💼 WOMEN'S TOP SPENDING CATEGORIES ===
const WOMEN_TOP_SPENDING_CATEGORIES = [
    "Luxury Pets",
    "Designer Handbags",
    "Skincare & Beauty",
    "Organic Baby Products",
    "Fitness & Wellness",
    "Sustainable Fashion",
    "VIP Travel",
    "Private Wellness Retreats",
    "High-End Jewelry",
    "Premium Health Supplements"
];

// === 🌀 Quantum Jitter (Anti-Robot Detection) ===
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = crypto.randomInt(800, 3000);
    setTimeout(resolve, ms + jitter);
});

export default socialAgent;
