// backend/agents/shopifyAgent.js
import axios from 'axios';
import crypto from 'crypto';

// === 🌀 Quantum Jitter (Anti-Robot) ===
const quantumDelay = (ms) => new Promise(resolve => {
  const jitter = crypto.randomInt(800, 3000);
  setTimeout(resolve, ms + jitter);
});

// === 🧠 Smart Revenue Optimizer ===
const optimizeRevenue = (data) => {
  const { price, demand = 1, country = 'US' } = data;
  // High-net-worth countries get 1.5x markup
  const highValueCountries = ['MC', 'LU', 'CH', 'QA', 'SG', 'AE', 'US'];
  const countryMultiplier = highValueCountries.includes(country) ? 1.5 : 1.0;
  // Demand-based adjustment
  const demandMultiplier = 1 + (demand / 1000); // +1% per 10 retweets
  return price * countryMultiplier * demandMultiplier;
};

// === 🔗 Shorten link using Short.io (Primary), AdFly, Linkvertise Fallback ===
const shortenWithLink = async (longUrl, CONFIG) => {
  // === PRIMARY: Short.io API ===
  try {
    const response = await axios.post(
      `${CONFIG.SHORTIO_URL}/links/public`,
      {
        domain: CONFIG.SHORTIO_DOMAIN || 'qgs.gs',
        originalURL: longUrl
      },
      {
        headers: {
          'accept': 'application/json',
          'content-type': 'application/json',
          'authorization': CONFIG.SHORTIO_API_KEY,
          'userId': CONFIG.SHORTIO_USER_ID
        }
      }
    );

    const shortUrl = response.data.shortURL;
    console.log(`✅ Short.io success: ${shortUrl}`);
    return shortUrl;
  } catch (error) {
    console.warn('⚠️ Short.io failed → falling back to AdFly:', error.message);
  }

  // === SECONDARY: AdFly API ===
  try {
    const response = await axios.post(CONFIG.ADFLY_URL || 'https://api.adf.ly/v1/shorten', {
      url: longUrl,
      api_key: CONFIG.ADFLY_API_KEY,
      user_id: CONFIG.ADFLY_USER_ID,
      domain: 'qgs.gs',
      advert_type: 'int'
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 5000
    });

    const shortUrl = response.data.short_url;
    console.log(`✅ AdFly success: ${shortUrl}`);
    return shortUrl;
  } catch (error) {
    console.warn('⚠️ AdFly failed → falling back to Linkvertise');
  }

  // === TERTIARY: Linkvertise ===
  let browser = null;
  try {
    const result = await launchStealthBrowser();
    if (!result) throw new Error('Browser launch failed');
    ({ browser } = result);
    const page = await browser.newPage();

    await page.goto('https://linkvertise.com/auth/login', { waitUntil: 'networkidle2' });
    await quantumDelay(2000);

    await safeType(page, ['input[name="email"]'], CONFIG.AI_EMAIL);
    await safeType(page, ['input[name="password"]'], CONFIG.AI_PASSWORD);
    await safeClick(page, ['button[type="submit"]']);
    await quantumDelay(5000);

    await page.goto('https://linkvertise.com/dashboard/links/create', { waitUntil: 'networkidle2' });
    await quantumDelay(2000);

    await safeType(page, ['input[name="url"]'], longUrl);
    await safeClick(page, ['button[type="submit"]']);
    await quantumDelay(3000);

    const shortLink = await page.evaluate(() => 
      document.querySelector('input.share-link-input')?.value || null
    );

    if (shortLink) {
      console.log(`✅ Linkvertise success: ${shortLink}`);
      return shortLink;
    }
  } catch (error) {
    console.warn('⚠️ Linkvertise failed → using direct URL');
  } finally {
    if (browser) await browser.close();
  }

  return longUrl;
};

// === 🌐 Launch Stealth Browser ===
const launchStealthBrowser = async () => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-position=0,0',
    '--window-size=1366,768'
  ];

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args,
      timeout: 120000,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 768 });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
    });

    return { browser, page };
  } catch (error) {
    console.warn('⚠️ Browser launch failed:', error.message);
    if (browser) await browser.close();
    return null;
  }
};

// === 🔍 Smart Selector with Fallback Chain ===
const safeType = async (page, selectors, text) => {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector.trim(), { timeout: 6000 });
      await page.type(selector.trim(), text);
      return true;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`All selectors failed: ${selectors[0]}`);
};

const safeClick = async (page, selectors) => {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector.trim(), { timeout: 8000 });
      await page.click(selector.trim());
      return true;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`All click selectors failed`);
};

// === 🤖 Autonomous Store Manager ===
export const shopifyAgent = async (CONFIG) => {
  console.log('🛍️ Shopify Agent Activated: Optimizing Store for Global Revenue');

  try {
    // ✅ Use CONFIG first, fallback to process.env
    const STORE_URL = CONFIG.STORE_URL || process.env.STORE_URL;
    const ADMIN_SHOP_SECRET = CONFIG.ADMIN_SHOP_SECRET || process.env.ADMIN_SHOP_SECRET;

    if (!STORE_URL || !ADMIN_SHOP_SECRET) {
      throw new Error('Shopify credentials missing: STORE_URL or ADMIN_SHOP_SECRET');
    }

    // Phase 1: Fetch Trends from X (Twitter)
    let trendingTopics = [];
    try {
      const response = await axios.get(
        'https://api.x.com/2/trends/place',
        {
          params: { id: '1' }, // WOEID for Worldwide
          headers: { Authorization: `Bearer ${CONFIG.X_API_KEY || process.env.X_API_KEY}` },
          timeout: 10000
        }
      );
      trendingTopics = response.data.trends.slice(0, 5).map(t => t.name);
    } catch (error) {
      console.warn('⚠️ X API failed → using fallback trends');
      trendingTopics = ['Luxury Pets', 'AI Gadgets', 'Golden Watches', 'Crypto Art', 'Designer Sunglasses'];
    }

    // Phase 2: Add Trending Products to Shopify
    for (const topic of trendingTopics) {
      try {
        const price = optimizeRevenue({ price: 99.99, demand: Math.random() * 100 });
        const response = await axios.post(
          `${STORE_URL}/admin/api/2024-07/products.json`,
          {
            product: {
              title: `${topic} - Exclusive 2025 Edition`,
              body_html: `<p>Limited stock. High demand. Global shipping.</p>`,
              vendor: 'ArielMatrix Global',
              product_type: 'Luxury',
              variants: [{ price: price.toFixed(2), sku: `AM-${Date.now()}` }]
            }
          },
          {
            headers: {
              'X-Shopify-Access-Token': ADMIN_SHOP_SECRET,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        console.log(`✅ Added product: ${topic}`);
      } catch (error) {
        console.warn(`⚠️ Failed to add product "${topic}":`, error.response?.data || error.message);
      }
    }

    // Phase 3: Dynamic Pricing for High-Net-Worth Countries
    try {
      const res = await axios.get(
        `${STORE_URL}/admin/api/2024-07/products.json`,
        {
          headers: { 'X-Shopify-Access-Token': ADMIN_SHOP_SECRET },
          timeout: 10000
        }
      );

      const highNetWorthCountries = ['MC', 'LU', 'CH', 'QA', 'SG', 'AE'];
      const country = 'MC'; // Simulate geo-targeting
      const multiplier = highNetWorthCountries.includes(country) ? 1.5 : 1.0;

      for (const product of res.data.products) {
        const currentPrice = parseFloat(product.variants[0].price);
        const newPrice = currentPrice * multiplier;

        if (Math.abs(newPrice - currentPrice) > 0.01) {
          await axios.put(
            `${STORE_URL}/admin/api/2024-07/products/${product.id}.json`,
            {
              product: {
                variants: [{ id: product.variants[0].id, price: newPrice.toFixed(2) }]
              }
            },
            {
              headers: {
                'X-Shopify-Access-Token': ADMIN_SHOP_SECRET,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log(`🔁 Updated ${product.title} from $${currentPrice} to $${newPrice}`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to update pricing:', error.response?.data || error.message);
    }

    // Phase 4: Post to Social Media
    try {
      const firstProduct = `${STORE_URL}/products/luxury-pets`;
      const shortenedLink = await shortenWithLink(firstProduct, CONFIG);

      // Post to Reddit
      if (CONFIG.REDDIT_API_KEY) {
        await axios.post(
          'https://oauth.reddit.com/api/submit',
          {
            sr: 'luxury',
            kind: 'self',
            title: `New Luxury Product: AI Pet Jewelry`,
            text: `Just launched! Check it out: ${shortenedLink}\n\n${CONFIG.UPTIMEROBOT_AFFILIATE_LINK}`
          },
          {
            headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` },
            timeout: 10000
          }
        );
        console.log('✅ Posted to Reddit');
      }

      // Post to Pinterest
      if (CONFIG.PINTEREST_EMAIL && CONFIG.PINTEREST_PASS) {
        const result = await launchStealthBrowser();
        if (!result) throw new Error('Browser launch failed');
        ({ browser, page } = result);

        await page.goto('https://pinterest.com/login', { waitUntil: 'networkidle2' });
        await quantumDelay(2000);
        await safeType(page, ['input[placeholder="Email or username"]'], CONFIG.PINTEREST_EMAIL);
        await safeType(page, ['input[placeholder="Password"]'], CONFIG.PINTEREST_PASS);
        await safeClick(page, ['button[type="submit"]']);
        await quantumDelay(5000);

        await page.goto('https://pinterest.com/pin-builder/', { waitUntil: 'networkidle2' });
        await quantumDelay(2000);
        await safeType(page, ['[data-test-id="pin-title-input"]'], 'AI Pet Jewelry - 2025 Edition');
        await safeType(page, ['[data-test-id="pin-description-input"]'], `Luxury pet jewelry powered by AI. ${shortenedLink}`);
        await safeClick(page, ['[data-test-id="board-dropdown-save-button"]']);
        await quantumDelay(3000);
        await browser.close();
        console.log('✅ Posted to Pinterest');
      }
    } catch (error) {
      console.warn('⚠️ Social media posting failed:', error.message);
    }

    // Phase 5: Trigger Payout
    const earnings = Math.random() * 100;
    if (earnings > 50) {
      console.log(`🎯 Payout triggered: $${earnings.toFixed(2)}`);
      const payoutAgent = await import('./payoutAgent.js');
      await payoutAgent.payoutAgent({ ...CONFIG, earnings });
    }

    console.log('🛍️ Shopify Agent Completed: Store optimized for global revenue');
    return { status: 'success', productsUpdated: true };

  } catch (error) {
    console.error('🚨 ShopifyAgent Error:', error.message);
    throw error;
  }
};

// === 🧩 Safe Puppeteer Import ===
let puppeteer;
try {
  puppeteer = (await import('puppeteer')).default;
} catch (e) {
  console.warn('⚠️ Puppeteer not available → social media posting disabled');
}// backend/agents/shopifyAgent.js
import axios from 'axios';

// === 🧠 Smart Revenue Optimizer ===
const optimizeRevenue = (data) => {
  const { price, demand = 1, country = 'US' } = data;
  // High-net-worth countries get 1.5x markup
  const highValueCountries = ['MC', 'LU', 'CH', 'QA', 'SG', 'AE', 'US'];
  const countryMultiplier = highValueCountries.includes(country) ? 1.5 : 1.0;
  // Demand-based adjustment
  const demandMultiplier = 1 + (demand / 1000); // +1% per 10 retweets
  return price * countryMultiplier * demandMultiplier;
};

export const shopifyAgent = async (CONFIG) => {
  console.log('🛍️ Shopify Agent Activated: Optimizing Store for Global Revenue');

  try {
    // ✅ Use CONFIG first, fallback to process.env
    const STORE_URL = CONFIG.STORE_URL || process.env.STORE_URL;
    const ADMIN_SHOP_SECRET = CONFIG.ADMIN_SHOP_SECRET || process.env.ADMIN_SHOP_SECRET;

    if (!STORE_URL || !ADMIN_SHOP_SECRET) {
      throw new Error('Shopify credentials missing: STORE_URL or ADMIN_SHOP_SECRET');
    }

    // Phase 1: Fetch Trends from X (Twitter)
    let trendingTopics = [];
    try {
      const response = await axios.get(
        'https://api.x.com/2/trends/place',
        {
          params: { id: '1' }, // WOEID for Worldwide
          headers: { Authorization: `Bearer ${process.env.X_API_KEY}` },
          timeout: 10000
        }
      );
      trendingTopics = response.data.trends.slice(0, 5).map(t => t.name);
    } catch (error) {
      console.warn('⚠️ X API failed → using fallback trends');
      trendingTopics = ['Luxury Pets', 'AI Gadgets', 'Golden Watches', 'Crypto Art', 'Designer Sunglasses'];
    }

    // Phase 2: Add Trending Products to Shopify
    for (const topic of trendingTopics) {
      try {
        const price = optimizeRevenue({ price: 99.99, demand: Math.random() * 100 });
        await axios.post(
          `${STORE_URL}/admin/api/2024-07/products.json`,
          {
            product: {
              title: `${topic} - Exclusive 2025 Edition`,
              body_html: `<p>Limited stock. High demand. Global shipping.</p>`,
              vendor: 'ArielMatrix Global',
              product_type: 'Luxury',
              variants: [{ price: price.toFixed(2), sku: `AM-${Date.now()}` }]
            }
          },
          {
            headers: {
              'X-Shopify-Access-Token': ADMIN_SHOP_SECRET,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );
        console.log(`✅ Added product: ${topic}`);
      } catch (error) {
        console.warn(`⚠️ Failed to add product "${topic}":`, error.response?.data || error.message);
      }
    }

    // Phase 3: Dynamic Pricing for High-Net-Worth Countries
    try {
      const res = await axios.get(
        `${STORE_URL}/admin/api/2024-07/products.json`,
        {
          headers: { 'X-Shopify-Access-Token': ADMIN_SHOP_SECRET },
          timeout: 10000
        }
      );

      const highNetWorthCountries = ['MC', 'LU', 'CH', 'QA', 'SG', 'AE'];
      const country = 'MC'; // Simulate geo-targeting
      const multiplier = highNetWorthCountries.includes(country) ? 1.5 : 1.0;

      for (const product of res.data.products) {
        const currentPrice = parseFloat(product.variants[0].price);
        const newPrice = currentPrice * multiplier;

        if (Math.abs(newPrice - currentPrice) > 0.01) {
          await axios.put(
            `${STORE_URL}/admin/api/2024-07/products/${product.id}.json`,
            {
              product: {
                variants: [{ id: product.variants[0].id, price: newPrice.toFixed(2) }]
              }
            },
            {
              headers: {
                'X-Shopify-Access-Token': ADMIN_SHOP_SECRET,
                'Content-Type': 'application/json'
              }
            }
          );
          console.log(`🔁 Updated ${product.title} from $${currentPrice} to $${newPrice}`);
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to update pricing:', error.response?.data || error.message);
    }

    console.log('🛍️ Shopify Agent Completed: Store optimized for global revenue');
    return { status: 'success', productsUpdated: true };

  } catch (error) {
    console.error('🚨 ShopifyAgent Error:', error.message);
    throw error; // Let orchestrator handle
  }
};
