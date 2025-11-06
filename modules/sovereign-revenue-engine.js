// modules/sovereign-revenue-engine.js - GOD MODE INTEGRATED (v18.1)
// 🔥 NOVELTY: CIRCULAR DEPENDENCY FREE

import { EventEmitter } from 'events';
// 🚫 REMOVED: ProductionSovereignCore import - breaking circular dependency
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
    
    // 🔥 NOVELTY: Constructor accepts sovereignCore but doesn't depend on its type
    constructor(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) { 
        super();
        this.config = {
            revenueCheckInterval: 5000, 
            godModeOptimizationInterval: 300000,
            ...config
        };

        this.sovereignCore = sovereignCoreInstance; // Can be null initially
        this.db = dbEngineInstance;

        this.initialized = false;
        this.godModeActive = false;
        this.revenueCheckInterval = null;
        this.godModeOptimizationInterval = null;

        this.tokenomics = null;
        this.governance = null;

        console.log('🚧 BWAEZI Sovereign Revenue Engine Ready for Initialization');
    }

    async initialize() {
        if (this.initialized) {
            console.warn('⚠️ Engine already initialized.');
            return;
        }

        // 🔥 NOVELTY: Validate but don't require sovereignCore for basic initialization
        if (!this.sovereignCore) {
            console.warn('⚠️ Sovereign Core not provided. Some features may be limited.');
        }

        // Initialize Tokenomics (only requires DB)
        this.tokenomics = new SovereignTokenomics(this.db);
        await this.tokenomics.initialize();
        
        // 🔥 NOVELTY: Safe governance initialization
        try {
            this.governance = new SovereignGovernance(this.db, this.sovereignCore); 
            await this.governance.initialize();
        } catch (govError) {
            console.warn('⚠️ Governance initialization limited:', govError.message);
            this.governance = null;
        }

        // Initialize Wallet Connections
        await initializeConnections();
        console.log('✅ Wallet Agents Initialized (SOVEREIGN_WALLET_PK loaded from environment)');

        // Start GOD MODE only if sovereignCore is available
        if (this.sovereignCore) {
            this.startGodMode();
        }

        this.initialized = true;
        console.log('🚀 BWAEZI Sovereign Revenue Engine Initialized');
    }

    startGodMode() {
        if (this.godModeActive || !this.sovereignCore) return;

        console.log('✨ Starting GOD MODE Optimization Cycle...');
        this.godModeOptimizationInterval = setInterval(() => {
            this.executeGodModeOptimization().catch(error => {
                console.error('🛑 GOD MODE Optimization failed:', error);
            });
        }, this.config.godModeOptimizationInterval);
        
        this.godModeActive = true;
    }

    async executeGodModeOptimization() {
        if (!this.sovereignCore) {
            console.warn('⚠️ GOD MODE: Sovereign Core not available');
            return;
        }

        // 1. Execute AI Governance (if available)
        if (this.governance && this.governance.executeAIGovernance) {
            console.log('🔬 Executing AI Governance Cycle...');
            await this.governance.executeAIGovernance();
        }

        // 2. Perform Revenue Consolidation
        console.log('💰 Triggering Revenue Consolidation...');
        await triggerRevenueConsolidation(this.sovereignCore); 

        // 3. Run Tokenomics Adjustments
        console.log('📈 Running Tokenomics Adjustment Cycle...');
        await this.tokenomics.runAdjustmentCycle();

        this.emit('godModeCycleComplete', { timestamp: Date.now() });
    }

    // Revenue handling works independently
    async handleIncomingRevenue(amount, token, sourceAddress) {
        if (!this.initialized) throw new Error('Engine not initialized.');

        const transactionId = createHash('sha256').update(String(Date.now())).digest('hex');
        
        // Process payment via wallet agents
        const paymentResult = await processRevenuePayment({
            amount, 
            token, 
            sourceAddress,
            destinationAddress: BWAEZI_CHAIN.FOUNDER_ADDRESS
        });

        if (paymentResult.success) {
            console.log(`💵 Revenue received: ${amount} ${token}. Tx: ${paymentResult.txHash}`);
            await this.tokenomics.recordRevenue(amount, token, sourceAddress, paymentResult.txHash);
            
            // Notify sovereign core if available
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
        
        this.initialized = false;
        this.godModeActive = false;
        console.log('✅ BWAEZI Sovereign Revenue Engine shut down');
        
        this.emit('shutdown', { 
            timestamp: Date.now(),
            godModeDeactivated: true 
        });
    }
}

// =========================================================================
// PRODUCTION EXPORT AND INSTANCE MANAGEMENT - CIRCULAR DEPENDENCY FREE
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

export default SovereignRevenueEngine;
