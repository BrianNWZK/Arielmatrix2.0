// modules/digital-identity-engine.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { ZeroKnowledgeProofEngine } from './zero-knowledge-proof-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createCipheriv, createDecipheriv, createSign, createVerify } from 'crypto';

export class DigitalIdentityEngine {
    constructor(config = {}) {
        this.config = {
            identityTypes: ['individual', 'organization', 'device', 'asset'],
            verificationLevels: ['basic', 'verified', 'enhanced', 'certified'],
            credentialTypes: ['passport', 'drivers_license', 'national_id', 'proof_of_address', 'certificate'],
            maxIdentityAge: 365 * 24 * 60 * 60 * 1000, // 1 year
            keyRotationInterval: 90 * 24 * 60 * 60 * 1000, // 90 days
            revocationCheckInterval: 300000, // 5 minutes
            ...config
        };
        this.identityRegistry = new Map();
        this.credentialStore = new Map();
        this.verificationSessions = new Map();
        this.revocationList = new Map();
        this.zkpEngine = new ZeroKnowledgeProofEngine();
        this.db = new ArielSQLiteEngine({ path: './data/digital-identity-engine.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.masterKey = null;
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        await this.generateMasterKey();
        await this.zkpEngine.initialize();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'DigitalIdentityEngine',
            description: 'Self-sovereign digital identity management with zero-knowledge verification',
            registrationFee: 12000,
            annualLicenseFee: 6000,
            revenueShare: 0.18,
            serviceType: 'identity_infrastructure',
            dataPolicy: 'Encrypted identity proofs only - No PII storage',
            compliance: ['Zero-Knowledge Architecture', 'Identity Verification']
        });

        await this.loadRevocationList();
        await this.startKeyRotationCycle();
        await this.startRevocationChecks();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            identityTypes: this.config.identityTypes,
            verificationLevels: this.config.verificationLevels
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS digital_identities (
                id TEXT PRIMARY KEY,
                identityType TEXT NOT NULL,
                publicKey TEXT NOT NULL,
                verificationLevel TEXT DEFAULT 'basic',
                status TEXT DEFAULT 'active',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastVerified DATETIME,
                expiresAt DATETIME,
                metadata TEXT,
                revocationReason TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS identity_credentials (
                id TEXT PRIMARY KEY,
                identityId TEXT NOT NULL,
                credentialType TEXT NOT NULL,
                credentialData BLOB NOT NULL,
                issuer TEXT NOT NULL,
                issuedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                expiresAt DATETIME,
                isRevoked BOOLEAN DEFAULT false,
                revocationReason TEXT,
                proofHash TEXT NOT NULL,
                FOREIGN KEY (identityId) REFERENCES digital_identities (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS verification_sessions (
                id TEXT PRIMARY KEY,
                identityId TEXT NOT NULL,
                sessionType TEXT NOT NULL,
                challenge TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                requestedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                completedAt DATETIME,
                verificationData TEXT,
                zkProofId TEXT,
                FOREIGN KEY (identityId) REFERENCES digital_identities (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS revocation_list (
                id TEXT PRIMARY KEY,
                identityId TEXT NOT NULL,
                credentialId TEXT,
                reason TEXT NOT NULL,
                revokedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                revokedBy TEXT NOT NULL,
                effectiveImmediately BOOLEAN DEFAULT true
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS identity_attestations (
                id TEXT PRIMARY KEY,
                identityId TEXT NOT NULL,
                attesterId TEXT NOT NULL,
                attestationType TEXT NOT NULL,
                attestationData TEXT NOT NULL,
                signature TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                expiresAt DATETIME,
                isValid BOOLEAN DEFAULT true
            )
        `);
    }

    async generateMasterKey() {
        if (!this.masterKey) {
            this.masterKey = randomBytes(32);
        }
    }

    async createIdentity(identityType, publicKey, metadata = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateIdentityType(identityType);
        await this.validatePublicKey(publicKey);

        const identityId = this.generateIdentityId();
        const expiresAt = new Date(Date.now() + this.config.maxIdentityAge);
        
        await this.db.run(`
            INSERT INTO digital_identities (id, identityType, publicKey, metadata, expiresAt)
            VALUES (?, ?, ?, ?, ?)
        `, [identityId, identityType, publicKey, JSON.stringify(metadata), expiresAt]);

        const identity = {
            id: identityId,
            identityType,
            publicKey,
            verificationLevel: 'basic',
            status: 'active',
            createdAt: new Date(),
            expiresAt,
            metadata
        };

        this.identityRegistry.set(identityId, identity);

        // Process identity creation fee
        if (this.sovereignService && this.serviceId) {
            await this.sovereignService.processRevenue(
                this.serviceId,
                25, // Identity creation fee
                'identity_creation',
                'USD',
                'bwaezi',
                {
                    identityId,
                    identityType,
                    verificationLevel: 'basic'
                }
            );
        }

        this.events.emit('identityCreated', {
            identityId,
            identityType,
            publicKey: this.maskPublicKey(publicKey),
            timestamp: new Date()
        });

        return identityId;
    }

    async validateIdentityType(identityType) {
        if (!this.config.identityTypes.includes(identityType)) {
            throw new Error(`Invalid identity type: ${identityType}. Supported: ${this.config.identityTypes.join(', ')}`);
        }
    }

    async validatePublicKey(publicKey) {
        if (typeof publicKey !== 'string' || publicKey.length < 64) {
            throw new Error('Invalid public key format');
        }

        // Check for duplicate public key
        const existing = await this.db.get(
            'SELECT id FROM digital_identities WHERE publicKey = ? AND status = "active"',
            [publicKey]
        );

        if (existing) {
            throw new Error('Public key already registered to an active identity');
        }
    }

    async addCredential(identityId, credentialType, credentialData, issuer, expiresAt = null) {
        if (!this.initialized) await this.initialize();

        const identity = await this.getIdentity(identityId);
        if (!identity) {
            throw new Error(`Identity not found: ${identityId}`);
        }

        await this.validateCredentialType(credentialType);

        const credentialId = this.generateCredentialId();
        const encryptedData = await this.encryptCredentialData(credentialData);
        const proofHash = this.hashCredentialData(credentialData);
        
        const defaultExpiry = new Date(Date.now() + (365 * 24 * 60 * 60 * 1000)); // 1 year
        const credentialExpiresAt = expiresAt || defaultExpiry;

        await this.db.run(`
            INSERT INTO identity_credentials (id, identityId, credentialType, credentialData, issuer, expiresAt, proofHash)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [credentialId, identityId, credentialType, encryptedData, issuer, credentialExpiresAt, proofHash]);

        const credential = {
            id: credentialId,
            identityId,
            credentialType,
            credentialData: encryptedData,
            issuer,
            issuedAt: new Date(),
            expiresAt: credentialExpiresAt,
            isRevoked: false,
            proofHash
        };

        this.credentialStore.set(credentialId, credential);

        this.events.emit('credentialAdded', {
            credentialId,
            identityId,
            credentialType,
            issuer,
            timestamp: new Date()
        });

        return credentialId;
    }

    async validateCredentialType(credentialType) {
        if (!this.config.credentialTypes.includes(credentialType)) {
            throw new Error(`Invalid credential type: ${credentialType}. Supported: ${this.config.credentialTypes.join(', ')}`);
        }
    }

    async encryptCredentialData(credentialData) {
        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-gcm', this.masterKey, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(JSON.stringify(credentialData), 'utf8'),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();

        return Buffer.concat([iv, authTag, encrypted]);
    }

    async decryptCredentialData(encryptedData) {
        const iv = encryptedData.slice(0, 16);
        const authTag = encryptedData.slice(16, 32);
        const encrypted = encryptedData.slice(32);
        
        const decipher = createDecipheriv('aes-256-gcm', this.masterKey, iv);
        decipher.setAuthTag(authTag);
        
        const decrypted = Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);

        return JSON.parse(decrypted.toString('utf8'));
    }

    hashCredentialData(credentialData) {
        return createHash('sha256')
            .update(JSON.stringify(credentialData))
            .digest('hex');
    }

    async initiateVerification(identityId, verificationLevel, requiredClaims = []) {
        if (!this.initialized) await this.initialize();

        const identity = await this.getIdentity(identityId);
        if (!identity) {
            throw new Error(`Identity not found: ${identityId}`);
        }

        await this.validateVerificationLevel(verificationLevel);

        const sessionId = this.generateSessionId();
        const challenge = this.generateVerificationChallenge();
        
        await this.db.run(`
            INSERT INTO verification_sessions (id, identityId, sessionType, challenge, status)
            VALUES (?, ?, ?, ?, ?)
        `, [sessionId, identityId, verificationLevel, challenge, 'pending']);

        const session = {
            id: sessionId,
            identityId,
            sessionType: verificationLevel,
            challenge,
            status: 'pending',
            requestedAt: new Date(),
            requiredClaims
        };

        this.verificationSessions.set(sessionId, session);

        this.events.emit('verificationInitiated', {
            sessionId,
            identityId,
            verificationLevel,
            challenge,
            timestamp: new Date()
        });

        return { sessionId, challenge };
    }

    async validateVerificationLevel(verificationLevel) {
        if (!this.config.verificationLevels.includes(verificationLevel)) {
            throw new Error(`Invalid verification level: ${verificationLevel}. Supported: ${this.config.verificationLevels.join(', ')}`);
        }
    }

    generateVerificationChallenge() {
        return randomBytes(32).toString('hex');
    }

    async completeVerification(sessionId, signature, zkProof = null, disclosedClaims = {}) {
        if (!this.initialized) await this.initialize();

        const session = await this.getVerificationSession(sessionId);
        if (!session) {
            throw new Error(`Verification session not found: ${sessionId}`);
        }

        if (session.status !== 'pending') {
            throw new Error(`Verification session already completed: ${session.status}`);
        }

        const identity = await this.getIdentity(session.identityId);
        
        try {
            // Verify the signature against the challenge
            const isValidSignature = await this.verifySignature(
                session.challenge, 
                signature, 
                identity.publicKey
            );

            if (!isValidSignature) {
                throw new Error('Invalid signature for verification challenge');
            }

            let zkProofId = null;
            if (zkProof) {
                // Verify zero-knowledge proof if provided
                zkProofId = await this.verifyZKProof(zkProof, session, disclosedClaims);
            }

            // Update identity verification level
            await this.updateVerificationLevel(identity.id, session.sessionType);

            // Update session status
            await this.db.run(`
                UPDATE verification_sessions 
                SET status = 'completed', completedAt = CURRENT_TIMESTAMP, verificationData = ?, zkProofId = ?
                WHERE id = ?
            `, [JSON.stringify(disclosedClaims), zkProofId, sessionId]);

            session.status = 'completed';
            session.completedAt = new Date();
            session.verificationData = disclosedClaims;
            session.zkProofId = zkProofId;

            // Process verification fee
            if (this.sovereignService && this.serviceId) {
                await this.sovereignService.processRevenue(
                    this.serviceId,
                    this.calculateVerificationFee(session.sessionType),
                    'identity_verification',
                    'USD',
                    'bwaezi',
                    {
                        sessionId,
                        identityId: identity.id,
                        verificationLevel: session.sessionType,
                        zkProofUsed: !!zkProof
                    }
                );
            }

            this.events.emit('verificationCompleted', {
                sessionId,
                identityId: identity.id,
                verificationLevel: session.sessionType,
                zkProofId,
                timestamp: new Date()
            });

            return true;
        } catch (error) {
            await this.db.run(`
                UPDATE verification_sessions 
                SET status = 'failed'
                WHERE id = ?
            `, [sessionId]);

            session.status = 'failed';

            this.events.emit('verificationFailed', {
                sessionId,
                identityId: identity.id,
                error: error.message,
                timestamp: new Date()
            });

            throw error;
        }
    }

    async verifySignature(message, signature, publicKey) {
        try {
            const verify = createVerify('SHA256');
            verify.update(message);
            verify.end();
            return verify.verify(publicKey, signature, 'hex');
        } catch (error) {
            return false;
        }
    }

    async verifyZKProof(zkProof, session, disclosedClaims) {
        try {
            const proofStatement = {
                publicInputs: {
                    identityId: session.identityId,
                    verificationLevel: session.sessionType,
                    disclosedClaims: disclosedClaims,
                    timestamp: new Date().toISOString()
                }
            };

            const proofId = await this.zkpEngine.generateProof(
                'membership',
                proofStatement,
                { secret: zkProof.secret },
                null,
                { parameters: zkProof.parameters }
            );

            const isValid = await this.zkpEngine.verifyProof(proofId);
            
            if (!isValid) {
                throw new Error('Zero-knowledge proof verification failed');
            }

            return proofId;
        } catch (error) {
            throw new Error(`ZK proof verification failed: ${error.message}`);
        }
    }

    async updateVerificationLevel(identityId, verificationLevel) {
        await this.db.run(`
            UPDATE digital_identities 
            SET verificationLevel = ?, lastVerified = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [verificationLevel, identityId]);

        const identity = this.identityRegistry.get(identityId);
        if (identity) {
            identity.verificationLevel = verificationLevel;
            identity.lastVerified = new Date();
        }
    }

    calculateVerificationFee(verificationLevel) {
        const feeStructure = {
            'basic': 5,
            'verified': 15,
            'enhanced': 50,
            'certified': 100
        };
        return feeStructure[verificationLevel] || 5;
    }

    async revokeIdentity(identityId, reason, revokedBy) {
        if (!this.initialized) await this.initialize();

        const identity = await this.getIdentity(identityId);
        if (!identity) {
            throw new Error(`Identity not found: ${identityId}`);
        }

        const revocationId = this.generateRevocationId();
        
        await this.db.run(`
            INSERT INTO revocation_list (id, identityId, reason, revokedBy)
            VALUES (?, ?, ?, ?)
        `, [revocationId, identityId, reason, revokedBy]);

        await this.db.run(`
            UPDATE digital_identities 
            SET status = 'revoked', revocationReason = ?
            WHERE id = ?
        `, [reason, identityId]);

        identity.status = 'revoked';
        identity.revocationReason = reason;

        // Revoke all associated credentials
        await this.db.run(`
            UPDATE identity_credentials 
            SET isRevoked = true, revocationReason = ?
            WHERE identityId = ?
        `, [`Identity revoked: ${reason}`, identityId]);

        this.revocationList.set(identityId, {
            id: revocationId,
            identityId,
            reason,
            revokedBy,
            revokedAt: new Date()
        });

        this.events.emit('identityRevoked', {
            identityId,
            reason,
            revokedBy,
            timestamp: new Date()
        });

        return revocationId;
    }

    async attestIdentity(attesterId, identityId, attestationType, attestationData, privateKey) {
        if (!this.initialized) await this.initialize();

        const identity = await this.getIdentity(identityId);
        if (!identity) {
            throw new Error(`Identity not found: ${identityId}`);
        }

        const attester = await this.getIdentity(attesterId);
        if (!attester) {
            throw new Error(`Attester identity not found: ${attesterId}`);
        }

        const attestationId = this.generateAttestationId();
        const attestationPayload = {
            attestationId,
            attesterId,
            identityId,
            attestationType,
            attestationData,
            timestamp: new Date().toISOString()
        };

        const signature = this.signAttestation(attestationPayload, privateKey);
        
        await this.db.run(`
            INSERT INTO identity_attestations (id, identityId, attesterId, attestationType, attestationData, signature)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [attestationId, identityId, attesterId, attestationType, JSON.stringify(attestationData), signature]);

        const attestation = {
            id: attestationId,
            identityId,
            attesterId,
            attestationType,
            attestationData,
            signature,
            createdAt: new Date(),
            isValid: true
        };

        this.events.emit('attestationCreated', {
            attestationId,
            identityId,
            attesterId,
            attestationType,
            timestamp: new Date()
        });

        return attestationId;
    }

    signAttestation(payload, privateKey) {
        const sign = createSign('SHA256');
        sign.update(JSON.stringify(payload));
        sign.end();
        return sign.sign(privateKey, 'hex');
    }

    async verifyAttestation(attestationId) {
        const attestation = await this.db.get(
            'SELECT * FROM identity_attestations WHERE id = ?',
            [attestationId]
        );

        if (!attestation) {
            throw new Error(`Attestation not found: ${attestationId}`);
        }

        const attester = await this.getIdentity(attestation.attesterId);
        if (!attester) {
            throw new Error(`Attester identity not found: ${attestation.attesterId}`);
        }

        const payload = {
            attestationId: attestation.id,
            attesterId: attestation.attesterId,
            identityId: attestation.identityId,
            attestationType: attestation.attestationType,
            attestationData: JSON.parse(attestation.attestationData),
            timestamp: attestation.createdAt
        };

        const isValid = this.verifySignature(
            JSON.stringify(payload),
            attestation.signature,
            attester.publicKey
        );

        if (!isValid) {
            await this.db.run(`
                UPDATE identity_attestations SET isValid = false WHERE id = ?
            `, [attestationId]);
        }

        return isValid;
    }

    async getIdentity(identityId) {
        if (this.identityRegistry.has(identityId)) {
            return this.identityRegistry.get(identityId);
        }

        const identity = await this.db.get(
            'SELECT * FROM digital_identities WHERE id = ?',
            [identityId]
        );

        if (identity) {
            identity.metadata = JSON.parse(identity.metadata || '{}');
            this.identityRegistry.set(identityId, identity);
        }

        return identity;
    }

    async getVerificationSession(sessionId) {
        if (this.verificationSessions.has(sessionId)) {
            return this.verificationSessions.get(sessionId);
        }

        const session = await this.db.get(
            'SELECT * FROM verification_sessions WHERE id = ?',
            [sessionId]
        );

        if (session) {
            session.verificationData = session.verificationData ? JSON.parse(session.verificationData) : null;
            this.verificationSessions.set(sessionId, session);
        }

        return session;
    }

    async isIdentityRevoked(identityId) {
        if (this.revocationList.has(identityId)) {
            return true;
        }

        const revocation = await this.db.get(
            'SELECT id FROM revocation_list WHERE identityId = ?',
            [identityId]
        );

        return !!revocation;
    }

    async loadRevocationList() {
        const revocations = await this.db.all('SELECT * FROM revocation_list');
        
        for (const revocation of revocations) {
            this.revocationList.set(revocation.identityId, revocation);
        }
    }

    async startKeyRotationCycle() {
        setInterval(async () => {
            await this.rotateExpiredKeys();
        }, 24 * 60 * 60 * 1000); // Daily key rotation check
    }

    async rotateExpiredKeys() {
        const cutoffTime = new Date(Date.now() - this.config.keyRotationInterval);
        
        const expiredIdentities = await this.db.all(`
            SELECT id FROM digital_identities 
            WHERE lastVerified < ? AND status = 'active'
        `, [cutoffTime]);

        for (const identity of expiredIdentities) {
            this.events.emit('keyRotationRequired', {
                identityId: identity.id,
                lastVerified: identity.lastVerified,
                timestamp: new Date()
            });
        }
    }

    async startRevocationChecks() {
        setInterval(async () => {
            await this.checkRevocationStatus();
        }, this.config.revocationCheckInterval);
    }

    async checkRevocationStatus() {
        // Check for identities that need to be revoked due to policy violations
        const suspiciousIdentities = await this.detectSuspiciousActivity();
        
        for (const identityId of suspiciousIdentities) {
            await this.revokeIdentity(
                identityId, 
                'Suspicious activity detected', 
                'system'
            );
        }
    }

    async detectSuspiciousActivity() {
        // Implement real suspicious activity detection
        const suspicious = [];
        
        // Check for identities with multiple failed verification attempts
        const failedAttempts = await this.db.all(`
            SELECT identityId, COUNT(*) as failCount
            FROM verification_sessions 
            WHERE status = 'failed' AND requestedAt >= datetime('now', '-1 hour')
            GROUP BY identityId
            HAVING failCount > 5
        `);

        for (const attempt of failedAttempts) {
            suspicious.push(attempt.identityId);
        }

        return suspicious;
    }

    generateIdentityId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `identity_${timestamp}_${random}`;
    }

    generateCredentialId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `credential_${timestamp}_${random}`;
    }

    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `session_${timestamp}_${random}`;
    }

    generateRevocationId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `revocation_${timestamp}_${random}`;
    }

    generateAttestationId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(10).toString('hex');
        return `attestation_${timestamp}_${random}`;
    }

    maskPublicKey(publicKey) {
        if (publicKey.length <= 16) return publicKey;
        return publicKey.substring(0, 8) + '...' + publicKey.substring(publicKey.length - 8);
    }

    async getIdentityStats() {
        if (!this.initialized) await this.initialize();

        const identityStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalIdentities,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeIdentities,
                SUM(CASE WHEN status = 'revoked' THEN 1 ELSE 0 END) as revokedIdentities,
                COUNT(DISTINCT identityType) as uniqueTypes
            FROM digital_identities
        `);

        const verificationStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalSessions,
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedSessions,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedSessions,
                AVG(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successRate
            FROM verification_sessions 
            WHERE requestedAt >= datetime('now', '-7 days')
        `);

        const credentialStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalCredentials,
                SUM(CASE WHEN isRevoked = 1 THEN 1 ELSE 0 END) as revokedCredentials,
                COUNT(DISTINCT credentialType) as uniqueCredentialTypes
            FROM identity_credentials
        `);

        return {
            identities: identityStats,
            verifications: verificationStats,
            credentials: credentialStats,
            timestamp: new Date()
        };
    }

    async cleanupExpiredData() {
        const cutoffTime = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago
        
        await this.db.run(`
            DELETE FROM verification_sessions 
            WHERE completedAt < ? OR (status = 'pending' AND requestedAt < datetime('now', '-7 days'))
        `, [cutoffTime]);

        await this.db.run(`
            DELETE FROM identity_credentials 
            WHERE expiresAt < ? AND isRevoked = 1
        `, [cutoffTime]);

        console.log('✅ Cleaned up expired identity data');
    }
}

export default DigitalIdentityEngine;
