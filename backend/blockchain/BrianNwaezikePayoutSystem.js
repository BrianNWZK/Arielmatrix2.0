// backend/blockchain/BrianNwaezikePayoutSystem.js
// This system manages payouts using the BrianNwaezikeChainFacade to ensure
// all transactions go through the ArielSQL Alltimate Suite and the Bwaezi blockchain.

import BrianNwaezikeChainFacade from './BrianNwaezikeChain.js'; // Import the facade
import { ServiceManager } from '../../arielsql_suite/serviceManager.js'; // To get the main DB service
import { v4 as uuidv4 } from 'uuid'; // For unique IDs

/**
 * BrianNwaezikePayoutSystem orchestrates automated payouts, leveraging
 * the BrianNwaezikeChainFacade to submit zero-cost transactions
 * to the Bwaezi blockchain. It also uses the ArielSQL Suite's database
 * for local payout tracking if needed.
 */
class BrianNwaezikePayoutSystem {
    constructor(config) {
        this.config = config;
        // The blockchain instance is now the Facade, connecting to the central suite
        this.blockchainFacade = new BrianNwaezikeChainFacade();
        
        // Access the central BrianNwaezikeDB for local payout tracking if this system
        // needs its own persistent state. Otherwise, agents can track independently.
        if (typeof global.arielSQLServiceManager === 'undefined' || !global.arielSQLServiceManager) {
            console.error("ArielSQL ServiceManager not initialized for Payout System.");
            throw new Error("ArielSQL ServiceManager is not available. Payout system cannot initialize.");
        }
        this.dbService = global.arielSQLServiceManager.getService('BrianNwaezikeDB');
        
        this.initPayoutTables();
        console.log("BrianNwaezikePayoutSystem initialized.");
    }
    
    /**
     * Initializes a local table within the central BrianNwaezikeDB
     * to track payouts processed by this system.
     */
    async initPayoutTables() {
        try {
            await this.dbService.execute(`
                CREATE TABLE IF NOT EXISTS bwc_payout_records (
                    id TEXT PRIMARY KEY,
                    agent_id TEXT,
                    payout_amount REAL,
                    payout_currency TEXT,
                    destination_address TEXT,
                    bwaezi_tx_id TEXT,
                    status TEXT DEFAULT 'pending',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                );
            `);
            console.log("Payout tracking table 'bwc_payout_records' initialized.");
        } catch (error) {
            console.error("Error initializing payout tables:", error.message);
            throw error; // Re-throw to prevent system from running incorrectly
        }
    }
    
    /**
     * Processes a payout request by creating a transaction on the Brian Nwaezike Chain.
     * This method uses the SYSTEM_ACCOUNT and SYSTEM_PRIVATE_KEY from its config
     * to sign and submit the transaction, ensuring zero fees for the recipient.
     *
     * @param {string} destinationAddress - The recipient's wallet address.
     * @param {number} amount - The amount to be paid out.
     * @param {string} currency - The currency of the payout (defaults to 'BWAEZI').
     * @param {string} agentId - Identifier for the agent initiating the payout.
     * @returns {Promise<Object>} An object indicating success and the transaction ID.
     */
    async processPayout(destinationAddress, amount, currency = 'BWAEZI', agentId = 'unknown_agent') {
        console.log(`[BWC Payout] Processing payout: ${amount} ${currency} to ${destinationAddress} by agent ${agentId}`);
        
        try {
            if (!this.config.SYSTEM_ACCOUNT || !this.config.SYSTEM_PRIVATE_KEY) {
                throw new Error("Payout system requires SYSTEM_ACCOUNT and SYSTEM_PRIVATE_KEY in its config.");
            }

            // 1. Create and add the transaction to the Brian Nwaezike Chain's pool via the facade
            const transaction = await this.blockchainFacade.createAndAddTransaction(
                this.config.SYSTEM_ACCOUNT,    // From the system's treasury account
                destinationAddress,            // To the recipient
                amount,
                currency,
                this.config.SYSTEM_PRIVATE_KEY // System's private key to sign
            );
            
            console.log(`✅ SUCCESS: Brian Nwaezike Chain Transaction ID: ${transaction.id}`);
            
            // 2. Record the payout in the local tracking database
            const payoutRecordId = uuidv4();
            await this.dbService.execute(
                `INSERT INTO bwc_payout_records (id, agent_id, payout_amount, payout_currency, destination_address, bwaezi_tx_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'submitted')`,
                [payoutRecordId, agentId, amount, currency, destinationAddress, transaction.id]
            );

            // In a real system, you might add a listener to the Bwaezi chain
            // to update the status from 'submitted' to 'confirmed' once the block is mined.

            return { success: true, payoutRecordId, bwaeziTxId: transaction.id };
            
        } catch (error) {
            console.error('❌ FAILED Payout:', error.message);
            // Log a failed attempt
            await this.dbService.execute(
                `INSERT INTO bwc_payout_records (id, agent_id, payout_amount, payout_currency, destination_address, bwaezi_tx_id, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'failed')`,
                [uuidv4(), agentId, amount, currency, destinationAddress, 'N/A'] // No Bwaezi TX ID if failed before submission
            );
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Helper function for agents to get the system's BWAEZI balance.
     * @returns {Promise<number>} The system's BWAEZI balance.
     */
    async getSystemBwaeziBalance() {
        if (!this.config.SYSTEM_ACCOUNT) {
            throw new Error("SYSTEM_ACCOUNT not defined in Payout System config.");
        }
        return await this.blockchainFacade.getAccountBalance(this.config.SYSTEM_ACCOUNT, 'BWAEZI');
    }

    /**
     * Retrieves the status of a specific payout record.
     * @param {string} payoutRecordId - The ID of the payout record.
     * @returns {Promise<Object|null>} The payout record or null if not found.
     */
    async getPayoutStatus(payoutRecordId) {
        return await this.dbService.get(
            `SELECT * FROM bwc_payout_records WHERE id = ?`,
            [payoutRecordId]
        );
    }
}

export default BrianNwaezikePayoutSystem;
