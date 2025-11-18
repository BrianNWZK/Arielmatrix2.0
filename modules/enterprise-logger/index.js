// modules/enterprise-logger/index.js (FINALIZED - Production-Ready with Self-Healing Access)
import winston from 'winston';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// --- Setup for __dirname in ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Internal: keep a single transport registry per service to prevent duplicate handlers.
const transportRegistry = new Map();

// --- Internal Utility Functions ---

// Internal: redact sensitive fields from log meta safely.
function redactSensitive(meta) {
  try {
    const SENSITIVE_KEYS = [
      'privateKey', 'PRIVATE_KEY', 'MAINNET_PRIVATE_KEY',
      'mnemonic', 'seed', 'apiKey', 'API_KEY',
      'INFURA_PROJECT_ID', 'ALCHEMY_API_KEY', 'SOVEREIGN_WALLET',
      'password', 'secret', 'QR_MASTER_KEY'
    ];
    // Deep clone to avoid mutating the original meta object
    const clone = JSON.parse(JSON.stringify(meta || {}));
    const redact = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      for (const key of Object.keys(obj)) {
        const val = obj[key];
        if (SENSITIVE_KEYS.includes(key)) {
          obj[key] = '[REDACTED]';
        } else if (typeof val === 'object' && val !== null) {
          redact(val);
        }
      }
    };
    redact(clone);
    return clone;
  } catch {
    return { info: 'meta_redaction_failed' };
  }
}

// Internal: normalize service names.
function normalizeServiceName(serviceName) {
  if (typeof serviceName === 'string' && serviceName.trim().length > 0) {
    return serviceName.trim();
  }
  if (serviceName && typeof serviceName === 'object') {
    if (serviceName.name && typeof serviceName.name === 'string') {
      return serviceName.name;
    }
    try {
      return JSON.stringify(serviceName);
    } catch {
      return 'application';
    }
  }
  return 'application';
}

// Internal: safe stringify for meta in console formatter.
function safeStringifyMeta(meta) {
  try {
    const redacted = redactSensitive(meta);
    const str = JSON.stringify(redacted);
    // Cap length to prevent console clog
    return str.length > 5000 ? str.slice(0, 5000) + '... [truncated]' : str;
  } catch {
    return '';
  }
}

// =========================================================================
// 👑 Exported Logger Class
// =========================================================================

export class EnterpriseLogger {
  constructor(serviceName = 'application', config = {}) {
    this.serviceName = normalizeServiceName(serviceName);
    this.config = {
      logLevel: config.logLevel || 'info',
      logToDatabase: config.logToDatabase !== false,
      logToConsole: config.logToConsole !== false,
      logToFile: config.logToFile !== false,
      databaseInitialized: config.databaseInitialized || false,
      ...config
    };

    this.db = config.database || null;
    this.logger = null;
    this.isInitialized = false;
    this.logQueue = [];
    this.isProcessingQueue = false;
    this.databaseReady = this.config.databaseInitialized;

    this.databaseConnectionType = null;
    this.databaseManager = null;

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
      if (!transportRegistry.has(this.serviceName)) {
        const transports = [];

        // Console transport
        if (this.config.logToConsole) {
          transports.push(
            new winston.transports.Console({
              format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
                winston.format.printf(({ timestamp, level, message, ...meta }) => {
                  const metaStr = Object.keys(meta).length ? safeStringifyMeta(meta) : '';
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
              format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
              maxsize: 10485760, // 10MB
              maxFiles: 5
            }),
            new winston.transports.File({
              filename: `logs/${this.serviceName}-combined.log`,
              format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
              maxsize: 10485760, // 10MB
              maxFiles: 10
            })
          );
        }

        transportRegistry.set(this.serviceName, transports);
      }

      const transports = transportRegistry.get(this.serviceName);

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
          new winston.transports.File({ filename: `logs/${this.serviceName}-exceptions.log` })
        ],
        rejectionHandlers: [
          new winston.transports.File({ filename: `logs/${this.serviceName}-rejections.log` })
        ]
      });

      this.isInitialized = true;
      console.log(`✅ File logger initialized for service: ${this.serviceName}`);

    } catch (error) {
      console.error('❌ File logger initialization failed. Falling back to console:', error);
      this.initializeFallbackLogger();
    }
  }

  initializeFallbackLogger() {
    const svc = this.serviceName;
    const now = new Date().toISOString();
    this.logger = {
        log: (level, message, meta) => {
            const metaStr = safeStringifyMeta(meta);
            console.log(`${now} [${level.toUpperCase()}] ${svc}: ${message}`, metaStr || '');
        },
        info: (message, meta) => this.logger.log('info', message, meta),
        error: (message, meta) => this.logger.log('error', message, meta),
        warn: (message, meta) => this.logger.log('warn', message, meta),
        debug: (message, meta) => this.logger.log('debug', message, meta),
        verbose: (message, meta) => this.logger.log('verbose', message, meta),
    };
    this.isInitialized = true;
  }

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

  async safeDatabaseRun(sql, params = []) {
    try {
      if (!this.db) throw new Error('Database not available');
      const dbType = this.detectDatabaseType();
      
      let dbInstance = null;
      if (dbType === 'sharded') {
        dbInstance = this.databaseManager.getSimpleDatabase('./logs/application.db');
      } else if (dbType === 'simple') {
        dbInstance = this.databaseManager.getDatabase();
      } else if (dbType === 'direct') {
        dbInstance = this.db;
      } else {
        throw new Error(`Unsupported database type: ${dbType}`);
      }
      
      if (dbInstance && dbInstance.run) {
        return await dbInstance.run(sql, params);
      }
      throw new Error('No valid database connection found for run operation');
    } catch (error) {
      console.error('Safe database run failed:', error.message);
      throw error;
    }
  }

  async safeDatabaseGet(sql, params = []) {
    try {
      if (!this.db) throw new Error('Database not available');
      const dbType = this.detectDatabaseType();
      
      let dbInstance = null;
      if (dbType === 'sharded') {
        dbInstance = this.databaseManager.getSimpleDatabase('./logs/application.db');
      } else if (dbType === 'simple') {
        dbInstance = this.databaseManager.getDatabase();
      } else if (dbType === 'direct') {
        dbInstance = this.db;
      } else {
        throw new Error(`Unsupported database type: ${dbType}`);
      }
      
      if (dbInstance && dbInstance.get) {
        return await dbInstance.get(sql, params);
      }
      throw new Error('No valid database connection found for get operation');
    } catch (error) {
      console.error('Safe database get failed:', error.message);
      throw error;
    }
  }

  async safeDatabaseAll(sql, params = []) {
    try {
      if (!this.db) throw new Error('Database not available');
      const dbType = this.detectDatabaseType();
      
      let dbInstance = null;
      if (dbType === 'sharded') {
        dbInstance = this.databaseManager.getSimpleDatabase('./logs/application.db');
      } else if (dbType === 'simple') {
        dbInstance = this.databaseManager.getDatabase();
      } else if (dbType === 'direct') {
        dbInstance = this.db;
      } else {
        throw new Error(`Unsupported database type: ${dbType}`);
      }
      
      if (dbInstance && dbInstance.all) {
        return await dbInstance.all(sql, params);
      }
      throw new Error('No valid database connection found for all operation');
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
        this.logger.info(`✅ Database logging initialized and ready.`);
        
        // Process any queued logs
        await this.processLogQueue();
      } catch (error) {
        this.logger.warn(`⚠️ Database logging deferred: ${error.message}`);
        // Don't retry aggressively - database might not be ready
      }
    }
  }

  async initializeDatabaseLogging() {
    if (!this.db) {
      throw new Error('Database instance not provided');
    }

    try {
      // Test connection
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
      await this.safeDatabaseRun('CREATE INDEX IF NOT EXISTS idx_logs_level ON application_logs(level)');
      await this.safeDatabaseRun('CREATE INDEX IF NOT EXISTS idx_logs_service ON application_logs(service)');
      await this.safeDatabaseRun('CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON application_logs(timestamp)');

      this.logger.info('✅ Database logging tables initialized successfully');

    } catch (error) {
      this.logger.error('❌ Database logging initialization failed', { error: error.message });
      throw error;
    }
  }

  async setDatabase(database) {
    this.db = database;
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
    // If logger is not initialized, queue the log and fall back to console
    if (!this.isInitialized) {
      this.logQueue.push({ level, message, meta });
      this.initializeFallbackLogger(); // Ensure basic console logging works immediately
    }

    try {
      const safeMeta = redactSensitive(meta);

      // 1. Log to winston immediately (console/file)
      this.logger.log(level, message, safeMeta);

      // 2. Log to database if enabled and ready
      if (this.config.logToDatabase && this.databaseReady) {
        await this.logToDatabase(level, message, safeMeta);
      } else if (this.config.logToDatabase) {
        // 3. Queue for database when ready
        this.logQueue.push({ level, message, meta: safeMeta });
      }
    } catch (error) {
      console.error('Logging failed:', error);
    }
  }

  async logToDatabase(level, message, meta = {}) {
    if (!this.config.logToDatabase || !this.databaseReady || !this.db) return;

    try {
      await this.safeDatabaseRun(
        'INSERT INTO application_logs (level, service, message, meta, context) VALUES (?, ?, ?, ?, ?)',
        [level, this.serviceName, message, JSON.stringify(meta), meta.context || '']
      );

    } catch (error) {
      this.logger.error('❌ Database logging failed. Disabling DB logging.', { error: error.message });
      // Disable database logging on persistent failure
      this.config.logToDatabase = false;
      this.databaseReady = false;
    }
  }

  async processLogQueue() {
    if (this.isProcessingQueue || this.logQueue.length === 0) return;

    this.isProcessingQueue = true;
    try {
      while (this.logQueue.length > 0) {
        const logEntry = this.logQueue.shift();
        // Use direct logToDatabase to avoid recursive queuing
        if (this.config.logToDatabase && this.databaseReady) {
            await this.logToDatabase(logEntry.level, logEntry.message, logEntry.meta);
        } else {
            // Log to winston (console/file) if DB is not ready
            this.logger.log(logEntry.level, logEntry.message, logEntry.meta);
        }
      }
    } catch (error) {
      this.logger.error('Log queue processing failed:', error);
    } finally {
      this.isProcessingQueue = false;
    }
  }

  // Convenience methods
  async info(message, meta = {}) { await this.log('info', message, meta); }
  async error(message, meta = {}) { await this.log('error', message, meta); }
  async warn(message, meta = {}) { await this.log('warn', message, meta); }
  async debug(message, meta = {}) { await this.log('debug', message, meta); }
  async verbose(message, meta = {}) { await this.log('verbose', message, meta); }

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
      return await this.safeDatabaseAll(query, params);
    } catch (error) {
      this.logger.error('Log query failed', { error: error.message });
      throw error;
    }
  }

  async getLogStatistics(timeRange = '24 hours') {
    if (!this.databaseReady || !this.db) {
      throw new Error('Database not ready for statistics');
    }

    try {
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
      this.logger.error('Log statistics query failed', { error: error.message });
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

// =========================================================================
// 👑 Global Logger Management and Exports
// =========================================================================

// Global state variables
export let globalLogger = null;
export let globalLoggerPromise = null;

/**
 * Synchronously initializes the single global logger instance.
 * Subsequent calls will return the existing instance.
 * @param {string} serviceName - The name of the main service.
 * @param {object} config - Configuration options.
 * @returns {EnterpriseLogger} The global logger instance.
 */
export function initializeGlobalLogger(serviceName = 'application', config = {}) {
  if (!globalLogger) {
    // CRITICAL FIX: Ensure database logging is safe on initial setup
    globalLogger = new EnterpriseLogger(serviceName, {
      ...config,
      logToDatabase: config.logToDatabase !== undefined ? config.logToDatabase : false 
    });
    globalLoggerPromise = Promise.resolve(globalLogger);
  } else {
    // Update service name if necessary
    globalLogger.serviceName = normalizeServiceName(serviceName || globalLogger.serviceName);
  }
  return globalLogger;
}

/**
 * Accessor for the global logger instance with self-healing fallback.
 * If called before initializeGlobalLogger, it performs a minimal synchronous setup.
 * @param {string} serviceName - Optional service name for the fallback logger.
 * @returns {EnterpriseLogger} The global logger instance.
 */
export function getGlobalLogger(serviceName = 'System.EarlyInit') {
  if (!globalLogger) {
    // 💡 Self-Healing Logger Access: Prevents fatal crash.
    console.error(`⚠️ CRITICAL: Global logger accessed before initialization. Performing self-healing fallback setup for service: ${normalizeServiceName(serviceName)}.`);

    // Synchronously initialize the logger with safe defaults
    initializeGlobalLogger(serviceName, {
      logToDatabase: false // Enforce safety during fallback initialization
    });

    console.warn(`Global Logger accessed before main setup. Using fallback configuration for: ${normalizeServiceName(serviceName)}`);
  }
  return globalLogger;
}

/**
 * Attempts to set up and enable database logging on the global logger instance.
 * @param {*} database - The initialized database object (e.g., SQLite instance).
 */
export async function enableDatabaseLogging(database) {
  if (!globalLogger) {
    throw new Error('Global logger not initialized');
  }
  
  try {
    // Set the database instance and trigger deferred initialization/queue processing
    await globalLogger.setDatabase(database);
    globalLogger.config.logToDatabase = true;
    
    // Explicitly mark ready and process queue
    await globalLogger.markDatabaseReady();
    
    globalLogger.info('✅ Database logging enabled successfully');
    return globalLogger;
  } catch (error) {
    globalLogger.error('❌ Failed to enable database logging.', { error: error.message });
    throw error;
  }
}

/**
 * Safe wrapper for main.js to enable database logging, preventing application crash.
 * It uses the self-healing getGlobalLogger() and catches internal errors.
 * @param {*} database - The initialized database object.
 */
export async function enableDatabaseLoggingSafely(database) {
  const logger = getGlobalLogger();
  
  try {
    if (!database) {
      logger.warn('⚠️ Database not provided for logging, skipping database logging setup.');
      return;
    }

    await enableDatabaseLogging(database);
    
  } catch (error) {
    // Error already logged internally, just ensuring process continues
    logger.warn('⚠️ Database logging initialization failed (Error already logged), continuing without it.');
  }
}
