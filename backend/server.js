// =========================================================================
// ArielMatrix Server: Core Autonomous Revenue System
// =========================================================================

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import crypto from 'crypto';
import { ethers } from 'ethers';
import cron from 'node-cron';
// Mutex dependency removed, replaced with custom lock
import 'dotenv/config';

// --- Import all agents ---
import PayoutAgent from './agents/payoutAgent.js';
import * as healthAgent from './agents/healthAgent.js';
import * as configAgent from './agents/configAgent.js';
import * as shopifyAgent from './agents/shopifyAgent.js';

// --- Configuration ---
// The 'export' keyword is added here to make CONFIG available to other modules
export const CONFIG = {
    // Other configurations (e.g., API keys) are now loaded from .env
    PAYOUT_THRESHOLD_USD: process.env.PAYOUT_THRESHOLD_USD || 500,
    SMART_CONTRACT_ADDRESS: process.env.SMART_CONTRACT_ADDRESS,
    MASTER_PRIVATE_KEY: process.env.MASTER_PRIVATE_KEY,
    RPC_URL: process.env.RPC_URL,
    REVENUE_DISTRIBUTOR_ABI: JSON.parse(process.env.REVENUE_DISTRIBUTOR_ABI || '[]'),
    // ... other config variables
    CYCLE_INTERVAL: 600000,
    HEALTH_REPORT_INTERVAL: 12,
    DASHBOARD_UPDATE_INTERVAL: 5000,
};

// --- Enhanced Logger ---
const logger = {
    info: (...args) => console.log(`[${new Date().toISOString()}] INFO:`, ...args),
    warn: (...args) => console.warn(`[${new Date().toISOString()}] WARN:`, ...args),
    error: (...args) => console.error(`[${new Date().toISOString()}] ERROR:`, ...args),
    success: (...args) => console.log(`[${new Date().toISOString()}] SUCCESS:`, ...args),
    debug: (...args) => { if (process.env.NODE_ENV === 'development') console.log(`[${new Date().toISOString()}] DEBUG:`, ...args); }
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
let lastCycleStart = 0;
let isRunning = false;
// Replaced Mutex with a simple flag
let isCycleLocked = false; 

// --- Payout Agent Initialization (The new one-key system) ---
const payoutAgentInstance = new PayoutAgent(CONFIG, logger);

// --- Main System ---
async function runAutonomousRevenueSystem() {
    // Check the custom lock flag
    if (isCycleLocked) {
        logger.warn('Cycle already in progress. Skipping this scheduled run.');
        return;
    }

    // Set the lock flag before starting the critical section
    isCycleLocked = true;
    const cycleStart = Date.now();
    const cycleStats = {
        startTime: new Date().toISOString(),
        success: false,
        duration: 0,
        activities: [],
    };

    try {
        // Health Agent Check
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
        logger.success('✅ System health is optimal. Proceeding with the cycle.');

        // Run Payout Agent
        const payoutActivity = { agent: 'payout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(payoutActivity);
        cycleStats.activities.push(payoutActivity);
        
        if (!payoutAgentInstance.wallet) {
            await payoutAgentInstance.init();
        }

        const payoutResult = await payoutAgentInstance.run();
        payoutActivity.action = 'completed';
        payoutActivity.status = payoutResult?.status || 'success';
        
        cycleStats.success = true;
        return { success: true, message: 'Cycle completed' };

    } catch (error) {
        cycleStats.success = false;
        logger.error('Error during autonomous revenue cycle:', error);
        return { success: false, error: error.message };
    } finally {
        // Always release the lock, even if an error occurs
        isCycleLocked = false;
        cycleStats.duration = Date.now() - cycleStart;
        lastCycleStats = cycleStats;
        broadcastDashboardUpdate();
    }
}

// --- Dashboard Functions ---
function getSystemStatus() {
    return {
        status: isCycleLocked ? 'operational' : 'idle', // Updated status check
        uptime: process.uptime(),
        lastCycle: lastCycleStats,
        memoryUsage: process.memoryUsage(),
    };
}

function getAgentActivities() {
    return {
        recentActivities: agentActivityLog.slice(-50).reverse(),
        agentStatus: {
            payoutAgent: payoutAgentInstance.getStatus?.(),
            healthAgent: healthAgent.getStatus?.(),
            configAgent: configAgent.getStatus?.(),
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
    if (isCycleLocked) { // Check custom lock
        return res.status(409).json({ success: false, message: 'System already running' });
    }
    const result = await runAutonomousRevenueSystem();
    res.status(result.success ? 200 : 500).json(result);
});

// NEW: Endpoint to manually trigger a payout
app.post('/api/trigger-payout', async (req, res) => {
    logger.info('Manual payout trigger requested.');
    if (isCycleLocked) { // Check custom lock
        return res.status(409).json({ success: false, message: 'System already busy' });
    }
    if (!payoutAgentInstance.wallet) {
        await payoutAgentInstance.init();
    }

    // Use the custom lock for this critical operation as well
    isCycleLocked = true;
    try {
        const result = await payoutAgentInstance.run();
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

app.get('/api/health', (req, res) => res.json(getSystemStatus()));
app.get('/api/dashboard/status', (req, res) => res.json(getSystemStatus()));
app.get('/api/dashboard/agents', (req, res) => res.json(getAgentActivities()));

// Schedule periodic operations using node-cron
cron.schedule('*/10 * * * *', () => {
    runAutonomousRevenueSystem().catch(err => {
        logger.error('Scheduled operation failed:', err);
    });
});

// Start Server
server.listen(PORT, () => {
    logger.success(`Server running on port ${PORT} with WebSocket support`);
    payoutAgentInstance.init().then(() => {
        if (process.env.NODE_ENV !== 'test') {
            runAutonomousRevenueSystem();
        }
    });
});
