import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs/promises';
import axios from 'axios';
import { ethers } from 'ethers';
import cron from 'node-cron';

// Import all agents
import * as apiScoutAgent from './agents/apiScoutAgent.js';
import * as shopifyAgent from './agents/shopifyAgent.js';
import * as cryptoAgent from './agents/cryptoAgent.js';
import * as externalPayoutAgentModule from './agents/payoutAgent.js';
import BrowserManager from './agents/browserManager.js';
// The problematic import has been removed:
// import { shutdown as shutdownBrowser } from './agents/browserManager.js';

// --- Configuration ---
const CONFIG = {
    AI_EMAIL: process.env.AI_EMAIL || 'ai-agent@example.com',
    AI_PASSWORD: process.env.AI_PASSWORD || 'StrongP@ssw0rd',
    RENDER_API_TOKEN: process.env.RENDER_API_TOKEN || 'PLACEHOLDER_RENDER_API_TOKEN',
    RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID || 'PLACEHOLDER_RENDER_SERVICE_ID',
    RENDER_API_BASE_URL: process.env.RENDER_API_BASE_URL || 'https://api.render.com/v1',
    CYCLE_INTERVAL: 600000, // 10 minutes
    MAX_CYCLE_TIME: 300000, // 5 minutes max
    HEALTH_REPORT_INTERVAL: 12, // Every 2 hours
    MAX_HISTORICAL_DATA: 4320, // 30 days
    DASHBOARD_UPDATE_INTERVAL: 5000, // 5 seconds
    PAYOUT_THRESHOLD_USD: 100,
    PAYOUT_PERCENTAGE: 0.8,
    BROWSER_CONCURRENCY: 3, // Number of concurrent browser instances
    BROWSER_TIMEOUT: 30000, // 30 seconds timeout for browser operations
    BROWSER_RETRIES: 2 // Number of retries for browser operations
};

// --- Enhanced Logger ---
const logger = {
    info: function(...args) {
        console.log(`[${new Date().toISOString()}] INFO:`, ...args);
    },
    warn: function(...args) {
        console.warn(`[${new Date().toISOString()}] WARN:`, ...args);
    },
    error: function(...args) {
        console.error(`[${new Date().toISOString()}] ERROR:`, ...args);
    },
    success: function(...args) {
        console.log(`[${new Date().toISOString()}] SUCCESS:`, ...args);
    },
    debug: function(...args) {
        if (process.env.NODE_ENV === 'development') {
            console.log(`[${new Date().toISOString()}] DEBUG:`, ...args);
        }
    }
};

// --- WebSocket Setup ---
const connectedClients = new Set();

function broadcastDashboardUpdate() {
    const update = {
        timestamp: new Date().toISOString(),
        status: getSystemStatus(),
        revenue: getRevenueAnalytics(),
        agents: getAgentActivities(),
        browserStats: BrowserManager.getStats()
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
const errorLog = [];
const historicalRevenueData = [];
const cycleTimes = [];
let cycleCount = 0;
let successfulCycles = 0;
let lastCycleStats = {};
let lastCycleStart = 0;
let lastDataUpdate = Date.now();
let isRunning = false;

// --- Utility Functions ---
function quantumDelay(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms + crypto.randomInt(500, 2000));
    });
}

async function withRetry(operation, maxRetries = 3, baseDelay = 1000) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await operation();
        } catch (error) {
            attempt++;
            if (attempt >= maxRetries) throw error;
            const delay = baseDelay * Math.pow(2, attempt) + crypto.randomInt(500, 2000);
            logger.warn(`Retrying in ${Math.round(delay/1000)}s (${attempt}/${maxRetries}): ${error.message}`);
            await quantumDelay(delay);
        }
    }
}

async function updateRenderEnvironmentVariables(keysToUpdate) {
    const { RENDER_API_TOKEN, RENDER_SERVICE_ID, RENDER_API_BASE_URL } = CONFIG;

    if (!RENDER_API_TOKEN || RENDER_API_TOKEN.includes('PLACEHOLDER') ||
        !RENDER_SERVICE_ID || RENDER_SERVICE_ID.includes('PLACEHOLDER')) {
        logger.warn('Render API credentials missing');
        return;
    }

    try {
        const apiUrl = `${RENDER_API_BASE_URL}/services/${RENDER_SERVICE_ID}/env-vars`;
        const currentEnvResponse = await axios.get(apiUrl, {
            headers: { 'Authorization': `Bearer ${RENDER_API_TOKEN}` },
            timeout: 10000
        });

        const updatedEnvVars = currentEnvResponse.data.map(envVar => {
            if (keysToUpdate[envVar.key] !== undefined) {
                const updatedValue = String(keysToUpdate[envVar.key]);
                delete keysToUpdate[envVar.key];
                return { key: envVar.key, value: updatedValue };
            }
            return envVar;
        });

        for (const key in keysToUpdate) {
            updatedEnvVars.push({ key, value: String(keysToUpdate[key]) });
        }

        await axios.put(apiUrl, updatedEnvVars, {
            headers: {
                'Authorization': `Bearer ${RENDER_API_TOKEN}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        logger.success('Updated Render environment variables');
    } catch (error) {
        logger.error('Failed to update Render environment:', error);
    }
}

// --- Revenue Tracker ---
class RevenueTracker {
    constructor() {
        this.dataFile = 'revenueData.json';
        this.lock = false;
        this.earnings = {};
        this.activeCampaigns = [];
        this.loadData();
    }

    async acquireLock() {
        while (this.lock) await quantumDelay(50);
        this.lock = true;
    }

    releaseLock() {
        this.lock = false;
    }

    async loadData() {
        await this.acquireLock();
        try {
            if (await fs.access(this.dataFile).then(() => true).catch(() => false)) {
                const data = JSON.parse(await fs.readFile(this.dataFile, 'utf8'));
                this.earnings = data.earnings || {};
                this.activeCampaigns = data.activeCampaigns || [];
                if (data.historicalRevenue) {
                    historicalRevenueData.push(...data.historicalRevenue.slice(-CONFIG.MAX_HISTORICAL_DATA));
                }
            }
        } finally {
            this.releaseLock();
        }
    }

    async saveData() {
        await this.acquireLock();
        try {
            await fs.writeFile(this.dataFile, JSON.stringify({
                earnings: this.earnings,
                activeCampaigns: this.activeCampaigns,
                historicalRevenue: historicalRevenueData.slice(-CONFIG.MAX_HISTORICAL_DATA)
            }, null, 2));
        } finally {
            this.releaseLock();
        }
    }

    getSummary() {
        return {
            totalRevenue: Object.values(this.earnings).reduce((a, b) => a + b, 0),
            byPlatform: { ...this.earnings },
            campaignCount: this.activeCampaigns.length
        };
    }

    async updatePlatformEarnings(platform, amount) {
        await this.acquireLock();
        this.earnings[platform] = (this.earnings[platform] || 0) + amount;
        this.releaseLock();
        await this.saveData();
    }

    async addCampaign(campaign) {
        await this.acquireLock();
        this.activeCampaigns.push(campaign);
        this.releaseLock();
        await this.saveData();
    }

    async resetEarnings() {
        await this.acquireLock();
        this.earnings = {};
        this.releaseLock();
        await this.saveData();
    }
}

// --- Payout Agent Orchestrator ---
class PayoutAgentOrchestrator {
    constructor(tracker) {
        this.tracker = tracker;
        this.executionCount = 0;
        this.lastExecutionTime = null;
        this.lastStatus = 'unknown';
        this.lastPayoutAmount = 0;
    }

    async monitorAndTriggerPayouts(config, logger) {
        this.lastExecutionTime = new Date();
        this.executionCount++;
        this.lastStatus = 'running';

        try {
            const summary = this.tracker.getSummary();
            const totalAccumulatedRevenue = summary.totalRevenue;

            if (totalAccumulatedRevenue >= config.PAYOUT_THRESHOLD_USD) {
                const amountToPayout = totalAccumulatedRevenue * config.PAYOUT_PERCENTAGE;
                const payoutResult = await withRetry(() =>
                    externalPayoutAgentModule.run({ ...config, earnings: amountToPayout }, logger)
                );

                if (payoutResult.status === 'success') {
                    this.lastStatus = 'success';
                    this.lastPayoutAmount = amountToPayout;
                    await this.tracker.resetEarnings();
                    return payoutResult;
                } else {
                    this.lastStatus = 'failed';
                    return payoutResult;
                }
            } else {
                this.lastStatus = 'skipped';
                return { status: 'skipped', message: 'Below payout threshold' };
            }
        } catch (error) {
            this.lastStatus = 'failed';
            throw error;
        }
    }

    getStatus() {
        return {
            agent: 'payout',
            lastExecution: this.lastExecutionTime?.toISOString() || 'Never',
            lastStatus: this.lastStatus,
            lastPayout: this.lastPayoutAmount,
            totalExecutions: this.executionCount
        };
    }
}

// --- Main System ---
const revenueTracker = new RevenueTracker();
const payoutAgentInstance = new PayoutAgentOrchestrator(revenueTracker);

// Initialize BrowserManager with config
BrowserManager.init({
    maxInstances: CONFIG.BROWSER_CONCURRENCY,
    timeout: CONFIG.BROWSER_TIMEOUT,
    retries: CONFIG.BROWSER_RETRIES
});

async function runAutonomousRevenueSystem() {
    const cycleStart = Date.now();
    const cycleStats = {
        startTime: new Date().toISOString(),
        success: false,
        duration: 0,
        revenueGenerated: 0,
        activities: [],
        newlyRemediatedKeys: {},
        browserUsage: {}
    };

    try {
        // Run API Scout Agent
        const scoutActivity = { agent: 'apiScout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(scoutActivity);
        cycleStats.activities.push(scoutActivity);

        const scoutResults = await withRetry(() => apiScoutAgent.run(CONFIG, logger));
        if (scoutResults?.newlyRemediatedKeys) {
            Object.assign(CONFIG, scoutResults.newlyRemediatedKeys);
            Object.assign(cycleStats.newlyRemediatedKeys, scoutResults.newlyRemediatedKeys);
        }
        scoutActivity.action = 'completed';
        scoutActivity.status = scoutResults?.status || 'success';

        // Run Shopify Agent with browser support
        const shopifyActivity = { agent: 'shopify', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(shopifyActivity);
        cycleStats.activities.push(shopifyActivity);

        const browserContext = await BrowserManager.acquireContext();
        try {
            const shopifyResult = await withRetry(() =>
                shopifyAgent.run({ ...CONFIG, browserContext }, logger)
            );

            if (shopifyResult?.newlyRemediatedKeys) {
                Object.assign(CONFIG, shopifyResult.newlyRemediatedKeys);
                Object.assign(cycleStats.newlyRemediatedKeys, shopifyResult.newlyRemediatedKeys);
            }
            const shopifyEarnings = parseFloat(shopifyResult?.finalPrice || 0);
            cycleStats.revenueGenerated += shopifyEarnings;
            await revenueTracker.updatePlatformEarnings('shopify', shopifyEarnings);
            shopifyActivity.action = 'completed';
            shopifyActivity.status = shopifyResult?.status || 'success';
            cycleStats.browserUsage.shopify = BrowserManager.getLastUsageStats();
        } finally {
            await BrowserManager.releaseContext(browserContext);
        }

        // Run Crypto Agent with browser support
        const cryptoActivity = { agent: 'crypto', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(cryptoActivity);
        cycleStats.activities.push(cryptoActivity);

        const cryptoBrowserContext = await BrowserManager.acquireContext();
        try {
            const cryptoResult = await withRetry(() =>
                cryptoAgent.run({ ...CONFIG, browserContext: cryptoBrowserContext }, logger)
            );

            if (cryptoResult?.newlyRemediatedKeys) {
                Object.assign(CONFIG, cryptoResult.newlyRemediatedKeys);
                Object.assign(cycleStats.newlyRemediatedKeys, cryptoResult.newlyRemediatedKeys);
            }
            cryptoActivity.action = 'completed';
            cryptoActivity.status = cryptoResult?.status || 'success';
            cycleStats.browserUsage.crypto = BrowserManager.getLastUsageStats();
        } finally {
            await BrowserManager.releaseContext(cryptoBrowserContext);
        }

        // Run Payout Agent
        const payoutActivity = { agent: 'payout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(payoutActivity);
        cycleStats.activities.push(payoutActivity);

        const payoutResult = await withRetry(() => payoutAgentInstance.monitorAndTriggerPayouts(CONFIG, logger));
        if (payoutResult?.newlyRemediatedKeys) {
            Object.assign(CONFIG, payoutResult.newlyRemediatedKeys);
            Object.assign(cycleStats.newlyRemediatedKeys, payoutResult.newlyRemediatedKeys);
        }
        payoutActivity.action = 'completed';
        payoutActivity.status = payoutResult?.status || 'success';

        // Update environment if needed
        if (Object.keys(cycleStats.newlyRemediatedKeys).length > 0) {
            await updateRenderEnvironmentVariables(cycleStats.newlyRemediatedKeys);
        }

        // Update historical data
        const revenueSnapshot = revenueTracker.getSummary();
        historicalRevenueData.push({
            timestamp: new Date().toISOString(),
            totalRevenue: revenueSnapshot.totalRevenue,
            cycleRevenue: cycleStats.revenueGenerated,
            browserUsage: cycleStats.browserUsage
        });

        if (historicalRevenueData.length > CONFIG.MAX_HISTORICAL_DATA) {
            historicalRevenueData.shift();
        }

        await revenueTracker.saveData();
        cycleStats.success = true;
        successfulCycles++;

        return { success: true, message: 'Cycle completed' };

    } catch (error) {
        errorLog.push({
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack,
            cycle: cycleCount
        });
        cycleStats.success = false;
        return { success: false, error: error.message };
    } finally {
        cycleStats.duration = Date.now() - cycleStart;
        lastCycleStats = cycleStats;
        lastDataUpdate = Date.now();
        cycleTimes.push(cycleStats.duration);
        broadcastDashboardUpdate();
    }
}

// --- Dashboard Functions ---
function getSystemStatus() {
    return {
        status: isRunning ? 'operational' : 'idle',
        uptime: process.uptime(),
        cycleCount,
        successRate: cycleCount > 0 ? (successfulCycles / cycleCount * 100).toFixed(2) + '%' : '0%',
        lastCycle: lastCycleStats,
        memoryUsage: process.memoryUsage(),
        activeCampaigns: revenueTracker.activeCampaigns.length,
        nextCycleIn: Math.max(0, CONFIG.CYCLE_INTERVAL - (Date.now() - lastCycleStart)),
        browserStats: BrowserManager.getStats()
    };
}

function getRevenueAnalytics() {
    return {
        ...revenueTracker.getSummary(),
        lastUpdated: new Date(lastDataUpdate).toISOString(),
        historicalTrend: historicalRevenueData
    };
}

function getAgentActivities() {
    return {
        recentActivities: agentActivityLog.slice(-50).reverse(),
        agentStatus: {
            apiScoutAgent: apiScoutAgent.getStatus?.(),
            shopifyAgent: { lastExecution: 'N/A', lastStatus: 'N/A' },
            cryptoAgent: { lastExecution: 'N/A', lastStatus: 'N/A' },
            payoutAgent: payoutAgentInstance.getStatus(),
            browserManager: BrowserManager.getStatus()
        }
    };
}

// --- Express Server Setup ---
const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    connectedClients.add(ws);

    ws.send(JSON.stringify({
        type: 'init',
        data: {
            status: getSystemStatus(),
            revenue: getRevenueAnalytics(),
            agents: getAgentActivities()
        }
    }));

    ws.on('close', () => {
        connectedClients.delete(ws);
    });

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
    if (isRunning) {
        return res.status(409).json({ success: false, message: 'System already running' });
    }
    const result = await runAutonomousRevenueSystem();
    res.status(result.success ? 200 : 500).json(result);
});

app.get('/api/health', (req, res) => {
    res.json(getSystemStatus());
});

app.get('/api/dashboard/status', (req, res) => {
    res.json(getSystemStatus());
});

app.get('/api/dashboard/revenue', (req, res) => {
    res.json(getRevenueAnalytics());
});

app.get('/api/dashboard/agents', (req, res) => {
    res.json(getAgentActivities());
});

// Schedule periodic operations using node-cron
cron.schedule('*/10 * * * *', () => {
    if (!isRunning) {
        runAutonomousRevenueSystem().catch(err => {
            logger.error('Scheduled operation failed:', err);
        });
    }
});

// Continuous Operation
async function continuousOperation() {
    if (isRunning) return;
    isRunning = true;

    process.on('SIGTERM', async () => {
        logger.info('Shutting down gracefully...');
        try {
            await revenueTracker.saveData();
            // The shutdownBrowser function is now called directly from the BrowserManager class
            // which is a named export from the module.
            await BrowserManager.shutdown();
            logger.success('Clean shutdown completed');
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    });

    while (true) {
        lastCycleStart = Date.now();
        cycleCount++;
        await runAutonomousRevenueSystem();
        const delayNeeded = Math.max(CONFIG.CYCLE_INTERVAL - (Date.now() - lastCycleStart), 0);
        await quantumDelay(delayNeeded);
    }
}

// Start Server
server.listen(PORT, '0.0.0.0', () => {
    logger.success(`Server running on port ${PORT} with WebSocket support`);

    if (process.env.NODE_ENV !== 'test') {
        continuousOperation();
    }
});
