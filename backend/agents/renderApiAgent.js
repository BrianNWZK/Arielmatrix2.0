// backend/agents/renderApiAgent.js
import axios from 'axios';
import fs from 'fs/promises';

export const renderApiAgent = async (CONFIG) => {
  try {
    if (!CONFIG.RENDER_API_TOKEN) {
      console.warn('⚠️ RENDER_API_TOKEN missing. Skipping renderApiAgent.');
      return;
    }

    // Resolve service ID dynamically
    const SERVICE_ID = process.env.RENDER_SERVICE_ID || 'srv-cmabc123456789'; // Set in Render env
    const BASE_URL = `https://api.render.com/v1/services/${SERVICE_ID}/env-vars`;

    // Read keys from api-keys.json
    const keysData = await fs.readFile('api-keys.json', 'utf8').catch(() => '{}');
    const keys = JSON.parse(keysData);

    // Define env vars to update
    const envVars = [
      { key: 'NEWS_API_KEY', value: keys.NEWS_API_KEY },
      { key: 'WEATHER_API_KEY', value: keys.WEATHER_API_KEY },
      { key: 'X_API_KEY', value: keys.X_API_KEY },
      { key: 'BSCSCAN_API_KEY', value: keys.BSCSCAN_API_KEY },
      { key: 'REDDIT_API_KEY', value: keys.REDDIT_API_KEY },
      { key: 'SOLANA_API_KEY', value: keys.SOLANA_API_KEY },
      { key: 'ADFLY_API_KEY', value: keys.ADFLY_API_KEY },
      { key: 'ADFLY_USER_ID', value: keys.ADFLY_USER_ID },
    ].filter(env => env.value && !env.value.includes('fallback'));

    if (envVars.length === 0) {
      console.log('No valid API keys to update in Render.');
      return;
    }

    // Fetch existing env vars to avoid duplicates
    const existingRes = await axios.get(BASE_URL, {
      headers: { Authorization: `Bearer ${CONFIG.RENDER_API_TOKEN}` }
    });

    const existingKeys = existingRes.data.reduce((acc, env) => {
      acc[env.key] = env.id;
      return acc;
    }, {});

    // Update or create each env var
    for (const envVar of envVars) {
      const method = existingKeys[envVar.key] ? 'PUT' : 'POST';
      const url = method === 'PUT' ? `${BASE_URL}/${existingKeys[envVar.key]}` : BASE_URL;

      try {
        await axios({
          method,
          url,
          headers: {
            Authorization: `Bearer ${CONFIG.RENDER_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          data: { key: envVar.key, value: envVar.value }
        });

        console.log(`.updateDynamic ${method === 'POST' ? 'Added' : 'Updated'}: ${envVar.key}`);
      } catch (error) {
        console.warn(`Failed to update ${envVar.key}:`, error.message);
      }
    }

    console.log('✅ Render environment variables updated successfully.');
  } catch (error) {
    console.error('🚨 RenderApiAgent Error:', error.message);
    throw error;
  }
};
