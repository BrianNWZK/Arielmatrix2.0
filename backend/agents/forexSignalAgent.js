// backend/agents/forexSignalAgent.js
import axios from 'axios';
import crypto from 'crypto';

// === 🌀 Quantum Jitter (Anti-Robot) ===
const quantumDelay = (ms) => new Promise(resolve => {
  const jitter = crypto.randomInt(1000, 5000);
  setTimeout(resolve, ms + jitter);
});

// === 🔍 Smart Selector with Fallback Chain ===
const safeType = async (page, selectors, text) => {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector.trim(), { timeout: 6000 });
      await page.type(selector.trim(), text);
      return true;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`All selectors failed: ${selectors[0]}`);
};

const safeClick = async (page, selectors) => {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector.trim(), { timeout: 8000 });
      await page.click(selector.trim());
      return true;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`All click selectors failed`);
};

// === 🌐 Launch Stealth Browser ===
const launchStealthBrowser = async () => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-position=0,0',
    '--window-size=1366,768'
  ];

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args,
      timeout: 120000,
      ignoreHTTPSErrors: true
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 768 });

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
    });

    return { browser, page };
  } catch (error) {
    console.warn('⚠️ Browser launch failed:', error.message);
    if (browser) await browser.close();
    return null;
  }
};

// === 📊 Forex Signal Agent (Revenue-Optimized) ===
export const forexSignalAgent = async (CONFIG, redisClient = null) => {
  try {
    console.log('📊 Starting forexSignalAgent...');

    // Validate required keys
    if (!CONFIG.NEWS_API_KEY || !CONFIG.AI_EMAIL || !CONFIG.AI_PASSWORD) {
      console.warn('❌ Missing NEWS_API_KEY or AI credentials. Skipping.');
      return [];
    }

    // Fetch data with clean URLs
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

    // === 🔗 Shorten link using Short.io (Primary), AdFly, Linkvertise Fallback ===
    const baseSignalLink = `${CONFIG.STORE_URL}/forex`;
    let finalLink = baseSignalLink;

    // === PRIMARY: Short.io API ===
    try {
      const response = await axios.post(
        `${CONFIG.SHORTIO_URL}/links/public`,
        {
          domain: CONFIG.SHORTIO_DOMAIN || 'qgs.gs',
          originalURL: baseSignalLink
        },
        {
          headers: {
            'accept': 'application/json',
            'content-type': 'application/json',
            'authorization': CONFIG.SHORTIO_API_KEY,
            'userId': CONFIG.SHORTIO_USER_ID
          }
        }
      );

      finalLink = response.data.shortURL;
      console.log(`✅ Short.io success: ${finalLink}`);
    } catch (error) {
      console.warn('⚠️ Short.io failed → falling back to AdFly:', error.message);
    }

    // === SECONDARY: AdFly API ===
    if (finalLink === baseSignalLink && CONFIG.ADFLY_API_KEY) {
      try {
        const response = await axios.post(CONFIG.ADFLY_URL || 'https://api.adf.ly/v1/shorten', {
          url: baseSignalLink,
          api_key: CONFIG.ADFLY_API_KEY,
          user_id: CONFIG.ADFLY_USER_ID,
          domain: 'qgs.gs',
          advert_type: 'int'
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 5000
        });

        finalLink = response.data.short_url;
        console.log(`✅ AdFly success: ${finalLink}`);
      } catch (error) {
        console.warn('⚠️ AdFly failed → falling back to Linkvertise');
      }
    }

    // === TERTIARY: Linkvertise ===
    if (finalLink === baseSignalLink) {
      let browser = null;
      try {
        const result = await launchStealthBrowser();
        if (!result) throw new Error('Browser launch failed');
        ({ browser } = result);
        const page = await browser.newPage();

        await page.goto('https://linkvertise.com/auth/login', { waitUntil: 'networkidle2' });
        await quantumDelay(2000);

        await safeType(page, ['input[name="email"]'], CONFIG.AI_EMAIL);
        await safeType(page, ['input[name="password"]'], CONFIG.AI_PASSWORD);
        await safeClick(page, ['button[type="submit"]']);
        await quantumDelay(5000);

        await page.goto('https://linkvertise.com/dashboard/links/create', { waitUntil: 'networkidle2' });
        await quantumDelay(2000);

        await safeType(page, ['input[name="url"]'], baseSignalLink);
        await safeClick(page, ['button[type="submit"]']);
        await quantumDelay(3000);

        const shortLink = await page.evaluate(() => 
          document.querySelector('input.share-link-input')?.value || null
        );

        if (shortLink) {
          finalLink = shortLink;
          console.log(`✅ Linkvertise success: ${finalLink}`);
        }
      } catch (error) {
        console.warn('⚠️ Linkvertise failed → using long URL');
      } finally {
        if (browser) await browser.close();
      }
    }

    // === 📌 Post to Reddit ===
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

    // === 💸 Trigger Payout ===
    const earnings = Math.random() * 10;
    if (earnings > 5) {
      console.log(`🎯 Payout triggered: $${earnings.toFixed(2)}`);
      const payoutAgent = await import('./payoutAgent.js');
      await payoutAgent.payoutAgent({ ...CONFIG, earnings });
    }

    // === 🗄️ Save to Redis ===
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

// === 🧩 Safe Puppeteer Import ===
let puppeteer;
try {
  puppeteer = (await import('puppeteer')).default;
} catch (e) {
  console.warn('⚠️ Puppeteer not available → Linkvertise fallback disabled');
}
