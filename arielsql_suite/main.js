// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (GOD MODE READY)
import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { getDatabaseInitializer } from '../modules/database-initializer.js';
import { initializeSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js';
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js';

let sovereignCore = null;
let isCoreReady = false;
let globalMasterCoreProxy = { optimizationCycle: 0, healthStatus: 'initializing' };

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
    this.isConnected = false;
    process.on('message', this.handleMasterResponse.bind(this));
    this.connectionTimeout = setTimeout(() => {
      if (!this.isConnected) {
        console.warn(`⚠️ IPC Proxy connection timeout for ${dbConfig.path}`);
      }
    }, 10000);
  }

  handleMasterResponse(msg) {
    if (msg.cmd === 'db_response' && this.callbacks.has(msg.id)) {
      const { resolve } = this.callbacks.get(msg.id);
      this.callbacks.delete(msg.id);
      resolve(msg.result);
    } else if (msg.cmd === 'core_update' && msg.data) {
      globalMasterCoreProxy.optimizationCycle = msg.data.optimizationCycle;
      globalMasterCoreProxy.healthStatus = msg.data.healthStatus;
      isCoreReady = msg.data.isCoreReady;
      this.isConnected = true;
      clearTimeout(this.connectionTimeout);
    } else if (msg.cmd === 'health_check') {
      process.send({ cmd: 'health_response', pid: process.pid, isCoreReady });
    }
  }

  sendMessage(payload) {
    return new Promise((resolve, reject) => {
      const id = this.nextMessageId++;
      const timeout = setTimeout(() => {
        this.callbacks.delete(id);
        reject(new Error(`IPC timeout for command: ${payload.cmd}`));
      }, 30000);

      this.callbacks.set(id, { resolve, timeout });
      
      if (process.send) {
        process.send({ ...payload, id, sourcePid: process.pid });
      } else {
        reject(new Error('IPC channel not available'));
      }
    });
  }

  async initialize() { 
    this.isConnected = true;
    return true; 
  }
  
  async run(query, params) { 
    return this.sendMessage({ cmd: 'db_run', query, params, path: this.path }); 
  }
  
  async get(query, params) { 
    return this.sendMessage({ cmd: 'db_get', query, params, path: this.path }); 
  }
  
  async all(query, params) { 
    return this.sendMessage({ cmd: 'db_all', query, params, path: this.path }); 
  }
  
  async close() { 
    this.isConnected = false;
    return true; 
  }
}

// 🆕 HEALTH CHECK & READINESS SYSTEM
class ClusterHealthMonitor {
  constructor() {
    this.healthChecks = new Map();
    this.readinessGates = [
      'database_initialized',
      'sovereign_core_ready',
      'revenue_engine_ready',
      'payout_system_ready'
    ];
  }

  markReady(component) {
    this.healthChecks.set(component, { status: 'ready', timestamp: Date.now() });
    console.log(`✅ ${component} marked as ready`);
  }

  markFailed(component, error) {
    this.healthChecks.set(component, { status: 'failed', error, timestamp: Date.now() });
    console.error(`❌ ${component} failed:`, error);
  }

  isSystemReady() {
    return this.readinessGates.every(gate => 
      this.healthChecks.get(gate)?.status === 'ready'
    );
  }

  getHealthStatus() {
    const status = {};
    this.readinessGates.forEach(gate => {
      status[gate] = this.healthChecks.get(gate) || { status: 'pending' };
    });
    return status;
  }
}

const healthMonitor = new ClusterHealthMonitor();

async function executeMasterProcess() {
  console.log(`👑 MASTER PROCESS (PID ${process.pid}) — Initializing Global Core & Database...`);

  try {
    // PHASE 1: Database Initialization
    console.log('📊 PHASE 1: Initializing databases...');
    const dbInitializer = getDatabaseInitializer(CONFIG);
    const initializationResult = await dbInitializer.initializeAllDatabases(DB_CONFIGS);

    const masterDbEngine = initializationResult.arielEngine;
    const quantumCryptoDbEngine = initializationResult.quantumCryptoDb;

    if (!masterDbEngine) {
      throw new Error("Critical Initialization Failure: Ariel Transaction Engine is undefined.");
    }
    
    healthMonitor.markReady('database_initialized');

    // PHASE 2: Sovereign Core Initialization
    console.log('🧠 PHASE 2: Initializing Sovereign Core...');
    const masterCoreInstance = new ProductionSovereignCore(CONFIG, masterDbEngine);
    await masterCoreInstance.initialize();
    sovereignCore = masterCoreInstance;
    
    // 🆕 VALIDATE CORE INSTANCE BEFORE PROCEEDING
    if (!sovereignCore || typeof sovereignCore.initialize !== 'function') {
      throw new Error("Invalid Sovereign Core instance created");
    }
    
    healthMonitor.markReady('sovereign_core_ready');
    isCoreReady = true;
    globalMasterCoreProxy.healthStatus = 'healthy';

    // PHASE 3: Revenue Engine Initialization
    console.log('💰 PHASE 3: Initializing Revenue Engine...');
    let revenueEngine;
    try {
      revenueEngine = await initializeSovereignRevenueEngine(CONFIG, sovereignCore, masterDbEngine);
      if (!revenueEngine) {
        throw new Error("Revenue Engine initialization returned undefined");
      }
      global.revenueEngine = revenueEngine;
      healthMonitor.markReady('revenue_engine_ready');
      console.log("✅ Sovereign Revenue Engine initialized successfully.");
    } catch (error) {
      healthMonitor.markFailed('revenue_engine_ready', error);
      console.error("❌ Revenue Engine initialization failed, continuing with core services...");
      // Don't exit - continue with other services
    }

    // PHASE 4: Payout System Initialization
    console.log('💸 PHASE 4: Initializing Payout System...');
    try {
      let payoutSystem = new BrianNwaezikePayoutSystem(masterDbEngine, sovereignCore, CONFIG);
      await payoutSystem.initialize();
      global.payoutSystem = payoutSystem;
      healthMonitor.markReady('payout_system_ready');
      console.log("✅ Payout System initialized successfully.");
    } catch (error) {
      healthMonitor.markFailed('payout_system_ready', error);
      console.error("❌ Payout System initialization failed, continuing with core services...");
      // Don't exit - continue with other services
    }

    // 🆕 FINAL SYSTEM HEALTH CHECK
    if (!healthMonitor.isSystemReady()) {
      console.warn('⚠️ System started with partial readiness:', healthMonitor.getHealthStatus());
    } else {
      console.log('🎉 ALL SYSTEMS READY - PRODUCTION CLUSTER OPERATIONAL');
    }

    const masterDbConnections = {
      [DB_CONFIGS.transactions.path]: masterDbEngine,
      [DB_CONFIGS.quantum_crypto.path]: quantumCryptoDbEngine
    };

    // Fork workers after all systems are ready
    console.log(`👥 Forking ${CONFIG.CLUSTER_WORKERS} worker processes...`);
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
        } else if (msg.cmd === 'health_check') {
          worker.send({ 
            cmd: 'health_response', 
            systemStatus: healthMonitor.getHealthStatus(),
            isCoreReady: true
          });
        }
      });

      // 🆕 Wait for worker to be ready before forking next one
      await new Promise(resolve => {
        worker.on('listening', (address) => {
          console.log(`✅ Worker ${worker.process.pid} listening on port ${address.port}`);
          resolve();
        });
      });
    }

    // GOD MODE Optimization Cycle
    setInterval(async () => {
      try {
        if (sovereignCore && sovereignCore.godModeOptimizationCycle) {
          await sovereignCore.godModeOptimizationCycle();
          globalMasterCoreProxy.optimizationCycle++;
          
          const updateMsg = {
            cmd: 'core_update',
            data: {
              optimizationCycle: globalMasterCoreProxy.optimizationCycle,
              isCoreReady: true,
              healthStatus: globalMasterCoreProxy.healthStatus,
              systemStatus: healthMonitor.getHealthStatus()
            }
          };
          
          for (const id in cluster.workers) {
            if (cluster.workers[id].isConnected()) {
              cluster.workers[id].send(updateMsg);
            }
          }
        }
      } catch (error) {
        console.error('🛑 God Mode Optimization Failed:', error.message);
        globalMasterCoreProxy.healthStatus = 'degraded';
      }
    }, CONFIG.GOD_MODE_INTERVAL);

    // 🆕 Periodic health broadcasts
    setInterval(() => {
      const healthMsg = {
        cmd: 'core_update',
        data: {
          optimizationCycle: globalMasterCoreProxy.optimizationCycle,
          isCoreReady: true,
          healthStatus: globalMasterCoreProxy.healthStatus,
          systemStatus: healthMonitor.getHealthStatus(),
          timestamp: Date.now()
        }
      };
      
      for (const id in cluster.workers) {
        if (cluster.workers[id].isConnected()) {
          cluster.workers[id].send(healthMsg);
        }
      }
    }, 10000);

  } catch (error) {
    console.error('💥 FATAL MASTER PROCESS ERROR:', error.name, ':', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function executeWorkerProcess() {
  console.log(`⚙️ WORKER PROCESS (PID ${process.pid}) — Initializing IPC Proxy Databases...`);

  const transactionsDb = new ArielSQLiteEngineIpcProxy(DB_CONFIGS.transactions);
  const quantumCryptoDb = new ArielSQLiteEngineIpcProxy(DB_CONFIGS.quantum_crypto);

  // 🆕 WAIT FOR INITIAL CORE STATUS BEFORE PROCEEDING
  await new Promise(resolve => {
    const checkCoreStatus = () => {
      if (isCoreReady) {
        resolve();
      } else {
        setTimeout(checkCoreStatus, 100);
      }
    };
    checkCoreStatus();
  });

  // Initialize core proxy only after master signals readiness
  sovereignCore = new ProductionSovereignCore(CONFIG, transactionsDb);
  
  // 🆕 ENHANCED VALIDATION
  if (!sovereignCore) {
    console.error(`🛑 WORKER ${process.pid}: Failed to create Sovereign Core proxy`);
    process.exit(1);
  }

  console.log(`✅ WORKER CORE (PID ${process.pid}) - Instantiated and synchronized with Master`);

  const app = express();
  app.use(express.json());

  // 🆕 ENHANCED HEALTH CHECK ENDPOINT
  app.get('/health', (req, res) => {
    res.json({
      status: isCoreReady ? 'healthy' : 'initializing',
      pid: process.pid,
      coreReady: isCoreReady,
      optimizationCycle: globalMasterCoreProxy.optimizationCycle,
      healthStatus: globalMasterCoreProxy.healthStatus,
      timestamp: Date.now()
    });
  });

  // �READINESS GATE MIDDLEWARE
  app.use((req, res, next) => {
    if (!isCoreReady) {
      return res.status(503).json({ 
        error: 'Service Unavailable', 
        message: 'Sovereign Core is still initializing.',
        retryAfter: 10
      });
    }
    
    if (globalMasterCoreProxy.healthStatus === 'degraded') {
      console.warn(`⚠️ Serving request in degraded mode from worker ${process.pid}`);
    }
    
    req.sovereignCore = sovereignCore;
    req.db = transactionsDb;
    req.cryptoDb = quantumCryptoDb;
    req.workerPid = process.pid;
    next();
  });

  // 🆕 GRACEFUL SHUTDOWN HANDLER
  process.on('SIGTERM', () => {
    console.log(`🛑 Worker ${process.pid} received SIGTERM, shutting down gracefully...`);
    server.close(() => {
      console.log(`✅ Worker ${process.pid} shut down gracefully`);
      process.exit(0);
    });
  });

  const PORT = CONFIG.PORT;
  let server;
  
  try {
    server = app.listen(PORT, () => {
      console.log(`✅ WORKER PROCESS (PID ${process.pid}) - Web Server listening on port ${PORT}`);
      // Notify master that worker is ready
      if (process.send) {
        process.send({ cmd: 'worker_ready', pid: process.pid, port: PORT });
      }
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

// 🆕 ENHANCED CLUSTER MANAGEMENT
cluster.on('online', (worker) => {
  console.log(`🟢 Worker ${worker.process.pid} is online`);
});

cluster.on('exit', (worker, code, signal) => {
  console.log(`🔴 Worker ${worker.process.pid} died (code: ${code}, signal: ${signal})`);
  
  // Auto-restart worker unless it's a controlled shutdown
  if (code !== 0) {
    console.log(`🔄 Restarting worker ${worker.process.pid}...`);
    cluster.fork();
  }
});

// MAIN EXECUTION FLOW
if (cluster.isPrimary) {
  if (!CONFIG.PRIVATE_KEY) {
    console.error("🛑 FATAL: PRIVATE_KEY environment variable is required.");
    process.exit(1);
  }
  
  console.log('🚀 STARTING BWAEZI PRODUCTION CLUSTER - GOD MODE ENABLED');
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
