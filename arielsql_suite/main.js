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
  // Retaining the reduced worker count to help with the OOM problem
  CLUSTER_WORKERS: parseInt(process.env.CLUSTER_WORKERS) || 2, 
  QUANTUM_PROCESSING_UNITS: parseInt(process.env.QUANTUM_PROCESSING_UNITS) || 8,
  QUANTUM_ENTANGLEMENT_NODES: parseInt(process.env.QUANTUM_ENTANGLEMENT_NODES) || 16
};

// Global reference for the core in the worker process
let sovereignCore = null;
let isCoreReady = false;

// --- 1. ASYNCHRONOUS CORE INITIALIZATION (Called AFTER port binding) ---
async function initializeCore() {
    try {
        console.log(`[WORKER ${process.pid}] Starting BSFM Sovereign Core initialization...`);
        
        const coreConfig = {
            // ... (omitted coreConfig for brevity, same as before) ...
            token: { contractAddress: CONFIG.BWAEZI_KERNEL_ADDRESS, founderAddress: CONFIG.SOVEREIGN_WALLET, rpcUrl: CONFIG.RPC_URLS[0], privateKey: CONFIG.PRIVATE_KEY },
            db: { path: './data/arielsql_production.db', maxConnections: os.cpus().length * 2 },
            revenue: { initialRiskTolerance: 0.05, cycleLengthMs: 10 },
            crypto: { algorithm: 'PQC_DILITHIUM_KYBER', keyRefreshInterval: 3600000 },
            ai: { omnipotent: { logLevel: 'high' }, omnipresent: { networkInterfaces: os.networkInterfaces() }, evolving: { geneticPoolSize: 1000 } },
            quantum: { processingUnits: CONFIG.QUANTUM_PROCESSING_UNITS, entanglementNodes: CONFIG.QUANTUM_ENTANGLEMENT_NODES }
        };

        sovereignCore = new ProductionSovereignCore(coreConfig);
        await sovereignCore.initialize();
        isCoreReady = true; // Set flag once initialization is complete

        console.log(`[WORKER ${process.pid}] BSFM Sovereign Core is fully operational.`);
    } catch (error) {
        console.error(`💥 CORE INITIALIZATION ERROR [${process.pid}]:`, error.stack);
        // Do NOT exit here. Keep the port bound, but respond 503 on the API.
    }
}

// --- 2. WORKER PROCESS (Starts Server Synchronously) ---
function executeWorkerProcess() {
    // Synchronous block to guarantee Express setup and port binding first.
    const app = express();
    const PORT = CONFIG.PORT;
    let server = null;

    // Health Check Endpoint and Status Route
    app.get('/', (req, res) => {
        // Check the flag for core readiness before responding 200
        if (isCoreReady) {
            res.status(200).send('🧠 BSFM Sovereign Core is **operational** and generating revenue.');
        } else {
            // Respond 503 if the port is bound but initialization is not yet complete
            res.status(503).send('⏳ BSFM Sovereign Core is initializing. Please wait...');
        }
    });
    
    try {
        // CRITICAL FIX: The Express server starts LISTENING synchronously.
        server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`[WORKER ${process.pid}] ✅ CRITICAL BINDING SUCCESSFUL. Listening on 0.0.0.0:${PORT}`);
            
            // Only AFTER the server is successfully bound, start the heavy asynchronous core initialization.
            initializeCore();
        });
    } catch (error) {
        // If the port binding fails here, the error is critical and should exit
        console.error(`💥 FATAL PORT BINDING ERROR [${process.pid}]:`, error.stack);
        process.exit(1);
    }
    
    // Graceful Shutdown Handler
    process.on('SIGINT', async () => {
        console.log(`[WORKER ${process.pid}] SIGINT received. Shutting down...`);
        if (server) server.close();
        if (sovereignCore) await sovereignCore.emergencyShutdown();
        process.exit(0);
    });
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
