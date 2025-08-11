import axios from 'axios';
import tf from '@tensorflow/tfjs-node';
import { payoutAgent } from './payoutAgent.js';

export const forexSignalAgent = async (CONFIG, redis) => {
  try {
    const countries = await axios.get('https://restcountries.com/v3.1/all', { timeout: 10000 });
    const currencyRates = await axios.get('https://api.exchangerate.host/latest?base=USD', { timeout: 10000 });
    const news = await axios.get('https://newsapi.org/v2/top-headlines', {
      headers: { 'x-api-key': CONFIG.NEWS_API_KEY },
      timeout: 10000,
    });

    const model = await tf.loadLayersModel('file://./sentiment-model.json');
    const sentimentScores = news.data.articles.map(article => {
      const input = tf.tensor([article.title.split(' ').length, article.description?.split(' ').length || 0]);
      const prediction = model.predict(input);
      const score = prediction.dataSync()[0];
      input.dispose();
      prediction.dispose();
      return { title: article.title, score };
    });

    const signals = countries.data.map(country => {
      const currency = Object.keys(country.currencies || {})[0];
      if (!currency) return null;
      const rate = currencyRates.data.rates[currency] || 1;
      const countryNews = sentimentScores.filter(s => s.title.toLowerCase().includes(country.name.common.toLowerCase()));
      const sentiment = countryNews.reduce((acc, s) => acc + s.score, 0) / (countryNews.length || 1);
      const signal = sentiment > 0.5 && rate > 1 ? 'Buy' : sentiment < -0.5 ? 'Sell' : 'Hold';
      return { currency, rate, sentiment, signal, country: country.name.common };
    }).filter(s => s !== null);

    // Custom URL shortener with Redis
    const shortenCustomUrl = async (originalUrl) => {
      const shortId = Math.random().toString(36).substring(2, 10);
      const customUrl = `${CONFIG.STORE_URL}/r/${shortId}`;
      await redis.set(`url:${shortId}`, originalUrl, 'EX', 604800);
      return customUrl;
    };

    // Shorten forex signal link with AdFly
    const signalLink = 'https://example.com/forex-signals';
    let shortenedSignalLink = signalLink;
    if (CONFIG.ADFLY_API_KEY) {
      const adFlyResponse = await axios.post(
        'https://api.adf.ly/v1/shorten',
        { url: signalLink, api_key: CONFIG.ADFLY_API_KEY },
        { timeout: 10000 }
      );
      shortenedSignalLink = await shortenCustomUrl(adFlyResponse.data.short_url || signalLink);
    }

    // Post to Reddit
    if (CONFIG.REDDIT_API_KEY) {
      const redditPost = signals.slice(0, 3).map(s => `${s.country}: ${s.signal} ${s.currency} (Rate: ${s.rate.toFixed(4)})`).join('\n');
      await axios.post(
        'https://oauth.reddit.com/api/submit',
        {
          sr: 'forex',
          kind: 'self',
          title: 'Daily Forex Signals',
          text: redditPost + '\n\nCheck signals: ' + shortenedSignalLink,
        },
        { headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` }, timeout: 10000 }
      );
    }

    // Track AdFly clicks and trigger payout
    let adFlyStats = { clicks: 0, earnings: 0 };
    if (CONFIG.ADFLY_API_KEY) {
      const adFlyAnalytics = await axios.get('https://api.adf.ly/v1/stats', {
        headers: { Authorization: `Bearer ${CONFIG.ADFLY_API_KEY}` },
        timeout: 10000,
      });
      adFlyStats = { clicks: adFlyAnalytics.data.clicks || 0, earnings: adFlyAnalytics.data.earnings || 0 };
      if (adFlyStats.earnings > 5) {
        await payoutAgent(CONFIG);
      }
    }

    console.log('Forex signals generated and monetized:', signals.length);
    return signals;
  } catch (error) {
    console.error('forexSignalAgent Error:', error);
    throw new Error('Failed to generate forex signals');
  }
};
