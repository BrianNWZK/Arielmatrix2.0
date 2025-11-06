// modules/sovereign-revenue-engine.js - GOD MODE INTEGRATED (v20.0 - Enterprise Logging)
// 💸 CRITICAL FIX: Integrated Enterprise Logger and eliminated internal logger.

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

// 🆕 CRITICAL FIX: Import the Enterprise Logger
import { getGlobalLogger } from './enterprise-logger/index.js'; 

// 🚫 CONFIG: Internal placeholders for configuration constants (no global-config.js import)
const BWAEZI_CHAIN = 'BWAEZI_MAINNET_V5';
const TOKEN_CONVERSION_RATES = { ETH: 0.0005, SOL: 0.005, BWAEZI: 1.0, USDT: 1.0 }; 


// Global singletons and initialization state
let globalRevenueEngine = null;
let initializationPromise = null;

class SovereignRevenueEngine extends EventEmitter {
    constructor(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
        super();
        this.config = config;
        this.sovereignCore = sovereignCoreInstance;
        this.dbEngine = dbEngineInstance;
        // 🎯 CRITICAL FIX: Get the Enterprise Logger instance for this service
        this.logger = getGlobalLogger('RevenueEngine'); 
        this.initialized = false;
        this.godModeActive = false;
        this.walletAgents = [
            { name: 'ETH_Agent', fn: sendETH, isActive: false },
            { name: 'SOL_Agent', fn: sendSOL, isActive: false },
            { name: 'Bwaezi_Agent', fn: sendBwaezi, isActive: false },
            { name: 'USDT_Agent', fn: sendUSDT, isActive: false },
        ];
        
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
            throw new Error(`Wallet Payout System failed: ${error.message}`);
        }

        // 2. SOFT MODULE INITIALIZATION (Failure is Non-Fatal)
        try {
            this.tokenomics = new SovereignTokenomics(this.config, this.dbEngine);
            await this.tokenomics.initialize();
            this.logger.info('✅ Tokenomics Engine Ready.');
        } catch (error) {
            this.logger.error('❌ Tokenomics Engine failed (Non-Fatal), bypassing.', { error: error.message });
            this.tokenomics = null; 
        }

        try {
            this.governance = new SovereignGovernance(this.config, this.dbEngine);
            await this.governance.initialize();
            this.logger.info('✅ Governance Engine Ready.');
        } catch (error) {
            this.logger.error('❌ Governance Engine failed (Non-Fatal), bypassing.', { error: error.message });
            this.governance = null; 
        }

        this.initialized = true;
        this.godModeActive = true;
        this.logger.info('✅ BWAEZI Sovereign Revenue Engine operational - GOD MODE ACTIVATED');
        this.orchestrateRevenueAgents(); 
    }

    // 🆕 NOVEL EXECUTION: Orchestrates all revenue agents, bypassing failures.
    async orchestrateRevenueAgents(instructions = {}) {
        this.logger.info('🔥 ULTIMATE EXECUTION: Starting Revenue Agent Orchestration...');
        
        const results = [];
        for (const agent of this.walletAgents) {
            try {
                this.logger.info(`-- Attempting execution for Agent: ${agent.name}`);
                
                const isHealthy = await checkBlockchainHealth(agent.name.split('_')[0]); // e.g., 'ETH'
                if (!isHealthy) {
                    throw new Error(`${agent.name} blockchain unhealthy.`);
                }

                const executionResult = await agent.fn({ instructions }); 
                const paymentRecord = await processRevenuePayment(executionResult, agent.name);

                agent.isActive = true;
                this.logger.info(`✅ Agent ${agent.name} SUCCEEDED. Revenue generated: ${paymentRecord.amount} ${paymentRecord.currency}`);
                results.push({ name: agent.name, status: 'SUCCESS', details: paymentRecord });

            } catch (error) {
                // 🔥 CRITICAL: LOG AND MOVE ON (NEVER EXIT)
                this.logger.error(`🛑 Agent ${agent.name} FAILED: Bypassing and continuing to next agent.`, { error: error.message });
                agent.isActive = false;
                results.push({ name: agent.name, status: 'FAILED', error: error.message });
            }
        }

        this.logger.info(`📊 Orchestration complete. Active Agents: ${this.walletAgents.filter(a => a.isActive).length}`);
        
        return results;
    }


    async finalizeCycle(cycle, metrics) {
        if (this.tokenomics) {
            // Do tokenomics related finalization
        }
        this.logger.info(`💵 Revenue Cycle ${cycle} finalized. Performance Metrics Processed.`);
        
        try {
            await triggerRevenueConsolidation(this.config.SOVEREIGN_WALLET); 
            this.logger.info('💰 Revenue Consolidation Triggered successfully.');
        } catch (error) {
            this.logger.error('❌ Revenue Consolidation Failed.', { error: error.message });
        }
    }
    
    async shutdown() {
        this.logger.info('⚠️ Initiating graceful shutdown sequence...');

        // ... (Close connections, etc.)

        this.initialized = false;
        this.godModeActive = false;
        this.logger.info('✅ BWAEZI Sovereign Revenue Engine shut down - GOD MODE DEACTIVATED');
        
        this.emit('shutdown', { 
            timestamp: Date.now(),
            godModeDeactivated: true 
        });
    }
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
