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

// --- Import CORE agents only (removed unnecessary dependencies) ---
import PayoutAgent from './agents/payoutAgent.js';
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

// --- Simplified Configuration for BrianNwaezikeChain ---
export const CONFIG = {
    // --- Core System & Payout Agent Foundational Config ---
    PAYOUT_THRESHOLD_USD: process.env.PAYOUT_THRESHOLD_USD || 500,
    
    // BrianNwaezikeChain Specific Configuration
    COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
    COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY,
    USE_FALLBACK_PAYOUT: process.env.USE_FALLBACK_PAYOUT || 'false',
    
    // Removed all RPC URLs and blockchain dependencies
    // BrianNwaezikeChain handles everything internally
    
    // --- System Cycle Intervals (hardcoded constants) ---
    CYCLE_INTERVAL: 600000, // 10 minutes
    HEALTH_REPORT_INTERVAL: 12, // Hours
    DASHBOARD_UPDATE_INTERVAL: 5000, // Milliseconds
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

// --- Payout Agent Initialization (Simplified for BrianNwaezikeChain) ---
const payoutAgentInstance = new PayoutAgent(CONFIG, logger);

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

        // 3. Payout Agent: Distribute accumulated revenue using BrianNwaezikeChain
        const payoutActivity = { agent: 'payout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(payoutActivity);
        cycleStats.activities.push(payoutActivity);
        
        // Initialize payout agent if needed
        if (!payoutAgentInstance.initialized) {
            await payoutAgentInstance.initialize();
        }
        
        const payoutResult = await payoutAgentInstance.runPayoutCycle();
        payoutActivity.action = 'completed';
        payoutActivity.status = payoutResult?.status || 'success';
        logger.info(`Payout Agent Result: ${payoutResult?.message || 'Payout cycle completed'}`);

        cycleStats.success = true;
        logger.success('🎉 Autonomous Revenue Generation Cycle Completed Successfully!');
        return { success: true, message: 'Cycle completed' };

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
    if (isCycleLocked) {
        return res.status(409).json({ success: false, message: 'System already running' });
    }
    const result = await runAutonomousRevenueSystem();
    res.status(result.success ? 200 : 500).json(result);
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

app.get('/api/health', (req, res) => res.json(getSystemStatus()));
app.get('/api/dashboard/status', (req, res) => res.json(getSystemStatus()));
app.get('/api/dashboard/agents', (req, res) => res.json(getAgentActivities()));

// Schedule periodic operations using node-cron (every 10 minutes)
cron.schedule('*/10 * * * *', () => {
    runAutonomousRevenueSystem().catch(err => {
        logger.error('Scheduled autonomous revenue cycle failed:', err);
    });
});

// Start Server
server.listen(PORT, () => {
    logger.success(`Server running on port ${PORT} with WebSocket support`);
    // Initialize Payout Agent
    payoutAgentInstance.initialize().then(() => {
        if (process.env.NODE_ENV !== 'test') {
            runAutonomousRevenueSystem();
        }
    }).catch(err => {
        logger.error('Failed to initialize Payout Agent on startup:', err);
    });
});
