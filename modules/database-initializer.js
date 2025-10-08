// modules/database-initializer.js

// PRODUCTION-READY DEPENDENCIES
import { initializeDatabase, getDatabase, createDatabase } from '../backend/database/BrianNwaezikeDB.js';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { BrianNwaezikeChain } from '../backend/blockchain/BrianNwaezikeChain.js';
import { createLogger, format, transports } from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Node.js environment setup
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// PRODUCTION LOGGER
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
 * ENTERPRISE DATABASE INITIALIZER
 * @description Production-grade database management with unified interfaces
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
    this.HEALTH_CHECK_CADENCE = 60000;
  }

  /**
   * COMPREHENSIVE DATABASE INITIALIZATION
   */
  async initializeAllDatabases(config = {}) {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        initLogger.info('Starting comprehensive database initialization...');

        // Initialize main database
        initLogger.info('Initializing Main BrianNwaezikeDB...');
        this.mainDb = await initializeDatabase({
          database: {
            path: './data/main',
            numberOfShards: 4,
            backup: { enabled: true, retentionDays: 7 },
            ...config.database
          },
          logging: { level: 'info' }
        });

        // Initialize Ariel SQLite Engine
        initLogger.info('Initializing Ariel SQLite Engine...');
        this.arielEngine = new ArielSQLiteEngine({
          dbPath: './data/ariel/transactions.db',
          backupPath: './backups/ariel',
          autoBackup: true,
          backupInterval: 3600000,
          maxBackups: 10
        });
        await this.arielEngine.connect();

        // Create specialized databases
        initLogger.info('Creating specialized service databases...');
        await this.createSpecializedDatabases();

        // Create unified interfaces
        await this.createUnifiedInterfaces();

        // Verify connections
        initLogger.info('Verifying all database connections...');
        await this.verifyConnections();

        // Start health monitoring
        this.startHealthMonitoring();

        this.initialized = true;
        initLogger.info('✅ All databases initialized successfully');
        
        return {
          success: true,
          mainDb: this.mainDb,
          arielEngine: this.arielEngine,
          unifiedInterfaces: Object.fromEntries(this.unifiedInterfaces),
        };
      } catch (error) {
        initLogger.error('Database initialization failed', {
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
   * CREATE SPECIALIZED DATABASES
   */
  async createSpecializedDatabases() {
    const dbConfigs = [
      { 
        name: 'ai-security-module', 
        dbPath: './data/services/ai-security-module.db'
      },
      { 
        name: 'ai-threat-detector', 
        dbPath: './data/services/ai-threat-detector.db'
      },
      { 
        name: 'quantum-shield', 
        dbPath: './data/services/quantum-shield.db'
      },
      { 
        name: 'cross-chain-bridge', 
        dbPath: './data/services/cross-chain-bridge.db'
      },
      { 
        name: 'mainnet-oracle', 
        dbPath: './data/services/mainnet-oracle.db'
      },
      { 
        name: 'enterprise-wallet', 
        dbPath: './data/services/enterprise-wallet.db'
      },
      { 
        name: 'quantum-crypto', 
        dbPath: './data/services/quantum-crypto.db'
      }
    ];

    await this.ensureDataDirectories();

    for (const config of dbConfigs) {
      try {
        const dbInstance = await createDatabase(config.dbPath);
        this.serviceDatabases.set(config.name, dbInstance);
        initLogger.info(`Created specialized DB: ${config.name}`, { 
          path: config.dbPath
        });
      } catch (error) {
        initLogger.error(`Failed to create specialized DB ${config.name}`, { 
          error: error.message,
          path: config.dbPath 
        });
        throw error;
      }
    }
  }

  /**
   * ENSURE DATA DIRECTORIES EXIST
   */
  async ensureDataDirectories() {
    const directories = [
      './data',
      './data/services',
      './data/ariel',
      './data/main',
      './backups',
      './backups/ariel',
      './logs'
    ];

    for (const dir of directories) {
      try {
        await fs.promises.mkdir(dir, { recursive: true });
        initLogger.debug(`Ensured directory exists: ${dir}`);
      } catch (error) {
        initLogger.warn(`Could not create directory ${dir}`, { error: error.message });
      }
    }
  }

  /**
   * VERIFY ALL CONNECTIONS
   */
  async verifyConnections() {
    initLogger.info('Starting connection health checks...');
    
    for (const [name, dbInterface] of this.unifiedInterfaces) { 
      try {
        if (typeof dbInterface.healthCheck !== 'function') {
          throw new Error('Unified interface missing healthCheck method');
        }
        const health = await dbInterface.healthCheck(); 
        if (!health.healthy) {
          throw new Error(`Health check failed: ${health.error}`);
        }
        initLogger.info(`Verified connection for: ${name}`, { status: 'healthy', latency: health.latency });
      } catch (error) {
        initLogger.error(`Connection verification FAILED for: ${name}`, { error: error.message });
        throw new Error(`Critical database connection failure: ${name} (${error.message})`);
      }
    }
    initLogger.info('All database connections verified successfully');
  }

  /**
   * START HEALTH MONITORING
   */
  startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      for (const [name, dbInterface] of this.unifiedInterfaces) {
        try {
          const health = await dbInterface.healthCheck();
          if (!health.healthy) {
            initLogger.warn(`Health Monitor Alert: ${name} is unhealthy`, { error: health.error });
          } else {
            initLogger.debug(`Health check OK for ${name}`, { latency: health.latency });
          }
        } catch (error) {
          initLogger.error(`Monitoring failed for ${name}: ${error.message}`);
        }
      }
    }, this.HEALTH_CHECK_CADENCE);
    initLogger.info(`Health monitoring started (Every ${this.HEALTH_CHECK_CADENCE / 1000}s)`);
  }

  /**
   * CREATE UNIFIED INTERFACES
   */
  async createUnifiedInterfaces() {
    const serviceConfigs = [
      { 
        name: 'ai-security-module', 
        type: 'specialized', 
        methods: ['run', 'all', 'get', 'init', 'close', 'healthCheck']
      },
      { 
        name: 'ai-threat-detector', 
        type: 'specialized', 
        methods: ['run', 'all', 'get', 'init', 'close', 'healthCheck']
      },
      { 
        name: 'quantum-shield', 
        type: 'specialized', 
        methods: ['run', 'all', 'get', 'init', 'close', 'healthCheck']
      },
      { 
        name: 'cross-chain-bridge', 
        type: 'specialized', 
        methods: ['run', 'all', 'get', 'init', 'close', 'healthCheck']
      },
      { 
        name: 'quantum-crypto', 
        type: 'specialized', 
        methods: ['run', 'all', 'get', 'init', 'close', 'healthCheck']
      },
      { 
        name: 'mainnet-oracle', 
        type: 'bwaezi-chain', 
        methods: ['get', 'healthCheck']
      },
      { 
        name: 'enterprise-wallet', 
        type: 'specialized', 
        methods: ['run', 'all', 'get', 'init', 'close', 'healthCheck']
      }
    ];

    for (const config of serviceConfigs) {
      try {
        const unifiedInterface = this.createUnifiedInterface(config);
        this.unifiedInterfaces.set(config.name, unifiedInterface);
        initLogger.info(`Created unified interface for: ${config.name}`);
      } catch (error) {
        initLogger.error(`Failed to create unified interface for: ${config.name}`, { error: error.message });
      }
    }
  }

  /**
   * CREATE UNIFIED INTERFACE
   */
  createUnifiedInterface(config) {
    const interfaceMethods = {
      init: async () => {
        const db = await this.getDatabaseInstance(config);
        return db;
      },
      
      run: async (sql, params = []) => { 
        if (config.type === 'bwaezi-chain') {
          throw new Error(`Method 'run' not available for bwaezi-chain service: ${config.name}`);
        }
        const db = await this.getDatabaseInstance(config); 
        return db.run(sql, params); 
      }, 
      
      all: async (sql, params = []) => { 
        if (config.type === 'bwaezi-chain') {
          throw new Error(`Method 'all' not available for bwaezi-chain service: ${config.name}`);
        }
        const db = await this.getDatabaseInstance(config); 
        return db.all(sql, params); 
      },
      
      get: async (sql, params = []) => { 
        const db = await this.getDatabaseInstance(config);
        if (config.type === 'bwaezi-chain') {
          if (typeof db.get === 'function') {
            return db.get(sql, params);
          } else {
            throw new Error(`Method 'get' not available for bwaezi-chain service: ${config.name}`);
          }
        }
        return db.get(sql, params); 
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
      
      healthCheck: async () => {
        const startTime = process.hrtime();
        
        if (config.type === 'bwaezi-chain') {
          try {
            const chainInstance = new BrianNwaezikeChain();
            if (!chainInstance) {
              throw new Error("BrianNwaezikeChain instance not initialized");
            }
            
            const chainHealth = await chainInstance.checkChainHealth(); 
            const diff = process.hrtime(startTime);
            const latency = (diff[0] * 1e9 + diff[1]) / 1e6;
            
            return { 
              healthy: chainHealth.healthy, 
              service: config.name, 
              latency: latency.toFixed(2) + 'ms', 
              details: chainHealth.details,
              timestamp: new Date().toISOString(),
              type: config.type
            };
          } catch (error) {
            return { 
              healthy: false, 
              service: config.name, 
              error: error.message,
              timestamp: new Date().toISOString(),
              type: config.type
            };
          }
        } else {
          const db = await this.getDatabaseInstance(config);
          try {
            const result = await db.get('SELECT 1 as health_check');
            const diff = process.hrtime(startTime);
            const latency = (diff[0] * 1e9 + diff[1]) / 1e6;
            
            return { 
              healthy: true, 
              service: config.name, 
              latency: latency.toFixed(2) + 'ms',
              timestamp: new Date().toISOString(),
              type: config.type
            };
          } catch (error) {
            return { 
              healthy: false, 
              service: config.name, 
              error: error.message,
              timestamp: new Date().toISOString(),
              type: config.type
            };
          }
        }
      },
      
      getStatus: async () => {
        const db = await this.getDatabaseInstance(config);
        return {
          name: config.name,
          type: config.type,
          initialized: true,
          timestamp: new Date().toISOString()
        };
      }
    };
    return interfaceMethods; 
  }

  /**
   * GET DATABASE INSTANCE
   */
  async getDatabaseInstance(config) {
    switch (config.type) {
      case 'main':
        if (!this.mainDb) { 
          throw new Error('Main BrianNwaezikeDB not initialized'); 
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
      case 'bwaezi-chain':
        const chainInstance = new BrianNwaezikeChain();
        if (!chainInstance) { 
          throw new Error('BrianNwaezikeChain not initialized'); 
        }
        return chainInstance;
      default:
        throw new Error(`Unknown service type: ${config.type}`);
    }
  }
  
  /**
   * EMERGENCY CLEANUP
   */
  async emergencyCleanup() {
    initLogger.warn('Initiating Emergency Database Cleanup...');
    
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    for (const [name, dbInterface] of this.unifiedInterfaces) {
      try {
        await dbInterface.close();
        initLogger.info(`Closed connection for: ${name}`);
      } catch (error) {
        initLogger.warn(`Failed to close connection ${name}: ${error.message}`);
      }
    }
    
    try {
      if (this.mainDb && typeof this.mainDb.close === 'function') {
        await this.mainDb.close();
      }
    } catch (error) {
      initLogger.warn('Error closing main database:', error.message);
    }

    try {
      if (this.arielEngine && typeof this.arielEngine.close === 'function') {
        await this.arielEngine.close();
      }
    } catch (error) {
      initLogger.warn('Error closing Ariel engine:', error.message);
    }
    
    this.initialized = false;
    this.initializationPromise = null;
    initLogger.warn('Emergency Cleanup Complete');
  }

  /**
   * GRACEFUL SHUTDOWN
   */
  async shutdown() {
    initLogger.info('Initiating database shutdown...');

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    try {
      if (this.mainDb && typeof this.mainDb.backup === 'function') {
        await this.mainDb.backup();
        initLogger.info('Main database backup completed');
      }
      if (this.arielEngine && typeof this.arielEngine.backup === 'function') {
        await this.arielEngine.backup();
        initLogger.info('Ariel engine backup completed');
      }
      initLogger.info('Final database backups completed');
    } catch (error) {
      initLogger.error('Final backup failed', { error: error.message });
    }

    await this.emergencyCleanup();
    initLogger.info('Database shutdown completed successfully');
  }

  /**
   * GET STATUS
   */
  getStatus() {
    const status = {
      initialized: this.initialized,
      mainDb: !!this.mainDb,
      arielEngine: !!this.arielEngine,
      specializedDatabases: this.serviceDatabases.size,
      unifiedInterfaces: Array.from(this.unifiedInterfaces.keys()),
      healthMonitoring: !!this.healthCheckInterval,
      timestamp: new Date().toISOString(),
      version: '1.0.0-production'
    };

    status.services = Array.from(this.unifiedInterfaces.entries()).map(([name, dbInterface]) => ({
      name,
      methods: Object.keys(dbInterface).filter(key => typeof dbInterface[key] === 'function')
    }));

    return status;
  }

  /**
   * GET SERVICE INTERFACE
   */
  getServiceInterface(serviceName) {
    const dbInterface = this.unifiedInterfaces.get(serviceName);
    if (!dbInterface) {
      throw new Error(`Service interface not found: ${serviceName}`);
    }
    return dbInterface;
  }

  /**
   * LIST SERVICES
   */
  listServices() {
    return Array.from(this.unifiedInterfaces.keys()).map(serviceName => ({
      name: serviceName,
      type: this.getServiceConfig(serviceName)?.type || 'unknown',
      available: true
    }));
  }

  /**
   * GET SERVICE CONFIG
   */
  getServiceConfig(serviceName) {
    const serviceConfigs = [
      { name: 'ai-security-module', type: 'specialized' },
      { name: 'ai-threat-detector', type: 'specialized' },
      { name: 'quantum-shield', type: 'specialized' },
      { name: 'cross-chain-bridge', type: 'specialized' },
      { name: 'quantum-crypto', type: 'specialized' },
      { name: 'mainnet-oracle', type: 'bwaezi-chain' },
      { name: 'enterprise-wallet', type: 'specialized' }
    ];
    return serviceConfigs.find(config => config.name === serviceName);
  }

  /**
   * PERFORM SYSTEM DIAGNOSTICS
   */
  async performSystemDiagnostics() {
    const diagnostics = {
      timestamp: new Date().toISOString(),
      overallHealth: 'checking',
      services: [],
      issues: []
    };

    for (const [name, dbInterface] of this.unifiedInterfaces) {
      try {
        const health = await dbInterface.healthCheck();
        diagnostics.services.push({
          name,
          healthy: health.healthy,
          latency: health.latency,
          type: health.type
        });

        if (!health.healthy) {
          diagnostics.issues.push({
            service: name,
            issue: health.error,
            severity: 'high'
          });
        }
      } catch (error) {
        diagnostics.services.push({
          name,
          healthy: false,
          error: error.message
        });
        diagnostics.issues.push({
          service: name,
          issue: `Health check failed: ${error.message}`,
          severity: 'critical'
        });
      }
    }

    const unhealthyServices = diagnostics.services.filter(s => !s.healthy);
    if (unhealthyServices.length === 0) {
      diagnostics.overallHealth = 'healthy';
    } else if (unhealthyServices.length < diagnostics.services.length / 2) {
      diagnostics.overallHealth = 'degraded';
    } else {
      diagnostics.overallHealth = 'unhealthy';
    }

    return diagnostics;
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

export { DatabaseInitializer };
