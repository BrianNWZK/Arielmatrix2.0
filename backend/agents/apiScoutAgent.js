// backend/agents/apiScoutAgent.js
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

export const apiScoutAgent = async (CONFIG) => {
  console.log('🔍 API Scout Agent Activated: Scouting for new revenue APIs...');

  try {
    // ✅ Fixed URL: Use /main/ instead of /master/
    const res = await axios.get(
      'https://raw.githubusercontent.com/public-apis/public-apis/main/entries.json',
      { timeout: 10000 }
    );
    const apis = res.data;

    // Filter for high-value, monetizable APIs
    const targetCategories = ['Animals', 'Finance', 'Weather', 'News', 'Shopping', 'Social Media'];
    const monetizableApis = apis.filter(api =>
      targetCategories.includes(api.Category) &&
      api.Auth === '' &&
      api.HTTPS === 'true'
    ).slice(0, 30);

    console.log(`✅ Found ${monetizableApis.length} monetizable APIs`);

    const newKeys = {};

    // Add known APIs
    const catApi = monetizableApis.find(a => a.Link.includes('thecatapi.com'));
    if (catApi && !process.env.CAT_API_KEY && CONFIG.CAT_API_KEY) {
      newKeys.CAT_API_KEY = CONFIG.CAT_API_KEY;
    }

    const newsApi = monetizableApis.find(a => a.Link.includes('newsapi.org'));
    if (newsApi && !process.env.NEWS_API_KEY && CONFIG.NEWS_API_KEY) {
      newKeys.NEWS_API_KEY = CONFIG.NEWS_API_KEY;
    }

    const weatherApi = monetizableApis.find(a => a.Link.includes('openweathermap.org'));
    if (weatherApi && !process.env.WEATHER_API_KEY && CONFIG.WEATHER_API_KEY) {
      newKeys.WEATHER_API_KEY = CONFIG.WEATHER_API_KEY;
    }

    // Save to file
    if (Object.keys(newKeys).length > 0) {
      const keyPath = path.join(__dirname, '../revenue_keys.json');
      let existingKeys = {};
      try {
        existingKeys = JSON.parse(await fs.readFile(keyPath, 'utf8'));
      } catch (e) {}
      await fs.writeFile(keyPath, JSON.stringify({ ...existingKeys, ...newKeys }, null, 2), { mode: 0o600 });
      console.log(`✅ Saved ${Object.keys(newKeys).length} new keys to revenue_keys.json`);
      Object.assign(process.env, newKeys);
    }

    return newKeys;

  } catch (error) {
    console.error('🚨 API Scout Agent Failed:', error.message);
    return {};
  }
};
