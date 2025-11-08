// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (ULTIMATE EXECUTION MODE)
// 🎯 CRITICAL FIX: Centralized Orchestration and ZERO FAILURE Dependency Injection.
// 🔥 NOVELTY: Direct use of ProductionSovereignCore for Mainnet Revenue Governance.

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import http from 'http';
import { initializeGlobalLogger, getGlobalLogger } from '../modules/enterprise-logger/index.js';

// CORE IMPORTS: Import the core controller and the new revenue engine classes
import { 
    ProductionSovereignCore, 
    MainnetRevenueOrchestrator 
} from '../core/sovereign-brain.js'; 

// CRITICAL DEPENDENCIES (Assumed available via path)
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js';
import { brianNwaezikeChain } from '../backend/blockchain/BrianNwaezikeChain.js'; // Assumed exported singleton instance
import { getDatabaseInitializer } from '../modules/database-initializer.js';


let sovereignCore = null;
let orchestrator = null;
let payoutSystem = null;
let dbInitializer = null;
let masterLogger = null;

const fallbackPort = 10000;
const CONFIG = {
  // CRITICAL: Ensure these environment variables are set in your deployment environment
  PRIVATE_KEY: process.env.MAINNET_PRIVATE_KEY || process.env.PRIVATE_KEY,
  SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET || '0xYourSovereignWallet',
  PORT: process.env.PORT || fallbackPort,
  NODE_ENV: process.env.NODE_ENV || 'production',
};

// =========================================================================
// 1. DEPENDENCY INITIALIZATION AND INJECTION SEQUENCE (ZERO FAILURE)
// =========================================================================

const initializeCoreServices = async () => {
    // 1. Setup Logger (First)
    masterLogger = initializeGlobalLogger(CONFIG.NODE_ENV);
    masterLogger.info('✅ Global Enterprise Logger Initialized.');
    
    // 2. Initialize Database (Prerequisite for Payout/Core)
    dbInitializer = getDatabaseInitializer();
    await dbInitializer.initialize();
    masterLogger.info('✅ ArielSQL Database Initialized.');

    // 3. Instantiate Core Services
    // NOTE: The Sovereign Core is the *governor* and is instantiated first
    sovereignCore = new ProductionSovereignCore(CONFIG, dbInitializer.getDBEngine());

    // 4. Instantiate Mainnet Revenue Orchestrator (The money generator)
    // IMPORTANT: It now uses the class defined in core/sovereign-brain.js
    orchestrator = new MainnetRevenueOrchestrator(CONFIG.PRIVATE_KEY, CONFIG.SOVEREIGN_WALLET);

    // 5. Instantiate Payout System (The disbursement agent)
    payoutSystem = new BrianNwaezikePayoutSystem(CONFIG, dbInitializer.getDBEngine());

    // 6. Final Orchestration Injection (CRITICAL FIX)
    // Pass ALL instantiated dependencies to the Sovereign Core governor at once.
    sovereignCore.orchestrateCoreServices({
        revenueEngine: orchestrator, // The Mainnet Revenue Orchestrator
        bwaeziChain: brianNwaezikeChain, // The BWAEZI Chain (assumed singleton)
        payoutSystem: payoutSystem // The BrianNwaezikePayoutSystem
    });
    
    // 7. Initialize all components
    await Promise.all([
        brianNwaezikeChain.initialize(CONFIG),
        payoutSystem.initialize(),
        // The orchestrator.initialize() is handled inside sovereignCore.initialize()
    ]);

    // 8. Initialize the Sovereign Core (This calls orchestrator.initialize() internally)
    await sovereignCore.initialize(); 

    masterLogger.info('✅ All Core Services Orchestrated and Initialized.');
};

// =========================================================================
// 2. WORKER EXECUTION FLOW
// =========================================================================

const startMonitorServer = () => {
    const app = express();
    app.use(express.json());
    
    app.get('/health', (req, res) => {
        res.json({
            status: 'ULTIMATE_EXECUTION_MODE',
            pid: process.pid,
            timestamp: new Date().toISOString(),
            coreStatus: sovereignCore ? sovereignCore.getStatus() : 'UNINITIALIZED',
            revenueStats: orchestrator ? orchestrator.revenueEngine.getRevenueStats() : 'PENDING'
        });
    });

    const server = http.createServer(app);
    server.listen(CONFIG.PORT, () => {
        masterLogger.info(`📊 Monitor Server Active: http://localhost:${CONFIG.PORT}/health`);
    }).on('error', (err) => {
        masterLogger.error(`❌ Server Port ${CONFIG.PORT} failed: ${err.message}. Shutting down worker.`);
        process.exit(1);
    });
};

const executeWorkerProcess = async () => {
    await initializeCoreServices();
    
    // Workers focus on execution and monitoring
    startMonitorServer();

    // The Sovereign Core's God Mode loop handles continuous revenue generation:
    // sovereignCore.startGodModeLoop()
    // which calls orchestrator.executeLiveRevenueCycle()
};

// =========================================================================
// 3. ULTIMATE STARTUP SEQUENCE (Cluster Management)
// =========================================================================

const ultimateStartup = async () => {
    console.log('🚀 BSFM ULTIMATE EXECUTION MODE - STARTING...');

    // Process-level protection: DO NOT EXIT ON ERROR
    process.on('uncaughtException', (error) => {
        console.error('🛡️ UNCAUGHT EXCEPTION CONTAINED (REVENUE CONTINUES):', error.message, error.stack);
    });

    process.on('unhandledRejection', (reason, promise) => {
        console.error('🛡️ UNHANDLED REJECTION CONTAINED (REVENUE CONTINUES):', reason);
    });

    if (cluster.isPrimary) {
        console.log(`👑 MASTER PROCESS ${process.pid} - Orchestrating ${os.cpus().length} Workers.`);
        for (let i = 0; i < os.cpus().length; i++) {
            cluster.fork();
        }

        cluster.on('exit', (worker, code, signal) => {
            console.log(`⚠️ WORKER ${worker.process.pid} died (${signal || code}). Auto-rebooting worker...`);
            cluster.fork(); // GUARANTEE: Never less than N workers
        });
    } else {
        // Workers ONLY execute the business logic (initialization/revenue generation)
        await executeWorkerProcess();
    }
};

// START THE UNSTOPPABLE SYSTEM
ultimateStartup().catch((catastrophicError) => {
    console.log('💥 CATASTROPHIC STARTUP FAILURE - ACTIVATING FINAL SURVIVAL MODE');
    console.error(catastrophicError);
    // Exit with status 1 to trigger auto-restart in deployment environment
    process.exit(1);
});

// Export classes for testing/external use if necessary
export { ultimateStartup, ProductionSovereignCore, MainnetRevenueOrchestrator };
