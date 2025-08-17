// server.js - Autonomous Revenue System with Live Dashboard
import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs/promises'; // Use fs/promises for async file operations
import { WebSocketServer } from 'ws';
import puppeteer from 'puppeteer';
import axios from 'axios'; // For Render API interaction

// Import all agents (ensure they are default exports from their files)
import apiScoutAgent from './agents/apiScoutAgent.js';
import shopifyAgent from './agents/shopifyAgent.js';
import cryptoAgent from './agents/cryptoAgent.js';
import externalPayoutAgentModule from './agents/payoutAgent.js'; // To avoid naming conflict with internal PayoutAgent class

// --- Configuration ---
// Read from environment variables, provide robust defaults or placeholders
const CONFIG = {
    AI_EMAIL: process.env.AI_EMAIL || 'ai-agent@example.com',
    AI_PASSWORD: process.env.AI_PASSWORD || 'StrongP@ssw0rd',
    RENDER_API_TOKEN: process.env.RENDER_API_TOKEN || 'PLACEHOLDER_RENDER_API_TOKEN',
    RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID || 'PLACEHOLDER_RENDER_SERVICE_ID',
    RENDER_API_BASE_URL: process.env.RENDER_API_BASE_URL || 'https://api.render.com/v1', // Default Render API URL
    CYCLE_INTERVAL: 600000, // 10 minutes (ms)
    MAX_CYCLE_TIME: 300000, // 5 minutes max (ms) - This is a soft limit for agent run, not a hard timeout for the cycle
    HEALTH_REPORT_INTERVAL: 12, // Number of cycles (every 2 hours if cycle is 10 min)
    MAX_HISTORICAL_DATA: 4320, // 30 days of data (at 10-min intervals)
    DASHBOARD_UPDATE_INTERVAL: 5000, // 5 seconds for live dashboard updates
    PAYOUT_THRESHOLD_USD: 100, // Payout if accumulated revenue exceeds this amount
    PAYOUT_PERCENTAGE: 0.8 // Percentage of earnings above threshold to payout
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

// --- Global Error Handlers (CRUCIAL FOR DEBUGGING DEPLOYMENT ISSUES) ---
process.on('unhandledRejection', (reason, promise) => {
    logger.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
    // Optionally, you might want to restart the process or notify.
    // For a server that needs to stay alive, avoid immediate process.exit() here unless absolutely necessary.
    // However, for deployment issues, it's good to log and let the platform restart.
    // If you explicitly want to exit on unhandled rejection:
    // process.exit(1);
});

process.on('uncaughtException', (error) => {
    logger.error('🚨 Uncaught Exception:', error);
    // This indicates a synchronous error that was not caught.
    // For a server, perform synchronous cleanup if possible (e.g., closing open files)
    // Then, it's usually best to exit to allow the process manager (Render) to restart.
    // Since browserManager.shutdown() is async, we'll try a best-effort, then exit.
    browserManager.shutdown().then(() => {
        logger.info('Browser manager shut down gracefully after uncaught exception.');
        process.exit(1);
    }).catch(e => {
        logger.error('Error during browser shutdown on uncaught exception:', e);
        process.exit(1); // Exit even if shutdown fails
    });
});


// --- Tracking Variables ---
const agentActivityLog = []; // Stores recent agent activity logs
const errorLog = []; // Stores recent system errors
const historicalRevenueData = []; // Stores periodic revenue snapshots for trend analysis
const cycleTimes = []; // Stores durations of each cycle for performance metrics
let cycleCount = 0; // Total cycles executed
let successfulCycles = 0; // Number of successful cycles
let lastCycleStats = {}; // Detailed stats of the last completed cycle
let lastCycleStart = 0; // Timestamp of the last cycle's start
let lastDataUpdate = Date.now(); // Timestamp of the last data update for dashboard
let isRunning = false; // Flag to prevent multiple continuous operation loops
const connectedClients = new Set(); // WebSocket clients for dashboard updates

// --- Browser Manager ---
// This is critical for Puppeteer operations and needs to be accessible by agents
const browserManager = {
    browser: null,
    activePages: new Set(),
    lastCleanup: 0,
    browserLaunchArgs: [ // Standard arguments for Puppeteer stability in container environments
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-zygote',
        '--disable-gpu'
    ],

    async getBrowser() {
        if (!this.browser || !this.browser.isConnected()) {
            if (this.browser) {
                logger.warn('Browser disconnected. Attempting to close and re-launch.');
                await this.browser.close().catch(e => logger.error('Error closing disconnected browser:', e));
            }
            logger.info('Launching new Puppeteer browser instance...');
            this.browser = await puppeteer.launch({
                headless: true, // Use 'new' for new headless mode or true for old
                args: this.browserLaunchArgs,
                timeout: 60000 // 60 seconds timeout for browser launch
            });
            logger.success('Puppeteer browser launched.');
        }
        return this.browser;
    },

    async getNewPage() {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 }); // Standard viewport
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
        // Periodically close and re-launch browser to prevent memory leaks and issues
        if (now - this.lastCleanup > 21600000) { // Every 6 hours
            logger.info('Performing scheduled browser cleanup and restart.');
            await this.shutdown(); // Shutdown existing browser
            await this.getBrowser(); // Launch a fresh browser
            this.lastCleanup = now;
        } else if (this.activePages.size > 5) { // If too many pages are open
            logger.warn(`Too many active pages (${this.activePages.size}). Forcing cleanup of old pages.`);
            await Promise.all(
                Array.from(this.activePages).slice(5).map(page => this.closePage(page)) // Close oldest pages beyond a threshold
            ).catch(e => logger.error('Forced page cleanup error:', e));
        }
    },

    async shutdown() {
        if (this.browser) {
            logger.info('Shutting down Puppeteer browser and all active pages.');
            await Promise.all(
                Array.from(this.activePages).map(page => this.closePage(page))
            ).catch(e => logger.error('Error closing active pages during shutdown:', e));

            await this.browser.close().catch(e => logger.error('Error closing browser during shutdown:', e));
            this.browser = null;
            this.activePages.clear();
            logger.success('Puppeteer browser shut down.');
        }
    }
};

// --- Utility Functions ---
const quantumDelay = (ms) => new Promise(resolve => {
    // Add a random jitter to the delay for more human-like timing
    setTimeout(resolve, ms + crypto.randomInt(500, 2000));
});

async function withRetry(operation, maxRetries = 3, baseDelay = 1000) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await operation();
        } catch (error) {
            attempt++;
            if (attempt >= maxRetries) {
                logger.error(`Operation failed after ${maxRetries} attempts: ${error.message}`);
                throw error; // Re-throw if all retries exhausted
            }

            const delay = baseDelay * Math.pow(2, attempt) + crypto.randomInt(500, 2000); // Exponential backoff with jitter
            logger.warn(`Retrying operation in ${Math.round(delay / 1000)}s (Attempt ${attempt}/${maxRetries}): ${error.message.substring(0, 100)}...`);
            await quantumDelay(delay);
        }
    }
}

/**
 * Attempts to update Render environment variables persistently.
 * @param {object} keysToUpdate - An object where keys are ENV var names and values are their new values.
 */
async function updateRenderEnvironmentVariables(keysToUpdate) {
    const { RENDER_API_TOKEN, RENDER_SERVICE_ID, RENDER_API_BASE_URL } = CONFIG;

    // Check if critical Render API credentials are available
    if (!RENDER_API_TOKEN || String(RENDER_API_TOKEN).includes('PLACEHOLDER') ||
        !RENDER_SERVICE_ID || String(RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        logger.warn('⚠️ Render API token or Service ID missing. Cannot update environment variables persistently.');
        return;
    }

    const apiUrl = `${RENDER_API_BASE_URL}/services/${RENDER_SERVICE_ID}/env-vars`;

    try {
        logger.info('🔄 Fetching current Render environment variables...');
        // Get current environment variables
        const currentEnvResponse = await axios.get(apiUrl, {
            headers: { 'Authorization': `Bearer ${RENDER_API_TOKEN}` },
            timeout: 10000 // 10 seconds timeout
        });
        const currentEnvVars = currentEnvResponse.data;

        // Prepare updates: for each key in keysToUpdate, find existing var or add new
        const updatedEnvVars = currentEnvVars.map(envVar => {
            if (keysToUpdate[envVar.key] !== undefined) { // Check for explicit undefined
                const updatedValue = String(keysToUpdate[envVar.key]); // Ensure string
                logger.info(`🔄 Updating Render ENV: ${envVar.key} from "${String(envVar.value).substring(0, 10)}..." to "${updatedValue.substring(0, 10)}..."`);
                delete keysToUpdate[envVar.key]; // Mark as handled
                return { key: envVar.key, value: updatedValue };
            }
            return envVar;
        });

        // Add any new keys that weren't present in the fetched list
        for (const key in keysToUpdate) {
            const newValue = String(keysToUpdate[key]);
            logger.info(`✨ Adding new Render ENV: ${key} with value "${newValue.substring(0, 10)}..."`);
            updatedEnvVars.push({ key: key, value: newValue });
        }

        logger.info(`Sending PUT request to update ${updatedEnvVars.length} environment variables on Render.`);
        // Send PUT request to update all environment variables
        await axios.put(apiUrl, updatedEnvVars, {
            headers: { 'Authorization': `Bearer ${RENDER_API_TOKEN}`, 'Content-Type': 'application/json' },
            timeout: 15000 // 15 seconds timeout
        });

        logger.success('✅ Successfully updated Render environment variables persistently.');
    } catch (error) {
        logger.error(`🚨 Failed to update Render environment variables: ${error.message}. Response: ${JSON.stringify(error.response?.data || {})}`);
    }
}


// --- Persistent Revenue Tracker ---
class RevenueTracker {
    constructor() {
        this.dataFile = 'revenueData.json';
        this.lock = false; // Simple lock for async file operations
        this.earnings = {}; // Accumulated earnings by platform
        this.activeCampaigns = []; // List of active campaigns
        this.loadData(); // Load initial data on startup
    }

    async acquireLock() {
        while (this.lock) {
            await quantumDelay(50); // Wait until lock is released
        }
        this.lock = true;
    }

    releaseLock() {
        this.lock = false;
    }

    async loadData() {
        await this.acquireLock();
        try {
            // Check if file exists before reading
            if (await fs.access(this.dataFile).then(() => true).catch(() => false)) {
                const data = JSON.parse(await fs.readFile(this.dataFile, 'utf8'));
                this.earnings = data.earnings || {};
                this.activeCampaigns = data.activeCampaigns || [];
                // Ensure historical data is loaded and trimmed
                if (data.historicalRevenue) {
                    historicalRevenueData.push(...data.historicalRevenue.slice(-CONFIG.MAX_HISTORICAL_DATA));
                }
                logger.info('Revenue data loaded from file.');
            } else {
                logger.info('No existing revenue data file found. Starting fresh.');
            }
        } catch (error) {
            logger.error('Failed to load revenue data:', error);
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
                // Only save the relevant portion of historical data to prevent excessive file size
                historicalRevenue: historicalRevenueData.slice(-CONFIG.MAX_HISTORICAL_DATA)
            }, null, 2), 'utf8');
            logger.debug('Revenue data saved to file.');
        } catch (error) {
            logger.error('Failed to save revenue data:', error);
        } finally {
            this.releaseLock();
        }
    }

    getSummary() {
        return {
            totalRevenue: Object.values(this.earnings).reduce((a, b) => a + b, 0),
            byPlatform: { ...this.earnings }, // Return a copy
            campaignCount: this.activeCampaigns.length
        };
    }

    async updatePlatformEarnings(platform, amount) {
        if (typeof amount !== 'number' || isNaN(amount)) {
            logger.warn(`Attempted to update earnings with invalid amount for ${platform}: ${amount}`);
            return;
        }
        await this.acquireLock();
        this.earnings[platform] = (this.earnings[platform] || 0) + amount;
        this.releaseLock();
        await this.saveData(); // Save immediately after update
    }

    async addCampaign(campaign) {
        await this.acquireLock();
        this.activeCampaigns.push(campaign);
        this.releaseLock();
        await this.saveData(); // Save immediately after update
    }

    async resetEarnings() {
        await this.acquireLock();
        this.earnings = {};
        this.releaseLock();
        await this.saveData();
        logger.info('Earnings reset after payout.');
    }
}

// --- Internal Payout Agent for Orchestration ---
class PayoutAgentOrchestrator {
    constructor(tracker) {
        this.tracker = tracker;
        this.executionCount = 0;
        this.lastExecutionTime = null;
        this.lastStatus = 'unknown'; // 'success', 'failed', 'skipped', 'running'
        this.lastPayoutAmount = 0;
    }

    async monitorAndTriggerPayouts(config, logger) {
        this.lastExecutionTime = new Date();
        this.executionCount++;
        this.lastStatus = 'running';

        try {
            logger.info('💰 Payout Agent Orchestrator: Monitoring accumulated earnings for payout...');
            const summary = this.tracker.getSummary();
            const totalAccumulatedRevenue = summary.totalRevenue;

            if (totalAccumulatedRevenue >= CONFIG.PAYOUT_THRESHOLD_USD) {
                const amountToPayout = totalAccumulatedRevenue * CONFIG.PAYOUT_PERCENTAGE;
                logger.info(`✅ Payout threshold met! Accumulated: $${totalAccumulatedRevenue.toFixed(2)}. Attempting to payout $${amountToPayout.toFixed(2)}.`);

                // Call the actual payoutAgent.js module to perform the payout
                const payoutResult = await externalPayoutAgentModule.default.run({ ...config, earnings: amountToPayout }, logger);

                if (payoutResult.status === 'success') {
                    this.lastStatus = 'success';
                    this.lastPayoutAmount = amountToPayout;
                    logger.success(`💸 Successfully triggered payout of $${amountToPayout.toFixed(2)}.`);
                    await this.tracker.resetEarnings(); // Reset earnings after successful payout
                    return { status: 'success', message: `Payout of $${amountToPayout.toFixed(2)} triggered.`, newlyRemediatedKeys: payoutResult.newlyRemediatedKeys };
                } else {
                    this.lastStatus = 'failed';
                    logger.error(`🚨 External Payout Agent failed: ${payoutResult.message || 'Unknown error'}`);
                    return { status: 'failed', message: `External Payout Agent failed: ${payoutResult.message}`, newlyRemediatedKeys: payoutResult.newlyRemediatedKeys };
                }
            } else {
                this.lastStatus = 'skipped';
                logger.info(`ℹ️ Accumulated revenue ($${totalAccumulatedRevenue.toFixed(2)}) below payout threshold ($${CONFIG.PAYOUT_THRESHOLD_USD}). Skipping payout.`);
                return { status: 'skipped', message: 'Below payout threshold.' };
            }
        } catch (error) {
            this.lastStatus = 'failed';
            logger.error(`🚨 Payout Agent Orchestrator failed during monitoring/triggering: ${error.message}`);
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

// --- Main Autonomous System Orchestrator ---
const revenueTracker = new RevenueTracker();
const payoutAgentInstance = new PayoutAgentOrchestrator(revenueTracker); // Instantiate the orchestrator agent

async function runAutonomousRevenueSystem() {
    const cycleStart = Date.now();
    const cycleStats = {
        startTime: new Date().toISOString(),
        success: false,
        duration: 0,
        revenueGenerated: 0, // This will aggregate actual earnings from sub-agents in this cycle
        activities: [], // Log of agent activities within this cycle
        newlyRemediatedKeys: {} // To collect keys for persistent Render update
    };

    try {
        logger.info(`\n--- Starting Autonomous Revenue System Cycle ${cycleCount} ---`);

        // === 1. API Scout Agent: Discovering new opportunities and remediation ===
        const scoutActivity = { agent: 'apiScout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(scoutActivity);
        cycleStats.activities.push(scoutActivity);
        logger.info('📡 Running API Scout Agent...');
        try {
            const scoutResults = await withRetry(() => apiScoutAgent.run(CONFIG, logger));
            if (scoutResults && scoutResults.newlyRemediatedKeys) {
                Object.assign(CONFIG, scoutResults.newlyRemediatedKeys);
                Object.assign(cycleStats.newlyRemediatedKeys, scoutResults.newlyRemediatedKeys);
            }
            if (scoutResults && scoutResults.activeCampaigns) {
                for (const campaign of scoutResults.activeCampaigns) {
                    await revenueTracker.addCampaign(campaign); // Add discovered campaigns
                }
            }
            scoutActivity.action = 'completed';
            scoutActivity.status = scoutResults.status || 'success';
            scoutActivity.details = scoutResults.message || 'Scouting complete.';
        } catch (error) {
            scoutActivity.action = 'failed';
            scoutActivity.status = 'failed';
            scoutActivity.details = `Scouting failed: ${error.message}`;
            logger.error(`API Scout Agent failed: ${error.message}`);
            // Do not throw here, allow other agents to run if possible
        }


        // === 2. Shopify Agent: Sourcing, Listing, and Promotion ===
        const shopifyActivity = { agent: 'shopify', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(shopifyActivity);
        cycleStats.activities.push(shopifyActivity);
        logger.info('🛍️ Running Shopify Agent...');
        try {
            const shopifyResult = await withRetry(() => shopifyAgent.run(CONFIG, logger));
            if (shopifyResult && shopifyResult.newlyRemediatedKeys) {
                Object.assign(CONFIG, shopifyResult.newlyRemediatedKeys);
                Object.assign(cycleStats.newlyRemediatedKeys, shopifyResult.newlyRemediatedKeys);
            }
            const shopifyEarnings = parseFloat(shopifyResult.finalPrice || 0); // Assuming finalPrice is the direct revenue from product listing
            cycleStats.revenueGenerated += shopifyEarnings;
            await revenueTracker.updatePlatformEarnings('shopify', shopifyEarnings);
            shopifyActivity.action = 'completed';
            shopifyActivity.status = shopifyResult.status || 'success';
            shopifyActivity.details = `Sourced & listed product for $${shopifyEarnings.toFixed(2)}.`;
        } catch (error) {
            shopifyActivity.action = 'failed';
            shopifyActivity.status = 'failed';
            shopifyActivity.details = `Shopify operations failed: ${error.message}`;
            logger.error(`Shopify Agent failed: ${error.message}`);
            // Do not throw here, allow other agents to run if possible
        }


        // === 3. Crypto Agent: Market Analysis and On-Chain Trades ===
        const cryptoActivity = { agent: 'crypto', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(cryptoActivity);
        cycleStats.activities.push(cryptoActivity);
        logger.info('💰 Running Crypto Agent...');
        try {
            const cryptoResult = await withRetry(() => cryptoAgent.run(CONFIG, logger));
            if (cryptoResult && cryptoResult.newlyRemediatedKeys) {
                Object.assign(CONFIG, cryptoResult.newlyRemediatedKeys);
                Object.assign(cycleStats.newlyRemediatedKeys, cryptoResult.newlyRemediatedKeys);
            }
            // The crypto agent internally manages its conceptual earnings and passes them to payout.
            // For server.js's cycle revenue, we'll assume crypto's earnings are captured by payoutAgent.
            cryptoActivity.action = 'completed';
            cryptoActivity.status = cryptoResult.status || 'success';
            cryptoActivity.details = `Executed ${cryptoResult.transactions?.length || 0} on-chain transactions.`;
        } catch (error) {
            cryptoActivity.action = 'failed';
            cryptoActivity.status = 'failed';
            cryptoActivity.details = `Crypto operations failed: ${error.message}`;
            logger.error(`Crypto Agent failed: ${error.message}`);
            // Do not throw here, allow payout agent to run if possible
        }


        // === 4. Payout Agent Orchestrator: Manage Funds Distribution ===
        // This orchestrator checks total accumulated revenue from all sources and triggers external payouts
        const payoutActivity = { agent: 'payout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(payoutActivity);
        cycleStats.activities.push(payoutActivity);
        logger.info('💸 Running Payout Agent Orchestrator...');
        try {
            const payoutResult = await withRetry(() => payoutAgentInstance.monitorAndTriggerPayouts(CONFIG, logger));
            if (payoutResult && payoutResult.newlyRemediatedKeys) {
                Object.assign(CONFIG, payoutResult.newlyRemediatedKeys);
                Object.assign(cycleStats.newlyRemediatedKeys, payoutResult.newlyRemediatedKeys);
            }
            payoutActivity.action = 'completed';
            payoutActivity.status = payoutResult.status || 'success';
            payoutActivity.details = payoutResult.message || 'Payout check complete.';
        } catch (error) {
            payoutActivity.action = 'failed';
            payoutActivity.status = 'failed';
            payoutActivity.details = `Payout operations failed: ${error.message}`;
            logger.error(`Payout Agent Orchestrator failed: ${error.message}`);
            // Do not throw here, ensure finally block runs
        }


        // === Post-Agent Execution: Persistent Configuration Update ===
        // If any agent successfully remediated or generated new keys, update Render ENV
        if (Object.keys(cycleStats.newlyRemediatedKeys).length > 0) {
            logger.info(`🔑 Detected ${Object.keys(cycleStats.newlyRemediatedKeys).length} keys for Render ENV update.`);
            await updateRenderEnvironmentVariables(cycleStats.newlyRemediatedKeys);
        } else {
            logger.info('No new keys remediated this cycle to update Render ENV.');
        }


        // Mark cycle as successful if no critical errors halted it completely
        cycleStats.success = true; // Assume success if code reaches here without a thrown error
        successfulCycles++;

        // Update historical revenue data for dashboard trends
        const revenueSnapshot = revenueTracker.getSummary();
        historicalRevenueData.push({
            timestamp: new Date().toISOString(),
            totalRevenue: revenueSnapshot.totalRevenue, // Total accumulated revenue over time
            cycleRevenue: cycleStats.revenueGenerated // Revenue explicitly generated in this specific cycle
        });

        // Trim historical data to manage memory and persistence file size
        if (historicalRevenueData.length > CONFIG.MAX_HISTORICAL_DATA) {
            historicalRevenueData.shift(); // Remove oldest entry
        }

        // Save persistent data
        await revenueTracker.saveData();

        logger.success(`--- Autonomous Revenue System Cycle ${cycleCount} Completed Successfully ---`);
        return { success: true, message: 'Cycle completed successfully.' };

    } catch (error) {
        // Catch any critical errors that were re-thrown from `withRetry` or not handled by agent-specific blocks
        logger.error(`🚨 Autonomous Revenue System Critical Failure in Cycle ${cycleCount}: ${error.message}`, error.stack);
        errorLog.push({
            timestamp: new Date().toISOString(),
            message: error.message,
            stack: error.stack,
            cycle: cycleCount
        });
        cycleStats.success = false;
        return { success: false, error: error.message };
    } finally {
        // Always execute this block regardless of success or failure
        cycleStats.duration = Date.now() - cycleStart;
        lastCycleStats = cycleStats;
        lastDataUpdate = Date.now();
        cycleTimes.push(cycleStats.duration); // Track cycle duration

        // Broadcast current system status and metrics to connected dashboard clients
        broadcastDashboardUpdate();

        // Perform browser cleanup to maintain resource hygiene
        await browserManager.cleanup();
    }
}

// --- Dashboard Functions ---
function getSystemStatus() {
    return {
        status: isRunning ? 'operational' : 'idle',
        uptime: process.uptime(), // Node.js process uptime in seconds
        cycleCount,
        successRate: cycleCount > 0 ? (successfulCycles / cycleCount * 100).toFixed(2) + '%' : '0%',
        lastCycle: lastCycleStats,
        memoryUsage: process.memoryUsage(), // Current Node.js memory usage
        activeCampaigns: revenueTracker.activeCampaigns.length,
        nextCycleIn: Math.max(0, CONFIG.CYCLE_INTERVAL - (Date.now() - lastCycleStart))
    };
}

function getRevenueAnalytics() {
    return {
        ...revenueTracker.getSummary(),
        lastUpdated: new Date(lastDataUpdate).toISOString(),
        historicalTrend: historicalRevenueData // Full historical data for charting
    };
}

function getAgentActivities() {
    // Only return recent activities to prevent excessive data transfer
    return {
        recentActivities: agentActivityLog.slice(-50).reverse(), // Last 50 activities, newest first
        agentStatus: { // Provide status of each orchestrator agent
            apiScoutAgent: apiScoutAgent.getStatus?.(), // Optional chaining for agents that might not have getStatus
            shopifyAgent: {
                 // Placeholder for actual Shopify agent status, assuming it has one
                 lastExecution: 'N/A',
                 lastStatus: 'N/A',
                 totalExecutions: 'N/A'
             },
            cryptoAgent: {
                 // Placeholder for actual Crypto agent status, assuming it has one
                 lastExecution: 'N/A',
                 lastStatus: 'N/A',
                 totalExecutions: 'N/A'
            },
            payoutAgent: payoutAgentInstance.getStatus() // Get status from the orchestrator instance
        }
    };
}

function getFullSystemReport() {
    return {
        systemInfo: {
            version: '1.0.0', // System version
            environment: process.env.NODE_ENV || 'development',
            nodeVersion: process.version
        },
        operationalMetrics: {
            uptime: process.uptime(),
            totalCycles: cycleCount,
            successfulCycles: successfulCycles,
            successRate: cycleCount > 0 ? (successfulCycles / cycleCount * 100).toFixed(2) + '%' : '0%',
            averageCycleTime: cycleTimes.length > 0 ?
                Math.round(cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length) : 0 // Average cycle duration
        },
        revenueSummary: revenueTracker.getSummary(),
        resourceUsage: {
            memory: process.memoryUsage(),
            cpu: process.cpuUsage(), // CPU usage since last call (approx)
            browserSessions: browserManager.activePages.size // Number of open Puppeteer pages
        },
        recentErrors: errorLog.slice(-10).reverse() // Last 10 errors, newest first
    };
}

// Function to broadcast real-time updates to connected WebSocket clients
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

// --- Express Server Setup ---
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Enable CORS for frontend communication
app.use(express.json()); // Enable JSON body parsing
app.use(express.static('public')); // Serve static files from 'public' directory (for dashboard frontend)

// --- API Endpoints ---
// Endpoint to manually trigger a revenue system cycle
app.post('/api/start-revenue-system', async (req, res) => {
    logger.info('Manual trigger for revenue system received.');
    // Prevent concurrent runs from manual trigger if system is already running continuously
    if (isRunning) {
        return res.status(409).json({ success: false, message: 'System is already running in continuous operation mode.' });
    }
    const result = await runAutonomousRevenueSystem();
    res.status(result.success ? 200 : 500).json(result);
});

// Basic health check endpoint
app.get('/api/health', (req, res) => {
    res.json(getSystemStatus());
});

// --- Dashboard Specific API Endpoints ---
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

// --- WebSocket Server Setup ---
function setupWebSocketServer(server) {
    const wss = new WebSocketServer({ server });

    wss.on('connection', (ws) => {
        connectedClients.add(ws);
        logger.info('New WebSocket client connected. Sending initial dashboard data.');

        // Send initial comprehensive data to the newly connected client
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
            logger.info('WebSocket client disconnected.');
        });

        ws.on('error', (error) => {
            logger.error('WebSocket error:', error);
            connectedClients.delete(ws);
        });
    });

    // Handle WebSocket server errors
    wss.on('error', (error) => {
        logger.error('WebSocket server critical error:', error);
    });

    return wss;
}

// --- Continuous Autonomous Operation Loop ---
async function continuousOperation() {
    if (isRunning) {
        logger.warn('Continuous operation already running. Skipping redundant call.');
        return;
    }
    isRunning = true;
    logger.info('Starting continuous autonomous revenue system operation.');

    // Graceful shutdown handler for SIGTERM (e.g., from Render)
    process.on('SIGTERM', async () => {
        logger.info('SIGTERM received. Shutting down gracefully...');
        await browserManager.shutdown(); // Ensure browser is closed
        await revenueTracker.saveData(); // Save any pending data
        process.exit(0); // Exit process
    });

    // Start interval for broadcasting live dashboard updates
    setInterval(broadcastDashboardUpdate, CONFIG.DASHBOARD_UPDATE_INTERVAL);

    // Main loop for continuous revenue generation cycles
    while (true) {
        lastCycleStart = Date.now();
        cycleCount++;

        logger.info(`Initiating cycle #${cycleCount}...`);
        await runAutonomousRevenueSystem(); // Execute the main system logic

        // Calculate precise delay needed to maintain the configured CYCLE_INTERVAL
        const cycleDuration = Date.now() - lastCycleStart;
        const delayNeeded = Math.max(CONFIG.CYCLE_INTERVAL - cycleDuration, 0);
        logger.info(`Cycle #${cycleCount} finished in ${cycleDuration}ms. Next cycle in ${Math.round(delayNeeded / 1000)}s.`);
        await quantumDelay(delayNeeded); // Wait for the remaining time
    }
}

// --- Start Server and System ---
const server = app.listen(PORT, '0.0.0.0', async () => { // Explicitly listen on 0.0.0.0
    logger.success(`Server running on port ${PORT}`);

    // Setup WebSocket Server, passing the HTTP server instance
    setupWebSocketServer(server);

    // Initial browser launch (can be moved to getBrowser for lazy loading)
    await browserManager.getBrowser().catch(e => logger.error('Initial browser launch failed:', e));

    // Start the continuous operation only if not in test environment
    if (process.env.NODE_ENV !== 'test') {
        continuousOperation();
    }
});
