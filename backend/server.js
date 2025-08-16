// backend/server.js
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cron from 'node-cron';
import { apiScoutAgent } from './agents/apiScoutAgent.js'; // apiScoutAgent now includes Render API interactions
import { twitterAgent } from './agents/twitterAgent.js';
import { transactionMonitorAgent } from './agents/transactionMonitorAgent.js';
import { getGlobalBrowserInstance, closeGlobalBrowserInstance } from './utils/browserManager.js';
import { config as dotenvConfig } from 'dotenv';

// Load environment variables from .env file
dotenvConfig();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Adjust in production
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

// Centralized Configuration Object
// IMPORTANT: In a real production environment, never expose sensitive keys directly in client-side code
// and manage them securely (e.g., AWS Secrets Manager, Google Secret Manager, Azure Key Vault).
const CONFIG = {
    AI_EMAIL: process.env.AI_EMAIL || 'ai_scout_email@example.com',
    AI_PASSWORD: process.env.AI_PASSWORD || 'ai_scout_password',
    LINKVERTISE_EMAIL: process.env.LINKVERTISE_EMAIL || 'linkvertise_email@example.com',
    LINKVERTISE_PASSWORD: process.env.LINKVERTISE_PASSWORD || 'linkvertise_password',
    SHORTIO_API_KEY: process.env.SHORTIO_API_KEY || 'YOUR_SHORTIO_API_KEY',
    SHORTIO_PASSWORD: process.env.SHORTIO_PASSWORD || 'YOUR_SHORTIO_PASSWORD',
    SHORTIO_USER_ID: process.env.SHORTIO_USER_ID || 'YOUR_SHORTIO_USER_ID',
    SHORTIO_URL: process.env.SHORTIO_URL || 'YOUR_SHORTIO_URL',
    ADFLY_API_KEY: process.env.ADFLY_API_KEY || 'YOUR_ADFLY_API_KEY',
    ADFLY_USER_ID: process.env.ADFLY_USER_ID || 'YOUR_ADFLY_USER_ID',
    ADFLY_PASS: process.env.ADFLY_PASS || 'YOUR_ADFLY_PASS', // Adfly password
    NOWPAYMENTS_EMAIL: process.env.NOWPAYMENTS_EMAIL || 'nowpayments_email@example.com',
    NOWPAYMENTS_PASSWORD: process.env.NOWPAYMENTS_PASSWORD || 'nowpayments_password',
    NOWPAYMENTS_API_KEY: process.env.NOWPAYMENTS_API_KEY || 'YOUR_NOWPAYMENTS_API_KEY',
    NEWS_API: process.env.NEWS_API || 'YOUR_NEWS_API_KEY',
    CAT_API_KEY: process.env.CAT_API_KEY || 'YOUR_CAT_API_KEY',
    DOG_API_KEY: process.env.DOG_API_KEY || 'YOUR_DOG_API_KEY',
    TWITTER_APP_KEY: process.env.TWITTER_APP_KEY || 'YOUR_TWITTER_APP_KEY',
    TWITTER_APP_SECRET: process.env.TWITTER_APP_SECRET || 'YOUR_TWITTER_APP_SECRET',
    TWITTER_ACCESS_TOKEN: process.env.TWITTER_ACCESS_TOKEN || 'YOUR_TWITTER_ACCESS_TOKEN',
    TWITTER_ACCESS_SECRET: process.env.TWITTER_ACCESS_SECRET || 'YOUR_TWITTER_ACCESS_SECRET',
    RENDER_API_TOKEN: process.env.RENDER_API_TOKEN || 'PLACEHOLDER_RENDER_API_TOKEN', // Used by apiScoutAgent for self-healing
    RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID || 'PLACEHOLDER_RENDER_SERVICE_ID', // Used by apiScoutAgent for self-healing
    PRIVATE_KEY: process.env.PRIVATE_KEY || 'YOUR_BSC_WALLET_PRIVATE_KEY', // For transactionMonitor and apiScout
    BSC_NODE: process.env.BSC_NODE || 'https://bsc-dataseed.binance.org', // BSC Node URL
    USDT_WALLETS: process.env.USDT_WALLETS || '0xYourWalletAddress1,0xYourWalletAddress2', // Comma-separated
    TWITTER_USER_ID: process.env.TWITTER_USER_ID || 'YOUR_TWITTER_USER_ID', // For Twitter Agent
    TWITTER_BEARER_TOKEN: process.env.TWITTER_BEARER_TOKEN || 'YOUR_TWITTER_BEARER_TOKEN', // For Twitter Agent
    BSCSCAN_API_KEY: process.env.BSCSCAN_API_KEY || 'YOUR_BSCSCAN_API_KEY', // For transactionMonitor and API scout
    COINMARKETCAP_API_KEY: process.env.COINMARKETCAP_API_KEY || 'YOUR_COINMARKETCAP_API_KEY', // For API scout
    COINGECKO_API: process.env.COINGECKO_API || 'https://api.coingecko.com/api/v3', // For API scout
};

// Middleware to parse JSON bodies
app.use(express.json());

// Basic route
app.get('/', (req, res) => {
    res.send('ArielMatrix Backend is running!');
});

// === Scheduled Tasks ===
// Schedule API Scout Agent to run daily at a specific time (e.g., 2:00 AM)
cron.schedule('0 2 * * *', async () => {
    console.log('🤖 Running API Scout Agent (Daily Scan)...');
    try {
        const report = await apiScoutAgent(CONFIG);
        io.emit('agentReport', { agent: 'apiScout', status: 'completed', report });
        console.log('API Scout Agent Daily Scan Completed:', report);
    } catch (error) {
        console.error('Error running API Scout Agent daily:', error);
        io.emit('agentReport', { agent: 'apiScout', status: 'error', message: error.message });
    }
}, {
    timezone: "Etc/UTC" // Use UTC to avoid timezone issues
});


// Schedule Twitter Agent to run every 6 hours
cron.schedule('0 */6 * * *', async () => {
    console.log('🐦 Running Twitter Agent...');
    try {
        const tweetResult = await twitterAgent(CONFIG);
        io.emit('agentReport', { agent: 'twitter', status: 'completed', tweetResult });
        console.log('Twitter Agent Run Completed:', tweetResult);
    } catch (error) {
        console.error('Error running Twitter Agent:', error);
        io.emit('agentReport', { agent: 'twitter', status: 'error', message: error.message });
    }
}, {
    timezone: "Etc/UTC"
});


// Schedule Transaction Monitor Agent to run every 15 minutes
cron.schedule('*/15 * * * *', async () => {
    console.log('💰 Running Transaction Monitor Agent...');
    try {
        const monitoringReport = await transactionMonitorAgent(CONFIG);
        io.emit('agentReport', { agent: 'transactionMonitor', status: 'completed', monitoringReport });
        console.log('Transaction Monitor Agent Run Completed:', monitoringReport);
    } catch (error) {
        console.error('Error running Transaction Monitor Agent:', error);
        io.emit('agentReport', { agent: 'transactionMonitor', status: 'error', message: error.message });
    }
}, {
    timezone: "Etc/UTC"
});


// API endpoint to manually trigger agents (for testing/debugging)
app.post('/trigger-agent/:agentName', async (req, res) => {
    const { agentName } = req.params;
    console.log(`Manual trigger requested for: ${agentName}`);
    let report;
    try {
        switch (agentName) {
            case 'apiScout':
                report = await apiScoutAgent(CONFIG);
                break;
            case 'twitter':
                report = await twitterAgent(CONFIG);
                break;
            case 'transactionMonitor':
                report = await transactionMonitorAgent(CONFIG);
                break;
            default:
                return res.status(404).json({ error: 'Agent not found' });
        }
        io.emit('agentReport', { agent: agentName, status: 'manual_completed', report });
        res.status(200).json({ status: 'triggered', agent: agentName, report });
    } catch (error) {
        console.error(`Error manually triggering ${agentName} agent:`, error);
        io.emit('agentReport', { agent: agentName, status: 'manual_error', message: error.message });
        res.status(500).json({ error: `Failed to trigger ${agentName} agent`, details: error.message });
    }
});


// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A client connected:', socket.id);

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });

    // You can add more socket event handlers here if needed
});

// Start the server
httpServer.listen(PORT, async () => {
    console.log(`ArielMatrix Backend listening on port ${PORT}`);
    // Initialize the global browser instance when the server starts
    await getGlobalBrowserInstance();
});

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM signal received: closing HTTP server and browser...');
    await closeGlobalBrowserInstance(); // Close the global browser instance
    httpServer.close(() => {
        console.log('HTTP server closed. Exiting process.');
        process.exit(0);
    });
});

process.on('SIGINT', async () => {
    console.log('SIGINT signal received: closing HTTP server and browser...');
    await closeGlobalBrowserInstance(); // Close the global browser instance
    httpServer.close(() => {
        console.log('HTTP server closed. Exiting process.');
        process.exit(0);
    });
});
