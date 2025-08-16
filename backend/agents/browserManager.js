// backend/agents/browserManager.js
import puppeteer from 'puppeteer';

/**
 * @class BrowserManager
 * @description A singleton class to manage a single, highly resilient Puppeteer browser instance.
 * It provides methods to get new pages, close individual pages, and gracefully shut down the browser.
 * Incorporates adaptive learning for page timeouts and advanced anti-detection measures.
 * This is the "Quantum Browser Resilience" layer for autonomous web operations.
 */
class BrowserManager {
  constructor() {
    /** @private {puppeteer.Browser|null} The single global Puppeteer browser instance. */
    this._browserInstance = null;
    /** @private {number} Tracks the number of open pages from this browser. */
    this._activePageCount = 0;
    /** @private {number} Maximum attempts to launch the browser. */
    this._MAX_BROWSER_LAUNCH_RETRIES = 5;
    /** @private {number} Delay in milliseconds between browser launch retries. */
    this._BROWSER_LAUNCH_RETRY_DELAY_MS = 15000; // 15 seconds

    /** @private {number} Counts consecutive navigation failures across pages. Resets on successful navigation. */
    this._consecutiveNavigationFailures = 0;
    /** @private {number} The current default timeout for new pages. Adapts based on navigation failures. */
    this._currentDefaultPageTimeout = 90000; // Initial default: 90 seconds
    /** @private {number} The increment to add to timeout on failure. */
    this._PAGE_TIMEOUT_INCREMENT = 30000; // 30 seconds
    /** @private {number} Maximum allowed page timeout. */
    this._MAX_PAGE_TIMEOUT = 300000; // 5 minutes
  }

  /**
   * @private
   * Attempts to launch a new Puppeteer browser instance with robust error handling and retries.
   * This is crucial for stability in containerized environments like Render.
   * @returns {Promise<puppeteer.Browser>} A newly launched and connected Puppeteer browser.
   * @throws {Error} If the browser fails to launch after all retries.
   */
  async _launchBrowserWithRetries() {
    for (let i = 0; i < this._MAX_BROWSER_LAUNCH_RETRIES; i++) {
      try {
        console.log(`🚀 Attempting to launch global browser instance (Attempt ${i + 1}/${this._MAX_BROWSER_LAUNCH_RETRIES})...`);
        const browser = await puppeteer.launch({
          headless: 'new', // Use 'new' for the latest headless mode
          args: [
            '--no-sandbox', // Essential for Docker/Render environments
            '--disable-setuid-sandbox', // Essential for Docker/Render environments
            '--disable-dev-shm-usage', // Important for memory-constrained environments
            '--disable-gpu', // Recommended for cloud environments
            '--incognito', // Ensures clean sessions for each page
            '--disable-blink-features=AutomationControlled', // Anti-detection
            '--disable-infobars', // Anti-detection
            '--unlimited-storage', // Allow ample storage for temp files
            '--full-memory-crash-report', // More verbose crash reports
            '--disable-features=site-per-process', // May help with certain navigation issues
            // Ensure no window position/size args in headless, as they are irrelevant and can cause warnings
          ],
          timeout: 180000, // Increased global launch timeout to 3 minutes
          ignoreHTTPSErrors: true // Ignore HTTPS errors
        });

        // Attach a listener for unexpected disconnections, which can happen in cloud environments.
        browser.on('disconnected', () => {
          console.warn('⚠️ Global browser instance disconnected unexpectedly. Resetting for re-launch on next request.');
          this._browserInstance = null; // Clear the reference to force a fresh launch
          this._activePageCount = 0; // Invalidate all active pages
          this._consecutiveNavigationFailures = 0; // Reset adaptive learning state
          this._currentDefaultPageTimeout = 90000; // Reset timeout
        });

        console.log('✅ Global browser instance launched successfully.');
        return browser;
      } catch (error) {
        console.error(`🚨 Browser launch failed on attempt ${i + 1}: ${error.message}`);
        if (i < this._MAX_BROWSER_LAUNCH_RETRIES - 1) {
          console.log(`Retrying browser launch in ${this._BROWSER_LAUNCH_RETRY_DELAY_MS / 1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, this._BROWSER_LAUNCH_RETRY_DELAY_MS));
        } else {
          // Final failure, re-throw to propagate critical error
          throw new Error(`Failed to launch browser instance after ${this._MAX_BROWSER_LAUNCH_RETRIES} attempts: ${error.message}`);
        }
      }
    }
  }

  /**
   * @private
   * Retrieves the single, managed Puppeteer browser instance.
   * Lazily initializes it or re-launches if disconnected.
   * @returns {Promise<puppeteer.Browser>} The active Puppeteer browser instance.
   * @throws {Error} If the browser cannot be launched or re-established after all retries.
   */
  async _getManagedBrowserInstance() {
    if (this._browserInstance && this._browserInstance.isConnected()) {
      return this._browserInstance;
    }

    // If not connected or null, attempt to launch/re-launch it
    try {
      this._browserInstance = await this._launchBrowserWithRetries();
      return this._browserInstance;
    } catch (error) {
      console.error('🚨 Critical: Unable to obtain a working browser instance. All browser-dependent agents will fail.');
      this._browserInstance = null; // Ensure a broken instance isn't kept
      this._activePageCount = 0;
      throw error; // Re-throw the critical error
    }
  }

  /**
   * Creates and returns a new Puppeteer page from the managed browser instance.
   * This is the primary way agents should get a browser page.
   * Includes advanced anti-detection measures and applies adaptive timeouts.
   * @returns {Promise<puppeteer.Page>} A new Puppeteer page object.
   */
  async getNewPage() {
    const browser = await this._getManagedBrowserInstance();
    const page = await browser.newPage();

    // Apply adaptive timeout based on recent navigation failures
    page.setDefaultTimeout(this._currentDefaultPageTimeout);
    console.log(`⏱️ Setting new page default timeout to: ${this._currentDefaultPageTimeout / 1000} seconds.`);

    // Apply advanced anti-detection measures to the new page
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 768 }); // Good practice even in headless for consistent rendering

    // Evaluate code in the context of the new page to spoof WebDriver detection and other common checks
    await page.evaluateOnNewDocument(() => {
      // Hide the WebDriver property
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
      // Spoof chrome object (critical for many bot detection systems)
      window.chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {} // Add 'app' property for more complete spoofing
      };
      // Hide plugins and mimeTypes lengths (common fingerprinting)
      Object.defineProperty(navigator, 'plugins', { get: () => [] });
      Object.defineProperty(navigator, 'mimeTypes', { get: () => [] });
      // Remove language properties (another fingerprinting vector)
      delete navigator.language;
      delete navigator.languages;
      // Define a custom notification permission state to avoid popups/errors
      Object.defineProperty(Notification, 'permission', { get: () => 'denied' });
    });

    this._activePageCount++;
    console.log(`✨ New page created. Total active pages: ${this._activePageCount}`);
    return page;
  }

  /**
   * Closes a single Puppeteer page and decrements the active page counter.
   * Handles potential errors during closing gracefully.
   * @param {puppeteer.Page} page - The page to close.
   */
  async closePage(page) {
    if (page && !page.isClosed()) {
      try {
        await page.close();
        this._activePageCount = Math.max(0, this._activePageCount - 1); // Ensure count doesn't go negative
        console.log(`🗑️ Page closed. Remaining active pages: ${this._activePageCount}`);
        this._consecutiveNavigationFailures = 0; // Reset failure count on successful page use/closure
      } catch (error) {
        console.warn(`⚠️ Error closing page (ID: ${page.target()._targetInfo?.targetId || 'unknown'}): ${error.message}. Page might already be closed or disconnected.`);
        this._activePageCount = Math.max(0, this._activePageCount - 1); // Decrement count even if close fails
      }
    }
  }

  /**
   * Reports a navigation failure for adaptive learning.
   * If consecutive failures exceed a threshold, the default page timeout is increased.
   */
  reportNavigationFailure() {
    this._consecutiveNavigationFailures++;
    console.warn(`🚨 Navigation failure reported. Consecutive failures: ${this._consecutiveNavigationFailures}`);

    if (this._consecutiveNavigationFailures >= 2) { // After 2 consecutive failures
      const newTimeout = this._currentDefaultPageTimeout + this._PAGE_TIMEOUT_INCREMENT;
      this._currentDefaultPageTimeout = Math.min(newTimeout, this._MAX_PAGE_TIMEOUT);
      console.log(`📈 Adaptive learning: Increased page timeout to ${this._currentDefaultPageTimeout / 1000}s due to persistent navigation issues.`);
      this._consecutiveNavigationFailures = 0; // Reset after adjustment, or keep escalating
    }
  }

  /**
   * Explicitly closes the entire global Puppeteer browser instance.
   * This should be called during application shutdown to release all browser resources.
   */
  async closeGlobalBrowserInstance() {
    if (this._browserInstance && this._browserInstance.isConnected()) {
      console.log('Shutting down global browser instance...');
      try {
        await this._browserInstance.close();
        this._browserInstance = null;
        this._activePageCount = 0;
        this._consecutiveNavigationFailures = 0;
        this._currentDefaultPageTimeout = 90000; // Reset to initial
        console.log('✅ Global browser instance shut down.');
      } catch (error) {
        console.error('🚨 Error shutting down global browser instance:', error.message);
        this._browserInstance = null; // Ensure the instance is nulled even if closing fails
      }
    } else {
      console.log('No active browser instance to shut down.');
    }
  }

  /**
   * Returns the current count of active pages.
   * @returns {number} The number of currently open pages.
   */
  getActivePageCount() {
    return this._activePageCount;
  }
}

// Export a single instance of the BrowserManager class (singleton pattern)
export const browserManager = new BrowserManager();
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
