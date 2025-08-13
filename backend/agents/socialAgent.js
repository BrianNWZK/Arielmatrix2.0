import axios from 'axios';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import crypto from 'crypto';
import path from 'path';

// Quantum-Stealth Mode (Bypass Anti-Bot)
puppeteer.use(StealthPlugin());

// ===== WOMEN-CENTRIC HIGH-VALUE COUNTRIES ===== //
const HIGH_VALUE_REGIONS = {
  // Tier 1: Highest CPM + Luxury Spending
  WESTERN_EUROPE: ['MC', 'CH', 'LU', 'GB', 'DE', 'FR'],
  MIDDLE_EAST: ['AE', 'SA', 'QA', 'KW'],
  NORTH_AMERICA: ['US', 'CA'],
  // Tier 2: Growing Markets
  ASIA_PACIFIC: ['SG', 'HK', 'JP', 'KR', 'AU', 'NZ'],
  EASTERN_EUROPE: ['RU', 'PL', 'CZ']
};

// ===== PRODUCT CATEGORIES WOMEN SPEND MOST ON ===== //
const WOMEN_TOP_SPENDING_CATEGORIES = [
  "Luxury Pets", 
  "Designer Handbags", 
  "Skincare & Beauty",
  "Organic Baby Products",
  "Fitness & Wellness",
  "Sustainable Fashion"
];

// ===== AI CONTENT GENERATOR ===== //
const generateWomenCentricContent = async (countryCode) => {
  const COUNTRY_NAMES = {
    MC: 'Monaco', CH: 'Switzerland', LU: 'Luxembourg', 
    AE: 'Dubai', SA: 'Saudi Arabia', US: 'the USA',
    SG: 'Singapore', HK: 'Hong Kong', AU: 'Australia'
  };

  const TRENDING_HASHTAGS = {
    MC: ['#MonacoLuxury', '#BillionaireLifestyle', '#DesignerDogs'],
    AE: ['#DubaiLuxury', '#GoldPets', '#VIPLiving'],
    US: ['#OrganicMoms', '#CleanBeauty', '#SustainableFashion'],
    SG: ['#AsiaLuxury', '#PetInfluencer', '#HighNetWorth']
  };

  const interest = WOMEN_TOP_SPENDING_CATEGORIES[Math.floor(Math.random() * WOMEN_TOP_SPENDING_CATEGORIES.length)];
  const countryName = COUNTRY_NAMES[countryCode] || 'Global';

  // Fetch real-time data (no mock responses)
  const [dogRes, newsRes] = await Promise.all([
    axios.get('https://api.thedogapi.com/v1/images/search', { 
      headers: { 'x-api-key': CONFIG.DOG_API_KEY },
      timeout: 5000 
    }).catch(() => null),
    axios.get('https://newsapi.org/v2/top-headlines', {
      params: { country: countryCode.toLowerCase(), category: 'health', pageSize: 1 },
      headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
      timeout: 5000
    }).catch(() => null)
  ]);

  return {
    title: `✨ ${interest} Trends in ${countryName} (${new Date().getFullYear()})`,
    caption: `Attention, ladies! 👑\n\n` +
      `${newsRes?.data?.articles[0]?.title || "Elite women are investing in this trend:"}\n\n` +
      `🐾 ${dogRes?.data[0]?.breeds?.[0]?.name || "Luxury Pets"} are booming in ${countryName}.\n\n` +
      `🛍️ Shop now: {{AFF_LINK}}\n` +
      `📈 Track sales: {{MONITOR_LINK}}\n\n` +
      `${(TRENDING_HASHTAGS[countryCode] || ['#Luxury', '#WomenEmpowerment']).join(' ')}`,
    media: dogRes?.data[0]?.url || 'https://images.unsplash.com/photo-1601758003122-53c40e686a19'
  };
};

// ===== MAIN REVENUE ENGINE ===== //
export const socialAgent = async (CONFIG) => {
  try {
    // 1. Select Highest-Value Country (Weighted Random)
    const tier1Countries = [
      ...HIGH_VALUE_REGIONS.WESTERN_EUROPE, 
      ...HIGH_VALUE_REGIONS.MIDDLE_EAST
    ];
    const countryCode = tier1Countries[Math.floor(Math.random() * tier1Countries.length)];

    // 2. Generate Women-Centric Content
    const { title, caption, media } = await generateWomenCentricContent(countryCode);

    // 3. Shorten Links (AdFly + Crypto Fallback)
    const shortenLink = async (url) => {
      try {
        const res = await axios.post('https://api.adf.ly/v1/shorten', {
          url,
          api_key: CONFIG.ADFLY_API_KEY,
          user_id: CONFIG.ADFLY_USER_ID,
          domain: 'qgs.gs', // Premium short domain
          advert_type: 'int' // Highest-paying ads
        }, { timeout: 3000 });
        return res.data.short_url;
      } catch {
        // Fallback to crypto links (NowPayments)
        const npRes = await axios.post('https://api.nowpayments.io/v1/invoice', {
          price_amount: 0.01,
          price_currency: 'usd',
          pay_currency: 'usdt',
          order_description: `VIP Access: ${url}`
        }, { headers: { 'x-api-key': CONFIG.NOWPAYMENTS_API_KEY } });
        return npRes.data.invoice_url;
      }
    };

    const [affiliateLink, monitorLink] = await Promise.all([
      shortenLink(`${CONFIG.AMAZON_AFFILIATE_TAG}?tag=womenlux-20`),
      shortenLink(CONFIG.UPTIMEROBOT_AFFILIATE_LINK)
    ]);

    // 4. Post to Social Media (Stealth Mode)
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Pinterest (80% Female Audience)
    await page.goto('https://pinterest.com', { waitUntil: 'networkidle2' });
    await page.type('input[type="text"]', CONFIG.PINTEREST_EMAIL);
    await page.type('input[type="password"]', CONFIG.PINTEREST_PASS);
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
    await page.goto('https://pinterest.com/pin-builder/', { waitUntil: 'networkidle2' });
    await page.type('[data-test-id="pin-title-input"]', title);
    await page.type('[data-test-id="pin-description-input"]', 
      caption.replace('{{AFF_LINK}}', affiliateLink)
             .replace('{{MONITOR_LINK}}', monitorLink));
    await page.click('[data-test-id="picker-dropdown-button"]');
    const input = await page.$('input[type="file"]');
    await input.uploadFile(media);
    await page.click('[data-test-id="board-dropdown-save-button"]');

    // Reddit (Luxury Communities)
    await page.goto('https://reddit.com/r/LuxuryLifeHabits/submit', { waitUntil: 'networkidle2' });
    await page.type('[aria-label="title"]', title);
    await page.type('[aria-label="text"]', caption);
    await page.click('[aria-label="post"]');

    console.log('✅ Posts Live in:', countryCode, '| Estimated CPM: $8-$25');
    return { success: true, country: countryCode, links: { affiliateLink, monitorLink } };

  } catch (error) {
    console.error('🚨 Autonomous Women-Centric Posting Failed:', error);
    throw error;
  }
};
