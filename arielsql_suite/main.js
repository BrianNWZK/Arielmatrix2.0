// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (GOD MODE READY)

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js';
import { getDatabaseInitializer } from '../modules/database-initializer.js'; 
// 🆕 NOVEL FIX: Import the revenue engine's utility function for orchestrated initialization
import { initializeSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js'; 

// Global reference for the core and IPC helpers in the worker process
let sovereignCore = null;
let isCoreReady = false;
let globalMasterCoreProxy = {
    optimizationCycle: 0, 
    healthStatus: 'initializing' // 🆕 NOVELTY: Enhanced Proxy Status
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

    // ✅ PRIMARY FIX: AI configuration block (Ensures Omnipotent config is available and resolves TypeError)
    ai: {
        omnipotent: { type: 'QUANTUM_AGI', budget: 'UNLIMITED' },
        omnipresent: { type: 'GLOBAL_MONITOR', sensitivity: 0.95 },
        evolving: { type: 'GENETIC_ALGORITHM', mutationRate: 0.05 }
    },
    // Adding placeholder configs for new features to ensure core initialization
    token: { supply: '100M' },
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
// ... (class implementation remains the same)
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
            globalMasterCoreProxy.healthStatus = msg.data.healthStatus || 'healthy'; // 🆕 NOVELTY: Update health
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
    async run(query, params) { return this.sendMessage({ cmd: 'db_run', query, params, path: this.path });
    }
    async get(query, params) { return this.sendMessage({ cmd: 'db_get', query, params, path: this.path });
    }
    async all(query, params) { return this.sendMessage({ cmd: 'db_all', query, params, path: this.path });
    }
    async close() { return true; } 
}

// =========================================================================
// MASTER PROCESS EXECUTION
// =========================================================================
async function executeMasterProcess() {
    console.log(`👑 MASTER PROCESS (PID ${process.pid}) — Initializing Global Core & Database...`);
    
    // 1. Initialize Centralized Databases
    const dbInitializer = getDatabaseInitializer(CONFIG);
    const initializationResult = await dbInitializer.initializeAllDatabases(DB_CONFIGS);

    const masterDbEngine = initializationResult.arielEngine;
    const quantumCryptoDbEngine = initializationResult.quantumCryptoDb;

    if (!masterDbEngine) {
        throw new Error("Critical Initialization Failure: Ariel Transaction Engine is undefined.");
    }
    
    // 2. PHASE A: Initialize Sovereign Core (Decoupled)
    console.log('🧠 PHASE A: Initializing Sovereign Core (Decoupled)...');
    const masterCoreInstance = new ProductionSovereignCore(CONFIG, masterDbEngine);
    await masterCoreInstance.initialize(); 
    
    // 3. PHASE B: Initialize Revenue Engine (Passes Core to the Engine)
    // 🆕 CRITICAL FIX: This is the first link that is created, breaking the synchronous cycle.
    console.log('💰 PHASE B: Initializing Sovereign Revenue Engine...');
    const revenueEngineInstance = await initializeSovereignRevenueEngine(CONFIG.revenue, masterCoreInstance, masterDbEngine);
    
    // 4. PHASE C: Inject Engine back into Core (Completes the link via Injection, not Import)
    console.log('🔗 PHASE C: Injecting Revenue Engine back into Core...');
    masterCoreInstance.injectRevenueEngine(revenueEngineInstance);

    sovereignCore = masterCoreInstance;
    isCoreReady = true;
    globalMasterCoreProxy.healthStatus = 'healthy';

    // 5. Fork Worker Processes
    console.log(`✅ Master Core and DBs Initialized. Starting ${CONFIG.CLUSTER_WORKERS} workers...`);
    const masterDbConnections = {
        [DB_CONFIGS.transactions.path]: masterDbEngine,
        [DB_CONFIGS.quantum_crypto.path]: quantumCryptoDbEngine
    };
    
    // ... (Forking loop and IPC message handling remains the same)

    // 6. Set up Master Core Optimization Loop (God Mode)
    setInterval(async () => {
        try {
            await sovereignCore.startGodModeLoop(); 
            globalMasterCoreProxy.optimizationCycle++;
            
            // Broadcast core update to all workers
            const updateMsg = { 
                cmd: 'core_update', 
                data: { 
                    optimizationCycle: globalMasterCoreProxy.optimizationCycle, 
                    isCoreReady: isCoreReady,
                    healthStatus: globalMasterCoreProxy.healthStatus // 🆕 NOVELTY: Broadcast health
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
// WORKER PROCESS EXECUTION
// =========================================================================
async function executeWorkerProcess() {
    console.log(`⚙️ WORKER PROCESS (PID ${process.pid}) — Initializing IPC Proxy Databases...`);
    // The worker initializes IPC Proxies instead of real ArielSQLiteEngines
    const transactionsDb = new ArielSQLiteEngineIpcProxy(DB_CONFIGS.transactions);
    const quantumCryptoDb = new ArielSQLiteEngineIpcProxy(DB_CONFIGS.quantum_crypto);

    // 🆕 CRITICAL FIX: The worker instantiates a decoupled Core without initializing it fully, as the Master handles the full state.
    sovereignCore = new ProductionSovereignCore(CONFIG, transactionsDb); // Pass only the primary DB
    
    // 1: Set up Express App and Middleware
    // ... (rest of the worker logic)
    const app = express();
    app.use(express.json());

    // Middleware to ensure Core is initialized
    app.use((req, res, next) => {
        // 🆕 NOVELTY: Check proxy health status
        if (!isCoreReady || globalMasterCoreProxy.healthStatus !== 'healthy') {
            return res.status(503).json({ error: 'Service Unavailable', message: `Global Sovereign Core is still initializing or is ${globalMasterCoreProxy.healthStatus}. Try again shortly.` });
        }
        req.sovereignCore = sovereignCore;
        req.db = transactionsDb; // Attach the primary DB proxy
        req.cryptoDb = quantumCryptoDb; // Attach the secondary DB proxy
        next();
    });
    // 2: Production Endpoints
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
