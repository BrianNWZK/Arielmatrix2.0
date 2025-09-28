// modules/enterprise-logger/index.js
import winston from 'winston';
import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';

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
      ...config
    };

    this.db = config.database || new ArielSQLiteEngine();
    this.logger = null;
    this.isInitialized = false;
    this.logQueue = [];
    this.isProcessingQueue = false;

    // Ensure logs directory exists
    this.ensureLogsDirectory();

    this.initializeLogger();
  }

  ensureLogsDirectory() {
    const logsDir = 'logs';
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }
  }

  async initializeLogger() {
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

      // Initialize database logging if enabled
      if (this.config.logToDatabase) {
        await this.initializeDatabaseLogging();
      }

      // Subscribe to log events from other services
      if (this.config.enableRealtime) {
        await this.subscribeToLogEvents();
      }

      this.isInitialized = true;
      
      // Process any queued logs
      await this.processLogQueue();

    } catch (error) {
      console.error('Logger initialization failed:', error);
      throw error;
    }
  }

  async initializeDatabaseLogging() {
    try {
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
      await this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_logs_context ON application_logs(context)
      `);

      console.log('Database logging initialized successfully');

    } catch (error) {
      console.error('Database logging initialization failed:', error);
      throw error;
    }
  }

  async subscribeToLogEvents() {
    try {
      if (this.db && typeof this.db.subscribe === 'function') {
        await this.db.subscribe('logging', this.serviceName, async (message) => {
          try {
            if (message.level && message.message) {
              this.logger.log(message.level, message.message, message.meta || {});
            }
          } catch (error) {
            console.error('Log subscription handler error:', error);
          }
        });
        console.log('Log events subscription initialized');
      }
    } catch (error) {
      console.error('Log events subscription failed:', error);
    }
  }

  async log(level, message, meta = {}) {
    // If logger is not initialized, queue the log
    if (!this.isInitialized) {
      this.logQueue.push({ level, message, meta });
      return;
    }

    try {
      // Log to winston
      this.logger.log(level, message, meta);

      // Log to database if enabled
      if (this.config.logToDatabase) {
        await this.logToDatabase(level, message, meta);
      }
    } catch (error) {
      console.error('Logging failed:', error);
    }
  }

  async logToDatabase(level, message, meta = {}) {
    if (!this.config.logToDatabase) return;

    try {
      await this.db.run(
        'INSERT INTO application_logs (level, service, message, meta, context) VALUES (?, ?, ?, ?, ?)',
        [level, this.serviceName, message, JSON.stringify(meta), meta.context || '']
      );

      // Also publish to pub/sub for real-time log aggregation if enabled
      if (this.config.enableRealtime && this.db && typeof this.db.publish === 'function') {
        await this.db.publish('logging', {
          level,
          message,
          meta,
          service: this.serviceName,
          timestamp: new Date().toISOString()
        });
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

  // Query methods
  async queryLogs(options = {}) {
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

  async getServiceStatistics(timeRange = '24 hours') {
    try {
      return await this.db.all(`
        SELECT 
          service,
          level,
          COUNT(*) as count
        FROM application_logs 
        WHERE timestamp >= datetime('now', ?)
        GROUP BY service, level
        ORDER BY service, count DESC
      `, [`-${timeRange}`]);
    } catch (error) {
      console.error('Service statistics query failed:', error);
      throw error;
    }
  }

  async cleanupOldLogs(retentionDays = 30) {
    try {
      const result = await this.db.run(
        'DELETE FROM application_logs WHERE timestamp < datetime("now", ?)',
        [`-${retentionDays} days`]
      );
      
      console.log(`Cleaned up ${result.changes} old log entries`);
      return result.changes;
    } catch (error) {
      console.error('Log cleanup failed:', error);
      throw error;
    }
  }

  async getErrorTrends(timeRange = '7 days') {
    try {
      return await this.db.all(`
        SELECT 
          date(timestamp) as date,
          level,
          COUNT(*) as count
        FROM application_logs 
        WHERE timestamp >= datetime('now', ?)
          AND level IN ('error', 'warn')
        GROUP BY date(timestamp), level
        ORDER BY date DESC
      `, [`-${timeRange}`]);
    } catch (error) {
      console.error('Error trends query failed:', error);
      throw error;
    }
  }

  // Health check method
  async healthCheck() {
    try {
      // Test database connection
      await this.db.get('SELECT 1 as test');
      
      // Test file system access
      const testLog = `logs/${this.serviceName}-healthcheck.test`;
      const fs = await import('fs').then(mod => mod.promises);
      await fs.writeFile(testLog, 'healthcheck');
      await fs.unlink(testLog);

      return {
        status: 'healthy',
        database: 'connected',
        fileSystem: 'accessible',
        service: this.serviceName,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        service: this.serviceName,
        timestamp: new Date().toISOString()
      };
    }
  }

  // Close method for cleanup
  async close() {
    try {
      if (this.logger) {
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

// Export a singleton instance for global use
export let globalLogger = null;

export function initializeGlobalLogger(serviceName = 'application', config = {}) {
  if (!globalLogger) {
    globalLogger = new EnterpriseLogger(serviceName, config);
  }
  return globalLogger;
}

export function getGlobalLogger() {
  if (!globalLogger) {
    throw new Error('Global logger not initialized. Call initializeGlobalLogger first.');
  }
  return globalLogger;
}
