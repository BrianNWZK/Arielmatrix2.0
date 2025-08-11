import axios from 'axios';

export const adRevenueAgent = async (CONFIG) => {
  try {
    // Validate API keys
    if (
      !CONFIG.DOG_API_KEY ||
      !CONFIG.CAT_API_KEY ||
      !CONFIG.NEWS_API_KEY ||
      !CONFIG.REDDIT_API_KEY ||
      !CONFIG.X_API_KEY ||
      !CONFIG.ADFLY_API_KEY ||
      !CONFIG.CHANGELLY_API_KEY ||
      Object.values(CONFIG).some((key) => key?.includes('fallback'))
    ) {
      console.log('Invalid or fallback API keys detected, skipping ad revenue generation');
      return {};
    }

    // Wallet address
    const USDT_WALLET = process.env.USDT_WALLET || '0x1515a63013cc44c143c3d3cd1fcaeec180b7d076';

    // Fetch pet content
    const dogResponse = await axios.get('https://dog.ceo/api/breeds/image/random', {
      headers: { 'x-api-key': CONFIG.DOG_API_KEY },
      timeout: 10000,
    });
    const catResponse = await axios.get('https://api.thecatapi.com/v1/images/search', {
      headers: { 'x-api-key': CONFIG.CAT_API_KEY },
      timeout: 10000,
    });
    const newsResponse = await axios.get('https://newsapi.org/v2/top-headlines', {
      headers: { 'x-api-key': CONFIG.NEWS_API_KEY },
      params: { category: 'general', pageSize: 5 },
      timeout: 10000,
    });

    // Generate pet content
    const petContent = {
      image: dogResponse.data.message || catResponse.data[0]?.url,
      caption: `🐾 Cute pet of the day! In the news: ${newsResponse.data.articles[0]?.title || 'No news today!'}\nMonitor your site with UptimeRobot: ${CONFIG.UPTIMEROBOT_AFFILIATE_LINK}`,
    };

    // Custom URL shortener
    const shortenCustomUrl = async (originalUrl) => {
      const shortId = Math.random().toString(36).substring(2, 10);
      const customUrl = `${CONFIG.STORE_URL}/r/${shortId}`;
      global.urlMappings = global.urlMappings || {};
      global.urlMappings[customUrl] = originalUrl;
      return customUrl;
    };

    // Shorten URLs with AdFly
    let shortenedImageUrl = petContent.image;
    let shortenedAffiliateLink = CONFIG.AMAZON_AFFILIATE_LINK || 'https://www.amazon.com/pet-products?tag=your_affiliate_tag';
    try {
      const adFlyResponseImage = await axios.post(
        'https://api.adf.ly/v1/shorten',
        { url: petContent.image, api_key: CONFIG.ADFLY_API_KEY },
        { timeout: 10000 }
      );
      shortenedImageUrl = await shortenCustomUrl(adFlyResponseImage.data.short_url || petContent.image);

      const adFlyResponseAffiliate = await axios.post(
        'https://api.adf.ly/v1/shorten',
        { url: shortenedAffiliateLink, api_key: CONFIG.ADFLY_API_KEY },
        { timeout: 10000 }
      );
      shortenedAffiliateLink = await shortenCustomUrl(adFlyResponseAffiliate.data.short_url || shortenedAffiliateLink);
    } catch (error) {
      console.warn('AdFly API Error:', error.message);
    }

    // Post to Reddit
    const redditPosts = [];
    if (CONFIG.REDDIT_API_KEY) {
      try {
        const redditPost = await axios.post(
          'https://oauth.reddit.com/api/submit',
          {
            sr: 'pets',
            kind: 'link',
            title: 'Daily Cute Pet Post',
            url: shortenedImageUrl,
            text: `${petContent.caption}\n\nShop pet products: ${shortenedAffiliateLink}`,
          },
          { headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` }, timeout: 10000 }
        );
        redditPosts.push({ subreddit: 'pets', postId: redditPost.data.data?.name });
      } catch (error) {
        console.warn('Reddit Post Error:', error.message);
      }
    }

    // Post to X
    let xPostId = null;
    if (CONFIG.X_API_KEY) {
      try {
        const xPost = await axios.post(
          'https://api.x.com/2/tweets',
          { text: `${petContent.caption}\n\nShop pet products: ${shortenedAffiliateLink}`, media: { media_ids: [] } },
          { headers: { Authorization: `Bearer ${CONFIG.X_API_KEY}` }, timeout: 10000 }
        );
        xPostId = xPost.data.data?.id;
      } catch (error) {
        console.warn('X Post Error:', error.message);
      }
    }

    // Track AdFly clicks and earnings
    let adFlyStats = { clicks: 0, earnings: 0 };
    try {
      const adFlyAnalytics = await axios.get('https://api.adf.ly/v1/stats', {
        headers: { Authorization: `Bearer ${CONFIG.ADFLY_API_KEY}` },
        timeout: 10000,
      });
      adFlyStats = { clicks: adFlyAnalytics.data.clicks || 0, earnings: adFlyAnalytics.data.earnings || 0 };
      if (adFlyStats.earnings > 5) {
        await payoutAgent(CONFIG);
      }
    } catch (error) {
      console.warn('AdFly Analytics Error:', error.message);
    }

    console.log('Ad content generated:', { petContent, redditPosts, xPostId, adFlyStats });
    return { petContent, socialPosts: { reddit: redditPosts, x: xPostId }, adFlyStats, affiliateLink: shortenedAffiliateLink, wallet: CONFIG.USDT_WALLET };
  } catch (error) {
    console.error('adRevenueAgent Error:', error);
    throw new Error('Failed to generate ad revenue');
  }
};
