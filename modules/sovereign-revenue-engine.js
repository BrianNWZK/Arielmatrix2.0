// modules/sovereign-revenue-engine.js - GOD MODE INTEGRATED (v18.1) - FIXED
// 💸 REVISED: DEPENDENCY INJECTION & IPC COMPATIBLE WITH HEALTH CHECKS

import { EventEmitter } from 'events';
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

import { ProductionSovereignCore } from '../core/sovereign-brain.js';

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
// PRODUCTION-READY SOVEREIGN REVENUE ENGINE - GOD MODE ACTIVATED (FIXED)
// =========================================================================
export class SovereignRevenueEngine extends EventEmitter {
    
    constructor(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) { 
        super();
        this.config = {
            revenueCheckInterval: 5000, 
            godModeOptimizationInterval: 300000,
            ...config
        };

        this.sovereignCore = sovereignCoreInstance;
        this.db = dbEngineInstance;

        this.initialized = false;
        this.godModeActive = false;
        this.revenueCheckInterval = null;
        this.godModeOptimizationInterval = null;
        this.healthStatus = 'initializing';
        this.lastHealthCheck = Date.now();

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

        // 🆕 ENHANCED VALIDATION WITH DETAILED ERROR MESSAGES
        if (!this.sovereignCore) {
            const error = new Error("Sovereign Core (AIGovernor) instance is required for initialization.");
            error.code = 'MISSING_CORE_DEPENDENCY';
            throw error;
        }

        if (!this.db) {
            const error = new Error("Database engine instance is required for initialization.");
            error.code = 'MISSING_DB_DEPENDENCY';
            throw error;
        }

        // 🆕 VALIDATE CORE READINESS
        if (typeof this.sovereignCore.initialize !== 'function') {
            const error = new Error("Invalid Sovereign Core instance: missing initialize method");
            error.code = 'INVALID_CORE_INSTANCE';
            throw error;
        }

        try {
            console.log('📦 Initializing Tokenomics Engine...');
            this.tokenomics = new SovereignTokenomics(this.db);
            await this.tokenomics.initialize();
            
            console.log('🏛️ Initializing Governance Engine...');
            this.governance = new SovereignGovernance(this.db, this.sovereignCore); 
            await this.governance.initialize();

            console.log('💰 Initializing Wallet Connections...');
            await initializeConnections();
            console.log('✅ Wallet Agents Initialized (SOVEREIGN_WALLET_PK loaded from environment)');

            // 🆕 HEALTH STATUS UPDATE
            this.healthStatus = 'healthy';
            this.lastHealthCheck = Date.now();

            // Start GOD MODE Optimization Cycle
            this.startGodMode();

            this.initialized = true;
            console.log('🚀 BWAEZI Sovereign Revenue Engine Initialized - GOD MODE ACTIVATED');

            this.emit('initialized', { 
                timestamp: Date.now(),
                healthStatus: this.healthStatus
            });

        } catch (error) {
            this.healthStatus = 'degraded';
            console.error('❌ Revenue Engine initialization failed:', error.message);
            
            // 🆕 GRACEFUL DEGRADATION - Don't throw, but mark as degraded
            this.initialized = false;
            this.emit('initialization_failed', { 
                error: error.message,
                timestamp: Date.now()
            });
            
            throw error; // Re-throw for caller to handle
        }
    }

    startGodMode() {
        if (this.godModeActive) return;

        console.log('✨ Starting GOD MODE Optimization Cycle...');
        this.godModeOptimizationInterval = setInterval(() => {
            this.executeGodModeOptimization().catch(error => {
                console.error('🛑 GOD MODE Optimization failed:', error);
                this.healthStatus = 'degraded';
            });
        }, this.config.godModeOptimizationInterval);
        
        this.godModeActive = true;
        this.emit('godModeActivated', { timestamp: Date.now() });
    }

    async executeGodModeOptimization() {
        // 🆕 HEALTH CHECK BEFORE EXECUTION
        if (this.healthStatus === 'degraded') {
            console.warn('⚠️ Skipping GOD MODE cycle due to degraded health');
            return;
        }

        try {
            // 1. Execute AI Governance (AIGOVERNOR decision-making)
            console.log('🔬 Executing AI Governance Cycle...');
            if (this.governance && this.governance.executeAIGovernance) {
                await this.governance.executeAIGovernance();
            }

            // 2. Perform Revenue Consolidation
            console.log('💰 Triggering Revenue Consolidation...');
            await triggerRevenueConsolidation(this.sovereignCore); 

            // 3. Run Tokenomics Adjustments
            console.log('📈 Running Tokenomics Adjustment Cycle...');
            if (this.tokenomics && this.tokenomics.runAdjustmentCycle) {
                await this.tokenomics.runAdjustmentCycle();
            }

            this.lastHealthCheck = Date.now();
            this.emit('godModeCycleComplete', { 
                timestamp: Date.now(),
                healthStatus: this.healthStatus
            });

        } catch (error) {
            console.error('🛑 GOD MODE cycle execution failed:', error);
            this.healthStatus = 'degraded';
            this.emit('godModeCycleFailed', { 
                error: error.message,
                timestamp: Date.now()
            });
        }
    }

    // 🆕 HEALTH CHECK METHOD
    async healthCheck() {
        const health = {
            status: this.healthStatus,
            initialized: this.initialized,
            godModeActive: this.godModeActive,
            lastHealthCheck: this.lastHealthCheck,
            timestamp: Date.now(),
            dependencies: {
                sovereignCore: !!this.sovereignCore,
                database: !!this.db,
                tokenomics: !!this.tokenomics,
                governance: !!this.governance
            }
        };

        // Update health status based on current state
        if (!this.initialized) {
            health.status = 'initializing';
        } else if (Date.now() - this.lastHealthCheck > 60000) {
            health.status = 'stale';
        }

        return health;
    }

    // New method for handling incoming revenue (e.g., from an API endpoint)
    async handleIncomingRevenue(amount, token, sourceAddress) {
        if (!this.initialized) {
            throw new Error('Engine not initialized.');
        }

        if (this.healthStatus === 'degraded') {
            throw new Error('Engine is in degraded state, cannot process revenue');
        }

        const transactionId = createHash('sha256').update(String(Date.now())).digest('hex');
        
        try {
            // 1. Process payment via wallet agents
            const paymentResult = await processRevenuePayment({
                amount, 
                token, 
                sourceAddress,
                destinationAddress: BWAEZI_CHAIN.FOUNDER_ADDRESS
            });

            // 2. Log and trigger tokenomics/governance reaction
            if (paymentResult.success) {
                console.log(`💵 Revenue received: ${amount} ${token}. Tx: ${paymentResult.txHash}`);
                await this.tokenomics.recordRevenue(amount, token, sourceAddress, paymentResult.txHash);
                
                // AI Governor's real-time analysis
                if (this.sovereignCore && this.sovereignCore.analyzeRevenue) {
                    this.sovereignCore.analyzeRevenue({ amount, token });
                }

                this.emit('revenueProcessed', {
                    amount,
                    token,
                    transactionId,
                    timestamp: Date.now()
                });
            }

            return paymentResult;
        } catch (error) {
            console.error('❌ Revenue processing failed:', error);
            this.emit('revenueProcessingFailed', {
                error: error.message,
                amount,
                token,
                timestamp: Date.now()
            });
            throw error;
        }
    }

    // 🆕 GRACEFUL DEGRADATION SUPPORT
    async safeShutdown() {
        console.log('🛑 Initiating safe shutdown of Revenue Engine...');
        
        // Stop intervals first
        if (this.godModeOptimizationInterval) {
            clearInterval(this.godModeOptimizationInterval);
        }
        if (this.revenueCheckInterval) {
            clearInterval(this.revenueCheckInterval);
        }
        
        this.godModeActive = false;
        this.healthStatus = 'shutting_down';
        
        this.emit('shutdownInitiated', { timestamp: Date.now() });
    }

    async shutdown() {
        await this.safeShutdown();
        
        console.log('🛑 Initiating BWAEZI Sovereign Revenue Engine shutdown...');
        
        // Close database connection if we own it
        if (this.db && typeof this.db.close === 'function' && this.ownsDbConnection) {
            await this.db.close();
        }
        
        // Shutdown governance and tokenomics
        if (this.governance && typeof this.governance.shutdown === 'function') {
            await this.governance.shutdown();
        }
        if (this.tokenomics && typeof this.tokenomics.shutdown === 'function') {
            await this.tokenomics.shutdown();
        }
        
        // 🔥 SHUTDOWN SOVEREIGN CORE (AIGOVERNOR) - Only if we own it
        if (this.sovereignCore && this.sovereignCore.emergencyShutdown && this.ownsSovereignCore) {
            await this.sovereignCore.emergencyShutdown();
        }
        
        this.initialized = false;
        this.godModeActive = false;
        this.healthStatus = 'shutdown';
        console.log('✅ BWAEZI Sovereign Revenue Engine shut down - GOD MODE DEACTIVATED');
        
        this.emit('shutdown', { 
            timestamp: Date.now(),
            godModeDeactivated: true 
        });
    }
}

// =========================================================================
// PRODUCTION EXPORT AND INSTANCE MANAGEMENT - GOD MODE READY (FIXED)
// =========================================================================

// Global production instance with enhanced management
let globalRevenueEngine = null;
let initializationPromise = null;

export function getSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
    if (!globalRevenueEngine) {
        globalRevenueEngine = new SovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance);
    }
    return globalRevenueEngine;
}

export async function initializeSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) {
    // 🆕 PREVENT MULTIPLE SIMULTANEOUS INITIALIZATIONS
    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        try {
            const engine = getSovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance);
            
            // 🆕 VALIDATE DEPENDENCIES BEFORE INITIALIZATION
            if (!sovereignCoreInstance) {
                throw new Error("Sovereign Core instance must be provided for initialization");
            }

            if (!dbEngineInstance) {
                throw new Error("Database engine instance must be provided for initialization");
            }

            await engine.initialize();
            return engine;
        } catch (error) {
            // Reset promise on failure to allow retry
            initializationPromise = null;
            throw error;
        }
    })();

    return initializationPromise;
}

// 🆕 HEALTH CHECK EXPORT
export async function getRevenueEngineHealth() {
    if (!globalRevenueEngine) {
        return { status: 'not_initialized', timestamp: Date.now() };
    }
    return await globalRevenueEngine.healthCheck();
}

// 🆕 GRACEFUL SHUTDOWN EXPORT
export async function shutdownRevenueEngine() {
    if (globalRevenueEngine) {
        await globalRevenueEngine.shutdown();
        globalRevenueEngine = null;
        initializationPromise = null;
    }
}

export default SovereignRevenueEngine;
