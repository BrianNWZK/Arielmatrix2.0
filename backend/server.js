// backend/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import cron from 'node-cron';
import { randomBytes, createHash } from 'node:crypto';

// Fix for __dirname in ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  // Load environment variables directly into a temporary object
  // and prioritize them. Defaults are provided as fallbacks.
  const envVars = {
    RENDER_API_TOKEN: process.env.RENDER_API_TOKEN,
    RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID, // Added for renderApiAgent self-healing
    BSCSCAN_API_KEY: process.env.BSCSCAN_API_KEY,
    ADFLY_API_KEY: process.env.ADFLY_API_KEY,
    ADFLY_USER_ID: process.env.ADFLY_USER_ID,
    SHORTIO_API_KEY: process.env.SHORTIO_API_KEY,
    SHORTIO_USER_ID: process.env.SHORTIO_USER_ID,
    SHORTIO_URL: process.env.SHORTIO_URL?.trim() || 'https://api.short.io',
    AI_EMAIL: process.env.AI_EMAIL || 'arielmatrix@atomicmail.io',
    AI_PASSWORD: process.env.AI_PASSWORD,
    USDT_WALLETS: process.env.USDT_WALLETS?.split(',').map(w => w.trim()).filter(w => w) || [], // Filter out empty strings
    GAS_WALLET: process.env.GAS_WALLET,
    STORE_URL: process.env.STORE_URL,
    ADMIN_SHOP_SECRET: process.env.ADMIN_SHOP_SECRET
  };

  // Define the main CONFIG object
  CONFIG = {
    ...envVars, // Spread the loaded environment variables
    WALLETS: {
      USDT: '0x55d398326f99059fF775485246999027B3197955',
      BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
    },
    PLATFORMS: {
      SHOPIFY: envVars.STORE_URL, // Use the ENV-loaded store URL
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
      console.warn(`⚠️ Warning: Environment variable '${key}' is not set. Some functionalities might be limited.`);
    }
  }

  return CONFIG;
};

// === 🔁 Autonomous Agent Orchestration & Agent Status Tracking ===
let isRunning = false;
const agentStatuses = {
  apiScout: { lastRun: null, success: false, error: null },
  social: { lastRun: null, success: false, error: null },
  shopify: { lastRun: null, success: false, error: null },
  crypto: { lastRun: null, success: false, error: null },
  payout: { lastRun: null, success: false, error: null }, // Added payout agent to tracking
  renderApi: { lastRun: null, success: false, error: null },
};

const runAutonomousCycle = async () => {
  if (isRunning) {
    console.warn('⏳ Autonomous cycle already running. Skipping new cycle initiation.');
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  console.log(`\n⚡ [${new Date().toISOString()}] Starting Autonomous Revenue Cycle`);

  try {
    const config = await loadConfig();

    // Helper to run an agent and update its status
    const runAgent = async (agentName, agentImportPath, config, propertyToSetOnConfig = null) => {
      const agentStart = Date.now();
      console.log(`  - Running ${agentName} agent...`);
      try {
        const agentModule = await import(agentImportPath);
        // Assuming the agent function is named after the agentName (e.g., apiScoutAgent)
        const agentFunction = agentModule[agentName + 'Agent'];
        if (typeof agentFunction !== 'function') {
          throw new Error(`Agent function '${agentName}Agent' not found in ${agentImportPath}`);
        }

        const result = await agentFunction(config);

        // If the agent returns values that need to be incorporated into the config (e.g., API keys)
        if (propertyToSetOnConfig && result && typeof result === 'object') {
            for (const [key, value] of Object.entries(result)) {
                if (value && !config[key]) { // Only add if not already in config
                    config[key] = value;
                    console.log(`    Updated config with ${key} from ${agentName}`);
                }
            }
        }

        agentStatuses[agentName].success = true;
        agentStatuses[agentName].error = null;
        console.log(`  ✅ ${agentName} completed in ${Date.now() - agentStart}ms.`);
        return result;
      } catch (error) {
        agentStatuses[agentName].success = false;
        agentStatuses[agentName].error = error.message;
        console.error(`  🚨 ${agentName} failed in ${Date.now() - agentStart}ms: ${error.message}`);
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

    console.log(`✅ Autonomous Revenue Cycle completed in ${Date.now() - startTime}ms. Revenue generated.`);
  } catch (error) {
    console.error(`🔥 Autonomous cycle failed critically: ${error.message}`);
  } finally {
    isRunning = false;
  }
  console.log(`[${new Date().toISOString()}] Autonomous Revenue Cycle Finished.`);
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
    console.error('🚨 Failed to fetch revenue:', error.message);
    res.status(500).json({ error: 'Failed to fetch revenue', details: error.message });
  }
});

// === 💰 Wallet Balance Fix (Correct BSCScan API Usage) ===
const getWalletBalances = async () => {
  const config = await loadConfig();
  const bscscanUrl = 'https://api.bscscan.com/api';

  // Ensure BSCSCAN_API_KEY is available before making API calls
  if (!config.BSCSCAN_API_KEY) {
      console.warn('⚠️ BSCSCAN_API_KEY is missing. Cannot fetch wallet balances.');
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
            apikey: config.BSCSCAN_API_KEY // Use key from loaded config
          }
        });
        const balance = parseInt(response.data.result || '0') / 1e18;
        return { coin, address, balance: balance.toFixed(4) };
      } catch (error) {
        console.error(`🚨 Error fetching balance for ${coin} (${address}):`, error.message);
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
    agents: Object.keys(agentStatuses), // List all tracked agents
    agentStatuses: agentStatuses // Provide detailed status of each agent
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Autonomous Revenue Engine Live | Quantum ID: ${QuantumSecurity.generateEntropy().slice(0, 8)}`);
  // Delay first cycle slightly to ensure server is fully up
  setTimeout(runAutonomousCycle, 1000);
});

// === ⏱️ Scheduled Execution ===
// Runs the autonomous cycle every 4 hours
cron.schedule('0 */4 * * *', runAutonomousCycle);

// Daily scaling log (example of another scheduled task)
cron.schedule('0 0 * * *', () => { // Every day at midnight UTC
  console.log('🌍 Scaling to 195 countries... [Placeholder]');
  // Add geo-scaling logic here, or trigger another agent
});

export { runAutonomousCycle, loadConfig };
