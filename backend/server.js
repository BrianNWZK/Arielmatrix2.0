// backend/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import tf from '@tensorflow/tfjs-node';
import cron from 'node-cron';

// Agents
import { shopifyAgent } from './agents/shopifyAgent.js';
import { cryptoAgent } from './agents/cryptoAgent.js';
import { dataAgent } from './agents/dataAgent.js';
import { socialAgent } from './agents/socialAgent.js';
import { complianceAgent } from './agents/complianceAgent.js';
import { healthAgent } from './agents/healthAgent.js';
import { apiKeyAgent } from './agents/apiKeyAgent.js';
import { renderApiAgent } from './agents/renderApiAgent.js';
import { contractDeployAgent } from './agents/contractDeployAgent.js';
import { adRevenueAgent } from './agents/adRevenueAgent.js';
import { forexSignalAgent } from './agents/forexSignalAgent.js';

// Autonomous Ecosystem
import { payoutAgent, mintRevenueNFT, scaleTo195Countries } from './agents/autonomousEcosystem.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 10000;

// Security & Performance Headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// Serve frontend
const frontendBuildPath = path.resolve(__dirname, '../frontend/dist');
app.use(express.static(frontendBuildPath));

// CONFIG - ALL REAL, NO MOCKS
const CONFIG = {
  STORE_URL: process.env.STORE_URL || 'https://tracemarkventures.myshopify.com',
  ADMIN_SHOP_SECRET: process.env.ADMIN_SHOP_SECRET,
  COINGECKO_API: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
  X_API: 'https://api.x.com/2/tweets/search/recent',
  BSC_NODE: 'https://bsc-dataseed.binance.org/',
  BSCSCAN_API: 'https://api.bscscan.com/api',
  USDT_WALLETS: [
    '0x1515a63013cc44c143c3d3cd1fcaeec180b7d076',
    '0xA708F155827C3e542871AE9f273fC7B92e16BBa9',
    '0x3f8d463512f100b62e5d1f543be170acaeac8114',
  ],
  GAS_WALLET: '0x04eC5979f05B76d334824841B8341AFdD78b2aFC',
  BSCSCAN_API_KEY: process.env.BSCSCAN_API_KEY,
  RENDER_API_TOKEN: process.env.RENDER_API_TOKEN,
  STRIPE_API_KEY: process.env.STRIPE_API_KEY,
  NOWPAYMENTS_API_KEY: process.env.NOWPAYMENTS_API_KEY,
  ADFLY_API_KEY: process.env.ADFLY_API_KEY,
  ADFLY_USER_ID: process.env.ADFLY_USER_ID,
  AMAZON_AFFILIATE_TAG: process.env.AMAZON_AFFILIATE_TAG || 'your-amazon-tag',
  UPTIMEROBOT_AFFILIATE_LINK: process.env.UPTIMEROBOT_AFFILIATE_LINK || 'https://uptimerobot.com/?ref=yourid',
};

// Autonomous Execution
let isRunning = false;
const runAgents = async () => {
  if (isRunning) {
    console.warn('Agents already running, skipping...');
    return;
  }

  isRunning = true;
  try {
    console.log('🔄 Starting agent execution cycle...');

    await healthAgent(CONFIG);
    const keys = await apiKeyAgent(CONFIG);

    // Inject real keys into env and config
    Object.assign(process.env, keys);
    Object.assign(CONFIG, keys);

    await renderApiAgent(CONFIG);
    await contractDeployAgent(CONFIG);
    await shopifyAgent(CONFIG);
    await cryptoAgent(CONFIG);
    await dataAgent(CONFIG);
    await socialAgent(CONFIG);
    await complianceAgent(CONFIG);
    await adRevenueAgent(CONFIG);
    await forexSignalAgent(CONFIG);

    console.log('✅ Agent cycle completed successfully.');
  } catch (error) {
    console.error('🔥 Agent execution failed:', error.message || error);
  } finally {
    isRunning = false;
  }
};

// Run immediately on startup
runAgents();

// Schedule every 4 hours
cron.schedule('0 */4 * * *', () => {
  if (!isRunning) {
    runAgents().catch(console.error);
  } else {
    console.log('⏩ Skipping scheduled run: agents already executing.');
  }
});

// === INTEGRATE AUTONOMOUS ECOSYSTEM ===
// Run enhanced agents every 6 hours
cron.schedule('0 */6 * * *', async () => {
  console.log('🌍 Running enhanced autonomous ecosystem...');
  try {
    if (CONFIG.ADFLY_API_KEY && CONFIG.BSCSCAN_API_KEY) {
      await payoutAgent(CONFIG);
      await scaleTo195Countries();
    } else {
      console.log('🔑 Waiting for API keys before running enhanced agents...');
    }
  } catch (error) {
    console.error('🚨 Enhanced agent cycle failed:', error.message);
  }
});

// Health & Revenue Endpoints
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/revenue', async (req, res) => {
  try {
    const stats = await socialAgent(CONFIG);
    res.json({
      timestamp: new Date().toISOString(),
      status: 'active',
      wallets: CONFIG.USDT_WALLETS,
      ...stats,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch revenue data',
      timestamp: new Date().toISOString(),
    });
  }
});

// ✅ NEW: Wallet Balances Endpoint
app.get('/api/wallet-balances', async (req, res) => {
  try {
    const balances = await Promise.all(
      CONFIG.USDT_WALLETS.map(async (wallet) => {
        const response = await axios.get(
          `https://api.bscscan.com/api?module=account&action=tokenbalance&contractaddress=0x55d398326f99059ff775485246999027b3197955&address=${wallet}&tag=latest&apikey=${CONFIG.BSCSCAN_API_KEY}`
        );
        const balanceInWei = response.data.result;
        const balanceInUSDT = parseFloat(balanceInWei) / 1e18;
        return { wallet, balance: balanceInUSDT };
      })
    );
    res.json(balances);
  } catch (error) {
    console.error('Wallet balance error:', error.message);
    res.status(500).json({ error: 'Failed to fetch wallet balances' });
  }
});

// ✅ NEW: Shopify Products Endpoint
app.get('/api/shopify-products', async (req, res) => {
  try {
    const response = await axios.get(
      `${CONFIG.STORE_URL}/admin/api/2024-07/products.json`,
      {
        headers: {
          'X-Shopify-Access-Token': CONFIG.ADMIN_SHOP_SECRET,
          'Content-Type': 'application/json'
        }
      }
    );
    const products = response.data.products.map(p => ({
      title: p.title,
      price: p.variants[0].price,
      image: p.image?.src || null
    }));
    res.json(products);
  } catch (error) {
    console.error('Shopify API error:', error.message);
    res.status(500).json({ error: 'Failed to fetch Shopify products' });
  }
});

// SPA Fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(frontendBuildPath, 'index.html'), (err) => {
    if (err) {
      res.status(404).send('Page not found');
    }
  });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Arielmatrix2.0 Live on port ${port}`);
});
