// modules/enterprise-logger/index.js
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

  async deferDatabaseInitialization() {
    // Wait a bit for database to potentially initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    if (this.config.logToDatabase && this.db) {
      try {
        await this.initializeDatabaseLogging();
        this.databaseReady = true;
        console.log(`Database logging initialized for service: ${this.serviceName}`);
        
        // Process any queued logs
        await this.processLogQueue();
      } catch (error) {
        console.warn(`Database logging deferred for service ${this.serviceName}:`, error.message);
        // Retry later
        setTimeout(() => this.deferDatabaseInitialization(), 5000);
      }
    }
  }

  async initializeDatabaseLogging() {
    if (!this.db) {
      throw new Error('Database instance not provided');
    }

    try {
      // Check if database is initialized by making a simple query
      await this.db.get('SELECT 1 as test');
      
      // Create logs table if it doesn't exist
      await this.db.run(`
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
      await this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_logs_level ON application_logs(level)
      `);
      await this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_logs_service ON application_logs(service)
      `);
      await this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_logs_timestamp ON application_logs(timestamp)
      `);

      console.log('Database logging initialized successfully');

    } catch (error) {
      console.error('Database logging initialization failed:', error.message);
      throw error;
    }
  }

  async setDatabase(database) {
    this.db = database;
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
      await this.db.run(
        'INSERT INTO application_logs (level, service, message, meta, context) VALUES (?, ?, ?, ?, ?)',
        [level, this.serviceName, message, JSON.stringify(meta), meta.context || '']
      );

      // Also publish to pub/sub for real-time log aggregation if enabled
      if (this.config.enableRealtime && this.db && typeof this.db.publish === 'function') {
        try {
          await this.db.publish('logging', {
            level,
            message,
            meta,
            service: this.serviceName,
            timestamp: new Date().toISOString()
          });
        } catch (pubSubError) {
          // Non-critical, just log it
          console.warn('Log publishing failed:', pubSubError.message);
        }
      }

    } catch (error) {
      console.error('Database logging failed:', error.message);
      // Fallback to file logging if database fails
      this.logger.error('Database logging failed', { error: error.message });
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
      return await this.db.all(query, params);
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
      return await this.db.all(`
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
      service: this.serviceName,
      timestamp: new Date().toISOString()
    };

    if (this.databaseReady && this.db) {
      try {
        await this.db.get('SELECT 1 as test');
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

export async function initializeGlobalLogger(serviceName = 'application', config = {}) {
  if (!globalLogger) {
    // Create logger with file logging only initially
    globalLogger = new EnterpriseLogger(serviceName, {
      ...config,
      logToDatabase: false // Disable database logging initially
    });
    
    globalLoggerPromise = Promise.resolve(globalLogger);
  }
  return globalLogger;
}

export function getGlobalLogger() {
  if (!globalLogger) {
    throw new Error('Global logger not initialized. Call initializeGlobalLogger first.');
  }
  return globalLogger;
}

export async function enableDatabaseLogging(database) {
  if (!globalLogger) {
    throw new Error('Global logger not initialized');
  }
  
  await globalLogger.setDatabase(database);
  globalLogger.config.logToDatabase = true;
  await globalLogger.markDatabaseReady();
  
  return globalLogger;
}
