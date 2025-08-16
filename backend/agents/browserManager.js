// backend/agents/browserManager.js
import puppeteer from 'puppeteer';

class BrowserManager {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async init() {
    if (this.browser) await this.close();

    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-position=0,0',
      '--window-size=1366,768'
    ];

    try {
      this.browser = await puppeteer.launch({
        headless: 'new',
        args,
        timeout: 120000,
        ignoreHTTPSErrors: true
      });

      this.page = await this.browser.newPage();
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
      );
      await this.page.setViewport({ width: 1366, height: 768 });

      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
        window.chrome = { runtime: {}, loadTimes: () => {}, csi: () => {} };
      });

      return this.page;
    } catch (error) {
      console.warn('⚠️ Browser launch failed:', error.message);
      await this.close();
      throw error;
    }
  }

  async close() {
    if (this.page) {
      try {
        await this.page.close();
      } catch (e) {
        console.warn('⚠️ Failed to close page:', e.message);
      }
    }
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        console.warn('⚠️ Failed to close browser:', e.message);
      }
    }
    this.browser = null;
    this.page = null;
  }
}

export const browserManager = new BrowserManager();
