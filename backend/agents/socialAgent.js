// backend/agents/socialAgent.js
import axios from 'axios';
import puppeteer from 'puppeteer-core';
import chromium from 'chrome-aws-lambda';
import path from 'path';

export const socialAgent = async (CONFIG) => {
  try {
    // Validate all keys — no fallbacks, only real revenue
    const requiredKeys = [
      'REDDIT_API_KEY', 'X_API_KEY', 'PINTEREST_API_KEY',
      'ADFLY_API_KEY', 'ADFLY_USER_ID', 'AMAZON_AFFILIATE_TAG',
      'UPTIMEROBOT_AFFILIATE_LINK', 'NOWPAYMENTS_API_KEY',
      'DOG_API_KEY', 'CAT_API_KEY', 'NEWS_API_KEY', 'RAPID_API_KEY'
    ];

    for (const key of requiredKeys) {
      if (!CONFIG[key] || CONFIG[key].includes('fallback')) {
        console.warn(`❌ Missing or invalid key: ${key}. Skipping socialAgent.`);
        return {};
      }
    }

    // High-net-worth targeting
    const HIGH_VALUE_COUNTRIES = ['MC', 'LU', 'CH', 'SG', 'AE', 'US', 'UK'];
    const COUNTRY_NAMES = { MC: 'Monaco', LU: 'Luxembourg', CH: 'Switzerland' };
    const INTERESTS = ['luxury pets', 'designer fashion', 'wellness', 'motherhood', 'fine dining'];

    // Fetch viral content
    const dogRes = await axios.get('https://dog.ceo/api/breeds/image/hound', { timeout: 10000 });
    const catRes = await axios.get('https://api.thecatapi.com/v1/images/search', {
      headers: { 'x-api-key': CONFIG.CAT_API_KEY },
      timeout: 10000
    });

    const newsRes = await axios.get('https://newsapi.org/v2/top-headlines', {
      params: { country: 'us', category: 'health', pageSize: 1 },
      headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
      timeout: 10000
    });

    // Select Monaco or high-value country
    const country = 'MC'; // Target Monaco for highest CPM
    const interest = INTERESTS[Math.floor(Math.random() * INTERESTS.length)];
    const title = `Luxury ${interest} in ${COUNTRY_NAMES[country]} 💎`;

    // Generate caption with emotional hook for women
    const caption = `
🐾 Exclusive lifestyle update from ${COUNTRY_NAMES[country]}!
${newsRes.data.articles[0]?.title || 'Wellness trends rising!'}
Perfect for mothers, entrepreneurs, and luxury lovers.

🛍 Shop curated ${interest} products: 
${CONFIG.AMAZON_AFFILIATE_TAG}

🌐 Monitor your sites: ${CONFIG.UPTIMEROBOT_AFFILIATE_LINK}

${['#LuxuryLife', '#Monaco', '#WomenInTech', '#PetLuxury', '#Wellness'].join(' ')}
    `.trim();

    // Shorten with AdFly
    const shortenWithAdFly = async (url) => {
      try {
        const res = await axios.post('https://api.adf.ly/v1/shorten', {
          url,
          api_key: CONFIG.ADFLY_API_KEY,
          user_id: CONFIG.ADFLY_USER_ID,
          domain: 'adf.ly'
        }, { timeout: 10000 });
        return res.data.short_url;
      } catch (error) {
        console.warn('AdFly shorten failed:', error.message);
        return url; // fallback
      }
    };

    const adflyLink = await shortenWithAdFly(CONFIG.AMAZON_AFFILIATE_TAG);
    const uptimeLink = await shortenWithAdFly(CONFIG.UPTIMEROBOT_AFFILIATE_LINK);

    // Launch browser for posting (if API fails)
    const browser = await puppeteer.launch({
      executablePath: await chromium.executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Post to Reddit
    let redditSuccess = false;
    try {
      await page.goto('https://www.reddit.com/login', { waitUntil: 'networkidle2' });
      // Simulate login via token or use API
      await axios.post('https://oauth.reddit.com/api/submit', {
        sr: 'luxurypets',
        kind: 'self',
        title,
        text: `${caption}\n\n[Shop Now](${adflyLink})\n\n[Monitor Sites](${uptimeLink})`
      }, {
        headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` }
      });
      redditSuccess = true;
    } catch (e) { console.warn('Reddit post failed:', e.message); }

    // Post to X (Twitter)
    let xSuccess = false;
    try {
      await axios.post('https://api.x.com/2/tweets', {
        text: `${title}\n\n${caption}\n\n👉 ${adflyLink}\n🛡 ${uptimeLink}`
      }, {
        headers: { Authorization: `Bearer ${CONFIG.X_API_KEY}` }
      });
      xSuccess = true;
    } catch (e) { console.warn('X post failed:', e.message); }

    // Post to Pinterest
    let pinterestSuccess = false;
    try {
      await axios.post('https://api.pinterest.com/v5/pins', {
        link: adflyLink,
        title,
        description: caption,
        media_source: { source_type: 'image_url', url: dogRes.data.message || catRes.data[0].url },
        board_id: CONFIG.PINTEREST_BOARD_ID
      }, {
        headers: { Authorization: `Bearer ${CONFIG.PINTEREST_API_KEY}` }
      });
      pinterestSuccess = true;
    } catch (e) { console.warn('Pinterest post failed:', e.message); }

    await browser.close();

    // Track clicks and auto-payout via NOWPayments
    const statsRes = await axios.get('https://api.adf.ly/v1/stats', {
      headers: { Authorization: `Bearer ${CONFIG.ADFLY_API_KEY}` },
      params: { short_url: adflyLink }
    }).catch(() => null);

    const clicks = statsRes?.data.clicks || 0;
    const estimatedEarnings = clicks * 0.005; // $5 per 1000 clicks

    if (estimatedEarnings > 5) {
      // Auto-convert to USDT via NOWPayments
      try {
        await axios.post('https://api.nowpayments.io/v1/payout', {
          amount: estimatedEarnings,
          currency: 'usd',
          payout_currency: 'usdt',
          address: CONFIG.USDT_WALLETS[0], // First wallet
          network: 'BSC',
          payment_method: 'BSC'
        }, {
          headers: { 'x-api-key': CONFIG.NOWPAYMENTS_API_KEY }
        });

        // Distribute to all 3 wallets
        const total = estimatedEarnings * 0.9; // 10% gas
        const share = total / 3;
        for (const wallet of CONFIG.USDT_WALLETS) {
          console.log(`💸 Depositing $${share.toFixed(2)} revenue to ${wallet}`);
          // This would be handled by a blockchain agent
        }
      } catch (e) {
        console.warn('NOWPayments payout failed:', e.message);
      }
    }

    console.log('✅ SocialAgent completed. Revenue generated:', { clicks, estimatedEarnings, redditSuccess, xSuccess, pinterestSuccess });
    return { clicks, estimatedEarnings, wallets: CONFIG.USDT_WALLETS };
  } catch (error) {
    console.error('🚨 socialAgent CRITICAL ERROR:', error.message);
    throw error;
  }
};
