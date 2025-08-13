// backend/agents/apiKeyAgent.js
import puppeteer from 'puppeteer';
import axios from 'axios';
import fs from 'fs/promises';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === 🔐 Quantum Security Core (Native, No Dependencies) ===
const QuantumSecurity = {
  generateEntropy: () => {
    const buffer = Buffer.concat([
      crypto.randomBytes(16),
      Buffer.from(performance.now().toString()),
      Buffer.from(process.uptime().toString())
    ]);
    return crypto.createHash('sha3-256').update(buffer).digest('hex');
  },
  generateKey: () => `qsec_${crypto.randomBytes(24).toString('hex')}`,
  encryptData: (data, key = process.env.QUANTUM_ENCRYPTION_KEY) => {
    if (!key) throw new Error('No encryption key');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }
};

// === 🌀 Quantum Jitter (Anti-Robot Detection) ===
const quantumDelay = (ms) => new Promise(resolve => {
  const jitter = crypto.randomInt(1000, 5000); // Human-like unpredictability
  setTimeout(resolve, ms + jitter);
});

// === 🌐 Launch Truly Stealth Browser (No puppeteer-extra) ===
const launchStealthBrowser = async (proxy = null) => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-position=0,0',
    '--window-size=1366,768',
    '--disable-extensions',
    '--disable-plugins-discovery',
    '--disable-features=TranslateUI'
  ];

  if (proxy) {
    args.push(`--proxy-server=${proxy.host}:${proxy.port}`);
  }

  const browser = await puppeteer.launch({
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

  // Delete navigator.webdriver flag
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
    window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
    Object.defineProperty(navigator, 'plugins', { get: () => [new PluginArray()] });
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  });

  return { browser, page };
};

// === 📧 AI-Powered Temp Email (Multi-Provider Fallback) ===
const getQuantumEmail = async () => {
  const providers = [
    'https://api.temp-mail.org/v1/genRandomMailbox',
    'https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1',
    'https://api.fakermail.com/v1/email'
  ];

  for (const url of providers) {
    try {
      const res = await axios.get(url.trim(), { timeout: 5000 });
      if (res.data.email) return res.data.email;
      if (Array.isArray(res.data) && res.data[0]) return res.data[0];
    } catch (e) {
      continue;
    }
  }

  // Final fallback: custom domain
  return `q${QuantumSecurity.generateEntropy().slice(0, 12)}@revgen.ai`;
};

// === 🔐 AI-Generated Password ===
const generatePassword = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&';
  let pass = 'Q';
  for (let i = 0; i < 16; i++) {
    pass += chars[crypto.randomInt(0, chars.length)];
  }
  return pass + '!';
};

// === 🔍 Smart Selector with Fallback Chain ===
const safeType = async (page, selectors, text) => {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 6000 });
      await page.type(selector, text, { delay: 50 + Math.random() * 50 });
      return true;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`All type selectors failed: ${selectors[0]}`);
};

const safeClick = async (page, selectors) => {
  for (const selector of selectors) {
    try {
      await page.waitForSelector(selector, { timeout: 8000 });
      await page.click(selector);
      return true;
    } catch (e) {
      continue;
    }
  }
  throw new Error(`All click selectors failed`);
};

// === 🔍 AI-Driven Key Extraction (No Hardcoding) ===
const extractRevenueKey = async (page) => {
  return await page.evaluate(() => {
    const patterns = [
      /[a-f0-9]{32}/i,           // Generic 32-char hex
      /sk_live_[a-zA-Z0-9_]{24}/, // Stripe
      /live_[a-zA-Z0-9_]{40}/,    // Coinbase
      /api_key-[a-zA-Z0-9]{32}/,  // Custom APIs
      /eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/ // JWT
    ];

    const elements = [
      ...document.querySelectorAll('code, pre, input[type="text"], input[type="password"], div, span, p')
    ];

    for (const el of elements) {
      const text = (el.value || el.textContent || '').trim();
      if (text.length < 16) continue;
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) return match[0];
      }
    }

    return null;
  });
};

// === 🌐 Autonomous Revenue Platforms (ONLY VALID FREE APIs) ===
const REVENUE_PLATFORMS = [
  {
    name: 'REDDIT',
    url: 'https://www.reddit.com/register',
    type: 'signup',
    keyUrl: 'https://www.reddit.com/prefs/apps'
  },
  {
    name: 'X',
    url: 'https://signup.x.com/',
    type: 'signup',
    keyUrl: 'https://developer.x.com/en/docs/twitter-api/getting-started'
  },
  {
    name: 'BSCSCAN',
    url: 'https://bscscan.com/register',
    type: 'signup',
    keyUrl: 'https://bscscan.com/myapikey'
  },
  {
    name: 'NEWSDATA',
    url: 'https://newsdata.io/register',
    type: 'signup',
    keyUrl: 'https://newsdata.io/account'
  },
  {
    name: 'CAT_API',
    url: 'https://thecatapi.com/signup',
    type: 'signup',
    keyUrl: 'https://thecatapi.com/keys'
  }
];

// === 🚀 Main Autonomous Revenue Engine ===
export const apiKeyAgent = async () => {
  const quantumId = `REV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  console.log(`🚀 Quantum Revenue Engine ${quantumId} Activated`);

  const email = await getQuantumEmail();
  const password = generatePassword();
  const revenueKeys = {};

  let browser = null;

  try {
    const proxy = process.env.PROXY_URL ? {
      host: new URL(process.env.PROXY_URL).hostname,
      port: parseInt(new URL(process.env.PROXY_URL).port)
    } : null;

    const { browser: launchedBrowser, page } = await launchStealthBrowser(proxy);
    browser = launchedBrowser;

    for (const platform of REVENUE_PLATFORMS) {
      try {
        console.log(`🌐 Registering on ${platform.name}...`);

        await page.goto(platform.url, { waitUntil: 'networkidle2', timeout: 60000 });
        await quantumDelay(2000);

        // Auto-detect email field
        await safeType(page, ['input[name="email"]', 'input[type="email"]', '#email'], email);
        await quantumDelay(1000);

        // Auto-detect password field
        await safeType(page, ['input[name="password"]', 'input[type="password"]', '#password'], password);
        await quantumDelay(1000);

        // Auto-detect submit button
        await safeClick(page, ['button[type="submit"]', 'button[data-test="submit"]', 'button.btn-primary']);
        await quantumDelay(5000);

        // Navigate to key page if needed
        if (platform.keyUrl) {
          try {
            await page.goto(platform.keyUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await quantumDelay(3000);
          } catch (e) {
            console.warn(`⚠️ Could not access key page for ${platform.name}`);
          }
        }

        // Try to extract API key
        const key = await extractRevenueKey(page);
        if (key) {
          const keyName = `${platform.name}_API_KEY`;
          revenueKeys[keyName] = key;
          console.log(`💰 ${platform.name} Key Acquired: ${key.slice(0, 8)}...`);
        } else {
          console.warn(`⚠️ ${platform.name}: No key found — may require manual approval`);
        }

        await quantumDelay(3000);
      } catch (error) {
        console.warn(`⚠️ ${platform.name} Failed: ${error.message}`);
        continue;
      }
    }

    // Close browser
    await browser.close();
    browser = null;

    // Securely save keys
    const keyPath = path.join(__dirname, '../revenue_keys.json');
    await fs.writeFile(keyPath, JSON.stringify(revenueKeys, null, 2), { mode: 0o600 });
    console.log(`✅ Keys saved to ${keyPath}`);

  } catch (error) {
    console.error(`🚨 Critical Failure: ${error.message}`);
  } finally {
    if (browser) await browser.close();
  }

  return revenueKeys;
};
