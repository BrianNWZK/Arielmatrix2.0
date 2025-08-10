import express from 'express';
import path from 'path';
import axios from 'axios';
import Web3 from 'web3';
import tf from '@tensorflow/tfjs-node';
import cron from 'node-cron';
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

const app = express();
const port = process.env.PORT || 10000;

// Serve static files from frontend
app.use(express.static(path.join(process.cwd(), 'public')));

// Configuration
const CONFIG = {
  STORE_URL: process.env.STORE_URL || 'https://skh4pq-9d.myshopify.com',
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
    await healthAgent(CONFIG);
    const keys = await apiKeyAgent(CONFIG);
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
  } catch (error) {
    console.error('Agent Error:', error);
    setTimeout(runAgents, 5000);
  }
};

// Schedule agents to run daily at midnight
cron.schedule('0 0 * * *', () => {
  console.log('Running daily agent execution');
  runAgents();
});

// ML Model for Revenue Optimization
const optimizeRevenue = async (data) => {
  try {
    const model = await tf.loadLayersModel('file://./model.json');
    const input = tf.tensor([data.price, data.demand]);
    const prediction = model.predict(input);
    const result = prediction.dataSync()[0];
    input.dispose();
    prediction.dispose();
    return result;
  } catch (error) {
    console.error('Revenue Optimization Error:', error);
    return 0;
  }
};

// API Endpoints
app.get('/health', (req, res) => res.status(200).send('OK'));

app.get('/dashboard', async (req, res) => {
  try {
    const balances = await Promise.all(
      CONFIG.USDT_WALLETS.map(async (wallet) => {
        const response = await axios.get(
          `${CONFIG.BSCSCAN_API}?module=account&action=tokenbalance&contractaddress=0x55d398326f99059ff775485246999027b3197955&address=${wallet}&tag=latest&apikey=${process.env.BSCSCAN_API_KEY || CONFIG.BSCSCAN_API_KEY}`
        );
        return { wallet, balance: response.data.result / 1e18 };
      })
    );
    res.json(balances);
  } catch (error) {
    console.error('Dashboard Error:', error);
    res.status(500).json({ error: 'Failed to fetch wallet balances' });
  }
});

app.get('/shopify/products', async (req, res) => {
  try {
    const products = await shopifyAgent(CONFIG);
    res.json(products);
  } catch (error) {
    console.error('Shopify Products Error:', error);
    res.status(500).json({ error: 'Failed to fetch Shopify products' });
  }
});

app.get('/ad-revenue', async (req, res) => {
  try {
    const adStats = await adRevenueAgent(CONFIG);
    res.json({ stats: adStats });
  } catch (error) {
    console.error('Ad Revenue Error:', error);
    res.status(500).json({ error: 'Failed to fetch ad revenue stats' });
  }
});

app.get('/forex-signals', async (req, res) => {
  try {
    const signals = await forexSignalAgent(CONFIG);
    res.json({ signals });
  } catch (error) {
    console.error('Forex Signals Error:', error);
    res.status(500).json({ error: 'Failed to fetch forex signals' });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  runAgents();
});
