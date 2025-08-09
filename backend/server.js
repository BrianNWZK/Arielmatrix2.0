import express from 'express';
import path from 'path';
import axios from 'axios';
import Web3 from 'web3';
import * as tf from '@tensorflow/tfjs'; // Updated import
import { shopifyAgent } from './agents/shopifyAgent.js';
import { cryptoAgent } from './agents/cryptoAgent.js';
import { dataAgent } from './agents/dataAgent.js';
import { socialAgent } from './agents/socialAgent.js';
import { complianceAgent } from './agents/complianceAgent.js';
import { healthAgent } from './agents/healthAgent.js';
import { apiKeyAgent } from './agents/apiKeyAgent.js';
import { renderApiAgent } from './agents/renderApiAgent.js';
import { contractDeployAgent } from './agents/contractDeployAgent.js';

const app = express();
const port = process.env.PORT || 3000;

// Serve static files from frontend
app.use(express.static(path.join(process.cwd(), 'public')));

// Configuration
const CONFIG = {
  STORE_URL: process.env.STORE_URL || 'https://skh4pq-9d.myshopify.com',
  STORE_KEY: process.env.STORE_KEY,
  STORE_SECRET: process.env.STORE_SECRET,
  ADMIN_SHOP_SECRET: process.env.ADMIN_SHOP_SECRET,
  COINGECKO_API: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd',
  TWITTER_API: 'https://api.twitter.com/2/tweets/search/recent',
  BSC_NODE: 'https://bsc-dataseed.binance.org/',
  BSCSCAN_API: 'https://api.bscscan.com/api',
  USDT_WALLETS: process.env.USDT_WALLETS ? process.env.USDT_WALLETS.split(',') : [],
  GAS_WALLET: process.env.GAS_WALLET,
  BSCSCAN_API_KEY: process.env.BSCSCAN_API_KEY,
  RENDER_API_TOKEN: process.env.RENDER_API_TOKEN,
};

// Autonomous Agents
const runAgents = async () => {
  try {
    await healthAgent(CONFIG);
    await apiKeyAgent(CONFIG);
    await renderApiAgent(CONFIG);
    await contractDeployAgent(CONFIG);
    await shopifyAgent(CONFIG);
    await cryptoAgent(CONFIG);
    await dataAgent(CONFIG);
    await socialAgent(CONFIG);
    await complianceAgent(CONFIG);
  } catch (error) {
    console.error('Agent Error:', error);
    setTimeout(runAgents, 5000);
  }
};

// ML Model for Revenue Optimization
const optimizeRevenue = async (data) => {
  try {
    const model = await tf.loadLayersModel('file://./model.json'); // Ensure model.json exists
    const input = tf.tensor([data.price, data.demand]);
    const prediction = model.predict(input);
    const result = prediction.dataSync()[0];
    input.dispose();
    prediction.dispose();
    return result;
  } catch (error) {
    console.error('ML Model Error:', error);
    return data.price; // Fallback to original price
  }
};

// API Endpoints
app.get('/health', (req, res) => res.status(200).send('OK'));
app.get('/api/dashboard', async (req, res) => {
  const balances = await Promise.all(
    CONFIG.USDT_WALLETS.map(async (wallet) => {
      const response = await axios.get(
        `${CONFIG.BSCSCAN_API}?module=account&action=tokenbalance&contractaddress=0x55d398326f99059ff775485246999027b3197955&address=${wallet}&tag=latest&apikey=${process.env.BSCSCAN_API_KEY || CONFIG.BSCSCAN_API_KEY}`
      );
      return { wallet, balance: response.data.result / 1e18 };
    })
  );
  res.json(balances);
});
app.get('/api/shopify/products', async (req, res) => {
  const products = await shopifyAgent(CONFIG);
  res.json(products);
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  runAgents();
});
