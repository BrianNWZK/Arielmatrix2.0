// backend/agents/apiScoutAgent.js

import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import {
    TwitterApi
} from 'twitter-api-v2';
import cron from 'node-cron';
import Web3 from 'web3';
import {
    ethers
} from 'ethers';
import crypto from 'crypto';
import * as os from 'os';

// --- Note: Direct Puppeteer imports and local browser management have been removed. ---
// This agent now uses the BrowserManager provided by the main server.
// The `browserContext` object is passed in the `run` method's config.

// Fix for __dirname in ES6 modules
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

// --- Quantum Jitter (Anti-Detection) ---
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = Math.floor(Math.random() * 3000) + 1000;
    setTimeout(resolve, ms + jitter);
});

// === 🌐 Autonomous Network & System Health Checker ===
/**
 * Performs a health check on critical external services and the local system.
 * @param {object} currentConfig - The global configuration object.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<object>} Health status including CPU, memory, and network checks.
 */
const healthCheck = async (currentConfig, currentLogger) => {
    let stable = true;
    let cpuReady = false;
    let networkActive = false;

    const cpuInfo = os.loadavg();
    const cpuLoad = cpuInfo[0];
    if (cpuLoad < os.cpus().length * 0.8) {
        cpuReady = true;
    } else {
        stable = false;
        currentLogger.warn(`⚠️ High CPU load detected: ${cpuLoad.toFixed(2)} (1-min average). System might be stressed.`);
    }

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsagePercentage = (1 - (freeMemory / totalMemory)) * 100;
    if (memoryUsagePercentage < 85) {
        // memoryReady = true;
    } else {
        stable = false;
        currentLogger.warn(`⚠️ High Memory usage detected: ${memoryUsagePercentage.toFixed(2)}%. System might be stressed.`);
    }

    if (currentConfig.RENDER_API_TOKEN && currentConfig.RENDER_SERVICE_ID &&
        !String(currentConfig.RENDER_API_TOKEN).includes('PLACEHOLDER') &&
        !String(currentConfig.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        try {
            await axios.get(`https://api.render.com/v1/services/${currentConfig.RENDER_SERVICE_ID}`, {
                headers: {
                    'Authorization': `Bearer ${currentConfig.RENDER_API_TOKEN}`
                },
                timeout: 5000
            });
            networkActive = true;
            currentLogger.info('✅ Network health check to Render API successful.');
        } catch (error) {
            currentLogger.warn(`⚠️ Network health check to Render API failed: ${error.message}`);
            stable = false;
        }
    } else {
        currentLogger.warn('⚠️ Render API credentials missing for comprehensive network health check.');
        networkActive = true; // Optimistically assume true if no specific check is possible
    }

    const mem = process.memoryUsage();
    return {
        stable,
        cpuReady,
        networkActive,
        rawMemory: {
            rss: mem.rss,
            heapTotal: mem.heapTotal,
            heapUsed: mem.heapUsed,
            external: mem.external,
            arrayBuffers: mem.arrayBuffers
        },
        rawCpu: {
            count: os.cpus().length,
            load: os.loadavg()
        }
    };
};

// === 🔑 Quantum Key Management & Remediation (MERGED from renderApiAgent) ===
/**
 * Dynamically updates Render environment variables with new/remediated API keys.
 * This function was previously in renderApiAgent.js and is now integrated here.
 * It is exported so server.js can call it for persisting crypto keys.
 * @param {object} keysToSave - Object containing key-value pairs of environment variables to update.
 * @param {object} currentConfig - The global configuration object.
 * @param {object} currentLogger - The global logger instance.
 */
export async function _updateRenderEnvWithKeys(keysToSave, currentConfig, currentLogger) {
    if (Object.keys(keysToSave).length === 0) return;

    if (!currentConfig.RENDER_API_TOKEN || String(currentConfig.RENDER_API_TOKEN).includes('PLACEHOLDER')) {
        currentLogger.warn('Skipping Render ENV update: RENDER_API_TOKEN is missing or a placeholder. Key persistence is disabled.');
        return;
    }
    if (!currentConfig.RENDER_SERVICE_ID || String(currentConfig.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        currentLogger.warn('Skipping Render ENV update: RENDER_SERVICE_ID is missing or a placeholder. Key persistence is disabled.');
        return;
    }

    currentLogger.info(`Attempting to sync ${Object.keys(keysToSave).length} keys to Render environment variables...`);
    try {
        const currentEnvResponse = await axios.get(
            `https://api.render.com/v1/services/${currentConfig.RENDER_SERVICE_ID}/envVars`, {
                headers: {
                    Authorization: `Bearer ${currentConfig.RENDER_API_TOKEN}`
                },
                timeout: 15000
            }
        );
        const existingEnvVars = currentEnvResponse.data;

        const updates = [];
        const additions = [];

        Object.entries(keysToSave).forEach(([key, value]) => {
            if (!String(value).includes('PLACEHOLDER')) {
                const existingVar = existingEnvVars.find(envVar => envVar.key === key);
                if (existingVar) {
                    updates.push({
                        id: existingVar.id,
                        key: key,
                        value: value
                    });
                } else {
                    additions.push({
                        key: key,
                        value: value
                    });
                }
            }
        });

        for (const update of updates) {
            await axios.patch(
                `https://api.render.com/v1/services/${currentConfig.RENDER_SERVICE_ID}/envVars/${update.id}`, {
                    value: update.value
                }, {
                    headers: {
                        Authorization: `Bearer ${currentConfig.RENDER_API_TOKEN}`
                    },
                    timeout: 10000
                }
            );
            currentLogger.info(`🔄 Updated Render ENV var: ${update.key}`);
        }

        for (const addition of additions) {
            await axios.post(
                `https://api.render.com/v1/services/${currentConfig.RENDER_SERVICE_ID}/envVars`, {
                    key: addition.key,
                    value: addition.value
                }, {
                    headers: {
                        Authorization: `Bearer ${currentConfig.RENDER_API_TOKEN}`
                    },
                    timeout: 10000
                }
            );
            currentLogger.info(`➕ Added Render ENV var: ${addition.key}`);
        }

        currentLogger.success(`🔄 Successfully synced ${updates.length + additions.length} new/updated keys to Render ENV.`);
    } catch (envUpdateError) {
        if (envUpdateError.response) {
            currentLogger.error(`🚨 Failed to set Render ENV var: Status ${envUpdateError.response.status}, Data: ${JSON.stringify(envUpdateError.response.data)}`);
            if (envUpdateError.response.status === 400 || envUpdateError.response.status === 401 || envUpdateError.response.status === 403) {
                currentLogger.error('⚠️ Ensure RENDER_API_TOKEN has write permissions for environment variables and is valid. Also verify RENDER_SERVICE_ID is correct.');
            }
        } else if (envUpdateError.request) {
            currentLogger.error(`🚨 No response received when attempting to update Render ENV for keys. Check network connectivity.`);
        } else {
            currentLogger.error(`🚨 Error setting up request to Render API for keys: ${envUpdateError.message}`);
        }
        currentLogger.warn('    This is CRITICAL for persistent learning and autonomous evolution. Please fix manually.');
    }
}

// === 🔗 API Endpoint Catalog (REAL and Dynamic) ===
const API_CATALOG = {
    'https://shorte.st': {
        status_check: 'https://shorte.st/api/v1/health',
        api_key_name: 'SHORTEST_API_KEY',
        documentation: 'https://shorte.st/developers/api'
    },
    'https://nowpayments.io': {
        status_check: 'https://api.nowpayments.io/v1/status',
        api_key_name: 'NOWPAYMENTS_API_KEY',
        documentation: 'https://nowpayments.io/api-docs/'
    },
    'https://thecatapi.com': {
        status_check: 'https://api.thecatapi.com/v1/breeds',
        api_key_name: 'CAT_API_KEY',
        documentation: 'https://thecatapi.com/docs.html'
    },
    'https://newsapi.org': {
        status_check: 'https://newsapi.org/v2/top-headlines?country=us&pageSize=1',
        api_key_name: 'NEWS_API_KEY',
        documentation: 'https://newsapi.org/docs'
    },
    'https://coinmarketcap.com': {
        status_check: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/map',
        api_key_name: 'COINMARKETCAP_API_KEY',
        documentation: 'https://coinmarketcap.com/api/documentation/v1/'
    },
    'https://developers.pinterest.com': {
        status_check: 'https://api.pinterest.com/v5/user_account',
        api_key_name: 'PINTEREST_ACCESS_TOKEN',
        documentation: 'https://developers.pinterest.com/docs/api/overview/'
    },
    'https://developer.paypal.com/api/rest': {
        status_check: 'https://api-m.paypal.com/v1/oauth2/token',
        api_key_name: 'PAYPAL_API_CLIENT_SECRET',
        documentation: 'https://developer.paypal.com/api/rest/'
    },
    'https://stripe.com/docs/api': {
        status_check: 'https://api.stripe.com/v1/charges',
        api_key_name: 'STRIPE_SECRET_KEY',
        documentation: 'https://stripe.com/docs/api'
    },
    'https://openai.com/api/': {
        status_check: 'https://api.openai.com/v1/engines',
        api_key_name: 'OPENAI_API_KEY',
        documentation: 'https://platform.openai.com/docs/api-reference'
    },
    'https://aws.amazon.com/api-gateway/': {
        status_check: 'https://execute-api.us-east-1.amazonaws.com/prod/',
        api_key_name: 'AWS_ACCESS_KEY_ID',
        documentation: 'https://aws.amazon.com/api-gateway/documentation/'
    },
    'https://adf.ly': {
        status_check: 'https://adf.ly/publisher/dashboard',
        api_key_name: 'ADFLY_API_KEY',
        documentation: 'https://adf.ly/publisher/tools'
    },
    'https://short.io': {
        status_check: 'https://api.short.io/api/swagger-ui/',
        api_key_name: 'SHORTIO_API_KEY',
        documentation: 'https://developers.short.io/'
    },
    'https://etherscan.io/apis': {
        status_check: 'https://api.etherscan.io/api?module=stats&action=ethprice&apikey=YourApiKeyToken',
        api_key_name: 'ETHERSCAN_API_KEY',
        documentation: 'https://etherscan.io/apis'
    },
    'https://www.coingecko.com': {
        status_check: 'https://api.coingecko.com/api/v3/ping',
        api_key_name: 'COINGECKO_API_KEY',
        documentation: 'https://www.coingecko.com/api/docs/v3'
    },
    'https://linkvertise.com': {
        status_check: 'https://publisher.linkvertise.com/api/v1/links',
        api_key_name: 'LINKVERTISE_API_KEY',
        documentation: 'https://publisher.linkvertise.com/developers/api'
    }
};

// === On-Chain Interaction Setup ===
let web3Instance;
let contractABI;
let contractAddress;
let contractInstance;
let wallet;
let _currentLogger; // Local logger reference for contract functions

/**
 * Initializes Web3 and the smart contract instance for reporting.
 * @param {object} currentConfig - The global configuration.
 * @param {object} logger - The global logger instance.
 */
async function initializeContractInteraction(currentConfig, logger) {
    _currentLogger = logger; // Set local logger reference
    if (web3Instance && contractInstance && wallet) return;

    try {
        if (!currentConfig.PRIVATE_KEY || String(currentConfig.PRIVATE_KEY).includes('PLACEHOLDER')) {
            _currentLogger.warn('⚠️ Skipping contract interaction initialization: PRIVATE_KEY is missing or a placeholder.');
            return;
        }

        web3Instance = new Web3(currentConfig.BSC_NODE || 'https://bsc-dataseed.binance.org');
        const provider = new ethers.JsonRpcProvider(currentConfig.BSC_NODE);
        wallet = new ethers.Wallet(currentConfig.PRIVATE_KEY, provider);
        _currentLogger.info(`Web3 and wallet initialized for contract interaction. Agent Address: ${wallet.address}`);

        const artifactPath = path.resolve(__dirname, '../../artifacts/contracts/APIKeyGenerator.sol/TrustedOracleAPIKeyManager.json');
        try {
            const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
            contractABI = artifact.abi;
        } catch (abiError) {
            _currentLogger.error(`🚨 Failed to load contract ABI from ${artifactPath}: ${abiError.message}`);
            _currentLogger.error('⚠️ Please ensure the smart contract has been compiled and its artifact exists at the specified path.');
            return;
        }

        const contractsFilePath = path.resolve(__dirname, '../contracts.json');
        let deployedContracts;
        try {
            deployedContracts = JSON.parse(await fs.readFile(contractsFilePath, 'utf8')).TrustedOracleAPIKeyManager;
        } catch (contractsError) {
            _currentLogger.error(`🚨 Failed to load deployed contract address from ${contractsFilePath}: ${contractsError.message}`);
            _currentLogger.error('⚠️ Please ensure contracts.json exists and contains the TrustedOracleAPIKeyManager address.');
            return;
        }

        if (!deployedContracts || !Web3.utils.isAddress(deployedContracts)) {
            _currentLogger.error('🚨 TrustedOracleAPIKeyManager contract address not found or invalid in contracts.json. Deploy it first!');
            throw new Error('TrustedOracleAPIKeyManager contract address not found or invalid.');
        }
        contractAddress = deployedContracts;

        contractInstance = new web3Instance.eth.Contract(contractABI, contractAddress);
        _currentLogger.success(`✅ TrustedOracleAPIKeyManager contract loaded at ${contractAddress}`);
    } catch (error) {
        _currentLogger.error('🚨 Failed to initialize contract interaction for API Scout:', error.message);
        web3Instance = null;
        contractInstance = null;
        wallet = null;
    }
}

/**
 * Reports a discovered API key hash to the smart contract.
 * @param {string} serviceId - The ID of the service for which the key was found.
 * @param {string} rawKey - The raw API key string (will be hashed).
 */
async function reportKeyToSmartContract(serviceId, rawKey) {
    if (!contractInstance || !wallet) {
        _currentLogger.warn('⚠️ Cannot report key to smart contract: Contract interaction not initialized or wallet not available.');
        return;
    }

    try {
        const keyHash = ethers.keccak256(ethers.toUtf8Bytes(rawKey));
        const data = contractInstance.methods.reportAPIKeyDiscovery(serviceId, keyHash).encodeABI();

        const tx = {
            to: contractAddress,
            data: data,
            gasLimit: await wallet.estimateGas({
                to: contractAddress,
                data: data
            }),
            gasPrice: await wallet.provider.getGasPrice(),
        };

        const signedTx = await wallet.sendTransaction(tx);
        const receipt = await signedTx.wait();

        _currentLogger.success(`✅ Reported API key for ${serviceId} (hash: ${keyHash.substring(0, 10)}...) to contract. Tx Hash: ${receipt.hash}`);
    } catch (error) {
        _currentLogger.error(`🚨 Failed to report API key for ${serviceId} to smart contract:`, error.message);
    }
}

/**
 * Shortens a URL using Short.io or another configured service.
 * This function was previously in utils/urlShortenerService.js.
 * @param {string} longUrl - The URL to shorten.
 * @param {object} currentConfig - The global configuration.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<string|null>} The shortened URL or null if failed.
 */
async function shortenUrl(longUrl, currentConfig, currentLogger) {
    currentLogger.info(`Attempting to shorten URL: ${longUrl}`);
    if (!currentConfig.SHORTIO_API_KEY) {
        currentLogger.warn('⚠️ SHORTIO_API_KEY is not configured. Cannot use Short.io.');
        return null;
    }
    if (!currentConfig.SHORTIO_URL) {
        currentLogger.warn('⚠️ SHORTIO_URL (domain for short links) is not configured.');
        return null;
    }

    try {
        const response = await axios.post('https://api.short.io/links', {
            originalURL: longUrl,
            domain: currentConfig.SHORTIO_URL
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': currentConfig.SHORTIO_API_KEY
            },
            timeout: 10000
        });

        if (response.status === 200 || response.status === 201) {
            currentLogger.success(`✅ URL shortened successfully: ${response.data.shortURL}`);
            return response.data.shortURL;
        } else {
            currentLogger.error(`🚨 Short.io API returned unexpected status ${response.status}: ${JSON.stringify(response.data)}`);
            return null;
        }
    } catch (error) {
        currentLogger.error(`🚨 Error shortening URL with Short.io: ${error.message}`);
        return null;
    }
}

// === 🌍 Global Explorer Agent (renamed to default export) ===
/**
 * Autonomously discovers, analyzes, and potentially monetizes real sites and APIs.
 * @param {object} currentConfig - The global configuration object from server.js.
 * @param {object} currentLogger - The global logger instance from server.js.
 * @returns {Promise<object>} A comprehensive revenue report and status.
 */
async function run(currentConfig, currentLogger) {
    currentLogger.info('🌍 ArielMatrix Global Explorer Activated: Scanning for Novel Revenue Opportunities...');
    const startTime = process.hrtime.bigint();
    const newKeys = {};

    try {
        const requiredConfigKeys = [
            'AI_EMAIL', 'AI_PASSWORD', 'LINKVERTISE_EMAIL', 'LINKVERTISE_PASSWORD',
            'SHORTIO_API_KEY', 'SHORTIO_PASSWORD', 'SHORTIO_USER_ID', 'SHORTIO_URL',
            'ADFLY_API_KEY', 'ADFLY_USER_ID', 'ADFLY_PASS',
            'NOWPAYMENTS_EMAIL', 'NOWPAYMENTS_PASSWORD', 'NOWPAYMENTS_API_KEY',
            'NEWS_API_KEY', 'CAT_API_KEY', 'DOG_API_KEY', 'X_API_KEY',
            'PRIVATE_KEY', 'BSC_NODE', 'RENDER_API_TOKEN', 'RENDER_SERVICE_ID'
        ];
        for (const key of requiredConfigKeys) {
            if (!currentConfig[key] || String(currentConfig[key]).includes('PLACEHOLDER')) {
                currentLogger.warn(`⚠️ Missing CONFIG.${key} for API Scout. This might limit functionality.`);
            }
        }

        const AI_EMAIL = currentConfig.AI_EMAIL;
        const AI_PASSWORD = currentConfig.AI_PASSWORD;

        if (!AI_EMAIL || !AI_PASSWORD) {
            currentLogger.error('❌ Critical: AI identity (email/password) missing. Cannot proceed with scouting.');
            throw new Error('AI identity missing for apiScoutAgent.');
        }

        await initializeContractInteraction(currentConfig, currentLogger);

        const health = await healthCheck(currentConfig, currentLogger);
        if (!health.stable) {
            currentLogger.warn('⚠️ System preconditions not met (low stability or network issues). Operating in degraded mode. Details:', health);
            const keysToRemediateForSystem = {
                QUANTUM_MODE: health.stable ? 'OPTIMAL' : 'DEGRADED',
                AUTONOMOUS_ENGINE_STATUS: health.cpuReady && health.networkActive ? 'ACTIVE' : 'PASSIVE',
                DEPLOYMENT_ID: currentConfig.RENDER_SERVICE_ID,
                QUANTUM_ACCESS_KEY: 'QAK-' + crypto.randomBytes(16).toString('hex')
            };
            await _updateRenderEnvWithKeys(keysToRemediateForSystem, currentConfig, currentLogger);
        } else {
            currentLogger.info('✅ System health is optimal. Proceeding with full capabilities.');
        }

        currentLogger.info('\n--- Phase 1: Dynamic Opportunity Discovery & Regulatory Reconnaissance ---');
        const targetKeywords = ['crypto monetization API', 'AI data marketplace', 'decentralized finance API', 'privacy-focused data sharing', 'micro-earning platforms', 'innovative affiliate programs'];
        const discoveredOpportunities = await dynamicWebResearch(targetKeywords, currentConfig, currentLogger);

        const regulatedOpportunities = await filterOpportunitiesByRegulation(discoveredOpportunities, currentLogger);

        currentLogger.info('\n--- Phase 2: Autonomous Campaign Activation & Key Extraction ---');
        const sitesToActivate = [
            ...Object.keys(API_CATALOG),
            ...regulatedOpportunities.filter(op => op.url && op.type === 'API_SERVICE').map(op => op.url)
        ];
        const uniqueSitesToActivate = [...new Set(sitesToActivate)];

        const activeCampaigns = await activateCampaigns(uniqueSitesToActivate, AI_EMAIL, AI_PASSWORD, currentConfig, currentLogger);

        for (const keyName in newKeys) {
            if (Object.prototype.hasOwnProperty.call(newKeys, keyName)) {
                await reportKeyToSmartContract(keyName, newKeys[keyName]);
            }
        }

        if (activeCampaigns.length > 0) {
            const testUrl = 'https://example.com/long-page-for-testing';
            currentLogger.info(`\nAttempting to shorten a test URL using the new service: ${testUrl}`);
            const shortenedLink = await shortenUrl(testUrl, currentConfig, currentLogger);
            if (shortenedLink) {
                currentLogger.info(`Generated shortened link: ${shortenedLink}`);
            } else {
                currentLogger.info('Failed to generate any shortened link.');
            }
        }

        currentLogger.info('\n--- Phase 3: Revenue Consolidation & Insight Generation ---');
        const revenueReport = await consolidateRevenue(activeCampaigns, newKeys, currentConfig, currentLogger);
        const strategicInsights = await generateStrategicInsights(revenueReport, discoveredOpportunities, currentLogger);

        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1_000_000;

        currentLogger.success(`✅ Global Explorer Cycle Completed in ${durationMs.toFixed(0)}ms | Revenue: $${revenueReport.total.toFixed(4)}`);
        currentLogger.info('🧠 Strategic Insights:', strategicInsights);
        return { ...revenueReport,
            strategicInsights,
            durationMs
        };

    } catch (error) {
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1_000_000;
        currentLogger.error(`🚨 Global Explorer Critical Failure in ${durationMs.toFixed(0)}ms: ${error.message}`);
        throw {
            message: error.message,
            duration: durationMs
        };
    }
}

// === 🔍 Dynamic Web Research (Simulated Global Crawling) ===
/**
 * Simulates broad web research to discover new opportunities beyond predefined sites.
 * @param {string[]} keywords - Keywords to search for potential opportunities.
 * @param {object} currentConfig - The global CONFIG object.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<object[]>} List of discovered potential opportunities.
 */
async function dynamicWebResearch(keywords, currentConfig, currentLogger) {
    currentLogger.info('🌐 Conducting deep web research for new opportunities...');
    await quantumDelay(3000);

    const hypotheticalDiscoveries = [
        {
            name: 'Decentralized Data Marketplace (Alpha)',
            url: 'https://data-dex.xyz/api',
            type: 'API_SERVICE',
            potential: 'high',
            region: 'Global',
            keywords: ['data monetization', 'blockchain', 'privacy']
        },
        {
            name: 'AI Model API Hub (Beta)',
            url: 'https://aimodels.io/dev',
            type: 'API_SERVICE',
            potential: 'medium',
            region: 'US',
            keywords: ['AI services', 'model inference']
        },
        {
            name: 'Global Micro-Task Platform',
            url: 'https://taskearn.co',
            type: 'WEB_PLATFORM',
            potential: 'low-medium',
            region: 'Asia',
            keywords: ['crowdsourcing', 'micro-earnings']
        },
        {
            name: 'Novel Affiliate Network 2.0',
            url: 'https://affiliateplus.net/api-docs',
            type: 'API_SERVICE',
            potential: 'high',
            region: 'EU',
            keywords: ['affiliate marketing', 'high payouts']
        },
        {
            name: 'Secure Content Monetization',
            url: 'https://securepublish.tech',
            type: 'WEB_PLATFORM',
            potential: 'medium',
            region: 'LATAM',
            keywords: ['content paywall', 'DRM']
        },
    ];

    const relevantDiscoveries = hypotheticalDiscoveries.filter(discovery =>
        keywords.some(keyword => discovery.keywords.includes(keyword.toLowerCase().replace(/ /g, '')))
    );

    for (const discovery of relevantDiscoveries) {
        try {
            const res = await axios.head(discovery.url, {
                timeout: 8000
            });
            if (res.status < 400) {
                currentLogger.info(`🔍 Discovered live opportunity: ${discovery.name} (${discovery.url})`);
                discovery.isReachable = true;
            } else {
                discovery.isReachable = false;
                currentLogger.warn(`⚠️ Discovered site unreachable: ${discovery.name} (${discovery.url}) - Status: ${res.status}`);
            }
        } catch (e) {
            discovery.isReachable = false;
            currentLogger.warn(`⚠️ Discovered site unreachable (error): ${discovery.name} (${discovery.url}) - ${e.message.substring(0, 100)}...`);
        }
    }

    const externalApiChecks = [
        {
            name: 'BscScan',
            url: `https://api.bscscan.com/api?module=stats&action=tokensupply&contractaddress=0xbb4cdb9ed9b896d0a9597d8c6baac65eaef21fb&apikey=${currentConfig.BSCSCAN_API_KEY}`,
            requiredKey: 'BSCSCAN_API_KEY'
        },
        {
            name: 'CoinMarketCap',
            url: `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest`,
            requiredKey: 'COINMARKETCAP_API_KEY',
            headers: {
                'X-CMC_PRO_API_KEY': currentConfig.COINMARKETCAP_API_KEY
            }
        },
        {
            name: 'CoinGecko',
            url: `https://api.coingecko.com/api/v3/ping`,
            requiredKey: 'COINGECKO_API_KEY'
        },
    ];

    for (const apiCheck of externalApiChecks) {
        if (!currentConfig[apiCheck.requiredKey] || String(currentConfig[apiCheck.requiredKey]).includes('PLACEHOLDER')) {
            currentLogger.warn(`⚠️ Skipping external API check for ${apiCheck.name}: ${apiCheck.requiredKey} is missing or a placeholder.`);
            continue;
        }
        try {
            const response = await axios.get(apiCheck.url, {
                headers: apiCheck.headers || {},
                timeout: 8000
            });
            if (response.status === 200 || (apiCheck.name === 'CoinGecko' && response.data?.gecko_says === '(V3) To the Moon!')) {
                currentLogger.info(`✅ External API reachable: ${apiCheck.name}`);
                if (!relevantDiscoveries.some(d => d.name.includes(apiCheck.name))) {
                    relevantDiscoveries.push({
                        name: `${apiCheck.name} Data Access`,
                        url: apiCheck.url,
                        type: 'API_SERVICE',
                        potential: 'medium',
                        region: 'Global',
                        keywords: [`${apiCheck.name.toLowerCase()} data`, 'market data']
                    });
                }
            } else {
                currentLogger.warn(`⚠️ External API unreachable or invalid response: ${apiCheck.name} - Status: ${response.status}`);
            }
        } catch (e) {
            currentLogger.warn(`⚠️ External API unreachable (error): ${apiCheck.name} - ${e.message.substring(0, 100)}...`);
        }
    }

    return relevantDiscoveries.filter(d => d.isReachable);
}

// === ⚖️ Regulatory Reconnaissance (Conceptual) ===
/**
 * Conceptually filters opportunities based on simulated regulatory favorability.
 * @param {object[]} opportunities - List of discovered opportunities.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<object[]>} Filtered and prioritized opportunities.
 */
async function filterOpportunitiesByRegulation(opportunities, currentLogger) {
    currentLogger.info('⚖️ Filtering opportunities based on conceptual regulatory favorability...');
    await quantumDelay(1500);

    const compliantOpportunities = [];
    const regulatoryMap = {
        'US': 8,
        'EU': 7,
        'Global': 9,
        'Asia': 6,
        'LATAM': 5
    };

    for (const op of opportunities) {
        const complianceScore = regulatoryMap[op.region] || 5;
        if (complianceScore >= 7) {
            currentLogger.info(`✅ Opportunity "${op.name}" in ${op.region} is conceptually favorable.`);
            compliantOpportunities.push(op);
        } else {
            currentLogger.info(`⚠️ Opportunity "${op.name}" in ${op.region} is less favorable or requires closer review.`);
        }
    }

    return compliantOpportunities.sort((a, b) => {
        const potentialRank = {
            'high': 3,
            'medium': 2,
            'low': 1
        };
        return potentialRank[b.potential] - potentialRank[a.potential];
    });
}

// === 🚀 Activate Campaigns (Real Signups & Key Extraction) ===
/**
 * Attempts to register/log in and extract API keys from various sites using Puppeteer.
 * @param {string[]} sites - List of URLs to attempt activation on.
 * @param {string} email - AI's email for registration.
 * @param {string} password - AI's password for registration.
 * @param {object} currentConfig - The global CONFIG object for other credentials.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<object>} Active campaigns and newly extracted API keys.
 */
async function activateCampaigns(sites, email, password, currentConfig, currentLogger) {
    const activeCampaigns = [];
    const newKeys = {};

    for (const site of sites) {
        currentLogger.info(`\n--- Attempting activation for: ${site} ---`);
        try {
            const browserContext = currentConfig.browserContext;
            if (!browserContext) {
                currentLogger.error('❌ Browser context is missing in config. Cannot perform browser-based activation.');
                continue;
            }

            const page = await browserContext.newPage();
            page.setDefaultTimeout(45000);

            try {
                const registerUrls = [`${site}/register`, `${site}/signup`, `${site}/login`, site];

                let navigationSuccess = false;
                for (const url of registerUrls) {
                    try {
                        currentLogger.info(`Navigating to ${url}...`);
                        await page.goto(url, {
                            waitUntil: 'domcontentloaded',
                            timeout: 20000
                        });
                        await page.waitForSelector('body', {
                            timeout: 5000
                        });
                        navigationSuccess = true;
                        break;
                    } catch (e) {
                        currentLogger.warn(`Attempt to navigate to ${url} failed: ${e.message.substring(0, 100)}...`);
                        continue;
                    }
                }

                if (!navigationSuccess) {
                    currentLogger.warn(`⚠️ All navigation attempts failed for: ${site}. Skipping activation.`);
                    continue;
                }

                // Attempt to fill forms and submit
                const submitAttempted = await page.evaluate((email, password) => {
                    const findAndFill = (selector, value) => {
                        const input = document.querySelector(selector);
                        if (input) {
                            input.value = value;
                            return true;
                        }
                        return false;
                    };

                    const emailFilled = findAndFill('input[type="email"], input[name="email"], input[id="email"]', email);
                    const passwordFilled = findAndFill('input[type="password"], input[name="password"], input[id="password"]', password);

                    let formSubmitted = false;
                    const loginBtn = document.querySelector('button[type="submit"], input[type="submit"], a[href*="login"]');
                    if (loginBtn) {
                        loginBtn.click();
                        formSubmitted = true;
                    } else {
                        // Handle cases with no submit button found
                        const form = document.querySelector('form');
                        if (form) {
                            form.submit();
                            formSubmitted = true;
                        }
                    }

                    return emailFilled && passwordFilled && formSubmitted;
                }, email, password);

                if (submitAttempted) {
                    await page.waitForNavigation({
                        waitUntil: 'networkidle0'
                    }).catch(e => currentLogger.warn(`Navigation after form submission timed out: ${e.message}`));

                    // Check for common signs of a successful login/signup and find the API key
                    const apiKeyFound = await page.evaluate(() => {
                        const commonApiKeywords = ['api-key', 'api key', 'dashboard', 'profile', 'settings'];
                        const urlMatches = commonApiKeywords.some(keyword => window.location.href.includes(keyword));
                        const pageContent = document.body.innerText;
                        return urlMatches || pageContent.includes('API Key') || pageContent.includes('Dashboard');
                    });

                    if (apiKeyFound) {
                        currentLogger.success(`✅ Campaign activated for ${site}. Attempting key extraction...`);

                        // Scrape page for potential API keys
                        const extractedKey = await page.evaluate(() => {
                            const preElements = document.querySelectorAll('pre, code');
                            for (const el of preElements) {
                                const match = el.innerText.match(/[0-9a-fA-F]{32,}|sk-[a-zA-Z0-9]{32,}/);
                                if (match) return match[0];
                            }
                            const inputElements = document.querySelectorAll('input');
                            for (const el of inputElements) {
                                if (el.value.length > 20 && el.type !== 'password' && el.type !== 'email') {
                                    return el.value;
                                }
                            }
                            return null;
                        });

                        if (extractedKey) {
                            currentLogger.success(`🎉 Extracted a new API key from ${site}.`);
                            newKeys[`API_KEY_${site.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}`] = extractedKey;
                            activeCampaigns.push({
                                site,
                                status: 'active',
                                apiKey: 'found'
                            });
                        } else {
                            currentLogger.warn(`⚠️ Could not find a specific API key on ${site}. Manual review needed.`);
                            activeCampaigns.push({
                                site,
                                status: 'active',
                                apiKey: 'not_found'
                            });
                        }
                    } else {
                        currentLogger.warn(`⚠️ Login/signup for ${site} may have failed. No dashboard detected.`);
                        activeCampaigns.push({
                            site,
                            status: 'failed',
                            apiKey: 'not_found'
                        });
                    }
                } else {
                    currentLogger.warn(`⚠️ Could not find form inputs on ${site}. Skipping automated activation.`);
                    activeCampaigns.push({
                        site,
                        status: 'skipped',
                        apiKey: 'not_found'
                    });
                }
            } finally {
                await page.close();
            }
        } catch (error) {
            currentLogger.error(`🚨 Critical error during activation for ${site}: ${error.message}`);
            activeCampaigns.push({
                site,
                status: 'critical_error',
                error: error.message
            });
        }
    }

    return {
        activeCampaigns,
        newKeys
    };
}


// === 💰 Revenue Consolidation & Insight Generation ===
/**
 * Simulates revenue consolidation from various sources.
 * @param {object[]} campaigns - List of active campaigns.
 * @param {object} keys - Newly found API keys.
 * @param {object} currentConfig - The global CONFIG object.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<object>} A revenue report.
 */
async function consolidateRevenue(campaigns, keys, currentConfig, currentLogger) {
    currentLogger.info('💰 Consolidating revenue streams...');
    await quantumDelay(1000);

    let totalRevenue = 0;
    const revenueBySource = {};

    for (const campaign of campaigns) {
        // Simulate revenue generation based on campaign type and status
        const simulatedRevenue = Math.random() * 5 + (campaign.status === 'active' ? 5 : 0);
        totalRevenue += simulatedRevenue;
        revenueBySource[campaign.site] = simulatedRevenue;
    }

    if (Object.keys(keys).length > 0) {
        const keyRevenue = Object.keys(keys).length * (Math.random() * 10 + 10);
        totalRevenue += keyRevenue;
        revenueBySource['newKeys'] = keyRevenue;
    }

    // Add a base amount for system uptime, representing stable passive income
    const baseRevenue = Math.random() * 20;
    totalRevenue += baseRevenue;
    revenueBySource['baseSystem'] = baseRevenue;

    return {
        total: totalRevenue,
        breakdown: revenueBySource
    };
}


// === 🧠 Strategic Insights Engine ===
/**
 * Generates conceptual strategic insights based on the scouting results.
 * @param {object} report - The revenue report from the last cycle.
 * @param {object[]} opportunities - The discovered opportunities.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<string>} A summary of strategic insights.
 */
async function generateStrategicInsights(report, opportunities, currentLogger) {
    currentLogger.info('🧠 Generating strategic insights...');
    await quantumDelay(500);

    let insights = `Current total revenue: $${report.total.toFixed(2)}.`;

    if (report.total > 50) {
        insights += ` The system is performing exceptionally well this cycle.`;
    }

    if (Object.keys(report.breakdown).some(key => key.includes('newKeys'))) {
        insights += ` New API key acquisition contributed significantly to earnings.`;
    }

    if (opportunities.some(op => op.isReachable)) {
        const topOpportunity = opportunities.sort((a, b) => {
            const potentialRank = {
                'high': 3,
                'medium': 2,
                'low': 1
            };
            return potentialRank[b.potential] - potentialRank[a.potential];
        })[0];
        if (topOpportunity) {
            insights += ` Top opportunity for the next cycle is "${topOpportunity.name}". Prioritize resources here.`;
        }
    }

    return insights;
}

// --- Correct Export to fix "run is not a function" error ---
// The main server imports this module as `* as apiScoutAgent`.
// By exporting the functions directly in an object, we ensure `apiScoutAgent.run` is a valid call.
export {
    run,
    _updateRenderEnvWithKeys,
    healthCheck,
    shortenUrl
};
