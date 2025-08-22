// =========================================================================
// ArielMatrix Server: Core Autonomous Revenue System (Updated)
// =========================================================================

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import crypto from 'crypto';
import { ethers } from 'ethers';
import cron from 'node-cron';
import 'dotenv/config'; // Loads environment variables from .env file (for local development)

// --- Import ALL agents ---
// Note: Agents are imported here but their configuration access is now decentralized.
// Each agent will access process.env directly for its specific needs,
// trusting ConfigAgent to have populated them.
import PayoutAgent from './agents/payoutAgent.js';
import * as healthAgent from './agents/healthAgent.js';
import * => console.error(`[${new Date().toISOString()}] ERROR:`, ...args),
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
let isRunning = false; // This variable is not currently used to control the cycle, but could be for a global system state.
let isCycleLocked = false; // Controls if a cycle is already running to prevent overlaps.

// --- Payout Agent Initialization (using CONFIG internally, now with RPC_URLS_BY_TOKEN) ---
const payoutAgentInstance = new PayoutAgent(CONFIG, logger);

// --- Main System Autonomous Revenue Generation Cycle ---
async function runAutonomousRevenueSystem() {
    if (isCycleLocked) {
        logger.warn('Cycle already in progress. Skipping this scheduled run.');
        return;
    }

    isCycleLocked = true; // Acquire lock to prevent concurrent runs
    const cycleStart = Date.now();
    const cycleStats = {
        startTime: new Date().toISOString(),
        success: false,
        duration: 0,
        activities: [],
    };

    logger.info('🚀 Autonomous Revenue Generation Cycle Initiated!');

    try {
        // --- Agent Orchestration: Run all agents sequentially ---

        // 1. Health Agent: Critical prerequisite check
        const healthActivity = { agent: 'health', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(healthActivity);
        cycleStats.activities.push(healthActivity);
        const healthResult = await healthAgent.run(CONFIG, logger); // Health Agent checks overall system health
        healthActivity.action = 'completed';
        healthActivity.status = healthResult.status;
        if (healthResult.status !== 'optimal') {
            logger.error(`🚨 System health check failed. Skipping autonomous cycle.`);
            throw new Error('System health check failed. Cycle aborted.');
        }
        logger.success('✅ System health is optimal. Proceeding with agent execution.');


        // 2. Config Agent: Ensure configurations are up-to-date in Render environment
        // ConfigAgent's crucial role: source dynamic keys (via ApiScoutAgent/BrowserManager)
        // and then use its RENDER_API_TOKEN and RENDER_SERVICE_ID from CONFIG to update Render's process.env.
        // It *must* ensure all required keys for other agents are in place.
        const configActivity = { agent: 'config', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(configActivity);
        cycleStats.activities.push(configActivity);
        const configResult = await configAgent.run(CONFIG, logger);
        configActivity.action = 'completed';
        configActivity.status = configResult.status;
        if (configResult.status !== 'success') {
             logger.error(`❌ Config Agent failed to ensure all parameters. Cycle aborted.`);
             throw new Error('Config Agent failed to ensure all parameters. Cycle aborted.');
        }
        logger.info(`Config Agent Result: ${configResult.message}`);


        // From here, subsequent agents will directly access process.env for their configs,
        // trusting that ConfigAgent has already ensured they are populated.

        // 3. Shopify Agent: Generate revenue from e-commerce
        const shopifyActivity = { agent: 'shopify', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(shopifyActivity);
        cycleStats.activities.push(shopifyActivity);
        const shopifyResult = await shopifyAgent.run(CONFIG, logger); // CONFIG may still pass some general logger/cycle info
        shopifyActivity.action = 'completed';
        shopifyActivity.status = shopifyResult?.status || 'success';
        logger.info(`Shopify Agent Result: ${shopifyResult.message}`);


        // 4. Ad Revenue Agent: Generate revenue from advertisements
        const adRevenueActivity = { agent: 'adRevenue', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(adRevenueActivity);
        cycleStats.activities.push(adRevenueActivity);
        const adRevenueResult = await adRevenueAgent.run(CONFIG, logger);
        adRevenueActivity.action = 'completed';
        adRevenueActivity.status = adRevenueResult?.status || 'success';
        logger.info(`Ad Revenue Agent Result: ${adRevenueResult.message}`);


        // 5. Data Agent: Generate revenue from data processing/sales
        const dataActivity = { agent: 'data', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(dataActivity);
        cycleStats.activities.push(dataActivity);
        const dataResult = await dataAgent.run(CONFIG, logger);
        dataActivity.action = 'completed';
        dataActivity.status = dataResult?.status || 'success';
        logger.info(`Data Agent Result: ${dataResult.message}`);


        // 6. Crypto Agent: Generate revenue from cryptocurrency operations (mining, trading, staking etc.)
        const cryptoActivity = { agent: 'crypto', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(cryptoActivity);
        cycleStats.activities.push(cryptoActivity);
        const cryptoResult = await cryptoAgent.run(CONFIG, logger);
        cryptoActivity.action = 'completed';
        cryptoActivity.status = cryptoResult?.status || 'success';
        logger.info(`Crypto Agent Result: ${cryptoResult.message}`);


        // 7. Social Agent: Generate revenue from social media interactions
        const socialActivity = { agent: 'social', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(socialActivity);
        cycleStats.activities.push(socialActivity);
        const socialResult = await socialAgent.run(CONFIG, logger);
        socialActivity.action = 'completed';
        socialActivity.status = socialResult?.status || 'success';
        logger.info(`Social Agent Result: ${socialResult.message}`);


        // 8. API Scout Agent: Discover and leverage new API revenue opportunities
        const apiScoutActivity = { agent: 'apiScout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(apiScoutActivity);
        cycleStats.activities.push(apiScoutActivity);
        const apiScoutResult = await apiScoutAgent.run(CONFIG, logger);
        apiScoutActivity.action = 'completed';
        apiScoutActivity.status = apiScoutResult?.status || 'success';
        logger.info(`API Scout Agent Result: ${apiScoutResult.message}`);


        // 9. Forex Signal Agent: Generate revenue from forex trading signals
        const forexSignalActivity = { agent: 'forexSignal', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(forexSignalActivity);
        cycleStats.activities.push(forexSignalActivity);
        const forexSignalResult = await forexSignalAgent.run(CONFIG, logger);
        forexSignalActivity.action = 'completed';
        forexSignalActivity.status = forexSignalResult?.status || 'success';
        logger.info(`Forex Signal Agent Result: ${forexSignalResult.message}`);


        // 10. Contract Deploy Agent: Manages deployment of smart contracts for revenue streams
        const contractDeployActivity = { agent: 'contractDeploy', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(contractDeployActivity);
        cycleStats.activities.push(contractDeployActivity);
        const contractDeployResult = await contractDeployAgent.run(CONFIG, logger);
        contractDeployActivity.action = 'completed';
        contractDeployActivity.status = contractDeployResult?.status || 'success';
        logger.info(`Contract Deploy Agent Result: ${contractDeployResult.message}`);


        // 11. Compliance Agent: Ensures all revenue activities are compliant (non-revenue generating, but critical)
        const complianceActivity = { agent: 'compliance', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(complianceActivity);
        cycleStats.activities.push(complianceActivity);
        const complianceResult = await complianceAgent.run(CONFIG, logger);
        complianceActivity.action = 'completed';
        complianceActivity.status = complianceResult?.status || 'success';
        logger.info(`Compliance Agent Result: ${complianceResult.message}`);


        // 12. Payout Agent: Distributes accumulated revenue (final revenue-related step)
        const payoutActivity = { agent: 'payout', action: 'start', timestamp: new Date().toISOString() };
        agentActivityLog.push(payoutActivity);
        cycleStats.activities.push(payoutActivity);
        // Ensure the payout agent is initialized before running
        if (!payoutAgentInstance.wallet) {
            await payoutAgentInstance.init(); // Init needs RPC_URLS_BY_TOKEN from CONFIG for provider setup
        }
        // PayoutAgent will now select the correct RPC from CONFIG.RPC_URLS_BY_TOKEN based on the token to payout.
        const payoutResult = await payoutAgentInstance.run();
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
        isCycleLocked = false; // Release lock
        cycleStats.duration = Date.now() - cycleStart;
        lastCycleStats = cycleStats;
        broadcastDashboardUpdate(); // Update dashboard after cycle
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
            shopifyAgent: shopifyAgent.getStatus?.(),
            adRevenueAgent: adRevenueAgent.getStatus?.(),
            apiScoutAgent: apiScoutAgent.getStatus?.(),
            complianceAgent: complianceAgent.getStatus?.(),
            contractDeployAgent: contractDeployAgent.getStatus?.(),
            cryptoAgent: cryptoAgent.getStatus?.(),
            dataAgent: dataAgent.getStatus?.(),
            forexSignalAgent: forexSignalAgent.getStatus?.(),
            socialAgent: socialAgent.getStatus?.(),
            // adsenseApi and browserManager are typically helper modules, not agents with standalone status
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
    if (!payoutAgentInstance.wallet) {
        await payoutAgentInstance.init();
    }

    isCycleLocked = true; // Acquire lock for manual payout
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
        isCycleLocked = false; // Release lock
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
    // Initialize Payout Agent and then run the first autonomous cycle (if not in test env)
    payoutAgentInstance.init().then(() => {
        if (process.env.NODE_ENV !== 'test') {
            runAutonomousRevenueSystem();
        }
    }).catch(err => {
        logger.error('Failed to initialize Payout Agent on startup:', err);
        // Consider if the server should exit or continue in a degraded state here
    });
});
