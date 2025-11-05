// modules/enterprise-logger/index.js (FIXED - Production-Ready with Self-Healing Access)
import winston from 'winston';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class EnterpriseLogger {
  constructor(serviceName = 'application', config = {}) {
    this.serviceName = serviceName;
    this.config = {
      logLevel: config.logLevel || 'info',
      logToDatabase: config.logToDatabase !== false,
      logToConsole: config.logToConsole !== false,
      logToFile: config.logToFile !== false,
      enableRealtime: config.enableRealtime !== false,
      databaseInitialized: config.databaseInitialized || false,
      ...config
    };

    this.db = config.database || null;
    this.logger = null;
    this.isInitialized = false;
    this.logQueue = [];
    this.isProcessingQueue = false;
    this.databaseReady = this.config.databaseInitialized;

    // 🎯 CRITICAL FIX: Track database connection state
    this.databaseConnectionType = null; // 'simple' or 'sharded'
    this.databaseManager = null;

    // Ensure logs directory exists
    this.ensureLogsDirectory();

    // Initialize file-based logger immediately
    this.initializeFileLogger();

    // Defer database initialization
    this.deferredDatabaseInit = this.deferDatabaseInitialization();
  }

  ensureLogsDirectory() {
    const logsDir = 'logs';
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
  }

  initializeFileLogger() {
    try {
      const transports = [];

      // Console transport
      if (this.config.logToConsole) {
        transports.push(
          new winston.transports.Console({
            format: winston.format.combine(
              winston.format.colorize(),
              winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
              winston.format.printf(({ timestamp, level, message, ...meta }) => {
                const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
                return `${timestamp} [${level}] ${this.serviceName}: ${message} ${metaStr}`.trim();
              })
            )
          })
        );
      }

      // File transports
      if (this.config.logToFile) {
        transports.push(
          new winston.transports.File({
            filename: `logs/${this.serviceName}-error.log`,
            level: 'error',
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json()
            ),
            maxsize: 10485760, // 10MB
            maxFiles: 5
          })
        );
        
        transports.push(
          new winston.transports.File({
            filename: `logs/${this.serviceName}-combined.log`,
            format: winston.format.combine(
              winston.format.timestamp(),
              winston.format.json()
            ),
            maxsize: 10485760, // 10MB
            maxFiles: 10
          })
        );
      }

      this.logger = winston.createLogger({
        level: this.config.logLevel,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        ),
        defaultMeta: { service: this.serviceName },
        transports,
        exceptionHandlers: [
          new winston.transports.File({ 
            filename: `logs/${this.serviceName}-exceptions.log` 
          })
        ],
        rejectionHandlers: [
          new winston.transports.File({ 
            filename: `logs/${this.serviceName}-rejections.log` 
          })
        ]
      });

      this.isInitialized = true;
      console.log(`File logger initialized for service: ${this.serviceName}`);

    } catch (error) {
      console.error('File logger initialization failed:', error);
      // Fallback to basic console logging
      this.initializeFallbackLogger();
    }
  }

  initializeFallbackLogger() {
    this.logger = {
      log: (level, message, meta) => {
        const timestamp = new Date().toISOString();
        console.log(`${timestamp} [${level}] ${this.serviceName}: ${message}`, meta || '');
      },
      info: (message, meta) => console.log(`[INFO] ${this.serviceName}: ${message}`, meta || ''),
      error: (message, meta) => console.error(`[ERROR] ${this.serviceName}: ${message}`, meta || ''),
      warn: (message, meta) => console.warn(`[WARN] ${this.serviceName}: ${message}`, meta || ''),
      debug: (message, meta) => console.log(`[DEBUG] ${this.serviceName}: ${message}`, meta || '')
    };
    this.isInitialized = true;
  }

  /**
   * 🎯 CRITICAL FIX: Enhanced database detection and connection handling
   */
  detectDatabaseType() {
    if (!this.db) {
      return 'none';
    }

    // Check if it's a SimpleDatabaseManager instance
    if (this.db.getDatabaseManager && typeof this.db.getDatabaseManager === 'function') {
      this.databaseConnectionType = 'sharded';
      this.databaseManager = this.db;
      return 'sharded';
    }

    // Check if it's a SimpleDatabaseManager with direct database access
    if (this.db.getDatabase && typeof this.db.getDatabase === 'function') {
      this.databaseConnectionType = 'simple';
      this.databaseManager = this.db;
      return 'simple';
    }

    // Check if it has direct database methods (legacy support)
    if (this.db.run && typeof this.db.run === 'function') {
      this.databaseConnectionType = 'direct';
      return 'direct';
    }

    return 'unknown';
  }

  /**
   * 🎯 CRITICAL FIX: Safe database operation methods
   */
  async safeDatabaseRun(sql, params = []) {
    try {
      if (!this.db) {
        throw new Error('Database not available');
      }

      const dbType = this.detectDatabaseType();
      
      switch (dbType) {
        case 'sharded':
          // Use the database manager to get a simple database for logging
          const logDb = this.databaseManager.getSimpleDatabase('./logs/application.db');
          if (logDb && logDb.run) {
            return logDb.run(sql, params);
          }
          break;
          
        case 'simple':
          const database = this.databaseManager.getDatabase();
          if (database && database.run) {
            return database.run(sql, params);
          }
          break;
          
        case 'direct':
          return this.db.run(sql, params);
          
        default:
          throw new Error(`Unsupported database type: ${dbType}`);
      }
      
      throw new Error('No valid database connection found');
      
    } catch (error) {
      console.error('Safe database run failed:', error.message);
      throw error;
    }
  }

  async safeDatabaseGet(sql, params = []) {
    try {
      if (!this.db) {
        throw new Error('Database not available');
      }

      const dbType = this.detectDatabaseType();
      
      switch (dbType) {
        case 'sharded':
          const logDb = this.databaseManager.getSimpleDatabase('./logs/application.db');
          if (logDb && logDb.get) {
            return logDb.get(sql, params);
          }
          break;
          
        case 'simple':
          const database = this.databaseManager.getDatabase();
          if (database && database.get) {
            return database.get(sql, params);
          }
          break;
          
        case 'direct':
          return this.db.get(sql, params);
          
        default:
          throw new Error(`Unsupported database type: ${dbType}`);
      }
      
      throw new Error('No valid database connection found');
      
    } catch (error) {
      console.error('Safe database get failed:', error.message);
      throw error;
    }
  }

  async safeDatabaseAll(sql, params = []) {
    try {
      if (!this.db) {
        throw new Error('Database not available');
      }

      const dbType = this.detectDatabaseType();
      
      switch (dbType) {
        case 'sharded':
          const logDb = this.databaseManager.getSimpleDatabase('./logs/application.db');
          if (logDb && logDb.all) {
            return logDb.all(sql, params);
          }
          break;
          
        case 'simple':
          const database = this.databaseManager.getDatabase();
          if (database && database.all) {
            return database.all(sql, params);
          }
          break;
          
        case 'direct':
          return this.db.all(sql, params);
          
        default:
          throw new Error(`Unsupported database type: ${dbType}`);
      }
      
      throw new Error('No valid database connection found');
      
    } catch (error) {
      console.error('Safe database all failed:', error.message);
      throw error;
    }
  }

  async deferDatabaseInitialization() {
    // Wait a bit for database to potentially initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    if (this.config.logToDatabase && this.db) {
      try {
        await this.initializeDatabaseLogging();
        this.databaseReady = true;
        console.log(`✅ Database logging initialized for service: ${this.serviceName}`);
        
        // Process any queued logs
        await this.processLogQueue();
      } catch (error) {
        console.warn(`⚠️ Database logging deferred for service ${this.serviceName}: ${error.message}`);
        // Don't retry aggressively - database might not be ready
      }
    }
  }

  async initializeDatabaseLogging() {
    if (!this.db) {
      throw new Error('Database instance not provided');
    }

    try {
      // 🎯 CRITICAL FIX: Use safe database operations
      await this.safeDatabaseGet('SELECT 1 as test');
      
      // Create logs table if it doesn't exist
      await this.safeDatabaseRun(`
        CREATE TABLE IF NOT EXISTS application_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          level VARCHAR(20) NOT NULL,
          service VARCHAR(100) NOT NULL,
          message TEXT NOT NULL,
          meta TEXT,
          context VARCHAR(200),
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for better query performance
      await this.safeDatabaseRun(`
        CREATE INDEX IF NOT EXISTS idx_logs_level ON application_logs(level)
      `);
      await this.safeDatabaseRun(`
        CREATE INDEX IF NOT EXISTS idx_logs_service ON application_logs(service)
      `);
      await this.safeDatabaseRun(`
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON application_logs(timestamp)
      `);

      console.log('✅ Database logging tables initialized successfully');

    } catch (error) {
      console.error('❌ Database logging initialization failed:', error.message);
      throw error;
    }
  }

  async setDatabase(database) {
    this.db = database;
    // 🎯 CRITICAL FIX: Detect database type before attempting to use it
    this.detectDatabaseType();
    
    if (this.config.logToDatabase) {
      await this.deferDatabaseInitialization();
    }
  }

  async markDatabaseReady() {
    this.databaseReady = true;
    if (this.config.logToDatabase) {
      await this.deferDatabaseInitialization();
    }
  }

  async log(level, message, meta = {}) {
    // If logger is not initialized, queue the log
    if (!this.isInitialized) {
      this.logQueue.push({ level, message, meta });
      return;
    }

    try {
      // Log to winston immediately
      this.logger.log(level, message, meta);

      // Log to database if enabled and ready
      if (this.config.logToDatabase && this.databaseReady) {
        await this.logToDatabase(level, message, meta);
      } else if (this.config.logToDatabase) {
        // Queue for database when ready
        this.logQueue.push({ level, message, meta });
      }
    } catch (error) {
      console.error('Logging failed:', error);
    }
  }

  async logToDatabase(level, message, meta = {}) {
    if (!this.config.logToDatabase || !this.databaseReady || !this.db) return;

    try {
      // 🎯 CRITICAL FIX: Use safe database operations
      await this.safeDatabaseRun(
        'INSERT INTO application_logs (level, service, message, meta, context) VALUES (?, ?, ?, ?, ?)',
        [level, this.serviceName, message, JSON.stringify(meta), meta.context || '']
      );

    } catch (error) {
      console.error('❌ Database logging failed:', error.message);
      // Fallback to file logging if database fails
      this.logger.error('Database logging failed', { error: error.message });
      
      // 🎯 CRITICAL FIX: Disable database logging on persistent failure
      if (error.message.includes('not a function') || error.message.includes('not available')) {
        console.warn('⚠️ Permanently disabling database logging due to connection issues');
        this.config.logToDatabase = false;
        this.databaseReady = false;
      }
    }
  }

  async processLogQueue() {
    if (this.isProcessingQueue || this.logQueue.length === 0) return;

    this.isProcessingQueue = true;
    try {
      while (this.logQueue.length > 0) {
        const logEntry = this.logQueue.shift();
        await this.log(logEntry.level, logEntry.message, logEntry.meta);
      }
    } catch (error) {
      console.error('Log queue processing failed:', error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  // Convenience methods
  async info(message, meta = {}) {
    await this.log('info', message, meta);
  }

  async error(message, meta = {}) {
    await this.log('error', message, meta);
  }

  async warn(message, meta = {}) {
    await this.log('warn', message, meta);
  }

  async debug(message, meta = {}) {
    await this.log('debug', message, meta);
  }

  async verbose(message, meta = {}) {
    await this.log('verbose', message, meta);
  }

  // Query methods (only work when database is ready)
  async queryLogs(options = {}) {
    if (!this.databaseReady || !this.db) {
      throw new Error('Database not ready for querying');
    }

    const {
      level,
      startTime,
      endTime,
      service,
      messageContains,
      context,
      limit = 100,
      offset = 0
    } = options;

    let query = 'SELECT * FROM application_logs WHERE 1=1';
    const params = [];

    if (level) {
      query += ' AND level = ?';
      params.push(level);
    }

    if (startTime) {
      query += ' AND timestamp >= ?';
      params.push(startTime);
    }

    if (endTime) {
      query += ' AND timestamp <= ?';
      params.push(endTime);
    }

    if (service) {
      query += ' AND service = ?';
      params.push(service);
    }

    if (messageContains) {
      query += ' AND message LIKE ?';
      params.push(`%${messageContains}%`);
    }

    if (context) {
      query += ' AND context = ?';
      params.push(context);
    }

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    try {
      // 🎯 CRITICAL FIX: Use safe database operations
      return await this.safeDatabaseAll(query, params);
    } catch (error) {
      console.error('Log query failed:', error);
      throw error;
    }
  }

  async getLogStatistics(timeRange = '24 hours') {
    if (!this.databaseReady || !this.db) {
      throw new Error('Database not ready for statistics');
    }

    try {
      // 🎯 CRITICAL FIX: Use safe database operations
      return await this.safeDatabaseAll(`
        SELECT 
          level,
          COUNT(*) as count,
          MIN(timestamp) as first_occurrence,
          MAX(timestamp) as last_occurrence
        FROM application_logs 
        WHERE timestamp >= datetime('now', ?)
        GROUP BY level
        ORDER BY count DESC
      `, [`-${timeRange}`]);
    } catch (error) {
      console.error('Log statistics query failed:', error);
      throw error;
    }
  }

  // Health check method
  async healthCheck() {
    const status = {
      status: 'healthy',
      fileLogger: 'initialized',
      database: this.databaseReady ? 'connected' : 'not-ready',
      databaseType: this.databaseConnectionType || 'unknown',
      service: this.serviceName,
      timestamp: new Date().toISOString()
    };

    if (this.databaseReady && this.db) {
      try {
        // 🎯 CRITICAL FIX: Use safe database operations
        await this.safeDatabaseGet('SELECT 1 as test');
        status.database = 'connected';
      } catch (error) {
        status.database = 'error';
        status.databaseError = error.message;
        status.status = 'degraded';
      }
    }

    return status;
  }

  // Close method for cleanup
  async close() {
    try {
      if (this.logger && this.logger.end) {
        this.logger.end();
      }
      
      // Process any remaining logs in queue
      await this.processLogQueue();
      
      console.log('Logger closed successfully');
    } catch (error) {
      console.error('Logger close failed:', error);
    }
  }
}

// Global logger management with deferred initialization
export let globalLogger = null;
export let globalLoggerPromise = null;

// CRITICAL FIX: Made synchronous to support synchronous callers like constructors.
export function initializeGlobalLogger(serviceName = 'application', config = {}) {
  if (!globalLogger) {
    // 🎯 CRITICAL FIX: Create logger with file logging only initially
    globalLogger = new EnterpriseLogger(serviceName, {
      ...config,
      logToDatabase: false // Disable database logging initially to prevent startup failures
    });
    
    globalLoggerPromise = Promise.resolve(globalLogger);
  }
  return globalLogger;
}

export function getGlobalLogger(serviceName = 'System.EarlyInit') {
  if (!globalLogger) {
    // 💡 NOVELTY FIX: Self-Healing Logger Access
    // Prevents fatal crash (Error: Global logger not initialized) by performing 
    // a synchronous, minimal fallback setup if accessed too early.
    
    console.error(`⚠️ CRITICAL: Global logger accessed before initialization. Performing self-healing fallback setup for service: ${serviceName}.`);

    // Synchronously initialize the logger with safe defaults
    initializeGlobalLogger(serviceName, {
      logToDatabase: false // Enforce safety during fallback initialization
    });

    console.warn(`Global Logger accessed before main setup. Using fallback configuration for: ${serviceName}`);
  }
  return globalLogger;
}

export async function enableDatabaseLogging(database) {
  if (!globalLogger) {
    throw new Error('Global logger not initialized');
  }
  
  // 🎯 CRITICAL FIX: Use safe database setup
  try {
    await globalLogger.setDatabase(database);
    globalLogger.config.logToDatabase = true;
    await globalLogger.markDatabaseReady();
    
    console.log('✅ Database logging enabled successfully');
    return globalLogger;
  } catch (error) {
    console.error('❌ Failed to enable database logging:', error.message);
    // Don't throw - continue without database logging
    return globalLogger;
  }
}

/**
 * 🎯 CRITICAL FIX: Safe database logging function for main.js
 */
export async function enableDatabaseLoggingSafely(database) {
  // This call will now use the Self-Healing mechanism if the logger hasn't been set up yet.
  const logger = getGlobalLogger();
  
  try {
    if (!database) {
      logger.warn('⚠️ Database not provided for logging, skipping database logging setup');
      return;
    }

    // Use the safe enable method
    await enableDatabaseLogging(database);
    
  } catch (error) {
    logger.warn('⚠️ Database logging initialization failed, continuing without it:', error.message);
    // 🎯 CRITICAL FIX: Don't throw error, just log warning and continue
  }
}
