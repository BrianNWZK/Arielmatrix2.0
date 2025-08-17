// backend/agents/shopifyAgent.js
import axios from 'axios';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs/promises';

// Import functions directly from browserManager, assuming it's been initialized by server.js
import { getNewPage, closePage } from './browserManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === 🌏 GLOBAL SOURCING DATABASE ===
const SOURCING_SITES = {
    china: [
        'https://www.alibaba.com',
        'https://www.aliexpress.com',
        'https://www.1688.com'
    ],
    southKorea: [
        'https://www.coupang.com',
        'https://www.11st.co.kr'
    ],
    vietnam: [
        'https://shopee.vn',
        'https://tiki.vn'
    ]
};

// === 🌀 Quantum Jitter (Anti-Robot Detection) ===
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = crypto.randomInt(800, 3000);
    setTimeout(resolve, ms + jitter);
});

// === 🤖 Autonomous Store Manager ===
/**
 * @namespace ShopifyAgent
 * @description Manages autonomous product sourcing, price optimization, and Shopify store operations.
 */
const shopifyAgent = {
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
                const element = await page.waitForSelector(selector.trim(), { timeout: 6000 });
                await element.click(); // Focus on the element first
                await page.keyboard.down('Control'); // Select all existing text (Ctrl+A)
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.keyboard.press('Delete'); // Delete existing text
                await page.type(selector.trim(), text, { delay: 50 }); // Type with human-like delay
                return true;
            } catch (e) {
                // this._logger.debug(`Type selector "${selector.trim()}" failed: ${e.message.substring(0, 50)}... Trying next.`); // Can be noisy
                continue;
            }
        }
        this._logger.warn(`⚠️ Failed to type into any of the provided selectors: ${selectors.join(', ')} for text: "${text.substring(0, 20)}..."`);
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
                const element = await page.waitForSelector(selector.trim(), { timeout: 8000 });
                await element.click();
                return true;
            } catch (e) {
                // this._logger.debug(`Click selector "${selector.trim()}" failed: ${e.message.substring(0, 50)}... Trying next.`); // Can be noisy
                continue;
            }
        }
        this._logger.warn(`⚠️ Failed to click any of the provided selectors: ${selectors.join(', ')}`);
        return false;
    },

    /**
     * Main run method for the Shopify Agent.
     * @param {object} config - The global configuration object.
     * @param {object} logger - The global logger instance.
     * @returns {Promise<object>} Status and details of the Shopify operations.
     */
    async run(config, logger) {
        this._config = config; // Set internal config reference
        this._logger = logger; // Set internal logger reference
        this._logger.info('🛍️ Shopify Agent Activated: Sourcing & Selling Global Luxury...');
        const startTime = process.hrtime.bigint();

        try {
            // --- Phase 0: Proactive Configuration Remediation for Shopify ---
            const shopifyCriticalKeys = [
                'STORE_URL',
                'STORE_KEY', // Typically for custom app access (if used)
                'STORE_SECRET', // Typically for custom app access (if used)
                'ADMIN_SHOP_SECRET', // The Admin API Access Token for a private app
            ];

            const newlyRemediatedKeys = {};
            for (const key of shopifyCriticalKeys) {
                if (!this._config[key] || String(this._config[key]).includes('PLACEHOLDER')) {
                    this._logger.warn(`⚙️ Attempting to remediate missing/placeholder config: ${key}`);
                    const remediatedValue = await this._remediateMissingShopifyConfig(key);
                    if (remediatedValue) {
                        Object.assign(newlyRemediatedKeys, remediatedValue);
                        // Update internal config for immediate use
                        Object.assign(this._config, remediatedValue);
                    }
                }
            }
            if (Object.keys(newlyRemediatedKeys).length > 0) {
                this._logger.info(`🔑 Shopify Agent remediated ${Object.keys(newlyRemediatedKeys).length} key(s).`);
            } else {
                this._logger.info('No new keys remediated by Shopify Agent this cycle.');
            }
            this._logger.info('\n--- Finished Shopify Configuration Remediation Phase ---');


            const STORE_URL = this._config.STORE_URL;
            const ADMIN_SHOP_SECRET = this._config.ADMIN_SHOP_SECRET;

            // Final check for critical Shopify credentials AFTER remediation attempts
            if (!STORE_URL || String(STORE_URL).includes('PLACEHOLDER') ||
                !ADMIN_SHOP_SECRET || String(ADMIN_SHOP_SECRET).includes('PLACEHOLDER')) {
                throw new Error('Shopify credentials (STORE_URL or ADMIN_SHOP_SECRET) are still missing or placeholders after remediation attempts. Cannot proceed with Shopify operations.');
            }
            this._logger.success(`✅ Shopify credentials confirmed. Store URL: ${STORE_URL.slice(0, 30)}...`);

            // Phase 1: Source a Premium Product (Now with more resilient scraping)
            const sourcedProduct = await this._sourcePremiumProduct();
            this._logger.info(`🛒 Sourced product: "${sourcedProduct.title}" from ${sourcedProduct.origin}`);

            // Phase 2: Optimize Price for High-Value Market
            const finalPrice = this._optimizeRevenue({
                basePrice: sourcedProduct.basePrice,
                origin: sourcedProduct.origin,
                category: sourcedProduct.category
            });
            this._logger.info(`💲 Optimized price for product: $${finalPrice.toFixed(2)}`);

            // Phase 3: Create Premium Product on Shopify (Real API Call)
            try {
                const SHOPIFY_API_VERSION = '2024-07'; // Shopify API version for Admin API
                const shopifyApiEndpoint = `${STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json`;

                this._logger.info(`📦 Attempting to list product on Shopify at: ${shopifyApiEndpoint}`);

                const response = await axios.post(
                    shopifyApiEndpoint,
                    {
                        product: {
                            title: `${sourcedProduct.title} - Autonomous Edition ${new Date().getFullYear()}`,
                            body_html: `<p>Discover this exquisite item, autonomously sourced from ${sourcedProduct.origin} and digitally enhanced by ArielMatrix AI. Limited stock. Global shipping available. Category: ${sourcedProduct.category}.</p>`,
                            vendor: 'ArielMatrix Global',
                            product_type: sourcedProduct.category,
                            images: [{ src: sourcedProduct.highEndImage }],
                            variants: [{ price: finalPrice.toFixed(2), sku: `AM-${crypto.randomBytes(4).toString('hex')}` }]
                        }
                    },
                    {
                        headers: {
                            'X-Shopify-Access-Token': ADMIN_SHOP_SECRET,
                            'Content-Type': 'application/json'
                        },
                        timeout: 15000 // Increased timeout for API call
                    }
                );
                this._logger.success(`✅ Added premium product to Shopify: "${response.data.product.title}" for $${response.data.product.variants[0].price}`);
            } catch (error) {
                this._logger.error(`🚨 Failed to add product to Shopify: ${error.message}. Response data: ${JSON.stringify(error.response?.data || {})}.`);
                throw new Error(`Shopify product listing failed: ${error.message}`);
            }

            // Phase 4: Trigger Social Posting (Pass updated CONFIG)
            const socialAgentModule = await import('./socialAgent.js');
            await socialAgentModule.default.run(
                {
                    ...this._config, // Pass the current, potentially updated config
                    PRODUCT_LINK: `${STORE_URL}/products/${sourcedProduct.title.toLowerCase().replace(/ /g, '-')}`,
                    PRODUCT_TITLE: sourcedProduct.title,
                    PRODUCT_CATEGORY: sourcedProduct.category
                },
                this._logger // Pass the logger
            );

            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            this._logger.success(`✅ Shopify Agent Completed in ${durationMs.toFixed(0)}ms: Premium product sourced, listed, and social promotion initiated.`);
            return { status: 'success', product: sourcedProduct.title, finalPrice: finalPrice.toFixed(2), durationMs, newlyRemediatedKeys };

        } catch (error) {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            this._logger.error(`🚨 ShopifyAgent Critical Failure in ${durationMs.toFixed(0)}ms: ${error.message}`);
            throw { message: error.message, duration: durationMs }; // Re-throw to propagate failure to server.js
        }
    },

    /**
     * Generates a product image URL using the Imagen 3.0 model.
     * This is a zero-cost solution leveraging the platform's integrated capabilities.
     * @param {object} productData - Data about the product to inform the image prompt.
     * @returns {Promise<string>} URL of the generated image or a high-quality fallback.
     */
    async _generateProductDesign(productData) {
        const { name, category, origin } = productData;
        const prompt = `Highly detailed, luxury, high-fashion ${name}, ${category} style, product photography, studio lighting, 8k, ultra-detailed, showcasing exquisite craftsmanship, minimalistic background, ideal for an e-commerce listing, sold by ArielMatrix Global, inspired by ${origin} aesthetics.`;

        try {
            this._logger.info(`🎨 Requesting AI image generation for: "${prompt.substring(0, 100)}..."`);
            const payload = { instances: { prompt: prompt }, parameters: { "sampleCount": 1 } };
            const apiKey = ""; // Canvas will provide this dynamically
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
                const imageUrl = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
                this._logger.success('✅ AI Image generated successfully using Imagen 3.0.');
                return imageUrl;
            } else {
                this._logger.warn('⚠️ Imagen 3.0 generation did not return expected data structure. Using fallback.');
                throw new Error('Invalid Imagen 3.0 response');
            }
        } catch (error) {
            this._logger.warn(`⚠️ AI Image Generation failed: ${error.message} → using high-quality placeholder.`);
            return 'https://placehold.co/1024x1024/E0E0E0/333333?text=AI+Luxury+Product';
        }
    },

    /**
     * Optimizes product price based on market value, origin, and category.
     * @param {object} data - Contains basePrice, origin, and category.
     * @returns {number} The optimized price.
     */
    _optimizeRevenue(data) {
        const { basePrice, origin, category } = data;
        const highValueCountries = ['MC', 'LU', 'CH', 'QA', 'SG', 'AE', 'US', 'KW'];
        const simulatedTargetCountry = 'AE';

        const countryMultiplier = highValueCountries.includes(simulatedTargetCountry) ? 2.5 : 1.0;
        const originMultiplier = ['china', 'southKorea', 'vietnam'].includes(origin) ? 1.3 : 1.0;
        const categoryMultiplier = (category.includes('luxury') || category.includes('designer')) ? 1.8 : 1.0;

        const optimizedPrice = basePrice * countryMultiplier * originMultiplier * categoryMultiplier;
        return Math.max(optimizedPrice, basePrice * 1.5);
    },

    /**
     * Autonomously sources a premium product from a global e-commerce site using Puppeteer.
     * Implements robust error handling and adaptive scraping.
     * @returns {Promise<object>} Sourced product data including title, price, and a high-end AI image.
     */
    async _sourcePremiumProduct() {
        let page = null;
        try {
            page = await getNewPage();
            page.setDefaultTimeout(page.getDefaultTimeout());

            const countries = Object.keys(SOURCING_SITES);
            const randomCountry = countries[Math.floor(Math.random() * countries.length)];
            const sites = SOURCING_SITES[randomCountry];
            const randomSite = sites[Math.floor(Math.random() * sites.length)];

            this._logger.info(`🔍 Sourcing from: ${randomSite} for ${randomCountry} region.`);
            await page.goto(randomSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
            await quantumDelay(3000);

            const categories = ['luxury pets', 'designer handbags', 'skincare', 'smart home devices', 'sustainable fashion', 'gourmet food'];
            const randomCategory = categories[Math.floor(Math.random() * categories.length)];
            this._logger.info(`Searching for category: "${randomCategory}"`);

            const searchSelectors = [
                'input[type="search"]', 'input[name="q"]', 'input[placeholder*="search"]',
                '#search-input', '.search-field', '[data-test-id="search-box"]', 'form input[type="text"]'
            ];
            let searchInputFound = false;
            for (const selector of searchSelectors) {
                try {
                    const searchInput = await page.$(selector);
                    if (searchInput) {
                        await searchInput.type(randomCategory);
                        await quantumDelay(1000);

                        const searchButtonSelectors = ['button[type="submit"][aria-label*="search"]', 'button:contains("Search")', '.search-button', 'form button[type="submit"]'];
                        let searchButtonClicked = false;
                        for (const btnSelector of searchButtonSelectors) {
                            try {
                                const searchButton = await page.$(btnSelector);
                                if (searchButton) {
                                    await Promise.all([
                                        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null),
                                        searchButton.click()
                                    ]);
                                    searchButtonClicked = true;
                                    break;
                                }
                            } catch (clickError) {
                                // Ignore and try next button
                            }
                        }
                        if (!searchButtonClicked) {
                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null),
                                page.keyboard.press('Enter')
                            ]);
                        }
                        searchInputFound = true;
                        break;
                    }
                } catch (e) {
                    this._logger.warn(`Search selector "${selector}" failed: ${e.message.substring(0, 50)}...`);
                }
            }

            if (!searchInputFound) {
                this._logger.warn('⚠️ Could not find a suitable search input on the page. Proceeding without specific search.');
            }

            await quantumDelay(5000);

            const productData = await page.evaluate(() => {
                const titleEl = document.querySelector('h1.product-title, .product-name, [data-name="product-title"], h2.item-title, a.title-link, .product-item-name');
                const priceEl = document.querySelector('.product-price span, .price-value, [data-price], .current-price-value, .product-price__price');
                const imgEl = document.querySelector('.product-gallery-main-img img, .product-image img, .item-img img, .product-thumbnail img');

                return {
                    title: titleEl?.innerText.trim() || 'Premium Sourced Item',
                    price: parseFloat(priceEl?.innerText.replace(/[^0-9.]/g, '')) || 25,
                    image: imgEl?.src || null,
                };
            });

            if (!productData.title || !productData.image || productData.price < 1) {
                throw new Error('Sourced product data is incomplete or invalid after scraping.');
            }

            const highEndImage = await this._generateProductDesign({
                ...productData,
                name: productData.title,
                category: randomCategory,
                origin: randomCountry
            });

            return {
                ...productData,
                basePrice: productData.price,
                highEndImage,
                origin: randomCountry,
                category: randomCategory
            };
        } catch (error) {
            this._logger.error(`🚨 Sourcing failed: ${error.message} → using fallback product.`);
            // browserManager.reportNavigationFailure(); // This function doesn't exist. Logging instead.
            this._logger.warn('Skipping navigation failure report as browserManager does not have this function.');
            return {
                title: 'AI-Designed Luxury Pet Jewelry',
                basePrice: 15,
                highEndImage: 'https://placehold.co/1024x1024/E0E0E0/333333?text=AI+Luxury+Product+Fallback',
                origin: 'ai_generated',
                category: 'Luxury Pet Accessories'
            };
        } finally {
            if (page) await closePage(page);
        }
    },

    /**
     * Proactively scouts for, generates, or creates a missing/placeholder Shopify API key/credential.
     * This function returns the remediated credentials, but does NOT update Render ENV directly.
     * @param {string} keyName - The name of the missing configuration key (e.g., 'STORE_URL').
     * @returns {Promise<object|null>} An object containing the remediated key(s) if successful, null otherwise.
     */
    async _remediateMissingShopifyConfig(keyName) {
        this._logger.info(`\n⚙️ Initiating remediation for missing/placeholder Shopify key: ${keyName}`);

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
                case 'STORE_URL':
                    targetSite = 'https://accounts.shopify.com/store-login';
                    this._logger.info(`Attempting to scout for STORE_URL at ${targetSite}`);
                    page = await getNewPage();
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(3000);

                    const emailInput = await page.waitForSelector('input[type="email"], #LoginAccountEmail', { timeout: 10000 }).catch(() => null);
                    const passwordInput = await page.waitForSelector('input[type="password"], #LoginAccountPassword', { timeout: 10000 }).catch(() => null);
                    const loginButton = await page.waitForSelector('button[type="submit"][name="commit"]', { timeout: 10000 }).catch(() => null);

                    if (emailInput && passwordInput && loginButton) {
                        await emailInput.type(AI_EMAIL);
                        await passwordInput.type(AI_PASSWORD);
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: page.getDefaultTimeout() }).catch(() => null),
                            loginButton.click()
                        ]);
                        this._logger.info('Attempted Shopify login for STORE_URL remediation.');
                        await quantumDelay(5000);

                        const currentUrl = page.url();
                        if (currentUrl.includes('/admin') || currentUrl.includes('.myshopify.com')) {
                            const urlMatch = currentUrl.match(/(https:\/\/[a-zA-Z0-9-]+\.myshopify\.com)/);
                            if (urlMatch && urlMatch[1]) {
                                newFoundCredential = { 'STORE_URL': urlMatch[1] };
                                this._logger.success(`✅ Scouted new STORE_URL: ${newFoundCredential.STORE_URL}`);
                            }
                        }
                    } else {
                        this._logger.warn('⚠️ Shopify login elements not found for STORE_URL remediation.');
                    }
                    break;

                case 'ADMIN_SHOP_SECRET':
                case 'STORE_KEY':
                case 'STORE_SECRET':
                    // This is the most complex remediation as it requires navigating Shopify Partner/Store admin
                    // and creating/fetching a Private App API Access Token.
                    targetSite = this._config.STORE_URL ? `${this._config.STORE_URL}/admin/settings/apps/private_app/new` : 'https://accounts.shopify.com/store-login';
                    this._logger.info(`Attempting to scout for Shopify Admin API Key at ${targetSite}`);
                    page = await getNewPage();
                    await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(3000);

                    // Basic login attempt (same as above)
                    const loginEmail = await page.waitForSelector('input[type="email"], #LoginAccountEmail', { timeout: 5000 }).catch(() => null);
                    const loginPass = await page.waitForSelector('input[type="password"], #LoginAccountPassword', { timeout: 5000 }).catch(() => null);
                    const loginBtn = await page.waitForSelector('button[type="submit"][name="commit"]', { timeout: 5000 }).catch(() => null);

                    if (loginEmail && loginPass && loginBtn) {
                        await loginEmail.type(AI_EMAIL);
                        await loginPass.type(AI_PASSWORD);
                        await Promise.all([
                            page.waitForNavigation({ waitUntil: 'networkidle0', timeout: page.getDefaultTimeout() }).catch(() => null),
                            loginBtn.click()
                        ]);
                        this._logger.info('Attempted Shopify login for API key remediation.');
                        await quantumDelay(5000);
                    }

                    const currentUrl = page.url();
                    if (currentUrl.includes('/admin/settings/apps')) {
                        this._logger.info('On Shopify Admin Apps page. Attempting to find/create private app API token.');

                        // Simplified scraping for API keys on the page. In a real scenario,
                        // this would involve clicking buttons to create a new private app,
                        // setting permissions, saving, and then extracting the tokens.
                        const pageContent = await page.evaluate(() => document.body.innerText);
                        // Heuristic pattern matching for common API key/secret formats.
                        const foundAdminSecret = pageContent.match(/shpat_[a-zA-Z0-9]{32}/); // Admin API Access Token
                        const foundApiKey = pageContent.match(/shapi_[a-zA-Z0-9]{32}/); // Public API Key (less likely to be directly useful for Admin API)

                        if (foundAdminSecret && foundAdminSecret[0]) {
                            newFoundCredential = { 'ADMIN_SHOP_SECRET': foundAdminSecret[0] };
                            this._logger.success('🔑 Found ADMIN_SHOP_SECRET during remediation!');
                        } else if (foundApiKey && foundApiKey[0]) {
                            newFoundCredential = { 'STORE_KEY': foundApiKey[0] };
                            this._logger.warn('🔑 Found a STORE_KEY but not ADMIN_SHOP_SECRET. This might not be sufficient for all admin operations.');
                        } else {
                            this._logger.warn('⚠️ No clear Shopify Admin API key/secret pattern found on page. Manual creation/retrieval might be necessary.');
                        }
                    } else {
                        this._logger.warn('⚠️ Not on Shopify Admin Apps page. Unable to automate API key retrieval.');
                    }
                    break;
                default:
                    this._logger.warn(`⚠️ No specific remediation strategy defined for Shopify key: ${keyName}. Manual intervention required.`);
                    return null;
            }

            return newFoundCredential;

        } catch (error) {
            this._logger.warn(`⚠️ Remediation attempt for ${keyName} failed: ${error.message}`);
            return null;
        } finally {
            if (page) await closePage(page);
        }
    }
};

export default shopifyAgent;
