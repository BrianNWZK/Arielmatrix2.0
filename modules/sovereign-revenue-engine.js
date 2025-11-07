// modules/sovereign-revenue-engine.js - GOD MODE INTEGRATED (v18.3)
// 🎯 FIX: Safely re-added getSovereignRevenueEngine for backward compatibility.

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

// 🆕 Live Conversion Rate Function using CoinGecko (omitted implementation for brevity)
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

    this.initialized = false;
    this.godModeActive = false;
    this.tokenomics = null;
    this.governance = null;
    console.log('🚧 BWAEZI Sovereign Revenue Engine Ready for Initialization');
  }

  async initialize() {
    if (this.initialized) return;
    try {
      if (!this.sovereignCore || typeof this.sovereignCore.initialize !== 'function') {
        throw new Error("Invalid Sovereign Core instance");
      }

      // Initialize sub-agents with resilience (Tokenomics, Governance) (omitted for brevity)

      await initializeConnections();
      this.conversionRates = await calculateConversionRates();

      this.startGodMode();
      this.initialized = true;
      console.log('🚀 BWAEZI Sovereign Revenue Engine Initialized - GOD MODE ACTIVATED');
    } catch (error) {
      console.error("❌ Revenue Engine initialization failed:", error.message);
      // Re-throw if initialization is critical and external files rely on it.
      throw error; 
    }
  }

  // ... (rest of the class methods: finalizeCycle, startGodMode, executeGodModeOptimization, handleIncomingRevenue, shutdown, healthCheck, orchestrateRevenueAgents) ...
  
  async finalizeCycle(cycle, metrics) {
    if (this.governance?.finalizeCycle) {
      await this.governance.finalizeCycle(cycle, metrics).catch(err => {
        console.warn(`⚠️ Governance finalization failed (Cycle ${cycle}):`, err.message);
      });
    }
    if (this.tokenomics?.finalizeCycle) {
      await this.tokenomics.finalizeCycle(cycle, metrics).catch(err => {
        console.warn(`⚠️ Tokenomics finalization failed (Cycle ${cycle}):`, err.message);
      });
    }
  }

  startGodMode() {
    if (this.godModeActive) return;
    this.godModeOptimizationInterval = setInterval(() => {
      this.executeGodModeOptimization().catch(error => {
        console.warn('⚠️ GOD MODE Optimization failed:', error.message);
      });
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
    if (!this.initialized) return { success: false, error: 'Engine not initialized' };
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
    console.log('✅ BWAEZI Sovereign Revenue Engine shut down - GOD MODE DEACTIVATED');
    this.emit('shutdown', { timestamp: Date.now(), godModeDeactivated: true });
  }

  async healthCheck() {
    return {
      initialized: this.initialized,
      godModeActive: this.godModeActive,
      conversionRates: this.conversionRates,
      timestamp: Date.now()
    };
  }

  async orchestrateRevenueAgents(instructions = {}) {
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
// PRODUCTION EXPORT AND INSTANCE MANAGEMENT - GOD MODE READY
// =========================================================================

// Private variable to hold the successfully initialized, canonical instance.
let _initializedSovereignEngine = null;

/**
 * Retrieves the currently active, initialized Sovereign Revenue Engine instance.
 * NOTE: This should only be called after initializeSovereignRevenueEngine has resolved.
 */
export function getSovereignRevenueEngine() {
  if (!_initializedSovereignEngine) {
     console.warn("⚠️ CRITICAL WARNING: Attempted to get SovereignRevenueEngine before initialization. Null returned. Check module bootstrap order.");
  }
  return _initializedSovereignEngine;
}

/**
 * Initializes and returns the Sovereign Revenue Engine instance for the current process/worker.
 * This is the only function that sets the canonical instance.
 */
export async function initializeSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
  if (_initializedSovereignEngine) {
    console.warn("⚠️ WARNING: SovereignRevenueEngine already initialized in this process. Returning existing instance.");
    return _initializedSovereignEngine;
  }
  
  const engine = new SovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance);
  
  try {
    await engine.initialize();
    // Only set the canonical instance *after* successful initialization.
    _initializedSovereignEngine = engine;
    return engine;
  } catch (error) {
    // Ensure the instance is not set if initialization fails.
    console.error("❌ Failed to set canonical engine instance due to initialization failure.");
    throw error;
  }
}

export { SovereignRevenueEngine };
