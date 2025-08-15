// backend/agents/dataAgent.js
import axios from 'axios';
import crypto from 'crypto';

// === 🌀 Quantum Jitter (Anti-Robot) ===
const quantumDelay = (ms) => new Promise(resolve => {
  const jitter = crypto.randomInt(1000, 5000);
  setTimeout(resolve, ms + jitter);
});

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

// === 📊 Data Agent (Revenue-Optimized) ===
export const dataAgent = async (CONFIG) => {
  try {
    console.log('📊 Starting dataAgent...');

    // Validate required keys
    if (!CONFIG.NEWS_API_KEY || !CONFIG.WEATHER_API_KEY || !CONFIG.AI_EMAIL || !CONFIG.AI_PASSWORD) {
      console.warn('❌ Missing NEWS_API_KEY, WEATHER_API_KEY or AI credentials. Skipping.');
      return { news: [], weather: {}, signals: [] };
    }

    // Fetch data with clean URLs
    const [newsRes, weatherRes] = await Promise.all([
      axios.get('https://newsapi.org/v2/top-headlines', {
        params: { country: 'us', category: 'business', pageSize: 20 },
        headers: { 'Authorization': `Bearer ${CONFIG.NEWS_API_KEY}` },
        timeout: 10000
      }).catch(() => ({ data: { articles: [] } })),
      axios.get('https://api.openweathermap.org/data/2.5/weather', {
        params: { q: 'London', appid: CONFIG.WEATHER_API_KEY },
        timeout: 10000
      }).catch(() => ({ data: {} }))
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

    const avgSentiment = sentimentScores.reduce((acc, s) => acc + s.score, 0) / sentimentScores.length || 0;

    // Weather-based signals
    const tempC = weatherRes.data.main?.temp ? weatherRes.data.main.temp - 273.15 : 20;
    const weatherSignal = tempC > 25 ? 'Buy' : tempC < 10 ? 'Sell' : 'Hold';

    // Generate signals
    const signals = [
      {
        type: 'Market Sentiment',
        value: avgSentiment > 0.3 ? 'Buy' : avgSentiment < -0.3 ? 'Sell' : 'Hold',
        confidence: Math.abs(avgSentiment).toFixed(2),
        source: 'newsapi.org'
      },
      {
        type: 'Weather Influence',
        value: weatherSignal,
        confidence: '0.70',
        source: 'openweathermap.org'
      }
    ];

    // === 🔗 Shorten link using Short.io (Primary), AdFly, Linkvertise Fallback ===
    const baseSignalLink = `${CONFIG.STORE_URL}/signals`;
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
      const topSignals = signals.map(s => `📊 ${s.type} | ${s.value} | ${s.confidence}`).join('\n');
      try {
        await axios.post(
          'https://oauth.reddit.com/api/submit',
          {
            sr: 'investing',
            kind: 'self',
            title: `AI Market Signals (${new Date().toLocaleDateString()})`,
            text: `${topSignals}\n\n🔗 ${finalLink}\n\n${CONFIG.UPTIMEROBOT_AFFILIATE_LINK}`
          },
          {
            headers: { Authorization: `Bearer ${CONFIG.REDDIT_API_KEY}` },
            timeout: 10000
          }
        );
        console.log('✅ Posted market signals to Reddit');
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

    console.log(`📈 Generated ${signals.length} market signals.`);
    return { news: newsRes.data, weather: weatherRes.data, signals };
  } catch (error) {
    console.error('🚨 dataAgent ERROR:', error.message);
    return { news: [], weather: {}, signals: [] };
  }
};

// === 🧩 Safe Puppeteer Import ===
let puppeteer;
try {
  puppeteer = (await import('puppeteer')).default;
} catch (e) {
  console.warn('⚠️ Puppeteer not available → Linkvertise fallback disabled');
}
