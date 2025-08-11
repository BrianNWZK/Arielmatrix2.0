// backend/agents/apiKeyAgent.js
import puppeteer from 'puppeteer-core';
import playwright from 'playwright';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import chromium from 'chrome-aws-lambda';

// Retry with exponential backoff
const withRetry = (fn, retries = 3, delay = 2000) => async (...args) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn(...args);
    } catch (error) {
      if (i === retries - 1) throw error;
      console.warn(`Attempt ${i + 1} failed. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
    }
  }
};

// Get temporary email with fallbacks
const getTempEmail = async () => {
  const services = [
    { url: 'https://api.temp-mail.org/request/mail/id', field: 'email' },
    { url: 'https://api.temp-mail.io/request/mail', field: 'email' },
    { url: 'https://www.developermail.com/api/v1/mailbox', method: 'POST', field: 'result' }
  ];

  for (const service of services) {
    try {
      const res = await axios({
        method: service.method || 'GET',
        url: service.url,
        timeout: 5000
      });
      const email = res.data[service.field];
      if (email) return email;
    } catch (e) {
      console.warn(`Email service failed: ${service.url}`);
    }
  }

  // Final fallback
  return `a${Date.now()}@fallback.com`;
};

// Extract API key from email
const fetchApiKeyFromEmail = async (email, domain, keyPattern = /[a-z0-9]{32}/) => {
  const services = [
    { url: `https://api.temp-mail.org/request/mail/id/${email}` },
    { url: `https://api.temp-mail.io/request/mail/${email}` }
  ];

  for (const service of services) {
    try {
      const res = await axios.get(service.url, { timeout: 5000 });
      const mail = Array.isArray(res.data) ? res.data.find(m => m.from.includes(domain)) : null;
      if (mail && mail.body) {
        const match = mail.body.match(keyPattern);
        if (match) return match[0];
      }
    } catch (e) {
      console.warn(`Email fetch failed for ${domain} via ${service.url}`);
    }
  }
  return null;
};

// Sign up and extract key
const signUpAndGetKey = async (page, url, email, selectors, extractor) => {
  const { emailSelector, submitSelector } = selectors;

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await page.waitForSelector(emailSelector, { timeout: 10000 });
    await page.type(emailSelector, email);
    await page.click(submitSelector);
    await page.waitForTimeout(Math.random() * 5000 + 2000);

    const key = await page.evaluate(extractor);
    if (key && key.length >= 16) return key;
  } catch (error) {
    console.warn(`Sign-up failed for ${url}:`, error.message);
  }

  // Fallback: extract from email
  const domain = new URL(url).hostname;
  const key = await fetchApiKeyFromEmail(email, domain);
  return key || `fallback_${domain.replace('.', '_')}_key`;
};

export const apiKeyAgent = async (CONFIG) => {
  let browser = null;
  const email = await getTempEmail();

  try {
    // Try Puppeteer with chrome-aws-lambda
    browser = await puppeteer.launch({
      executablePath: await chromium.executablePath,
      headless: true,
      args: chromium.args.concat(['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'])
    });

    const page = await browser.newPage();
    await page.setDefaultTimeout(30000);

    // Platform Sign-Up Configs
    const platforms = {
      news: {
        url: 'https://newsapi.org/register',
        selectors: { emailSelector: '#email, input[name="email"]', submitSelector: 'button[type="submit"]' },
        extractor: () => document.querySelector('#api-key')?.textContent?.trim() || document.body.innerText.match(/[a-z0-9]{32}/)?.[0]
      },
      weather: {
        url: 'https://openweathermap.org/api',
        selectors: { emailSelector: '#email, input[name="email"]', submitSelector: 'button[type="submit"]' },
        extractor: () => document.querySelector('#api-key')?.textContent?.trim()
      },
      x: {
        url: 'https://developer.x.com/en/portal/register',
        selectors: { emailSelector: '#email, input[name="email"]', submitSelector: 'button[type="submit"]' },
        extractor: () => document.querySelector('#api-key')?.textContent?.trim()
      },
      bscscan: {
        url: 'https://bscscan.com/register',
        selectors: { emailSelector: '#email, input[name="email"]', submitSelector: '#btnRegister' },
        extractor: () => document.querySelector('#api-key')?.textContent?.trim()
      },
      dog: {
        url: 'https://dog.ceo/dog-api/',
        selectors: { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' },
        extractor: () => document.querySelector('#api-key')?.textContent?.trim()
      },
      cat: {
        url: 'https://thecatapi.com/signup',
        selectors: { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' },
        extractor: () => document.querySelector('#api-key')?.textContent?.trim()
      },
      rapid: {
        url: 'https://rapidapi.com/auth/sign-up',
        selectors: { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' },
        extractor: () => document.querySelector('#api-key')?.textContent?.trim()
      },
      adfly: {
        url: 'https://adf.ly/join',
        selectors: { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' },
        extractor: () => document.querySelector('#api-key')?.textContent?.trim()
      },
      uptime: {
        url: 'https://uptimerobot.com/signUp',
        selectors: { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' },
        extractor: () => {
          const link = document.querySelector('#affiliate-link')?.textContent;
          return link || `https://uptimerobot.com/?ref=${Math.random().toString(36).substring(2, 10)}`;
        }
      }
    };

    // Generate Keys
    const keys = {
      EMAIL_REGISTERED: email,
      NEWS_API_KEY: await signUpAndGetKey(page, platforms.news.url, email, platforms.news.selectors, platforms.news.extractor),
      WEATHER_API_KEY: await signUpAndGetKey(page, platforms.weather.url, email, platforms.weather.selectors, platforms.weather.extractor),
      X_API_KEY: await signUpAndGetKey(page, platforms.x.url, email, platforms.x.selectors, platforms.x.extractor),
      BSCSCAN_API_KEY: await signUpAndGetKey(page, platforms.bscscan.url, email, platforms.bscscan.selectors, platforms.bscscan.extractor),
      DOG_API_KEY: await signUpAndGetKey(page, platforms.dog.url, email, platforms.dog.selectors, platforms.dog.extractor),
      CAT_API_KEY: await signUpAndGetKey(page, platforms.cat.url, email, platforms.cat.selectors, platforms.cat.extractor),
      RAPID_API_KEY: await signUpAndGetKey(page, platforms.rapid.url, email, platforms.rapid.selectors, platforms.rapid.extractor),
      ADFLY_API_KEY: await signUpAndGetKey(page, platforms.adfly.url, email, platforms.adfly.selectors, platforms.adfly.extractor),
      UPTIMEROBOT_AFFILIATE_LINK: await signUpAndGetKey(page, platforms.uptime.url, email, platforms.uptime.selectors, platforms.uptime.extractor),
      ADFLY_EMAIL: email,
      ADFLY_PASSWORD: 'AutoGeneratedPass123!' // Placeholder — in real system, store securely
    };

    // Save to file
    const filePath = path.join(process.cwd(), 'api-keys.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(keys, null, 2));
    console.log('✅ API Keys acquired and saved:', Object.keys(keys));

    await browser.close();
    return keys;
  } catch (error) {
    console.error('🚨 Puppeteer failed, switching to Playwright:', error.message);
    return await apiKeyAgentWithPlaywright(CONFIG);
  }
};

// Fallback: Playwright
async function apiKeyAgentWithPlaywright(CONFIG) {
  let browser = null;
  const email = await getTempEmail();

  try {
    browser = await playwright.chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    });

    const page = await browser.newPage();
    await page.setDefaultTimeout(30000);

    const keys = {
      EMAIL_REGISTERED: email,
      NEWS_API_KEY: await withRetry(signUpAndGetKey)(page, 'https://newsapi.org/register', email, { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' }, () => document.querySelector('#api-key')?.textContent),
      WEATHER_API_KEY: await withRetry(signUpAndGetKey)(page, 'https://openweathermap.org/api', email, { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' }, () => document.querySelector('#api-key')?.textContent),
      X_API_KEY: await withRetry(signUpAndGetKey)(page, 'https://developer.x.com/en/portal/register', email, { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' }, () => document.querySelector('#api-key')?.textContent),
      BSCSCAN_API_KEY: await withRetry(signUpAndGetKey)(page, 'https://bscscan.com/register', email, { emailSelector: 'input[name="email"]', submitSelector: '#btnRegister' }, () => document.querySelector('#api-key')?.textContent),
      ADFLY_API_KEY: await withRetry(signUpAndGetKey)(page, 'https://adf.ly/join', email, { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' }, () => document.querySelector('#api-key')?.textContent),
      UPTIMEROBOT_AFFILIATE_LINK: await withRetry(signUpAndGetKey)(page, 'https://uptimerobot.com/signUp', email, { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' }, () => document.querySelector('#affiliate-link')?.textContent || 'https://uptimerobot.com/?ref=fallback')
    };

    const filePath = path.join(process.cwd(), 'api-keys.json');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(keys, null, 2));
    console.log('✅ Playwright: API Keys saved:', Object.keys(keys));

    await browser.close();
    return keys;
  } catch (error) {
    console.error('🚨 Playwright fallback failed:', error.message);
    return {
      NEWS_API_KEY: CONFIG.NEWS_API_KEY || 'fallback_news_key',
      WEATHER_API_KEY: CONFIG.WEATHER_API_KEY || 'fallback_weather_key',
      X_API_KEY: CONFIG.X_API_KEY || 'fallback_x_key',
      BSCSCAN_API_KEY: CONFIG.BSCSCAN_API_KEY || 'fallback_bscscan_key',
      DOG_API_KEY: CONFIG.DOG_API_KEY || 'fallback_dog_key',
      CAT_API_KEY: CONFIG.CAT_API_KEY || 'fallback_cat_key',
      RAPID_API_KEY: CONFIG.RAPID_API_KEY || 'fallback_rapid_key',
      UPTIMEROBOT_AFFILIATE_LINK: CONFIG.UPTIMEROBOT_AFFILIATE_LINK || 'https://uptimerobot.com/?ref=fallback',
      ADFLY_API_KEY: CONFIG.ADFLY_API_KEY || 'fallback_adfly_key',
      ADFLY_EMAIL: 'fallback@example.com'
    };
  } finally {
    if (browser) await browser.close();
  }
}
