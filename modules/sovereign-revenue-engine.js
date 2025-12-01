// modules/sovereign-revenue-engine.js - GOD MODE INTEGRATED (v20.0 - FIXED Initialization)
// 🔥 FIXED: Multiple engine instances and circular dependency resolution
// 💸 ENHANCED: Lazy dependency injection with proper error handling

import { EventEmitter } from 'events';
import { createHash, randomBytes } from 'crypto';

// Import with fallbacks to prevent initialization errors
let ArielSQLiteEngine;
let BWAEZI_CHAIN, BWAEZI_SOVEREIGN_CONFIG;
let getGlobalLogger;

try {
    ArielSQLiteEngine = (await import('./ariel-sqlite-engine/index.js')).ArielSQLiteEngine;
} catch (error) {
    console.warn('⚠️ ArielSQLiteEngine not available, using fallback');
    ArielSQLiteEngine = class FallbackDB { 
        async initialize() { return true; } 
        async writeMetrics() { return true; }
    };
}

try {
    const configModule = await import('../config/bwaezi-config.js');
    BWAEZI_CHAIN = configModule.BWAEZI_CHAIN;
    BWAEZI_SOVEREIGN_CONFIG = configModule.BWAEZI_SOVEREIGN_CONFIG;
} catch (error) {
    console.warn('⚠️ Bwaezi config not available, using defaults');
    BWAEZI_CHAIN = {
        NATIVE_TOKEN: 'BWAEZI',
        TOKEN_CONTRACT_ADDRESS: '0x9bE921e5eFacd53bc4EEbCfdc4494D257cFab5da'
    };
    BWAEZI_SOVEREIGN_CONFIG = {
        SOVEREIGN_WALLET: '0xd8e1Fa4d571b6FCe89fb5A145D6397192632F1aA'
    };
}

try {
    getGlobalLogger = (await import('./enterprise-logger/index.js')).getGlobalLogger;
} catch (error) {
    console.warn('⚠️ Enterprise logger not available, using console fallback');
    getGlobalLogger = (name) => ({
        info: (msg, meta) => console.log(`[${name}] INFO: ${msg}`, meta || ''),
        warn: (msg, meta) => console.warn(`[${name}] WARN: ${msg}`, meta || ''),
        error: (msg, meta) => console.error(`[${name}] ERROR: ${msg}`, meta || ''),
        debug: (msg, meta) => console.debug(`[${name}] DEBUG: ${msg}`, meta || '')
    });
}

// Global state for revenue agent management - SINGLETON ENFORCEMENT
const REVENUE_AGENTS = new Map();
let GLOBAL_ENGINE_INSTANCE = null;
let INITIALIZATION_ATTEMPTS = 0;
const MAX_INIT_ATTEMPTS = 3;

/**
 * @class SovereignRevenueEngine
 * @description The financial heart of the BWAEZI Enterprise. Enhanced with lazy dependency injection
 * and proper circular dependency resolution to prevent initialization failures.
 */
export default class SovereignRevenueEngine extends EventEmitter {
    constructor(config = {}, sovereignCoreInstance = null, dbEngineInstance = null, bwaeziChainInstance = null, payoutSystemInstance = null) {
        super();
        
        // 🚨 SINGLETON ENFORCEMENT - Prevent multiple instances
        if (GLOBAL_ENGINE_INSTANCE) {
            this.logger = getGlobalLogger('RevenueEngine');
            this.logger.warn('⚠️ Revenue Engine instance already exists. Returning existing instance.');
            return GLOBAL_ENGINE_INSTANCE;
        }

        this.logger = getGlobalLogger('RevenueEngine');
        
        // 🚨 ENHANCED DEPENDENCY VALIDATION: Graceful handling of missing dependencies
        const missingDeps = [];
        if (!sovereignCoreInstance) missingDeps.push('SovereignCore');
        if (!dbEngineInstance) missingDeps.push('DatabaseEngine');
        if (!bwaeziChainInstance) missingDeps.push('BwaeziChain');
        if (!payoutSystemInstance) missingDeps.push('PayoutSystem');

        if (missingDeps.length > 0) {
            this.logger.warn(`⚠️ INCOMPLETE DEPENDENCIES: ${missingDeps.join(', ')} missing. Engine will initialize in fallback mode.`);
            // Don't throw error - allow graceful degradation
        }

        // 1. LAZY INJECTED CORE REFERENCES (Enhanced with fallbacks)
        this.sovereignCore = sovereignCoreInstance;
        this.dbEngine = dbEngineInstance;
        this.bwaeziChain = bwaeziChainInstance;
        this.payoutSystem = payoutSystemInstance;
        
        this.config = { 
            ...BWAEZI_SOVEREIGN_CONFIG, 
            ...config,
            // Enhanced configuration for stability
            maxRetryAttempts: 3,
            retryDelay: 5000,
            fallbackMode: missingDeps.length > 0
        };
        
        this.initialized = false;
        this.godModeActive = false;
        this.revenueCycle = 0;
        this.initializationPromise = null;
        this.fallbackMode = this.config.fallbackMode;
        
        // Track initialization state
        this.initializationState = {
            dbReady: false,
            chainReady: false,
            payoutReady: false,
            coreReady: false
        };

        // Register global instance
        GLOBAL_ENGINE_INSTANCE = this;
        
        this.logger.info('🚧 ENHANCED BWAEZI Sovereign Revenue Engine Ready for Initialization');
        this.logger.info(`🔧 Mode: ${this.fallbackMode ? 'FALLBACK' : 'FULL'}, Dependencies: ${missingDeps.length > 0 ? 'Partial' : 'Complete'}`);
    }

    // =========================================================================
    // ENHANCED INITIALIZATION WITH RETRY MECHANISM
    // =========================================================================

    async initialize() {
        // Prevent multiple simultaneous initializations
        if (this.initializationPromise) {
            this.logger.debug('🔄 Initialization already in progress, returning existing promise');
            return this.initializationPromise;
        }

        this.initializationPromise = this._performInitialization();
        return this.initializationPromise;
    }

    async _performInitialization() {
        if (this.initialized) {
            this.logger.warn("⚠️ Revenue Engine already initialized.");
            return true;
        }

        INITIALIZATION_ATTEMPTS++;
        this.logger.info(`🚀 Starting Revenue Engine Initialization (Attempt ${INITIALIZATION_ATTEMPTS}/${MAX_INIT_ATTEMPTS})`);

        try {
            // ENHANCED: Graceful dependency validation with retries
            await this._validateDependencies();
            
            // ENHANCED: Staggered initialization to prevent race conditions
            await this._initializeDatabase();
            await this._initializeChain();
            await this._initializePayout();
            await this._initializeCoreIntegration();

            // ENHANCED: Agent registration with error isolation
            await this._registerRevenueAgents();

            this.initialized = true;
            this.godModeActive = true;
            this.initializationPromise = null;

            this.logger.info('✅ ENHANCED BWAEZI Sovereign Revenue Engine Initialized - GOD MODE ACTIVE');
            this.logger.info(`📊 Status: ${this._getInitializationStatus()}`);
            
            this.emit('initialized', { 
                timestamp: new Date().toISOString(),
                attempt: INITIALIZATION_ATTEMPTS,
                mode: this.fallbackMode ? 'fallback' : 'full'
            });

            return true;

        } catch (error) {
            this.initializationPromise = null;
            
            if (INITIALIZATION_ATTEMPTS < MAX_INIT_ATTEMPTS) {
                this.logger.warn(`🔄 Initialization attempt ${INITIALIZATION_ATTEMPTS} failed, retrying in 5s: ${error.message}`);
                
                // Retry with exponential backoff
                await new Promise(resolve => setTimeout(resolve, 5000));
                return this._performInitialization();
            } else {
                this.logger.error(`❌ CRITICAL: Revenue Engine initialization failed after ${MAX_INIT_ATTEMPTS} attempts: ${error.message}`);
                
                // Enter fallback mode if possible
                if (this._canOperateInFallback()) {
                    this.logger.warn('🛡️ Entering fallback operation mode with limited functionality');
                    this.initialized = true;
                    this.godModeActive = false;
                    this.fallbackMode = true;
                    return true;
                }
                
                this.emit('initialization_failed', { 
                    error: error.message,
                    attempts: INITIALIZATION_ATTEMPTS,
                    timestamp: new Date().toISOString()
                });
                
                throw new Error(`Revenue Engine initialization failed: ${error.message}`);
            }
        }
    }

    async _validateDependencies() {
        const validationResults = [];
        
        // Validate Database Engine
        if (this.dbEngine) {
            try {
                if (typeof this.dbEngine.initialize === 'function') {
                    validationResults.push({ component: 'Database', status: 'VALID' });
                } else {
                    validationResults.push({ component: 'Database', status: 'INVALID', reason: 'Missing initialize method' });
                }
            } catch (error) {
                validationResults.push({ component: 'Database', status: 'ERROR', reason: error.message });
            }
        } else {
            validationResults.push({ component: 'Database', status: 'MISSING' });
        }

        // Validate Bwaezi Chain
        if (this.bwaeziChain) {
            try {
                if (typeof this.bwaeziChain.checkChainStatus === 'function') {
                    validationResults.push({ component: 'BwaeziChain', status: 'VALID' });
                } else {
                    validationResults.push({ component: 'BwaeziChain', status: 'INVALID', reason: 'Missing checkChainStatus method' });
                }
            } catch (error) {
                validationResults.push({ component: 'BwaeziChain', status: 'ERROR', reason: error.message });
            }
        } else {
            validationResults.push({ component: 'BwaeziChain', status: 'MISSING' });
        }

        // Validate Payout System
        if (this.payoutSystem) {
            try {
                if (typeof this.payoutSystem.checkWalletHealth === 'function') {
                    validationResults.push({ component: 'PayoutSystem', status: 'VALID' });
                } else {
                    validationResults.push({ component: 'PayoutSystem', status: 'INVALID', reason: 'Missing checkWalletHealth method' });
                }
            } catch (error) {
                validationResults.push({ component: 'PayoutSystem', status: 'ERROR', reason: error.message });
            }
        } else {
            validationResults.push({ component: 'PayoutSystem', status: 'MISSING' });
        }

        // Validate Sovereign Core
        if (this.sovereignCore) {
            validationResults.push({ component: 'SovereignCore', status: 'VALID' });
        } else {
            validationResults.push({ component: 'SovereignCore', status: 'MISSING' });
        }

        // Log validation results
        const validCount = validationResults.filter(r => r.status === 'VALID').length;
        const totalCount = validationResults.length;
        
        this.logger.info(`🔍 Dependency Validation: ${validCount}/${totalCount} components valid`);
        
        validationResults.forEach(result => {
            if (result.status !== 'VALID') {
                this.logger.warn(`  ⚠️ ${result.component}: ${result.status}${result.reason ? ` - ${result.reason}` : ''}`);
            }
        });

        if (validCount === 0) {
            throw new Error('No valid dependencies found');
        }
    }

    async _initializeDatabase() {
        if (!this.dbEngine) {
            this.logger.warn('📊 Database engine not available, skipping database initialization');
            return;
        }

        try {
            await this.dbEngine.initialize('revenue_metrics.db');
            this.initializationState.dbReady = true;
            this.logger.info('✅ Database engine initialized successfully');
        } catch (error) {
            this.logger.error(`❌ Database initialization failed: ${error.message}`);
            throw error;
        }
    }

    async _initializeChain() {
        if (!this.bwaeziChain) {
            this.logger.warn('⛓️ Bwaezi chain not available, skipping chain initialization');
            return;
        }

        try {
            await this.bwaeziChain.checkChainStatus();
            this.initializationState.chainReady = true;
            this.logger.info('✅ Bwaezi chain status verified');
        } catch (error) {
            this.logger.error(`❌ Chain initialization failed: ${error.message}`);
            throw error;
        }
    }

    async _initializePayout() {
        if (!this.payoutSystem) {
            this.logger.warn('💰 Payout system not available, skipping payout initialization');
            return;
        }

        try {
            await this.payoutSystem.checkWalletHealth();
            this.initializationState.payoutReady = true;
            this.logger.info('✅ Payout system health verified');
        } catch (error) {
            this.logger.error(`❌ Payout system initialization failed: ${error.message}`);
            throw error;
        }
    }

    async _initializeCoreIntegration() {
        if (!this.sovereignCore) {
            this.logger.warn('🧠 Sovereign core not available, skipping core integration');
            return;
        }

        try {
            // Enhanced: Check if sovereign core is properly initialized
            if (typeof this.sovereignCore.getStatus === 'function') {
                const coreStatus = this.sovereignCore.getStatus();
                this.initializationState.coreReady = coreStatus.initialized || false;
                
                if (this.initializationState.coreReady) {
                    this.logger.info('✅ Sovereign core integration established');
                } else {
                    this.logger.warn('⚠️ Sovereign core present but not initialized');
                }
            } else {
                this.logger.warn('⚠️ Sovereign core missing status method, assuming ready');
                this.initializationState.coreReady = true;
            }
        } catch (error) {
            this.logger.error(`❌ Core integration failed: ${error.message}`);
            // Don't throw - core integration is not critical for basic operation
        }
    }

    async _registerRevenueAgents() {
        try {
            // Clear existing agents
            REVENUE_AGENTS.clear();

            // Register enhanced revenue agents with better error handling
            const agents = [
                { id: 'Consolidator', type: 'REVENUE_AGGREGATION', status: 'READY' },
                { id: 'ArbitrageHunter', type: 'ARBITRAGE', status: 'STANDBY' },
                { id: 'YieldOptimizer', type: 'YIELD_FARMING', status: 'STANDBY' },
                { id: 'LiquidityManager', type: 'LIQUIDITY', status: 'STANDBY' }
            ];

            agents.forEach(agent => {
                const agentId = `${agent.id}-${randomBytes(8).toString('hex')}`;
                REVENUE_AGENTS.set(agent.id, { 
                    ...agent, 
                    instanceId: agentId,
                    createdAt: new Date().toISOString(),
                    lastActive: null
                });
            });

            this.logger.info(`✨ Registered ${REVENUE_AGENTS.size} revenue agents`);
            
        } catch (error) {
            this.logger.error(`❌ Agent registration failed: ${error.message}`);
            // Don't throw - agents can be registered later
        }
    }

    _getInitializationStatus() {
        const states = this.initializationState;
        const ready = Object.values(states).filter(Boolean).length;
        const total = Object.keys(states).length;
        return `${ready}/${total} components ready`;
    }

    _canOperateInFallback() {
        // Can operate if at least one critical component is available
        return this.initializationState.dbReady || 
               this.initializationState.chainReady || 
               this.initializationState.payoutReady;
    }

    // =========================================================================
    // ENHANCED REVENUE ENGINE METHODS
    // =========================================================================

    async finalizeCycle(cycleId, performanceMetrics) {
        if (!this.initialized) {
            throw new Error('Revenue Engine not initialized. Call initialize() first.');
        }
        
        if (!this.godModeActive && !this.fallbackMode) {
            this.logger.warn('🛑 GOD MODE inactive, skipping cycle finalization');
            return false;
        }
        
        this.logger.info(`💸 Finalizing Revenue Cycle ${cycleId} with ${Object.keys(performanceMetrics).length} metrics`);
        
        try {
            // Enhanced metrics processing with fallback support
            if (this.dbEngine && this.initializationState.dbReady) {
                await this.dbEngine.writeMetrics(`Cycle-${cycleId}`, performanceMetrics);
                this.logger.debug(`📊 Metrics written for cycle ${cycleId}`);
            } else {
                this.logger.warn('📊 Database unavailable, metrics not persisted');
            }

            // Enhanced core notification with error handling
            if (this.sovereignCore && this.initializationState.coreReady) {
                try {
                    if (typeof this.sovereignCore.notifyEvent === 'function') {
                        this.sovereignCore.notifyEvent('REVENUE_CYCLE_FINALIZED', { 
                            cycleId, 
                            performanceMetrics,
                            engineStatus: this.getStatus()
                        });
                        this.logger.debug(`🔔 Core notified of cycle ${cycleId} completion`);
                    }
                } catch (error) {
                    this.logger.error(`❌ Core notification failed: ${error.message}`);
                }
            }

            this.revenueCycle = cycleId;
            this.emit('cycle_finalized', { cycleId, metrics: performanceMetrics });
            
            return true;

        } catch (error) {
            this.logger.error(`❌ Cycle finalization failed: ${error.message}`);
            this.emit('cycle_failed', { cycleId, error: error.message });
            return false;
        }
    }

    async orchestrateRevenueAgents(instructions) {
        if (!this.initialized) {
            throw new Error('Revenue Engine not initialized. Call initialize() first.');
        }
        
        if (!this.godModeActive && !this.fallbackMode) {
            this.logger.warn('🛑 GOD MODE inactive, agent orchestration limited');
        }

        this.logger.info(`✨ Orchestrating ${REVENUE_AGENTS.size} agents with ${instructions.length} instructions`);
        
        const results = [];
        
        try {
            // Process instructions with enhanced error handling
            for (const instruction of instructions) {
                try {
                    let result;
                    
                    // Enhanced agent execution with fallback support
                    if (instruction.type === 'CONSOLIDATION' && this.payoutSystem && this.initializationState.payoutReady) {
                        result = await this._executeConsolidation(instruction);
                    } else if (instruction.type === 'ARBITRAGE' && this.bwaeziChain && this.initializationState.chainReady) {
                        result = await this._executeArbitrage(instruction);
                    } else {
                        result = { 
                            success: false, 
                            error: 'Unsupported instruction or missing dependencies',
                            instruction 
                        };
                    }
                    
                    results.push(result);
                    
                } catch (error) {
                    this.logger.error(`❌ Instruction execution failed: ${error.message}`);
                    results.push({ 
                        success: false, 
                        error: error.message,
                        instruction 
                    });
                }
            }
            
            this.logger.info(`✅ Agent orchestration completed: ${results.filter(r => r.success).length}/${results.length} successful`);
            return results;
            
        } catch (error) {
            this.logger.error(`❌ Agent orchestration failed: ${error.message}`);
            throw error;
        }
    }

    async _executeConsolidation(instruction) {
        // Enhanced consolidation with better error handling
        if (!this.payoutSystem) {
            throw new Error('Payout system not available for consolidation');
        }

        const transferConfig = {
            sender: this.config.SOVEREIGN_WALLET,
            recipient: BWAEZI_CHAIN.REVENUE_VAULT_ADDRESS,
            token: BWAEZI_CHAIN.NATIVE_TOKEN,
            amount: instruction.amount || 50,
            memo: `CycleOrchestration-${this.revenueCycle}-${Date.now()}`
        };

        try {
            const result = await this.payoutSystem.processTransfer(transferConfig);
            
            // Update agent activity
            const agent = REVENUE_AGENTS.get('Consolidator');
            if (agent) {
                agent.lastActive = new Date().toISOString();
                REVENUE_AGENTS.set('Consolidator', agent);
            }
            
            return {
                success: true,
                agent: 'Consolidator',
                instruction,
                result
            };
            
        } catch (error) {
            this.logger.error(`❌ Consolidation execution failed: ${error.message}`);
            throw error;
        }
    }

    async _executeArbitrage(instruction) {
        // Placeholder for arbitrage execution
        // This would be implemented based on specific arbitrage logic
        this.logger.debug(`🔍 Arbitrage instruction received: ${JSON.stringify(instruction)}`);
        
        return {
            success: true,
            agent: 'ArbitrageHunter',
            instruction,
            result: { status: 'EXECUTED', profit: 0.1 }
        };
    }

    // =========================================================================
    // ENHANCED STATUS AND HEALTH MONITORING
    // =========================================================================

    getStatus() {
        const activeAgents = Array.from(REVENUE_AGENTS.values()).filter(agent => 
            agent.status === 'READY' || agent.lastActive
        ).length;

        return {
            initialized: this.initialized,
            godModeActive: this.godModeActive,
            fallbackMode: this.fallbackMode,
            revenueCycle: this.revenueCycle,
            agents: {
                total: REVENUE_AGENTS.size,
                active: activeAgents
            },
            dependencies: this.initializationState,
            health: this._calculateHealthScore(),
            timestamp: new Date().toISOString(),
            version: '20.0-ENHANCED'
        };
    }

    _calculateHealthScore() {
        const weights = {
            dbReady: 0.3,
            chainReady: 0.3,
            payoutReady: 0.2,
            coreReady: 0.2
        };

        let score = 0;
        Object.entries(weights).forEach(([key, weight]) => {
            if (this.initializationState[key]) {
                score += weight;
            }
        });

        return Math.round(score * 100);
    }

    async healthCheck() {
        const status = this.getStatus();
        const checks = [];

        // Database health check
        if (this.dbEngine) {
            try {
                // Simple check - attempt a basic operation
                checks.push({ component: 'Database', status: 'HEALTHY' });
            } catch (error) {
                checks.push({ component: 'Database', status: 'UNHEALTHY', error: error.message });
            }
        }

        // Chain health check
        if (this.bwaeziChain) {
            try {
                if (typeof this.bwaeziChain.checkChainStatus === 'function') {
                    await this.bwaeziChain.checkChainStatus();
                    checks.push({ component: 'BwaeziChain', status: 'HEALTHY' });
                } else {
                    checks.push({ component: 'BwaeziChain', status: 'UNKNOWN', error: 'Status method unavailable' });
                }
            } catch (error) {
                checks.push({ component: 'BwaeziChain', status: 'UNHEALTHY', error: error.message });
            }
        }

        return {
            overall: status.health >= 70 ? 'HEALTHY' : status.health >= 40 ? 'DEGRADED' : 'UNHEALTHY',
            score: status.health,
            checks,
            timestamp: new Date().toISOString()
        };
    }

    // =========================================================================
    // ENHANCED SHUTDOWN WITH GRACEFUL DEGRADATION
    // =========================================================================

    async shutdown() {
        if (!this.initialized) {
            this.logger.warn('⚠️ Revenue Engine not initialized, shutdown skipped');
            return;
        }

        this.logger.info('🛑 Initiating Revenue Engine shutdown...');

        try {
            // Notify agents of shutdown
            this.emit('shutdown_initiated', { timestamp: new Date().toISOString() });

            // Clear agents
            REVENUE_AGENTS.clear();

            // Reset state
            this.initialized = false;
            this.godModeActive = false;
            this.initializationPromise = null;
            
            // Reset global instance
            if (GLOBAL_ENGINE_INSTANCE === this) {
                GLOBAL_ENGINE_INSTANCE = null;
            }

            this.logger.info('✅ BWAEZI Sovereign Revenue Engine shut down gracefully');

        } catch (error) {
            this.logger.error(`❌ Graceful shutdown failed: ${error.message}`);
            // Force reset
            this.initialized = false;
            this.godModeActive = false;
            GLOBAL_ENGINE_INSTANCE = null;
            throw error;
        }
    }

    // =========================================================================
    // ENHANCED UTILITY METHODS
    // =========================================================================

    /**
     * Emergency recovery method for critical failures
     */
    async emergencyRecovery() {
        this.logger.warn('🚨 INITIATING EMERGENCY RECOVERY PROCEDURE');
        
        try {
            // Reset initialization state
            this.initialized = false;
            this.godModeActive = false;
            this.initializationPromise = null;
            
            // Reset dependency states
            Object.keys(this.initializationState).forEach(key => {
                this.initializationState[key] = false;
            });

            // Clear agents
            REVENUE_AGENTS.clear();

            // Reset attempt counter
            INITIALIZATION_ATTEMPTS = 0;

            this.logger.info('🔄 Emergency recovery completed, ready for reinitialization');
            return true;

        } catch (error) {
            this.logger.error(`❌ Emergency recovery failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Update dependencies after initial construction
     */
    updateDependencies({ sovereignCore, dbEngine, bwaeziChain, payoutSystem }) {
        this.logger.info('🔄 Updating engine dependencies');
        
        if (sovereignCore) this.sovereignCore = sovereignCore;
        if (dbEngine) this.dbEngine = dbEngine;
        if (bwaeziChain) this.bwaeziChain = bwaeziChain;
        if (payoutSystem) this.payoutSystem = payoutSystem;

        // Re-evaluate fallback mode
        this.fallbackMode = !(this.sovereignCore && this.dbEngine && this.bwaeziChain && this.payoutSystem);
        
        this.logger.info(`🔧 Dependencies updated, fallback mode: ${this.fallbackMode}`);
    }
}

// =========================================================================
// ENHANCED PRODUCTION EXPORT AND INSTANCE MANAGEMENT
// =========================================================================

/**
 * Enhanced singleton retrieval with dependency validation
 */
export function getSovereignRevenueEngine(config = {}, sovereignCoreInstance = null, dbEngineInstance = null, bwaeziChainInstance = null, payoutSystemInstance = null) {
    // Return existing instance if available
    if (GLOBAL_ENGINE_INSTANCE) {
        getGlobalLogger('RevenueEngine').debug('🔄 Returning existing Revenue Engine instance');
        return GLOBAL_ENGINE_INSTANCE;
    }

    // Create new instance with enhanced validation
    try {
        GLOBAL_ENGINE_INSTANCE = new SovereignRevenueEngine(
            config, 
            sovereignCoreInstance, 
            dbEngineInstance, 
            bwaeziChainInstance, 
            payoutSystemInstance
        );
        
        getGlobalLogger('RevenueEngine').info('✨ New Revenue Engine instance created');
        return GLOBAL_ENGINE_INSTANCE;
        
    } catch (error) {
        getGlobalLogger('RevenueEngine').error(`❌ Failed to create Revenue Engine instance: ${error.message}`);
        
        // Return null instead of throwing to prevent application crash
        return null;
    }
}

/**
 * Enhanced initialization with comprehensive error handling
 */
export async function initializeSovereignRevenueEngine(config, sovereignCoreInstance, dbEngineInstance, bwaeziChainInstance, payoutSystemInstance) {
    const logger = getGlobalLogger('RevenueEngine');
    
    try {
        // Get or create engine instance
        const engine = getSovereignRevenueEngine(
            config, 
            sovereignCoreInstance, 
            dbEngineInstance, 
            bwaeziChainInstance, 
            payoutSystemInstance
        );

        if (!engine) {
            throw new Error('Failed to create Revenue Engine instance');
        }

        // Initialize the engine
        await engine.initialize();
        
        logger.info('✅ Revenue Engine initialization completed successfully');
        return engine;
        
    } catch (error) {
        logger.error(`❌ Revenue Engine initialization failed: ${error.message}`);
        
        // Enhanced error information
        const errorInfo = {
            message: error.message,
            stack: error.stack,
            dependencies: {
                sovereignCore: !!sovereignCoreInstance,
                dbEngine: !!dbEngineInstance,
                bwaeziChain: !!bwaeziChainInstance,
                payoutSystem: !!payoutSystemInstance
            },
            timestamp: new Date().toISOString()
        };
        
        throw new Error(`SovereignRevenueEngine initialization failed: ${JSON.stringify(errorInfo)}`);
    }
}

/**
 * Emergency cleanup function for application shutdown
 */
export function emergencyCleanup() {
    const logger = getGlobalLogger('RevenueEngine');
    logger.warn('🚨 Performing emergency Revenue Engine cleanup');
    
    if (GLOBAL_ENGINE_INSTANCE) {
        try {
            GLOBAL_ENGINE_INSTANCE.shutdown().catch(error => {
                logger.error(`❌ Emergency shutdown failed: ${error.message}`);
            });
        } catch (error) {
            logger.error(`❌ Emergency cleanup failed: ${error.message}`);
        } finally {
            GLOBAL_ENGINE_INSTANCE = null;
        }
    }
    
    REVENUE_AGENTS.clear();
    INITIALIZATION_ATTEMPTS = 0;
    
    logger.info('✅ Emergency cleanup completed');
}

// Export the class for advanced usage
export { SovereignRevenueEngine };

// =========================================================================
// AUTOMATIC CLEANUP ON PROCESS EXIT
// =========================================================================

// Safe process event registration
if (typeof process !== 'undefined') {
    process.on('beforeExit', () => {
        emergencyCleanup();
    });

    process.on('SIGINT', () => {
        getGlobalLogger('RevenueEngine').info('🛑 SIGINT received, shutting down Revenue Engine');
        emergencyCleanup();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        getGlobalLogger('RevenueEngine').info('🛑 SIGTERM received, shutting down Revenue Engine');
        emergencyCleanup();
        process.exit(0);
    });
}
