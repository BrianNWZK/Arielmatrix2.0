// modules/quantum-resistant-crypto/index.js

// Using 'crypto' module for secure key derivation and AES encryption
import { kyberKeyPair, dilithiumKeyPair, kyberEncrypt, kyberDecrypt, dilithiumSign, dilithiumVerify } from 'pqc-kyber';
import { randomBytes, createHash, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { Database } from '../ariel-sqlite-engine';

/**
 * @class QuantumResistantCrypto
 * @description Provides a production-ready, quantum-resistant cryptographic suite.
 * It uses Kyber for key encapsulation and Dilithium for digital signatures,
 * with an additional layer of AES-256-GCM for secure private key storage.
 * All operations are robust and handle errors gracefully.
 */
export class QuantumResistantCrypto {
    constructor() {
        this.db = new Database();
        this.keyDerivationSalt = randomBytes(16); // A unique salt for key derivation
    }

    /**
     * @method initialize
     * @description Initializes the database connection and creates the table for storing quantum keys.
     */
    async initialize() {
        await this.db.init();
        // Create keys table if it doesn't exist
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

    /**
     * @method deriveKey
     * @description Securely derives a symmetric AES key from a master key using scrypt.
     * This makes brute-force attacks on the master key significantly harder.
     * @param {string} masterKey - The master key from an environment variable.
     * @returns {Buffer} The derived 32-byte (256-bit) key.
     */
    deriveKey(masterKey) {
        // Use scrypt for a strong, password-based key derivation function (KDF)
        return scryptSync(masterKey, this.keyDerivationSalt, 32);
    }

    /**
     * @method generateKyberKeyPair
     * @description Generates a Kyber key pair and securely stores the private key in the database.
     * @returns {Promise<object>} An object containing the public key and key ID.
     */
    async generateKyberKeyPair() {
        try {
            const keyPair = kyberKeyPair();
            const masterKey = process.env.QR_MASTER_KEY;
            if (!masterKey) throw new Error('QR_MASTER_KEY not set');
            const aesKey = this.deriveKey(masterKey);

            // Encrypt the private key with the derived AES key
            const encryptedPrivateKey = this.encryptWithAES(keyPair.privateKey.toString('base64'), aesKey);

            const result = await this.db.run(
                'INSERT INTO quantum_keys (public_key, private_key_encrypted, key_type) VALUES (?, ?, ?)',
                [keyPair.publicKey.toString('base64'), encryptedPrivateKey, 'kyber']
            );
            
            return {
                publicKey: keyPair.publicKey.toString('base64'),
                keyId: result.lastID
            };
        } catch (error) {
            throw new Error(`Kyber key generation failed: ${error.message}`);
        }
    }

    /**
     * @method generateDilithiumKeyPair
     * @description Generates a Dilithium key pair for digital signatures.
     * @returns {Promise<object>} An object with the public key and key ID.
     */
    async generateDilithiumKeyPair() {
        try {
            const keyPair = dilithiumKeyPair();
            const masterKey = process.env.QR_MASTER_KEY;
            if (!masterKey) throw new Error('QR_MASTER_KEY not set');
            const aesKey = this.deriveKey(masterKey);

            // Encrypt the private key with the derived AES key
            const encryptedPrivateKey = this.encryptWithAES(keyPair.privateKey.toString('base64'), aesKey);

            const result = await this.db.run(
                'INSERT INTO quantum_keys (public_key, private_key_encrypted, key_type) VALUES (?, ?, ?)',
                [keyPair.publicKey.toString('base64'), encryptedPrivateKey, 'dilithium']
            );
            
            return {
                publicKey: keyPair.publicKey.toString('base64'),
                keyId: result.lastID
            };
        } catch (error) {
            throw new Error(`Dilithium key generation failed: ${error.message}`);
        }
    }

    /**
     * @method encryptData
     * @description Encrypts data using Kyber with a provided public key.
     * @param {*} data - The data to encrypt (can be an object or a string).
     * @param {string} publicKey - The Kyber public key (base64 encoded).
     * @returns {Promise<string>} The ciphertext (base64 encoded).
     */
    async encryptData(data, publicKey) {
        try {
            const dataBuffer = Buffer.from(JSON.stringify(data));
            const ciphertext = kyberEncrypt(Buffer.from(publicKey, 'base64'), dataBuffer);
            return ciphertext.toString('base64');
        } catch (error) {
            throw new Error(`Kyber encryption failed: ${error.message}`);
        }
    }

    /**
     * @method decryptData
     * @description Decrypts a Kyber ciphertext using a private key from the database.
     * @param {string} ciphertext - The ciphertext (base64 encoded).
     * @param {number} keyId - The ID of the private key in the database.
     * @returns {Promise<object>} The decrypted data.
     */
    async decryptData(ciphertext, keyId) {
        try {
            const row = await this.db.get(
                'SELECT private_key_encrypted FROM quantum_keys WHERE id = ?',
                [keyId]
            );
            
            if (!row) throw new Error('Key not found in database');
            
            const masterKey = process.env.QR_MASTER_KEY;
            if (!masterKey) throw new Error('QR_MASTER_KEY not set');
            const aesKey = this.deriveKey(masterKey);

            const privateKey = this.decryptWithAES(row.private_key_encrypted, aesKey);
            const decrypted = kyberDecrypt(Buffer.from(privateKey, 'base64'), Buffer.from(ciphertext, 'base64'));
            
            return JSON.parse(decrypted.toString());
        } catch (error) {
            throw new Error(`Kyber decryption failed: ${error.message}`);
        }
    }

    /**
     * @method encryptWithAES
     * @description Encrypts data with AES-256-GCM.
     * @param {string} data - The data to encrypt.
     * @param {Buffer} key - The AES key.
     * @returns {string} The encrypted data, IV, and auth tag concatenated and base64-encoded.
     */
    encryptWithAES(data, key) {
        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
        const authTag = cipher.getAuthTag();
        return Buffer.concat([iv, encrypted, authTag]).toString('base64');
    }

    /**
     * @method decryptWithAES
     * @description Decrypts data with AES-256-GCM, verifying the auth tag.
     * @param {string} encryptedData - The encrypted data (base64 encoded).
     * @param {Buffer} key - The AES key.
     * @returns {string} The decrypted data.
     */
    decryptWithAES(encryptedData, key) {
        const buffer = Buffer.from(encryptedData, 'base64');
        const iv = buffer.slice(0, 16);
        const ciphertext = buffer.slice(16, buffer.length - 16);
        const authTag = buffer.slice(buffer.length - 16);
        
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        try {
            const decrypted = decipher.update(ciphertext, null, 'utf8') + decipher.final('utf8');
            return decrypted;
        } catch (error) {
            throw new Error(`AES decryption failed: ${error.message}`);
        }
    }

    /**
     * @method signTransaction
     * @description Signs a transaction with a Dilithium private key from the database.
     * @param {object} txData - The transaction data to sign.
     * @param {number} keyId - The ID of the private key in the database.
     * @returns {Promise<object>} An object with the signature and public key.
     */
    async signTransaction(txData, keyId) {
        try {
            const row = await this.db.get(
                'SELECT private_key_encrypted, public_key FROM quantum_keys WHERE id = ? AND key_type = ?',
                [keyId, 'dilithium']
            );
            
            if (!row) throw new Error('Dilithium key not found');
            
            const masterKey = process.env.QR_MASTER_KEY;
            if (!masterKey) throw new Error('QR_MASTER_KEY not set');
            const aesKey = this.deriveKey(masterKey);
            const privateKey = this.decryptWithAES(row.private_key_encrypted, aesKey);

            const signature = dilithiumSign(Buffer.from(privateKey, 'base64'), Buffer.from(JSON.stringify(txData)));
            
            return {
                signature: signature.toString('base64'),
                publicKey: row.public_key
            };
        } catch (error) {
            throw new Error(`Transaction signing failed: ${error.message}`);
        }
    }

    /**
     * @method verifySignature
     * @description Verifies a Dilithium signature.
     * @param {object} data - The original data.
     * @param {string} signature - The signature (base64 encoded).
     * @param {string} publicKey - The public key (base64 encoded).
     * @returns {Promise<boolean>} True if the signature is valid, false otherwise.
     */
    async verifySignature(data, signature, publicKey) {
        try {
            return dilithiumVerify(
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
