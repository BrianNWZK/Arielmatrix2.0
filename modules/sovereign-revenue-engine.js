// modules/sovereign-revenue-engine.js - GOD MODE INTEGRATED (v18.1)
// 💸 REVISED: DEPENDENCY INJECTION & IPC COMPATIBLE

import { EventEmitter } from 'events';
// NOTE: These imports are kept for type reference but not instantiated internally
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignTokenomics } from './tokenomics-engine/index.js';
import { SovereignGovernance } from './governance-engine/index.js';
import { 
    initializeConnections,
    getWalletBalances,
    sendETH,
    sendSOL,
    sendBwaezi,
    sendUSDT,
    processRevenuePayment,
    checkBlockchainHealth,
    validateAddress,
    triggerRevenueConsolidation
} from '../backend/agents/wallet.js';
import { createHash, randomBytes } from 'crypto';

// ❌ NOVEL FIX: REMOVED the import of ProductionSovereignCore as per user's request ("they dont mix or contact").
import {
    BWAEZI_CHAIN,
    TOKEN_CONVERSION_RATES,
    BWAEZI_SOVEREIGN_CONFIG,
    SOVEREIGN_SERVICES,
    COMPLIANCE_STRATEGY,
    PUBLIC_COMPLIANCE_STATEMENTS,
    ConfigUtils
} from '../config/bwaezi-config.js';
// =========================================================================
// PRODUCTION-READY SOVEREIGN REVENUE ENGINE - GOD MODE ACTIVATED
// =========================================================================
export class SovereignRevenueEngine extends EventEmitter {
    
    // CRITICAL FIX 1: Constructor accepts and stores the AIGovernor (sovereignCoreInstance) and DB instance
    constructor(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) { 
        super();
        this.config = {
            // These are placeholder;
            production config should be in BWAEZI_SOVEREIGN_CONFIG
            revenueCheckInterval: 5000, 
            godModeOptimizationInterval: 300000,
            ...config
        };
        this.sovereignCore = sovereignCoreInstance; // AIGOVERNOR is stored here
        this.db = dbEngineInstance; // DB instance is stored here

        this.initialized = false;
        this.godModeActive = false;
        this.revenueCheckInterval = null;
        this.godModeOptimizationInterval = null;

        // Dependencies initialized in .initialize()
        this.tokenomics = null;
        this.governance = null;
        console.log('🚧 BWAEZI Sovereign Revenue Engine Ready for Initialization');
    }

    async initialize() {
        if (this.initialized) {
            console.warn('⚠️ Engine already initialized.');
            return;
        }

        // Validate core dependency (It's now an injected instance, not a synchronously imported class)
        if (!this.sovereignCore) {
             throw new Error("Sovereign Core (AIGovernor) instance is required for initialization.");
        }

        // ⬇️ Instantiate Tokenomics (only requires DB)
        this.tokenomics = new SovereignTokenomics(this.db);
        await this.tokenomics.initialize();
        // CRITICAL FIX 2: Correctly instantiate SovereignGovernance by passing the DB and the sovereignCore (AIGovernor)
        this.governance = new SovereignGovernance(this.db, this.sovereignCore);
        await this.governance.initialize();

        // 💰 FIX: Initialize Wallet Connections. Wallet agent is now configured to read secure keys from process.env
        await initializeConnections();
        console.log('✅ Wallet Agents Initialized (SOVEREIGN_WALLET_PK loaded from environment)');

        // Start GOD MODE Optimization Cycle
        this.startGodMode();
        this.initialized = true;
        console.log('🚀 BWAEZI Sovereign Revenue Engine Initialized - GOD MODE ACTIVATED');
    }

    // 🆕 CRITICAL FEATURE: This method is called by Sovereign Core (Core is the caller, Engine is the callee)
    async finalizeCycle(optimizationCycle, performanceMetrics) {
        console.log(`💵 Revenue Engine finalizing cycle ${optimizationCycle}. Executing consolidation and governance.`);
        // Ensure this method delegates to the existing optimization logic
        await this.executeGodModeOptimization();
    }

    startGodMode() {
        if (this.godModeActive) return;

        console.log('✨ Starting GOD MODE Optimization Cycle...');
        this.godModeOptimizationInterval = setInterval(() => {
            this.executeGodModeOptimization().catch(error => {
                console.error('🛑 GOD MODE Optimization failed:', error);
            });
        }, this.config.godModeOptimizationInterval);
        this.godModeActive = true;
    }

    async executeGodModeOptimization() {
        // 1. Execute AI Governance (AIGOVERNOR decision-making)
        console.log('🔬 Executing AI Governance Cycle...');
        await this.governance.executeAIGovernance();

        // 2. Perform Revenue Consolidation
        console.log('💰 Triggering Revenue Consolidation...');
        await triggerRevenueConsolidation(this.sovereignCore);
        // 3. Run Tokenomics Adjustments
        console.log('📈 Running Tokenomics Adjustment Cycle...');
        await this.tokenomics.runAdjustmentCycle();

        this.emit('godModeCycleComplete', { timestamp: Date.now() });
    }

    // ... (rest of methods remain the same)
}

// Global production instance
let globalRevenueEngine = null;

export function getSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
    if (!globalRevenueEngine) {
        // ⬇️ Pass dependencies when creating the global instance
        globalRevenueEngine = new SovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance);
    }
    return globalRevenueEngine;
}

export async function initializeSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
    // ⬇️ Pass dependencies to the getter
    const engine = getSovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance);
    await engine.initialize();
    return engine;
}

export default SovereignRevenueEngine;
