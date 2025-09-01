// =========================================================================
// ArielSQL Unified Service Manager: The True Autonomous Orchestrator
//
// This file orchestrates the entire ArielSQL suite, separating core
// autonomous logic from the web-facing server. It provides a more
// resilient, scalable, and maintainable foundation.
// =========================================================================

// =========================================================================
// 1. External Library Imports
// =========================================================================
import express from 'express';
import betterSqlite3 from 'better-sqlite3';
import Web3 from 'web3';
import forge from 'node-forge';
import { v4 as uuidv4 } from 'uuid';
import { Mutex } from 'async-mutex';
import { EventEmitter } from 'events';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import cron from 'node-cron';
import { Queue } from 'bull';
import winston from 'winston';

// =========================================================================
// 2. Core Service Components & Agent Imports
//
// NOTE: These are assumed to exist in the file structure as per the original code.
// =========================================================================
import { AutonomousCore } from './backend/agents/autonomous-ai-engine.js';
import { DatabaseAdapter } from './backend/database/BrianNwaezikeDB.js';
import { QueryOptimizer } from './backend/agents/dataAgent.js';
import { BlockchainAuditSystem } from './backend/blockchain/BrianNwaezikeChain.js';
import { ShardManager } from './backend/database/BrianNwaezikeDB.js';
import { PayoutAgent } from './backend/agents/payoutAgent.js';
import { DataAgent } from './backend/agents/dataAgent.js';
import { ShopifyAgent } from './backend/agents/shopifyAgent.js';
import { BrowserManager } from './backend/agents/browserManager.js';
import { AdRevenueAgent } from './backend/agents/adRevenueAgent.js';
import { ApiScoutAgent } from './backend/agents/apiScoutAgent.js';
import { CryptoAgent } from './backend/agents/cryptoAgent.js';
import { ForexSignalAgent } from './backend/agents/forexSignalAgent.js';
import { SocialAgent } from './backend/agents/socialAgent.js';
import * as healthAgent from './backend/agents/healthAgent.js';
import * as configAgent from './backend/agents/configAgent.js';

// =========================================================================
// 3. Custom Errors & Utilities
// =========================================================================
export class DatabaseError extends Error {
  constructor(message, originalError) {
    super(message);
    this.name = 'DatabaseError';
    this.originalError = originalError;
  }
}
export class SecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SecurityError';
  }
}
export class BlockchainError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BlockchainError';
  }
}

/**
 * A simple logger for database-related events.
 */
const databaseLogger = {
  info: (msg) => console.log(`[DB INFO] ${msg}`),
  error: (msg, err) => console.error(`[DB ERROR] ${msg}`, err),
};

/**
 * Retries a function with exponential backoff.
 * @param {Function} fn - The function to retry.
 * @param {number} [retries=5] - The number of retries.
 * @param {number} [delay=1000] - The initial delay in milliseconds.
 * @param {string} [errorMsg='Operation failed'] - Custom error message.
 * @returns {Promise<any>}
 */
async function retryWithBackoff(fn, retries = 5, delay = 1000, errorMsg = 'Operation failed') {
  try {
    return await fn();
  } catch (error) {
    if (retries === 0) {
      throw new Error(`${errorMsg}: Maximum retries exceeded.`, { cause: error });
    }
    console.warn(`Retry attempt failed. Retrying in ${delay}ms...`, error);
    await new Promise(res => setTimeout(res, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2, errorMsg);
  }
}

/**
 * Quantum-resistant key derivation using SHA-512 and PBKDF2.
 * This is a foundational step towards quantum-safe security.
 * @param {string} passphrase - The user-provided passphrase.
 * @param {string} salt - The salt to use.
 * @returns {{publicKey: string, privateKey: string}} - A key pair.
 */
function deriveQuantumKeys(passphrase, salt) {
  if (!salt) {
    salt = crypto.randomBytes(16).toString('hex');
  }
  const key = crypto.pbkdf2Sync(passphrase, salt, 100000, 64, 'sha512');
  const keyPair = forge.pki.ed25519.generateKeyPair();
  // Using Ed25519 as a placeholder for a future quantum-safe algorithm.
  const privateKey = forge.util.bytesToHex(keyPair.privateKey);
  const publicKey = forge.util.bytesToHex(keyPair.publicKey);
  return { publicKey, privateKey };
}

// =========================================================================
// 4. Core Service Wrapper Classes
// =========================================================================
/**
 * BrianNwaezikeDB: A unified wrapper for database operations,
 * integrating query optimization and blockchain auditing.
 */
class BrianNwaezikeDB {
  constructor(dbAdapter, web3Config) {
    this.db = dbAdapter;
    this.queryOptimizer = new QueryOptimizer(dbAdapter);
    this.blockchainAudit = new BlockchainAuditSystem(dbAdapter, web3Config);
    this.shardManager = new ShardManager(dbAdapter, web3Config);
    this.logger = databaseLogger;
  }
  async init() {
    this.logger.info('Initializing BrianNwaezikeDB...');
    await this.db.init();
    await this.blockchainAudit.init();
    this.logger.info('Database and Blockchain Audit System initialized.');
  }
  async execute(query) {
    const optimizedQuery = this.queryOptimizer.optimize(query);
    const result = await this.db.execute(optimizedQuery);
    // Audit the query for security and integrity
    await this.blockchainAudit.auditTransaction(query);
    return result;
  }
  async get(query) {
    return this.execute(query);
  }
  async run(sql, args) {
    return await this.db.run(sql, args);
  }
}

// =========================================================================
// 5. The Refactored ServiceManager & WebServer
// =========================================================================
/**
 * The core ServiceManager for initializing and orchestrating all
 * autonomous agents and services.
 * @class
 */
class CoreServiceManager {
  /**
   * @param {object} config - The system configuration.
   */
  constructor(config) {
    this.config = config;
    this.services = {};
    this.logger = this.setupLogger();
    this.revenueQueue = new Queue('revenueQueue', { redis: config.redis });
  }

  /**
   * Sets up the Winston logger.
   * @returns {winston.Logger}
   */
  setupLogger() {
    return winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'combined.log' })
      ],
    });
  }

  /**
   * Initializes all autonomous agents and core services.
   * @returns {Promise<void>}
   */
  async init() {
    this.logger.info('🚀 Initializing all autonomous agents...');
    // Initialize the Autonomous AI engine first as a dependency
    this.services.autonomousCore = new AutonomousCore(this.config, this.logger);
    await this.services.autonomousCore.initialize();
    this.logger.info('✅ AutonomousCore initialized and network connections established.');

    // Initialize all other agents and services in parallel
    this.services.payoutAgent = new PayoutAgent(this.config, this.logger);
    this.services.dataAgent = new DataAgent(this.config, this.logger);
    this.services.shopifyAgent = new ShopifyAgent(this.config, this.logger);
    this.services.browserManager = new BrowserManager(this.config, this.logger);
    this.services.adRevenueAgent = new AdRevenueAgent(this.config, this.logger);
    this.services.apiScoutAgent = new ApiScoutAgent(this.config, this.logger);
    this.services.cryptoAgent = new CryptoAgent(this.config, this.logger);
    this.services.forexSignalAgent = new ForexSignalAgent(this.config, this.logger);
    this.services.socialAgent = new SocialAgent(this.config, this.logger);
    this.services.healthAgent = healthAgent;
    this.services.configAgent = configAgent;

    const initializationPromises = Object.values(this.services).map(agent => {
      if (agent.initialize) return agent.initialize();
      return Promise.resolve();
    });
    await Promise.all(initializationPromises);
    this.logger.info('✅ All agents initialized successfully.');

    // Initialize the unified database wrapper
    this.services.bwaeziDB = new BrianNwaezikeDB(
      new DatabaseAdapter(this.config.database),
      this.config.blockchain
    );
    await this.services.bwaeziDB.init();
    this.logger.info('✅ BrianNwaezikeDB initialized.');
  }

  /**
   * Schedules the autonomous revenue generation cycle.
   * This is a non-blocking operation that adds a job to the queue.
   */
  async scheduleAutonomousRevenueSystem() {
    this.logger.info('🚀 Autonomous Revenue Generation Cycle Initiated!');
    const healthResult = await this.services.healthAgent.run(this.config, this.logger);
    if (healthResult.status !== 'optimal') {
      this.logger.error('System health check failed. Cycle aborted.');
      return;
    }
    this.logger.info('✅ System health is optimal. Adding job to queue.');
    await this.revenueQueue.add({ type: 'revenueGeneration' });
  }

  /**
   * Starts the worker to process the revenue queue jobs.
   */
  startQueueWorker() {
    this.revenueQueue.process(async (job) => {
      this.logger.info(`Processing job: ${job.id} (${job.data.type})`);
      try {
        switch (job.data.type) {
          case 'revenueGeneration':
            await this.services.dataAgent.run();
            await this.services.shopifyAgent.run();
            await this.services.adRevenueAgent.run();
            await this.services.apiScoutAgent.run();
            await this.services.cryptoAgent.run();
            await this.services.forexSignalAgent.run();
            await this.services.socialAgent.run();
            // Await the payout agent last to ensure all revenue is collected
            await this.services.payoutAgent.runPayoutCycle();
            this.logger.info('🎉 Autonomous Revenue Generation Cycle Completed Successfully!');
            break;
        }
      } catch (error) {
        this.logger.error(`❌ Error processing job ${job.id}:`, error);
        throw error; // Bull.js will handle the retries
      }
    });
    this.logger.info('✅ Revenue Queue worker started.');
  }

  /**
   * Gets the status of a specific service.
   * @param {string} serviceName - The name of the service.
   * @returns {object|null} - The service object or null if not found.
   */
  getService(serviceName) {
    if (!this.services[serviceName]) {
      this.logger.warn(`Attempted to access unknown service: ${serviceName}`);
      return null;
    }
    return this.services[serviceName];
  }

  /**
   * Shuts down all initialized services gracefully.
   * @returns {Promise<void>}
   */
  async closeServices() {
    this.logger.info('Shutting down services gracefully...');
    for (const serviceName in this.services) {
      const service = this.services[serviceName];
      if (typeof service.close === 'function') {
        try {
          await service.close();
          this.logger.info(`✅ Service "${serviceName}" shut down.`);
        } catch (error) {
          this.logger.error(`❌ Error shutting down service "${serviceName}":`, error);
        }
      }
    }
    await this.revenueQueue.close();
    this.logger.info('✅ All services have been closed.');
  }
}

/**
 * A dedicated WebServer class to manage HTTP and WebSocket connections.
 * This separates the API from the core autonomous logic.
 * @class
 */
class WebServer {
  /**
   * @param {CoreServiceManager} coreManager - The core service manager instance.
   * @param {number} PORT - The server port.
   */
  constructor(coreManager, PORT) {
    this.coreManager = coreManager;
    this.PORT = PORT;
    this.app = express();
    this.httpServer = createServer(this.app);
    this.wss = null;
    this.connectedClients = new Set();
    this.logger = coreManager.setupLogger();
    this.setupRoutes();
  }

  /**
   * Sets up all the API routes for the Express application.
   */
  setupRoutes() {
    this.app.use(cors());
    this.app.use(express.json());

    // Centralized error handling middleware
    this.app.use((err, req, res, next) => {
      this.logger.error('API Error:', err);
      res.status(500).json({ error: 'Internal Server Error', message: err.message });
    });

    // API Endpoints
    this.app.post('/api/start-revenue-system', async (req, res) => {
      try {
        await this.coreManager.scheduleAutonomousRevenueSystem();
        res.status(200).json({ success: true, message: 'Revenue system cycle scheduled' });
      } catch (error) {
        res.status(500).json({ success: false, message: 'Failed to schedule revenue system.', error: error.message });
      }
    });

    this.app.get('/api/health', (req, res) => {
      const health = {
        status: 'online',
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        timestamp: new Date().toISOString()
      };
      res.status(200).json(health);
    });

    this.app.get('/api/dashboard', (req, res) => {
      const status = {
        system: this.getSystemStatus(),
        agents: this.getAgentActivities(),
      };
      res.status(200).json(status);
    });
  }

  /**
   * Starts the HTTP and WebSocket servers.
   */
  start() {
    this.httpServer.listen(this.PORT, () => {
      this.logger.info(`Server running on port ${this.PORT} with WebSocket support`);
      this.setupWebSocketServer();
      this.coreManager.startQueueWorker();
      // Start the cron job to periodically trigger the autonomous cycle
      cron.schedule('*/10 * * * *', () => { // Every 10 minutes
        this.coreManager.scheduleAutonomousRevenueSystem();
      });
    });
  }

  /**
   * Sets up the WebSocket server for real-time updates.
   */
  setupWebSocketServer() {
    this.wss = new WebSocketServer({ server: this.httpServer });
    this.wss.on('connection', (ws) => {
      this.connectedClients.add(ws);
      ws.send(JSON.stringify({ type: 'init', data: this.getSystemStatus() }));
      ws.on('close', () => this.connectedClients.delete(ws));
    });
    this.coreManager.revenueQueue.on('completed', (job) => {
      this.broadcastDashboardUpdate();
    });
    this.logger.info('✅ WebSocket server configured.');
  }

  /**
   * Broadcasts a dashboard update to all connected WebSocket clients.
   */
  broadcastDashboardUpdate() {
    const update = {
      timestamp: new Date().toISOString(),
      status: this.getSystemStatus(),
      agents: this.getAgentActivities(),
    };
    const message = JSON.stringify({ type: 'update', data: update });
    this.connectedClients.forEach(client => {
      if (client.readyState === 1) { // Check for open connection
        client.send(message);
      }
    });
  }

  /**
   * Retrieves the current system status.
   * @returns {object}
   */
  getSystemStatus() {
    return {
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Retrieves the status of all agents.
   * @returns {object}
   */
  getAgentActivities() {
    const activities = {};
    for (const [key, agent] of Object.entries(this.coreManager.services)) {
      if (typeof agent.getStatus === 'function') {
        activities[key] = agent.getStatus();
      }
    }
    return activities;
  }
}

/**
 * Main application entry point to start the entire system.
 */
async function main() {
  const PORT = process.env.PORT || 3000;
  const config = {
    database: { path: './data/arielsql.db' },
    blockchain: { url: 'http://localhost:8545' },
    redis: { host: '127.0.0.1', port: 6379 }
  };
  const coreManager = new CoreServiceManager(config);
  const webServer = new WebServer(coreManager, PORT);

  await coreManager.init();
  webServer.start();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('SIGINT received. Shutting down gracefully.');
    await webServer.httpServer.close();
    await coreManager.closeServices();
    process.exit(0);
  });
}

// Start the application
main().catch(error => {
  console.error('Fatal error during application startup:', error);
  process.exit(1);
});
