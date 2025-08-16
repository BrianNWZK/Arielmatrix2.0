// backend/agents/socialAgent.js
import { browserManager } from './browserManager.js'; // ✅ Import the central manager
import axios from 'axios';
import crypto from 'crypto';
import path from 'path';
import { TwitterApi } from 'twitter-api-v2'; // For X (Twitter) API interaction

// Reusable Render ENV update function (extracted from previous agents)
async function _updateRenderEnvWithKeys(keysToSave, config) {
    if (Object.keys(keysToSave).length === 0) return;

    if (config.RENDER_API_TOKEN && !String(config.RENDER_API_TOKEN).includes('PLACEHOLDER') &&
        config.RENDER_SERVICE_ID && !String(config.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        console.log('Attempting to sync new keys to Render environment variables via Social Agent...');
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

// === 🔍 Smart Selector with Fallback Chain ===
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

// === 📸 AI-Generated Women-Centric Content (Zero-Cost & Adaptive) ===
/**
 * Generates compelling women-centric content for social media, including an image and caption.
 * Prioritizes real API keys, falls back to integrated LLM for zero-cost generation.
 * @param {string} countryCode - Target country for localization.
 * @param {object} CONFIG - Global configuration with API keys.
 * @param {string} productTitle - Title of the product being promoted.
 * @param {string} productCategory - Category of the product.
 * @returns {Promise<object>} Content object with title, caption, and media URL.
 */
const generateWomenCentricContent = async (countryCode, CONFIG, productTitle, productCategory) => {
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
  const apiCallTimeout = 7000; // Increased timeout for external API calls

  let mediaUrl = null;
  let newsTitle = null;
  let captionText = '';

  // --- Attempt to use DOG_API_KEY for a real image ---
  if (CONFIG.DOG_API_KEY && !String(CONFIG.DOG_API_KEY).includes('PLACEHOLDER')) {
    try {
      console.log('Attempting to fetch real dog image from TheDogAPI...');
      const dogRes = await axios.get('https://api.thedogapi.com/v1/images/search?limit=1', {
        headers: { 'x-api-key': CONFIG.DOG_API_KEY },
        timeout: apiCallTimeout
      });
      if (dogRes.data && dogRes.data[0] && dogRes.data[0].url) {
        mediaUrl = dogRes.data[0].url;
        console.log('✅ Fetched real dog image.');
      }
    } catch (e) {
      console.warn(`⚠️ TheDogAPI failed: ${e.message.substring(0, 100)}. Falling back to AI image.`);
    }
  }

  // --- Fallback to Imagen 3.0 for image generation (Zero-Cost) ---
  if (!mediaUrl) {
    try {
      console.log('🎨 Requesting AI image generation (Imagen 3.0) as fallback...');
      const imagePrompt = `High-quality image of a luxurious ${productTitle || interest}, suitable for a social media post targeting high-net-worth women. Studio lighting, elegant, detailed, professional product photography.`;
      const payload = { instances: { prompt: imagePrompt }, parameters: { "sampleCount": 1 } };
      const apiKey = ""; // Canvas will provide this dynamically
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-002:predict?key=${apiKey}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.predictions && result.predictions.length > 0 && result.predictions[0].bytesBase64Encoded) {
        mediaUrl = `data:image/png;base64,${result.predictions[0].bytesBase64Encoded}`;
        console.log('✅ AI Image generated successfully using Imagen 3.0.');
      } else {
        throw new Error('Invalid Imagen 3.0 response');
      }
    } catch (error) {
      console.warn(`⚠️ AI Image Generation failed: ${error.message} → using generic fallback placeholder.`);
      mediaUrl = 'https://placehold.co/1024x1024/E0E0E0/333333?text=AI+Generated+Content';
    }
  }

  // --- Attempt to use NEWS_API_KEY for a real news title ---
  if (CONFIG.NEWS_API_KEY && !String(CONFIG.NEWS_API_KEY).includes('PLACEHOLDER')) {
    try {
      console.log('Attempting to fetch real news title from NewsAPI...');
      const newsRes = await axios.get('https://newsapi.org/v2/top-headlines', {
        params: { country: countryCode.toLowerCase(), category: 'health', pageSize: 1 },
        headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
        timeout: apiCallTimeout
      });
      if (newsRes.data && newsRes.data.articles && newsRes.data.articles[0] && newsRes.data.articles[0].title) {
        newsTitle = newsRes.data.articles[0].title;
        console.log('✅ Fetched real news title.');
      }
    } catch (e) {
      console.warn(`⚠️ NewsAPI failed: ${e.message.substring(0, 100)}. Falling back to AI generated title.`);
    }
  }

  // --- Fallback to LLM for news title generation ---
  if (!newsTitle) {
    try {
      console.log('Generating news title using LLM as fallback...');
      const llmPrompt = `Generate a compelling, short news headline (under 15 words) about "${interest}" trends in "${countryName}", targeting high-net-worth women. Make it sound like it's from a luxury lifestyle magazine.`;
      const payload = { contents: [{ role: "user", parts: [{ text: llmPrompt }] }] };
      const apiKey = ""; // Canvas will provide this dynamically
      const llmApiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

      const response = await fetch(llmApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
        newsTitle = result.candidates[0].content.parts[0].text.replace(/^["']|["']$/g, ''); // Remove quotes
        console.log('✅ AI News title generated successfully.');
      } else {
        throw new Error('Invalid LLM response for news title');
      }
    } catch (error) {
      console.warn(`⚠️ LLM News title generation failed: ${error.message} → using generic title.`);
      newsTitle = `Why Elite Women Are Investing in ${interest}`; // Generic fallback
    }
  }

  // Final caption assembly
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
};

// === 🔗 Smart Link Shortener (Tiered Fallback with Remediation Check) ===
/**
 * Shortens a given URL using multiple services, prioritizing Short.io, then AdFly, Linkvertise, NowPayments.
 * Checks for API key validity before attempting.
 * @param {string} url - The URL to shorten.
 * @param {object} CONFIG - Global configuration.
 * @returns {Promise<string>} The shortened URL or the original URL if all fail.
 */
const shortenLink = async (url, CONFIG) => {
  const apiCallTimeout = 8000; // Increased timeout for shortening APIs

  // --- PRIMARY: Short.io API ---
  if (CONFIG.SHORTIO_API_KEY && !String(CONFIG.SHORTIO_API_KEY).includes('PLACEHOLDER') &&
      CONFIG.SHORTIO_URL && !String(CONFIG.SHORTIO_URL).includes('PLACEHOLDER')) {
    try {
      console.log('Attempting Short.io shortening...');
      const shortIoUrl = CONFIG.SHORTIO_URL.trim();
      const response = await axios.post(
        `${shortIoUrl}/links/public`,
        {
          domain: CONFIG.SHORTIO_DOMAIN || 'qgs.gs', // Use a default domain if not specified
          originalURL: url
        },
        {
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'authorization': CONFIG.SHORTIO_API_KEY,
            'userId': CONFIG.SHORTIO_USER_ID || 'autonomous_agent' // Default userId if not provided
          },
          timeout: apiCallTimeout
        }
      );
      if (response.data?.shortURL) {
        console.log(`✅ Short.io success: ${response.data.shortURL}`);
        return response.data.shortURL;
      }
      throw new Error('Short.io returned no shortURL');
    } catch (error) {
      console.warn(`⚠️ Short.io failed: ${error.message.substring(0, 100)}. Falling back.`);
    }
  } else {
    console.warn('⚠️ Short.io skipped: API Key or URL missing/placeholder. Falling back.');
  }

  // --- SECONDARY: AdFly API ---
  if (CONFIG.ADFLY_API_KEY && !String(CONFIG.ADFLY_API_KEY).includes('PLACEHOLDER') &&
      CONFIG.ADFLY_USER_ID && !String(CONFIG.ADFLY_USER_ID).includes('PLACEHOLDER') &&
      CONFIG.ADFLY_PASS && !String(CONFIG.ADFLY_PASS).includes('PLACEHOLDER')) { // Added ADFLY_PASS check
    try {
      console.log('Attempting AdFly shortening...');
      const adflyUrl = CONFIG.ADFLY_URL?.trim() || 'https://api.adf.ly/v1/shorten';
      const response = await axios.get(adflyUrl, { // Adfly API is typically GET with query params
          params: {
              url: url,
              api_key: CONFIG.ADFLY_API_KEY,
              uid: CONFIG.ADFLY_USER_ID, // Correct AdFly user ID param
              key: CONFIG.ADFLY_PASS, // AdFly uses 'key' for the token/password
              domain: 'qgs.gs',
              advert_type: 'int'
          },
          timeout: apiCallTimeout
      });
      if (response.data?.short_url) {
        console.log(`✅ AdFly success: ${response.data.short_url}`);
        return response.data.short_url;
      }
      throw new Error('AdFly returned no short_url');
    } catch (error) {
      console.warn(`⚠️ AdFly failed: ${error.message.substring(0, 100)}. Falling back.`);
    }
  } else {
    console.warn('⚠️ AdFly skipped: API Key, User ID, or Password missing/placeholder. Falling back.');
  }

  // --- TERTIARY: Linkvertise (Browser Automation) ---
  if (CONFIG.LINKVERTISE_EMAIL && !String(CONFIG.LINKVERTISE_EMAIL).includes('PLACEHOLDER') &&
      CONFIG.LINKVERTISE_PASSWORD && !String(CONFIG.LINKVERTISE_PASSWORD).includes('PLACEHOLDER')) {
    let page = null;
    try {
      console.log('Attempting Linkvertise shortening via browser automation...');
      page = await browserManager.getNewPage(); // ✅ Use central manager
      await page.goto('https://publisher.linkvertise.com/login', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
      await quantumDelay(2000);

      await safeType(page, ['input[name="email"]', 'input[type="email"]'], CONFIG.LINKVERTISE_EMAIL);
      await safeType(page, ['input[name="password"]', 'input[type="password"]'], CONFIG.LINKVERTISE_PASSWORD);
      await safeClick(page, ['button[type="submit"]', 'button:contains("Login")']);
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null); // Wait for login to complete
      await quantumDelay(5000); // Give time for dashboard to load

      // Check if logged in before attempting to create link
      const isLoggedIn = await page.evaluate(() => document.querySelector('a[href*="/dashboard"]') !== null);
      if (!isLoggedIn) {
          throw new Error('Linkvertise login failed.');
      }

      await page.goto('https://publisher.linkvertise.com/dashboard/links/create', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
      await quantumDelay(2000);

      await safeType(page, ['input[name="target_url"]', 'input[placeholder="Enter your URL"]'], url); // Corrected Linkvertise input name
      await safeClick(page, ['button[type="submit"]', 'button:contains("Create Link")']); // Corrected Linkvertise button text
      await page.waitForSelector('input.share-link-input', { timeout: 10000 }); // Wait for the short link input to appear
      await quantumDelay(3000);

      const shortLink = await page.evaluate(() => {
        const input = document.querySelector('input.share-link-input');
        return input?.value || null;
      });

      if (shortLink) {
        console.log(`✅ Linkvertise success: ${shortLink}`);
        return shortLink;
      }
      throw new Error('Linkvertise could not retrieve short link.');
    } catch (error) {
      console.warn(`⚠️ Linkvertise failed: ${error.message.substring(0, 100)}. Falling back.`);
    } finally {
      if (page) await browserManager.closePage(page); // ✅ Close via central manager
    }
  } else {
    console.warn('⚠️ Linkvertise skipped: Credentials missing/placeholder. Falling back.');
  }

  // === QUATERNARY: NowPayments ===
  if (CONFIG.NOWPAYMENTS_API_KEY && !String(CONFIG.NOWPAYMENTS_API_KEY).includes('PLACEHOLDER')) {
    try {
      console.log('Attempting NowPayments invoice URL generation...');
      const npRes = await axios.post('https://api.nowpayments.io/v1/invoice', {
        price_amount: 0.01, // Smallest possible amount for an "access pass"
        price_currency: 'usd',
        pay_currency: 'usdt',
        order_description: `Access Pass: ${url}`,
        ipn_callback_url: 'https://arielmatrix2-0-q0y6.onrender.com/nowpayments-callback' // Provide a real callback URL if possible
      }, {
        headers: { 'x-api-key': CONFIG.NOWPAYMENTS_API_KEY },
        timeout: apiCallTimeout
      });
      if (npRes.data?.invoice_url) {
        console.log(`✅ NowPayments success: ${npRes.data.invoice_url}`);
        return npRes.data.invoice_url;
      }
      throw new Error('NowPayments returned no invoice_url');
    } catch (error) {
      console.warn(`⚠️ NowPayments failed: ${error.message.substring(0, 100)}. Falling back to direct URL.`);
    }
  } else {
    console.warn('⚠️ NowPayments skipped: API Key missing/placeholder. Falling back to direct URL.');
  }

  console.warn(`🚨 All shortening services failed. Using direct URL: ${url}`);
  return url; // Fallback to original URL if all else fails
};

// === 🛠 CONFIGURATION REMEDIATION LAYER (NEW CORE FUNCTIONALITY FOR SOCIAL AGENT) ===
/**
 * Proactively scouts for, generates, or creates a missing/placeholder social media credential or API key
 * and attempts to update it in the Render environment.
 * @param {string} keyName - The name of the missing configuration key (e.g., 'PINTEREST_EMAIL').
 * @param {object} config - The global CONFIG object (passed by reference to be updated).
 * @returns {Promise<boolean>} True if remediation was successful, false otherwise.
 */
async function remediateMissingSocialConfig(keyName, config) {
    console.log(`\n⚙️ Initiating remediation for missing/placeholder social key: ${keyName}`);

    const AI_EMAIL = config.AI_EMAIL;
    const AI_PASSWORD = config.AI_PASSWORD;

    if (!AI_EMAIL || String(AI_EMAIL).includes('PLACEHOLDER') || !AI_PASSWORD || String(AI_PASSWORD).includes('PLACEHOLDER')) {
        console.error(`❌ Cannot remediate ${keyName}: AI identity (AI_EMAIL/AI_PASSWORD) is missing or a placeholder. This is a critical prerequisite for web-based key generation.`);
        return false;
    }

    let newFoundCredential = null;
    let targetSite = null;
    let page = null; // Declare page here for finally block

    try {
        switch (keyName) {
            case 'PINTEREST_EMAIL':
            case 'PINTEREST_PASS':
                targetSite = 'https://pinterest.com/login';
                console.log(`Attempting to remediate Pinterest credentials at ${targetSite}`);
                page = await browserManager.getNewPage();
                await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);
                await safeType(page, ['input[placeholder="Email or username"]', 'input[type="text"]', 'input[name="id"]'], AI_EMAIL);
                await safeType(page, ['input[placeholder="Password"]', 'input[type="password"]', 'input[name="password"]'], AI_PASSWORD);
                await safeClick(page, ['button[type="submit"]', 'button[data-test-id="login-button"]']);
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: page.getDefaultTimeout() }).catch(() => null);
                await quantumDelay(5000);

                const pinterestLoggedIn = await page.evaluate(() => document.querySelector('a[href*="/pin-builder"]') !== null);
                if (pinterestLoggedIn) {
                    console.log('✅ Pinterest login successful during remediation. Credentials confirmed.');
                    // If login successful, use AI_EMAIL/AI_PASSWORD as the Pinterest credentials
                    newFoundCredential = { PINTEREST_EMAIL: AI_EMAIL, PINTEREST_PASS: AI_PASSWORD };
                } else {
                    console.warn('⚠️ Pinterest login failed during remediation.');
                }
                break;

            case 'X_USERNAME':
            case 'X_PASSWORD':
            case 'X_API_KEY': // X_API_KEY could be found post-login if it's in a developer dashboard
                targetSite = 'https://twitter.com/login';
                console.log(`Attempting to remediate X (Twitter) credentials/API Key at ${targetSite}`);
                page = await browserManager.getNewPage();
                await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);

                // Check for 'Use phone, email, or username' link and click if present
                const useOtherLogin = await page.$('a[href*="flow/login?input_flow_data"]');
                if (useOtherLogin) {
                    await useOtherLogin.click();
                    await quantumDelay(1000);
                }

                await safeType(page, ['input[name="text"]', 'input[type="text"]', 'input[autocomplete="username"]'], AI_EMAIL);
                await safeClick(page, ['button:contains("Next")']);
                await quantumDelay(2000);

                await safeType(page, ['input[name="password"]', 'input[type="password"]'], AI_PASSWORD);
                await safeClick(page, ['button[data-testid="LoginForm_Login_Button"]', 'button[type="submit"]']);
                await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null);
                await quantumDelay(5000);

                const xLoggedIn = await page.evaluate(() => document.querySelector('a[data-testid="AppTabBar_Home_Link"]') !== null);
                if (xLoggedIn) {
                    console.log('✅ X (Twitter) login successful during remediation. Credentials confirmed.');
                    newFoundCredential = { X_USERNAME: AI_EMAIL, X_PASSWORD: AI_PASSWORD }; // Use AI credentials for X
                    // Attempt to find X_API_KEY (Bearer Token) on developer dashboard
                    await page.goto('https://developer.twitter.com/en/portal/dashboard', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null);
                    await quantumDelay(3000);
                    const pageContent = await page.evaluate(() => document.body.innerText);
                    const foundApiKey = QuantumIntelligence.analyzePattern(pageContent);
                    if (foundApiKey && foundApiKey.value) {
                        newFoundCredential.X_API_KEY = foundApiKey.value;
                        console.log('🔑 Found X_API_KEY during remediation!');
                    } else {
                        console.warn('⚠️ Could not find X_API_KEY on developer dashboard during remediation.');
                    }
                } else {
                    console.warn('⚠️ X (Twitter) login failed during remediation.');
                }
                break;

            case 'REDDIT_USER':
            case 'REDDIT_PASS':
                targetSite = 'https://www.reddit.com/login/';
                console.log(`Attempting to remediate Reddit credentials at ${targetSite}`);
                page = await browserManager.getNewPage();
                await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);
                await safeType(page, ['input[name="username"]', '#loginUsername'], AI_EMAIL); // Reddit usually uses username not email
                await safeType(page, ['input[name="password"]', '#loginPassword'], AI_PASSWORD);
                await safeClick(page, ['button[type="submit"]', '.AnimatedForm__submitButton']);
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: page.getDefaultTimeout() }).catch(() => null);
                await quantumDelay(5000);

                const redditLoggedIn = await page.evaluate(() => document.querySelector('a[href="/r/all/"]') !== null); // Check for a common element on logged-in Reddit
                if (redditLoggedIn) {
                    console.log('✅ Reddit login successful during remediation. Credentials confirmed.');
                    newFoundCredential = { REDDIT_USER: AI_EMAIL, REDDIT_PASS: AI_PASSWORD }; // Assuming AI_EMAIL is used as username for simplicity
                } else {
                    console.warn('⚠️ Reddit login failed during remediation.');
                }
                break;

            case 'DOG_API_KEY':
                targetSite = 'https://thedogapi.com/signup';
                console.log(`Attempting to scout for DOG_API_KEY at ${targetSite}`);
                page = await browserManager.getNewPage();
                await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);
                const pageContentDog = await page.evaluate(() => document.body.innerText);
                const foundDogKey = QuantumIntelligence.analyzePattern(pageContentDog);
                if (foundDogKey && foundDogKey.value) {
                    newFoundCredential = foundDogKey.value;
                    console.log('🔑 Found DOG_API_KEY during remediation!');
                } else {
                    // If no key found, try to sign up/login if it leads to key
                    // This is a simplified remediation, more complex would automate signup
                    console.warn('⚠️ Could not find DOG_API_KEY on signup page directly. Manual signup might be needed.');
                }
                break;

            case 'NEWS_API':
                targetSite = 'https://newsapi.org/register';
                console.log(`Attempting to scout for NEWS_API at ${targetSite}`);
                page = await browserManager.getNewPage();
                await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);
                const pageContentNews = await page.evaluate(() => document.body.innerText);
                const foundNewsKey = QuantumIntelligence.analyzePattern(pageContentNews);
                if (foundNewsKey && foundNewsKey.value) {
                    newFoundCredential = foundNewsKey.value;
                    console.log('🔑 Found NEWS_API_KEY during remediation!');
                } else {
                    console.warn('⚠️ Could not find NEWS_API_KEY on signup page directly. Manual signup might be needed.');
                }
                break;

            default:
                console.warn(`⚠️ No specific remediation strategy defined for ${keyName}. Manual intervention required.`);
                return false;
        }

        if (newFoundCredential) {
            // If it's an object (for multiple credentials like Pinterest, X, Reddit)
            if (typeof newFoundCredential === 'object' && newFoundCredential !== null) {
                await _updateRenderEnvWithKeys(newFoundCredential, config);
                Object.assign(config, newFoundCredential); // Update in-memory
            } else { // Single key string
                await _updateRenderEnvWithKeys({ [keyName]: newFoundCredential }, config);
                config[keyName] = newFoundCredential; // Update in-memory
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


// === 🚀 Autonomous Stealth Posting Engine ===
export const socialAgent = async (CONFIG) => {
  console.log('📣 Social Agent Activated: Curating & Posting High-Value Content.');

  try {
    // --- Phase 0: Proactive Configuration Remediation for Social Agent ---
    const socialCriticalKeys = [
        'PINTEREST_EMAIL',
        'PINTEREST_PASS',
        'X_USERNAME',
        'X_PASSWORD',
        'X_API_KEY', // Check for bearer token
        'REDDIT_USER',
        'REDDIT_PASS',
        'DOG_API_KEY',
        'NEWS_API',
        'ADFLY_API_KEY', // Check all Adfly components if used
        'ADFLY_USER_ID',
        'ADFLY_PASS',
        'ADFLY_URL',
        'SHORTIO_API_KEY',
        'SHORTIO_URL',
        'SHORTIO_USER_ID',
        'LINKVERTISE_EMAIL', // Check Linkvertise components
        'LINKVERTISE_PASSWORD',
        'NOWPAYMENTS_API_KEY'
    ];

    for (const key of socialCriticalKeys) {
        // Only remediate if the key is explicitly missing OR is a PLACEHOLDER
        if (!CONFIG[key] || String(CONFIG[key]).includes('PLACEHOLDER')) {
            const success = await remediateMissingSocialConfig(key, CONFIG);
            if (!success) {
                console.warn(`⚠️ Remediation for ${key} failed for Social Agent. Related functionality might be limited.`);
            }
        }
    }
    console.log('\n--- Finished Social Configuration Remediation Phase ---');

    // Final checks for critical credentials after remediation attempts
    const PINTEREST_EMAIL = CONFIG.PINTEREST_EMAIL;
    const PINTEREST_PASS = CONFIG.PINTEREST_PASS;
    const X_USERNAME = CONFIG.X_USERNAME;
    const X_PASSWORD = CONFIG.X_PASSWORD;
    const REDDIT_USER = CONFIG.REDDIT_USER;
    const REDDIT_PASS = CONFIG.REDDIT_PASS;
    const X_API_KEY = CONFIG.X_API_KEY;

    // Determine if any social platform is viable for posting
    const canPostToPinterest = PINTEREST_EMAIL && !String(PINTEREST_EMAIL).includes('PLACEHOLDER');
    const canPostToX = (X_USERNAME && !String(X_USERNAME).includes('PLACEHOLDER')) || (X_API_KEY && !String(X_API_KEY).includes('PLACEHOLDER'));
    const canPostToReddit = REDDIT_USER && !String(REDDIT_USER).includes('PLACEHOLDER');

    if (!canPostToPinterest && !canPostToX && !canPostToReddit) {
        console.warn('❌ All primary social media credentials missing or placeholders after remediation. Skipping socialAgent execution.');
        return { success: false, error: 'All social media credentials missing or invalid.' };
    }
    console.log('✅ Social Media readiness confirmed for available platforms.');


    // 1. Select High-Value Country
    const tier1Countries = [
      ...HIGH_VALUE_REGIONS.WESTERN_EUROPE,
      ...HIGH_VALUE_REGIONS.MIDDLE_EAST
    ];
    const countryCode = tier1Countries[Math.floor(Math.random() * tier1Countries.length)];

    // 2. Generate AI Content (pass product details from CONFIG if available)
    const { title, caption, media } = await generateWomenCentricContent(
        countryCode,
        CONFIG,
        CONFIG.PRODUCT_TITLE, // From shopifyAgent or other source
        CONFIG.PRODUCT_CATEGORY // From shopifyAgent or other source
    );

    // 3. Shorten Links (Zero-Cost & Tiered Fallback)
    const [affiliateLink, monitorLink] = await Promise.all([
      shortenLink(CONFIG.PRODUCT_LINK || 'https://arielmatrix.io/products/luxury-item-example', CONFIG), // Use actual product link if available
      shortenLink(CONFIG.UPTIMEROBOT_AFFILIATE_LINK || 'https://arielmatrix.io/monitor', CONFIG) // Fallback monitor link
    ]);

    // Replace placeholders in caption with actual shortened links
    const finalCaption = caption
      .replace('{{AFF_LINK}}', affiliateLink)
      .replace('{{MONITOR_LINK}}', monitorLink);

    // 4. Posting to Social Platforms (Autonomous & Adaptive)
    let postResults = {};

    // --- Post to Pinterest ---
    if (canPostToPinterest) {
        let page = null;
        try {
            console.log('🚀 Attempting to post to Pinterest...');
            page = await browserManager.getNewPage(); // ✅ Use central manager

            await page.goto('https://pinterest.com/login', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
            await quantumDelay(2000);

            await safeType(page, ['input[placeholder="Email or username"]', 'input[type="text"]', 'input[name="id"]'], PINTEREST_EMAIL);
            await safeType(page, ['input[placeholder="Password"]', 'input[type="password"]', 'input[name="password"]'], PINTEREST_PASS);
            await safeClick(page, ['button[type="submit"]', 'button[data-test-id="login-button"]']);
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: page.getDefaultTimeout() }).catch(() => null);
            await quantumDelay(5000);

            const loggedIn = await page.evaluate(() => document.querySelector('a[href*="/pin-builder"]') !== null);
            if (!loggedIn) throw new Error('Pinterest login failed.');

            await page.goto('https://pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
            await quantumDelay(2000);

            await safeType(page, ['[data-test-id="pin-title-input"]', 'textarea[name="title"]'], title);
            await safeType(page, ['[data-test-id="pin-description-input"]', 'textarea[name="description"]'], finalCaption);
            await safeType(page, ['input[placeholder="Add a destination link"]'], affiliateLink); // Add affiliate link

            // Handle file upload for media
            const fileInput = await page.$('input[type="file"]');
            if (fileInput) {
                // For data:image/png;base64 URLs generated by Imagen, Puppeteer needs a temp file
                if (media.startsWith('data:image/')) {
                    const base64Data = media.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');
                    const tempFilePath = path.join('/tmp', `temp_image_${crypto.randomBytes(8).toString('hex')}.png`);
                    await fs.writeFile(tempFilePath, buffer);
                    await fileInput.uploadFile(tempFilePath);
                    await fs.unlink(tempFilePath).catch(e => console.warn('Failed to delete temp file:', e.message)); // Clean up
                } else {
                    // If it's a regular URL, you might need to download it first or Pinterest allows URL upload
                    // For simplicity, directly upload if it's a local file path, or assume Pinterest handles URL
                    // For now, let's assume it's a direct URL that Pinterest can process or it's a local file.
                    // If media is a direct URL, Pinterest might auto-fetch it on link or you might need a custom upload step.
                    // For now, if it's not base64, we'll try to use it directly, or rely on a fallback strategy if this fails.
                    console.warn("Pinterest image upload from external URL (non-base64) might require manual download/reupload or Pinterest's specific methods.");
                    // For robust solution, download image and upload
                    const response = await axios.get(media, { responseType: 'arraybuffer' });
                    const downloadedBuffer = Buffer.from(response.data);
                    const tempDownloadedPath = path.join('/tmp', `downloaded_image_${crypto.randomBytes(8).toString('hex')}.png`);
                    await fs.writeFile(tempDownloadedPath, downloadedBuffer);
                    await fileInput.uploadFile(tempDownloadedPath);
                    await fs.unlink(tempDownloadedPath).catch(e => console.warn('Failed to delete downloaded temp file:', e.message));
                }
                await quantumDelay(1000);
            }

            await safeClick(page, ['[data-test-id="board-dropdown-save-button"]', 'button[type="submit"]', 'button:contains("Save")']);
            await quantumDelay(3000);
            console.log('✅ Posted to Pinterest.');
            postResults.pinterest = { success: true, link: page.url() };
        } catch (error) {
            console.error('🚨 Pinterest posting failed:', error.message);
            browserManager.reportNavigationFailure();
            postResults.pinterest = { success: false, error: error.message };
        } finally {
            if (page) await browserManager.closePage(page);
        }
    }

    // --- Post to X (Twitter) ---
    if (canPostToX) {
        if (X_API_KEY && !String(X_API_KEY).includes('PLACEHOLDER')) {
            // Prefer API for reliability
            try {
                console.log('🚀 Attempting to post to X (Twitter) via API...');
                const twitterClient = new TwitterApi(X_API_KEY);
                const tweetText = `${title}\n\n${finalCaption}\n\n${affiliateLink}`; // Combine content for tweet
                // For image upload to Twitter API, you'd typically upload the image first and get a media_id
                let mediaId = null;
                if (media.startsWith('data:image/')) {
                    const base64Data = media.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');
                    // Twitter API expects specific file types and sizes. This is a simplified example.
                    const uploadResult = await twitterClient.v1.uploadMedia(buffer, { mimeType: 'image/png' });
                    mediaId = uploadResult.media_id_string;
                    console.log(`Uploaded media to X: ${mediaId}`);
                } else if (media) { // If it's a URL, try to download and upload
                    try {
                        const response = await axios.get(media, { responseType: 'arraybuffer' });
                        const buffer = Buffer.from(response.data);
                        const uploadResult = await twitterClient.v1.uploadMedia(buffer, { mimeType: response.headers['content-type'] || 'image/jpeg' });
                        mediaId = uploadResult.media_id_string;
                        console.log(`Downloaded and uploaded media to X: ${mediaId}`);
                    } catch (dlError) {
                        console.warn(`⚠️ Failed to download/upload image from URL to X: ${dlError.message}`);
                    }
                }

                const tweetPayload = mediaId ? { text: tweetText, media: { media_ids: [mediaId] } } : { text: tweetText };
                const { data: tweet } = await twitterClient.v2.tweet(tweetPayload);
                console.log(`✅ Posted to X (Tweet ID: ${tweet.id})`);
                postResults.x = { success: true, link: `https://twitter.com/${X_USERNAME || 'ArielMatrix'}/status/${tweet.id}` }; // Use X_USERNAME for link
            } catch (error) {
                console.error(`🚨 X (Twitter) API posting failed: ${error.message}. Status: ${error.response?.status}`);
                postResults.x = { success: false, error: error.message };
            }
        } else if (X_USERNAME && X_PASSWORD && !String(X_USERNAME).includes('PLACEHOLDER') && !String(X_PASSWORD).includes('PLACEHOLDER')) {
            // Fallback to browser automation if API key is not available
            let page = null;
            try {
                console.log('🚀 Attempting to post to X (Twitter) via browser automation...');
                page = await browserManager.getNewPage();
                await page.goto('https://twitter.com/login', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);

                const useOtherLogin = await page.$('a[href*="flow/login?input_flow_data"]');
                if (useOtherLogin) {
                    await useOtherLogin.click();
                    await quantumDelay(1000);
                }
                await safeType(page, ['input[name="text"]', 'input[autocomplete="username"]'], X_USERNAME);
                await safeClick(page, ['button:contains("Next")']);
                await quantumDelay(2000);
                await safeType(page, ['input[name="password"]'], X_PASSWORD);
                await safeClick(page, ['button[data-testid="LoginForm_Login_Button"]', 'button[type="submit"]']);
                await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() }).catch(() => null);
                await quantumDelay(5000);

                const loggedIn = await page.evaluate(() => document.querySelector('a[data-testid="AppTabBar_Home_Link"]') !== null);
                if (!loggedIn) throw new Error('X (Twitter) login failed via browser.');

                // Post a tweet
                await safeClick(page, ['a[data-testid="SideNav_NewTweet_Button"]', 'div[aria-label="New Post"]']); // Click 'New Tweet' button
                await quantumDelay(2000);

                await safeType(page, ['div[data-contents="true"][role="textbox"]', 'div[aria-label="Tweet text"]'], finalCaption); // Type caption
                // For image upload, Twitter web UI often has a file input
                if (media.startsWith('data:image/')) {
                    const base64Data = media.split(',')[1];
                    const buffer = Buffer.from(base64Data, 'base64');
                    const tempFilePath = path.join('/tmp', `temp_tweet_image_${crypto.randomBytes(8).toString('hex')}.png`);
                    await fs.writeFile(tempFilePath, buffer);
                    const fileInput = await page.$('input[type="file"][accept*="image"]');
                    if (fileInput) {
                        await fileInput.uploadFile(tempFilePath);
                        await quantumDelay(3000); // Wait for image upload preview
                    }
                    await fs.unlink(tempFilePath).catch(e => console.warn('Failed to delete temp file:', e.message));
                } else if (media) { // Download and upload if it's a URL
                    try {
                        const response = await axios.get(media, { responseType: 'arraybuffer' });
                        const buffer = Buffer.from(response.data);
                        const tempDownloadedPath = path.join('/tmp', `downloaded_tweet_image_${crypto.randomBytes(8).toString('hex')}.png`);
                        await fs.writeFile(tempDownloadedPath, buffer);
                        const fileInput = await page.$('input[type="file"][accept*="image"]');
                        if (fileInput) {
                            await fileInput.uploadFile(tempDownloadedPath);
                            await quantumDelay(3000);
                        }
                        await fs.unlink(tempDownloadedPath).catch(e => console.warn('Failed to delete downloaded temp file:', e.message));
                    } catch (dlError) {
                        console.warn(`⚠️ Failed to download/upload image from URL to X (browser): ${dlError.message}`);
                    }
                }

                await safeClick(page, ['button[data-testid="tweetButton"]', 'div[aria-label="Tweet"]']); // Click Tweet button
                await quantumDelay(5000);
                console.log('✅ Posted to X (Twitter) via browser automation.');
                postResults.x = { success: true, link: `https://twitter.com/${X_USERNAME}/` }; // Cannot easily get tweet link from browser automation
            } catch (error) {
                console.error('🚨 X (Twitter) browser posting failed:', error.message);
                browserManager.reportNavigationFailure();
                postResults.x = { success: false, error: error.message };
            } finally {
                if (page) await browserManager.closePage(page);
            }
        } else {
             console.warn('⚠️ X (Twitter) posting skipped: Credentials or API Key missing/placeholder.');
        }
    }


    // --- Post to Reddit ---
    if (canPostToReddit) {
        let page = null;
        try {
            console.log('🚀 Attempting to post to Reddit...');
            page = await browserManager.getNewPage(); // ✅ Use central manager
            await page.goto('https://www.reddit.com/login/', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
            await quantumDelay(2000);

            // Handle potential login pop-up
            const loginModal = await page.$('div[role="dialog"][data-testid="login-modal"]');
            if (loginModal) {
                console.log('Reddit login modal detected.');
                await safeType(page, ['#loginUsername', 'input[name="username"]'], REDDIT_USER);
                await safeType(page, ['#loginPassword', 'input[name="password"]'], REDDIT_PASS);
                await safeClick(page, ['button[type="submit"]', '.AnimatedForm__submitButton']);
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: page.getDefaultTimeout() }).catch(() => null); // Wait for login
                await quantumDelay(5000);
            } else {
                console.log('No Reddit login modal. Assuming direct login page or already logged in.');
                await safeType(page, ['input[name="username"]', '#loginUsername'], REDDIT_USER);
                await safeType(page, ['input[name="password"]', '#loginPassword'], REDDIT_PASS);
                await safeClick(page, ['button[type="submit"]', '.AnimatedForm__submitButton']);
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: page.getDefaultTimeout() }).catch(() => null);
                await quantumDelay(5000);
            }

            const loggedIn = await page.evaluate(() => document.querySelector('a[href="/r/all/"]') !== null);
            if (!loggedIn) throw new Error('Reddit login failed.');

            // Navigate to submit page, e.g., for a community if applicable
            await page.goto(`https://www.reddit.com/r/LuxuryLifeHabits/submit`, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
            await quantumDelay(2000);

            // Select "Post" tab if available, otherwise assume text post
            const postTab = await page.$('button[role="tab"]:contains("Post")');
            if (postTab) await postTab.click();
            await quantumDelay(1000);

            await safeType(page, [
                'input[placeholder="Title"]', '[aria-label="Title"]'
            ], title);
            await quantumDelay(1000); // Small delay after title type

            // Reddit text area
            await safeType(page, [
                'div[role="textbox"][contenteditable="true"]', // Main rich text editor
                'textarea[placeholder="Text"]', '[aria-label="text"]'
            ], finalCaption);
            await quantumDelay(1000);

            // For image, Reddit often has an image tab or upload button.
            // Simplified: If media is available, try to find an upload input.
            const imageTab = await page.$('button[role="tab"]:contains("Image & Video")');
            if (imageTab && media) {
                await imageTab.click();
                await quantumDelay(1000);
                const fileInput = await page.$('input[type="file"][accept*="image"]');
                 if (fileInput) {
                    if (media.startsWith('data:image/')) {
                        const base64Data = media.split(',')[1];
                        const buffer = Buffer.from(base64Data, 'base64');
                        const tempFilePath = path.join('/tmp', `temp_reddit_image_${crypto.randomBytes(8).toString('hex')}.png`);
                        await fs.writeFile(tempFilePath, buffer);
                        await fileInput.uploadFile(tempFilePath);
                        await fs.unlink(tempFilePath).catch(e => console.warn('Failed to delete temp file:', e.message));
                    } else if (media) { // Download and upload if it's a URL
                        try {
                            const response = await axios.get(media, { responseType: 'arraybuffer' });
                            const buffer = Buffer.from(response.data);
                            const tempDownloadedPath = path.join('/tmp', `downloaded_reddit_image_${crypto.randomBytes(8).toString('hex')}.png`);
                            await fs.writeFile(tempDownloadedPath, buffer);
                            await fileInput.uploadFile(tempDownloadedPath);
                            await fs.unlink(tempDownloadedPath).catch(e => console.warn('Failed to delete downloaded temp file:', e.message));
                        } catch (dlError) {
                            console.warn(`⚠️ Failed to download/upload image from URL to Reddit: ${dlError.message}`);
                        }
                    }
                    await quantumDelay(3000); // Wait for image to upload
                 } else {
                     console.warn('⚠️ Reddit image file input not found or media not available.');
                 }
            }


            await safeClick(page, [
                'button[aria-label="Post"]', 'button[type="submit"]', 'button:contains("Post")'
            ]);
            await quantumDelay(5000);
            console.log('✅ Posted to Reddit.');
            postResults.reddit = { success: true, link: page.url() }; // Cannot get exact post link easily
        } catch (error) {
            console.error('🚨 Reddit posting failed:', error.message);
            browserManager.reportNavigationFailure();
            postResults.reddit = { success: false, error: error.message };
        } finally {
            if (page) await browserManager.closePage(page);
        }
    }

    console.log(`✅ Social Agent Cycle Completed | Posted to: ${Object.keys(postResults).filter(k => postResults[k].success).join(', ')}`);
    return { success: true, country: countryCode, links: { affiliateLink, monitorLink }, postResults };

  } catch (error) {
    console.error('🚨 Social Agent Critical Failure:', error.message);
    // Do not re-throw here. Let the main orchestrator (server.js) handle overall healing if needed.
    return { success: false, error: error.message };
  }
};
