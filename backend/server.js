// backend/server.js
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { BrianNwaezikeChain } from './blockchain/BrianNwaezikeChain.js';
import { getRevenueAnalytics, getWalletBalances } from './agents/dataAgent.js';
import {
  sendETH,
  sendSOL,
  sendBwaezi,
  sendUSDT
} from './agents/wallet.js';

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
    // ✅ BSFM Dashboard Status
    this.app.get('/bsfm-status', async (req, res) => {
      try {
        const kernelActive = this.credentials?.GOD_MODE_ACTIVE || false;
        const revenue = await getRevenueAnalytics('24h');
        const activeModules = await this.chain.getActiveModules();
        const activityLog = await this.chain.getRecentActivity();

        res.json({
          kernel_active: kernelActive,
          revenue_eth: revenue.totalRevenue || '0.0000',
          active_modules,
          activity_log
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ✅ Wallet Balances
    this.app.get('/wallet-balances', async (req, res) => {
      try {
        const balances = await getWalletBalances();
        res.json({
          ethereum: balances.ethereum,
          solana: balances.solana,
          bwaezi: balances.bwaezi
        });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // ✅ Wallet Send Control
    this.app.post('/wallet/send', async (req, res) => {
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

        res.json(result);
      } catch (err) {
        res.status(500).json({ success: false, error: err.message });
      }
    });

    // ✅ Health Check
    this.app.get('/health', (req, res) => {
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
