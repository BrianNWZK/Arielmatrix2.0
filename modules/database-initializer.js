// modules/database-initializer.js
import { initializeDatabase, getDatabase, createDatabase } from '../backend/database/BrianNwaezikeDB.js';
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
 * 🎯 ENTERPRISE DATABASE INITIALIZER WITH UNIFIED INTERFACE
 * @description Production-grade database management with standardized methods
 * SOLVES: "this.db.init is not a function" and provides unified interface
 */
class DatabaseInitializer {
  constructor() {
    this.mainDb = null;
    this.arielEngine = null;
    this.initialized = false;
    this.initializationPromise = null;
    this.healthCheckInterval = null;
    this.serviceDatabases = new Map();
    this.unifiedInterfaces = new Map();
  }

  /**
   * 🎯 CRITICAL FIX: Enhanced initialization with unified interface
   */
  async initializeAllDatabases(config = {}) {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        initLogger.info('Starting comprehensive database initialization with unified interface...');

        // Step 1: Initialize main database
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
          backupInterval: 3600000,
          maxBackups: 10
        });

        await this.arielEngine.connect();

        // Step 3: Create specialized databases for different services
        initLogger.info('Creating specialized databases with unified interfaces...');
        await this.createSpecializedDatabases();

        // Step 4: Create unified interfaces for all modules
        await this.createUnifiedInterfaces();

        // Step 5: Verify all connections
        initLogger.info('Verifying database connections...');
        await this.verifyConnections();

        // Step 6: Start health monitoring
        this.startHealthMonitoring();

        this.initialized = true;
        
        initLogger.info('All databases initialized successfully with unified interfaces', {
          mainDb: true,
          arielEngine: true,
          specializedDbs: this.serviceDatabases.size,
          unifiedInterfaces: this.unifiedInterfaces.size,
          timestamp: new Date().toISOString()
        });

        return {
          success: true,
          mainDb: this.mainDb,
          arielEngine: this.arielEngine,
          unifiedInterfaces: Object.fromEntries(this.unifiedInterfaces),
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        initLogger.error('Comprehensive database initialization failed', {
          error: error.message,
          stack: error.stack
        });

        await this.emergencyCleanup();
        throw new Error(`Database initialization failed: ${error.message}`);
      }
    })();

    return this.initializationPromise;
  }

  /**
   * 🎯 UNIFIED INTERFACE CREATION - SOLVES "this.db.init is not a function"
   */
  async createUnifiedInterfaces() {
    const serviceConfigs = [
      {
        name: 'ai-security-module',
        type: 'specialized',
        dbPath: './data/services/security-module.db',
        methods: ['run', 'all', 'get', 'init', 'close']
      },
      {
        name: 'ai-threat-detector', 
        type: 'specialized',
        dbPath: './data/services/threat-detector.db',
        methods: ['run', 'all', 'get', 'init', 'close']
      },
      {
        name: 'quantum-shield',
        type: 'specialized', 
        dbPath: './data/services/quantum-shield.db',
        methods: ['run', 'all', 'get', 'init', 'close']
      },
      {
        name: 'quantum-crypto',
        type: 'ariel',
        methods: ['run', 'all', 'get', 'init', 'close']
      },
      {
        name: 'cross-chain-bridge',
        type: 'main',
        methods: ['run', 'all', 'get', 'init', 'close']
      }
    ];

    for (const config of serviceConfigs) {
      try {
        const unifiedInterface = this.createUnifiedInterface(config);
        this.unifiedInterfaces.set(config.name, unifiedInterface);
        
        initLogger.info(`Created unified interface for: ${config.name}`, {
          type: config.type,
          methods: config.methods
        });
      } catch (error) {
        initLogger.error(`Failed to create unified interface for: ${config.name}`, {
          error: error.message
        });
      }
    }
  }

  /**
   * 🎯 CREATE UNIFIED DATABASE INTERFACE FOR EACH MODULE
   */
  createUnifiedInterface(config) {
    const interfaceMethods = {
      // 🎯 CRITICAL FIX: Standardized init method that modules expect
      init: async () => {
        try {
          switch (config.type) {
            case 'main':
              if (!this.mainDb) {
                throw new Error('Main database not initialized');
              }
              return this.mainDb;
            case 'ariel':
              if (!this.arielEngine) {
                throw new Error('Ariel engine not initialized');
              }
              return this.arielEngine;
            case 'specialized':
              const specializedDb = this.serviceDatabases.get(config.name);
              if (!specializedDb) {
                throw new Error(`Specialized database not found: ${config.name}`);
              }
              return specializedDb;
            default:
              throw new Error(`Unknown database type: ${config.type}`);
          }
        } catch (error) {
          initLogger.error(`Unified interface init failed for ${config.name}`, {
            error: error.message
          });
          throw error;
        }
      },

      // 🎯 STANDARDIZED DATABASE METHODS
      run: async (sql, params = []) => {
        const db = await this.getDatabaseInstance(config);
        if (typeof db.run === 'function') {
          return db.run(sql, params);
        } else if (typeof db.exec === 'function') {
          // Fallback for different method names
          return db.exec(sql, params);
        } else {
          throw new Error(`Database instance missing run/exec method for ${config.name}`);
        }
      },

      all: async (sql, params = []) => {
        const db = await this.getDatabaseInstance(config);
        if (typeof db.all === 'function') {
          return db.all(sql, params);
        } else {
          throw new Error(`Database instance missing all method for ${config.name}`);
        }
      },

      get: async (sql, params = []) => {
        const db = await this.getDatabaseInstance(config);
        if (typeof db.get === 'function') {
          return db.get(sql, params);
        } else {
          throw new Error(`Database instance missing get method for ${config.name}`);
        }
      },

      close: async () => {
        try {
          const db = await this.getDatabaseInstance(config);
          if (typeof db.close === 'function') {
            await db.close();
          }
          initLogger.info(`Database connection closed for: ${config.name}`);
        } catch (error) {
          initLogger.warn(`Error closing database for ${config.name}:`, error.message);
        }
      },

      // Health check method
      healthCheck: async () => {
        try {
          const db = await this.getDatabaseInstance(config);
          const result = await this.getDatabaseInstance(config).get('SELECT 1 as health_check');
          return {
            healthy: true,
            service: config.name,
            timestamp: new Date().toISOString()
          };
        } catch (error) {
          return {
            healthy: false,
            service: config.name,
            error: error.message,
            timestamp: new Date().toISOString()
          };
        }
      }
    };

    return interfaceMethods;
  }

  /**
   * Get appropriate database instance based on configuration
   */
  async getDatabaseInstance(config) {
    if (!this.initialized) {
      await this.initializeAllDatabases();
    }

    switch (config.type) {
      case 'main':
        if (!this.mainDb) {
          throw new Error('Main database not available');
        }
        return this.mainDb;
      case 'ariel':
        if (!this.arielEngine) {
          throw new Error('Ariel engine not available');
        }
        return this.arielEngine;
      case 'specialized':
        const specializedDb = this.serviceDatabases.get(config.name);
        if (!specializedDb) {
          throw new Error(`Specialized database not found: ${config.name}`);
        }
        return specializedDb;
      default:
        throw new Error(`Unknown database type: ${config.type}`);
    }
  }

  /**
   * Create specialized databases for different services
   */
  async createSpecializedDatabases() {
    const databases = [
      {
        name: 'ai-security-module',
        path: './data/services/security-module.db',
        schema: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS security_incidents (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              incident_id TEXT UNIQUE NOT NULL,
              incident_type TEXT NOT NULL,
              severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
              description TEXT NOT NULL,
              affected_systems TEXT NOT NULL,
              root_cause TEXT,
              impact_assessment TEXT,
              response_taken TEXT NOT NULL,
              resolved BOOLEAN DEFAULT FALSE,
              resolution_notes TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              resolved_at DATETIME,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);
          
          db.exec(`
            CREATE TABLE IF NOT EXISTS incident_response_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              incident_id TEXT NOT NULL,
              action_type TEXT NOT NULL,
              action_details TEXT NOT NULL,
              executed_by TEXT DEFAULT 'system',
              execution_time INTEGER NOT NULL,
              success BOOLEAN DEFAULT TRUE,
              error_message TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          db.exec('CREATE INDEX IF NOT EXISTS idx_security_severity ON security_incidents(severity)');
          db.exec('CREATE INDEX IF NOT EXISTS idx_security_incident_type ON security_incidents(incident_type)');
        }
      },
      {
        name: 'ai-threat-detector',
        path: './data/services/threat-detector.db',
        schema: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS threat_detection_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              detection_id TEXT UNIQUE NOT NULL,
              threat_type TEXT NOT NULL,
              confidence REAL NOT NULL,
              severity TEXT NOT NULL,
              log_data TEXT,
              features TEXT,
              prediction_results TEXT,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);
          
          db.exec(`
            CREATE TABLE IF NOT EXISTS model_training_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              training_id TEXT NOT NULL,
              model_version TEXT NOT NULL,
              sample_count INTEGER NOT NULL,
              accuracy REAL,
              loss REAL,
              training_time INTEGER,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);

          db.exec('CREATE INDEX IF NOT EXISTS idx_threat_severity ON threat_detection_events(severity)');
          db.exec('CREATE INDEX IF NOT EXISTS idx_threat_confidence ON threat_detection_events(confidence)');
        }
      },
      {
        name: 'quantum-shield',
        path: './data/services/quantum-shield.db',
        schema: (db) => {
          db.exec(`
            CREATE TABLE IF NOT EXISTS quantum_security_events (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              event_id TEXT UNIQUE NOT NULL,
              event_type TEXT NOT NULL,
              transaction_hash TEXT,
              risk_score REAL NOT NULL,
              mitigation_applied TEXT,
              status TEXT DEFAULT 'processed',
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
          `);
          
          db.exec('CREATE INDEX IF NOT EXISTS idx_quantum_risk_score ON quantum_security_events(risk_score)');
          db.exec('CREATE INDEX IF NOT EXISTS idx_quantum_event_type ON quantum_security_events(event_type)');
        }
      },
      {
        name: 'agent-registry',
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
      }
    ];

    for (const dbConfig of databases) {
      try {
        const database = await createDatabase(dbConfig.path, dbConfig.schema);
        this.serviceDatabases.set(dbConfig.name, database);
        initLogger.info(`Specialized database created: ${dbConfig.name}`, {
          path: dbConfig.path
        });
      } catch (error) {
        initLogger.error(`Failed to create specialized database: ${dbConfig.name}`, {
          error: error.message
        });
      }
    }
  }

  /**
   * 🎯 GET UNIFIED INTERFACE FOR MODULES - MAIN ENTRY POINT
   * This is what modules will use to get their database interface
   */
  getUnifiedInterface(serviceName) {
    if (!this.initialized) {
      throw new Error('Database initializer not initialized. Call initializeAllDatabases() first.');
    }

    const unifiedInterface = this.unifiedInterfaces.get(serviceName);
    if (!unifiedInterface) {
      throw new Error(`No unified database interface found for service: ${serviceName}`);
    }

    initLogger.debug(`Providing unified interface for: ${serviceName}`);
    return unifiedInterface;
  }

  /**
   * Enhanced connection verification
   */
  async verifyConnections() {
    const verificationResults = {
      mainDb: false,
      arielEngine: false,
      specializedDbs: {},
      unifiedInterfaces: {}
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
          status: health.status
        });
      }

      // Verify specialized databases
      for (const [name, db] of this.serviceDatabases) {
        try {
          await db.get('SELECT 1 as verification');
          verificationResults.specializedDbs[name] = true;
          initLogger.debug(`Specialized database verified: ${name}`);
        } catch (error) {
          verificationResults.specializedDbs[name] = false;
          initLogger.error(`Specialized database verification failed: ${name}`, {
            error: error.message
          });
        }
      }

      // Verify unified interfaces
      for (const [name, interface] of this.unifiedInterfaces) {
        try {
          const health = await interface.healthCheck();
          verificationResults.unifiedInterfaces[name] = health.healthy;
          initLogger.debug(`Unified interface verified: ${name}`, { health });
        } catch (error) {
          verificationResults.unifiedInterfaces[name] = false;
          initLogger.error(`Unified interface verification failed: ${name}`, {
            error: error.message
          });
        }
      }

      // Check overall status
      const allVerified = Object.values(verificationResults).every(v => 
        typeof v === 'boolean' ? v : Object.values(v).every(Boolean)
      );
      
      if (!allVerified) {
        initLogger.warn('Some database connections failed verification', {
          verificationResults
        });
        
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
      recoveryAttempts.push(this.recoverMainDatabase());
    }

    // Recover Ariel engine if needed
    if (!verificationResults.arielEngine && this.arielEngine) {
      recoveryAttempts.push(this.recoverArielEngine());
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
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

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
      unifiedInterfaces: {},
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

      // Check unified interfaces
      for (const [name, interface] of this.unifiedInterfaces) {
        try {
          const health = await interface.healthCheck();
          healthResults.unifiedInterfaces[name] = health;
        } catch (error) {
          healthResults.unifiedInterfaces[name] = {
            healthy: false,
            error: error.message
          };
        }
      }

      // Determine overall status
      const allHealthy = [
        healthResults.mainDb, 
        healthResults.arielEngine,
        ...Object.values(healthResults.unifiedInterfaces)
      ].every(h => h.status === 'healthy' || h.healthy === true);
      
      healthResults.overall = allHealthy ? 'healthy' : 'degraded';

      initLogger.debug('Database health check completed', healthResults);

      if (healthResults.overall !== 'healthy') {
        initLogger.warn('Database health check indicates issues', healthResults);
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
   * Enhanced emergency cleanup
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

    // Close specialized databases
    for (const [name, db] of this.serviceDatabases) {
      if (typeof db.close === 'function') {
        cleanupTasks.push(
          db.close().catch(error => {
            initLogger.error(`Error closing specialized database ${name} during emergency cleanup`, {
              error: error.message
            });
          })
        );
      }
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
    this.serviceDatabases.clear();
    this.unifiedInterfaces.clear();

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
   * 🎯 ENHANCED STATUS CHECK WITH UNIFIED INTERFACE INFO
   */
  getStatus() {
    return {
      initialized: this.initialized,
      mainDb: !!this.mainDb,
      arielEngine: !!this.arielEngine,
      specializedDatabases: this.serviceDatabases.size,
      unifiedInterfaces: Array.from(this.unifiedInterfaces.keys()),
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
