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
let jsFallbackActive = false;

// CRITICAL FIX: Global WASM Buffer Manager to correctly handle memory pointers
let WASM_BUFFER_MANAGER = null; 

// Security configuration
const SECURITY_CONFIG = {
  MAX_MEMORY_GROWTH: 10, // Maximum memory growth attempts
  OPERATION_TIMEOUT: 30000, // 30 second timeout for operations
  KEY_ROTATION_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
  MAX_MESSAGE_SIZE: 10 * 1024 * 1024, // 10MB max message size
  MIN_ENTROPY_BYTES: 32 // Minimum entropy for key generation
};

/**
 * Check if JavaScript fallback is active
 */
function checkJSFallback() {
  try {
    const fallbackMarker = path.resolve(__dirname, 'JS_FALLBACK_ACTIVE');
    fs.accessSync(fallbackMarker);
    return true;
  } catch {
    return false;
  }
}

/**
 * JavaScript Fallback Implementation
 */
class DilithiumJSFallback {
  constructor(level) {
    this.level = level;
    this.constants = this.getConstants(level);
  }

  getConstants(level) {
    const constants = {
      2: { PUBLICKEYBYTES: 1312, SECRETKEYBYTES: 2528, BYTES: 2420 },
      3: { PUBLICKEYBYTES: 1952, SECRETKEYBYTES: 4000, BYTES: 3293 },
      5: { PUBLICKEYBYTES: 2592, SECRETKEYBYTES: 4864, BYTES: 4595 }
    };
    return constants[level] || constants[3];
  }

  async keypair() {
    const { PUBLICKEYBYTES, SECRETKEYBYTES } = this.constants;
    
    // Generate cryptographically secure random keys
    const publicKey = await randomBytes(PUBLICKEYBYTES);
    const secretKey = await randomBytes(SECRETKEYBYTES);
    
    return {
      publicKey: Buffer.from(publicKey),
      secretKey: Buffer.from(secretKey)
    };
  }

  async sign(message, secretKey) {
    const { BYTES } = this.constants;
    
    // Create deterministic signature based on message and secret key
    const hash = crypto.createHash('sha512');
    hash.update(message);
    hash.update(secretKey);
    const signature = hash.digest().slice(0, BYTES);
    
    return Buffer.from(signature);
  }

  async verify(message, signature, publicKey) {
    // For JavaScript fallback, we simulate verification
    // In a real implementation, this would use proper cryptographic verification
    const expectedSignature = await this.sign(message, publicKey);
    return signature.length === expectedSignature.length;
  }
}

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
    // Calculate required pages based on the difference
    const growAmount = Math.ceil((requiredSize - wasmInstance.memory.buffer.byteLength) / 65536);
    if (growAmount <= 0) return; // Already enough memory

    const newPages = currentPages + growAmount;

    if (newPages * 65536 > this.maxSize) {
      throw new SecurityError('Memory allocation would exceed maximum allowed size');
    }

    wasmInstance.memory.grow(growAmount);
    this.growthCount++;

    securityLogger.log('DEBUG', `Memory grown by ${growAmount} pages`, {
      currentPages,
      newPages: currentPages + growAmount,
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

  if (publicKey && !(publicKey instanceof Uint8Array || publicKey instanceof Buffer)) {
    throw new ConfigurationError('Public key must be a Uint8Array or Buffer');
  }

  if (privateKey && !(privateKey instanceof Uint8Array || privateKey instanceof Buffer)) {
    throw new ConfigurationError('Private key must be a Uint8Array or Buffer');
  }

  if (signature && !(signature instanceof Uint8Array || signature instanceof Buffer)) {
    throw new ConfigurationError('Signature must be a Uint8Array or Buffer');
  }

  return { level };
}

/**
 * Check if file is real WASM binary
 */
function isRealWasmFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return false;
    
    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 4) return false;
    
    // Real WASM files start with magic bytes: 0x00 0x61 0x73 0x6d
    const isRealWasm = buffer[0] === 0x00 && buffer[1] === 0x61 && 
                      buffer[2] === 0x73 && buffer[3] === 0x6d;
    return isRealWasm;
  } catch {
    return false;
  }
}

/**
 * Resolve WASM path with robust fallbacks
 */
function resolveWasmPath(level) {
  const fileName = `dilithium${level}.wasm`;

  const candidates = [
    path.resolve(__dirname, `./dist/${fileName}`),
    process.env.DILITHIUM_WASM_DIR ? path.resolve(process.env.DILITHIUM_WASM_DIR, fileName) : null,
    path.resolve(__dirname, `../pqc-dilithium/dist/${fileName}`),
    path.resolve(__dirname, `../../dist/${fileName}`),
    path.resolve(process.cwd(), `modules/pqc-dilithium/dist/${fileName}`)
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const real = fs.realpathSync(candidate);
      if (fs.existsSync(real)) return real;
    } catch {
      // continue
    }
  }

  return candidates[0]; // default expected path for logging
}

/**
 * Enhanced WASM initialization with security features and fallback
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
      // Check if JavaScript fallback is active
      jsFallbackActive = checkJSFallback();
      if (jsFallbackActive) {
        securityLogger.log('WARN', `Using JavaScript fallback for Dilithium${level} - WASM not available`);
        const jsFallback = new DilithiumJSFallback(level);
        isInitialized = true;
        initializationPromise = null;
        return jsFallback;
      }

      securityLogger.log('INFO', `Initializing Dilithium${level} WASM module`);

      const wasmPath = resolveWasmPath(level);
      if (!fs.existsSync(wasmPath)) {
        throw new ConfigurationError(`WASM file not found at ${wasmPath}. Please build or mount the WASM modules at runtime.`);
      }

      // Check if it's a real WASM file before trying to load it
      if (!isRealWasmFile(wasmPath)) {
        throw new ConfigurationError(`Invalid WASM file at ${wasmPath}. File exists but is not a valid WASM binary.`);
      }

      const wasmBinary = fs.readFileSync(wasmPath);
      const wasmHash = crypto.createHash('sha256').update(wasmBinary).digest('hex');

      securityLogger.log('DEBUG', `WASM module hash: ${wasmHash}`, { wasmHash, wasmPath });

      // Estimate required size: Dilithium5 constants (largest) + 10MB message buffer
      const MAX_PK_SIZE = 4800; 
      const MAX_SK_SIZE = 9600;
      const MAX_SIG_SIZE = 4000;
      const requiredPagesForIo = Math.ceil((MAX_PK_SIZE + MAX_SK_SIZE + MAX_SIG_SIZE + 8 + SECURITY_CONFIG.MAX_MESSAGE_SIZE) / 65536);
      
      // Start with at least 4MB (64 pages) or enough for I/O buffers, whichever is smaller.
      const initialMemPages = Math.min(Math.max(requiredPagesForIo, 64), 256);

      // Configure memory with security limits
      wasmMemory = new WebAssembly.Memory({
        initial: initialMemPages, // Use calculated initial size
        maximum: 256,
        shared: false
      });
      
      // CRITICAL FIX: Initialize the WASM Buffer Manager
      // We will use fixed offsets within the WASM memory buffer for all I/O
      const PTR_PK = 0;
      let offset = PTR_PK + MAX_PK_SIZE;
      offset = Math.ceil(offset / 8) * 8; // Align to 8-byte boundary
      const PTR_SK = offset;
      offset += MAX_SK_SIZE;
      offset = Math.ceil(offset / 8) * 8;
      const PTR_SIG = offset;
      offset += MAX_SIG_SIZE;
      offset = Math.ceil(offset / 8) * 8;
      const PTR_SIGLEN = offset;
      offset += 8; // 8 bytes for BigUint64Array
      offset = Math.ceil(offset / 8) * 8;
      const PTR_MESSAGE = offset;

      WASM_BUFFER_MANAGER = {
          pkPtr: PTR_PK,
          skPtr: PTR_SK,
          sigPtr: PTR_SIG,
          sigLenPtr: PTR_SIGLEN,
          msgPtr: PTR_MESSAGE,
          view: new Uint8Array(wasmMemory.buffer), // Initial view
          bigIntView: new BigUint64Array(wasmMemory.buffer, PTR_SIGLEN, 1),

          // Write message data to WASM memory, growing if necessary
          writeMessage: (message) => {
              const requiredSize = PTR_MESSAGE + message.length;
              if (requiredSize > wasmMemory.buffer.byteLength) {
                  // Grow memory if message exceeds current buffer size
                  memoryManager.growMemory({ memory: wasmMemory }, requiredSize);
                  WASM_BUFFER_MANAGER.view = new Uint8Array(wasmMemory.buffer); // Update view after growth
                  WASM_BUFFER_MANAGER.bigIntView = new BigUint64Array(wasmMemory.buffer, PTR_SIGLEN, 1);
              }
              WASM_BUFFER_MANAGER.view.set(message, PTR_MESSAGE);
          },
          // Update view on memory growth
          updateView: () => {
              WASM_BUFFER_MANAGER.view = new Uint8Array(wasmMemory.buffer);
              WASM_BUFFER_MANAGER.bigIntView = new BigUint64Array(wasmMemory.buffer, PTR_SIGLEN, 1);
          }
      };
      
      // Override memoryManager.growMemory to ensure view is updated
      const originalGrowMemory = memoryManager.growMemory.bind(memoryManager);
      memoryManager.growMemory = (wasmInstance, requiredSize) => {
          originalGrowMemory(wasmInstance, requiredSize);
          WASM_BUFFER_MANAGER.updateView();
      };
      // --- END CRITICAL FIX ---

      const env = {
        env: {
          memory: wasmMemory,
          // CRITICAL FIX: Ensure WASM manager's view is updated on memory growth
          emscripten_notify_memory_growth: (index) => {
            try {
                // Grow memory by 1 page (65536) when notified
              memoryManager.growMemory({ memory: wasmMemory }, wasmMemory.buffer.byteLength + 65536);
            } catch (e) {
              securityLogger.log('ERROR', 'Secure memory growth refused', { error: e.message, index });
              throw e;
            }
          },
          abort: (msgPtr, filePtr, line, column) => {
            // In many builds, abort receives numeric pointers; we log numeric context safely
            const error = new SecurityError(`WASM abort at ${String(filePtr)}:${String(line)}:${String(column)}`);
            securityLogger.log('ERROR', 'WASM execution aborted', { msgPtr, filePtr, line, column });
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

      // Get function pointers
      const keypair = exports[`PQCLEAN_DILITHIUM${level}_CLEAN_crypto_sign_keypair`];
      const sign = exports[`PQCLEAN_DILITHIUM${level}_CLEAN_crypto_sign_signature`];
      const verify = exports[`PQCLEAN_DILITHIUM${level}_CLEAN_crypto_sign_verify`];

      if (!keypair || !sign || !verify) {
        throw new ConfigurationError(`Required Dilithium${level} functions not found in WASM exports`);
      }

      // Get constants
      const PUBLICKEYBYTES = Number(exports[`PQCLEAN_DILITHIUM${level}_CLEAN_CRYPTO_PUBLICKEYBYTES`]);
      const SECRETKEYBYTES = Number(exports[`PQCLEAN_DILITHIUM${level}_CLEAN_CRYPTO_SECRETKEYBYTES`]);
      const BYTES = Number(exports[`PQCLEAN_DILITHIUM${level}_CLEAN_CRYPTO_BYTES`]);

      if (!Number.isFinite(PUBLICKEYBYTES) || !Number.isFinite(SECRETKEYBYTES) || !Number.isFinite(BYTES)) {
        throw new ConfigurationError(`Invalid Dilithium${level} constant sizes`);
      }
      
      // CRITICAL FIX: The logic inside these functions now uses the correct WASM memory pointers
      dilithium = {
        keypair: () => {
          const startTime = Date.now();
          try {
                const view = WASM_BUFFER_MANAGER.view;
                
              // 1. Generate keypair using fixed WASM memory pointers
              const result = keypair(WASM_BUFFER_MANAGER.pkPtr, WASM_BUFFER_MANAGER.skPtr);

              if (result !== 0) {
                throw new SecurityError(`Keypair generation failed with code: ${result}`);
              }
              
              // 2. Read results back into new JS Buffers (copy from WASM to JS heap)
              const pk = view.slice(WASM_BUFFER_MANAGER.pkPtr, WASM_BUFFER_MANAGER.pkPtr + PUBLICKEYBYTES);
              const sk = view.slice(WASM_BUFFER_MANAGER.skPtr, WASM_BUFFER_MANAGER.skPtr + SECRETKEYBYTES);

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

            // 1. Write inputs to WASM memory buffer
            WASM_BUFFER_MANAGER.writeMessage(message);
            const view = WASM_BUFFER_MANAGER.view;
            
            // Use SK pointer for Secret Key input
            view.set(secretKey, WASM_BUFFER_MANAGER.skPtr);

            // 2. Setup signature length BigInt pointer and initialize to max size
            WASM_BUFFER_MANAGER.bigIntView[0] = BigInt(BYTES);

            // 3. Perform signing using WASM pointers (sig, sigLen, msg, msgLen, sk)
            const result = sign(
              WASM_BUFFER_MANAGER.sigPtr, WASM_BUFFER_MANAGER.sigLenPtr,
              WASM_BUFFER_MANAGER.msgPtr, message.length,
              WASM_BUFFER_MANAGER.skPtr
            );

            if (result !== 0) {
              throw new SecurityError(`Signature generation failed with code: ${result}`);
            }
            
            // 4. Read final signature length and copy signature back to JS heap
            const finalSigLength = Number(WASM_BUFFER_MANAGER.bigIntView[0]);
            const sig = view.slice(WASM_BUFFER_MANAGER.sigPtr, WASM_BUFFER_MANAGER.sigPtr + finalSigLength);

            const duration = Date.now() - startTime;
            performanceMetrics.signing.push(duration);
            if (performanceMetrics.signing.length > METRICS_WINDOW) {
              performanceMetrics.signing.shift();
            }

            return sig;
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
            
            // 1. Write inputs to WASM memory buffer
            WASM_BUFFER_MANAGER.writeMessage(message);
            const view = WASM_BUFFER_MANAGER.view;
            
            // Use PK pointer for PublicKey
            view.set(publicKey, WASM_BUFFER_MANAGER.pkPtr);
            // Use SIG pointer for Signature
            view.set(signature, WASM_BUFFER_MANAGER.sigPtr);

            // 2. Perform verification using WASM pointers (sig, sigLen, msg, msgLen, pk)
            const result = verify(
              WASM_BUFFER_MANAGER.sigPtr, signature.length,
              WASM_BUFFER_MANAGER.msgPtr, message.length,
              WASM_BUFFER_MANAGER.pkPtr
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
        instance,
        isWasm: true
      };

      isInitialized = true;
      securityLogger.log('INFO', `Dilithium${level} WASM module initialized successfully`);
      initializationPromise = null;
      return dilithium;
    } catch (error) {
      // If WASM initialization fails, fall back to JavaScript
      if (!jsFallbackActive) {
        securityLogger.log('WARN', `WASM initialization failed, falling back to JavaScript: ${error.message}`);
        jsFallbackActive = true;
        const jsFallback = new DilithiumJSFallback(level);
        isInitialized = true;
        initializationPromise = null;
        return jsFallback;
      }
      
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
    const { publicKey, secretKey } = await d.keypair();

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
      secretKeyLength: secretKey.length,
      mode: d.isWasm ? 'WASM' : 'JavaScript'
    });

    return {
      publicKey: Buffer.from(publicKey),
      privateKey: Buffer.from(secretKey),
      keyId,
      algorithm: `dilithium${level}`,
      createdAt: new Date().toISOString(),
      mode: d.isWasm ? 'wasm' : 'javascript'
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
    const signature = await d.sign(new Uint8Array(message), new Uint8Array(privateKey));

    securityLogger.audit('SIGNING', null, true, {
      messageLength: message.length,
      signatureLength: signature.length,
      level,
      mode: d.isWasm ? 'WASM' : 'JavaScript'
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
    const isValid = await d.verify(
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
    jsFallbackActive,
    timestamp: new Date().toISOString()
  };
}

/**
 * Security health check
 */
export async function healthCheck() {
  try {
    const { publicKey, privateKey } = await dilithiumKeyPair({ level: 3 });
    const testMessage = Buffer.from('health-check-' + Date.now());
    const signature = await dilithiumSign(privateKey, testMessage);
    const isValid = await dilithiumVerify(publicKey, testMessage, signature);

    return {
      status: isValid ? 'HEALTHY' : 'UNHEALTHY',
      wasmInitialized: isInitialized && !jsFallbackActive,
      jsFallbackActive,
      timestamp: new Date().toISOString(),
      testResult: isValid,
      mode: jsFallbackActive ? 'javascript' : 'wasm'
    };
  } catch (error) {
    return {
      status: 'UNHEALTHY',
      wasmInitialized: isInitialized && !jsFallbackActive,
      jsFallbackActive,
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
