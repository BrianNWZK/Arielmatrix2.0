// backend/agents/adRevenueAgent.js
import axios from 'axios';

export const adRevenueAgent = async (CONFIG) => {
  try {
    const requiredKeys = ['DOG_API_KEY', 'CAT_API_KEY', 'NEWS_API_KEY', 'REDDIT_API_KEY', 'ADFLY_API_KEY'];
    for (const key of requiredKeys) {
      if (!CONFIG[key] || CONFIG[key].includes('fallback')) {
        console.warn(`❌ Missing ${key}, skipping adRevenueAgent.`);
        return {};
      }
    }

    // Fetch content
    const dogRes = await axios.get('https://dog.ceo/api/breeds/image/random');
    const catRes = await axios.get('https://api.thecatapi.com/v1/images/search', {
      headers: { 'x-api-key': CONFIG.CAT_API_KEY }
    });

    const newsRes = await axios.get('https://newsapi.org/v2/top-headlines', {
      headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
      params: { category: 'general', pageSize: 1 }
    });

    const petImage = dogRes.data.message || catRes.data[0]?.url;
    const caption = `🐾 Cute pet! ${newsRes.data.articles[0]?.title || 'So cute!'}\n${CONFIG.UPTIMEROBOT_AFFILIATE_LINK}`;

    // Shorten with AdFly
    const shorten = async (url) => {
      try {
        const res = await axios.post('https://api.adf.ly/v1/shorten', {
          url,
          api_key: CONFIG.ADFLY_API_KEY,
          user_id: CONFIG.ADFLY_USER_ID
        });
        return res.data.short_url;
      } catch (e) {
        console.warn('AdFly shorten failed:', e.message);
        return url;
      }
    };

    const adflyImage = await shorten(petImage);
    const adflyAffiliate = await shorten(CONFIG.AMAZON_AFFILIATE_LINK);

    // Post to Reddit
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
      console.log('✅ Posted pet content to Reddit');
    } catch (e) {
      console.warn('Reddit post failed:', e.message);
    }

    // Track earnings
    try {
      const res = await axios.get('https://api.adf.ly/v1/stats', {
        headers: { Authorization: `Bearer ${CONFIG.ADFLY_API_KEY}` }
      });
      const earnings = parseFloat(res.data.earnings) || 0;
      if (earnings > 5) {
        console.log('🎯 Payout threshold reached. Triggering payoutAgent...');
        await import('./payoutAgent.js').then(m => m.payoutAgent(CONFIG));
      }
    } catch (e) {
      console.warn('AdFly analytics failed:', e.message);
    }

    return { success: true, links: { image: adflyImage, affiliate: adflyAffiliate } };
  } catch (error) {
    console.error('adRevenueAgent Error:', error.message);
    return { error: error.message };
  }
};
