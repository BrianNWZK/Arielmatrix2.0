// backend/agents/browserManager.js
import puppeteer from 'puppeteer';
// Playwright import is commented out as it's not explicitly used in the provided logic for getNewPage/closePage,
// but keep it if you intend to use Playwright elsewhere in your browser manager.
// import { chromium as playwrightChromium } from 'playwright';

// === 🌀 Quantum Jitter (Anti-Robot) ===
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
// let playwrightBrowser = null; // Not actively used without playwright import
const puppeteerPagePool = [];
// const playwrightPagePool = []; // Not actively used without playwright import
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
    _browserDriver: 'puppeteer', // Default to puppeteer
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
        // Use config.browserDriver or default to 'puppeteer'
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
            this._logger.info('Puppeteer browser launched.');
        } else {
            // If Playwright is intended, it needs to be imported and handled.
            // For now, this path is not fully supported without the import and setup.
            this._logger.warn(`Browser driver '${this._browserDriver}' not fully supported or configured. Defaulting to Puppeteer if possible.`);
            if (!puppeteerBrowser || !puppeteerBrowser.isConnected()) {
                 puppeteerBrowser = await puppeteer.launch({
                    ...launchOptions,
                    ignoreDefaultArgs: ['--enable-automation']
                });
                this._logger.info('Defaulted to Puppeteer browser launch.');
            }
        }
        this._logger.info(`Browser manager initialized with ${this._browserDriver}.`);
    },

    /**
     * Get a new page with autonomous features
     */
    async getNewPage() {
        if (!puppeteerBrowser || !puppeteerBrowser.isConnected()) {
            this._logger.warn('Puppeteer browser not connected. Attempting to re-initialize.');
            await this.init(this._config, this._logger); // Re-initialize if disconnected
            if (!puppeteerBrowser || !puppeteerBrowser.isConnected()) {
                 throw new Error('Failed to acquire browser: Puppeteer not initialized or connected.');
            }
        }

        let page;
        if (this._browserDriver === 'puppeteer') {
            page = puppeteerPagePool.pop() || await puppeteerBrowser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await injectPuppeteerStealthScripts(page, this._logger);
        } else {
            // This block would need Playwright context/page creation if playwrightBrowser was active
            throw new Error('Unsupported browser driver. Only Puppeteer is configured for getNewPage currently.');
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
                    await page.goto('about:blank').catch(e => this._logger.warn('Error navigating page to blank before pooling:', e.message)); // Navigate to about:blank to clear state
                    puppeteerPagePool.push(page);
                    this._logger.debug('Page returned to pool.');
                } else {
                    await page.close();
                    this._logger.debug('Page closed (pool full).');
                }
            } else {
                // If Playwright was active, this would close its context.
                // await page.context().close();
                this._logger.warn('Unsupported browser driver for closePage. Only Puppeteer is configured.');
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
        try {
            for (const selector of selectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 8000 });
                    await page.click(selector);
                    this._trackOperation('click', true, { selector });
                    return true;
                } catch (error) {
                    continue; // Try next selector
                }
            }
            throw new Error('All click selectors failed');
        } catch (error) {
            this._trackOperation('click', false, { error: error.message });
            if (this._autonomyLevel >= AUTONOMY_LEVELS.ADAPTIVE) {
                this._logger.info('Attempting click recovery...');
                return this._attemptRecovery(page, 'click', selectors);
            }
            throw error;
        }
    },

    async safeType(page, selectors, text) {
        try {
            for (const selector of selectors) {
                try {
                    await page.type(selector, text, { delay: 30 + Math.random() * 30 });
                    this._trackOperation('type', true, { selector, length: text.length });
                    return true;
                } catch (error) {
                    continue; // Try next selector
                }
            }
            throw new Error('All type selectors failed');
        } catch (error) {
            this._trackOperation('type', false, { error: error.message });
            if (this._autonomyLevel >= AUTONOMY_LEVELS.ADAPTIVE) {
                this._logger.info('Attempting type recovery...');
                // You might add a 'type' specific recovery strategy here,
                // e.g., using page.evaluate to set value directly.
            }
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
                        // Use evaluate for a more forceful click
                        await p.evaluate(s => {
                            const el = document.querySelector(s);
                            if (el) el.click();
                        }, selector);
                        this._logger.info(`Recovery click successful for selector: ${selector}`);
                        return true;
                    } catch (error) {
                        this._logger.warn(`Recovery click failed for ${selector}: ${error.message}`);
                        continue;
                    }
                }
                return false;
            }
            // Add other recovery strategies for 'type', 'navigation', etc.
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
     * Cleanup and shutdown methods
     */
    async shutdown() {
        if (puppeteerBrowser) {
            this._logger.info('Shutting down Puppeteer browser...');
            // Close all active pages first
            const allPages = await puppeteerBrowser.pages();
            await Promise.all(allPages.map(page => page.close().catch(e => this._logger.warn('Error closing browser page during shutdown:', e.message))));
            await puppeteerBrowser.close().catch(e => this._logger.error('Error closing puppeteer browser:', e));
        }
        // If Playwright was active, its shutdown logic would be here
        // if (playwrightBrowser) await playwrightBrowser.close();

        puppeteerBrowser = null;
        // playwrightBrowser = null;
        puppeteerPagePool.length = 0; // Clear pools
        // playwrightPagePool.length = 0;
        this._logger.info('All browsers shut down.');
    },

    // A more active cleanup, rather than just shutdown/re-init
    async cleanup() {
        // Implement periodic browser restarts or page management here
        // For example, if browser memory gets too high, restart it.
        // Or if there are too many pages in the pool, close some.
        const browser = puppeteerBrowser;
        if (browser && browser.isConnected()) {
            const pages = await browser.pages();
            this._logger.debug(`Browser cleanup: ${pages.length} total pages, ${puppeteerPagePool.length} pooled.`);
            // Example: Close pages that are not in the pool and are old
            // (Requires tracking page creation time within browserManager.getNewPage)

            // Example: If browser has been running too long, restart it
            // if (Date.now() - this._lastBrowserLaunchTime > someThreshold) {
            //   this._logger.info('Scheduled browser restart for cleanup.');
            //   await this.shutdown();
            //   await this.init(this._config, this._logger);
            // }
        }
    }
};

// Default export
export default browserManager;
