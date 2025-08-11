// backend/agents/forexSignalAgent.js
import axios from 'axios';
import tf from '@tensorflow/tfjs-node';
import { payoutAgent } from './payoutAgent.js';

export const forexSignalAgent = async (CONFIG, redisClient = null) => {
  try {
    console.log('📊 Starting forexSignalAgent...');

    // Validate required keys
    if (!CONFIG.NEWS_API_KEY || !CONFIG.ADFLY_API_KEY || !CONFIG.REDDIT_API_KEY) {
      console.warn('❌ Missing API keys for forexSignalAgent. Skipping.');
      return [];
    }

    // Fetch global data
    const countriesRes = await axios.get('https://restcountries.com/v3.1/all', { timeout: 10000 });
    const ratesRes = await axios.get('https://api.exchangerate.host/latest?base=USD', { timeout: 10000 });
    const newsRes = await axios.get('https://newsapi.org/v2/top-headlines', {
      params: { category: 'business', language: 'en', pageSize: 20 },
      headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
      timeout: 10000
    });

    // Load ML model for sentiment
    let model;
    try {
      model = await tf.loadLayersModel('file:///app/backend/sentiment-model.json');
    } catch (err) {
      console.warn('⚠️ Sentiment model not found, using rule-based fallback');
    }

    // Analyze sentiment
    const sentimentScores = newsRes.data.articles.map(article => {
      const title = article.title || '';
      const desc = article.description || '';
      let score = 0;

      if (model) {
        const input = tf.tensor2d([[title.length, desc.length]]);
        const prediction = model.predict(input);
        score = prediction.dataSync()[0];
        input.dispose();
        prediction.dispose();
      } else {
        // Rule-based fallback
        const positive = ['rises', 'growth', 'bullish', 'strong', 'increase'];
        const negative = ['falls', 'crash', 'bearish', 'decline', 'drop'];
        const text = (title + ' ' + desc).toLowerCase();
        const pos = positive.filter(w => text.includes(w)).length;
        const neg = negative.filter(w => text.includes(w)).length;
        score = (pos - neg) / (pos + neg + 1);
      }

      return { title, score };
    });

    // High-net-worth targeting: Monaco, Switzerland, UAE
    const HIGH_VALUE_COUNTRIES = ['MC', 'CH', 'AE', 'SG', 'LU'];
    const signals = countriesRes.data
      .filter(country => {
        const cc = country.cca2;
        return HIGH_VALUE_COUNTRIES.includes(cc) || country.independent;
      })
      .map(country => {
        const currencyCode = Object.keys(country.currencies || {})[0];
        if (!currencyCode) return null;

        const rate = ratesRes.data.rates[currencyCode] || 1;
        const countryName = country.name.common;
        const countryNews = sentimentScores.filter(s =>
          s.title.toLowerCase().includes(countryName.toLowerCase())
        );
        const avgSentiment = countryNews.length > 0
          ? countryNews.reduce((acc, s) => acc + s.score, 0) / countryNews.length
          : 0;

        let signal = 'Hold';
        if (avgSentiment > 0.3) signal = 'Buy';
        else if (avgSentiment < -0.3) signal = 'Sell';

        return {
          country: countryName,
          cca2: country.cca2,
          currency: currencyCode,
          rate: parseFloat(rate.toFixed(4)),
          sentiment: parseFloat(avgSentiment.toFixed(4)),
          signal,
          timestamp: new Date().toISOString()
        };
      })
      .filter(Boolean);

    // Shorten link with Redis + AdFly
    const shortenCustomUrl = async (originalUrl) => {
      const shortId = Math.random().toString(36).substring(2, 10);
      const customUrl = `${CONFIG.STORE_URL}/r/${shortId}`;
      if (redisClient) {
        await redisClient.set(`url:${shortId}`, originalUrl, { EX: 604800 }); // 7 days
      }
      return customUrl;
    };

    const baseSignalLink = `${CONFIG.STORE_URL}/forex`;
    let finalLink = baseSignalLink;

    try {
      const adFlyRes = await axios.post(
        'https://api.adf.ly/v1/shorten',
        {
          url: baseSignalLink,
          api_key: CONFIG.ADFLY_API_KEY,
          user_id: CONFIG.ADFLY_USER_ID
        },
        { timeout: 10000 }
      );
      finalLink = await shortenCustomUrl(adFlyRes.data.short_url);
    } catch (e) {
      console.warn('AdFly shorten failed:', e.message);
      finalLink = await shortenCustomUrl(baseSignalLink);
    }

    // Post top 3 signals to Reddit
    if (CONFIG.REDDIT_API_KEY) {
      const topSignals = signals.slice(0, 3).map(s => `🌍 ${s.country} | ${s.currency} | ${s.signal} | Sentiment: ${s.sentiment}`).join('\n');
      try {
        await axios.post(
          'https://oauth.reddit.com/api/submit',
          {
            sr: 'forextrading',
            kind: 'self',
            title: `Daily AI Forex Signals for High-Value Countries (${new Date().toLocaleDateString()})`,
            text: `${topSignals}\n\n🔗 Full signals: ${finalLink}\n\nMonitor your sites: ${CONFIG.UPTIMEROBOT_AFFILIATE_LINK}`
          },
          {
            headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` },
            timeout: 10000
          }
        );
        console.log('✅ Posted forex signals to Reddit');
      } catch (e) {
        console.warn('Reddit post failed:', e.message);
      }
    }

    // Track AdFly earnings and trigger payout
    let adFlyStats = { clicks: 0, earnings: 0 };
    try {
      const statsRes = await axios.get('https://api.adf.ly/v1/stats', {
        headers: { Authorization: `Bearer ${CONFIG.ADFLY_API_KEY}` },
        timeout: 10000
      });
      adFlyStats = {
        clicks: statsRes.data.clicks || 0,
        earnings: parseFloat(statsRes.data.earnings) || 0
      };

      if (adFlyStats.earnings > 5) {
        console.log(`🎯 Payout threshold reached: $${adFlyStats.earnings}. Triggering payoutAgent...`);
        await payoutAgent(CONFIG);
      }
    } catch (e) {
      console.warn('AdFly analytics failed:', e.message);
    }

    // Save to Redis for dashboard
    if (redisClient) {
      await redisClient.set('forex:signals', JSON.stringify(signals), { EX: 3600 });
      await redisClient.set('forex:stats', JSON.stringify(adFlyStats), { EX: 300 });
    }

    console.log(`📈 Generated ${signals.length} forex signals. Monetizing via AdFly.`);
    return signals;
  } catch (error) {
    console.error('🚨 forexSignalAgent CRITICAL ERROR:', error.message);
    throw error;
  }
};
