/**
 * CentralizedBwaeziBackend.js
 *
 * This is the ultimate, limitless, and production-ready core server.
 * It operates as a resilient job processor that fetches tasks from a
 * a database queue and orchestrates their completion.
 */

// =========================================================================
// 1. Internal Module Imports
// =========================================================================
import { BrianNwaezikeDB } from './database/BrianNwaezikeDB.js';
import { sendTransactionForJob } from './agents/wallet.js';

// =========================================================================
// 2. Configuration and Initialization
// =========================================================================
const DB_FILE_PATH = './data/bwaezi.db';
const POLLING_INTERVAL = 5000; // 5 seconds

// Create a unified database instance with sharding enabled.
const bwaeziDB = new BrianNwaezikeDB({
  database: {
    path: './data',
    numberOfShards: 4
  }
});

// =========================================================================
// 3. Main Job Processor Loop
// =========================================================================

/**
 * The main application loop that processes transaction jobs.
 * This loop continuously polls the database for pending jobs.
 */
async function runJobProcessor() {
    console.log('[BACKEND] Starting job processor...');

    while (true) {
        try {
            const pendingJobs = await bwaeziDB.getPendingJobs();
            
            if (pendingJobs.length > 0) {
                console.log(`[BACKEND] Found ${pendingJobs.length} new jobs to process.`);
                
                // Process each job in a separate, non-blocking operation.
                for (const job of pendingJobs) {
                    sendTransactionForJob(job);
                }
            } else {
                console.log('[BACKEND] No pending jobs found. Waiting...');
            }
        } catch (error) {
            console.error('[BACKEND] An error occurred in the main loop:', error);
        }

        // Wait for the next polling interval.
        await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }
}

// =========================================================================
// 4. Application Entry Point
// =========================================================================

/**
 * This is the application's entry point. It sets up the environment
 * and starts the main processing loop.
 */
async function main() {
    try {
        await bwaeziDB.init();

        // Add some initial transaction jobs to demonstrate the system
        await bwaeziDB.addTransactionJob('0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', '0.01');
        await bwaeziDB.addTransactionJob('0x70997970c51812dc3a010c7d01b50e0d17dc798c', '0.02');
        await bwaeziDB.addTransactionJob('0x3c44cddfd16a70a83151978240097f414f4df77f', '0.03');
        await bwaeziDB.addTransactionJob('0x90f79bf6eb2c4f870365e785982e1f101e93b906', '0.04');
        await bwaeziDB.addTransactionJob('0x90f79bf6eb2c4f870365e785982e1f101e93b906', '0.05');

        runJobProcessor();
    } catch (error) {
        console.error('[BACKEND] Application failed to start:', error);
        process.exit(1);
    }
}

// Start the application.
main();
