// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (ULTIMATE EXECUTION MODE)
// 🎯 CRITICAL FIX: Integrated Enterprise Logger and Sequential Initialization

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { getDatabaseInitializer } from '../modules/database-initializer.js';
import { initializeSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js';
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js';
import { initializeGlobalLogger, getGlobalLogger, enableDatabaseLoggingSafely } from '../modules/enterprise-logger/index.js';

let sovereignCore = null;
let revenueEngine = null;
let dbInitializer = null;
let payoutSystem = null;
let masterLogger = null;

const CONFIG = {
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  BWAEZI_KERNEL_ADDRESS: process.env.BWAEZI_KERNEL_ADDRESS,
  SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET,
  PORT: process.env.PORT || 10000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  RPC_URLS: ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth", "https://cloudflare-eth.com"],
  FOUNDER_ADDRESS: process.env.FOUNDER_ADDRESS || "0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA"
};

// =========================================================================
// MASTER PROCESS
// =========================================================================

async function executeMasterProcess() {
  masterLogger = initializeGlobalLogger('MasterController', CONFIG);
  masterLogger.info(`🧠 MASTER PROCESS (PID ${process.pid}) - Starting BSFM Ultimate Execution Cluster`);

  if (!CONFIG.PRIVATE_KEY) {
    masterLogger.error("🛑 FATAL: PRIVATE_KEY environment variable is required.");
    process.exit(1);
  }

  const numCPUs = os.cpus().length;
  masterLogger.info(`🌐 Forking ${numCPUs} worker processes...`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    masterLogger.warn(`💀 Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });
}

// =========================================================================
// WORKER PROCESS
// =========================================================================

async function bindingRetryLoop(app, PORT, logger) {
  let attempt = 0;
  while (true) {
    attempt++;
    try {
      const server = app.listen(PORT, () => {
        logger.info(`✅ WORKER PROCESS (PID ${process.pid}) - Web Server listening on port ${PORT} (Attempt ${attempt})`);
      });

      server.on('error', (err) => {
        logger.error(`🛑 PORT BINDING FAILED (Attempt ${attempt}):`, err.message);
        throw err;
      });

      await new Promise((resolve, reject) => {
        server.once('listening', resolve);
        server.once('error', reject);
      });

      break;
    } catch (error) {
      const waitTime = Math.min(2 ** attempt * 1000, 60000);
      logger.warn(`⏳ Retrying port binding in ${waitTime / 1000}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
}

async function executeWorkerProcess() {
  const logger = initializeGlobalLogger('WorkerOrchestrator', CONFIG);
  logger.info(`⚙️ WORKER PROCESS (PID ${process.pid}) - Starting Initialization Orchestration`);

  const app = express();
  app.use(express.json());

  let transactionsDb = null;
  let quantumCryptoDb = null;

  try {
    dbInitializer = getDatabaseInitializer(CONFIG);
    const dbResult = await dbInitializer.initialize();
    transactionsDb = dbResult.transactionsDb;
    quantumCryptoDb = dbResult.quantumCryptoDb;

    await enableDatabaseLoggingSafely(dbResult.mainDb);
    logger.info('✅ Database Initialized');

    sovereignCore = new ProductionSovereignCore(CONFIG, dbResult.mainDb);
    await sovereignCore.initialize();
    logger.info('✅ Sovereign Core Initialized');

    revenueEngine = await initializeSovereignRevenueEngine(CONFIG, sovereignCore, transactionsDb);
    if (revenueEngine) {
      await sovereignCore.injectRevenueEngine(revenueEngine);
      logger.info('✅ Revenue Engine Initialized');
    } else {
      logger.warn('⚠️ Revenue Engine failed to initialize. Continuing without it.');
    }

    payoutSystem = new BrianNwaezikePayoutSystem(CONFIG, transactionsDb);
    await payoutSystem.initialize();
    logger.info('✅ Payout System Initialized');

  } catch (error) {
    logger.error(`🛑 Initialization Error: ${error.message}`, { stack: error.stack });
  }

  await bindingRetryLoop(app, CONFIG.PORT, logger);

  app.use((req, res, next) => {
    req.core = sovereignCore;
    req.revenue = revenueEngine;
    req.payout = payoutSystem;
    req.db = transactionsDb;
    req.cryptoDb = quantumCryptoDb;
    next();
  });

  app.get('/system/health', async (req, res) => {
    const coreStatus = req.core ? req.core.getStatus() : { status: 'core_uninitialized' };
    const revenueStatus = req.revenue ? await req.revenue.healthCheck() : { status: 'revenue_uninitialized' };
    res.json({
      system: 'Ultimate Execution Ready',
      core: coreStatus,
      revenue: revenueStatus,
      webServerOnline: true
    });
  });

  app.post('/revenue/trigger', async (req, res) => {
    if (!req.revenue) {
      logger.warn('Revenue trigger attempted but engine is offline.');
      return res.status(503).json({ status: 'error', message: 'Revenue Engine not available.' });
    }
    const results = await req.revenue.orchestrateRevenueAgents(req.body.instructions);
    res.json({ status: 'success', results });
  });
}

// =========================================================================
// ENTRY POINT
// =========================================================================

if (cluster.isPrimary) {
  executeMasterProcess().catch(err => {
    console.error('💥 MASTER PROCESS ERROR:', err.message);
    console.error(err.stack);
    process.exit(1);
  });
} else {
  executeWorkerProcess().catch(err => {
    const fallbackLogger = getGlobalLogger('CrashHandler');
    fallbackLogger.error(`🛑 WORKER PROCESS CRASH:`, err);
  });
}
