// backend/server.js — BSFM Quantum Sovereign Server
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { BrianNwaezikeChain } from './blockchain/BrianNwaezikeChain.js';
import {
  getRevenueAnalytics,
  getWalletBalances,
  getConsolidationBalances
} from './agents/dataAgent.js';
import {
  sendETH,
  sendSOL,
  sendBwaezi,
  sendUSDT
} from './agents/wallet.js';
import {
  consolidateSolanaWallet,
  consolidateEthereumWallet
} from './agents/consolidationAgent.js';

dotenv.config();

export class EnterpriseServer {
  constructor() {
    this.app = express();
    this.chain = null;
    this.credentials = null;
    this.initialized = false;
  }

  async initialize(credentials) {
    this.credentials = credentials;
    this.chain = new BrianNwaezikeChain({
      rpcUrl: credentials.BWAEZI_RPC_URL,
      chainId: credentials.BWAEZI_CHAIN_ID,
      contractAddress: credentials.BWAEZI_CONTRACT_ADDRESS
    });

    if (typeof this.chain.init === 'function') {
      await this.chain.init();
    }

    this.app.use(cors());
    this.app.use(express.json());
    this.registerRoutes();
    this.initialized = true;
  }

  registerRoutes() {
    // 🧠 Sovereign Brain Status
    this.app.get('/api/sovereign-brain', async (req, res) => {
      res.json({
        optimizationCycle: 2049,
        status: 'GOD MODE ACTIVE',
        entanglementStability: 0.99,
        realityCoherence: 0.97
      });
    });

    // 💸 Revenue Engine
    this.app.get('/api/revenue-engine', async (req, res) => {
      const revenue = await getRevenueAnalytics('30d');
      res.json({
        treasury: revenue.treasury || '0.00',
        monthly: revenue.monthly || '0.00'
      });
    });

    // 💰 Wallet Balances (Sovereign Address)
    this.app.get('/api/wallet-balances', async (req, res) => {
      const balances = await getWalletBalances('0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA');
      res.json(balances);
    });

    // 🔗 Consolidation Monitor
    this.app.get('/api/wallet/consolidation-status', async (req, res) => {
      const balances = await getConsolidationBalances();
      res.json({
        lastRun: process.env.CONSOLIDATION_LAST_RUN || 'Unknown',
        status: 'SYNCHRONIZED',
        ...balances
      });
    });

    // 🔄 Trigger Consolidation
    this.app.post('/api/wallet/consolidate', async (req, res) => {
      await consolidateSolanaWallet();
      await consolidateEthereumWallet();
      process.env.CONSOLIDATION_LAST_RUN = new Date().toISOString();
      res.json({ status: 'Consolidation completed', timestamp: process.env.CONSOLIDATION_LAST_RUN });
    });

    // 🚀 Send Funds Anywhere
    this.app.post('/api/wallet/send', async (req, res) => {
      const { chain, asset, to, amount } = req.body;
      try {
        if (!chain || !asset || !to || !amount) {
          return res.status(400).json({ success: false, error: 'Missing required parameters' });
        }

        let result;
        if (asset === 'native') {
          if (chain === 'eth') result = await sendETH(to, amount);
          else if (chain === 'sol') result = await sendSOL(to, amount);
          else if (chain === 'bwaezi') result = await sendBwaezi(to, amount);
          else return res.status(400).json({ success: false, error: 'Invalid chain' });
        } else if (asset === 'usdt') {
          if (chain === 'eth' || chain === 'sol') {
            result = await sendUSDT(to, amount, chain);
          } else {
            return res.status(400).json({ success: false, error: 'USDT not supported on this chain' });
          }
        } else {
          return res.status(400).json({ success: false, error: 'Invalid asset type' });
        }

        res.json({ success: true, txHash: result.txHash || 'Success' });
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ✅ Health Check
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'OK',
        initialized: this.initialized,
        timestamp: new Date().toISOString()
      });
    });
  }

  listen(port = 10000) {
    this.app.listen(port, () => {
      console.log(`✅ EnterpriseServer running on port ${port}`);
    });
  }

  getExpressApp() {
    return this.app;
  }

  getBlockchainInstance() {
    return this.chain;
  }

  isInitialized() {
    return this.initialized;
  }
}

export default EnterpriseServer;
