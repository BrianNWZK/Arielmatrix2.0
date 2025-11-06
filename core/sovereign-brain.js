// core/sovereign-brain.js — BSFM Sovereign Brain (Quantum-Aware, GOD MODE, Resilient Capacity)

import { EventEmitter } from 'events';
import { BWAEZIToken } from '../modules/bwaezi-token.js';
import { QuantumResistantCrypto } from '../modules/quantum-resistant-crypto/index.js';
import ProductionOmnipotentBWAEZI from '../modules/production-omnipotent-bwaezi.js';
import ProductionOmnipresentBWAEZI from '../modules/production-omnipresent-bwaezi.js';
import ProductionEvolvingBWAEZI from '../modules/production-evolving-bwaezi.js';
import { QuantumNeuroCortex } from '../core/consciousness-reality-engine.js';
import { RealityProgrammingEngine } from '../core/consciousness-reality-advanced.js';
import { QuantumProcessingUnit } from '../core/quantumhardware-layer.js';

export class ProductionSovereignCore {
  // 🔥 NOVELTY: Accepts BOTH Transactions DB and Quantum Crypto DB
  constructor(config = {}, transactionsDbEngine = null, quantumCryptoDbEngine = null) { 
    this.config = config;
    this.transactionsDb = transactionsDbEngine; // Primary DB for transactions/logs
    this.quantumCryptoDb = quantumCryptoDbEngine; // Dedicated DB for quantum crypto keys
    this.isInitialized = false;
    this.godModeActive = false;
    this.optimizationCycle = 0;
    this.modules = new Map();

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
    this.quantumCrypto = new QuantumResistantCrypto(coreConfig.crypto, this.quantumCryptoDb); 
    
    // AI Trinity Initialization (Uses primary transactions DB)
    this.omnipotentAI = new ProductionOmnipotentBWAEZI(aiConfig.omnipotent || {}, this.transactionsDb, this.quantumCrypto);
    this.omnipresentAI = new ProductionOmnipresentBWAEZI(aiConfig.omnipresent || {}, this.transactionsDb, this.quantumCrypto);
    this.evolvingAI = new ProductionEvolvingBWAEZI(aiConfig.evolving || {}, this.transactionsDb, this.quantumCrypto);
    
    // Reality and Consciousness Engines
    this.realityEngine = new RealityProgrammingEngine(coreConfig.reality, this.transactionsDb);
    this.neuroCortex = new QuantumNeuroCortex(coreConfig.cortex, this.transactionsDb);

    // Revenue Engine (INJECTION PLACEHOLDER: Set by main.js after initialization)
    this.revenueEngine = null; 

    // Hardware Abstraction
    this.qpu = new QuantumProcessingUnit(this.config.qpu || {});
  }
  
  // 🆕 NOVELTY: Dedicated public method for Dependency Injection (Called by main.js)
  injectRevenueEngine(engineInstance) {
    if (!engineInstance || typeof engineInstance.finalizeCycle !== 'function') {
        throw new Error("Invalid Revenue Engine instance provided for injection: missing finalizeCycle method.");
    }
    this.revenueEngine = engineInstance;
    console.log("✅ Sovereign Revenue Engine injected into Sovereign Core.");
  }


  async initialize() {
    if (this.isInitialized) return;
    console.log('🔬 Initializing Sovereign Core modules (RESILIENCE MODE)...');
    
    const modulesToInit = [
        { name: 'TokenKernel', instance: this.tokenKernel },
        { name: 'QuantumCrypto', instance: this.quantumCrypto },
        { name: 'OmnipotentAI', instance: this.omnipotentAI },
        { name: 'OmnipresentAI', instance: this.omnipresentAI },
        { name: 'EvolvingAI', instance: this.evolvingAI },
        { name: 'RealityEngine', instance: this.realityEngine },
        { name: 'NeuroCortex', instance: this.neuroCortex },
        { name: 'QPU', instance: this.qpu }
    ];

    // 🔥 CRITICAL RESILIENCE: Use Promise.allSettled to ensure all are attempted, preventing crash
    const results = await Promise.allSettled(
        modulesToInit.map(mod => mod.instance.initialize())
    );
    
    const failedModules = [];
    results.forEach((result, index) => {
        const moduleName = modulesToInit[index].name;
        if (result.status === 'rejected') {
            console.error(`❌ CRITICAL INITIALIZATION FAILURE: ${moduleName} failed to boot. Bypassing. Reason: ${result.reason.message || 'Unknown'}`);
            failedModules.push(moduleName);
        } else {
            console.log(`✅ ${moduleName} initialized successfully.`);
        }
    });

    if (!this.revenueEngine) {
        console.warn('⚠️ Revenue Engine not yet injected. Core initializing in DEGRADED REVENUE MODE.');
    }
    
    this.isInitialized = true;
    this.godModeActive = true; 
    
    setImmediate(() => this.startGodModeLoop());

    console.log(`✅ Sovereign Core partially operational. ${failedModules.length} module(s) failed initialization. Starting Resilient Loop.`);
    return true;
  }

  // 🔥 ULTIMATE EXECUTION: The main loop is protected to guarantee perpetual uptime.
  async startGodModeLoop() {
    if (!this.godModeActive) return; 
    try {
      this.optimizationCycle++;
      console.log(`🔥 GOD MODE CYCLE #${this.optimizationCycle} (PID: ${process.pid}) - ULTIMATE EXECUTION MODE ACTIVE`); 

      let globalState = {};
      let plan = { optimizedInstructions: [] };
      let evolved = { optimizedInstructions: [], performanceMetrics: {} };
      
      // AI Trinity Execution (Bypassable)
      try {
        globalState = await this.omnipresentAI.captureGlobalState();
        plan = await this.omnipotentAI.generateOptimizationPlan(globalState);
        evolved = await this.evolvingAI.applyGeneticOptimization(plan);
      } catch (error) {
        console.error(`❌ Optimization AI (Trinity) failed: ${error.message}. Using fallback plan.`);
        plan = { optimizedInstructions: [] }; 
        evolved = { optimizedInstructions: [], performanceMetrics: {} }; 
      }
      
      // Reality Programming (Bypassable but must be attempted)
      try {
        // 🚀 REALITY PROGRAMMING EXECUTION (NEVER STOPS)
        await this.realityEngine.orchestrateReality(evolved.optimizedInstructions);
        console.log('✅ Reality Programming Executed.');
      } catch (error) {
        console.warn(`⚠️ Reality Engine orchestration failed: ${error.message}. Bypassed.`);
      }
      
      // Consciousness Processing (Bypassable)
      try {
        await this.neuroCortex.processCognitiveSignals(globalState);
      } catch (error) {
        console.warn(`⚠️ Neuro Cortex processing failed: ${error.message}. Bypassed.`);
      }

      // REVENUE ENGINE (CRITICAL: MUST RUN TO GENERATE REVENUE)
      try {
        if (this.revenueEngine) {
            await this.revenueEngine.finalizeCycle(this.optimizationCycle, evolved.performanceMetrics);
            console.log('💰 REVENUE GENERATION CYCLE COMPLETED SUCCESSFULLY.');
        } else {
            console.warn(`⚠️ Skipping revenue finalization (Cycle ${this.optimizationCycle}): Revenue Engine not injected/ready.`);
        }
      } catch (error) {
        console.error(`🛑 CRITICAL REVENUE ENGINE FAILURE: ${error.message}. Retrying next cycle.`);
      }

      // Final step: Schedule next cycle
      setImmediate(() => this.startGodModeLoop());

    } catch (fatalError) {
      // 💀 FATAL CATCH: This safety net ensures the process never exits.
      console.error(`💀 FATAL SOVEREIGN CORE LOOP FAILURE: ${fatalError.message}. Initiating Emergency Protocol and Reschedule.`);
      setTimeout(() => this.startGodModeLoop(), 5000); 
    }
  }

  async executeQuantumComputation(task, data, options) {
    // Delegates quantum computation tasks to the Omnipotent AI agent.
    // This is the high-level entry point for executing BWAEZI AI's core logic.
    return this.omnipotentAI.execute(task, data, options);
  }

  async emergencyShutdown() {
    // Gracefully disables core loops and state flags for a controlled stop.
    this.godModeActive = false;
    this.isInitialized = false;
    console.log("💀 Sovereign Brain shutdown complete.");
  }

  getStatus() {
    // Provides a snapshot of the BSFM's current operating status.
    // The modulesLoaded check confirms the successful injection of the Revenue Engine.
    return {
      godMode: this.godModeActive,
      optimizationCycle: this.optimizationCycle,
      quantumOperations: this.qpu.getStatus().isOnline,
      consciousnessEngineActive: this.neuroCortex.getStatus().active,
      // NOVELTY: Reports if the Revenue Engine was successfully injected (not NULL)
      modulesLoaded: ['TrinityAI', this.revenueEngine ? 'RevenueEngine' : 'RevenueEngine(NULL)', 'RealityEngine', 'NeuroCortex', 'QPU']
    };
  }

  async getQuantumStatus() {
    // Provides deep-level metrics from the underlying quantum and reality engines.
    return {
      entanglementStability: this.qpu.getStability(),
      realityCoherence: this.realityEngine.getCoherence(),
      temporalResonanceActive: true
    };
  }
} // End of ProductionSovereignCore Class
