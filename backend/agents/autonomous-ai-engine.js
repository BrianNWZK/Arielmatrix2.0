/**
 * autonomous-ai-engine.js
 *
 * This module is the core backend service that autonomously processes the
 * payout queue. It periodically checks the database for "pending" payouts,
 * uses the secure `wallet.js` utility to send the transactions, and updates
 * the records with the transaction hash upon completion.
 *
 * This engine operates as a single, centralized processor, ensuring that
 * payouts are handled securely and reliably without manual intervention.
 */

// =========================================================================
// 1. External Library Imports
// =========================================================================
// Use better-sqlite3 for a robust, production-grade local database.
import betterSqlite3 from 'better-sqlite3';

// Import the wallet utility to handle secure, real transactions.
import { sendTransaction } from './wallet.js';

// =========================================================================
// 2. Class Definition
// =========================================================================
class AutonomousAIEngine {
  constructor() {
    this.db = null;
    console.log("Autonomous AI Engine initialized.");
  }

  /**
   * Initializes the database connection.
   */
  async initializeDatabase() {
    try {
      this.db = new betterSqlite3('bwaezi_backend.db', { verbose: console.log });
      console.log("Connected to the payouts database.");
      
      // Ensure the necessary table exists.
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS payouts (
          id TEXT PRIMARY KEY,
          recipient TEXT NOT NULL,
          amount REAL NOT NULL,
          status TEXT NOT NULL,
          txHash TEXT,
          timestamp TEXT NOT NULL
        );
      `);
      console.log("Payouts table verified.");

    } catch (error) {
      console.error("Failed to connect to the database:", error.message);
      throw error;
    }
  }

  /**
   * Starts the engine, setting up a recurring job to process payouts.
   * @param {number} intervalMs - The interval in milliseconds to check for new payouts.
   */
  async start(intervalMs = 5000) { // Default to 5 seconds
    try {
      await this.initializeDatabase();
      console.log(`Autonomous AI Engine started. Processing payouts every ${intervalMs / 1000} seconds.`);

      setInterval(() => {
        this.processPayouts();
      }, intervalMs);

    } catch (error) {
      console.error("Failed to start the engine:", error);
    }
  }

  /**
   * The main processing function that fetches and handles pending payouts.
   */
  async processPayouts() {
    if (!this.db) {
      console.error("Database connection not established. Skipping processing.");
      return;
    }

    try {
      // 1. Select all pending payouts from the queue.
      const pendingPayouts = this.db.prepare("SELECT * FROM payouts WHERE status = 'pending'").all();

      if (pendingPayouts.length === 0) {
        console.log("No pending payouts to process.");
        return;
      }

      console.log(`[ENGINE] Found ${pendingPayouts.length} pending payouts. Beginning processing...`);

      // 2. Process each pending payout sequentially.
      for (const payout of pendingPayouts) {
        try {
          console.log(`[ENGINE] Processing payout for recipient: ${payout.recipient} with amount: ${payout.amount}`);

          // Send the transaction using the secure wallet utility.
          const txHash = await sendTransaction(payout.recipient, payout.amount.toString());

          // 3. If successful, update the database record.
          const updateStmt = this.db.prepare('UPDATE payouts SET status = ?, txHash = ? WHERE id = ?');
          updateStmt.run('completed', txHash, payout.id);
          console.log(`[ENGINE] Payout completed for ID ${payout.id}. Tx Hash: ${txHash}`);

        } catch (error) {
          // 4. Handle a failed transaction, updating the status.
          console.error(`[ENGINE] Failed to process payout ID ${payout.id}:`, error.message);
          const updateStmt = this.db.prepare('UPDATE payouts SET status = ? WHERE id = ?');
          updateStmt.run('failed', payout.id);
        }
      }

    } catch (error) {
      console.error("[ENGINE] An unexpected error occurred during processing:", error);
    }
  }
}

// =========================================================================
// 3. Engine Startup
// =========================================================================
const engine = new AutonomousAIEngine();
engine.start();
