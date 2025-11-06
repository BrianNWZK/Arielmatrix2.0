// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (ULTIMATE EXECUTION MODE)
// 🎯 CRITICAL FIX: Integrated Enterprise Logger and Sequential Initialization

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { getDatabaseInitializer } from '../modules/database-initializer.js';
import { initializeSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js'; 
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js';

// 🆕 CRITICAL FIX: Import Enterprise Logger Initialization/Access
import { initializeGlobalLogger, getGlobalLogger, enableDatabaseLoggingSafely } from '../modules/enterprise-logger/index.js';

// Global reference for the core and IPC helpers in the worker process
let sovereignCore = null;
let revenueEngine = null;
let dbInitializer = null;
let payoutSystem = null;
let masterLogger = null;

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
    // All configuration is centralized here, adhering to "REMOVE GLOBAL CONFIG"
};

// =========================================================================
// MASTER PROCESS
// =========================================================================

async function executeMasterProcess() {
    // 🎯 CRITICAL FIX: Initialize Logger in Master Process
    masterLogger = initializeGlobalLogger('MasterController', CONFIG);
    masterLogger.info(`🧠 MASTER PROCESS (PID ${process.pid}) - Starting BSFM Ultimate Execution Cluster`);

    if (!CONFIG.PRIVATE_KEY) {
        // Using logger for FATAL error
        masterLogger.error("🛑 FATAL: PRIVATE_KEY environment variable is required.");
        process.exit(1);
    }
    
    const numCPUs = os.cpus().length;
    masterLogger.info(`🌐 Forking ${numCPUs} worker processes...`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        // 🔥 NEVER EXIT: If a worker dies, replace it immediately.
        masterLogger.warn(`💀 Worker ${worker.process.pid} died with code ${code}, signal ${signal}. Forking new worker.`);
        cluster.fork();
    });
}


// =========================================================================
// WORKER PROCESS (ULTIMATE EXECUTION ARCHITECTURE)
// =========================================================================

async function bindingRetryLoop(app, PORT, workerLogger) {
    let isBound = false;
    let attempt = 0;
    while (!isBound) {
        attempt++;
        try {
            const server = app.listen(PORT, () => {
                // Replaced console.log with workerLogger.info
                workerLogger.info(`✅ WORKER PROCESS (PID ${process.pid}) - Web Server listening on port ${PORT} (Attempt ${attempt})`);
                isBound = true;
            });
            
            server.on('error', (err) => {
                // Replaced console.error with workerLogger.error
                workerLogger.error(`🛑 WORKER PROCESS FAILED TO BIND PORT ${PORT} (Attempt ${attempt}):`, err.message);
                isBound = false;
                throw err;
            });
            
            await new Promise((resolve, reject) => {
                server.once('listening', resolve);
                server.once('error', reject);
            });
            
        } catch (error) {
            const waitTime = Math.min(2**attempt * 1000, 60000); 
            // Replaced console.warn with workerLogger.warn
            workerLogger.warn(`⏳ Retrying server binding in ${waitTime / 1000}s...`);
            await new Promise(resolve => setTimeout(resolve, waitTime)); 
        }
    }
}


async function executeWorkerProcess() {
    // 🎯 CRITICAL FIX: Initialize Logger instance first
    const workerLogger = initializeGlobalLogger('WorkerOrchestrator', CONFIG);
    workerLogger.info(`⚙️ WORKER PROCESS (PID ${process.pid}) - Starting Initialization Orchestration...`);
    
    const app = express();
    app.use(express.json());
    
    let transactionsDb = null;
    let quantumCryptoDb = null;


    // -------------------------------------------------------------------------
    // 1. CRITICAL SYSTEMS SEQUENTIAL INITIALIZATION (AGENT-FIRST)
    // -------------------------------------------------------------------------
    try {
        // A. DB Initializer (Foundation Layer)
        dbInitializer = getDatabaseInitializer(CONFIG);
        const dbResult = await dbInitializer.initialize();
        transactionsDb = dbResult.transactionsDb;
        quantumCryptoDb = dbResult.quantumCryptoDb;

        // 🆕 CRITICAL FIX: Enable database logging AFTER DB is initialized
        await enableDatabaseLoggingSafely(dbResult.mainDb); 
        workerLogger.info('✅ BSFM Database Initializer Ready.');

        // B. Sovereign Core (The Brain)
        // ProductionSovereignCore now uses getGlobalLogger() internally
        sovereignCore = new ProductionSovereignCore(CONFIG, dbResult.mainDb); 
        await sovereignCore.initialize();
        workerLogger.info('✅ Production Sovereign Core Ready.');

        // C. Revenue Engine (The Priority)
        // initializeSovereignRevenueEngine now uses getGlobalLogger() internally
        revenueEngine = await initializeSovereignRevenueEngine(CONFIG, sovereignCore, transactionsDb);
        // Inject the initialized Revenue Engine back into the Core
        await sovereignCore.injectRevenueEngine(revenueEngine); 
        workerLogger.info('✅ Sovereign Revenue Engine Orchestration Initiated.');

        // D. Payout System (The Wallets)
        payoutSystem = new BrianNwaezikePayoutSystem(CONFIG, transactionsDb); 
        await payoutSystem.initialize();
        workerLogger.info('✅ Brian Nwaezike Payout System Ready.');

    } catch (error) {
        // Using workerLogger instance for non-fatal catch block
        workerLogger.error(`🛑 CRITICAL AGENT/SYSTEM FAILURE DURING ORCHESTRATION:`, error.message, 'Continuing with available agents.', { stack: error.stack });
    }


    // -------------------------------------------------------------------------
    // 2. IMMEDIATE & NON-FATAL PORT BINDING (GUARANTEED BINDING)
    // -------------------------------------------------------------------------

    bindingRetryLoop(app, CONFIG.PORT, workerLogger).catch(err => {
        workerLogger.error('💥 FATAL BINDING RETRY ERROR:', err);
    });

    // -------------------------------------------------------------------------
    // 3. PRODUCTION ENDPOINTS (Attached regardless of binding status)
    // -------------------------------------------------------------------------
    
    app.use((req, res, next) => {
        req.core = sovereignCore;
        req.revenue = revenueEngine;
        req.payout = payoutSystem;
        req.db = transactionsDb;
        req.cryptoDb = quantumCryptoDb; 
        next();
    });

    // Health Check Endpoint
    app.get('/system/health', async (req, res) => {
        const coreStatus = req.core ? req.core.getStatus() : { status: 'core_uninitialized' };
        const revenueStatus = req.revenue ? await req.revenue.healthCheck() : { status: 'revenue_uninitialized' };
        res.json({ 
            system: 'Ultimate Execution Ready',
            core: coreStatus,
            revenue: revenueStatus,
            webServerOnline: true
        });
    });

    // Revenue Trigger Endpoint 
    app.post('/revenue/trigger', async (req, res) => {
        if (!req.revenue) {
            workerLogger.warn('Attempted revenue trigger but engine is offline.');
            return res.status(503).json({ status: 'error', message: 'Revenue Engine not available. Agents are currently offline.' });
        }
        const results = await req.revenue.orchestrateRevenueAgents(req.body.instructions);
        res.json({ status: 'success', message: 'Revenue orchestration attempt complete. See results for agent status.', results });
    });
}


// =========================================================================
// MAIN ENTRY POINT
// =========================================================================

if (cluster.isPrimary) {
    executeMasterProcess().catch(err => {
        // Fallback to console is kept here because masterLogger might fail on process exit.
        console.error('💥 FATAL MASTER PROCESS ERROR:', err.name, ':', err.message);
        console.error(err.stack);
        process.exit(1);
    });
} else {
    executeWorkerProcess().catch(err => {
        // Workers should not exit; rely on the master to re-fork. Log the crash.
        const fallbackLogger = getGlobalLogger('CrashHandler');
        fallbackLogger.error(`🛑 FATAL WORKER PROCESS CRASH. Initiating Emergency Log and Non-Exit Protocol.`, err);
    });
}
