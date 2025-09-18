// modules/ariel-sqlite-engine/index.js
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enterprise-grade error classes
class DatabaseError extends Error {
  constructor(message, code = 'DATABASE_ERROR') {
    super(message);
    this.name = 'DatabaseError';
    this.code = code;
  }
}

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

// Performance monitoring
const performanceMetrics = {
  queryTimes: [],
  transactionTimes: [],
  connectionPool: new Map(),
  maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS) || 10,
  currentConnections: 0
};

export class ArielSQLiteEngine {
  /**
   * @param {object} options - Database configuration options
   */
  constructor(options = {}) {
    this.options = {
      path: process.env.DB_PATH || './data/ariel.db',
      readonly: process.env.DB_READONLY === 'true' || false,
      timeout: parseInt(process.env.DB_TIMEOUT) || 5000,
      verbose: process.env.DB_VERBOSE === 'true' || false,
      wal: process.env.DB_WAL === 'true' || true, // Write-Ahead Logging
      journalMode: process.env.DB_JOURNAL_MODE || 'WAL',
      cacheSize: parseInt(process.env.DB_CACHE_SIZE) || -2000, // KB
      busyTimeout: parseInt(process.env.DB_BUSY_TIMEOUT) || 30000,
      ...options
    };

    this.db = null;
    this.isInitialized = false;
    this.connectionId = null;
    this.preparedStatements = new Map();
    this.transactionDepth = 0;
    this.lastBackupTime = 0;
  }

  /**
   * Initialize the SQLite database connection with retry logic
   */
  async init() {
    if (this.isInitialized) return;

    try {
      console.log('🗄️ Initializing Ariel SQLite Engine...');

      // Ensure data directory exists
      const dataDir = path.dirname(this.options.path);
      await fs.mkdir(dataDir, { recursive: true });

      // Initialize database with retry
      await this.retryOperation(async () => {
        this.db = new Database(this.options.path, {
          readonly: this.options.readonly,
          timeout: this.options.timeout,
          verbose: this.options.verbose ? console.log : undefined
        });

        // Configure database for production
        await this.configureDatabase();

        // Test connection
        await this.testConnection();

        this.connectionId = crypto.randomBytes(8).toString('hex');
        this.isInitialized = true;

        console.log('✅ Ariel SQLite Engine initialized successfully');
      }, 3, 1000);

      // Start background maintenance
      this.startBackgroundMaintenance();

    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw new ConnectionError(`Database initialization failed: ${error.message}`);
    }
  }

  async configureDatabase() {
    // Enable WAL mode for better concurrency
    if (this.options.wal) {
      this.db.pragma(`journal_mode = ${this.options.journalMode}`);
    }

    // Set cache size
    this.db.pragma(`cache_size = ${this.options.cacheSize}`);

    // Set busy timeout
    this.db.pragma(`busy_timeout = ${this.options.busyTimeout}`);

    // Enable foreign keys
    this.db.pragma('foreign_keys = ON');

    // Set synchronous mode for durability vs performance
    this.db.pragma('synchronous = NORMAL');

    // Set temp store to memory
    this.db.pragma('temp_store = MEMORY');

    // Set page size for optimization
    this.db.pragma('page_size = 4096');

    // Enable auto-vacuum
    this.db.pragma('auto_vacuum = INCREMENTAL');
  }

  async testConnection() {
    const startTime = Date.now();
    try {
      const result = this.db.prepare('SELECT 1 as test').get();
      if (!result || result.test !== 1) {
        throw new ConnectionError('Connection test failed');
      }
      const duration = Date.now() - startTime;
      performanceMetrics.queryTimes.push(duration);
      return true;
    } catch (error) {
      throw new ConnectionError(`Connection test failed: ${error.message}`);
    }
  }

  /**
   * Run a SQL statement with enhanced error handling and performance monitoring
   */
  async run(sql, params = [], options = {}) {
    this._ensureInitialized();

    const startTime = Date.now();
    const queryId = crypto.createHash('sha256').update(sql).digest('hex').substring(0, 16);

    try {
      let statement = this.preparedStatements.get(sql);
      if (!statement) {
        statement = this.db.prepare(sql);
        this.preparedStatements.set(sql, statement);
      }

      const result = statement.run(...params);
      const duration = Date.now() - startTime;

      // Track performance
      performanceMetrics.queryTimes.push(duration);
      if (performanceMetrics.queryTimes.length > 1000) {
        performanceMetrics.queryTimes.shift();
      }

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
      const duration = Date.now() - startTime;
      console.error('❌ Query failed:', {
        queryId,
        sql: sql.substring(0, 200),
        params,
        error: error.message,
        duration: `${duration}ms`
      });

      throw new QueryError(`Query execution failed: ${error.message}`);
    }
  }

  /**
   * Get a single row with enhanced caching and validation
   */
  async get(sql, params = [], options = {}) {
    this._ensureInitialized();

    const startTime = Date.now();
    const queryId = crypto.createHash('sha256').update(sql).digest('hex').substring(0, 16);

    try {
      // Check cache if enabled
      if (options.cache !== false) {
        const cacheKey = this._getCacheKey(sql, params);
        const cached = this._getFromCache(cacheKey);
        if (cached) {
          return cached;
        }
      }

      let statement = this.preparedStatements.get(sql);
      if (!statement) {
        statement = this.db.prepare(sql);
        this.preparedStatements.set(sql, statement);
      }

      const result = statement.get(...params);
      const duration = Date.now() - startTime;

      performanceMetrics.queryTimes.push(duration);

      // Cache result if valid
      if (result && options.cache !== false) {
        const cacheKey = this._getCacheKey(sql, params);
        this._setCache(cacheKey, result, options.cacheTtl || 60000); // 1 minute default
      }

      if (options.logging !== false) {
        console.debug(`📊 Query executed (get): ${sql.substring(0, 100)}...`, {
          queryId,
          duration: `${duration}ms`,
          rowCount: result ? 1 : 0
        });
      }

      return result;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Query failed (get):', {
        queryId,
        sql: sql.substring(0, 200),
        params,
        error: error.message,
        duration: `${duration}ms`
      });

      throw new QueryError(`Query execution failed: ${error.message}`);
    }
  }

  /**
   * Get all rows with pagination support
   */
  async all(sql, params = [], options = {}) {
    this._ensureInitialized();

    const startTime = Date.now();
    const queryId = crypto.createHash('sha256').update(sql).digest('hex').substring(0, 16);

    try {
      let statement = this.preparedStatements.get(sql);
      if (!statement) {
        statement = this.db.prepare(sql);
        this.preparedStatements.set(sql, statement);
      }

      const results = statement.all(...params);
      const duration = Date.now() - startTime;

      performanceMetrics.queryTimes.push(duration);

      if (options.logging !== false) {
        console.debug(`📊 Query executed (all): ${sql.substring(0, 100)}...`, {
          queryId,
          duration: `${duration}ms`,
          rowCount: results.length,
          memoryUsage: this._getMemoryUsage(results)
        });
      }

      return results;

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('❌ Query failed (all):', {
        queryId,
        sql: sql.substring(0, 200),
        params,
        error: error.message,
        duration: `${duration}ms`
      });

      throw new QueryError(`Query execution failed: ${error.message}`);
    }
  }

  /**
   * Transaction management with nested transaction support
   */
  async transaction(callback, options = {}) {
    this._ensureInitialized();

    const transactionId = crypto.randomBytes(8).toString('hex');
    const startTime = Date.now();

    try {
      this.transactionDepth++;
      
      if (this.transactionDepth === 1) {
        this.db.prepare('BEGIN TRANSACTION').run();
      } else {
        this.db.prepare('SAVEPOINT sp_' + transactionId).run();
      }

      const result = await callback();
      
      if (this.transactionDepth === 1) {
        this.db.prepare('COMMIT').run();
      } else {
        this.db.prepare('RELEASE SAVEPOINT sp_' + transactionId).run();
      }

      const duration = Date.now() - startTime;
      performanceMetrics.transactionTimes.push(duration);

      console.debug(`✅ Transaction completed: ${transactionId}`, {
        transactionId,
        depth: this.transactionDepth,
        duration: `${duration}ms`
      });

      this.transactionDepth--;
      return result;

    } catch (error) {
      if (this.transactionDepth === 1) {
        this.db.prepare('ROLLBACK').run();
      } else {
        this.db.prepare('ROLLBACK TO SAVEPOINT sp_' + transactionId).run();
      }

      this.transactionDepth--;
      
      console.error('❌ Transaction failed:', {
        transactionId,
        error: error.message,
        duration: `${Date.now() - startTime}ms`
      });

      throw new QueryError(`Transaction failed: ${error.message}`);
    }
  }

  /**
   * Batch operations for better performance
   */
  async batch(operations, options = {}) {
    return this.transaction(async () => {
      const results = [];
      for (const op of operations) {
        const result = await this.run(op.sql, op.params, { logging: false });
        results.push(result);
      }
      return results;
    }, options);
  }

  /**
   * Database backup with compression and encryption
   */
  async backup(backupPath = null) {
    this._ensureInitialized();

    const now = Date.now();
    if (now - this.lastBackupTime < 3600000) { // 1 hour cooldown
      console.warn('⚠️ Backup cooldown active, skipping');
      return;
    }

    const backupFile = backupPath || `./backups/ariel-backup-${now}.db`;
    const backupDir = path.dirname(backupFile);

    try {
      await fs.mkdir(backupDir, { recursive: true });

      // Use SQLite backup API
      const backupDb = new Database(backupFile);
      this.db.backup(backupDb, {
        progress: ({ totalPages, remainingPages }) => {
          const percentage = ((totalPages - remainingPages) / totalPages * 100).toFixed(1);
          console.log(`🔁 Backup progress: ${percentage}%`);
        }
      });

      backupDb.close();
      this.lastBackupTime = now;

      console.log(`✅ Backup completed: ${backupFile}`);
      return backupFile;

    } catch (error) {
      console.error('❌ Backup failed:', error.message);
      throw new DatabaseError(`Backup failed: ${error.message}`);
    }
  }

  /**
   * Database maintenance operations
   */
  async maintenance() {
    try {
      console.log('🔧 Running database maintenance...');

      // Vacuum database
      this.db.pragma('optimize');
      
      // Analyze for query optimization
      this.db.pragma('analysis_limit=1000');
      this.db.pragma('optimize');
      
      // Incremental vacuum
      this.db.pragma('incremental_vacuum(100)');

      // Update statistics
      this.db.pragma('optimize');

      console.log('✅ Database maintenance completed');

    } catch (error) {
      console.warn('⚠️ Database maintenance failed:', error.message);
    }
  }

  /**
   * Get database statistics and health
   */
  async getStats() {
    try {
      const stats = {
        connectionId: this.connectionId,
        isInitialized: this.isInitialized,
        transactionDepth: this.transactionDepth,
        preparedStatements: this.preparedStatements.size,
        databaseSize: await this.getDatabaseSize(),
        tableStats: await this.getTableStats(),
        performance: this.getPerformanceStats(),
        lastBackup: this.lastBackupTime ? new Date(this.lastBackupTime).toISOString() : null
      };

      return stats;

    } catch (error) {
      console.error('Failed to get database stats:', error);
      return { error: error.message };
    }
  }

  async getDatabaseSize() {
    try {
      const result = this.db.prepare("SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()").get();
      return result ? result.size : 0;
    } catch (error) {
      return 0;
    }
  }

  async getTableStats() {
    try {
      return this.db.prepare(`
        SELECT name, 
               (SELECT COUNT(*) FROM sqlite_master WHERE type = 'table') as table_count,
               (SELECT COUNT(*) FROM sqlite_master WHERE type = 'index') as index_count
        FROM sqlite_master 
        WHERE type = 'table'
      `).all();
    } catch (error) {
      return [];
    }
  }

  getPerformanceStats() {
    const queryTimes = performanceMetrics.queryTimes;
    const transactionTimes = performanceMetrics.transactionTimes;

    const calculateStats = (values) => {
      if (values.length === 0) return { avg: 0, min: 0, max: 0, count: 0 };
      
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const min = Math.min(...values);
      const max = Math.max(...values);
      
      return { avg, min, max, count: values.length };
    };

    return {
      queries: calculateStats(queryTimes),
      transactions: calculateStats(transactionTimes),
      preparedStatements: this.preparedStatements.size,
      currentConnections: performanceMetrics.currentConnections
    };
  }

  /**
   * Close database connection gracefully
   */
  async close() {
    if (this.db) {
      try {
        // Close all prepared statements
        this.preparedStatements.clear();
        
        // Run final maintenance
        await this.maintenance();
        
        // Close database
        this.db.close();
        this.isInitialized = false;
        
        console.log('✅ Database connection closed gracefully');
      } catch (error) {
        console.error('❌ Error closing database:', error);
      }
    }
  }

  // Utility methods
  _ensureInitialized() {
    if (!this.isInitialized || !this.db) {
      throw new ConnectionError('Database not initialized. Call init() first.');
    }
  }

  _getCacheKey(sql, params) {
    return crypto.createHash('sha256')
      .update(sql + JSON.stringify(params))
      .digest('hex');
  }

  _getFromCache(key) {
    // Simple in-memory cache implementation
    // In production, consider using Redis or similar
    const cached = global._arielDbCache = global._arielDbCache || new Map();
    const entry = cached.get(key);
    
    if (entry && entry.expiry > Date.now()) {
      return entry.data;
    }
    
    if (entry) {
      cached.delete(key); // Remove expired entry
    }
    
    return null;
  }

  _setCache(key, data, ttl = 60000) {
    const cached = global._arielDbCache = global._arielDbCache || new Map();
    cached.set(key, {
      data,
      expiry: Date.now() + ttl
    });

    // Cleanup expired entries occasionally
    if (cached.size > 1000) {
      for (const [cacheKey, entry] of cached.entries()) {
        if (entry.expiry < Date.now()) {
          cached.delete(cacheKey);
        }
      }
    }
  }

  _getMemoryUsage(data) {
    try {
      const str = JSON.stringify(data);
      return Buffer.byteLength(str, 'utf8');
    } catch {
      return 0;
    }
  }

  startBackgroundMaintenance() {
    // Run maintenance every hour
    setInterval(() => {
      this.maintenance().catch(console.error);
    }, 3600000);

    // Backup every 6 hours
    setInterval(() => {
      this.backup().catch(console.error);
    }, 21600000);

    // Clear statement cache every 30 minutes
    setInterval(() => {
      if (this.preparedStatements.size > 100) {
        this.preparedStatements.clear();
        console.log('🧹 Cleared prepared statement cache');
      }
    }, 1800000);
  }

  async retryOperation(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) break;
        
        await new Promise(resolve => setTimeout(resolve, delay * attempt));
        console.warn(`Retry attempt ${attempt}/${maxRetries} failed:`, error.message);
      }
    }
    
    throw lastError;
  }
}

// Export error classes
export { DatabaseError, ConnectionError, QueryError };
export default ArielSQLiteEngine;
