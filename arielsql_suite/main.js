// arielsql_suite/main.js — BSFM MASTER LAUNCHER (v18.0)
// 🌍 GLOBAL SOVEREIGN FINANCIAL MATRIX — INTELLIGENCE-FIRST DEPLOYMENT

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
// Assuming this is a local file in your project
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
  // 👇 TEMPORARY OOM FIX: Reducing default workers from 8 to 2 for 512MiB instance
  CLUSTER_WORKERS: parseInt(process.env.CLUSTER_WORKERS) || 2, 
  QUANTUM_PROCESSING_UNITS: parseInt(process.env.QUANTUM_PROCESSING_UNITS) || 8,
  QUANTUM_ENTANGLEMENT_NODES: parseInt(process.env.QUANTUM_ENTANGLEMENT_NODES) || 16
};

// Global reference for the core in the worker process
let sovereignCore = null;

async function initializeCore() {
    console.log(`[WORKER ${process.pid}] Starting BSFM Sovereign Core initialization...`);
    
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

    sovereignCore = new ProductionSovereignCore(coreConfig);
    await sovereignCore.initialize();

    console.log(`[WORKER ${process.pid}] BSFM Sovereign Core is fully operational.`);
}

async function executeWorkerProcess() {
    try {
        const app = express();
        const PORT = CONFIG.PORT;

        // FIX: Port Binding MUST happen immediately to pass Render's health check
        app.get('/', (req, res) => {
            // Respond with a 503 Service Unavailable if the core isn't ready yet
            if (sovereignCore) {
                res.status(200).send('🧠 BSFM Sovereign Core is operational.');
            } else {
                res.status(503).send('⏳ BSFM Sovereign Core is initializing...');
            }
        });
        
        // Start the HTTP server first and wait for it to listen
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`[WORKER ${process.pid}] ✅ Port Binding successful. Listening on 0.0.0.0:${PORT}`);
        });

        // Then, immediately proceed with the core's asynchronous and expensive initialization
        await initializeCore();

        // Graceful Shutdown Handler
        process.on('SIGINT', async () => {
            console.log(`[WORKER ${process.pid}] SIGINT received. Shutting down...`);
            server.close(() => {
                console.log(`[WORKER ${process.pid}] HTTP server closed.`);
                if (sovereignCore) sovereignCore.emergencyShutdown().then(() => process.exit(0));
                else process.exit(0);
            });
        });

    } catch (error) {
        console.error(`💥 FATAL ERROR [${process.pid}]:`, error.stack);
        process.exit(1);
    }
}

function executeMasterProcess() {
    console.log(`👑 MASTER PROCESS (PID ${process.pid}) — Forking ${CONFIG.CLUSTER_WORKERS} workers...`);
    for (let i = 0; i < CONFIG.CLUSTER_WORKERS; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.error(`🛑 Worker ${worker.process.pid} exited with code ${code}. Respawning...`);
        cluster.fork();
    });
}

if (cluster.isPrimary) {
    executeMasterProcess();
} else {
    if (!CONFIG.PRIVATE_KEY || !CONFIG.BWAEZI_KERNEL_ADDRESS) {
        console.error("❌ Missing PRIVATE_KEY or BWAEZI_KERNEL_ADDRESS. Worker cannot initialize.");
        process.exit(1);
    }
    executeWorkerProcess();
}

export { executeWorkerProcess, CONFIG };
