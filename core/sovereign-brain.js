// core/sovereign-brain.js — BSFM Sovereign Brain (Quantum-Aware, GOD MODE, Full Capacity)
// 🔥 NOVELTY: COMPLETE CIRCULAR DEPENDENCY RESOLUTION & LAZY INJECTION
// 🎯 CRITICAL FIX: Integrated Enterprise Logger, Global Orchestrator Role

import { EventEmitter } from 'events';
import { BWAEZIToken } from '../modules/bwaezi-token.js';
import { QuantumResistantCrypto } from '../modules/quantum-resistant-crypto/index.js';
import ProductionOmnipotentBWAEZI from '../modules/production-omnipotent-bwaezi.js';
import ProductionOmnipresentBWAEZI from '../modules/production-omnipresent-bwaezi.js';
import ProductionEvolvingBWAEZI from '../modules/production-evolving-bwaezi.js';
import { QuantumNeuroCortex } from '../core/consciousness-reality-engine.js';
import { RealityProgrammingEngine } from '../core/consciousness-reality-advanced.js';
import { QuantumProcessingUnit } from '../core/quantumhardware-layer.js';
import { getGlobalLogger } from '../modules/enterprise-logger/index.js';

export class ProductionSovereignCore extends EventEmitter {
  constructor(config = {}, dbEngineInstance = null) {
    super();
    this.config = config;
    this.dbEngine = dbEngineInstance;
    this.isInitialized = false;
    this.godModeActive = false;
    this.optimizationCycle = 0;
    this.modules = new Map();

    this.logger = getGlobalLogger('SovereignCore');
    
    // New placeholders for injected core services
    this.revenueEngine = null;
    this.bwaeziChain = null;
    this.payoutSystem = null;

    // Initialize all independent modules (Original functionality maintained)
    this.qpu = new QuantumProcessingUnit(config);
    this.evolvingAI = new ProductionEvolvingBWAEZI(config);
    this.omnipotentAI = new ProductionOmnipotentBWAEZI(config, this.evolvingAI);
    this.omnipresentAI = new ProductionOmnipresentBWAEZI(config);
    this.bwaeziToken = new BWAEZIToken(config);
    this.cryptoEngine = new QuantumResistantCrypto(config);
    this.neuroCortex = new QuantumNeuroCortex(config, this.omnipotentAI);
    this.realityEngine = new RealityProgrammingEngine(config);

    this.modules.set('QPU', this.qpu);
    this.modules.set('NeuroCortex', this.neuroCortex);
    this.modules.set('RealityEngine', this.realityEngine);
  }

  /**
   * @method orchestrateCoreServices
   * @description The CORE ORCHESTRATION function. Accepts and registers all
   * critical external services after their initial bootstrap in main.js.
   */
  orchestrateCoreServices(services) {
    if (!services || !services.revenueEngine || !services.bwaeziChain || !services.payoutSystem) {
        this.logger.error("🛑 ORCHESTRATION FAILURE: Missing critical core services (Revenue/Chain/Payout).");
        throw new Error("Core orchestration failed: Missing dependencies.");
    }

    this.revenueEngine = services.revenueEngine;
    this.bwaeziChain = services.bwaeziChain;
    this.payoutSystem = services.payoutSystem;
    
    // Registering the injected modules
    this.modules.set('RevenueEngine', this.revenueEngine);
    this.modules.set('BrianNwaezikeChain', this.bwaeziChain);
    this.modules.set('BrianNwaezikePayoutSystem', this.payoutSystem);
    
    this.logger.info("✅ CORE ORCHESTRATION COMPLETE: Chain, Payout, and Revenue Engines successfully injected.");
  }


  async initialize() {
    if (this.isInitialized) {
      this.logger.warn("⚠️ Sovereign Core already initialized.");
      return;
    }
    // Critical check: Ensure orchestration was completed
    if (!this.revenueEngine || !this.bwaeziChain || !this.payoutSystem) {
        this.logger.error("🛑 FATAL: Orchestration required before core initialization. Aborting.");
        throw new Error("Missing required orchestrated services.");
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
        this.realityEngine.initialize()
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
    try {
        // 1. AI EXECUTION and Evolution
        const evolved = await this.evolvingAI.executeEvolve(globalState);
        await this.omnipresentAI.updateRealtimeMetrics(evolved.realtimeMetrics);
        await this.realityEngine.orchestrateReality(evolved.optimizedInstructions);
        await this.neuroCortex.processCognitiveSignals(globalState);
        
        // 2. GLOBAL ORCHESTRATION (Chain, Payout, Revenue) - New Core Responsibility
        if (this.bwaeziChain) {
            const chainStatus = await this.bwaeziChain.getChainStatus();
            this.logger.debug(`🔗 Chain Status (Block ${chainStatus.blockNumber}): Syncing critical state.`);
        }
        
        if (this.payoutSystem) {
            // Autonomous decision based on AI output (evolved.payoutInstructions)
            const rewards = await this.payoutSystem.executeScheduledPayouts(evolved.payoutInstructions);
            this.logger.debug(`💰 Payout System processed ${rewards.count} rewards.`);
        }
        
        // 3. REVENUE Finalization
        if (this.revenueEngine) {
            await this.revenueEngine.finalizeCycle(this.optimizationCycle, evolved.performanceMetrics);
            setImmediate(() => this.revenueEngine.orchestrateRevenueAgents(evolved.revenueInstructions));
        } else {
            this.logger.warn(`⚠️ Skipping revenue finalization/orchestration (Cycle ${this.optimizationCycle}): Revenue Engine not injected/ready.`);
        }

    } catch (error) {
      this.logger.warn(`⚠️ GOD MODE CYCLE ERROR (Cycle ${this.optimizationCycle}):`, error.message);
    }

    setImmediate(() => this.startGodModeLoop());
  }

  async executeQuantumComputation(task, data, options) {
    return this.omnipotentAI.execute(task, data, options);
  }

  async emergencyShutdown() {
    this.godModeActive = false;
    this.isInitialized = false;

    // Delegate shutdown to injected modules for clean exit
    await Promise.allSettled([
        this.revenueEngine?.shutdown(),
        this.bwaeziChain?.shutdown(),
        this.payoutSystem?.shutdown(),
        this.qpu.shutdown(),
        this.neuroCortex.shutdown()
    ]);

    this.logger.info("💀 Sovereign Brain shutdown complete.");
  }

  getStatus() {
    return {
      godMode: this.godModeActive,
      optimizationCycle: this.optimizationCycle,
      quantumOperations: this.qpu.getStatus().isOnline,
      consciousnessEngineActive: this.neuroCortex.getStatus().active,
      modulesLoaded: [
        'TrinityAI',
        this.revenueEngine ? 'RevenueEngine' : 'RevenueEngine(NULL)',
        this.bwaeziChain ? 'BrianNwaezikeChain' : 'Chain(NULL)',
        this.payoutSystem ? 'PayoutSystem' : 'PayoutSystem(NULL)',
        'RealityEngine',
        'NeuroCortex',
        'QPU'
      ]
    };
  }
}
