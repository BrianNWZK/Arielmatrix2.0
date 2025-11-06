// modules/sovereign-revenue-engine.js - GOD MODE INTEGRATED (v19.0 - Decoupled Architecture)
// 💸 REVISED: DEPENDENCY DECOUPLING & ROBUST ORCHESTRATION

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

// 🚫 NOVEL FIX: Removed synchronous import of ProductionSovereignCore to break circular dependency.
import { 
    BWAEZI_CHAIN,
    TOKEN_CONVERSION_RATES,
    BWAEZI_SOVEREIGN_CONFIG,
    SOVEREIGN_SERVICES,
    getGlobalLogger 
} from '../config/global-config.js';

// Global singletons and initialization state
let globalRevenueEngine = null;
let initializationPromise = null;

class SovereignRevenueEngine extends EventEmitter {
    constructor(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
        super();
        this.config = config;
        this.sovereignCore = sovereignCoreInstance; // Will be passed/injected by main.js
        this.dbEngine = dbEngineInstance;
        this.logger = getGlobalLogger('RevenueEngine');
        this.initialized = false;
        this.godModeActive = false;
        this.walletAgents = [
            { name: 'ETH_Agent', fn: sendETH, isActive: false },
            { name: 'SOL_Agent', fn: sendSOL, isActive: false },
            { name: 'Bwaezi_Agent', fn: sendBwaezi, isActive: false },
            { name: 'USDT_Agent', fn: sendUSDT, isActive: false },
        ];
        
        // Modules that may or may not be available
        this.tokenomics = null;
        this.governance = null;
    }

    async initialize() {
        if (this.initialized) {
            this.logger.warn('⚠️ Revenue Engine already initialized.');
            return;
        }

        this.logger.info('🚀 Starting BWAEZI Sovereign Revenue Engine initialization...');

        // 1. CRITICAL WALLET/PAYOUT SYSTEM INITIALIZATION (MUST SUCCEED)
        try {
            await initializeConnections(this.config);
            this.logger.info('✅ Critical Wallet Payout System Initialized.');
        } catch (error) {
            this.logger.error('🛑 FATAL: Wallet Payout System failed to initialize.', { error: error.message });
            // 🔥 NOVELTY: THROW ERROR TO BE CAUGHT BY ORCHESTRATOR FOR GRACEFUL DEGRADATION
            throw new Error(`Wallet Payout System failed: ${error.message}`);
        }

        // 2. SOFT MODULE INITIALIZATION (Failure is Non-Fatal)
        try {
            this.tokenomics = new SovereignTokenomics(this.config, this.dbEngine);
            await this.tokenomics.initialize();
            this.logger.info('✅ Tokenomics Engine Ready.');
        } catch (error) {
            this.logger.error('❌ Tokenomics Engine failed (Non-Fatal), bypassing.', { error: error.message });
            this.tokenomics = null; // Mark as unavailable
        }

        try {
            this.governance = new SovereignGovernance(this.config, this.dbEngine);
            await this.governance.initialize();
            this.logger.info('✅ Governance Engine Ready.');
        } catch (error) {
            this.logger.error('❌ Governance Engine failed (Non-Fatal), bypassing.', { error: error.message });
            this.governance = null; // Mark as unavailable
        }

        this.initialized = true;
        this.godModeActive = true;
        this.logger.info('✅ BWAEZI Sovereign Revenue Engine operational - GOD MODE ACTIVATED');
        this.orchestrateRevenueAgents(); // Immediate activation of available agents
    }

    // 🆕 NOVEL EXECUTION: Orchestrates all revenue agents, bypassing failures.
    async orchestrateRevenueAgents(instructions = {}) {
        this.logger.info('🔥 ULTIMATE EXECUTION: Starting Revenue Agent Orchestration...');
        
        const results = [];
        for (const agent of this.walletAgents) {
            try {
                this.logger.info(`-- Attempting execution for Agent: ${agent.name}`);
                // 1. Check Pre-requisites (e.g., wallet health)
                const isHealthy = await checkBlockchainHealth(agent.name.split('_')[0]); // e.g., 'ETH'
                if (!isHealthy) {
                    throw new Error(`${agent.name} blockchain unhealthy.`);
                }

                // 2. Execute Agent's core revenue generation function (simulated call)
                const executionResult = await agent.fn({ instructions }); 
                
                // 3. Finalize payment using the core payment processing pipeline
                const paymentRecord = await processRevenuePayment(executionResult, agent.name);

                agent.isActive = true;
                this.logger.info(`✅ Agent ${agent.name} SUCCEEDED. Revenue generated: ${paymentRecord.amount} ${paymentRecord.currency}`);
                results.push({ name: agent.name, status: 'SUCCESS', details: paymentRecord });

            } catch (error) {
                // 🔥 CRITICAL: LOG AND MOVE ON (NEVER EXIT)
                this.logger.error(`🛑 Agent ${agent.name} FAILED: Bypassing and continuing to next agent.`, { error: error.message, stack: error.stack });
                agent.isActive = false;
                results.push({ name: agent.name, status: 'FAILED', error: error.message });
            }
        }

        this.logger.info(`📊 Orchestration complete. Results: ${JSON.stringify(results.map(r => ({ name: r.name, status: r.status })))}`);
        
        const activeAgents = this.walletAgents.filter(a => a.isActive).length;
        if (activeAgents === 0) {
            this.logger.error('🚨 All Revenue Agents Failed to Generate Revenue. Critical Logging Only.');
            // System continues running, logging failure for future fix.
        } else {
            this.logger.info(`⭐ Total Active Revenue Agents: ${activeAgents}. Revenue flow maintained.`);
        }
        
        return results;
    }


    async finalizeCycle(cycle, metrics) {
        // ... (existing logic for end-of-cycle reporting)
        if (this.tokenomics) {
            // Do tokenomics related finalization
        }
        this.logger.info(`💵 Revenue Cycle ${cycle} finalized. Performance Metrics: ${JSON.stringify(metrics)}`);
        
        // 🆕 NOVELTY: Trigger immediate revenue consolidation after every cycle finalization
        try {
            await triggerRevenueConsolidation(this.config.SOVEREIGN_WALLET);
            this.logger.info('💰 Revenue Consolidation Triggered successfully.');
        } catch (error) {
            this.logger.error('❌ Revenue Consolidation Failed.', { error: error.message });
        }
    }
    
    // ... (rest of the class methods, e.g., healthCheck, shutdown)
}


// =========================================================================
// PRODUCTION EXPORT AND INSTANCE MANAGEMENT - DECOUPLED
// =========================================================================

export function getSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
    if (!globalRevenueEngine) {
        globalRevenueEngine = new SovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance);
    }
    // Update core/db instances if they were passed later (Dependency Injection)
    if (sovereignCoreInstance) globalRevenueEngine.sovereignCore = sovereignCoreInstance;
    if (dbEngineInstance) globalRevenueEngine.dbEngine = dbEngineInstance;

    return globalRevenueEngine;
}

// 🆕 NOVELTY: Dedicated export for atomic, sequential initialization
export async function initializeSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
    if (!initializationPromise) {
        initializationPromise = (async () => {
            const engine = getSovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance);
            try {
                await engine.initialize();
                return engine;
            } catch (error) {
                // Reset promise on failure to allow retry
                initializationPromise = null;
                throw error;
            }
        })();
    }
    return initializationPromise;
}

export default SovereignRevenueEngine;
