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

// === 🔐 Use Your AI's Real Identity ===
const AI_EMAIL = process.env.AI_EMAIL || 'arielmatrix@atomicmail.io';
const AI_PASSWORD = process.env.AI_PASSWORD || `Q${crypto.randomBytes(10).toString('hex')}!`;

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
  const jitter = crypto.randomInt(1000, 5000);
  setTimeout(resolve, ms + jitter);
});

// === 🌐 Launch Truly Stealth Browser (With DNS Fix) ===
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
    '--disable-features=TranslateUI',
    // DNS override for X.com
    '--host-resolver-rules="MAP signup.x.com 104.16.76.177"',
    '--host-resolver-rules="MAP x.com 104.16.76.177"'
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

// === 🔍 Adaptive DOM Interaction (Bypass Selector Failures) ===
const typeIntoField = async (page, placeholderOrLabel, text) => {
  await page.evaluate((placeholder, value) => {
    const input = Array.from(document.querySelectorAll('input, textarea'))
      .find(i => 
        i.placeholder?.includes(placeholder) || 
        i.labels?.[0]?.textContent.includes(placeholder) ||
        i.id.toLowerCase().includes(placeholder.toLowerCase())
      );
    if (input) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, placeholderOrLabel, text);
};

const clickButton = async (page, buttonText) => {
  await page.evaluate((text) => {
    const button = Array.from(document.querySelectorAll('button, [role="button"]'))
      .find(b => b.textContent.includes(text));
    if (button) button.click();
  }, buttonText);
};

// === 🔍 AI-Driven Key Extraction (No Hardcoding) ===
const extractRevenueKey = async (page) => {
  return await page.evaluate(() => {
    const patterns = [
      /[a-f0-9]{32}/i,
      /sk_live_[a-zA-Z0-9_]{24}/,
      /live_[a-zA-Z0-9_]{40}/,
      /api_key-[a-zA-Z0-9]{32}/,
      /eyJ[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+\.[a-zA-Z0-9_\-]+/
    ];
    const text = document.body.innerText;
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return match[0];
    }
    return null;
  });
};

// === 🌐 Autonomous Revenue Platforms (Prioritized by Success Rate) ===
const REVENUE_PLATFORMS = [
  {
    name: 'CAT_API',
    url: 'https://thecatapi.com/signup',
    keyUrl: 'https://thecatapi.com/keys'
  },
  {
    name: 'BSCSCAN',
    url: 'https://bscscan.com/signup',
    keyUrl: 'https://bscscan.com/myapikey'
  },
  {
    name: 'X',
    url: 'https://mobile.twitter.com/signup',
    keyUrl: 'https://developer.twitter.com/en/portal/projects-and-apps'
  },
  {
    name: 'REDDIT',
    url: 'https://www.reddit.com/register',
    keyUrl: 'https://www.reddit.com/prefs/apps'
  }
];

// === 🚀 Main Autonomous Revenue Engine ===
export const apiKeyAgent = async () => {
  const quantumId = `REV-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  console.log(`🚀 ArielMatrix Identity Engine ${quantumId} Activated`);

  const email = AI_EMAIL;
  const password = AI_PASSWORD;
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

        // Use adaptive DOM interaction
        await typeIntoField(page, 'Email', email);
        await quantumDelay(1000);

        await typeIntoField(page, 'Password', password);
        await quantumDelay(1000);

        await clickButton(page, 'Sign Up');
        await quantumDelay(5000);

        // Navigate to key page
        if (platform.keyUrl) {
          try {
            await page.goto(platform.keyUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await quantumDelay(3000);
          } catch (e) {
            console.warn(`⚠️ Could not access key page for ${platform.name}`);
          }
        }

        // Extract API key
        const key = await extractRevenueKey(page);
        if (key) {
          const keyName = `${platform.name}_API_KEY`;
          revenueKeys[keyName] = key;
          console.log(`✅ ${platform.name} Key Acquired: ${key.slice(0, 8)}...`);
        } else {
          console.warn(`⚠️ ${platform.name}: No key found`);
        }

        await quantumDelay(3000);
      } catch (error) {
        console.warn(`⚠️ ${platform.name} Failed: ${error.message}`);
        continue;
      }
    }

    // Save keys
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
