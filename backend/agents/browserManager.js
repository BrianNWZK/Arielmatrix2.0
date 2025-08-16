// backend/agents/browserManager.js
import puppeteer from 'puppeteer-extra'; // Use puppeteer-extra for stealth features
import StealthPlugin from 'puppeteer-extra-plugin-stealth'; // Import the stealth plugin

puppeteer.use(StealthPlugin()); // Register the stealth plugin to avoid bot detection

// Global browser instance and page pool management
let browser = null;
const pagePool = [];
const MAX_PAGES = 5; // Limit the number of concurrent browser pages to manage resources

/**
 * Custom robust click function. Tries multiple selectors and XPath for text content.
 * Handles common issues with dynamic content and anti-bot measures.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 * @param {string[]} selectors - An array of CSS selectors or XPath expressions (starting with //) to try.
 * Can also include `:contains("text")` for text matching in CSS selectors.
 * @returns {Promise<boolean>} True if click was successful, false otherwise.
 */
const safeClick = async (page, selectors) => {
    for (const selector of selectors) {
        try {
            // Try standard CSS selector first
            let element = await page.waitForSelector(selector.trim(), { timeout: 8000 });
            if (element) {
                await element.click();
                return true;
            }
        } catch (e) {
            // If CSS selector fails, try XPath for text content if the selector looks like it's trying to match text
            if (selector.includes(':contains(') || selector.startsWith('//')) {
                 console.log(`Attempting XPath for "${selector.trim()}"`);
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
                     xpathSelector = `//*[contains(text(),'${selector}')]/ancest ancestor-or-self::*[self::button or self::a or self::input or self::div][1]`;
                 }

                 try {
                    const [xpathElement] = await page.waitForXPath(xpathSelector, { timeout: 8000 });
                    if (xpathElement) {
                        await xpathElement.click();
                        return true;
                    }
                 } catch (xpathError) {
                     console.warn(`XPath click for "${selector.trim()}" failed: ${xpathError.message.substring(0, 50)}...`);
                 }
            }
            console.warn(`Click selector "${selector.trim()}" failed: ${e.message.substring(0, 50)}... Trying next.`);
            continue;
        }
    }
    throw new Error(`All click selectors failed.`);
};

/**
 * Custom robust type function. Tries multiple selectors for input/textarea elements.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 * @param {string[]} selectors - An array of CSS selectors or XPath expressions (starting with //) for the input field.
 * Can also include `:contains("text")` for text matching in associated labels/placeholders.
 * @param {string} text - The text to type into the element.
 * @returns {Promise<boolean>} True if typing was successful, false otherwise.
 */
const safeType = async (page, selectors, text) => {
    for (const selector of selectors) {
        try {
            // Try standard CSS selector first
            let element = await page.waitForSelector(selector.trim(), { timeout: 6000 });
            if (element) {
                await element.click(); // Focus on the element
                await page.keyboard.down('Control'); // Select all existing text (Ctrl+A)
                await page.keyboard.press('A');
                await page.keyboard.up('Control');
                await page.keyboard.press('Delete'); // Delete existing text
                await page.type(selector.trim(), text, { delay: 50 }); // Type with human-like delay
                return true;
            }
        } catch (e) {
            // If CSS selector fails, try XPath for input elements that might be found by label text or placeholder
            if (selector.includes(':contains(') || selector.startsWith('//')) {
                console.log(`Attempting XPath for typing in "${selector.trim()}"`);
                const match = selector.match(/:contains\(['"]([^'"]+)['"]\)/);
                const textToFind = match ? match[1] : null;

                let xpathSelector;
                if (textToFind) {
                    // Find input/textarea associated with a label containing the text, or by placeholder
                    xpathSelector = `//label[contains(text(),'${textToFind}')]/following-sibling::*[self::input or self::textarea][1] | //input[contains(@placeholder,'${textToFind}')] | //textarea[contains(@placeholder,'${textToFind}')] | //*[contains(@aria-label,'${textToFind}') and (self::input or self::textarea or self::div[@role='textbox'])]`;
                } else if (selector.startsWith('//')) {
                    xpathSelector = selector;
                } else {
                    // Fallback for general selectors potentially matching name/id/placeholder attributes
                    xpathSelector = `//input[contains(@name,'${selector}') or contains(@id,'${selector}') or contains(@placeholder,'${selector}') or contains(@aria-label,'${selector}')] | //textarea[contains(@name,'${selector}') or contains(@id,'${selector}') or contains(@placeholder,'${selector}') or contains(@aria-label,'${selector}')] | //div[contains(@name,'${selector}') or contains(@id,'${selector}') or contains(@placeholder,'${selector}') or contains(@aria-label,'${selector}')][@role='textbox']`;
                }

                try {
                    const [xpathElement] = await page.waitForXPath(xpathSelector, { timeout: 6000 });
                    if (xpathElement) {
                        await xpathElement.click(); // Focus
                        await page.keyboard.down('Control');
                        await page.keyboard.press('A');
                        await page.keyboard.up('Control');
                        await page.keyboard.press('Delete');
                        await xpathElement.type(text, { delay: 50 });
                        return true;
                    }
                } catch (xpathError) {
                    console.warn(`XPath type for "${selector.trim()}" failed: ${xpathError.message.substring(0, 50)}...`);
                }
            }
            console.warn(`Type selector "${selector.trim()}" failed: ${e.message.substring(0, 50)}... Trying next.`);
            continue;
        }
    }
    throw new Error(`All type selectors failed for text: "${text.substring(0, 20)}..."`);
};


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
                headless: true,
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
            // Attempt setUserAgentOverride, but catch if it times out
            try {
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            } catch (uaError) {
                console.warn(`⚠️ Failed to set User-Agent: ${uaError.message}. This might be a Puppeteer/Chromium bug or environment issue, continuing without it.`);
            }
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
                // browserManagerInitialized = false; // This flag is managed by server.js
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
    },

    // Export the new safe functions
    safeClick,
    safeType
};
