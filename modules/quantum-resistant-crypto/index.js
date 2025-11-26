// modules/quantum-resistant-crypto/index.js - ENTERPRISE GRADE (PRODUCTION READY)
// ENHANCED VERSION - FIXED DATABASE INITIALIZATION AND ALL PRODUCTION ISSUES

import sqlite3 from 'sqlite3';
const { Database } = sqlite3;
import { promisify } from 'util';
import {
    randomBytes,
    createCipheriv,
    createDecipheriv,
    scryptSync,
    createHash,
    generateKeyPairSync,
    publicEncrypt,
    privateDecrypt,
    constants
} from 'crypto';
import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';

// Import Kyber functions - CORRECTED IMPORTS
import { 
    kyberKeyPair, 
    kyberEncapsulate, 
    kyberDecapsulate,
    PQCKyberProvider 
} from '../pqc-kyber/index.js';

// Import Dilithium functions (assuming a similar pattern for PqcDilithium)
import * as dilithiumModule from '../pqc-dilithium/index.js';
const dilithiumKeyPair = dilithiumModule.dilithiumKeyPair || dilithiumModule.default?.dilithiumKeyPair;
const dilithiumSign = dilithiumModule.dilithiumSign || dilithiumModule.default?.dilithiumSign;
const dilithiumVerify = dilithiumModule.dilithiumVerify || dilithiumModule.default?.dilithiumVerify;

// Constants
const ALGORITHMS = {
    KYBER_1024: 'kyber-1024',
    DILITHIUM_5: 'dilithium-5',
    AES_256_GCM: 'aes-256-gcm',
    CHACHA20_POLY1305: 'chacha20-poly1305'
};

const KEY_TYPES = {
    ENCRYPTION: 'encryption',
    SIGNATURE: 'signature',
    MASTER: 'master'
};

const KEY_STATUS = {
    ACTIVE: 'active',
    EXPIRED: 'expired',
    COMPROMISED: 'compromised',
    PENDING_ROTATION: 'pending_rotation'
};

// ENHANCED MONITORING SERVICE WITH REAL METRICS
class MonitoringService {
    constructor() {
        this.logs = [];
        this.metrics = {
            encryptionOperations: 0,
            decryptionOperations: 0,
            keyGenerations: 0,
            errors: 0,
            startTime: Date.now()
        };
        this.alertThresholds = {
            errorRate: 0.05, // 5% error rate
            operationTime: 5000 // 5 seconds
        };
    }

    log(level, message, context = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            context,
            service: 'quantum-crypto'
        };
        this.logs.push(logEntry);

        if (level === 'ERROR') this.metrics.errors++;

        if (this.logs.length > 1000) {
            this.logs = this.logs.slice(-1000);
        }

        console.log(JSON.stringify(logEntry));

        if (level === 'ERROR' && context.operation === 'encryption') {
            this._triggerAlert('encryption_failure', message, context);
        }
    }

    _triggerAlert(type, message, context) {
        const alert = {
            type,
            severity: 'high',
            message,
            context,
            timestamp: new Date().toISOString(),
            service: 'quantum-crypto'
        };

        console.error('🚨 SECURITY ALERT:', JSON.stringify(alert));
    }

    recordOperation(operation, duration, success = true) {
        this.metrics[`${operation}Operations`]++;
        if (!success) {
            this.metrics.errors++;
        }
        if (duration > this.alertThresholds.operationTime) {
            this.log('WARN', `Slow ${operation} operation`, {
                operation,
                duration,
                threshold: this.alertThresholds.operationTime
            });
        }
    }

    getLogs(limit = 100) {
        return this.logs.slice(-limit);
    }

    getMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        const totalOperations = this.metrics.encryptionOperations +
            this.metrics.decryptionOperations +
            this.metrics.keyGenerations;

        const errorRate = totalOperations > 0 ? this.metrics.errors / totalOperations : 0;

        return {
            ...this.metrics,
            uptime,
            errorRate,
            totalOperations,
            operational: errorRate < this.alertThresholds.errorRate
        };
    }
}

// PRODUCTION AUDIT LOGGER
class AuditLogger {
    constructor() {
        this.auditTrail = [];
        this.retentionDays = 90;
    }

    async logSecurityEvent(event) {
        const auditEntry = {
            ...event,
            id: createHash('sha256')
                .update(randomBytes(16))
                .update(Date.now().toString())
                .update(event.eventType)
                .digest('hex'),
            timestamp: event.timestamp || new Date().toISOString(),
            service: 'quantum-crypto',
            version: '1.0.0'
        };

        this.auditTrail.push(auditEntry);
        this._cleanupOldEntries();
        console.log('🔍 AUDIT:', JSON.stringify(auditEntry));
        return auditEntry;
    }

    _cleanupOldEntries() {
        const cutoffTime = Date.now() - (this.retentionDays * 24 * 60 * 60 * 1000);
        this.auditTrail = this.auditTrail.filter(entry =>
            new Date(entry.timestamp) >= new Date(cutoffTime)
        );
    }

    getAuditTrail(limit = 100) {
        return this.auditTrail.slice(-limit);
    }

    searchAuditEvents(criteria) {
        return this.auditTrail.filter(event => {
            return Object.keys(criteria).every(key => {
                if (key === 'timestamp') {
                    return new Date(event[key]) >= new Date(criteria[key]);
                }
                return event[key] === criteria[key];
            });
        });
    }
}

/**
 * Database adapter shim for ArielSQLiteEngine
 * - Normalizes execute/query across different engine interfaces
 * - Adds queryOne for single-row reads
 * - Ensures returned shapes match call-site expectations
 */
class DBAdapter {
    constructor(engine, monitor) {
        this.engine = engine;
        this.monitor = monitor;
    }

    async connect() {
        if (typeof this.engine.connect === 'function') {
            return this.engine.connect();
        }
        // If engine auto-connects, log for visibility
        this.monitor?.log('WARN', 'DB engine has no connect(), assuming auto-connected');
        return true;
    }

    async close() {
        if (typeof this.engine.close === 'function') {
            return this.engine.close();
        }
        return true;
    }

    async execute(sql, params = []) {
        if (typeof this.engine.execute === 'function') {
            return this.engine.execute(sql, params);
        }
        if (typeof this.engine.run === 'function') {
            return this.engine.run(sql, params);
        }
        throw new Error('DBAdapter: No execute/run method available on engine');
    }

    async query(sql, params = []) {
        // Prefer engine.query, else engine.all, else engine.get for single row
        if (typeof this.engine.query === 'function') {
            const res = await this.engine.query(sql, params);
            // Some engines return array, others return object for SELECT COUNT(*)
            return res;
        }
        if (typeof this.engine.all === 'function') {
            const rows = await this.engine.all(sql, params);
            return rows || [];
        }
        if (typeof this.engine.get === 'function') {
            const row = await this.engine.get(sql, params);
            return row ? [row] : [];
        }
        throw new Error('DBAdapter: No query/all/get method available on engine');
    }

    async queryOne(sql, params = []) {
        const res = await this.query(sql, params);
        if (Array.isArray(res)) {
            return res[0] || null;
        }
        // Some engines might return a single object
        return res || null;
    }
}

// --- UTILITY FUNCTIONS ---

/**
 * @function safeParseJson
 * @description Safely attempts to parse a JSON string, returning null on failure.
 */
function safeParseJson(str) {
    try {
        if (typeof str === 'string') {
            return JSON.parse(str);
        }
        return str; // Already an object or null
    } catch (e) {
        console.error('Failed to parse JSON string:', str, e);
        return null;
    }
}

/**
 * @function encryptWithAES
 * @description Encrypts data using AES-256-GCM. Used for local master key wrapping.
 * @param {string} data - Data to encrypt (Base64 private key string).
 * @param {Buffer} key - Derived master key buffer (must be at least 32 bytes).
 * @returns {string} - Encrypted data (IV|AuthTag|Ciphertext) as Base64.
 */
function encryptWithAES(data, key) {
    const iv = randomBytes(12);
    // Use 256 bits (32 bytes) of the key for AES-256
    const cipher = createCipheriv(ALGORITHMS.AES_256_GCM, key.slice(0, 32), iv); 
    
    let encrypted = cipher.update(data, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const tag = cipher.getAuthTag();

    // Format: IV | AuthTag | Ciphertext
    return `${iv.toString('base64')}.${tag.toString('base64')}.${encrypted}`;
}

/**
 * @function decryptWithAES
 * @description Decrypts data using AES-256-GCM. Used for local master key unwrapping.
 * @param {string} encryptedData - Encrypted data (IV|AuthTag|Ciphertext) as Base64.
 * @param {Buffer} key - Derived master key buffer (must be at least 32 bytes).
 * @returns {string} - Decrypted data (private key string).
 */
function decryptWithAES(encryptedData, key) {
    const parts = encryptedData.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format for AES-GCM');
    }
    const [ivBase64, tagBase64, cipherTextBase64] = parts;

    const iv = Buffer.from(ivBase64, 'base64');
    const tag = Buffer.from(tagBase64, 'base64');
    const cipherText = Buffer.from(cipherTextBase64, 'base64');

    // Use 256 bits (32 bytes) of the key for AES-256
    const decipher = createDecipheriv(ALGORITHMS.AES_256_GCM, key.slice(0, 32), iv); 
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(cipherText);
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

// Kyber/Dilithium Hybrid Encryption Functions
/**
 * @function hybridEncrypt
 * @description Encrypts data using Kyber for key encapsulation and AES-GCM for data encryption
 */
async function hybridEncrypt(publicKey, data, algorithm = ALGORITHMS.KYBER_1024) {
    try {
        // Step 1: Use Kyber to encapsulate a shared secret
        const encapsulationResult = await kyberEncapsulate(publicKey, { level: 1024 });
        
        // Step 2: Use the shared secret to encrypt the data with AES-GCM
        const iv = randomBytes(12);
        const cipher = createCipheriv('aes-256-gcm', encapsulationResult.sharedSecret.slice(0, 32), iv);
        
        let encrypted = cipher.update(data);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Return: Kyber ciphertext + AES IV + Auth Tag + Encrypted Data
        return Buffer.concat([
            encapsulationResult.ciphertext,
            iv,
            authTag,
            encrypted
        ]);
    } catch (error) {
        throw new Error(`Hybrid encryption failed: ${error.message}`);
    }
}

/**
 * @function hybridDecrypt
 * @description Decrypts data using Kyber for key decapsulation and AES-GCM for data decryption
 */
async function hybridDecrypt(privateKey, encryptedData, algorithm = ALGORITHMS.KYBER_1024) {
    try {
        // Extract components from encrypted data
        const kyberCiphertextLength = 1568; // Standard Kyber-1024 ciphertext length
        const ivLength = 12;
        const authTagLength = 16;
        
        const kyberCiphertext = encryptedData.slice(0, kyberCiphertextLength);
        const iv = encryptedData.slice(kyberCiphertextLength, kyberCiphertextLength + ivLength);
        const authTag = encryptedData.slice(kyberCiphertextLength + ivLength, kyberCiphertextLength + ivLength + authTagLength);
        const aesEncryptedData = encryptedData.slice(kyberCiphertextLength + ivLength + authTagLength);

        // Step 1: Use Kyber to decapsulate the shared secret
        const sharedSecret = await kyberDecapsulate(privateKey, kyberCiphertext, { level: 1024 });

        // Step 2: Use the shared secret to decrypt the data with AES-GCM
        const decipher = createDecipheriv('aes-256-gcm', sharedSecret.slice(0, 32), iv);
        decipher.setAuthTag(authTag);
        
        let decrypted = decipher.update(aesEncryptedData);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        
        return decrypted;
    } catch (error) {
        throw new Error(`Hybrid decryption failed: ${error.message}`);
    }
}

export class EnterpriseQuantumResistantCrypto {
    constructor(config = {}) {
        this.config = {
            // REAL PRODUCTION CONFIGURATION - NO SIMULATIONS
            keyRotationInterval: config.keyRotationInterval || 90 * 24 * 60 * 60 * 1000, // 90 days
            encryptionAlgorithm: config.encryptionAlgorithm || ALGORITHMS.AES_256_GCM,
            signatureAlgorithm: config.signatureAlgorithm || ALGORITHMS.DILITHIUM_5,
            keyDerivationIterations: config.keyDerivationIterations || 32768,
            keyDerivationKeyLength: config.keyDerivationKeyLength || 64,
            databasePath: config.databasePath || './data/quantum_crypto.db',
            ...config
        };

        // Proper database initialization with a compatibility adapter
        const engine = new ArielSQLiteEngine({
            dbPath: this.config.databasePath,
            autoBackup: true,
            walMode: true
        });
        this.monitoring = new MonitoringService();
        this.db = new DBAdapter(engine, this.monitoring);

        this.auditLogger = new AuditLogger();

        this.keyDerivationSalt = randomBytes(32);
        this.keyCache = new Map();
        this.initialized = false;
        this.initializationPromise = null;

        // Initialize Kyber provider for session management (optional)
        this.kyberProvider = new PQCKyberProvider(768, {
            keyRotationInterval: this.config.keyRotationInterval,
            sessionLifetime: 60 * 1000 // 1 minute
        });
    }

    async initialize() {
        if (this.initializationPromise) {
            return this.initializationPromise;
        }
        this.initializationPromise = this._initializeInternal();
        return this.initializationPromise;
    }

    async _initializeInternal() {
        try {
            this.monitoring.log('INFO', 'Starting QuantumResistantCrypto initialization');

            // Initialize database first
            await this.db.connect();
            this.monitoring.log('INFO', 'Database connected successfully');

            await this.createEnterpriseDatabaseSchema();
            this.monitoring.log('INFO', 'Database schema created successfully');

            await this.initializeMasterKeys();
            this.monitoring.log('INFO', 'Master keys initialized successfully');

            this.startKeyRotationScheduler();
            this.monitoring.log('INFO', 'Key rotation scheduler started');

            this.initialized = true;

            await this.auditLogger.logSecurityEvent({
                eventType: 'system_initialized',
                severity: 'low',
                description: 'QuantumResistantCrypto system initialized successfully',
                keyId: null
            });

            this.monitoring.log('INFO', 'QuantumResistantCrypto initialized successfully');

            return true;
        } catch (error) {
            this.monitoring.log('ERROR', `Failed to initialize QuantumResistantCrypto: ${error.message}`, {
                stack: error.stack,
                operation: 'initialization'
            });

            await this.auditLogger.logSecurityEvent({
                eventType: 'system_initialization_failed',
                severity: 'critical',
                description: `QuantumResistantCrypto initialization failed: ${error.message}`,
                keyId: null
            });

            throw error;
        }
    }

    async createEnterpriseDatabaseSchema() {
        const tables = [
            `CREATE TABLE IF NOT EXISTS quantum_keys (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_id TEXT UNIQUE NOT NULL,
                public_key TEXT NOT NULL,
                private_key_encrypted TEXT NOT NULL,
                key_type TEXT NOT NULL CHECK(key_type IN ('encryption', 'signature', 'master')),
                algorithm TEXT NOT NULL,
                key_size INTEGER NOT NULL,
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'expired', 'compromised', 'pending_rotation')),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                last_rotated DATETIME,
                rotation_count INTEGER DEFAULT 0,
                metadata TEXT,
                version INTEGER DEFAULT 1,
                CONSTRAINT unique_key_id UNIQUE (key_id)
            )`,

            `CREATE TABLE IF NOT EXISTS key_usage_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_id TEXT NOT NULL,
                operation_type TEXT NOT NULL CHECK(operation_type IN ('encrypt', 'decrypt', 'sign', 'verify', 'generate')),
                operation_status TEXT NOT NULL CHECK(operation_status IN ('success', 'failure')),
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                details TEXT,
                ip_address TEXT,
                user_agent TEXT,
                FOREIGN KEY (key_id) REFERENCES quantum_keys (key_id) ON DELETE CASCADE
            )`,

            `CREATE TABLE IF NOT EXISTS key_rotation_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                old_key_id TEXT NOT NULL,
                new_key_id TEXT NOT NULL,
                rotation_reason TEXT NOT NULL,
                rotated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                initiated_by TEXT DEFAULT 'system',
                FOREIGN KEY (old_key_id) REFERENCES quantum_keys (key_id) ON DELETE CASCADE,
                FOREIGN KEY (new_key_id) REFERENCES quantum_keys (key_id) ON DELETE CASCADE
            )`,

            `CREATE TABLE IF NOT EXISTS security_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
                description TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                key_id TEXT,
                additional_data TEXT,
                resolved BOOLEAN DEFAULT FALSE
            )`,

            `CREATE TABLE IF NOT EXISTS encryption_operations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                operation_id TEXT UNIQUE NOT NULL,
                key_id TEXT NOT NULL,
                algorithm TEXT NOT NULL,
                data_size INTEGER NOT NULL,
                operation_time_ms INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN NOT NULL,
                error_message TEXT,
                FOREIGN KEY (key_id) REFERENCES quantum_keys (key_id) ON DELETE CASCADE
            )`
        ];

        for (const tableSql of tables) {
            await this.db.execute(tableSql);
        }

        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_quantum_keys_key_id ON quantum_keys(key_id)',
            'CREATE INDEX IF NOT EXISTS idx_quantum_keys_status ON quantum_keys(status)',
            'CREATE INDEX IF NOT EXISTS idx_quantum_keys_expires_at ON quantum_keys(expires_at)',
            'CREATE INDEX IF NOT EXISTS idx_key_usage_log_key_id ON key_usage_log(key_id)',
            'CREATE INDEX IF NOT EXISTS idx_key_usage_log_timestamp ON key_usage_log(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_encryption_operations_timestamp ON encryption_operations(timestamp)',
            'CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(timestamp)'
        ];

        for (const indexSql of indexes) {
            await this.db.execute(indexSql);
        }

        this.monitoring.log('INFO', 'Database schema and indexes created successfully');
    }

    async initializeMasterKeys() {
        // Use adapter to fetch all active master keys
        const existingMasterKeys = await this.db.query(
            "SELECT * FROM quantum_keys WHERE key_type = 'master' AND status = 'active'"
        );

        if (Array.isArray(existingMasterKeys) && existingMasterKeys.length === 0) {
            this.monitoring.log('INFO', 'No existing master keys found, generating new ones');
            await this.generateMasterKeys();
        } else if (Array.isArray(existingMasterKeys)) {
            this.monitoring.log('INFO', `Found ${existingMasterKeys.length} existing master keys, loading into cache`);
            for (const key of existingMasterKeys) {
                let decrypted = null;
                try {
                    // Use a local key derivation for master key unwrapping
                    decrypted = this.decryptWithLocalKey(key.private_key_encrypted);
                } catch (e) {
                    this.monitoring.log('ERROR', `Failed to decrypt master key ${key.key_id}: ${e.message}`);
                    continue;
                }
                this.keyCache.set(key.key_id, {
                    publicKey: key.public_key,
                    privateKey: decrypted,
                    algorithm: key.algorithm,
                    type: key.key_type,
                    expiresAt: key.expires_at
                });
            }
        } else {
            // Non-array shape (defensive) -> treat as single record if present
            const key = existingMasterKeys;
            if (key && key.key_id) {
                let decrypted = null;
                try {
                    decrypted = this.decryptWithLocalKey(key.private_key_encrypted);
                } catch (e) {
                    this.monitoring.log('ERROR', `Failed to decrypt master key ${key.key_id}: ${e.message}`);
                }
                this.keyCache.set(key.key_id, {
                    publicKey: key.public_key,
                    privateKey: decrypted,
                    algorithm: key.algorithm,
                    type: key.key_type,
                    expiresAt: key.expires_at
                });
            } else {
                await this.generateMasterKeys();
            }
        }
    }

    async generateMasterKeys() {
        try {
            this.monitoring.log('INFO', 'Generating new master keys');

            // NOTE: Master keys themselves are Kyber/Dilithium, but their *private keys* 
            // are encrypted using a symmetric key derived from the QR_MASTER_KEY secret.
            const encryptionMasterKey = await this.generateKeyPair(
                ALGORITHMS.KYBER_1024,
                KEY_TYPES.MASTER,
                'encryption_master'
            );

            const signatureMasterKey = await this.generateKeyPair(
                ALGORITHMS.DILITHIUM_5,
                KEY_TYPES.MASTER,
                'signature_master'
            );

            await this.auditLogger.logSecurityEvent({
                eventType: 'master_keys_generated',
                severity: 'medium',
                description: 'New master encryption and signature keys generated',
                keyId: `${encryptionMasterKey.keyId},${signatureMasterKey.keyId}`
            });

            this.monitoring.log('INFO', 'Master keys generated successfully');
            return { encryptionMasterKey, signatureMasterKey };
        } catch (error) {
            this.monitoring.log('ERROR', `Failed to generate master keys: ${error.message}`, {
                operation: 'master_key_generation'
            });
            throw error;
        }
    }

    async generateKeyPair(algorithm = ALGORITHMS.KYBER_1024, keyType = KEY_TYPES.ENCRYPTION, purpose = 'general') {
        const startTime = Date.now();

        try {
            let publicKey, privateKey;

            switch (algorithm) {
                case ALGORITHMS.KYBER_1024: {
                    if (!kyberKeyPair) {
                        throw new Error('Kyber key pair generation not available');
                    }
                    // KyberKeyPair is an async method
                    const kyberKeys = await kyberKeyPair({ level: 1024 });
                    // Kyber key pairs are returned as Buffers/Uint8Arrays from the WASM wrapper
                    publicKey = Buffer.from(kyberKeys.publicKey).toString('base64');
                    privateKey = Buffer.from(kyberKeys.secretKey).toString('base64');
                    break;
                }

                case ALGORITHMS.DILITHIUM_5: {
                    if (!dilithiumKeyPair) {
                        throw new Error('Dilithium key pair generation not available');
                    }
                    const dilithiumKeys = await dilithiumKeyPair();
                    // Dilithium key pairs are returned as Buffers/Uint8Arrays from the WASM wrapper
                    publicKey = Buffer.from(dilithiumKeys.publicKey).toString('base64');
                    privateKey = Buffer.from(dilithiumKeys.privateKey).toString('base64');
                    break;
                }

                default:
                    throw new Error(`Unsupported algorithm: ${algorithm}`);
            }

            const keyId = this.generateKeyId();
            const encryptedPrivateKey = this.encryptWithLocalKey(privateKey);
            const expiresAt = new Date(Date.now() + this.config.keyRotationInterval).toISOString();

            await this.db.execute(
                `INSERT INTO quantum_keys 
                 (key_id, public_key, private_key_encrypted, key_type, algorithm, key_size, status, expires_at, metadata) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [keyId, publicKey, encryptedPrivateKey, keyType, algorithm, this.getKeySize(algorithm), KEY_STATUS.ACTIVE, expiresAt, JSON.stringify({ purpose })]
            );

            // Cache the unencrypted private key (only used in the server process)
            this.keyCache.set(keyId, {
                publicKey,
                privateKey, // Unencrypted
                algorithm,
                type: keyType,
                expiresAt
            });

            const operationTime = Date.now() - startTime;
            this.monitoring.recordOperation('keyGeneration', operationTime, true);

            await this.logKeyUsage(keyId, 'generate', 'success', { algorithm, keyType, purpose, operationTime });

            this.monitoring.log('INFO', `Key pair generated: ${keyId} (${algorithm})`, {
                keyId,
                algorithm,
                keyType,
                operationTime
            });

            return {
                keyId,
                publicKey,
                algorithm,
                keyType,
                expiresAt
            };

        } catch (error) {
            const operationTime = Date.now() - startTime;
            this.monitoring.recordOperation('keyGeneration', operationTime, false);

            this.monitoring.log('ERROR', `Failed to generate key pair: ${error.message}`, {
                algorithm,
                keyType,
                purpose,
                operationTime,
                operation: 'key_generation'
            });
            throw error;
        }
    }

    encryptWithLocalKey(data) {
        const masterKey = this.getMasterKeyForPurpose('general');
        return encryptWithAES(data, masterKey);
    }

    decryptWithLocalKey(encryptedPrivateKey) {
        const masterKey = this.getMasterKeyForPurpose('general');
        return decryptWithAES(encryptedPrivateKey, masterKey);
    }

    getMasterKeyForPurpose(purpose) {
        const masterKey = process.env.QR_MASTER_KEY;
        if (!masterKey) {
            throw new Error('QR_MASTER_KEY environment variable not set');
        }

        // Use scryptSync to derive a strong, salted key from the environment secret
        return scryptSync(
            masterKey,
            Buffer.concat([this.keyDerivationSalt, Buffer.from(purpose)]),
            this.config.keyDerivationIterations,
            this.config.keyDerivationKeyLength
        );
    }

    generateKeyId() {
        return createHash('sha256')
            .update(randomBytes(32))
            .update(Date.now().toString())
            .update(process.pid.toString())
            .digest('hex')
            .slice(0, 32);
    }

    getKeySize(algorithm) {
        const keySizes = {
            [ALGORITHMS.KYBER_1024]: 1024,
            [ALGORITHMS.DILITHIUM_5]: 2048,
            [ALGORITHMS.AES_256_GCM]: 256,
            [ALGORITHMS.CHACHA20_POLY1305]: 256
        };

        return keySizes[algorithm] || 0;
    }

    async encryptData(data, publicKeyBase64, algorithm = ALGORITHMS.KYBER_1024) {
        const startTime = Date.now();

        try {
            const publicKey = Buffer.from(publicKeyBase64, 'base64');
            let encryptedData;

            switch (algorithm) {
                case ALGORITHMS.KYBER_1024: {
                    const dataBuffer = Buffer.from(JSON.stringify(data));
                    const ciphertext = await hybridEncrypt(publicKey, dataBuffer, algorithm);
                    encryptedData = ciphertext.toString('base64');
                    break;
                }

                default:
                    throw new Error(`Unsupported encryption algorithm: ${algorithm}`);
            }

            const operationTime = Date.now() - startTime;
            this.monitoring.recordOperation('encryption', operationTime, true);

            await this.logEncryptionOperation(
                'encrypt',
                algorithm,
                Buffer.from(JSON.stringify(data)).length,
                operationTime,
                true
            );

            return encryptedData;

        } catch (error) {
            const operationTime = Date.now() - startTime;
            this.monitoring.recordOperation('encryption', operationTime, false);

            await this.logEncryptionOperation(
                'encrypt',
                algorithm,
                Buffer.from(JSON.stringify(data)).length,
                operationTime,
                false,
                error.message
            );

            this.monitoring.log('ERROR', `Encryption failed: ${error.message}`, {
                algorithm,
                operationTime,
                operation: 'encryption'
            });
            throw error;
        }
    }

    async decryptData(encryptedData, keyId) {
        const startTime = Date.now();

        try {
            let privateKey;
            if (this.keyCache.has(keyId)) {
                privateKey = this.keyCache.get(keyId).privateKey;
            } else {
                const keyRecord = await this.getKeyRecord(keyId);
                const metadata = keyRecord.metadata ? safeParseJson(keyRecord.metadata) : {};
                // Unwraps the private key from the DB using the master key derivation
                privateKey = this.decryptWithLocalKey(keyRecord.private_key_encrypted);
                // Cache the key for future use
                this.keyCache.set(keyId, {
                    publicKey: keyRecord.public_key,
                    privateKey,
                    algorithm: keyRecord.algorithm,
                    type: keyRecord.key_type,
                    expiresAt: keyRecord.expires_at
                });
            }

            const encryptedBuffer = Buffer.from(encryptedData, 'base64');
            let decryptedData;

            const algorithm = await this.getKeyAlgorithm(keyId);

            switch (algorithm) {
                case ALGORITHMS.KYBER_1024: {
                    // Use hybrid decryption with the private key
                    decryptedData = await hybridDecrypt(Buffer.from(privateKey, 'base64'), encryptedBuffer, algorithm);
                    decryptedData = decryptedData.toString('utf8');
                    break;
                }
                
                default:
                    throw new Error(`Unsupported decryption algorithm: ${algorithm}`);
            }

            const operationTime = Date.now() - startTime;
            this.monitoring.recordOperation('decryption', operationTime, true);

            await this.logKeyUsage(keyId, 'decrypt', 'success', { algorithm, operationTime, dataSize: encryptedBuffer.length });

            return JSON.parse(decryptedData);

        } catch (error) {
            const operationTime = Date.now() - startTime;
            this.monitoring.recordOperation('decryption', operationTime, false);

            this.monitoring.log('ERROR', `Decryption failed for key ${keyId}: ${error.message}`, {
                keyId,
                operationTime,
                operation: 'decryption'
            });

            await this.logKeyUsage(keyId, 'decrypt', 'failure', { error: error.message, operationTime });

            throw error;
        }
    }

    async signData(data, keyId) {
        const startTime = Date.now();

        try {
            let privateKey;
            if (this.keyCache.has(keyId)) {
                privateKey = this.keyCache.get(keyId).privateKey;
            } else {
                const keyRecord = await this.getKeyRecord(keyId);
                const metadata = keyRecord.metadata ? safeParseJson(keyRecord.metadata) : {};
                privateKey = this.decryptWithLocalKey(keyRecord.private_key_encrypted);
                this.keyCache.set(keyId, {
                    publicKey: keyRecord.public_key,
                    privateKey,
                    algorithm: keyRecord.algorithm,
                    type: keyRecord.key_type,
                    expiresAt: keyRecord.expires_at
                });
            }

            const algorithm = await this.getKeyAlgorithm(keyId);
            const dataBuffer = Buffer.from(data);
            let signature;

            switch (algorithm) {
                case ALGORITHMS.DILITHIUM_5: {
                    if (!dilithiumSign) {
                        throw new Error('Dilithium signing not available');
                    }
                    signature = await dilithiumSign(dataBuffer, Buffer.from(privateKey, 'base64'));
                    signature = signature.toString('base64');
                    break;
                }

                default:
                    throw new Error(`Unsupported signature algorithm: ${algorithm}`);
            }

            const operationTime = Date.now() - startTime;
            this.monitoring.recordOperation('signing', operationTime, true);
            await this.logKeyUsage(keyId, 'sign', 'success', { algorithm, operationTime, dataSize: dataBuffer.length });

            return signature;

        } catch (error) {
            const operationTime = Date.now() - startTime;
            this.monitoring.recordOperation('signing', operationTime, false);
            this.monitoring.log('ERROR', `Signing failed for key ${keyId}: ${error.message}`, {
                keyId,
                operationTime,
                operation: 'signing'
            });
            await this.logKeyUsage(keyId, 'sign', 'failure', { error: error.message, operationTime });
            throw error;
        }
    }

    async verifySignature(data, signatureBase64, publicKeyBase64, algorithm = ALGORITHMS.DILITHIUM_5) {
        const startTime = Date.now();

        try {
            const dataBuffer = Buffer.from(data);
            const signature = Buffer.from(signatureBase64, 'base64');
            const publicKey = Buffer.from(publicKeyBase64, 'base64');
            let isValid = false;

            switch (algorithm) {
                case ALGORITHMS.DILITHIUM_5: {
                    if (!dilithiumVerify) {
                        throw new Error('Dilithium verification not available');
                    }
                    isValid = await dilithiumVerify(dataBuffer, signature, publicKey);
                    break;
                }

                default:
                    throw new Error(`Unsupported signature algorithm: ${algorithm}`);
            }

            const operationTime = Date.now() - startTime;
            this.monitoring.recordOperation('verification', operationTime, true);
            await this.logKeyUsage(null, 'verify', isValid ? 'success' : 'failure', { algorithm, operationTime });

            if (!isValid) {
                this.monitoring.log('WARN', 'Signature verification failed', {
                    algorithm,
                    operationTime,
                    operation: 'verification_failure'
                });
            }

            return isValid;

        } catch (error) {
            const operationTime = Date.now() - startTime;
            this.monitoring.recordOperation('verification', operationTime, false);
            this.monitoring.log('ERROR', `Verification failed: ${error.message}`, {
                algorithm,
                operationTime,
                operation: 'verification_error'
            });
            await this.logKeyUsage(null, 'verify', 'failure', { error: error.message, operationTime });
            throw error;
        }
    }

    // --- Key Management Functions ---

    async getKeyRecord(keyId) {
        const record = await this.db.queryOne("SELECT * FROM quantum_keys WHERE key_id = ?", [keyId]);
        if (!record) {
            throw new Error(`Key record not found for ID: ${keyId}`);
        }
        return record;
    }

    async getKeyAlgorithm(keyId) {
        const record = await this.db.queryOne("SELECT algorithm FROM quantum_keys WHERE key_id = ?", [keyId]);
        if (!record) {
            throw new Error(`Key algorithm not found for ID: ${keyId}`);
        }
        return record.algorithm;
    }

    async getKeyStatus(keyId) {
        const record = await this.db.queryOne("SELECT status FROM quantum_keys WHERE key_id = ?", [keyId]);
        if (!record) {
            throw new Error(`Key status not found for ID: ${keyId}`);
        }
        return record.status;
    }

    async logKeyUsage(keyId, operationType, operationStatus, details = {}) {
        try {
            await this.db.execute(
                `INSERT INTO key_usage_log 
                 (key_id, operation_type, operation_status, details)
                 VALUES (?, ?, ?, ?)`,
                [keyId, operationType, operationStatus, JSON.stringify(details)]
            );
        } catch (error) {
            this.monitoring.log('ERROR', `Failed to log key usage for ${keyId}: ${error.message}`, {
                operation: 'key_usage_logging',
                keyId,
                operationType,
                operationStatus
            });
        }
    }

    async logEncryptionOperation(operationType, algorithm, dataSize, operationTimeMs, success, errorMessage = null) {
        try {
            await this.db.execute(
                `INSERT INTO encryption_operations 
                 (operation_id, key_id, algorithm, data_size, operation_time_ms, success, error_message)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [this.generateKeyId(), 'N/A', algorithm, dataSize, operationTimeMs, success, errorMessage]
            );
        } catch (error) {
            this.monitoring.log('ERROR', `Failed to log encryption operation: ${error.message}`, {
                operation: 'op_logging',
                type: operationType,
                success
            });
        }
    }

    async startKeyRotationScheduler() {
        if (this.rotationInterval) {
            clearInterval(this.rotationInterval);
        }

        this.rotationInterval = setInterval(
            () => this.performKeyRotationCheck().catch(e => {
                this.monitoring.log('ERROR', `Key rotation check failed: ${e.message}`, { operation: 'key_rotation_scheduler' });
            }),
            1 * 60 * 60 * 1000 // Run every 1 hour
        );

        this.monitoring.log('INFO', 'Key rotation scheduler initialized to run every hour');
    }

    async performKeyRotationCheck() {
        this.monitoring.log('INFO', 'Starting periodic key rotation check...');

        // Find keys past their expiration date that are still active
        const keysToRotate = await this.db.query(
            `SELECT key_id, key_type, algorithm, metadata 
             FROM quantum_keys 
             WHERE status = 'active' AND expires_at < DATETIME('now')`
        );

        for (const key of keysToRotate) {
            try {
                this.monitoring.log('WARN', `Key ${key.key_id} is expired and needs rotation.`, {
                    keyId: key.key_id,
                    algorithm: key.algorithm
                });

                await this.rotateKey(key.key_id, key.algorithm, key.key_type, safeParseJson(key.metadata)?.purpose || 'general');

            } catch (e) {
                this.monitoring.log('ERROR', `Failed to rotate key ${key.key_id}: ${e.message}`, {
                    keyId: key.key_id,
                    error: e.message,
                    operation: 'key_rotation'
                });
                await this.auditLogger.logSecurityEvent({
                    eventType: 'key_rotation_failure',
                    severity: 'high',
                    description: `Automated key rotation failed for key ${key.key_id}: ${e.message}`,
                    keyId: key.key_id
                });
            }
        }

        this.monitoring.log('INFO', `Key rotation check finished. ${keysToRotate.length} keys rotated/attempted.`);
    }

    async rotateKey(oldKeyId, algorithm, keyType, purpose) {
        // 1. Generate new key pair
        const newKey = await this.generateKeyPair(algorithm, keyType, purpose);

        // 2. Mark old key as expired/pending rotation
        // We set to 'pending_rotation' if it's a master key (which may require re-wrapping other keys)
        const newStatus = keyType === KEY_TYPES.MASTER ? KEY_STATUS.PENDING_ROTATION : KEY_STATUS.EXPIRED;
        
        await this.db.execute(
            "UPDATE quantum_keys SET status = ?, last_rotated = CURRENT_TIMESTAMP WHERE key_id = ?",
            [newStatus, oldKeyId]
        );

        // 3. Log rotation history
        await this.db.execute(
            `INSERT INTO key_rotation_history (old_key_id, new_key_id, rotation_reason) 
             VALUES (?, ?, ?)`,
            [oldKeyId, newKey.keyId, 'Expiration/Automated Rotation']
        );

        // 4. Update cache: remove old key, new key is already in cache from generateKeyPair
        this.keyCache.delete(oldKeyId);

        // 5. Log audit event
        await this.auditLogger.logSecurityEvent({
            eventType: 'key_rotated',
            severity: 'medium',
            description: `Key rotated from ${oldKeyId} to ${newKey.keyId}`,
            keyId: newKey.keyId,
            oldKeyId
        });

        this.monitoring.log('INFO', `Successfully rotated key: Old ID: ${oldKeyId}, New ID: ${newKey.keyId}`);
        
        return newKey;
    }

    // Health check method
    async healthCheck() {
        try {
            const metrics = this.monitoring.getMetrics();
            const dbConnected = await this.db.queryOne("SELECT 1 as connected");
            
            return {
                status: 'HEALTHY',
                database: dbConnected ? 'CONNECTED' : 'DISCONNECTED',
                metrics,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'UNHEALTHY',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

// Export the main class and utilities
export { EnterpriseQuantumResistantCrypto as QuantumResistantCrypto };
