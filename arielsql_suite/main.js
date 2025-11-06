// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (GOD MODE READY)
import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { getDatabaseInitializer } from '../modules/database-initializer.js';
import { initializeSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js'; // ✅ Import Revenue Engine Initializer
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js'; // ✅ Import Payout System

let sovereignCore = null;
let isCoreReady = false;
let globalMasterCoreProxy = { optimizationCycle: 0 };

const CONFIG = {
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  BWAEZI_KERNEL_ADDRESS: process.env.BWAEZI_KERNEL_ADDRESS,
  SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET,
  PORT: process.env.PORT || 10000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  RPC_URLS: ["https://eth.llamarpc.com", "https://rpc.ankr.com/eth", "https://cloudflare-eth.com"],
  GOD_MODE_INTERVAL: parseInt(process.env.GOD_MODE_INTERVAL) || 5000,
  CLUSTER_WORKERS: parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length,
  QUANTUM_PROCESSING_UNITS: parseInt(process.env.QUANTUM_PROCESSING_UNITS) || 8,
  QUANTUM_ENTANGLEMENT_NODES: parseInt(process.env.QUANTUM_ENTANGLEMENT_NODES) || 16,
  ai: {
    omnipotent: { type: 'QUANTUM_AGI', budget: 'UNLIMITED' },
    omnipresent: { type: 'GLOBAL_MONITOR', sensitivity: 0.95 },
    evolving: { type: 'GENETIC_ALGORITHM', mutationRate: 0.05 }
  },
  token: { supply: '100M' },
  crypto: { algorithm: 'QR-ECDSA' },
  revenue: { currency: 'BWAEZI' },
  reality: { dimension: 'BWAEZI_REALM' },
  cortex: { model: 'NEURAL_QUANTUM' },
  qpu: { vendor: 'QUANTUM_X' }
};

const DB_CONFIGS = {
  transactions: { path: './data/ariel/transactions.db', autoBackup: true },
  quantum_crypto: { path: './data/quantum_crypto.db', autoBackup: true }
};

class ArielSQLiteEngineIpcProxy {
  constructor(dbConfig) {
    this.path = dbConfig.path;
    this.nextMessageId = 0;
    this.callbacks = new Map();
    process.on('message', this.handleMasterResponse.bind(this));
  }

  handleMasterResponse(msg) {
    if (msg.cmd === 'db_response' && this.callbacks.has(msg.id)) {
      const { resolve } = this.callbacks.get(msg.id);
      this.callbacks.delete(msg.id);
      resolve(msg.result);
    } else if (msg.cmd === 'core_update' && msg.data) {
      globalMasterCoreProxy.optimizationCycle = msg.data.optimizationCycle;
      isCoreReady = msg.data.isCoreReady;
    }
  }

  sendMessage(payload) {
    return new Promise((resolve) => {
      const id = this.nextMessageId++;
      this.callbacks.set(id, { resolve });
      process.send({ ...payload, id, sourcePid: process.pid });
    });
  }

  async initialize() { return true; }
  async run(query, params) { return this.sendMessage({ cmd: 'db_run', query, params, path: this.path }); }
  async get(query, params) { return this.sendMessage({ cmd: 'db_get', query, params, path: this.path }); }
  async all(query, params) { return this.sendMessage({ cmd: 'db_all', query, params, path: this.path }); }
  async close() { return true; }
}

async function executeMasterProcess() {
  console.log(`👑 MASTER PROCESS (PID ${process.pid}) — Initializing Global Core & Database...`);

  const dbInitializer = getDatabaseInitializer(CONFIG);
  const initializationResult = await dbInitializer.initializeAllDatabases(DB_CONFIGS);

  const masterDbEngine = initializationResult.arielEngine;
  const quantumCryptoDbEngine = initializationResult.quantumCryptoDb;

  if (!masterDbEngine) {
    throw new Error("Critical Initialization Failure: Ariel Transaction Engine is undefined.");
  }

  const masterCoreInstance = new ProductionSovereignCore(CONFIG, masterDbEngine);
  await masterCoreInstance.initialize();
  sovereignCore = masterCoreInstance;
  isCoreReady = true;

  // ✅ Initialize Sovereign Revenue Engine (Addressing user concern)
  try {
    let revenueEngine = await initializeSovereignRevenueEngine(CONFIG, sovereignCore, masterDbEngine);
    global.revenueEngine = revenueEngine; // Register globally for access by other modules
    console.log("✅ Sovereign Revenue Engine initialized.");
  } catch (error) {
    console.error("❌ Failed to initialize Sovereign Revenue Engine:", error.message);
    process.exit(1);
  }
  
  // ✅ Instantiate and Initialize BrianNwaezikePayoutSystem
  try {
    if (!sovereignCore || typeof sovereignCore.initialize !== 'function') {
      throw new Error("Invalid Sovereign Core instance passed to PayoutSystem check.");
    }
    
    let payoutSystem = new BrianNwaezikePayoutSystem(masterDbEngine, sovereignCore, CONFIG);
    await payoutSystem.initialize();
    global.payoutSystem = payoutSystem; // Register globally for access by other modules
    console.log("✅ Payout System initialized successfully.");
  } catch (error) {
    console.error("❌ Payout System initialization failed:", error.message);
    process.exit(1);
  }


  const masterDbConnections = {
    [DB_CONFIGS.transactions.path]: masterDbEngine,
    [DB_CONFIGS.quantum_crypto.path]: quantumCryptoDbEngine
  };

  for (let i = 0; i < CONFIG.CLUSTER_WORKERS; i++) {
    const worker = cluster.fork();
    worker.on('message', async (msg) => {
      if (msg.cmd && msg.cmd.startsWith('db_') && msg.path) {
        const dbEngine = masterDbConnections[msg.path];
        if (dbEngine) {
          try {
            let result;
            if (msg.cmd === 'db_run') result = await dbEngine.run(msg.query, msg.params);
            else if (msg.cmd === 'db_get') result = await dbEngine.get(msg.query, msg.params);
            else if (msg.cmd === 'db_all') result = await dbEngine.all(msg.query, msg.params);
            worker.send({ cmd: 'db_response', id: msg.id, result });
          } catch (dbError) {
            console.error(`🛑 DB Error from Worker ${worker.process.pid}:`, dbError.message);
            worker.send({ cmd: 'db_response', id: msg.id, error: dbError.message });
          }
        } else {
          worker.send({ cmd: 'db_response', id: msg.id, error: `Unknown DB path: ${msg.path}` });
        }
      }
    });
  }

  setInterval(async () => {
    try {
      await sovereignCore.godModeOptimizationCycle();
      globalMasterCoreProxy.optimizationCycle++;
      const updateMsg = {
        cmd: 'core_update',
        data: {
          optimizationCycle: globalMasterCoreProxy.optimizationCycle,
          isCoreReady
        }
      };
      for (const id in cluster.workers) {
        cluster.workers[id].send(updateMsg);
      }
    } catch (error) {
      console.error('🛑 God Mode Optimization Failed:', error.message);
    }
  }, CONFIG.GOD_MODE_INTERVAL);
}

async function executeWorkerProcess() {
  console.log(`⚙️ WORKER PROCESS (PID ${process.pid}) — Initializing IPC Proxy Databases...`);

  const transactionsDb = new ArielSQLiteEngineIpcProxy(DB_CONFIGS.transactions);
  const quantumCryptoDb = new ArielSQLiteEngineIpcProxy(DB_CONFIGS.quantum_crypto);

  // ✅ CORRECT CONSTRUCTOR: Only pass CONFIG and the primary transactionsDb (2 arguments).
  sovereignCore = new ProductionSovereignCore(CONFIG, transactionsDb);
  
  // 🛑 FINAL CRITICAL FIX: Skip core.initialize() in the worker process.
  // The worker's core instance is a proxy only and receives status updates via IPC.
  console.log(`✅ WORKER CORE (PID ${process.pid}) - Instantiated. Awaiting Master signal...`);

  const app = express();
  app.use(express.json());

  app.use((req, res, next) => {
    if (!isCoreReady) {
      return res.status(503).json({ error: 'Service Unavailable', message: 'Sovereign Core is still initializing.' });
    }
    req.sovereignCore = sovereignCore;
    req.db = transactionsDb;
    req.cryptoDb = quantumCryptoDb;
    next();
  });

  const PORT = CONFIG.PORT;
  try {
    const server = app.listen(PORT, () => {
      console.log(`✅ WORKER PROCESS (PID ${process.pid}) - Web Server listening on port ${PORT}`);
    });

    server.on('error', (err) => {
      console.error(`🛑 WORKER PROCESS FAILED TO BIND PORT ${PORT}:`, err.message);
      process.exit(1);
    });

  } catch (error) {
    console.error(`🛑 WORKER PROCESS ERROR during express listen:`, error.message);
    process.exit(1);
  }
}

if (cluster.isPrimary) {
  if (!CONFIG.PRIVATE_KEY) {
    console.error("🛑 FATAL: PRIVATE_KEY environment variable is required.");
    process.exit(1);
  }
  executeMasterProcess().catch(err => {
    console.error('💥 FATAL MASTER PROCESS ERROR:', err.name, ':', err.message);
    console.error(err.stack);
    process.exit(1);
  });
} else {
  executeWorkerProcess().catch(err => {
    console.error(`🛑 FATAL WORKER PROCESS ERROR (PID ${process.pid}):`, err.name, ':', err.message);
    console.error(err.stack);
    process.exit(1);
  });
}
