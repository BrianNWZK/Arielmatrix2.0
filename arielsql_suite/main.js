// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (GOD MODE READY)
import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js';
import { getDatabaseInitializer } from '../modules/database-initializer.js'; // ✅ NOVEL FIX: Import Database Initializer

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

    // ✅ PRIMARY FIX: AI configuration block (Ensures Omnipotent config is available and resolves TypeError)
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
    
    // 1. Initialize Centralized Databases (REFACTORED to use DatabaseInitializer)
    const dbInitializer = getDatabaseInitializer(CONFIG);
    const initializationResult = await dbInitializer.initializeAllDatabases(DB_CONFIGS);

    // Destructure core engines from the result (This is the logical replacement for the failing line ~164)
    const masterDbEngine = initializationResult.arielEngine; // The transactions DB
    const quantumCryptoDbEngine = initializationResult.quantumCryptoDb; // The quantum crypto DB

    if (!masterDbEngine) {
        throw new Error("Critical Initialization Failure: Ariel Transaction Engine is undefined.");
    }
    
    // 2. Initialize Sovereign Core (AIGOVERNOR)
    const masterCoreInstance = new ProductionSovereignCore(CONFIG, masterDbEngine); 
    await masterCoreInstance.initialize();

    sovereignCore = masterCoreInstance;
    isCoreReady = true;

    // 3. Fork Worker Processes
    console.log(`✅ Master Core and DBs Initialized. Starting ${CONFIG.CLUSTER_WORKERS} workers...`);
    
    // A map to hold all active master database connections for IPC routing
    const masterDbConnections = {
        [DB_CONFIGS.transactions.path]: masterDbEngine,
        [DB_CONFIGS.quantum_crypto.path]: quantumCryptoDbEngine
    };
    
    for (let i = 0; i < CONFIG.CLUSTER_WORKERS; i++) {
        const worker = cluster.fork();
        
        // Handle IPC messages from workers
        worker.on('message', async (msg) => {
            if (msg.cmd && msg.cmd.startsWith('db_') && msg.path) {
                // Route database command to the correct database engine based on path
                const dbEngine = masterDbConnections[msg.path];
                if (dbEngine) {
                    // ... (Database routing logic remains the same)
                    try {
                        let result;
                        if (msg.cmd === 'db_run') {
                            result = await dbEngine.run(msg.query, msg.params);
                        } else if (msg.cmd === 'db_get') {
                            result = await dbEngine.get(msg.query, msg.params);
                        } else if (msg.cmd === 'db_all') {
                            result = await dbEngine.all(msg.query, msg.params);
                        }
                        worker.send({ cmd: 'db_response', id: msg.id, result: result });
                    } catch (dbError) {
                        console.error(`🛑 Master DB Error for worker ${worker.process.pid}:`, dbError.message);
                        worker.send({ cmd: 'db_response', id: msg.id, error: dbError.message });
                    }
                } else {
                    console.warn(`⚠️ Master Process: IPC DB request for unknown path: ${msg.path}`);
                    worker.send({ cmd: 'db_response', id: msg.id, error: `Unknown database path: ${msg.path}` });
                }
            }
        });
    }

    // 4. Set up Master Core Optimization Loop (God Mode)
    setInterval(async () => {
        try {
            await sovereignCore.godModeOptimizationCycle();
            globalMasterCoreProxy.optimizationCycle++;
            
            // Broadcast core update to all workers
            const updateMsg = { 
                cmd: 'core_update', 
                data: { 
                    optimizationCycle: globalMasterCoreProxy.optimizationCycle, 
                    isCoreReady: isCoreReady 
                } 
            };
            for (const id in cluster.workers) {
                cluster.workers[id].send(updateMsg);
            }
        } catch (error) {
            console.error('🛑 God Mode Optimization Cycle Failed:', error.message);
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

    sovereignCore = new ProductionSovereignCore(CONFIG, transactionsDb, quantumCryptoDb); 
    await sovereignCore.initialize();

    // 1: Set up Express App and Middleware
    // ... (rest of the worker logic)
    const app = express();
    app.use(express.json());

    // Middleware to ensure Core is initialized
    app.use((req, res, next) => {
        if (!isCoreReady) {
            return res.status(503).json({ error: 'Service Unavailable', message: 'Global Sovereign Core is still initializing. Try again shortly.' });
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
