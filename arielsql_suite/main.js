// arielsql_suite/main.js — BSFM PRODUCTION CLUSTER ENTRY POINT (ULTIMATE EXECUTION MODE)
// 🎯 SOLUTION: Centralized Orchestration and Dependency Injection for all Core Services.
// 🔥 NOVELTY: Added Initialization of Autonomous AI Engine to deploy all Revenue Agents.

import process from 'process';
import cluster from 'cluster';
import os from 'os';
import express from 'express';

// CORE IMPORTS (Note: These are direct imports, but instantiation order is controlled below)
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
// We need the raw functions/exports, not the class definition directly for the chain/payout system
import { initializeSovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js';
import { BrianNwaezikePayoutSystem } from '../backend/blockchain/BrianNwaezikePayoutSystem.js';
import { brianNwaezikeChain } from '../backend/blockchain/BrianNwaezikeChain.js'; // Assumed exported singleton instance
import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js';
import { initializeGlobalLogger, getGlobalLogger } from '../modules/enterprise-logger/index.js';
import autonomousAIEngine from '../backend/agents/autonomous-ai-engine.js'; // <<< NEW IMPORT: Autonomous AI Engine

let sovereignCore = null;
let revenueEngine = null;
let dbEngineInstance = null;
let payoutSystem = null;
let masterLogger = null;
let autonomousAIEngineInstance = null; // New placeholder for the AI Engine

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
    // 1. BOOTSTRAP: LOGGER & DB ENGINE (Must be first)
    // =========================================================================
    
    masterLogger = initializeGlobalLogger({ logLevel: CONFIG.NODE_ENV === 'development' ? 'DEBUG' : 'INFO' });
    masterLogger.info('⚡ GLOBAL LOGGER INITIALIZED.');

    dbEngineInstance = new ArielSQLiteEngine({ dbPath: './data/ariel/master.db', autoBackup: true });
    await dbEngineInstance.initialize();
    masterLogger.info('💾 Master ArielSQLiteEngine initialized.');
    
    // =========================================================================
    // 2. INITIALIZE CORE SYSTEMS (Chain, Payout)
    // =========================================================================
    
    // BrianNwaezikeChain (Singleton) initialization
    await brianNwaezikeChain.initialize(CONFIG);
    masterLogger.info('🔗 BrianNwaezikeChain Initialized.');
    
    // Initialize Payout System (Injecting the Chain and DB)
    payoutSystem = new BrianNwaezikePayoutSystem(CONFIG.PRIVATE_KEY, CONFIG.SOVEREIGN_WALLET, brianNwaezikeChain, dbEngineInstance);
    await payoutSystem.initialize();
    masterLogger.info('💰 BrianNwaezikePayoutSystem Initialized.');
    
    // =========================================================================
    // 2.5. INITIALIZE AUTONOMOUS AI ENGINE (Activates Revenue Agents)
    // =========================================================================
    // This step calls deployAllRevenueAgents() and is CRITICAL for agent activation.
    autonomousAIEngineInstance = autonomousAIEngine;
    await autonomousAIEngineInstance.initialize({ 
        dbEngine: dbEngineInstance, 
        payoutSystem: payoutSystem 
    });
    masterLogger.info('🧠 Autonomous AI Engine (BRAIN) Initialized and Revenue Agents Deployed.');

    // =========================================================================
    // 3. INITIALIZE SOVEREIGN BRAIN (The destination for injections)
    // =========================================================================

    // Instantiate the brain first
    sovereignCore = new ProductionSovereignCore(CONFIG, dbEngineInstance);
    masterLogger.info('🧠 ProductionSovereignCore instantiated.');

    // =========================================================================
    // 4. INITIALIZE REVENUE ENGINE (Injecting all critical components including the Brain)
    // =========================================================================

    // The core dependencies are injected into the Revenue Engine here, resolving the circular dependency.
    revenueEngine = await initializeSovereignRevenueEngine(
      CONFIG,
      sovereignCore, // Inject the Sovereign Core instance
      dbEngineInstance,
      brianNwaezikeChain,
      payoutSystem
    );
    masterLogger.info('💸 SovereignRevenueEngine Initialized with all dependencies.');
    
    // =========================================================================
    // 5. INJECT ALL SYSTEMS INTO THE BRAIN AND START
    // =========================================================================

    // Inject all fully initialized systems into the Brain for orchestration
    sovereignCore.orchestrateCoreServices({
      revenueEngine: revenueEngine,
      bwaeziChain: brianNwaezikeChain,
      payoutSystem: payoutSystem,
      autonomousAIEngine: autonomousAIEngineInstance // <<< NEW: Inject AI Engine for Core access
    });

    // Start the ultimate execution sequence
    await sovereignCore.initialize();
    
    masterLogger.info('👑 SYSTEM ORCHESTRATION SUCCESS: Starting cluster workers.');
    
    // =========================================================================
    // 6. CLUSTER SETUP
    // =========================================================================

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
  app.get('/health', (req, res) => res.status(200).send(`OK - Worker ${process.pid} Active`));
  
  app.listen(CONFIG.PORT, () => {
    console.log(`Worker ${process.pid} started and listening on port ${CONFIG.PORT}`);
  });
};

if (cluster.isMaster) {
  setupMaster();
} else {
  setupWorker();
}
