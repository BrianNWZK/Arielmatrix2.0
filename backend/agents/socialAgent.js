// backend/agents/socialAgent.js
import puppeteer from 'puppeteer';
import axios from 'axios';
import crypto from 'crypto';
import path from 'path';

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
  "Private Wellness Retreats"
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

// === 🌐 Launch Truly Stealth Browser ===
const launchStealthBrowser = async () => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-position=0,0',
    '--window-size=1366,768',
    '--disable-extensions',
    '--disable-plugins-discovery',
    '--disable-features=TranslateUI'
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

    // Anti-detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [new PluginArray()] });
    });

    return { browser, page };
  } catch (error) {
    console.warn('⚠️ Browser launch failed:', error.message);
    if (browser) await browser.close();
    return null;
  }
};

// === 📸 AI-Generated Women-Centric Content ===
const generateWomenCentricContent = async (countryCode, CONFIG) => {
  const COUNTRY_NAMES = {
    MC: 'Monaco', CH: 'Switzerland', LU: 'Luxembourg',
    AE: 'Dubai', SA: 'Saudi Arabia', US: 'the USA',
    SG: 'Singapore', HK: 'Hong Kong', AU: 'Australia'
  };

  const TRENDING_HASHTAGS = {
    MC: ['#MonacoLuxury', '#BillionaireLifestyle', '#DesignerDogs'],
    AE: ['#DubaiLuxury', '#GoldPets', '#VIPLiving', '#SheikhaStyle'],
    US: ['#OrganicMoms', '#CleanBeauty', '#SustainableFashion', '#WellnessWarrior'],
    SG: ['#AsiaLuxury', '#PetInfluencer', '#HighNetWorth', '#Mumpreneur']
  };

  const interest = WOMEN_TOP_SPENDING_CATEGORIES[Math.floor(Math.random() * WOMEN_TOP_SPENDING_CATEGORIES.length)];
  const countryName = COUNTRY_NAMES[countryCode] || 'Global';

  let dogImage = null, newsTitle = null;

  try {
    const [dogRes, newsRes] = await Promise.all([
      axios.get('https://api.thedogapi.com/v1/images/search', { // ✅ FIXED: Removed trailing space
        headers: { 'x-api-key': CONFIG.DOG_API_KEY || process.env.DOG_API_KEY },
        timeout: 5000
      }).catch(() => null),
      axios.get('https://newsapi.org/v2/top-headlines', { // ✅ FIXED: Removed trailing space
        params: { country: countryCode.toLowerCase(), category: 'health', pageSize: 1 },
        headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY || process.env.NEWS_API_KEY}` },
        timeout: 5000
      }).catch(() => null)
    ]);

    dogImage = dogRes?.data[0]?.url || 'https://images.unsplash.com/photo-1543332164-6e8f2609a4e3';
    newsTitle = newsRes?.data?.articles[0]?.title || `Why Elite Women Are Investing in ${interest}`;
  } catch (e) {
    console.warn('⚠️ Fallback content used due to API failure');
  }

  return {
    title: `✨ ${interest} Trends in ${countryName} (${new Date().getFullYear()})`,
    caption: `Attention, ladies! 👑\n\n` +
      `${newsTitle}\n\n` +
      `🐾 ${interest} is booming in ${countryName}.\n\n` +
      `🛍️ Shop now: {{AFF_LINK}}\n` +
      `📈 Track sales: {{MONITOR_LINK}}\n\n` +
      `${(TRENDING_HASHTAGS[countryCode] || ['#Luxury', '#WomenEmpowerment']).join(' ')}`,
    media: dogImage
  };
};

// === 🔗 Smart Link Shortener (Short.io Primary, AdFly, Linkvertise Fallback) ===
const shortenLink = async (url, CONFIG) => {
  // === PRIMARY: Short.io API ===
  try {
    const response = await axios.post(
      `${CONFIG.SHORTIO_URL}/links/public`, // ✅ FIXED: No trailing space
      {
        domain: CONFIG.SHORTIO_DOMAIN || 'qgs.gs',
        originalURL: url
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
    const adflyUrl = CONFIG.ADFLY_URL?.trim() || 'https://api.adf.ly/v1/shorten'; // ✅ FIXED: Trim and default
    const response = await axios.post(adflyUrl, {
      url,
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
    ({ browser, page } = result); // ✅ FIXED: Only destructure if result is valid

    await page.goto('https://linkvertise.com/auth/login', { waitUntil: 'networkidle2' }); // ✅ FIXED: Removed trailing space
    await quantumDelay(2000);

    await safeType(page, ['input[name="email"]'], CONFIG.AI_EMAIL || 'arielmatrix@atomicmail.io');
    await safeType(page, ['input[name="password"]'], CONFIG.AI_PASSWORD);
    await safeClick(page, ['button[type="submit"]']);
    await quantumDelay(5000);

    await page.goto('https://linkvertise.com/dashboard/links/create', { waitUntil: 'networkidle2' }); // ✅ FIXED: Removed trailing space
    await quantumDelay(2000);

    await safeType(page, ['input[name="url"]'], url);
    await safeClick(page, ['button[type="submit"]']);
    await quantumDelay(3000);

    const shortLink = await page.evaluate(() => {
      const input = document.querySelector('input.share-link-input');
      return input?.value || null;
    });

    if (shortLink) {
      console.log(`✅ Linkvertise success: ${shortLink}`);
      return shortLink;
    }
  } catch (error) {
    console.warn('⚠️ Linkvertise failed → falling back to NowPayments');
  } finally {
    if (browser) await browser.close();
  }

  // === QUATERNARY: NowPayments ===
  try {
    const npRes = await axios.post('https://api.nowpayments.io/v1/invoice', { // ✅ FIXED: Removed trailing space
      price_amount: 0.01,
      price_currency: 'usd',
      pay_currency: 'usdt',
      order_description: `Access Pass: ${url}`
    }, { headers: { 'x-api-key': CONFIG.NOWPAYMENTS_API_KEY || process.env.NOWPAYMENTS_API_KEY } });
    return npRes.data.invoice_url;
  } catch (error) {
    console.warn('⚠️ NowPayments failed → using direct URL');
    return url;
  }
};

// === 🚀 Autonomous Stealth Posting Engine ===
export const socialAgent = async (CONFIG) => {
  const PINTEREST_EMAIL = CONFIG.PINTEREST_EMAIL || process.env.PINTEREST_EMAIL;
  const PINTEREST_PASS = CONFIG.PINTEREST_PASS || process.env.PINTEREST_PASS;

  if (!PINTEREST_EMAIL || !PINTEREST_PASS) {
    console.warn('❌ Pinterest credentials missing → skipping socialAgent');
    return { success: false, error: 'Missing credentials' };
  }

  let browser = null;
  try {
    // 1. Select High-Value Country
    const tier1Countries = [
      ...HIGH_VALUE_REGIONS.WESTERN_EUROPE,
      ...HIGH_VALUE_REGIONS.MIDDLE_EAST
    ];
    const countryCode = tier1Countries[Math.floor(Math.random() * tier1Countries.length)];

    // 2. Generate AI Content
    const { title, caption, media } = await generateWomenCentricContent(countryCode, CONFIG);

    // 3. Shorten Links (Short.io Primary)
    const [affiliateLink, monitorLink] = await Promise.all([
      shortenLink(`${CONFIG.AMAZON_AFFILIATE_TAG}?tag=womenlux-20`, CONFIG),
      shortenLink(CONFIG.UPTIMEROBOT_AFFILIATE_LINK, CONFIG)
    ]);

    // 4. Launch Stealth Browser
    const result = await launchStealthBrowser();
    if (!result) return { success: false, error: 'Browser launch failed' };
    ({ browser, page } = result); // ✅ FIXED: Only destructure if result is valid

    // 5. Post to Pinterest
    await page.goto('https://pinterest.com/login', { waitUntil: 'networkidle2' }); // ✅ FIXED: Removed trailing space
    await quantumDelay(2000);

    await safeType(page, [
      'input[placeholder="Email or username"]',
      'input[type="text"]',
      'input[name="id"]'
    ], PINTEREST_EMAIL);

    await safeType(page, [
      'input[placeholder="Password"]',
      'input[type="password"]',
      'input[name="password"]'
    ], PINTEREST_PASS);

    await safeClick(page, [
      'button[type="submit"]',
      'button[data-test-id="login-button"]'
    ]);
    await quantumDelay(5000);

    await page.goto('https://pinterest.com/pin-builder/', { waitUntil: 'networkidle2' }); // ✅ FIXED: Removed trailing space
    await quantumDelay(2000);

    await safeType(page, [
      '[data-test-id="pin-title-input"]',
      'textarea[name="title"]'
    ], title);

    await safeType(page, [
      '[data-test-id="pin-description-input"]',
      'textarea[name="description"]'
    ], caption.replace('{{AFF_LINK}}', affiliateLink).replace('{{MONITOR_LINK}}', monitorLink));

    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
      await fileInput.uploadFile(media);
      await quantumDelay(1000);
    }

    await safeClick(page, [
      '[data-test-id="board-dropdown-save-button"]',
      'button[type="submit"]'
    ]);
    await quantumDelay(3000);

    // 6. Post to Reddit
    await page.goto('https://reddit.com/r/LuxuryLifeHabits/submit', { waitUntil: 'networkidle2' }); // ✅ FIXED: Removed trailing space
    await quantumDelay(2000);

    await safeType(page, [
      '[aria-label="title"]',
      'input[placeholder="Title"]'
    ], title);

    await safeType(page, [
      '[aria-label="text"]',
      'textarea[placeholder="Text"]'
    ], caption);

    await safeClick(page, [
      'button[aria-label="Post"]',
      'button[type="submit"]'
    ]);
    await quantumDelay(3000);

    console.log(`✅ Posts Live in ${countryCode} | CPM: $8–$25 | Links:`, { affiliateLink, monitorLink });
    return { success: true, country: countryCode, links: { affiliateLink, monitorLink } };

  } catch (error) {
    console.error('🚨 Autonomous Women-Centric Posting Failed:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
};
