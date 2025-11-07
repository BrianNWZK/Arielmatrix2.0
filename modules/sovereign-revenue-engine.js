// modules/sovereign-revenue-engine.js - GOD MODE INTEGRATED (v18.1)
// 💸 FAIL-FORWARD DUAL-CONFIG RESILIENCE ENGINE

import { EventEmitter } from 'events';
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

// ✅ Direct config fallback
import { BWAEZI_CHAIN, BWAEZI_SOVEREIGN_CONFIG } from '../config/bwaezi-config.js';

// 🆕 Live Conversion Rate Function using CoinGecko
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
      ...BWAEZI_SOVEREIGN_CONFIG, // ✅ Direct fallback
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

      await initializeConnections();
      this.conversionRates = await calculateConversionRates();

      this.startGodMode();
      this.initialized = true;
      console.log('🚀 BWAEZI Sovereign Revenue Engine Initialized - GOD MODE ACTIVATED');

    } catch (error) {
      console.error("❌ Revenue Engine initialization failed:", error.message);
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

let globalRevenueEngine = null;

export function getSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
  if (!globalRevenueEngine) {
    globalRevenueEngine = new SovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance);
  }
  return globalRevenueEngine;
}

export async function initializeSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
  const engine = getSovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance);
  await engine.initialize();
  return engine;
}

export { SovereignRevenueEngine };
