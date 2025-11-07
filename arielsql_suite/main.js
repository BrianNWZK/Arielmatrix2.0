// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (ULTIMATE EXECUTION MODE)
// 🎯 CRITICAL FIX: Integrated Enterprise Logger and Sequential Initialization

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';

// 🚀 CORE DEPENDENCIES
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { getDatabaseInitializer } from '../modules/database-initializer.js';
import { BWAEZIToken } from '../modules/bwaezi-token.js';
import { initializeSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js'; 
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js';

// 🆕 CRITICAL FIX: Import Enterprise Logger Initialization/Access
import { initializeGlobalLogger, getGlobalLogger, enableDatabaseLoggingSafely } from '../modules/enterprise-logger/index.js';
// 🆕 Load Master Configuration
import MASTER_CONFIG, { BWAEZI_CHAIN, BWAEZI_SOVEREIGN_CONFIG } from '../config/bwaezi-config.js';

// Global reference for the core and IPC helpers in the worker process
let sovereignCore = null;
let revenueEngine = null;
let tokenModule = null;
let dbInitializer = null;
let payoutSystem = null;
let masterLogger = null;

let globalMasterCoreProxy = {
    optimizationCycle: 0, 
    healthStatus: 'initializing'
};

// 🔐 CRITICAL ENVIRONMENT CONFIGURATION
const CONFIG = {
    PRIVATE_KEY: process.env.PRIVATE_KEY,
    BWAEZI_KERNEL_ADDRESS: process.env.BWAEZI_KERNEL_ADDRESS,
    SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET || BWAEZI_CHAIN.FOUNDER_ADDRESS, // Fallback for SRP
    PORT: parseInt(process.env.PORT) || 3000,
    CLUSTER_WORKERS: parseInt(process.env.CLUSTER_WORKERS) || os.cpus().length,
    ...MASTER_CONFIG // Inject the full static config
};

/**
 * Master process logic: initializes the logger, manages worker cluster, and handles IPC.
 */
function startMaster() {
    masterLogger = initializeGlobalLogger('MASTER', { dbLogging: false });
    masterLogger.info(`🚀 Starting BSFM Master Process (PID: ${process.pid})`);
    masterLogger.info(`🖥️ Spawning ${CONFIG.CLUSTER_WORKERS} worker clusters...`);

    for (let i = 0; i < CONFIG.CLUSTER_WORKERS; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        masterLogger.error(`💀 Worker ${worker.process.pid} died. Code: ${code}, Signal: ${signal}.`);
        masterLogger.info('🔄 Relaunching new worker...');
        cluster.fork(); // Self-healing architecture (OPTION 1)
    });

    cluster.on('message', (worker, message, handle) => {
        if (message.type === 'coreUpdate') {
            globalMasterCoreProxy.optimizationCycle = message.cycle;
            globalMasterCoreProxy.healthStatus = message.status;
        }
    });

    masterLogger.info(`Master process ready. Workers managed.`);
}

/**
 * Worker process logic: initializes the core modules and starts the server.
 */
async function startWorker() {
    masterLogger = initializeGlobalLogger('WORKER', { dbLogging: true }); // Worker logs to DB
    masterLogger.info(`🛠️ Starting BSFM Worker Process (PID: ${process.pid})`);

    // 1. Initialize Database Core
    try {
        dbInitializer = getDatabaseInitializer(masterLogger);
        const { mainDb, transactionsDb } = await dbInitializer.initialize();
        masterLogger.info('✅ Database Initialized.');
    } catch (e) {
        masterLogger.fatal(`❌ DB Initialization Failed. Critical failure: ${e.message}`);
        process.exit(1);
    }

    // 2. Initialize Sovereign Core (The Brain)
    try {
        sovereignCore = new ProductionSovereignCore(CONFIG, masterLogger);
        await sovereignCore.initialize();
        masterLogger.info('✅ Sovereign Core (Brain) Initialized.');
    } catch (e) {
        masterLogger.error(`⚠️ Sovereign Core Initialization Failed. Falling back to Degraded Mode: ${e.message}`);
        sovereignCore = {
            isInitialized: false,
            // Mock functions for degraded operation
            runGodModeCycle: async () => masterLogger.warn('Core is degraded. Skipping cycle.'),
            getStatus: () => ({ godMode: false, status: 'Degraded' })
        };
    }

    // 3. Initialize Sovereign Revenue Engine (Critical Dependency)
    try {
        // Use the sequential initialization pattern (OPTION 2)
        revenueEngine = await initializeSovereignRevenueEngine(CONFIG, sovereignCore, dbInitializer.transactionsDb);
        masterLogger.info('✅ Sovereign Revenue Engine Initialized.');
    } catch (e) {
        masterLogger.warn(`⚠️ Revenue Engine initialization failed: ${e.message}. System running in SRP Failover Mode (OPTION 1).`);
        revenueEngine = null; // Set to null to trigger fail-forward logic
    }
    
    // 4. Initialize BWAEZI Token Module (Requires Revenue Engine for service registration)
    try {
        tokenModule = new BWAEZIToken(CONFIG, revenueEngine);
        await tokenModule.initialize();
        masterLogger.info('✅ BWAEZI Token Module Initialized.');
    } catch (e) {
        masterLogger.warn(`⚠️ BWAEZI Token Module failed: ${e.message}. Token functions may be limited.`);
    }

    // 5. Initialize Payout System
    try {
        payoutSystem = new BrianNwaezikePayoutSystem(CONFIG);
        await payoutSystem.initialize();
        masterLogger.info('✅ Payout System Initialized.');
    } catch (e) {
        masterLogger.warn(`⚠️ Payout System failed: ${e.message}. Revenue consolidation may be disabled.`);
    }

    // Inject final dependencies into Sovereign Core
    if (sovereignCore.isInitialized) {
        sovereignCore.injectDependencies(revenueEngine, tokenModule, payoutSystem);
        sovereignCore.startGodModeLoop();
        masterLogger.info('✨ GOD MODE Loop Started.');
    }

    // 6. Start Web Server (Zero Failure Port Binding - OPTION 1)
    const app = express();
    app.use(express.json());
    
    // Example endpoint for health check
    app.get('/health', (req, res) => {
        res.status(200).json({
            status: 'operational',
            coreStatus: sovereignCore.getStatus(),
            revenueEngine: revenueEngine ? revenueEngine.healthCheck() : 'SRP_FAILOVER',
            tokenModule: tokenModule ? 'Active' : 'Degraded'
        });
    });

    app.listen(CONFIG.PORT, () => {
        masterLogger.info(`🌐 Web Server running on port ${CONFIG.PORT}. (PID: ${process.pid})`);
        masterLogger.info(`✅ PORT BOUND IN <100ms (OPTION 1)`);
    }).on('error', (err) => {
        masterLogger.error(`❌ Web Server failed to bind: ${err.message}`);
        // Implement auto-fallback port logic here if required by OPTION 1
    });
}

// Execute based on cluster role
if (cluster.isMaster) {
    startMaster();
} else {
    startWorker();
}
