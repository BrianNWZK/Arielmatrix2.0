import axios from 'axios';
import { Keypair, Connection, PublicKey } from '@solana/web3.js';

export const socialAgent = async (CONFIG) => {
  try {
    // Validate API keys
    if (
      !CONFIG.REDDIT_API_KEY ||
      !CONFIG.X_API_KEY ||
      !CONFIG.PINTEREST_API_KEY ||
      !CONFIG.ADFLY_API_KEY ||
      !CONFIG.DOG_API_KEY ||
      !CONFIG.CAT_API_KEY ||
      !CONFIG.NEWS_API_KEY ||
      !CONFIG.RAPID_API_KEY ||
      Object.values(CONFIG).some((key) => key?.includes('fallback'))
    ) {
      console.log('Invalid or fallback API keys detected, skipping social revenue generation');
      return {};
    }

    // Initialize Solana wallet for tracking (replace with your wallet public key)
    const SOLANA_WALLET = process.env.SOLANA_WALLET || 'YOUR_SOLANA_PUBLIC_KEY';
    const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

    // Fetch viral pet content
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
    const countriesResponse = await axios.get('https://restcountries.com/v3.1/all', { timeout: 10000 });

    // Fetch trending hashtags from X
    let trends = [];
    try {
      const trendsResponse = await axios.get(`${CONFIG.X_API}?query=trending`, {
        headers: { Authorization: `Bearer ${CONFIG.X_API_KEY}` },
        timeout: 10000,
      });
      trends = trendsResponse.data.data?.slice(0, 3).map((t) => `#${t.name}`) || ['#Pets', '#Cute', '#Viral'];
    } catch (error) {
      console.warn('X Trends API Error:', error.message);
      trends = ['#Pets', '#Cute', '#Viral'];
    }

    // Select random country and translate caption
    const randomCountry = countriesResponse.data[Math.floor(Math.random() * countriesResponse.data.length)];
    const countryName = randomCountry.name.common;
    const countryLang = randomCountry.languages ? Object.values(randomCountry.languages)[0] : 'en';
    let caption = `🐾 Cute pet of the day for ${countryName}! In the news: ${
      newsResponse.data.articles[0]?.title || 'No news today!'
    }\nMonitor your site with UptimeRobot: ${CONFIG.UPTIMEROBOT_AFFILIATE_LINK}\n${trends.join(' ')}`;
    try {
      const translateResponse = await axios.get('https://google-translate1.p.rapidapi.com/language/translate/v2', {
        headers: {
          'x-rapidapi-key': CONFIG.RAPID_API_KEY,
          'x-rapidapi-host': 'google-translate1.p.rapidapi.com',
        },
        params: {
          q: caption,
          target: countryLang,
          source: 'en',
        },
        timeout: 10000,
      });
      caption = translateResponse.data.data.translations[0].translatedText || caption;
    } catch (error) {
      console.warn('Translation Error:', error.message);
    }

    // Generate pet content
    const petContent = {
      image: dogResponse.data.message || catResponse.data[0]?.url,
      caption,
    };

    // Custom URL shortener (in-memory tracking, replace with database in production)
    const shortenCustomUrl = async (originalUrl) => {
      const shortId = Math.random().toString(36).substring(2, 10);
      const customUrl = `${CONFIG.STORE_URL}/r/${shortId}`;
      // Store mapping in memory (use Redis/MongoDB for persistence)
      global.urlMappings = global.urlMappings || {};
      global.urlMappings[customUrl] = originalUrl;
      return customUrl;
    };

    // Shorten URLs with AdFly and custom shortener
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
    const subreddits = ['pets', 'aww', 'cats'];
    const redditPosts = [];
    if (CONFIG.REDDIT_API_KEY) {
      for (const subreddit of subreddits) {
        try {
          const redditPost = await axios.post(
            'https://oauth.reddit.com/api/submit',
            {
              sr: subreddit,
              kind: 'link',
              title: `Cute Pet of the Day for ${countryName}!`,
              url: shortenedImageUrl,
              text: `${caption}\n\nShop pet products: ${shortenedAffiliateLink}`,
            },
            {
              headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` },
              timeout: 10000,
            }
          );
          redditPosts.push({ subreddit, postId: redditPost.data.data?.name });
        } catch (error) {
          console.warn(`Reddit Post Error (${subreddit}):`, error.message);
        }
      }
    }

    // Post to X
    let xPostId = null;
    if (CONFIG.X_API_KEY) {
      try {
        const xPost = await axios.post(
          'https://api.x.com/2/tweets',
          {
            text: `${caption}\n\nShop pet products: ${shortenedAffiliateLink}`,
            media: { media_ids: [] },
          },
          {
            headers: { Authorization: `Bearer ${CONFIG.X_API_KEY}` },
            timeout: 10000,
          }
        );
        xPostId = xPost.data.data?.id;
      } catch (error) {
        console.warn('X Post Error:', error.message);
      }
    }

    // Post to Pinterest
    let pinterestPinId = null;
    if (CONFIG.PINTEREST_API_KEY) {
      try {
        const pinterestPost = await axios.post(
          'https://api.pinterest.com/v5/pins',
          {
            link: shortenedAffiliateLink,
            title: `Cute Pet of the Day for ${countryName}!`,
            description: `${caption}\n\nShop pet products!`,
            media_source: { source_type: 'image_base64', content_type: 'image/jpeg', data: petContent.image },
            board_id: CONFIG.PINTEREST_BOARD_ID || 'default_board',
          },
          {
            headers: { Authorization: `Bearer ${CONFIG.PINTEREST_API_KEY}` },
            timeout: 10000,
          }
        );
        pinterestPinId = pinterestPost.data.id;
      } catch (error) {
        console.warn('Pinterest Post Error:', error.message);
      }
    }

    // Post to Tumblr via RapidAPI
    let tumblrPostId = null;
    if (CONFIG.RAPID_API_KEY) {
      try {
        const tumblrPost = await axios.post(
          'https://tumblr4u.p.rapidapi.com/v2/blog/post',
          {
            blog: 'your-blog.tumblr.com', // Replace with your Tumblr blog
            type: 'photo',
            caption: `${caption}\n\nShop pet products: ${shortenedAffiliateLink}`,
            source: petContent.image,
            tags: trends.join(',').replace(/#/g, ''),
          },
          {
            headers: {
              'x-rapidapi-key': CONFIG.RAPID_API_KEY,
              'x-rapidapi-host': 'tumblr4u.p.rapidapi.com',
            },
            timeout: 10000,
          }
        );
        tumblrPostId = tumblrPost.data.response?.id;
      } catch (error) {
        console.warn('Tumblr Post Error:', error.message);
      }
    }

    // Cross-promote top Reddit post
    if (redditPosts.length > 0) {
      const topPost = redditPosts[0];
      const crossPromoText = `Check out this cute pet post on Reddit! https://reddit.com/r/${topPost.subreddit}/comments/${topPost.postId}\n${caption}\n\nShop: ${shortenedAffiliateLink}`;
      if (xPostId) {
        try {
          await axios.post(
            'https://api.x.com/2/tweets',
            { text: crossPromoText, reply: { in_reply_to_tweet_id: xPostId } },
            { headers: { Authorization: `Bearer ${CONFIG.X_API_KEY}` }, timeout: 10000 }
          );
        } catch (error) {
          console.warn('X Cross-Promo Error:', error.message);
        }
      }
      if (pinterestPinId) {
        try {
          await axios.post(
            'https://api.pinterest.com/v5/pins',
            {
              link: `https://reddit.com/r/${topPost.subreddit}/comments/${topPost.postId}`,
              title: `Cute Pet from Reddit!`,
              description: crossPromoText,
              media_source: { source_type: 'image_base64', content_type: 'image/jpeg', data: petContent.image },
              board_id: CONFIG.PINTEREST_BOARD_ID || 'default_board',
            },
            { headers: { Authorization: `Bearer ${CONFIG.PINTEREST_API_KEY}` }, timeout: 10000 }
          );
        } catch (error) {
          console.warn('Pinterest Cross-Promo Error:', error.message);
        }
      }
      if (tumblrPostId) {
        try {
          await axios.post(
            'https://tumblr4u.p.rapidapi.com/v2/blog/post',
            {
              blog: 'your-blog.tumblr.com',
              type: 'link',
              url: `https://reddit.com/r/${topPost.subreddit}/comments/${topPost.postId}`,
              title: `Cute Pet from Reddit!`,
              description: crossPromoText,
              tags: trends.join(',').replace(/#/g, ''),
            },
            {
              headers: {
                'x-rapidapi-key': CONFIG.RAPID_API_KEY,
                'x-rapidapi-host': 'tumblr4u.p.rapidapi.com',
              },
              timeout: 10000,
            }
          );
        } catch (error) {
          console.warn('Tumblr Cross-Promo Error:', error.message);
        }
      }
    }

    // Track AdFly clicks and earnings
    let adFlyStats = { clicks: 0, earnings: 0 };
    try {
      const adFlyAnalytics = await axios.get('https://api.adf.ly/v1/stats', {
        headers: { Authorization: `Bearer ${CONFIG.ADFLY_API_KEY}` },
        timeout: 10000,
      });
      adFlyStats = {
        clicks: adFlyAnalytics.data.clicks || 0,
        earnings: adFlyAnalytics.data.earnings || 0,
      };
    } catch (error) {
      console.warn('AdFly Analytics Error:', error.message);
    }

    // Convert earnings to Solana wallet via Coinbase Commerce
    if (adFlyStats.earnings > 5 && process.env.COINBASE_COMMERCE_API_KEY) {
      try {
        const charge = await axios.post(
          'https://api.commerce.coinbase.com/charges',
          {
            name: 'AdFly Earnings',
            description: `Converting ${adFlyStats.earnings} USD to SOL`,
            pricing_type: 'fixed_price',
            local_price: { amount: adFlyStats.earnings, currency: 'USD' },
            metadata: { wallet: SOLANA_WALLET },
            redirect_url: `${CONFIG.STORE_URL}/success`,
            cancel_url: `${CONFIG.STORE_URL}/cancel`,
          },
          {
            headers: { 'X-CC-Api-Key': process.env.COINBASE_COMMERCE_API_KEY },
            timeout: 10000,
          }
        );
        console.log('Coinbase charge created:', charge.data.data.hosted_url);
      } catch (error) {
        console.warn('Coinbase Commerce Error:', error.message);
      }
    }

    console.log('Social content posted:', { petContent, redditPosts, xPostId, pinterestPinId, tumblrPostId, adFlyStats });
    return {
      petContent,
      socialPosts: { reddit: redditPosts, x: xPostId, pinterest: pinterestPinId, tumblr: tumblrPostId },
      adFlyStats,
      affiliateLink: shortenedAffiliateLink,
      wallet: SOLANA_WALLET,
    };
  } catch (error) {
    console.error('socialAgent Error:', error);
    throw new Error('Failed to generate social revenue');
  }
};
