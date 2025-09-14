// modules/pqc-dilithium/index.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let dilithium = null;
let wasmMemory = null;

/**
 * Loads and initializes the Dilithium WASM module from liboqs
 */
async function ensureInit(params = { level: 3 }) {
  if (dilithium) return dilithium;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const wasmFileName = `dilithium${params.level || 3}.wasm`;
  const wasmPath = path.resolve(__dirname, `./dist/${wasmFileName}`);

  if (!fs.existsSync(wasmPath)) {
    throw new Error(`[pqc-dilithium] WASM file not found at ${wasmPath}`);
  }

  const wasmBinary = fs.readFileSync(wasmPath);

  // Configure memory for WASM module
  wasmMemory = new WebAssembly.Memory({ initial: 256, maximum: 65536 });

  const env = {
    env: {
      memory: wasmMemory,
      emscripten_notify_memory_growth: (index) => {
        if (wasmMemory) wasmMemory.grow(index);
      },
      abort: (msg, file, line, column) => {
        throw new Error(`Dilithium WASM abort: ${msg} at ${file}:${line}:${column}`);
      }
    }
  };

  const { instance } = await WebAssembly.instantiate(wasmBinary, env);
  const exports = instance.exports;

  if (exports.OQS_init) exports.OQS_init();

  const keypair = exports.PQCLEAN_DILITHIUM3_CLEAN_crypto_sign_keypair;
  const sign = exports.PQCLEAN_DILITHIUM3_CLEAN_crypto_sign_signature;
  const verify = exports.PQCLEAN_DILITHIUM3_CLEAN_crypto_sign_verify;

  if (!keypair || !sign || !verify) {
    throw new Error('Required Dilithium functions not found in WASM exports');
  }

  const PUBLICKEYBYTES = exports.PQCLEAN_DILITHIUM3_CLEAN_CRYPTO_PUBLICKEYBYTES;
  const SECRETKEYBYTES = exports.PQCLEAN_DILITHIUM3_CLEAN_CRYPTO_SECRETKEYBYTES;
  const BYTES = exports.PQCLEAN_DILITHIUM3_CLEAN_CRYPTO_BYTES;

  dilithium = {
    keypair: () => {
      const pk = new Uint8Array(PUBLICKEYBYTES);
      const sk = new Uint8Array(SECRETKEYBYTES);
      const result = keypair(
        wasmMemory.buffer, pk.byteOffset,
        wasmMemory.buffer, sk.byteOffset
      );
      if (result !== 0) throw new Error(`Keypair generation failed with code: ${result}`);
      return { publicKey: pk, secretKey: sk };
    },
    sign: (message, secretKey) => {
      const sig = new Uint8Array(BYTES);
      const sigLen = new BigUint64Array(1);
      sigLen[0] = BigInt(BYTES);
      const result = sign(
        wasmMemory.buffer, sig.byteOffset, wasmMemory.buffer, sigLen.byteOffset,
        wasmMemory.buffer, message.byteOffset, message.length,
        wasmMemory.buffer, secretKey.byteOffset
      );
      if (result !== 0) throw new Error(`Signature generation failed with code: ${result}`);
      return sig.slice(0, Number(sigLen[0]));
    },
    verify: (message, signature, publicKey) => {
      const result = verify(
        wasmMemory.buffer, signature.byteOffset, signature.length,
        wasmMemory.buffer, message.byteOffset, message.length,
        wasmMemory.buffer, publicKey.byteOffset
      );
      return result === 0;
    },
    level: params.level,
    constants: { PUBLICKEYBYTES, SECRETKEYBYTES, BYTES }
  };

  return dilithium;
}

/**
 * Generates a Dilithium key pair
 */
export async function dilithiumKeyPair(params = { level: 3 }) {
  const d = await ensureInit(params);
  const { publicKey, secretKey } = d.keypair();
  return {
    publicKey: Buffer.from(publicKey),
    privateKey: Buffer.from(secretKey)
  };
}

/**
 * Signs a message with a Dilithium private key
 */
export async function dilithiumSign(privateKey, message, params = { level: 3 }) {
  const d = await ensureInit(params);
  const sig = d.sign(new Uint8Array(message), new Uint8Array(privateKey));
  return Buffer.from(sig);
}

/**
 * Verifies a Dilithium signature
 */
export async function dilithiumVerify(publicKey, message, signature, params = { level: 3 }) {
  const d = await ensureInit(params);
  return d.verify(
    new Uint8Array(message),
    new Uint8Array(signature),
    new Uint8Array(publicKey)
  );
}

/**
 * Gets algorithm constants
 */
export async function dilithiumConstants(params = { level: 3 }) {
  const d = await ensureInit(params);
  return d.constants;
}

/**
 * Integration-ready provider class
 */
export class PQCDilithiumProvider {
  constructor(level = 3) {
    this.level = level;
    this.algorithm = `dilithium${level}`;
  }
  async generateKeyPair() {
    return dilithiumKeyPair({ level: this.level });
  }
  async sign(privateKey, data) {
    return dilithiumSign(privateKey, data, { level: this.level });
  }
  async verify(publicKey, data, signature) {
    return dilithiumVerify(publicKey, data, signature, { level: this.level });
  }
}

export default PQCDilithiumProvider;
