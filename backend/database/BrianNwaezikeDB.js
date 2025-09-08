/**
 * @fileoverview BrianNwaezikeDB: A unified, autonomous database service that
 * integrates a practical sharding mechanism for scalability.
 * This file consolidates all core database components into a single, cohesive unit.
 *
 * This version contains no mocks, placeholders, or simulations.
 *
 * @author Brian Nwaezike
 */

import betterSqlite3 from 'better-sqlite3';
import { Mutex } from 'async-mutex';
import { existsSync, mkdirSync } from 'fs';
import crypto from 'crypto';

// =========================================================================
// 1. Custom Errors & Utilities
// =========================================================================
export class DatabaseError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

/**
 * Retries a function with exponential backoff.
 * @param {Function} fn - The function to retry.
 * @param {number} [retries=5] - The number of retries.
 * @param {number} [delay=1000] - The initial delay in milliseconds.
 * @param {string} [errorMsg='Operation failed'] - Custom error message.
 * @returns {Promise<any>}
 */
async function retryWithBackoff(fn, retries = 5, delay = 1000, errorMsg = 'Operation failed') {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) {
      throw new DatabaseError(`${errorMsg}: Maximum retries exceeded.`, error);
    }
    console.warn(`[DB-RETRY] Attempt failed. Retrying in ${delay}ms...`, error);
    await new Promise(res => setTimeout(res, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2, errorMsg);
  }
}

/**
 * ShardManager: A practical class that routes queries to different database
 * shards based on a deterministic hashing algorithm.
 */
class ShardManager {
  constructor(basePath, numberOfShards) {
    this.basePath = basePath;
    this.numberOfShards = numberOfShards;
    this.shards = [];
    this.mutex = new Mutex();
  }

  async init() {
    return this.mutex.runExclusive(() => {
      if (this.shards.length > 0) return; // Already initialized

      for (let i = 0; i < this.numberOfShards; i++) {
        const path = `${this.basePath}/shard_${i}.db`;
        const db = new betterSqlite3(path);
        db.pragma('journal_mode = WAL');
        this.shards.push(db);
      }
      console.log(`[SHARD-MANAGER] Initialized ${this.numberOfShards} shards.`);
    });
  }

  /**
   * Routes a query to the correct shard.
   * A real implementation might parse the query to find a sharding key,
   * but for a transaction queue, we can shard based on the recipient's address.
   * @param {string} query The SQL query.
   * @param {string} shardingKey The key to use for sharding (e.g., recipient address).
   * @returns {object} The database instance for the correct shard.
   */
  getShard(shardingKey) {
    if (!shardingKey) {
      throw new DatabaseError("Sharding key is required for this operation.");
    }
    const hash = crypto.createHash('sha256').update(shardingKey).digest('hex');
    const index = parseInt(hash.substring(0, 8), 16) % this.numberOfShards;
    return this.shards[index];
  }

  async close() {
    return this.mutex.runExclusive(() => {
      this.shards.forEach(db => {
        if (db && db.open) {
          db.close();
        }
      });
      console.log("[SHARD-MANAGER] All shards closed.");
      this.shards = [];
    });
  }
}

// =========================================================================
// 2. The Core BrianNwaezikeDB Wrapper
// =========================================================================
/**
 * BrianNwaezikeDB: A unified wrapper for database operations,
 * providing a reliable transaction queue.
 */
export class BrianNwaezikeDB {
  constructor(config) {
    this.config = config;
    this.shardManager = null;
  }

  async init() {
    console.log('Initializing BrianNwaezikeDB...');
    
    const dataDir = './data';
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir);
    }
    
    this.shardManager = new ShardManager(
      this.config.database.path,
      this.config.database.numberOfShards
    );
    await this.shardManager.init();
    
    await this.initializeTransactionTable();
    console.log('Database initialized successfully.');
  }
  
  /**
   * Initializes the `transactions` table on all shards.
   */
  async initializeTransactionTable() {
    for (const shard of this.shardManager.shards) {
      await retryWithBackoff(() => shard.prepare(`
        CREATE TABLE IF NOT EXISTS transactions (
          id TEXT PRIMARY KEY,
          recipient TEXT NOT NULL,
          amount TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending', 'sent', 'failed')),
          tx_hash TEXT,
          retries INTEGER DEFAULT 0
        )
      `).run());
    }
    console.log('[DB] Transactions table initialized on all shards.');
  }

  /**
   * Executes a read/write operation on the correct shard.
   * @param {string} shardingKey - The key to route the operation.
   * @param {string} sql - The SQL query.
   * @param {Array} params - The query parameters.
   */
  async runOnShard(shardingKey, sql, params = []) {
    const shard = this.shardManager.getShard(shardingKey);
    return retryWithBackoff(() => shard.prepare(sql).run(params));
  }

  async getOnShard(shardingKey, sql, params = []) {
    const shard = this.shardManager.getShard(shardingKey);
    return retryWithBackoff(() => shard.prepare(sql).get(params));
  }

  async allOnShard(shardingKey, sql, params = []) {
    const shard = this.shardManager.getShard(shardingKey);
    return retryWithBackoff(() => shard.prepare(sql).all(params));
  }

  /**
   * Adds a new transaction job to the queue.
   * @param {string} recipientAddress - The public address of the recipient.
   * @param {string} amount - The amount of Ether to send, as a string.
   */
  async addTransactionJob(recipientAddress, amount) {
    const jobId = recipientAddress + '-' + Date.now();
    await this.runOnShard(
      recipientAddress,
      'INSERT INTO transactions (id, recipient, amount, status) VALUES (?, ?, ?, ?)',
      [jobId, recipientAddress, amount, 'pending']
    );
    console.log(`[DB] New transaction job added for recipient: ${recipientAddress}`);
  }

  /**
   * Retrieves all pending transaction jobs from all shards.
   * @returns {Promise<Array>} An array of pending transaction job objects.
   */
  async getPendingJobs() {
    let allJobs = [];
    for (const shard of this.shardManager.shards) {
      const jobs = await retryWithBackoff(() => shard.prepare('SELECT * FROM transactions WHERE status = ?').all(['pending']));
      allJobs.push(...jobs);
    }
    return allJobs;
  }

  /**
   * Updates the status of a transaction job.
   * @param {string} jobId - The ID of the transaction job.
   * @param {string} status - The new status ('sent' or 'failed').
   * @param {string} [txHash] - The transaction hash, if applicable.
   */
  async updateJobStatus(jobId, recipient, status, txHash = null) {
    await this.runOnShard(
      recipient,
      'UPDATE transactions SET status = ?, tx_hash = ? WHERE id = ?',
      [status, txHash, jobId]
    );
    console.log(`[DB] Job ${jobId} status updated to: ${status}`);
  }
  
  /**
   * Increments the retry count for a failed transaction job.
   * @param {string} jobId - The ID of the transaction job.
   * @param {string} recipient - The recipient address to route the update.
   */
  async incrementRetries(jobId, recipient) {
    await this.runOnShard(
      recipient,
      'UPDATE transactions SET retries = retries + 1 WHERE id = ?',
      [jobId]
    );
    console.log(`[DB] Job ${jobId} retry count incremented.`);
  }

  async close() {
    await this.shardManager.close();
    console.log('BrianNwaezikeDB services closed.');
  }
}
