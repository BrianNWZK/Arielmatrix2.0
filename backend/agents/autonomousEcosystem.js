// backend/agents/socialAgent.js
import puppeteer from 'puppeteer';
import axios from 'axios';
import crypto from 'crypto';
import path from 'path';

// === 🌍 HIGH-VALUE WOMEN-CENTRIC MARKETS (Revenue-Optimized) ===
const HIGH_VALUE_REGIONS = {
  // Tier 1: Highest CPM & Luxury Spending (AdFly: $8–$25)
  WESTERN_EUROPE: ['MC', 'CH', 'LU', 'GB', 'DE', 'FR'],
  MIDDLE_EAST: ['AE', 'SA', 'QA', 'KW'],
  NORTH_AMERICA: ['US', 'CA'],
  // Tier 2: High Growth & Pet Spending
  ASIA_PACIFIC: ['SG', 'HK', 'JP', 'AU', 'NZ'],
  OCEANIA: ['AU', 'NZ']
};

// === 💼 WOMEN'S TOP SPENDING CATEGORIES (Monetization Focus) ===
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
      await page.waitForSelector(selector, { timeout: 6000 });
      await page.type(selector, text);
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
      await page.waitForSelector(selector, { timeout: 8000 });
      await page.click(selector);
      return true;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`All click selectors failed`);
};

// === 🌐 Launch Truly Stealth Browser (No puppeteer-extra) ===
const launchStealthBrowser = async (proxy = null) => {
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

  if (proxy) {
    args.push(`--proxy-server=${proxy.host}:${proxy.port}`);
  }

  const browser = await puppeteer.launch({
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
    Object.defineProperty(navigator, 'plugins', { get: () => [new PluginArray()] });
  });

  return { browser, page };
};

// === 📸 AI-Generated Women-Centric Content (Real-Time) ===
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
      axios.get('https://api.thedogapi.com/v1/images/search', {
        headers: { 'x-api-key': process.env.CAT_API_KEY || 'DEMO-KEY' },
        timeout: 5000
      }).catch(() => null),
      axios.get('https://newsapi.org/v2/top-headlines', {
        params: { country: 'us', category: 'health', pageSize: 1 },
        headers: { 'Authorization': `Bearer ${process.env.NEWS_API_KEY}` },
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
      `${(TRENDING_HASHTAGS[countryCode] || ['#Luxury', '#WomenEmpowerment']).join(' ')}`
  };
};

// === 🔗 Smart Link Shortener (Linkvertise Login Flow) ===
const shortenWithLinkvertise = async (longUrl) => {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.goto('https://linkvertise.com/auth/login', { waitUntil: 'networkidle2' });

    await page.type('input[name="email"]', process.env.AI_EMAIL);
    await page.type('input[name="password"]', process.env.AI_PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    await page.goto('https://linkvertise.com/dashboard/links/create', { waitUntil: 'networkidle2' });
    await page.type('input[name="url"]', longUrl);
    await page.click('button[type="submit"]');
    await page.waitForSelector('input.share-link-input', { timeout: 10000 });

    const shortLink = await page.evaluate(() => 
      document.querySelector('input.share-link-input').value
    );

    console.log(`✅ Linkvertise short link: ${shortLink}`);
    return shortLink;

  } catch (error) {
    console.warn('⚠️ Linkvertise failed → using long URL');
    return longUrl;
  } finally {
    if (browser) await browser.close();
  }
};

// === 🚀 Autonomous Stealth Posting Engine ===
export const socialAgent = async (CONFIG) => {
  // ✅ Use ENV keys first, fallback to AI identity
  const PINTEREST_EMAIL = process.env.PINTEREST_EMAIL || process.env.AI_EMAIL;
  const PINTEREST_PASS = process.env.PINTEREST_PASS || process.env.AI_PASSWORD;

  if (!PINTEREST_EMAIL || !PINTEREST_PASS) {
    console.warn('❌ No Pinterest credentials available → skipping socialAgent');
    return { success: false, error: 'No credentials' };
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
    const { title, caption } = await generateWomenCentricContent(countryCode, CONFIG);

    // 3. Shorten Links using Linkvertise
    const [affiliateLink, monitorLink] = await Promise.all([
      shortenWithLinkvertise(`${process.env.AMAZON_AFFILIATE_TAG}?tag=womenlux-20`),
      shortenWithLinkvertise(process.env.UPTIMEROBOT_AFFILIATE_LINK)
    ]);

    // 4. Launch Stealth Browser
    const { browser: launchedBrowser, page } = await launchStealthBrowser();
    browser = launchedBrowser;

    // 5. Post to Pinterest
    await page.goto('https://www.pinterest.com/login/', { waitUntil: 'networkidle2' });
    await quantumDelay(2000);

    await safeType(page, ['input[placeholder="Email or username"]', 'input[type="text"]'], PINTEREST_EMAIL);
    await safeType(page, ['input[placeholder="Password"]', 'input[type="password"]'], PINTEREST_PASS);
    await safeClick(page, ['button[type="submit"]', '[data-test-id="login-button"]']);
    await quantumDelay(5000);

    await page.goto('https://www.pinterest.com/pin-builder/', { waitUntil: 'networkidle2' });
    await quantumDelay(2000);

    await safeType(page, ['[data-test-id="pin-title-input"]'], title);
    await safeType(page, ['[data-test-id="pin-description-input"]'], 
      caption.replace('{{AFF_LINK}}', affiliateLink).replace('{{MONITOR_LINK}}', monitorLink));

    await safeClick(page, ['[data-test-id="board-dropdown-save-button"]']);
    await quantumDelay(3000);

    // 6. Post to Reddit (if X_API_KEY available)
    if (process.env.REDDIT_API_KEY) {
      await page.goto('https://www.reddit.com/r/LuxuryLifeHabits/submit', { waitUntil: 'networkidle2' });
      await quantumDelay(2000);
      await safeType(page, ['[aria-label="title"]'], title);
      await safeType(page, ['[aria-label="text"]'], caption);
      await safeClick(page, ['button[aria-label="Post"]']);
      await quantumDelay(3000);
    }

    console.log(`✅ Posts Live in ${countryCode} | CPM: $8–$25 | Links:`, { affiliateLink, monitorLink });
    return { success: true, country: countryCode, links: { affiliateLink, monitorLink } };

  } catch (error) {
    console.error('🚨 Autonomous Women-Centric Posting Failed:', error.message);
    throw error;
  } finally {
    if (browser) await browser.close();
  }
};
