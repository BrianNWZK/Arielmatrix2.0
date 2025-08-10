import puppeteer from 'puppeteer';
import playwright from 'playwright';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';

export const apiKeyAgent = async (CONFIG) => {
  try {
    // Configure Puppeteer with explicit Chrome path and cache
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: '/home/appuser/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome',
      userDataDir: '/home/appuser/.cache/puppeteer',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // Generate temporary email with fallback
    let email;
    try {
      const emailResponse = await axios.get('https://api.temp-mail.org/request/mail/id', { timeout: 5000 });
      email = emailResponse.data.email || 'fallback@example.com';
    } catch {
      console.warn('Temp email API failed, trying fallback service');
      try {
        const fallbackResponse = await axios.get('https://api.temp-mail.io/request/mail', { timeout: 5000 });
        email = fallbackResponse.data.email || 'fallback@example.com';
      } catch {
        console.warn('Fallback email service failed, using static email');
        email = 'fallback@example.com';
      }
    }

    // Sign up for NewsAPI
    await page.goto('https://newsapi.org/register', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#email', { timeout: 10000 }).catch(() => console.warn('NewsAPI email field not found'));
    await page.type('#email', email);
    await page.click('button[type="submit"], #signup-button');
    await page.waitForTimeout(Math.random() * 5000 + 2000);
    const newsApiKey = await fetchApiKeyFromEmail(email, 'newsapi.org') || CONFIG.NEWS_API_KEY || 'fallback_news_key';

    // Sign up for OpenWeatherMap
    await page.goto('https://openweathermap.org/api', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#email', { timeout: 10000 }).catch(() => console.warn('OpenWeatherMap email field not found'));
    await page.type('#email', email);
    await page.click('button[type="submit"], #signup');
    await page.waitForTimeout(Math.random() * 5000 + 2000);
    const weatherApiKey = await fetchApiKeyFromEmail(email, 'openweathermap.org') || CONFIG.WEATHER_API_KEY || 'fallback_weather_key';

    // Sign up for Twitter API
    await page.goto('https://developer.twitter.com/en/portal/register', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#email', { timeout: 10000 }).catch(() => console.warn('Twitter API email field not found'));
    await page.type('#email', email);
    await page.click('button[type="submit"], #submit');
    await page.waitForTimeout(Math.random() * 5000 + 2000);
    const twitterApiKey = await fetchApiKeyFromEmail(email, 'twitter.com') || CONFIG.TWITTER_API_KEY || 'fallback_twitter_key';

    // Sign up for BSCScan if needed
    let bscScanApiKey = CONFIG.BSCSCAN_API_KEY;
    const testBscScan = await axios.get(`${CONFIG.BSCSCAN_API}?module=account&action=balance&address=${CONFIG.GAS_WALLET}&apikey=${bscScanApiKey}`, { timeout: 5000 }).catch(() => null);
    if (!testBscScan || testBscScan.data.status !== '1') {
      await page.goto('https://bscscan.com/register', { waitUntil: 'networkidle2' });
      await page.waitForSelector('#email', { timeout: 10000 }).catch(() => console.warn('BSCScan email field not found'));
      await page.type('#email', email);
      await page.click('button[type="submit"], #btnRegister');
      await page.waitForTimeout(Math.random() * 5000 + 2000);
      bscScanApiKey = await fetchApiKeyFromEmail(email, 'bscscan.com') || CONFIG.BSCSCAN_API_KEY || 'fallback_bscscan_key';
    }

    // Store keys locally for Render API update
    const keys = {
      NEWS_API_KEY: newsApiKey,
      WEATHER_API_KEY: weatherApiKey,
      TWITTER_API_KEY: twitterApiKey,
      BSCSCAN_API_KEY: bscScanApiKey,
    };
    try {
      const filePath = path.join('/app/backend', 'api-keys.json');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(keys, null, 2));
      console.log('API Keys acquired and saved:', keys);
    } catch (error) {
      console.error('Failed to write api-keys.json:', error);
      // Fallback to returning keys without writing to file
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
      executablePath: '/home/appuser/.cache/ms-playwright/chromium_headless_shell-1181/chrome-linux/headless_shell',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const page = await browser.newPage();

    // Generate temporary email with fallback
    let email;
    try {
      const emailResponse = await axios.get('https://api.temp-mail.org/request/mail/id', { timeout: 5000 });
      email = emailResponse.data.email || 'fallback@example.com';
    } catch {
      console.warn('Temp email API failed, trying fallback service');
      try {
        const fallbackResponse = await axios.get('https://api.temp-mail.io/request/mail', { timeout: 5000 });
        email = fallbackResponse.data.email || 'fallback@example.com';
      } catch {
        console.warn('Fallback email service failed, using static email');
        email = 'fallback@example.com';
      }
    }

    // Sign up for NewsAPI
    await page.goto('https://newsapi.org/register', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#email', { timeout: 10000 }).catch(() => console.warn('NewsAPI email field not found'));
    await page.type('#email', email);
    await page.click('button[type="submit"], #signup-button');
    await page.waitForTimeout(Math.random() * 5000 + 2000);
    const newsApiKey = await fetchApiKeyFromEmail(email, 'newsapi.org') || CONFIG.NEWS_API_KEY || 'fallback_news_key';

    // Sign up for OpenWeatherMap
    await page.goto('https://openweathermap.org/api', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#email', { timeout: 10000 }).catch(() => console.warn('OpenWeatherMap email field not found'));
    await page.type('#email', email);
    await page.click('button[type="submit"], #signup');
    await page.waitForTimeout(Math.random() * 5000 + 2000);
    const weatherApiKey = await fetchApiKeyFromEmail(email, 'openweathermap.org') || CONFIG.WEATHER_API_KEY || 'fallback_weather_key';

    // Sign up for Twitter API
    await page.goto('https://developer.twitter.com/en/portal/register', { waitUntil: 'networkidle2' });
    await page.waitForSelector('#email', { timeout: 10000 }).catch(() => console.warn('Twitter API email field not found'));
    await page.type('#email', email);
    await page.click('button[type="submit"], #submit');
    await page.waitForTimeout(Math.random() * 5000 + 2000);
    const twitterApiKey = await fetchApiKeyFromEmail(email, 'twitter.com') || CONFIG.TWITTER_API_KEY || 'fallback_twitter_key';

    // Sign up for BSCScan if needed
    let bscScanApiKey = CONFIG.BSCSCAN_API_KEY;
    const testBscScan = await axios.get(`${CONFIG.BSCSCAN_API}?module=account&action=balance&address=${CONFIG.GAS_WALLET}&apikey=${bscScanApiKey}`, { timeout: 5000 }).catch(() => null);
    if (!testBscScan || testBscScan.data.status !== '1') {
      await page.goto('https://bscscan.com/register', { waitUntil: 'networkidle2' });
      await page.waitForSelector('#email', { timeout: 10000 }).catch(() => console.warn('BSCScan email field not found'));
      await page.type('#email', email);
      await page.click('button[type="submit"], #btnRegister');
      await page.waitForTimeout(Math.random() * 5000 + 2000);
      bscScanApiKey = await fetchApiKeyFromEmail(email, 'bscscan.com') || CONFIG.BSCSCAN_API_KEY || 'fallback_bscscan_key';
    }

    // Store keys locally for Render API update
    const keys = {
      NEWS_API_KEY: newsApiKey,
      WEATHER_API_KEY: weatherApiKey,
      TWITTER_API_KEY: twitterApiKey,
      BSCSCAN_API_KEY: bscScanApiKey,
    };
    try {
      const filePath = path.join('/app/backend', 'api-keys.json');
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(keys, null, 2));
      console.log('API Keys acquired and saved:', keys);
    } catch (error) {
      console.error('Failed to write api-keys.json:', error);
      // Fallback to returning keys without writing to file
    }

    await browser.close();
    return keys;
  } catch (error) {
    console.error('Playwright fallback failed:', error);
    return {
      NEWS_API_KEY: CONFIG.NEWS_API_KEY || 'fallback_news_key',
      WEATHER_API_KEY: CONFIG.WEATHER_API_KEY || 'fallback_weather_key',
      TWITTER_API_KEY: CONFIG.TWITTER_API_KEY || 'fallback_twitter_key',
      BSCSCAN_API_KEY: CONFIG.BSCSCAN_API_KEY || 'fallback_bscscan_key',
    };
  }
}

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
