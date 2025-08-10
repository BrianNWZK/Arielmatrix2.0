import axios from 'axios';

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
    const newsResponse = await axios.get('https://newsapi.org/v2/top-headlines', {
      headers: { 'x-api-key': CONFIG.NEWS_API_KEY },
      params: { category: 'general', pageSize: 5 },
      timeout: 10000,
    });

    // Generate pet content
    const petContent = {
      image: dogResponse.data.message || catResponse.data[0]?.url,
      caption: `🐾 Cute pet of the day! In the news: ${newsResponse.data.articles[0]?.title || 'No news today!'} Monitor your site with UptimeRobot: ${CONFIG.UPTIMEROBOT_AFFILIATE_LINK}`,
    };

    // Shorten the pet image URL and Amazon affiliate link with AdFly for revenue
    let shortenedImageUrl = petContent.image;
    let shortenedAffiliateLink = CONFIG.AMAZON_AFFILIATE_LINK || 'https://www.amazon.com/pet-products?tag=your_affiliate_tag';
    if (CONFIG.ADFLY_API_KEY) {
      try {
        const adFlyResponseImage = await axios.post(
          'https://api.adf.ly/v1/shorten',
          { url: petContent.image, api_key: CONFIG.ADFLY_API_KEY },
          { timeout: 10000 }
        );
        shortenedImageUrl = adFlyResponseImage.data.short_url || petContent.image;

        const adFlyResponseAffiliate = await axios.post(
          'https://api.adf.ly/v1/shorten',
          { url: shortenedAffiliateLink, api_key: CONFIG.ADFLY_API_KEY },
          { timeout: 10000 }
        );
        shortenedAffiliateLink = adFlyResponseAffiliate.data.short_url || shortenedAffiliateLink;
      } catch (error) {
        console.warn('AdFly API Error:', error.message);
      }
    }

    // Post to Reddit for traffic
    if (CONFIG.REDDIT_API_KEY) {
      await axios.post(
        'https://oauth.reddit.com/api/submit',
        {
          sr: 'pets',
          kind: 'link',
          title: 'Daily Cute Pet Post',
          url: shortenedImageUrl,
          text: `${petContent.caption}\n\nShop pet products: ${shortenedAffiliateLink}`,
        },
        {
          headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` },
          timeout: 10000,
        }
      );
    }

    // Post to X for additional traffic
    if (CONFIG.X_API_KEY) {
      await axios.post(
        'https://api.x.com/2/tweets',
        {
          text: `${petContent.caption}\n\nShop pet products: ${shortenedAffiliateLink}`,
          media: { media_ids: [] }, // Add media upload logic if needed
        },
        {
          headers: { Authorization: `Bearer ${CONFIG.X_API_KEY}` },
          timeout: 10000,
        }
      );
    }

    console.log('Ad content generated:', { petContent, shortenedImageUrl, shortenedAffiliateLink });
    return {
      petContent,
      adStats: { clicksGenerated: 0 }, // Placeholder for click tracking (requires AdFly analytics)
      affiliateLink: shortenedAffiliateLink,
    };
  } catch (error) {
    console.error('adRevenueAgent Error:', error);
    throw new Error('Failed to generate ad revenue');
  }
};
