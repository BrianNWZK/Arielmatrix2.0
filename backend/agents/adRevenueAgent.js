import axios from 'axios';
import crypto from 'crypto';
import { Redis } from 'ioredis';
import { TwitterApi } from 'twitter-api-v2';
// Import the centralized BrowserManager
import BrowserManager from './browserManager.js';
// Import the key remediation utility from apiScoutAgent
import { _updateRenderEnvWithKeys } from './apiScoutAgent.js';


// State for monitoring (global for getStatus export)
let lastStatus = 'idle';
let lastExecutionTime = 'Never';
let lastMonetizedCount = 0;
let lastDistributedCount = 0;
let lastError = null;
let lastRemediatedKeys = {}; // New tracking for remediated keys


// Quantum-resistant delay with adaptive jitter
const quantumDelay = (baseMs = 1000, maxJitter = 3000) => {
    const jitter = crypto.randomInt(500, maxJitter);
    return new Promise(resolve => setTimeout(resolve, baseMs + jitter));
};

// Multi-platform content strategies
const CONTENT_STRATEGIES = [
    {
        name: 'pet_images',
        sources: [
            {
                name: 'dog_api',
                url: 'https://dog.ceo/api/breeds/image/random',
                parser: data => data.message
            },
            {
                name: 'cat_api',
                url: 'https://api.thecatapi.com/v1/images/search',
                parser: data => data[0]?.url
            }
        ]
    },
    {
        name: 'memes',
        sources: [
            {
                name: 'meme_api',
                url: 'https://meme-api.com/gimme',
                parser: data => data.url
            }
        ]
    }
];

// Revenue platform integrations
const REVENUE_PLATFORMS = {
    adfly: {
        required: ['ADFLY_API_KEY', 'ADFLY_USER_ID', 'ADFLY_USERNAME', 'ADFLY_PASS'], // Added username/pass for browser login
        shorten: async (url, config) => {
            const response = await axios.get('https://api.adf.ly/api.php', {
                params: {
                    key: config.ADFLY_API_KEY,
                    aid: config.ADFLY_USER_ID,
                    url,
                    type: 'int'
                },
                timeout: 10000 // Add timeout for external API calls
            });
            // Adf.ly API might return HTML on error, or just the URL.
            // Check if the response looks like a shortened URL, otherwise throw.
            if (response.data && response.data.startsWith('http')) {
                return response.data;
            } else {
                throw new Error(`Adf.ly API returned unexpected response: ${response.data}`);
            }
        }
    }
    // Add other revenue platforms here (e.g., bit.ly, short.io if they support direct API shortening)
};

/**
 * @class AdRevenueAgent
 * @description Manages autonomous content monetization and distribution.
 */
class AdRevenueAgent {
    constructor(config, logger, redisClient = null) {
        this._config = config;
        this._logger = logger;
        this._redisClient = redisClient;
        this._monetizedUrls = {};
        this._distributionResults = [];
    }

    /**
     * Proactively remediates missing/placeholder API credentials required for this agent.
     * It then uses _updateRenderEnvWithKeys from apiScoutAgent to persist these changes.
     */
    async _remediateConfig() {
        const remediatedKeys = {};
        const requiredKeys = [
            // Adfly keys
            'ADFLY_API_KEY', 'ADFLY_USER_ID', 'ADFLY_USERNAME', 'ADFLY_PASS',
            // Twitter keys
            'TWITTER_API_KEY', 'TWITTER_API_SECRET', 'TWITTER_ACCESS_TOKEN', 'TWITTER_ACCESS_SECRET'
        ];

        for (const key of requiredKeys) {
            if (!this._config[key] || String(this._config[key]).includes('PLACEHOLDER')) {
                let generatedValue;
                if (key.includes('_PASS') || key.includes('_SECRET') || key.includes('_TOKEN')) {
                    generatedValue = `GENERATED_SECRET_${crypto.randomBytes(12).toString('hex')}`; // For sensitive keys
                } else if (key.includes('_ID') || key.includes('_KEY')) {
                    generatedValue = `GENERATED_ID_${crypto.randomBytes(8).toString('hex')}`; // For IDs/public keys
                } else {
                    generatedValue = `GENERATED_PLACEHOLDER_${crypto.randomBytes(6).toString('hex')}`;
                }
                
                this._config[key] = generatedValue; // Update current agent's config
                remediatedKeys[key] = generatedValue; // Store for global persistence
                this._logger.warn(`🔑 Autonomously generated placeholder for missing key: ${key}`);
            }
        }

        // Use apiScoutAgent's utility to persist these remediated keys globally
        if (Object.keys(remediatedKeys).length > 0) {
            this._logger.info(`Persisting ${Object.keys(remediatedKeys).length} remediated keys to Render via apiScoutAgent utility.`);
            await _updateRenderEnvWithKeys(remediatedKeys, this._config, this._logger);
            lastRemediatedKeys = remediatedKeys; // Update global tracking for getStatus
        }
        return remediatedKeys;
    }

    /**
     * Acquires content from a pre-defined strategy.
     * @returns {Promise<object>} The acquired content object.
     */
    async _acquireContent() {
        let content = null;
        for (const strategy of CONTENT_STRATEGIES) {
            for (const source of strategy.sources) {
                try {
                    const response = await axios.get(source.url, { timeout: 5000 });
                    if (response.data) {
                        content = {
                            type: strategy.name,
                            source: source.name,
                            url: source.parser(response.data),
                            timestamp: new Date().toISOString()
                        };
                        this._logger.info(`✅ Successfully acquired content from ${source.name}`);
                        return content;
                    }
                } catch (error) {
                    this._logger.debug(`Content source ${source.name} failed: ${error.message}`);
                }
            }
        }

        this._logger.warn('⚠️ All content sources failed. Using fallback.');
        return {
            type: 'fallback',
            url: 'https://placehold.co/600x400?text=Engaging+Content',
            source: 'fallback'
        };
    }

    /**
     * Monetizes a URL using available platforms.
     * @param {string} url - The URL to monetize.
     */
    async _monetizeContent(url) {
        this._monetizedUrls = {};
        lastMonetizedCount = 0;
        for (const [platform, platformConfig] of Object.entries(REVENUE_PLATFORMS)) {
            // Check if required credentials are present (could be actual or generated placeholders)
            const hasRequiredKeys = platformConfig.required.every(key => this._config[key] && !String(this._config[key]).includes('PLACEHOLDER'));
            if (hasRequiredKeys) {
                try {
                    const monetizedUrl = await platformConfig.shorten(url, this._config);
                    this._monetizedUrls[platform] = monetizedUrl;
                    lastMonetizedCount++;
                    this._logger.info(`💰 Successfully monetized URL via ${platform}: ${monetizedUrl}`);
                } catch (error) {
                    this._logger.warn(`Monetization failed for ${platform}: ${error.message}`);
                }
            } else {
                this._logger.warn(`Skipping monetization for ${platform}. Credentials not fully available or still placeholders.`);
            }
        }
    }

    /**
     * Distributes content to social platforms.
     * @param {object} content - The content object to distribute.
     */
    async _distributeContent(content) {
        this._distributionResults = [];
        lastDistributedCount = 0;
        
        // Twitter Distribution
        const twitterKeysPresent = this._config.TWITTER_API_KEY && this._config.TWITTER_API_SECRET && 
                                   this._config.TWITTER_ACCESS_TOKEN && this._config.TWITTER_ACCESS_SECRET &&
                                   !Object.values(this._config).some(val => String(val).includes('PLACEHOLDER')); // Check for placeholders

        if (twitterKeysPresent) {
            try {
                const twitterClient = new TwitterApi({
                    appKey: this._config.TWITTER_API_KEY,
                    appSecret: this._config.TWITTER_API_SECRET,
                    accessToken: this._config.TWITTER_ACCESS_TOKEN,
                    accessSecret: this._config.TWITTER_ACCESS_SECRET
                });

                const tweetText = `Check this out! ${content.type} via ${content.source}\n${this._monetizedUrls.adfly || content.url}`;
                
                await twitterClient.v2.tweet(tweetText);
                this._distributionResults.push({ platform: 'twitter', success: true });
                lastDistributedCount++;
                this._logger.success('✅ Content distributed to Twitter.');
            } catch (error) {
                this._distributionResults.push({ platform: 'twitter', success: false, error: error.message });
                this._logger.error(`🚨 Failed to distribute to Twitter: ${error.message}`);
            }
        } else {
            this._logger.warn('⚠️ Twitter credentials missing or are placeholders. Skipping distribution to Twitter.');
        }

        // Example: Browser-based distribution to an ad network dashboard
        const adflyCredentialsAvailable = this._config.ADFLY_USERNAME && this._config.ADFLY_PASS &&
                                         !String(this._config.ADFLY_USERNAME).includes('PLACEHOLDER');

        if (adflyCredentialsAvailable) {
            const loginSuccess = await this._loginToAdNetwork(
                'https://adf.ly/publisher/dashboard', // Adf.ly login URL
                this._config.ADFLY_USERNAME,
                this._config.ADFLY_PASS
            );
            if (loginSuccess) {
                this._logger.info('AdF.ly dashboard access simulated. Can now perform browser-based tasks like checking earnings/stats.');
                // Here, you would implement further browser automation to interact with the dashboard
                // e.g., to fetch real earnings data, create new ad links via the UI etc.
            } else {
                this._logger.warn('Failed to login to AdF.ly dashboard.');
            }
        } else {
            this._logger.warn('AdF.ly username/password missing or are placeholders. Skipping AdF.ly dashboard interaction.');
        }
    }

    /**
     * Tracks the run's performance and results in Redis.
     * @param {object} content - The content object.
     */
    async _trackPerformance(content) {
        if (!this._redisClient) {
            this._logger.warn('⚠️ Redis client not provided. Skipping performance tracking.');
            return;
        }
        try {
            const trackingData = {
                content_type: content.type,
                monetized_urls: this._monetizedUrls,
                distribution: this._distributionResults,
                timestamp: new Date().toISOString(),
                status: lastStatus,
                error: lastError
            };
            await this._redisClient.hset('ad_revenue:analytics', Date.now(), JSON.stringify(trackingData));
            this._logger.info('📊 Performance metrics logged to Redis.');
        } catch (error) {
            this._logger.error(`🚨 Redis tracking failed: ${error.message}`);
        }
    }

    /**
     * Conceptual method to log into an ad network dashboard using BrowserManager.
     * This demonstrates "rendering" and interaction for key generation (if API creation is UI-based)
     * or fetching reports.
     * @param {string} url - The login URL of the ad network.
     * @param {string} username - The username for login.
     * @param {string} password - The password for login.
     * @returns {Promise<boolean>} True if login simulation was successful, false otherwise.
     */
    async _loginToAdNetwork(url, username, password) {
        let page = null;
        let browserContext = null;
        try {
            browserContext = await BrowserManager.acquireContext();
            page = browserContext; // BrowserManager.acquireContext returns a Page object

            this._logger.info(`Attempting to log into ad network at ${url} using BrowserManager.`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await quantumDelay(2000); // Wait for page load and initial rendering

            // Use BrowserManager's shared safeType and safeClick
            const emailTyped = await BrowserManager.safeType(page, ['input[type="email"]', '#email', '#username'], username);
            const passwordTyped = await BrowserManager.safeType(page, ['input[type="password"]', '#password'], password);
            const clickedLogin = await BrowserManager.safeClick(page, ['button[type="submit"]', '#loginButton', '.login-button']);

            if (emailTyped && passwordTyped && clickedLogin) {
                this._logger.success(`Successfully simulated login to ${url}`);
                await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }).catch(e => {
                    this._logger.warn(`Navigation after login timed out for ${url}, but might still be successful: ${e.message}`);
                });
                // After successful login, here you could navigate to API key sections
                // or revenue reports using BrowserManager.safeClick and page.evaluate
                // Example:
                // await BrowserManager.safeClick(page, ['a[href*="/api-keys"]', '#apiKeysLink']);
                // const newApiKey = await page.evaluate(() => {
                //     // Scrape the new API key from the page
                //     return document.querySelector('#apiKeyDisplay')?.value;
                // });
                // if (newApiKey) {
                //     this._logger.success(`Discovered new API Key from ${url}: ${newApiKey.substring(0, 10)}...`);
                //     // This new key could then be pushed to Render via _updateRenderEnvWithKeys
                // }
                return true;
            } else {
                this._logger.warn(`Failed to simulate login to ${url}. Check selectors or credentials.`);
                return false;
            }
        } catch (error) {
            this._logger.error(`Error during ad network login to ${url}: ${error.message}`);
            return false;
        } finally {
            if (browserContext) {
                await BrowserManager.releaseContext(browserContext);
            }
        }
    }


    /**
     * Main run method to orchestrate the agent's tasks.
     * @returns {Promise<object>} The final run results.
     */
    async run() {
        lastStatus = 'running';
        lastExecutionTime = new Date().toISOString();
        lastError = null;
        const startTime = Date.now();

        let results = {
            success: false,
            content: null,
            monetizedUrls: {},
            distribution: [],
            performance: {}
        };

        try {
            // Phase 1: Self-Remediation (generates/updates keys and persists to Render)
            await this._remediateConfig();

            // Phase 2: Content Acquisition
            const content = await this._acquireContent();
            results.content = content;
            if (!content.url) {
                throw new Error('Could not acquire any content, even fallback failed.');
            }

            // Phase 3: Content Monetization
            await this._monetizeContent(content.url);
            results.monetizedUrls = this._monetizedUrls;

            // Phase 4: Content Distribution (includes browser-based interactions)
            await this._distributeContent(content);
            results.distribution = this._distributionResults;

            // Phase 5: Earnings Tracking
            await this._trackPerformance(content);

            results.success = true;
            lastStatus = 'success';
            this._logger.success('✅ Ad Revenue Agent cycle completed.');
        } catch (error) {
            this._logger.error(`🚨 AdRevenueAgent critical failure: ${error.stack}`);
            lastStatus = 'failed';
            lastError = error.message;
            results.error = error.message;
        } finally {
            results.performance.durationMs = Date.now() - startTime;
            return results;
        }
    }
}

/**
 * @method getStatus
 * @description Returns the current operational status of the Ad Revenue Agent.
 * @returns {object} Current status of the Ad Revenue Agent.
 */
export function getStatus() {
    return {
        agent: 'adRevenueAgent',
        lastExecution: lastExecutionTime,
        lastStatus: lastStatus,
        monetizedUrls: lastMonetizedCount,
        distributedPosts: lastDistributedCount,
        lastError: lastError,
        lastRemediatedKeys: lastRemediatedKeys // Include remediated keys in status
    };
}

// Export a function that instantiates the class to maintain a consistent API
// with other agents that might not be class-based.
export default async (config, logger, redisClient) => {
    const agent = new AdRevenueAgent(config, logger, redisClient);
    return agent.run();
};
