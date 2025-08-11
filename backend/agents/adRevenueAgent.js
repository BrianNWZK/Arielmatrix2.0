// backend/agents/adRevenueAgent.js
import axios from 'axios';
import { createClient } from 'redis';

// Initialize Redis
const redisClient = createClient({ url: process.env.REDIS_URL });
redisClient.on('error', (err) => console.warn('Redis error:', err));
await redisClient.connect().catch(() => {});

export const adRevenueAgent = async (CONFIG) => {
  try {
    const requiredKeys = [
      'DOG_API_KEY', 'CAT_API_KEY', 'NEWS_API_KEY',
      'REDDIT_API_KEY', 'X_API_KEY', 'ADFLY_API_KEY',
      'CHANGELLY_API_KEY', 'AMAZON_AFFILIATE_LINK'
    ];

    for (const key of requiredKeys) {
      if (!CONFIG[key] || CONFIG[key].includes('fallback')) {
        console.log(`❌ Missing or invalid ${key}, skipping adRevenueAgent.`);
        return {};
      }
    }

    // Fetch content
    const dogRes = await axios.get('https://dog.ceo/api/breeds/image/random', { timeout: 10000 });
    const catRes = await axios.get('https://api.thecatapi.com/v1/images/search', {
      headers: { 'x-api-key': CONFIG.CAT_API_KEY },
      timeout: 10000
    });

    const newsRes = await axios.get('https://newsapi.org/v2/top-headlines', {
      headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
      params: { category: 'general', pageSize: 1 },
      timeout: 10000
    });

    const petImage = dogRes.data.message || catRes.data[0]?.url;
    const caption = `🐾 Cute pet of the day! ${newsRes.data.articles[0]?.title || 'Cute news!'}\nMonitor your site: ${CONFIG.UPTIMEROBOT_AFFILIATE_LINK}`;

    // Shorten with AdFly
    const shorten = async (url) => {
      try {
        const res = await axios.post('https://api.adf.ly/v1/shorten', {
          url,
          api_key: CONFIG.ADFLY_API_KEY,
          user_id: CONFIG.ADFLY_USER_ID,
        }, { timeout: 10000 });
        const shortUrl = res.data.short_url;
        const shortId = shortUrl.split('/').pop();
        await redisClient.set(`${CONFIG.STORE_URL}/r/${shortId}`, shortUrl);
        return shortUrl;
      } catch (e) {
        console.warn('AdFly shorten failed:', e.message);
        return url;
      }
    };

    const adflyImage = await shorten(petImage);
    const adflyAffiliate = await shorten(CONFIG.AMAZON_AFFILIATE_LINK);

    // Post to Reddit
    let redditPostId = null;
    try {
      await axios.post('https://oauth.reddit.com/api/submit', {
        sr: 'aww',
        kind: 'link',
        title: 'Daily Cute Pet!',
        url: adflyImage,
        text: `${caption}\n\nShop: ${adflyAffiliate}`
      }, {
        headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` }
      });
      redditPostId = 'success';
    } catch (e) {
      console.warn('Reddit post failed:', e.message);
    }

    // Post to X
    let xPostId = null;
    try {
      const res = await axios.post('https://api.x.com/2/tweets', {
        text: `${caption}\n\n${adflyAffiliate}`
      }, {
        headers: { Authorization: `Bearer ${CONFIG.X_API_KEY}` }
      });
      xPostId = res.data.data?.id;
    } catch (e) {
      console.warn('X post failed:', e.message);
    }

    // Track earnings
    let adFlyStats = { clicks: 0, earnings: 0 };
    try {
      const res = await axios.get('https://api.adf.ly/v1/stats', {
        headers: { Authorization: `Bearer ${CONFIG.ADFLY_API_KEY}` }
      });
      adFlyStats = { clicks: res.data.clicks, earnings: res.data.earnings };
      if (adFlyStats.earnings > 5) {
        console.log('🎯 Payout threshold reached. Triggering payoutAgent...');
        await import('./payoutAgent.js').then(m => m.payoutAgent(CONFIG));
      }
    } catch (e) {
      console.warn('AdFly analytics failed:', e.message);
    }

    return { adFlyStats, redditPostId, xPostId, links: { image: adflyImage, affiliate: adflyAffiliate } };
  } catch (error) {
    console.error('adRevenueAgent Error:', error);
    return { error: error.message };
  }
};
