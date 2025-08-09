import axios from 'axios';
import fs from 'fs/promises';

export const renderApiAgent = async (CONFIG) => {
  try {
    if (!CONFIG.RENDER_API_TOKEN) {
      throw new Error('Render API token missing');
    }
    // Read keys from local storage
    const keysData = await fs.readFile('api-keys.json', 'utf8').catch(() => '{}');
    const keys = JSON.parse(keysData);
    const envVars = [
      { key: 'NEWS_API_KEY', value: keys.NEWS_API_KEY },
      { key: 'WEATHER_API_KEY', value: keys.WEATHER_API_KEY },
      { key: 'TWITTER_API_KEY', value: keys.TWITTER_API_KEY },
      { key: 'BSCSCAN_API_KEY', value: keys.BSCSCAN_API_KEY },
    ];

    for (const envVar of envVars) {
      if (envVar.value) {
        await axios.put(
          'https://api.render.com/v1/services/arielmatrix-backend/env-vars',
          { key: envVar.key, value: envVar.value },
          { headers: { Authorization: `Bearer ${CONFIG.RENDER_API_TOKEN}` } }
        );
      }
    }
    console.log('Render environment variables updated');
  } catch (error) {
    console.error('RenderApiAgent Error:', error);
    throw error;
  }
};
