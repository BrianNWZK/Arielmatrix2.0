import axios from 'axios';
import { fetchAdSenseData } from './adsenseApi.js';

export const adRevenueAgent = async (CONFIG) => {
  try {
    // Fetch pet content from Dog and Cat APIs
    const dogResponse = await axios.get('https://dog.ceo/api/breeds/image/random', {
      headers: { 'x-api-key': CONFIG.DOG_API_KEY },
      timeout: 10000,
    });
    const catResponse = await axios.get('https://api.thecatapi.com/v1/images/search', {
      headers: { 'x-api-key': CONFIG.CAT_API_KEY },
      timeout: 10000,
    });

    // Fetch news for context
    const newsResponse = await axios.get('https://newsapi.org/v2/top-headlines', {
      headers: { 'x-api-key': CONFIG.NEWS_API_KEY },
      params: { category: 'general', pageSize: 5 },
      timeout: 10000,
    });

    // Generate pet content post
    const petContent = {
      image: dogResponse.data.message || catResponse.data[0]?.url,
      caption: `Cute pet of the day! In the news: ${newsResponse.data.articles[0]?.title || 'No news today!'}`,
    };

    // Post to Reddit for visibility
    if (CONFIG.REDDIT_API_KEY) {
      await axios.post('https://oauth.reddit.com/api/submit', {
        sr: 'pets',
        kind: 'link',
        title: 'Daily Cute Pet Post',
        url: petContent.image,
        text: petContent.caption,
      }, {
        headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` },
        timeout: 10000,
      });
    }

    // Fetch AdSense metrics
    const adStats = await fetchAdSenseData(CONFIG);

    // Mock Amazon affiliate link for pet products
    const affiliateLink = 'https://www.amazon.com/pet-products?tag=mockaffiliate123';

    console.log('Ad content generated:', { petContent, adStats, affiliateLink });
    return { petContent, adStats, affiliateLink };
  } catch (error) {
    console.error('adRevenueAgent Error:', error);
    return { petContent: {}, adStats: { pageViews: 0, adRequests: 0, earnings: 0 }, affiliateLink: '' };
  }
};
