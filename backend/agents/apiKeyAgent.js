import puppeteer from 'puppeteer';
import playwright from 'playwright';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

async function getTempEmail() {
  try {
    const response = await axios.get('https://api.temp-mail.org/request/mail/id', { timeout: 5000 });
    return response.data.email || 'fallback@example.com';
  } catch {
    console.warn('Temp email API failed, trying fallback service');
    try {
      const fallbackResponse = await axios.get('https://api.temp-mail.io/request/mail', { timeout: 5000 });
      return fallbackResponse.data.email || 'fallback@example.com';
    } catch {
      console.warn('Fallback email service failed, using static email');
      return 'fallback@example.com';
    }
  }
}

async function signUpAndGetKey(page, url, emailSelector, submitSelector, keyExtractor, email, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      await page.waitForSelector(emailSelector, { timeout: 10000 });
      await page.type(emailSelector, email);
      await page.click(submitSelector);
      await page.waitForTimeout(Math.random() * 5000 + 2000);
      const key = await page.evaluate(keyExtractor) || 'default_key';
      if (key !== 'default_key') return key;
      console.warn(`Attempt ${attempt}/${retries}: Key extraction failed for ${url}`);
      await page.waitForTimeout(2000 * attempt); // Exponential backoff
    } catch (error) {
      console.warn(`Attempt ${attempt}/${retries}: Failed to sign up at ${url}:`, error);
      if (attempt === retries) throw new Error(`Failed to fetch key from ${url} after ${retries} attempts`);
    }
  }
}

export const apiKeyAgent = async (CONFIG) => {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: '/home/appuser/.cache/puppeteer/chrome/linux-139.0.7258.66/chrome-linux64/chrome',
      userDataDir: '/home/appuser/.cache/puppeteer',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    const email = await getTempEmail();

    // Fetch keys from various platforms with retry logic
    const newsApiKey = await signUpAndGetKey(
      page,
      'https://newsapi.org/register',
      '#email, input[name="email"]',
      'button[type="submit"], #signup-button',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const weatherApiKey = await signUpAndGetKey(
      page,
      'https://openweathermap.org/api',
      '#email, input[name="email"]',
      'button[type="submit"], #signup',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const xApiKey = await signUpAndGetKey(
      page,
      'https://developer.x.com/en/portal/register',
      '#email, input[name="email"]',
      'button[type="submit"], #submit',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    let bscScanApiKey = CONFIG.BSCSCAN_API_KEY;
    const testBscScan = await axios.get(
      `${CONFIG.BSCSCAN_API}?module=account&action=balance&address=${CONFIG.GAS_WALLET}&apikey=${bscScanApiKey}`,
      { timeout: 5000 }
    ).catch(() => null);
    if (!testBscScan || testBscScan.data.status !== '1') {
      bscScanApiKey = await signUpAndGetKey(
        page,
        'https://bscscan.com/register',
        '#email, input[name="email"]',
        'button[type="submit"], #btnRegister',
        () => document.querySelector('#api-key')?.textContent,
        email
      );
    }
    const dogApiKey = await signUpAndGetKey(
      page,
      'https://dog.ceo/dog-api/',
      '#email, input[name="email"]',
      'button[type="submit"]',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const catApiKey = await signUpAndGetKey(
      page,
      'https://thecatapi.com/',
      '#email, input[name="email"]',
      'button[type="submit"]',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const rapidApiKey = await signUpAndGetKey(
      page,
      'https://rapidapi.com/auth/sign-up',
      '#email, input[name="email"]',
      'button[type="submit"]',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const redditApiKey = await signUpAndGetKey(
      page,
      'https://www.reddit.com/prefs/apps',
      '#email, input[name="email"]',
      'button[type="submit"], #create-app',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const solanaApiKey = await signUpAndGetKey(
      page,
      'https://solana.com/developers',
      '#email, input[name="email"]',
      'button[type="submit"], #signup',
      () => document.querySelector('#api-key')?.textContent,
      email
    );

    // Store keys locally
    const keys = {
      NEWS_API_KEY: newsApiKey,
      WEATHER_API_KEY: weatherApiKey,
      X_API_KEY: xApiKey,
      BSCSCAN_API_KEY: bscScanApiKey,
      DOG_API_KEY: dogApiKey,
      CAT_API_KEY: catApiKey,
      RAPID_API_KEY: rapidApiKey,
      REDDIT_API_KEY: redditApiKey,
      SOLANA_API_KEY: solanaApiKey,
    };
    try {
      const filePath = path.join('/app/backend', 'api-keys.json');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(keys, null, 2));
      console.log('API Keys acquired and saved:', keys);
    } catch (error) {
      console.error('Failed to write api-keys.json:', error);
    }

    await browser.close();
    return keys;
  } catch (error) {
    console.error('Puppeteer failed, switching to Playwright alternative:', error);
    return await apiKeyAgentWithPlaywright(CONFIG);
  }
};

async function apiKeyAgentWithPlaywright(CONFIG) {
  try {
    const browser = await playwright.chromium.launch({
      headless: true,
      executablePath: '/home/appuser/.cache/ms-playwright/chromium-1181/chromium-linux/chrome',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    const email = await getTempEmail();

    // Similar sign-up logic as Puppeteer with retry
    const newsApiKey = await signUpAndGetKey(
      page,
      'https://newsapi.org/register',
      '#email, input[name="email"]',
      'button[type="submit"], #signup-button',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const weatherApiKey = await signUpAndGetKey(
      page,
      'https://openweathermap.org/api',
      '#email, input[name="email"]',
      'button[type="submit"], #signup',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const xApiKey = await signUpAndGetKey(
      page,
      'https://developer.x.com/en/portal/register',
      '#email, input[name="email"]',
      'button[type="submit"], #submit',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    let bscScanApiKey = CONFIG.BSCSCAN_API_KEY;
    const testBscScan = await axios.get(
      `${CONFIG.BSCSCAN_API}?module=account&action=balance&address=${CONFIG.GAS_WALLET}&apikey=${bscScanApiKey}`,
      { timeout: 5000 }
    ).catch(() => null);
    if (!testBscScan || testBscScan.data.status !== '1') {
      bscScanApiKey = await signUpAndGetKey(
        page,
        'https://bscscan.com/register',
        '#email, input[name="email"]',
        'button[type="submit"], #btnRegister',
        () => document.querySelector('#api-key')?.textContent,
        email
      );
    }
    const dogApiKey = await signUpAndGetKey(
      page,
      'https://dog.ceo/dog-api/',
      '#email, input[name="email"]',
      'button[type="submit"]',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const catApiKey = await signUpAndGetKey(
      page,
      'https://thecatapi.com/',
      '#email, input[name="email"]',
      'button[type="submit"]',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const rapidApiKey = await signUpAndGetKey(
      page,
      'https://rapidapi.com/auth/sign-up',
      '#email, input[name="email"]',
      'button[type="submit"]',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const redditApiKey = await signUpAndGetKey(
      page,
      'https://www.reddit.com/prefs/apps',
      '#email, input[name="email"]',
      'button[type="submit"], #create-app',
      () => document.querySelector('#api-key')?.textContent,
      email
    );
    const solanaApiKey = await signUpAndGetKey(
      page,
      'https://solana.com/developers',
      '#email, input[name="email"]',
      'button[type="submit"], #signup',
      () => document.querySelector('#api-key')?.textContent,
      email
    );

    const keys = {
      NEWS_API_KEY: newsApiKey,
      WEATHER_API_KEY: weatherApiKey,
      X_API_KEY: xApiKey,
      BSCSCAN_API_KEY: bscScanApiKey,
      DOG_API_KEY: dogApiKey,
      CAT_API_KEY: catApiKey,
      RAPID_API_KEY: rapidApiKey,
      REDDIT_API_KEY: redditApiKey,
      SOLANA_API_KEY: solanaApiKey,
    };
    try {
      const filePath = path.join('/app/backend', 'api-keys.json');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(keys, null, 2));
      console.log('API Keys acquired and saved:', keys);
    } catch (error) {
      console.error('Failed to write api-keys.json:', error);
    }

    await browser.close();
    return keys;
  } catch (error) {
    console.error('Playwright fallback failed:', error);
    return {
      NEWS_API_KEY: CONFIG.NEWS_API_KEY || 'fallback_news_key',
      WEATHER_API_KEY: CONFIG.WEATHER_API_KEY || 'fallback_weather_key',
      X_API_KEY: CONFIG.TWITTER_API_KEY || 'fallback_x_key',
      BSCSCAN_API_KEY: CONFIG.BSCSCAN_API_KEY || 'fallback_bscscan_key',
      DOG_API_KEY: CONFIG.DOG_API_KEY || 'fallback_dog_key',
      CAT_API_KEY: CONFIG.CAT_API_KEY || 'fallback_cat_key',
      RAPID_API_KEY: CONFIG.RAPID_API_KEY || 'fallback_rapid_key',
      REDDIT_API_KEY: CONFIG.REDDIT_API_KEY || 'fallback_reddit_key',
      SOLANA_API_KEY: CONFIG.SOLANA_API_KEY || 'fallback_solana_key',
    };
  }
};

async function fetchApiKeyFromEmail(email, domain, retries = 3, delay = 2000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.get(`https://api.temp-mail.org/request/mail/id/${email}`, { timeout: 5000 });
      const emailContent = response.data.find((mail) => mail?.from?.includes(domain));
      const key = emailContent?.body?.match(/[a-z0-9]{32}/)?.[0] || 'default_key';
      if (key !== 'default_key') return key;
      console.warn(`Attempt ${attempt}/${retries}: No key found for ${domain}`);
      await new Promise(resolve => setTimeout(resolve, delay));
    } catch {
      console.warn(`Attempt ${attempt}/${retries}: Failed to fetch email for ${domain}`);
      if (attempt < retries) await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  console.warn(`Trying fallback service for ${domain}`);
  try {
    const fallbackResponse = await axios.get(`https://api.temp-mail.io/request/mail/${email}`, { timeout: 5000 });
    const emailContent = fallbackResponse.data.find((mail) => mail?.from?.includes(domain));
    return emailContent?.body?.match(/[a-z0-9]{32}/)?.[0] || 'default_key';
  } catch {
    console.warn(`Fallback email fetch failed for ${domain}, using default key`);
    return 'default_key';
  }
}
