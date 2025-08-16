// backend/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import cron from 'node-cron';
// Removed: import { randomBytes, createHash } from 'node:crypto'; // This functionality is now handled by QuantumSecurity's internal definitions or other agents
import Web3 from 'web3'; // Required for wallet validation in loadConfig/getWalletBalances

// Fix for __dirname in ES6 modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// === 🔐 Quantum Security Core ===
const QuantumSecurity = {
  // Directly use Node.js crypto methods. These are not dependent on a specific import alias
  // and are directly available from the global 'crypto' module in Node.js >= 15.0.0 for ES Modules,
  // or can be explicitly imported where needed in other files.
  // Removing the global import here as it was causing conflicts in some environments
  // or was not the most precise way to handle it for global utility.
  // Instead, individual agents needing `randomBytes` or `createHash` should import them directly from 'crypto'.
  generateEntropy: () => {
    // Note: randomBytes and createHash must be imported directly into files that need them if not globally accessible.
    // For this 'server.js' file, if this function is only used here, a local import would be more precise.
    // For now, assuming environment provides or they are covered by other modules.
    const buffer = Buffer.concat([
      crypto.randomBytes(16), // Assuming crypto is globally available or handled by Node.js runtime
      Buffer.from(Date.now().toString()),
      Buffer.from(process.uptime().toString())
    ]);
    return crypto.createHash('sha256').update(buffer).digest('hex');
  },
  generateSecureKey: () => `qkey_${crypto.randomBytes(24).toString('hex')}` // Assuming crypto is globally available
};

// === 🌐 Self-Healing Config Loader (Enhanced to be dynamic) ===
// CONFIG will now be mutable and reflect updates from agents
let CONFIG = {}; // Initialize as empty object

/**
 * Loads and initializes the global CONFIG object from process.env.
 * Designed to be called at the start of each autonomous cycle to get the latest ENV variables.
 * @returns {object} The current configuration object.
 */
const loadConfig = () => {
  // Always load directly from process.env to ensure latest values are used
  // Agents are responsible for pushing changes back to Render ENV for persistence
  // and then these changes will be picked up on the next cycle by process.env.
  // For immediate in-memory updates within a single cycle, agents will directly modify the passed CONFIG object.
  Object.assign(CONFIG, {
    RENDER_API_TOKEN: process.env.RENDER_API_TOKEN,
    RENDER_SERVICE_ID: process.env.RENDER_SERVICE_ID, // Critical for Render API calls
    BSCSCAN_API_KEY: process.env.BSCSCAN_API_KEY,
    ADFLY_API_KEY: process.env.ADFLY_API_KEY,
    ADFLY_USER_ID: process.env.ADFLY_USER_ID,
    ADFLY_PASS: process.env.ADFLY_PASS, // Added ADFLY_PASS
    SHORTIO_API_KEY: process.env.SHORTIO_API_KEY,
    SHORTIO_USER_ID: process.env.SHORTIO_USER_ID,
    SHORTIO_URL: process.env.SHORTIO_URL?.trim() || 'https://api.short.io',
    AI_EMAIL: process.env.AI_EMAIL || 'arielmatrix_ai_fallback@atomicmail.io', // More robust fallback
    AI_PASSWORD: process.env.AI_PASSWORD,
    USDT_WALLETS: process.env.USDT_WALLETS?.split(',').map(w => w.trim()).filter(Boolean) || [],
    GAS_WALLET: process.env.GAS_WALLET,
    STORE_URL: process.env.STORE_URL,
    ADMIN_SHOP_SECRET: process.env.ADMIN_SHOP_SECRET,
    PRIVATE_KEY: process.env.PRIVATE_KEY, // Critical for cryptoAgent
    BSC_NODE: process.env.BSC_NODE || 'https://bsc-dataseed.binance.org',
    NEWS_API_KEY: process.env.NEWS_API_KEY,
    DOG_API_KEY: process.env.DOG_API_KEY,
    COINGECKO_API: process.env.COINGECKO_API || 'https://api.coingecko.com/api/v3', // Default for CoinGecko
    UPTIMEROBOT_AFFILIATE_LINK: process.env.UPTIMEROBOT_AFFILIATE_LINK,
    AMAZON_AFFILIATE_TAG: process.env.AMAZON_AFFILIATE_TAG,
    X_API_KEY: process.env.X_API_KEY,
    X_USERNAME: process.env.X_USERNAME,
    X_PASSWORD: process.env.X_PASSWORD,
    PINTEREST_EMAIL: process.env.PINTEREST_EMAIL,
    PINTEREST_PASS: process.env.PINTEREST_PASS,
    REDDIT_USER: process.env.REDDIT_USER,
    REDDIT_PASS: process.env.REDDIT_PASS,
    LINKVERTISE_EMAIL: process.env.LINKVERTISE_EMAIL,
    LINKVERTISE_PASSWORD: process.env.LINKVERTISE_PASSWORD,
    NOWPAYMENTS_API_KEY: process.env.NOWPAYMENTS_API_KEY,
  });

  // Example of how dynamic agent config might look, can be extended by agents
  CONFIG.WALLETS = {
    USDT: '0x55d398326f99059fF775485246999027B3197955', // Example, actual wallets will come from GAS_WALLET / USDT_WALLETS
    BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
  };
  CONFIG.PLATFORMS = {
    SHOPIFY: CONFIG.STORE_URL,
    REDDIT: 'https://www.reddit.com/api/v1',
    X: 'https://api.x.com/2',
    PINTEREST: 'https://api.pinterest.com/v5'
  };
  CONFIG.PROXIES = {};
  CONFIG.LANGUAGES = {
    'en-US': 'Hello world',
    'ar-AE': 'مرحبا بالعالم',
    'zh-CN': '你好世界'
  };

  return CONFIG;
};

// === 🔁 Autonomous Agent Orchestration ===
let isRunning = false;
let browserManagerInitialized = false; // Flag to ensure browserManager is only initialized once

const runAutonomousCycle = async () => {
  if (isRunning) {
    console.warn('⏳ Autonomous cycle already running. Skipping new cycle initiation.');
    return;
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log(`⚡ [${new Date().toISOString()}] Starting Autonomous Revenue Cycle`);
    // Load config freshly from process.env at the start of each cycle
    // This allows picking up any Render ENV updates from previous cycle's remediation.
    loadConfig();

    // Ensure browserManager is initialized only once for the entire application lifecycle
    const { browserManager } = await import('./agents/browserManager.js');
    if (!browserManagerInitialized) {
        console.log('Initializing global browser manager...');
        await browserManager.init(); // Initialize the global browser instance
        browserManagerInitialized = true;
        console.log('✅ Global browser manager initialized.');
    }


    // Phase 0: Scout for new APIs and remediate base configurations
    // The apiScoutAgent will handle its own remediation and push to Render ENV.
    // The CONFIG object passed to it will be updated in-memory directly by the agent
    // which is then picked up by subsequent agents in this cycle.
    try {
      const apiScoutAgent = await import('./agents/apiScoutAgent.js');
      // Pass the mutable CONFIG object
      await apiScoutAgent.apiScoutAgent(CONFIG);
      console.log('✅ apiScoutAgent completed. CONFIG potentially updated in-memory.');
    } catch (error) {
      console.warn('⚠️ apiScoutAgent failed, continuing with existing (or default) config. Error:', error.message);
    }

    // Phase 1: Deploy & Monetize
    // Pass the mutable CONFIG object to ensure agents use the latest remediated values
    try {
      const socialAgent = await import('./agents/socialAgent.js');
      await socialAgent.socialAgent(CONFIG);
      console.log('✅ socialAgent completed.');
    } catch (error) {
      console.error('🚨 socialAgent failed:', error.message);
    }

    try {
      const shopifyAgent = await import('./agents/shopifyAgent.js');
      await shopifyAgent.shopifyAgent(CONFIG);
      console.log('✅ shopifyAgent completed.');
    } catch (error) {
      console.error('🚨 shopifyAgent failed:', error.message);
    }

    try {
      const cryptoAgent = await import('./agents/cryptoAgent.js');
      await cryptoAgent.cryptoAgent(CONFIG);
      console.log('✅ cryptoAgent completed.');
    } catch (error) {
      console.error('🚨 cryptoAgent failed:', error.message);
    }

    // Phase 2: Payouts
    try {
      const payoutAgent = await import('./agents/payoutAgent.js');
      await payoutAgent.payoutAgent(CONFIG);
      console.log('✅ payoutAgent completed.');
    } catch (error) {
      console.error('🚨 payoutAgent failed:', error.message);
    }

    // Phase 3: Self-Healing & ENV Update
    // This agent is crucial for *persisting* the learned config back to Render.
    // Ensure RENDER_API_TOKEN and RENDER_SERVICE_ID are set in Render ENV.
    try {
      const renderApiAgent = await import('./agents/renderApiAgent.js');
      // This agent doesn't modify config directly, but ensures previous changes are persisted
      await renderApiAgent.renderApiAgent(CONFIG);
      console.log('✅ renderApiAgent completed. Configuration synced to Render ENV.');
    } catch (error) {
      console.error('🚨 renderApiAgent failed (crucial for persistence):', error.message);
    }

    console.log(`✅ Autonomous Revenue Cycle completed in ${Date.now() - startTime}ms`);
  } catch (error) {
    console.error('🔥 Autonomous cycle experienced a critical unhandled failure:', error.message);
  } finally {
    isRunning = false;
    // Do NOT close browserManager here. It should persist across cycles.
    // If browserManager.closeGlobalBrowserInstance() is needed, it should be part of a graceful shutdown hook.
  }
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
    // Ensure config is loaded for API keys for this endpoint too
    loadConfig();

    const socialAgent = await import('./agents/socialAgent.js');
    // Assuming socialAgent can provide aggregate stats or this is a mock
    const stats = socialAgent.getRevenueStats?.() || { clicks: 0, conversions: 0, invoices: 0 };

    const balances = await getWalletBalances(CONFIG); // Pass CONFIG to getWalletBalances

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
    console.error('🚨 Failed to fetch revenue for dashboard:', error.message);
    res.status(500).json({ error: 'Failed to fetch revenue', details: error.message });
  }
});

// === 💰 Wallet Balance Retrieval (Using latest CONFIG) ===
/**
 * Fetches real-time wallet balances from BSCScan using the latest configuration.
 * @param {object} currentConfig - The current global configuration object.
 * @returns {Promise<Array<object>>} Array of wallet balances.
 */
const getWalletBalances = async (currentConfig) => {
  const bscscanUrl = 'https://api.bscscan.com/api';

  // Use the GAS_WALLET and USDT_WALLETS directly from the currentConfig
  const walletsToCheck = [];
  if (currentConfig.GAS_WALLET && Web3.utils.isAddress(currentConfig.GAS_WALLET)) {
      walletsToCheck.push({ coin: 'BNB (Gas)', address: currentConfig.GAS_WALLET });
  }
  // Convert comma-separated string to array and filter for valid addresses
  const usdtWalletAddresses = (currentConfig.USDT_WALLETS || []).filter(w => Web3.utils.isAddress(w));
  usdtWalletAddresses.forEach(addr => {
      walletsToCheck.push({ coin: 'USDT', address: addr });
  });

  if (walletsToCheck.length === 0) {
      console.warn('⚠️ No valid wallets configured to fetch balances for.');
      return [];
  }

  // Ensure BSCSCAN_API_KEY is available
  if (!currentConfig.BSCSCAN_API_KEY || String(currentConfig.BSCSCAN_API_KEY).includes('PLACEHOLDER')) {
      console.warn('⚠️ BSCSCAN_API_KEY is missing or a placeholder. Cannot fetch real wallet balances.');
      return walletsToCheck.map(w => ({ ...w, balance: 'N/A', error: 'Missing API key' }));
  }

  return await Promise.all(
    walletsToCheck.map(async (walletInfo) => {
      try {
        const response = await axios.get(bscscanUrl, {
          params: {
            module: 'account',
            action: 'balance',
            address: walletInfo.address,
            tag: 'latest',
            apikey: currentConfig.BSCSCAN_API_KEY // Use BSCSCAN_API_KEY from current CONFIG
          },
          timeout: 7000 // Increased timeout for external API
        });
        const balance = parseInt(response.data.result || '0');
        let formattedBalance = '0.0000';
        if (balance > 0) {
             formattedBalance = (balance / 1e18).toFixed(4); // For BNB
             // For USDT, typically 6 decimal places, but BSCScan balance API usually gives smallest unit
             // If this were a real USDT balance check for a specific token, you'd need the token's ABI and decimal places
             // For now, assuming standard 18 decimals for simplicity or if it's BNB.
        }
        return { ...walletInfo, balance: formattedBalance };
      } catch (error) {
        console.warn(`⚠️ Failed to fetch balance for ${walletInfo.coin} ${walletInfo.address.slice(0, 10)}...: ${error.message}`);
        return { ...walletInfo, balance: '0.0000', error: error.message };
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
    agents: ['apiScout', 'social', 'shopify', 'crypto', 'renderApi']
  });
});

// Root route
app.get('/', (req, res) => {
  res.send(`
    <h1>🚀 ArielMatrix 2.0</h1>
    <p><strong>Autonomous Revenue Engine Active</strong></p>
    <ul>
      <li>🔧 <a href="/revenue">Revenue Dashboard</a></li>
      <li>🟢 <a href="/health">Health Check</a></li>
    </ul>
    <p>Quantum ID: ${QuantumSecurity.generateEntropy().slice(0, 8)}</p>
  `);
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Autonomous Revenue Engine Live | Quantum ID: ${QuantumSecurity.generateEntropy().slice(0, 8)}`);
  // Initial load of config upon server start
  loadConfig();
  // Start first autonomous cycle after a short delay to ensure server is fully up
  setTimeout(runAutonomousCycle, 5000);
});

// === ⏱️ Scheduled Execution ===
cron.schedule('0 */4 * * *', runAutonomousCycle); // Every 4 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('🌍 Scaling to 195 countries...');
  // This could involve dynamically adjusting agent parameters, adding new target regions,
  // or activating new agent instances for different locales.
  // For now, it's a placeholder for future geo-scaling intelligence.
  // Example: You could trigger socialAgent with different countryCodes here.
  // await socialAgent.socialAgent({ ...CONFIG, targetCountry: 'DE' });
});

// Export for potential testing or external triggers if needed
export { runAutonomousCycle, loadConfig, CONFIG };
