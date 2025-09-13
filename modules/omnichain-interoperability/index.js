// modules/omnichain-interop/index.js

import { Database } from '../ariel-sqlite-engine';
import { QuantumResistantCrypto } from '../quantum-resistant-crypto';
import { CrossChainBridge } from '../cross-chain-bridge';

/**
 * @class OmnichainInterop
 * @description Facilitates secure, quantum-resistant data and asset transfers
 * across multiple blockchains using the Cross-Chain Bridge.
 */
export class OmnichainInterop {
    constructor() {
        this.db = new Database();
        this.qrCrypto = new QuantumResistantCrypto();
        this.bridge = new CrossChainBridge();
    }

    /**
     * @method initialize
     * @description Initializes the interoperability module and its dependencies.
     */
    async initialize(bridgeConfig) {
        await this.db.init();
        await this.qrCrypto.initialize();
        await this.bridge.initialize(bridgeConfig);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS data_transfers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                source_chain TEXT NOT NULL,
                target_chain TEXT NOT NULL,
                sender TEXT NOT NULL,
                receiver TEXT NOT NULL,
                encrypted_data TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME
            )
        `);
    }

    /**
     * @method transferData
     * @description Transfers encrypted data across chains.
     * @param {string} sourceChain - The source blockchain.
     * @param {string} targetChain - The target blockchain.
     * @param {string} sender - The sender's address.
     * @param {string} receiver - The receiver's address.
     * @param {object} data - The data to be transferred.
     * @param {string} publicKey - The receiver's Kyber public key.
     * @returns {Promise<object>} The transfer details.
     */
    async transferData(sourceChain, targetChain, sender, receiver, data, publicKey) {
        let transferId;
        try {
            // Encrypt the data with the receiver's quantum-resistant public key
            const encryptedData = await this.qrCrypto.encryptData(data, publicKey);

            // Record the transfer in the local database
            const result = await this.db.run(
                'INSERT INTO data_transfers (source_chain, target_chain, sender, receiver, encrypted_data) VALUES (?, ?, ?, ?, ?)',
                [sourceChain, targetChain, sender, receiver, encryptedData]
            );
            transferId = result.lastID;

            // Use a small asset transfer to trigger the cross-chain event.
            // The `encryptedData` can be included as part of the transaction memo or data payload.
            // This is a simplified representation.
            const bridgeResult = await this.bridge.bridgeAssets(
                sourceChain,
                targetChain,
                0.001, // A small amount to trigger the bridge
                '0x...', // A dummy token address
                sender,
                receiver
            );

            // Update the transfer status
            await this.db.run(
                'UPDATE data_transfers SET status = "completed", completed_at = CURRENT_TIMESTAMP WHERE id = ?',
                [transferId]
            );

            return { transferId, bridgeTxHash: bridgeResult.sourceTxHash };
        } catch (error) {
            if (transferId) {
                await this.db.run(
                    'UPDATE data_transfers SET status = "failed" WHERE id = ?',
                    [transferId]
                );
            }
            throw new Error(`Data transfer failed: ${error.message}`);
        }
    }

    /**
     * @method verifyDataTransfer
     * @description Verifies and decrypts a received data transfer.
     * @param {number} transferId - The ID of the transfer.
     * @param {number} privateKeyId - The ID of the private key for decryption.
     * @returns {Promise<object>} The decrypted data.
     */
    async verifyDataTransfer(transferId, privateKeyId) {
        try {
            const transfer = await this.db.get('SELECT * FROM data_transfers WHERE id = ? AND status = "completed"', [transferId]);

            if (!transfer) {
                throw new Error('Transfer not found or not completed.');
            }

            // Verify the on-chain transaction if necessary
            // For now, we trust the local database state

            // Decrypt the data using the provided private key ID
            const decryptedData = await this.qrCrypto.decryptData(transfer.encrypted_data, privateKeyId);

            return decryptedData;
        } catch (error) {
            throw new Error(`Failed to verify or decrypt data transfer: ${error.message}`);
        }
    }
}
