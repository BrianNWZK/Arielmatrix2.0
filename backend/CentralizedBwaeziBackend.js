/**
 * CentralizedBwaeziBackend.js
 *
 * This is the ultimate, limitless, and production-ready core server.
 * It operates as a resilient job processor that fetches tasks from a
 * a database queue and orchestrates their completion.
 */

// =========================================================================
// 1. Internal Module Imports & Configuration
// =========================================================================
import 'dotenv/config'; // Loads environment variables
import { BrianNwaezikeDB } from './database/BrianNwaezikeDB.js';
import { sendTransactionForJob } from './agents/wallet.js';

/**
 * Retrieves configuration from environment variables.
 * This ensures the application is not hardcoded with paths or intervals.
 */
function getConfig() {
    return {
        database: {
            path: process.env.DB_DATA_PATH || './data',
            numberOfShards: parseInt(process.env.DB_SHARDS, 10) || 4
        },
        pollingInterval: parseInt(process.env.POLLING_INTERVAL, 10) || 5000,
    };
}

const config = getConfig();

// Create a unified database instance with sharding enabled.
const bwaeziDB = new BrianNwaezikeDB(config);

// =========================================================================
// 2. Main Job Processor Loop
// =========================================================================

/**
 * The main application loop that processes transaction jobs.
 * This loop continuously polls the database for pending jobs.
 */
async function runJobProcessor() {
    console.log('[BACKEND] Starting job processor...');

    while (true) {
        try {
            // Fetch all pending jobs from the database.
            const pendingJobs = await bwaeziDB.getPendingJobs();
            
            if (pendingJobs.length > 0) {
                console.log(`[BACKEND] Found ${pendingJobs.length} new jobs to process.`);
                
                // Process each job sequentially to avoid overloading the network.
                for (const job of pendingJobs) {
                    try {
                        // Use await to ensure each job is processed before moving to the next.
                        const result = await sendTransactionForJob(job);
                        
                        if (result.success) {
                            console.log(`[BACKEND] Successfully processed job ID ${job.id}.`);
                            // Update job status in the database to 'completed'
                            await bwaeziDB.updateJobStatus(job.id, 'completed');
                        } else {
                            console.error(`[BACKEND] Failed to process job ID ${job.id}: ${result.error}`);
                            // Optionally, update job status to 'failed' or 'retry'
                            await bwaeziDB.updateJobStatus(job.id, 'failed');
                        }
                    } catch (jobError) {
                        console.error(`[BACKEND] An error occurred while processing job ID ${job.id}:`, jobError);
                        await bwaeziDB.updateJobStatus(job.id, 'failed');
                    }
                }
            } else {
                console.log('[BACKEND] No pending jobs found. Waiting...');
            }
        } catch (error) {
            console.error('[BACKEND] An error occurred in the main loop:', error);
        }

        // Wait for the next polling interval, retrieved from the environment variables.
        await new Promise(resolve => setTimeout(resolve, config.pollingInterval));
    }
}

// =========================================================================
// 3. Application Entry Point
// =========================================================================

/**
 * This is the application's entry point. It sets up the environment
 * and starts the main processing loop.
 */
async function main() {
    try {
        await bwaeziDB.init();
        runJobProcessor();
    } catch (error) {
        console.error('[BACKEND] Application failed to start:', error);
        process.exit(1);
    }
}

// Start the application.
main();
