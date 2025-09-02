/**
 * autonomous-ai-engine.js
 *
 * This module is the core backend service that autonomously processes the
 * payout queue. It periodically checks the database for "pending" payouts,
 * uses a secure wallet utility to send the transactions, and updates
 * the records with the transaction hash upon completion.
 *
 * This engine operates as a single, centralized processor, ensuring that
 * payouts are handled securely and reliably without manual intervention.
 */

// =========================================================================
// 1. External Library Imports & Configuration
// =========================================================================
import betterSqlite3 from 'better-sqlite3';
import { sendTransaction } from './wallet.js';
import 'dotenv/config'; // Loads environment variables from a .env file

/**
 * Retrieves configuration from environment variables. This makes the engine
 * highly configurable without changing the source code.
 * @returns {object} The engine's configuration.
 */
function getConfig() {
    return {
        databasePath: process.env.DB_PATH || 'bwaezi_backend.db',
        payoutInterval: parseInt(process.env.PAYOUT_INTERVAL_MS, 10) || 5000,
    };
}

const config = getConfig();

// =========================================================================
// 2. Class Definition
// =========================================================================
class AutonomousAIEngine {
    constructor(engineConfig) {
        this.config = engineConfig;
        this.db = null;
        console.log("Autonomous AI Engine initialized.");
    }

    /**
     * Initializes the database connection and ensures the necessary table exists.
     */
    async initializeDatabase() {
        try {
            // Use a long-lived connection. The database file path is now configurable.
            this.db = new betterSqlite3(this.config.databasePath);
            console.log(`[ENGINE] Connected to database at: ${this.config.databasePath}`);
            
            // Create the payouts table if it doesn't already exist.
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
            console.log("[ENGINE] Payouts table verified.");
        } catch (error) {
            console.error("[ENGINE] Failed to connect to the database:", error.message);
            throw error;
        }
    }

    /**
     * Starts the engine, setting up a recurring job to process payouts.
     */
    async start() {
        try {
            await this.initializeDatabase();
            console.log(`[ENGINE] Engine started. Processing payouts every ${this.config.payoutInterval / 1000} seconds.`);

            // Use setInterval to periodically check for new payouts.
            setInterval(() => {
                this.processPayouts();
            }, this.config.payoutInterval);

        } catch (error) {
            console.error("[ENGINE] Failed to start the engine:", error);
        }
    }

    /**
     * The main processing function that fetches and handles pending payouts.
     */
    async processPayouts() {
        if (!this.db) {
            console.error("[ENGINE] Database connection not established. Skipping processing.");
            return;
        }

        try {
            // 1. Select all pending payouts from the queue.
            const pendingPayouts = this.db.prepare("SELECT * FROM payouts WHERE status = 'pending'").all();

            if (pendingPayouts.length === 0) {
                console.log("[ENGINE] No pending payouts to process.");
                return;
            }

            console.log(`[ENGINE] Found ${pendingPayouts.length} pending payouts. Beginning processing...`);

            // 2. Process each pending payout sequentially to ensure order.
            for (const payout of pendingPayouts) {
                try {
                    console.log(`[ENGINE] Processing payout ID ${payout.id} for recipient: ${payout.recipient}`);

                    // Send the transaction using the secure wallet utility.
                    const txHash = await sendTransaction(payout.recipient, payout.amount.toString());

                    // 3. If the transaction is successful, update the database record.
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

    /**
     * Closes the database connection gracefully.
     */
    shutdown() {
        if (this.db) {
            this.db.close();
            console.log('[ENGINE] Database connection closed.');
        }
    }
}

// =========================================================================
// 3. Engine Startup
// =========================================================================

/**
 * Main application entry point.
 */
async function main() {
    const engine = new AutonomousAIEngine(config);
    await engine.start();

    // Set up graceful shutdown handlers
    const shutdownHandler = () => {
        console.log('Shutting down engine...');
        engine.shutdown();
        process.exit(0);
    };

    process.on('SIGINT', shutdownHandler);
    process.on('SIGTERM', shutdownHandler);
}

main();
