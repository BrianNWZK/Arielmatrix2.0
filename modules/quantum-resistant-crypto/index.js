// Quantum-Resistant Crypto Module
// Handles Kyber/Dilithium key generation, storage, encryption, and signatures

import {
  kyberKeyPair,
  kyberEncrypt,
  kyberDecrypt,
  dilithiumKeyPair,
  dilithiumSign,
  dilithiumVerify
} from "pqc-kyber";

import { randomBytes, createHash, createCipheriv, createDecipheriv } from "crypto";
import { ArielSQLiteEngine } from "../ariel-sqlite-engine/index.js";

export class QuantumResistantCrypto {
  constructor() {
    this.db = new ArielSQLiteEngine("./data/quantum.db");
  }

  async initialize() {
    await this.db.init();

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS quantum_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_key TEXT NOT NULL,
        private_key_encrypted TEXT NOT NULL,
        key_type TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async generateKyberKeyPair() {
    const keyPair = kyberKeyPair();
    const encryptedPrivateKey = this.encryptWithAES(
      keyPair.privateKey,
      process.env.QR_MASTER_KEY
    );

    await this.db.run(
      `INSERT INTO quantum_keys (public_key, private_key_encrypted, key_type)
       VALUES (?, ?, ?)`,
      [keyPair.publicKey.toString("base64"), encryptedPrivateKey, "kyber"]
    );

    const row = await this.db.get("SELECT last_insert_rowid() as id");
    return {
      keyId: row.id,
      publicKey: keyPair.publicKey.toString("base64")
    };
  }

  async generateDilithiumKeyPair() {
    const keyPair = dilithiumKeyPair();
    const encryptedPrivateKey = this.encryptWithAES(
      keyPair.privateKey,
      process.env.QR_MASTER_KEY
    );

    await this.db.run(
      `INSERT INTO quantum_keys (public_key, private_key_encrypted, key_type)
       VALUES (?, ?, ?)`,
      [keyPair.publicKey.toString("base64"), encryptedPrivateKey, "dilithium"]
    );

    const row = await this.db.get("SELECT last_insert_rowid() as id");
    return {
      keyId: row.id,
      publicKey: keyPair.publicKey.toString("base64")
    };
  }

  async encryptData(data, publicKey) {
    const ciphertext = kyberEncrypt(
      Buffer.from(publicKey, "base64"),
      Buffer.from(JSON.stringify(data))
    );
    return ciphertext.toString("base64");
  }

  async decryptData(ciphertext, keyId) {
    const row = await this.db.get(
      `SELECT private_key_encrypted FROM quantum_keys WHERE id = ? AND key_type = "kyber"`,
      [keyId]
    );

    if (!row) throw new Error("Key not found");

    const privateKey = this.decryptWithAES(
      row.private_key_encrypted,
      process.env.QR_MASTER_KEY
    );

    const decrypted = kyberDecrypt(
      Buffer.from(privateKey, "base64"),
      Buffer.from(ciphertext, "base64")
    );

    return JSON.parse(decrypted.toString());
  }

  async signTransaction(txData, keyId) {
    const row = await this.db.get(
      `SELECT private_key_encrypted, public_key FROM quantum_keys WHERE id = ? AND key_type = "dilithium"`,
      [keyId]
    );

    if (!row) throw new Error("Dilithium key not found");

    const privateKey = this.decryptWithAES(
      row.private_key_encrypted,
      process.env.QR_MASTER_KEY
    );

    const signature = dilithiumSign(
      Buffer.from(privateKey, "base64"),
      Buffer.from(JSON.stringify(txData))
    );

    return {
      signature: signature.toString("base64"),
      publicKey: row.public_key
    };
  }

  async verifySignature(data, signature, publicKey) {
    return dilithiumVerify(
      Buffer.from(publicKey, "base64"),
      Buffer.from(JSON.stringify(data)),
      Buffer.from(signature, "base64")
    );
  }

  encryptWithAES(data, key) {
    const iv = randomBytes(16);
    const cipher = createCipheriv(
      "aes-256-gcm",
      createHash("sha256").update(key).digest(),
      iv
    );
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString("base64");
  }

  decryptWithAES(encrypted, key) {
    const buffer = Buffer.from(encrypted, "base64");
    const iv = buffer.slice(0, 16);
    const tag = buffer.slice(buffer.length - 16);
    const text = buffer.slice(16, buffer.length - 16);

    const decipher = createDecipheriv(
      "aes-256-gcm",
      createHash("sha256").update(key).digest(),
      iv
    );
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(text), decipher.final()]);
    return decrypted.toString();
  }
}
