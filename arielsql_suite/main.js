// arielsql_suite/main.js — BSFM MASTER LAUNCHER (v18.0)
// 🌍 GLOBAL SOVEREIGN FINANCIAL MATRIX — INTELLIGENCE-FIRST DEPLOYMENT

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';

const CONFIG = {
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  BWAEZI_KERNEL_ADDRESS: process.env.BWAEZI_KERNEL_ADDRESS,
  SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET,
  PORT: process.env.PORT || 10000,
  NODE_ENV: process.env.NODE_ENV || 'production',
  RPC_URLS: [
    "https://eth.llamarpc.com",
    "https://rpc.ankr.com/eth",
    "https://cloudflare-eth.com"
  ],
  GOD_MODE_INTERVAL: parseInt(process.env.GOD_MODE_INTERVAL) || 5000,
  CLUSTER_WORKERS: parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length,
  QUANTUM_PROCESSING_UNITS: parseInt(process.env.QUANTUM_PROCESSING_UNITS) || 8,
  QUANTUM_ENTANGLEMENT_NODES: parseInt(process.env.QUANTUM_ENTANGLEMENT_NODES) || 16
};

async function executeWorkerProcess() {
  try {
    console.log(`[WORKER ${process.pid}] Starting BSFM Sovereign Core...`);

    // ✅ Bind to a port so Render keeps the service alive
    const app = express();
    const PORT = CONFIG.PORT;

    app.get('/', (req, res) => {
      res.send('🧠 BSFM Sovereign Core is alive and listening.');
    });

    app.listen(PORT, () => {
      console.log(`[WORKER ${process.pid}] Listening on port ${PORT}`);
    });

    // ✅ Initialize the Sovereign Core
    const coreConfig = {
      token: {
        contractAddress: CONFIG.BWAEZI_KERNEL_ADDRESS,
        founderAddress: CONFIG.SOVEREIGN_WALLET,
        rpcUrl: CONFIG.RPC_URLS[0],
        privateKey: CONFIG.PRIVATE_KEY
      },
      db: {
        path: './data/arielsql_production.db',
        maxConnections: os.cpus().length * 2
      },
      revenue: {
        initialRiskTolerance: 0.05,
        cycleLengthMs: 10
      },
      crypto: {
        algorithm: 'PQC_DILITHIUM_KYBER',
        keyRefreshInterval: 3600000
      },
      ai: {
        omnipotent: { logLevel: 'high' },
        omnipresent: { networkInterfaces: os.networkInterfaces() },
        evolving: { geneticPoolSize: 1000 }
      },
      quantum: {
        processingUnits: CONFIG.QUANTUM_PROCESSING_UNITS,
        entanglementNodes: CONFIG.QUANTUM_ENTANGLEMENT_NODES
      }
    };

    const sovereignCore = new ProductionSovereignCore(coreConfig);
    await sovereignCore.initialize();

    console.log(`[WORKER ${process.pid}] BSFM Sovereign Core is operational.`);

    process.on('SIGINT', async () => {
      console.log(`[WORKER ${process.pid}] SIGINT received. Shutting down...`);
      await sovereignCore.emergencyShutdown();
      process.exit(0);
    });

  } catch (error) {
    console.error(`💥 FATAL ERROR [${process.pid}]:`, error.message);
    process.exit(1);
  }
}

function executeMasterProcess() {
  console.log(`👑 MASTER PROCESS (PID ${process.pid}) — Forking ${CONFIG.CLUSTER_WORKERS} workers...`);
  for (let i = 0; i < CONFIG.CLUSTER_WORKERS; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.error(`🛑 Worker ${worker.process.pid} exited. Respawning...`);
    cluster.fork();
  });
}

if (cluster.isPrimary) {
  executeMasterProcess();
} else {
  if (!CONFIG.PRIVATE_KEY || !CONFIG.BWAEZI_KERNEL_ADDRESS) {
    console.error("❌ Missing PRIVATE_KEY or BWAEZI_KERNEL_ADDRESS.");
    process.exit(1);
  }
  executeWorkerProcess();
}

export { executeWorkerProcess, CONFIG };
