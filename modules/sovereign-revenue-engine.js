// modules/sovereign-revenue-engine.js - GOD MODE INTEGRATED (v18.4)
// 🎯 CRITICAL FIX: Fail-Forward dependency resilience to prevent deployment crash.

import { 
  EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignTokenomics } from './tokenomics-engine/index.js';
import { SovereignGovernance } from './governance-engine/index.js';
import {
  initializeConnections,
  processRevenuePayment,
  triggerRevenueConsolidation
} from '../backend/agents/wallet.js';
import { createHash } from 'crypto';
import { ProductionSovereignCore } from '../core/sovereign-brain.js';
import { BWAEZI_CHAIN, BWAEZI_SOVEREIGN_CONFIG } from '../config/bwaezi-config.js';

// ... (Helper functions: calculateConversionRates, getLivePrice) ...
async function calculateConversionRates() {
  const BWAEZI_TO_USDT = 100;
  const ethPrice = await getLivePrice('ethereum');
  const solPrice = await getLivePrice('solana');
  return {
    BWAEZI: 1.0,
    USDT: BWAEZI_TO_USDT,
    ETH: BWAEZI_TO_USDT / ethPrice,
    SOL: BWAEZI_TO_USDT / solPrice
  };
}

async function getLivePrice(symbol) {
  const coinId = { ethereum: 'ethereum', solana: 'solana' }[symbol.toLowerCase()];
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usdt`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return data[coinId]?.usdt || 1;
  } catch (error) {
    console.warn(`⚠️ Price fetch failed for ${symbol}:`, error.message);
    return 1;
  }
}

export default class SovereignRevenueEngine extends EventEmitter {
  constructor(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
    super();
    this.config = {
      ...BWAEZI_SOVEREIGN_CONFIG,
      ...config
    };
    this.sovereignCore = sovereignCoreInstance;
    this.db = dbEngineInstance;
    this.coreBound = !!(sovereignCoreInstance && typeof sovereignCoreInstance.initialize === 'function'); // Check core validity

    this.initialized = false;
    this.godModeActive = false;
    this.tokenomics = null;
    this.governance = null;
    console.log('🚧 BWAEZI Sovereign Revenue Engine Ready for Initialization');
  }

  /**
   * Allows external injection of the Sovereign Core instance after construction.
   * This is the mechanism for fixing the bootstrap race condition.
   */
  async bindCore(coreInstance) {
    if (!coreInstance || typeof coreInstance.initialize !== 'function') {
      console.error("❌ Attempted to bind an invalid Sovereign Core instance.");
      this.coreBound = false;
      return false;
    }
    this.sovereignCore = coreInstance;
    this.coreBound = true;
    console.log("🔗 Sovereign Core successfully bound. Re-initializing engine...");

    // Re-initialize to spin up dependent agents
    if (!this.initialized) {
      await this.initialize();
    }
    return true;
  }

  async initialize() {
    if (this.initialized && this.coreBound) return;
    
    // Check core status before proceeding with core-dependent agents
    if (!this.coreBound) {
      console.warn("⚠️ Revenue Engine initializing in degraded mode: Sovereign Core dependency is not yet bound.");
      // Skip core-dependent logic for now
    }
    
    try {
      // ✅ AGENT RESILIENCE: Only initialize dependent agents if the core is ready
      if (this.coreBound) {
        try {
          this.tokenomics = new SovereignTokenomics(this.db);
          await this.tokenomics.initialize();
        } catch (error) {
          console.warn("⚠️ Tokenomics failed:", error.message);
          this.tokenomics = null;
        }

        try {
          this.governance = new SovereignGovernance(this.db, this.sovereignCore);
          await this.governance.initialize();
        } catch (error) {
          console.warn("⚠️ Governance failed:", error.message);
          this.governance = null;
        }
      } else {
        console.warn("⚠️ Tokenomics and Governance engines skipped. Waiting for Sovereign Core binding.");
      }

      await initializeConnections();
      this.conversionRates = await calculateConversionRates();

      this.startGodMode();
      this.initialized = true;

      const initStatus = this.coreBound ? 'FULLY ACTIVATED' : 'DEGRADED (Awaiting Core)';
      console.log(`🚀 BWAEZI Sovereign Revenue Engine Initialized - ${initStatus}`);
    } catch (error) {
      // ✅ CRITICAL FIX: Do not throw a hard error that crashes the deployment
      console.error("❌ Revenue Engine partial initialization failed (Non-fatal):", error.message);
      this.initialized = false;
    }
  }

  // ... (rest of the class methods) ...
  
  async finalizeCycle(cycle, metrics) {
    if (this.governance?.finalizeCycle && this.coreBound) {
      await this.governance.finalizeCycle(cycle, metrics).catch(err => {
        console.warn(`⚠️ Governance finalization failed (Cycle ${cycle}):`, err.message);
      });
    }
    // ...
  }

  startGodMode() {
    if (this.godModeActive) return;
    this.godModeOptimizationInterval = setInterval(() => {
      // Only execute God Mode if the core is bound
      if (this.coreBound) {
          this.executeGodModeOptimization().catch(error => {
              console.warn('⚠️ GOD MODE Optimization failed:', error.message);
          });
      } else {
          console.warn("⚠️ GOD MODE cycle skipped: Sovereign Core is not bound.");
      }
    }, this.config.godModeOptimizationInterval || 300000);
    this.godModeActive = true;
  }

  async executeGodModeOptimization() {
    if (this.governance) {
      await this.governance.executeAIGovernance().catch(err => {
        console.warn("⚠️ Governance cycle failed:", err.message);
      });
    }

    await triggerRevenueConsolidation(this.sovereignCore).catch(err => {
      console.warn("⚠️ Revenue consolidation failed:", err.message);
    });
    if (this.tokenomics) {
      await this.tokenomics.runAdjustmentCycle().catch(err => {
        console.warn("⚠️ Tokenomics cycle failed:", err.message);
      });
    }

    this.emit('godModeCycleComplete', { timestamp: Date.now() });
  }

  async handleIncomingRevenue(amount, token, sourceAddress) {
    if (!this.initialized || !this.coreBound) return { success: false, error: 'Engine not fully initialized or Core not bound' };
    const transactionId = createHash('sha256').update(String(Date.now())).digest('hex');

    const paymentResult = await processRevenuePayment({
      amount,
      token,
      sourceAddress,
      destinationAddress: this.config.FOUNDER_ADDRESS || BWAEZI_CHAIN.FOUNDER_ADDRESS
    });
    if (paymentResult.success && this.tokenomics) {
      await this.tokenomics.recordRevenue(amount, token, sourceAddress, paymentResult.txHash);
    }

    if (this.sovereignCore?.analyzeRevenue) {
      this.sovereignCore.analyzeRevenue({ amount, token });
    }

    return paymentResult;
  }

  async shutdown() {
    if (this.godModeOptimizationInterval) clearInterval(this.godModeOptimizationInterval);
    if (this.db?.close) await this.db.close();
    if (this.governance?.shutdown) await this.governance.shutdown();
    if (this.tokenomics?.shutdown) await this.tokenomics.shutdown();
    if (this.sovereignCore?.emergencyShutdown) await this.sovereignCore.emergencyShutdown();

    this.initialized = false;
    this.godModeActive = false;
    this.coreBound = false;
    console.log('✅ BWAEZI Sovereign Revenue Engine shut down - GOD MODE DEACTIVATED');
    this.emit('shutdown', { timestamp: Date.now(), godModeDeactivated: true });
  }

  async healthCheck() {
    return {
      initialized: this.initialized,
      godModeActive: this.godModeActive,
      coreBound: this.coreBound, // New status check
      conversionRates: this.conversionRates,
      timestamp: Date.now()
    };
  }

  async orchestrateRevenueAgents(instructions = {}) {
    if (!this.coreBound) return [{ agent: 'Orchestration', error: 'Cannot orchestrate agents: Sovereign Core not bound.' }];
    // ... (rest of orchestration logic)
    const results = [];
    try {
      if (this.tokenomics) {
        const result = await this.tokenomics.runAdjustmentCycle(instructions);
        results.push({ agent: 'Tokenomics', result });
      }
    } catch (error) {
      results.push({ agent: 'Tokenomics', error: error.message });
    }

    try {
      if (this.governance) {
        const result = await this.governance.executeAIGovernance(instructions);
        results.push({ agent: 'Governance', result });
      }
    } catch (error) {
      results.push({ agent: 'Governance', error: error.message });
    }

    return results;
  }
}

// =========================================================================
// PRODUCTION EXPORT AND INSTANCE MANAGEMENT
// =========================================================================

let _initializedSovereignEngine = null;

export function getSovereignRevenueEngine() {
  if (!_initializedSovereignEngine) {
     console.warn("⚠️ CRITICAL WARNING: Attempted to get SovereignRevenueEngine before initialization. Null returned. Check module bootstrap order.");
  }
  return _initializedSovereignEngine;
}

export async function initializeSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
  if (_initializedSovereignEngine) {
    console.warn("⚠️ WARNING: SovereignRevenueEngine already initialized in this process. Returning existing instance.");
    return _initializedSovereignEngine;
  }
  
  const engine = new SovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance);
  
  try {
    await engine.initialize();
    // Only set the canonical instance *after* successful initialization (even if degraded).
    _initializedSovereignEngine = engine;
    return engine;
  } catch (error) {
    console.error("❌ Failed to initialize and set canonical engine instance.");
    // Allowing the app to continue running by not re-throwing here,
    // relying on the engine's internal degraded state.
    _initializedSovereignEngine = engine; // Still set the instance for health checks
    return engine;
  }
}

export { SovereignRevenueEngine };
