// backend/agents/browserManager.js
import puppeteer from 'puppeteer';
import { chromium as playwrightChromium } from 'playwright';

// Generate simple UUID without additional dependencies
function simpleUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Global browser instances and page pools
let puppeteerBrowser = null;
let playwrightBrowser = null;
const puppeteerPagePool = [];
const playwrightPagePool = [];
const MAX_PAGES = 5;

// Autonomy configuration
const AUTONOMY_LEVELS = {
  BASIC: 1,
  ADAPTIVE: 2,
  AUTONOMOUS: 3
};

/**
 * Enhanced stealth injection without external plugins
 */
const injectPuppeteerStealthScripts = async (page, logger) => {
  try {
    await page.evaluateOnNewDocument(() => {
      // Basic webdriver concealment
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
        configurable: true
      });

      // Chrome detection evasion
      if (window.chrome === undefined) {
        window.chrome = {};
      }
      if (window.chrome.runtime === undefined) {
        window.chrome.runtime = {};
      }

      // Plugins and mimeTypes
      const originalPlugins = navigator.plugins;
      Object.defineProperty(navigator, 'plugins', {
        get: () => originalPlugins || [{
          name: 'Chrome PDF Plugin',
          filename: 'internal-pdf-viewer',
          description: 'Portable Document Format'
        }],
        configurable: true
      });

      // Screen properties
      const screenProps = ['width', 'height', 'availWidth', 'availHeight', 'colorDepth', 'pixelDepth'];
      screenProps.forEach(prop => {
        Object.defineProperty(window.screen, prop, {
          get: () => prop.includes('Height') ? 1080 : 1920,
          configurable: true
        });
      });

      // Notification permission
      Object.defineProperty(Notification, 'permission', {
        get: () => 'denied',
        configurable: true
      });
    });
    logger.debug('Injected stealth scripts successfully');
  } catch (error) {
    logger.warn(`Stealth injection failed: ${error.message}`);
  }
};

/**
 * Autonomous Browser Manager
 */
const browserManager = {
  _config: null,
  _logger: null,
  _browserDriver: 'puppeteer',
  _autonomyLevel: AUTONOMY_LEVELS.BASIC,
  _operationHistory: new Map(),

  /**
   * Initialize with configuration
   */
  async init(config, logger) {
    this._config = {
      ...config,
      autonomy: {
        enabled: config.autonomyEnabled || false,
        level: Math.min(config.autonomyLevel || AUTONOMY_LEVELS.BASIC, AUTONOMY_LEVELS.AUTONOMOUS)
      }
    };
    this._logger = logger;
    this._browserDriver = config.browserDriver || 'puppeteer';

    const launchOptions = {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--window-size=1920,1080'
      ]
    };

    if (this._browserDriver === 'puppeteer') {
      puppeteerBrowser = await puppeteer.launch({
        ...launchOptions,
        ignoreDefaultArgs: ['--enable-automation']
      });
    } else {
      playwrightBrowser = await playwrightChromium.launch(launchOptions);
    }
  },

  /**
   * Get a new page with autonomous features
   */
  async getNewPage() {
    if (!puppeteerBrowser && !playwrightBrowser) {
      throw new Error('Browser not initialized');
    }

    let page;
    if (this._browserDriver === 'puppeteer') {
      page = puppeteerPagePool.pop() || await puppeteerBrowser.newPage();
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await injectPuppeteerStealthScripts(page, this._logger);
    } else {
      const context = await playwrightBrowser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 }
      });
      page = await context.newPage();
    }

    this._trackOperation('page_creation', true);
    return page;
  },

  /**
   * Close page and manage resources
   */
  async closePage(page) {
    if (!page || page.isClosed()) return;

    try {
      if (this._browserDriver === 'puppeteer') {
        if (puppeteerPagePool.length < MAX_PAGES) {
          await page.goto('about:blank');
          puppeteerPagePool.push(page);
        } else {
          await page.close();
        }
      } else {
        await page.context().close();
      }
      this._trackOperation('page_close', true);
    } catch (error) {
      this._trackOperation('page_close', false, error.message);
      this._logger.warn(`Page close failed: ${error.message}`);
    }
  },

  /**
   * Autonomous interaction methods
   */
  async safeClick(page, selectors) {
    const operationId = simpleUUID();
    try {
      for (const selector of selectors) {
        try {
          await page.waitForSelector(selector, { timeout: 8000 });
          await page.click(selector);
          this._trackOperation('click', true, { selector });
          return true;
        } catch (error) {
          continue;
        }
      }
      throw new Error('All click selectors failed');
    } catch (error) {
      this._trackOperation('click', false, { error: error.message });
      if (this._autonomyLevel >= AUTONOMY_LEVELS.ADAPTIVE) {
        return this._attemptRecovery(page, 'click', selectors);
      }
      throw error;
    }
  },

  async safeType(page, selectors, text) {
    const operationId = simpleUUID();
    try {
      for (const selector of selectors) {
        try {
          await page.type(selector, text, { delay: 30 + Math.random() * 30 });
          this._trackOperation('type', true, { selector, length: text.length });
          return true;
        } catch (error) {
          continue;
        }
      }
      throw new Error('All type selectors failed');
    } catch (error) {
      this._trackOperation('type', false, { error: error.message });
      throw error;
    }
  },

  /**
   * Autonomous recovery system
   */
  async _attemptRecovery(page, operationType, ...args) {
    const recoveryStrategies = {
      click: async (p, selectors) => {
        for (const selector of selectors) {
          try {
            await p.evaluate(s => {
              const el = document.querySelector(s);
              if (el) el.click();
            }, selector);
            return true;
          } catch (error) {
            continue;
          }
        }
        return false;
      }
    };

    if (recoveryStrategies[operationType]) {
      return recoveryStrategies[operationType](page, ...args);
    }
    return false;
  },

  /**
   * Operation tracking for autonomy
   */
  _trackOperation(type, success, metadata = {}) {
    if (!this._operationHistory.has(type)) {
      this._operationHistory.set(type, []);
    }
    this._operationHistory.get(type).push({
      timestamp: Date.now(),
      success,
      metadata
    });
  },

  /**
   * Cleanup
   */
  async shutdown() {
    if (puppeteerBrowser) await puppeteerBrowser.close();
    if (playwrightBrowser) await playwrightBrowser.close();
  }
};

// Named exports
export const getNewPage = browserManager.getNewPage.bind(browserManager);
export const closePage = browserManager.closePage.bind(browserManager);
export const safeClick = browserManager.safeClick.bind(browserManager);
export const safeType = browserManager.safeType.bind(browserManager);

// Default export
export default browserManager;
