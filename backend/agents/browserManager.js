// backend/agents/browserManager.js
import puppeteer from 'puppeteer'; // Use plain puppeteer as per package.json
import { chromium as playwrightChromium } from 'playwright'; // Use playwright as per package.json

// Global browser instances and page pools for both Puppeteer and Playwright
let puppeteerBrowser = null;
let playwrightBrowser = null;
const puppeteerPagePool = [];
const playwrightPagePool = [];
const MAX_PAGES = 5; // Limit the number of concurrent browser pages to manage resources

/**
 * Injects custom JavaScript into the Puppeteer page context to spoof common browser properties
 * often used for bot detection. This mimics some functionalities of `puppeteer-extra-plugin-stealth`.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 * @param {object} logger - The global logger instance.
 */
const injectPuppeteerStealthScripts = async (page, logger) => {
    try {
        await page.evaluateOnNewDocument(() => {
            // 1. Evade navigator.webdriver detection
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });

            // 2. Evade Chrome headless detection (window.chrome)
            window.chrome = {
                runtime: {},
                // Common properties that might be checked by some anti-bot services
                app: {
                    is               : () => {},
                    InstallState     : {},
                    RunningState     : {},
                    getDetails       : () => {},
                    get   : () => {},
                },
                csi                : () => {},
                loadTimes          : () => {},
                webstore           : {
                    install    : () => {},
                    installed  : false,
                    onExternalInstall: {},
                    onUpdate   : {},
                    reload     : () => {},
                },
            };

            // 3. Evade plugins length detection
            // Mimics standard browser plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [
                    {
                        name: 'Chrome PDF Plugin',
                        filename: 'internal-pdf-viewer',
                        description: 'Portable Document Format',
                        length: 1,
                        0: { enabledPlugin: null, fieldName: 'name', value: 'Chrome PDF Plugin' },
                    },
                    {
                        name: 'Chrome PDF Viewer',
                        filename: 'mhjfbmdgcfjbbpaeojofohoefgieojgcc', // A common ID
                        description: '',
                        length: 1,
                        0: { enabledPlugin: null, fieldName: 'name', value: 'Chrome PDF Viewer' },
                    },
                ],
            });

            // 4. Mimic navigator.mimeTypes
            Object.defineProperty(navigator, 'mimeTypes', {
                get: () => [
                    { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format' },
                    { type: 'application/x-google-chrome-pdf', suffixes: 'pdf', description: 'Portable Document Format' },
                ],
            });

            // 5. Mimic navigator.languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en'],
            });

            // 6. Override permissions API to always return 'denied' for notifications
            // Some sites check if notifications are allowed, which can be a bot signal.
            Object.defineProperty(Notification, 'permission', {
                get: () => 'denied',
            });

            // 7. Emulate common screen properties if not set by viewport
            // These might be checked via JS, e.g., for fingerprinting
            Object.defineProperty(window.screen, 'availWidth', { get: () => 1920 });
            Object.defineProperty(window.screen, 'availHeight', { get: () => 1080 });
            Object.defineProperty(window.screen, 'width', { get: () => 1920 });
            Object.defineProperty(window.screen, 'height', { get: () => 1080 });
            Object.defineProperty(window.screen, 'colorDepth', { get: () => 24 });
            Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24 });

            // 8. Overwrite `toString` of `Function` to prevent detection of `Object.defineProperty` overrides
            // This is a more advanced technique to hide the stealth scripts themselves.
            const originalFunctionToString = Function.prototype.toString;
            Function.prototype.toString = function() {
                if (this.name === 'get' && /\[native code\]/.test(originalFunctionToString.call(this))) {
                    return `function get () { [native code] }`; // Make it look like a native getter
                }
                return originalFunctionToString.call(this);
            };

            // 9. Potentially hide `console.debug` if present (less common but possible)
            if (window.console && console.debug) {
                Object.defineProperty(console, 'debug', { get: () => () => {} }); // Make it a no-op function
            }
        });
        logger.debug('Injected comprehensive Puppeteer stealth scripts into new document context.');
    } catch (error) {
        logger.warn(`⚠️ Failed to inject Puppeteer stealth scripts: ${error.message}`);
    }
};

/**
 * @namespace BrowserManager
 * @description Manages browser instances and pages using either Puppeteer or Playwright,
 * incorporating stealth features and providing robust page interaction methods.
 */
const browserManager = {
    _config: null,
    _logger: null,
    _browserDriver: 'puppeteer', // Default driver, can be set to 'playwright'

    /**
     * Initializes the browser manager, launching either Puppeteer or Playwright based on config.
     * @param {object} config - The global configuration object.
     * @param {string} [config.browserDriver='puppeteer'] - Specifies which browser automation library to use ('puppeteer' or 'playwright').
     * @param {object} logger - The global logger instance.
     * @returns {Promise<void>}
     */
    async init(config, logger) {
        this._config = config;
        this._logger = logger;
        this._browserDriver = config.browserDriver || 'puppeteer'; // Set driver based on config

        if (this._browserDriver === 'puppeteer') {
            if (puppeteerBrowser) {
                this._logger.info('Puppeteer browser manager already initialized.');
                return;
            }
            this._logger.info('Launching Puppeteer browser...');
            try {
                puppeteerBrowser = await puppeteer.launch({
                    headless: true, // Use 'true' for default headless, 'new' for new headless mode in newer Puppeteer versions
                    args: [
                        '--no-sandbox', // Required for Docker/CI environments
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage', // Recommended for Docker/Render environments
                        '--disable-accelerated-2d-canvas', // Disables 2D canvas acceleration
                        '--no-first-run', // Suppresses first run dialog
                        '--no-zygote', // Helps with resource usage
                        '--single-process', // Reduces overhead in some environments
                        '--disable-gpu', // Often necessary in headless environments
                        '--window-size=1920,1080', // Set a common window size
                    ],
                    // This flag specifically helps remove the "Chrome is controlled by automation software" info bar.
                    ignoreDefaultArgs: ['--enable-automation'],
                });
                this._logger.success('✅ Puppeteer browser launched successfully with custom stealth preparations.');
            } catch (error) {
                this._logger.error('🚨 Failed to launch Puppeteer browser:', error);
                throw new Error('Failed to initialize Puppeteer browser manager.');
            }
        } else if (this._browserDriver === 'playwright') {
            if (playwrightBrowser) {
                this._logger.info('Playwright browser manager already initialized.');
                return;
            }
            this._logger.info('Launching Playwright browser...');
            try {
                playwrightBrowser = await playwrightChromium.launch({
                    headless: true,
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--single-process',
                        '--disable-gpu',
                        '--window-size=1920,1080'
                    ]
                    // Playwright generally has good default stealth built-in, so fewer explicit args are needed here.
                });
                this._logger.success('✅ Playwright browser launched successfully (novel stealth alternative).');
            } catch (error) {
                this._logger.error('🚨 Failed to launch Playwright browser:', error);
                throw new Error('Failed to initialize Playwright browser manager.');
            }
        } else {
            throw new Error(`Unsupported browser driver: ${this._browserDriver}. Must be 'puppeteer' or 'playwright'.`);
        }
    },

    /**
     * Retrieves a new or recycled browser page from the pool based on the active driver.
     * Applies relevant stealth settings.
     * @returns {Promise<puppeteer.Page|playwright.Page>} A browser Page instance.
     * @throws {Error} If the browser is not initialized or fails to acquire a page.
     */
    async getNewPage() {
        if (this._browserDriver === 'puppeteer') {
            if (!puppeteerBrowser) {
                throw new Error('Puppeteer browser is not initialized. Call browserManager.init() first.');
            }

            let page;
            if (puppeteerPagePool.length > 0) {
                page = puppeteerPagePool.pop();
                this._logger.info('♻️ Reusing Puppeteer page from pool. Pool size:', puppeteerPagePool.length);
            } else if ((await puppeteerBrowser.pages()).length < MAX_PAGES) {
                page = await puppeteerBrowser.newPage();
                this._logger.info('✨ Created new Puppeteer page. Total pages:', (await puppeteerBrowser.pages()).length);
            } else {
                this._logger.info('⏳ Max Puppeteer pages reached. Waiting for a page to become available...');
                await new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (puppeteerPagePool.length > 0) {
                            clearInterval(checkInterval);
                            page = puppeteerPagePool.pop();
                            this._logger.info('♻️ Reused Puppeteer page after waiting. Pool size:', puppeteerPagePool.length);
                            resolve();
                        }
                    }, 500); // Check every 500ms
                });
            }

            if (page) {
                // Set default timeouts for navigation and selectors
                page.setDefaultNavigationTimeout(60000); // 60 seconds
                page.setDefaultTimeout(30000); // 30 seconds for selectors
                try {
                    // Set a common desktop user agent for better blending
                    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                    // Emulate a common viewport
                    await page.setViewport({ width: 1920, height: 1080 });
                    // Inject custom stealth scripts on every new page
                    await injectPuppeteerStealthScripts(page, this._logger);
                } catch (configError) {
                    this._logger.warn(`⚠️ Failed to set Puppeteer Page config or inject stealth: ${configError.message}. Continuing without some features.`);
                }
                this._logger.info('Puppeteer page acquired and configured with stealth settings.');
                return page;
            } else {
                throw new Error('Failed to acquire a Puppeteer browser page.');
            }
        } else if (this._browserDriver === 'playwright') {
            if (!playwrightBrowser) {
                throw new Error('Playwright browser is not initialized. Call browserManager.init() first.');
            }

            let page;
            if (playwrightPagePool.length > 0) {
                page = playwrightPagePool.pop();
                this._logger.info('♻️ Reusing Playwright page from pool. Pool size:', playwrightPagePool.length);
            } else if ((await playwrightBrowser.contexts()).flatMap(c => c.pages()).length < MAX_PAGES) {
                // For Playwright, creating a new context per page provides better isolation and default stealth.
                const context = await playwrightBrowser.newContext({
                    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    viewport: { width: 1920, height: 1080 },
                    javaScriptEnabled: true,
                    acceptDownloads: false, // Prevents unintended downloads
                    ignoreHTTPSErrors: true, // Useful for self-signed certificates
                    // Playwright has robust default stealth, so less manual injection is usually needed.
                });
                page = await context.newPage();
                this._logger.info('✨ Created new Playwright page. Total pages:', (await playwrightBrowser.contexts()).flatMap(c => c.pages()).length);
            } else {
                this._logger.info('⏳ Max Playwright pages reached. Waiting for a page to become available...');
                await new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (playwrightPagePool.length > 0) {
                            clearInterval(checkInterval);
                            page = playwrightPagePool.pop();
                            this._logger.info('♻️ Reused Playwright page after waiting. Pool size:', playwrightPagePool.length);
                            resolve();
                        }
                    }, 500);
                });
            }

            if (page) {
                // Set default timeouts for navigation and actions
                page.setDefaultNavigationTimeout(60000);
                page.setDefaultTimeout(30000);
                this._logger.info('Playwright page acquired and configured.');
                return page;
            } else {
                throw new Error('Failed to acquire a Playwright browser page.');
            }
        }
    },

    /**
     * Closes a given page and returns it to the pool if under MAX_PAGES,
     * otherwise truly closes it to manage resources. Includes cleanup for reusability.
     * @param {puppeteer.Page|playwright.Page} page - The Page instance to close.
     * @returns {Promise<void>}
     */
    async closePage(page) {
        if (!page) {
            this._logger.warn('Attempted to close a null or undefined page.');
            return;
        }

        if (this._browserDriver === 'puppeteer') {
            if (!page.isClosed()) {
                if (puppeteerPagePool.length < MAX_PAGES) {
                    this._logger.info('Adding Puppeteer page back to pool. Pool size:', puppeteerPagePool.length + 1);
                    // Clean up page state before returning to pool for better reusability
                    try {
                        // Navigate to a blank page to clear content and potential scripts
                        await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 5000 }).catch(e => this._logger.warn(`Puppeteer page goto 'about:blank' failed: ${e.message}`));
                        await page.evaluate(() => localStorage.clear()).catch(e => this._logger.warn(`Puppeteer localStorage clear failed: ${e.message}`));
                        await page.evaluate(() => sessionStorage.clear()).catch(e => this._logger.warn(`Puppeteer sessionStorage clear failed: ${e.message}`));
                        await page.deleteCookie().catch(e => this._logger.warn(`Puppeteer cookie delete failed: ${e.message}`)); // Clears all cookies for the current page's origin
                    } catch (cleanupError) {
                        this._logger.warn(`⚠️ Error during Puppeteer page cleanup before pooling: ${cleanupError.message}`);
                    }
                    puppeteerPagePool.push(page); // Add back to pool
                } else {
                    try {
                        await page.close();
                        this._logger.info('Puppeteer page closed to manage resources.');
                    } catch (error) {
                        this._logger.warn('⚠️ Error closing Puppeteer page:', error.message);
                    }
                }
            } else {
                this._logger.info('Puppeteer page was already closed.');
            }
        } else if (this._browserDriver === 'playwright') {
            if (!page.isClosed()) {
                if (playwrightPagePool.length < MAX_PAGES) {
                    this._logger.info('Adding Playwright page back to pool. Pool size:', playwrightPagePool.length + 1);
                    // Cleanup for Playwright pages before pooling
                    try {
                        await page.goto('about:blank').catch(e => this._logger.warn(`Playwright page goto 'about:blank' failed: ${e.message}`));
                        await page.evaluate(() => localStorage.clear()).catch(e => this._logger.warn(`Playwright localStorage clear failed: ${e.message}`));
                        await page.evaluate(() => sessionStorage.clear()).catch(e => this._logger.warn(`Playwright sessionStorage clear failed: ${e.message}`));
                        // Playwright's context handles cookies more robustly; closing context implicitly cleans up
                    } catch (cleanupError) {
                        this._logger.warn(`⚠️ Error during Playwright page cleanup before pooling: ${cleanupError.message}`);
                    }
                    playwrightPagePool.push(page);
                } else {
                    try {
                        // For Playwright, closing the page's context is often better for full cleanup if it was created per-page.
                        // Here, assuming newContext is used per page, closing the page's context is appropriate.
                        await page.context().close();
                        this._logger.info('Playwright page and its context closed to manage resources.');
                    } catch (error) {
                        this._logger.warn('⚠️ Error closing Playwright page/context:', error.message);
                    }
                }
            } else {
                this._logger.info('Playwright page was already closed.');
            }
        }
    },

    /**
     * Closes the global browser instance (either Puppeteer or Playwright) and cleans up.
     * This should be called when the application is gracefully shutting down.
     * @returns {Promise<void>}
     */
    async closeGlobalBrowserInstance() {
        if (this._browserDriver === 'puppeteer') {
            if (puppeteerBrowser) {
                this._logger.info('Closing global Puppeteer browser instance...');
                try {
                    // Close all pages in the pool first
                    while (puppeteerPagePool.length > 0) {
                        const page = puppeteerPagePool.pop();
                        if (!page.isClosed()) {
                            await page.close();
                        }
                    }
                    await puppeteerBrowser.close();
                    puppeteerBrowser = null; // Reset browser instance
                    this._logger.success('✅ Global Puppeteer browser instance closed.');
                } catch (error) {
                    this._logger.error('🚨 Error closing global Puppeteer browser instance:', error);
                }
            } else {
                this._logger.info('No Puppeteer browser instance to close.');
            }
        } else if (this._browserDriver === 'playwright') {
            if (playwrightBrowser) {
                this._logger.info('Closing global Playwright browser instance...');
                try {
                    // Playwright contexts handle their own pages, so closing the browser closes all.
                    await playwrightBrowser.close();
                    playwrightBrowser = null;
                    playwrightPagePool.length = 0; // Clear Playwright page pool
                    this._logger.success('✅ Global Playwright browser instance closed.');
                } catch (error) {
                    this._logger.error('🚨 Error closing global Playwright browser instance:', error);
                }
            } else {
                this._logger.info('No Playwright browser instance to close.');
            }
        }
    },

    /**
     * Reports a navigation failure to the browser manager for potential re-initialization logic.
     * @returns {void}
     */
    reportNavigationFailure() {
        this._logger.warn('🚨 Browser navigation failure detected. Consider re-evaluating browser state or re-initializing.');
    },

    /**
     * Custom robust click function. Tries multiple selectors and XPath for text content.
     * This function is primarily designed and tested for Puppeteer Page API.
     * @param {puppeteer.Page} page - The Puppeteer Page instance.
     * @param {string[]} selectors - An array of CSS selectors or XPath expressions (starting with //) to try.
     * Can also include `:contains("text")` for text matching in CSS selectors.
     * @returns {Promise<boolean>} True if click was successful, false otherwise.
     * @throws {Error} If all click selectors fail.
     */
    async safeClick(page, selectors) {
        if (this._browserDriver !== 'puppeteer') {
            this._logger.warn('safeClick is primarily designed for Puppeteer. Using it with Playwright might require adapting selectors or using Playwright\'s native click methods for optimal results.');
        }

        for (const selector of selectors) {
            try {
                // Try standard CSS selector first
                let element = await page.waitForSelector(selector.trim(), { timeout: 8000 });
                if (element) {
                    // Introduce a small random delay before clicking for more human-like interaction
                    await page.waitForTimeout(Math.random() * 50 + 50); // 50-100ms delay
                    await element.click();
                    this._logger.info(`✅ Successfully clicked element with CSS selector: "${selector.trim()}"`);
                    return true;
                }
            } catch (e) {
                // If CSS selector fails, try XPath for text content if the selector looks like it's trying to match text
                if (selector.includes(':contains(') || selector.startsWith('//')) {
                    this._logger.info(`Attempting XPath for "${selector.trim()}"`);
                    const match = selector.match(/:contains\(['"]([^'"]+)['"]\)/);
                    const textToFind = match ? match[1] : null;

                    let xpathSelector;
                    if (textToFind) {
                        // Generic XPath for any clickable element (button, a, input, div) containing the text
                        xpathSelector = `//*[contains(text(),'${textToFind}')]/ancestor-or-self::*[self::button or self::a or self::input or self::div][1]`;
                    } else if (selector.startsWith('//')) {
                        xpathSelector = selector; // Already an XPath
                    } else {
                        // Fallback for non-XPath, non-:contains, but might still contain text in element
                        xpathSelector = `//*[contains(text(),'${selector}')]/ancestor-or-self::*[self::button or self::a or self::input or self::div][1]`;
                    }

                    try {
                        const [xpathElement] = await page.waitForXPath(xpathSelector, { timeout: 8000 });
                        if (xpathElement) {
                             await page.waitForTimeout(Math.random() * 50 + 50); // Random delay
                            await xpathElement.click();
                            this._logger.info(`✅ Successfully clicked element with XPath selector: "${xpathSelector}"`);
                            return true;
                        }
                    } catch (xpathError) {
                        this._logger.warn(`XPath click for "${selector.trim()}" failed: ${xpathError.message.substring(0, 50)}...`);
                    }
                }
                this._logger.warn(`Click selector "${selector.trim()}" failed: ${e.message.substring(0, 50)}... Trying next.`);
            }
        }
        throw new Error(`All click selectors failed.`);
    },

    /**
     * Custom robust type function. Tries multiple selectors for input/textarea elements.
     * This function is primarily designed and tested for Puppeteer Page API.
     * @param {puppeteer.Page} page - The Puppeteer page instance.
     * @param {string[]} selectors - An array of CSS selectors or XPath expressions (starting with //) for the input field.
     * Can also include `:contains("text")` for text matching in associated labels/placeholders.
     * @param {string} text - The text to type into the element.
     * @returns {Promise<boolean>} True if typing was successful, false otherwise.
     * @throws {Error} If all type selectors fail.
     */
    async safeType(page, selectors, text) {
        if (this._browserDriver !== 'puppeteer') {
            this._logger.warn('safeType is primarily designed for Puppeteer. Using it with Playwright might require adapting selectors or using Playwright\'s native type methods for optimal results.');
        }

        for (const selector of selectors) {
            try {
                // Try standard CSS selector first
                let element = await page.waitForSelector(selector.trim(), { timeout: 6000 });
                if (element) {
                    await element.click(); // Focus on the element
                    // Add delay after click before typing to simulate human behavior
                    await page.waitForTimeout(Math.random() * 100 + 100); // 100-200ms
                    await page.keyboard.down('Control'); // Select all existing text (Ctrl+A)
                    await page.keyboard.press('A');
                    await page.keyboard.up('Control');
                    await page.keyboard.press('Delete'); // Delete existing text
                    await page.type(selector.trim(), text, { delay: Math.random() * 30 + 30 }); // Type with human-like delay per character (30-60ms)
                    this._logger.info(`✅ Successfully typed into element with CSS selector: "${selector.trim()}"`);
                    return true;
                }
            } catch (e) {
                // If CSS selector fails, try XPath for input elements that might be found by label text or placeholder
                if (selector.includes(':contains(') || selector.startsWith('//')) {
                    this._logger.info(`Attempting XPath for typing in "${selector.trim()}"`);
                    const match = selector.match(/:contains\(['"]([^'"]+)['"]\)/);
                    const textToFind = match ? match[1] : null;

                    let xpathSelector;
                    if (textToFind) {
                        // Find input/textarea associated with a label containing the text, or by placeholder/aria-label
                        xpathSelector = `//label[contains(text(),'${textToFind}')]/following-sibling::*[self::input or self::textarea][1] | //input[contains(@placeholder,'${textToFind}')] | //textarea[contains(@placeholder,'${textToFind}')] | //*[contains(@aria-label,'${textToFind}') and (self::input or self::textarea or self::div[@role='textbox'])]`;
                    } else if (selector.startsWith('//')) {
                        xpathSelector = selector; // Already an XPath
                    } else {
                        // Fallback for general selectors potentially matching name/id/placeholder attributes
                        xpathSelector = `//input[contains(@name,'${selector}') or contains(@id,'${selector}') or contains(@placeholder,'${selector}') or contains(@aria-label,'${selector}')] | //textarea[contains(@name,'${selector}') or contains(@id,'${selector}') or contains(@placeholder,'${selector}') or contains(@aria-label,'${selector}')] | //div[contains(@name,'${selector}') or contains(@id,'${selector}') or contains(@placeholder,'${selector}')][@role='textbox']`;
                    }

                    try {
                        const [xpathElement] = await page.waitForXPath(xpathSelector, { timeout: 6000 });
                        if (xpathElement) {
                            await xpathElement.click(); // Focus
                            await page.waitForTimeout(Math.random() * 100 + 100); // Random delay
                            await page.keyboard.down('Control');
                            await page.keyboard.press('A');
                            await page.keyboard.up('Control');
                            await page.keyboard.press('Delete');
                            await xpathElement.type(text, { delay: Math.random() * 30 + 30 }); // Human-like delay
                            this._logger.info(`✅ Successfully typed into element with XPath selector: "${xpathSelector}"`);
                            return true;
                        }
                    } catch (xpathError) {
                        this._logger.warn(`XPath type for "${selector.trim()}" failed: ${xpathError.message.substring(0, 50)}...`);
                    }
                }
                this._logger.warn(`Type selector "${selector.trim()}" failed: ${e.message.substring(0, 50)}... Trying next.`);
            }
        }
        throw new Error(`All type selectors failed for text: "${text.substring(0, 20)}..."`);
    },
};

export default browserManager;
