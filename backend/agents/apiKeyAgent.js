// backend/agents/apiKeyAgent.js
import puppeteer from 'puppeteer';
import playwright from 'playwright';
import axios from 'axios';
import fs from 'fs/promises';
import fssync from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/* ----------------------- Utilities ----------------------- */

// Sleep helper
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Retry with exponential backoff
const withRetry = (fn, retries = 3, delay = 2000) => async (...args) => {
  for (let i = 0; i < retries; i++) {
    try { return await fn(...args); }
    catch (error) {
      if (i === retries - 1) throw error;
      const wait = delay * Math.pow(2, i);
      console.warn(`🔁 ${fn.name || 'op'} failed (attempt ${i + 1}/${retries}). Retrying in ${wait}ms...`);
      await sleep(wait);
    }
  }
};

// Deterministic browser cache roots (populated by Dockerfile)
const PUPPETEER_CACHE_DIR = process.env.PUPPETEER_CACHE_DIR || '/home/appuser/.cache/puppeteer';
const PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || '/home/appuser/.cache/ms-playwright';

// Find a file if it exists
const exists = (p) => {
  try { return fssync.existsSync(p); } catch { return false; }
};

// Resolve Chrome executable installed by Puppeteer
const resolvePuppeteerChrome = () => {
  const root = path.join(PUPPETEER_CACHE_DIR, 'chrome');
  if (!exists(root)) return null;
  // puppeteer layout: chrome/<version>/chrome-linux64/chrome
  const versions = fssync.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name);
  for (const v of versions) {
    const candidate = path.join(root, v, 'chrome-linux64', 'chrome');
    if (exists(candidate)) return candidate;
  }
  return null;
};

// Resolve Chromium executable installed by Playwright
const resolvePlaywrightChromium = () => {
  // playwright layout: chromium-*/chromium-linux/chrome
  if (!exists(PLAYWRIGHT_BROWSERS_PATH)) return null;
  const items = fssync.readdirSync(PLAYWRIGHT_BROWSERS_PATH, { withFileTypes: true })
    .filter(d => d.isDirectory() && d.name.startsWith('chromium-'))
    .map(d => d.name);
  for (const name of items) {
    const candidate = path.join(PLAYWRIGHT_BROWSERS_PATH, name, 'chromium-linux', 'chrome');
    if (exists(candidate)) return candidate;
  }
  return null;
};

// Fallback: try Puppeteer's reported default if available
const resolvePuppeteerReported = () => {
  try {
    const ep = puppeteer.executablePath?.();
    return ep && exists(ep) ? ep : null;
  } catch { return null; }
};

// Get a strong password
const generatePassword = () => `AutoPass_${Math.random().toString(36).slice(2, 11)}!`;

// Reliable temp email
const getTempEmail = async () => {
  try {
    const res = await axios.get('https://www.1secmail.com/api/v1/?action=genRandomMailbox&count=1', { timeout: 10000 });
    if (Array.isArray(res.data) && res.data[0]) return res.data[0];
  } catch {}
  return `user${Date.now()}@fallback-${Math.random().toString(36).slice(2, 8)}.com`;
};

// Extract API key from email content (simple 32-char hex pattern by default)
const fetchApiKeyFromEmail = async (email, domain, keyPattern = /[a-z0-9]{32}/i) => {
  try {
    const [login, domainPart] = email.split('@');
    const listUrl = `https://www.1secmail.com/api/v1/?action=getMessages&login=${login}&domain=${domainPart}`;
    const messagesRes = await axios.get(listUrl, { timeout: 10000 });
    const mail = Array.isArray(messagesRes.data) ? messagesRes.data[0] : null;
    if (!mail) return null;
    const bodyUrl = `https://www.1secmail.com/api/v1/?action=readMessage&login=${login}&domain=${domainPart}&id=${mail.id}`;
    const bodyRes = await axios.get(bodyUrl, { timeout: 10000 });
    const text = (bodyRes.data?.body || '') + ' ' + (bodyRes.data?.textBody || '');
    const match = text.match(keyPattern);
    return match ? match[0] : null;
  } catch {
    console.warn(`📧 Email polling failed for ${domain}`);
    return null;
  }
};

// Sign up + try to extract key
const signUpAndGetKey = async (page, url, email, password, selectors, extractor) => {
  const { emailSelector, passSelector, submitSelector } = selectors;
  const domain = new URL(url.trim()).hostname;

  try {
    console.log(`🚀 Visiting ${domain} ...`);
    await page.goto(url.trim(), { waitUntil: 'domcontentloaded', timeout: 45000 });

    await page.waitForSelector(emailSelector, { timeout: 15000 });
    await page.type(emailSelector, email, { delay: 20 });

    if (passSelector) {
      await page.waitForSelector(passSelector, { timeout: 10000 });
      await page.type(passSelector, password, { delay: 20 });
    }

    if (submitSelector) {
      await page.click(submitSelector);
    }
    await page.waitForTimeout(5000 + Math.floor(Math.random() * 4000));

    // Try on-page extraction
    const key = await page.evaluate(extractor).catch(() => null);
    if (key && key.length >= 16) {
      console.log(`✅ In-page key for ${domain}: ${key.slice(0, 8)}...`);
      return key;
    }

    // Fallback to email extraction
    const extracted = await fetchApiKeyFromEmail(email, domain);
    if (extracted) return extracted;

  } catch (error) {
    console.warn(`⚠️ ${domain} signup flow error: ${String(error.message || error).slice(0, 120)}`);
  }
  return null;
};

/* ------------------- Browser Launch Strategy ------------------- */

const resolveExecutables = () => {
  // Priority: Puppeteer cache -> Puppeteer reported -> Playwright cache
  const pupe = resolvePuppeteerChrome() || resolvePuppeteerReported();
  const play = resolvePlaywrightChromium();
  return { puppeteerExec: pupe, playwrightExec: play };
};

const launchPuppeteer = async () => {
  const { puppeteerExec } = resolveExecutables();
  if (!puppeteerExec) throw new Error('Puppeteer Chrome not found');
  return puppeteer.launch({
    headless: 'new',
    executablePath: puppeteerExec,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process'
    ],
    timeout: 60000,
  });
};

const launchPlaywright = async () => {
  const { playwrightExec } = resolveExecutables();
  if (!playwrightExec) throw new Error('Playwright Chromium not found');
  return playwright.chromium.launch({
    headless: true,
    executablePath: playwrightExec,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
    timeout: 60000,
  });
};

/* --------------------------- Main Agent --------------------------- */

export const apiKeyAgent = async (CONFIG = {}) => {
  const email = await getTempEmail();
  const password = generatePassword();

  // Single browser context reused across sites for speed
  const tryPuppeteer = async () => {
    const browser = await launchPuppeteer();
    try {
      const page = await browser.newPage();
      await page.setDefaultTimeout(30000);
      await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome Safari');

      const platforms = [
        {
          name: 'NewsAPI',
          url: 'https://newsapi.org/register',
          selectors: { emailSelector: '#email, input[name="email"]', submitSelector: 'button[type="submit"]' },
          extractor: () => document.querySelector('#api-key')?.textContent?.trim()
            || (document.body.innerText.match(/[a-z0-9]{32}/i) || [null])[0]
        },
        {
          name: 'OpenWeatherMap',
          url: 'https://openweathermap.org/api',
          selectors: { emailSelector: 'input[name="email"]', submitSelector: 'button.btn-primary' },
          extractor: () => document.querySelector('code.api-key')?.textContent?.trim()
        },
        {
          name: 'X Developer',
          url: 'https://developer.x.com/en/portal/register',
          selectors: { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' },
          extractor: () => document.querySelector('code')?.textContent?.trim()
        },
        {
          name: 'BscScan',
          url: 'https://bscscan.com/register',
          selectors: { emailSelector: '#email', submitSelector: '#btnRegister' },
          extractor: () => document.querySelector('#api-key')?.textContent?.trim()
        },
        {
          name: 'TheCatAPI',
          url: 'https://thecatapi.com/signup',
          selectors: { emailSelector: 'input[name="email"]', passSelector: 'input[name="password"]', submitSelector: 'button[type="submit"]' },
          extractor: () => document.querySelector('#your-api-key')?.value?.trim()
        },
        {
          name: 'AdFly',
          url: 'https://adf.ly/join',
          selectors: { emailSelector: 'input[name="email"]', passSelector: 'input[name="password"]', submitSelector: 'button[type="submit"]' },
          extractor: () => document.querySelector('input#api-key')?.value?.trim()
        },
        {
          name: 'UptimeRobot',
          url: 'https://uptimerobot.com/signUp',
          selectors: { emailSelector: 'input[name="email"]', submitSelector: 'button[type="submit"]' },
          extractor: () => {
            const link = document.querySelector('input#referral-link')?.value;
            return link || '';
          }
        }
      ];

      const keys = { EMAIL_REGISTERED: email, ADFLY_EMAIL: email, ADFLY_PASSWORD: password };

      for (const p of platforms) {
        const key = await withRetry(signUpAndGetKey)(page, p.url, email, password, p.selectors, p.extractor);
        const keyName = `${p.name.replace(/\W+/g, '').toUpperCase()}_KEY`;
        if (key) {
          keys[keyName] = key;
          console.log(`🔑 ${keyName} = ${key.length > 12 ? key.slice(0, 8) + '...' : key}`);
        }
        // polite pause to avoid anti-bot triggers
        await sleep(1000 + Math.floor(Math.random() * 1000));
      }

      // Persist keys
      const filePath = path.join(__dirname, '../api-keys.json');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(keys, null, 2));
      console.log('✅ API keys saved to backend/api-keys.json');

      await browser.close();
      return keys;
    } catch (e) {
      await browser.close();
      throw e;
    }
  };

  const tryPlaywright = async () => {
    const browser = await launchPlaywright();
    try {
      const page = await browser.newPage();
      await page.setDefaultTimeout(30000);
      // For brevity: you can repeat the same platform loop here if desired,
      // or keep playwright as a minimal fallback that returns the base identifiers.
      const keys = {
        EMAIL_REGISTERED: email,
        ADFLY_EMAIL: email,
        ADFLY_PASSWORD: password
      };
      await browser.close();
      console.log('✅ Playwright fallback executed');
      return keys;
    } catch (e) {
      await browser.close();
      throw e;
    }
  };

  try {
    return await tryPuppeteer();
  } catch (err) {
    console.error('🚨 Puppeteer failed:', err?.message || String(err));
    try {
      return await tryPlaywright();
    } catch (err2) {
      console.error('🚨 Playwright fallback failed:', err2?.message || String(err2));
      // Absolute minimal fallback (still real values if provided in CONFIG)
      return {
        NEWS_API_KEY: CONFIG.NEWS_API_KEY || '',
        WEATHER_API_KEY: CONFIG.WEATHER_API_KEY || '',
        X_API_KEY: CONFIG.X_API_KEY || '',
        BSCSCAN_API_KEY: CONFIG.BSCSCAN_API_KEY || '',
        THECATAPI_KEY: CONFIG.CAT_API_KEY || '',
        ADFLY_API_KEY: CONFIG.ADFLY_API_KEY || '',
        UPTIMEROBOT_AFFILIATE_LINK: CONFIG.UPTIMEROBOT_AFFILIATE_LINK || '',
        EMAIL_REGISTERED: email,
        ADFLY_EMAIL: email,
        ADFLY_PASSWORD: password,
      };
    }
  }
};
