// modules/enterprise-logger/index.js
import winston from 'winston';
import { createWriteStream } from 'fs';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';

export class EnterpriseLogger {
  constructor(serviceName = 'application', config = {}) {
    this.serviceName = serviceName;
    this.config = {
      logLevel: config.logLevel || 'info',
      logToDatabase: config.logToDatabase !== false,
      ...config
    };

    this.db = config.database || new ArielSQLiteEngine();
    this.logger = null;

    this.initializeLogger();
  }

  async initializeLogger() {
    const transports = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.timestamp(),
          winston.format.printf(({ timestamp, level, message, ...meta }) => {
            return `${timestamp} [${level}] ${this.serviceName}: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta) : ''
            }`;
          })
        )
      }),
      
      new winston.transports.File({
        filename: `logs/${this.serviceName}-error.log`,
        level: 'error',
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      }),
      
      new winston.transports.File({
        filename: `logs/${this.serviceName}-combined.log`,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.json()
        )
      })
    ];

    this.logger = winston.createLogger({
      level: this.config.logLevel,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      ),
      defaultMeta: { service: this.serviceName },
      transports
    });

    // Initialize database logging if enabled
    if (this.config.logToDatabase) {
      await this.initializeDatabaseLogging();
    }

    // Subscribe to log events from other services
    await this.subscribeToLogEvents();
  }

  async subscribeToLogEvents() {
    await this.db.subscribe('logging', this.serviceName, async (message) => {
      if (message.level && message.message) {
        this.logger.log(message.level, message.message, message.meta || {});
      }
    });
  }

  async logToDatabase(level, message, meta = {}) {
    if (!this.config.logToDatabase) return;

    try {
      await this.db.run(
        'INSERT INTO application_logs (level, service, message, meta, context) VALUES (?, ?, ?, ?, ?)',
        [level, this.serviceName, message, JSON.stringify(meta), meta.context || '']
      );

      // Also publish to pub/sub for real-time log aggregation
      await this.db.publish('logging', {
        level,
        message,
        meta,
        service: this.serviceName,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Database logging failed:', error.message);
    }
  }

  async queryLogs(options = {}) {
    const {
      level,
      startTime,
      endTime,
      service,
      messageContains,
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

    query += ' ORDER BY timestamp DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return await this.db.all(query, params);
  }

  async getLogStatistics(timeRange = '24 hours') {
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
  }

  // Keep all other methods
}
