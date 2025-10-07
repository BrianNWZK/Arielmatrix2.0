// modules/database-initializer.js
import { initializeDatabase, getDatabase, createDatabase } from '../../database/BrianNwaezikeDB.js';
import { getArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { createLogger, format, transports } from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced logger for database initialization
const initLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.File({ 
      filename: 'logs/database-init.log',
      maxsize: 10485760,
      maxFiles: 3
    }),
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp(),
        format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [DB-INIT/${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta) : ''}`;
        })
      )
    })
  ]
});

/**
 * Enhanced Database Initializer with comprehensive error handling
 * and production-grade connection management
 */
class DatabaseInitializer {
  constructor() {
    this.mainDb = null;
    this.arielEngine = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.healthCheckInterval = null;
  }

  /**
   * 🎯 CRITICAL FIX: Enhanced initialization with proper error recovery
   */
  async initializeAllDatabases(config = {}) {
    // Prevent multiple simultaneous initializations
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        initLogger.info('Starting comprehensive database initialization...');

        // Step 1: Initialize main database with enhanced configuration
        initLogger.info('Initializing main database...');
        this.mainDb = await initializeDatabase({
          database: {
            path: './data/main',
            numberOfShards: 4,
            backup: {
              enabled: true,
              retentionDays: 7
            },
            ...config.database
          },
          logging: {
            level: 'info'
          }
        });

        // Step 2: Initialize Ariel SQLite Engine
        initLogger.info('Initializing Ariel SQLite Engine...');
        this.arielEngine = getArielSQLiteEngine({
          dbPath: './data/ariel/transactions.db',
          backupPath: './backups/ariel',
          autoBackup: true,
          backupInterval: 3600000, // 1 hour
          maxBackups: 10
        });

        await this.arielEngine.connect();

        // Step 3: Create specialized databases for different services
        initLogger.info('Creating specialized databases...');
        await this.createSpecializedDatabases();

        // Step 4: Verify all connections
        initLogger.info('Verifying database connections...');
        await this.verifyConnections();

        // Step 5: Start health monitoring
        this.startHealthMonitoring();

        this.initialized = true;
        
        initLogger.info('All databases initialized successfully', {
          mainDb: true,
          arielEngine: true,
          specializedDbs: true,
          timestamp: new Date().toISOString()
        });

        return {
          success: true,
          mainDb: this.mainDb,
          arielEngine: this.arielEngine,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        initLogger.error('Comprehensive database initialization failed', {
          error: error.message,
          stack: error.stack
        });

        // Attempt graceful cleanup
        await this.emergencyCleanup();

        throw new Error(`Database initialization failed: ${error.message}`);
      }
    })();

    return this.initializationPromise;
  }

  /**
   * Create specialized databases for different services
   */
  async createSpecializedDatabases() {
    const databases = [
      {
        path: './data/services/agent-registry.db',
        schema: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS agents (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              type TEXT NOT NULL,
              status TEXT DEFAULT 'active',
              capabilities TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              last_heartbeat DATETIME,
              config TEXT
            )
          `);
          
          db.exec(`
            CREATE TABLE IF NOT EXISTS agent_assignments (
              id TEXT PRIMARY KEY,
              agent_id TEXT NOT NULL,
              transaction_id TEXT NOT NULL,
              assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              completed_at DATETIME,
              status TEXT DEFAULT 'assigned',
              FOREIGN KEY (agent_id) REFERENCES agents (id)
            )
          `);
        }
      },
      {
        path: './data/services/transaction-queue.db',
        schema: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS transaction_queue (
              id TEXT PRIMARY KEY,
              transaction_data TEXT NOT NULL,
              priority INTEGER DEFAULT 1,
              status TEXT DEFAULT 'queued',
              retry_count INTEGER DEFAULT 0,
              max_retries INTEGER DEFAULT 3,
              next_retry_at DATETIME,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              processed_at DATETIME,
              error_message TEXT
            )
          `);
          
          db.exec('CREATE INDEX IF NOT EXISTS idx_queue_status ON transaction_queue(status)');
          db.exec('CREATE INDEX IF NOT EXISTS idx_queue_priority ON transaction_queue(priority)');
          db.exec('CREATE INDEX IF NOT EXISTS idx_queue_retry ON transaction_queue(next_retry_at)');
        }
      },
      {
        path: './data/services/analytics.db',
        schema: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS analytics_events (
              id TEXT PRIMARY KEY,
              event_type TEXT NOT NULL,
              event_data TEXT NOT NULL,
              user_agent TEXT,
              ip_address TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);
          
          db.exec(`
            CREATE TABLE IF NOT EXISTS performance_metrics (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              metric_name TEXT NOT NULL,
              metric_value REAL NOT NULL,
              timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
              tags TEXT
            )
          `);
        }
      }
    ];

    for (const dbConfig of databases) {
      try {
        await createDatabase(dbConfig.path, dbConfig.schema);
        initLogger.info(`Specialized database created: ${dbConfig.path}`);
      } catch (error) {
        initLogger.error(`Failed to create specialized database: ${dbConfig.path}`, {
          error: error.message
        });
        // Continue with other databases even if one fails
      }
    }
  }

  /**
   * 🎯 CRITICAL FIX: Enhanced connection verification
   */
  async verifyConnections() {
    const verificationResults = {
      mainDb: false,
      arielEngine: false,
      specializedDbs: true // We'll check these individually
    };

    try {
      // Verify main database
      if (this.mainDb) {
        const stats = await this.mainDb.getStats();
        verificationResults.mainDb = stats.healthyShards > 0;
        initLogger.info('Main database verified', { 
          healthyShards: stats.healthyShards,
          totalShards: stats.totalShards 
        });
      }

      // Verify Ariel engine
      if (this.arielEngine) {
        const health = await this.arielEngine.healthCheck();
        verificationResults.arielEngine = health.status === 'healthy';
        initLogger.info('Ariel engine verified', { 
          status: health.status,
          pendingTransactions: health.details?.pendingTransactions 
        });
      }

      // Verify specialized databases
      const specializedDbs = [
        './data/services/agent-registry.db',
        './data/services/transaction-queue.db',
        './data/services/analytics.db'
      ];

      for (const dbPath of specializedDbs) {
        try {
          const dbManager = this.mainDb.getDatabaseManager(dbPath);
          // Simple query to verify connection
          await dbManager.get('SELECT 1 as verification');
          initLogger.debug(`Specialized database verified: ${dbPath}`);
        } catch (error) {
          verificationResults.specializedDbs = false;
          initLogger.error(`Specialized database verification failed: ${dbPath}`, {
            error: error.message
          });
        }
      }

      // Check overall status
      const allVerified = Object.values(verificationResults).every(v => v === true);
      
      if (!allVerified) {
        initLogger.warn('Some database connections failed verification', {
          verificationResults
        });
        
        // Attempt to recover failed connections
        await this.recoverFailedConnections(verificationResults);
      }

      return verificationResults;

    } catch (error) {
      initLogger.error('Database verification failed', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Enhanced recovery for failed connections
   */
  async recoverFailedConnections(verificationResults) {
    initLogger.info('Attempting to recover failed database connections...');

    const recoveryAttempts = [];

    // Recover main database if needed
    if (!verificationResults.mainDb && this.mainDb) {
      recoveryAttempts.push(
        (async () => {
          try {
            await this.mainDb.close();
            this.mainDb = await initializeDatabase();
            initLogger.info('Main database recovery successful');
            return true;
          } catch (error) {
            initLogger.error('Main database recovery failed', { error: error.message });
            return false;
          }
        })()
      );
    }

    // Recover Ariel engine if needed
    if (!verificationResults.arielEngine && this.arielEngine) {
      recoveryAttempts.push(
        (async () => {
          try {
            await this.arielEngine.close();
            this.arielEngine = getArielSQLiteEngine();
            await this.arielEngine.connect();
            initLogger.info('Ariel engine recovery successful');
            return true;
          } catch (error) {
            initLogger.error('Ariel engine recovery failed', { error: error.message });
            return false;
          }
        })()
      );
    }

    // Wait for all recovery attempts
    const results = await Promise.allSettled(recoveryAttempts);
    const successfulRecoveries = results.filter(r => r.status === 'fulfilled' && r.value).length;

    initLogger.info('Database recovery completed', {
      attempted: recoveryAttempts.length,
      successful: successfulRecoveries
    });

    return successfulRecoveries > 0;
  }

  /**
   * Enhanced health monitoring
   */
  startHealthMonitoring() {
    // Clear existing interval if any
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Health check every 30 seconds
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        initLogger.error('Health check interval failed', { error: error.message });
      }
    }, 30000);

    initLogger.info('Database health monitoring started');
  }

  async performHealthCheck() {
    const healthResults = {
      timestamp: new Date().toISOString(),
      mainDb: { status: 'unknown', details: {} },
      arielEngine: { status: 'unknown', details: {} },
      overall: 'unknown'
    };

    try {
      // Check main database
      if (this.mainDb) {
        try {
          const stats = await this.mainDb.getStats();
          healthResults.mainDb = {
            status: stats.healthyShards > 0 ? 'healthy' : 'degraded',
            details: stats
          };
        } catch (error) {
          healthResults.mainDb = {
            status: 'unhealthy',
            details: { error: error.message }
          };
        }
      }

      // Check Ariel engine
      if (this.arielEngine) {
        try {
          const health = await this.arielEngine.healthCheck();
          healthResults.arielEngine = {
            status: health.status,
            details: health
          };
        } catch (error) {
          healthResults.arielEngine = {
            status: 'unhealthy',
            details: { error: error.message }
          };
        }
      }

      // Determine overall status
      const allHealthy = [healthResults.mainDb, healthResults.arielEngine]
        .every(h => h.status === 'healthy');
      
      const anyUnhealthy = [healthResults.mainDb, healthResults.arielEngine]
        .some(h => h.status === 'unhealthy');

      healthResults.overall = allHealthy ? 'healthy' : 
                             anyUnhealthy ? 'degraded' : 'unhealthy';

      // Log health status (debug level to avoid noise)
      initLogger.debug('Database health check completed', healthResults);

      // Take action if system is degraded or unhealthy
      if (healthResults.overall !== 'healthy') {
        initLogger.warn('Database health check indicates issues', healthResults);
        
        // Attempt automatic recovery for unhealthy components
        if (healthResults.mainDb.status === 'unhealthy') {
          initLogger.info('Attempting automatic recovery for main database...');
          await this.recoverMainDatabase();
        }
        
        if (healthResults.arielEngine.status === 'unhealthy') {
          initLogger.info('Attempting automatic recovery for Ariel engine...');
          await this.recoverArielEngine();
        }
      }

      return healthResults;

    } catch (error) {
      initLogger.error('Health check failed', { error: error.message });
      return {
        ...healthResults,
        overall: 'error',
        error: error.message
      };
    }
  }

  /**
   * Enhanced recovery methods
   */
  async recoverMainDatabase() {
    try {
      if (this.mainDb) {
        await this.mainDb.close();
      }
      
      this.mainDb = await initializeDatabase();
      initLogger.info('Main database recovery completed successfully');
      return true;
    } catch (error) {
      initLogger.error('Main database recovery failed', { error: error.message });
      return false;
    }
  }

  async recoverArielEngine() {
    try {
      if (this.arielEngine) {
        await this.arielEngine.close();
      }
      
      this.arielEngine = getArielSQLiteEngine();
      await this.arielEngine.connect();
      initLogger.info('Ariel engine recovery completed successfully');
      return true;
    } catch (error) {
      initLogger.error('Ariel engine recovery failed', { error: error.message });
      return false;
    }
  }

  /**
   * 🎯 CRITICAL FIX: Enhanced emergency cleanup
   */
  async emergencyCleanup() {
    initLogger.info('Performing emergency database cleanup...');

    const cleanupTasks = [];

    // Close main database
    if (this.mainDb) {
      cleanupTasks.push(
        this.mainDb.close().catch(error => {
          initLogger.error('Error closing main database during emergency cleanup', {
            error: error.message
          });
        })
      );
    }

    // Close Ariel engine
    if (this.arielEngine) {
      cleanupTasks.push(
        this.arielEngine.close().catch(error => {
          initLogger.error('Error closing Ariel engine during emergency cleanup', {
            error: error.message
          });
        })
      );
    }

    // Clear health check interval
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Wait for all cleanup tasks
    await Promise.allSettled(cleanupTasks);

    this.initialized = false;
    this.initializationPromise = null;

    initLogger.info('Emergency database cleanup completed');
  }

  /**
   * Enhanced graceful shutdown
   */
  async shutdown() {
    initLogger.info('Initiating database shutdown...');

    // Clear health monitoring
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Perform final backups
    try {
      if (this.mainDb) {
        await this.mainDb.backup();
      }
      if (this.arielEngine) {
        await this.arielEngine.backup();
      }
      initLogger.info('Final database backups completed');
    } catch (error) {
      initLogger.error('Final backup failed', { error: error.message });
    }

    // Close all database connections
    await this.emergencyCleanup();

    initLogger.info('Database shutdown completed successfully');
  }

  /**
   * Get database instances
   */
  getMainDatabase() {
    if (!this.initialized || !this.mainDb) {
      throw new Error('Main database not initialized');
    }
    return this.mainDb;
  }

  getArielEngine() {
    if (!this.initialized || !this.arielEngine) {
      throw new Error('Ariel engine not initialized');
    }
    return this.arielEngine;
  }

  /**
   * 🎯 CRITICAL FIX: Enhanced status check
   */
  getStatus() {
    return {
      initialized: this.initialized,
      mainDb: !!this.mainDb,
      arielEngine: !!this.arielEngine,
      healthMonitoring: !!this.healthCheckInterval,
      timestamp: new Date().toISOString()
    };
  }
}

// Export singleton instance
let databaseInitializer = null;

export function getDatabaseInitializer() {
  if (!databaseInitializer) {
    databaseInitializer = new DatabaseInitializer();
  }
  return databaseInitializer;
}

export default DatabaseInitializer;
