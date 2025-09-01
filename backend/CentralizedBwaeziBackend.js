/**
 * CentralizedBwaeziBackend.js
 *
 * This file contains the core backend server for the Bwaezi ecosystem.
 * It is responsible for receiving payout requests, queuing them for processing,
 * and managing the state of all payouts in a persistent database.
 *
 * Components:
 * - Express.js: Handles incoming API requests.
 * - better-sqlite3: Manages the persistent, local database queue.
 * - Bull: Provides a robust job queueing system built on Redis, ensuring
 * that tasks are handled reliably even if the server restarts.
 *
 * The architecture separates the web server (Express) from the job processing
 * to create a more resilient and scalable system.
 */

// =========================================================================
// 1. External Library Imports
// =========================================================================
import express from 'express';
import betterSqlite3 from 'better-sqlite3';
import cors from 'cors';
import { Queue } from 'bull';
import path from 'path';

// =========================================================================
// 2. Server and Database Initialization
// =========================================================================
const app = express();
const PORT = 3000;

// Use a persistent SQLite database to store payout job data.
const db = new betterSqlite3('bwaezi_backend.db', { verbose: console.log });
console.log("Connected to SQLite database: bwaezi_backend.db");

// Use Bull for a robust job queue, leveraging Redis as the message broker.
const payoutQueue = new Queue('payouts', {
  redis: {
    port: 6379,
    host: '127.0.0.1'
  }
});
console.log("Connected to Redis and Bull queue.");

// =========================================================================
// 3. Middleware and Database Schema Setup
// =========================================================================
app.use(cors()); // Allow cross-origin requests from the client.
app.use(express.json()); // Enable JSON body parsing for API requests.

// Create the payouts table if it doesn't exist. This table acts as our
// persistent log and queue state in case of server restarts.
db.exec(`
  CREATE TABLE IF NOT EXISTS payouts (
    id TEXT PRIMARY KEY,
    recipient TEXT NOT NULL,
    amount REAL NOT NULL,
    status TEXT NOT NULL,
    timestamp TEXT NOT NULL
  );
`);
console.log("Payouts table verified.");

// =========================================================================
// 4. API Endpoints
// =========================================================================

/**
 * Endpoint to add a new payout request to the queue.
 * Client agents (like the one we just created) will call this.
 */
app.post('/payouts/add', async (req, res) => {
  const { recipient, amount } = req.body;
  if (!recipient || typeof amount === 'undefined') {
    return res.status(400).json({ error: 'Recipient and amount are required.' });
  }

  // Generate a unique ID for this payout job.
  const jobId = Date.now().toString();
  const timestamp = new Date().toISOString();

  try {
    // Save the new job to our persistent database immediately.
    const stmt = db.prepare('INSERT INTO payouts (id, recipient, amount, status, timestamp) VALUES (?, ?, ?, ?, ?)');
    stmt.run(jobId, recipient, amount, 'pending', timestamp);
    console.log(`Saved new payout job to DB: ${jobId}`);

    // Add the job to the Bull queue for asynchronous processing.
    await payoutQueue.add({ jobId, recipient, amount, timestamp }, { jobId });
    console.log(`Added new job to Bull queue: ${jobId}`);

    res.status(200).json({
      status: 'success',
      message: 'Payout request received and queued.',
      jobId: jobId
    });
  } catch (error) {
    console.error("Failed to add payout job:", error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to add payout request to queue.',
      error: error.message
    });
  }
});

/**
 * Endpoint to get the current status of all payouts.
 */
app.get('/payouts/status', (req, res) => {
  try {
    const allPayouts = db.prepare('SELECT * FROM payouts ORDER BY timestamp DESC').all();
    res.status(200).json({
      status: 'success',
      message: 'Payout status retrieved successfully.',
      payouts: allPayouts
    });
  } catch (error) {
    console.error("Failed to retrieve payout status:", error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve payout status.',
      error: error.message
    });
  }
});

// =========================================================================
// 5. Job Queue Worker
// =========================================================================

/**
 * The worker function that processes jobs from the payout queue.
 * This simulates a real-world payout operation (e.g., blockchain transaction).
 */
payoutQueue.process(async (job) => {
  const { jobId, recipient, amount } = job.data;
  console.log(`[WORKER] Processing payout job ${jobId}: Sending ${amount} to ${recipient}`);

  try {
    // Simulate a successful payout transaction after a delay.
    // In a real application, this would be where you call a blockchain or
    // payment service API.
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5-second delay.

    // Update the job status in the persistent database.
    const stmt = db.prepare('UPDATE payouts SET status = ? WHERE id = ?');
    stmt.run('completed', jobId);
    console.log(`[WORKER] Payout job ${jobId} completed successfully.`);

  } catch (error) {
    // Handle any failures during the simulated payout.
    const stmt = db.prepare('UPDATE payouts SET status = ? WHERE id = ?');
    stmt.run('failed', jobId);
    console.error(`[WORKER] Payout job ${jobId} failed:`, error);
    throw error; // Bull will handle retrying the failed job.
  }
});

// =========================================================================
// 6. Server Startup
// =========================================================================
app.listen(PORT, () => {
  console.log(`Bwaezi Backend listening on http://localhost:${PORT}`);
});

// Graceful shutdown.
process.on('SIGINT', () => {
  console.log('SIGINT signal received: Closing database and queue.');
  db.close();
  payoutQueue.close();
  process.exit(0);
});
