// server.js - Autonomous Revenue System with Live Dashboard
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
import { apiScoutAgent } from './agents/apiScoutAgent.js';

// --- Configuration ---
const CONFIG = {
    AI_EMAIL: process.env.AI_EMAIL || 'ai-agent@example.com',
    AI_PASSWORD: process.env.AI_PASSWORD || 'StrongP@ssw0rd',
    RENDER_API_TOKEN: process.env.RENDER_API_TOKEN || 'PLACEHOLDER_RENDER_API_TOKEN',
    RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID || 'PLACEHOLDER_RENDER_SERVICE_ID',
    CYCLE_INTERVAL: 600000, // 10 minutes
    MAX_CYCLE_TIME: 300000, // 5 minutes max
    HEALTH_REPORT_INTERVAL: 12, // 2 hours
    MAX_HISTORICAL_DATA: 4320, // 30 days (at 10-min intervals)
    DASHBOARD_UPDATE_INTERVAL: 5000 // 5 seconds for live updates
};

// --- Enhanced Logger ---
const logger = {
    info: (...args) => console.log(`[${new Date().toISOString()}] INFO:`, ...args),
    warn: (...args) => console.warn(`[${new Date().toISOString()}] WARN:`, ...args),
    error: (...args) => console.error(`[${new Date().toISOString()}] ERROR:`, ...args),
    success: (...args) => console.log(`[${new Date().toISOString()}] SUCCESS:`, ...args),
    debug: (...args) => process.env.NODE_ENV === 'development' ? 
        console.log(`[${new Date().toISOString()}] DEBUG:`, ...args) : null,
};

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
const connectedClients = new Set();

// --- Browser Manager ---
const browserManager = {
    browser: null,
    activePages: new Set(),
    lastCleanup: 0,

    async getBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            if (this.browser) await this.browser.close();
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas'
                ]
            });
        }
        return this.browser;
    },

    async getNewPage() {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });
        this.activePages.add(page);
        return page;
    },

    async closePage(page) {
        if (page && !page.isClosed()) {
            await page.close().catch(e => logger.error('Page close error:', e));
            this.activePages.delete(page);
        }
    },

    async cleanup() {
        const now = Date.now();
        if (now - this.lastCleanup > 21600000) { // 6 hours
            logger.info('Performing browser cleanup');
            await this.shutdown();
            this.lastCleanup = now;
        }
    },

    async shutdown() {
        if (this.browser) {
            await Promise.all(
                Array.from(this.activePages).map(page => this.closePage(page))
            ).catch(e => logger.error('Active pages cleanup error:', e));
            
            await this.browser.close().catch(e => logger.error('Browser close error:', e));
            this.browser = null;
        }
    }
};

// --- Utility Functions ---
const quantumDelay = (ms) => new Promise(resolve => {
    setTimeout(resolve, ms + crypto.randomInt(500, 2000));
});

async function withRetry(operation, maxRetries = 3, baseDelay = 1000) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await operation();
        } catch (error) {
            attempt++;
            if (attempt >= maxRetries) throw error;
            
            const delay = baseDelay * Math.pow(2, attempt) + crypto.randomInt(500, 2000);
            logger.warn(`Retrying in ${Math.round(delay/1000)}s (Attempt ${attempt}/${maxRetries})`);
            await quantumDelay(delay);
        }
    }
}

// --- Persistent Revenue Tracker ---
class RevenueTracker {
    constructor() {
        this.dataFile = 'revenueData.json';
        this.lock = false;
        this.earnings = {};
        this.activeCampaigns = [];
        this.loadData();
    }
    
    async loadData() {
        while (this.lock) await quantumDelay(100);
        this.lock = true;
        
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile));
                this.earnings = data.earnings || {};
                this.activeCampaigns = data.activeCampaigns || [];
                if (data.historicalRevenue) {
                    historicalRevenueData.push(...data.historicalRevenue);
                }
            }
        } catch (error) {
            logger.error('Failed to load data:', error);
        } finally {
            this.lock = false;
        }
    }
    
    async saveData() {
        while (this.lock) await quantumDelay(100);
        this.lock = true;
        
        try {
            fs.writeFileSync(this.dataFile, JSON.stringify({
                earnings: this.earnings,
                activeCampaigns: this.activeCampaigns,
                historicalRevenue: historicalRevenueData.slice(-CONFIG.MAX_HISTORICAL_DATA)
            }, null, 2));
        } catch (error) {
            logger.error('Failed to save data:', error);
        } finally {
            this.lock = false;
        }
    }
    
    getSummary() {
        return {
            totalRevenue: Object.values(this.earnings).reduce((a, b) => a + b, 0),
            byPlatform: this.earnings,
            campaignCount: this.activeCampaigns.length
        };
    }

    async updatePlatformEarnings(platform, amount) {
        this.earnings[platform] = (this.earnings[platform] || 0) + amount;
        await this.saveData();
    }

    async addCampaign(campaign) {
        this.activeCampaigns.push(campaign);
        await this.saveData();
    }
}

// --- Enhanced Agents ---
class PayoutAgent {
    constructor(tracker) {
        this.tracker = tracker;
        this.executionCount = 0;
        this.lastExecutionTime = null;
        this.lastSuccess = null;
    }

    async monitorAndTriggerPayouts() {
        this.lastExecutionTime = new Date();
        this.executionCount++;
        
        try {
            logger.info('💰 Monitoring earnings for payout opportunities...');
            // Implement payout logic here
            
            this.lastSuccess = true;
            return { success: true };
        } catch (error) {
            this.lastSuccess = false;
            throw error;
        }
    }

    getStatus() {
        return {
            agent: 'payout',
            lastExecution: this.lastExecutionTime?.toISOString() || 'Never',
            lastStatus: this.lastSuccess !== null ? 
                (this.lastSuccess ? 'success' : 'failed') : 'unknown',
            totalExecutions: this.executionCount
        };
    }
}

class RevenueAgent {
    constructor(tracker) {
        this.tracker = tracker;
        this.executionCount = 0;
        this.lastExecutionTime = null;
        this.lastSuccess = null;
        this.lastRevenueGenerated = 0;
    }

    async generateRevenue() {
        this.lastExecutionTime = new Date();
        this.executionCount++;
        
        try {
            logger.info('📊 Generating revenue from active campaigns...');
            // Implement revenue generation logic
            const revenue = Math.random() * 1000; // Example revenue
            
            await this.tracker.updatePlatformEarnings('default', revenue);
            this.lastRevenueGenerated = revenue;
            this.lastSuccess = true;
            
            return { success: true, revenue };
        } catch (error) {
            this.lastSuccess = false;
            throw error;
        }
    }

    getStatus() {
        return {
            agent: 'revenue',
            lastExecution: this.lastExecutionTime?.toISOString() || 'Never',
            lastStatus: this.lastSuccess !== null ? 
                (this.lastSuccess ? 'success' : 'failed') : 'unknown',
            lastRevenue: this.lastRevenueGenerated,
            totalExecutions: this.executionCount
        };
    }
}

// --- Main Autonomous System ---
const revenueTracker = new RevenueTracker();
const revenueAgent = new RevenueAgent(revenueTracker);
const payoutAgent = new PayoutAgent(revenueTracker);

async function runAutonomousRevenueSystem() {
    const cycleStart = Date.now();
    const cycleStats = {
        startTime: new Date().toISOString(),
        success: false,
        duration: 0,
        revenueGenerated: 0,
        activities: []
    };

    try {
        // 1. Scout for opportunities
        const scoutActivity = { agent: 'scout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(scoutActivity);
        cycleStats.activities.push(scoutActivity);
        
        const scoutResults = await withRetry(() => apiScoutAgent.run(CONFIG, logger));
        scoutResults.activeCampaigns.forEach(c => revenueTracker.addCampaign(c));

        // 2. Generate revenue
        const revenueActivity = { agent: 'revenue', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(revenueActivity);
        cycleStats.activities.push(revenueActivity);
        
        const revenueResult = await withRetry(() => revenueAgent.generateRevenue());
        cycleStats.revenueGenerated = revenueResult.revenue || 0;

        // 3. Handle payouts
        const payoutActivity = { agent: 'payout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(payoutActivity);
        cycleStats.activities.push(payoutActivity);
        
        await payoutAgent.monitorAndTriggerPayouts();

        // Track success
        cycleStats.success = true;
        successfulCycles++;
        
        // Update historical data
        const revenueSnapshot = revenueTracker.getSummary();
        historicalRevenueData.push({
            timestamp: new Date().toISOString(),
            revenue: revenueSnapshot.totalRevenue
        });
        
        // Trim historical data
        if (historicalRevenueData.length > CONFIG.MAX_HISTORICAL_DATA) {
            historicalRevenueData.shift();
        }
        
        // Save data
        await revenueTracker.saveData();
        
        return { success: true };
    } catch (error) {
        logger.error('System error:', error);
        errorLog.push({
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack
        });
        
        return { success: false, error: error.message };
    } finally {
        // Update cycle stats
        cycleStats.duration = Date.now() - cycleStart;
        lastCycleStats = cycleStats;
        lastDataUpdate = Date.now();
        cycleTimes.push(cycleStats.duration);
        
        // Broadcast update
        broadcastDashboardUpdate();
        
        // Cleanup
        await browserManager.cleanup();
    }
}

// --- Dashboard Functions ---
function getSystemStatus() {
    return {
        status: 'operational',
        uptime: process.uptime(),
        cycleCount,
        successRate: cycleCount > 0 ? (successfulCycles / cycleCount * 100).toFixed(2) + '%' : '0%',
        lastCycle: lastCycleStats,
        memoryUsage: process.memoryUsage(),
        activeCampaigns: revenueTracker.activeCampaigns.length,
        nextCycleIn: Math.max(0, CONFIG.CYCLE_INTERVAL - (Date.now() - lastCycleStart))
    };
}

function getRevenueAnalytics() {
    return {
        ...revenueTracker.getSummary(),
        lastUpdated: new Date(lastDataUpdate).toISOString(),
        historicalTrend: historicalRevenueData.slice(-CONFIG.MAX_HISTORICAL_DATA)
    };
}

function getAgentActivities() {
    return {
        recentActivities: agentActivityLog.slice(-50).reverse(),
        agentStatus: {
            scoutAgent: apiScoutAgent.getStatus?.(),
            revenueAgent: revenueAgent.getStatus(),
            payoutAgent: payoutAgent.getStatus()
        }
    };
}

function getFullSystemReport() {
    return {
        systemInfo: {
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version
        },
        operationalMetrics: {
            uptime: process.uptime(),
            totalCycles: cycleCount,
            successRate: cycleCount > 0 ? (successfulCycles / cycleCount * 100).toFixed(2) + '%' : '0%',
            averageCycleTime: cycleTimes.length > 0 ? 
                Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : 0
        },
        revenueSummary: revenueTracker.getSummary(),
        resourceUsage: {
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(),
            browserSessions: browserManager.activePages.size
        },
        recentErrors: errorLog.slice(-10).reverse()
    };
}

function broadcastDashboardUpdate() {
    const update = {
        timestamp: new Date().toISOString(),
        status: getSystemStatus(),
        revenue: getRevenueAnalytics(),
        agents: getAgentActivities()
    };
    
    const message = JSON.stringify({ type: 'update', data: update });
    connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// --- Express Server ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public')); // For serving dashboard frontend

// API Endpoints
app.post('/api/start-revenue-system', async (req, res) => {
    const result = await runAutonomousRevenueSystem();
    res.status(result.success ? 200 : 500).json(result);
});

app.get('/api/health', (req, res) => {
    res.json(getSystemStatus());
});

// Dashboard Endpoints
app.get('/api/dashboard/status', (req, res) => {
    res.json(getSystemStatus());
});

app.get('/api/dashboard/revenue', (req, res) => {
    res.json(getRevenueAnalytics());
});

app.get('/api/dashboard/agents', (req, res) => {
    res.json(getAgentActivities());
});

app.get('/api/dashboard/full-report', (req, res) => {
    res.json(getFullSystemReport());
});

// --- WebSocket Server ---
function setupWebSocketServer(server) {
    const wss = new WebSocketServer({ server });
    
    wss.on('connection', (ws) => {
        connectedClients.add(ws);
        
        // Send initial data
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
    });
    
    return wss;
}

// --- Continuous Operation ---
async function continuousOperation() {
    if (isRunning) return;
    isRunning = true;
    
    // Graceful shutdown handler
    process.on('SIGTERM', async () => {
        logger.info('Shutting down gracefully...');
        await browserManager.shutdown();
        process.exit(0);
    });

    // Start live updates interval
    setInterval(broadcastDashboardUpdate, CONFIG.DASHBOARD_UPDATE_INTERVAL);

    while (true) {
        lastCycleStart = Date.now();
        cycleCount++;
        
        await runAutonomousRevenueSystem();
        
        // Calculate delay for precise 10-minute intervals
        const cycleDuration = Date.now() - lastCycleStart;
        const delayNeeded = Math.max(CONFIG.CYCLE_INTERVAL - cycleDuration, 0);
        await quantumDelay(delayNeeded);
    }
}

// --- Start Server ---
const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    
    // Setup WebSocket
    setupWebSocketServer(server);
    
    // Start system
    if (process.env.NODE_ENV !== 'test') {
        continuousOperation();
    }
});
