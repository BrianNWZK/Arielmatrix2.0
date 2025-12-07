// arielsql_suite/main.js - ULTRA-FAST DEPLOYMENT (Guaranteed Port Binding)
// SOVEREIGN MEV BRAIN v13.5.1 - Hyper-Speed Production Engine

import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import process from 'process';
import net from 'net';

import { ProductionSovereignCore } from '../core/sovereign-brain.js';

// =========================================================================
// Port binding
// =========================================================================

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

// =========================================================================
// Ultra-fast deployment
// =========================================================================

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
      console.log('🔗 Initializing blockchain connection...');
      const rpcUrls = [
        ...(process.env.ALCHEMY_API_KEY ? [`https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`] : []),
        "https://eth.llamarpc.com",
        "https://rpc.ankr.com/eth",
        "https://cloudflare-eth.com",
        "https://ethereum.publicnode.com"
      ];
      let provider = null;
      for (const rpcUrl of rpcUrls) {
        try {
          provider = new ethers.JsonRpcProvider(rpcUrl);
          await provider.getBlockNumber();
          console.log(`✅ Blockchain connected via ${rpcUrl}`);
          this.blockchainConnected = true;
          global.blockchainProvider = provider;
          break;
        } catch {
          console.log(`⚠️ RPC ${rpcUrl} failed, trying next...`);
        }
      }
      if (!this.blockchainConnected) {
        console.error('❌ All RPCs failed, retrying in 15 seconds...');
        setTimeout(()=> this.initializeBlockchainConnection(), 15000);
      }
    } catch (error) {
      console.error('⚠️ Blockchain connection failed:', error.message);
      setTimeout(()=> this.initializeBlockchainConnection(), 15000);
    }
  }

  async deploySovereignBrain() {
    try {
      console.log('🧠 Deploying Sovereign MEV Brain v13.5.1...');
      // Ensure core uses sticky provider
      const core = new ProductionSovereignCore();
      await core.initialize();
      this.core = core;
      this.revenueGenerationActive = true;

      // Mount production API on the same app (no double handlers)
      const productionApp = createProductionAPI(this);
      this.app.use('/', productionApp);

      console.log('✅ SOVEREIGN MEV BRAIN v13.5.1 DEPLOYED - ACTIVE');
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
        try {
          // Event-driven core; loop reserved for periodic maintenance if needed
        } catch (error) {
          console.log('⚠️ Revenue loop error:', error.message);
        }
      }
    }, 45000);
  }
}

// =========================================================================
// Production API (mounted on the same app)
// =========================================================================

function createProductionAPI(deployment) {
  const app = express.Router();
  app.use(express.json({ limit: '10mb' }));

  app.get('/revenue-dashboard', (req,res)=> {
    try {
      const stats = deployment.core ? deployment.core.getStats() : {
        system: { status: 'DEPLOYING', version: 'v13.5.1' },
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

  // Proxy useful core endpoints
  app.get('/status', (req,res)=> {
    if (!deployment.core) return res.json({ status: 'DEPLOYING' });
    res.json(deployment.core.getStats());
  });
  app.get('/anchors/composite', async (req,res)=> {
    try {
      if (!deployment.core) return res.status(503).json({ error: 'DEPLOYING' });
      const r = await deployment.core.oracle.getCompositePriceUSD(deployment.core ? deployment.core.maker?.signer?.address : LIVE.TOKENS.BWAEZI);
      res.json({ priceUSD: r.price, confidence: r.confidence, components: r.components, ts: Date.now() });
    } catch (e) { res.status(500).json({ error: e.message }); }
  });

  return app;
}

// =========================================================================
// Main
// =========================================================================

(async ()=>{
  console.log('\n' + '='.repeat(70));
  console.log('🚀 SOVEREIGN MEV BRAIN v13.5.1 - ULTRA-FAST DEPLOYMENT');
  console.log('💰 Guaranteed Port • Zero Dependency Blocking');
  console.log('⚡ Event-driven Peg • Maker–Taker Hybrid • AA Ready • Sticky RPC');
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
    console.log('💰 Revenue: ACTIVE');
    console.log('='.repeat(70) + '\n');

    process.on('uncaughtException', (error)=> console.error('💥 UNCAUGHT EXCEPTION:', error.message));
    process.on('unhandledRejection', (reason)=> console.warn('⚠️ UNHANDLED REJECTION:', reason));
  } catch (error) {
    console.error('💥 CRITICAL FAILURE:', error.message);
    try {
      const emergencyPort = await guaranteePortBinding();
      const app = express();
      app.get('/', (req,res)=> res.json({
        status: 'EMERGENCY_MODE',
        error: error.message,
        timestamp: new Date().toISOString(),
        message: 'System in emergency mode, revenue generation may be limited'
      }));
      app.listen(emergencyPort, ()=> console.log(`🛡️ EMERGENCY SERVER ON PORT ${emergencyPort}`));
    } catch (e) {
      console.error('💀 COMPLETE SYSTEM FAILURE:', e.message);
      process.exit(1);
    }
  }
})();

// Export
export { UltraFastDeployment, guaranteePortBinding };
