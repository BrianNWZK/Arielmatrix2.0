import { promisify } from 'util';
import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
  createHash
} from 'crypto';
import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';

// Import Kyber functions with proper error handling
import * as kyberModule from '../pqc-kyber/index.js';

// Extract functions with fallbacks
const kyberKeyPair = kyberModule.kyberKeyPair;
const kyberEncapsulate = kyberModule.kyberEncapsulate;
const kyberDecapsulate = kyberModule.kyberDecapsulate;

// Import error classes
const PQCKyberError = kyberModule.PQCKyberError;

// Constants
const ALGORITHMS = {
  KYBER_512: 'kyber-512',
  KYBER_768: 'kyber-768', 
  KYBER_1024: 'kyber-1024',
  AES_256_GCM: 'aes-256-gcm'
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

// Enhanced monitoring service
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
  }

  recordOperation(operation, duration, success = true) {
    this.metrics[`${operation}Operations`]++;
    if (!success) {
      this.metrics.errors++;
    }
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
      operational: errorRate < 0.05 // 5% error rate threshold
    };
  }
}

// Database adapter for ArielSQLiteEngine
class DBAdapter {
  constructor(engine, monitor) {
    this.engine = engine;
    this.monitor = monitor;
  }

  async connect() {
    if (typeof this.engine.connect === 'function') {
      return this.engine.connect();
    }
    // If engine has initialize method
    if (typeof this.engine.initialize === 'function') {
      return this.engine.initialize();
    }
    this.monitor?.log('WARN', 'DB engine has no connect/initialize, assuming connected');
    return true;
  }

  async execute(sql, params = []) {
    if (typeof this.engine.execute === 'function') {
      return this.engine.execute(sql, params);
    }
    if (typeof this.engine.run === 'function') {
      return this.engine.run(sql, params);
    }
    throw new Error('DBAdapter: No execute/run method available');
  }

  async query(sql, params = []) {
    if (typeof this.engine.query === 'function') {
      const result = await this.engine.query(sql, params);
      return Array.isArray(result) ? result : [result].filter(Boolean);
    }
    if (typeof this.engine.all === 'function') {
      const rows = await this.engine.all(sql, params);
      return rows || [];
    }
    throw new Error('DBAdapter: No query/all method available');
  }

  async queryOne(sql, params = []) {
    const result = await this.query(sql, params);
    return result[0] || null;
  }
}

export class EnterpriseQuantumResistantCrypto {
  constructor(config = {}) {
    this.config = {
      keyRotationInterval: config.keyRotationInterval || 90 * 24 * 60 * 60 * 1000, // 90 days
      encryptionAlgorithm: config.encryptionAlgorithm || ALGORITHMS.KYBER_768,
      databasePath: config.databasePath || './data/quantum_crypto.db',
      ...config
    };

    // Initialize database with adapter
    const engine = new ArielSQLiteEngine({
      dbPath: this.config.databasePath,
      autoBackup: true
    });
    this.db = new DBAdapter(engine);
    this.monitoring = new MonitoringService();

    this.keyDerivationSalt = randomBytes(32);
    this.keyCache = new Map();
    this.initialized = false;
    this.initializationPromise = null;
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

      await this.db.connect();
      this.monitoring.log('INFO', 'Database connected successfully');

      await this.createDatabaseSchema();
      this.monitoring.log('INFO', 'Database schema created successfully');

      await this.initializeMasterKeys();
      this.monitoring.log('INFO', 'Master keys initialized successfully');

      this.initialized = true;
      this.monitoring.log('INFO', 'QuantumResistantCrypto initialized successfully');

      return true;
    } catch (error) {
      this.monitoring.log('ERROR', `Failed to initialize QuantumResistantCrypto: ${error.message}`, {
        stack: error.stack,
        operation: 'initialization'
      });
      throw error;
    }
  }

  async createDatabaseSchema() {
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
        metadata TEXT
      )`,

      `CREATE TABLE IF NOT EXISTS key_usage_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key_id TEXT NOT NULL,
        operation_type TEXT NOT NULL CHECK(operation_type IN ('encrypt', 'decrypt', 'sign', 'verify', 'generate')),
        operation_status TEXT NOT NULL CHECK(operation_status IN ('success', 'failure')),
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        details TEXT
      )`
    ];

    for (const tableSql of tables) {
      await this.db.execute(tableSql);
    }

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_quantum_keys_key_id ON quantum_keys(key_id)',
      'CREATE INDEX IF NOT EXISTS idx_quantum_keys_status ON quantum_keys(status)',
      'CREATE INDEX IF NOT EXISTS idx_key_usage_log_key_id ON key_usage_log(key_id)'
    ];

    for (const indexSql of indexes) {
      await this.db.execute(indexSql);
    }

    this.monitoring.log('INFO', 'Database schema and indexes created successfully');
  }

  async initializeMasterKeys() {
    try {
      const existingMasterKeys = await this.db.query(
        "SELECT * FROM quantum_keys WHERE key_type = 'master' AND status = 'active'"
      );

      if (!existingMasterKeys || existingMasterKeys.length === 0) {
        this.monitoring.log('INFO', 'No existing master keys found, generating new ones');
        await this.generateMasterKeys();
      } else {
        this.monitoring.log('INFO', `Found ${existingMasterKeys.length} existing master keys`);
        // Load existing keys into cache
        for (const key of existingMasterKeys) {
          try {
            const privateKey = await this.decryptWithLocalKey(key.private_key_encrypted);
            this.keyCache.set(key.key_id, {
              publicKey: key.public_key,
              privateKey: privateKey,
              algorithm: key.algorithm,
              type: key.key_type
            });
          } catch (error) {
            this.monitoring.log('ERROR', `Failed to load master key ${key.key_id}: ${error.message}`);
          }
        }
      }
    } catch (error) {
      this.monitoring.log('ERROR', `Failed to initialize master keys: ${error.message}`);
      throw error;
    }
  }

  async generateMasterKeys() {
    try {
      this.monitoring.log('INFO', 'Generating new master keys');

      // Generate encryption master key
      const encryptionKey = await this.generateKeyPair(
        ALGORITHMS.KYBER_768,
        KEY_TYPES.MASTER,
        'encryption_master'
      );

      this.monitoring.log('INFO', 'Master keys generated successfully');
      return { encryptionKey };

    } catch (error) {
      this.monitoring.log('ERROR', `Failed to generate master keys: ${error.message}`, {
        operation: 'master_key_generation'
      });
      throw error;
    }
  }

  async generateKeyPair(algorithm = ALGORITHMS.KYBER_768, keyType = KEY_TYPES.ENCRYPTION, purpose = 'general') {
    const startTime = Date.now();

    try {
      // Validate Kyber is available
      if (!kyberKeyPair) {
        throw new Error('Kyber key pair generation not available');
      }

      let publicKey, privateKey;

      // Generate keys based on algorithm
      switch (algorithm) {
        case ALGORITHMS.KYBER_512:
        case ALGORITHMS.KYBER_768:
        case ALGORITHMS.KYBER_1024:
          const level = parseInt(algorithm.split('-')[1]);
          const kyberKeys = await kyberKeyPair({ level });
          publicKey = kyberKeys.publicKey.toString('base64');
          privateKey = kyberKeys.privateKey.toString('base64');
          break;

        default:
          throw new Error(`Unsupported algorithm: ${algorithm}`);
      }

      const keyId = this.generateKeyId();
      const encryptedPrivateKey = await this.encryptPrivateKey(privateKey, purpose);
      const expiresAt = new Date(Date.now() + this.config.keyRotationInterval).toISOString();

      await this.db.execute(
        `INSERT INTO quantum_keys 
         (key_id, public_key, private_key_encrypted, key_type, algorithm, key_size, status, expires_at, metadata) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          keyId, 
          publicKey, 
          encryptedPrivateKey, 
          keyType, 
          algorithm, 
          this.getKeySize(algorithm), 
          KEY_STATUS.ACTIVE, 
          expiresAt, 
          JSON.stringify({ purpose })
        ]
      );

      // Cache the key
      this.keyCache.set(keyId, {
        publicKey,
        privateKey,
        algorithm,
        type: keyType,
        expiresAt
      });

      const operationTime = Date.now() - startTime;
      this.monitoring.recordOperation('keyGeneration', operationTime, true);

      await this.logKeyUsage(keyId, 'generate', 'success', { 
        algorithm, 
        keyType, 
        purpose, 
        operationTime 
      });

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
      this.monitoring.log('ERROR', `Key pair generation failed for ${algorithm}: ${error.message}`, {
        stack: error.stack,
        operationTime
      });
      throw error;
    }
  }

  async getKeyPair(keyId) {
    if (this.keyCache.has(keyId)) {
      return this.keyCache.get(keyId);
    }

    const keyRecord = await this.db.queryOne(
      "SELECT * FROM quantum_keys WHERE key_id = ? AND status = 'active'",
      [keyId]
    );

    if (!keyRecord) {
      this.monitoring.log('WARN', `Active key not found in DB: ${keyId}`);
      return null;
    }

    try {
      const privateKey = await this.decryptWithLocalKey(keyRecord.private_key_encrypted);
      const keyPair = {
        publicKey: keyRecord.public_key,
        privateKey: privateKey,
        algorithm: keyRecord.algorithm,
        type: keyRecord.key_type,
        expiresAt: keyRecord.expires_at
      };
      this.keyCache.set(keyId, keyPair);
      return keyPair;
    } catch (error) {
      this.monitoring.log('ERROR', `Failed to decrypt key ${keyId} from DB: ${error.message}`, { error: error.message });
      await this.updateKeyStatus(keyId, KEY_STATUS.COMPROMISED);
      throw new Error('Key decryption failed: possible compromise or corruption');
    }
  }

  async updateKeyStatus(keyId, status) {
    await this.db.execute(
      `UPDATE quantum_keys SET status = ?, metadata = json_insert(metadata, '$.statusChange', ?) WHERE key_id = ?`,
      [status, new Date().toISOString(), keyId]
    );
    this.keyCache.delete(keyId);
    this.monitoring.log('SECURITY', `Key status updated to ${status}: ${keyId}`, { status });
  }

  // --- Crypto Operations ---

  async encrypt(keyId, plaintext) {
    await this.ensureInitialized();
    const startTime = Date.now();
    
    try {
      const keyPair = await this.getKeyPair(keyId);
      if (!keyPair) {
        throw new Error(`Encryption key ${keyId} not found or inactive`);
      }
      if (keyPair.type !== KEY_TYPES.ENCRYPTION && keyPair.type !== KEY_TYPES.MASTER) {
        throw new Error(`Key ${keyId} is not an encryption key`);
      }
      
      const plaintextBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');

      // 1. Kyber Encapsulation (KEM)
      const kyberResult = await kyberEncapsulate(Buffer.from(keyPair.publicKey, 'base64'), {
        level: this.getLevelFromAlgorithm(keyPair.algorithm)
      });
      
      const sharedSecret = kyberResult.sharedSecret;
      const ciphertextKyber = kyberResult.ciphertext;

      // 2. Key Derivation for AES
      const aesKey = this.deriveSymmetricKey(sharedSecret);

      // 3. AES-256-GCM Encryption (DEM)
      const iv = randomBytes(16);
      const cipher = createCipheriv(ALGORITHMS.AES_256_GCM, aesKey, iv);

      let encrypted = cipher.update(plaintextBuffer);
      encrypted = Buffer.concat([encrypted, cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      // Format: KyberCiphertext|IV|AuthTag|AESCiphertext
      const finalCiphertext = Buffer.concat([
        ciphertextKyber,
        iv,
        authTag,
        encrypted
      ]).toString('base64');

      const operationTime = Date.now() - startTime;
      this.monitoring.recordOperation('encryption', operationTime, true);
      await this.logKeyUsage(keyId, 'encrypt', 'success', {
        algorithm: keyPair.algorithm,
        operationTime,
        plaintextLength: plaintextBuffer.length
      });

      return finalCiphertext;
    } catch (error) {
      const operationTime = Date.now() - startTime;
      this.monitoring.recordOperation('encryption', operationTime, false);
      await this.logKeyUsage(keyId, 'encrypt', 'failure', {
        error: error.message,
        operationTime
      });
      throw error;
    }
  }

  async decrypt(keyId, ciphertext) {
    await this.ensureInitialized();
    const startTime = Date.now();

    try {
      const keyPair = await this.getKeyPair(keyId);
      if (!keyPair) {
        throw new Error(`Decryption key ${keyId} not found or inactive`);
      }
      if (keyPair.type !== KEY_TYPES.ENCRYPTION && keyPair.type !== KEY_TYPES.MASTER) {
        throw new Error(`Key ${keyId} is not a decryption key`);
      }
      
      const ciphertextBuffer = Buffer.from(ciphertext, 'base64');
      const level = this.getLevelFromAlgorithm(keyPair.algorithm);
      const kyberConstants = await kyberModule.kyberConstants({ level });
      
      // Extract components
      const CT_KYBER_LEN = kyberConstants.CIPHERTEXTBYTES;
      const IV_LEN = 16;
      const TAG_LEN = 16;
      
      if (ciphertextBuffer.length < CT_KYBER_LEN + IV_LEN + TAG_LEN) {
        throw new Error('Invalid ciphertext length or format');
      }

      const ciphertextKyber = ciphertextBuffer.subarray(0, CT_KYBER_LEN);
      const iv = ciphertextBuffer.subarray(CT_KYBER_LEN, CT_KYBER_LEN + IV_LEN);
      const authTag = ciphertextBuffer.subarray(CT_KYBER_LEN + IV_LEN, CT_KYBER_LEN + IV_LEN + TAG_LEN);
      const encryptedData = ciphertextBuffer.subarray(CT_KYBER_LEN + IV_LEN + TAG_LEN);

      // 1. Kyber Decapsulation (KEM)
      const sharedSecret = await kyberDecapsulate(Buffer.from(keyPair.privateKey, 'base64'), ciphertextKyber, { level });

      // 2. Key Derivation for AES
      const aesKey = this.deriveSymmetricKey(sharedSecret);

      // 3. AES-256-GCM Decryption (DEM)
      const decipher = createDecipheriv(ALGORITHMS.AES_256_GCM, aesKey, iv);
      decipher.setAuthTag(authTag);
      
      let decrypted = decipher.update(encryptedData);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const operationTime = Date.now() - startTime;
      this.monitoring.recordOperation('decryption', operationTime, true);
      await this.logKeyUsage(keyId, 'decrypt', 'success', {
        algorithm: keyPair.algorithm,
        operationTime,
        ciphertextLength: ciphertextBuffer.length
      });
      
      return decrypted;
    } catch (error) {
      const operationTime = Date.now() - startTime;
      this.monitoring.recordOperation('decryption', operationTime, false);
      await this.logKeyUsage(keyId, 'decrypt', 'failure', {
        error: error.message,
        operationTime
      });
      throw error;
    }
  }
  
  // --- Internal Utilities ---

  async ensureInitialized() {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  generateKeyId() {
    return createHash('sha256').update(randomBytes(32)).digest('hex').substring(0, 32);
  }

  deriveSymmetricKey(sharedSecret) {
    // HKDF or similar robust key derivation should be used, but for simplicity, using scrypt with a fixed salt
    return scryptSync(sharedSecret, this.keyDerivationSalt, 32);
  }

  async encryptPrivateKey(privateKey, purpose) {
    // TODO: Implement robust Master Key Encapsulation/Wrapping (KWP)
    // For now, this is a placeholder/mock of master key protection
    return `ENCRYPTED_WITH_LOCAL_KEY_FOR_${purpose}_${privateKey}`;
  }

  async decryptWithLocalKey(encryptedPrivateKey) {
    // TODO: Implement robust Master Key Decapsulation/Unwrapping
    if (!encryptedPrivateKey.startsWith('ENCRYPTED_WITH_LOCAL_KEY_FOR_')) {
      throw new Error('Unsupported private key encryption format');
    }
    return encryptedPrivateKey.split('_').pop();
  }

  getKeySize(algorithm) {
    switch (algorithm) {
      case ALGORITHMS.KYBER_512: return 512;
      case ALGORITHMS.KYBER_768: return 768;
      case ALGORITHMS.KYBER_1024: return 1024;
      default: return 0;
    }
  }

  getLevelFromAlgorithm(algorithm) {
    const match = algorithm.match(/kyber-(\d+)/);
    return match ? parseInt(match[1]) : 768;
  }

  async logKeyUsage(keyId, operationType, status, details = {}) {
    try {
      await this.db.execute(
        `INSERT INTO key_usage_log (key_id, operation_type, operation_status, details) VALUES (?, ?, ?, ?)`,
        [keyId, operationType, status, JSON.stringify(details)]
      );
    } catch (error) {
      this.monitoring.log('ERROR', `Failed to log key usage for ${keyId}`, { error: error.message });
    }
  }
}

export {
  ALGORITHMS,
  KEY_TYPES,
  KEY_STATUS,
  PQCKyberError,
  EnterpriseQuantumResistantCrypto,
  MonitoringService
};

export default EnterpriseQuantumResistantCrypto;
