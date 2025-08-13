// backend/agents/apiScoutAgent.js
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

export const apiScoutAgent = async () => {
  console.log('🔍 API Scout Agent Activated: Searching for new revenue APIs...');

  try {
    // Fetch the raw list of APIs
    const res = await axios.get('https://raw.githubusercontent.com/public-apis/public-apis/master/entries.json');
    const apis = res.data;

    // Filter for high-value, monetizable APIs
    const targetCategories = ['Animals', 'Finance', 'Weather', 'News', 'Shopping', 'Social Media'];
    const monetizableApis = apis.filter(api => 
      targetCategories.includes(api.Category) && 
      api.Auth === '' && 
      !api.HTTPS.includes('false')
    );

    console.log(`✅ Found ${monetizableApis.length} monetizable APIs`);

    const newKeys = {};

    for (const api of monetizableApis) {
      try {
        // Try common key patterns (some APIs return keys in headers or body)
        if (api.Link.includes('thecatapi.com')) {
          newKeys.CAT_API_KEY = process.env.CAT_API_KEY || 'demo-cat-key';
        }
        if (api.Link.includes('newsapi.org')) {
          newKeys.NEWS_API_KEY = process.env.NEWS_API_KEY || 'demo-news-key';
        }
        if (api.Link.includes('openweathermap.org')) {
          // Trigger signup if needed
          const weatherKey = await signUpAndExtract(api.Link, 'input[name="email"]', 'button[type="submit"]');
          if (weatherKey) newKeys.WEATHER_API_KEY = weatherKey;
        }

        // Add more as needed
      } catch (e) {
        console.warn(`⚠️ Could not integrate ${api.API}:`, e.message);
      }
    }

    // Save to file
    const keyPath = path.join(process.cwd(), 'revenue_keys.json');
    const existing = JSON.parse(await fs.readFile(keyPath, 'utf8')).catch(() => ({}));
    await fs.writeFile(keyPath, JSON.stringify({ ...existing, ...newKeys }, null, 2));

    console.log(`✅ New keys integrated:`, Object.keys(newKeys));
    return newKeys;

  } catch (error) {
    console.error('🚨 API Scout Failed:', error.message);
    return {};
  }
};

// Helper: Try to sign up and extract key (simplified)
const signUpAndExtract = async (url, emailSelector, submitSelector) => {
  // Reuse puppeteer logic from apiKeyAgent.js
  return null; // Placeholder
};
