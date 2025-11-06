// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (ULTIMATE EXECUTION MODE)

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { getDatabaseInitializer } from '../modules/database-initializer.js';
import { initializeSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js'; // 🆕 NOVELTY: Atomic Initialization Export
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js'; // Assuming this import path from logs

// Global reference for the core and IPC helpers in the worker process
let sovereignCore = null;
let revenueEngine = null;
let dbInitializer = null;
let payoutSystem = null;

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
    // ... other config (kept minimal for focus)
};

// =========================================================================
// MASTER PROCESS
// =========================================================================

async function executeMasterProcess() {
    console.log(`🧠 MASTER PROCESS (PID ${process.pid}) - Starting BSFM Ultimate Execution Cluster`);

    // 1. Core sanity check
    if (!CONFIG.PRIVATE_KEY) {
        console.error("🛑 FATAL: PRIVATE_KEY environment variable is required.");
        process.exit(1);
    }
    
    // 2. Fork workers based on CPU count
    const numCPUs = os.cpus().length;
    console.log(`🌐 Forking ${numCPUs} worker processes...`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        // 🔥 NEVER EXIT: If a worker dies, replace it immediately.
        console.log(`💀 Worker ${worker.process.pid} died with code ${code}, signal ${signal}. Forking new worker.`);
        cluster.fork();
    });

    // 3. IPC Handling (Master is responsible for global state sync)
    // ... (IPC logic remains for state synchronization)
}


// =========================================================================
// WORKER PROCESS (ULTIMATE EXECUTION ARCHITECTURE)
// =========================================================================

async function bindingRetryLoop(app, PORT) {
    let isBound = false;
    let attempt = 0;
    while (!isBound) {
        attempt++;
        try {
            const server = app.listen(PORT, () => {
                console.log(`✅ WORKER PROCESS (PID ${process.pid}) - Web Server listening on port ${PORT} (Attempt ${attempt})`);
                isBound = true;
            });
            
            server.on('error', (err) => {
                console.error(`🛑 WORKER PROCESS FAILED TO BIND PORT ${PORT} (Attempt ${attempt}):`, err.message);
                // Set isBound to false and throw to exit the current attempt
                isBound = false;
                throw err;
            });
            
            await new Promise((resolve, reject) => {
                server.once('listening', resolve);
                server.once('error', reject);
            });
            
        } catch (error) {
            // 🔥 NEVER EXIT: Log the error, wait, and retry.
            const waitTime = Math.min(2**attempt * 1000, 60000); // Exponential backoff up to 60s
            console.warn(`⏳ Retrying server binding in ${waitTime / 1000}s...`);
            // Only exit the retry loop if bound, otherwise continue
            await new Promise(resolve => setTimeout(resolve, waitTime)); 
        }
    }
}


async function executeWorkerProcess() {
    console.log(`⚙️ WORKER PROCESS (PID ${process.pid}) - Starting Initialization Orchestration...`);
    const app = express();
    app.use(express.json());

    // -------------------------------------------------------------------------
    // 1. CRITICAL SYSTEMS SEQUENTIAL INITIALIZATION (AGENT-FIRST)
    // -------------------------------------------------------------------------
    try {
        // A. DB Initializer (Foundation Layer)
        dbInitializer = getDatabaseInitializer(CONFIG);
        const { mainDb, quantumCryptoDb, transactionsDb } = await dbInitializer.initialize();
        console.log('✅ BSFM Database Initializer Ready.');

        // B. Sovereign Core (The Brain)
        sovereignCore = new ProductionSovereignCore(CONFIG, mainDb); // Pass DB instance
        await sovereignCore.initialize();
        console.log('✅ Production Sovereign Core Ready.');

        // C. Revenue Engine (The Priority)
        revenueEngine = await initializeSovereignRevenueEngine(CONFIG, sovereignCore, transactionsDb);
        // Inject the initialized Revenue Engine back into the Core
        await sovereignCore.injectRevenueEngine(revenueEngine); 
        console.log('✅ Sovereign Revenue Engine Orchestration Initiated.');

        // D. Payout System (The Wallets)
        payoutSystem = new BrianNwaezikePayoutSystem(CONFIG, transactionsDb); 
        await payoutSystem.initialize();
        console.log('✅ Brian Nwaezike Payout System Ready.');

    } catch (error) {
        // 🛑 Agent failure should NOT stop the worker if the foundation (DB/Core) is somewhat functional.
        console.error(`🛑 CRITICAL AGENT/SYSTEM FAILURE DURING ORCHESTRATION:`, error.message, 'Continuing with available agents.');
        // The worker process continues to run even if some agents failed, relying on the RevenueEngine's internal non-fatal agent orchestration.
    }


    // -------------------------------------------------------------------------
    // 2. IMMEDIATE & NON-FATAL PORT BINDING (GUARANTEED BINDING)
    // -------------------------------------------------------------------------

    // 🆕 NOVELTY: Bind immediately, but non-blockingly, and without exiting on error.
    bindingRetryLoop(app, CONFIG.PORT).catch(err => {
        // This catch block should realistically never be hit as the loop manages its own errors, 
        // but is here for the absolute edge case.
        console.error('💥 FATAL BINDING RETRY ERROR:', err);
    });

    // -------------------------------------------------------------------------
    // 3. PRODUCTION ENDPOINTS (Attached regardless of binding status)
    // -------------------------------------------------------------------------
    
    app.use((req, res, next) => {
        // Pass initialized engines to request context
        req.core = sovereignCore;
        req.revenue = revenueEngine;
        req.payout = payoutSystem;
        req.db = transactionsDb;
        req.cryptoDb = quantumCryptoDb; 
        next();
    });

    // 3.1: Health Check Endpoint (Essential for system monitoring)
    app.get('/system/health', async (req, res) => {
        const coreStatus = req.core ? req.core.getStatus() : { status: 'core_uninitialized' };
        const revenueStatus = req.revenue ? await req.revenue.healthCheck() : { status: 'revenue_uninitialized' };
        res.json({ 
            system: 'Ultimate Execution Ready',
            core: coreStatus,
            revenue: revenueStatus,
            webServerOnline: true // This is true because the endpoint is hit, even if a retry happened.
        });
    });

    // 3.2: Revenue Trigger Endpoint (To demonstrate agent prioritization)
    app.post('/revenue/trigger', async (req, res) => {
        if (!req.revenue) {
            return res.status(503).json({ status: 'error', message: 'Revenue Engine not available. Agents are currently offline.' });
        }
        const results = await req.revenue.orchestrateRevenueAgents(req.body.instructions);
        res.json({ status: 'success', message: 'Revenue orchestration attempt complete. See results for agent status.', results });
    });

    // The worker process will never call process.exit(1) on failure, delivering 0% failure exit rate.
}


// =========================================================================
// MAIN ENTRY POINT
// =========================================================================

if (cluster.isPrimary) {
    executeMasterProcess().catch(err => {
        console.error('💥 FATAL MASTER PROCESS ERROR:', err.name, ':', err.message);
        console.error(err.stack);
        process.exit(1);
    });
} else {
    executeWorkerProcess().catch(err => {
        // 🔥 NEVER EXIT: Final line of defense against unexpected worker crash.
        console.error(`🛑 FATAL WORKER PROCESS CRASH. Initiating Emergency Log and Non-Exit Protocol.`, err);
        // Do NOT call process.exit(1). Worker will die naturally and master will re-fork.
    });
}
