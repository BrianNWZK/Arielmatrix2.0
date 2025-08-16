// backend/agents/browserManager.js
import puppeteer from 'puppeteer'; // Ensure this import statement appears ONLY ONCE

// Global browser instance and page pool management
let browser = null;
const pagePool = [];
const MAX_PAGES = 5; // Limit the number of concurrent browser pages to manage resources

export const browserManager = {
    /**
     * Initializes the global Puppeteer browser instance.
     * This should be called once when the application starts.
     */
    init: async () => {
        if (browser) {
            console.log('Browser manager already initialized.');
            return;
        }
        console.log('Launching Puppeteer browser...');
        try {
            browser = await puppeteer.launch({
                headless: true, // Use 'new' for latest headless mode in Puppeteer v22+
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage', // Recommended for Docker/Render environments
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--single-process', // Helps with resource usage in constrained environments
                    '--disable-gpu' // Often necessary in headless environments
                ]
            });
            console.log('✅ Puppeteer browser launched successfully.');
        } catch (error) {
            console.error('🚨 Failed to launch Puppeteer browser:', error);
            throw new Error('Failed to initialize browser manager.');
        }
    },

    /**
     * Retrieves a new or recycled browser page from the pool.
     * If the pool is empty or max pages not reached, a new page is created.
     * Otherwise, an existing page is recycled.
     * @returns {Promise<puppeteer.Page>} A Puppeteer Page instance.
     */
    getNewPage: async () => {
        if (!browser) {
            throw new Error('Browser is not initialized. Call browserManager.init() first.');
        }

        let page;
        if (pagePool.length > 0) {
            page = pagePool.pop(); // Reuse an existing page from the pool
            console.log('♻️ Reusing page from pool. Pool size:', pagePool.length);
        } else if ((await browser.pages()).length < MAX_PAGES) {
            page = await browser.newPage();
            console.log('✨ Created new page. Total pages:', (await browser.pages()).length);
        } else {
            // Wait for a page to become available if max limit is reached
            console.log('⏳ Max pages reached. Waiting for a page to become available...');
            await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                    if (pagePool.length > 0) {
                        clearInterval(checkInterval);
                        page = pagePool.pop();
                        console.log('♻️ Reused page after waiting. Pool size:', pagePool.length);
                        resolve();
                    }
                }, 500); // Check every 500ms
            });
        }

        // Set default timeouts and user agent for better stealth
        if (page) {
            page.setDefaultNavigationTimeout(60000); // 60 seconds
            page.setDefaultTimeout(30000); // 30 seconds for selectors
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            console.log('Page acquired and configured.');
            return page;
        } else {
            throw new Error('Failed to acquire a browser page.');
        }
    },

    /**
     * Closes a given page and returns it to the pool if under MAX_PAGES,
     * otherwise truly closes it to manage resources.
     * @param {puppeteer.Page} page - The Puppeteer Page instance to close.
     */
    closePage: async (page) => {
        if (!page) {
            console.warn('Attempted to close a null or undefined page.');
            return;
        }

        // Check if the page is still active and not already closed
        if (!page.isClosed()) {
            if (pagePool.length < MAX_PAGES) {
                console.log('Adding page back to pool. Pool size:', pagePool.length + 1);
                pagePool.push(page); // Add back to pool
            } else {
                try {
                    await page.close();
                    console.log('Page closed to manage resources.');
                } catch (error) {
                    console.warn('⚠️ Error closing page:', error.message);
                }
            }
        } else {
            console.log('Page was already closed.');
        }
    },

    /**
     * Closes the global browser instance and cleans up.
     * This should be called when the application is gracefully shutting down.
     */
    closeGlobalBrowserInstance: async () => {
        if (browser) {
            console.log('Closing global browser instance...');
            try {
                // Close all pages in the pool first
                while (pagePool.length > 0) {
                    const page = pagePool.pop();
                    if (!page.isClosed()) {
                        await page.close();
                    }
                }
                await browser.close();
                browser = null; // Reset browser instance
                browserManagerInitialized = false; // Reset initialization flag
                console.log('✅ Global browser instance closed.');
            } catch (error) {
                console.error('🚨 Error closing global browser instance:', error);
            }
        } else {
            console.log('No browser instance to close.');
        }
    },

    /**
     * Reports a navigation failure to the browser manager for potential re-initialization logic.
     * (Currently logs, but could trigger more advanced self-healing or re-init).
     */
    reportNavigationFailure: () => {
        console.warn('🚨 Browser navigation failure detected. Consider re-evaluating browser state or re-initializing.');
        // In a more advanced system, this could trigger:
        // - A specific counter to track persistent failures
        // - Conditional re-initialization of the browser after X failures
        // - Notifications for manual intervention
    }
};
