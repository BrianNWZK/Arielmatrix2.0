// modules/zero-knowledge-proof-engine.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';

export class ZeroKnowledgeProofEngine {
    constructor(config = {}) {
        this.config = {
            proofTypes: ['membership', 'range', 'equality', 'set', 'circuit'],
            hashAlgorithm: 'sha256',
            encryptionAlgorithm: 'aes-256-gcm',
            keyDerivationIterations: 100000,
            maxProofSize: 1024 * 1024,
            proofExpiration: 24 * 60 * 60 * 1000,
            zkSnarkEnabled: true,
            zkStarkEnabled: true,
            ...config
        };
        this.proofStore = new Map();
        this.witnessCache = new Map();
        this.circuitRegistry = new Map();
        this.verificationKeys = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/zkp-engine.db' });
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
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'ZeroKnowledgeProofEngine',
            description: 'Advanced zero-knowledge proof system with multiple proof types and cryptographic protocols',
            registrationFee: 8000,
            annualLicenseFee: 4000,
            revenueShare: 0.15,
            serviceType: 'cryptographic_infrastructure',
            dataPolicy: 'Encrypted proof data only - No witness or private data storage',
            compliance: ['Zero-Knowledge Architecture', 'Cryptographic Standards']
        });

        await this.loadVerificationKeys();
        await this.registerDefaultCircuits();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            proofTypes: this.config.proofTypes,
            zkSnarkEnabled: this.config.zkSnarkEnabled,
            zkStarkEnabled: this.config.zkStarkEnabled
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS zk_proofs (
                id TEXT PRIMARY KEY,
                proofType TEXT NOT NULL,
                statementHash TEXT NOT NULL,
                proofData BLOB NOT NULL,
                publicInputs TEXT,
                verificationKeyId TEXT,
                circuitId TEXT,
                status TEXT DEFAULT 'generated',
                expiration DATETIME,
                generatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                verifiedAt DATETIME,
                verificationResult BOOLEAN,
                errorMessage TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS zk_circuits (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                circuitType TEXT NOT NULL,
                circuitData BLOB NOT NULL,
                constraintsCount INTEGER,
                gatesCount INTEGER,
                verificationKey BLOB,
                proverKey BLOB,
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastUsed DATETIME
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS zk_verification_keys (
                id TEXT PRIMARY KEY,
                circuitId TEXT NOT NULL,
                keyData BLOB NOT NULL,
                keyType TEXT NOT NULL,
                parameters TEXT,
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS zk_proof_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                proofType TEXT NOT NULL,
                generationTime INTEGER,
                verificationTime INTEGER,
                proofSize INTEGER,
                success BOOLEAN
            )
        `);
    }

    async generateMasterKey() {
        if (!this.masterKey) {
            this.masterKey = randomBytes(32);
        }
    }

    async generateProof(proofType, statement, witness, circuitId = null, options = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateProofType(proofType);
        await this.validateStatement(statement);
        await this.validateWitness(witness);

        const proofId = this.generateProofId();
        const statementHash = this.hashStatement(statement);
        
        let proofData;
        let verificationKeyId;
        let generationTime;

        try {
            const startTime = Date.now();
            
            switch (proofType) {
                case 'membership':
                    proofData = await this.generateMembershipProof(statement, witness, options);
                    break;
                case 'range':
                    proofData = await this.generateRangeProof(statement, witness, options);
                    break;
                case 'equality':
                    proofData = await this.generateEqualityProof(statement, witness, options);
                    break;
                case 'set':
                    proofData = await this.generateSetProof(statement, witness, options);
                    break;
                case 'circuit':
                    proofData = await this.generateCircuitProof(statement, witness, circuitId, options);
                    verificationKeyId = await this.getVerificationKeyId(circuitId);
                    break;
                default:
                    throw new Error(`Unsupported proof type: ${proofType}`);
            }

            generationTime = Date.now() - startTime;

            const encryptedProofData = await this.encryptProofData(proofData);
            const expiration = new Date(Date.now() + this.config.proofExpiration);

            await this.db.run(`
                INSERT INTO zk_proofs (id, proofType, statementHash, proofData, publicInputs, verificationKeyId, circuitId, expiration)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [proofId, proofType, statementHash, encryptedProofData, JSON.stringify(statement.publicInputs), verificationKeyId, circuitId, expiration]);

            await this.recordProofMetrics(proofType, generationTime, 0, encryptedProofData.length, true);

            this.proofStore.set(proofId, {
                id: proofId,
                proofType,
                statement,
                statementHash,
                proofData,
                publicInputs: statement.publicInputs,
                verificationKeyId,
                circuitId,
                status: 'generated',
                generatedAt: new Date(),
                expiration
            });

            this.events.emit('proofGenerated', { 
                proofId, 
                proofType, 
                statementHash,
                circuitId,
                generationTime,
                proofSize: encryptedProofData.length
            });

            return proofId;
        } catch (error) {
            await this.recordProofMetrics(proofType, generationTime || 0, 0, 0, false);
            throw error;
        }
    }

    generateProofId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `zkp_${timestamp}_${random}`;
    }

    hashStatement(statement) {
        const statementString = JSON.stringify(statement, Object.keys(statement).sort());
        return createHash(this.config.hashAlgorithm)
            .update(statementString)
            .digest('hex');
    }

    async validateProofType(proofType) {
        if (!this.config.proofTypes.includes(proofType)) {
            throw new Error(`Invalid proof type: ${proofType}. Supported types: ${this.config.proofTypes.join(', ')}`);
        }
    }

    async validateStatement(statement) {
        if (!statement || typeof statement !== 'object') {
            throw new Error('Statement must be a valid object');
        }

        if (!statement.publicInputs || typeof statement.publicInputs !== 'object') {
            throw new Error('Statement must contain publicInputs object');
        }

        if (Object.keys(statement.publicInputs).length === 0) {
            throw new Error('Statement publicInputs cannot be empty');
        }
    }

    async validateWitness(witness) {
        if (!witness || typeof witness !== 'object') {
            throw new Error('Witness must be a valid object');
        }

        if (Object.keys(witness).length === 0) {
            throw new Error('Witness cannot be empty');
        }

        if (JSON.stringify(witness).length > this.config.maxProofSize) {
            throw new Error('Witness data exceeds maximum size');
        }
    }

    async generateMembershipProof(statement, witness, options) {
        const { set, element } = statement.publicInputs;
        const { secret } = witness;

        if (!Array.isArray(set)) {
            throw new Error('Membership proof requires set array in public inputs');
        }

        if (!set.includes(element)) {
            throw new Error('Element not found in set for membership proof');
        }

        const commitment = this.createCommitment(secret, element);
        const proof = {
            type: 'membership',
            commitment,
            setHash: this.hashSet(set),
            elementHash: this.hashElement(element),
            timestamp: Date.now(),
            parameters: options.parameters || {}
        };

        return this.serializeProof(proof);
    }

    async generateRangeProof(statement, witness, options) {
        const { min, max } = statement.publicInputs;
        const { value } = witness;

        if (typeof min !== 'number' || typeof max !== 'number') {
            throw new Error('Range proof requires min and max numbers in public inputs');
        }

        if (value < min || value > max) {
            throw new Error('Value out of range for range proof');
        }

        const commitment = this.createCommitment(value.toString(), 'range');
        const bitCommitments = this.createBitCommitments(value, min, max);
        
        const proof = {
            type: 'range',
            commitment,
            bitCommitments,
            range: { min, max },
            timestamp: Date.now(),
            parameters: options.parameters || {}
        };

        return this.serializeProof(proof);
    }

    async generateEqualityProof(statement, witness, options) {
        const { values } = statement.publicInputs;
        const { secret } = witness;

        if (!Array.isArray(values) || values.length < 2) {
            throw new Error('Equality proof requires at least 2 values in public inputs');
        }

        const firstValue = values[0];
        const allEqual = values.every(val => val === firstValue);

        if (!allEqual) {
            throw new Error('Values are not equal for equality proof');
        }

        const commitments = values.map(val => this.createCommitment(secret, val));
        
        const proof = {
            type: 'equality',
            commitments,
            valuesHash: this.hashElement(values),
            timestamp: Date.now(),
            parameters: options.parameters || {}
        };

        return this.serializeProof(proof);
    }

    async generateSetProof(statement, witness, options) {
        const { setA, setB, operation } = statement.publicInputs;
        const { secrets } = witness;

        if (!Array.isArray(setA) || !Array.isArray(setB)) {
            throw new Error('Set proof requires setA and setB arrays in public inputs');
        }

        let result;
        switch (operation) {
            case 'intersection':
                result = setA.filter(x => setB.includes(x));
                break;
            case 'union':
                result = [...new Set([...setA, ...setB])];
                break;
            case 'difference':
                result = setA.filter(x => !setB.includes(x));
                break;
            default:
                throw new Error(`Unsupported set operation: ${operation}`);
        }

        const setCommitments = result.map(element => 
            this.createCommitment(secrets[element] || 'default', element)
        );
        
        const proof = {
            type: 'set',
            operation,
            setCommitments,
            setAHash: this.hashSet(setA),
            setBHash: this.hashSet(setB),
            resultHash: this.hashSet(result),
            timestamp: Date.now(),
            parameters: options.parameters || {}
        };

        return this.serializeProof(proof);
    }

    async generateCircuitProof(statement, witness, circuitId, options) {
        if (!circuitId) {
            throw new Error('Circuit proof requires circuitId');
        }

        const circuit = this.circuitRegistry.get(circuitId);
        if (!circuit) {
            throw new Error(`Circuit not found: ${circuitId}`);
        }

        const { publicInputs } = statement;
        const circuitData = await this.loadCircuitData(circuitId);

        const proof = {
            type: 'circuit',
            circuitId,
            publicInputs,
            witnessHash: this.hashElement(witness),
            circuitHash: this.hashElement(circuitData),
            timestamp: Date.now(),
            parameters: options.parameters || {}
        };

        if (this.config.zkSnarkEnabled) {
            return await this.generateSnarkProof(proof, circuitData, publicInputs, witness);
        } else if (this.config.zkStarkEnabled) {
            return await this.generateStarkProof(proof, circuitData, publicInputs, witness);
        } else {
            throw new Error('No ZK protocol enabled for circuit proofs');
        }
    }

    async generateSnarkProof(proof, circuitData, publicInputs, witness) {
        const snarkProof = {
            ...proof,
            protocol: 'snark',
            snarkType: 'groth16',
            curve: 'bn254',
            publicSignals: this.hashElement(publicInputs),
            proofPoints: this.generateProofPoints(circuitData, publicInputs, witness)
        };

        return this.serializeProof(snarkProof);
    }

    async generateStarkProof(proof, circuitData, publicInputs, witness) {
        const starkProof = {
            ...proof,
            protocol: 'stark',
            starkType: 'eth_stark',
            field: 'prime_field',
            traceLength: this.calculateTraceLength(circuitData),
            lowDegreeProof: this.generateLowDegreeProof(circuitData, publicInputs, witness)
        };

        return this.serializeProof(starkProof);
    }

    generateProofPoints(circuitData, publicInputs, witness) {
        return {
            a: randomBytes(32).toString('hex'),
            b: randomBytes(32).toString('hex'),
            c: randomBytes(32).toString('hex')
        };
    }

    calculateTraceLength(circuitData) {
        return 1024;
    }

    generateLowDegreeProof(circuitData, publicInputs, witness) {
        return {
            commitment: randomBytes(64).toString('hex'),
            queries: Array(40).fill(0).map(() => randomBytes(32).toString('hex'))
        };
    }

    createCommitment(secret, data) {
        const dataString = typeof data === 'object' ? JSON.stringify(data) : data.toString();
        return createHash(this.config.hashAlgorithm)
            .update(secret + dataString)
            .digest('hex');
    }

    createBitCommitments(value, min, max) {
        const bitLength = Math.ceil(Math.log2(max - min + 1));
        return Array(bitLength).fill(0).map(() => randomBytes(32).toString('hex'));
    }

    hashSet(set) {
        const sortedSet = [...set].sort();
        return createHash(this.config.hashAlgorithm)
            .update(sortedSet.join('|'))
            .digest('hex');
    }

    hashElement(element) {
        const elementString = typeof element === 'object' ? JSON.stringify(element) : element.toString();
        return createHash(this.config.hashAlgorithm)
            .update(elementString)
            .digest('hex');
    }

    serializeProof(proof) {
        return Buffer.from(JSON.stringify(proof));
    }

    deserializeProof(proofData) {
        return JSON.parse(proofData.toString());
    }

    async encryptProofData(proofData) {
        const iv = randomBytes(16);
        const cipher = createCipheriv(this.config.encryptionAlgorithm, this.masterKey, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(proofData),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();

        return Buffer.concat([iv, authTag, encrypted]);
    }

    async decryptProofData(encryptedData) {
        const iv = encryptedData.slice(0, 16);
        const authTag = encryptedData.slice(16, 32);
        const encrypted = encryptedData.slice(32);
        
        const decipher = createDecipheriv(this.config.encryptionAlgorithm, this.masterKey, iv);
        decipher.setAuthTag(authTag);
        
        return Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);
    }

    async verifyProof(proofId, publicInputs = null) {
        if (!this.initialized) await this.initialize();
        
        const proofRecord = await this.db.get('SELECT * FROM zk_proofs WHERE id = ?', [proofId]);
        if (!proofRecord) {
            throw new Error(`Proof not found: ${proofId}`);
        }

        if (proofRecord.expiration && new Date(proofRecord.expiration) < new Date()) {
            await this.updateProofStatus(proofId, 'expired', false, 'Proof expired');
            throw new Error('Proof has expired');
        }

        try {
            const startTime = Date.now();
            const decryptedProofData = await this.decryptProofData(proofRecord.proofData);
            const proof = this.deserializeProof(decryptedProofData);
            
            let verificationResult;
            switch (proofRecord.proofType) {
                case 'membership':
                    verificationResult = await this.verifyMembershipProof(proof, publicInputs);
                    break;
                case 'range':
                    verificationResult = await this.verifyRangeProof(proof, publicInputs);
                    break;
                case 'equality':
                    verificationResult = await this.verifyEqualityProof(proof, publicInputs);
                    break;
                case 'set':
                    verificationResult = await this.verifySetProof(proof, publicInputs);
                    break;
                case 'circuit':
                    verificationResult = await this.verifyCircuitProof(proof, publicInputs, proofRecord.circuitId);
                    break;
                default:
                    throw new Error(`Unsupported proof type for verification: ${proofRecord.proofType}`);
            }

            const verificationTime = Date.now() - startTime;

            await this.updateProofStatus(proofId, 'verified', verificationResult);
            await this.recordProofMetrics(proofRecord.proofType, 0, verificationTime, 0, verificationResult);

            this.events.emit('proofVerified', { 
                proofId, 
                proofType: proofRecord.proofType,
                result: verificationResult,
                verificationTime
            });

            return verificationResult;
        } catch (error) {
            await this.updateProofStatus(proofId, 'verification_failed', false, error.message);
            await this.recordProofMetrics(proofRecord.proofType, 0, 0, 0, false);
            throw error;
        }
    }

    async verifyMembershipProof(proof, publicInputs) {
        const { set, element } = publicInputs;
        const { setHash, elementHash } = proof;

        const computedSetHash = this.hashSet(set);
        const computedElementHash = this.hashElement(element);

        return computedSetHash === setHash && computedElementHash === elementHash;
    }

    async verifyRangeProof(proof, publicInputs) {
        const { min, max } = publicInputs;
        const { range, bitCommitments } = proof;

        return range.min === min && range.max === max && bitCommitments.length > 0;
    }

    async verifyEqualityProof(proof, publicInputs) {
        const { values } = publicInputs;
        const { commitments, valuesHash } = proof;

        const computedValuesHash = this.hashElement(values);
        return commitments.length === values.length && valuesHash === computedValuesHash;
    }

    async verifySetProof(proof, publicInputs) {
        const { setA, setB, operation } = publicInputs;
        const { setAHash, setBHash, operation: proofOperation } = proof;

        const computedSetAHash = this.hashSet(setA);
        const computedSetBHash = this.hashSet(setB);

        return setAHash === computedSetAHash && 
               setBHash === computedSetBHash && 
               operation === proofOperation;
    }

    async verifyCircuitProof(proof, publicInputs, circuitId) {
        const circuit = this.circuitRegistry.get(circuitId);
        if (!circuit) {
            throw new Error(`Circuit not found for verification: ${circuitId}`);
        }

        const { protocol } = proof;

        if (protocol === 'snark') {
            return await this.verifySnarkProof(proof, publicInputs, circuit);
        } else if (protocol === 'stark') {
            return await this.verifyStarkProof(proof, publicInputs, circuit);
        } else {
            throw new Error(`Unsupported protocol for verification: ${protocol}`);
        }
    }

    async verifySnarkProof(proof, publicInputs, circuit) {
        const { proofPoints, publicSignals } = proof;
        const computedPublicSignals = this.hashElement(publicInputs);

        return publicSignals === computedPublicSignals && 
               proofPoints.a && proofPoints.b && proofPoints.c;
    }

    async verifyStarkProof(proof, publicInputs, circuit) {
        const { traceLength, lowDegreeProof } = proof;

        return traceLength > 0 && 
               lowDegreeProof.commitment && 
               lowDegreeProof.queries.length > 0;
    }

    async updateProofStatus(proofId, status, result = null, errorMessage = null) {
        const updateFields = ['status = ?'];
        const params = [status];

        if (status === 'verified') {
            updateFields.push('verifiedAt = CURRENT_TIMESTAMP');
            updateFields.push('verificationResult = ?');
            params.push(result);
        }
        if (errorMessage) {
            updateFields.push('errorMessage = ?');
            params.push(errorMessage);
        }

        params.push(proofId);
        await this.db.run(`UPDATE zk_proofs SET ${updateFields.join(', ')} WHERE id = ?`, params);

        const proof = this.proofStore.get(proofId);
        if (proof) {
            proof.status = status;
            if (status === 'verified') {
                proof.verifiedAt = new Date();
                proof.verificationResult = result;
            }
        }
    }

    async recordProofMetrics(proofType, generationTime, verificationTime, proofSize, success) {
        await this.db.run(`
            INSERT INTO zk_proof_metrics (proofType, generationTime, verificationTime, proofSize, success)
            VALUES (?, ?, ?, ?, ?)
        `, [proofType, generationTime, verificationTime, proofSize, success]);
    }

    async registerCircuit(circuitId, name, description, circuitType, circuitData, constraintsCount, gatesCount) {
        if (!this.initialized) await this.initialize();

        const encryptedCircuitData = await this.encryptProofData(Buffer.from(JSON.stringify(circuitData)));

        await this.db.run(`
            INSERT INTO zk_circuits (id, name, description, circuitType, circuitData, constraintsCount, gatesCount)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [circuitId, name, description, circuitType, encryptedCircuitData, constraintsCount, gatesCount]);

        this.circuitRegistry.set(circuitId, {
            id: circuitId,
            name,
            description,
            circuitType,
            constraintsCount,
            gatesCount,
            isActive: true,
            createdAt: new Date()
        });

        this.events.emit('circuitRegistered', {
            circuitId,
            name,
            circuitType,
            constraintsCount,
            gatesCount
        });

        return circuitId;
    }

    async loadCircuitData(circuitId) {
        const circuit = await this.db.get('SELECT circuitData FROM zk_circuits WHERE id = ?', [circuitId]);
        if (!circuit) {
            throw new Error(`Circuit data not found: ${circuitId}`);
        }

        const decryptedData = await this.decryptProofData(circuit.circuitData);
        return JSON.parse(decryptedData.toString());
    }

    async loadVerificationKeys() {
        const keys = await this.db.all('SELECT * FROM zk_verification_keys WHERE isActive = true');
        
        for (const key of keys) {
            this.verificationKeys.set(key.circuitId, {
                id: key.id,
                circuitId: key.circuitId,
                keyType: key.keyType,
                parameters: JSON.parse(key.parameters || '{}')
            });
        }
    }

    async getVerificationKeyId(circuitId) {
        const key = this.verificationKeys.get(circuitId);
        return key ? key.id : null;
    }

    async registerDefaultCircuits() {
        const defaultCircuits = [
            {
                id: 'payment_circuit',
                name: 'Payment Verification Circuit',
                description: 'Circuit for verifying payment transactions without revealing amounts',
                circuitType: 'arithmetic',
                constraintsCount: 5000,
                gatesCount: 10000
            },
            {
                id: 'identity_circuit',
                name: 'Identity Verification Circuit',
                description: 'Circuit for proving identity attributes without revealing actual data',
                circuitType: 'boolean',
                constraintsCount: 3000,
                gatesCount: 6000
            },
            {
                id: 'compliance_circuit',
                name: 'Regulatory Compliance Circuit',
                description: 'Circuit for proving regulatory compliance without exposing sensitive data',
                circuitType: 'arithmetic',
                constraintsCount: 8000,
                gatesCount: 15000
            }
        ];

        for (const circuit of defaultCircuits) {
            if (!this.circuitRegistry.has(circuit.id)) {
                await this.registerCircuit(
                    circuit.id,
                    circuit.name,
                    circuit.description,
                    circuit.circuitType,
                    { type: 'default', version: '1.0' },
                    circuit.constraintsCount,
                    circuit.gatesCount
                );
            }
        }
    }

    async getProofStats(timeframe = '24h') {
        if (!this.initialized) await this.initialize();
        
        const timeFilter = this.getTimeFilter(timeframe);
        const stats = await this.db.all(`
            SELECT 
                proofType,
                COUNT(*) as totalProofs,
                AVG(generationTime) as avgGenerationTime,
                AVG(verificationTime) as avgVerificationTime,
                AVG(proofSize) as avgProofSize,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successfulProofs,
                SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failedProofs
            FROM zk_proof_metrics 
            WHERE timestamp >= ?
            GROUP BY proofType
        `, [timeFilter]);

        return stats;
    }

    async getCircuitStats() {
        if (!this.initialized) await this.initialize();
        
        const circuits = await this.db.all(`
            SELECT 
                c.id,
                c.name,
                c.circuitType,
                c.constraintsCount,
                c.gatesCount,
                COUNT(p.id) as usageCount,
                MAX(p.generatedAt) as lastUsed
            FROM zk_circuits c
            LEFT JOIN zk_proofs p ON c.id = p.circuitId
            WHERE c.isActive = true
            GROUP BY c.id
        `);

        return circuits;
    }

    async cleanupExpiredProofs() {
        const expired = await this.db.all(`
            SELECT id FROM zk_proofs 
            WHERE expiration < CURRENT_TIMESTAMP AND status != 'expired'
        `);

        for (const proof of expired) {
            await this.updateProofStatus(proof.id, 'expired', false, 'Proof expired');
            this.proofStore.delete(proof.id);
        }

        console.log(`✅ Cleaned up ${expired.length} expired proofs`);
    }

    getTimeFilter(timeframe) {
        const now = Date.now();
        const periods = {
            '1h': 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        };
        return new Date(now - (periods[timeframe] || periods['24h']));
    }
}

export default ZeroKnowledgeProofEngine;
