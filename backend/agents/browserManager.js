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
  }

  async close() {
    if (this.page) await this.page.close();
    if (this.browser) await this.browser.close();
    this.browser = null;
    this.page = null;
  }
}

export const browserManager = new BrowserManager();
