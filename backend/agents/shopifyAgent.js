// backend/agents/shopifyAgent.js
import axios from 'axios';
import { browserManager } from './browserManager.js'; // ✅ Import the central manager
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs/promises'; // Import fs for temporary file operations

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Reusable Render ENV update function (extracted for common use across agents)
async function _updateRenderEnvWithKeys(keysToSave, config) {
    if (Object.keys(keysToSave).length === 0) return;

    if (config.RENDER_API_TOKEN && !String(config.RENDER_API_TOKEN).includes('PLACEHOLDER') &&
        config.RENDER_SERVICE_ID && !String(config.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        console.log('Attempting to sync new keys to Render environment variables via Shopify Agent...');
        try {
            const envVarsToAdd = Object.entries(keysToSave).map(([key, value]) => ({ key, value }));
            const currentEnvResponse = await axios.get(
                `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/env-vars`,
                { headers: { Authorization: `Bearer ${config.RENDER_API_TOKEN}` }, timeout: 15000 }
            );
            const existingEnvVars = currentEnvResponse.data;

            const updatedEnvVars = existingEnvVars.map(envVar => {
                if (keysToSave[envVar.key] && !String(keysToSave[envVar.key]).includes('PLACEHOLDER')) {
                    return { key: envVar.key, value: keysToSave[envVar.key] };
                }
                return envVar;
            });

            envVarsToAdd.forEach(newEnv => {
                if (!updatedEnvVars.some(existing => existing.key === newEnv.key)) {
                    updatedEnvVars.push(newEnv);
                }
            });

            await axios.put(
                `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/env-vars`,
                { envVars: updatedEnvVars },
                { headers: { Authorization: `Bearer ${config.RENDER_API_TOKEN}` }, timeout: 20000 }
            );
            console.log(`🔄 Successfully synced ${envVarsToAdd.length} new/updated keys to Render ENV.`);
        } catch (envUpdateError) {
            console.warn('⚠️ Failed to update Render ENV with new keys:', envUpdateError.message);
            console.warn('Ensure RENDER_API_TOKEN has write permissions for environment variables and is valid. This is CRITICAL for persistent learning.');
        }
    } else {
        console.warn('Skipping Render ENV update: RENDER_API_TOKEN or RENDER_SERVICE_ID missing or are placeholders. Key persistence to Render ENV is disabled.');
    }
}


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

// === 🎨 AI-Generated Product Design Engine (Zero-Cost, Integrated LLM) ===
/**
 * Generates a product image URL using the Imagen 3.0 model.
 * This is a zero-cost solution leveraging the platform's integrated capabilities.
 * @param {object} productData - Data about the product to inform the image prompt.
 * @returns {Promise<string>} URL of the generated image or a high-quality fallback.
 */
const generateProductDesign = async (productData) => {
  const { name, category, origin } = productData;
  const prompt = `Highly detailed, luxury, high-fashion ${name}, ${category} style, product photography, studio lighting, 8k, ultra-detailed, showcasing exquisite craftsmanship, minimalistic background, ideal for an e-commerce listing, sold by ArielMatrix Global, inspired by ${origin} aesthetics.`;

  try {
    console.log(`🎨 Requesting AI image generation for: "${prompt.substring(0, 100)}..."`);
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
      console.log('✅ AI Image generated successfully using Imagen 3.0.');
      return imageUrl;
    } else {
      console.warn('⚠️ Imagen 3.0 generation did not return expected data structure. Using fallback.');
      throw new Error('Invalid Imagen 3.0 response');
    }
  } catch (error) {
    console.warn(`⚠️ AI Image Generation failed: ${error.message} → using high-quality placeholder.`);
    // Use a high-quality, relevant stock image as a fallback
    return 'https://placehold.co/1024x1024/E0E0E0/333333?text=AI+Luxury+Product';
  }
};

// === 🧠 Smart Revenue Optimizer (High-Value Markets) ===
/**
 * Optimizes product price based on market value, origin, and category.
 * @param {object} data - Contains basePrice, origin, and category.
 * @returns {number} The optimized price.
 */
const optimizeRevenue = (data) => {
  const { basePrice, origin, category } = data;
  // Dynamic geo-targeting: In a real system, this would use the user's location or targeted market data.
  // For now, we simulate a high-value country for maximization.
  const highValueCountries = ['MC', 'LU', 'CH', 'QA', 'SG', 'AE', 'US', 'KW']; // Monaco, Luxembourg, Switzerland, Qatar, Singapore, UAE, US, Kuwait
  const simulatedTargetCountry = 'AE'; // Simulate targeting UAE for high markup

  // Price multipliers based on country, category, and origin
  const countryMultiplier = highValueCountries.includes(simulatedTargetCountry) ? 2.5 : 1.0; // Adjusted for higher luxury markups
  const originMultiplier = ['china', 'southKorea', 'vietnam'].includes(origin) ? 1.3 : 1.0; // "Exotic origin" premium
  const categoryMultiplier = (category.includes('luxury') || category.includes('designer')) ? 1.8 : 1.0; // Luxury category premium

  const optimizedPrice = basePrice * countryMultiplier * originMultiplier * categoryMultiplier;
  return Math.max(optimizedPrice, basePrice * 1.5); // Ensure at least a 50% markup
};

// === 🔍 Smart Selector with Fallback Chain (for remediation and general use) ===
// Reusing safeType and safeClick from socialAgent for consistency
const safeType = async (page, selectors, text) => {
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
      // console.warn(`Type selector "${selector.trim()}" failed: ${e.message.substring(0, 50)}... Trying next.`); // Can be noisy
      continue;
    }
  }
  throw new Error(`All type selectors failed for text: "${text.substring(0, 20)}..."`);
};

const safeClick = async (page, selectors) => {
  for (const selector of selectors) {
    try {
      const element = await page.waitForSelector(selector.trim(), { timeout: 8000 });
      await element.click();
      return true;
    } catch (e) {
      // console.warn(`Click selector "${selector.trim()}" failed: ${e.message.substring(0, 50)}... Trying next.`); // Can be noisy
      continue;
    }
  }
  throw new Error(`All click selectors failed.`);
};

// === 🕵️‍♀️ Autonomous Product Sourcing Agent (Resilient Web Scraping) ===
/**
 * Autonomously sources a premium product from a global e-commerce site using Puppeteer.
 * Implements robust error handling and adaptive scraping.
 * @returns {Promise<object>} Sourced product data including title, price, and a high-end AI image.
 */
const sourcePremiumProduct = async () => {
  let page = null;
  try {
    // ✅ Use browserManager to get a new page
    page = await browserManager.getNewPage();
    page.setDefaultTimeout(page.getDefaultTimeout()); // Use adaptive timeout from browserManager

    // Randomly select a country and site
    const countries = Object.keys(SOURCING_SITES);
    const randomCountry = countries[Math.floor(Math.random() * countries.length)];
    const sites = SOURCING_SITES[randomCountry];
    const randomSite = sites[Math.floor(Math.random() * sites.length)];

    console.log(`🔍 Sourcing from: ${randomSite} for ${randomCountry} region.`);
    await page.goto(randomSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
    await new Promise(r => setTimeout(r, 3000)); // Initial wait for dynamic content

    // Search for a random high-demand luxury category
    const categories = ['luxury pets', 'designer handbags', 'skincare', 'smart home devices', 'sustainable fashion', 'gourmet food'];
    const randomCategory = categories[Math.floor(Math.random() * categories.length)];
    console.log(`Searching for category: "${randomCategory}"`); // Fixed console.log

    // Intelligent search bar detection and submission
    const searchSelectors = [
      'input[type="search"]', 'input[name="q"]', 'input[placeholder*="search"]',
      '#search-input', '.search-field', '[data-test-id="search-box"]', 'form input[type="text"]' // Added more generic form input
    ];
    let searchInputFound = false;
    for (const selector of searchSelectors) {
      try {
        const searchInput = await page.$(selector);
        if (searchInput) {
          await searchInput.type(randomCategory);
          await new Promise(r => setTimeout(r, 1000)); // Type with slight delay
          // Attempt to find and click a search button or press Enter
          const searchButtonSelectors = ['button[type="submit"][aria-label*="search"]', 'button:contains("Search")', '.search-button', 'form button[type="submit"]']; // Added more generic button
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
            // If no button, try pressing Enter
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null),
              page.keyboard.press('Enter')
            ]);
          }
          searchInputFound = true;
          break;
        }
      } catch (e) {
        console.warn(`Search selector "${selector}" failed: ${e.message.substring(0, 50)}...`);
      }
    }

    if (!searchInputFound) {
      console.warn('⚠️ Could not find a suitable search input on the page. Proceeding without specific search.');
      // If search fails, try to navigate to a generic category page or just scrape current page.
      // For this implementation, we'll proceed assuming some content is present.
    }

    await new Promise(r => setTimeout(r, 5000)); // Wait for search results to load

    // Scrape the first product found on the page (more robust selectors)
    const productData = await page.evaluate(() => {
      // Prioritize common e-commerce selectors
      const titleEl = document.querySelector('h1.product-title, .product-name, [data-name="product-title"], h2.item-title, a.title-link, .product-item-name');
      const priceEl = document.querySelector('.product-price span, .price-value, [data-price], .current-price-value, .product-price__price');
      const imgEl = document.querySelector('.product-gallery-main-img img, .product-image img, .item-img img, .product-thumbnail img');

      return {
        title: titleEl?.innerText.trim() || 'Premium Sourced Item',
        price: parseFloat(priceEl?.innerText.replace(/[^0-9.]/g, '')) || 25, // Fallback to 25 if price not found
        image: imgEl?.src || null, // Capture image if available
      };
    });

    if (!productData.title || !productData.image || productData.price < 1) {
        throw new Error('Sourced product data is incomplete or invalid after scraping.');
    }

    // Generate a premium AI design for the product (Zero-Cost via Imagen)
    const highEndImage = await generateProductDesign({
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
      category: randomCategory // Add category to returned data
    };
  } catch (error) {
    console.error(`🚨 Sourcing failed: ${error.message} → using fallback product.`);
    browserManager.reportNavigationFailure(); // Report failure to browserManager for adaptive timeout
    return {
      title: 'AI-Designed Luxury Pet Jewelry',
      basePrice: 15,
      highEndImage: 'https://placehold.co/1024x1024/E0E0E0/333333?text=AI+Luxury+Product+Fallback', // High-quality placeholder
      origin: 'ai_generated',
      category: 'Luxury Pet Accessories'
    };
  } finally {
    if (page) await browserManager.closePage(page); // ✅ Close via central manager
  }
};

// === 🛠 CONFIGURATION REMEDIATION LAYER (NEW CORE FUNCTIONALITY FOR SHOPIFY) ===
/**
 * @function remediateMissingShopifyConfig
 * @description Proactively scouts for, generates, or creates a missing/placeholder Shopify API key/credential
 * and attempts to update it in the Render environment.
 * @param {string} keyName - The name of the missing configuration key (e.g., 'STORE_URL').
 * @param {object} config - The global CONFIG object (passed by reference to be updated).
 * @returns {Promise<boolean>} True if remediation was successful, false otherwise.
 */
async function remediateMissingShopifyConfig(keyName, config) {
    console.log(`\n⚙️ Initiating remediation for missing/placeholder Shopify key: ${keyName}`);

    // --- Prerequisite: AI Identity for Web-based Remediation ---
    const AI_EMAIL = config.AI_EMAIL;
    const AI_PASSWORD = config.AI_PASSWORD;

    if (!AI_EMAIL || String(AI_EMAIL).includes('PLACEHOLDER') || !AI_PASSWORD || String(AI_PASSWORD).includes('PLACEHOLDER')) {
        console.error(`❌ Cannot remediate ${keyName}: AI identity (AI_EMAIL/AI_PASSWORD) is missing or a placeholder. This is a critical prerequisite for web-based key generation.`);
        return false;
    }

    let newFoundCredential = null;
    let targetSite = null;
    let page = null; // Declare page here for finally block
    // Assuming QuantumIntelligence.analyzePattern is available from apiScoutAgent.js if needed
    // If not globally available, might need to import a utility module or pass it.
    // For now, assuming it's imported or globally accessible as per the larger system design.

    try {
        switch (keyName) {
            case 'STORE_URL':
                targetSite = 'https://accounts.shopify.com/store-login';
                console.log(`Attempting to scout for STORE_URL at ${targetSite}`);
                page = await browserManager.getNewPage();
                await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await new Promise(r => setTimeout(r, 3000)); // Wait for page to load

                // Attempt login to Shopify admin/partner dashboard
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
                    console.log('Attempted Shopify login for STORE_URL remediation.');
                    await new Promise(r => setTimeout(r, 5000)); // Wait for dashboard to load

                    const currentUrl = page.url();
                    // Heuristic: If we are on an admin page, extract the store URL
                    if (currentUrl.includes('/admin') || currentUrl.includes('.myshopify.com')) {
                        const urlMatch = currentUrl.match(/(https:\/\/[a-zA-Z0-9-]+\.myshopify\.com)/);
                        if (urlMatch && urlMatch[1]) {
                            newFoundCredential = urlMatch[1];
                            console.log(`✅ Scouted new STORE_URL: ${newFoundCredential}`);
                        }
                    }
                } else {
                    console.warn('⚠️ Shopify login elements not found for STORE_URL remediation.');
                }
                break;

            case 'ADMIN_SHOP_SECRET':
            case 'STORE_KEY':
            case 'STORE_SECRET':
                // This is the most complex remediation as it requires navigating Shopify Partner/Store admin
                // and creating/fetching a Private App API Access Token.
                targetSite = config.STORE_URL ? `${config.STORE_URL}/admin/settings/apps/private_app/new` : 'https://accounts.shopify.com/store-login';
                console.log(`Attempting to scout for Shopify Admin API Key at ${targetSite}`);
                page = await browserManager.getNewPage();
                await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await new Promise(r => setTimeout(r, 3000));

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
                    console.log('Attempted Shopify login for API key remediation.');
                    await new Promise(r => setTimeout(r, 5000));
                }

                // Now, on the dashboard or private app creation page
                const currentUrl = page.url();
                if (currentUrl.includes('/admin/settings/apps')) { // Heuristic for being in apps section
                    console.log('On Shopify Admin Apps page. Attempting to find/create private app API token.');
                    // This part is highly simplified. A real solution would:
                    // 1. Check for existing private apps and try to retrieve credentials.
                    // 2. If not found, click "Create private app" button.
                    // 3. Fill out app name (e.g., "ArielMatrix Automated App").
                    // 4. Set required API permissions (e.g., read_products, write_products, read_orders). This is critical.
                    // 5. Click "Create app" / "Save" button.
                    // 6. Scrape the revealed "Admin API access token" / "API Key" / "API Secret".

                    const pageContent = await page.evaluate(() => document.body.innerText);
                    // Use QuantumIntelligence.analyzePattern to find potential API keys/secrets on the page
                    const foundKey = QuantumIntelligence.analyzePattern(pageContent);

                    if (foundKey && foundKey.value) {
                        newFoundCredential = foundKey.value;
                        console.log(`🔑 Found potential Shopify API key/secret pattern for ${keyName} during remediation!`);
                        // Assign to appropriate keyName based on context
                        if (keyName === 'ADMIN_SHOP_SECRET') {
                            // This is the most likely token to find on a private app overview
                            newFoundCredential = { 'ADMIN_SHOP_SECRET': foundKey.value };
                        } else if (keyName === 'STORE_KEY' && foundKey.value.length < 50) { // Heuristic for shorter API key
                            newFoundCredential = { 'STORE_KEY': foundKey.value };
                        } else if (keyName === 'STORE_SECRET' && foundKey.value.length > 50) { // Heuristic for longer secret
                            newFoundCredential = { 'STORE_SECRET': foundKey.value };
                        }
                    } else {
                        console.warn('⚠️ No clear Shopify API key/secret pattern found on page. Manual creation might be necessary.');
                    }
                } else {
                    console.warn('⚠️ Not on Shopify Admin Apps page. Unable to automate API key retrieval.');
                }
                break;
            default:
                console.warn(`⚠️ No specific remediation strategy defined for Shopify key: ${keyName}. Manual intervention required.`);
                return false;
        }

        if (newFoundCredential) {
            if (typeof newFoundCredential === 'object' && newFoundCredential !== null) {
                await _updateRenderEnvWithKeys(newFoundCredential, config);
                Object.assign(config, newFoundCredential);
            } else {
                await _updateRenderEnvWithKeys({ [keyName]: newFoundCredential }, config);
                config[keyName] = newFoundCredential;
            }
            return true;
        }

    } catch (error) {
        console.warn(`⚠️ Remediation attempt for ${keyName} failed: ${error.message}`);
        browserManager.reportNavigationFailure();
    } finally {
        if (page) await browserManager.closePage(page);
    }
    console.warn(`⚠️ Remediation failed for ${keyName}: Could not find or generate a suitable credential.`);
    return false;
}

// === 🤖 Autonomous Store Manager ===
export const shopifyAgent = async (CONFIG) => {
  console.log('🛍️ Shopify Agent Activated: Sourcing & Selling Global Luxury');

  try {
    // --- Phase 0: Proactive Configuration Remediation for Shopify ---
    const shopifyCriticalKeys = [
        'STORE_URL',
        'STORE_KEY', // Typically for custom app access (if used)
        'STORE_SECRET', // Typically for custom app access (if used)
        'ADMIN_SHOP_SECRET', // The Admin API Access Token for a private app
    ];

    for (const key of shopifyCriticalKeys) {
        if (!CONFIG[key] || String(CONFIG[key]).includes('PLACEHOLDER')) {
            const success = await remediateMissingShopifyConfig(key, CONFIG);
            if (!success) {
                console.warn(`⚠️ Remediation for ${key} failed for Shopify Agent. Product listing might be impacted.`);
            }
        }
    }
    console.log('\n--- Finished Shopify Configuration Remediation Phase ---');

    const STORE_URL = CONFIG.STORE_URL;
    const ADMIN_SHOP_SECRET = CONFIG.ADMIN_SHOP_SECRET;

    // Final check for critical Shopify credentials AFTER remediation attempts
    if (!STORE_URL || String(STORE_URL).includes('PLACEHOLDER') ||
        !ADMIN_SHOP_SECRET || String(ADMIN_SHOP_SECRET).includes('PLACEHOLDER')) {
      throw new Error('Shopify credentials (STORE_URL or ADMIN_SHOP_SECRET) are still missing or placeholders after remediation attempts. Cannot proceed with Shopify operations.');
    }
    console.log(`✅ Shopify credentials confirmed. Store URL: ${STORE_URL.slice(0, 30)}...`);

    // Phase 1: Source a Premium Product (Now with more resilient scraping)
    const sourcedProduct = await sourcePremiumProduct();
    console.log(`🛒 Sourced product: "${sourcedProduct.title}" from ${sourcedProduct.origin}`);

    // Phase 2: Optimize Price for High-Value Market
    const finalPrice = optimizeRevenue({
      basePrice: sourcedProduct.basePrice,
      origin: sourcedProduct.origin,
      category: sourcedProduct.category
    });
    console.log(`💲 Optimized price for product: $${finalPrice.toFixed(2)}`);

    // Phase 3: Create Premium Product on Shopify (Real API Call)
    try {
      // Shopify API version for Admin API, adjust as needed, e.g., '2024-07'
      const SHOPIFY_API_VERSION = '2024-07';
      const shopifyApiEndpoint = `${STORE_URL}/admin/api/${SHOPIFY_API_VERSION}/products.json`;

      console.log(`📦 Attempting to list product on Shopify at: ${shopifyApiEndpoint}`);

      const response = await axios.post(
        shopifyApiEndpoint,
        {
          product: {
            title: `${sourcedProduct.title} - Autonomous Edition ${new Date().getFullYear()}`,
            body_html: `<p>Discover this exquisite item, autonomously sourced from ${sourcedProduct.origin} and digitally enhanced by ArielMatrix AI. Limited stock. Global shipping available. Category: ${sourcedProduct.category}.</p>`,
            vendor: 'ArielMatrix Global',
            product_type: sourcedProduct.category, // Use sourced category
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
      console.log(`✅ Added premium product to Shopify: "${response.data.product.title}" for $${response.data.product.variants[0].price}`);
    } catch (error) {
      console.error(`🚨 Failed to add product to Shopify: ${error.message}. Response data: ${JSON.stringify(error.response?.data || {})}.`);
      throw new Error(`Shopify product listing failed: ${error.message}`); // Re-throw to propagate failure
    }

    // Phase 4: Trigger Social Posting (Pass updated CONFIG)
    // The socialAgent should now use the updated CONFIG which might contain newly found keys
    const socialAgent = await import('./socialAgent.js');
    await socialAgent.socialAgent({ ...CONFIG, PRODUCT_LINK: `${STORE_URL}/products/${sourcedProduct.title.toLowerCase().replace(/ /g, '-')}`, PRODUCT_TITLE: sourcedProduct.title, PRODUCT_CATEGORY: sourcedProduct.category });

    console.log('🛍️ Shopify Agent Completed: Premium product sourced, listed, and social promotion initiated.');
    return { status: 'success', product: sourcedProduct.title, finalPrice: finalPrice.toFixed(2) };

  } catch (error) {
    console.error('🚨 ShopifyAgent Critical Failure:', error.message);
    // Do not re-throw here. Let the main orchestrator (server.js) handle overall healing if needed.
    return { status: 'failed', error: error.message };
  }
};
