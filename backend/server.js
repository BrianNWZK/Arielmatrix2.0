// =========================================================================
// ArielMatrix Server: Core Autonomous Revenue System (Optimized for BrianNwaezikeChain)
// =========================================================================

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import cron from 'node-cron';
import { Queue } from 'bull'; // Message queue for task management
import { createDatabase } from './database/yourSQLite.js'; // SQLite database setup
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

// --- Logging Setup ---
import winston from 'winston'; // Advanced logging
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'combined.log' })
    ],
});

// --- Complete Configuration for All Agents ---
export const CONFIG = {
    PAYOUT_THRESHOLD_USD: process.env.PAYOUT_THRESHOLD_USD || 500,
    COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
    COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY,
    GOOGLE_ADS_API_KEY: process.env.GOOGLE_ADS_API_KEY,
    META_ADS_API_KEY: process.env.META_ADS_API_KEY,
    NEWS_API_KEY: process.env.NEWS_API_KEY,
    SHOPIFY_STORE_DOMAIN: process.env.SHOPIFY_STORE_DOMAIN,
    SHOPIFY_API_KEY: process.env.SHOPIFY_API_KEY,
    SHOPIFY_PASSWORD: process.env.SHOPIFY_PASSWORD,
    CYCLE_INTERVAL: 600000, // 10 minutes
};

// --- SQLite Database Initialization ---
const db = createDatabase('./data/data.db');

// --- Message Queue Setup ---
const revenueQueue = new Queue('revenueQueue');

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
        payoutAgentInstance.initialize(),
        dataAgentInstance.initialize(),
        shopifyAgentInstance.initialize(),
        browserManagerInstance.initialize(),
        adRevenueAgentInstance.initialize(),
        apiScoutAgentInstance.initialize(),
        cryptoAgentInstance.initialize(),
        forexSignalAgentInstance.initialize(),
        socialAgentInstance.initialize()
    ];
    await Promise.all(initializationPromises);
    logger.success('✅ All agents initialized successfully');
}

// --- Backup and Recovery Mechanism ---
async function backupDatabase() {
    const backupFilePath = `./data/backup_${new Date().toISOString()}.db`;
    await db.backup(backupFilePath); // Implement backup logic in your SQLite module
    logger.info(`Backup completed: ${backupFilePath}`);
}

async function restoreDatabase(backupFilePath) {
    await db.restore(backupFilePath); // Implement restore logic in your SQLite module
    logger.info(`Database restored from: ${backupFilePath}`);
}

// --- Main System Autonomous Revenue Generation Cycle ---
async function runAutonomousRevenueSystem() {
    logger.info('🚀 Autonomous Revenue Generation Cycle Initiated!');

    try {
        // Health Check
        const healthResult = await healthAgent.run(CONFIG, logger);
        if (healthResult.status !== 'optimal') {
            throw new Error('System health check failed. Cycle aborted.');
        }
        logger.success('✅ System health is optimal. Proceeding with agent execution.');

        // Job Queue for Revenue Generation
        revenueQueue.add({ type: 'revenueGeneration' });

        // Process queue jobs
        revenueQueue.process(async (job) => {
            switch (job.data.type) {
                case 'revenueGeneration':
                    await dataAgentInstance.run();
                    await shopifyAgentInstance.run();
                    await adRevenueAgentInstance.run();
                    await apiScoutAgentInstance.run();
                    await cryptoAgentInstance.run();
                    await forexSignalAgentInstance.run();
                    await socialAgentInstance.run();
                    await payoutAgentInstance.runPayoutCycle();
                    logger.success(`🎉 Autonomous Revenue Generation Cycle Completed Successfully!`);
                    break;
            }
        });

    } catch (error) {
        logger.error('Error during autonomous revenue cycle:', error);
    } finally {
        broadcastDashboardUpdate();
    }
}

// --- Dashboard Functions ---
function getSystemStatus() {
    return {
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    };
}

function getAgentActivities() {
    return {
        payoutAgent: payoutAgentInstance.getStatus(),
        dataAgent: dataAgentInstance.getStatus(),
        shopifyAgent: shopifyAgentInstance.getStatus(),
        browserManager: browserManagerInstance.getStatus(),
        adRevenueAgent: adRevenueAgentInstance.getStatus(),
        apiScoutAgent: apiScoutAgentInstance.getStatus(),
        cryptoAgent: cryptoAgentInstance.getStatus(),
        forexSignalAgent: forexSignalAgentInstance.getStatus(),
        socialAgent: socialAgentInstance.getStatus(),
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
    ws.send(JSON.stringify({ type: 'init', data: getSystemStatus() }));
    ws.on('close', () => connectedClients.delete(ws));
});

// Middleware
app.use(cors());
app.use(express.json());

// API Endpoints
app.post('/api/start-revenue-system', async (req, res) => {
    await runAutonomousRevenueSystem();
    res.status(200).json({ success: true, message: 'Revenue system started' });
});

app.post('/api/initialize-agents', async (req, res) => {
    await initializeAllAgents();
    res.json({ success: true });
});

// Backup and Restore Endpoints
app.post('/api/backup', async (req, res) => {
    await backupDatabase();
    res.json({ success: true, message: 'Backup completed' });
});

app.post('/api/restore', async (req, res) => {
    const { backupFilePath } = req.body;
    await restoreDatabase(backupFilePath);
    res.json({ success: true, message: 'Database restored' });
});

// Start Server
server.listen(PORT, async () => {
    logger.success(`Server running on port ${PORT} with WebSocket support`);
    await initializeAllAgents();
});
