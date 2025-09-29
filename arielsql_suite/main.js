/**
 * ArielSQL Ultimate Suite - Main Entry Point (Production Mainnet)
 * Phase 3: Global Mainnet Deployment with Zero-Cost Data Access
 */

import http from "http";
import { ServiceManager } from "./services/ServiceManager.js";
import BrianNwaezikeChain from '../backend/blockchain/BrianNwaezikeChain.js';
import healthAgent from '../backend/agents/healthAgent.js';
import winston from 'winston';
import payoutAgent from "../backend/agents/payoutAgent.js";

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
function setupGracefulShutdown(serviceManager, healthServer, blockchain) {
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
      if (serviceManager) {
        await serviceManager.stop();
        logger.info("🔴 ServiceManager stopped");
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

      logger.info("✅ Graceful shutdown completed");
      
      // Give a moment for logs to flush
      setTimeout(() => process.exit(0), 1000);
      
    } catch (error) {
      logger.error("❌ Error during shutdown:", error);
      process.exit(1);
    }
  }

  // Register signal handlers
  process.on("SIGINT", () => shutdown('SIGINT'));
  process.on("SIGTERM", () => shutdown('SIGTERM'));
  
  // Handle PM2/Graceful reload signals
  process.on("SIGUSR2", () => shutdown('SIGUSR2'));
}

/**
 * Main ArielSQL Suite startup function
 */
async function startArielSQLSuite() {
  try {
    logger.info("🚀 Starting ArielSQL Ultimate Suite (Phase 3 Mainnet Ready)...");
    logger.info(`🌐 Environment: ${config.mainnet ? 'MAINNET' : 'TESTNET'}`);
    logger.info(`🔧 Configuration:`, config);

    // 1. Initialize Service Manager
    logger.info("1. Initializing ServiceManager...");
    const serviceManager = new ServiceManager(config);
    await serviceManager.initialize();

    // 2. Initialize Blockchain
    logger.info("2. Initializing Blockchain...");
    const blockchain = await initializeBlockchain();

    // 3. Register all services
    logger.info("3. Registering services...");
    const registeredCount = await registerAllServices(serviceManager);

    // 4. Start Payout System
    logger.info("4. Starting payout system...");
    const payoutStarted = await startPayoutSystem();

    // 5. Start Health Server
    logger.info("5. Starting health server...");
    const healthServer = startHealthServer();

    // 6. Start Service Manager
    logger.info("6. Starting ServiceManager...");
    serviceManager.start();

    // 7. Setup graceful shutdown
    logger.info("7. Setting up graceful shutdown...");
    setupGracefulShutdown(serviceManager, healthServer, blockchain);

    // Final startup message
    logger.info("🎉 ArielSQL Suite started successfully!");
    logger.info(`📊 Services: ${registeredCount} registered`);
    logger.info(`💰 Payouts: ${payoutStarted ? 'Active' : 'Inactive'}`);
    logger.info(`🌐 API: http://localhost:${config.port}`);
    logger.info(`🩺 Health: http://localhost:${config.healthPort}/health`);
    logger.info(`🔗 Mainnet: ${config.mainnet}`);

    return {
      serviceManager,
      blockchain,
      healthServer,
      config
    };

  } catch (error) {
    logger.error("❌ Failed to start ArielSQL Suite:", error);
    
    // Attempt graceful shutdown on startup failure
    try {
      if (serviceManager) {
        await serviceManager.stop();
      }
    } catch (shutdownError) {
      logger.error("❌ Error during startup failure shutdown:", shutdownError);
    }
    
    process.exit(1);
  }
}

/**
 * Main startup function - Entry point
 */
async function start() {
  try {
    console.log("🚀 Starting ArielMatrix2.0 + BwaeziChain...");
    
    // Start the complete ArielSQL Suite
    const suite = await startArielSQLSuite();
    
    console.log("✅ All systems operational and ready for production");
    console.log(`🌐 Mainnet Mode: ${config.mainnet}`);
    console.log(`🔗 Service Manager: http://localhost:${config.port}`);
    console.log(`🩺 Health Checks: http://localhost:${config.healthPort}/health`);

    return suite;

  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

// Export for testing and module usage
export { 
  start, 
  startArielSQLSuite, 
  registerAllServices,
  initializeBlockchain,
  setupGracefulShutdown 
};

export default {
  start,
  startArielSQLSuite,
  registerAllServices,
  initializeBlockchain,
  config
};

// Start the application if this is the main module
if (import.meta.url === `file://${process.argv[1]}` || require.main === module) {
  start().catch(error => {
    console.error('💥 Critical startup failure:', error);
    process.exit(1);
  });
}
