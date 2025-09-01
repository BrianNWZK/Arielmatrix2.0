// backend/blockchain/BrianNwaezikeChain.js
// This file acts as an interface for ArielMatrix2.0 components (like agents)
// to interact with the Brian Nwaezike Chain via the ArielSQL Alltimate Suite's ServiceManager.

// Import the ServiceManager from the ArielSQL Suite.
// The path assumes the arielsql_suite directory is at the root of your project
// alongside 'backend', 'config', 'frontend', etc.
import { ServiceManager, deriveQuantumKeys } from '../../arielsql_suite/serviceManager.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * BrianNwaezikeChainFacade provides a simplified interface for ArielMatrix2.0
 * components to interact with the underlying Brian Nwaezike Chain and its
 * associated services managed by the ArielSQL Alltimate Suite.
 * It delegates core blockchain operations to the initialized ServiceManager.
 */
class BrianNwaezikeChainFacade {
    constructor() {
        // Ensure the ServiceManager is globally accessible. In a deployed Render setup,
        // 'arielsql_suite/main.js' would set global.arielSQLServiceManager upon startup.
        if (typeof global.arielSQLServiceManager === 'undefined' || !global.arielSQLServiceManager) {
            console.error("ArielSQL ServiceManager not initialized. Ensure 'arielsql_suite/main.js' has run.");
            throw new Error("ArielSQL ServiceManager is not available. Check ArielSQL Suite deployment.");
        }
        this.serviceManager = global.arielSQLServiceManager;
        
        // Retrieve the actual BrianNwaezikeChain instance and other services from the ServiceManager
        this.bwaeziCoreChain = this.serviceManager.getService('BrianNwaezikeChain');
        this.quantumCryptoService = this.serviceManager.getService('QuantumResistantCrypto');
        this.dbService = this.serviceManager.getService('BrianNwaezikeDB'); // Access to the integrated DB service
        this.omnichainService = this.serviceManager.getService('OmnichainInteroperability');

        this.nativeToken = this.bwaeziCoreChain.config.NATIVE_TOKEN || 'BWAEZI'; // Get native token from the core chain config
        console.log("BrianNwaezikeChainFacade initialized, connected to ArielSQL Suite.");
    }

    /**
     * Gets the latest block from the Brian Nwaezike Chain's local replica.
     * @returns {Promise<Object|null>} The latest block object or null if none exists.
     */
    async getLatestBlock() {
        return await this.bwaeziCoreChain.getLatestBlock();
    }

    /**
     * Creates and adds a new transaction to the Brian Nwaezike Chain's transaction pool.
     * This transaction will be picked up by the ArielSQL Suite's block producer.
     * This method directly utilizes the quantumCryptoService for signing.
     *
     * @param {string} fromAddress - Sender's address.
     * @param {string} toAddress - Receiver's address.
     * @param {number} amount - Amount to transfer.
     * @param {string} currency - Currency of the transaction (e.g., 'BWAEZI', 'USD').
     * @param {string} privateKey - Sender's private key (hex string) for signing.
     * @returns {Promise<Object>} The created transaction object with a unique ID.
     */
    async createAndAddTransaction(fromAddress, toAddress, amount, currency, privateKey) {
        const timestamp = Date.now();
        const id = uuidv4(); // Unique ID for the transaction
        
        // Data string to be signed. Ensure consistency with how the core chain verifies.
        const dataToSign = `${id}${fromAddress}${toAddress}${amount}${currency}${timestamp}`;
        const signature = this.quantumCryptoService.sign(dataToSign, privateKey); // Use the quantum-crypto service for signing

        const transaction = {
            id,
            from_address: fromAddress,
            to_address: toAddress,
            amount,
            currency,
            timestamp,
            fee: 0, // Brian Nwaezike Chain is zero-cost for transactions
            signature,
            // threat_score and quantum_proof will be added by the core chain service
        };
        
        // Add the transaction to the core BrianNwaezikeChain service's transaction pool
        await this.bwaeziCoreChain.addTransactionToPool(transaction);
        console.log(`Transaction ${id.substring(0,8)}... created and added to Bwaezi pool by facade.`);
        return transaction;
    }

    /**
     * Retrieves account balance for a given address and currency.
     * It queries the local database replica managed by BrianNwaezikeDB.
     * @param {string} address - The account address.
     * @param {string} currency - The currency type (e.g., 'BWAEZI', 'USD', or cross-chain token).
     * @returns {Promise<number>} The balance.
     */
    async getAccountBalance(address, currency = 'USD') {
        const account = await this.dbService.get(
            `SELECT balance, bwaezi_balance, cross_chain_balances FROM bwaezi_accounts WHERE address = ?`,
            [address]
        );

        if (!account) return 0;
        
        if (currency === this.nativeToken) {
            return account.bwaezi_balance || 0;
        } else if (currency !== 'USD') {
            const crossChainBalances = JSON.parse(account.cross_chain_balances || '{}');
            return crossChainBalances[currency] || 0;
        } else {
            return account.balance || 0; // Default balance for USD or other non-native
        }
    }

    /**
     * Retrieves transaction history for a given address.
     * @param {string} address - The account address.
     * @param {number} limit - Maximum number of transactions to retrieve.
     * @returns {Promise<Array<Object>>} List of transactions.
     */
    async getTransactionHistory(address, limit = 50) {
        return await this.dbService.all(
            `SELECT * FROM bwaezi_transactions WHERE from_address = ? OR to_address = ? ORDER BY timestamp DESC LIMIT ?`,
            [address, address, limit]
        );
    }

    /**
     * Initiates a cross-chain bridge operation via the OmnichainInteroperabilityService.
     * @param {string} sourceChain - The source blockchain identifier.
     * @param {string} targetChain - The target blockchain identifier.
     * @param {string} sourceTxHash - Transaction hash on the source chain (if applicable).
     * @param {number} amount - Amount to bridge.
     * @param {string} currency - Currency to bridge.
     * @returns {Promise<Object>} Result of the bridge operation, including a bridge tracking ID.
     */
    async createCrossChainBridge(sourceChain, targetChain, sourceTxHash, amount, currency) {
        return await this.omnichainService.bridgeTransaction({ 
            id: uuidv4(), // Internal bridge tracking ID
            sourceChain, 
            targetChain, 
            sourceTxHash, 
            amount, 
            currency 
        }, targetChain);
    }

    /**
     * Derives a quantum-resistant key pair from a passphrase using the suite's service.
     * @param {string} passphrase - User's passphrase.
     * @param {string|null} salt - Optional salt (hex string).
     * @returns {Object} { pk: publicKeyHex, sk: secretKeyHex, salt: saltHex, ... }
     */
    deriveQuantumKeys(passphrase, salt = null) {
        return deriveQuantumKeys(passphrase, salt); // Re-exporting from suite's utility
    }

    // Helper to get raw DB access (use with caution)
    async executeDbQuery(sql, args = []) {
        return await this.dbService.execute(sql, args);
    }
}

export default BrianNwaezikeChainFacade;
