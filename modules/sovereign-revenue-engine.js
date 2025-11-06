// modules/sovereign-revenue-engine.js - GOD MODE INTEGRATED (v18.2 - FINAL DECOUPLING)
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

// ❌ CRITICAL FIX: The synchronous import of ProductionSovereignCore has been REMOVED 
// to prevent the circular dependency. The AIGovernor is now ONLY known through instance injection.
// import { ProductionSovereignCore } from '../core/sovereign-brain.js'; 

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
    
    // CRITICAL FIX 1: Constructor updated to accept and store the AIGovernor (sovereignCoreInstance) and DB instance
    constructor(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) { 
        super();
        this.config = {
            // These are placeholder;
            // ✅ SYNTAX FIX: This line is now correctly commented out to fix the SyntaxError.
            // production config should be in BWAEZI_SOVEREIGN_CONFIG
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

        // Validate core dependency
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

    // New method for handling incoming revenue (e.g., from an API endpoint)
    async handleIncomingRevenue(amount, token, sourceAddress) {
        if (!this.initialized) throw new Error('Engine not initialized.');
        const transactionId = createHash('sha256').update(String(Date.now())).digest('hex');
        
        // 1. Process payment via wallet agents
        const paymentResult = await processRevenuePayment({
            amount, 
            token, 
            sourceAddress,
            destinationAddress: BWAEZI_CHAIN.FOUNDER_ADDRESS // Assumes founder address is the revenue sink
        });
        // 2. Log and trigger tokenomics/governance reaction
        if (paymentResult.success) {
            console.log(`💵 Revenue received: ${amount} ${token}. Tx: ${paymentResult.txHash}`);
            await this.tokenomics.recordRevenue(amount, token, sourceAddress, paymentResult.txHash);
            
            // AI Governor's real-time analysis
            if (this.sovereignCore && this.sovereignCore.analyzeRevenue) {
                this.sovereignCore.analyzeRevenue({ amount, token });
            }
        }

        return paymentResult;
    }

    async shutdown() {
        console.log('🛑 Initiating BWAEZI Sovereign Revenue Engine shutdown...');
        if (this.godModeOptimizationInterval) {
            clearInterval(this.godModeOptimizationInterval);
        }
        
        // Close database connection
        if (this.db && typeof this.db.close === 'function') await this.db.close();
        // Shutdown governance and tokenomics
        if (this.governance && typeof this.governance.shutdown === 'function') await this.governance.shutdown();
        if (this.tokenomics && typeof this.tokenomics.shutdown === 'function') await this.tokenomics.shutdown();
        
        // 🔥 SHUTDOWN SOVEREIGN CORE (AIGOVERNOR)
        if (this.sovereignCore && this.sovereignCore.emergencyShutdown) {
            await this.sovereignCore.emergencyShutdown();
            }
        
        this.initialized = false;
        this.godModeActive = false;
        console.log('✅ BWAEZI Sovereign Revenue Engine shut down - GOD MODE DEACTIVATED');
        
        this.emit('shutdown', { 
            timestamp: Date.now(),
            godModeDeactivated: true 
        });
    }
}

// =========================================================================
// PRODUCTION EXPORT AND INSTANCE MANAGEMENT - GOD MODE READY
// =========================================================================

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
