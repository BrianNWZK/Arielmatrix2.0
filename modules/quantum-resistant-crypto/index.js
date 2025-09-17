// modules/quantum-resistant-crypto/index.js

import {
  kyberKeyPair,
  kyberEncrypt,
  kyberDecrypt
} from 'pqc-kyber';

import {
  dilithiumKeyPair,
  dilithiumSign,
  dilithiumVerify
} from 'pqc-dilithium';

import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';

export class QuantumResistantCrypto {
  constructor() {
    this.db = new ArielSQLiteEngine();
    this.keyDerivationSalt = randomBytes(16);
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

  deriveKey(masterKey) {
    return scryptSync(masterKey, this.keyDerivationSalt, 32);
  }

  async generateKyberKeyPair() {
    const keyPair = await kyberKeyPair();
    const masterKey = process.env.QR_MASTER_KEY;
    if (!masterKey) throw new Error('QR_MASTER_KEY not set');
    const aesKey = this.deriveKey(masterKey);

    const encryptedPrivateKey = this.encryptWithAES(keyPair.secretKey.toString('base64'), aesKey);

    const result = await this.db.run(
      'INSERT INTO quantum_keys (public_key, private_key_encrypted, key_type) VALUES (?, ?, ?)',
      [keyPair.publicKey.toString('base64'), encryptedPrivateKey, 'kyber']
    );

    return {
      publicKey: keyPair.publicKey.toString('base64'),
      keyId: result.lastID
    };
  }

  async generateDilithiumKeyPair() {
    const keyPair = await dilithiumKeyPair();
    const masterKey = process.env.QR_MASTER_KEY;
    if (!masterKey) throw new Error('QR_MASTER_KEY not set');
    const aesKey = this.deriveKey(masterKey);

    const encryptedPrivateKey = this.encryptWithAES(keyPair.privateKey.toString('base64'), aesKey);

    const result = await this.db.run(
      'INSERT INTO quantum_keys (public_key, private_key_encrypted, key_type) VALUES (?, ?, ?)',
      [keyPair.publicKey.toString('base64'), encryptedPrivateKey, 'dilithium']
    );

    return {
      publicKey: keyPair.publicKey.toString('base64'),
      keyId: result.lastID
    };
  }

  async encryptData(data, publicKey) {
    const dataBuffer = Buffer.from(JSON.stringify(data));
    const ciphertext = await kyberEncrypt(Buffer.from(publicKey, 'base64'), dataBuffer);
    return ciphertext.toString('base64');
  }

  async decryptData(ciphertext, keyId) {
    const row = await this.db.get(
      'SELECT private_key_encrypted FROM quantum_keys WHERE id = ?',
      [keyId]
    );

    if (!row) throw new Error('Key not found in database');

    const masterKey = process.env.QR_MASTER_KEY;
    if (!masterKey) throw new Error('QR_MASTER_KEY not set');
    const aesKey = this.deriveKey(masterKey);

    const privateKey = this.decryptWithAES(row.private_key_encrypted, aesKey);
    const decrypted = await kyberDecrypt(
      Buffer.from(privateKey, 'base64'),
      Buffer.from(ciphertext, 'base64')
    );

    return JSON.parse(decrypted.toString());
  }

  encryptWithAES(data, key) {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, encrypted, authTag]).toString('base64');
  }

  decryptWithAES(encryptedData, key) {
    const buffer = Buffer.from(encryptedData, 'base64');
    const iv = buffer.slice(0, 16);
    const ciphertext = buffer.slice(16, buffer.length - 16);
    const authTag = buffer.slice(buffer.length - 16);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return decipher.update(ciphertext, null, 'utf8') + decipher.final('utf8');
  }

  async signTransaction(txData, keyId) {
    const row = await this.db.get(
      'SELECT private_key_encrypted, public_key FROM quantum_keys WHERE id = ? AND key_type = ?',
      [keyId, 'dilithium']
    );

    if (!row) throw new Error('Dilithium key not found');

    const masterKey = process.env.QR_MASTER_KEY;
    if (!masterKey) throw new Error('QR_MASTER_KEY not set');
    const aesKey = this.deriveKey(masterKey);
    const privateKey = this.decryptWithAES(row.private_key_encrypted, aesKey);

    const signature = await dilithiumSign(
      Buffer.from(privateKey, 'base64'),
      Buffer.from(JSON.stringify(txData))
    );

    return {
      signature: signature.toString('base64'),
      publicKey: row.public_key
    };
  }

  async verifySignature(data, signature, publicKey) {
    try {
      return await dilithiumVerify(
        Buffer.from(publicKey, 'base64'),
        Buffer.from(JSON.stringify(data)),
        Buffer.from(signature, 'base64')
      );
    } catch (error) {
      console.error('Signature verification error:', error.message);
      return false;
    }
  }
}
