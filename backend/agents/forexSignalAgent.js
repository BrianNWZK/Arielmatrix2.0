import axios from 'axios';
import tf from '@tensorflow/tfjs-node';

export const forexSignalAgent = async (CONFIG) => {
  try {
    // Fetch data from free APIs
    const countries = await axios.get('https://restcountries.com/v3.1/all', { timeout: 10000 });
    const currencyRates = await axios.get('https://api.exchangerate.host/latest?base=USD', { timeout: 10000 });
    const news = await axios.get('https://newsapi.org/v2/top-headlines', {
      headers: { 'x-api-key': CONFIG.NEWS_API_KEY },
      timeout: 10000,
    });

    // Sentiment analysis using TensorFlow.js
    const model = await tf.loadLayersModel('file://./sentiment-model.json');
    const sentimentScores = news.data.articles.map(article => {
      const input = tf.tensor([article.title.split(' ').length, article.description?.split(' ').length || 0]);
      const prediction = model.predict(input);
      const score = prediction.dataSync()[0];
      input.dispose();
      prediction.dispose();
      return { title: article.title, score };
    });

    // Generate forex signals with sentiment
    const signals = countries.data.map(country => {
      const currency = Object.keys(country.currencies || {})[0];
      if (!currency) return null;
      const rate = currencyRates.data.rates[currency] || 1;
      const countryNews = sentimentScores.filter(s => s.title.toLowerCase().includes(country.name.common.toLowerCase()));
      const sentiment = countryNews.reduce((acc, s) => acc + s.score, 0) / (countryNews.length || 1);
      
      // Generate signal based on rate and sentiment
      const signal = sentiment > 0.5 && rate > 1 ? 'Buy' : sentiment < -0.5 ? 'Sell' : 'Hold';
      return {
        currency,
        rate,
        sentiment,
        signal,
        country: country.name.common,
      };
    }).filter(s => s !== null);

    // Post signals to Reddit for visibility
    if (CONFIG.REDDIT_API_KEY) {
      const redditPost = signals.slice(0, 3).map(s => `${s.country}: ${s.signal} ${s.currency} (Rate: ${s.rate.toFixed(4)})`).join('\n');
      await axios.post('https://oauth.reddit.com/api/submit', {
        sr: 'forex',
        kind: 'self',
        title: 'Daily Forex Signals',
        text: redditPost,
      }, {
        headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` },
        timeout: 10000,
      });
    }

    // Create Solana NFT for premium signals (mock implementation)
    if (CONFIG.SOLANA_API_KEY) {
      const premiumSignals = signals.filter(s => Math.abs(s.sentiment) > 0.7); // High-confidence signals
      await axios.post('https://api.solana.com/nft/mint', {
        signals: premiumSignals,
        metadata: { name: 'Premium Forex Signals', description: 'Exclusive trading signals' },
      }, {
        headers: { Authorization: `Bearer ${CONFIG.SOLANA_API_KEY}` },
        timeout: 10000,
      });
    }

    // Monetize: Sell signals via Stripe subscription
    if (CONFIG.STRIPE_API_KEY) {
      await axios.post('https://api.stripe.com/v1/charges', {
        amount: 1000, // $10.00
        currency: 'usd',
        source: 'tok_visa', // Mock card for testing
        description: 'Forex Signals Subscription',
      }, {
        headers: { Authorization: `Bearer ${CONFIG.STRIPE_API_KEY}` },
        timeout: 10000,
      });
    }

    console.log('Forex signals generated and monetized:', signals.length);
    return signals;
  } catch (error) {
    console.error('forexSignalAgent Error:', error);
    return [];
  }
};
