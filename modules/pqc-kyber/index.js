import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

let kyber = null;
let wasmMemory = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Attempts to load and initialize Kyber WASM.
 * Returns null if WASM is missing or fails.
 */
async function loadKyberWasm(level = 768) {
  const wasmFile = `kyber${level}.wasm`;
  const wasmPath = path.resolve(__dirname, 'dist', wasmFile);

  if (!fs.existsSync(wasmPath)) {
    console.warn(`[pqc-kyber] ⚠️ WASM file not found: ${wasmFile}. Skipping WASM init.`);
    return null;
  }

  const wasmBinary = fs.readFileSync(wasmPath);
  wasmMemory = new WebAssembly.Memory({ initial: 256, maximum: 65536 });

  const env = {
    env: {
      memory: wasmMemory,
      emscripten_notify_memory_growth: () => {},
      abort: (msg, file, line, column) => {
        throw new Error(`Kyber WASM abort: ${msg} at ${file}:${line}:${column}`);
      }
    }
  };

  const { instance } = await WebAssembly.instantiate(wasmBinary, env);
  const ex = instance.exports;

  const L = level === 512 ? 'KYBER512' : level === 1024 ? 'KYBER1024' : 'KYBER768';

  const keypair = ex[`PQCLEAN_${L}_CLEAN_crypto_kem_keypair`];
  const enc = ex[`PQCLEAN_${L}_CLEAN_crypto_kem_enc`];
  const dec = ex[`PQCLEAN_${L}_CLEAN_crypto_kem_dec`];

  if (!keypair || !enc || !dec) {
    throw new Error(`[pqc-kyber] Required functions not exported for level ${level}`);
  }

  const PUBLICKEYBYTES = ex[`PQCLEAN_${L}_CLEAN_CRYPTO_PUBLICKEYBYTES`];
  const SECRETKEYBYTES = ex[`PQCLEAN_${L}_CLEAN_CRYPTO_SECRETKEYBYTES`];
  const CIPHERTEXTBYTES = ex[`PQCLEAN_${L}_CLEAN_CRYPTO_CIPHERTEXTBYTES`];
  const BYTES = ex[`PQCLEAN_${L}_CLEAN_CRYPTO_BYTES`] || 32;

  function alloc(size) {
    const ptr = ex.malloc ? ex.malloc(size) : wasmMemory.buffer.byteLength - size;
    return { ptr, view: new Uint8Array(wasmMemory.buffer, ptr, size) };
  }

  return {
    level,
    constants: { PUBLICKEYBYTES, SECRETKEYBYTES, CIPHERTEXTBYTES, BYTES },
    keypair: () => {
      const pk = alloc(PUBLICKEYBYTES);
      const sk = alloc(SECRETKEYBYTES);
      const rc = keypair(pk.ptr, sk.ptr);
      if (rc !== 0) throw new Error(`[pqc-kyber] keypair failed: ${rc}`);
      return {
        publicKey: Buffer.from(pk.view),
        secretKey: Buffer.from(sk.view)
      };
    },
    encapsulate: (publicKey) => {
      const pk = alloc(publicKey.length); pk.view.set(publicKey);
      const ct = alloc(CIPHERTEXTBYTES);
      const ss = alloc(BYTES);
      const rc = enc(ct.ptr, ss.ptr, pk.ptr);
      if (rc !== 0) throw new Error(`[pqc-kyber] encapsulate failed: ${rc}`);
      return {
        ciphertext: Buffer.from(ct.view),
        sharedSecret: Buffer.from(ss.view)
      };
    },
    decapsulate: (secretKey, ciphertext) => {
      const sk = alloc(secretKey.length); sk.view.set(secretKey);
      const ct = alloc(ciphertext.length); ct.view.set(ciphertext);
      const ss = alloc(BYTES);
      const rc = dec(ss.ptr, ct.ptr, sk.ptr);
      if (rc !== 0) throw new Error(`[pqc-kyber] decapsulate failed: ${rc}`);
      return Buffer.from(ss.view);
    }
  };
}

/**
 * Ensures Kyber is initialized for the given level.
 */
async function ensureInit(params = { level: 768 }) {
  if (kyber && kyber.level === params.level) return kyber;
  kyber = await loadKyberWasm(params.level);
  if (!kyber) throw new Error(`[pqc-kyber] Kyber WASM not available for level ${params.level}`);
  return kyber;
}

// Public API

export async function kyberKeyPair(params = { level: 768 }) {
  const k = await ensureInit(params);
  return k.keypair();
}

export async function kyberEncapsulate(publicKey, params = { level: 768 }) {
  const k = await ensureInit(params);
  return k.encapsulate(publicKey);
}

export async function kyberDecapsulate(privateKey, ciphertext, params = { level: 768 }) {
  const k = await ensureInit(params);
  return k.decapsulate(privateKey, ciphertext);
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
  async generateKeyPair() {
    return kyberKeyPair({ level: this.level });
  }
  async encapsulate(publicKey) {
    return kyberEncapsulate(publicKey, { level: this.level });
  }
  async decapsulate(privateKey, ciphertext) {
    return kyberDecapsulate(privateKey, ciphertext, { level: this.level });
  }
}

export default PQCKyberProvider;
