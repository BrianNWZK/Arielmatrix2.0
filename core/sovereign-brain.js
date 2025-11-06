// core/sovereign-brain.js — BSFM Sovereign Brain (Quantum-Aware, GOD MODE, Full Capacity)

import { EventEmitter } from 'events';
// ❌ NOVEL FIX: REMOVED synchronous import of SovereignRevenueEngine to break circular dependency.
import { BWAEZIToken } from '../modules/bwaezi-token.js';
import { QuantumResistantCrypto } from '../modules/quantum-resistant-crypto/index.js';
import ProductionOmnipotentBWAEZI from '../modules/production-omnipotent-bwaezi.js';
import ProductionOmnipresentBWAEZI from '../modules/production-omnipresent-bwaezi.js';
import ProductionEvolvingBWAEZI from '../modules/production-evolving-bwaezi.js';
// Maintaining all required core components (New features confirmed from logs)
import { QuantumNeuroCortex } from '../core/consciousness-reality-engine.js';
import { RealityProgrammingEngine } from '../core/consciousness-reality-advanced.js';
import { QuantumProcessingUnit } from '../core/quantumhardware-layer.js';

export class ProductionSovereignCore {
  // 🔥 NOVELTY/ROBUSTNESS: Added default {} for config to prevent initialization errors
  constructor(config = {}, dbEngineInstance = null) { 
    this.config = config;
    this.dbEngine = dbEngineInstance;
    this.isInitialized = false;
    this.godModeActive = false;
    this.optimizationCycle = 0;
    this.modules = new Map();

    // 🔥 CRITICAL FIX & NOVELTY: Safe access to nested configuration objects
    const aiConfig = this.config.ai || {}; 
    const coreConfig = {
        token: this.config.token || {},
        crypto: this.config.crypto || {},
        revenue: this.config.revenue || {},
        reality: this.config.reality || {},
        cortex: this.config.cortex || {}
    };

    // Core Pillars Initialization
    this.tokenKernel = new BWAEZIToken(coreConfig.token);
    this.quantumCrypto = new QuantumResistantCrypto(coreConfig.crypto);
    
    // AI Trinity Initialization (Omnipotent, Omnipresent, Evolving)
    this.omnipotentAI = new ProductionOmnipotentBWAEZI(aiConfig.omnipotent || {}, this.dbEngine, this.quantumCrypto);
    this.omnipresentAI = new ProductionOmnipresentBWAEZI(aiConfig.omnipresent || {}, this.dbEngine, this.quantumCrypto);
    this.evolvingAI = new ProductionEvolvingBWAEZI(aiConfig.evolving || {}, this.dbEngine, this.quantumCrypto);
    
    // Reality and Consciousness Engines
    this.realityEngine = new RealityProgrammingEngine(coreConfig.reality, this.dbEngine);
    this.neuroCortex = new QuantumNeuroCortex(coreConfig.cortex, this.dbEngine);
    
    // 🆕 NOVEL FIX: Initialized as null. Engine will be injected by main.js *after* core initialization.
    this.revenueEngine = null; 

    // Hardware Abstraction
    this.qpu = new QuantumProcessingUnit(this.config.qpu || {});
  }
  
  // 🆕 NOVEL FIX: Dedicated public method for Dependency Injection (Called by main.js orchestrator)
  injectRevenueEngine(engineInstance) {
    if (!engineInstance || typeof engineInstance.finalizeCycle !== 'function') {
        throw new Error("Invalid Revenue Engine instance provided for injection: missing finalizeCycle method.");
    }
    this.revenueEngine = engineInstance;
    console.log("✅ Sovereign Revenue Engine injected into Sovereign Core.");
  }


  async initialize() {
    if (this.isInitialized) return;
    console.log('🔬 Initializing Sovereign Core modules...');

    // Initialize DB if needed
    if (this.dbEngine && this.dbEngine.initialize) {
        await this.dbEngine.initialize();
    }
    
    // ❌ NOVEL FIX: Revenue Engine initialization removed from Core's concern.
    await Promise.all([
        this.tokenKernel.initialize(),
        this.quantumCrypto.initialize(),
        this.omnipotentAI.initialize(),
        this.omnipresentAI.initialize(),
        this.evolvingAI.initialize(),
        this.realityEngine.initialize(),
        this.neuroCortex.initialize(),
        this.qpu.initialize()
    ]);

    // Check for required, but optionally loaded, dependencies
    if (!this.revenueEngine) {
        console.warn('⚠️ Revenue Engine not yet injected. Core initializing in DEGRADED REVENUE MODE.');
    }
    
    this.isInitialized = true;
    this.godModeActive = true;
    
    setImmediate(() => this.startGodModeLoop());

    console.log("✅ Sovereign Core fully operational.");
    return true;
  }

  async startGodModeLoop() {
    if (!this.godModeActive) return;

    try {
      this.optimizationCycle++;
      console.log(`🔥 GOD MODE CYCLE #${this.optimizationCycle} (PID: ${process.pid})`);

      const globalState = await this.omnipresentAI.captureGlobalState();
      const plan = await this.omnipotentAI.generateOptimizationPlan(globalState);
      const evolved = await this.evolvingAI.applyGeneticOptimization(plan);

      // Execute Reality Programming and Cognitive Processing
      await this.realityEngine.orchestrateReality(evolved.optimizedInstructions);
      await this.neuroCortex.processCognitiveSignals(globalState);
      
      // 🆕 NOVEL FIX: Conditional call only if the engine has been injected
      if (this.revenueEngine) {
        await this.revenueEngine.finalizeCycle(this.optimizationCycle, evolved.performanceMetrics);
      } else {
        console.warn(`⚠️ Skipping revenue finalization (Cycle ${this.optimizationCycle}): Revenue Engine not injected/ready.`);
      }

      setImmediate(() => this.startGodModeLoop());

    } catch (error) {
      console.error(`🛑 GOD MODE ERROR (Cycle ${this.optimizationCycle}):`, error.message);
      await this.evolvingAI.initiateEmergencyProtocol(error);
      setTimeout(() => this.startGodModeLoop(), 5000);
    }
  }

  async executeQuantumComputation(task, data, options) {
    // Delegates to Omnipotent AI
    return this.omnipotentAI.execute(task, data, options);
  }

  async emergencyShutdown() {
    this.godModeActive = false;
    this.isInitialized = false;
    console.log("💀 Sovereign Brain shutdown complete.");
  }

  getStatus() {
    return {
      godMode: this.godModeActive,
      optimizationCycle: this.optimizationCycle,
      quantumOperations: this.qpu.getStatus().isOnline,
      consciousnessEngineActive: this.neuroCortex.getStatus().active,
      modulesLoaded: ['TrinityAI', this.revenueEngine ? 'RevenueEngine' : 'RevenueEngine(NULL)', 'RealityEngine', 'NeuroCortex', 'QPU']
    };
  }

  async getQuantumStatus() {
    return {
    entanglementStability: this.qpu.getStability(),
    realityCoherence: this.realityEngine.getCoherence(),
    temporalResonanceActive: true
    };
  }
}
