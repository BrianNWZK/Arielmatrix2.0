/**
 * ArielSQL Ultimate Suite - Main Entry Point (Production Mainnet)
 * Phase 3: Global Mainnet Deployment with Zero-Cost Data Access
 */

import http from "http";
import { serviceManager } from "./serviceManager.js";
import BrianNwaezikeChain from '../backend/blockchain/BrianNwaezikeChain.js';
import healthAgent from '../backend/agents/healthAgent.js';
import winston from 'winston';
import payoutAgent from "../backend/agents/payoutAgent.js";
import { initializeDatabase } from '../backend/database/BrianNwaezikeDB.js';

// Enhanced logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'arielsql-suite' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ level, message, timestamp, stack }) => {
          return `[${timestamp}] ${level}: ${stack || message}`;
        })
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    })
  ]
});

// Environment configuration
const config = {
  port: process.env.PORT || 10000,
  mainnet: process.env.NODE_ENV === 'production',
  healthPort: process.env.HEALTH_PORT || 10001,
  blockchainConfig: {
    dbPath: './data/bwaezi-chain.db',
    blockTime: 5000,
    validatorSetSize: 21,
    shards: 4,
    mainnet: process.env.NODE_ENV === 'production'
  }
};

// Global error handlers
process.on('unhandledRejection', (reason, promise) => {
  logger.error('🛑 Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error('🛑 Uncaught Exception:', error);
  process.exit(1);
});

/**
 * Initialize Database System
 */
async function initializeDatabaseSystem() {
  try {
    logger.info("🗄️ Initializing BrianNwaezikeDB...");
    const database = await initializeDatabase({
      database: {
        path: './data',
        numberOfShards: 4,
        backup: {
          enabled: true,
          retentionDays: 7
        }
      }
    });
    
    logger.info("✅ BrianNwaezikeDB initialized successfully");
    return database;
  } catch (error) {
    logger.error('❌ Database initialization failed:', error);
    throw error;
  }
}

/**
 * Initialize Blockchain System
 */
async function initializeBlockchain() {
  try {
    logger.info("🔗 Initializing BrianNwaezikeChain...");
    const chain = new BrianNwaezikeChain(config.blockchainConfig);
    await chain.initialize();
    
    // Start mining if configured
    if (process.env.AUTO_MINE !== 'false') {
      await chain.startMining();
      logger.info("⛏️ Blockchain mining started");
    }
    
    logger.info("✅ BrianNwaezikeChain initialized successfully");
    return chain;
  } catch (error) {
    logger.error('❌ Blockchain initialization failed:', error);
    throw error;
  }
}

/**
 * Start Health Monitoring Server
 */
function startHealthServer() {
  const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    if (req.url === "/health" || req.url === "/health/") {
      try {
        const report = healthAgent ? await healthAgent.run({}, logger) : {
          status: 'degraded',
          issues: ['Health agent not available'],
          timestamp: new Date().toISOString()
        };
        
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          status: report.status,
          issues: report.issues,
          timestamp: new Date().toISOString(),
          service: "ArielSQL Suite",
          version: "3.0.0",
          mainnet: config.mainnet
        }));
      } catch (err) {
        logger.error("❌ Health check failed:", err);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          status: "error", 
          message: err.message,
          timestamp: new Date().toISOString()
        }));
      }
    } else if (req.url === "/metrics") {
      // Basic metrics endpoint
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        timestamp: new Date().toISOString()
      }));
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ 
        error: "Endpoint not found",
        available: ["/health", "/metrics"]
      }));
    }
  });

  server.listen(config.healthPort, "0.0.0.0", () => {
    logger.info(`🩺 Health server running on port ${config.healthPort}`);
  });

  server.on('error', (error) => {
    logger.error('❌ Health server error:', error);
  });

  return server;
}

/**
 * Register all services with the ServiceManager
 */
async function registerAllServices(serviceManager) {
  const services = [
    'blockchain',
    'payouts', 
    'governance',
    'quantumCrypto',
    'aiSecurity',
    'crossChainBridge',
    'omnichainInterop',
    'shardingManager',
    'scalabilityEngine',
    'adRevenue',
    'adsense',
    'apiScout',
    'browser',
    'config',
    'contractDeploy',
    'crypto',
    'data',
    'forex',
    'health',
    'payout',
    'shopify',
    'social'
  ];

  logger.info("📋 Registering services...");
  
  let registeredCount = 0;
  for (const service of services) {
    try {
      // Check if service exists and can be registered
      const handler = serviceManager.agents[service] || serviceManager.modules[service];
      if (handler) {
        registeredCount++;
        logger.debug(`✅ Service available: ${service}`);
      } else {
        logger.warn(`⚠️ Service handler not found: ${service}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to check service ${service}:`, error.message);
    }
  }
  
  logger.info(`✅ ${registeredCount}/${services.length} services available for registration`);
  return registeredCount;
}

/**
 * Start Payout System
 */
async function startPayoutSystem() {
  try {
    if (payoutAgent && typeof payoutAgent.start === 'function') {
      await payoutAgent.start();
      logger.info("💰 Payout agent activated");
      return true;
    } else {
      logger.warn("⚠️ Payout agent not available or missing start method");
      return false;
    }
  } catch (error) {
    logger.error("❌ Failed to start payout system:", error);
    return false;
  }
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(serviceManager, healthServer, blockchain, database) {
  let isShuttingDown = false;

  async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.info(`🛑 Received ${signal}, shutting down gracefully...`);
    
    try {
      // Stop blockchain mining first
      if (blockchain && typeof blockchain.stopMining === 'function') {
        await blockchain.stopMining();
        logger.info("⛏️ Blockchain mining stopped");
      }

      // Stop service manager
      if (serviceManager && typeof serviceManager.stop === 'function') {
        await serviceManager.stop();
        logger.info("🔴 ServiceManager stopped");
      }

      // Close database connections
      if (database && typeof database.close === 'function') {
        await database.close();
        logger.info("🔴 Database connections closed");
      }

      // Close health server
      if (healthServer) {
        healthServer.close(() => {
          logger.info("🔴 Health server stopped");
        });
      }

      // Stop payout agent
      if (payoutAgent && typeof payoutAgent.stop === 'function') {
        await payoutAgent.stop();
        logger.info("🔴 Payout agent stopped");
      }

      logger.info("👋 Graceful shutdown completed");
      process.exit(0);
    } catch (error) {
      logger.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  }

  // Register shutdown handlers
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
}

/**
 * Main ArielSQL Suite startup function
 */
async function startArielSQLSuite() {
  try {
    logger.info("🚀 Starting ArielSQL Ultimate Suite (Phase 3 Mainnet Ready)...");
    logger.info("🌐 Environment: " + (config.mainnet ? "MAINNET" : "DEVELOPMENT"));
    logger.info("🔧 Configuration:", { port: config.port, healthPort: config.healthPort });

    // Step 1: Initialize core systems
    logger.info("1. Initializing serviceManager...");
    const manager = new serviceManager();
    await manager.start();

    logger.info("2. Initializing Database System...");
    const database = await initializeDatabaseSystem();

    logger.info("3. Initializing Blockchain System...");
    const blockchain = await initializeBlockchain();

    logger.info("4. Starting Health Monitoring...");
    const healthServer = startHealthServer();

    logger.info("5. Registering Services...");
    const registeredServices = await registerAllServices(manager);

    logger.info("6. Starting Payout System...");
    const payoutStarted = await startPayoutSystem();

    // Step 2: Setup graceful shutdown
    setupGracefulShutdown(manager, healthServer, blockchain, database);

    // Step 3: Final startup confirmation
    logger.info("🎉 ArielSQL Suite started successfully!", {
      services: registeredServices,
      payoutActive: payoutStarted,
      blockchain: blockchain ? "active" : "inactive",
      database: database ? "active" : "inactive",
      healthPort: config.healthPort,
      mainnet: config.mainnet
    });

    return {
      serviceManager: manager,
      database,
      blockchain,
      healthServer
    };

  } catch (error) {
    logger.error("💥 Failed to start ArielSQL Suite:", error);
    throw error;
  }
}

/**
 * Main application startup
 */
async function start() {
  try {
    await startArielSQLSuite();
    
    // Keep the process alive
    setInterval(() => {
      // Heartbeat logging
      if (Math.random() < 0.01) { // Log approximately 1% of the time
        logger.debug("💓 System heartbeat");
      }
    }, 60000); // Every minute

  } catch (error) {
    logger.error("💥 Fatal error during startup:", error);
    process.exit(1);
  }
}

// Export for testing and module usage
export { startArielSQLSuite, config, logger };

// Start the application if this is the main module
if (import.meta.url === `file://${process.argv[1]}`) {
  start().catch(error => {
    logger.error("💥 Unhandled startup error:", error);
    process.exit(1);
  });
}
