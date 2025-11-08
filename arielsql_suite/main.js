// arielsql_suite/main.js — FULL-TURTLE ULTIMATE EXECUTION MODE
import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { initializeGlobalLogger, getGlobalLogger } from '../modules/enterprise-logger/index.js';
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { initializeSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js';
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js';
import { brianNwaezikeChain } from '../backend/blockchain/BrianNwaezikeChain.js';

const CONFIG = {
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  BWAEZI_KERNEL_ADDRESS: process.env.BWAEZI_KERNEL_ADDRESS,
  SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET,
  PORT: process.env.PORT || 10000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  RPC_ENDPOINT: process.env.RPC_ENDPOINT || 'https://mainnet.infura.io/v3/YOUR_KEY'
};

let sovereignCore = null;
let revenueEngine = null;
let payoutSystem = null;
let dbEngine = null;
let logger = null;

async function initializeAllAgents() {
  logger = initializeGlobalLogger('MasterOrchestrator', CONFIG);
  logger.info('🧠 Starting FULL-TURTLE ULTIMATE EXECUTION MODE');

  try {
    dbEngine = new ArielSQLiteEngine({ dbPath: './data/ariel/transactions.db', autoBackup: true });
    await dbEngine.initialize();
    logger.info('✅ Database Engine Ready');
  } catch (err) {
    logger.error('❌ DB Initialization Failed:', err.message);
  }

  try {
    await brianNwaezikeChain.initialize(CONFIG);
    logger.info('✅ Chain Initialized');
  } catch (err) {
    logger.error('❌ Chain Initialization Failed:', err.message);
  }

  try {
    payoutSystem = new BrianNwaezikePayoutSystem(CONFIG.PRIVATE_KEY, CONFIG.SOVEREIGN_WALLET, brianNwaezikeChain, dbEngine);
    await payoutSystem.initialize();
    logger.info('✅ Payout System Ready');
  } catch (err) {
    logger.error('❌ Payout System Initialization Failed:', err.message);
  }

  try {
    sovereignCore = new ProductionSovereignCore(CONFIG, dbEngine);
    logger.info('✅ Sovereign Core Instantiated');
  } catch (err) {
    logger.error('❌ Sovereign Core Instantiation Failed:', err.message);
  }

  try {
    revenueEngine = await initializeSovereignRevenueEngine(CONFIG, sovereignCore, dbEngine, brianNwaezikeChain, payoutSystem);
    logger.info('✅ Revenue Engine Initialized');
  } catch (err) {
    logger.error('❌ Revenue Engine Initialization Failed:', err.message);
  }

  try {
    if (sovereignCore && revenueEngine && payoutSystem && brianNwaezikeChain) {
      sovereignCore.orchestrateCoreServices({
        revenueEngine,
        payoutSystem,
        bwaeziChain: brianNwaezikeChain
      });
      await sovereignCore.initialize();
      logger.info('✅ Sovereign Core Fully Initialized');
    } else {
      logger.warn('⚠️ Core orchestration skipped due to missing dependencies');
    }
  } catch (err) {
    logger.error('❌ Core Initialization Failed:', err.message);
  }
}

async function startWebServer() {
  const app = express();
  app.use(express.json());

  app.get('/health', async (req, res) => {
    res.json({
      status: 'LIVE',
      core: sovereignCore?.getStatus?.() || 'Unavailable',
      revenue: await revenueEngine?.healthCheck?.() || 'Unavailable',
      payout: payoutSystem ? 'Ready' : 'Unavailable',
      timestamp: Date.now()
    });
  });

  app.post('/revenue/trigger', async (req, res) => {
    if (!revenueEngine?.orchestrateRevenueAgents) {
      return res.status(503).json({ status: 'error', message: 'Revenue Engine not available' });
    }
    const result = await revenueEngine.orchestrateRevenueAgents(req.body.instructions || {});
    res.json({ status: 'success', result });
  });

  const PORT = CONFIG.PORT;
  const server = app.listen(PORT, () => {
    console.log(`✅ Web server bound on port ${PORT} - Revenue Ready`);
  });

  server.on('error', (err) => {
    console.error(`❌ Port binding failed: ${err.message}`);
    const fallbackServer = app.listen(0, () => {
      const fallbackPort = fallbackServer.address().port;
      console.log(`✅ Fallback port ${fallbackPort} bound successfully`);
    });
  });
}

async function bootstrap() {
  try {
    await initializeAllAgents();
  } catch (err) {
    console.error('❌ Agent Initialization Error:', err.message);
  } finally {
    await startWebServer();
  }
}

if (cluster.isPrimary) {
  bootstrap();
  cluster.on('exit', (worker, code, signal) => {
    console.warn(`💀 Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
  for (let i = 0; i < os.cpus().length; i++) {
    cluster.fork();
  }
} else {
  startWebServer();
}
