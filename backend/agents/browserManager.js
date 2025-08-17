// backend/agents/browserManager.js
import puppeteer from 'puppeteer';
import crypto from 'crypto';

// === Autonomous Configuration ===
const AUTONOMY_LEVELS = {
    BASIC: 1,
    ADAPTIVE: 2, 
    FULL: 3
};

// Global browser instance management
let browserInstance = null;
const activePages = new Set();
const pagePool = [];
const MAX_POOL_SIZE = 5;

// === Core Browser Management ===
export default {
    _config: null,
    _logger: null,
    _autonomyLevel: AUTONOMY_LEVELS.BASIC,

    /**
     * Initialize browser manager with config
     */
    async init(config, logger) {
        this._config = config;
        this._logger = logger;
        this._autonomyLevel = config.autonomyLevel || AUTONOMY_LEVELS.BASIC;
        
        if (!browserInstance || !browserInstance.isConnected()) {
            browserInstance = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                ignoreDefaultArgs: ['--enable-automation']
            });
            this._logger.info('Browser instance initialized');
        }
    },

    /**
     * Get a new browser page with anti-detection measures
     */
    async getNewPage() {
        if (!browserInstance) {
            throw new Error('Browser not initialized. Call init() first.');
        }

        // Try to reuse from pool first
        if (pagePool.length > 0) {
            const page = pagePool.pop();
            await page.goto('about:blank');
            this._logger.debug('Reused page from pool');
            activePages.add(page);
            return page;
        }

        const page = await browserInstance.newPage();
        
        // Anti-detection configuration
        await page.setViewport({ width: 1280, height: 800 });
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Inject stealth scripts
        await this._injectStealth(page);
        
        activePages.add(page);
        return page;
    },

    /**
     * Close or return a page to the pool
     */
    async closePage(page) {
        if (!page || page.isClosed()) return;

        try {
            if (pagePool.length < MAX_POOL_SIZE) {
                await page.goto('about:blank');
                pagePool.push(page);
                this._logger.debug('Page returned to pool');
            } else {
                await page.close();
            }
        } catch (error) {
            this._logger.warn(`Page close failed: ${error.message}`);
        } finally {
            activePages.delete(page);
        }
    },

    /**
     * Robust element interaction methods
     */
    async safeClick(page, selectors, options = {}) {
        const timeout = options.timeout || 8000;
        const delay = options.delay || 100 + Math.random() * 200;
        
        for (const selector of Array.isArray(selectors) ? selectors : [selectors]) {
            try {
                await page.waitForSelector(selector, { timeout });
                await page.click(selector, { delay });
                return true;
            } catch (error) {
                continue;
            }
        }
        throw new Error(`All click attempts failed for selectors: ${selectors.join(', ')}`);
    },

    async safeType(page, selectors, text, options = {}) {
        const timeout = options.timeout || 8000;
        const delay = options.delay || 30 + Math.random() * 50;
        
        for (const selector of Array.isArray(selectors) ? selectors : [selectors]) {
            try {
                await page.waitForSelector(selector, { timeout });
                await page.type(selector, text, { delay });
                return true;
            } catch (error) {
                continue;
            }
        }
        throw new Error(`All type attempts failed for selectors: ${selectors.join(', ')}`);
    },

    /**
     * Cleanup all browser resources
     */
    async shutdown() {
        if (browserInstance) {
            await Promise.all(
                Array.from(activePages).map(p => p.close().catch(e => null))
            );
            await browserInstance.close();
            browserInstance = null;
            pagePool.length = 0;
            activePages.clear();
            this._logger.info('Browser manager shutdown complete');
        }
    },

    // === Internal Methods ===
    
    /**
     * Inject anti-detection scripts
     */
    async _injectStealth(page) {
        try {
            await page.evaluateOnNewDocument(() => {
                // Basic webdriver concealment
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => false
                });

                // Chrome detection
                window.chrome = {
                    runtime: {},
                    // Add other chrome properties as needed
                };

                // Plugin spoofing
                const originalPlugins = navigator.plugins;
                Object.defineProperty(navigator, 'plugins', {
                    get: () => originalPlugins || [{
                        name: 'Chrome PDF Plugin',
                        filename: 'internal-pdf-viewer'
                    }]
                });

                // Screen spoofing
                Object.defineProperty(window.screen, 'width', { get: () => 1920 });
                Object.defineProperty(window.screen, 'height', { get: () => 1080 });
            });
        } catch (error) {
            this._logger.warn(`Stealth injection failed: ${error.message}`);
        }
    },

    /**
     * Generate jittered delays
     */
    _quantumDelay(baseMs) {
        const jitter = crypto.randomInt(500, 3000);
        return new Promise(resolve => setTimeout(resolve, baseMs + jitter));
    }
};

// Process cleanup handlers
process.on('exit', async () => {
    if (browserInstance) {
        await browserInstance.close();
    }
});
