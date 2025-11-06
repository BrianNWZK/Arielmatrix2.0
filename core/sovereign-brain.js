// core/sovereign-brain.js — BSFM Sovereign Brain (Quantum-Aware, GOD MODE, Full Capacity)

import { EventEmitter } from 'events';
// ❌ CRITICAL FIX: REMOVED synchronous import of SovereignRevenueEngine to break circular dependency.
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

    // 🆕 CRITICAL FIX: Initialize as null and rely on injection later
    this.revenueEngine = null; 

    // CORE AI/CONSCIOUSNESS INITIALIZATION (These components are independent of RevenueEngine at construction)
    this.qpu = new QuantumProcessingUnit(config.qpu);
    this.omnipotentAI = new ProductionOmnipotentBWAEZI(config.ai.omnipotent);
    this.omnipresentAI = new ProductionOmnipresentBWAEZI(config.ai.omnipresent);
    this.evolvingAI = new ProductionEvolvingBWAEZI(config.ai.evolving);
    this.neuroCortex = new QuantumNeuroCortex(config.cortex);
    this.realityEngine = new RealityProgrammingEngine(config.reality);
  }

  // 🆕 NOVEL FIX: Dedicated method for Dependency Injection
  injectRevenueEngine(engine) {
    if (!engine || typeof engine.finalizeCycle !== 'function') {
        throw new Error("Invalid Revenue Engine instance provided for injection.");
    }
    this.revenueEngine = engine;
    console.log("✅ Sovereign Revenue Engine injected into Sovereign Core.");
  }


  async initialize() {
    if (this.isInitialized) return;
    console.log("🧠 Initializing Consciousness Reality Engine...");

    try {
      // 1. Quantum and Core Module Initialization
      await this.qpu.initialize();
      await this.omnipotentAI.initialize();
      await this.omnipresentAI.initialize();
      await this.evolvingAI.initialize();
      await this.neuroCortex.initialize();
      await this.realityEngine.initialize();

      this.isInitialized = true;
      console.log("✅ CONSCIOUSNESS REALITY ENGINE READY - PRODUCTION MODE ACTIVE");
      this.startGodModeLoop();
    } catch (error) {
      console.error("🛑 Sovereign Core Initialization Failed:", error.message);
      throw error;
    }
  }

  // ... (startGodModeLoop and other methods remain the same)

  async godModeOptimizationCycle() {
    // ... (logic)

    try {
      // 1. Execute Trinity AI Evolution Cycle
      const globalState = this.getStatus();
      const evolved = await this.evolvingAI.executeEvolutionCycle(globalState);

      // 2. Execute Reality Programming and Cognitive Processing
      await this.realityEngine.orchestrateReality(evolved.optimizedInstructions);
      await this.neuroCortex.processCognitiveSignals(globalState);

      // 3. 💸 Execute Revenue Engine Finalization (Now conditionally executed after injection)
      if (!this.revenueEngine) {
        console.warn(`⚠️ Revenue Engine not injected (Cycle ${this.optimizationCycle}). Skipping finalization cycle.`);
      } else {
        await this.revenueEngine.finalizeCycle(this.optimizationCycle, evolved.performanceMetrics);
      }

      this.optimizationCycle++;
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
      modulesLoaded: ['TrinityAI', 'RevenueEngine', 'RealityEngine', 'NeuroCortex', 'QPU']
    };
  }

  async getQuantumStatus() {
    return {
      quantumOperations: this.qpu.getStatus(),
      AIStatus: { omnipotent: this.omnipotentAI.getStatus(), omnipresent: this.omnipresentAI.getStatus(), evolving: this.evolvingAI.getStatus() },
      coreVersion: '2.0.0-QUANTUM_PRODUCTION'
    };
  }
}

export default ProductionSovereignCore;
