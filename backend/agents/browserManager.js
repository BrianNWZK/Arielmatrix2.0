// backend/agents/browserManager.js

import puppeteer from 'puppeteer';
import crypto from 'crypto';

/**
 * @class BrowserManager
 * @description Manages Puppeteer browser instances and pages for autonomous operations,
 * providing a centralized, reusable pool of browser resources with anti-detection measures.
 */
class BrowserManager {
    // --- Static Properties for Global State ---
    static _config = null;
    static _logger = null;
    static _autonomyLevel = null;
    static browserInstance = null; // Holds the main Puppeteer browser instance
    static activePages = new Set(); // Tracks currently active pages
    static pagePool = []; // Pool of reusable pages to minimize creation overhead
    static MAX_POOL_SIZE = 5; // Maximum number of pages to keep in the pool
    static usageStats = { // Statistics about browser usage
        totalAcquired: 0,
        totalReleased: 0,
        activeContexts: 0,
        queueSize: 0, // Placeholder for future queueing logic
        launchTime: null,
        lastOperationTime: null,
        lastPageUsage: {} // Stores per-page usage stats for getLastUsageStats
    };

    // --- Autonomy Levels ---
    static AUTONOMY_LEVELS = {
        BASIC: 1,
        ADAPTIVE: 2,
        FULL: 3
    };

    /**
     * @method init
     * @description Initializes the browser manager, launching a new Puppeteer browser instance
     * if one isn't already connected.
     * @param {object} config - Configuration object (e.g., `maxInstances`, `timeout`, `retries`).
     * @param {object} logger - Logger instance for logging messages.
     * @returns {Promise<void>}
     */
    static async init(config, logger) {
        this._config = config;
        this._logger = logger;
        this._autonomyLevel = config.autonomyLevel || this.AUTONOMY_LEVELS.BASIC;

        if (!this.browserInstance || !this.browserInstance.isConnected()) {
            try {
                this._logger.info('Launching new browser instance...');
                this.browserInstance = await puppeteer.launch({
                    headless: true, // Run in headless mode (no UI)
                    args: [
                        '--no-sandbox', // Required for some environments like Docker/Render
                        '--disable-setuid-sandbox', // Recommended security flag
                        '--disable-dev-shm-usage', // Overcomes limited /dev/shm size in some environments
                        '--disable-accelerated-2d-canvas', // Disables hardware acceleration for 2D canvas
                        '--no-zygote', // Disables zygote process (relevant for Linux)
                        '--disable-gpu', // Disables GPU hardware acceleration
                        // Add more args for improved performance/stability on Render if needed
                        // '--single-process' // Might help with memory on small instances
                    ],
                    ignoreDefaultArgs: ['--enable-automation'], // Helps prevent detection as an automated browser
                    timeout: 0, // Set timeout to 0 for infinite wait on launch, preventing deployment timeouts
                    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH, // Use path from env var if available
                });
                this.usageStats.launchTime = Date.now();
                this._logger.success('Browser instance initialized successfully.');
            } catch (error) {
                // Defensive logging: ensure _logger exists before using it
                if (this._logger && typeof this._logger.error === 'function') {
                    this._logger.error('Failed to launch browser:', error.message, error.stack);
                } else {
                    console.error('CRITICAL ERROR: Failed to launch browser and logger is unavailable or misconfigured.', error);
                }
                throw error; // Re-throw to propagate the initialization failure
            }
        }
    }

    /**
     * @method acquireContext
     * @description Acquires a new Puppeteer Page from the pool or creates a new one.
     * This is the method agents should call to get a browser page.
     * @returns {Promise<puppeteer.Page>} An active Puppeteer Page.
     */
    static async acquireContext() {
        if (!this.browserInstance || !this.browserInstance.isConnected()) {
            this._logger.warn('Browser instance disconnected or not initialized. Attempting re-initialization...');
            await this.init(this._config, this._logger); // Re-initialize if disconnected
            if (!this.browserInstance || !this.browserInstance.isConnected()) {
                throw new Error('Failed to acquire browser context: Browser could not be initialized or reconnected.');
            }
        }

        let page;
        if (this.pagePool.length > 0) {
            page = this.pagePool.pop();
            this._logger.debug('Reused page from pool.');
        } else {
            page = await this.browserInstance.newPage();
            this._logger.debug('Created new page.');
        }

        // Apply anti-detection configuration
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await this._injectStealth(page);

        this.activePages.add(page);
        this.usageStats.activeContexts = this.activePages.size;
        this.usageStats.totalAcquired++;
        this.usageStats.lastOperationTime = Date.now();
        this.usageStats.lastPageUsage = { timestamp: Date.now(), pageId: page.url() }; // Store last used page info
        return page;
    }

    /**
     * @method releaseContext
     * @description Releases a Puppeteer Page back to the pool or closes it if the pool is full.
     * Agents should call this after finishing their browser operations.
     * @param {puppeteer.Page} page - The Puppeteer Page to release.
     * @returns {Promise<void>}
     */
    static async releaseContext(page) {
        if (!page || page.isClosed()) {
            this._logger.debug('Attempted to release an invalid or already closed page.');
            return;
        }

        try {
            if (this.pagePool.length < this.MAX_POOL_SIZE) {
                await page.goto('about:blank').catch(e => this._logger.warn(`Failed to reset page before pooling: ${e.message}`)); // Clean state
                this.pagePool.push(page);
                this._logger.debug('Page released to pool.');
            } else {
                await page.close();
                this._logger.debug('Page closed (pool full).');
            }
        } catch (error) {
            this._logger.warn(`Error releasing page: ${error.message}`);
        } finally {
            this.activePages.delete(page);
            this.usageStats.activeContexts = this.activePages.size;
            this.usageStats.totalReleased++;
        }
    }

    /**
     * @method safeClick
     * @description Attempts to click an element identified by one of the provided selectors.
     * Includes a timeout and a random delay for more human-like interaction.
     * @param {puppeteer.Page} page - The Puppeteer page instance.
     * @param {string|string[]} selectors - One or more CSS selectors for the element.
     * @param {object} [options={}] - Options for the click operation (e.g., `timeout`, `delay`).
     * @returns {Promise<boolean>} True if click was successful, false otherwise.
     * @throws {Error} If all click attempts fail.
     */
    static async safeClick(page, selectors, options = {}) {
        const timeout = options.timeout || 8000;
        const delay = options.delay || 100 + Math.random() * 200;

        for (const selector of Array.isArray(selectors) ? selectors : [selectors]) {
            try {
                await page.waitForSelector(selector, { timeout });
                await page.click(selector, { delay });
                this._logger.debug(`Clicked selector: ${selector}`);
                return true;
            } catch (error) {
                this._logger.debug(`Click attempt failed for selector "${selector}": ${error.message}`);
                continue;
            }
        }
        throw new Error(`All click attempts failed for selectors: ${selectors.join(', ')}`);
    }

    /**
     * @method safeType
     * @description Attempts to type text into an input element identified by one of the provided selectors.
     * Includes a timeout and a random delay for more human-like typing.
     * @param {puppeteer.Page} page - The Puppeteer page instance.
     * @param {string|string[]} selectors - One or more CSS selectors for the input element.
     * @param {string} text - The text to type.
     * @param {object} [options={}] - Options for the typing operation (e.g., `timeout`, `delay`).
     * @returns {Promise<boolean>} True if typing was successful, false otherwise.
     * @throws {Error} If all type attempts fail.
     */
    static async safeType(page, selectors, text, options = {}) {
        const timeout = options.timeout || 8000;
        const delay = options.delay || 30 + Math.random() * 50;

        for (const selector of Array.isArray(selectors) ? selectors : [selectors]) {
            try {
                await page.waitForSelector(selector, { timeout });
                await page.type(selector, text, { delay });
                this._logger.debug(`Typed into selector: ${selector}`);
                return true;
            } catch (error) {
                this._logger.debug(`Type attempt failed for selector "${selector}": ${error.message}`);
                continue;
            }
        }
        throw new Error(`All type attempts failed for selectors: ${selectors.join(', ')}`);
    }

    /**
     * @method shutdown
     * @description Closes the main browser instance and all active pages, releasing all resources.
     * @returns {Promise<void>}
     */
    static async shutdown() {
        if (this.browserInstance) {
            this._logger.info('Initiating browser manager shutdown...');
            // Close all active pages first
            await Promise.all(
                Array.from(this.activePages).map(p => p.close().catch(e => this._logger.warn(`Failed to close active page during shutdown: ${e.message}`)))
            );
            // Empty the page pool and close remaining pages (if any were not in activePages)
            await Promise.all(
                this.pagePool.map(p => p.close().catch(e => this._logger.warn(`Failed to close pooled page during shutdown: ${e.message}`)))
            );
            this.pagePool.length = 0;
            this.activePages.clear();

            // Close the main browser instance
            await this.browserInstance.close();
            this.browserInstance = null;
            this.usageStats.launchTime = null; // Reset launch time on shutdown
            this._logger.info('Browser manager shutdown complete.');
        }
    }

    /**
     * @method getStats
     * @description Retrieves current global usage statistics for the browser manager.
     * This is the method `server.js` calls for dashboard updates.
     * @returns {object} Browser usage statistics.
     */
    static getStats() {
        return {
            totalAcquired: this.usageStats.totalAcquired,
            totalReleased: this.usageStats.totalReleased,
            activeContexts: this.activePages.size, // Current number of pages in use
            poolSize: this.pagePool.length, // Current number of pages in the pool
            maxPoolSize: this.MAX_POOL_SIZE,
            launchTime: this.usageStats.launchTime ? new Date(this.usageStats.launchTime).toISOString() : 'N/A',
            lastOperationTime: this.usageStats.lastOperationTime ? new Date(this.usageStats.lastOperationTime).toISOString() : 'N/A',
            status: this.browserInstance && this.browserInstance.isConnected() ? 'connected' : 'disconnected',
            pagesInUse: Array.from(this.activePages).map(p => p.url()) // List URLs of active pages
        };
    }

    /**
     * @method getStatus
     * @description Provides a simplified status object suitable for agent reporting.
     * This directly addresses the `TypeError: BrowserManager.getStatus is not a function` error.
     * @returns {object} Simplified browser manager status.
     */
    static getStatus() {
        return {
            agent: 'browserManager',
            lastExecution: this.usageStats.lastOperationTime ? new Date(this.usageStats.lastOperationTime).toISOString() : 'Never',
            lastStatus: this.browserInstance && this.browserInstance.isConnected() ? 'operational' : 'disconnected',
            activePages: this.activePages.size,
            pooledPages: this.pagePool.length
        };
    }

    /**
     * @method getLastUsageStats
     * @description Returns statistics about the last page acquired, useful for agent-specific reporting.
     * @returns {object} Last page usage statistics.
     */
    static getLastUsageStats() {
        return { ...this.usageStats.lastPageUsage };
    }

    // === Internal Methods (static, prefixed with underscore) ===

    /**
     * @method _injectStealth
     * @description Injects JavaScript into the page's context to apply anti-detection measures,
     * such as masking `navigator.webdriver`, faking `window.chrome`, and spoofing plugins.
     * @param {puppeteer.Page} page - The Puppeteer page instance to inject scripts into.
     * @returns {Promise<void>}
     */
    static async _injectStealth(page) {
        try {
            await page.evaluateOnNewDocument(() => {
                // Basic webdriver concealment
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false
                });

                // Chrome detection spoofing
                window.chrome = {
                    runtime: {},
                    // Add other chrome properties as needed by common detection scripts
                    // e.g., app, csi, loadTimes etc.
                };

                // Plugin spoofing to appear more like a regular browser
                Object.defineProperty(navigator, 'plugins', {
                    get: () => ([{
                        name: 'Chrome PDF Plugin',
                        filename: 'internal-pdf-viewer',
                        description: 'Portable Document Format'
                    }, {
                        name: 'Chrome PDF Viewer',
                        filename: 'mhjfbmdgcfjbbgclgcebalkgkjmrkdvm',
                        description: 'Portable Document Format'
                    }])
                });

                // Language and platform spoofing
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });

                // Screen properties spoofing for common resolutions
                Object.defineProperty(window.screen, 'width', { get: () => 1920 });
                Object.defineProperty(window.screen, 'height', { get: () => 1080 });
                Object.defineProperty(window.screen, 'availWidth', { get: () => 1920 });
                Object.defineProperty(window.screen, 'availHeight', { get: () => 1040 }); // Typical for taskbar
                Object.defineProperty(window.screen, 'colorDepth', { get: () => 24 });
                Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24 });
            });
        } catch (error) {
            this._logger.warn(`Stealth injection failed for page: ${error.message}`);
        }
    }

    /**
     * @method _quantumDelay
     * @description Generates a promise that resolves after a base delay plus a random jitter.
     * This helps simulate human-like delays and avoid detection.
     * @param {number} baseMs - The base milliseconds for the delay.
     * @returns {Promise<void>} A promise that resolves after the calculated delay.
     */
    static _quantumDelay(baseMs) {
        const jitter = crypto.randomInt(500, 3000); // Random delay between 0.5s and 3s
        return new Promise(resolve => setTimeout(resolve, baseMs + jitter));
    }
}

// Export the class as the default export
export default BrowserManager;
