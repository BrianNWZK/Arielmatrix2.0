// backend/agents/forexSignalAgent.js
import axios from 'axios';
import tf from '@tensorflow/tfjs-node';

// === 🌀 Quantum Jitter (Anti-Robot) ===
const quantumDelay = (ms) => new Promise(resolve => {
  const jitter = Math.floor(Math.random() * 5000) + 1000;
  setTimeout(resolve, ms + jitter);
});

// === 📊 Forex Signal Agent (Revenue-Optimized) ===
export const forexSignalAgent = async (CONFIG, redisClient = null) => {
  try {
    console.log('📊 Starting forexSignalAgent...');

    // Validate required keys
    if (!CONFIG.NEWS_API_KEY || !CONFIG.AI_EMAIL || !CONFIG.AI_PASSWORD) {
      console.warn('❌ Missing NEWS_API_KEY or AI credentials. Skipping.');
      return [];
    }

    // Fetch data with clean URLs (no trailing spaces)
    const [countriesRes, ratesRes, newsRes] = await Promise.all([
      axios.get('https://restcountries.com/v3.1/all', { timeout: 10000 }),
      axios.get('https://api.exchangerate.host/latest?base=USD', { timeout: 10000 }),
      axios.get('https://newsapi.org/v2/top-headlines', {
        params: { category: 'business', language: 'en', pageSize: 20 },
        headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
        timeout: 10000
      }).catch(() => ({ data: { articles: [] } }))
    ]);

    // Sentiment analysis
    const sentimentScores = newsRes.data.articles.map(article => {
      const title = (article.title || '').toLowerCase();
      const desc = (article.description || '').toLowerCase();
      const positive = ['rises', 'growth', 'bullish', 'strong', 'increase', 'surge'];
      const negative = ['falls', 'crash', 'bearish', 'decline', 'drop', 'plunge'];
      const pos = positive.filter(w => title.includes(w) || desc.includes(w)).length;
      const neg = negative.filter(w => title.includes(w) || desc.includes(w)).length;
      return { title, score: (pos - neg) / (pos + neg + 1) };
    });

    // Target high-net-worth countries
    const HIGH_VALUE_COUNTRIES = ['MC', 'CH', 'AE', 'SG', 'LU', 'US', 'GB', 'DE'];
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

    // Shorten link using Linkvertise (AdFly is dead)
    const baseSignalLink = `${CONFIG.STORE_URL}/forex`;
    let finalLink = baseSignalLink;

    try {
      // Use the same Linkvertise login logic from socialAgent
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
      });
      const page = await browser.newPage();
      await page.goto('https://linkvertise.com/auth/login', { waitUntil: 'networkidle2' });

      await page.type('input[name="email"]', CONFIG.AI_EMAIL);
      await page.type('input[name="password"]', CONFIG.AI_PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForNavigation({ waitUntil: 'networkidle2' });

      await page.goto('https://linkvertise.com/dashboard/links/create', { waitUntil: 'networkidle2' });
      await page.type('input[name="url"]', baseSignalLink);
      await page.click('button[type="submit"]');
      await page.waitForSelector('input.share-link-input', { timeout: 10000 });

      finalLink = await page.evaluate(() => 
        document.querySelector('input.share-link-input').value
      );

      await browser.close();
    } catch (e) {
      console.warn('⚠️ Linkvertise failed → using long URL');
    }

    // Post to Reddit (if API key exists)
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
        console.warn('⚠️ Reddit post failed:', e.message?.substring(0, 60));
      }
    }

    // Check earnings and trigger payout (simulated)
    const earnings = Math.random() * 10; // Simulate real earnings
    if (earnings > 5) {
      console.log(`🎯 Payout triggered: $${earnings.toFixed(2)}`);
      const payoutAgent = await import('./payoutAgent.js');
      await payoutAgent.payoutAgent({ ...CONFIG, earnings });
    }

    // Save to Redis
    if (redisClient) {
      await redisClient.set('forex:signals', JSON.stringify(signals), { EX: 3600 });
      await redisClient.set('forex:stats', JSON.stringify({ earnings: earnings.toFixed(2) }), { EX: 300 });
    }

    console.log(`📈 Generated ${signals.length} forex signals.`);
    return signals;
  } catch (error) {
    console.error('🚨 forexSignalAgent ERROR:', error.message);
    return [];
  }
};

// === 🧩 Optional: Import Puppeteer only if needed ===
let puppeteer;
try {
  puppeteer = await import('puppeteer');
} catch (e) {
  console.warn('⚠️ Puppeteer not available → Linkvertise fallback disabled');
}
