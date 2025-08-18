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
    
    // A mapping of service URLs to their specific login form selectors
    static loginSelectors = {
        'https://bscscan.com': {
            loginPageUrl: 'https://bscscan.com/login', // Explicit login page URL
            email: '#email',
            password: '#password',
            submit: '#btnSubmit',
            postLoginCheck: '/dashboard' // Expected URL fragment after successful login
        },
        'https://nowpayments.io': {
            loginPageUrl: 'https://nowpayments.io/auth/login',
            email: '#email-input',
            password: '#password-input',
            submit: '.login-button',
            postLoginCheck: '/dashboard'
        }
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
                if (this._logger) {
                    this._logger.info('Launching new browser instance...');
                }

                this.browserInstance = await puppeteer.launch({
                    headless: true, // Run in headless mode (no UI)
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-zygote',
                        '--disable-gpu',
                    ],
                    ignoreDefaultArgs: ['--enable-automation'],
                    timeout: 0,
                    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
                });
                this.usageStats.launchTime = Date.now();
                if (this._logger) {
                    this._logger.success('Browser instance initialized successfully.');
                }
            } catch (error) {
                if (this._logger) {
                    this._logger.error('Failed to launch browser:', error.message, error.stack);
                } else {
                    console.error('CRITICAL ERROR: Failed to launch browser and logger is unavailable or misconfigured.', error);
                }
                throw error;
            }
        }
    }
    
    /**
     * @method autonomousLogin
     * @description Attempts to log in to a web service using provided credentials and selectors.
     * Includes adaptive retry logic and anti-detection measures.
     * @param {puppeteer.Page} page - The Puppeteer page instance.
     * @param {string} serviceBaseUrl - The base URL of the service (e.g., 'https://bscscan.com').
     * @param {object} credentials - The login credentials { email, password }.
     * @returns {Promise<boolean>} True if login is successful, false otherwise.
     */
    static async autonomousLogin(page, serviceBaseUrl, credentials) {
        const serviceConfig = this.loginSelectors[serviceBaseUrl];
        if (!serviceConfig) {
            this._logger.error(`🚨 No login selectors configured for ${serviceBaseUrl}.`);
            return false;
        }
    
        const { loginPageUrl, email, password, submit, postLoginCheck } = serviceConfig;
        const maxLoginRetries = 3;
        let loginAttempt = 0;
    
        while (loginAttempt < maxLoginRetries) {
            loginAttempt++;
            this._logger.info(`Attempting autonomous login to ${serviceBaseUrl} (Attempt ${loginAttempt}/${maxLoginRetries})...`);
            try {
                await page.goto(loginPageUrl, { waitUntil: 'networkidle0', timeout: 30000 });
                await this._humanDelay(1000, 3000); // Wait for page to load

                // Check for CAPTCHA presence (simple conceptual check)
                const captchaDetected = await page.$eval('img[alt*="captcha"], #captcha', el => true).catch(() => false);
                if (captchaDetected) {
                    this._logger.warn(`⚠️ CAPTCHA detected on ${serviceBaseUrl}. Automated login may fail.`);
                    // In a 'FULL' autonomy level, this is where you'd integrate a CAPTCHA solving service.
                    // For now, we'll try to proceed but acknowledge the difficulty.
                    // provideThreatIntelligence('browser_block', `CAPTCHA detected on ${serviceBaseUrl}`);
                }
    
                await this.safeType(page, email, credentials.email, { timeout: 15000 });
                await this._humanDelay(500, 1000); // Simulate human pause
                await this.safeType(page, password, credentials.password, { timeout: 15000 });
    
                await this._humanDelay(1000, 2000); // Pre-submit delay
                await this.safeClick(page, submit, { timeout: 15000 });
    
                await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 45000 }); // Increased timeout for login
    
                const newUrl = page.url();
                if (newUrl.includes(postLoginCheck)) {
                    this._logger.success(`✅ Login successful for ${serviceBaseUrl}.`);
                    return true;
                } else {
                    this._logger.error(`🚨 Login failed or redirected to an unexpected URL: ${newUrl} on ${serviceBaseUrl}.`);
                    // Check for common error messages on the page
                    const errorMessage = await page.evaluate(() => document.body.innerText.includes('Incorrect username or password') ? 'Incorrect credentials' : 'Unknown login error');
                    this._logger.debug(`Login error message: ${errorMessage}`);
                    if (errorMessage.includes('Incorrect credentials')) {
                        // Don't retry if credentials are clearly wrong
                        this._logger.error('Invalid credentials, not retrying login.');
                        return false;
                    }
                    await this._humanDelay(5000, 10000); // Exponential backoff for retries
                }
            } catch (error) {
                this._logger.error(`🚨 Error during login to ${serviceBaseUrl} (Attempt ${loginAttempt}): ${error.message}`);
                // Check if it's a timeout error and retry, otherwise rethrow or stop.
                if (error.name === 'TimeoutError') {
                    this._logger.warn(`Timeout during login attempt for ${serviceBaseUrl}. Retrying...`);
                    await this._humanDelay(5000 * loginAttempt, 10000 * loginAttempt); // Longer backoff for timeouts
                } else {
                    // For non-timeout errors, report to health agent and stop.
                    // provideThreatIntelligence('browser_block', `Login failed due to unexpected error on ${serviceBaseUrl}: ${error.message}`);
                    return false;
                }
            }
        }
        this._logger.error(`🚫 All ${maxLoginRetries} login attempts failed for ${serviceBaseUrl}.`);
        return false;
    }
    
    /**
     * @method retrieveApiKey
     * @description Navigates to a specific page and extracts an API key from the page's content.
     * Includes advanced extraction logic.
     * @param {puppeteer.Page} page - The Puppeteer page instance.
     * @param {string} keyPageUrl - The URL of the page containing the API key.
     * @param {string|string[]} keySelectors - CSS selectors for the element containing the key.
     * @returns {Promise<string|null>} The retrieved API key string or null if not found.
     */
    static async retrieveApiKey(page, keyPageUrl, keySelectors) {
        try {
            this._logger.info(`Navigating to ${keyPageUrl} to retrieve API key...`);
            await page.goto(keyPageUrl, { waitUntil: 'networkidle0', timeout: 30000 });
            await this._humanDelay(2000, 4000);
    
            // Attempt to find the key using provided selectors
            for (const selector of Array.isArray(keySelectors) ? keySelectors : [keySelectors]) {
                const keyElement = await page.$(selector);
                if (keyElement) {
                    const apiKey = await page.evaluate(el => el.textContent.trim(), keyElement);
                    if (apiKey && apiKey.length > 10 && !apiKey.includes('placeholder') && !apiKey.includes('loading')) { // Basic validation
                        this._logger.success(`🔑 Successfully retrieved API key from selector "${selector}".`);
                        return apiKey;
                    } else {
                        this._logger.warn(`⚠️ Found element with selector "${selector}" but content looks like a placeholder or too short.`);
                    }
                }
            }

            // Fallback: search the entire page for common API key patterns if specific selectors fail
            if (this._autonomyLevel >= this.AUTONOMY_LEVELS.ADAPTIVE) {
                this._logger.info("Attempting advanced key extraction: scanning page for common patterns...");
                const pageText = await page.evaluate(() => document.body.innerText);
                // Regex for common API key formats (e.g., UUIDs, base64-like strings, specific prefixes)
                const apiKeyRegex = /(?:api_?key|token|access_?token|secret)(?:[\s"']?[:=][\s"']?)([a-zA-Z0-9_-]{20,}|sk-[a-zA-Z0-9]{20,})/gi;
                const matches = pageText.match(apiKeyRegex);
                if (matches && matches.length > 0) {
                    // Take the first promising match, clean it up
                    const rawKeyMatch = matches[0].split(/[:=]/).pop().trim().replace(/['"]/g, '');
                    if (rawKeyMatch.length > 20) { // Ensure it's a reasonably long string
                        this._logger.success(`🔍 Found potential API key via pattern matching: ${rawKeyMatch.substring(0, 10)}...`);
                        return rawKeyMatch;
                    }
                }
            }

            this._logger.warn(`⚠️ Could not find API key using any methods on ${keyPageUrl}.`);
            return null;
        } catch (error) {
            this._logger.error(`🚨 Error during API key retrieval: ${error.message}`);
            // provideThreatIntelligence('api_key_extraction_failure', `Failed to extract key from ${keyPageUrl}: ${error.message}`);
            return null;
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
            await this.init(this._config, this._logger);
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

        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await this._injectStealth(page);

        this.activePages.add(page);
        this.usageStats.activeContexts = this.activePages.size;
        this.usageStats.totalAcquired++;
        this.usageStats.lastOperationTime = Date.now();
        this.usageStats.lastPageUsage = { timestamp: Date.now(), pageId: page.url() };
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
                await page.goto('about:blank').catch(e => this._logger.warn(`Failed to reset page before pooling: ${e.message}`));
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
            await Promise.all(
                Array.from(this.activePages).map(p => p.close().catch(e => this._logger.warn(`Failed to close active page during shutdown: ${e.message}`)))
            );
            await Promise.all(
                this.pagePool.map(p => p.close().catch(e => this._logger.warn(`Failed to close pooled page during shutdown: ${e.message}`)))
            );
            this.pagePool.length = 0;
            this.activePages.clear();

            await this.browserInstance.close();
            this.browserInstance = null;
            this.usageStats.launchTime = null;
            this._logger.info('Browser manager shutdown complete.');
        }
    }

    /**
     * @method getStats
     * @description Retrieves current global usage statistics for the browser manager.
     * @returns {object} Browser usage statistics.
     */
    static getStats() {
        return {
            totalAcquired: this.usageStats.totalAcquired,
            totalReleased: this.usageStats.totalReleased,
            activeContexts: this.activePages.size,
            poolSize: this.pagePool.length,
            maxPoolSize: this.MAX_POOL_SIZE,
            launchTime: this.usageStats.launchTime ? new Date(this.usageStats.launchTime).toISOString() : 'N/A',
            lastOperationTime: this.usageStats.lastOperationTime ? new Date(this.usageStats.lastOperationTime).toISOString() : 'N/A',
            status: this.browserInstance && this.browserInstance.isConnected() ? 'connected' : 'disconnected',
            pagesInUse: Array.from(this.activePages).map(p => p.url())
        };
    }

    /**
     * @method getStatus
     * @description Provides a simplified status object suitable for agent reporting.
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
     * @description Injects JavaScript into the page's context to apply anti-detection measures.
     * @param {puppeteer.Page} page - The Puppeteer page instance to inject scripts into.
     * @returns {Promise<void>}
     */
    static async _injectStealth(page) {
        try {
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => false });
                window.chrome = { runtime: {} };
                Object.defineProperty(navigator, 'plugins', {
                    get: () => ([{ name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' }, { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbgclgcebalkgkjmrkdvm', description: 'Portable Document Format' }])
                });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
                Object.defineProperty(window.screen, 'width', { get: () => 1920 });
                Object.defineProperty(window.screen, 'height', { get: () => 1080 });
                Object.defineProperty(window.screen, 'availWidth', { get: () => 1920 });
                Object.defineProperty(window.screen, 'availHeight', { get: () => 1040 });
                Object.defineProperty(window.screen, 'colorDepth', { get: () => 24 });
                Object.defineProperty(window.screen, 'pixelDepth', { get: () => 24 });
            });
        } catch (error) {
            this._logger.warn(`Stealth injection failed for page: ${error.message}`);
        }
    }

    /**
     * @method _humanDelay
     * @description Generates a promise that resolves after a base delay plus a random jitter.
     * @param {number} min - The minimum milliseconds for the delay.
     * @param {number} max - The maximum milliseconds for the delay.
     * @returns {Promise<void>} A promise that resolves after the calculated delay.
     */
    static _humanDelay(min, max) {
        const jitter = crypto.randomInt(min, max);
        return new Promise(resolve => setTimeout(resolve, jitter));
    }
}

export default BrowserManager;
