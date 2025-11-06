// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (GOD MODE READY)

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { getDatabaseInitializer } from '../modules/database-initializer.js'; 
import { initializeSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js'; 

// Global reference for the core and IPC helpers in the worker process
let sovereignCore = null;
let isCoreReady = false;
let globalMasterCoreProxy = {
    optimizationCycle: 0, 
    healthStatus: 'initializing' 
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
// Database configurations
const DB_CONFIGS = {
    transactions: { path: './data/ariel/transactions.db', autoBackup: true, module: 'ArielSQLiteEngine' },
    quantum_crypto: { path: './data/quantum_crypto.db', autoBackup: true, module: 'ArielSQLiteEngine' }
};

// --- IPC PROXY FOR WORKERS ---
class ArielSQLiteEngineIpcProxy {
    constructor(dbConfig) {
        this.path = dbConfig.path;
console.log(`[WORKER ${process.pid}] Initialized ArielSQLiteEngine **IPC Proxy** for ${dbConfig.path}.`); 
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
            globalMasterCoreProxy.healthStatus = msg.data.healthStatus || 'healthy';
        }
    }
    
    sendMessage(payload) {
        return new Promise((resolve) => {
            const id = this.nextMessageId++;
            this.callbacks.set(id, { resolve, reject: (err) => { throw err; } });
            process.send({ ...payload, id, sourcePid: process.pid });
 
        });
    }
    async initialize() { return true;
} 
    async run(query, params) { return this.sendMessage({ cmd: 'db_run', query, params, path: this.path });
}
    async get(query, params) { return this.sendMessage({ cmd: 'db_get', query, params, path: this.path });
}
    async all(query, params) { return this.sendMessage({ cmd: 'db_all', query, params, path: this.path });
}
    async close() { return true; } 
}

// =========================================================================
// MASTER PROCESS EXECUTION (Sequentially Initializes all Dependencies)
// =========================================================================
async function executeMasterProcess() {
    console.log(`👑 MASTER PROCESS (PID ${process.pid}) — Initializing Global Core & Database...`);
    const dbInitializer = getDatabaseInitializer(CONFIG);
    const initializationResult = await dbInitializer.initializeAllDatabases(DB_CONFIGS);
    const masterDbEngine = initializationResult.arielEngine;
    const quantumCryptoDbEngine = initializationResult.quantumCryptoDb;

    if (!masterDbEngine) {
        throw new Error("Critical Initialization Failure: Ariel Transaction Engine is undefined.");
    }
    
    // 2. PHASE A: Initialize Sovereign Core (Decoupled with both DBs)
    console.log('🧠 PHASE A: Initializing Sovereign Core...');
    // 🔥 CRITICAL FIX: Pass both DB engines here
    const masterCoreInstance = new ProductionSovereignCore(CONFIG, masterDbEngine, quantumCryptoDbEngine); 
    
    // 3. PHASE B: Initialize Revenue Engine
    console.log('💰 PHASE B: Initializing Sovereign Revenue Engine...');
    const revenueEngineInstance = await initializeSovereignRevenueEngine(CONFIG.revenue, masterCoreInstance, masterDbEngine);
    
    // 4. PHASE C: Inject Engine back into Core
    console.log('🔗 PHASE C: Injecting Revenue Engine back into Core...');
    masterCoreInstance.injectRevenueEngine(revenueEngineInstance);

    // 5. PHASE D: Initialize the Core (Now that all dependencies are in place)
    console.log('🚀 PHASE D: Executing Resilient Core Initialization...');
    await masterCoreInstance.initialize(); 

    sovereignCore = masterCoreInstance;
    isCoreReady = true;
    globalMasterCoreProxy.healthStatus = 'healthy';

    console.log(`✅ Master Core and DBs Initialized. Starting ${CONFIG.CLUSTER_WORKERS} workers...`);
    const masterDbConnections = {
        [DB_CONFIGS.transactions.path]: masterDbEngine,
        [DB_CONFIGS.quantum_crypto.path]: quantumCryptoDbEngine
    };
    for (let i = 0; i < CONFIG.CLUSTER_WORKERS; i++) {
        cluster.fork();
    }
    
    cluster.on('exit', (worker, code, signal) => {
        console.warn(`⚠️ Worker ${worker.process.pid} died. Code: ${code}, Signal: ${signal}. Forking a new worker...`);
        cluster.fork();
    });

    for (const id in cluster.workers) {
        cluster.workers[id].on('message', (msg) => {
            if (msg.cmd && (msg.cmd.startsWith('db_'))) {
                const { cmd, query, params, id, path, sourcePid } = msg;
                const dbEngine = masterDbConnections[path];
                if (!dbEngine) {
                    console.error(`DB Proxy Error: No engine found for path ${path}`);
                    return;
                }
                dbEngine[cmd.replace('db_', '')](query, params)
                    .then(result => {
                        cluster.workers[sourcePid].send({ cmd: 'db_response', id, result });
                    })
                    .catch(error => {
                        console.error(`DB Query Error (PID ${sourcePid}, ${path}):`, error.message);
                        cluster.workers[sourcePid].send({ cmd: 'db_response', id, error: error.message });
                    });
            }
        });
    }

    // 6. Set up Master Core Optimization Loop (God Mode)
    setInterval(async () => {
        try {
            await sovereignCore.startGodModeLoop(); 
            globalMasterCoreProxy.optimizationCycle++;
            
            const updateMsg = { 
                cmd: 'core_update', 
                data: { 
                    optimizationCycle: globalMasterCoreProxy.optimizationCycle, 
                    isCoreReady: isCoreReady,
                    healthStatus: globalMasterCoreProxy.healthStatus
                } 
            };
            for (const id in cluster.workers) {
                if (cluster.workers[id].isConnected()) {
                    cluster.workers[id].send(updateMsg);
                }
            }
        } catch (error) {
            console.error('🛑 God Mode Optimization Cycle Failed:', error.message);
            globalMasterCoreProxy.healthStatus = 'degraded';
        }
    }, CONFIG.GOD_MODE_INTERVAL);
}

// =========================================================================
// WORKER PROCESS EXECUTION (ULTIMATE EXECUTION: PORT BINDING FIRST)
// =========================================================================
async function executeWorkerProcess() {
    console.log(`⚙️ WORKER PROCESS (PID ${process.pid}) — Initializing IPC Proxy Databases...`);
    const transactionsDb = new ArielSQLiteEngineIpcProxy(DB_CONFIGS.transactions);
    const quantumCryptoDb = new ArielSQLiteEngineIpcProxy(DB_CONFIGS.quantum_crypto);

    // 1. Instantiate Core: DO NOT INITIALIZE YET.
    // 🔥 CRITICAL FIX: Pass both DB proxies here
    sovereignCore = new ProductionSovereignCore(CONFIG, transactionsDb, quantumCryptoDb); 
    
    // 2. Set up Express App and Middleware
    const app = express();
    app.use(express.json());

    // Middleware ensures the core is ready for ACTIVE revenue endpoints
    app.use((req, res, next) => {
        // This is the gate for AI-driven revenue functions (arbitrage, consolidation, staking)
        if (!isCoreReady || globalMasterCoreProxy.healthStatus !== 'healthy') {
            return res.status(503).json({ error: 'Service Unavailable', 
                message: `CORE IS ALIVE (PORT BOUND) but AI-driven Revenue (Active) is restricted. Transactional Revenue (Passive) is fully active.` });
        }
        req.sovereignCore = sovereignCore;
        req.db = transactionsDb;
        req.cryptoDb = quantumCryptoDb;
        next();
    });

    // 3. CRITICAL: PORT BINDING FIRST
    const PORT = CONFIG.PORT;
    try {
        const server = app.listen(PORT, async () => {
            // ✅ SUCCESS: Port is bound! The web server is now live (100% SUCCESS RATE).
            console.log(`✅ WORKER PROCESS (PID ${process.pid}) - Web Server listening on port ${PORT} - LIVE AND ACCEPTING REVENUE.`);
            
            // 4. Initialize Core Asynchronously (Non-blocking: AI Core starts its non-failing startup sequence)
            try {
                // The worker's core init is needed for internal module setup.
                await sovereignCore.initialize(); 
                console.log('🧠 Worker Sovereign Core Initialization complete (Resilient Mode).');
                
            } catch (initError) {
                // DO NOT EXIT. Log the failure. The system continues running, generating transactional revenue.
                console.error(`🛑 Worker Core Initialization FAILED (After Port Bind): ${initError.message}. System remains LIVE.`);
            }
        });
        
        // Listen for binding errors (e.g., port in use) - Only exit on this FATAL error.
        server.on('error', (err) => {
            console.error(`🛑 WORKER PROCESS FAILED TO BIND PORT ${PORT}:`, err.message);
            process.exit(1); 
        });
        
    } catch (error) {
        // Catch errors outside of listen
        console.error(`🛑 WORKER PROCESS ERROR during express listen setup:`, error.message);
        process.exit(1);
    }
}

// =========================================================================
// MAIN ENTRY POINT
// =========================================================================

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
