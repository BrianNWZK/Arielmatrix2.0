// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (GOD MODE READY)
import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js';

// Global reference for the core and IPC helpers in the worker process
let sovereignCore = null;
let isCoreReady = false;
let globalMasterCoreProxy = {
    optimizationCycle: 0 // Used by the worker's status check
};

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

    // ✅ FIXED: AI configuration block (Ensures Omnipotent config is available)
    ai: {
        omnipotent: { type: 'QUANTUM_AGI', budget: 'UNLIMITED' },
        omnipresent: { type: 'GLOBAL_MONITOR', sensitivity: 0.95 },
        evolving: { type: 'GENETIC_ALGORITHM', mutationRate: 0.05 }
    },
    // Adding placeholder configs for new features to ensure core initialization
    token: { supply: '10B' },
    crypto: { algorithm: 'QR-ECDSA' },
    revenue: { currency: 'BWAEZI' },
    reality: { dimension: 'BWAEZI_REALM' },
    cortex: { model: 'NEURAL_QUANTUM' },
    qpu: { vendor: 'QUANTUM_X' }
};

// Database configurations (ArielSQLiteEngine)
const DB_CONFIGS = {
    transactions: { path: './data/ariel/transactions.db', autoBackup: true, module: 'ArielSQLiteEngine' },
    quantum_crypto: { path: './data/quantum_crypto.db', autoBackup: true, module: 'ArielSQLiteEngine' }
};

// --- IPC PROXY FOR WORKERS (Replaces direct DB connection) ---
class ArielSQLiteEngineIpcProxy {
    constructor(dbConfig) {
        this.path = dbConfig.path;
        console.log(`[WORKER ${process.pid}] Initialized ArielSQLiteEngine **IPC Proxy**.`);
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
            this.callbacks.set(id, { resolve, reject: (err) => { throw err; } });
            process.send({ ...payload, id, sourcePid: process.pid });
        });
    }
    async initialize() { return true; } 
    async run(query, params) { return this.sendMessage({ cmd: 'db_run', query, params }); }
    async get(query, params) { return this.sendMessage({ cmd: 'db_get', query, params }); }
    async all(query, params) { return this.sendMessage({ cmd: 'db_all', query, params }); }
    async close() { return true; } 
}

// =========================================================================
// MASTER PROCESS EXECUTION 
// =========================================================================

async function executeMasterProcess() {
    console.log(`👑 MASTER PROCESS (PID ${process.pid}) — Initializing Global Core & Database...`);
    
    // 1. Initialize Centralized Databases
    const masterDbEngine = new ArielSQLiteEngine(DB_CONFIGS.transactions);
    await masterDbEngine.initialize();
    
    const quantumCryptoDbEngine = new ArielSQLiteEngine(DB_CONFIGS.quantum_crypto);
    await quantumCryptoDbEngine.initialize();

    // 2. Initialize Sovereign Core (AIGOVERNOR)
    // Pass the main CONFIG object
    const masterCoreInstance = new ProductionSovereignCore(CONFIG, masterDbEngine); 
    await masterCoreInstance.initialize();
    
    console.log(`✅ Master Core and DBs Initialized. Starting ${CONFIG.CLUSTER_WORKERS} workers...`);

    // 3. Fork Worker Processes
    for (let i = 0; i < CONFIG.CLUSTER_WORKERS; i++) {
        const worker = cluster.fork();
        
        // Handle IPC messages from workers
        worker.on('message', async (msg) => {
            if (msg.cmd && msg.cmd.startsWith('db_')) {
                const { cmd, id, query, params, sourcePid } = msg;
                let result = null;
                
                try {
                    if (cmd === 'db_run') {
                        result = await masterDbEngine.run(query, params);
                    } else if (cmd === 'db_get') {
                        result = await masterDbEngine.get(query, params);
                    } else if (cmd === 'db_all') {
                        result = await masterDbEngine.all(query, params);
                    }
                    
                    worker.send({ cmd: 'db_response', id, result });
                } catch (error) {
                    console.error(`🛑 Master DB Error from Worker ${sourcePid}:`, error.message);
                    worker.send({ cmd: 'db_response', id, error: error.message });
                }
            }
        });
    }
    
    // 4. Cluster Management
    cluster.on('exit', (worker, code, signal) => {
        console.log(`⚠️ Worker ${worker.process.pid} died with code ${code}, signal ${signal}. Respawning...`);
        cluster.fork();
    });
    
    // 5. Master-to-Worker communication loop (To sync Core state)
    setInterval(() => {
        const coreState = {
            isCoreReady: masterCoreInstance.isInitialized,
            optimizationCycle: masterCoreInstance.optimizationCycle
        };
        for (const id in cluster.workers) {
            if (cluster.workers[id]) {
                cluster.workers[id].send({ cmd: 'core_update', data: coreState });
            }
        }
    }, 1000); 
}

// =========================================================================
// WORKER PROCESS EXECUTION 
// =========================================================================

async function executeWorkerProcess() {
    console.log(`🛠️ WORKER PROCESS (PID ${process.pid}) — Initializing IPC and Core Proxy...`);

    // 1. Initialize IPC Proxy for DB access
    const workerDbProxy = new ArielSQLiteEngineIpcProxy(DB_CONFIGS.transactions);
    
    // 2. Initialize Sovereign Core (AIGOVERNOR) using the IPC Proxy
    sovereignCore = new ProductionSovereignCore(CONFIG, workerDbProxy);
    await sovereignCore.initialize(); 

    // =========================================================
    // 🔥 CRITICAL FIX 3: Start Web Server for Port Binding
    // =========================================================
    const app = express();
    app.use(express.json());

    // Middleware to ensure Core is initialized 
    app.use((req, res, next) => {
        if (!isCoreReady) { 
            return res.status(503).json({ 
                error: 'Service Unavailable',
                message: 'Global Sovereign Core is still initializing. Try again shortly.' 
            });
        }
        req.sovereignCore = sovereignCore; 
        next();
    });

    // Production Endpoints (Example: Health Check and Core Status)
    app.get('/status', (req, res) => {
        res.json({
            status: 'OK',
            pid: process.pid,
            coreReady: isCoreReady,
            optimizationCycle: globalMasterCoreProxy.optimizationCycle,
            environment: CONFIG.NODE_ENV,
            sovereignCoreStatus: sovereignCore.getStatus() // Use the enhanced status method
        });
    });
    
    // Add more API endpoints here (e.g., /api/revenue, /api/governance)

    const PORT = CONFIG.PORT;
    try {
        const server = app.listen(PORT, () => {
            console.log(`✅ WORKER PROCESS (PID ${process.pid}) - Web Server listening on port ${PORT}`);
        });
        
        // Enhanced Error handling for port binding
        server.on('error', (err) => {
            console.error(`🛑 WORKER PROCESS FAILED TO BIND PORT ${PORT}:`, err.message);
            process.exit(1);
        });
        
    } catch (error) {
        console.error(`🛑 WORKER PROCESS ERROR during express listen:`, error.message);
        process.exit(1);
    }
}

// =========================================================================
// MAIN ENTRY POINT
// =========================================================================

// Use cluster.isPrimary (Node.js standard) instead of cluster.isMaster (deprecated)
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
        console.error('💥 FATAL WORKER PROCESS ERROR:', err.name, ':', err.message);
        console.error(err.stack);
        process.exit(1);
    });
}
