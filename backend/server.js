/**
 * EnterpriseServer - Production Backend Server v4.5
 * MAINNET-GRADE SERVER INFRASTRUCTURE
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Import core systems
import { ServiceManager } from '../arielsql_suite/serviceManager.js';
import { createBrianNwaezikeChain } from './blockchain/BrianNwaezikeChain.js';

// ====================================================================
// PRODUCTION CONFIGURATION
// ====================================================================

const PRODUCTION_CONFIG = {
  // Server Configuration
  port: process.env.PORT || 10001,
  host: process.env.HOST || '0.0.0.0',
  environment: process.env.NODE_ENV || 'production',
  
  // Security Configuration
  corsOrigins: process.env.CORS_ORIGINS?.split(',') || [
    'https://winr.games',
    'https://app.winr.games',
    'https://api.winr.games'
  ],
  
  // Rate Limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX || 1000,
    message: 'Too many requests from this IP, please try again later.'
  },
  
  // Blockchain Configuration
  blockchain: {
    rpcUrl: "https://rpc.winr.games",
    chainId: 777777,
    network: 'mainnet',
    contractAddress: "0x00000000000000000000000000000000000a4b05"
  },
  
  // API Configuration
  api: {
    version: 'v1',
    path: '/api/v1',
    timeout: 30000
  },
  
  // Monitoring Configuration
  monitoring: {
    enabled: true,
    logLevel: 'info',
    alertWebhook: process.env.ALERT_WEBHOOK_URL
  }
};

// ====================================================================
// ENTERPRISE SERVER CLASS
// ====================================================================

class EnterpriseServer {
  constructor(config = {}) {
    this.config = { ...PRODUCTION_CONFIG, ...config };
    
    // Core server components
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ 
      server: this.server,
      perMessageDeflate: false 
    });
    
    // Core systems
    this.serviceManager = null;
    this.blockchain = null;
    
    // State management
    this.isInitialized = false;
    this.isRunning = false;
    this.shutdownInProgress = false;
    
    // Client management
    this.connectedClients = new Set();
    this.clientSessions = new Map();
    
    // Security
    this.rateLimiters = new Map();
    
    // Initialize server
    this._initializeMiddleware();
    this._initializeSecurity();
    this._initializeRoutes();
    this._initializeWebSocket();
    this._initializeErrorHandling();
  }

  // ====================================================================
  // INITIALIZATION METHODS
  // ====================================================================

  async initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Server already initialized');
      return;
    }

    try {
      console.log('🚀 Initializing Enterprise Server...');
      console.log(`🌐 Environment: ${this.config.environment}`);
      console.log(`🔒 CORS Origins: ${this.config.corsOrigins.join(', ')}`);
      
      // Step 1: Initialize core systems
      await this._initializeCoreSystems();
      
      // Step 2: Initialize service manager
      await this._initializeServiceManager();
      
      // Step 3: Initialize blockchain
      await this._initializeBlockchain();
      
      // Step 4: Setup API routes
      this._initializeApiRoutes();
      
      this.isInitialized = true;
      
      console.log('✅ Enterprise Server initialized successfully');
      
    } catch (error) {
      console.error('❌ Server initialization failed:', error);
      throw error;
    }
  }

  async _initializeCoreSystems() {
    // Ensure required directories exist
    this._ensureDirectories();
    
    // Initialize security systems
    this._initializeSecuritySystems();
  }

  _ensureDirectories() {
    const directories = [
      './data',
      './logs', 
      './backups',
      './temp',
      './uploads'
    ];

    directories.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
      }
    });
  }

  _initializeSecuritySystems() {
    // Initialize rate limiters for different endpoints
    this.rateLimiters.set('api', rateLimit({
      windowMs: this.config.rateLimit.windowMs,
      max: this.config.rateLimit.max,
      message: this.config.rateLimit.message,
      standardHeaders: true,
      legacyHeaders: false
    }));

    this.rateLimiters.set('auth', rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 5,
      message: 'Too many authentication attempts, please try again later.'
    }));

    console.log('🔒 Security systems initialized');
  }

  async _initializeServiceManager() {
    try {
      console.log('🤖 Initializing Service Manager...');
      
      this.serviceManager = new ServiceManager({
        port: this.config.port + 1,
        mainnet: this.config.environment === 'production',
        databaseConfig: {
          path: "./data/arielsql_main.db"
        },
        blockchainConfig: this.config.blockchain
      });
      
      await this.serviceManager.initialize();
      console.log('✅ Service Manager initialized successfully');
      
    } catch (error) {
      console.error('❌ Service Manager initialization failed:', error);
      throw error;
    }
  }

  async _initializeBlockchain() {
    try {
      console.log('⛓️ Initializing Blockchain...');
      
      this.blockchain = await createBrianNwaezikeChain(this.config.blockchain);
      console.log('✅ Blockchain initialized successfully');
      
    } catch (error) {
      console.error('❌ Blockchain initialization failed:', error);
      console.log('🟡 Continuing without blockchain functionality');
    }
  }

  // ====================================================================
  // MIDDLEWARE CONFIGURATION
  // ====================================================================

  _initializeMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "https://rpc.winr.games", "https://api.winr.games"]
        }
      },
      crossOriginEmbedderPolicy: false
    }));

    // CORS configuration
    this.app.use(cors({
      origin: this.config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ 
      limit: '50mb',
      verify: (req, res, buf) => {
        try {
          JSON.parse(buf);
        } catch (e) {
          res.status(400).json({ error: 'Invalid JSON' });
          throw new Error('Invalid JSON');
        }
      }
    }));

    this.app.use(express.urlencoded({ 
      extended: true, 
      limit: '50mb' 
    }));

    // Request logging
    this.app.use(this._requestLogger());

    console.log('✅ Middleware initialized');
  }

  _requestLogger() {
    return (req, res, next) => {
      const start = Date.now();
      const requestId = crypto.randomBytes(8).toString('hex');
      
      // Store request ID for tracking
      req.requestId = requestId;
      
      // Log request
      console.log(`📥 [${requestId}] ${req.method} ${req.path} - ${req.ip}`);
      
      // Log response when finished
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`📤 [${requestId}] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
      });
      
      next();
    };
  }

  _initializeSecurity() {
    // Additional security headers
    this.app.use((req, res, next) => {
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('X-Frame-Options', 'DENY');
      res.header('X-XSS-Protection', '1; mode=block');
      res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      next();
    });

    // API rate limiting
    this.app.use(this.config.api.path, this.rateLimiters.get('api'));

    console.log('🔒 Security middleware initialized');
  }

  // ====================================================================
  // ROUTE CONFIGURATION
  // ====================================================================

  _initializeRoutes() {
    // Health check endpoint (always available)
    this.app.get('/health', async (req, res) => {
      try {
        const health = await this._getHealthStatus();
        res.json(health);
      } catch (error) {
        res.status(503).json({ 
          status: 'unhealthy', 
          error: error.message,
          timestamp: Date.now() 
        });
      }
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        service: 'ArielSQL Enterprise Server',
        version: '4.5.0',
        environment: this.config.environment,
        timestamp: Date.now(),
        endpoints: {
          health: '/health',
          api: this.config.api.path,
          docs: '/docs',
          monitoring: '/monitoring'
        }
      });
    });

    // BWAEZI RPC Endpoint
    this.app.get('/bwaezi-rpc', async (req, res) => {
      try {
        if (!this.blockchain) {
          return res.status(503).json({ 
            error: 'Blockchain not available',
            timestamp: Date.now() 
          });
        }

        const status = await this.blockchain.getStatus();
        res.json({
          rpc: 'bwaezi',
          chainId: 777777,
          network: 'mainnet',
          status: 'connected',
          blockNumber: status.lastBlock,
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(500).json({ 
          error: 'RPC endpoint error: ' + error.message,
          timestamp: Date.now() 
        });
      }
    });

    // Blockchain Status Endpoint
    this.app.get('/blockchain-status', async (req, res) => {
      try {
        if (!this.blockchain) {
          return res.status(503).json({ 
            error: 'Blockchain not available',
            timestamp: Date.now() 
          });
        }

        const status = await this.blockchain.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to get blockchain status',
          timestamp: Date.now() 
        });
      }
    });

    // Data Agent Status Endpoint
    this.app.get('/data-agent-status', async (req, res) => {
      try {
        if (!this.serviceManager) {
          return res.status(503).json({ 
            error: 'Service manager not available',
            timestamp: Date.now() 
          });
        }

        const agents = await this.serviceManager.getAgentStatus();
        const dataAgent = agents.DataAgent || {};
        
        res.json({
          agent: 'DataAgent',
          status: dataAgent.status || 'unknown',
          operational: dataAgent.operational || false,
          lastCheck: dataAgent.lastCheck || null,
          timestamp: Date.now()
        });
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to get data agent status',
          timestamp: Date.now() 
        });
      }
    });

    // Revenue Analytics Endpoint
    this.app.get('/revenue-analytics', async (req, res) => {
      try {
        if (!this.serviceManager) {
          return res.status(503).json({ 
            error: 'Service manager not available',
            timestamp: Date.now() 
          });
        }

        const monitoring = this.serviceManager.getMonitoring();
        if (!monitoring) {
          return res.status(503).json({ 
            error: 'Monitoring not available',
            timestamp: Date.now() 
          });
        }

        const metrics = await monitoring.getMetrics();
        const revenueData = {
          totalRevenue: metrics.metrics?.totalRevenue || 0,
          dailyRevenue: metrics.metrics?.dailyRevenue || 0,
          monthlyRevenue: metrics.metrics?.monthlyRevenue || 0,
          activeUsers: metrics.metrics?.activeUsers || 0,
          transactions: metrics.metrics?.transactions || 0,
          timestamp: Date.now()
        };

        res.json(revenueData);
      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to get revenue analytics',
          timestamp: Date.now() 
        });
      }
    });

    console.log('✅ Core routes initialized');
  }

  _initializeApiRoutes() {
    // API Router
    const apiRouter = express.Router();

    // Apply API rate limiting
    apiRouter.use(this.rateLimiters.get('api'));

    // API Health check
    apiRouter.get('/health', async (req, res) => {
      const health = await this._getHealthStatus();
      res.json(health);
    });

    // Blockchain operations
    apiRouter.post('/blockchain/transaction', async (req, res) => {
      try {
        if (!this.blockchain) {
          return res.status(503).json({ error: 'Blockchain not available' });
        }

        const { to, value, data } = req.body;
        const result = await this.blockchain.sendTransaction({ to, value, data });
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Service management
    apiRouter.get('/services', async (req, res) => {
      try {
        if (!this.serviceManager) {
          return res.status(503).json({ error: 'Service manager not available' });
        }

        const services = await this.serviceManager.getServiceStatus();
        res.json(services);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Data operations
    apiRouter.post('/data/query', async (req, res) => {
      try {
        if (!this.serviceManager) {
          return res.status(503).json({ error: 'Service manager not available' });
        }

        const { query, params } = req.body;
        const result = await this.serviceManager.executeQuery(query, params);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Mount API router
    this.app.use(this.config.api.path, apiRouter);
    console.log(`✅ API routes initialized at ${this.config.api.path}`);
  }

  // ====================================================================
  // WEBSOCKET CONFIGURATION
  // ====================================================================

  _initializeWebSocket() {
    this.wss.on('connection', (ws, req) => {
      const clientId = crypto.randomBytes(8).toString('hex');
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
      
      console.log(`🔗 WebSocket connected: ${clientId} from ${clientIp}`);
      
      // Add to connected clients
      this.connectedClients.add(ws);
      this.clientSessions.set(ws, {
        id: clientId,
        ip: clientIp,
        connectedAt: Date.now(),
        lastActivity: Date.now()
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'welcome',
        clientId,
        server: 'EnterpriseServer',
        version: '4.5.0',
        timestamp: Date.now()
      }));

      // Handle messages
      ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
          await this._handleWebSocketMessage(ws, message);
          
          // Update last activity
          const session = this.clientSessions.get(ws);
          if (session) {
            session.lastActivity = Date.now();
          }
        } catch (error) {
          console.error('❌ WebSocket message error:', error);
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Invalid message format',
            timestamp: Date.now()
          }));
        }
      });

      // Handle disconnection
      ws.on('close', () => {
        console.log(`🔌 WebSocket disconnected: ${clientId}`);
        this.connectedClients.delete(ws);
        this.clientSessions.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error(`❌ WebSocket error for ${clientId}:`, error);
        this.connectedClients.delete(ws);
        this.clientSessions.delete(ws);
      });
    });

    // Heartbeat for WebSocket connections
    setInterval(() => {
      this._sendHeartbeat();
    }, 30000);

    console.log('✅ WebSocket server initialized');
  }

  async _handleWebSocketMessage(ws, message) {
    const session = this.clientSessions.get(ws);
    
    if (!session) {
      ws.close();
      return;
    }

    try {
      switch (message.type) {
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: Date.now()
          }));
          break;

        case 'subscribe':
          await this._handleSubscription(ws, message);
          break;

        case 'unsubscribe':
          await this._handleUnsubscription(ws, message);
          break;

        case 'blockchain_status':
          await this._sendBlockchainStatus(ws);
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            error: 'Unknown message type',
            timestamp: Date.now()
          }));
      }
    } catch (error) {
      console.error('❌ WebSocket message handling error:', error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message,
        timestamp: Date.now()
      }));
    }
  }

  async _handleSubscription(ws, message) {
    // Handle client subscriptions
    ws.send(JSON.stringify({
      type: 'subscribed',
      channel: message.channel,
      timestamp: Date.now()
    }));
  }

  async _handleUnsubscription(ws, message) {
    // Handle client unsubscriptions
    ws.send(JSON.stringify({
      type: 'unsubscribed',
      channel: message.channel,
      timestamp: Date.now()
    }));
  }

  async _sendBlockchainStatus(ws) {
    if (!this.blockchain) {
      ws.send(JSON.stringify({
        type: 'blockchain_status',
        status: 'disconnected',
        timestamp: Date.now()
      }));
      return;
    }

    try {
      const status = await this.blockchain.getStatus();
      ws.send(JSON.stringify({
        type: 'blockchain_status',
        status: 'connected',
        data: status,
        timestamp: Date.now()
      }));
    } catch (error) {
      ws.send(JSON.stringify({
        type: 'blockchain_status',
        status: 'error',
        error: error.message,
        timestamp: Date.now()
      }));
    }
  }

  _sendHeartbeat() {
    const heartbeatMessage = JSON.stringify({
      type: 'heartbeat',
      timestamp: Date.now(),
      clientCount: this.connectedClients.size
    });

    this.connectedClients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(heartbeatMessage);
      }
    });
  }

  // ====================================================================
  // ERROR HANDLING
  // ====================================================================

  _initializeErrorHandling() {
    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Endpoint not found',
        path: req.originalUrl,
        timestamp: Date.now(),
        availableEndpoints: [
          'GET /',
          'GET /health',
          'GET /bwaezi-rpc',
          'GET /blockchain-status',
          'GET /data-agent-status',
          'GET /revenue-analytics'
        ]
      });
    });

    // Global error handler
    this.app.use((error, req, res, next) => {
      console.error('💀 Unhandled error:', error);
      
      res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        timestamp: Date.now(),
        requestId: req.requestId
      });
    });

    // Unhandled promise rejection handler
    process.on('unhandledRejection', (reason, promise) => {
      console.error('💀 Unhandled Promise Rejection:', reason);
    });

    // Uncaught exception handler
    process.on('uncaughtException', (error) => {
      console.error('💀 Uncaught Exception:', error);
      process.exit(1);
    });

    console.log('✅ Error handling initialized');
  }

  // ====================================================================
  // HEALTH & MONITORING
  // ====================================================================

  async _getHealthStatus() {
    const services = {
      server: true,
      serviceManager: !!this.serviceManager,
      blockchain: !!this.blockchain,
      websocket: this.wss && this.connectedClients.size >= 0
    };

    // Check blockchain connectivity if available
    let blockchainStatus = 'disconnected';
    if (this.blockchain) {
      try {
        const status = await this.blockchain.getStatus();
        blockchainStatus = status.connected ? 'connected' : 'disconnected';
      } catch (error) {
        blockchainStatus = 'error';
      }
    }

    // Check service manager status if available
    let serviceManagerStatus = 'unknown';
    if (this.serviceManager) {
      try {
        const status = await this.serviceManager.getStatus();
        serviceManagerStatus = status.operational ? 'operational' : 'degraded';
      } catch (error) {
        serviceManagerStatus = 'error';
      }
    }

    return {
      status: 'healthy',
      timestamp: Date.now(),
      version: '4.5.0',
      environment: this.config.environment,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      services: {
        ...services,
        blockchainStatus,
        serviceManagerStatus
      },
      clients: {
        websocket: this.connectedClients.size,
        sessions: this.clientSessions.size
      }
    };
  }

  // ====================================================================
  // SERVER CONTROL METHODS
  // ====================================================================

  async start() {
    if (this.isRunning) {
      console.log('⚠️ Server already running');
      return;
    }

    try {
      // Ensure initialization
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Start server
      await new Promise((resolve, reject) => {
        this.server.listen(this.config.port, this.config.host, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.isRunning = true;
      
      console.log(`🚀 Enterprise Server running on http://${this.config.host}:${this.config.port}`);
      console.log(`🌐 Environment: ${this.config.environment}`);
      console.log(`🔗 WebSocket clients: ${this.connectedClients.size}`);
      console.log(`⏰ Started at: ${new Date().toISOString()}`);

    } catch (error) {
      console.error('❌ Failed to start server:', error);
      throw error;
    }
  }

  async stop() {
    if (this.shutdownInProgress) {
      console.log('⚠️ Shutdown already in progress');
      return;
    }

    this.shutdownInProgress = true;
    console.log('🛑 Stopping Enterprise Server...');

    try {
      // Close WebSocket connections
      this.connectedClients.forEach(client => {
        if (client.readyState === 1) { // OPEN
          client.close(1001, 'Server shutdown');
        }
      });

      // Close service manager
      if (this.serviceManager) {
        await this.serviceManager.stop();
      }

      // Close blockchain connection
      if (this.blockchain) {
        await this.blockchain.disconnect();
      }

      // Close HTTP server
      if (this.server) {
        await new Promise((resolve) => {
          this.server.close(() => {
            resolve();
          });
        });
      }

      this.isRunning = false;
      this.isInitialized = false;
      this.shutdownInProgress = false;

      console.log('✅ Enterprise Server stopped successfully');

    } catch (error) {
      console.error('❌ Error during server shutdown:', error);
      throw error;
    }
  }

  // ====================================================================
  // PUBLIC METHODS
  // ====================================================================

  getStatus() {
    return {
      running: this.isRunning,
      initialized: this.isInitialized,
      shutdownInProgress: this.shutdownInProgress,
      clients: this.connectedClients.size,
      sessions: this.clientSessions.size,
      port: this.config.port,
      host: this.config.host,
      environment: this.config.environment
    };
  }

  broadcast(message) {
    if (typeof message !== 'string') {
      message = JSON.stringify(message);
    }

    let sentCount = 0;
    this.connectedClients.forEach(client => {
      if (client.readyState === 1) { // OPEN
        client.send(message);
        sentCount++;
      }
    });

    return sentCount;
  }
}

// ====================================================================
// EXPORTS
// ====================================================================

export { EnterpriseServer };
export default EnterpriseServer;/**
 * Backend Server Module - Exports RPC and blockchain functionality
 * 🚀 MODULE ONLY: No server startup - exports functions for main.js
 * 🔗 RPC EXPOSURE: Provides Bwaezi chain RPC endpoints using centralized credentials
 * 📊 DATA AGENT: Exports data collection and analytics functions
 */

import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone'; // ✅ CORRECT IMPORT
import cors from 'cors';
import express from 'express';
import 'dotenv/config';

// Import blockchain modules
import { createBrianNwaezikeChain } from './blockchain/BrianNwaezikeChain.js';
import { createDatabase } from './database/BrianNwaezikeDB.js';

// Global instances
let blockchainInstance = null;
let currentCredentials = null;

// 🎯 SET CREDENTIALS FROM MAIN.JS
export function setBackendCredentials(credentials) {
    currentCredentials = credentials;
    console.log('✅ Backend credentials set from main.js');
    if (credentials && credentials.BWAEZI_CHAIN_ID) {
        console.log(`🔗 Chain ID: ${credentials.BWAEZI_CHAIN_ID}`);
        console.log(`📝 Contract: ${credentials.BWAEZI_CONTRACT_ADDRESS}`);
    }
}

// Initialize core systems
export async function initializeBackendSystems() {
    console.log('🚀 Initializing Backend Systems Module...');
    
    try {
        // Initialize blockchain only if not already initialized by main.js
        if (!blockchainInstance) {
            console.log('🔗 Initializing Bwaezi Blockchain in backend module...');
            blockchainInstance = await createBrianNwaezikeChain({
                rpcUrl: 'https://rpc.winr.games',
                network: 'mainnet'
            });
            await blockchainInstance.init();
        }
        
        console.log('✅ Backend systems initialized successfully');
        return true;
    } catch (error) {
        console.error('❌ Backend system initialization failed:', error);
        return false;
    }
}

// 🌐 Public RPC Broadcast Function - Uses centralized credentials
export async function getBwaeziRPCData() {
    try {
        if (!currentCredentials) {
            throw new Error('Credentials not set - call setBackendCredentials() first');
        }

        let status = {};
        if (blockchainInstance) {
            status = await blockchainInstance.getStatus();
        }
        
        return {
            status: 'LIVE',
            rpcUrl: 'https://arielmatrix2-0-t2hc.onrender.com/bwaezi-rpc',
            chainId: currentCredentials.BWAEZI_CHAIN_ID,
            chainName: 'Bwaezi Mainnet',
            blockNumber: status.lastBlockNumber || currentCredentials.blockNumber || 0,
            gasPrice: status.gasPrice || '0',
            health: status.connected ? 'HEALTHY' : 'UNHEALTHY',
            peerCount: status.metrics?.peerCount || 0,
            timestamp: new Date().toISOString(),
            version: 'ArielSQL Ultimate Suite v4.3',
            networkId: 777777,
            nativeCurrency: {
                name: 'Bwaezi',
                symbol: 'BWAEZI',
                decimals: 18
            },
            credentialSource: 'Centralized from main.js'
        };
    } catch (error) {
        throw new Error(`RPC data error: ${error.message}`);
    }
}

// 🔍 Blockchain Status Function
export async function getBlockchainStatus() {
    try {
        if (!blockchainInstance) {
            throw new Error('Blockchain service starting up');
        }

        const status = await blockchainInstance.getStatus();
        return {
            status: 'SUCCESS',
            data: status,
            timestamp: new Date().toISOString(),
            credentialSource: 'Centralized from main.js'
        };
    } catch (error) {
        throw new Error(`Blockchain status error: ${error.message}`);
    }
}

// 📊 Data Agent Status Function
export async function getDataAgentStatus() {
    try {
        // Dynamic import to avoid circular dependencies
        const { getStatus } = await import('./agents/dataAgent.js');
        const status = getStatus();
        
        return {
            status: 'SUCCESS',
            data: status,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        throw new Error(`Data Agent status error: ${error.message}`);
    }
}

// 🎯 Start Data Collection Function
export async function startDataCollection() {
    try {
        // Dynamic import to avoid circular dependencies
        const DataAgent = await import('./agents/dataAgent.js');
        
        const logger = {
            info: (...args) => console.log('📊 [DataAgent]', ...args),
            error: (...args) => console.error('❌ [DataAgent]', ...args),
            success: (...args) => console.log('✅ [DataAgent]', ...args),
            warn: (...args) => console.warn('⚠️ [DataAgent]', ...args)
        };
        
        const dataAgent = new DataAgent.default({
            ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
            COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
            COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY
        }, logger);
        
        await dataAgent.initialize();
        const result = await dataAgent.run();
        
        return {
            status: 'SUCCESS',
            data: result,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        throw new Error(`Data collection error: ${error.message}`);
    }
}

// 💰 Revenue Analytics Function
export async function getRevenueAnalytics(timeframe = '7 days') {
    try {
        // Dynamic import to avoid circular dependencies
        const DataAgent = await import('./agents/dataAgent.js');
        
        const logger = {
            info: (...args) => console.log('📊 [DataAgent]', ...args),
            error: (...args) => console.error('❌ [DataAgent]', ...args),
            success: (...args) => console.log('✅ [DataAgent]', ...args),
            warn: (...args) => console.warn('⚠️ [DataAgent]', ...args)
        };
        
        const dataAgent = new DataAgent.default({
            ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
            COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
            COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY
        }, logger);
        
        await dataAgent.initialize();
        
        const stats = await dataAgent.getDataCollectionStats(timeframe);
        const revenue = await dataAgent.getRevenueAnalytics(timeframe);
        
        return {
            status: 'SUCCESS',
            data: {
                timeframe,
                collectionStats: stats,
                revenueAnalytics: revenue,
                timestamp: new Date().toISOString()
            }
        };
    } catch (error) {
        throw new Error(`Revenue analytics error: ${error.message}`);
    }
}

// 🔧 Health Check Function
export async function getBackendHealth() {
    const health = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        version: 'ArielMatrix 2.0',
        services: {
            blockchain: !!blockchainInstance && blockchainInstance.isConnected,
            credentials: !!currentCredentials,
            server: true
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development',
        credentialInfo: currentCredentials ? {
            hasCredentials: true,
            chainId: currentCredentials.BWAEZI_CHAIN_ID,
            source: 'Centralized from main.js'
        } : {
            hasCredentials: false,
            source: 'Not set'
        }
    };

    // Check Data Agent status separately without blocking
    try {
        const { getStatus } = await import('./agents/dataAgent.js');
        const dataAgentStatus = getStatus();
        health.services.dataAgent = dataAgentStatus.lastStatus !== 'error';
    } catch (error) {
        health.services.dataAgent = false;
        health.dataAgentError = error.message;
    }

    return health;
}

// 🏠 Root Endpoint Data Function
export function getRootEndpointData() {
    return {
        message: '🚀 ArielMatrix 2.0 - Global Enterprise Blockchain Gateway',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            rpc: '/bwaezi-rpc',
            status: '/blockchain-status',
            data: '/data-agent-status',
            health: '/health',
            revenue: '/revenue-analytics',
            graphql: '/graphql'
        },
        documentation: 'https://github.com/arielmatrix/arielmatrix2.0',
        credentialSource: 'Centralized from main.js'
    };
}

// GraphQL Setup Functions - USING CORRECT STANDALONE PATTERN
export async function createGraphQLServer() {
    try {
        const typeDefs = `#graphql
            type Query {
                health: String
                blockchainStatus: String
                dataAgentStatus: String
            }
            
            type Mutation {
                startDataCollection: String
            }
        `;

        const resolvers = {
            Query: {
                health: () => 'OK',
                blockchainStatus: () => blockchainInstance ? 'CONNECTED' : 'DISCONNECTED',
                dataAgentStatus: async () => {
                    try {
                        const { getStatus } = await import('./agents/dataAgent.js');
                        const status = getStatus();
                        return status.lastStatus || 'UNKNOWN';
                    } catch (error) {
                        return 'ERROR: ' + error.message;
                    }
                }
            },
            Mutation: {
                startDataCollection: async () => {
                    try {
                        const DataAgent = await import('./agents/dataAgent.js');
                        const logger = {
                            info: (...args) => console.log('📊 [DataAgent]', ...args),
                            error: (...args) => console.error('❌ [DataAgent]', ...args)
                        };
                        
                        const dataAgent = new DataAgent.default({
                            ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
                            COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS
                        }, logger);
                        
                        await dataAgent.initialize();
                        const result = await dataAgent.run();
                        return `Data collection started: ${JSON.stringify(result)}`;
                    } catch (error) {
                        return `Error: ${error.message}`;
                    }
                }
            }
        };

        const server = new ApolloServer({
            typeDefs,
            resolvers,
            introspection: true
        });

        console.log('✅ GraphQL server created successfully (standalone mode)');
        return server;
    } catch (error) {
        console.error('❌ GraphQL server creation failed:', error);
        return null;
    }
}

// Export route handlers for integration with main.js
export function getBackendRouteHandlers() {
    return {
        // RPC endpoint handler
        '/bwaezi-rpc': {
            method: 'GET',
            handler: async (req, res) => {
                try {
                    const rpcData = await getBwaeziRPCData();
                    res.json(rpcData);
                } catch (error) {
                    res.status(500).json({
                        status: 'ERROR',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        },
        
        // Blockchain status handler
        '/blockchain-status': {
            method: 'GET',
            handler: async (req, res) => {
                try {
                    const status = await getBlockchainStatus();
                    res.json(status);
                } catch (error) {
                    res.status(500).json({
                        status: 'ERROR',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        },
        
        // Data Agent status handler
        '/data-agent-status': {
            method: 'GET',
            handler: async (req, res) => {
                try {
                    const status = await getDataAgentStatus();
                    res.json(status);
                } catch (error) {
                    res.status(503).json({
                        status: 'ERROR',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        },
        
        // Revenue analytics handler
        '/revenue-analytics': {
            method: 'GET',
            handler: async (req, res) => {
                try {
                    const timeframe = req.query.timeframe || '7 days';
                    const analytics = await getRevenueAnalytics(timeframe);
                    res.json(analytics);
                } catch (error) {
                    res.status(500).json({
                        status: 'ERROR',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        },
        
        // Health check handler
        '/health': {
            method: 'GET',
            handler: async (req, res) => {
                try {
                    const health = await getBackendHealth();
                    res.json(health);
                } catch (error) {
                    res.status(500).json({
                        status: 'ERROR',
                        message: error.message,
                        timestamp: new Date().toISOString()
                    });
                }
            }
        },
        
        // Root endpoint handler
        '/': {
            method: 'GET',
            handler: (req, res) => {
                const rootData = getRootEndpointData();
                res.json(rootData);
            }
        }
    };
}

// Export the blockchain instance for direct access
export function getBlockchainInstance() {
    return blockchainInstance;
}

// Graceful shutdown for backend systems
export async function shutdownBackendSystems() {
    console.log('\n🔻 Shutting down backend systems...');
    if (blockchainInstance) {
        await blockchainInstance.disconnect();
    }
    console.log('✅ Backend systems shutdown completed');
}

// Register shutdown handlers for module cleanup
process.on('SIGINT', async () => {
    await shutdownBackendSystems();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await shutdownBackendSystems();
    process.exit(0);
});

// Export initialization status
export function isBackendInitialized() {
    return !!blockchainInstance && !!currentCredentials;
}

// Note: Server startup code has been removed - this is now a pure module
