// core/sovereign-brain.js — BSFM Sovereign Brain (Quantum-Aware, GOD MODE, Full Capacity)
// 🔥 NOVELTY: COMPLETE CIRCULAR DEPENDENCY RESOLUTION & LAZY INJECTION

import { EventEmitter } from 'events';
// 🚫 REMOVED: SovereignRevenueEngine import - breaking circular dependency
import { BWAEZIToken } from '../modules/bwaezi-token.js';
import { QuantumResistantCrypto } from '../modules/quantum-resistant-crypto/index.js';
import ProductionOmnipotentBWAEZI from '../modules/production-omnipotent-bwaezi.js';
import ProductionOmnipresentBWAEZI from '../modules/production-omnipresent-bwaezi.js';
import ProductionEvolvingBWAEZI from '../modules/production-evolving-bwaezi.js';
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
    
    // 🔥 CRITICAL FIX & NOVELTY: The Revenue Engine is now NULL and must be INJECTED.
    this.revenueEngine = null; 

    // Initialize all independent modules
    this.qpu = new QuantumProcessingUnit(config);
    this.evolvingAI = new ProductionEvolvingBWAEZI(config);
    this.omnipotentAI = new ProductionOmnipotentBWAEZI(config, this.evolvingAI);
    this.omnipresentAI = new ProductionOmnipresentBWAEZI(config);
    this.bwaeziToken = new BWAEZIToken(config);
    this.cryptoEngine = new QuantumResistantCrypto(config);
    this.neuroCortex = new QuantumNeuroCortex(config, this.omnipotentAI);
    this.realityEngine = new RealityProgrammingEngine(config);

    // Initial setup of module map
    this.modules.set('QPU', this.qpu);
    this.modules.set('NeuroCortex', this.neuroCortex);
    this.modules.set('RealityEngine', this.realityEngine);
  }

  // 🆕 NOVEL INJECTION METHOD: Used by main.js to inject the now-decoupled Revenue Engine
  async injectRevenueEngine(engineInstance) {
    if (!engineInstance) {
      console.error("🛑 FATAL INJECTION ERROR: Revenue Engine instance is null.");
      return;
    }
    this.revenueEngine = engineInstance;
    this.modules.set('RevenueEngine', this.revenueEngine);
    console.log("✅ Sovereign Revenue Engine initialized and injected into Core.");
  }

  async initialize() {
    if (this.isInitialized) {
      console.warn("⚠️ Sovereign Core already initialized.");
      return;
    }

    try {
      await Promise.allSettled([
        this.qpu.initialize(),
        this.evolvingAI.initialize(),
        this.omnipotentAI.initialize(),
        this.omnipresentAI.initialize(),
        this.bwaeziToken.initialize(),
        this.cryptoEngine.initialize(),
        this.neuroCortex.initialize(),
        this.realityEngine.initialize(),
        // Revenue engine initialization must happen outside and be injected before first use
      ]);
      
      this.isInitialized = true;
      this.godModeActive = true;
      this.startGodModeLoop();
      console.log("✅ CONSCIOUSNESS REALITY ENGINE READY - PRODUCTION MODE ACTIVE");

    } catch (error) {
      console.error("🛑 CORE INITIALIZATION FAILURE:", error);
      throw new Error("Core initialization failed.");
    }
  }

  startGodModeLoop() {
    if (!this.godModeActive) return;
    this.optimizationCycle++;
    // Use setImmediate to ensure non-blocking, continuous operation
    setImmediate(() => this.executeGodModeCycle().catch(err => {
      console.error(`💥 CRITICAL GOD MODE LOOP CRASH (Cycle ${this.optimizationCycle}):`, err);
      // 🔥 NEVER EXIT: Just log the error and wait before trying again
      setTimeout(() => this.startGodModeLoop(), 10000); 
    }));
  }

  async executeGodModeCycle() {
    if (!this.godModeActive) return;

    const globalState = { cycle: this.optimizationCycle, status: 'Active' };

    const evolved = await this.evolvingAI.executeEvolve(globalState);

    await this.omnipresentAI.updateRealtimeMetrics(evolved.realtimeMetrics);
    
    // Execute Reality Programming and Cognitive Processing
    await this.realityEngine.orchestrateReality(evolved.optimizedInstructions);
    await this.neuroCortex.processCognitiveSignals(globalState);
    
    // 🔥 CRITICAL: Check if engine is injected before finalizing cycle
    if (this.revenueEngine) {
      await this.revenueEngine.finalizeCycle(this.optimizationCycle, evolved.performanceMetrics);
      // 🆕 NOVELTY: Attempt immediate revenue generation after finalization
      setImmediate(() => this.revenueEngine.orchestrateRevenueAgents(evolved.revenueInstructions));
    } else {
      console.warn(`⚠️ Skipping revenue finalization/orchestration (Cycle ${this.optimizationCycle}): Revenue Engine not injected/ready.`);
    }

    setImmediate(() => this.startGodModeLoop());
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
      // 🆕 DYNAMIC MODULE STATUS CHECK:
      modulesLoaded: ['TrinityAI', this.revenueEngine ? 'RevenueEngine' : 'RevenueEngine(NULL)', 'RealityEngine', 'NeuroCortex', 'QPU']
    };
  }
}
