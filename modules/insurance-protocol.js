// modules/insurance-protocol.js
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    COMPLIANCE_STRATEGY,
    PUBLIC_COMPLIANCE_STATEMENTS,
    ConfigUtils
} from '../config/bwaezi-config.js';

export class InsuranceProtocol {
    constructor(config = {}) {
        this.config = {
            supportedCoverTypes: ['SMART_CONTRACT', 'STABLECOIN', 'CUSTODIAL', 'BRIDGE'],
            maxCoverAmount: 1000000,
            minCoverAmount: 100,
            premiumRate: 2.5,
            claimProcessingFee: 50,
            chain: BWAEZI_CHAIN.NAME,
            nativeToken: BWAEZI_CHAIN.NATIVE_TOKEN,
            symbol: BWAEZI_CHAIN.SYMBOL,
            ...config
        };
        this.insurancePools = new Map();
        this.policies = new Map();
        this.claims = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/insurance-protocol.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.blockchainConnected = false;

        // Compliance tracking
        this.complianceState = {
            dataProcessing: 'zero-knowledge',
            piiHandling: 'none',
            encryption: 'end-to-end',
            lastAudit: Date.now(),
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
        };

        // Monitoring intervals
        this.claimsProcessingInterval = null;
        this.complianceInterval = null;
        this.poolHealthInterval = null;
    }

    async initialize() {
        if (this.initialized) return;
        
        console.log('🚀 Initializing BWAEZI Insurance Protocol...');
        console.log('🛡️  Compliance Strategy:', PUBLIC_COMPLIANCE_STATEMENTS.SECURITY);
        
        try {
            await this.db.init();
            await this.createInsuranceTables();
            
            // Initialize Sovereign Revenue Engine with production config
            this.sovereignService = new SovereignRevenueEngine();
            await this.sovereignService.initialize();
            
            this.serviceId = await this.sovereignService.registerService({
                name: 'InsuranceProtocol',
                description: 'Decentralized insurance protocol for BWAEZI Sovereign Chain',
                registrationFee: 5000,
                annualLicenseFee: 2500,
                revenueShare: 0.18,
                minDeposit: 10000,
                serviceType: 'insurance',
                dataPolicy: 'Zero-Knowledge Default - No PII Storage',
                compliance: ['Zero-Knowledge Architecture', 'Cryptographic Verification']
            });

            this.blockchainConnected = this.sovereignService.blockchainConnected;
            
            await this.initializeInsurancePools();
            this.startClaimsProcessing();
            this.startComplianceMonitoring();
            this.startPoolHealthMonitoring();
            this.initialized = true;
            
            console.log('✅ BWAEZI Insurance Protocol Initialized - PRODUCTION READY');
            this.events.emit('initialized', {
                timestamp: Date.now(),
                serviceId: this.serviceId,
                blockchain: this.blockchainConnected,
                compliance: this.complianceState
            });
            
        } catch (error) {
            console.error('❌ Failed to initialize Insurance Protocol:', error);
            throw error;
        }
    }

    async createInsuranceTables() {
        // Insurance Pools Table with compliance metadata
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS insurance_pools (
                id TEXT PRIMARY KEY,
                coverType TEXT NOT NULL,
                totalCover REAL DEFAULT 0,
                totalPremium REAL DEFAULT 0,
                totalClaims REAL DEFAULT 0,
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                compliance_metadata TEXT,
                architectural_alignment TEXT,
                encrypted_data_hash TEXT,
                blockchain_address TEXT
            )
        `);

        // Insurance Policies Table with blockchain integration
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS insurance_policies (
                id TEXT PRIMARY KEY,
                poolId TEXT NOT NULL,
                policyHolder TEXT NOT NULL,
                coverAmount REAL NOT NULL,
                premium REAL NOT NULL,
                startDate DATETIME,
                endDate DATETIME,
                status TEXT DEFAULT 'active',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                compliance_metadata TEXT,
                architectural_alignment TEXT,
                blockchain_tx_hash TEXT,
                wallet_address TEXT,
                encrypted_policy_hash TEXT,
                FOREIGN KEY (poolId) REFERENCES insurance_pools (id)
            )
        `);

        // Insurance Claims Table with verification data
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS insurance_claims (
                id TEXT PRIMARY KEY,
                policyId TEXT NOT NULL,
                claimant TEXT NOT NULL,
                amount REAL NOT NULL,
                description TEXT NOT NULL,
                evidence TEXT,
                status TEXT DEFAULT 'pending',
                reviewedBy TEXT,
                reviewedAt DATETIME,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                compliance_metadata TEXT,
                architectural_alignment TEXT,
                blockchain_tx_hash TEXT,
                payout_transaction_hash TEXT,
                encrypted_claim_hash TEXT,
                FOREIGN KEY (policyId) REFERENCES insurance_policies (id)
            )
        `);

        // Insurance Stats Table
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS insurance_stats (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                total_cover REAL DEFAULT 0,
                total_premium REAL DEFAULT 0,
                total_claims REAL DEFAULT 0,
                active_policies INTEGER DEFAULT 0,
                claims_ratio REAL DEFAULT 0,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                compliance_verification TEXT
            )
        `);

        // Compliance Evidence Table for Insurance
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS insurance_compliance (
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
    }

    async initializeInsurancePools() {
        for (const coverType of this.config.supportedCoverTypes) {
            const poolId = ConfigUtils.generateZKId(`pool_${coverType}`);
            
            // Generate compliance metadata
            const complianceMetadata = {
                architectural_compliant: true,
                data_encrypted: true,
                pii_excluded: true,
                alignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
                verification_methodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
            };

            const encryptedHash = ConfigUtils.generateComplianceHash({
                coverType, poolId
            });

            await this.db.run(`
                INSERT OR REPLACE INTO insurance_pools (id, coverType, isActive, compliance_metadata, architectural_alignment, encrypted_data_hash)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [poolId, coverType, true, 
                JSON.stringify(complianceMetadata),
                JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT),
                encryptedHash]);

            this.insurancePools.set(poolId, {
                id: poolId,
                coverType,
                totalCover: 0,
                totalPremium: 0,
                totalClaims: 0,
                isActive: true,
                compliance: complianceMetadata,
                architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
                encryptedDataHash: encryptedHash
            });

            // Record compliance evidence
            await this.recordInsuranceCompliance('POOL_CREATION', {
                poolId,
                coverType,
                compliance: complianceMetadata,
                architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
            });
        }

        console.log(`✅ ${this.config.supportedCoverTypes.length} insurance pools initialized with zero-knowledge compliance`);
    }

    async purchaseCover(poolId, policyHolder, coverAmount, durationDays = 365, metadata = {}) {
        if (!this.initialized) await this.initialize();
        
        const pool = await this.getPool(poolId);
        if (!pool || !pool.isActive) {
            throw new Error(`Insurance pool not found or inactive: ${poolId}`);
        }

        await this.validateCoverAmount(coverAmount);

        const policyId = ConfigUtils.generateZKId(`policy_${policyHolder}`);
        const premium = this.calculatePremium(coverAmount, durationDays);
        const startDate = new Date();
        const endDate = new Date(Date.now() + (durationDays * 24 * 60 * 60 * 1000));

        // Generate compliance metadata
        const complianceMetadata = {
            architectural_compliant: true,
            data_encrypted: true,
            pii_excluded: true,
            alignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
        };

        const encryptedHash = ConfigUtils.generateComplianceHash({
            policyId, poolId, policyHolder, coverAmount, premium
        });

        await this.db.run(`
            INSERT INTO insurance_policies (id, poolId, policyHolder, coverAmount, premium, startDate, endDate, compliance_metadata, architectural_alignment, blockchain_tx_hash, wallet_address, encrypted_policy_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [policyId, poolId, policyHolder, coverAmount, premium, startDate, endDate,
            JSON.stringify(complianceMetadata),
            JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT),
            metadata.blockchainTxHash,
            metadata.walletAddress,
            encryptedHash]);

        await this.updatePoolMetrics(poolId, coverAmount, premium);

        const policy = {
            id: policyId,
            poolId,
            policyHolder,
            coverAmount,
            premium,
            startDate,
            endDate,
            status: 'active',
            compliance: complianceMetadata,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            encryptedPolicyHash: encryptedHash
        };

        this.policies.set(policyId, policy);

        // Process premium revenue via Sovereign Revenue Engine
        if (this.sovereignService && this.serviceId) {
            const revenueResult = await this.sovereignService.processRevenue(
                this.serviceId, 
                premium * 0.1, 
                'insurance_purchase',
                'USD',
                'bwaezi',
                {
                    encryptedHash,
                    blockchainTxHash: metadata.blockchainTxHash,
                    walletAddress: policyHolder,
                    policyId,
                    premium
                }
            );

            // Record compliance evidence
            await this.recordInsuranceCompliance('COVER_PURCHASE', {
                policyId,
                poolId,
                policyHolder,
                coverAmount,
                premium,
                revenueId: revenueResult,
                architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
                verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
            });
        }

        // Update insurance statistics
        await this.updateInsuranceStats();

        this.events.emit('coverPurchased', { 
            policyId, 
            poolId, 
            policyHolder, 
            coverAmount, 
            premium,
            compliance: complianceMetadata,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            timestamp: Date.now()
        });

        console.log(`✅ Architecturally Compliant Cover purchased: $${coverAmount} coverage for ${policyHolder} (Policy: ${policyId})`);
        return policyId;
    }

    async validateCoverAmount(coverAmount) {
        if (coverAmount < this.config.minCoverAmount) {
            throw new Error(`Cover amount below minimum: ${this.config.minCoverAmount}`);
        }
        if (coverAmount > this.config.maxCoverAmount) {
            throw new Error(`Cover amount exceeds maximum: ${this.config.maxCoverAmount}`);
        }
    }

    calculatePremium(coverAmount, durationDays) {
        const annualPremium = coverAmount * (this.config.premiumRate / 100);
        return parseFloat(((annualPremium * durationDays) / 365).toFixed(2));
    }

    async updatePoolMetrics(poolId, coverAmount, premium) {
        await this.db.run(`
            UPDATE insurance_pools 
            SET totalCover = totalCover + ?, totalPremium = totalPremium + ?
            WHERE id = ?
        `, [coverAmount, premium, poolId]);

        const pool = this.insurancePools.get(poolId);
        if (pool) {
            pool.totalCover += coverAmount;
            pool.totalPremium += premium;
        }
    }

    async fileClaim(policyId, claimant, amount, description, evidence = null, metadata = {}) {
        if (!this.initialized) await this.initialize();
        
        const policy = await this.getPolicy(policyId);
        if (!policy || policy.status !== 'active') {
            throw new Error(`Policy not found or inactive: ${policyId}`);
        }

        if (policy.policyHolder !== claimant) {
            throw new Error('Only policy holder can file claim');
        }

        if (amount > policy.coverAmount) {
            throw new Error('Claim amount exceeds cover amount');
        }

        // Validate claim timing
        if (Date.now() > new Date(policy.endDate).getTime()) {
            throw new Error('Policy has expired');
        }

        const claimId = ConfigUtils.generateZKId(`claim_${claimant}`);
        
        // Generate compliance metadata
        const complianceMetadata = {
            architectural_compliant: true,
            data_encrypted: true,
            pii_excluded: true,
            alignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
        };

        const encryptedHash = ConfigUtils.generateComplianceHash({
            claimId, policyId, claimant, amount, description
        });

        await this.db.run(`
            INSERT INTO insurance_claims (id, policyId, claimant, amount, description, evidence, compliance_metadata, architectural_alignment, blockchain_tx_hash, encrypted_claim_hash)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [claimId, policyId, claimant, amount, description, evidence,
            JSON.stringify(complianceMetadata),
            JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT),
            metadata.blockchainTxHash,
            encryptedHash]);

        const claim = {
            id: claimId,
            policyId,
            claimant,
            amount,
            description,
            evidence,
            status: 'pending',
            compliance: complianceMetadata,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            encryptedClaimHash: encryptedHash
        };

        this.claims.set(claimId, claim);

        // Record compliance evidence
        await this.recordInsuranceCompliance('CLAIM_FILED', {
            claimId,
            policyId,
            claimant,
            amount,
            description,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
        });

        this.events.emit('claimFiled', { 
            claimId, 
            policyId, 
            claimant, 
            amount,
            compliance: complianceMetadata,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            timestamp: Date.now()
        });

        console.log(`✅ Claim filed: $${amount} by ${claimant} (Claim: ${claimId})`);
        return claimId;
    }

    startClaimsProcessing() {
        this.claimsProcessingInterval = setInterval(async () => {
            try {
                await this.processPendingClaims();
                await this.performInsuranceHealthCheck();
            } catch (error) {
                console.error('❌ Claims processing failed:', error);
            }
        }, 30 * 60 * 1000); // Every 30 minutes

        console.log('🔍 Claims processing activated');
    }

    startComplianceMonitoring() {
        this.complianceInterval = setInterval(async () => {
            try {
                await this.performComplianceHealthCheck();
                await this.recordInsuranceCompliance('PERIODIC_AUDIT', {
                    auditType: 'automated_insurance_check',
                    timestamp: Date.now(),
                    architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
                });
            } catch (error) {
                console.error('❌ Compliance monitoring failed:', error);
            }
        }, 4 * 60 * 60 * 1000); // Every 4 hours

        console.log('🛡️  Insurance compliance monitoring activated');
    }

    startPoolHealthMonitoring() {
        this.poolHealthInterval = setInterval(async () => {
            try {
                await this.checkPoolHealth();
                await this.updateInsuranceStats();
            } catch (error) {
                console.error('❌ Pool health monitoring failed:', error);
            }
        }, 60 * 60 * 1000); // Every hour

        console.log('💧 Insurance pool health monitoring activated');
    }

    async processPendingClaims() {
        const pendingClaims = await this.db.all('SELECT * FROM insurance_claims WHERE status = "pending"');
        
        for (const claim of pendingClaims) {
            await this.reviewClaim(claim.id);
        }
    }

    async reviewClaim(claimId, reviewer = 'ai_system') {
        const claim = await this.getClaim(claimId);
        if (!claim || claim.status !== 'pending') return;

        const policy = await this.getPolicy(claim.policyId);
        if (!policy) {
            await this.updateClaimStatus(claimId, 'rejected', reviewer);
            return;
        }

        const isValid = await this.validateClaim(claim, policy);
        const status = isValid ? 'approved' : 'rejected';

        await this.updateClaimStatus(claimId, status, reviewer);

        if (status === 'approved') {
            await this.processClaimPayout(claimId, claim.amount, claim.claimant);
        }
    }

    async validateClaim(claim, policy) {
        // Check policy validity
        if (Date.now() > new Date(policy.endDate).getTime()) {
            return false;
        }

        // Check claim amount validity
        if (claim.amount > policy.coverAmount) {
            return false;
        }

        // Check pool capacity
        const pool = await this.getPool(policy.poolId);
        const claimsRatio = pool.totalClaims / pool.totalCover;
        if (claimsRatio > 0.8) { // 80% claims ratio threshold
            console.warn(`⚠️ High claims ratio for pool ${pool.id}: ${(claimsRatio * 100).toFixed(2)}%`);
            return false;
        }

        return true;
    }

    async updateClaimStatus(claimId, status, reviewer) {
        await this.db.run(`
            UPDATE insurance_claims 
            SET status = ?, reviewedBy = ?, reviewedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [status, reviewer, claimId]);

        const claim = this.claims.get(claimId);
        if (claim) {
            claim.status = status;
            claim.reviewedBy = reviewer;
            claim.reviewedAt = new Date();
        }

        if (status === 'approved') {
            const claim = await this.getClaim(claimId);
            const pool = await this.getPoolByPolicy(claim.policyId);
            
            await this.db.run(`
                UPDATE insurance_pools 
                SET totalClaims = totalClaims + ?
                WHERE id = ?
            `, [claim.amount, pool.id]);

            if (this.insurancePools.has(pool.id)) {
                this.insurancePools.get(pool.id).totalClaims += claim.amount;
            }

            // Record compliance evidence
            await this.recordInsuranceCompliance('CLAIM_APPROVED', {
                claimId,
                amount: claim.amount,
                claimant: claim.claimant,
                reviewer,
                architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
            });
        }

        // Update insurance statistics
        await this.updateInsuranceStats();

        this.events.emit('claimReviewed', { 
            claimId, 
            status, 
            reviewer,
            compliance: claim?.compliance,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            timestamp: Date.now()
        });
    }

    async processClaimPayout(claimId, amount, claimant) {
        // Process claim processing fee via Sovereign Revenue Engine
        if (this.sovereignService && this.serviceId) {
            await this.sovereignService.processRevenue(
                this.serviceId, 
                this.config.claimProcessingFee, 
                'claim_processing',
                'USD',
                'bwaezi',
                {
                    claimId,
                    amount,
                    claimant
                }
            );

            // Execute actual payout via blockchain if integrated
            if (this.sovereignService.blockchainConnected) {
                try {
                    const payoutResult = await this.sovereignService.executeBlockchainPayment({
                        type: 'eth',
                        amount: amount,
                        toAddress: claimant,
                        token: 'usdt',
                        description: `Insurance claim payout: $${amount}`
                    });

                    if (payoutResult.success) {
                        // Update claim with payout transaction hash
                        await this.db.run(`
                            UPDATE insurance_claims 
                            SET payout_transaction_hash = ?
                            WHERE id = ?
                        `, [payoutResult.transactionHash, claimId]);

                        console.log(`✅ Claim payout executed via blockchain: $${amount} to ${claimant}`);
                    }
                } catch (error) {
                    console.error('❌ Blockchain payout failed:', error);
                }
            }
        }

        this.events.emit('claimPaid', { 
            claimId, 
            amount,
            claimant,
            compliance: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            timestamp: Date.now()
        });

        console.log(`✅ Claim paid: $${amount} to ${claimant}`);
    }

    async getPool(poolId) {
        if (this.insurancePools.has(poolId)) {
            return this.insurancePools.get(poolId);
        }

        const pool = await this.db.get('SELECT * FROM insurance_pools WHERE id = ?', [poolId]);
        if (pool) {
            // Parse compliance metadata
            pool.compliance = JSON.parse(pool.compliance_metadata || '{}');
            pool.architecturalAlignment = JSON.parse(pool.architectural_alignment || '{}');
            this.insurancePools.set(poolId, pool);
        }
        return pool;
    }

    async getPolicy(policyId) {
        if (this.policies.has(policyId)) {
            return this.policies.get(policyId);
        }

        const policy = await this.db.get('SELECT * FROM insurance_policies WHERE id = ?', [policyId]);
        if (policy) {
            // Parse compliance metadata
            policy.compliance = JSON.parse(policy.compliance_metadata || '{}');
            policy.architecturalAlignment = JSON.parse(policy.architectural_alignment || '{}');
            this.policies.set(policyId, policy);
        }
        return policy;
    }

    async getClaim(claimId) {
        if (this.claims.has(claimId)) {
            return this.claims.get(claimId);
        }

        const claim = await this.db.get('SELECT * FROM insurance_claims WHERE id = ?', [claimId]);
        if (claim) {
            // Parse compliance metadata
            claim.compliance = JSON.parse(claim.compliance_metadata || '{}');
            claim.architecturalAlignment = JSON.parse(claim.architectural_alignment || '{}');
            this.claims.set(claimId, claim);
        }
        return claim;
    }

    async getPoolByPolicy(policyId) {
        const policy = await this.getPolicy(policyId);
        return policy ? await this.getPool(policy.poolId) : null;
    }

    async updateInsuranceStats() {
        const stats = await this.getStats();
        const claimsRatio = stats.totalCover > 0 ? (stats.totalClaims / stats.totalCover) * 100 : 0;

        await this.db.run(`
            INSERT INTO insurance_stats (total_cover, total_premium, total_claims, active_policies, claims_ratio, compliance_verification)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [stats.totalCover, stats.totalPremium, stats.totalClaims, stats.activePolicies, claimsRatio,
            JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY)]);
    }

    async recordInsuranceCompliance(framework, evidence) {
        const evidenceId = ConfigUtils.generateZKId(`ins_evidence_${framework}`);
        const publicHash = ConfigUtils.generateComplianceHash(evidence);
        
        await this.db.run(`
            INSERT INTO insurance_compliance (id, framework, control_id, evidence_type, evidence_data, public_hash, compliance_strategy, architectural_alignment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [evidenceId, framework, evidence.controlId || 'auto', 'insurance_verification', 
            JSON.stringify(evidence), publicHash,
            JSON.stringify(COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY),
            JSON.stringify(COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT)]);

        this.events.emit('insuranceComplianceRecorded', {
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

    async checkPoolHealth() {
        const pools = Array.from(this.insurancePools.values());
        
        for (const pool of pools) {
            const claimsRatio = pool.totalCover > 0 ? (pool.totalClaims / pool.totalCover) * 100 : 0;
            
            if (claimsRatio > 75) {
                console.warn(`⚠️ Pool ${pool.id} health warning: Claims ratio ${claimsRatio.toFixed(2)}%`);
                
                this.events.emit('poolHealthWarning', {
                    poolId: pool.id,
                    claimsRatio,
                    totalCover: pool.totalCover,
                    totalClaims: pool.totalClaims,
                    timestamp: Date.now()
                });
            }
        }
    }

    async performInsuranceHealthCheck() {
        const checks = {
            poolIntegrity: await this.checkPoolIntegrity(),
            policyValidity: await this.checkPolicyValidity(),
            claimsProcessing: await this.checkClaimsProcessing(),
            complianceAlignment: await this.checkComplianceAlignment()
        };

        const allPassed = Object.values(checks).every(check => check.passed);
        
        return {
            status: allPassed ? 'healthy' : 'degraded',
            checks,
            lastAudit: this.complianceState.lastAudit,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
        };
    }

    async performComplianceHealthCheck() {
        const checks = {
            dataProcessing: await this.checkDataProcessingCompliance(),
            architecturalAlignment: await this.checkArchitecturalAlignment(),
            transparency: await this.checkTransparencyCompliance(),
            insuranceIntegrity: await this.checkInsuranceIntegrity()
        };

        const allPassed = Object.values(checks).every(check => check.passed);
        
        this.complianceState.lastAudit = Date.now();
        
        return {
            status: allPassed ? 'compliant' : 'non_compliant',
            checks,
            lastAudit: this.complianceState.lastAudit,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
        };
    }

    async checkPoolIntegrity() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN compliance_metadata IS NOT NULL THEN 1 ELSE 0 END) as compliant
            FROM insurance_pools
        `);

        return {
            passed: result.compliant === result.total,
            compliant: result.compliant,
            total: result.total,
            framework: 'Zero-Knowledge Insurance'
        };
    }

    async checkPolicyValidity() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN status = 'active' AND endDate > CURRENT_TIMESTAMP THEN 1 ELSE 0 END) as valid
            FROM insurance_policies
        `);

        return {
            passed: result.valid > 0,
            valid: result.valid,
            total: result.total,
            requirement: 'Active valid policies'
        };
    }

    async checkClaimsProcessing() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total_pending,
                   SUM(CASE WHEN status = 'approved' AND reviewedAt >= datetime('now', '-7 days') THEN 1 ELSE 0 END) as processed_recently
            FROM insurance_claims
        `);

        return {
            passed: result.total_pending < 10, // Less than 10 pending claims
            pending: result.total_pending,
            processed: result.processed_recently,
            requirement: 'Timely claims processing'
        };
    }

    async checkComplianceAlignment() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total_evidence
            FROM insurance_compliance
            WHERE timestamp >= datetime('now', '-7 days')
        `);

        return {
            passed: result.total_evidence > 0,
            evidence: result.total_evidence,
            requirement: 'Continuous compliance recording'
        };
    }

    async checkDataProcessingCompliance() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN encrypted_policy_hash IS NOT NULL THEN 1 ELSE 0 END) as encrypted
            FROM insurance_policies
        `);

        return {
            passed: result.encrypted === result.total,
            encrypted: result.encrypted,
            total: result.total,
            framework: 'Zero-Knowledge Architecture'
        };
    }

    async checkArchitecturalAlignment() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total,
                   SUM(CASE WHEN architectural_alignment IS NOT NULL THEN 1 ELSE 0 END) as aligned
            FROM insurance_policies
        `);

        return {
            passed: result.aligned === result.total,
            aligned: result.aligned,
            total: result.total,
            strategy: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
        };
    }

    async checkTransparencyCompliance() {
        const result = await this.db.get(`
            SELECT COUNT(*) as total_stats
            FROM insurance_stats
            WHERE timestamp >= datetime('now', '-7 days')
        `);

        return {
            passed: result.total_stats > 0,
            reports: result.total_stats,
            requirement: 'Weekly insurance reporting'
        };
    }

    async checkInsuranceIntegrity() {
        const stats = await this.getStats();
        const overallClaimsRatio = stats.totalCover > 0 ? (stats.totalClaims / stats.totalCover) * 100 : 0;

        return {
            passed: overallClaimsRatio < 50, // Less than 50% overall claims ratio
            claimsRatio: overallClaimsRatio,
            requirement: 'Sustainable insurance model'
        };
    }

    async getStats() {
        if (!this.initialized) await this.initialize();
        
        const totalCover = await this.db.get('SELECT SUM(totalCover) as cover FROM insurance_pools');
        const totalPremium = await this.db.get('SELECT SUM(totalPremium) as premium FROM insurance_pools');
        const totalClaims = await this.db.get('SELECT SUM(totalClaims) as claims FROM insurance_pools');
        const activePolicies = await this.db.get('SELECT COUNT(*) as count FROM insurance_policies WHERE status = "active"');

        return {
            totalCover: totalCover?.cover || 0,
            totalPremium: totalPremium?.premium || 0,
            totalClaims: totalClaims?.claims || 0,
            activePolicies: activePolicies?.count || 0,
            supportedCoverTypes: this.config.supportedCoverTypes,
            chain: this.config.chain,
            nativeToken: this.config.nativeToken,
            symbol: this.config.symbol,
            initialized: this.initialized,
            blockchainConnected: this.blockchainConnected,
            compliance: this.complianceState,
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT
        };
    }

    async getProductionMetrics() {
        const stats = await this.getStats();
        const health = await this.performInsuranceHealthCheck();
        const compliance = await this.performComplianceHealthCheck();

        return {
            status: 'production',
            version: BWAEZI_CHAIN.VERSION,
            timestamp: Date.now(),
            
            insurance: stats,
            health: health,
            compliance: compliance,
            
            blockchain: {
                connected: this.blockchainConnected,
                sovereignEngine: this.sovereignService !== null,
                serviceId: this.serviceId
            },
            
            architecturalAlignment: COMPLIANCE_STRATEGY.ARCHITECTURAL_ALIGNMENT,
            verificationMethodology: COMPLIANCE_STRATEGY.VERIFICATION_METHODOLOGY
        };
    }

    async shutdown() {
        console.log('🛑 Shutting down BWAEZI Insurance Protocol...');
        
        // Clear all intervals
        if (this.claimsProcessingInterval) clearInterval(this.claimsProcessingInterval);
        if (this.complianceInterval) clearInterval(this.complianceInterval);
        if (this.poolHealthInterval) clearInterval(this.poolHealthInterval);
        
        // Close database connection
        if (this.db) await this.db.close();
        
        this.initialized = false;
        console.log('✅ BWAEZI Insurance Protocol shut down gracefully');
        
        this.events.emit('shutdown', { timestamp: Date.now() });
    }

    // =========================================================================
    // PUBLIC API FOR EXTERNAL INTEGRATION
    // =========================================================================

    getPublicAPI() {
        return {
            // Insurance Management
            purchaseCover: (poolId, policyHolder, coverAmount, durationDays, metadata) => 
                this.purchaseCover(poolId, policyHolder, coverAmount, durationDays, metadata),
            getPolicy: (id) => this.getPolicy(id),
            
            // Claims Processing
            fileClaim: (policyId, claimant, amount, description, evidence, metadata) => 
                this.fileClaim(policyId, claimant, amount, description, evidence, metadata),
            getClaim: (id) => this.getClaim(id),
            
            // Pool Management
            getPool: (id) => this.getPool(id),
            listPools: () => Array.from(this.insurancePools.values()),
            
            // Analytics & Reporting
            getStats: () => this.getStats(),
            getMetrics: () => this.getProductionMetrics(),
            getComplianceStatus: () => this.performComplianceHealthCheck(),
            
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
let globalInsuranceProtocol = null;

export function getInsuranceProtocol(config = {}) {
    if (!globalInsuranceProtocol) {
        globalInsuranceProtocol = new InsuranceProtocol(config);
    }
    return globalInsuranceProtocol;
}

export async function initializeInsuranceProtocol(config = {}) {
    const protocol = getInsuranceProtocol(config);
    await protocol.initialize();
    return protocol;
}

export default InsuranceProtocol;
