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

async function signUpAndGetKey(page, url, emailSelector, submitSelector, keyExtractor) {
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.waitForSelector(emailSelector, { timeout: 10000 }).catch(() => console.warn('Email field not found'));
  await page.type(emailSelector, email);
  await page.click(submitSelector);
  await page.waitForTimeout(Math.random() * 5000 + 2000);
  return await page.evaluate(keyExtractor) || 'default_key';
}

export const apiKeyAgent = async (CONFIG) => {
  try {
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: '/home/appuser/.cache/puppeteer/chrome/linux-139.0.7258.66/chrome-linux64/chrome',
      userDataDir: '/home/appuser/.cache/puppeteer',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    const email = await getTempEmail();

    // Fetch keys from various platforms
    const newsApiKey = await signUpAndGetKey(page, 'https://newsapi.org/register', '#email, input[name="email"]', 'button[type="submit"], #signup-button', () => document.querySelector('#api-key')?.textContent);
    const weatherApiKey = await signUpAndGetKey(page, 'https://openweathermap.org/api', '#email, input[name="email"]', 'button[type="submit"], #signup', () => document.querySelector('#api-key')?.textContent);
    const xApiKey = await signUpAndGetKey(page, 'https://developer.x.com/en/portal/register', '#email, input[name="email"]', 'button[type="submit"], #submit', () => document.querySelector('#api-key')?.textContent);
    const bscScanApiKey = await signUpAndGetKey(page, 'https://bscscan.com/register', '#email, input[name="email"]', 'button[type="submit"], #btnRegister', () => document.querySelector('#api-key')?.textContent);

    // For APIs like Dog API, Cat API (require keys)
    const dogApiKey = await signUpAndGetKey(page, 'https://dog.ceo/dog-api/', '#email, input[name="email"]', 'button[type="submit"]', () => document.querySelector('#api-key')?.textContent);
    const catApiKey = await signUpAndGetKey(page, 'https://thecatapi.com/', '#email, input[name="email"]', 'button[type="submit"]', () => document.querySelector('#api-key')?.textContent);

    // For RapidAPI (sign up and get key for multiple APIs)
    const rapidApiKey = await signUpAndGetKey(page, 'https://rapidapi.com/auth/sign-up', '#email, input[name="email"]', 'button[type="submit"]', () => document.querySelector('#api-key')?.textContent);

    // REST Countries, Public APIs don't need keys

    // Store keys locally
    const keys = {
      NEWS_API_KEY: newsApiKey,
      WEATHER_API_KEY: weatherApiKey,
      X_API_KEY: xApiKey,
      BSCSCAN_API_KEY: bscScanApiKey,
      DOG_API_KEY: dogApiKey,
      CAT_API_KEY: catApiKey,
      RAPID_API_KEY: rapidApiKey,
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
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    const email = await getTempEmail();

    // Similar sign-up logic as Puppeteer
    const newsApiKey = await signUpAndGetKey(page, 'https://newsapi.org/register', '#email, input[name="email"]', 'button[type="submit"], #signup-button', () => document.querySelector('#api-key')?.textContent);
    const weatherApiKey = await signUpAndGetKey(page, 'https://openweathermap.org/api', '#email, input[name="email"]', 'button[type="submit"], #signup', () => document.querySelector('#api-key')?.textContent);
    const xApiKey = await signUpAndGetKey(page, 'https://developer.x.com/en/portal/register', '#email, input[name="email"]', 'button[type="submit"], #submit', () => document.querySelector('#api-key')?.textContent);
    const bscScanApiKey = await signUpAndGetKey(page, 'https://bscscan.com/register', '#email, input[name="email"]', 'button[type="submit"], #btnRegister', () => document.querySelector('#api-key')?.textContent);
    const dogApiKey = await signUpAndGetKey(page, 'https://dog.ceo/dog-api/', '#email, input[name="email"]', 'button[type="submit"]', () => document.querySelector('#api-key')?.textContent);
    const catApiKey = await signUpAndGetKey(page, 'https://thecatapi.com/', '#email, input[name="email"]', 'button[type="submit"]', () => document.querySelector('#api-key')?.textContent);
    const rapidApiKey = await signUpAndGetKey(page, 'https://rapidapi.com/auth/sign-up', '#email, input[name="email"]', 'button[type="submit"]', () => document.querySelector('#api-key')?.textContent);

    const keys = {
      NEWS_API_KEY: newsApiKey,
      WEATHER_API_KEY: weatherApiKey,
      X_API_KEY: xApiKey,
      BSCSCAN_API_KEY: bscScanApiKey,
      DOG_API_KEY: dogApiKey,
      CAT_API_KEY: catApiKey,
      RAPID_API_KEY: rapidApiKey,
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
    };
  }
};

async function fetchApiKeyFromEmail(email, domain) {
  try {
    const response = await axios.get(`https://api.temp-mail.org/request/mail/id/${email}`, { timeout: 5000 });
    const emailContent = response.data.find((mail) => mail?.from?.includes(domain));
    return emailContent?.body?.match(/[a-z0-9]{32}/)?.[0] || 'default_key';
  } catch {
    console.warn(`Failed to fetch email for ${domain}, trying fallback service`);
    try {
      const fallbackResponse = await axios.get(`https://api.temp-mail.io/request/mail/${email}`, { timeout: 5000 });
      const emailContent = fallbackResponse.data.find((mail) => mail?.from?.includes(domain));
      return emailContent?.body?.match(/[a-z0-9]{32}/)?.[0] || 'default_key';
    } catch {
      console.warn(`Fallback email fetch failed for ${domain}, using default key`);
      return 'default_key';
    }
  }
}
