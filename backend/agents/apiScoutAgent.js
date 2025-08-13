// backend/agents/apiScoutAgent.js
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

/**
 * Autonomous API Scout Agent
 * Discovers real, free APIs from public-apis list
 * Uses existing ENV and integration patterns
 * No new dependencies — 100% compatible
 */
export const apiScoutAgent = async (CONFIG) => {
  console.log('🔍 API Scout Agent Activated: Scouting for new revenue APIs...');

  try {
    // Fetch the raw public-apis list
    const response = await axios.get(
      'https://raw.githubusercontent.com/public-apis/public-apis/master/entries.json',
      { timeout: 10000 }
    );

    const apis = response.data;

    // Target high-value, monetizable categories
    const targetCategories = [
      'Animals', 
      'Finance', 
      'News', 
      'Weather', 
      'Shopping', 
      'Science & Technology'
    ];

    // Filter for free, HTTPS, no-auth APIs
    const valuableApis = apis.filter(api => 
      targetCategories.includes(api.Category) &&
      api.Auth === '' && 
      api.HTTPS === 'true'
    );

    console.log(`✅ Found ${valuableApis.length} usable APIs`);

    const newKeys = {};

    // === 🐱 Animals: TheCatAPI, DogCEO ===
    const catApi = valuableApis.find(a => a.Link.includes('thecatapi.com'));
    if (catApi && !process.env.CAT_API_KEY && CONFIG.CAT_API_KEY) {
      newKeys.CAT_API_KEY = CONFIG.CAT_API_KEY;
      console.log('✅ Discovered CAT_API_KEY');
    }

    const dogApi = valuableApis.find(a => a.Link.includes('dog.ceo'));
    if (dogApi && !process.env.DOG_API_KEY) {
      newKeys.DOG_API_KEY = 'NO_KEY_REQUIRED'; // Free API
      console.log('✅ Integrated DOG_API (no key needed)');
    }

    // === 📰 News: NewsAPI, NewsData ===
    const newsApi = valuableApis.find(a => a.Link.includes('newsapi.org'));
    if (newsApi && !process.env.NEWS_API_KEY && CONFIG.NEWS_API_KEY) {
      newKeys.NEWS_API_KEY = CONFIG.NEWS_API_KEY;
      console.log('✅ Discovered NEWS_API_KEY');
    }

    // === 🌤️ Weather: OpenWeatherMap ===
    const weatherApi = valuableApis.find(a => a.Link.includes('openweathermap.org'));
    if (weatherApi && !process.env.WEATHER_API_KEY && CONFIG.WEATHER_API_KEY) {
      newKeys.WEATHER_API_KEY = CONFIG.WEATHER_API_KEY;
      console.log('✅ Discovered WEATHER_API_KEY');
    }

    // === 💰 Finance: CoinGecko, BscScan ===
    const coinGeckoApi = valuableApis.find(a => a.Link.includes('coingecko.com'));
    if (coinGeckoApi && !process.env.COINGECKO_API) {
      newKeys.COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';
    }

    const bscScanApi = valuableApis.find(a => a.Link.includes('bscscan.com'));
    if (bscScanApi && !process.env.BSCSCAN_API_KEY && CONFIG.BSCSCAN_API_KEY) {
      newKeys.BSCSCAN_API_KEY = CONFIG.BSCSCAN_API_KEY;
      console.log('✅ Discovered BSCSCAN_API_KEY');
    }

    // === 🛍️ Shopping: Amazon Affiliates ===
    const amazonApi = valuableApis.find(a => a.Link.includes('affiliate-program.amazon'));
    if (amazonApi && !process.env.AMAZON_AFFILIATE_TAG && CONFIG.AMAZON_AFFILIATE_TAG) {
      newKeys.AMAZON_AFFILIATE_TAG = CONFIG.AMAZON_AFFILIATE_TAG;
      console.log('✅ Discovered AMAZON_AFFILIATE_TAG');
    }

    // === 🔗 Ad Monetization: AdFly/Linkvertise ===
    const adFlyApi = valuableApis.find(a => a.Link.includes('adf.ly') || a.Link.includes('linkvertise'));
    if (adFlyApi && !process.env.ADFLY_USER_ID && CONFIG.ADFLY_USER_ID) {
      newKeys.ADFLY_USER_ID = CONFIG.ADFLY_USER_ID;
      newKeys.ADFLY_EMAIL = CONFIG.AI_EMAIL || 'arielmatrix@atomicmail.io';
      console.log('✅ Discovered ADFLY credentials');
    }

    // === 🧩 Save New Keys to revenue_keys.json ===
    if (Object.keys(newKeys).length > 0) {
      const keyPath = path.join(__dirname, '../revenue_keys.json');
      let existingKeys = {};

      try {
        const data = await fs.readFile(keyPath, 'utf8');
        existingKeys = JSON.parse(data);
      } catch (err) {
        console.warn('⚠️ No existing revenue_keys.json found, creating new one');
      }

      const updatedKeys = { ...existingKeys, ...newKeys };
      await fs.writeFile(keyPath, JSON.stringify(updatedKeys, null, 2), { mode: 0o600 });
      console.log(`✅ Saved ${Object.keys(newKeys).length} new keys to revenue_keys.json`);
    }

    // === 🔄 Inject into ENV (if not already set) ===
    for (const [key, value] of Object.entries(newKeys)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }

    console.log(`✅ API Scout Agent completed. Integrated ${Object.keys(newKeys).length} new revenue sources.`);
    return newKeys;

  } catch (error) {
    console.error('🚨 API Scout Agent Failed:', error.message);
    // Fail gracefully — do not stop the cycle
    return {};
  }
};
