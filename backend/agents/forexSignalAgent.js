// backend/agents/forexSignalAgent.js
import axios from 'axios';
import tf from '@tensorflow/tfjs-node';

export const forexSignalAgent = async (CONFIG, redisClient = null) => {
  try {
    console.log('📊 Starting forexSignalAgent...');

    // Validate required keys
    if (!CONFIG.NEWS_API_KEY || !CONFIG.ADFLY_API_KEY) {
      console.warn('❌ Missing NEWS_API_KEY or ADFLY_API_KEY. Skipping.');
      return [];
    }

    // Fetch data with clean URLs (no trailing spaces)
    const countriesRes = await axios.get('https://restcountries.com/v3.1/all', { timeout: 10000 });
    const ratesRes = await axios.get('https://api.exchangerate.host/latest?base=USD', { timeout: 10000 });
    
    const newsRes = await axios.get('https://newsapi.org/v2/top-headlines', {
      params: { category: 'business', language: 'en', pageSize: 20 },
      headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
      timeout: 10000
    });

    // Sentiment analysis (fallback if model not found)
    const sentimentScores = newsRes.data.articles.map(article => {
      const title = (article.title || '').toLowerCase();
      const desc = (article.description || '').toLowerCase();
      const positive = ['rises', 'growth', 'bullish', 'strong', 'increase'];
      const negative = ['falls', 'crash', 'bearish', 'decline', 'drop'];
      const pos = positive.filter(w => title.includes(w) || desc.includes(w)).length;
      const neg = negative.filter(w => title.includes(w) || desc.includes(w)).length;
      return { title, score: (pos - neg) / (pos + neg + 1) };
    });

    // Target high-net-worth countries
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
        const countryNews = sentimentScores.filter(s => s.title.includes(countryName.toLowerCase()));
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

    // Shorten link
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
      finalLink = adFlyRes.data.short_url;
    } catch (e) {
      console.warn('AdFly shorten failed:', e.message?.substring(0, 60));
    }

    // Post to Reddit
    if (CONFIG.REDDIT_API_KEY) {
      const topSignals = signals.slice(0, 3).map(s => `🌍 ${s.country} | ${s.currency} | ${s.signal}`).join('\n');
      try {
        await axios.post(
          'https://oauth.reddit.com/api/submit',
          {
            sr: 'forex',
            kind: 'self',
            title: `AI Forex Signals (${new Date().toLocaleDateString()})`,
            text: `${topSignals}\n\n🔗 ${finalLink}\n\n${CONFIG.UPTIMEROBOT_AFFILIATE_LINK}`
          },
          {
            headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` },
            timeout: 10000
          }
        );
        console.log('✅ Posted forex signals to Reddit');
      } catch (e) {
        console.warn('Reddit post failed:', e.message?.substring(0, 60));
      }
    }

    // Check AdFly earnings and trigger payout
    try {
      const statsRes = await axios.get('https://api.adf.ly/v1/stats', {
        headers: { Authorization: `Bearer ${CONFIG.ADFLY_API_KEY}` },
        timeout: 10000
      });
      const earnings = parseFloat(statsRes.data.earnings) || 0;

      if (earnings > 5) {
        console.log(`🎯 Payout triggered: $${earnings}`);
        await import('./payoutAgent.js').then(m => m.payoutAgent(CONFIG));
      }
    } catch (e) {
      console.warn('AdFly analytics failed:', e.message?.substring(0, 60));
    }

    // Save to Redis
    if (redisClient) {
      await redisClient.set('forex:signals', JSON.stringify(signals), { EX: 3600 });
      await redisClient.set('forex:stats', JSON.stringify({ earnings }), { EX: 300 });
    }

    console.log(`📈 Generated ${signals.length} forex signals.`);
    return signals;
  } catch (error) {
    console.error('🚨 forexSignalAgent ERROR:', error.message);
    return [];
  }
};
