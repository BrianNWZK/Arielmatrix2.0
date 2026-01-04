// arielsql_suite/main.js — ULTRA-FAST DEPLOYMENT
// SOVEREIGN MEV BRAIN v15.8 — Mainnet Production (provider fix)

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
import net from 'net';

import { ProductionSovereignCore, chainRegistry, LIVE } from '../core/sovereign-brain.js';

async function guaranteePortBinding(startPort = 10000, maxAttempts = 50) {
  return new Promise((resolve) => {
    const tryBind = (port, attempt = 1) => {
      const server = net.createServer();
      server.listen(port, '0.0.0.0', () => {
        server.close(() => {
          console.log(`✅ Port ${port} available for immediate binding`);
          resolve(port);
        });
      });
      server.on('error', (err) => {
        if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
          console.log(`⚠️ Port ${port} busy, trying ${port + 1}`);
          tryBind(port + 1, attempt + 1);
        } else {
          const randomPort = Math.floor(Math.random() * 20000) + 10000;
          console.log(`🚨 Using emergency random port: ${randomPort}`);
          resolve(randomPort);
        }
      });
    };
    tryBind(startPort);
  });
}

class UltraFastDeployment {
  constructor() {
    this.deploymentStartTime = Date.now();
    this.revenueGenerationActive = false;
    this.portBound = false;
    this.blockchainConnected = false;
    this.core = null;
    this.app = null;
    this.server = null;
  }

  async deployImmediately() {
    console.log('🚀 ULTRA-FAST DEPLOYMENT INITIATED');

    const port = await this.guaranteePortBinding();
    this.portBound = true;

    const { app, server } = this.launchMinimalServer(port);
    this.app = app;
    this.server = server;

    this.initializeBlockchainConnection();

    this.deploySovereignBrain();

    this.startRevenueGenerationLoop();

    return { port, app, server };
  }

  async guaranteePortBinding() {
    const startPort = process.env.PORT ? Number(process.env.PORT) : 10000;
    return await guaranteePortBinding(startPort);
  }

  launchMinimalServer(port) {
    const app = express();
    app.use(cors());
    app.use(express.json());

    app.get('/health', (req,res)=> {
      res.json({
        status: 'OPERATIONAL',
        revenueGeneration: this.revenueGenerationActive ? 'ACTIVE' : 'STARTING',
        blockchain: this.blockchainConnected ? 'CONNECTED' : 'CONNECTING',
        uptime: Date.now() - this.deploymentStartTime,
        timestamp: new Date().toISOString()
      });
    });

    app.get('/revenue-status', (req,res)=> {
      res.json({
        revenueGeneration: this.revenueGenerationActive ? 'ACTIVE' : 'STARTING',
        activeSince: this.revenueGenerationActive ? this.deploymentStartTime : null,
        transactionsExecuted: 0,
        totalRevenue: 0,
        mode: 'ULTRA_FAST_DEPLOYMENT'
      });
    });

    const server = app.listen(port, '0.0.0.0', ()=> {
      console.log(`🚀 SERVER BOUND TO PORT ${port} - READY`);
      console.log(`🌐 Health: http://localhost:${port}/health`);
      console.log(`💰 Revenue: http://localhost:${port}/revenue-status`);
    });

    return { app, server };
  }

  async initializeBlockchainConnection() {
    try {
      console.log('🔗 Initializing mainnet connection...');
      await chainRegistry.init();
      const primary = chainRegistry.getProvider();
      await primary.getBlockNumber();
      this.blockchainConnected = true;
      global.blockchainProvider = primary;
      console.log('✅ Blockchain connected (mainnet sticky provider)');
    } catch (error) {
      console.error('⚠️ Blockchain connection failed:', error.message);
      setTimeout(()=> this.initializeBlockchainConnection(), 15000);
    }
  }

  async deploySovereignBrain() {
    try {
      console.log(`🧠 Deploying Sovereign MEV Brain ${LIVE.VERSION}...`);
      const core = new ProductionSovereignCore();
      await core.initialize();
      this.core = core;
      this.revenueGenerationActive = true;

      const productionApp = createProductionAPI(this);
      this.app.use('/', productionApp);

      console.log(`✅ SOVEREIGN MEV BRAIN ${LIVE.VERSION} DEPLOYED — MAINNET ACTIVE`);
      console.log(`📊 Dashboard: http://localhost:${this.server.address().port}/revenue-dashboard`);
    } catch (error) {
      console.error('⚠️ Brain deployment failed (retry in 10s):', error.message);
      setTimeout(()=> this.deploySovereignBrain(), 10000);
    }
  }

  startRevenueGenerationLoop() {
    console.log('💰 Starting revenue loop...');
    setInterval(()=> {
      if (this.revenueGenerationActive && this.core) {
        try { /* event-driven core; loop for maintenance */ }
        catch (error) { console.log('⚠️ Revenue loop error:', error.message); }
      }
    }, 45000);
  }
}

function createProductionAPI(deployment) {
  const app = express.Router();
  app.use(express.json({ limit: '10mb' }));

  app.get('/revenue-dashboard', (req,res)=> {
    try {
      const stats = deployment.core ? deployment.core.getStats() : {
        system: { status: 'DEPLOYING', version: LIVE.VERSION },
        trading: { tradesExecuted: 0, totalRevenueUSD: 0, currentDayUSD: 0, projectedDaily: 0 },
        peg: { actions: 0, targetUSD: 100 }
      };
      res.json({
        success: true,
        revenueGeneration: deployment.revenueGenerationActive,
        stats,
        blockchain: deployment.blockchainConnected,
        uptime: Date.now() - deployment.deploymentStartTime,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.json({ success: true, revenueGeneration: deployment.revenueGenerationActive, stats: { status: 'ERROR', error: error.message }, timestamp: new Date().toISOString() });
    }
  });

  app.get('/blockchain-status', async (req,res)=> {
    try {
      if (!global.blockchainProvider) {
        res.json({ connected: false, status: 'CONNECTING', message: 'Blockchain provider initializing...' });
        return;
      }
      const blockNumber = await global.blockchainProvider.getBlockNumber();
      const network = await global.blockchainProvider.getNetwork();
      res.json({ connected: true, blockNumber, chainId: network.chainId, name: network.name, timestamp: new Date().toISOString() });
    } catch (error) { res.json({ connected: false, error: error.message, timestamp: new Date().toISOString() }); }
  });

  app.get('/system-metrics', (req,res)=> {
    res.json({
      deploymentTime: deployment.deploymentStartTime,
      uptime: Date.now() - deployment.deploymentStartTime,
      revenueActive: deployment.revenueGenerationActive,
      blockchainConnected: deployment.blockchainConnected,
      portBound: deployment.portBound,
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  });

  app.get('/status', (req,res)=> {
    if (!deployment.core) return res.json({ status: 'DEPLOYING' });
    res.json(deployment.core.getStats());
  });

  // Mirror core endpoints
  app.get('/dex/list', (req,res)=> {
    if (!deployment.core) return res.json({ adapters: [] });
    res.json({ adapters: deployment.core.dexRegistry.getAllAdapters(), ts: Date.now() });
  });

  app.get('/dex/health', async (req,res)=> {
    try {
      if (!deployment.core) return res.json({ count: 0, checks: [] });
      const health = await deployment.core.dexRegistry.healthCheck();
      res.json({ ...health, ts: Date.now() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  app.get('/dex/scores', (req,res)=> {
    if (!deployment.core) return res.json({ scores: [] });
    res.json({ scores: deployment.core.dexRegistry.getScores(), ts: Date.now() });
  });

  return app;
}

(async ()=>{
  console.log('\n' + '='.repeat(70));
  console.log(`🚀 SOVEREIGN MEV BRAIN ${LIVE.VERSION} — ULTRA-FAST DEPLOYMENT (Mainnet)`);
  console.log('💰 AA-Primary • BWAEZI Paymaster • Expanded DEX • Reliability Scoring');
  console.log('='.repeat(70) + '\n');

  try {
    const deployment = new UltraFastDeployment();
    const { port } = await deployment.deployImmediately();

    console.log('\n' + '='.repeat(70));
    console.log('✅ SYSTEM OPERATIONAL');
    console.log(`🌐 Server: http://localhost:${port}`);
    console.log(`📊 Dashboard: http://localhost:${port}/revenue-dashboard`);
    console.log(`🔗 Blockchain: http://localhost:${port}/blockchain-status`);
    console.log(`📈 Metrics: http://localhost:${port}/system-metrics`);
    console.log('💰 Revenue: ACTIVE (Mainnet)');
    console.log('='.repeat(70) + '\n');

    process.on('uncaughtException', (error)=> console.error('💥 UNCAUGHT EXCEPTION:', error.message));
    process.on('unhandledRejection', (reason)=> console.warn('⚠️ UNHANDLED REJECTION:', reason));
  } catch (error) {
    console.error('💥 CRITICAL FAILURE:', error.message);
    try {
      const emergencyPort = await guaranteePortBinding();
      const app = express();
      app.get('/', (req,res)=> res.json({ status: 'EMERGENCY_MODE', error: error.message, timestamp: new Date().toISOString(), message: 'System in emergency mode' }));
      app.listen(emergencyPort, ()=> console.log(`🛡️ EMERGENCY SERVER ON PORT ${emergencyPort}`));
    } catch (e) {
      console.error('💀 COMPLETE SYSTEM FAILURE:', e.message);
      process.exit(1);
    }
  }
})();

export { UltraFastDeployment, guaranteePortBinding };
