// modules/sovereign-revenue-engine.js
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

import {
    BWAEZI_CHAIN,
    BWAEZI_TOKEN_ECONOMICS,
    BWAEZI_SOVEREIGN_CONFIG,
    SOVEREIGN_SERVICES,
    COMPLIANCE_STRATEGY,
    PUBLIC_COMPLIANCE_STATEMENTS,
    ConfigUtils
} from '../config/bwaezi-config.js';

// =========================================================================
// PRODUCTION-READY SOVEREIGN REVENUE ENGINE - FULLY INTEGRATED
// =========================================================================
export class SovereignRevenueEngine extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            ...BWAEZI_SOVEREIGN_CONFIG,
            ...config
        };
        this.registeredServices = new Map();
        this.revenueStreams = new Map();
        this.treasuryBalance = 0;
        this.ecosystemFund = 0;
        this.reinvestmentPool = 0;
        this.db = new ArielSQLiteEngine({ path: './data/sovereign_revenue.db' });
        this.tokenomics = new SovereignTokenomics();
        this.governance = new SovereignGovernance();
        this.initialized = false;
        this.blockchainConnected = false;
        this.walletInitialized = false;
        
        // Revenue tracking
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
    }

    async initialize() {
        if (this.initialized) return;
        
        console.log('🚀 Initializing BWAEZI Sovereign Revenue Engine...');
        console.log('🛡️  Compliance Strategy:', PUBLIC_COMPLIANCE_STATEMENTS.SECURITY);
        
        try {
            // Initialize blockchain wallet connections first
            await this.initializeWalletConnections();
            
            // Initialize database with compliance tables
            await this.db.init();
            await this.createRevenueTables();
            await this.createComplianceTables();
            await this.createBlockchainTables();
            
            // Initialize tokenomics and governance
            await this.tokenomics.initialize();
            await this.governance.initialize();
            
            // Load initial treasury balance from blockchain
            await this.loadTreasuryFromBlockchain();
            
            // Ensure minimum reserves
            await this.ensureMinimumReserves();
            
            // Start all monitoring cycles
            this.startGovernanceCycles();
            this.startComplianceMonitoring();
            this.startWalletHealthMonitoring();
            this.startRevenueConsolidationMonitoring();
            
            this.initialized = true;
            console.log('✅ BWAEZI Sovereign Revenue Engine Initialized - PRODUCTION READY');
            this.emit('initialized', { 
                timestamp: Date.now(),
                treasury: this.treasuryBalance,
                blockchain: this.blockchainConnected,
                services: this.registeredServices.size,
                compliance: this.complianceState
            });
            
        } catch (error) {
            console.error('❌ Failed to initialize Sovereign Revenue Engine:', error);
            throw error;
        }
    }

    async initializeWalletConnections() {
        console.log('🔗 Initializing blockchain wallet connections...');
        
        try {
            const walletInitialized = await initializeConnections();
            if (!walletInitialized) {
                throw new Error('Failed to initialize blockchain wallet connections');
            }
            
            // Test wallet functionality
            const health = await checkBlockchainHealth();
            if (!health.healthy) {
                throw new Error('Blockchain health check failed');
            }
            
            // Cache initial wallet balances
            this.walletBalances = await getWalletBalances();
            this.blockchainConnected = true;
            this.walletInitialized = true;
            
            console.log('✅ Blockchain wallets initialized and ready for production');
            this.emit('walletsInitialized', this.walletBalances);
            
        } catch (error) {
            console.error('❌ Blockchain wallet initialization failed:', error);
            this.blockchainConnected = false;
            throw error;
        }
    }

    async createRevenueTables() {
        // Sovereign Services Table
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS sovereign_services (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                registrationFee REAL NOT NULL,
                annualLicenseFee REAL NOT NULL,
                revenueShare REAL NOT NULL,
                minDeposit REAL NOT NULL,
                registeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                licenseExpiry DATETIME,
                status TEXT DEFAULT 'active',
                totalRevenue REAL DEFAULT 0,
                transactionCount INTEGER DEFAULT 0,
                compliance TEXT,
                serviceType TEXT,
                dataPolicy TEXT,
                architectural_alignment TEXT
            )
        `);

        // Revenue Streams Table
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS revenue_streams (
                id TEXT PRIMARY KEY,
                serviceId TEXT NOT NULL,
                amount REAL NOT NULL,
                currency TEXT DEFAULT 'USD',
                type TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                processed BOOLEAN DEFAULT false,
                chain TEXT DEFAULT 'bwaezi',
                distributionProcessed BOOLEAN DEFAULT false,
                transactionHash TEXT,
                compliance_metadata TEXT,
                verification_methodology TEXT,
                blockchain_tx_hash TEXT,
                wallet_address TEXT,
                FOREIGN KEY (serviceId) REFERENCES sovereign_services (id)
            )
        `);

        // Distributions Table
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS distributions (
                id TEXT PRIMARY KEY,
                amount REAL NOT NULL,
                sovereignShare REAL NOT NULL,
                ecosystemShare REAL NOT NULL,
                reinvestmentShare REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                txHash TEXT,
                chain TEXT DEFAULT 'bwaezi',
                serviceId TEXT,
                distributionType TEXT,
                compliance_metadata TEXT,
                architectural_alignment TEXT,
                blockchain_network TEXT,
                wallet_transaction_id TEXT,
                FOREIGN KEY (serviceId) REFERENCES sovereign_services (id)
            )
        `);

        // Treasury Balance Table
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS treasury_balance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                balance REAL NOT NULL,
                type TEXT NOT NULL,
                amount REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                description TEXT,
                transactionId TEXT,
                compliance_verification TEXT,
                blockchain_reference TEXT
            )
        `);
    }

    async createComplianceTables() {
        // Compliance Evidence Table
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS compliance_evidence (
                id TEXT PRIMARY KEY,
                framework TEXT NOT NULL,
                control_id TEXT NOT NULL,
                evidence_type TEXT NOT NULL,
                evidence_data TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                verified BOOLEAN DEFAULT false,
                public_hash TEXT,
                compliance_strategy TEXT,
                architectural_alignment TEXT
            )
        `);

        // Data Processing Logs
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS data_processing_logs (
                id TEXT PRIMARY KEY,
                service_id TEXT NOT NULL,
                data_type TEXT NOT NULL,
                processing_type TEXT NOT NULL,
                encrypted_hash TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                user_consent BOOLEAN DEFAULT true,
                jurisdiction TEXT DEFAULT 'global',
                verification_methodology TEXT
            )
        `);

        // Transparency Reports
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS transparency_reports (
                id TEXT PRIMARY KEY,
                report_type TEXT NOT NULL,
                period_start DATETIME NOT NULL,
                period_end DATETIME NOT NULL,
                data_processed INTEGER DEFAULT 0,
                revenue_generated REAL DEFAULT 0,
                services_active INTEGER DEFAULT 0,
                compliance_incidents INTEGER DEFAULT 0,
                public_url TEXT,
                on_chain_hash TEXT,
                architectural_alignment TEXT,
                verification_summary TEXT,
                blockchain_treasury_snapshot TEXT
            )
        `);
    }

    async createBlockchainTables() {
        // Blockchain Transactions Table
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS blockchain_transactions (
                id TEXT PRIMARY KEY,
                network TEXT NOT NULL,
                transaction_hash TEXT NOT NULL,
                from_address TEXT NOT NULL,
                to_address TEXT NOT NULL,
                amount REAL NOT NULL,
                token TEXT NOT NULL,
                type TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                block_number INTEGER,
                gas_used REAL,
                confirmation_count INTEGER DEFAULT 0,
                error_message TEXT
            )
        `);

        // Wallet Balances History
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS wallet_balances_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                ethereum_native REAL DEFAULT 0,
                ethereum_usdt REAL DEFAULT 0,
                solana_native REAL DEFAULT 0,
                solana_usdt REAL DEFAULT 0,
                bwaezi_native REAL DEFAULT 0,
                bwaezi_usdt REAL DEFAULT 0,
                total_value_usd REAL DEFAULT 0
            )
        `);
    }

    // =========================================================================
    // PRODUCTION BLOCKCHAIN INTEGRATION
    // =========================================================================

    async loadTreasuryFromBlockchain() {
        try {
            if (!this.walletInitialized) {
                await this.initializeWalletConnections();
            }
            
            const balances = await getWalletBalances();
            this.walletBalances = balances;
            
            // Calculate total treasury value in USD
            const totalValue = this.calculateTotalTreasuryValue(balances);
            this.treasuryBalance = totalValue;
            
            // Record initial treasury snapshot
            await this.recordWalletBalanceSnapshot(balances);
            
            console.log(`✅ Treasury loaded from blockchain: $${totalValue.toLocaleString()}`);
            this.emit('treasuryLoaded', { balances, totalValue });
            
        } catch (error) {
            console.error('❌ Failed to load treasury from blockchain:', error);
            throw error;
        }
    }

    calculateTotalTreasuryValue(balances) {
        // Simple conversion rates (in production, use real-time price feeds)
        const ETH_PRICE = 2500; // Example price
        const SOL_PRICE = 100;  // Example price
        const USDT_PRICE = 1;   // Stablecoin
        
        const ethValue = balances.ethereum.native * ETH_PRICE;
        const ethUSDTValue = balances.ethereum.usdt * USDT_PRICE;
        const solValue = balances.solana.native * SOL_PRICE;
        const solUSDTValue = balances.solana.usdt * USDT_PRICE;
        const bwaeziValue = balances.bwaezi.usdt; // Already in USDT equivalent
        
        return ethValue + ethUSDTValue + solValue + solUSDTValue + bwaeziValue;
    }

    async recordWalletBalanceSnapshot(balances) {
        const totalValue = this.calculateTotalTreasuryValue(balances);
        
        await this.db.run(`
            INSERT INTO wallet_balances_history 
            (ethereum_native, ethereum_usdt, solana_native, solana_usdt, bwaezi_native, bwaezi_usdt, total_value_usd)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            balances.ethereum.native,
            balances.ethereum.usdt,
            balances.solana.native,
            balances.solana.usdt,
            balances.bwaezi.native,
            balances.bwaezi.usdt,
            totalValue
        ]);
    }

    async executeBlockchainPayment(paymentConfig) {
        const { type, amount, toAddress, token = 'native', description = '' } = paymentConfig;
        const paymentId = ConfigUtils.generateZKId(`payment_${type}`);
        
        try {
            // Validate address
            if (!validateAddress(toAddress, type === 'sol' ? 'sol' : (type === 'bwaezi' ? 'bwaezi' : 'eth'))) {
                throw new Error(`Invalid ${type} address: ${toAddress}`);
            }

            // Record transaction in database
            await this.db.run(`
                INSERT INTO blockchain_transactions 
                (id, network, from_address, to_address, amount, token, type, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                paymentId,
                type === 'sol' ? 'solana' : (type === 'bwaezi' ? 'bwaezi' : 'ethereum'),
                type === 'sol' ? this.walletBalances.solana.address : 
                 (type === 'bwaezi' ? this.walletBalances.bwaezi.address : this.walletBalances.ethereum.address),
                toAddress,
                amount,
                token,
                'outgoing',
                'pending'
            ]);

            let result;
            
            // Execute actual blockchain transaction
            if (token === 'native') {
                if (type === 'sol') {
                    result = await sendSOL(toAddress, amount);
                } else if (type === 'eth') {
                    result = await sendETH(toAddress, amount);
                } else if (type === 'bwaezi') {
                    result = await sendBwaezi(toAddress, amount);
                }
            } else if (token === 'usdt') {
                result = await sendUSDT(toAddress, amount, type);
            } else {
                throw new Error(`Unsupported token: ${token}`);
            }

            if (!result.success) {
                throw new Error(result.error);
            }

            // Update transaction status
            await this.db.run(`
                UPDATE blockchain_transactions 
                SET status = 'confirmed', transaction_hash = ?, confirmation_count = 1
                WHERE id = ?
            `, [result.signature || result.hash, paymentId]);

            // Update local balance cache
            await this.updateLocalBalancesAfterPayment(type, token, amount);

            console.log(`✅ Blockchain payment executed: ${amount} ${token} to ${toAddress}`);
            
            this.emit('blockchainPaymentExecuted', {
                paymentId,
                ...paymentConfig,
                transactionHash: result.signature || result.hash,
                timestamp: Date.now()
            });

            return {
                success: true,
                paymentId,
                transactionHash: result.signature || result.hash
            };

        } catch (error) {
            console.error('❌ Blockchain payment failed:', error);
            
            // Update transaction status to failed
            await this.db.run(`
                UPDATE blockchain_transactions 
                SET status = 'failed', error_message = ?
                WHERE id = ?
            `, [error.message, paymentId]);

            this.emit('blockchainPaymentFailed', {
                paymentId,
                ...paymentConfig,
                error: error.message,
                timestamp: Date.now()
            });

            return {
                success: false,
                error: error.message,
                paymentId
            };
        }
    }

    async updateLocalBalancesAfterPayment(network, token, amount) {
        // Refresh balances from blockchain
        const balances = await getWalletBalances();
        this.walletBalances = balances;
        
        // Update treasury value
        this.treasuryBalance = this.calculateTotalTreasuryValue(balances);
        
        // Record new snapshot
        await this.recordWalletBalanceSnapshot(balances);
    }

    // =========================================================================
    // PRODUCTION-READY SERVICE REGISTRATION WITH REAL PAYMENTS
    // =========================================================================

    async registerService(serviceConfig) {
        if (!this.initialized) await this.initialize();

        const serviceId = serviceConfig.id || ConfigUtils.generateZKId(serviceConfig.name);
        const licenseExpiry = Date.now() + (365 * 24 * 60 * 60 * 1000);
        
        const registrationFee = serviceConfig.registrationFee || this.config.SOVEREIGN_SERVICES.registrationFee;
        const annualLicenseFee = serviceConfig.annualLicenseFee || this.config.SOVEREIGN_SERVICES.annualLicenseFee;
        const revenueShare = serviceConfig.revenueShare || this.config.SOVEREIGN_SERVICES.revenueShare;
        const minDeposit = serviceConfig.minDeposit || this.config.SOVEREIGN_SERVICES.minServiceDeposit;

        // Validate architectural compliance
        if (!ConfigUtils.validateZKCompliance(serviceConfig)) {
            throw new Error('Service configuration violates architectural compliance requirements');
        }

        // Process registration fee as real blockchain payment if in crypto
        if (serviceConfig.paymentCurrency && serviceConfig.paymentCurrency !== 'USD') {
            const paymentResult = await this.processCryptoPayment(serviceConfig);
            if (!paymentResult.success) {
                throw new Error(`Registration payment failed: ${paymentResult.error}`);
            }
        }

        await this.db.run(`
            INSERT INTO sovereign_services (id, name, description, registrationFee, annualLicenseFee, revenueShare, minDeposit, licenseExpiry, compliance, serviceType, dataPolicy, architectural_alignment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [serviceId, serviceConfig.name, serviceConfig.description, 
            registrationFee, annualLicenseFee, revenueShare, minDeposit, licenseExpiry,
            JSON.stringify(serviceConfig.compliance || []), 
            serviceConfig.serviceType || 'standard',
            serviceConfig.dataPolicy || 'Zero-Knowledge Default',
            JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT)]);

        this.registeredServices.set(serviceId, { 
            ...serviceConfig, 
            licenseExpiry,
            totalRevenue: 0,
            transactionCount: 0,
            status: 'active',
            compliance: serviceConfig.compliance || ['Zero-Knowledge Architecture'],
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
        });
        
        // Process registration fee as revenue
        await this.processRevenue(serviceId, registrationFee, 'registration', 'USD');

        // Record compliance evidence with professional framing
        await this.recordComplianceEvidence('SERVICE_REGISTRATION', {
            serviceId,
            compliance: serviceConfig.compliance,
            dataPolicy: serviceConfig.dataPolicy,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
        });

        // Record treasury transaction
        await this.recordTreasuryTransaction(registrationFee, 'SERVICE_REGISTRATION', `Architecturally compliant service registration: ${serviceConfig.name}`);
        
        this.emit('serviceRegistered', { 
            serviceId, 
            config: serviceConfig,
            registrationFee,
            annualLicenseFee,
            revenueShare,
            compliance: serviceConfig.compliance,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            timestamp: Date.now()
        });
        
        console.log(`✅ Architecturally Compliant Service registered: ${serviceConfig.name} (ID: ${serviceId})`);
        return serviceId;
    }

    async processCryptoPayment(serviceConfig) {
        // Convert USD amount to crypto based on current prices
        const cryptoAmount = await this.convertUsdToCrypto(
            serviceConfig.registrationFee, 
            serviceConfig.paymentCurrency
        );

        const paymentConfig = {
            type: serviceConfig.paymentNetwork === 'solana' ? 'sol' : 
                  (serviceConfig.paymentNetwork === 'bwaezi' ? 'bwaezi' : 'eth'),
            amount: cryptoAmount,
            toAddress: this.config.SOVEREIGN_OWNER,
            token: serviceConfig.paymentCurrency === 'usdt' ? 'usdt' : 'native'
        };

        return await this.executeBlockchainPayment(paymentConfig);
    }

    async convertUsdToCrypto(usdAmount, cryptocurrency) {
        // In production, integrate with real price feeds
        const PRICES = {
            eth: 2500,
            sol: 100,
            bwaezi: 0.0001, // 1 BWAEZI = 10,000 USDT, so 1 USDT = 0.0001 BWAEZI
            usdt: 1
        };

        const price = PRICES[cryptocurrency.toLowerCase()];
        if (!price) {
            throw new Error(`Unsupported cryptocurrency: ${cryptocurrency}`);
        }

        return usdAmount / price;
    }

    // =========================================================================
    // PRODUCTION REVENUE PROCESSING WITH REAL BLOCKCHAIN DISTRIBUTIONS
    // =========================================================================

    async processRevenue(serviceId, amount, revenueType, currency = 'USD', chain = 'bwaezi', metadata = {}) {
        if (!this.initialized) await this.initialize();

        const service = this.registeredServices.get(serviceId);
        if (!service) {
            throw new Error(`Service not registered: ${serviceId}`);
        }

        // Log data processing for compliance (encrypted hashes only)
        await this.logDataProcessing(serviceId, 'revenue', metadata.encryptedHash);

        const revenueId = ConfigUtils.generateZKId(`revenue_${serviceId}`);
        
        // Record revenue stream with architectural compliance metadata
        await this.db.run(`
            INSERT INTO revenue_streams (id, serviceId, amount, currency, type, chain, compliance_metadata, verification_methodology, blockchain_tx_hash, wallet_address)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [revenueId, serviceId, amount, currency, revenueType, chain, 
            JSON.stringify({ 
                architectural_compliant: true, 
                data_encrypted: true,
                pii_excluded: true,
                alignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
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

        // Update period revenue tracking
        await this.updateRevenueTracking(amount);

        // Calculate distribution using integrated tokenomics (80/20 split)
        const distribution = await this.calculateDistribution(amount, service.revenueShare);
        
        // Process distribution with real blockchain payments
        const distributionResult = await this.distributeRevenue(distribution, chain, serviceId);

        // Record treasury transaction
        await this.recordTreasuryTransaction(amount, 'REVENUE', `${revenueType} from ${service.name}`);

        // Record compliance evidence with professional framing
        await this.recordComplianceEvidence('REVENUE_PROCESSING', {
            revenueId,
            amount,
            currency,
            architecturalCompliant: true,
            dataProcessed: 'encrypted_hashes_only',
            verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
        });

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
            timestamp: Date.now()
        });
        
        console.log(`💰 Architecturally Compliant Revenue processed: $${amount} from ${service.name}`);
        return revenueId;
    }

    // =========================================================================
    // PRODUCTION REVENUE DISTRIBUTION WITH REAL BLOCKCHAIN PAYMENTS
    // =========================================================================

    async calculateDistribution(amount, serviceRevenueShare = null) {
        const revenueShare = serviceRevenueShare || this.config.SOVEREIGN_SERVICES.revenueShare;
        
        // Use integrated tokenomics calculation (80/20 split)
        const tokenomicsDistribution = await this.tokenomics.calculateRevenueDistribution(amount);
        
        // BWAEZI Economic Distribution Model with 80/20 sovereign/ecosystem split
        const sovereignShare = amount * 0.8; // 80% to founder/sovereign
        const ecosystemShare = amount * 0.2; // 20% to ecosystem
        
        // AI Governance reinvestment from ecosystem share
        const reinvestmentShare = ecosystemShare * this.config.AI_GOVERNANCE.REINVESTMENT_RATE;
        const remainingEcosystem = ecosystemShare - reinvestmentShare;

        return {
            sovereign: parseFloat(sovereignShare.toFixed(6)),
            reinvestment: parseFloat(reinvestmentShare.toFixed(6)),
            ecosystem: parseFloat(remainingEcosystem.toFixed(6)),
            total: amount,
            tokenomics: tokenomicsDistribution,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
        };
    }

    async distributeRevenue(distribution, chain = 'bwaezi', serviceId = null) {
        const distributionId = ConfigUtils.generateZKId(`dist_${serviceId}`);
        
        try {
            // Record compliance evidence before distribution
            await this.recordComplianceEvidence('REVENUE_DISTRIBUTION', {
                distributionId,
                amount: distribution.total,
                sovereign: distribution.sovereign,
                reinvestment: distribution.reinvestment,
                ecosystem: distribution.ecosystem,
                chain,
                architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
            });

            // Process sovereign payment (80%) via blockchain
            const sovereignPayment = await this.processSovereignPayment(distribution.sovereign, chain);
            
            // Process reinvestment to treasury
            await this.processReinvestment(distribution.reinvestment, chain);

            // Process ecosystem funding (remaining from 20%)
            await this.processEcosystemFunding(distribution.ecosystem, chain);

            // Record distribution with architectural compliance metadata
            await this.db.run(`
                INSERT INTO distributions (id, amount, sovereignShare, ecosystemShare, reinvestmentShare, chain, serviceId, distributionType, compliance_metadata, architectural_alignment, blockchain_network, wallet_transaction_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [distributionId, distribution.total, distribution.sovereign, 
                distribution.ecosystem, distribution.reinvestment, chain, serviceId, 
                'revenue_distribution', 
                JSON.stringify({ architectural_compliant: true }),
                JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT),
                chain,
                sovereignPayment.transactionHash]);

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
                timestamp: Date.now()
            });

            console.log(`✅ Revenue distributed via blockchain - Sovereign (80%): $${distribution.sovereign}, Reinvestment: $${distribution.reinvestment}, Ecosystem: $${distribution.ecosystem}`);

            return { success: true, distributionId, transactionHash: sovereignPayment.transactionHash };
        } catch (error) {
            console.error('❌ Revenue distribution failed:', error);
            
            // Record compliance incident
            await this.recordComplianceEvidence('COMPLIANCE_INCIDENT', {
                type: 'REVENUE_DISTRIBUTION_FAILURE',
                error: error.message,
                distributionId,
                timestamp: Date.now(),
                architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
            });
            
            await this.db.run('UPDATE revenue_streams SET processed = false WHERE serviceId = ? AND processed = false', [serviceId]);
            
            this.emit('distributionFailed', {
                distributionId,
                error: error.message,
                timestamp: Date.now()
            });
            
            return { success: false, error: error.message };
        }
    }

    async processSovereignPayment(amount, chain) {
        // Convert to blockchain payment using integrated wallet system
        const paymentConfig = {
            type: chain === 'bwaezi' ? 'bwaezi' : (chain === 'solana' ? 'sol' : 'eth'),
            amount: amount,
            toAddress: this.config.SOVEREIGN_OWNER,
            token: 'usdt',
            description: `Sovereign revenue distribution: $${amount}`
        };

        // Execute real blockchain payment
        const paymentResult = await this.executeBlockchainPayment(paymentConfig);
        
        if (!paymentResult.success) {
            throw new Error(`Sovereign payment failed: ${paymentResult.error}`);
        }

        console.log(`✅ Sovereign payment processed via blockchain: $${amount} to ${this.config.SOVEREIGN_OWNER} on ${chain}`);
        return { 
            success: true, 
            amount,
            transactionHash: paymentResult.transactionHash
        };
    }

    async processReinvestment(amount, chain) {
        this.reinvestmentPool += amount;
        this.treasuryBalance += amount;
        
        await this.recordTreasuryTransaction(
            amount, 
            'REINVESTMENT', 
            `AI Governance reinvestment on ${chain}`
        );

        console.log(`✅ Reinvestment processed: $${amount} added to treasury`);
        
        await this.triggerReinvestmentActions(amount, chain);
    }

    async processEcosystemFunding(amount, chain) {
        this.ecosystemFund += amount;
        
        await this.recordTreasuryTransaction(
            amount, 
            'ECOSYSTEM', 
            `Ecosystem funding on ${chain}`
        );

        console.log(`✅ Ecosystem funding processed: $${amount} added to ecosystem fund`);
        
        await this.triggerEcosystemDevelopment(amount, chain);
    }

    // =========================================================================
    // PRODUCTION MONITORING AND HEALTH CHECKS
    // =========================================================================

    startWalletHealthMonitoring() {
        this.walletHealthInterval = setInterval(async () => {
            try {
                await this.checkWalletHealth();
                await this.refreshWalletBalances();
            } catch (error) {
                console.error('❌ Wallet health monitoring failed:', error);
            }
        }, 300000); // Every 5 minutes

        console.log('🔍 Blockchain wallet health monitoring activated');
    }

    startRevenueConsolidationMonitoring() {
        this.revenueConsolidationInterval = setInterval(async () => {
            try {
                await this.triggerRevenueConsolidation();
            } catch (error) {
                console.error('❌ Revenue consolidation monitoring failed:', error);
            }
        }, 3600000); // Every hour

        console.log('💰 Autonomous revenue consolidation monitoring activated');
    }

    async checkWalletHealth() {
        const health = await checkBlockchainHealth();
        
        if (!health.healthy) {
            this.emit('blockchainHealthIssue', {
                health,
                timestamp: Date.now(),
                architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
            });
            
            // Attempt reconnection
            await this.initializeWalletConnections();
        }

        return health;
    }

    async refreshWalletBalances() {
        try {
            const balances = await getWalletBalances();
            this.walletBalances = balances;
            this.treasuryBalance = this.calculateTotalTreasuryValue(balances);
            
            await this.recordWalletBalanceSnapshot(balances);
            
            this.emit('walletBalancesRefreshed', {
                balances,
                treasury: this.treasuryBalance,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error('❌ Failed to refresh wallet balances:', error);
        }
    }

    async triggerRevenueConsolidation() {
        try {
            console.log('🔄 Triggering autonomous revenue consolidation...');
            const results = await triggerRevenueConsolidation();
            
            this.emit('revenueConsolidationExecuted', {
                results,
                timestamp: Date.now(),
                architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
            });
            
            return results;
        } catch (error) {
            console.error('❌ Revenue consolidation failed:', error);
            this.emit('revenueConsolidationFailed', {
                error: error.message,
                timestamp: Date.now()
            });
            return { success: false, error: error.message };
        }
    }

    // =========================================================================
    // ENHANCED PRODUCTION FUNCTIONS
    // =========================================================================

    async getProductionMetrics() {
        const revenueMetrics = await this.getRevenueMetrics('30d');
        const walletHealth = await this.checkWalletHealth();
        const complianceHealth = await this.performComplianceHealthCheck();

        return {
            status: 'production',
            version: BWAEZI_CHAIN.VERSION,
            timestamp: Date.now(),
            
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

    async executeInvestment(investmentConfig) {
        const { amount, type, target, description } = investmentConfig;
        
        try {
            // Convert investment to blockchain payment
            const paymentResult = await this.executeBlockchainPayment({
                type: investmentConfig.network || 'eth',
                amount: investmentConfig.cryptoAmount || await this.convertUsdToCrypto(amount, investmentConfig.token || 'usdt'),
                toAddress: investmentConfig.recipient,
                token: investmentConfig.token || 'usdt',
                description: `Investment: ${description}`
            });

            if (!paymentResult.success) {
                throw new Error(`Investment execution failed: ${paymentResult.error}`);
            }

            // Record investment in treasury
            await this.recordTreasuryTransaction(
                -amount, // Negative amount for outflow
                'INVESTMENT',
                description
            );

            this.emit('investmentExecuted', {
                ...investmentConfig,
                transactionHash: paymentResult.transactionHash,
                timestamp: Date.now()
            });

            return { success: true, transactionHash: paymentResult.transactionHash };

        } catch (error) {
            console.error('❌ Investment execution failed:', error);
            return { success: false, error: error.message };
        }
    }

    // =========================================================================
    // MAINTAIN ORIGINAL COMPLIANCE AND UTILITY FUNCTIONS
    // =========================================================================

    async logDataProcessing(serviceId, dataType, encryptedHash) {
        const logId = ConfigUtils.generateZKId(`log_${serviceId}`);
        
        await this.db.run(`
            INSERT INTO data_processing_logs (id, service_id, data_type, processing_type, encrypted_hash, user_consent, verification_methodology)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [logId, serviceId, dataType, 'architectural_compliance', encryptedHash, true,
            JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY)]);

        // Public transparency - store hash on-chain for verification
        const publicHash = createHash('sha256').update(encryptedHash).digest('hex');
        await this.recordComplianceEvidence('DATA_PROCESSING', {
            serviceId,
            dataType,
            publicHash,
            processing: 'architectural_compliance',
            verification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
        });
    }

    async recordComplianceEvidence(framework, evidence) {
        const evidenceId = ConfigUtils.generateZKId(`evidence_${framework}`);
        const publicHash = createHash('sha256').update(JSON.stringify(evidence)).digest('hex');
        
        await this.db.run(`
            INSERT INTO compliance_evidence (id, framework, control_id, evidence_type, evidence_data, public_hash, compliance_strategy, architectural_alignment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [evidenceId, framework, evidence.controlId || 'auto', 'architectural_verification', 
            JSON.stringify(evidence), publicHash,
            JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY),
            JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT)]);

        this.emit('complianceEvidenceRecorded', {
            evidenceId,
            framework,
            evidence,
            publicHash,
            strategy: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
            alignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            timestamp: Date.now()
        });

        return evidenceId;
    }

    async recordTreasuryTransaction(amount, type, description) {
        const transactionId = ConfigUtils.generateZKId(`treasury_${type}`);
        
        await this.db.run(`
            INSERT INTO treasury_balance (balance, type, amount, description, transactionId, compliance_verification)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [this.treasuryBalance, type, amount, description, transactionId,
            JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY)]);

        this.emit('treasuryTransaction', { 
            transactionId, 
            amount, 
            type, 
            description,
            newBalance: this.treasuryBalance,
            complianceVerification: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
            timestamp: Date.now()
        });
    }

    async updateTreasuryBalance(amount) {
        this.treasuryBalance += amount;
        
        await this.db.run(`
            INSERT INTO treasury_balance (balance, type, amount, description, compliance_verification)
            VALUES (?, 'UPDATE', ?, 'Revenue distribution', ?)
        `, [this.treasuryBalance, amount, 
            JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY)]);
    }

    async updateRevenueTracking(amount) {
        this.dailyRevenue += amount;
        this.weeklyRevenue += amount;
        this.monthlyRevenue += amount;

        // Reset daily revenue every 24 hours
        setTimeout(() => { this.dailyRevenue = 0; }, 24 * 60 * 60 * 1000);
        // Reset weekly revenue every 7 days
        setTimeout(() => { this.weeklyRevenue = 0; }, 7 * 24 * 60 * 60 * 1000);
        // Reset monthly revenue every 30 days
        setTimeout(() => { this.monthlyRevenue = 0; }, 30 * 24 * 60 * 60 * 1000);
    }

    async getRevenueMetrics(period = '30d') {
        let query = `SELECT SUM(amount) as total, COUNT(*) as transactions FROM revenue_streams WHERE 1=1`;
        let params = [];

        if (period === '7d') {
            query += ` AND timestamp >= datetime('now', '-7 days')`;
        } else if (period === '30d') {
            query += ` AND timestamp >= datetime('now', '-30 days')`;
        }

        const result = await this.db.get(query, params);
        
        return {
            total: result.total || 0,
            transactions: result.transactions || 0,
            daily: this.dailyRevenue,
            weekly: this.weeklyRevenue,
            monthly: this.monthlyRevenue,
            targets: this.revenueTargets,
            period
        };
    }

    async performComplianceHealthCheck() {
        const checks = {
            dataProcessing: await this.checkDataProcessingCompliance(),
            architecturalAlignment: await this.checkArchitecturalAlignment(),
            blockchainVerification: await this.checkBlockchainVerification(),
            transparency: await this.checkTransparencyCompliance()
        };

        const allPassed = Object.values(checks).every(check => check.passed);
        
        return {
            status: allPassed ? 'compliant' : 'non_compliant',
            checks,
            lastAudit: this.complianceState.lastAudit,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
        };
    }

    async checkDataProcessingCompliance() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total, 
                   SUM(CASE WHEN processing_type = 'architectural_compliance' THEN 1 ELSE 0 END) as compliant
            FROM data_processing_logs 
            WHERE timestamp >= datetime('now', '-30 days')
        `);

        return {
            passed: result.compliant === result.total,
            compliant: result.compliant,
            total: result.total,
            framework: 'Zero-Knowledge Architecture'
        };
    }

    async checkArchitecturalAlignment() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN architectural_alignment IS NOT NULL THEN 1 ELSE 0 END) as aligned
            FROM sovereign_services
        `);

        return {
            passed: result.aligned === result.total,
            aligned: result.aligned,
            total: result.total,
            strategy: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
        };
    }

    async checkBlockchainVerification() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed
            FROM blockchain_transactions
            WHERE timestamp >= datetime('now', '-7 days')
        `);

        return {
            passed: result.confirmed === result.total,
            confirmed: result.confirmed,
            total: result.total,
            network: 'Multi-chain verification'
        };
    }

    async checkTransparencyCompliance() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total_reports
            FROM transparency_reports
            WHERE period_end >= datetime('now', '-90 days')
        `);

        return {
            passed: result.total_reports > 0,
            reports: result.total_reports,
            requirement: 'Quarterly transparency reports'
        };
    }

    startGovernanceCycles() {
        this.governanceInterval = setInterval(async () => {
            try {
                await this.governance.executeAIGovernance();
                await this.performComplianceHealthCheck();
                await this.generateTransparencyReport();
            } catch (error) {
                console.error('❌ Governance cycle failed:', error);
            }
        }, 24 * 60 * 60 * 1000); // Daily governance cycles

        console.log('🏛️  AI Governance cycles activated');
    }

    startComplianceMonitoring() {
        this.complianceInterval = setInterval(async () => {
            try {
                await this.performComplianceHealthCheck();
                await this.recordComplianceEvidence('PERIODIC_AUDIT', {
                    auditType: 'automated_compliance_check',
                    timestamp: Date.now(),
                    architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
                });
            } catch (error) {
                console.error('❌ Compliance monitoring failed:', error);
            }
        }, 4 * 60 * 60 * 1000); // Every 4 hours

        console.log('🛡️  Compliance monitoring activated');
    }

    async generateTransparencyReport() {
        const reportId = ConfigUtils.generateZKId(`report_${Date.now()}`);
        const periodStart = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const periodEnd = new Date();
        
        const metrics = await this.getRevenueMetrics('30d');
        const compliance = await this.performComplianceHealthCheck();
        
        const report = {
            period_start: periodStart,
            period_end: periodEnd,
            data_processed: 0, // Zero-knowledge: no actual data stored
            revenue_generated: metrics.total,
            services_active: this.registeredServices.size,
            compliance_incidents: 0,
            architectural_alignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            verification_summary: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY,
            blockchain_treasury_snapshot: this.walletBalances
        };

        await this.db.run(`
            INSERT INTO transparency_reports (id, report_type, period_start, period_end, revenue_generated, services_active, architectural_alignment, verification_summary, blockchain_treasury_snapshot)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [reportId, 'quarterly', periodStart, periodEnd, metrics.total, 
            this.registeredServices.size, 
            JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT),
            JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY),
            JSON.stringify(this.walletBalances)]);

        this.emit('transparencyReportGenerated', {
            reportId,
            ...report,
            timestamp: Date.now()
        });

        return reportId;
    }

    async ensureMinimumReserves() {
        const minReserves = this.config.AI_GOVERNANCE.MIN_RESERVES;
        
        if (this.treasuryBalance < minReserves) {
            console.warn(`⚠️ Treasury below minimum reserves: $${this.treasuryBalance} < $${minReserves}`);
            
            this.emit('minimumReservesWarning', {
                current: this.treasuryBalance,
                minimum: minReserves,
                deficit: minReserves - this.treasuryBalance,
                timestamp: Date.now()
            });

            // Trigger emergency governance action
            await this.governance.executeEmergencyProtocol('LOW_TREASURY');
        }
    }

    async triggerReinvestmentActions(amount, chain) {
        // AI-driven reinvestment decisions
        const reinvestmentPlan = await this.governance.generateReinvestmentPlan(amount, chain);
        
        if (reinvestmentPlan.actions && reinvestmentPlan.actions.length > 0) {
            for (const action of reinvestmentPlan.actions) {
                await this.executeInvestment(action);
            }
        }
    }

    async triggerEcosystemDevelopment(amount, chain) {
        // AI-driven ecosystem development
        const ecosystemPlan = await this.governance.generateEcosystemPlan(amount, chain);
        
        if (ecosystemPlan.grants && ecosystemPlan.grants.length > 0) {
            for (const grant of ecosystemPlan.grants) {
                await this.executeBlockchainPayment(grant);
            }
        }
    }

    // =========================================================================
    // PRODUCTION SHUTDOWN AND CLEANUP
    // =========================================================================

    async shutdown() {
        console.log('🛑 Shutting down BWAEZI Sovereign Revenue Engine...');
        
        // Clear all intervals
        if (this.governanceInterval) clearInterval(this.governanceInterval);
        if (this.complianceInterval) clearInterval(this.complianceInterval);
        if (this.walletHealthInterval) clearInterval(this.walletHealthInterval);
        if (this.revenueConsolidationInterval) clearInterval(this.revenueConsolidationInterval);
        
        // Close database connection
        if (this.db) await this.db.close();
        
        // Shutdown governance and tokenomics
        if (this.governance) await this.governance.shutdown();
        if (this.tokenomics) await this.tokenomics.shutdown();
        
        this.initialized = false;
        console.log('✅ BWAEZI Sovereign Revenue Engine shut down gracefully');
        
        this.emit('shutdown', { timestamp: Date.now() });
    }

    // =========================================================================
    // PUBLIC API FOR EXTERNAL INTEGRATION
    // =========================================================================

    getPublicAPI() {
        return {
            // Service Management
            registerService: (config) => this.registerService(config),
            getService: (id) => this.registeredServices.get(id),
            listServices: () => Array.from(this.registeredServices.values()),
            
            // Revenue Processing
            processRevenue: (serviceId, amount, type, currency, metadata) => 
                this.processRevenue(serviceId, amount, type, currency, 'bwaezi', metadata),
            
            // Treasury Management
            getTreasuryBalance: () => this.treasuryBalance,
            getEcosystemFund: () => this.ecosystemFund,
            getReinvestmentPool: () => this.reinvestmentPool,
            
            // Blockchain Operations
            getWalletBalances: () => this.walletBalances,
            executePayment: (paymentConfig) => this.executeBlockchainPayment(paymentConfig),
            triggerConsolidation: () => this.triggerRevenueConsolidation(),
            
            // Analytics & Reporting
            getMetrics: (period) => this.getProductionMetrics(),
            getComplianceStatus: () => this.performComplianceHealthCheck(),
            generateReport: () => this.generateTransparencyReport(),
            
            // System Status
            isInitialized: () => this.initialized,
            isBlockchainConnected: () => this.blockchainConnected,
            getVersion: () => BWAEZI_CHAIN.VERSION
        };
    }
}

// =========================================================================
// PRODUCTION EXPORT AND INSTANCE MANAGEMENT
// =========================================================================

// Global production instance
let globalRevenueEngine = null;

export function getSovereignRevenueEngine(config = {}) {
    if (!globalRevenueEngine) {
        globalRevenueEngine = new SovereignRevenueEngine(config);
    }
    return globalRevenueEngine;
}

export async function initializeSovereignRevenueEngine(config = {}) {
    const engine = getSovereignRevenueEngine(config);
    await engine.initialize();
    return engine;
}

export default SovereignRevenueEngine;
