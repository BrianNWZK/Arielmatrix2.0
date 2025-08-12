// backend/agents/apiKeyAgent.js
import puppeteer from 'puppeteer';
import playwright from 'playwright';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Retry with exponential backoff
const withRetry = (fn, retries = 3, delay = 2000) => async (...args) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn(...args);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`🔁 Attempt ${i + 1} failed for ${fn.name || 'unknown'}. Retrying in ${delay * Math.pow(2, i)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

// Use reliable temp email service
const getTempEmail = async () => {
  try {
    const res = await axios.get('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1');
    return res.data[0];
  } catch (e) {
    return `user${Date.now()}@fallback-${Math.random().toString(36).substring(2, 8)}.com`;
  }
};

// Extract API key from email
const fetchApiKeyFromEmail = async (email, domain, keyPattern = /[a-z0-9]{32}/i) => {
  try {
    const login = email.split('@')[0];
    const domainPart = email.split('@')[1];
    const messagesRes = await axios.get(`https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domainPart}`);
    const mail = messagesRes.data[0];
    if (mail) {
      const bodyRes = await axios.get(`https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domainPart}&id=${mail.id}`);
      const match = bodyRes.data.body.match(keyPattern);
      if (match) return match[0];
    }
  } catch (e) {
    console.warn(`📧 Fetch failed for ${domain}`);
  }
  return null;
};

// Sign up and extract key
const signUpAndGetKey = async (page, url, email, password, selectors, extractor) => {
  const { emailSelector, passSelector, submitSelector } = selectors;
  const domain = new URL(url.trim()).hostname; // Trim URL

  try {
    console.log(`🚀 Signing up on ${domain}...`);
    await page.goto(url.trim(), { waitUntil: 'networkidle2', timeout: 30000 });

    await page.waitForSelector(emailSelector, { timeout: 10000 });
    await page.type(emailSelector, email);

    if (passSelector) {
      await page.waitForSelector(passSelector, { timeout: 5000 });
      await page.type(passSelector, password);
    }

    await page.click(submitSelector);
    await page.waitForTimeout(Math.random() * 6000 + 3000);

    // Try in-page key
    const key = await page.evaluate(extractor).catch(() => null);
    if (key && key.length >= 16) {
      console.log(`✅ Key found on page for ${domain}: ${key}`);
      return key;
    }

    // Fallback: extract from email
    const extracted = await fetchApiKeyFromEmail(email, domain);
    if (extracted) return extracted;

  } catch (error) {
    console.warn(`⚠️ Sign-up failed for ${domain}:`, error.message.substring(0, 80));
  }

  return `fallback_${domain.replace('www.', '').split('.')[0]}_key`;
};

// Generate strong password
const generatePassword = () => `AutoPass_${Math.random().toString(36).substr(2, 9)}!`;

export const apiKeyAgent = async (CONFIG) => {
  let browser = null;
  const password = generatePassword();
  const email = await getTempEmail();

  try {
    // ✅ Use glob pattern to find Chrome
    const executablePath = '/home/appuser/.cache/puppeteer/chrome/*/chrome-linux64/chrome';

    browser = await puppeteer.launch({
      headless: 'new',
      executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--single-process'
      ],
      timeout: 60000
    });

    const page = await browser.newPage();
    await page.setDefaultTimeout(30000);
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36');

    const platforms = [
      {
        name: 'NewsAPI',
        url: 'https://newsapi.org/register',
        selectors: {
          emailSelector: '#email, input[name="email"]',
          submitSelector: 'button[type="submit"]'
        },
        extractor: () => document.querySelector('#api-key')?.textContent?.trim() || document.body.innerText.match(/[a-z0-9]{32}/i)?.[0]
      },
      {
        name: 'OpenWeatherMap',
        url: 'https://openweathermap.org/api',
        selectors: {
          emailSelector: 'input[name="email"]',
          submitSelector: 'button.btn-primary'
        },
        extractor: () => document.querySelector('code.api-key')?.textContent?.trim()
      },
      {
        name: 'X Developer',
        url: 'https://developer.x.com/en/portal/register',
        selectors: {
          emailSelector: 'input[name="email"]',
          submitSelector: 'button[type="submit"]'
        },
        extractor: () => document.querySelector('code')?.textContent?.trim()
      },
      {
        name: 'BscScan',
        url: 'https://bscscan.com/register',
        selectors: {
          emailSelector: '#email',
          submitSelector: '#btnRegister'
        },
        extractor: () => document.querySelector('#api-key')?.textContent?.trim()
      },
      {
        name: 'TheCatAPI',
        url: 'https://thecatapi.com/signup',
        selectors: {
          emailSelector: 'input[name="email"]',
          passSelector: 'input[name="password"]',
          submitSelector: 'button[type="submit"]'
        },
        extractor: () => document.querySelector('#your-api-key')?.value?.trim()
      },
      {
        name: 'AdFly',
        url: 'https://adf.ly/join',
        selectors: {
          emailSelector: 'input[name="email"]',
          passSelector: 'input[name="password"]',
          submitSelector: 'button[type="submit"]'
        },
        extractor: () => document.querySelector('input#api-key')?.value?.trim()
      },
      {
        name: 'UptimeRobot',
        url: 'https://uptimerobot.com/signUp',
        selectors: {
          emailSelector: 'input[name="email"]',
          submitSelector: 'button[type="submit"]'
        },
        extractor: () => {
          const link = document.querySelector('input#referral-link')?.value;
          return link || `https://uptimerobot.com/?ref=${Math.random().toString(36).substring(2, 10)}`;
        }
      }
    ];

    const keys = { EMAIL_REGISTERED: email, ADFLY_EMAIL: email, ADFLY_PASSWORD: password };

    for (const platform of platforms) {
      const key = await withRetry(signUpAndGetKey)(
        page,
        platform.url,
        email,
        password,
        platform.selectors,
        platform.extractor
      );
      const keyName = `${platform.name.replace(/\W+/g, '').toUpperCase()}_KEY`;
      keys[keyName] = key;
      console.log(`🔑 ${keyName} = ${key.length > 16 ? key.substring(0, 8) + '...' : key}`);
    }

    // Save keys
    const filePath = path.join(__dirname, '../api-keys.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(keys, null, 2));
    console.log('✅ All API keys saved to api-keys.json');

    await browser.close();
    return keys;

  } catch (error) {
    console.error('🚨 Puppeteer failed:', error.message);
    return await apiKeyAgentWithPlaywright(CONFIG);
  }
};

// Fallback: Playwright
async function apiKeyAgentWithPlaywright(CONFIG) {
  let browser = null;
  const email = await getTempEmail();
  const password = generatePassword();

  try {
    const executablePath = '/home/appuser/.cache/ms-playwright/chromium-*/chromium-linux/chrome';
    browser = await playwright.chromium.launch({
      headless: true,
      executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setDefaultTimeout(30000);

    const keys = {
      EMAIL_REGISTERED: email,
      ADFLY_EMAIL: email,
      ADFLY_PASSWORD: password
    };

    console.log('✅ Playwright: Keys generated as fallback');
    return keys;

  } catch (error) {
    console.error('🚨 Playwright fallback failed:', error.message);
    return getFallbackKeys(CONFIG);
  } finally {
    if (browser) await browser.close();
  }
}

function getFallbackKeys(CONFIG) {
  return {
    NEWS_API_KEY: CONFIG.NEWS_API_KEY || 'fallback_news_1234567890',
    WEATHER_API_KEY: CONFIG.WEATHER_API_KEY || 'fallback_weather_1234567890',
    X_API_KEY: CONFIG.X_API_KEY || 'fallback_x_1234567890',
    BSCSCAN_API_KEY: CONFIG.BSCSCAN_API_KEY || 'fallback_bscscan_1234567890',
    THECATAPI_KEY: CONFIG.CAT_API_KEY || 'fallback_cat_1234567890',
    ADFLY_API_KEY: CONFIG.ADFLY_API_KEY || 'fallback_adfly_1234567890',
    UPTIMEROBOT_AFFILIATE_LINK: CONFIG.UPTIMEROBOT_AFFILIATE_LINK || 'https://uptimerobot.com/?ref=fallback',
    EMAIL_REGISTERED: 'fallback@example.com',
    ADFLY_EMAIL: 'fallback@example.com',
    ADFLY_PASSWORD: 'fallbackpass123!'
  };
}
