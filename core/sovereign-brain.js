// core/sovereign-brain.js — BSFM SOVEREIGN BRAIN (v18.1)
// 🧠 QUANTUM-AWARE INTELLIGENCE-FIRST ORCHESTRATOR - IPC & DEPENDENCY INJECTION READY

import { EventEmitter } from 'events';
// ⬇️ REMOVED: No longer locally instantiates the DB engine
// import { ArielSQLiteEngine } from '../modules/ariel-sqlite-engine/index.js'; 
import { SovereignRevenueEngine } from '../modules/sovereign-revenue-engine.js';
import { BWAEZIToken } from '../modules/bwaezi-token.js';
import { QuantumResistantCrypto } from '../modules/quantum-resistant-crypto/index.js';
import ProductionOmnipotentBWAEZI from '../modules/production-omnipotent-bwaezi.js';
import ProductionOmnipresentBWAEZI from '../modules/production-omnipresent-bwaezi.js';
import ProductionEvolvingBWAEZI from '../modules/production-evolving-bwaezi.js';

export class ProductionSovereignCore {
  // ⬇️ REVISED: Accepts the injected DB Engine instance
  constructor(config, dbEngineInstance = null) {
    this.config = config;
    this.isInitialized = false;
    this.godModeActive = false;
    this.optimizationCycle = 0;
    this.modules = new Map();
    
    // ⬇️ CRITICAL FIX 1: Use the injected DB instance (Master DB or Worker Proxy)
    this.dbEngine = dbEngineInstance;
    
    // ⬇️ CRITICAL FIX 2: Pass 'this' (the core instance) and the DB instance
    // This breaks the circular dependency with SovereignRevenueEngine
    this.revenueEngine = new SovereignRevenueEngine(config.revenue, this, dbEngineInstance);
    
    this.tokenKernel = new BWAEZIToken(config.token);
    this.quantumCrypto = new QuantumResistantCrypto(config.crypto);
    
    // Pass the INJECTED dbEngine to other AI modules
    this.omnipotentAI = new ProductionOmnipotentBWAEZI(config.ai.omnipotent, this.dbEngine, this.quantumCrypto);
    this.omnipresentAI = new ProductionOmnipresentBWAEZI(config.ai.omnipresent, this.dbEngine, this.quantumCrypto);
    this.evolvingAI = new ProductionEvolvingBWAEZI(config.ai.evolving, this.dbEngine, this.quantumCrypto);
  }

  async initialize() {
    console.log(`🧠 Initializing Sovereign Core (PID: ${process.pid})...`);
    
    // Ensure DB is present (either real or IPC proxy)
    if (!this.dbEngine) {
        throw new Error("CRITICAL: ProductionSovereignCore cannot initialize without a valid ArielSQLiteEngine instance or IPC proxy.");
    }
    
    await Promise.all([
      // This calls the Master DB initialize (real I/O) or Worker Proxy initialize (no-op)
      this.dbEngine.initialize(), 
      this.tokenKernel.initialize(),
      this.quantumCrypto.initialize()
    ]);

    this.godModeActive = true;
    this.isInitialized = true;
    this.startGodModeLoop(); // Starts the optimization cycle

    await Promise.all([
      this.revenueEngine.initialize(this.tokenKernel),
      this.omnipotentAI.initialize(),
      this.omnipresentAI.initialize(),
      this.evolvingAI.initialize()
    ]);

    console.log("✅ Sovereign Core fully operational.");
    return true;
  }

  async startGodModeLoop() {
    if (!this.godModeActive) return;

    try {
      this.optimizationCycle++;
      // Log PID to confirm which process (Master or Worker) is running the loop
      console.log(`🔥 GOD MODE CYCLE #${this.optimizationCycle} (PID: ${process.pid})`); 

      const globalState = await this.omnipresentAI.captureGlobalState();
      const optimizationPlan = await this.omnipotentAI.generateOptimizationPlan(globalState);
      const evolutionResult = await this.evolvingAI.applyGeneticOptimization(optimizationPlan);
      await this.omnipresentAI.executePlan(evolutionResult.optimizedInstructions);
      
      // Revenue Engine uses the core's optimization cycle result
      await this.revenueEngine.finalizeCycle(this.optimizationCycle, evolutionResult.performanceMetrics);

      // Use setImmediate to ensure non-blocking, event-loop friendly recursion
      setImmediate(() => this.startGodModeLoop());

    } catch (error) {
      console.error(`🛑 GOD MODE ERROR (Cycle ${this.optimizationCycle}, PID: ${process.pid}):`, error.message);
      await this.evolvingAI.initiateEmergencyProtocol(error);
      setTimeout(() => this.startGodModeLoop(), 5000);
    }
  }

  async emergencyShutdown() {
    this.godModeActive = false;
    this.isInitialized = false;
    console.log(`💀 Sovereign Core shutdown complete on PID ${process.pid}.`);
  }
}
