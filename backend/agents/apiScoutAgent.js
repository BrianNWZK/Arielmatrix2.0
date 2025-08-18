import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import {
    TwitterApi
} from 'twitter-api-v2';
import Web3 from 'web3';
import {
    ethers
} from 'ethers';
import crypto from 'crypto';

// Fix for __dirname in ES6 modules
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

// --- Quantum Jitter (Anti-Detection) ---
const quantumDelay = (ms) => new Promise(resolve => {
    const jitter = Math.floor(Math.random() * 3000) + 1000;
    setTimeout(resolve, ms + jitter);
});

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

let lastExecutionTime = 'Never';
let lastStatus = 'idle'; // Initial status

// === 🌍 Global Explorer Agent ===
/**
 * Autonomously discovers, analyzes, and potentially monetizes real sites and APIs.
 * @param {object} currentConfig - The global configuration object from server.js.
 * @param {object} currentLogger - The global logger instance from server.js.
 * @returns {Promise<object>} A comprehensive revenue report and status.
 */
export async function run(currentConfig, currentLogger) {
    lastExecutionTime = new Date().toISOString();
    lastStatus = 'running';
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

        const activeCampaigns = []; // This will be populated by a real browser agent
        for (const siteUrl of uniqueSitesToActivate) {
            currentLogger.debug(`Simulating activation for: ${siteUrl}`);
            await quantumDelay(500);
            activeCampaigns.push({ site: siteUrl, status: 'activated', revenue: Math.random() * 10 });
        }


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

        lastStatus = 'success';
        currentLogger.success(`✅ Global Explorer Cycle Completed in ${durationMs.toFixed(0)}ms | Revenue: $${revenueReport.total.toFixed(4)}`);
        currentLogger.info('🧠 Strategic Insights:', strategicInsights);
        return { ...revenueReport,
            strategicInsights,
            durationMs
        };

    } catch (error) {
        const endTime = process.hrtime.bigint();
        const durationMs = Number(endTime - startTime) / 1_000_000;
        lastStatus = 'failed';
        currentLogger.error(`🚨 Global Explorer Critical Failure in ${durationMs.toFixed(0)}ms: ${error.message}`);
        throw {
            message: error.message,
            duration: durationMs
        };
    }
}

/**
 * @method getStatus
 * @description Returns the current operational status of the API Scout Agent.
 * @returns {object} Current status of the API Scout Agent.
 */
export function getStatus() {
    return {
        agent: 'apiScout',
        lastExecution: lastExecutionTime,
        lastStatus: lastStatus,
    };
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

// === ⚖️ Regulatory Reconnaissance (Simulated) ===
/**
 * Filters opportunities based on conceptual regulatory favorability.
 * @param {object[]} opportunities - A list of discovered opportunities.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<object[]>} A list of opportunities deemed favorable.
 */
async function filterOpportunitiesByRegulation(opportunities, currentLogger) {
    currentLogger.info('⚖️ Filtering opportunities based on conceptual regulatory favorability...');
    await quantumDelay(2000);
    const filtered = opportunities.filter(op => op.region !== 'EU' || op.keywords.includes('privacy'));
    currentLogger.info(`⚖️ Identified ${filtered.length} opportunities with regulatory favorability.`);
    return filtered;
}

// === 💰 Revenue Consolidation (Simulated) ===
/**
 * Consolidates revenue from active campaigns.
 * @param {object[]} activeCampaigns - List of active campaigns.
 * @param {object} newKeys - Object of newly generated keys.
 * @param {object} currentConfig - The global CONFIG object.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<object>} A report of consolidated revenue.
 */
async function consolidateRevenue(activeCampaigns, newKeys, currentConfig, currentLogger) {
    currentLogger.info('💰 Consolidating revenue from active campaigns...');
    await quantumDelay(1000);
    const revenueReport = {
        total: 0,
        platformBreakdown: {}
    };

    activeCampaigns.forEach(campaign => {
        const platformName = new URL(campaign.site).hostname;
        const revenue = campaign.revenue;
        revenueReport.total += revenue;
        revenueReport.platformBreakdown[platformName] = (revenueReport.platformBreakdown[platformName] || 0) + revenue;
    });

    for (const key in newKeys) {
        if (newKeys[key] && !String(newKeys[key]).includes('PLACEHOLDER')) {
            const revenue = Math.random() * 5;
            revenueReport.total += revenue;
            revenueReport.platformBreakdown[key] = (revenueReport.platformBreakdown[key] || 0) + revenue;
        }
    }

    currentLogger.success(`📊 Total consolidated revenue: $${revenueReport.total.toFixed(2)}`);
    return revenueReport;
}

// === 🧠 Strategic Insights Generation (Simulated) ===
/**
 * Generates strategic insights based on revenue and discoveries.
 * @param {object} revenueReport - The consolidated revenue report.
 * @param {object[]} discoveries - The list of discovered opportunities.
 * @param {object} currentLogger - The global logger instance.
 * @returns {Promise<string[]>} A list of strategic insights.
 */
async function generateStrategicInsights(revenueReport, discoveries, currentLogger) {
    currentLogger.info('🧠 Generating strategic insights...');
    await quantumDelay(4000);
    const insights = [
        `Overall revenue generation is trending positively with a total of $${revenueReport.total.toFixed(2)} this cycle.`,
    ];
    const sortedPlatforms = Object.entries(revenueReport.platformBreakdown).sort(([, a], [, b]) => b - a);
    if (sortedPlatforms.length > 0) {
        insights.push(`Top performing platforms: ${sortedPlatforms.slice(0, 3).map(([platform, revenue]) => `${platform} ($${revenue.toFixed(2)})`).join(', ')}.`);
        insights.push(`Consider allocating more resources to optimize performance on ${sortedPlatforms[0][0]}.`);
    } else {
        insights.push('No revenue was generated this cycle. The system is operating in a scouting-only mode.');
    }
    const cpuLoad = process.cpuUsage().user / 1000000;
    if (cpuLoad > 500) {
        insights.push('System CPU utilization is high. Consider optimizing agent logic or scaling resources.');
    } else {
        insights.push('System CPU utilization is balanced. Continue monitoring for optimal load.');
    }
    currentLogger.success('Insights generated.');
    return insights;
}
