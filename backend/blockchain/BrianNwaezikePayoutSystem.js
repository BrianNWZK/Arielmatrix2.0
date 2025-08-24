// backend/blockchain/BrianNwaezikePayoutSystem.js
import { yourSQLite } from 'ariel-sqlite-engine';
import { BrianNwaezikeChain } from './BrianNwaezikeChain.js';
import { QuantumShield } from 'quantum-resistant-crypto';

// SIMPLIFIED PAYOUT SYSTEM FOR TESTING
class BrianNwaezikePayoutSystem {
    constructor(config) {
        this.config = config;
        this.blockchain = new BrianNwaezikeChain(config); // Core chain instance
        this.quantumShield = new QuantumShield();
        this.initPayoutTables();
    }
    
    initPayoutTables() {
        this.db = yourSQLite.createDatabase('./data/bwc_payouts.db');
        // Simple table for now to track successful payouts for our test
        this.db.run(`
            CREATE TABLE IF NOT EXISTS bwc_test_payouts (
                id TEXT PRIMARY KEY,
                agent_id TEXT,
                amount REAL,
                currency TEXT,
                destination TEXT,
                bwaezi_tx_hash TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }
    
    // THE CRITICAL METHOD FOR OUR TEST
    async processPayout(destinationAddress, amount, currency = 'BWAEZI') {
        console.log(`[BWC Payout] Processing: ${amount} ${currency} to ${destinationAddress}`);
        
        try {
            // 1. Create the transaction on the BrianNwaezikeChain
            const transaction = await this.blockchain.createTransaction(
                this.config.SYSTEM_ACCOUNT, // From the system treasury
                destinationAddress,          // To the provided wallet
                amount,
                currency,
                this.config.SYSTEM_PRIVATE_KEY // Signs the TX
            );
            
            console.log(`✅ SUCCESS: TX Hash: ${transaction.id}`);
            
            // 2. Record the successful payout in our database
            await this.db.run(
                `INSERT INTO bwc_test_payouts (id, agent_id, amount, currency, destination, bwaezi_tx_hash)
                 VALUES (?, ?, ?, ?, ?, ?)`,
                [`payout_${Date.now()}`, 'crypto_agent', amount, currency, destinationAddress, transaction.id]
            );
            
            return { success: true, txHash: transaction.id };
            
        } catch (error) {
            console.error('❌ FAILED Payout:', error.message);
            return { success: false, error: error.message };
        }
    }
    
    // Helper function for the crypto agent to get its balance
    async getSystemBalance() {
        return await this.blockchain.getAccountBalance(this.config.SYSTEM_ACCOUNT, 'BWAEZI');
    }
}

export default BrianNwaezikePayoutSystem;
