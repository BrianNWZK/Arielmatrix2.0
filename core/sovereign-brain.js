// core/sovereign-brain.js — BSFM Sovereign Brain (Quantum-Aware, GOD MODE, Full Capacity)
// 🔥 NOVELTY: COMPLETE CIRCULAR DEPENDENCY RESOLUTION & LAZY INJECTION
// 🎯 CRITICAL FIX: Integrated Enterprise Logger

import { EventEmitter } from 'events';
// NOTE: Imports are for structure/reference
import { BWAEZIToken } from '../modules/bwaezi-token.js';
import { QuantumResistantCrypto } from '../modules/quantum-resistant-crypto/index.js';
import ProductionOmnipotentBWAEZI from '../modules/production-omnipotent-bwaezi.js';
import ProductionOmnipresentBWAEZI from '../modules/production-omnipresent-bwaezi.js';
import ProductionEvolvingBWAEZI from '../modules/production-evolving-bwaezi.js';
import { QuantumNeuroCortex } from '../core/consciousness-reality-engine.js';
import { RealityProgrammingEngine } from '../core/consciousness-reality-advanced.js';
import { QuantumProcessingUnit } from '../core/quantumhardware-layer.js';

// 🆕 CRITICAL FIX: Import the Enterprise Logger
import { getGlobalLogger } from '../modules/enterprise-logger/index.js';

export class ProductionSovereignCore {
  constructor(config = {}, dbEngineInstance = null) { 
    this.config = config;
    this.dbEngine = dbEngineInstance;
    this.isInitialized = false;
    this.godModeActive = false;
    this.optimizationCycle = 0;
    this.modules = new Map();
    
    // 🎯 CRITICAL FIX: Get the Enterprise Logger instance for this service
    this.logger = getGlobalLogger('SovereignCore'); 

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

  // 🆕 NOVEL INJECTION METHOD
  async injectRevenueEngine(engineInstance) {
    if (!engineInstance) {
      this.logger.error("🛑 FATAL INJECTION ERROR: Revenue Engine instance is null.");
      return;
    }
    this.revenueEngine = engineInstance;
    this.modules.set('RevenueEngine', this.revenueEngine);
    this.logger.info("✅ Sovereign Revenue Engine initialized and injected into Core.");
  }

  async initialize() {
    if (this.isInitialized) {
      this.logger.warn("⚠️ Sovereign Core already initialized.");
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
      ]);
      
      this.isInitialized = true;
      this.godModeActive = true;
      this.startGodModeLoop();
      this.logger.info("✅ CONSCIOUSNESS REALITY ENGINE READY - PRODUCTION MODE ACTIVE");

    } catch (error) {
      this.logger.error("🛑 CORE INITIALIZATION FAILURE:", error);
      throw new Error("Core initialization failed.");
    }
  }

  startGodModeLoop() {
    if (!this.godModeActive) return;
    this.optimizationCycle++;
    setImmediate(() => this.executeGodModeCycle().catch(err => {
      this.logger.error(`💥 CRITICAL GOD MODE LOOP CRASH (Cycle ${this.optimizationCycle}):`, err);
      setTimeout(() => this.startGodModeLoop(), 10000); 
    }));
  }

  async executeGodModeCycle() {
    if (!this.godModeActive) return;

    const globalState = { cycle: this.optimizationCycle, status: 'Active' };

    const evolved = await this.evolvingAI.executeEvolve(globalState);

    await this.omnipresentAI.updateRealtimeMetrics(evolved.realtimeMetrics);
    
    await this.realityEngine.orchestrateReality(evolved.optimizedInstructions);
    await this.neuroCortex.processCognitiveSignals(globalState);
    
    if (this.revenueEngine) {
      await this.revenueEngine.finalizeCycle(this.optimizationCycle, evolved.performanceMetrics);
      setImmediate(() => this.revenueEngine.orchestrateRevenueAgents(evolved.revenueInstructions));
    } else {
      this.logger.warn(`⚠️ Skipping revenue finalization/orchestration (Cycle ${this.optimizationCycle}): Revenue Engine not injected/ready.`);
    }

    setImmediate(() => this.startGodModeLoop());
  }

  async executeQuantumComputation(task, data, options) {
    return this.omnipotentAI.execute(task, data, options);
  }

  async emergencyShutdown() {
    this.godModeActive = false;
    this.isInitialized = false;
    this.logger.info("💀 Sovereign Brain shutdown complete.");
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
}
