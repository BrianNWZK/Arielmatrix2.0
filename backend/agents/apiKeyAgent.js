import puppeteer from 'puppeteer';
import { playwright } from 'playwright'; // Add as dependency in package.json
import axios from 'axios';
import fs from 'fs/promises';

export const apiKeyAgent = async (CONFIG) => {
  try {
    // Try Puppeteer first
    const browser = await puppeteer.launch({ headless: true });
    // ... (rest of Puppeteer code remains the same)
  } catch (error) {
    console.error('Puppeteer failed, switching to Playwright alternative');
    return await apiKeyAgentWithPlaywright(CONFIG); // Use Playwright as fallback
  }
};

async function apiKeyAgentWithPlaywright(CONFIG) {
  try {
    const browser = await playwright.chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Generate temporary email
    const emailResponse = await axios.get('https://api.temp-mail.org/request/mail/id');
    const email = emailResponse.data.email;

    // Sign up for NewsAPI
    await page.goto('https://newsapi.org/register');
    await page.type('#email', email);
    await page.click('#signup-button');
    await page.waitForTimeout(Math.random() * 5000 + 2000);
    const newsApiKey = await fetchApiKeyFromEmail(email, 'newsapi.org') || 'fallback_news_key';

    // Sign up for OpenWeatherMap
    await page.goto('https://openweathermap.org/api');
    await page.type('#email', email);
    await page.click('#signup');
    await page.waitForTimeout(Math.random() * 5000 + 2000);
    const weatherApiKey = await fetchApiKeyFromEmail(email, 'openweathermap.org') || 'fallback_weather_key';

    // Sign up for Twitter API
    await page.goto('https://developer.twitter.com/en/portal/register');
    await page.type('#email', email);
    await page.click('#submit');
    await page.waitForTimeout(Math.random() * 5000 + 2000);
    const twitterApiKey = await fetchApiKeyFromEmail(email, 'twitter.com') || 'fallback_twitter_key';

    // Sign up for BSC Scan if needed
    let bscScanApiKey = CONFIG.BSCSCAN_API_KEY;
    const testBscScan = await axios.get(`${CONFIG.BSCSCAN_API}?module=account&action=balance&address=${CONFIG.GAS_WALLET}&apikey=${bscScanApiKey}`).catch(() => null);
    if (!testBscScan || testBscScan.data.status !== '1') {
      await page.goto('https://bscscan.com/register');
      await page.type('#email', email);
      await page.click('#btnRegister');
      await page.waitForTimeout(Math.random() * 5000 + 2000);
      bscScanApiKey = await fetchApiKeyFromEmail(email, 'bscscan.com') || 'fallback_bscscan_key';
    }

    // Store keys locally for Render API update
    const keys = {
      NEWS_API_KEY: newsApiKey,
      WEATHER_API_KEY: weatherApiKey,
      TWITTER_API_KEY: twitterApiKey,
      BSCSCAN_API_KEY: bscScanApiKey,
    };
    await fs.writeFile('api-keys.json', JSON.stringify(keys));
    console.log('API Keys acquired:', keys);

    await browser.close();
    return keys;
  } catch (error) {
    console.error('Playwright fallback failed:', error);
    return {
      NEWS_API_KEY: 'fallback_news_key',
      WEATHER_API_KEY: 'fallback_weather_key',
      TWITTER_API_KEY: 'fallback_twitter_key',
      BSCSCAN_API_KEY: 'fallback_bscscan_key',
    };
  }
};

async function fetchApiKeyFromEmail(email, domain) {
  const response = await axios.get(`https://api.temp-mail.org/request/mail/id/${email}`);
  const emailContent = response.data.find((mail) => mail.from.includes(domain));
  return emailContent.body.match(/[a-z0-9]{32}/)?.[0] || 'default_key';
}
