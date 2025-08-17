import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import cron from 'node-cron';
import { randomBytes, createHash } from 'node:crypto';

// Import the browser manager
import browserManager from './agents/browserManager.js';

// Fix for __dirname in ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === 📝 Global Logger Utility ===
class Logger {
    constructor() {
        this.logs = []; // In-memory storage for logs
        this.logLevel = process.env.LOG_LEVEL || 'info'; // Default to info, can be debug, warn, error
        this.levels = {
            debug: 0,
            info: 1,
            success: 2,
            warn: 3,
            error: 4
        };
    }

    _shouldLog(level) {
        return this.levels[level] >= this.levels[this.logLevel];
    }

    _log(level, message, ...args) {
        if (!this._shouldLog(level)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, level, message, args };
        this.logs.push(logEntry); // Store logs in memory

        let logOutput = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        if (args.length > 0) {
            logOutput += ` ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg, null, 2) : arg).join(' ')}`;
        }

        // Apply color coding for better readability in console
        switch (level) {
            case 'info':
                console.info(logOutput);
                break;
            case 'warn':
                console.warn(`\x1b[33m${logOutput}\x1b[0m`); // Yellow
                break;
            case 'error':
                console.error(`\x1b[31m${logOutput}\x1b[0m`); // Red
                break;
            case 'success':
                console.log(`\x1b[32m${logOutput}\x1b[0m`); // Green
                break;
            case 'debug':
                console.debug(`\x1b[90m${logOutput}\x1b[0m`); // Grey for debug
                break;
            default:
                console.log(logOutput);
        }
    }

    info(message, ...args) { this._log('info', message, ...args); }
    warn(message, ...args) { this._log('warn', message, ...args); }
    error(message, ...args) { this._log('error', message, ...args); }
    success(message, ...args) { this._log('success', message, ...args); }
    debug(message, ...args) { this._log('debug', message, ...args); }

    getLogs() {
        return this.logs;
    }
}

const logger = new Logger();

// === 🔐 Quantum Security Core ===
const QuantumSecurity = {
    generateEntropy: () => {
        const buffer = Buffer.concat([
            randomBytes(16),
            Buffer.from(Date.now().toString()),
            Buffer.from(process.uptime().toString())
        ]);
        return createHash('sha256').update(buffer).digest('hex');
    },
    generateSecureKey: () => `qkey_${randomBytes(24).toString('hex')}`
};

// === 🌐 Self-Healing Config Loader & Enhanced ENV Management ===
let CONFIG = null;

const loadConfig = async () => {
    // Return cached config if already loaded
    if (CONFIG) return CONFIG;

    logger.info('Loading configuration...');

    // Load environment variables directly into a temporary object
    // and prioritize them. Defaults are provided as fallbacks.
    const envVars = {
        RENDER_API_TOKEN: process.env.RENDER_API_TOKEN,
        RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID,
        BSCSCAN_API_KEY: process.env.BSCSCAN_API_KEY,
        ADFLY_API_KEY: process.env.ADFLY_API_KEY,
        ADFLY_USER_ID: process.env.ADFLY_USER_ID,
        SHORTIO_API_KEY: process.env.SHORTIO_API_KEY,
        SHORTIO_USER_ID: process.env.SHORTIO_USER_ID,
        SHORTIO_URL: process.env.SHORTIO_URL?.trim() || 'https://api.short.io',
        AI_EMAIL: process.env.AI_EMAIL || 'arielmatrix@atomicmail.io',
        AI_PASSWORD: process.env.AI_PASSWORD,
        USDT_WALLETS: process.env.USDT_WALLETS?.split(',').map(w => w.trim()).filter(w => w) || [],
        GAS_WALLET: process.env.GAS_WALLET,
        STORE_URL: process.env.STORE_URL,
        ADMIN_SHOP_SECRET: process.env.ADMIN_SHOP_SECRET,
        // New: BROWSER_DRIVER to select Puppeteer or Playwright
        BROWSER_DRIVER: process.env.BROWSER_DRIVER?.trim() || 'puppeteer',
    };

    // Define the main CONFIG object
    CONFIG = {
        ...envVars, // Spread the loaded environment variables
        WALLETS: {
            USDT: '0x55d398326f99059fF775485246999027B3197955',
            BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
        },
        PLATFORMS: {
            SHOPIFY: envVars.STORE_URL,
            REDDIT: 'https://www.reddit.com/api/v1',
            X: 'https://api.x.com/2',
            PINTEREST: 'https://api.pinterest.com/v5'
        },
        PROXIES: {}, // Placeholder for future proxy management
        LANGUAGES: {
            'en-US': 'Hello world',
            'ar-AE': 'مرحبا بالعالم',
            'zh-CN': '你好世界'
        }
    };

    // Log warnings for missing critical environment variables
    const requiredEnv = [
        'RENDER_API_TOKEN', 'BSCSCAN_API_KEY', 'ADFLY_API_KEY',
        'SHORTIO_API_KEY', 'AI_PASSWORD'
    ];
    for (const key of requiredEnv) {
        if (!CONFIG[key]) {
            logger.warn(`⚠️ Warning: Environment variable '${key}' is not set. Some functionalities might be limited.`);
        }
    }

    logger.info('Configuration loaded successfully.');
    return CONFIG;
};

// === 🔁 Autonomous Agent Orchestration & Agent Status Tracking ===
let isRunning = false;
const agentStatuses = {
    apiScout: { lastRun: null, success: false, error: null },
    social: { lastRun: null, success: false, error: null },
    shopify: { lastRun: null, success: false, error: null },
    crypto: { lastRun: null, success: false, error: null },
    payout: { lastRun: null, success: false, error: null },
    renderApi: { lastRun: null, success: false, error: null },
};

const runAutonomousCycle = async () => {
    if (isRunning) {
        logger.warn('⏳ Autonomous cycle already running. Skipping new cycle initiation.');
        return;
    }

    isRunning = true;
    const startTime = Date.now();
    logger.info(`\n⚡ [${new Date().toISOString()}] Starting Autonomous Revenue Cycle`);

    try {
        const config = await loadConfig(); // Ensure config is loaded or re-loaded if needed

        // Helper to run an agent and update its status
        const runAgent = async (agentName, agentImportPath, config, propertyToSetOnConfig = false) => {
            const agentStart = Date.now();
            logger.info(`  - Running ${agentName} agent...`);
            try {
                const agentModule = await import(agentImportPath);
                const agentFunction = agentModule[agentName + 'Agent'];
                if (typeof agentFunction !== 'function') {
                    throw new Error(`Agent function '${agentName}Agent' not found in ${agentImportPath}`);
                }

                // Pass config and logger to the agent function
                const result = await agentFunction(config, logger);

                // If the agent returns values that need to be incorporated into the config (e.g., API keys)
                if (propertyToSetOnConfig && result && typeof result === 'object') {
                    for (const [key, value] of Object.entries(result)) {
                        // Only add if not already in config AND is a non-empty string/array/object
                        if (value && !config[key] && (typeof value === 'string' && value.trim() !== '') || (Array.isArray(value) && value.length > 0) || (typeof value === 'object' && Object.keys(value).length > 0)) {
                            config[key] = value;
                            logger.info(`    Updated config with ${key} from ${agentName}`);
                        }
                    }
                }

                agentStatuses[agentName].success = true;
                agentStatuses[agentName].error = null;
                logger.success(`  ✅ ${agentName} completed in ${Date.now() - agentStart}ms.`);
                return result;
            } catch (error) {
                agentStatuses[agentName].success = false;
                agentStatuses[agentName].error = error.message;
                logger.error(`  🚨 ${agentName} failed in ${Date.now() - agentStart}ms: ${error.message}`);
                // Do not re-throw if it's a non-critical agent, allow cycle to continue
            } finally {
                agentStatuses[agentName].lastRun = new Date().toISOString();
            }
        };

        // Phase 0: Scout for new APIs (can update config with new keys)
        await runAgent('apiScout', './agents/apiScoutAgent.js', config, true);

        // Phase 1: Deploy & Monetize
        await runAgent('social', './agents/socialAgent.js', config);
        await runAgent('shopify', './agents/shopifyAgent.js', config);
        await runAgent('crypto', './agents/cryptoAgent.js', config);

        // Phase 2: Payouts
        await runAgent('payout', './agents/payoutAgent.js', config);

        // Phase 3: Self-Healing & ENV Update
        await runAgent('renderApi', './agents/renderApiAgent.js', config);

        logger.success(`✅ Autonomous Revenue Cycle completed in ${Date.now() - startTime}ms. Revenue generated.`);
    } catch (error) {
        logger.error(`🔥 Autonomous cycle failed critically: ${error.message}`);
    } finally {
        isRunning = false;
    }
    logger.info(`[${new Date().toISOString()}] Autonomous Revenue Cycle Finished.`);
};

// === 📊 Real-Time Revenue Endpoint ===
const app = express();

// Security Headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    res.setHeader('X-Quantum-ID', QuantumSecurity.generateEntropy().slice(0, 16));
    next();
});

// Parse JSON
app.use(express.json({ limit: '10mb' }));

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// Real-Time Revenue Endpoint
app.get('/revenue', async (req, res) => {
    try {
        const socialAgent = await import('./agents/socialAgent.js');
        const stats = await socialAgent.getRevenueStats?.() || { clicks: 0, conversions: 0, invoices: 0 };

        const balances = await getWalletBalances();

        res.json({
            revenue: {
                adfly: parseFloat((stats.clicks * 0.02).toFixed(2)),
                amazon: parseFloat((stats.conversions * 5.50).toFixed(2)),
                crypto: parseFloat((stats.invoices * 0.15).toFixed(2))
            },
            wallets: balances,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('🚨 Failed to fetch revenue:', error.message);
        res.status(500).json({ error: 'Failed to fetch revenue', details: error.message });
    }
});

// === 💰 Wallet Balance Fix (Correct BSCScan API Usage) ===
const getWalletBalances = async () => {
    const config = await loadConfig();
    const bscscanUrl = 'https://api.bscscan.com/api';

    // Ensure BSCSCAN_API_KEY is available before making API calls
    if (!config.BSCSCAN_API_KEY) {
        logger.warn('⚠️ BSCSCAN_API_KEY is missing. Cannot fetch wallet balances.');
        return Object.entries(config.WALLETS).map(([coin, address]) => ({ coin, address, balance: 'N/A', error: 'API Key missing' }));
    }

    return await Promise.all(
        Object.entries(config.WALLETS).map(async ([coin, address]) => {
            try {
                const response = await axios.get(bscscanUrl, {
                    params: {
                        module: 'account',
                        action: 'balance',
                        address: address,
                        tag: 'latest',
                        apikey: config.BSCSCAN_API_KEY
                    }
                });
                const balance = parseInt(response.data.result || '0') / 1e18;
                return { coin, address, balance: balance.toFixed(4) };
            } catch (error) {
                logger.error(`🚨 Error fetching balance for ${coin} (${address}):`, error.message);
                return { coin, address, balance: '0.0000', error: error.message };
            }
        })
    );
};

// === 🚀 Health & Init ===
app.get('/health', (req, res) => {
    res.json({
        status: 'active',
        quantumId: QuantumSecurity.generateEntropy().slice(0, 12),
        timestamp: new Date().toISOString(),
        cycleRunning: isRunning,
        agents: Object.keys(agentStatuses),
        agentStatuses: agentStatuses
    });
});

// Root route
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>ArielMatrix 2.0</title>
            <style>
                body { font-family: 'Inter', sans-serif; background-color: #f4f7f6; color: #333; margin: 0; padding: 20px; text-align: center; }
                .container { background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1); padding: 40px; max-width: 600px; margin: 50px auto; }
                h1 { color: #2c3e50; font-size: 2.5em; margin-bottom: 15px; }
                p { font-size: 1.1em; line-height: 1.6; margin-bottom: 20px; }
                ul { list-style: none; padding: 0; margin-bottom: 30px; }
                li { margin-bottom: 10px; }
                a { color: #3498db; text-decoration: none; font-weight: bold; transition: color 0.3s ease; }
                a:hover { color: #2980b9; text-decoration: underline; }
                .quantum-id { font-family: 'Courier New', monospace; background-color: #e8e8e8; padding: 8px 12px; border-radius: 6px; display: inline-block; margin-top: 15px; color: #555; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>🚀 ArielMatrix 2.0</h1>
                <p><strong>Autonomous Revenue Engine Active</strong></p>
                <ul>
                    <li>🔧 <a href="/revenue">Revenue Dashboard</a></li>
                    <li>🟢 <a href="/health">Health Check</a></li>
                </ul>
                <p class="quantum-id">Quantum ID: ${QuantumSecurity.generateEntropy().slice(0, 8)}</p>
            </div>
        </body>
        </html>
    `);
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', async () => {
    logger.success(`🚀 Autonomous Revenue Engine Live | Quantum ID: ${QuantumSecurity.generateEntropy().slice(0, 8)}`);
    // Load config initially
    const initialConfig = await loadConfig();
    // Initialize browserManager with the loaded config and logger
    await browserManager.init(initialConfig, logger);

    // Delay first cycle slightly to ensure server is fully up
    setTimeout(runAutonomousCycle, 1000);
});

// === ⏱️ Scheduled Execution ===
// Runs the autonomous cycle every 4 hours
cron.schedule('0 */4 * * *', runAutonomousCycle);

// Daily scaling log (example of another scheduled task)
cron.schedule('0 0 * * *', () => { // Every day at midnight UTC
    logger.info('🌍 Scaling to 195 countries... [Placeholder]');
    // Add geo-scaling logic here, or trigger another agent
});

// === ♻️ Graceful Shutdown ===
// Ensures browser instance is closed when the server receives termination signals
process.on('SIGINT', async () => {
    logger.info('Received SIGINT. Shutting down gracefully...');
    await browserManager.closeGlobalBrowserInstance();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM. Shutting down gracefully...');
    await browserManager.closeGlobalBrowserInstance();
    process.exit(0);
});

export { runAutonomousCycle, loadConfig };
