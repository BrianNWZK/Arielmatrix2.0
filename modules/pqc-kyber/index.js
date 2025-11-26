import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const randomBytes = promisify(crypto.randomBytes);

// Enterprise-grade error classes
class PQCKyberError extends Error {
  constructor(message, code = 'KYBER_ERROR') {
    super(message);
    this.name = 'PQCKyberError';
    this.code = code;
  }
}

class KyberSecurityError extends PQCKyberError {
  constructor(message) {
    super(message, 'SECURITY_VIOLATION');
  }
}

class KyberConfigurationError extends PQCKyberError {
  constructor(message) {
    super(message, 'CONFIGURATION_ERROR');
  }
}

// Security configuration
const KYBER_SECURITY_CONFIG = {
  MAX_MEMORY_GROWTH: 8,
  OPERATION_TIMEOUT: 25000,
  KEY_ROTATION_INTERVAL: 12 * 60 * 60 * 1000, // 12 hours
  MAX_CIPHERTEXT_SIZE: 5 * 1024 * 1024, // 5MB
  MIN_ENTROPY_BYTES: 32,
  SESSION_KEY_LIFETIME: 60 * 1000 // 1 minute for session keys
};

// Performance monitoring
const kyberMetrics = {
  keyGeneration: [],
  encapsulation: [],
  decapsulation: [],
  failures: 0
};

const KYBER_METRICS_WINDOW = 1000;
let kyber = null;
let kyberMemory = null;
let kyberInitialized = false;
let kyberInitPromise = null;

/**
 * Kyber-specific security logger
 */
const kyberLogger = {
  log: (level, message, metadata = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      module: 'pqc-kyber',
      message,
      ...metadata
    };
    
    console.log(JSON.stringify(logEntry));
    
    if (level === 'ERROR' || level === 'SECURITY') {
      kyberMetrics.failures++;
    }
  },
  
  audit: (operation, keyId = null, success = true, metadata = {}) => {
    kyberLogger.log('AUDIT', `Kyber ${operation}, Success: ${success}`, {
      operation,
      keyId,
      success,
      ...metadata
    });
  }
};

/**
 * Kyber memory manager
 */
class KyberMemoryManager {
  constructor() {
    this.growthCount = 0;
    this.maxSize = 128 * 65536; // 8MB maximum for Kyber
  }
  
  growMemory(wasmInstance, requiredSize) {
    if (this.growthCount >= KYBER_SECURITY_CONFIG.MAX_MEMORY_GROWTH) {
      throw new KyberSecurityError('Maximum memory growth attempts exceeded');
    }
    
    const currentPages = wasmInstance.memory.buffer.byteLength / 65536;
    const requiredPages = Math.ceil(requiredSize / 65536);
    if ((currentPages + requiredPages) * 65536 > this.maxSize) {
      throw new KyberSecurityError('Memory allocation would exceed maximum allowed size');
    }
    
    wasmInstance.memory.grow(requiredPages);
    this.growthCount++;
    
    kyberLogger.log('DEBUG', `Kyber memory grown by ${requiredPages} pages`, {
      currentPages,
      newPages: currentPages + requiredPages,
      growthCount: this.growthCount
    });
  }
}

const kyberMemoryManager = new KyberMemoryManager();

/**
 * Kyber input validation
 */
function validateKyberInputs(params = {}) {
  const { level = 768, publicKey, privateKey, ciphertext } = params;
  const validLevels = [512, 768, 1024];
  if (!validLevels.includes(level)) {
    throw new KyberConfigurationError(`Invalid Kyber level: ${level}. Must be 512, 768, or 1024`);
  }
  
  if (ciphertext && ciphertext.length > KYBER_SECURITY_CONFIG.MAX_CIPHERTEXT_SIZE) {
    throw new KyberSecurityError(`Ciphertext size exceeds maximum allowed`);
  }
  
  return { level };
}

/**
 * Enhanced Kyber WASM initialization
 */
async function initializeKyberWasm(level) {
  if (kyberInitialized && kyber?.level === level) {
    return kyber;
  }

  if (kyberInitPromise) {
    return kyberInitPromise;
  }

  kyberInitPromise = (async () => {
    try {
      kyberLogger.log('INFO', `Initializing Kyber${level} WASM module`);
      
      const wasmFile = `kyber${level}.wasm`;
      const wasmPath = path.resolve(__dirname, wasmFile);

      let wasmBinary;
      try {
        wasmBinary = await fs.readFile(wasmPath);
      } catch (e) {
        if (e.code === 'ENOENT') {
          throw new KyberConfigurationError(`WASM file not found: ${wasmFile}. Please build Kyber WASM modules.`);
        }
        throw e;
      }
      
      const wasmHash = crypto.createHash('sha256').update(wasmBinary).digest('hex');
      
      kyberLogger.log('DEBUG', `Kyber WASM module hash: ${wasmHash}`, { wasmHash });

      kyberMemory = new WebAssembly.Memory({ 
        initial: 128, 
        maximum: 32768,
        shared: false
      });

      const env = {
        env: {
          memory: kyberMemory,
          emscripten_notify_memory_growth: (index) => {
            kyberMemoryManager.growMemory({ memory: kyberMemory }, index);
          },
          abort: (msg, file, line, column) => {
            const error = new KyberSecurityError(`Kyber WASM abort: ${msg} at ${file}:${line}:${column}`);
            kyberLogger.log('ERROR', 'Kyber WASM execution aborted', { msg, file, line, column });
            throw error;
          },
          randombytes: (buffer, length) => {
            crypto.randomFillSync(new Uint8Array(kyberMemory.buffer, buffer, length));
          }
        }
      };

      const { instance } = await WebAssembly.instantiate(wasmBinary, env);
      const exports = instance.exports;
      const levelPrefix = level === 512 ? 'KYBER512' : level === 1024 ? 'KYBER1024' : 'KYBER768';

      const keypair = exports[`PQCLEAN_${levelPrefix}_CLEAN_crypto_kem_keypair`];
      const encapsulate = exports[`PQCLEAN_${levelPrefix}_CLEAN_crypto_kem_enc`];
      const decapsulate = exports[`PQCLEAN_${levelPrefix}_CLEAN_crypto_kem_dec`];

      if (!keypair || !encapsulate || !decapsulate) {
        throw new KyberConfigurationError(`Required Kyber${level} functions not found`);
      }

      const PUBLICKEYBYTES = exports[`PQCLEAN_${levelPrefix}_CLEAN_CRYPTO_PUBLICKEYBYTES`];
      const SECRETKEYBYTES = exports[`PQCLEAN_${levelPrefix}_CLEAN_CRYPTO_SECRETKEYBYTES`];
      const CIPHERTEXTBYTES = exports[`PQCLEAN_${levelPrefix}_CLEAN_CRYPTO_CIPHERTEXTBYTES`];
      const BYTES = exports[`PQCLEAN_${levelPrefix}_CLEAN_CRYPTO_BYTES`] || 32;

      // Enhanced memory allocation with security checks
      function secureAlloc(size, operation = 'unknown') {
        if (size > 1024 * 1024) { // 1MB limit per allocation
          throw new KyberSecurityError(`Allocation size ${size} too large for ${operation}`);
        }
        
        const currentOffset = kyberMemory.buffer.byteLength;
        
        if (currentOffset + size > kyberMemoryManager.maxSize) {
          kyberMemoryManager.growMemory({ memory: kyberMemory }, size);
        }
        
        return {
          ptr: currentOffset,
          view: new Uint8Array(kyberMemory.buffer, currentOffset, size)
        };
      }
      
      const alloc = (size, operation) => secureAlloc(size, operation);

      kyber = {
        level,
        constants: { PUBLICKEYBYTES, SECRETKEYBYTES, CIPHERTEXTBYTES, BYTES },
        
        // Key Pair Generation
        keypair: () => {
          const startTime = Date.now();
          try {
            const pk = alloc(PUBLICKEYBYTES, 'keypair-public');
            const sk = alloc(SECRETKEYBYTES, 'keypair-secret');
            
            const rc = keypair(pk.ptr, sk.ptr);
            if (rc !== 0) throw new KyberSecurityError(`Key pair generation failed: ${rc}`);

            const duration = Date.now() - startTime;
            kyberMetrics.keyGeneration.push(duration);
            if (kyberMetrics.keyGeneration.length > KYBER_METRICS_WINDOW) {
              kyberMetrics.keyGeneration.shift();
            }

            kyberLogger.audit('KEY_GENERATION', null, true, { duration, level });
            return {
              publicKey: Buffer.from(pk.view),
              secretKey: Buffer.from(sk.view)
            };
          } catch (error) {
            kyberLogger.audit('KEY_GENERATION', null, false, { error: error.message, level });
            throw error;
          }
        },
        
        // Encapsulation
        encapsulate: (publicKey) => {
          const startTime = Date.now();
          try {
            const pk = alloc(publicKey.length, 'encapsulate-public');
            pk.view.set(publicKey);
            
            const ct = alloc(CIPHERTEXTBYTES, 'encapsulate-ciphertext');
            const ss = alloc(BYTES, 'encapsulate-secret');
            
            const rc = encapsulate(ct.ptr, ss.ptr, pk.ptr);
            if (rc !== 0) throw new KyberSecurityError(`Encapsulation failed: ${rc}`);

            const duration = Date.now() - startTime;
            kyberMetrics.encapsulation.push(duration);
            if (kyberMetrics.encapsulation.length > KYBER_METRICS_WINDOW) {
              kyberMetrics.encapsulation.shift();
            }
            
            kyberLogger.audit('ENCAPSULATION', null, true, { duration, level });

            return {
              ciphertext: Buffer.from(ct.view),
              sharedSecret: Buffer.from(ss.view)
            };
          } catch (error) {
            kyberLogger.audit('ENCAPSULATION', null, false, { error: error.message, level });
            throw error;
          }
        },
        
        // Decapsulation
        decapsulate: (ciphertext, secretKey) => {
          const startTime = Date.now();
          try {
            if (ciphertext.length !== CIPHERTEXTBYTES) {
              throw new KyberSecurityError(`Ciphertext length mismatch: expected ${CIPHERTEXTBYTES}, got ${ciphertext.length}`);
            }
            if (secretKey.length !== SECRETKEYBYTES) {
              throw new KyberSecurityError(`Secret key length mismatch: expected ${SECRETKEYBYTES}, got ${secretKey.length}`);
            }

            const ct = alloc(ciphertext.length, 'decapsulate-ciphertext');
            ct.view.set(ciphertext);
            const sk = alloc(secretKey.length, 'decapsulate-secret');
            sk.view.set(secretKey);
            
            const ss = alloc(BYTES, 'decapsulate-secret');
            
            const rc = decapsulate(ss.ptr, ct.ptr, sk.ptr);
            if (rc !== 0) throw new KyberSecurityError(`Decapsulation failed: ${rc}`);

            const duration = Date.now() - startTime;
            kyberMetrics.decapsulation.push(duration);
            if (kyberMetrics.decapsulation.length > KYBER_METRICS_WINDOW) {
              kyberMetrics.decapsulation.shift();
            }
            
            kyberLogger.audit('DECAPSULATION', null, true, { duration, level });
            return Buffer.from(ss.view);
          } catch (error) {
            kyberLogger.audit('DECAPSULATION', null, false, { error: error.message, level });
            throw error;
          }
        },
        
        instance
      };
      
      kyberInitialized = true;
      kyberLogger.log('INFO', `Kyber${level} WASM module successfully initialized`);
      kyberInitPromise = null;
      return kyber;

    } catch (error) {
      kyberLogger.log('ERROR', `Kyber WASM initialization failed for level ${level}`, { error: error.message, stack: error.stack });
      kyberInitPromise = null;
      throw error;
    }
  })();
  return kyberInitPromise;
}

// Public API Functions

/**
 * Generates a Kyber key pair (public key and private key).
 */
async function kyberKeyPair(params = {}) {
  const { level } = validateKyberInputs(params);
  try {
    const k = await initializeKyberWasm(level);
    const keyPair = k.keypair();
    
    const keyId = crypto.createHash('sha256')
      .update(keyPair.publicKey)
      .update(await randomBytes(KYBER_SECURITY_CONFIG.MIN_ENTROPY_BYTES))
      .digest('hex')
      .substring(0, 16);
    
    kyberLogger.log('INFO', `Generated new Kyber key pair`, { 
      keyId, 
      level,
      publicKeyLength: keyPair.publicKey.length,
      secretKeyLength: keyPair.secretKey.length
    });
    
    return {
      ...keyPair,
      keyId,
      algorithm: `kyber${level}`,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    kyberLogger.log('ERROR', 'Kyber key pair generation failed', { error: error.message, level });
    throw error;
  }
}

/**
 * Encapsulates a shared secret using a public key.
 * Returns { ciphertext: Buffer, sharedSecret: Buffer }
 */
async function kyberEncapsulate(publicKey, params = {}) {
  const { level } = validateKyberInputs({ ...params, publicKey });
  if (!(publicKey instanceof Buffer)) {
    publicKey = Buffer.from(publicKey);
  }
  try {
    const k = await initializeKyberWasm(level);
    const result = k.encapsulate(publicKey);
    
    kyberLogger.audit('ENCAPSULATION', null, true, { 
      ciphertextLength: result.ciphertext.length, 
      level 
    });
    
    return {
      ...result,
      sessionExpiry: Date.now() + KYBER_SECURITY_CONFIG.SESSION_KEY_LIFETIME
    };
  } catch (error) {
    kyberLogger.audit('ENCAPSULATION', null, false, { 
      error: error.message, 
      publicKeyLength: publicKey?.length, 
      level 
    });
    throw error;
  }
}

/**
 * Robust decapsulation with validation
 */
async function kyberDecapsulate(privateKey, ciphertext, params = {}) {
  const { level } = validateKyberInputs({ ...params, privateKey, ciphertext });
  if (!(privateKey instanceof Buffer)) {
    privateKey = Buffer.from(privateKey);
  }
  if (!(ciphertext instanceof Buffer)) {
    ciphertext = Buffer.from(ciphertext);
  }
  try {
    const k = await initializeKyberWasm(level);
    const sharedSecret = k.decapsulate(ciphertext, privateKey);
    
    kyberLogger.audit('DECAPSULATION', null, true, {
      ciphertextLength: ciphertext.length,
      level
    });
    
    return sharedSecret;
  } catch (error) {
    kyberLogger.audit('DECAPSULATION', null, false, {
      error: error.message,
      ciphertextLength: ciphertext?.length,
      level
    });
    throw error;
  }
}

/**
 * Get Kyber constants
 */
async function kyberConstants(params = {}) {
  const { level } = validateKyberInputs(params);
  const k = await initializeKyberWasm(level);
  return k.constants;
}

/**
 * Returns performance metrics for Kyber operations.
 */
function getKyberMetrics() {
  const calculateStats = (values) => {
    if (values.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { avg, min, max, count: values.length };
  };
  
  return {
    keyGeneration: calculateStats(kyberMetrics.keyGeneration),
    encapsulation: calculateStats(kyberMetrics.encapsulation),
    decapsulation: calculateStats(kyberMetrics.decapsulation),
    failures: kyberMetrics.failures,
    timestamp: new Date().toISOString()
  };
}

/**
 * Kyber health check
 */
async function kyberHealthCheck() {
  try {
    const { publicKey, secretKey } = await kyberKeyPair({ level: 768 });
    const encapsulated = await kyberEncapsulate(publicKey);
    const decapsulated = await kyberDecapsulate(secretKey, encapsulated.ciphertext);
    
    const isValid = Buffer.compare(encapsulated.sharedSecret, decapsulated) === 0;
    
    return {
      status: isValid ? 'HEALTHY' : 'UNHEALTHY',
      wasmInitialized: kyberInitialized,
      timestamp: new Date().toISOString(),
      testResult: isValid
    };
  } catch (error) {
    return {
      status: 'UNHEALTHY',
      wasmInitialized: kyberInitialized,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

/**
 * Enterprise-grade provider for Kyber operations, managing key rotation and sessions.
 */
class PQCKyberProvider {
  constructor(options = {}) {
    this.level = options.level || 768;
    this.keyStore = new Map();
    this.sessionStore = new Map();
    this.rotationTimers = new Map();
    this.options = {
      keyRotationInterval: KYBER_SECURITY_CONFIG.KEY_ROTATION_INTERVAL,
      sessionLifetime: KYBER_SECURITY_CONFIG.SESSION_KEY_LIFETIME,
      ...options
    };
    kyberLogger.log('INFO', `PQCKyberProvider initialized for Kyber${this.level}`, { 
      rotationInterval: this.options.keyRotationInterval,
      sessionLifetime: this.options.sessionLifetime 
    });
  }

  async generateKeyPair(keyId, purpose = 'general') {
    kyberLogger.log('INFO', `Generating new Kyber key pair: ${keyId}`);
    try {
      const { publicKey, secretKey } = await kyberKeyPair({ level: this.level });
      
      this.keyStore.set(keyId, { publicKey, secretKey, createdAt: Date.now(), purpose });
      this.scheduleKeyRotation(keyId);
      
      kyberLogger.audit('KEY_ROTATION', keyId, true, { purpose });
      return { publicKey };

    } catch (error) {
      kyberLogger.audit('KEY_ROTATION', keyId, false, { error: error.message, purpose });
      throw error;
    }
  }

  getPublicKey(keyId) {
    const keyInfo = this.keyStore.get(keyId);
    if (!keyInfo) {
      throw new KyberConfigurationError(`Public key not found for ID: ${keyId}`);
    }
    return keyInfo.publicKey;
  }

  async encapsulateAndEstablishSession(keyId, params = {}) {
    const publicKey = this.getPublicKey(keyId);
    
    const result = await kyberEncapsulate(publicKey, { level: this.level });

    const sessionId = crypto.randomBytes(16).toString('hex');
    this.sessionStore.set(sessionId, {
      ...result,
      keyId,
      createdAt: Date.now(),
      expiresAt: Date.now() + this.options.sessionLifetime
    });
    
    this.cleanupSessions();
    
    return {
      sessionId,
      ciphertext: result.ciphertext,
      expiresAt: result.sessionExpiry
    };
  }
  
  async decapsulate(keyId, ciphertext, sessionId = null) {
    const keyInfo = this.keyStore.get(keyId);
    if (!keyInfo) {
      throw new KyberSecurityError(`Key not found: ${keyId}`);
    }
    
    const sharedSecret = await kyberDecapsulate(keyInfo.secretKey, ciphertext, { level: this.level });

    if (sessionId) {
      const session = this.sessionStore.get(sessionId);
      if (session && Buffer.compare(session.sharedSecret, sharedSecret) === 0) {
        session.lastUsed = Date.now();
        return sharedSecret;
      }
      throw new KyberSecurityError('Session validation failed');
    }
    
    return sharedSecret;
  }

  scheduleKeyRotation(keyId) {
    if (this.rotationTimers.has(keyId)) {
      clearTimeout(this.rotationTimers.get(keyId));
    }
    
    const timer = setTimeout(async () => {
      try {
        kyberLogger.log('INFO', `Rotating Kyber key: ${keyId}`);
        await this.generateKeyPair(keyId);
      } catch (error) {
        kyberLogger.log('ERROR', `Kyber key rotation failed for ${keyId}`, { error: error.message });
      }
    }, this.options.keyRotationInterval);

    this.rotationTimers.set(keyId, timer);
  }
  
  cleanupSessions() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessionStore.entries()) {
      if (session.expiresAt <= now) {
        this.sessionStore.delete(sessionId);
        kyberLogger.log('DEBUG', `Expired session cleaned up: ${sessionId}`);
      }
    }
  }
  
  revokeSession(sessionId) {
    this.sessionStore.delete(sessionId);
    kyberLogger.log('INFO', `Session revoked: ${sessionId}`);
  }
  
  revokeKey(keyId) {
    if (this.rotationTimers.has(keyId)) {
      clearTimeout(this.rotationTimers.get(keyId));
      this.rotationTimers.delete(keyId);
    }
    this.keyStore.delete(keyId);
    kyberLogger.log('SECURITY', `Key revoked: ${keyId}`);
  }
}

// FIXED EXPORTS - No duplicate exports
export {
  PQCKyberProvider,
  kyberKeyPair,
  kyberEncapsulate, 
  kyberDecapsulate,
  kyberConstants,
  getKyberMetrics,
  kyberHealthCheck,
  PQCKyberError,
  KyberSecurityError,
  KyberConfigurationError,
  KYBER_SECURITY_CONFIG
};

// Default export for backward compatibility
export default {
  PQCKyberProvider,
  kyberKeyPair,
  kyberEncapsulate,
  kyberDecapsulate,
  kyberConstants,
  getKyberMetrics,
  kyberHealthCheck,
  PQCKyberError,
  KyberSecurityError,
  KyberConfigurationError,
  KYBER_SECURITY_CONFIG
};
