import betterSqlite3 from 'better-sqlite3-multiple-ciphers'; // Use fork for encryption support
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createHash, randomBytes } from 'crypto';
import EventEmitter from 'events';
import { Mutex } from 'async-mutex';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Custom Errors & Utilities from BrianNwaezikeDB
class DatabaseError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}

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

// ShardManager adapted and enhanced from BrianNwaezikeDB
class ShardManager {
  constructor(basePath, numberOfShards, encryptionKey = null) {
    this.basePath = basePath;
    this.numberOfShards = numberOfShards;
    this.shards = [];
    this.mutex = new Mutex();
    this.encryptionKey = encryptionKey;
  }

  async init() {
    return this.mutex.runExclusive(async () => {
      if (this.shards.length > 0) return; // Already initialized

      for (let i = 0; i < this.numberOfShards; i++) {
        const shardPath = `${this.basePath}/shard_${i}.db`;
        const db = new betterSqlite3(shardPath);
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        db.pragma('foreign_keys = ON');
        db.pragma('secure_delete = ON');
        db.pragma('auto_vacuum = INCREMENTAL');

        if (this.encryptionKey) {
          db.pragma(`cipher='sqlcipher'`);
          db.pragma(`key='${this.encryptionKey}'`);
        }

        this.shards.push(db);
      }
      console.log(`[SHARD-MANAGER] Initialized ${this.numberOfShards} shards with encryption: ${!!this.encryptionKey}.`);
    });
  }

  getShard(shardingKey) {
    if (!shardingKey) {
      throw new DatabaseError("Sharding key is required for this operation.");
    }
    const hash = createHash('sha256').update(shardingKey).digest('hex');
    const index = parseInt(hash.substring(0, 8), 16) % this.numberOfShards;
    return this.shards[index];
  }

  async close() {
    return this.mutex.runExclusive(() => {
      this.shards.forEach(db => {
        if (db?.open) {
          db.close();
        }
      });
      console.log("[SHARD-MANAGER] All shards closed.");
      this.shards = [];
    });
  }
}

// Enterprise-grade error classes (existing)
class ConnectionError extends DatabaseError {
  constructor(message) {
    super(message, 'CONNECTION_ERROR');
  }
}

class QueryError extends DatabaseError {
  constructor(message) {
    super(message, 'QUERY_ERROR');
  }
}

class CacheError extends DatabaseError {
  constructor(message) {
    super(message, 'CACHE_ERROR');
  }
}

class PubSubError extends DatabaseError {
  constructor(message) {
    super(message, 'PUBSUB_ERROR');
  }
}

// PerformanceMonitor (existing, with enhancements)
class PerformanceMonitor {
  constructor(db) {
    this.db = db;
    this.metrics = {
      queryTimes: [],
      transactionTimes: [],
      pubSubMetrics: [],
      cacheMetrics: []
    };
  }

  async init() {
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS _performance_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        value REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        metadata TEXT
      )
    `);
    // Additional init for other tables omitted for brevity, assume existing
  }

  async recordMetric(type, name, value, metadata = null) {
    this.metrics[type].push(value);
    if (this.metrics[type].length > 1000) {
      this.metrics[type].shift();
    }

    try {
      await this.db.run(
        'INSERT INTO _performance_metrics (metric_type, metric_name, value, metadata) VALUES (?, ?, ?, ?)',
        [type, name, value, metadata ? JSON.stringify(metadata) : null]
      );
    } catch (error) {
      console.warn('Failed to record metric:', error.message);
    }
  }

  async getPerformanceStats(timeRange = '24 hours') {
    const stats = await this.db.all(`
      SELECT 
        metric_type,
        metric_name,
        AVG(value) as avg_value,
        MIN(value) as min_value,
        MAX(value) as max_value,
        COUNT(*) as sample_count
      FROM _performance_metrics 
      WHERE timestamp >= datetime('now', ?)
      GROUP BY metric_type, metric_name
      ORDER BY metric_type, avg_value DESC
    `, [`-${timeRange}`]);

    return stats;
  }
}

// SQLitePubSub (existing, assume full)
class SQLitePubSub extends EventEmitter {
  // Full implementation as provided, with processQueue fixed for processed count
  async processQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) return;

    this.isProcessing = true;
    const startTime = Date.now();
    let processedCount = 0;

    try {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        await this.deliverMessage(message);
        processedCount++;
      }
    } catch (error) {
      console.error('Message processing error:', error);
    } finally {
      this.isProcessing = false;
      
      const duration = Date.now() - startTime;
      await this.performanceMonitor.recordMetric('pubSubMetrics', 'process_time', duration, {
        processedCount
      });
    }
  }

  // Other methods as provided
}

// SQLiteCache (existing, assume full)

// Enhanced ArielSQLiteEngine with sharding and encryption
export class ArielSQLiteEngine {
  constructor(options = {}) {
    this.options = {
      path: process.env.DB_PATH || './data/ariel.db',
      readonly: process.env.DB_READONLY === 'true' || false,
      timeout: parseInt(process.env.DB_TIMEOUT) || 5000,
      verbose: process.env.DB_VERBOSE === 'true' || false,
      wal: process.env.DB_WAL === 'true' || true,
      journalMode: process.env.DB_JOURNAL_MODE || 'WAL',
      cacheSize: parseInt(process.env.DB_CACHE_SIZE) || -2000,
      busyTimeout: parseInt(process.env.DB_BUSY_TIMEOUT) || 30000,
      enablePubSub: process.env.ENABLE_PUBSUB !== 'false',
      enableCache: process.env.ENABLE_CACHE !== 'false',
      enableMonitoring: process.env.ENABLE_MONITORING !== 'false',
      encryptionKey: process.env.DB_ENCRYPTION_KEY || null, // New: Encryption key
      numberOfShards: parseInt(process.env.DB_SHARDS) || 1, // New: Sharding support
      ...options
    };

    this.masterDB = null; // For meta tables
    this.shardManager = null; // For sharded data
    this.isInitialized = false;
    this.connectionId = null;
    this.preparedStatements = new Map();
    this.transactionDepth = 0;
    this.lastBackupTime = 0;
    
    this.performanceMonitor = new PerformanceMonitor(this); // Will use masterDB
    this.pubSub = this.options.enablePubSub ? new SQLitePubSub(this, this.performanceMonitor) : null;
    this.cache = this.options.enableCache ? new SQLiteCache(this, this.performanceMonitor) : null;
  }

  async init() {
    if (this.isInitialized) return;

    try {
      console.log('🗄️ Initializing Enhanced Ariel SQLite Engine with sharding and encryption...');

      const dataDir = path.dirname(this.options.path);
      await fs.mkdir(dataDir, { recursive: true });

      await retryWithBackoff(async () => {
        // Init master DB for meta
        this.masterDB = new betterSqlite3(this.options.path);
        await this.configureDatabase(this.masterDB);

        if (this.options.encryptionKey) {
          this.masterDB.pragma(`cipher='sqlcipher'`);
          this.masterDB.pragma(`key='${this.options.encryptionKey}'`);
        }

        // Init shards if enabled
        if (this.options.numberOfShards > 1) {
          this.shardManager = new ShardManager(
            dataDir,
            this.options.numberOfShards,
            this.options.encryptionKey
          );
          await this.shardManager.init();
        }

        // Test connection
        await this.testConnection();

        // Initialize enhanced features on master
        await this.performanceMonitor.init();
        if (this.pubSub) await this.pubSub.init();
        if (this.cache) await this.cache.init();

        // Initialize schema for Bwaezi (users and transactions) on shards or master
        await initializeSchema(this);

        this.connectionId = randomBytes(8).toString('hex');
        this.isInitialized = true;

        console.log('✅ Enhanced Ariel SQLite Engine initialized successfully');
      }, 3, 1000);

      this.startBackgroundMaintenance();

    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw new ConnectionError(`Database initialization failed: ${error.message}`);
    }
  }

  // Helper to get DB for operation
  _getDBForOperation(shardingKey = null) {
    if (this.shardManager && shardingKey) {
      return this.shardManager.getShard(shardingKey);
    }
    return this.masterDB;
  }

  // Enhanced query methods with sharding support
  async run(sql, params = [], options = {}) {
    this._ensureInitialized();

    const db = this._getDBForOperation(options.shardingKey);
    const startTime = Date.now();
    const queryId = createHash('sha256').update(sql).digest('hex').substring(0, 16);

    try {
      let statement = this.preparedStatements.get(sql);
      if (!statement) {
        statement = db.prepare(sql);
        this.preparedStatements.set(sql, statement);
      }

      const result = statement.run(...params);
      const duration = Date.now() - startTime;

      await this.performanceMonitor.recordMetric('queryTimes', 'query_time', duration, {
        queryId,
        sql: sql.substring(0, 200),
        params: params.length > 0 ? params : undefined,
        type: 'run',
        sharded: !!options.shardingKey
      });

      if (options.logging !== false) {
        console.debug(`📊 Query executed: ${sql.substring(0, 100)}...`, {
          queryId,
          duration: `${duration}ms`,
          params: params.length > 0 ? params : undefined
        });
      }

      return {
        lastID: result.lastInsertRowid,
        changes: result.changes,
        queryId,
        duration
      };

    } catch (error) {
      // Error handling as existing
      const duration = Date.now() - startTime;
      await this.performanceMonitor.recordMetric('queryTimes', 'query_time', duration, {
        queryId,
        sql: sql.substring(0, 200),
        params: params.length > 0 ? params : undefined,
        type: 'run',
        error: error.message
      });

      throw new QueryError(`Query execution failed: ${error.message}`);
    }
  }

  // Similar enhancements for get, all, getWithCache, allWithCache
  // Assume similar for brevity, add shardingKey in options, use _getDBForOperation

  // Transaction with sharding note: transactions are per DB, so if sharded, user must handle distributed tx
  // For simplicity, transactions on master unless specified

  async transaction(callback, options = {}) {
    this._ensureInitialized();

    const db = this._getDBForOperation(options.shardingKey);
    // Rest as existing, using db instead of this.db
  }

  // Backup: backup master and all shards
  async backup(backupPath = null) {
    this._ensureInitialized();

    const now = Date.now();
    if (now - this.lastBackupTime < 3600000) {
      console.warn('⚠️ Backup cooldown active, skipping');
      return;
    }

    const backupDir = backupPath || `./backups/ariel-backup-${now}`;
    try {
      await fs.mkdir(backupDir, { recursive: true });

      // Backup master
      const masterBackup = `${backupDir}/master.db`;
      await this.masterDB.backup(masterBackup);

      // Backup shards if exist
      if (this.shardManager) {
        for (let i = 0; i < this.shardManager.numberOfShards; i++) {
          const shardBackup = `${backupDir}/shard_${i}.db`;
          await this.shardManager.shards[i].backup(shardBackup);
        }
      }

      this.lastBackupTime = now;
      console.log(`✅ Backup completed to: ${backupDir}`);
      return backupDir;

    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      throw new DatabaseError(`Backup failed: ${error.message}`);
    }
  }

  // Maintenance: run on master and all shards
  async maintenance() {
    const startTime = Date.now();
    try {
      // Run on master
      this.masterDB.pragma('optimize');
      this.masterDB.pragma('incremental_vacuum(100)');

      // Run on shards
      if (this.shardManager) {
        for (const shard of this.shardManager.shards) {
          shard.pragma('optimize');
          shard.pragma('incremental_vacuum(100)');
        }
      }

      // Cleanup old metrics on master
      await this.masterDB.run(
        'DELETE FROM _performance_metrics WHERE timestamp < datetime("now", "-7 days")'
      );

      const duration = Date.now() - startTime;
      console.log('✅ Database maintenance completed');

    } catch (error) {
      console.warn('⚠️ Database maintenance failed:', error.message);
    }
  }

  // Close: close master and shards
  async close() {
    if (this.masterDB) {
      try {
        this.preparedStatements.clear();
        await this.maintenance();
        this.masterDB.close();
        if (this.shardManager) await this.shardManager.close();
        this.isInitialized = false;
        console.log('✅ Database connection closed gracefully');
      } catch (error) {
        console.error('❌ Error closing database:', error);
      }
    }
  }

  // Other methods adapted similarly
  async configureDatabase(db) {
    db.pragma(`journal_mode = ${this.options.journalMode}`);
    db.pragma(`cache_size = ${this.options.cacheSize}`);
    db.pragma(`busy_timeout = ${this.options.busyTimeout}`);
    db.pragma('foreign_keys = ON');
    db.pragma('synchronous = NORMAL');
    db.pragma('temp_store = MEMORY');
    db.pragma('page_size = 4096');
    db.pragma('auto_vacuum = INCREMENTAL');
  }

  // Schema initialization from previous enhancement, adapted for sharding
  async initializeSchema() {
    const queries = [
      {
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            address TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `,
        params: []
      },
      {
        sql: `
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            tx_hash TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `,
        params: []
      }
    ];

    if (this.shardManager) {
      for (const shard of this.shardManager.shards) {
        for (const query of queries) {
          await retryWithBackoff(() => shard.prepare(query.sql).run(query.params));
        }
      }
    } else {
      for (const query of queries) {
        await retryWithBackoff(() => this.masterDB.prepare(query.sql).run(query.params));
      }
    }
    console.log("Database schema initialized successfully on all shards/master");
  }

  // Add methods from BrianNwaezikeDB if needed, like addTransactionJob
  async addTransactionJob(recipientAddress, amount) {
    const jobId = recipientAddress + '-' + Date.now();
    await this.run(
      'INSERT INTO transactions (id, recipient, amount, status) VALUES (?, ?, ?, ?)',
      [jobId, recipientAddress, amount, 'pending'],
      { shardingKey: recipientAddress }
    );
    console.log(`[DB] New transaction job added for recipient: ${recipientAddress}`);
  }

  // Similarly for other specific methods
}

// Export classes
export { DatabaseError, ConnectionError, QueryError, CacheError, PubSubError };
export default ArielSQLiteEngine;
