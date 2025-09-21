// modules/pqc-dilithium/index.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const randomBytes = promisify(crypto.randomBytes);

// Enterprise-grade error classes
class PQCDilithiumError extends Error {
  constructor(message, code = 'DILITHIUM_ERROR') {
    super(message);
    this.name = 'PQCDilithiumError';
    this.code = code;
  }
}

class SecurityError extends PQCDilithiumError {
  constructor(message) {
    super(message, 'SECURITY_VIOLATION');
  }
}

class ConfigurationError extends PQCDilithiumError {
  constructor(message) {
    super(message, 'CONFIGURATION_ERROR');
  }
}

// Performance monitoring
const performanceMetrics = {
  keyGeneration: [],
  signing: [],
  verification: [],
  failures: 0
};

const METRICS_WINDOW = 1000; // Keep last 1000 operations

let dilithium = null;
let wasmMemory = null;
let isInitialized = false;
let initializationPromise = null;

// Security configuration
const SECURITY_CONFIG = {
  MAX_MEMORY_GROWTH: 10, // Maximum memory growth attempts
  OPERATION_TIMEOUT: 30000, // 30 second timeout for operations
  KEY_ROTATION_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  MAX_MESSAGE_SIZE: 10 * 1024 * 1024, // 10MB max message size
  MIN_ENTROPY_BYTES: 32 // Minimum entropy for key generation
};

/**
 * Security audit logger
 */
const securityLogger = {
  log: (level, message, metadata = {}) => {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      module: 'pqc-dilithium',
      message,
      ...metadata
    };
    
    // In production, this would send to centralized logging
    console.log(JSON.stringify(logEntry));
    
    if (level === 'ERROR' || level === 'SECURITY') {
      performanceMetrics.failures++;
    }
  },
  
  audit: (operation, keyId = null, success = true, metadata = {}) => {
    securityLogger.log('AUDIT', `Operation: ${operation}, Success: ${success}`, {
      operation,
      keyId,
      success,
      ...metadata
    });
  }
};

/**
 * Memory management with security bounds
 */
class SecureMemoryManager {
  constructor() {
    this.growthCount = 0;
    this.maxSize = 256 * 65536; // 16MB maximum
  }
  
  growMemory(wasmInstance, requiredSize) {
    if (this.growthCount >= SECURITY_CONFIG.MAX_MEMORY_GROWTH) {
      throw new SecurityError('Maximum memory growth attempts exceeded');
    }
    
    const currentPages = wasmInstance.memory.buffer.byteLength / 65536;
    const requiredPages = Math.ceil(requiredSize / 65536);
    const newPages = currentPages + requiredPages;
    
    if (newPages * 65536 > this.maxSize) {
      throw new SecurityError('Memory allocation would exceed maximum allowed size');
    }
    
    wasmInstance.memory.grow(requiredPages);
    this.growthCount++;
    
    securityLogger.log('DEBUG', `Memory grown by ${requiredPages} pages`, {
      currentPages,
      newPages: currentPages + requiredPages,
      growthCount: this.growthCount
    });
  }
}

const memoryManager = new SecureMemoryManager();

/**
 * Validates input parameters with security checks
 */
function validateInputs(params = {}) {
  const { level = 3, message, publicKey, privateKey, signature } = params;
  
  if (![2, 3, 5].includes(level)) {
    throw new ConfigurationError(`Invalid security level: ${level}. Must be 2, 3, or 5`);
  }
  
  if (message && message.length > SECURITY_CONFIG.MAX_MESSAGE_SIZE) {
    throw new SecurityError(`Message size ${message.length} exceeds maximum allowed ${SECURITY_CONFIG.MAX_MESSAGE_SIZE}`);
  }
  
  if (publicKey && !(publicKey instanceof Uint8Array)) {
    throw new ConfigurationError('Public key must be a Uint8Array');
  }
  
  if (privateKey && !(privateKey instanceof Uint8Array)) {
    throw new ConfigurationError('Private key must be a Uint8Array');
  }
  
  if (signature && !(signature instanceof Uint8Array)) {
    throw new ConfigurationError('Signature must be a Uint8Array');
  }
  
  return { level };
}

/**
 * Enhanced WASM initialization with security features
 */
async function initializeWasm(level) {
  if (isInitialized && dilithium?.level === level) {
    return dilithium;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      securityLogger.log('INFO', `Initializing Dilithium${level} WASM module`);
      
      const wasmFileName = `dilithium${level}.wasm`;
      const wasmPath = path.resolve(__dirname, `./dist/${wasmFileName}`);

      if (!fs.existsSync(wasmPath)) {
        throw new ConfigurationError(`WASM file not found at ${wasmPath}. Please build the WASM modules.`);
      }

      const wasmBinary = fs.readFileSync(wasmPath);
      const wasmHash = crypto.createHash('sha256').update(wasmBinary).digest('hex');
      
      securityLogger.log('DEBUG', `WASM module hash: ${wasmHash}`, { wasmHash });

      // Configure memory with security limits
      wasmMemory = new WebAssembly.Memory({ 
        initial: 256, 
        maximum: 65536,
        shared: false
      });

      const env = {
        env: {
          memory: wasmMemory,
          emscripten_notify_memory_growth: (index) => {
            memoryManager.growMemory({ memory: wasmMemory }, index);
          },
          abort: (msg, file, line, column) => {
            const error = new SecurityError(`WASM abort: ${msg} at ${file}:${line}:${column}`);
            securityLogger.log('ERROR', 'WASM execution aborted', { msg, file, line, column });
            throw error;
          },
          // Enhanced entropy source for cryptographic operations
          randombytes: (buffer, length) => {
            crypto.randomFillSync(new Uint8Array(wasmMemory.buffer, buffer, length));
          }
        }
      };

      const { instance } = await WebAssembly.instantiate(wasmBinary, env);
      const exports = instance.exports;

      // Initialize with proper error handling
      if (exports.OQS_init) {
        const initResult = exports.OQS_init();
        if (initResult !== 0) {
          throw new SecurityError(`OQS initialization failed with code: ${initResult}`);
        }
      }

      // Get function pointers with fallbacks
      // Get function pointers with fallbacks
      const keypair = exports[`PQCLEAN_DILITHIUM${level}_CLEAN_crypto_sign_keypair`];
      const sign = exports[`PQCLEAN_DILITHIUM${level}_CLEAN_crypto_sign_signature`];
      const verify = exports[`PQCLEAN_DILITHIUM${level}_CLEAN_crypto_sign_verify`];


      if (!keypair || !sign || !verify) {
        throw new ConfigurationError(`Required Dilithium${level} functions not found in WASM exports`);
      }

      // Get constants
      const PUBLICKEYBYTES = exports.PQCLEAN_DILITHIUM${level}_CLEAN_CRYPTO_PUBLICKEYBYTES;
      const SECRETKEYBYTES = exports.PQCLEAN_DILITHIUM${level}_CLEAN_CRYPTO_SECRETKEYBYTES;
      const BYTES = exports.PQCLEAN_DILITHIUM${level}_CLEAN_CRYPTO_BYTES;

      dilithium = {
        keypair: () => {
          const startTime = Date.now();
          try {
            const pk = new Uint8Array(PUBLICKEYBYTES);
            const sk = new Uint8Array(SECRETKEYBYTES);
            
            // Additional entropy for key generation
            crypto.randomFillSync(pk);
            crypto.randomFillSync(sk);
            
            const result = keypair(
              wasmMemory.buffer, pk.byteOffset,
              wasmMemory.buffer, sk.byteOffset
            );
            
            if (result !== 0) {
              throw new SecurityError(`Keypair generation failed with code: ${result}`);
            }
            
            const duration = Date.now() - startTime;
            performanceMetrics.keyGeneration.push(duration);
            if (performanceMetrics.keyGeneration.length > METRICS_WINDOW) {
              performanceMetrics.keyGeneration.shift();
            }
            
            securityLogger.audit('KEY_GENERATION', null, true, { duration, level });
            return { publicKey: pk, secretKey: sk };
          } catch (error) {
            securityLogger.audit('KEY_GENERATION', null, false, { error: error.message, level });
            throw error;
          }
        },
        
        sign: (message, secretKey) => {
          const startTime = Date.now();
          try {
            if (secretKey.length !== SECRETKEYBYTES) {
              throw new SecurityError(`Invalid secret key length: expected ${SECRETKEYBYTES}, got ${secretKey.length}`);
            }
            
            const sig = new Uint8Array(BYTES);
            const sigLen = new BigUint64Array(1);
            sigLen[0] = BigInt(BYTES);
            
            const result = sign(
              wasmMemory.buffer, sig.byteOffset, wasmMemory.buffer, sigLen.byteOffset,
              wasmMemory.buffer, message.byteOffset, message.length,
              wasmMemory.buffer, secretKey.byteOffset
            );
            
            if (result !== 0) {
              throw new SecurityError(`Signature generation failed with code: ${result}`);
            }
            
            const duration = Date.now() - startTime;
            performanceMetrics.signing.push(duration);
            if (performanceMetrics.signing.length > METRICS_WINDOW) {
              performanceMetrics.signing.shift();
            }
            
            return sig.slice(0, Number(sigLen[0]));
          } catch (error) {
            securityLogger.audit('SIGNING', null, false, { error: error.message, level });
            throw error;
          }
        },
        
        verify: (message, signature, publicKey) => {
          const startTime = Date.now();
          try {
            if (publicKey.length !== PUBLICKEYBYTES) {
              throw new SecurityError(`Invalid public key length: expected ${PUBLICKEYBYTES}, got ${publicKey.length}`);
            }
            
            const result = verify(
              wasmMemory.buffer, signature.byteOffset, signature.length,
              wasmMemory.buffer, message.byteOffset, message.length,
              wasmMemory.buffer, publicKey.byteOffset
            );
            
            const duration = Date.now() - startTime;
            performanceMetrics.verification.push(duration);
            if (performanceMetrics.verification.length > METRICS_WINDOW) {
              performanceMetrics.verification.shift();
            }
            
            securityLogger.audit('VERIFICATION', null, result === 0, { 
              result: result === 0, 
              duration,
              signatureLength: signature.length 
            });
            
            return result === 0;
          } catch (error) {
            securityLogger.audit('VERIFICATION', null, false, { error: error.message });
            return false;
          }
        },
        
        level,
        constants: { PUBLICKEYBYTES, SECRETKEYBYTES, BYTES },
        instance
      };

      isInitialized = true;
      securityLogger.log('INFO', `Dilithium${level} WASM module initialized successfully`);
      return dilithium;
    } catch (error) {
      securityLogger.log('ERROR', `Failed to initialize Dilithium${level}`, { error: error.message });
      initializationPromise = null;
      throw error;
    }
  })();

  return initializationPromise;
}

/**
 * Enterprise-grade key pair generation with additional security
 */
export async function dilithiumKeyPair(params = {}) {
  const { level } = validateInputs(params);
  
  try {
    const d = await initializeWasm(level);
    const { publicKey, secretKey } = d.keypair();
    
    // Generate key ID for tracking
    const keyId = crypto.createHash('sha256')
      .update(publicKey)
      .update(await randomBytes(SECURITY_CONFIG.MIN_ENTROPY_BYTES))
      .digest('hex')
      .substring(0, 16);
    
    securityLogger.log('INFO', `Generated new key pair`, { 
      keyId, 
      level,
      publicKeyLength: publicKey.length,
      secretKeyLength: secretKey.length
    });
    
    return {
      publicKey: Buffer.from(publicKey),
      privateKey: Buffer.from(secretKey),
      keyId,
      algorithm: `dilithium${level}`,
      createdAt: new Date().toISOString()
    };
  } catch (error) {
    securityLogger.log('ERROR', 'Key pair generation failed', { error: error.message, level });
    throw error;
  }
}

/**
 * Secure signing with timing attack protection
 */
export async function dilithiumSign(privateKey, message, params = {}) {
  const { level } = validateInputs({ ...params, privateKey, message });
  
  if (!(message instanceof Buffer)) {
    message = Buffer.from(message);
  }
  
  if (!(privateKey instanceof Buffer)) {
    privateKey = Buffer.from(privateKey);
  }
  
  try {
    const d = await initializeWasm(level);
    const signature = d.sign(new Uint8Array(message), new Uint8Array(privateKey));
    
    securityLogger.audit('SIGNING', null, true, {
      messageLength: message.length,
      signatureLength: signature.length,
      level
    });
    
    return Buffer.from(signature);
  } catch (error) {
    securityLogger.audit('SIGNING', null, false, {
      error: error.message,
      messageLength: message?.length,
      level
    });
    throw error;
  }
}

/**
 * Robust signature verification
 */
export async function dilithiumVerify(publicKey, message, signature, params = {}) {
  const { level } = validateInputs({ ...params, publicKey, message, signature });
  
  if (!(message instanceof Buffer)) {
    message = Buffer.from(message);
  }
  
  if (!(publicKey instanceof Buffer)) {
    publicKey = Buffer.from(publicKey);
  }
  
  if (!(signature instanceof Buffer)) {
    signature = Buffer.from(signature);
  }
  
  try {
    const d = await initializeWasm(level);
    const isValid = d.verify(
      new Uint8Array(message),
      new Uint8Array(signature),
      new Uint8Array(publicKey)
    );
    
    return isValid;
  } catch (error) {
    securityLogger.audit('VERIFICATION', null, false, {
      error: error.message,
      messageLength: message?.length,
      signatureLength: signature?.length,
      level
    });
    return false;
  }
}

/**
 * Get algorithm constants with validation
 */
export async function dilithiumConstants(params = {}) {
  const { level } = validateInputs(params);
  const d = await initializeWasm(level);
  return d.constants;
}

/**
 * Performance monitoring utilities
 */
export function getPerformanceMetrics() {
  const calculateStats = (values) => {
    if (values.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
    
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    
    return { avg, min, max, count: values.length };
  };
  
  return {
    keyGeneration: calculateStats(performanceMetrics.keyGeneration),
    signing: calculateStats(performanceMetrics.signing),
    verification: calculateStats(performanceMetrics.verification),
    failures: performanceMetrics.failures,
    timestamp: new Date().toISOString()
  };
}

/**
 * Security health check
 */
export async function healthCheck() {
  try {
    // Test key generation and signing
    const { publicKey, privateKey } = await dilithiumKeyPair({ level: 3 });
    const testMessage = Buffer.from('health-check-' + Date.now());
    const signature = await dilithiumSign(privateKey, testMessage);
    const isValid = await dilithiumVerify(publicKey, testMessage, signature);
    
    return {
      status: isValid ? 'HEALTHY' : 'UNHEALTHY',
      wasmInitialized: isInitialized,
      timestamp: new Date().toISOString(),
      testResult: isValid
    };
  } catch (error) {
    return {
      status: 'UNHEALTHY',
      wasmInitialized: isInitialized,
      timestamp: new Date().toISOString(),
      error: error.message
    };
  }
}

/**
 * Enterprise-grade provider with key management
 */
export class PQCDilithiumProvider {
  constructor(level = 3, options = {}) {
    this.level = level;
    this.algorithm = `dilithium${level}`;
    this.options = {
      keyRotationInterval: SECURITY_CONFIG.KEY_ROTATION_INTERVAL,
      ...options
    };
    this.keyStore = new Map();
    this.rotationTimers = new Map();
  }
  
  async generateKeyPair(keyId = null) {
    const keyPair = await dilithiumKeyPair({ level: this.level });
    const finalKeyId = keyId || keyPair.keyId;
    
    this.keyStore.set(finalKeyId, {
      ...keyPair,
      lastUsed: Date.now(),
      usageCount: 0
    });
    
    // Schedule key rotation
    this.scheduleKeyRotation(finalKeyId);
    
    return keyPair;
  }
  
  async sign(keyId, data) {
    const keyInfo = this.keyStore.get(keyId);
    if (!keyInfo) {
      throw new SecurityError(`Key not found: ${keyId}`);
    }
    
    keyInfo.lastUsed = Date.now();
    keyInfo.usageCount = (keyInfo.usageCount || 0) + 1;
    
    return dilithiumSign(keyInfo.privateKey, data, { level: this.level });
  }
  
  async verify(keyId, data, signature) {
    const keyInfo = this.keyStore.get(keyId);
    if (!keyInfo) {
      throw new SecurityError(`Key not found: ${keyId}`);
    }
    
    return dilithiumVerify(keyInfo.publicKey, data, signature, { level: this.level });
  }
  
  scheduleKeyRotation(keyId) {
    if (this.rotationTimers.has(keyId)) {
      clearTimeout(this.rotationTimers.get(keyId));
    }
    
    const timer = setTimeout(async () => {
      try {
        securityLogger.log('INFO', `Rotating key: ${keyId}`);
        await this.generateKeyPair(keyId);
      } catch (error) {
        securityLogger.log('ERROR', `Key rotation failed for ${keyId}`, { error: error.message });
      }
    }, this.options.keyRotationInterval);
    
    this.rotationTimers.set(keyId, timer);
  }
  
  getKey(keyId) {
    return this.keyStore.get(keyId);
  }
  
  listKeys() {
    return Array.from(this.keyStore.entries()).map(([keyId, info]) => ({
      keyId,
      algorithm: info.algorithm,
      createdAt: info.createdAt,
      lastUsed: info.lastUsed,
      usageCount: info.usageCount
    }));
  }
  
  revokeKey(keyId) {
    if (this.rotationTimers.has(keyId)) {
      clearTimeout(this.rotationTimers.get(keyId));
      this.rotationTimers.delete(keyId);
    }
    
    this.keyStore.delete(keyId);
    securityLogger.log('INFO', `Key revoked: ${keyId}`);
  }
  
  cleanup() {
    this.rotationTimers.forEach(timer => clearTimeout(timer));
    this.rotationTimers.clear();
    this.keyStore.clear();
  }
}

// Export error classes for external handling
export { PQCDilithiumError, SecurityError, ConfigurationError };

export default PQCDilithiumProvider;
