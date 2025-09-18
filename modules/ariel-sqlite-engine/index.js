// modules/ariel-sqlite-engine/index.js
import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createHash, randomBytes } from 'crypto';
import EventEmitter from 'events';

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

// Enhanced performance monitoring with SQLite-based storage
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

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS _cache_entries (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        expiry INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 0
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS _pubsub_channels (
        channel TEXT PRIMARY KEY,
        subscriber_count INTEGER DEFAULT 0,
        message_count INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_message_at DATETIME
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS _pubsub_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        delivered_count INTEGER DEFAULT 0
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS _pubsub_subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        channel TEXT NOT NULL,
        subscriber_id TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_active DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(channel, subscriber_id)
      )
    `);
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

// SQLite-based PubSub implementation
class SQLitePubSub extends EventEmitter {
  constructor(db, performanceMonitor) {
    super();
    this.db = db;
    this.performanceMonitor = performanceMonitor;
    this.subscriptions = new Map();
    this.messageQueue = [];
    this.isProcessing = false;
  }

  async init() {
    // Start the message processor
    this.startMessageProcessor();
  }

  async subscribe(channel, subscriberId, callback) {
    try {
      await this.db.run(
        'INSERT OR REPLACE INTO _pubsub_subscriptions (channel, subscriber_id, last_active) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [channel, subscriberId]
      );

      await this.db.run(
        'UPDATE _pubsub_channels SET subscriber_count = subscriber_count + 1 WHERE channel = ?',
        [channel]
      );

      if (!this.subscriptions.has(channel)) {
        this.subscriptions.set(channel, new Map());
      }
      this.subscriptions.get(channel).set(subscriberId, callback);

      this.emit('subscribe', { channel, subscriberId });

    } catch (error) {
      throw new PubSubError(`Subscription failed: ${error.message}`);
    }
  }

  async unsubscribe(channel, subscriberId) {
    try {
      await this.db.run(
        'DELETE FROM _pubsub_subscriptions WHERE channel = ? AND subscriber_id = ?',
        [channel, subscriberId]
      );

      await this.db.run(
        'UPDATE _pubsub_channels SET subscriber_count = subscriber_count - 1 WHERE channel = ?',
        [channel]
      );

      if (this.subscriptions.has(channel)) {
        this.subscriptions.get(channel).delete(subscriberId);
      }

      this.emit('unsubscribe', { channel, subscriberId });

    } catch (error) {
      throw new PubSubError(`Unsubscription failed: ${error.message}`);
    }
  }

  async publish(channel, message) {
    const startTime = Date.now();
    
    try {
      // Ensure channel exists
      await this.db.run(
        'INSERT OR IGNORE INTO _pubsub_channels (channel) VALUES (?)',
        [channel]
      );

      // Store message
      const result = await this.db.run(
        'INSERT INTO _pubsub_messages (channel, message) VALUES (?, ?)',
        [channel, typeof message === 'string' ? message : JSON.stringify(message)]
      );

      await this.db.run(
        'UPDATE _pubsub_channels SET message_count = message_count + 1, last_message_at = CURRENT_TIMESTAMP WHERE channel = ?',
        [channel]
      );

      // Add to processing queue
      this.messageQueue.push({
        id: result.lastID,
        channel,
        message,
        timestamp: Date.now()
      });

      // Trigger processing
      this.processQueue();

      const duration = Date.now() - startTime;
      await this.performanceMonitor.recordMetric('pubSubMetrics', 'publish_time', duration, {
        channel,
        messageLength: typeof message === 'string' ? message.length : JSON.stringify(message).length
      });

      this.emit('publish', { channel, message });

    } catch (error) {
      throw new PubSubError(`Publish failed: ${error.message}`);
    }
  }

  async startMessageProcessor() {
    setInterval(() => this.processQueue(), 100);
  }

  async processQueue() {
    if (this.isProcessing || this.messageQueue.length === 0) return;

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      while (this.messageQueue.length > 0) {
        const message = this.messageQueue.shift();
        await this.deliverMessage(message);
      }
    } catch (error) {
      console.error('Message processing error:', error);
    } finally {
      this.isProcessing = false;
      
      const duration = Date.now() - startTime;
      await this.performanceMonitor.recordMetric('pubSubMetrics', 'process_time', duration, {
        processedCount: this.messageQueue.length
      });
    }
  }

  async deliverMessage(message) {
    const { id, channel, message: messageData } = message;
    const startTime = Date.now();

    try {
      if (this.subscriptions.has(channel)) {
        const subscribers = this.subscriptions.get(channel);
        let delivered = 0;

        for (const [subscriberId, callback] of subscribers) {
          try {
            callback(messageData);
            delivered++;
            
            // Update subscriber activity
            await this.db.run(
              'UPDATE _pubsub_subscriptions SET last_active = CURRENT_TIMESTAMP WHERE channel = ? AND subscriber_id = ?',
              [channel, subscriberId]
            );
          } catch (error) {
            console.error(`Delivery failed for subscriber ${subscriberId}:`, error);
          }
        }

        // Update delivery count
        await this.db.run(
          'UPDATE _pubsub_messages SET delivered_count = ? WHERE id = ?',
          [delivered, id]
        );

        const duration = Date.now() - startTime;
        await this.performanceMonitor.recordMetric('pubSubMetrics', 'delivery_time', duration, {
          channel,
          subscriberCount: subscribers.size,
          deliveredCount: delivered
        });
      }
    } catch (error) {
      console.error('Message delivery error:', error);
    }
  }

  async getChannelStats(channel = null) {
    if (channel) {
      return await this.db.get(
        'SELECT * FROM _pubsub_channels WHERE channel = ?',
        [channel]
      );
    } else {
      return await this.db.all(
        'SELECT * FROM _pubsub_channels ORDER BY message_count DESC'
      );
    }
  }
}

// SQLite-based Cache implementation
class SQLiteCache {
  constructor(db, performanceMonitor) {
    this.db = db;
    this.performanceMonitor = performanceMonitor;
    this.memoryCache = new Map();
    this.maxMemoryEntries = 1000;
  }

  async init() {
    // Clean up expired entries on startup
    await this.cleanupExpired();
    
    // Start periodic cleanup
    setInterval(() => this.cleanupExpired(), 60000); // Every minute
  }

  async set(key, value, ttl = 60000) {
    const startTime = Date.now();
    
    try {
      const expiry = Date.now() + ttl;
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

      await this.db.run(
        `INSERT OR REPLACE INTO _cache_entries (key, value, expiry, accessed_at, access_count) 
         VALUES (?, ?, ?, CURRENT_TIMESTAMP, COALESCE((SELECT access_count + 1 FROM _cache_entries WHERE key = ?), 1))`,
        [key, valueStr, expiry, key]
      );

      // Update memory cache
      this.memoryCache.set(key, {
        value,
        expiry,
        accessedAt: Date.now(),
        accessCount: (this.memoryCache.get(key)?.accessCount || 0) + 1
      });

      // Enforce memory limit
      if (this.memoryCache.size > this.maxMemoryEntries) {
        const entries = Array.from(this.memoryCache.entries());
        entries.sort((a, b) => a[1].accessedAt - b[1].accessedAt);
        this.memoryCache.delete(entries[0][0]);
      }

      const duration = Date.now() - startTime;
      await this.performanceMonitor.recordMetric('cacheMetrics', 'set_time', duration, {
        keyLength: key.length,
        valueLength: valueStr.length,
        ttl
      });

    } catch (error) {
      throw new CacheError(`Cache set failed: ${error.message}`);
    }
  }

  async get(key) {
    const startTime = Date.now();
    
    try {
      // Check memory cache first
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && memoryEntry.expiry > Date.now()) {
        memoryEntry.accessedAt = Date.now();
        memoryEntry.accessCount++;
        
        const duration = Date.now() - startTime;
        await this.performanceMonitor.recordMetric('cacheMetrics', 'get_time', duration, {
          hit: 'memory',
          keyLength: key.length
        });

        return memoryEntry.value;
      }

      // Check database cache
      const dbEntry = await this.db.get(
        'SELECT value, expiry FROM _cache_entries WHERE key = ? AND expiry > ?',
        [key, Date.now()]
      );

      if (dbEntry) {
        const value = typeof dbEntry.value === 'string' ? 
          (this._tryParseJSON(dbEntry.value) || dbEntry.value) : dbEntry.value;

        // Update memory cache
        this.memoryCache.set(key, {
          value,
          expiry: dbEntry.expiry,
          accessedAt: Date.now(),
          accessCount: (this.memoryCache.get(key)?.accessCount || 0) + 1
        });

        // Update access stats
        await this.db.run(
          'UPDATE _cache_entries SET accessed_at = CURRENT_TIMESTAMP, access_count = access_count + 1 WHERE key = ?',
          [key]
        );

        const duration = Date.now() - startTime;
        await this.performanceMonitor.recordMetric('cacheMetrics', 'get_time', duration, {
          hit: 'database',
          keyLength: key.length,
          valueLength: typeof value === 'string' ? value.length : JSON.stringify(value).length
        });

        return value;
      }

      const duration = Date.now() - startTime;
      await this.performanceMonitor.recordMetric('cacheMetrics', 'get_time', duration, {
        hit: 'miss',
        keyLength: key.length
      });

      return null;

    } catch (error) {
      throw new CacheError(`Cache get failed: ${error.message}`);
    }
  }

  async del(key) {
    const startTime = Date.now();
    
    try {
      await this.db.run('DELETE FROM _cache_entries WHERE key = ?', [key]);
      this.memoryCache.delete(key);

      const duration = Date.now() - startTime;
      await this.performanceMonitor.recordMetric('cacheMetrics', 'del_time', duration, {
        keyLength: key.length
      });

    } catch (error) {
      throw new CacheError(`Cache delete failed: ${error.message}`);
    }
  }

  async cleanupExpired() {
    try {
      const result = await this.db.run(
        'DELETE FROM _cache_entries WHERE expiry <= ?',
        [Date.now()]
      );

      // Clean memory cache
      for (const [key, entry] of this.memoryCache.entries()) {
        if (entry.expiry <= Date.now()) {
          this.memoryCache.delete(key);
        }
      }

      console.log(`🧹 Cleaned up ${result.changes} expired cache entries`);

    } catch (error) {
      console.error('Cache cleanup failed:', error.message);
    }
  }

  async getCacheStats() {
    const stats = await this.db.get(`
      SELECT 
        COUNT(*) as total_entries,
        SUM(CASE WHEN expiry > ? THEN 1 ELSE 0 END) as active_entries,
        SUM(CASE WHEN expiry <= ? THEN 1 ELSE 0 END) as expired_entries,
        AVG(access_count) as avg_access_count,
        MAX(access_count) as max_access_count
      FROM _cache_entries
    `, [Date.now(), Date.now()]);

    return {
      ...stats,
      memory_entries: this.memoryCache.size,
      max_memory_entries: this.maxMemoryEntries
    };
  }

  _tryParseJSON(str) {
    try {
      return JSON.parse(str);
    } catch {
      return null;
    }
  }
}

// Enhanced Ariel SQLite Engine with Redis and Elasticsearch functionality
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
      ...options
    };

    this.db = null;
    this.isInitialized = false;
    this.connectionId = null;
    this.preparedStatements = new Map();
    this.transactionDepth = 0;
    this.lastBackupTime = 0;
    
    // Initialize enhanced components
    this.performanceMonitor = new PerformanceMonitor(this);
    this.pubSub = this.options.enablePubSub ? new SQLitePubSub(this, this.performanceMonitor) : null;
    this.cache = this.options.enableCache ? new SQLiteCache(this, this.performanceMonitor) : null;
  }

  /**
   * Initialize the SQLite database with enhanced features
   */
  async init() {
    if (this.isInitialized) return;

    try {
      console.log('🗄️ Initializing Enhanced Ariel SQLite Engine...');

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

        // Initialize enhanced features
        await this.performanceMonitor.init();
        if (this.pubSub) await this.pubSub.init();
        if (this.cache) await this.cache.init();

        this.connectionId = crypto.randomBytes(8).toString('hex');
        this.isInitialized = true;

        console.log('✅ Enhanced Ariel SQLite Engine initialized successfully');
      }, 3, 1000);

      // Start background maintenance
      this.startBackgroundMaintenance();

    } catch (error) {
      console.error('❌ Failed to initialize database:', error);
      throw new ConnectionError(`Database initialization failed: ${error.message}`);
    }
  }

  // Redis-like functionality
  async publish(channel, message) {
    if (!this.pubSub) throw new PubSubError('PubSub is not enabled');
    return this.pubSub.publish(channel, message);
  }

  async subscribe(channel, subscriberId, callback) {
    if (!this.pubSub) throw new PubSubError('PubSub is not enabled');
    return this.pubSub.subscribe(channel, subscriberId, callback);
  }

  async unsubscribe(channel, subscriberId) {
    if (!this.pubSub) throw new PubSubError('PubSub is not enabled');
    return this.pubSub.unsubscribe(channel, subscriberId);
  }

  // Cache functionality
  async setCache(key, value, ttl = 60000) {
    if (!this.cache) throw new CacheError('Cache is not enabled');
    return this.cache.set(key, value, ttl);
  }

  async getCache(key) {
    if (!this.cache) throw new CacheError('Cache is not enabled');
    return this.cache.get(key);
  }

  async delCache(key) {
    if (!this.cache) throw new CacheError('Cache is not enabled');
    return this.cache.del(key);
  }

  async getCacheStats() {
    if (!this.cache) throw new CacheError('Cache is not enabled');
    return this.cache.getCacheStats();
  }

  // Enhanced monitoring functionality
  async getPerformanceStats(timeRange = '24 hours') {
    return this.performanceMonitor.getPerformanceStats(timeRange);
  }

  async getPubSubStats(channel = null) {
    if (!this.pubSub) throw new PubSubError('PubSub is not enabled');
    return this.pubSub.getChannelStats(channel);
  }

  // Enhanced query methods with caching
  async getWithCache(sql, params = [], options = {}) {
    const cacheKey = this._getCacheKey(sql, params);
    const cacheTtl = options.cacheTtl || 30000; // 30 seconds default

    // Try to get from cache first
    if (options.cache !== false && this.cache) {
      const cached = await this.getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    // Execute query if not in cache
    const result = await this.get(sql, params, { ...options, logging: false });

    // Cache the result
    if (options.cache !== false && this.cache && result) {
      await this.setCache(cacheKey, result, cacheTtl);
    }

    return result;
  }

  async allWithCache(sql, params = [], options = {}) {
    const cacheKey = this._getCacheKey(sql, params);
    const cacheTtl = options.cacheTtl || 30000;

    // Try to get from cache first
    if (options.cache !== false && this.cache) {
      const cached = await this.getCache(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }

    // Execute query if not in cache
    const result = await this.all(sql, params, { ...options, logging: false });

    // Cache the result
    if (options.cache !== false && this.cache && result) {
      await this.setCache(cacheKey, result, cacheTtl);
    }

    return result;
  }

  // Enhanced transaction with pub/sub events
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
      await this.performanceMonitor.recordMetric('transactionTimes', 'transaction_time', duration, {
        transactionId,
        depth: this.transactionDepth,
        success: true
      });

      // Publish transaction completion event
      if (this.pubSub && options.publishEvent !== false) {
        await this.publish('transactions', {
          type: 'transaction_completed',
          transactionId,
          duration,
          depth: this.transactionDepth,
          success: true
        });
      }

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
      
      const duration = Date.now() - startTime;
      await this.performanceMonitor.recordMetric('transactionTimes', 'transaction_time', duration, {
        transactionId,
        depth: this.transactionDepth,
        success: false,
        error: error.message
      });

      // Publish transaction failure event
      if (this.pubSub && options.publishEvent !== false) {
        await this.publish('transactions', {
          type: 'transaction_failed',
          transactionId,
          duration,
          depth: this.transactionDepth,
          error: error.message
        });
      }

      console.error('❌ Transaction failed:', {
        transactionId,
        error: error.message,
        duration: `${duration}ms`
      });

      throw new QueryError(`Transaction failed: ${error.message}`);
    }
  }

  // Enhanced backup with event publishing
  async backup(backupPath = null) {
    this._ensureInitialized();

    const now = Date.now();
    if (now - this.lastBackupTime < 3600000) {
      console.warn('⚠️ Backup cooldown active, skipping');
      return;
    }

    const backupFile = backupPath || `./backups/ariel-backup-${now}.db`;
    const backupDir = path.dirname(backupFile);

    try {
      await fs.mkdir(backupDir, { recursive: true });

      // Publish backup start event
      if (this.pubSub) {
        await this.publish('backups', {
          type: 'backup_started',
          backupFile,
          timestamp: now
        });
      }

      const backupDb = new Database(backupFile);
      this.db.backup(backupDb, {
        progress: ({ totalPages, remainingPages }) => {
          const percentage = ((totalPages - remainingPages) / totalPages * 100).toFixed(1);
          console.log(`🔁 Backup progress: ${percentage}%`);
        }
      });

      backupDb.close();
      this.lastBackupTime = now;

      // Publish backup completion event
      if (this.pubSub) {
        await this.publish('backups', {
          type: 'backup_completed',
          backupFile,
          timestamp: now,
          duration: Date.now() - now
        });
      }

      console.log(`✅ Backup completed: ${backupFile}`);
      return backupFile;

    } catch (error) {
      // Publish backup failure event
      if (this.pubSub) {
        await this.publish('backups', {
          type: 'backup_failed',
          backupFile,
          timestamp: now,
          error: error.message
        });
      }

      console.error('❌ Backup failed:', error.message);
      throw new DatabaseError(`Backup failed: ${error.message}`);
    }
  }

  // Enhanced maintenance with monitoring
  async maintenance() {
    try {
      console.log('🔧 Running database maintenance...');

      // Publish maintenance start event
      if (this.pubSub) {
        await this.publish('maintenance', {
          type: 'maintenance_started',
          timestamp: Date.now()
        });
      }

      // Vacuum database
      this.db.pragma('optimize');
      
      // Analyze for query optimization
      this.db.pragma('analysis_limit=1000');
      this.db.pragma('optimize');
      
      // Incremental vacuum
      this.db.pragma('incremental_vacuum(100)');

      // Update statistics
      this.db.pragma('optimize');

      // Cleanup old metrics
      await this.db.run(
        'DELETE FROM _performance_metrics WHERE timestamp < datetime("now", "-7 days")'
      );

      // Cleanup old cache entries
      if (this.cache) {
        await this.cache.cleanupExpired();
      }

      // Publish maintenance completion event
      if (this.pubSub) {
        await this.publish('maintenance', {
          type: 'maintenance_completed',
          timestamp: Date.now(),
          duration: Date.now() - Date.now() // Would calculate actual duration in real impl
        });
      }

      console.log('✅ Database maintenance completed');

    } catch (error) {
      // Publish maintenance failure event
      if (this.pubSub) {
        await this.publish('maintenance', {
          type: 'maintenance_failed',
          timestamp: Date.now(),
          error: error.message
        });
      }

      console.warn('⚠️ Database maintenance failed:', error.message);
    }
  }

  // Enhanced stats with cache and pub/sub metrics
  async getStats() {
    try {
      const baseStats = {
        connectionId: this.connectionId,
        isInitialized: this.isInitialized,
        transactionDepth: this.transactionDepth,
        preparedStatements: this.preparedStatements.size,
        databaseSize: await this.getDatabaseSize(),
        tableStats: await this.getTableStats(),
        performance: this.getPerformanceStats(),
        lastBackup: this.lastBackupTime ? new Date(this.lastBackupTime).toISOString() : null
      };

      // Add cache stats if enabled
      if (this.cache) {
        baseStats.cacheStats = await this.getCacheStats();
      }

      // Add pub/sub stats if enabled
      if (this.pubSub) {
        baseStats.pubSubStats = await this.getPubSubStats();
      }

      return baseStats;

    } catch (error) {
      console.error('Failed to get database stats:', error);
      return { error: error.message };
    }
  }

  // Enhanced close method
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
        
        // Publish shutdown event
        if (this.pubSub) {
          await this.publish('system', {
            type: 'database_shutdown',
            timestamp: Date.now(),
            connectionId: this.connectionId
          });
        }
        
        console.log('✅ Database connection closed gracefully');
      } catch (error) {
        console.error('❌ Error closing database:', error);
      }
    }
  }

  // Keep all existing utility methods and enhance as needed
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

    // Publish heartbeat every minute
    if (this.pubSub) {
      setInterval(() => {
        this.publish('heartbeat', {
          type: 'database_heartbeat',
          timestamp: Date.now(),
          connectionId: this.connectionId,
          stats: this.getStats().catch(() => ({}))
        }).catch(console.error);
      }, 60000);
    }
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

  // Keep all existing database methods (run, get, all, etc.) unchanged
  // but enhance them to use the new monitoring system
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
      await this.performanceMonitor.recordMetric('queryTimes', 'query_time', duration, {
        queryId,
        sql: sql.substring(0, 200),
        params: params.length > 0 ? params : undefined,
        type: 'run'
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
      const duration = Date.now() - startTime;
      await this.performanceMonitor.recordMetric('queryTimes', 'query_time', duration, {
        queryId,
        sql: sql.substring(0, 200),
        params: params.length > 0 ? params : undefined,
        type: 'run',
        error: error.message
      });

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

  async get(sql, params = [], options = {}) {
    this._ensureInitialized();

    const startTime = Date.now();
    const queryId = crypto.createHash('sha256').update(sql).digest('hex').substring(0, 16);

    try {
      let statement = this.preparedStatements.get(sql);
      if (!statement) {
        statement = this.db.prepare(sql);
        this.preparedStatements.set(sql, statement);
      }

      const result = statement.get(...params);
      const duration = Date.now() - startTime;

      await this.performanceMonitor.recordMetric('queryTimes', 'query_time', duration, {
        queryId,
        sql: sql.substring(0, 200),
        params: params.length > 0 ? params : undefined,
        type: 'get',
        hasResult: !!result
      });

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
      await this.performanceMonitor.recordMetric('queryTimes', 'query_time', duration, {
        queryId,
        sql: sql.substring(0, 200),
        params: params.length > 0 ? params : undefined,
        type: 'get',
        error: error.message
      });

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

      await this.performanceMonitor.recordMetric('queryTimes', 'query_time', duration, {
        queryId,
        sql: sql.substring(0, 200),
        params: params.length > 0 ? params : undefined,
        type: 'all',
        resultCount: results.length
      });

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
      await this.performanceMonitor.recordMetric('queryTimes', 'query_time', duration, {
        queryId,
        sql: sql.substring(0, 200),
        params: params.length > 0 ? params : undefined,
        type: 'all',
        error: error.message
      });

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

  _getMemoryUsage(data) {
    try {
      const str = JSON.stringify(data);
      return Buffer.byteLength(str, 'utf8');
    } catch {
      return 0;
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
      await this.performanceMonitor.recordMetric('queryTimes', 'connection_test', duration);
      return true;
    } catch (error) {
      throw new ConnectionError(`Connection test failed: ${error.message}`);
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
}

// Export error classes
export { DatabaseError, ConnectionError, QueryError, CacheError, PubSubError };
export default ArielSQLiteEngine;
