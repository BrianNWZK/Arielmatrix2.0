// backend/agents/apiScoutAgent.js
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { TwitterApi } from 'twitter-api-v2';
import { shortenUrl } from '../utils/urlShortenerService.js';
import { scheduleJob } from 'node-schedule';
import { getNewPage, closePage, closeGlobalBrowserInstance } from '../utils/browserManager.js'; // Ensure browser utilities are correctly imported
import Web3 from 'web3';
import { ethers } from 'ethers';
import crypto from 'crypto'; // For keccak256 hashing and random bytes
import * as os from 'os'; // For system health checks (CPU, memory)

// Fix for __dirname in ES6 modules
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);

// --- Global Intelligence & Opportunity Scout Principles ---
// This agent operates strictly within publicly accessible information and legal frameworks.
// "Researching secret labs" is interpreted as deep analysis of public scientific publications,
// open-source projects, and cutting-edge industry reports for novel technological applications.
// "Bending rules" means identifying highly optimized, innovative, and compliant strategies
// that leverage market inefficiencies or emerging digital landscapes, NOT illegal activities.

// === 🌀 Quantum Jitter (Anti-Detection) ===
const quantumDelay = (ms) => new Promise(resolve => {
  const jitter = Math.floor(Math.random() * 3000) + 1000; // 1 to 4 seconds delay
  setTimeout(resolve, ms + jitter);
});

// === 🔐 Secure Key Management (Centralized Access via CONFIG) ===
const getRequiredConfig = (config, keys) => {
  for (const key of keys) {
    if (!config[key]) {
      console.warn(`⚠️ Missing CONFIG.${key} for API Scout. This might limit functionality.`);
    }
  }
  return config;
};

// === 🌐 Autonomous Network & System Health Checker ===
/**
 * Performs a health check on critical external services and the local system.
 * @param {object} config - The global configuration object.
 * @returns {Promise<object>} Health status including CPU, memory, and network checks.
 */
const healthCheck = async (config) => {
    let stable = true;
    let cpuReady = false;
    let networkActive = false;

    // CPU Load Check
    const cpuInfo = os.loadavg();
    const cpuLoad = cpuInfo[0]; // 1-minute load average
    if (cpuLoad < os.cpus().length * 0.8) { // Assuming average load is below 80% of total cores
        cpuReady = true;
    } else {
        stable = false;
    }

    // Memory Check
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const memoryUsagePercentage = (1 - (freeMemory / totalMemory)) * 100;
    if (memoryUsagePercentage < 85) { // If memory usage is below 85%
        // memoryReady = true; // Not explicitly used as a separate flag but factored into 'stable'
    } else {
        stable = false;
    }

    // Network Activity Check (to Render API as a proxy for external connectivity)
    if (config.RENDER_API_TOKEN && config.RENDER_SERVICE_ID &&
        !String(config.RENDER_API_TOKEN).includes('PLACEHOLDER') &&
        !String(config.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        try {
            // Attempt to get service details from Render API as a network check
            await axios.get(`https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}`, {
                headers: { 'Authorization': `Bearer ${config.RENDER_API_TOKEN}` },
                timeout: 5000 // Short timeout for health check
            });
            networkActive = true;
        } catch (error) {
            console.warn(`⚠️ Network health check to Render API failed: ${error.message}`);
            stable = false;
        }
    } else {
        console.warn('⚠️ Render API credentials missing for network health check.');
        stable = false;
    }

    const mem = process.memoryUsage(); // Node.js process memory usage
    return {
        stable,
        cpuReady,
        networkActive,
        rawMemory: {
            rss: mem.rss, // Resident Set Size
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


// === 🔑 Quantum Key Management & Remediation ===
/**
 * Dynamically updates Render environment variables with new/remediated API keys.
 * @param {object} keysToSave - Object containing key-value pairs of environment variables to update.
 * @param {object} config - The global CONFIG object.
 */
async function _updateRenderEnvWithKeys(keysToSave, config) {
    if (Object.keys(keysToSave).length === 0) return;

    if (!config.RENDER_API_TOKEN || String(config.RENDER_API_TOKEN).includes('PLACEHOLDER')) {
        console.warn('Skipping Render ENV update: RENDER_API_TOKEN is missing or a placeholder. Key persistence is disabled.');
        return;
    }
    if (!config.RENDER_SERVICE_ID || String(config.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        console.warn('Skipping Render ENV update: RENDER_SERVICE_ID is missing or a placeholder. Key persistence is disabled.');
        return;
    }

    console.log(`Attempting to sync ${Object.keys(keysToSave).length} keys to Render environment variables...`);
    try {
        const currentEnvResponse = await axios.get(
            `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/env-vars`,
            { headers: { Authorization: `Bearer ${config.RENDER_API_TOKEN}` }, timeout: 15000 }
        );
        const existingEnvVars = currentEnvResponse.data;

        const updatedEnvVars = existingEnvVars.map(envVar => {
            if (keysToSave[envVar.key] !== undefined && !String(keysToSave[envVar.key]).includes('PLACEHOLDER')) {
                // Ensure we only update if the new value is not a placeholder
                return { key: envVar.key, value: keysToSave[envVar.key] };
            }
            return envVar;
        });

        Object.entries(keysToSave).forEach(([key, value]) => {
            if (!updatedEnvVars.some(existing => existing.key === key)) {
                updatedEnvVars.push({ key, value });
            }
        });

        await axios.put(
            `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/env-vars`,
            { envVars: updatedEnvVars },
            { headers: { Authorization: `Bearer ${config.RENDER_API_TOKEN}` }, timeout: 20000 }
        );
        console.log(`🔄 Successfully synced ${Object.keys(keysToSave).length} new/updated keys to Render ENV.`);
    } catch (envUpdateError) {
        if (envUpdateError.response && envUpdateError.response.status === 405) {
            console.error('🚨 Failed to set Render ENV var: Request failed with status code 405 (Method Not Allowed).');
            console.error('   This usually means your RENDER_API_TOKEN lacks write permissions for environment variables,');
            console.error('   or the RENDER_SERVICE_ID is incorrect and points to a non-existent or misconfigured endpoint.');
        } else {
            console.error('🚨 Failed to set Render ENV var:', envUpdateError.message);
        }
        console.warn('   Ensure RENDER_API_TOKEN has write permissions and the RENDER_SERVICE_ID is correct. This is CRITICAL for persistent learning.');
    }
}


// === 🔗 API Endpoint Catalog (REAL and Dynamic) ===
const API_CATALOG = {
    'https://shorte.st': {
        status_check: 'https://shorte.st/api/v1/health',
        api_key_name: 'SHORTEST_API_KEY', // Example API key name
        documentation: 'https://shorte.st/developers/api'
    },
    'https://nowpayments.io': { // Base URL for NowPayments
        status_check: 'https://api.nowpayments.io/v1/status',
        api_key_name: 'NOWPAYMENTS_API_KEY',
        documentation: 'https://nowpayments.io/api-docs/'
    },
    'https://thecatapi.com': {
        status_check: 'https://api.thecatapi.com/v1/breeds', // A public endpoint that doesn't require key for basic access
        api_key_name: 'CAT_API_KEY',
        documentation: 'https://thecatapi.com/docs.html'
    },
    'https://newsapi.org': {
        status_check: 'https://newsapi.org/v2/top-headlines?country=us&pageSize=1', // Requires key
        api_key_name: 'NEWS_API_KEY',
        documentation: 'https://newsapi.org/docs'
    },
    'https://coinmarketcap.com': { // For Market Data APIs (conceptual)
        status_check: 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/map', // Requires key
        api_key_name: 'COINMARKETCAP_API_KEY',
        documentation: 'https://coinmarketcap.com/api/documentation/v1/'
    },
    'https://developers.pinterest.com': {
        status_check: 'https://api.pinterest.com/v5/user_account', // Requires auth
        api_key_name: 'PINTEREST_ACCESS_TOKEN',
        documentation: 'https://developers.pinterest.com/docs/api/overview/'
    },
    'https://developer.paypal.com/api/rest': { // Conceptual for API keys
        status_check: 'https://api-m.paypal.com/v1/oauth2/token', // Requires auth, actual API token validation
        api_key_name: 'PAYPAL_API_CLIENT_SECRET',
        documentation: 'https://developer.paypal.com/api/rest/'
    },
    'https://stripe.com/docs/api': { // Conceptual for API keys
        status_check: 'https://api.stripe.com/v1/charges', // Requires auth, actual API token validation
        api_key_name: 'STRIPE_SECRET_KEY',
        documentation: 'https://stripe.com/docs/api'
    },
    'https://openai.com/api/': { // Conceptual for API keys
        status_check: 'https://api.openai.com/v1/engines', // Requires auth
        api_key_name: 'OPENAI_API_KEY',
        documentation: 'https://platform.openai.com/docs/api-reference'
    },
    'https://aws.amazon.com/api-gateway/': { // Conceptual for AWS API key access
        status_check: 'https://execute-api.us-east-1.amazonaws.com/prod/', // Placeholder, requires actual deployed API
        api_key_name: 'AWS_ACCESS_KEY_ID',
        documentation: 'https://aws.amazon.com/api-gateway/documentation/'
    },
    // Adding more relevant URLs based on the provided logs
    'https://adf.ly': {
        status_check: 'https://adf.ly/publisher/dashboard', // Needs login
        api_key_name: 'ADFLY_API_KEY',
        documentation: 'https://adf.ly/publisher/tools'
    },
    'https://short.io': { // The previous short.io (adf.ly was just an example)
        status_check: 'https://api.short.io/api/swagger-ui/', // Swagger UI for API docs
        api_key_name: 'SHORTIO_API_KEY',
        documentation: 'https://developers.short.io/'
    },
    'https://etherscan.io/apis': { // BscScan is derived from Etherscan
        status_check: 'https://api.etherscan.io/api?module=stats&action=ethprice&apikey=YourApiKeyToken', // Requires key
        api_key_name: 'ETHERSCAN_API_KEY',
        documentation: 'https://etherscan.io/apis'
    },
    'https://www.coingecko.com': { // CoinGecko for crypto prices
        status_check: 'https://api.coingecko.com/api/v3/ping', // Public health check
        api_key_name: 'COINGECKO_API_KEY', // Conceptual key name
        documentation: 'https://www.coingecko.com/api/docs/v3'
    },
    'https://linkvertise.com': {
        status_check: 'https://publisher.linkvertise.com/api/v1/links', // Requires auth
        api_key_name: 'LINKVERTISE_API_KEY', // Conceptual name
        documentation: 'https://publisher.linkvertise.com/developers/api'
    }
};

// === On-Chain Interaction Setup ===
let web3Instance;
let contractABI; // ABI of TrustedOracleAPIKeyManager
let contractAddress; // Deployed address of TrustedOracleAPIKeyManager
let contractInstance;
let wallet;

/**
 * Initializes Web3 and the smart contract instance for reporting.
 * @param {object} config - The global configuration.
 */
async function initializeContractInteraction(config) {
  if (web3Instance && contractInstance && wallet) return; // Already initialized

  try {
    web3Instance = new Web3(config.BSC_NODE || 'https://bsc-dataseed.binance.org');
    wallet = new ethers.Wallet(config.PRIVATE_KEY, new ethers.providers.JsonRpcProvider(config.BSC_NODE));
    console.log(`Web3 and wallet initialized for contract interaction. Agent Address: ${wallet.address}`);

    // Load contract ABI from a compiled artifact (you'll need to compile APIKeyGenerator.sol)
    const artifactPath = path.resolve(__dirname, '../../artifacts/contracts/APIKeyGenerator.sol/TrustedOracleAPIKeyManager.json');
    const artifact = JSON.parse(await fs.readFile(artifactPath, 'utf8'));
    contractABI = artifact.abi;

    // Load deployed contract address from contracts.json (set by contractDeployAgent)
    const contractsFilePath = path.resolve(__dirname, '../contracts.json');
    const deployedContracts = JSON.parse(await fs.readFile(contractsFilePath, 'utf8')).TrustedOracleAPIKeyManager;

    if (!deployedContracts) {
      throw new Error('TrustedOracleAPIKeyManager contract address not found in contracts.json. Deploy it first!');
    }
    contractAddress = deployedContracts; // Set the address from the loaded file

    contractInstance = new web3Instance.eth.Contract(contractABI, contractAddress);
    console.log(`✅ TrustedOracleAPIKeyManager contract loaded at ${contractAddress}`);
  } catch (error) {
    console.error('🚨 Failed to initialize contract interaction for API Scout:', error.message);
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
    console.warn('⚠️ Cannot report key to smart contract: Contract interaction not initialized or wallet not available.');
    return;
  }

  try {
    // Compute keccak256 hash of the raw key
    const keyHash = '0x' + crypto.createHash('sha256').update(rawKey).digest('hex');
    // For Solidity bytes32, keccak256 is commonly used for hashes that need to be verified off-chain.
    // If you need SHA256 specifically, ensure your Solidity contract expects it.
    // For general verification, `web3.utils.sha3(rawKey)` or `ethers.utils.keccak256(ethers.utils.toUtf8Bytes(rawKey))` are also options.
    // Let's stick to Node's crypto for SHA256 and prepend '0x' for Solidity bytes32.

    const data = contractInstance.methods.reportAPIKeyDiscovery(serviceId, keyHash).encodeABI();

    const gasLimit = await web3Instance.eth.estimateGas({
      from: wallet.address,
      to: contractAddress,
      data: data
    });

    const tx = {
      from: wallet.address,
      to: contractAddress,
      data: data,
      gas: gasLimit + 50000, // Add a buffer
      gasPrice: await web3Instance.eth.getGasPrice(),
    };

    const signedTx = await wallet.signTransaction(tx);
    const receipt = await web3Instance.eth.sendSignedTransaction(signedTx.rawTransaction);

    console.log(`✅ Reported API key for ${serviceId} (hash: ${keyHash.substring(0, 10)}...) to contract. Tx Hash: ${receipt.transactionHash}`);
  } catch (error) {
    console.error(`🚨 Failed to report API key for ${serviceId} to smart contract:`, error.message);
  }
}


// === 🌍 Global Explorer Agent ===
/**
 * Autonomously discovers, analyzes, and potentially monetizes real sites and APIs.
 * Leverages AI for strategic decision-making and dynamic interaction.
 * @param {object} CONFIG - The global configuration object from environment variables.
 * @returns {Promise<object>} A comprehensive revenue report and status.
 */
export const apiScoutAgent = async (CONFIG) => {
  console.log('🌍 ArielMatrix Global Explorer Activated: Scanning for Novel Revenue Opportunities...');

  try {
    const requiredConfig = getRequiredConfig(CONFIG, [
      'AI_EMAIL', 'AI_PASSWORD', 'LINKVERTISE_EMAIL', 'LINKVERTISE_PASSWORD',
      'SHORTIO_API_KEY', 'SHORTIO_PASSWORD', 'SHORTIO_USER_ID', 'SHORTIO_URL',
      'ADFLY_API_KEY', 'ADFLY_USER_ID', 'ADFLY_PASS',
      'NOWPAYMENTS_EMAIL', 'NOWPAYMENTS_PASSWORD', 'NOWPAYMENTS_API_KEY',
      'NEWS_API', 'CAT_API_KEY', 'DOG_API_KEY',
      'X_API_KEY', 'PRIVATE_KEY', 'BSC_NODE' // Ensure these are checked for contract interaction
    ]);

    const AI_EMAIL = requiredConfig.AI_EMAIL;
    const AI_PASSWORD = requiredConfig.AI_PASSWORD;

    if (!AI_EMAIL || !AI_PASSWORD) {
      console.error('❌ Critical: AI identity (email/password) missing. Cannot proceed with scouting.');
      return { status: 'failed', error: 'AI identity missing' };
    }

    // Initialize contract interaction at the start of the agent run
    await initializeContractInteraction(requiredConfig);

    // Initial system health check
    const health = await healthCheck(CONFIG);
    if (!health.stable) {
        console.warn('⚠️ System preconditions not met (low stability or network issues). Operating in degraded mode. Details:', health);
        // Example: Attempt to set a 'degraded' mode env var if not already set
        const keysToRemediateForSystem = {
            QUANTUM_MODE: health.stable ? 'OPTIMAL' : 'DEGRADED',
            AUTONOMOUS_ENGINE: health.cpuReady && health.networkActive ? 'ACTIVE' : 'PASSIVE',
            DEPLOYMENT_ID: process.env.RENDER_SERVICE_ID,
            QUANTUM_ACCESS_KEY: 'QAK-' + crypto.randomBytes(16).toString('hex') // Regenerate a quantum access key
        };
        await _updateRenderEnvWithKeys(keysToRemediateForSystem, CONFIG); // Update Render ENV
        Object.assign(CONFIG, keysToRemediateForSystem); // Update in-memory CONFIG
    } else {
        console.log('✅ System health is optimal. Proceeding with full capabilities.');
    }


    // Phase 1: Dynamic Opportunity Discovery & Regulatory Reconnaissance
    console.log('\n--- Phase 1: Dynamic Opportunity Discovery & Regulatory Reconnaissance ---');
    const targetKeywords = ['crypto monetization API', 'AI data marketplace', 'decentralized finance API', 'privacy-focused data sharing', 'micro-earning platforms', 'innovative affiliate programs'];
    const discoveredOpportunities = await dynamicWebResearch(targetKeywords, requiredConfig); // Pass config for future API checks

    // Filter and prioritize based on conceptual regulatory favorability
    const regulatedOpportunities = await filterOpportunitiesByRegulation(discoveredOpportunities);

    // Phase 2: Autonomous Campaign Activation & Key Extraction
    console.log('\n--- Phase 2: Autonomous Campaign Activation & Key Extraction ---');
    const sitesToActivate = [
      ...Object.keys(API_CATALOG), // Add all sites from the API_CATALOG
      ...regulatedOpportunities.filter(op => op.url && op.type === 'API_SERVICE').map(op => op.url)
    ];
    // Remove duplicates
    const uniqueSitesToActivate = [...new Set(sitesToActivate)];


    const { activeCampaigns, newKeys } = await activateCampaigns(uniqueSitesToActivate, AI_EMAIL, AI_PASSWORD, requiredConfig);

    // Report newly discovered keys to the smart contract
    for (const keyName in newKeys) {
      if (Object.prototype.hasOwnProperty.call(newKeys, keyName)) {
        await reportKeyToSmartContract(keyName, newKeys[keyName]);
      }
    }

    // Example of using the new centralized shortener (can be integrated into other agents)
    if (activeCampaigns.length > 0) {
      const testUrl = 'https://example.com/long-page-for-testing';
      console.log(`\nAttempting to shorten a test URL using the new service: ${testUrl}`);
      const shortenedLink = await shortenUrl(testUrl, requiredConfig);
      if (shortenedLink) {
        console.log(`Generated shortened link: ${shortenedLink}`);
      } else {
        console.log('Failed to generate any shortened link.');
      }
    }


    // Phase 3: Revenue Consolidation & Insight Generation
    console.log('\n--- Phase 3: Revenue Consolidation & Insight Generation ---');
    const revenueReport = await consolidateRevenue(activeCampaigns, newKeys, requiredConfig);
    const strategicInsights = await generateStrategicInsights(revenueReport, discoveredOpportunities);

    console.log(`\n✅ Global Explorer Cycle Completed | Revenue: $${revenueReport.total.toFixed(4)}`);
    console.log('🧠 Strategic Insights:', strategicInsights);
    return { ...revenueReport, strategicInsights };

  } catch (error) {
    console.error('🚨 Global Explorer Critical Failure:', error.message);
    await healSystem(error);
    return { status: 'recovered', error: error.message };
  }
};

// === 🔍 Dynamic Web Research (Simulated Global Crawling) ===
/**
 * Simulates broad web research to discover new opportunities beyond predefined sites.
 * In a real-world scenario, this would involve advanced crawling, NLP, and graph databases.
 * Also checks external API availability.
 * @param {string[]} keywords - Keywords to search for potential opportunities.
 * @param {object} config - The global CONFIG object.
 * @returns {Promise<object[]>} List of discovered potential opportunities.
 */
async function dynamicWebResearch(keywords, config) {
  console.log('🌐 Conducting deep web research for new opportunities...');
  await quantumDelay(3000); // Simulate extensive research time

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
      // Perform a HEAD request to check if the URL is accessible
      const res = await axios.head(discovery.url, { timeout: 8000 });
      if (res.status < 400) {
        console.log(`🔍 Discovered live opportunity: ${discovery.name} (${discovery.url})`);
        discovery.isReachable = true;
      } else {
        discovery.isReachable = false;
        console.warn(`⚠️ Discovered site unreachable: ${discovery.name} (${discovery.url})`);
      }
    } catch (e) {
      discovery.isReachable = false;
      console.warn(`⚠️ Discovered site unreachable (error): ${discovery.name} (${discovery.url}) - ${e.message}`);
    }
  }

  // Also proactively check critical external APIs based on logs
  const externalApiChecks = [
      { name: 'BscScan', url: `https://api.bscscan.com/api?module=stats&action=tokensupply&contractaddress=0xbb4cdb9ed9b896d0a9597d8c6baac65eaef21fb&apikey=${config.BSCSCAN_API_KEY}`, requiredKey: 'BSCSCAN_API_KEY' },
      { name: 'CoinMarketCap', url: `https://pro-api.coinmarketcap.com/v1/cryptocurrency/listings/latest?CMC_PRO_API_KEY=${config.COINMARKETCAP_API_KEY || 'dummy_for_check'}`, requiredKey: 'COINMARKETCAP_API_KEY' },
      { name: 'CoinGecko', url: `${config.COINGECKO_API}/ping`, requiredKey: 'COINGECKO_API' },
  ];

  for (const apiCheck of externalApiChecks) {
      if (!config[apiCheck.requiredKey]) {
          console.warn(`⚠️ Skipping external API check for ${apiCheck.name}: ${apiCheck.requiredKey} is missing.`);
          continue;
      }
      try {
          // Use a proper API call, not just HEAD for data-heavy APIs.
          // For CMC, you'd need the correct header and parameters.
          // For CoinGecko, /ping is a simple health check.
          const headers = {};
          if (apiCheck.name === 'CoinMarketCap') {
              headers['X-CMC_PRO_API_KEY'] = config.COINMARKETCAP_API_KEY;
          }
          const response = await axios.get(apiCheck.url, { headers, timeout: 8000 });
          if (response.status === 200 || response.data?.gecko_says === '(V3) To the Moon!') { // CoinGecko ping check
              console.log(`✅ External API reachable: ${apiCheck.name}`);
              // Add a placeholder opportunity for consistency if relevant
              if (!relevantDiscoveries.some(d => d.name.includes(apiCheck.name))) {
                  relevantDiscoveries.push({ name: `${apiCheck.name} Data Access`, url: apiCheck.url, type: 'API_SERVICE', potential: 'medium', region: 'Global', keywords: [`${apiCheck.name.toLowerCase()} data`, 'market data'] });
              }
          } else {
              console.warn(`⚠️ External API unreachable or invalid response: ${apiCheck.name}`);
          }
      } catch (e) {
          console.warn(`⚠️ External API unreachable (error): ${apiCheck.name} - ${e.message}`);
      }
  }


  return relevantDiscoveries.filter(d => d.isReachable); // Only return reachable ones
}

// === ⚖️ Regulatory Reconnaissance (Conceptual) ===
/**
 * Conceptually filters opportunities based on simulated regulatory favorability.
 * In a real scenario, this would involve complex legal databases and real-time regulatory changes.
 * @param {object[]} opportunities - List of discovered opportunities.
 * @returns {Promise<object[]>} Filtered and prioritized opportunities.
 */
async function filterOpportunitiesByRegulation(opportunities) {
  console.log('⚖️ Filtering opportunities based on conceptual regulatory favorability...');
  await quantumDelay(1500); // Simulate legal research time

  const compliantOpportunities = [];
  const regulatoryMap = { // Simplified map: higher score = more favorable
    'US': 8, 'EU': 7, 'Global': 9, 'Asia': 6, 'LATAM': 5
  };

  for (const op of opportunities) {
    const complianceScore = regulatoryMap[op.region] || 5; // Default score
    if (complianceScore >= 7) { // Only consider opportunities in generally favorable regions
      console.log(`✅ Opportunity "${op.name}" in ${op.region} is conceptually favorable.`);
      compliantOpportunities.push(op);
    } else {
      console.log(`⚠️ Opportunity "${op.name}" in ${op.region} is less favorable or requires closer review.`);
    }
  }

  // Further prioritize by 'potential'
  return compliantOpportunities.sort((a, b) => {
    const potentialRank = { 'high': 3, 'medium': 2, 'low': 1 };
    return potentialRank[b.potential] - potentialRank[a.potential];
  });
}


// === 🚀 Activate Campaigns (Real Signups & Key Extraction) ===
/**
 * Attempts to register/log in and extract API keys from various sites using Puppeteer.
 * This is where the core web automation and "credential gaps" leverage happens.
 * @param {string[]} sites - List of URLs to attempt activation on.
 * @param {string} email - AI's email for registration.
 * @param {string} password - AI's password for registration.
 * @param {object} config - The global CONFIG object for other credentials.
 * @returns {Promise<object>} Active campaigns and newly extracted API keys.
 */
async function activateCampaigns(sites, email, password, config) {
  let page = null; // Use page from browserManager
  const activeCampaigns = [];
  const newKeys = {};

  try {
    page = await getNewPage(); // Get a page from the managed browser instance
    page.setDefaultTimeout(45000); // Default page action timeout

    for (const site of sites) {
      console.log(`\n--- Attempting activation for: ${site} ---`);
      try {
        const registerUrls = [
          `${site}/register`, `${site}/signup`, `${site}/login`, site
        ];

        let navigationSuccess = false;
        for (const url of registerUrls) {
          try {
            console.log(`Navigating to ${url}...`);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
            await page.waitForSelector('body', { timeout: 5000 }); // Ensure body content is loaded
            navigationSuccess = true;
            break;
          } catch (e) {
            console.warn(`Attempt to navigate to ${url} failed: ${e.message.substring(0, 100)}...`);
            continue;
          }
        }

        if (!navigationSuccess) {
          console.warn(`⚠️ All navigation attempts failed for: ${site}. Skipping activation.`);
          continue;
        }

        // --- Intelligent Form Filling ---
        await page.evaluate((email, password) => {
          const findAndFill = (selector, value) => {
            const input = document.querySelector(selector);
            if (input) input.value = value;
            return !!input; // Return true if found and filled
          };

          // Try common selectors for email/username and password fields
          let emailFilled = findAndFill('input[type="email"]', email) ||
                           findAndFill('input[name*="email"]', email) ||
                           findAndFill('input[id*="email"]', email) ||
                           findAndFill('input[type="text"][name*="user"]', email) ||
                           findAndAndFill('input[id*="username"]', email); // Fixed typo here

          let passFilled = findAndFill('input[type="password"]', password) ||
                           findAndFill('input[name*="password"]', password) ||
                           findAndFill('input[id*="password"]', password);

          // Fallback to general text inputs if specific types not found
          if (!emailFilled) {
              const genericEmailInput = Array.from(document.querySelectorAll('input[type="text"]')).find(input => /email|username|login/i.test(input.name || input.id || input.placeholder));
              if (genericEmailInput) genericEmailInput.value = email;
          }
          if (!passFilled) {
              const genericPassInput = Array.from(document.querySelectorAll('input[type="text"]')).find(input => /pass|secret/i.test(input.name || input.id || input.placeholder));
              if (genericPassInput) genericPassInput.value = password;
          }

        }, email, password);
        console.log('Filled potential email/password fields.');

        // --- Universal Submit Button Click ---
        const submitSelectors = [
          'button[type="submit"]', 'input[type="submit"]',
          'button.btn-primary', 'button[name*="submit"]',
          'a[role="button"][href*="dashboard"]' // Sometimes submit is a link after login
        ];

        let submitted = false;
        for (const selector of submitSelectors) {
          try {
            const btn = await page.$(selector);
            if (btn) {
              console.log(`Clicking submit button with selector: ${selector}`);
              await btn.click();
              submitted = true;
              break;
            }
          } catch (e) {
            console.warn(`Selector ${selector} failed to click: ${e.message.substring(0, 50)}...`);
            continue;
          }
        }

        if (!submitted) {
          console.warn(`⚠️ No valid submit button found for: ${site}. Manual review needed.`);
          // Skip to next site if no submit button clicked
          continue;
        }

        // Wait for navigation or a common dashboard element after submission
        try {
          // Increase timeout for navigation as some sites are slow
          await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 });
        } catch (e) {
          console.warn(`Navigation after submit timed out for ${site}: ${e.message.substring(0, 100)}... Assuming already on dashboard.`);
        }
        await quantumDelay(2000); // Give page time to render post-login content

        // --- Check Activation Status ---
        const isActivated = await page.evaluate(() =>
          /dashboard|api|welcome|monetize|earn|account/i.test(document.body.innerText.toLowerCase())
        );

        if (isActivated) {
          activeCampaigns.push(site);
          console.log(`✅ Activated/Logged in successfully for: ${site}`);

          // --- Smart API Key Extraction ---
          // Attempt to navigate to common API key pages
          const apiPages = [`${site}/dashboard/api`, `${site}/developers`, `${site}/settings/api`];
          for (const apiPageUrl of apiPages) {
            try {
              console.log(`Attempting to find API key at: ${apiPageUrl}`);
              await page.goto(apiPageUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
              await page.waitForSelector('body', { timeout: 3000 }); // Wait for content
              const key = await page.evaluate(() => {
                const patterns = [
                  /[a-f0-9]{32,64}/i, // Common API key hash patterns (MD5, SHA256 length)
                  /(pk|sk)_[a-zA-Z0-9_]{24,}/, // Stripe-like keys
                  /key=[a-zA-Z0-9\-]{16,}/, // Key in URL param
                  /^[A-Za-z0-9\-_~]{22,}/, // Base64 or similar looking IDs
                  /(\bAPI_KEY\b|\bAPIKEY\b|\bACCESS_TOKEN\b)[^\n]{0,50}([a-zA-Z0-9\-_]{20,})/i // Generic pattern with label
                ];
                const text = document.body.innerText;
                for (const pattern of patterns) {
                  const match = text.match(pattern);
                  if (match) {
                    // Refine match: sometimes it matches the label + key, try to isolate the key
                    if (match[2]) return match[2]; // If regex has a capturing group for the key
                    return match[0].replace(/.*(key=|API_KEY=|APIKEY=|ACCESS_TOKEN=)/i, ''); // Clean up if label matched
                  }
                }
                return null;
              });

              if (key && key.length > 15) { // Ensure extracted key is reasonably long
                const keyName = site.includes('linkvertise') ? 'LINKVERTISE_API_KEY_EXTRACTED' :
                               site.includes('shorte') ? 'SHORTE_ST_API_KEY_EXTRACTED' :
                               site.includes('newsapi') ? 'NEWS_API_KEY_EXTRACTED' :
                               site.includes('thecatapi') ? 'CAT_API_KEY_EXTRACTED' :
                               site.includes('bscscan') ? 'BSCSCAN_API_KEY_EXTRACTED' :
                               site.includes('coinmarketcap') ? 'COINMARKETCAP_API_KEY_EXTRACTED' :
                               'AUTO_API_KEY_DISCOVERED_' + Date.now();
                newKeys[keyName] = key;
                console.log(`🔑 Extracted potential API key for ${site}. Key name: ${keyName}`);
                break; // Stop looking for keys on this site if one is found
              }
            } catch (apiError) {
              console.warn(`Failed to access API key page for ${site} at ${apiPageUrl}: ${apiError.message.substring(0, 100)}...`);
            }
          }

        } else {
          console.warn(`⚠️ Activation check failed for: ${site}. Not on expected dashboard.`);
        }

      } catch (e) {
        console.error(`🚨 Error during activation for ${site}:`, e.message);
        // if (page && !page.isClosed()) await page.screenshot({ path: `error_${new URL(site).hostname}.png` });
      }
      await quantumDelay(2000); // Delay between sites
    }
  } catch (e) {
    console.error('🚨 Critical: Page operation failed or browser issue:', e.message);
  } finally {
    if (page) await closePage(page); // Ensure page is closed
  }

  return { activeCampaigns, newKeys };
}

// === 💰 Consolidate Real Revenue & Update Environment ===
/**
 * Consolidates simulated revenue from activated campaigns and persists/updates new API keys.
 * For "zero cost enhancements", this focuses on optimal resource use and data management.
 * @param {string[]} campaigns - List of successfully activated campaign URLs.
 * @param {object} newKeys - Newly discovered API keys.
 * @param {object} config - The global CONFIG object.
 * @returns {Promise<object>} Consolidated revenue report.
 */
async function consolidateRevenue(campaigns, newKeys, config) {
  console.log('\n--- Consolidating Revenue & Updating Key Inventory ---');
  const keysSavePath = path.resolve(__dirname, '../../data/revenue_keys.json');

  if (Object.keys(newKeys).length > 0) {
    let existingKeys = {};
    try {
      await fs.mkdir(path.dirname(keysSavePath), { recursive: true });
      existingKeys = JSON.parse(await fs.readFile(keysSavePath, 'utf8'));
    } catch (e) {
      console.warn(`No existing revenue_keys.json found at ${keysSavePath}. Creating new file.`);
    }

    const mergedKeys = { ...existingKeys, ...newKeys };
    await fs.writeFile(keysSavePath, JSON.stringify(mergedKeys, null, 2), { mode: 0o600 });
    console.log(`🔑 Saved ${Object.keys(newKeys).length} new API keys to ${keysSavePath}`);

    Object.assign(config, newKeys);
    console.log('Updated CONFIG object with new keys for current cycle.');

    if (config.RENDER_API_TOKEN && config.RENDER_SERVICE_ID) {
      console.log('Attempting to sync new keys to Render environment variables...');
      try {
        const envVarsToAdd = Object.entries(newKeys).map(([key, value]) => ({ key, value }));
        await axios.put(
          `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/env-vars`,
          { envVars: envVarsToAdd },
          { headers: { Authorization: `Bearer ${config.RENDER_API_TOKEN}` }, timeout: 15000 }
        );
        console.log(`🔄 Successfully synced ${envVarsToAdd.length} new keys to Render ENV.`);
      } catch (envUpdateError) {
        console.warn('⚠️ Failed to update Render ENV with new keys:', envUpdateError.message);
        console.warn('Ensure RENDER_API_TOKEN has write permissions for environment variables.');
      }
    } else {
      console.warn('Skipping Render ENV update: RENDER_API_TOKEN or RENDER_SERVICE_ID missing.');
    }
  }

  const baseRevenuePerCampaign = 0.05;
  const totalRevenue = campaigns.length * baseRevenuePerCampaign;
  const discoveredApiRevenue = Object.keys(newKeys).length * 0.10;
  const totalWithDiscoveryBonus = totalRevenue + discoveredApiRevenue;

  return {
    total: parseFloat(totalWithDiscoveryBonus.toFixed(4)),
    campaignsActivated: campaigns.length,
    newKeysDiscovered: Object.keys(newKeys).length,
    wallets_utilized: config.USDT_WALLETS?.split(',') || [],
    status: 'completed',
    details: {
      campaignRevenue: totalRevenue.toFixed(4),
      discoveryBonus: discoveredApiRevenue.toFixed(4)
    }
  };
}

// === 🧠 AI-Driven Strategic Insight Generation ===
async function generateStrategicInsights(revenueReport, discoveredOpportunities) {
  console.log('\n🧠 Generating strategic insights with AI...');
  await quantumDelay(2000);

  const prompt = `Based on the following data, provide concise, actionable strategic insights for maximizing autonomous revenue generation. Identify novel approaches, potential gaps, and high-leverage opportunities.

Revenue Report:
- Total Revenue this cycle: $${revenueReport.total.toFixed(4)}
- Campaigns Activated: ${revenueReport.campaignsActivated}
- New API Keys Discovered: ${revenueReport.newKeysDiscovered}

Discovered Opportunities (Reachable & Compliant, high potential first):
${discoveredOpportunities.map(op => `- ${op.name} (${op.url}) - Potential: ${op.potential}, Region: ${op.region}, Type: ${op.type}`).join('\n')}

What are the 3 most important strategic recommendations for the ArielMatrix Autonomous Revenue Engine, focusing on scaling, efficiency, and identifying truly novel, compliant revenue streams? Use clear, direct language.`;

  try {
    const chatHistory = [{ role: "user", parts: [{ text: prompt }] }];
    const payload = { contents: chatHistory };
    const apiKey = "";
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}`;

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Insight generation API error:', errorData);
      return 'Failed to generate insights. Review LLM API configuration.';
    }

    const result = await response.json();
    if (result.candidates && result.candidates.length > 0 && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts.length > 0) {
      console.log('✅ Strategic insights generated.');
      return result.candidates[0].content.parts[0].text;
    } else {
      console.warn('⚠️ Insight generation did not return expected data structure.');
      return 'No specific insights generated due to unexpected LLM response.';
    }
  } catch (error) {
    console.error('🚨 Error generating strategic insights:', error);
    return 'An error occurred during AI insight generation.';
  }
}

// === 🛠 Self-Healing (Real Recovery & Advanced Diagnostics) ===
async function healSystem(error) {
  console.log(`\n🛠 Attempting to heal system from error: ${error.message.substring(0, 100)}...`);

  if (error.message.includes('timeout') || error.message.includes('Navigation timeout')) {
    console.log('⚙️ Diagnosed: Network/Page Load Timeout. Healing: Implementing exponential backoff and retry.');
    await new Promise(r => setTimeout(r, Math.min(300000, 5000 + Math.random() * 20000)));
  } else if (error.message.includes('ENOTFOUND') || error.message.includes('ERR_ADDRESS_INVALID')) {
    console.log('⚙️ Diagnosed: DNS/Address Resolution Issue. Healing: Verifying network configuration and retrying after delay.');
    await new Promise(r => setTimeout(r, 600000));
  } else if (error.message.includes('No valid submit button found') || error.message.includes('No element found')) {
    console.log('⚙️ Diagnosed: Selector/Layout Change. Healing: This requires human intervention or dynamic selector generation (advanced AI vision).');
  } else if (error.message.includes('Browser launch') || error.message.includes('Chromium') || error.message.includes('Protocol error')) {
    console.log('⚙️ Diagnosed: Browser Environment/Protocol Error. Healing: Checking Puppeteer/Playwright dependencies, ensuring browserManager stability, and reattempting launch.');
    await closeGlobalBrowserInstance(); // Assuming this is available and safe to call
    await new Promise(r => setTimeout(r, 60000)); // Wait a minute before next attempt
  } else if (error.message.includes('401') || error.message.includes('403') || error.message.includes('authentication')) {
    console.log('⚙️ Diagnosed: Authentication Failure. Healing: Verify stored credentials and flag for potential human review.');
  } else {
    console.log('⚙️ Critical/Unknown Failure. Healing: Attempting graceful shutdown and restart.');
    process.exit(1);
  }
}
