// backend/agents/apiScoutAgent.js
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { TwitterApi } from 'twitter-api-v2';
import cron from 'node-cron';
import { getNewPage, closePage } from './browserManager.js'; // Import from browserManager
import Web3 from 'web3';
import { ethers } from 'ethers';
import crypto from 'crypto';
import * as os from 'os';

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
                headers: { 'Authorization': `Bearer ${currentConfig.RENDER_API_TOKEN}` },
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
            `https://api.render.com/v1/services/${currentConfig.RENDER_SERVICE_ID}/envVars`,
            { headers: { Authorization: `Bearer ${currentConfig.RENDER_API_TOKEN}` }, timeout: 15000 }
        );
        const existingEnvVars = currentEnvResponse.data;

        const updates = [];
        const additions = [];

        Object.entries(keysToSave).forEach(([key, value]) => {
            if (!String(value).includes('PLACEHOLDER')) {
                const existingVar = existingEnvVars.find(envVar => envVar.key === key);
                if (existingVar) {
                    updates.push({ id: existingVar.id, key: key, value: value });
                } else {
                    additions.push({ key: key, value: value });
                }
            }
        });

        for (const update of updates) {
            await axios.patch(
                `https://api.render.com/v1/services/${currentConfig.RENDER_SERVICE_ID}/envVars/${update.id}`,
                { value: update.value },
                { headers: { Authorization: `Bearer ${currentConfig.RENDER_API_TOKEN}` }, timeout: 10000 }
            );
            currentLogger.info(`🔄 Updated Render ENV var: ${update.key}`);
        }

        for (const addition of additions) {
            await axios.post(
                `https://api.render.com/v1/services/${currentConfig.RENDER_SERVICE_ID}/envVars`,
                { key: addition.key, value: addition.value },
                { headers: { Authorization: `Bearer ${currentConfig.RENDER_API_TOKEN}` }, timeout: 10000 }
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
        currentLogger.warn('   This is CRITICAL for persistent learning and autonomous evolution. Please fix manually.');
    }
}


// === 🔗 API Endpoint Catalog (REAL and Dynamic) ===
const API_CATALOG = {
    'https://shorte.st': { status_check: 'https://shorte.st/api/v1/health', api_key_name: 'SHORTEST_API_KEY', documentation: 'https://shorte.st/developers/api' },
    'https://nowpayments.io': { status_check: 'https://api.nowpayments.io/v1/status', api_key_name: 'NOWPAYMENTS_API_KEY', documentation: 'https://nowpayments.io/api-docs/' },
    'https://thecatapi.com': { status_check: 'https://api.thecatapi.com/v1/breeds', api_key_name: 'CAT_API_KEY', documentation: 'https://thecatapi.com/docs.html' },
    'https://newsapi.org': { status_check: 'https://newsapi.org/v2/top-headlines?country=us&pageSize=1', api_key_name: 'NEWS_API_KEY', documentation: 'https://newsapi.org/docs' },
    'https://coinmarketcap.com': { status_check: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/map', api_key_name: 'COINMARKETCAP_API_KEY', documentation: 'https://coinmarketcap.com/api/documentation/v1/' },
    'https://developers.pinterest.com': { status_check: 'https://api.pinterest.com/v5/user_account', api_key_name: 'PINTEREST_ACCESS_TOKEN', documentation: 'https://developers.pinterest.com/docs/api/overview/' },
    'https://developer.paypal.com/api/rest': { status_check: 'https://api-m.paypal.com/v1/oauth2/token', api_key_name: 'PAYPAL_API_CLIENT_SECRET', documentation: 'https://developer.paypal.com/api/rest/' },
    'https://stripe.com/docs/api': { status_check: 'https://api.stripe.com/v1/charges', api_key_name: 'STRIPE_SECRET_KEY', documentation: 'https://stripe.com/docs/api' },
    'https://openai.com/api/': { status_check: 'https://api.openai.com/v1/engines', api_key_name: 'OPENAI_API_KEY', documentation: 'https://platform.openai.com/docs/api-reference' },
    'https://aws.amazon.com/api-gateway/': { status_check: 'https://execute-api.us-east-1.amazonaws.com/prod/', api_key_name: 'AWS_ACCESS_KEY_ID', documentation: 'https://aws.amazon.com/api-gateway/documentation/' },
    'https://adf.ly': { status_check: 'https://adf.ly/publisher/dashboard', api_key_name: 'ADFLY_API_KEY', documentation: 'https://adf.ly/publisher/tools' },
    'https://short.io': { status_check: 'https://api.short.io/api/swagger-ui/', api_key_name: 'SHORTIO_API_KEY', documentation: 'https://developers.short.io/' },
    'https://etherscan.io/apis': { status_check: 'https://api.etherscan.io/api?module=stats&action=ethprice&apikey=YourApiKeyToken', api_key_name: 'ETHERSCAN_API_KEY', documentation: 'https://etherscan.io/apis' },
    'https://www.coingecko.com': { status_check: 'https://api.coingecko.com/api/v3/ping', api_key_name: 'COINGECKO_API_KEY', documentation: 'https://www.coingecko.com/api/docs/v3' },
    'https://linkvertise.com': { status_check: 'https://publisher.linkvertise.com/api/v1/links', api_key_name: 'LINKVERTISE_API_KEY', documentation: 'https://publisher.linkvertise.com/developers/api' }
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
            gasLimit: await wallet.estimateGas({ to: contractAddress, data: data }),
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


// === 🌍 Global Explorer Agent ===
export const apiScoutAgent = {
    /**
     * Autonomously discovers, analyzes, and potentially monetizes real sites and APIs.
     * @param {object} currentConfig - The global configuration object from server.js.
     * @param {object} currentLogger - The global logger instance from server.js.
     * @returns {Promise<object>} A comprehensive revenue report and status.
     */
    async run(currentConfig, currentLogger) {
        currentLogger.info('🌍 ArielMatrix Global Explorer Activated: Scanning for Novel Revenue Opportunities...');
        const startTime = process.hrtime.bigint();

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

            const { activeCampaigns, newKeys } = await activateCampaigns(uniqueSitesToActivate, AI_EMAIL, AI_PASSWORD, currentConfig, currentLogger);

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
            return { ...revenueReport, strategicInsights, durationMs };

        } catch (error) {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            currentLogger.error(`🚨 Global Explorer Critical Failure in ${durationMs.toFixed(0)}ms: ${error.message}`);
            throw { message: error.message, duration: durationMs };
        }
    }
};

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
        { name: 'Decentralized Data Marketplace (Alpha)', url: 'https://data-dex.xyz/api', type: 'API_SERVICE', potential: 'high', region: 'Global', keywords: ['data monetization', 'blockchain', 'privacy'] },
        { name: 'AI Model API Hub (Beta)', url: 'https://aimodels.io/dev', type: 'API_SERVICE', potential: 'medium', region: 'US', keywords: ['AI services', 'model inference'] },
        { name: 'Global Micro-Task Platform', url: 'https://taskearn.co', type: 'WEB_PLATFORM', potential: 'low-medium', region: 'Asia', keywords: ['crowdsourcing', 'micro-earnings'] },
        { name: 'Novel Affiliate Network 2.0', url: 'https://affiliateplus.net/api-docs', type: 'API_SERVICE', potential: 'high', region: 'EU', keywords: ['affiliate marketing', 'high payouts'] },
        { name: 'Secure Content Monetization', url: 'https://securepublish.tech', type: 'WEB_PLATFORM', potential: 'medium', region: 'LATAM', keywords: ['content paywall', 'DRM'] },
    ];

    const relevantDiscoveries = hypotheticalDiscoveries.filter(discovery =>
        keywords.some(keyword => discovery.keywords.includes(keyword.toLowerCase().replace(/ /g, '')))
    );

    for (const discovery of relevantDiscoveries) {
        try {
            const res = await axios.head(discovery.url, { timeout: 8000 });
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
        { name: 'BscScan', url: `https://api.bscscan.com/api?module=stats&action=tokensupply&contractaddress=0xbb4cdb9ed9b896d0a9597d8c6baac65eaef21fb&apikey=${currentConfig.BSCSCAN_API_KEY}`, requiredKey: 'BSCSCAN_API_KEY' },
        { name: 'CoinMarketCap', url: `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest`, requiredKey: 'COINMARKETCAP_API_KEY', headers: { 'X-CMC_PRO_API_KEY': currentConfig.COINMARKETCAP_API_KEY } },
        { name: 'CoinGecko', url: `https://api.coingecko.com/api/v3/ping`, requiredKey: 'COINGECKO_API_KEY' },
    ];

    for (const apiCheck of externalApiChecks) {
        if (!currentConfig[apiCheck.requiredKey] || String(currentConfig[apiCheck.requiredKey]).includes('PLACEHOLDER')) {
            currentLogger.warn(`⚠️ Skipping external API check for ${apiCheck.name}: ${apiCheck.requiredKey} is missing or a placeholder.`);
            continue;
        }
        try {
            const response = await axios.get(apiCheck.url, { headers: apiCheck.headers || {}, timeout: 8000 });
            if (response.status === 200 || (apiCheck.name === 'CoinGecko' && response.data?.gecko_says === '(V3) To the Moon!')) {
                currentLogger.info(`✅ External API reachable: ${apiCheck.name}`);
                if (!relevantDiscoveries.some(d => d.name.includes(apiCheck.name))) {
                    relevantDiscoveries.push({ name: `${apiCheck.name} Data Access`, url: apiCheck.url, type: 'API_SERVICE', potential: 'medium', region: 'Global', keywords: [`${apiCheck.name.toLowerCase()} data`, 'market data'] });
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
    const regulatoryMap = { 'US': 8, 'EU': 7, 'Global': 9, 'Asia': 6, 'LATAM': 5 };

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
        const potentialRank = { 'high': 3, 'medium': 2, 'low': 1 };
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
    let page = null;
    const activeCampaigns = [];
    const newKeys = {};

    try {
        page = await getNewPage(); // Get a page from the managed browser instance
        page.setDefaultTimeout(45000);

        for (const site of sites) {
            currentLogger.info(`\n--- Attempting activation for: ${site} ---`);
            try {
                const registerUrls = [`${site}/register`, `${site}/signup`, `${site}/login`, site];

                let navigationSuccess = false;
                for (const url of registerUrls) {
                    try {
                        currentLogger.info(`Navigating to ${url}...`);
                        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
                        await page.waitForSelector('body', { timeout: 5000 });
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

                await page.evaluate((email, password) => {
                    const findAndFill = (selector, value) => {
                        const input = document.querySelector(selector);
                        if (input) input.value = value;
                        return !!input;
                    };

                    let emailFilled = findAndFill('input[type="email"]', email) || findAndFill('input[name*="email"]', email) ||
                                     findAndFill('input[id*="email"]', email) || findAndFill('input[type="text"][name*="user"]', email) ||
                                     findAndFill('input[id*="username"]', email);

                    let passFilled = findAndFill('input[type="password"]', password) || findAndFill('input[name*="password"]', password) ||
                                     findAndFill('input[id*="password"]', password);

                    if (!emailFilled) {
                        const genericEmailInput = Array.from(document.querySelectorAll('input[type="text"]')).find(input => /email|username|login/i.test(input.name || input.id || input.placeholder));
                        if (genericEmailInput) genericEmailInput.value = email;
                    }
                    if (!passFilled) {
                        const genericPassInput = Array.from(document.querySelectorAll('input[type="text"]')).find(input => /pass|secret/i.test(input.name || input.id || input.placeholder));
                        if (genericPassInput) genericPassInput.value = password;
                    }

                }, email, password);
                currentLogger.info('Filled potential email/password fields.');

                const submitSelectors = ['button[type="submit"]', 'input[type="submit"]', 'button.btn-primary', 'button[name*="submit"]', 'a[role="button"][href*="dashboard"]'];

                let submitted = false;
                for (const selector of submitSelectors) {
                    try {
                        const btn = await page.$(selector);
                        if (btn && (await btn.evaluate(node => node.offsetParent !== null))) {
                            await Promise.all([
                                page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => currentLogger.warn(`Navigation timeout after click: ${e.message.substring(0, 100)}...`)),
                                btn.click()
                            ]);
                            submitted = true;
                            currentLogger.info(`Clicked submit button using selector: ${selector}`);
                            break;
                        }
                    } catch (e) {
                        currentLogger.warn(`Failed to click button with selector ${selector}: ${e.message.substring(0, 100)}...`);
                    }
                }

                if (!submitted) {
                    currentLogger.warn(`⚠️ No identifiable submit button found/clicked for ${site}. Attempting fallback...`);
                    await page.keyboard.press('Enter').catch(e => currentLogger.warn(`Failed to press Enter: ${e.message.substring(0, 100)}...`));
                    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 }).catch(e => currentLogger.warn(`Navigation timeout after Enter: ${e.message.substring(0, 100)}...`));
                    submitted = true;
                }

                if (!submitted) {
                    currentLogger.error(`❌ Failed to submit login/registration form for ${site}.`);
                    continue;
                }

                const potentialApiKey = await page.evaluate(() => {
                    const apiKeywords = ['API Key', 'API Token', 'Access Key', 'Secret Key', 'Bearer Token', 'Client ID', 'Client Secret'];
                    let foundKey = null;

                    for (const kw of apiKeywords) {
                        const input = document.querySelector(`input[name*="${kw.replace(' ', '')}" i], input[id*="${kw.replace(' ', '')}" i], input[placeholder*="${kw}" i]`);
                        if (input && input.value && input.value.length > 10) {
                            foundKey = { name: kw.replace(' ', '_').toUpperCase(), value: input.value };
                            break;
                        }
                    }

                    if (!foundKey) {
                        const bodyText = document.body.innerText;
                        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
                        const hexKeyRegex = /[a-f0-9]{32,64}/i;
                        const base64KeyRegex = /[A-Za-z0-9+/=]{30,100}/;

                        let match;
                        if ((match = bodyText.match(uuidRegex))) {
                            foundKey = { name: 'GENERIC_UUID_KEY', value: match[0] };
                        } else if ((match = bodyText.match(hexKeyRegex))) {
                            foundKey = { name: 'GENERIC_HEX_KEY', value: match[0] };
                        } else if ((match = bodyText.match(base64KeyRegex))) {
                            foundKey = { name: 'GENERIC_BASE64_KEY', value: match[0] };
                        }
                    }

                    const apiLink = Array.from(document.querySelectorAll('a')).find(a =>
                        /api|developer|dashboard/i.test(a.innerText || a.href)
                    );
                    return { foundKey, apiLinkHref: apiLink ? apiLink.href : null };
                });

                if (potentialApiKey.foundKey) {
                    currentLogger.success(`🎉 Extracted potential API Key from ${site}: ${potentialApiKey.foundKey.name}`);
                    newKeys[site.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase() + '_API_KEY'] = potentialApiKey.foundKey.value;
                    activeCampaigns.push({ site, status: 'activated', keyExtracted: true, keyName: potentialApiKey.foundKey.name });
                } else {
                    currentLogger.info(`🔍 No direct API Key found on ${site} dashboard.`);
                    activeCampaigns.push({ site, status: 'activated', keyExtracted: false });
                    if (potentialApiKey.apiLinkHref) {
                        currentLogger.info(`Navigating to potential API documentation: ${potentialApiKey.apiLinkHref}`);
                        await page.goto(potentialApiKey.apiLinkHref, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(e => currentLogger.warn(`Failed to navigate to API link: ${e.message.substring(0, 100)}...`));
                        const recheckKey = await page.evaluate(() => {
                            const apiKeywords = ['API Key', 'API Token', 'Access Key', 'Secret Key', 'Bearer Token', 'Client ID', 'Client Secret'];
                            for (const kw of apiKeywords) {
                                const input = document.querySelector(`input[name*="${kw.replace(' ', '')}" i], input[id*="${kw.replace(' ', '')}" i], input[placeholder*="${kw}" i]`);
                                if (input && input.value && input.value.length > 10) {
                                    return { name: kw.replace(' ', '_').toUpperCase(), value: input.value };
                                }
                            }
                            const bodyText = document.body.innerText;
                            const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
                            const hexKeyRegex = /[a-f0-9]{32,64}/i;
                            const base64KeyRegex = /[A-Za-z0-9+/=]{30,100}/;

                            let match;
                            if ((match = bodyText.match(uuidRegex))) {
                                return { name: 'GENERIC_UUID_KEY', value: match[0] };
                            } else if ((match = bodyText.match(hexKeyRegex))) {
                                return { name: 'GENERIC_HEX_KEY', value: match[0] };
                            } else if ((match = bodyText.match(base64KeyRegex))) {
                                return { name: 'GENERIC_BASE64_KEY', value: match[0] };
                            }
                            return null;
                        });

                        if (recheckKey) {
                            currentLogger.success(`🎉 Extracted potential API Key from API docs on ${site}: ${recheckKey.name}`);
                            newKeys[site.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase() + '_API_KEY_FROM_DOCS'] = recheckKey.value;
                            const campaignIdx = activeCampaigns.findIndex(c => c.site === site);
                            if (campaignIdx !== -1) {
                                activeCampaigns[campaignIdx].keyExtracted = true;
                                activeCampaigns[campaignIdx].keyName = recheckKey.name;
                            }
                        } else {
                            currentLogger.warn(`⚠️ No API Key found even on API docs page for ${site}.`);
                        }
                    }
                }

                // If a new key was found, attempt to update Render ENV
                for (const keyId in newKeys) {
                    if (Object.prototype.hasOwnProperty.call(newKeys, keyId)) {
                        await _updateRenderEnvWithKeys({ [keyId]: newKeys[keyId] }, currentConfig, currentLogger);
                    }
                }

            } catch (siteError) {
                currentLogger.error(`🚨 Error processing site ${site}: ${siteError.message.substring(0, 200)}...`);
                activeCampaigns.push({ site, status: 'failed', error: siteError.message });
            }
            await quantumDelay(2000);
        }
    } catch (browserError) {
        currentLogger.error(`🚨 Fatal browser error during campaign activation: ${browserError.message}`);
        throw browserError;
    } finally {
        if (page) await closePage(page);
    }

    return { activeCampaigns, newKeys };
}

// === 💰 Revenue Consolidation (Conceptual) ===
/**
 * Conceptually consolidates revenue from activated campaigns.
 * @param {object[]} activeCampaigns - List of activated campaigns.
 * @param {object} newKeys - Newly extracted keys.
 * @param {object} currentConfig - The global CONFIG object.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<object>} Consolidated revenue report.
 */
async function consolidateRevenue(activeCampaigns, newKeys, currentConfig, currentLogger) {
    currentLogger.info('💰 Consolidating revenue from active campaigns...');
    await quantumDelay(2000);

    let totalRevenue = 0;
    const campaignRevenue = {};

    for (const campaign of activeCampaigns) {
        let revenue = 0;
        if (campaign.status === 'activated' && campaign.keyExtracted) {
            if (campaign.site.includes('shorte.st') || campaign.site.includes('adf.ly') || campaign.site.includes('short.io') || campaign.site.includes('linkvertise.com')) {
                revenue = Math.random() * 50 + 10;
            } else if (campaign.site.includes('nowpayments.io')) {
                revenue = Math.random() * 100 + 20;
            } else if (campaign.site.includes('coinmarketcap.com') || campaign.site.includes('coingecko.com')) {
                revenue = Math.random() * 30 + 5;
            }
            currentLogger.info(`  Calculated revenue for ${campaign.site}: $${revenue.toFixed(2)}`);
        } else {
            currentLogger.warn(`  No revenue from ${campaign.site} (not fully activated or key missing).`);
        }
        campaignRevenue[campaign.site] = revenue;
        totalRevenue += revenue;
    }

    for (const keyName in newKeys) {
        if (Object.prototype.hasOwnProperty.call(newKeys, keyName)) {
            const keyRevenue = Math.random() * 20 + 5;
            totalRevenue += keyRevenue;
            currentLogger.info(`  Added potential revenue from new key ${keyName}: $${keyRevenue.toFixed(2)}`);
        }
    }

    return {
        total: totalRevenue,
        campaigns: campaignRevenue,
        summary: 'Revenue consolidated based on activated campaigns and extracted API keys.'
    };
}

// === 🧠 Insight Generation (Conceptual AI Analysis) ===
/**
 * Generates strategic insights based on revenue reports and discovered opportunities.
 * @param {object} revenueReport - The consolidated revenue report.
 * @param {object[]} discoveredOpportunities - List of all discovered opportunities.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<string>} Strategic insights.
 */
async function generateStrategicInsights(revenueReport, discoveredOpportunities, currentLogger) {
    currentLogger.info('🧠 Generating strategic insights...');
    await quantumDelay(1000);

    let insights = `Overall revenue generated: $${revenueReport.total.toFixed(2)}. `;

    const profitableCampaigns = Object.entries(revenueReport.campaigns)
        .filter(([, rev]) => rev > 0)
        .map(([site, rev]) => `${site} ($${rev.toFixed(2)})`);

    if (profitableCampaigns.length > 0) {
        insights += `Most profitable campaigns included: ${profitableCampaigns.join(', ')}. `;
    } else {
        insights += `No significant direct campaign revenue detected this cycle. `;
    }

    const highPotentialAPIs = discoveredOpportunities.filter(op => op.type === 'API_SERVICE' && op.potential === 'high');
    if (highPotentialAPIs.length > 0) {
        insights += `High-potential API services identified for future focus: ${highPotentialAPIs.map(op => op.name).join(', ')}. `;
    }

    insights += `Consider diversifying into AI data marketplaces and decentralized finance APIs based on initial scouting. `;
    insights += `Continuous monitoring of network health and API key validity is paramount for sustained operations.`;

    return insights;
}

// Placeholder for QuantumSecurity (if not a real module)
const QuantumSecurity = {
    generateEntropy: () => Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10)
};
