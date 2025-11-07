// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (ULTIMATE EXECUTION MODE)
// 🎯 SOLUTION: Centralized Orchestration and Dependency Injection for all Core Services.

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';

// CORE IMPORTS
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { getDatabaseInitializer } from '../modules/database-initializer.js';
import { initializeSovereignRevenueEngine, getSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js';
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js';
import { brianNwaezikeChain } from '../backend/blockchain/BrianNwaezikeChain.js'; // Use the exported singleton
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js'; // For DB injection
import { initializeGlobalLogger, getGlobalLogger, enableDatabaseLoggingSafely } from '../modules/enterprise-logger/index.js';

let sovereignCore = null;
let revenueEngine = null;
let dbEngineInstance = null; // New instance holder
let payoutSystem = null;
let masterLogger = null;

const fallbackPort = 10000;
const CONFIG = {
  PRIVATE_KEY: process.env.PRIVATE_KEY || 'PRODUCTION_FALLBACK_KEY',
  BWAEZI_KERNEL_ADDRESS: process.env.BWAEZI_KERNEL_ADDRESS || '0xKernelAddressProduction',
  SOVEREIGN_WALLET: process.env.SOVEREIGN_WALLET || '0xSovereignWalletProduction',
  PORT: process.env.PORT || fallbackPort,
  NODE_ENV: process.env.NODE_ENV || 'production',
  RPC_ENDPOINT: 'https://production-mainnet.bwaezi.io/rpc',
};

const setupMaster = async () => {
  console.log(`Master ${process.pid} is running. Core orchestration commencing...`);
  
  try {
    // =========================================================================
    // 1. CRITICAL BOOTSTRAP: LOGGER & DB ENGINE (Must be first)
    // =========================================================================
    
    // Initialize Global Logger immediately to capture all subsequent activity
    masterLogger = initializeGlobalLogger({ logLevel: CONFIG.NODE_ENV === 'development' ? 'DEBUG' : 'INFO' });
    masterLogger.info('⚡ GLOBAL LOGGER INITIALIZED.');

    // Initialize Database Engine instance (ArielSQLiteEngine)
    dbEngineInstance = new ArielSQLiteEngine({ dbPath: './data/ariel/master.db', autoBackup: true });
    await dbEngineInstance.initialize();
    
    masterLogger.info('💾 Master ArielSQLiteEngine initialized.');
    
    // =========================================================================
    // 2. INITIALIZE CORE DEPENDENCIES (Chain and Payout System)
    // =========================================================================
    
    // BrianNwaezikeChain is a singleton, initialize it
    await brianNwaezikeChain.initialize(CONFIG);
    masterLogger.info('🔗 BrianNwaezikeChain Initialized.');
    
    // Initialize Payout System (injecting the Chain and DB)
    payoutSystem = new BrianNwaezikePayoutSystem(CONFIG.PRIVATE_KEY, CONFIG.SOVEREIGN_WALLET, brianNwaezikeChain, dbEngineInstance);
    await payoutSystem.initialize();
    masterLogger.info('💰 BrianNwaezikePayoutSystem Initialized.');
    
    // =========================================================================
    // 3. INITIALIZE REVENUE ENGINE (Injecting all critical components)
    // =========================================================================

    // The core dependencies are injected here.
    revenueEngine = await initializeSovereignRevenueEngine(
      CONFIG,
      null, // SovereignCore is TBD, passing null for now
      dbEngineInstance,
      brianNwaezikeChain,
      payoutSystem
    );
    masterLogger.info('💸 SovereignRevenueEngine Initialized with all dependencies.');
    
    // =========================================================================
    // 4. INITIALIZE SOVEREIGN BRAIN (The final orchestrator)
    // =========================================================================

    sovereignCore = new ProductionSovereignCore(CONFIG);
    
    // INJECT the initialized instances into the Brain
    sovereignCore.orchestrateCoreServices({
      revenueEngine: revenueEngine,
      bwaeziChain: brianNwaezikeChain,
      payoutSystem: payoutSystem
    });
    
    // Update the Revenue Engine with the final Sovereign Core instance
    revenueEngine.sovereignCore = sovereignCore;

    await sovereignCore.initialize();
    
    // =========================================================================
    // 5. CLUSTER SETUP AND FINAL LOGIC
    // =========================================================================

    // Fork workers based on CPU count
    const numCPUs = os.cpus().length;
    for (let i = 0; i < numCPUs; i++) {
      cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
      masterLogger.warn(`Worker ${worker.process.pid} died. Forking a new worker...`);
      cluster.fork();
    });

  } catch (error) {
    console.error('❌ CRITICAL SYSTEM FAILURE DURING ORCHESTRATION:', error);
    process.exit(1);
  }
};

const setupWorker = async () => {
  const app = express();
  // Worker processes listen on the orchestrated port
  app.get('/health', (req, res) => res.status(200).send('OK - Worker Active'));
  
  app.listen(CONFIG.PORT, () => {
    console.log(`Worker ${process.pid} started and listening on port ${CONFIG.PORT}`);
  });
};

// Start the application using the new orchestration logic
if (cluster.isMaster) {
  setupMaster();
} else {
  setupWorker();
}
