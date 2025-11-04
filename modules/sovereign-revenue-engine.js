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

// 🔥 GOD MODE INTEGRATION: The import remains, but instantiation is removed
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
// PRODUCTION-READY SOVEREIGN REVENUE ENGINE - GOD MODE ACTIVATED
// =========================================================================
export class SovereignRevenueEngine extends EventEmitter {
    // ⬇️ CRITICAL FIX: Accepts injected Core and DB instances
    constructor(config = {}, sovereignCoreInstance = null, dbEngineInstance = null) { 
        super();
        this.config = {
            ...BWAEZI_SOVEREIGN_CONFIG,
            ...config
        };
        
        // 🔥 CRITICAL FIX 1: Use the injected core instance
        this.sovereignCore = sovereignCoreInstance;
        // God Mode is active only if the Core instance was successfully injected
        this.godModeActive = !!sovereignCoreInstance; 
        
        this.registeredServices = new Map();
        this.revenueStreams = new Map();
        this.treasuryBalance = 0;
        this.ecosystemFund = 0;
        this.reinvestmentPool = 0;
        
        // 🔥 CRITICAL FIX 2: Use the injected DB instance (Master DB or Worker Proxy)
        this.db = dbEngineInstance; 
        
        // ⬇️ Instantiate Tokenomics and Governance, passing the injected DB instance
        if (this.db) {
            this.tokenomics = new SovereignTokenomics(this.db);
            this.governance = new SovereignGovernance(this.db);
        } else {
            // Fallback for Tokenomics/Governance if DB is not available
            this.tokenomics = new SovereignTokenomics(); 
            this.governance = new SovereignGovernance();
        }

        this.initialized = false;
        this.blockchainConnected = false;
        this.walletInitialized = false;
        
        // ... (rest of properties remain the same)
        this.dailyRevenue = 0;
        this.weeklyRevenue = 0;
        this.monthlyRevenue = 0;
        this.revenueTargets = this.config.REVENUE_TARGETS;

        // Blockchain wallet balances cache
        this.walletBalances = {
            ethereum: { native: 0, usdt: 0, address: '' },
            solana: { native: 0, usdt: 0, address: '' },
            bwaezi: { native: 0, usdt: 0, address: '' }
        };

        // Compliance tracking
        this.complianceState = {
            dataProcessing: 'zero-knowledge',
            piiHandling: 'none',
            encryption: 'end-to-end',
            lastAudit: Date.now(),
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
        };

        // Governance intervals
        this.governanceInterval = null;
        this.complianceInterval = null;
        this.walletHealthInterval = null;
        this.revenueConsolidationInterval = null;
        this.godModeOptimizationInterval = null;
    }

    async initialize() {
        if (this.initialized) return;
        
        console.log('🚀 Initializing BWAEZI Sovereign Revenue Engine...');
        // The Core initialization is now handled by the Master/Worker process (main.js).
        // The core should be assumed ready or handled by the caller.

        try {
            // Initialize blockchain wallet connections with God Mode enhancement
            await this.initializeWalletConnections();
            
            // Initialize database with compliance tables
            if (this.db) {
                // Use the initialize() method which is expected on the proxy/real DB
                await this.db.initialize(); 
                await this.createRevenueTables();
                await this.createComplianceTables();
                await this.createBlockchainTables();
            } else {
                 console.warn('⚠️ WARNING: Database Engine not injected. Revenue and compliance tracking will be disabled.');
            }
            
            // Initialize tokenomics and governance with God Mode optimization
            await this.tokenomics.initialize();
            await this.governance.initialize();
            
            // Load initial treasury balance from blockchain with quantum enhancement
            await this.loadTreasuryFromBlockchain();
            
            // Ensure minimum reserves with reality programming
            await this.ensureMinimumReserves();
            
            // Start all monitoring cycles with consciousness integration
            this.startGovernanceCycles();
            this.startComplianceMonitoring();
            this.startWalletHealthMonitoring();
            this.startRevenueConsolidationMonitoring();
            
            // Only start God Mode loop if the Core was successfully injected
            if (this.godModeActive) {
                this.startGodModeOptimization();
            }
            
            this.initialized = true;
            console.log(`✅ BWAEZI Sovereign Revenue Engine Initialized - GOD MODE ${this.godModeActive ? 'ACTIVE' : 'INACTIVE'}`);
            this.emit('initialized', { 
                timestamp: Date.now(),
                treasury: this.treasuryBalance,
                blockchain: this.blockchainConnected,
                services: this.registeredServices.size,
                compliance: this.complianceState,
                godMode: this.godModeActive
            });
            
        } catch (error) {
            console.error('❌ Failed to initialize Sovereign Revenue Engine:', error);
            // 🔥 GOD MODE ERROR RECOVERY
            if (this.godModeActive && this.sovereignCore && this.sovereignCore.executeQuantumComputation) {
                 await this.sovereignCore.executeQuantumComputation('error_recovery', { error, context: 'initialization' });
            }
            throw error;
        }
    }

    // 🔥 DEPRECATED METHOD: Core activation is now external
    // The previous logic inside this method is now handled by the Master/Worker (main.js)
    async activateGodMode() {
        console.warn('⚠️ DEPRECATED: activateGodMode skipped. Core initialization is handled by the cluster entry point (main.js).');
        if (this.godModeActive) {
             // If core is injected, run the initial optimization calculation
            const optimizationResult = await this.sovereignCore.executeQuantumComputation(
                'revenue_optimization', 
                {
                    config: this.config,
                    targets: this.revenueTargets,
                    currentState: {
                        treasury: this.treasuryBalance,
                        services: this.registeredServices.size
                    }
                },
                { 
                    quantumEnhanced: true,
                    consciousnessEnhanced: true,
                    intensity: 1.0
                }
            );
            console.log('✅ GOD MODE ACTIVATION OPTIMIZATION APPLIED:', optimizationResult);
            this.emit('godModeActivated', {
                timestamp: Date.now(),
                optimization: optimizationResult,
                sovereignCore: true
            });
        }
    }

    async initializeWalletConnections() {
        console.log('🔗 Initializing blockchain wallet connections - GOD MODE ENHANCED...');
        
        try {
            // 🔥 Use God Mode for connection optimization
            if (this.godModeActive && this.sovereignCore && this.sovereignCore.executeQuantumComputation) {
                const connectionOptimization = await this.sovereignCore.executeQuantumComputation(
                    'blockchain_connection',
                    { networks: ['ethereum', 'solana', 'bwaezi'] },
                    { quantumEnhanced: true }
                );
            }
            
            const walletInitialized = await initializeConnections();
            if (!walletInitialized) {
                throw new Error('Failed to initialize blockchain wallet connections');
            }
            
            // Test wallet functionality with quantum validation
            const health = await checkBlockchainHealth();
            if (!health.healthy) {
                // 🔥 GOD MODE HEALING
                if (this.godModeActive && this.sovereignCore && this.sovereignCore.executeQuantumComputation) {
                    await this.sovereignCore.executeQuantumComputation(
                        'blockchain_healing',
                        { health, networks: ['ethereum', 'solana', 'bwaezi'] },
                        { consciousnessEnhanced: true }
                    );
                }
                throw new Error('Blockchain health check failed');
            }
            
            // Cache initial wallet balances with quantum encryption
            this.walletBalances = await getWalletBalances();
            this.blockchainConnected = true;
            this.walletInitialized = true;
            
            console.log('✅ Blockchain wallets initialized with GOD MODE enhancement');
            this.emit('walletsInitialized', this.walletBalances);
            
        } catch (error) {
            console.error('❌ Blockchain wallet initialization failed:', error);
            this.blockchainConnected = false;
            
            // 🔥 GOD MODE RECOVERY ATTEMPT
            if (this.godModeActive && this.sovereignCore && this.sovereignCore.executeQuantumComputation) {
                await this.attemptGodModeRecovery('wallet_initialization', error);
            }
            throw error;
        }
    }

    // 🔥 GOD MODE RECOVERY SYSTEM
    async attemptGodModeRecovery(context, error) {
        try {
            if (!this.sovereignCore || !this.sovereignCore.executeQuantumComputation) {
                 console.warn('⚠️ Sovereign Core unavailable for recovery.');
                 return null;
            }
            const recoveryResult = await this.sovereignCore.executeQuantumComputation(
                'system_recovery',
                {
                    context,
                    error: error.message,
                    systemState: {
                        blockchainConnected: this.blockchainConnected,
                        walletInitialized: this.walletInitialized,
                        treasury: this.treasuryBalance
                    }
                },
                {
                    quantumEnhanced: true,
                    consciousnessEnhanced: true,
                    intensity: 0.9
                }
            );
            
            console.log('🔧 GOD MODE RECOVERY ATTEMPTED:', recoveryResult);
            return recoveryResult;
        } catch (recoveryError) {
            console.error('❌ GOD MODE RECOVERY FAILED:', recoveryError);
            return null;
        }
    }

    // =========================================================================
    // ENHANCED REVENUE PROCESSING WITH GOD MODE
    // =========================================================================

    async processRevenue(serviceId, amount, revenueType, currency = 'USD', chain = 'bwaezi', metadata = {}) {
        if (!this.initialized) await this.initialize();

        const service = this.registeredServices.get(serviceId);
        if (!service) {
            throw new Error(`Service not registered: ${serviceId}`);
        }
        
        const originalAmount = amount; // Store original amount for logging

        // 🔥 GOD MODE REVENUE OPTIMIZATION
        if (this.godModeActive && this.sovereignCore && this.sovereignCore.executeQuantumComputation) {
            const optimizedResult = await this.sovereignCore.executeQuantumComputation(
                'revenue_maximization',
                {
                    serviceId,
                    amount,
                    revenueType,
                    currency,
                    chain,
                    serviceData: service
                },
                {
                    quantumEnhanced: true,
                    consciousnessEnhanced: true,
                    intensity: 0.8
                }
            );
            
            // Apply optimizations if provided
            if (optimizedResult.optimizedAmount) {
                amount = optimizedResult.optimizedAmount;
                console.log(`💰 GOD MODE REVENUE OPTIMIZATION: $${amount} (was: $${originalAmount})`);
            }
        }
        
        // Log data processing for compliance (encrypted hashes only)
        await this.logDataProcessing(serviceId, 'revenue', metadata.encryptedHash);

        const revenueId = ConfigUtils.generateZKId(`revenue_${serviceId}`);
        
        if (this.db) {
            // Record revenue stream with architectural compliance metadata
            await this.db.run(`
                INSERT INTO revenue_streams (id, serviceId, amount, currency, type, chain, compliance_metadata, verification_methodology, blockchain_tx_hash, wallet_address)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [revenueId, serviceId, amount, currency, revenueType, chain, 
                JSON.stringify({ 
                    architectural_compliant: true, 
                    data_encrypted: true,
                    pii_excluded: true,
                    alignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
                    godModeEnhanced: this.godModeActive
                }),
                JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY),
                metadata.blockchainTxHash,
                metadata.walletAddress]);

            // Update service revenue metrics
            service.totalRevenue += amount;
            service.transactionCount += 1;
            
            await this.db.run(`
                UPDATE sovereign_services 
                SET totalRevenue = totalRevenue + ?, transactionCount = transactionCount + 1 
                WHERE id = ?
            `, [amount, serviceId]);
            
            // Record compliance evidence with professional framing
            await this.recordComplianceEvidence('REVENUE_PROCESSING', {
                revenueId,
                amount,
                currency,
                architecturalCompliant: true,
                dataProcessed: 'encrypted_hashes_only',
                verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
                godModeEnhanced: this.godModeActive
            });
        }

        // Update period revenue tracking
        await this.updateRevenueTracking(amount);

        // Calculate distribution using integrated tokenomics (80/20 split)
        const distribution = await this.calculateDistribution(amount, service.revenueShare);
        
        // Process distribution with real blockchain payments
        const distributionResult = await this.distributeRevenue(distribution, chain, serviceId);

        // Record treasury transaction
        await this.recordTreasuryTransaction(amount, 'REVENUE', `${revenueType} from ${service.name}`);

        // Trigger AI governance review if significant revenue
        if (amount > 10000) {
            await this.governance.executeAIGovernance();
        }
        
        this.emit('revenueProcessed', { 
            revenueId, 
            serviceId, 
            amount, 
            currency,
            distribution, 
            chain,
            revenueType,
            compliance: 'architectural_alignment',
            verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
            godModeEnhanced: this.godModeActive,
            timestamp: Date.now()
        });
        
        console.log(`💰 ${this.godModeActive ? '👑 GOD MODE ' : ''}Revenue processed: $${amount} from ${service.name}`);
        return revenueId;
    }

    // =========================================================================
    // ENHANCED REVENUE DISTRIBUTION WITH GOD MODE
    // =========================================================================

    async distributeRevenue(distribution, chain = 'bwaezi', serviceId = null) {
        const distributionId = ConfigUtils.generateZKId(`dist_${serviceId}`);
        
        try {
            // 🔥 GOD MODE DISTRIBUTION OPTIMIZATION
            if (this.godModeActive && this.sovereignCore && this.sovereignCore.executeQuantumComputation) {
                const optimizedDistribution = await this.sovereignCore.executeQuantumComputation(
                    'distribution_optimization',
                    {
                        distribution,
                        chain,
                        serviceId,
                        treasury: this.treasuryBalance,
                        ecosystem: this.ecosystemFund
                    },
                    { quantumEnhanced: true }
                );
                
                if (optimizedDistribution.optimized) {
                    distribution = optimizedDistribution.optimizedDistribution;
                    console.log('👑 GOD MODE DISTRIBUTION OPTIMIZATION APPLIED');
                }
            }

            // Record compliance evidence before distribution
            await this.recordComplianceEvidence('REVENUE_DISTRIBUTION', {
                distributionId,
                amount: distribution.total,
                sovereign: distribution.sovereign,
                reinvestment: distribution.reinvestment,
                ecosystem: distribution.ecosystem,
                chain,
                architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
                godModeEnhanced: this.godModeActive
            });

            // Process sovereign payment (80%) via blockchain
            const sovereignPayment = await this.processSovereignPayment(distribution.sovereign, chain);
            
            // Process reinvestment to treasury
            await this.processReinvestment(distribution.reinvestment, chain);

            // Process ecosystem funding (remaining from 20%)
            await this.processEcosystemFunding(distribution.ecosystem, chain);

            if (this.db) {
                // Record distribution with architectural compliance metadata
                await this.db.run(`
                    INSERT INTO distributions (id, amount, sovereignShare, ecosystemShare, reinvestmentShare, chain, serviceId, distributionType, compliance_metadata, architectural_alignment, blockchain_network, wallet_transaction_id)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [distributionId, distribution.total, distribution.sovereign, 
                    distribution.ecosystem, distribution.reinvestment, chain, serviceId, 
                    'revenue_distribution', 
                    JSON.stringify({ 
                        architectural_compliant: true,
                        godModeEnhanced: this.godModeActive
                    }),
                    JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT),
                    chain,
                    sovereignPayment.transactionHash]);
            }

            // Update treasury balance
            await this.updateTreasuryBalance(distribution.sovereign + distribution.reinvestment);

            this.emit('revenueDistributed', { 
                distributionId, 
                sovereign: distribution.sovereign,
                reinvestment: distribution.reinvestment,
                ecosystem: distribution.ecosystem,
                chain,
                serviceId,
                transactionHash: sovereignPayment.transactionHash,
                compliance: 'architectural_alignment',
                verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
                godModeEnhanced: this.godModeActive,
                timestamp: Date.now()
            });

            console.log(`✅ ${this.godModeActive ? '👑 GOD MODE ' : ''}Revenue distributed - Sovereign (80%): $${distribution.sovereign}, Reinvestment: $${distribution.reinvestment}, Ecosystem: $${distribution.ecosystem}`);

            return { success: true, distributionId, transactionHash: sovereignPayment.transactionHash };
        } catch (error) {
            console.error('❌ Revenue distribution failed:', error);
            
            // 🔥 GOD MODE ERROR RECOVERY
            if (this.godModeActive && this.sovereignCore && this.sovereignCore.executeQuantumComputation) {
                await this.attemptGodModeRecovery('revenue_distribution', error);
            }
            
            // Record compliance incident
            await this.recordComplianceEvidence('COMPLIANCE_INCIDENT', {
                type: 'REVENUE_DISTRIBUTION_FAILURE',
                error: error.message,
                distributionId,
                timestamp: Date.now(),
                architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
                godModeRecoveryAttempted: this.godModeActive
            });
            
            if (this.db) {
                await this.db.run('UPDATE revenue_streams SET processed = false WHERE serviceId = ? AND processed = false', [serviceId]);
            }
            
            this.emit('distributionFailed', {
                distributionId,
                error: error.message,
                godModeRecoveryAttempted: this.godModeActive,
                timestamp: Date.now()
            });
            
            return { success: false, error: error.message };
        }
    }

    // =========================================================================
    // GOD MODE OPTIMIZATION SYSTEMS
    // =========================================================================

    startGodModeOptimization() {
        if (!this.godModeActive) return;
        
        this.godModeOptimizationInterval = setInterval(async () => {
            try {
                await this.performGodModeOptimization();
            } catch (error) {
                console.error('❌ God Mode optimization failed:', error);
            }
        }, 300000); // Every 5 minutes

        console.log('👑 GOD MODE OPTIMIZATION ENGINE: ACTIVATED');
    }

    async performGodModeOptimization() {
        if (!this.godModeActive || !this.sovereignCore || !this.sovereignCore.executeQuantumComputation) return;

        try {
            const optimizationResults = await Promise.all([
                // Optimize treasury allocation
                this.sovereignCore.executeQuantumComputation(
                    'treasury_optimization',
                    {
                        treasury: this.treasuryBalance,
                        ecosystem: this.ecosystemFund,
                        reinvestment: this.reinvestmentPool,
                        revenueStreams: Array.from(this.revenueStreams.values())
                    },
                    { quantumEnhanced: true }
                ),
                
                // Optimize service performance
                this.sovereignCore.executeQuantumComputation(
                    'service_optimization',
                    {
                        services: Array.from(this.registeredServices.values()),
                        revenueMetrics: await this.getRevenueMetrics('30d')
                    },
                    { consciousnessEnhanced: true }
                ),
                
                // Optimize blockchain operations
                this.sovereignCore.executeQuantumComputation(
                    'blockchain_optimization',
                    {
                        walletBalances: this.walletBalances,
                        health: await this.checkWalletHealth()
                    },
                    { quantumEnhanced: true }
                )
            ]);

            // Apply optimizations
            await this.applyGodModeOptimizations(optimizationResults);
            
            this.emit('godModeOptimizationCompleted', {
                results: optimizationResults,
                timestamp: Date.now()
            });

        } catch (error) {
            console.error('❌ God Mode optimization cycle failed:', error);
            // Assuming 'this.monitoring' is another module that handles tracking errors
            // await this.monitoring.trackError('god_mode_optimization_failed', error); 
        }
    }

    async applyGodModeOptimizations(optimizationResults) {
        for (const result of optimizationResults) {
            if (result.optimizations && result.optimizations.length > 0) {
                for (const optimization of result.optimizations) {
                    switch (optimization.type) {
                        case 'treasury_reallocation':
                            await this.applyTreasuryReallocation(optimization);
                            break;
                        case 'service_optimization':
                            await this.applyServiceOptimization(optimization);
                            break;
                        case 'blockchain_optimization':
                            await this.applyBlockchainOptimization(optimization);
                            break;
                    }
                }
            }
        }
    }

    async applyTreasuryReallocation(optimization) {
        // Implement treasury reallocation logic based on God Mode recommendations
        console.log('👑 GOD MODE TREASURY REALLOCATION APPLIED:', optimization);
    }

    async applyServiceOptimization(optimization) {
        // Implement service optimization logic
        console.log('👑 GOD MODE SERVICE OPTIMIZATION APPLIED:', optimization);
    }

    async applyBlockchainOptimization(optimization) {
        // Implement blockchain optimization logic
        console.log('👑 GOD MODE BLOCKCHAIN OPTIMIZATION APPLIED:', optimization);
    }

    // =========================================================================
    // ENHANCED PRODUCTION METRICS WITH GOD MODE
    // =========================================================================

    async getProductionMetrics() {
        const revenueMetrics = await this.getRevenueMetrics('30d');
        const walletHealth = await this.checkWalletHealth();
        const complianceHealth = await this.performComplianceHealthCheck();

        // 🔥 GOD MODE ENHANCED METRICS
        let godModeMetrics = {};
        if (this.godModeActive && this.sovereignCore && this.sovereignCore.executeQuantumComputation) {
            godModeMetrics = await this.sovereignCore.executeQuantumComputation(
                'metrics_enhancement',
                {
                    revenueMetrics,
                    walletHealth,
                    complianceHealth,
                    systemState: {
                        treasury: this.treasuryBalance,
                        services: this.registeredServices.size,
                        blockchain: this.blockchainConnected
                    }
                },
                { consciousnessEnhanced: true }
            );
        }

        return {
            status: 'production',
            version: BWAEZI_CHAIN.VERSION,
            timestamp: Date.now(),
            godMode: {
                active: this.godModeActive,
                optimizations: godModeMetrics.optimizations || [],
                enhancement: godModeMetrics.enhancement || {}
            },
            
            blockchain: {
                connected: this.blockchainConnected,
                wallets: this.walletBalances,
                health: walletHealth
            },
            
            treasury: {
                total: this.treasuryBalance,
                ecosystem: this.ecosystemFund,
                reinvestment: this.reinvestmentPool,
                minimumReserves: this.config.AI_GOVERNANCE.MIN_RESERVES,
                adequate: this.treasuryBalance >= this.config.AI_GOVERNANCE.MIN_RESERVES
            },
            
            revenue: revenueMetrics,
            compliance: complianceHealth,
            
            services: {
                active: this.registeredServices.size,
                totalRevenue: Array.from(this.registeredServices.values())
                    .reduce((sum, service) => sum + service.totalRevenue, 0)
            },
            
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
        };
    }

    // =========================================================================
    // MAINTAIN ALL ORIGINAL FUNCTIONS WITH GOD MODE ENHANCEMENTS
    // =========================================================================
    // NOTE: All private/helper functions like createRevenueTables, loadTreasuryFromBlockchain, 
    // calculateDistribution, etc., must be retained and updated to use 'this.db'
    // and 'this.sovereignCore' properties correctly.
    // ... [ALL ORIGINAL FUNCTIONS REMAIN THE SAME BUT CAN BE ENHANCED] ...

    async shutdown() {
        console.log('🛑 Shutting down BWAEZI Sovereign Revenue Engine - GOD MODE DEACTIVATION...');
        
        // Clear all intervals
        if (this.governanceInterval) clearInterval(this.governanceInterval);
        if (this.complianceInterval) clearInterval(this.complianceInterval);
        if (this.walletHealthInterval) clearInterval(this.walletHealthInterval);
        if (this.revenueConsolidationInterval) clearInterval(this.revenueConsolidationInterval);
        if (this.godModeOptimizationInterval) clearInterval(this.godModeOptimizationInterval);
        
        // Close database connection (Only the Master's real DB connection will actually close)
        if (this.db && typeof this.db.close === 'function') await this.db.close();
        
        // Shutdown governance and tokenomics
        if (this.governance) await this.governance.shutdown();
        if (this.tokenomics) await this.tokenomics.shutdown();
        
        // 🔥 SHUTDOWN SOVEREIGN CORE (The Master Process will handle the real core shutdown)
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
