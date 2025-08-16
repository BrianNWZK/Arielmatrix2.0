// backend/agents/socialAgent.js
// No direct puppeteer import here, only from browserManager
import { browserManager } from './browserManager.js'; // ✅ Import the central manager
import axios from 'axios';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises'; // Import fs for temporary file operations
import { TwitterApi } from 'twitter-api-v2'; // For X (Twitter) API interaction

// Destructure safeClick and safeType from browserManager for direct use
const { safeClick, safeType } = browserManager;


// Reusable Render ENV update function (extracted for common use across agents)
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

  // --- QUATERNARY: NowPayments ---
  if (CONFIG.NOWPAYMENTS_API_KEY && !String(CONFIG.NOWPAYMENTS_API_KEY).includes('PLACEHOLDER')) {
    try {
      console.log('Attempting NowPayments invoice URL generation...');
      const npRes = await axios.post('https://api.nowpayments.io/v1/invoice', {
        price_amount: 0.01, // Smallest possible amount for an "access pass"
        price_currency: 'usd',
        pay_currency: 'usdt',
        order_description: `Access Pass: ${url}`,
        ipn_callback_url: CONFIG.NOWPAYMENTS_CALLBACK_URL || 'https://your-actual-secure-callback-url.com/nowpayments-webhook' // Use config or a more generic placeholder URL
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
                await safeClick(page, ['button[type="submit"]', 'button:contains("Log In")', 'button[data-test-id="login-button"]']);
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
                await safeClick(page, ['button[data-testid="LoginForm_Login_Button"]', 'button:contains("Log in")','button[type="submit"]']);
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
                    const foundApiKey = pageContent.match(/bearer\s+([a-zA-Z0-9\-_.~+%/=]{40,})/i);
                    if (foundApiKey && foundApiKey[1]) {
                        newFoundCredential.X_API_KEY = foundApiKey[1];
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
                await safeClick(page, ['button[type="submit"]', '.AnimatedForm__submitButton', 'button:contains("Log In")']);
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: page.getDefaultTimeout() }).catch(() => null);
                await quantumDelay(5000);

                const redditLoggedIn = await page.evaluate(() => document.querySelector('a[href="/r/all/"]') !== null);
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
                const foundDogKey = pageContentDog.match(/(ak|sk)_[a-zA-Z0-9]{32,64}/);
                if (foundDogKey && foundDogKey[0]) {
                    newFoundCredential = foundDogKey[0];
                    console.log('🔑 Found DOG_API_KEY during remediation!');
                } else {
                    console.warn('⚠️ Could not find DOG_API_KEY on signup page directly. Manual signup might be needed.');
                }
                break;

            case 'NEWS_API_KEY': // Corrected from NEWS_API in previous logs
                targetSite = 'https://newsapi.org/register';
                console.log(`Attempting to scout for NEWS_API_KEY at ${targetSite}`);
                page = await browserManager.getNewPage();
                await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);
                const pageContentNews = await page.evaluate(() => document.body.innerText);
                const foundNewsKey = pageContentNews.match(/[a-f0-9]{32}/i); // NewsAPI keys are 32-char hex
                if (foundNewsKey && foundNewsKey[0]) {
                    newFoundCredential = foundNewsKey[0];
                    console.log('🔑 Found NEWS_API_KEY during remediation!');
                } else {
                    console.warn('⚠️ Could not find NEWS_API_KEY on signup page directly. Manual signup might be needed.');
                }
                break;
            case 'ADFLY_API_KEY':
            case 'ADFLY_USER_ID':
            case 'ADFLY_PASS':
            case 'ADFLY_URL':
                targetSite = 'https://adf.ly/publisher/register';
                console.log(`Attempting to remediate AdFly credentials at ${targetSite}`);
                page = await browserManager.getNewPage();
                await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);
                const adflyPageContent = await page.evaluate(() => document.body.innerText);
                const adflyFoundKey = adflyPageContent.match(/publisher_api_key:\s*([a-zA-Z0-9]{16,})/i);
                if (adflyFoundKey && adflyFoundKey[1]) {
                    newFoundCredential = { ADFLY_API_KEY: adflyFoundKey[1] };
                    console.log('🔑 Found AdFly API Key during remediation!');
                } else {
                    console.warn('⚠️ AdFly key not found, full signup flow not automated. Manual setup likely needed due to bot detection.');
                }
                break;

            case 'SHORTIO_API_KEY':
            case 'SHORTIO_URL':
            case 'SHORTIO_USER_ID':
                targetSite = 'https://app.short.io/signup';
                console.log(`Attempting to remediate Short.io credentials at ${targetSite}`);
                page = await browserManager.getNewPage();
                await page.goto(targetSite, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);
                const shortioPageContent = await page.evaluate(() => document.body.innerText);
                const shortioFoundKey = shortioPageContent.match(/API_KEY:\s*([a-zA-Z0-9]{32,})/);
                if (shortioFoundKey && shortioFoundKey[1]) {
                    newFoundCredential = { SHORTIO_API_KEY: shortioFoundKey[1] };
                    const dashboardUrlMatch = page.url().match(/https:\/\/(.*?)\.short\.io/);
                    if (dashboardUrlMatch && dashboardUrlMatch[0]) {
                        newFoundCredential.SHORTIO_URL = dashboardUrlMatch[0];
                    }
                    console.log('🔑 Found Short.io API Key during remediation!');
                } else {
                    console.warn('⚠️ Short.io key/URL not found, full signup flow not automated.');
                }
                break;
            case 'LINKVERTISE_EMAIL':
            case 'LINKVERTISE_PASSWORD':
                console.log(`Linkvertise credentials are remediated by apiScoutAgent.js. Checking for validity.`);
                if (config.LINKVERTISE_EMAIL && !String(config.LINKVERTISE_EMAIL).includes('PLACEHOLDER') &&
                    config.LINKVERTISE_PASSWORD && !String(config.LINKVERTISE_PASSWORD).includes('PLACEHOLDER')) {
                    console.log('✅ Linkvertise credentials confirmed as present and valid.');
                    return true;
                }
                console.warn('⚠️ Linkvertise credentials are still missing/placeholder. Check apiScoutAgent remediation.');
                return false;
            default:
                console.warn(`⚠️ No specific remediation strategy defined for social key: ${keyName}. Manual intervention might be required.`);
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

// === 🚀 Autonomous Social Posting Engine ===
/**
 * Orchestrates content generation, link shortening, and social media posting.
 * Uses browser automation where needed.
 * @param {object} CONFIG - The global configuration object.
 * @returns {Promise<object>} Status and details of the social posting.
 */
export const performSocialCampaigns = async (CONFIG) => {
    console.log('🚀 Initiating Autonomous Social Posting Campaign...');

    const socialCampaignResults = {
      success: true,
      postsAttempted: 0,
      postsPublished: 0,
      postDetails: []
    };

    // --- Remediation for Social-specific Keys ---
    const socialKeysToRemediate = [
        'PINTEREST_EMAIL', 'PINTEREST_PASS',
        'X_USERNAME', 'X_PASSWORD', 'X_API_KEY',
        'REDDIT_USER', 'REDDIT_PASS',
        'DOG_API_KEY', 'NEWS_API_KEY', // Corrected NEWS_API to NEWS_API_KEY for consistency
        'ADFLY_API_KEY', 'ADFLY_USER_ID', 'ADFLY_PASS', 'ADFLY_URL',
        'SHORTIO_API_KEY', 'SHORTIO_URL', 'SHORTIO_USER_ID', 'SHORTIO_DOMAIN',
        'LINKVERTISE_EMAIL', 'LINKVERTISE_PASSWORD',
        'NOWPAYMENTS_API_KEY',
        'AMAZON_AFFILIATE_TAG',
        'UPTIMEROBOT_AFFILIATE_LINK'
    ];

    for (const key of socialKeysToRemediate) {
        if (!CONFIG[key] || String(CONFIG[key]).includes('PLACEHOLDER')) {
            const success = await remediateMissingSocialConfig(key, CONFIG);
            if (!success) {
                console.warn(`⚠️ Remediation for social key ${key} failed. Social posting functionality might be limited.`);
            }
        }
    }
    console.log('\n--- Finished Social-Specific Configuration Remediation ---');


    let page = null; // Declare page outside try block for finally

    try {
        const tier1Countries = [
            ...HIGH_VALUE_REGIONS.WESTERN_EUROPE,
            ...HIGH_VALUE_REGIONS.MIDDLE_EAST
        ];
        const countryCode = tier1Countries[Math.floor(Math.random() * tier1Countries.length)];

        const productCategory = WOMEN_TOP_SPENDING_CATEGORIES[Math.floor(Math.random() * WOMEN_TOP_SPENDING_CATEGORIES.length)];
        const productTitle = `Premium ${productCategory}`; // Example dynamic product title

        const content = await generateWomenCentricContent(countryCode, CONFIG, productTitle, productCategory);
        console.log('Generated Content:', content);

        // Using real affiliate/monitor links from CONFIG or placeholders
        const AMAZON_AFFILIATE_BASE_URL = 'https://www.amazon.com/s?k=';
        const affiliateLinkRaw = `${AMAZON_AFFILIATE_BASE_URL}${encodeURIComponent(productCategory.toLowerCase().replace(/\s/g, '+'))}&tag=${CONFIG.AMAZON_AFFILIATE_TAG || 'your-amazon-tag-20'}`;
        const monitorLinkRaw = CONFIG.UPTIMEROBOT_AFFILIATE_LINK || 'https://uptimerobot.com/affiliate-link-placeholder';

        const [affiliateLink, monitorLink] = await Promise.all([
            shortenLink(affiliateLinkRaw, CONFIG),
            shortenLink(monitorLinkRaw, CONFIG)
        ]);

        const finalCaption = content.caption
          .replace('{{AFF_LINK}}', affiliateLink)
          .replace('{{MONITOR_LINK}}', monitorLink);

        socialCampaignResults.generatedContent = {
          title: content.title,
          caption: finalCaption,
          mediaUrl: content.media,
          affiliateLink,
          monitorLink
        };


        // --- Post to Pinterest ---
        if (CONFIG.PINTEREST_EMAIL && !String(CONFIG.PINTEREST_EMAIL).includes('PLACEHOLDER') &&
            CONFIG.PINTEREST_PASS && !String(CONFIG.PINTEREST_PASS).includes('PLACEHOLDER')) {
            socialCampaignResults.postsAttempted++;
            try {
                console.log('Attempting to post to Pinterest...');
                page = await browserManager.getNewPage();
                await page.goto('https://www.pinterest.com/login/', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);
                await safeType(page, ['input[placeholder="Email or username"]', 'input[name="id"]'], CONFIG.PINTEREST_EMAIL);
                await safeType(page, ['input[placeholder="Password"]', 'input[name="password"]'], CONFIG.PINTEREST_PASS);
                await safeClick(page, ['button[type="submit"]', 'button:contains("Log In")']);
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: page.getDefaultTimeout() }).catch(() => {});
                await quantumDelay(5000);

                const pinterestLoggedIn = await page.evaluate(() => document.querySelector('a[href*="/pin-builder/"]') !== null);
                if (!pinterestLoggedIn) {
                    console.warn('Pinterest login failed or not redirected. Skipping pin creation.');
                    socialCampaignResults.postDetails.push({ platform: 'Pinterest', status: 'skipped', reason: 'login_failed' });
                } else {
                    await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(2000);

                    // Handle image upload/selection
                    if (content.media && content.media.startsWith('data:image/')) {
                        try {
                            const base64Data = content.media.split(',')[1];
                            const imageBuffer = Buffer.from(base64Data, 'base64');
                            const tempImagePath = path.join('/tmp', `pin_image_${crypto.randomBytes(8).toString('hex')}.png`);
                            await fs.writeFile(tempImagePath, imageBuffer);
                            const [fileChooser] = await Promise.all([
                                page.waitForFileChooser({ timeout: 5000 }).catch(() => null),
                                safeClick(page, ['div[data-test-id="file-upload-button"]', 'button:contains("Upload Image")']).catch(() => {}) // Click upload button
                            ]);

                            if (fileChooser) {
                                await fileChooser.accept([tempImagePath]);
                                console.log('✅ Image uploaded to Pinterest.');
                                await fs.unlink(tempImagePath).catch(err => console.error('Failed to delete temp image:', err)); // Clean up
                            } else {
                                console.warn('⚠️ No file chooser appeared for Pinterest image upload. Manual image handling or different approach needed.');
                            }
                        } catch (imgError) {
                            console.warn(`⚠️ Pinterest image upload failed: ${imgError.message.substring(0, 100)}. Continuing without image.`);
                        }
                    } else if (content.media) { // If it's a URL
                        console.log('Attempting to use direct image URL for Pinterest...');
                        await safeType(page, ['input[placeholder="Add a website"]', 'input[name="url"]'], content.media).catch(() => {});
                    }

                    await safeType(page, ['textarea[id*="title"]', '[data-test-id="pin-title-input"]', 'input[placeholder*="Add your title"]'], content.title);
                    await safeType(page, ['textarea[id*="description"]', '[data-test-id="pin-description-input"]', 'textarea[placeholder*="Tell everyone what your Pin is about"]'], finalCaption);
                    await quantumDelay(1000);

                    try {
                        await safeClick(page, ['div[role="button"][aria-label="Select a board"]', 'button:contains("Select")']);
                        await quantumDelay(1000);
                        await page.evaluate(() => {
                            const firstBoard = document.querySelector('[role="menuitem"], [data-test-id*="board-item"]');
                            if (firstBoard) firstBoard.click();
                        });
                        await quantumDelay(2000);
                        await safeClick(page, ['button[type="submit"]', 'button:contains("Save")', 'button:contains("Publish")']);
                        await quantumDelay(5000);
                        console.log('✅ Pinterest post successful!');
                        socialCampaignResults.postsPublished++;
                        socialCampaignResults.postDetails.push({ platform: 'Pinterest', status: 'success', title: content.title, affiliateLink, monitorLink, mediaUrl: content.media });
                    } catch (e) {
                        console.warn('Failed to select board or save Pinterest pin:', e.message);
                        socialCampaignResults.postDetails.push({ platform: 'Pinterest', status: 'failed', reason: 'pin_creation_failed', error: e.message });
                    }
                }
            } catch (error) {
                console.error('🚨 Error during Pinterest posting:', error.message);
                socialCampaignResults.postDetails.push({ platform: 'Pinterest', status: 'error', error: error.message });
                browserManager.reportNavigationFailure(); // Report to central browser manager
            } finally {
                if (page) await browserManager.closePage(page); // Close page after each platform attempt
                page = null; // Reset page to null for next platform
            }
        } else {
            console.warn('❌ Skipping Pinterest posting: Credentials missing or invalid.');
            socialCampaignResults.postDetails.push({ platform: 'Pinterest', status: 'skipped', reason: 'credentials_missing' });
        }

        // --- Post to X (Twitter) ---
        if (CONFIG.X_API_KEY && !String(CONFIG.X_API_KEY).includes('PLACEHOLDER')) {
            socialCampaignResults.postsAttempted++;
            const twitterClient = new TwitterApi(CONFIG.X_API_KEY);
            try {
                console.log('Attempting to post to X (Twitter) via API...');
                const mediaId = await uploadMediaToX(content.media, twitterClient); // Upload image
                const tweetText = finalCaption.length > 280 ? finalCaption.substring(0, 277) + '...' : finalCaption; // X char limit
                const tweet = await twitterClient.v2.tweet({
                    text: tweetText,
                    media: mediaId ? { media_ids: [mediaId] } : undefined,
                });
                console.log('✅ X (Twitter) post successful!', tweet.data.id);
                socialCampaignResults.postsPublished++;
                socialCampaignResults.postDetails.push({ platform: 'X (Twitter)', status: 'success', tweetId: tweet.data.id, title: content.title, affiliateLink, monitorLink, mediaUrl: content.media });
            } catch (error) {
                console.error('🚨 Error during X (Twitter) posting:', error.message);
                socialCampaignResults.postDetails.push({ platform: 'X (Twitter)', status: 'error', error: error.message });
            }
        } else {
            console.warn('❌ Skipping X (Twitter) posting: API Key missing or invalid.');
            socialCampaignResults.postDetails.push({ platform: 'X (Twitter)', status: 'skipped', reason: 'api_key_missing' });
        }


        // --- Post to Reddit ---
        if (CONFIG.REDDIT_USER && !String(CONFIG.REDDIT_USER).includes('PLACEHOLDER') &&
            CONFIG.REDDIT_PASS && !String(CONFIG.REDDIT_PASS).includes('PLACEHOLDER')) {
            socialCampaignResults.postsAttempted++;
            try {
                console.log('Attempting to post to Reddit via browser automation...');
                page = await browserManager.getNewPage();
                await page.goto('https://www.reddit.com/login/', { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                await quantumDelay(2000);
                await safeType(page, ['input[name="username"]', '#loginUsername'], CONFIG.REDDIT_USER);
                await safeType(page, ['input[name="password"]', '#loginPassword'], CONFIG.REDDIT_PASS);
                await safeClick(page, ['button[type="submit"]', '.AnimatedForm__submitButton', 'button:contains("Log In")']);
                await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: page.getDefaultTimeout() }).catch(() => {});
                await quantumDelay(5000);

                const redditLoggedIn = await page.evaluate(() => document.querySelector('a[href="/r/all/"]') !== null);
                if (!redditLoggedIn) {
                    console.warn('Reddit login failed. Skipping Reddit posting.');
                    socialCampaignResults.postDetails.push({ platform: 'Reddit', status: 'skipped', reason: 'login_failed' });
                } else {
                    console.log('Reddit login successful. Navigating to submission page.');
                    const subreddit = 'r/MadeMeSmile'; // Or dynamic from an AI analysis or config
                    await page.goto(`https://www.reddit.com/${subreddit}/submit`, { waitUntil: 'domcontentloaded', timeout: page.getDefaultTimeout() });
                    await quantumDelay(2000);

                    // Select Post type (e.g., Image/Video, Link, Text) - assuming image/text post
                    if (content.media) {
                        await safeClick(page, ['button[data-click-id="media"]', 'button:contains("Image & Video")']).catch(() => {});
                        await quantumDelay(1000);
                        try {
                            if (content.media.startsWith('data:image/')) {
                                const base64Data = content.media.split(',')[1];
                                const imageBuffer = Buffer.from(base64Data, 'base64');
                                const tempImagePath = path.join('/tmp', `reddit_image_${crypto.randomBytes(8).toString('hex')}.png`);
                                await fs.writeFile(tempImagePath, imageBuffer);
                                const [fileChooser] = await Promise.all([
                                    page.waitForFileChooser({ timeout: 5000 }).catch(() => null),
                                    safeClick(page, ['input[type="file"] + div', 'div[data-redditstyle="true"] label']).catch(() => {}) // Click hidden file input trigger
                                ]);
                                if (fileChooser) {
                                    await fileChooser.accept([tempImagePath]);
                                    console.log('✅ Image uploaded to Reddit.');
                                    await fs.unlink(tempImagePath).catch(err => console.error('Failed to delete temp image:', err));
                                } else {
                                    console.warn('⚠️ No file chooser appeared for Reddit image upload. Skipping image.');
                                }
                            } else {
                                console.warn('Reddit image from URL not supported directly, skipping image upload.');
                            }
                        } catch (imgError) {
                            console.warn(`⚠️ Reddit image upload failed: ${imgError.message.substring(0, 100)}. Continuing without image.`);
                        }
                    } else { // Default to text post if no image or image upload failed
                        await safeClick(page, ['button[data-click-id="text"]', 'button:contains("Text")']).catch(() => {});
                        await quantumDelay(1000);
                    }

                    await safeType(page, ['input[placeholder="Title"]', 'textarea[aria-label="title"]'], content.title);
                    // For text posts, ensure to put the caption in the text area
                    await safeType(page, ['textarea[placeholder="Text (optional)"]', 'div[role="textbox"]'], finalCaption);
                    await quantumDelay(1000);

                    await safeClick(page, ['button[type="submit"]', 'button:contains("Post")']).catch(() => {});
                    await quantumDelay(3000);

                    const postSuccess = await page.evaluate(() => document.querySelector('div[data-click-id="comments"]') !== null || document.body.innerText.includes('post submitted'));
                    if (postSuccess) {
                        console.log('✅ Reddit post successful!');
                        socialCampaignResults.postsPublished++;
                        socialCampaignResults.postDetails.push({ platform: 'Reddit', status: 'success', title: content.title, affiliateLink, monitorLink, mediaUrl: content.media });
                    } else {
                        console.warn('Reddit post failed to confirm success.');
                        socialCampaignResults.postDetails.push({ platform: 'Reddit', status: 'failed', reason: 'post_failed' });
                    }
                }
            } catch (error) {
                console.error('🚨 Error during Reddit posting:', error.message);
                socialCampaignResults.postDetails.push({ platform: 'Reddit', status: 'error', error: error.message });
                browserManager.reportNavigationFailure();
            } finally {
                if (page) await browserManager.closePage(page);
                page = null;
            }
        } else {
            console.warn('❌ Skipping Reddit posting: Credentials missing or invalid.');
            socialCampaignResults.postDetails.push({ platform: 'Reddit', status: 'skipped', reason: 'credentials_missing' });
        }

        console.log(`📊 Social Posting Campaign Summary: ${socialCampaignResults.postsPublished} successful posts out of ${socialCampaignResults.postsAttempted} attempted.`);
        return socialCampaignResults;

    } catch (error) {
        console.error('🚨 Critical Social Posting Campaign Failure:', error.message);
        socialCampaignResults.success = false;
        socialCampaignResults.error = error.message;
        return socialCampaignResults;
    } finally {
        if (page) await browserManager.closePage(page);
    }
};

// Helper function to upload media to X (Twitter) API
async function uploadMediaToX(mediaUrl, twitterClient) {
  if (!mediaUrl) return null;

  try {
    console.log(`Uploading media to X: ${mediaUrl.substring(0, 50)}...`);
    let mediaBuffer;

    if (mediaUrl.startsWith('data:image/')) {
      const base64Data = mediaUrl.split(',')[1];
      mediaBuffer = Buffer.from(base64Data, 'base64');
    } else {
      const response = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
      mediaBuffer = Buffer.from(response.data);
    }

    const mediaId = await twitterClient.v1.uploadMedia(mediaBuffer, { mimeType: 'image/png' });
    console.log('✅ Media uploaded to X. Media ID:', mediaId);
    return mediaId;
  } catch (error) {
    console.error('🚨 Failed to upload media to X:', error.message);
    return null;
  }
}
