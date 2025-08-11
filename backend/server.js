// backend/server.js
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import axios from 'axios';
import Web3 from 'web3';
import tf from '@tensorflow/tfjs-node';
import cron from 'node-cron';

// Import Agents
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

// Resolve __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 10000;

// ✅ SERVE FRONTEND FROM CORRECT BUILD PATH
const frontendBuildPath = path.resolve(__dirname, '../frontend/dist');

// Ensure fallback to public if dist not found (during dev)
const staticPath = await fs.existsSync(frontendBuildPath)
  ? frontendBuildPath
  : path.resolve(__dirname, 'public');

app.use(express.static(staticPath));
console.log(`Serving static files from: ${staticPath}`);

// Configuration
const CONFIG = {
  STORE_URL: process.env.STORE_URL || 'https://tracemarkventures.myshopify.com',
  STORE_KEY: process.env.STORE_KEY,
  STORE_SECRET: process.env.STORE_SECRET,
  ADMIN_SHOP_SECRET: process.env.ADMIN_SHOP_SECRET,
  COINGECKO_API: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
  X_API: 'https://api.x.com/2/tweets/search/recent',
  BSC_NODE: 'https://bsc-dataseed.binance.org/',
  BSCSCAN_API: 'https://api.bscscan.com/api',
  USDT_WALLETS: process.env.USDT_WALLETS ? process.env.USDT_WALLETS.split(',') : [],
  GAS_WALLET: process.env.GAS_WALLET,
  BSCSCAN_API_KEY: process.env.BSCSCAN_API_KEY,
  RENDER_API_TOKEN: process.env.RENDER_API_TOKEN,
  STRIPE_API_KEY: process.env.STRIPE_API_KEY,
};

// Autonomous Agents
const runAgents = async () => {
  try {
    console.log('🔄 Running agent suite...');
    await healthAgent(CONFIG);
    const keys = await apiKeyAgent(CONFIG);

    // Set runtime environment variables
    process.env.NEWS_API_KEY = keys.NEWS_API_KEY;
    process.env.WEATHER_API_KEY = keys.WEATHER_API_KEY;
    process.env.X_API_KEY = keys.X_API_KEY;
    process.env.BSCSCAN_API_KEY = keys.BSCSCAN_API_KEY;
    process.env.REDDIT_API_KEY = keys.REDDIT_API_KEY;
    process.env.SOLANA_API_KEY = keys.SOLANA_API_KEY;

    await renderApiAgent(CONFIG);
    await contractDeployAgent(CONFIG);
    await shopifyAgent(CONFIG);
    await cryptoAgent(CONFIG);
    await dataAgent(CONFIG);
    await socialAgent(CONFIG);
    await complianceAgent(CONFIG);
    await adRevenueAgent(CONFIG);
    await forexSignalAgent(CONFIG);

    console.log('✅ Agent suite completed successfully.');
  } catch (error) {
    console.error('🚨 Agent Error:', error.message);
    setTimeout(runAgents, 10000); // Retry after 10s
  }
};

// ✅ Schedule Daily Run (Avoid Overuse)
cron.schedule('0 0 * * *', () => {
  console.log('📅 Daily cron job triggered: Running agents...');
  runAgents();
});

// ML Model for Revenue Optimization
const optimizeRevenue = async (data) => {
  try {
    // ✅ Use absolute path for Docker compatibility
    const modelPath = path.join(__dirname, 'model.json');
    const model = await tf.loadLayersModel(`file://${modelPath}`);
    const input = tf.tensor2d([[data.price, data.demand]]);
    const prediction = model.predict(input);
    const result = prediction.dataSync()[0];
    input.dispose();
    prediction.dispose();
    return Math.max(0, result); // Prevent negative pricing
  } catch (error) {
    console.error('🤖 Revenue Optimization Error:', error);
    return data.price * 1.1; // Fallback: slight markup
  }
};

// === API ENDPOINTS ===

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

app.get('/dashboard', async (req, res) => {
  try {
    const balances = await Promise.all(
      CONFIG.USDT_WALLETS.map(async (wallet) => {
        try {
          const response = await axios.get(
            `${CONFIG.BSCSCAN_API}?module=account&action=tokenbalance&contractaddress=0x55d398326f99059ff775485246999027b3197955&address=${wallet.trim()}&tag=latest&apikey=${process.env.BSCSCAN_API_KEY || CONFIG.BSCSCAN_API_KEY}`
          );

          if (response.data.status === "0") {
            console.warn(`BscScan Error for ${wallet}:`, response.data.message);
            return { wallet, balance: 0 };
          }

          const balance = parseFloat(response.data.result) / 1e18;
          return { wallet, balance };
        } catch (err) {
          console.error(`Failed to fetch balance for ${wallet}:`, err.message);
          return { wallet, balance: 'Error' };
        }
      })
    );
    res.json(balances);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch balances' });
  }
});

app.get('/shopify/products', async (req, res) => {
  try {
    const response = await axios.get(`${CONFIG.STORE_URL}/products.json`);
    const products = response.data.products.map(p => ({
      id: p.id,
      title: p.title,
      price: p.variants[0].price
    }));
    res.json(products);
  } catch (error) {
    console.error('Shopify fetch error:', error.message);
    res.status(500).json({ error: 'Failed to load products' });
  }
});

app.get('/ad-revenue', async (req, res) => {
  try {
    const stats = await adRevenueAgent(CONFIG);
    res.json({ stats });
  } catch (error) {
    res.status(500).json({ error: 'Ad revenue fetch failed' });
  }
});

app.get('/forex-signals', async (req, res) => {
  try {
    const signals = await forexSignalAgent(CONFIG);
    res.json({ signals });
  } catch (error) {
    res.status(500).json({ error: 'Forex signal fetch failed' });
  }
});

app.get('/bitcoin-price', async (req, res) => {
  try {
    const response = await axios.get(CONFIG.COINGECKO_API);
    res.json({ price: response.data.bitcoin.usd });
  } catch (error) {
    res.status(500).json({ error: 'Bitcoin price fetch failed' });
  }
});

// ✅ SPA Fallback: Serve index.html for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// ✅ Start Server
app.listen(port, '0.0.0.0', () => {
  console.log(`✅ Server running on port ${port}`);
  console.log(`🌐 Access your app at: https://arielmatrix2-0-jgk6.onrender.com`);
  runAgents(); // Start agent loop
});
