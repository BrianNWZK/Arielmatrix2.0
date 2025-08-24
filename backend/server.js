// =========================================================================
// ArielMatrix Server: Core Autonomous Revenue System (Optimized for BrianNwaezikeChain)
// =========================================================================

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import crypto from 'crypto';
import cron from 'node-cron';
import 'dotenv/config';

// --- Import ALL agents for complete autonomous revenue system ---
import { PayoutAgent } from './agents/payoutAgent.js';
import { DataAgent } from './agents/dataAgent.js';
import { ShopifyAgent } from './agents/shopifyAgent.js';
import { BrowserManager } from './agents/browserManager.js';
import { AdRevenueAgent } from './agents/adRevenueAgent.js';
import { ApiScoutAgent } from './agents/apiScoutAgent.js';
import { CryptoAgent } from './agents/cryptoAgent.js';
import { ForexSignalAgent } from './agents/forexSignalAgent.js';
import { SocialAgent } from './agents/socialAgent.js';
import * as healthAgent from './agents/healthAgent.js';
import * as configAgent from './agents/configAgent.js';

// --- Enhanced Logger ---
const logger = {
    info: (...args) => console.log(`[${new Date().toISOString()}] INFO:`, ...args),
    warn: (...args) => console.warn(`[${new Date().toISOString()}] WARN:`, ...args),
    error: (...args) => console.error(`[${new Date().toISOString()}] ERROR:`, ...args),
    success: (...args) => console.log(`[${new Date().toISOString()}] SUCCESS:`, ...args),
    debug: (...args) => { if (process.env.NODE_ENV === 'development') console.log(`[${new Date().toISOString()}] DEBUG:`, ...args); }
};

// --- Complete Configuration for All Agents ---
export const CONFIG = {
    // --- Core System & Payout Agent ---
    PAYOUT_THRESHOLD_USD: process.env.PAYOUT_THRESHOLD_USD || 500,
    
    // BrianNwaezikeChain Configuration
    COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
    COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY,
    USE_FALLBACK_PAYOUT: process.env.USE_FALLBACK_PAYOUT || 'false',
    
    // Data Agent Configuration
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    ALPHAVANTAGE_API_KEY: process.env.ALPHAVANTAGE_API_KEY,
    NEWS_API_KEY: process.env.NEWS_API_KEY,
    
    // Shopify Agent Configuration
    SHOPIFY_STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN,
    SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
    SHOPIFY_PASSWORD: process.env.SHOPIFY_PASSWORD,
    
    // Browser Manager Configuration
    BROWSER_HEADLESS: process.env.BROWSER_HEADLESS || 'true',
    PROXY_LIST: process.env.PROXY_LIST,
    
    // Ad Revenue Agent Configuration
    GOOGLE_ADS_API_KEY: process.env.GOOGLE_ADS_API_KEY,
    META_ADS_API_KEY: process.env.META_ADS_API_KEY,
    
    // API Scout Agent Configuration
    RAPIDAPI_KEY: process.env.RAPIDAPI_KEY,
    API_NINJAS_KEY: process.env.API_NINJAS_KEY,
    
    // Crypto Agent Configuration
    COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY,
    CRYPTO_COMPARE_API_KEY: process.env.CRYPTO_COMPARE_API_KEY,
    
    // Forex Signal Agent Configuration
    FOREX_API_KEY: process.env.FOREX_API_KEY,
    OANDA_API_KEY: process.env.OANDA_API_KEY,
    
    // Social Agent Configuration
    TWITTER_API_KEY: process.env.TWITTER_API_KEY,
    LINKEDIN_API_KEY: process.env.LINKEDIN_API_KEY,
    INSTAGRAM_API_KEY: process.env.INSTAGRAM_API_KEY,
    
    // --- System Cycle Intervals ---
    CYCLE_INTERVAL: 600000, // 10 minutes
    HEALTH_REPORT_INTERVAL: 12, // Hours
    DASHBOARD_UPDATE_INTERVAL: 5000, // Milliseconds
    DATA_COLLECTION_INTERVAL: 1800000, // 30 minutes
    CRYPTO_INTERVAL: 300000, // 5 minutes
    FOREX_INTERVAL: 300000, // 5 minutes
};

// --- WebSocket Setup ---
const connectedClients = new Set();
function broadcastDashboardUpdate() {
    const update = {
        timestamp: new Date().toISOString(),
        status: getSystemStatus(),
        agents: getAgentActivities(),
    };
    const message = JSON.stringify({ type: 'update', data: update });
    connectedClients.forEach(client => {
        if (client.readyState === 1) {
            client.send(message);
        }
    });
}

// --- Global Error Handlers ---
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// --- Tracking Variables ---
const agentActivityLog = [];
let lastCycleStats = {};
let isRunning = false;
let isCycleLocked = false;

// --- Initialize ALL Agents ---
const payoutAgentInstance = new PayoutAgent(CONFIG, logger);
const dataAgentInstance = new DataAgent(CONFIG, logger);
const shopifyAgentInstance = new ShopifyAgent(CONFIG, logger);
const browserManagerInstance = new BrowserManager(CONFIG, logger);
const adRevenueAgentInstance = new AdRevenueAgent(CONFIG, logger);
const apiScoutAgentInstance = new ApiScoutAgent(CONFIG, logger);
const cryptoAgentInstance = new CryptoAgent(CONFIG, logger);
const forexSignalAgentInstance = new ForexSignalAgent(CONFIG, logger);
const socialAgentInstance = new SocialAgent(CONFIG, logger);

// --- Agent Initialization Function ---
async function initializeAllAgents() {
    logger.info('🚀 Initializing all autonomous agents...');
    
    const initializationPromises = [
        payoutAgentInstance.initialize().catch(err => {
            logger.error('Payout Agent initialization failed:', err);
            return { success: false, agent: 'payout', error: err.message };
        }),
        
        dataAgentInstance.initialize().catch(err => {
            logger.error('Data Agent initialization failed:', err);
            return { success: false, agent: 'data', error: err.message };
        }),
        
        shopifyAgentInstance.initialize().catch(err => {
            logger.error('Shopify Agent initialization failed:', err);
            return { success: false, agent: 'shopify', error: err.message };
        }),
        
        browserManagerInstance.initialize().catch(err => {
            logger.error('Browser Manager initialization failed:', err);
            return { success: false, agent: 'browser', error: err.message };
        }),
        
        adRevenueAgentInstance.initialize().catch(err => {
            logger.error('Ad Revenue Agent initialization failed:', err);
            return { success: false, agent: 'adRevenue', error: err.message };
        }),
        
        apiScoutAgentInstance.initialize().catch(err => {
            logger.error('API Scout Agent initialization failed:', err);
            return { success: false, agent: 'apiScout', error: err.message };
        }),
        
        cryptoAgentInstance.initialize().catch(err => {
            logger.error('Crypto Agent initialization failed:', err);
            return { success: false, agent: 'crypto', error: err.message };
        }),
        
        forexSignalAgentInstance.initialize().catch(err => {
            logger.error('Forex Signal Agent initialization failed:', err);
            return { success: false, agent: 'forex', error: err.message };
        }),
        
        socialAgentInstance.initialize().catch(err => {
            logger.error('Social Agent initialization failed:', err);
            return { success: false, agent: 'social', error: err.message };
        })
    ];

    const results = await Promise.all(initializationPromises);
    
    const failedAgents = results.filter(result => !result.success);
    if (failedAgents.length > 0) {
        logger.warn(`⚠️ ${failedAgents.length} agents failed to initialize:`);
        failedAgents.forEach(agent => {
            logger.warn(`   - ${agent.agent}: ${agent.error}`);
        });
    }
    
    const successfulAgents = results.filter(result => result.success);
    logger.success(`✅ ${successfulAgents.length}/${initializationPromises.length} agents initialized successfully`);
    
    return results;
}

// --- Main System Autonomous Revenue Generation Cycle ---
async function runAutonomousRevenueSystem() {
    if (isCycleLocked) {
        logger.warn('Cycle already in progress. Skipping this scheduled run.');
        return;
    }

    isCycleLocked = true;
    const cycleStart = Date.now();
    const cycleStats = {
        startTime: new Date().toISOString(),
        success: false,
        duration: 0,
        activities: [],
        revenueGenerated: 0
    };

    logger.info('🚀 Autonomous Revenue Generation Cycle Initiated!');

    try {
        // 1. Health Agent: Critical prerequisite check
        const healthActivity = { agent: 'health', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(healthActivity);
        cycleStats.activities.push(healthActivity);
        const healthResult = await healthAgent.run(CONFIG, logger);
        healthActivity.action = 'completed';
        healthActivity.status = healthResult.status;
        if (healthResult.status !== 'optimal') {
            logger.error(`🚨 System health check failed. Skipping autonomous cycle.`);
            throw new Error('System health check failed. Cycle aborted.');
        }
        logger.success('✅ System health is optimal. Proceeding with agent execution.');

        // 2. Config Agent: Ensure configurations are up-to-date
        const configActivity = { agent: 'config', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(configActivity);
        cycleStats.activities.push(configActivity);
        const configResult = await configAgent.run(CONFIG, logger);
        configActivity.action = 'completed';
        configActivity.status = configResult.status;
        logger.info(`Config Agent Result: ${configResult.message}`);

        // 3. Data Agent: Collect and analyze market data
        const dataActivity = { agent: 'data', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(dataActivity);
        cycleStats.activities.push(dataActivity);
        const dataResult = await dataAgentInstance.run();
        dataActivity.action = 'completed';
        dataActivity.status = dataResult.status;
        dataActivity.revenue = dataResult.revenue || 0;
        cycleStats.revenueGenerated += dataResult.revenue || 0;
        logger.info(`Data Agent Result: ${dataResult.message}`);

        // 4. Shopify Agent: E-commerce operations
        const shopifyActivity = { agent: 'shopify', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(shopifyActivity);
        cycleStats.activities.push(shopifyActivity);
        const shopifyResult = await shopifyAgentInstance.run();
        shopifyActivity.action = 'completed';
        shopifyActivity.status = shopifyResult.status;
        shopifyActivity.revenue = shopifyResult.revenue || 0;
        cycleStats.revenueGenerated += shopifyResult.revenue || 0;
        logger.info(`Shopify Agent Result: ${shopifyResult.message}`);

        // 5. Ad Revenue Agent: Advertising revenue generation
        const adRevenueActivity = { agent: 'adRevenue', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(adRevenueActivity);
        cycleStats.activities.push(adRevenueActivity);
        const adRevenueResult = await adRevenueAgentInstance.run();
        adRevenueActivity.action = 'completed';
        adRevenueActivity.status = adRevenueResult.status;
        adRevenueActivity.revenue = adRevenueResult.revenue || 0;
        cycleStats.revenueGenerated += adRevenueResult.revenue || 0;
        logger.info(`Ad Revenue Agent Result: ${adRevenueResult.message}`);

        // 6. API Scout Agent: API monetization
        const apiScoutActivity = { agent: 'apiScout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(apiScoutActivity);
        cycleStats.activities.push(apiScoutActivity);
        const apiScoutResult = await apiScoutAgentInstance.run();
        apiScoutActivity.action = 'completed';
        apiScoutActivity.status = apiScoutResult.status;
        apiScoutActivity.revenue = apiScoutResult.revenue || 0;
        cycleStats.revenueGenerated += apiScoutResult.revenue || 0;
        logger.info(`API Scout Agent Result: ${apiScoutResult.message}`);

        // 7. Crypto Agent: Cryptocurrency operations
        const cryptoActivity = { agent: 'crypto', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(cryptoActivity);
        cycleStats.activities.push(cryptoActivity);
        const cryptoResult = await cryptoAgentInstance.run();
        cryptoActivity.action = 'completed';
        cryptoActivity.status = cryptoResult.status;
        cryptoActivity.revenue = cryptoResult.revenue || 0;
        cycleStats.revenueGenerated += cryptoResult.revenue || 0;
        logger.info(`Crypto Agent Result: ${cryptoResult.message}`);

        // 8. Forex Signal Agent: Forex trading signals
        const forexActivity = { agent: 'forex', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(forexActivity);
        cycleStats.activities.push(forexActivity);
        const forexResult = await forexSignalAgentInstance.run();
        forexActivity.action = 'completed';
        forexActivity.status = forexResult.status;
        forexActivity.revenue = forexResult.revenue || 0;
        cycleStats.revenueGenerated += forexResult.revenue || 0;
        logger.info(`Forex Signal Agent Result: ${forexResult.message}`);

        // 9. Social Agent: Social media monetization
        const socialActivity = { agent: 'social', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(socialActivity);
        cycleStats.activities.push(socialActivity);
        const socialResult = await socialAgentInstance.run();
        socialActivity.action = 'completed';
        socialActivity.status = socialResult.status;
        socialActivity.revenue = socialResult.revenue || 0;
        cycleStats.revenueGenerated += socialResult.revenue || 0;
        logger.info(`Social Agent Result: ${socialResult.message}`);

        // 10. Payout Agent: Distribute accumulated revenue
        const payoutActivity = { agent: 'payout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(payoutActivity);
        cycleStats.activities.push(payoutActivity);
        
        const payoutResult = await payoutAgentInstance.runPayoutCycle();
        payoutActivity.action = 'completed';
        payoutActivity.status = payoutResult?.status || 'success';
        payoutActivity.amount = payoutResult?.amount || 0;
        logger.info(`Payout Agent Result: ${payoutResult?.message || 'Payout cycle completed'}`);

        cycleStats.success = true;
        logger.success(`🎉 Autonomous Revenue Generation Cycle Completed Successfully! Generated: $${cycleStats.revenueGenerated}`);
        return { 
            success: true, 
            message: 'Cycle completed',
            revenueGenerated: cycleStats.revenueGenerated
        };

    } catch (error) {
        cycleStats.success = false;
        logger.error('Error during autonomous revenue cycle:', error);
        return { success: false, error: error.message };
    } finally {
        isCycleLocked = false;
        cycleStats.duration = Date.now() - cycleStart;
        lastCycleStats = cycleStats;
        broadcastDashboardUpdate();
    }
}

// --- Dashboard Functions ---
function getSystemStatus() {
    return {
        status: isCycleLocked ? 'operational' : 'idle',
        uptime: process.uptime(),
        lastCycle: lastCycleStats,
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
    };
}

function getAgentActivities() {
    return {
        recentActivities: agentActivityLog.slice(-50).reverse(),
        agentStatus: {
            payoutAgent: payoutAgentInstance.getStatus ? payoutAgentInstance.getStatus() : { error: 'Not available' },
            dataAgent: dataAgentInstance.getStatus ? dataAgentInstance.getStatus() : { error: 'Not available' },
            shopifyAgent: shopifyAgentInstance.getStatus ? shopifyAgentInstance.getStatus() : { error: 'Not available' },
            browserManager: browserManagerInstance.getStatus ? browserManagerInstance.getStatus() : { error: 'Not available' },
            adRevenueAgent: adRevenueAgentInstance.getStatus ? adRevenueAgentInstance.getStatus() : { error: 'Not available' },
            apiScoutAgent: apiScoutAgentInstance.getStatus ? apiScoutAgentInstance.getStatus() : { error: 'Not available' },
            cryptoAgent: cryptoAgentInstance.getStatus ? cryptoAgentInstance.getStatus() : { error: 'Not available' },
            forexSignalAgent: forexSignalAgentInstance.getStatus ? forexSignalAgentInstance.getStatus() : { error: 'Not available' },
            socialAgent: socialAgentInstance.getStatus ? socialAgentInstance.getStatus() : { error: 'Not available' },
            healthAgent: healthAgent.getStatus ? healthAgent.getStatus() : { error: 'Not available' },
            configAgent: configAgent.getStatus ? configAgent.getStatus() : { error: 'Not available' },
        }
    };
}

// --- Express Server Setup ---
const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 10000;

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    connectedClients.add(ws);
    ws.send(JSON.stringify({
        type: 'init',
        data: {
            status: getSystemStatus(),
            agents: getAgentActivities()
        }
    }));
    ws.on('close', () => connectedClients.delete(ws));
    ws.on('error', (error) => {
        logger.error('WebSocket error:', error);
        connectedClients.delete(ws);
    });
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// API Endpoints
app.post('/api/start-revenue-system', async (req, res) => {
    if (isCycleLocked) {
        return res.status(409).json({ success: false, message: 'System already running' });
    }
    const result = await runAutonomousRevenueSystem();
    res.status(result.success ? 200 : 500).json(result);
});

app.post('/api/initialize-agents', async (req, res) => {
    try {
        const results = await initializeAllAgents();
        res.json({ success: true, results });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/trigger-payout', async (req, res) => {
    logger.info('Manual payout trigger requested.');
    if (isCycleLocked) {
        return res.status(409).json({ success: false, message: 'System already busy' });
    }
    
    if (!payoutAgentInstance.initialized) {
        await payoutAgentInstance.initialize();
    }

    isCycleLocked = true;
    try {
        const result = await payoutAgentInstance.runPayoutCycle();
        if (result.status === 'success') {
            res.status(200).json({ success: true, message: 'Payout process initiated successfully.' });
        } else {
            res.status(400).json({ success: false, message: 'Payout trigger failed.', details: result.message });
        }
    } catch (error) {
        logger.error('Manual payout failed:', error);
        res.status(500).json({ success: false, message: 'An internal error occurred during the payout process.', error: error.message });
    } finally {
        isCycleLocked = false;
        broadcastDashboardUpdate();
    }
});

// Individual agent control endpoints
app.post('/api/agents/data/run', async (req, res) => {
    try {
        const result = await dataAgentInstance.run();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents/shopify/run', async (req, res) => {
    try {
        const result = await shopifyAgentInstance.run();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents/ad-revenue/run', async (req, res) => {
    try {
        const result = await adRevenueAgentInstance.run();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents/api-scout/run', async (req, res) => {
    try {
        const result = await apiScoutAgentInstance.run();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents/crypto/run', async (req, res) => {
    try {
        const result = await cryptoAgentInstance.run();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents/forex/run', async (req, res) => {
    try {
        const result = await forexSignalAgentInstance.run();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/agents/social/run', async (req, res) => {
    try {
        const result = await socialAgentInstance.run();
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/health', (req, res) => res.json(getSystemStatus()));
app.get('/api/dashboard/status', (req, res) => res.json(getSystemStatus()));
app.get('/api/dashboard/agents', (req, res) => res.json(getAgentActivities()));

// Schedule periodic operations
cron.schedule('*/10 * * * *', () => {
    runAutonomousRevenueSystem().catch(err => {
        logger.error('Scheduled autonomous revenue cycle failed:', err);
    });
});

// Data collection every 30 minutes
cron.schedule('*/30 * * * *', () => {
    dataAgentInstance.run().catch(err => {
        logger.error('Scheduled data collection failed:', err);
    });
});

// Crypto operations every 5 minutes
cron.schedule('*/5 * * * *', () => {
    cryptoAgentInstance.run().catch(err => {
        logger.error('Scheduled crypto operations failed:', err);
    });
});

// Forex operations every 5 minutes
cron.schedule('*/5 * * * *', () => {
    forexSignalAgentInstance.run().catch(err => {
        logger.error('Scheduled forex operations failed:', err);
    });
});

// Start Server
server.listen(PORT, async () => {
    logger.success(`Server running on port ${PORT} with WebSocket support`);
    
    // Initialize all agents on startup
    try {
        await initializeAllAgents();
        
        if (process.env.NODE_ENV !== 'test') {
            // Start the first revenue cycle after initialization
            setTimeout(() => {
                runAutonomousRevenueSystem().catch(err => {
                    logger.error('Initial revenue cycle failed:', err);
                });
            }, 5000); // Wait 5 seconds after initialization
        }
    } catch (error) {
        logger.error('Failed to initialize agents on startup:', error);
    }
});
