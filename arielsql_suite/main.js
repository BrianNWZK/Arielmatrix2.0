// main.js - BSFM PRODUCTION CLUSTER ENTRY POINT (IPC SYNCHRONIZED)
import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
// Assuming these are local files in your project
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
    CLUSTER_WORKERS: parseInt(process.env.CLUSTER_WORKERS) || 2, 
    QUANTUM_PROCESSING_UNITS: parseInt(process.env.QUANTUM_PROCESSING_UNITS) || 8,
    QUANTUM_ENTANGLEMENT_NODES: parseInt(process.env.QUANTUM_ENTANGLEMENT_NODES) || 16
};

// --- IPC PROXY FOR WORKERS (Replaces direct DB connection) ---
// Workers use this object to send messages to the Master for DB operations.
class ArielSQLiteEngineIpcProxy {
    constructor(dbConfig) {
        this.path = dbConfig.path;
        console.log(`[WORKER ${process.pid}] Initialized ArielSQLiteEngine **IPC Proxy**.`);
        this.nextMessageId = 0;
        this.callbacks = new Map();
    }
    
    // Workers only need a minimal set of DB methods proxied
    async initialize() { return true; } // Initialization is a no-op for the proxy
    async run(query, params) { return this.sendMessage({ cmd: 'db_run', query, params }); }
    async get(query, params) { return this.sendMessage({ cmd: 'db_get', query, params }); }
    async all(query, params) { return this.sendMessage({ cmd: 'db_all', query, params }); }

    sendMessage(message) {
        return new Promise((resolve, reject) => {
            const id = this.nextMessageId++;
            this.callbacks.set(id, { resolve, reject });
            
            // Add ID and send to Master
            process.send({ ...message, id, sourcePid: process.pid });
            
            // Set a timeout for safety
            setTimeout(() => {
                if (this.callbacks.has(id)) {
                    this.callbacks.delete(id);
                    reject(new Error(`IPC timeout for DB command: ${message.cmd}`));
                }
            }, 5000); 
        });
    }

    handleResponse({ id, result, error }) {
        const handler = this.callbacks.get(id);
        if (handler) {
            this.callbacks.delete(id);
            if (error) {
                handler.reject(new Error(error));
            } else {
                handler.resolve(result);
            }
        }
    }
}

// --- 1. ASYNCHRONOUS CORE INITIALIZATION (Called AFTER port binding) ---
async function initializeCore(dbEngineInstance) {
    try {
        console.log(`[WORKER ${process.pid}] Starting BSFM Sovereign Core initialization...`);
        
        const coreConfig = {
            token: { contractAddress: CONFIG.BWAEZI_KERNEL_ADDRESS, founderAddress: CONFIG.SOVEREIGN_WALLET, rpcUrl: CONFIG.RPC_URLS[0], privateKey: CONFIG.PRIVATE_KEY },
            db: { path: './data/arielsql_production.db', maxConnections: os.cpus().length * 2 },
            revenue: { initialRiskTolerance: 0.05, cycleLengthMs: 10 },
            crypto: { algorithm: 'PQC_DILITHIUM_KYBER', keyRefreshInterval: 3600000 },
            ai: { omnipotent: { logLevel: 'high' }, omnipresent: { networkInterfaces: os.networkInterfaces() }, evolving: { geneticPoolSize: 1000 } },
            quantum: { processingUnits: CONFIG.QUANTUM_PROCESSING_UNITS, entanglementNodes: CONFIG.QUANTUM_ENTANGLEMENT_NODES }
        };

        // ⬇️ CRITICAL: Pass the DB Proxy to the Core
        sovereignCore = new ProductionSovereignCore(coreConfig, dbEngineInstance);
        
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
    // Instantiate the IPC Proxy for the worker's core
    const dbProxy = new ArielSQLiteEngineIpcProxy(CONFIG.db);
    
    // Set up IPC listener for responses from the Master
    process.on('message', (message) => {
        if (message.cmd === 'db_response' && message.id !== undefined) {
            dbProxy.handleResponse(message);
        }
        if (message.cmd === 'core_update' && message.optimizationCycle !== undefined) {
            globalMasterCoreProxy.optimizationCycle = message.optimizationCycle;
        }
    });

    const app = express();
    const PORT = CONFIG.PORT;
    let server = null;

    // Health Check Endpoint and Status Route
    app.get('/', (req, res) => {
        if (isCoreReady) {
            res.status(200).send(`🧠 BSFM Sovereign Core **operational** (Cycle ${globalMasterCoreProxy.optimizationCycle}).`);
        } else {
            res.status(503).send('⏳ BSFM Sovereign Core is initializing. Please wait...');
        }
    });
    
    try {
        server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`[WORKER ${process.pid}] ✅ CRITICAL BINDING SUCCESSFUL. Listening on 0.0.0.0:${PORT}`);
            
            // Only AFTER the server is successfully bound, start the heavy asynchronous core initialization,
            // passing the IPC proxy instead of a real DB instance.
            initializeCore(dbProxy);
        });
    } catch (error) {
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

// --- 3. MASTER PROCESS (Manages State and Forks Workers) ---
async function executeMasterProcess() {
    console.log(`👑 MASTER PROCESS (PID ${process.pid}) — Initializing Global Core & Database...`);
    
    // 1. Instantiate the SINGLE, TRUE Database Engine
    const masterDbEngine = new ArielSQLiteEngine(CONFIG.db);
    await masterDbEngine.initialize();
    
    // 2. Instantiate the SINGLE, TRUE Sovereign Core (for its God Mode Loop)
    const masterCore = new ProductionSovereignCore(CONFIG, masterDbEngine);
    await masterCore.initialize(); 

    // Update worker proxies with core state changes via broadcast
    const broadcastCoreUpdate = () => {
        for (const id in cluster.workers) {
            cluster.workers[id].send({ 
                cmd: 'core_update', 
                optimizationCycle: masterCore.optimizationCycle 
            });
        }
    };
    setInterval(broadcastCoreUpdate, 1000); // Broadcast core state every second

    console.log("✅ MASTER CORE is fully initialized. Ready to fork workers.");

    // 3. Set up IPC listener for worker DB requests
    cluster.on('message', async (worker, message, handle) => {
        if (message.cmd && message.cmd.startsWith('db_')) {
            const { cmd, id, query, params, sourcePid } = message;
            
            try {
                let result;
                if (cmd === 'db_run') {
                    result = await masterDbEngine.run(query, params);
                } else if (cmd === 'db_get') {
                    result = await masterDbEngine.get(query, params);
                } else if (cmd === 'db_all') {
                    result = await masterDbEngine.all(query, params);
                }
                
                // Send response back to the worker
                worker.send({ cmd: 'db_response', id, result });
            } catch (error) {
                console.error(`🛑 Master DB Error from Worker ${sourcePid}:`, error.message);
                worker.send({ cmd: 'db_response', id, error: error.message });
            }
        }
    });

    // 4. Fork Workers
    console.log(`— Forking ${CONFIG.CLUSTER_WORKERS} workers to handle web traffic...`);
    for (let i = 0; i < CONFIG.CLUSTER_WORKERS; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      console.error(`🛑 Worker ${worker.process.pid} exited with code ${code}. Respawning...`);
      cluster.fork();
    });
}

// --- EXECUTION START ---
if (cluster.isPrimary) {
    executeMasterProcess().catch(err => {
        console.error("💥 FATAL MASTER PROCESS ERROR:", err.stack);
        process.exit(1);
    });
} else {
    if (!CONFIG.PRIVATE_KEY || !CONFIG.BWAEZI_KERNEL_ADDRESS) {
        console.error("❌ Missing PRIVATE_KEY or BWAEZI_KERNEL_ADDRESS. Worker cannot initialize.");
        process.exit(1);
    }
    executeWorkerProcess();
}
