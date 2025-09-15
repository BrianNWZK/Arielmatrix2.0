import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let kyber = null;
let wasmMemory = null;

/**
 * Load and initialize Kyber WASM KEM.
 * level: 512 | 768 | 1024 (defaults to 768)
 */
async function ensureInit(params = { level: 768 }) {
  if (kyber && kyber.level === (params.level || 768)) return kyber;

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  const level = params.level || 768;
  const wasmFileName = `kyber${level}.wasm`;
  const wasmPath = path.resolve(__dirname, `./dist/${wasmFileName}`);

  if (!fs.existsSync(wasmPath)) {
    throw new Error(`[pqc-kyber] WASM not found at ${wasmPath}. Build step must produce ${wasmFileName}.`);
  }

  const wasmBinary = fs.readFileSync(wasmPath);

  // Provide memory for the module
  wasmMemory = new WebAssembly.Memory({ initial: 256, maximum: 65536 });

  const env = {
    env: {
      memory: wasmMemory,
      emscripten_notify_memory_growth: (idx) => {
        try { wasmMemory && wasmMemory.grow(idx); } catch (_) {}
      },
      abort: (msg, file, line, column) => {
        throw new Error(`Kyber WASM abort: ${msg} at ${file}:${line}:${column}`);
      }
    }
  };

  const { instance } = await WebAssembly.instantiate(wasmBinary, env);
  const ex = instance.exports;

  // Resolve symbol prefix based on level
  const L = level === 512 ? 'KYBER512' : level === 1024 ? 'KYBER1024' : 'KYBER768';

  // Required functions (PQClean naming via liboqs)
  const keypair = ex[`PQCLEAN_${L}_CLEAN_crypto_kem_keypair`];
  const enc = ex[`PQCLEAN_${L}_CLEAN_crypto_kem_enc`];
  const dec = ex[`PQCLEAN_${L}_CLEAN_crypto_kem_dec`];

  if (!keypair || !enc || !dec) {
    throw new Error(`[pqc-kyber] Required functions not exported for level ${level}`);
  }

  // Constants
  const PUBLICKEYBYTES = ex[`PQCLEAN_${L}_CLEAN_CRYPTO_PUBLICKEYBYTES`];
  const SECRETKEYBYTES = ex[`PQCLEAN_${L}_CLEAN_CRYPTO_SECRETKEYBYTES`];
  const CIPHERTEXTBYTES = ex[`PQCLEAN_${L}_CLEAN_CRYPTO_CIPHERTEXTBYTES`];
  const BYTES = ex[`PQCLEAN_${L}_CLEAN_CRYPTO_BYTES`] || 32; // shared secret length (fallback 32)

  function alloc(size) {
    // Use a simple bump allocator over the linear memory
    const buf = new Uint8Array(wasmMemory.buffer);
    const ptr = buf.byteLength - size; // naive; replace with proper malloc if available
    return { ptr, view: new Uint8Array(wasmMemory.buffer, ptr, size) };
  }

  kyber = {
    // Generates (publicKey, secretKey)
    keypair: () => {
      const pk = new Uint8Array(PUBLICKEYBYTES);
      const sk = new Uint8Array(SECRETKEYBYTES);

      const pkMem = alloc(PUBLICKEYBYTES);
      const skMem = alloc(SECRETKEYBYTES);

      const rc = keypair(wasmMemory.buffer, pkMem.ptr, wasmMemory.buffer, skMem.ptr);
      if (rc !== 0) throw new Error(`[pqc-kyber] keypair failed: ${rc}`);

      pk.set(pkMem.view);
      sk.set(skMem.view);
      return { publicKey: pk, secretKey: sk };
    },

    // Encapsulate shared secret to publicKey → { ciphertext, sharedSecret }
    encapsulate: (publicKey) => {
      if (!(publicKey instanceof Uint8Array)) publicKey = new Uint8Array(publicKey);
      const ct = new Uint8Array(CIPHERTEXTBYTES);
      const ss = new Uint8Array(BYTES);

      const pkMem = alloc(publicKey.length); pkMem.view.set(publicKey);
      const ctMem = alloc(CIPHERTEXTBYTES);
      const ssMem = alloc(BYTES);

      const rc = enc(
        wasmMemory.buffer, ctMem.ptr,
        wasmMemory.buffer, ssMem.ptr,
        wasmMemory.buffer, pkMem.ptr
      );
      if (rc !== 0) throw new Error(`[pqc-kyber] encapsulate failed: ${rc}`);

      ct.set(ctMem.view);
      ss.set(ssMem.view);
      return { ciphertext: ct, sharedSecret: ss };
    },

    // Decapsulate ciphertext with secretKey → sharedSecret
    decapsulate: (secretKey, ciphertext) => {
      if (!(secretKey instanceof Uint8Array)) secretKey = new Uint8Array(secretKey);
      if (!(ciphertext instanceof Uint8Array)) ciphertext = new Uint8Array(ciphertext);

      const ss = new Uint8Array(BYTES);

      const skMem = alloc(secretKey.length); skMem.view.set(secretKey);
      const ctMem = alloc(ciphertext.length); ctMem.view.set(ciphertext);
      const ssMem = alloc(BYTES);

      const rc = dec(
        wasmMemory.buffer, ssMem.ptr,
        wasmMemory.buffer, ctMem.ptr,
        wasmMemory.buffer, skMem.ptr
      );
      if (rc !== 0) throw new Error(`[pqc-kyber] decapsulate failed: ${rc}`);

      ss.set(ssMem.view);
      return ss;
    },

    level,
    constants: { PUBLICKEYBYTES, SECRETKEYBYTES, CIPHERTEXTBYTES, BYTES }
  };

  return kyber;
}

// Public API

export async function kyberKeyPair(params = { level: 768 }) {
  const k = await ensureInit(params);
  const { publicKey, secretKey } = k.keypair();
  return { publicKey: Buffer.from(publicKey), privateKey: Buffer.from(secretKey) };
}

export async function kyberEncapsulate(publicKey, params = { level: 768 }) {
  const k = await ensureInit(params);
  const { ciphertext, sharedSecret } = k.encapsulate(publicKey);
  return { ciphertext: Buffer.from(ciphertext), sharedSecret: Buffer.from(sharedSecret) };
}

export async function kyberDecapsulate(privateKey, ciphertext, params = { level: 768 }) {
  const k = await ensureInit(params);
  const ss = k.decapsulate(privateKey, ciphertext);
  return Buffer.from(ss);
}

export async function kyberConstants(params = { level: 768 }) {
  const k = await ensureInit(params);
  return k.constants;
}

export class PQCKyberProvider {
  constructor(level = 768) {
    this.level = level;
    this.algorithm = `kyber${level}`;
  }
  async generateKeyPair() { return kyberKeyPair({ level: this.level }); }
  async encapsulate(publicKey) { return kyberEncapsulate(publicKey, { level: this.level }); }
  async decapsulate(privateKey, ciphertext) { return kyberDecapsulate(privateKey, ciphertext, { level: this.level }); }
}

export default PQCKyberProvider;
