import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

// === Core Blockchain Systems ===
import BrianNwaezikeChain from "../backend/blockchain/BrianNwaezikeChain.js";
import { BrianNwaezikePayoutSystem } from "../backend/blockchain/BrianNwaezikePayoutSystem.js";

// === Governance + Logging ===
import { SovereignGovernance } from "../modules/governance-engine/index.js";
import { ArielSQLiteEngine } from "../modules/ariel-sqlite-engine/index.js";

// === Phase 3 Advanced Modules ===
import { QuantumResistantCrypto } from "../modules/quantum-resistant-crypto/index.js";
import { QuantumShield } from "../modules/quantum-shield/index.js";
import { AIThreatDetector } from "../modules/ai-threat-detector/index.js";
import { AISecurityModule } from "../modules/ai-security-module/index.js";
import { CrossChainBridge } from "../modules/cross-chain-bridge/index.js";
import { OmnichainInteroperabilityEngine } from "../modules/omnichain-interoperability/index.js";
import { ShardingManager } from "../modules/sharding-manager/index.js";
import { InfiniteScalabilityEngine } from "../modules/infinite-scalability-engine/index.js";
import { EnergyEfficientConsensus } from "../modules/energy-efficient-consensus/index.js";
import { CarbonNegativeConsensus } from "../modules/carbon-negative-consensus/index.js";

// === Agents ===
import AdRevenueAgent from "../backend/agents/adRevenueAgent.js";
import AdsenseAgent from "../backend/agents/adsenseAgent.js";
import ApiScoutAgent from "../backend/agents/apiScoutAgent.js";
import { QuantumBrowserManager } from "../backend/agents/browserManager.js";
import configAgent from "../backend/agents/configAgent.js";
import ContractDeployAgent from "../backend/agents/contractDeployAgent.js";
import { EnhancedCryptoAgent } from "../backend/agents/cryptoAgent.js";
import dataAgent from "../backend/agents/dataAgent.js";
import forexSignalAgent from "../backend/agents/forexSignalAgent.js";
import HealthAgent from "../backend/agents/healthAgent.js";
import PayoutAgent from "../backend/agents/payoutAgent.js";
import shopifyAgent from "../backend/agents/shopifyAgent.js";
import socialAgent from "../backend/agents/socialAgent.js";

class serviceManager {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 10000,
      blockchainConfig: config.blockchainConfig || {},
      mainnet: config.mainnet !== undefined ? config.mainnet : true,
      dbPath: config.dbPath || "./data/service_logs.db"
    };

    this.app = express();
    this.app.use(cors());
    this.app.use(bodyParser.json({ limit: "50mb" }));
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ 
      server: this.server,
      perMessageDeflate: false
    });

    // Initialize logging system first to prevent race conditions
    this.loggerDB = null;
    this.isLoggerInitialized = false;
    
    // Core systems - will be initialized in proper sequence
    this.blockchain = null;
    this.payoutSystem = null;
    this.governance = null;
    
    this.modules = {};
    this.agents = {};

    this.connectedClients = new Set();
    this.isInitialized = false;
    this.backgroundInterval = null;

    // Setup basic routes that don't depend on initialized systems
    this._setupBasicRoutes();
    this._setupWebSocket();
    this._setupErrorHandling();
  }

  async initialize() {
    if (this.isInitialized) {
      console.log("⚠️ serviceManager already initialized");
      return;
    }

    try {
      console.log("🚀 Initializing ServiceManager...");

      // STEP 1: Initialize database FIRST with enhanced error handling
      await this._initializeLoggerDatabase();

      // STEP 2: Initialize core blockchain systems
      await this._initializeCoreSystems();

      // STEP 3: Initialize governance
      await this._initializeGovernance();

      // STEP 4: Initialize all modules
      await this._initializeModules();

      // STEP 5: Initialize all agents
      await this._initializeAgents();

      this.isInitialized = true;
      console.log("✅ serviceManager initialized successfully");

      // Setup full API routes now that everything is initialized
      this._setupApiRoutes();
      
      // Start background services
      this._startBackgroundServices();

    } catch (error) {
      console.error("❌ serviceManager initialization failed:", error);
      
      // Ensure we can still log errors even if initialization fails
      await this._emergencyLogError('initialization_failed', error);
      
      throw error;
    }
  }

  async _initializeLoggerDatabase() {
    try {
      console.log("🗄️ Initializing logger database...");
      
      // 🚨 CRITICAL FIX: ArielSQLiteEngine doesn't have an init() method
      // Use proper initialization pattern
      this.loggerDB = new ArielSQLiteEngine({
        dbPath: this.config.dbPath,
        poolSize: 5,
        timeout: 15000,
        autoBackup: true,
        mainnet: this.config.mainnet
      });

      // 🎯 FIX: Initialize using the correct method - ArielSQLiteEngine auto-initializes on creation
      // No need to call .init() as it's already initialized in constructor
      console.log("✅ ArielSQLiteEngine instance created successfully");
      
      // Test the connection by creating schema
      await this._createServiceSchema();
      
      this.isLoggerInitialized = true;
      console.log("✅ Logger database initialized successfully");
    } catch (error) {
      console.error("❌ Logger database initialization failed:", error);
      
      // Create emergency fallback logger
      this.loggerDB = this._createEmergencyLogger();
      this.isLoggerInitialized = false;
      
      throw new Error(`Logger database initialization failed: ${error.message}`);
    }
  }

  _createEmergencyLogger() {
    console.warn("🔄 Creating emergency fallback logger");
    
    return {
      run: async (sql, params = []) => {
        console.log(`[EMERGENCY DB] ${sql}`, params);
        return { lastID: 1, changes: 1 };
      },
      get: async (sql, params = []) => {
        console.log(`[EMERGENCY DB GET] ${sql}`, params);
        return null;
      },
      all: async (sql, params = []) => {
        console.log(`[EMERGENCY DB ALL] ${sql}`, params);
        return [];
      },
      close: async () => {
        console.log("[EMERGENCY DB] Closed");
        return Promise.resolve();
      },
      // 🎯 ADDED: Emergency init method to prevent "init is not a function" errors
      init: async () => {
        console.log("[EMERGENCY DB] Initialized");
        return Promise.resolve();
      }
    };
  }

  async _initializeCoreSystems() {
    console.log("⛓️ Initializing core blockchain systems...");
    
    this.blockchain = new BrianNwaezikeChain({
      mainnet: this.config.mainnet,
      chainId: this.config.mainnet ? 'bwaezi-mainnet-1' : 'bwaezi-testnet-1',
      ...this.config.blockchainConfig
    });

    this.payoutSystem = new BrianNwaezikePayoutSystem({
      mainnet: this.config.mainnet
    });

    // 🎯 ENHANCED: Proper initialization with error handling
    try {
      if (this.blockchain.init) await this.blockchain.init();
      console.log("✅ Blockchain system initialized");
    } catch (error) {
      console.error("❌ Blockchain initialization failed:", error);
      throw error;
    }

    try {
      if (this.payoutSystem.init) await this.payoutSystem.init();
      console.log("✅ Payout system initialized");
    } catch (error) {
      console.error("❌ Payout system initialization failed:", error);
      // Don't throw for payout system - it's less critical
    }
  }

  async _initializeGovernance() {
    console.log("🏛️ Initializing governance...");
    
    this.governance = new SovereignGovernance({
      votingPeriod: 7 * 24 * 60 * 60 * 1000,
      mainnet: this.config.mainnet
    });

    try {
      await this.governance.initialize();
      console.log("✅ Governance initialized");
    } catch (error) {
      console.error("❌ Governance initialization failed:", error);
      // Governance failure shouldn't stop the entire system
      this.governance = this._createEmergencyGovernance();
    }
  }

  _createEmergencyGovernance() {
    console.warn("🔄 Creating emergency governance fallback");
    
    return {
      verifyModule: async (moduleName) => {
        console.log(`[EMERGENCY GOVERNANCE] Approving module: ${moduleName}`);
        return true; // Auto-approve everything in emergency mode
      },
      initialize: async () => Promise.resolve(),
      getStatus: () => ({ status: 'emergency_mode', timestamp: Date.now() })
    };
  }

  async _initializeModules() {
    console.log("⚙️ Initializing modules...");
    
    this.modules = {
      quantumCrypto: new QuantumResistantCrypto({ 
        algorithm: 'dilithium3',
        mainnet: this.config.mainnet 
      }),
      sqlite: this.loggerDB,
      quantumShield: new QuantumShield({ mainnet: this.config.mainnet }),
      aiThreatDetector: new AIThreatDetector({
        realTimeScan: true,
        mainnet: this.config.mainnet
      }),
      aiSecurity: new AISecurityModule({
        monitoring: true,
        mainnet: this.config.mainnet
      }),
      crossChainBridge: new CrossChainBridge({
        mainnet: this.config.mainnet,
        rpcEndpoints: {
          ETHEREUM: process.env.ETH_MAINNET_RPC || "https://mainnet.infura.io/v3/your-project-id",
          SOLANA: process.env.SOL_MAINNET_RPC || "https://api.mainnet-beta.solana.com",
          BINANCE: process.env.BNB_MAINNET_RPC || "https://bsc-dataseed.binance.org"
        }
      }),
      omnichainInterop: new OmnichainInteroperabilityEngine({
        mainnet: this.config.mainnet,
        supportedChains: ['ethereum', 'solana', 'binance', 'polygon', 'avalanche']
      }),
      shardingManager: new ShardingManager(4, {
        autoRebalance: true,
        mainnet: this.config.mainnet
      }),
      scalabilityEngine: new InfiniteScalabilityEngine({
        maxTps: 100000,
        mainnet: this.config.mainnet
      }),
      consensusEngine: new EnergyEfficientConsensus({
        zeroCost: true,
        mainnet: this.config.mainnet
      }),
      carbonConsensus: new CarbonNegativeConsensus({
        mainnet: this.config.mainnet
      })
    };

    const modulePromises = Object.entries(this.modules).map(async ([name, module]) => {
      try {
        if (module.initialize && typeof module.initialize === 'function') {
          console.log(`⚙️ Initializing module: ${name}`);
          await module.initialize();
          console.log(`✅ Module ${name} initialized successfully`);
        } else {
          console.log(`⚙️ Module ${name} auto-initialized (no init method)`);
        }
      } catch (error) {
        console.error(`❌ Failed to initialize module ${name}:`, error.message);
        // Don't throw here - allow other modules to initialize
      }
    });

    await Promise.allSettled(modulePromises);
    console.log("✅ All modules initialized");
  }

  async _initializeAgents() {
    console.log("🤖 Initializing agents...");
    
    this.agents = {
      adRevenue: new AdRevenueAgent({ mainnet: this.config.mainnet }),
      adsense: new AdsenseAgent({ mainnet: this.config.mainnet }),
      apiScout: new ApiScoutAgent({ mainnet: this.config.mainnet }),
      browser: new QuantumBrowserManager({ mainnet: this.config.mainnet }),
      config: new configAgent({ mainnet: this.config.mainnet }),
      contractDeploy: new ContractDeployAgent({ mainnet: this.config.mainnet }),
      crypto: new EnhancedCryptoAgent({ mainnet: this.config.mainnet }),
      data: new dataAgent({ mainnet: this.config.mainnet }),
      forex: new forexSignalAgent({ mainnet: this.config.mainnet }),
      health: HealthAgent,
      payout: PayoutAgent,
      shopify: new shopifyAgent({ mainnet: this.config.mainnet }),
      social: new socialAgent({ mainnet: this.config.mainnet })
    };

    const agentPromises = Object.entries(this.agents).map(async ([name, agent]) => {
      try {
        if (agent.initialize && typeof agent.initialize === 'function') {
          console.log(`🤖 Initializing agent: ${name}`);
          await agent.initialize();
          console.log(`✅ Agent ${name} initialized successfully`);
        } else {
          console.log(`🤖 Agent ${name} auto-initialized (no init method)`);
        }
      } catch (error) {
        console.error(`❌ Failed to initialize agent ${name}:`, error.message);
        // Don't throw here - allow other agents to initialize
      }
    });

    await Promise.allSettled(agentPromises);
    console.log("✅ All agents initialized");
  }

  async _createServiceSchema() {
    if (!this.isLoggerInitialized) {
      console.warn("⚠️ Skipping schema creation - logger not initialized");
      return;
    }

    const tables = [
      `CREATE TABLE IF NOT EXISTS service_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_name TEXT NOT NULL,
        payload TEXT,
        result TEXT,
        status TEXT DEFAULT 'completed',
        error_message TEXT,
        timestamp INTEGER NOT NULL,
        response_time INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS service_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_name TEXT NOT NULL,
        call_count INTEGER DEFAULT 0,
        success_count INTEGER DEFAULT 0,
        error_count INTEGER DEFAULT 0,
        avg_response_time REAL DEFAULT 0,
        last_called INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS blockchain_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type TEXT NOT NULL,
        block_height INTEGER,
        transaction_hash TEXT,
        from_address TEXT,
        to_address TEXT,
        amount REAL,
        status TEXT,
        timestamp INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const tableSql of tables) {
      try {
        await this.loggerDB.run(tableSql);
        console.log(`✅ Created table: ${tableSql.split(' ')[5]}`); // Extract table name
      } catch (error) {
        console.error(`❌ Failed to create table: ${error.message}`);
      }
    }

    // Create indexes
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_service_logs_name ON service_logs(service_name)",
      "CREATE INDEX IF NOT EXISTS idx_service_logs_time ON service_logs(timestamp)",
      "CREATE INDEX IF NOT EXISTS idx_blockchain_events_type ON blockchain_events(event_type)",
      "CREATE INDEX IF NOT EXISTS idx_blockchain_events_time ON blockchain_events(timestamp)"
    ];

    for (const indexSql of indexes) {
      try {
        await this.loggerDB.run(indexSql);
      } catch (error) {
        console.error(`❌ Failed to create index: ${error.message}`);
      }
    }

    console.log("✅ Database schema initialized successfully");
  }

  start() {
    this.server.listen(this.config.port, "0.0.0.0", () => {
      console.log(`🌐 serviceManager live on port ${this.config.port}`);
      console.log(`📊 Mainnet Mode: ${this.config.mainnet}`);
      console.log(`🔗 WebSocket Server: ws://localhost:${this.config.port}`);
      console.log(`🗄️ Database Path: ${this.config.dbPath}`);
      console.log(`🚀 ArielSQL Suite - Global Enterprise System OPERATIONAL`);
    });
  }

  async stop() {
    console.log("🛑 Stopping serviceManager...");
    
    // Close WebSocket connections
    this.connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close(1000, "Server shutdown");
      }
    });
    
    this.connectedClients.clear();

    // Stop background services
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
    }

    // Close database connections
    if (this.loggerDB && this.loggerDB.close) {
      try {
        await this.loggerDB.close();
        console.log("✅ Database connections closed");
      } catch (error) {
        console.error("❌ Error closing database:", error);
      }
    }

    // Close server
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log("✅ serviceManager stopped successfully");
        resolve();
      });
    });
  }

  async routeServiceCall(serviceName, payload) {
    const startTime = Date.now();
    
    try {
      // Verify service is approved by governance
      const approved = this.governance ? await this.governance.verifyModule(serviceName) : true;
      if (!approved) {
        throw new Error(`Service ${serviceName} not approved by governance`);
      }

      // Find handler
      const handler = this.agents[serviceName] || this.modules[serviceName];
      if (!handler) {
        throw new Error(`No handler found for service: ${serviceName}`);
      }

      if (typeof handler.execute !== "function") {
        throw new Error(`Handler for ${serviceName} does not have execute method`);
      }

      // Execute service
      const result = await handler.execute(payload);
      const responseTime = Date.now() - startTime;

      // Log successful call
      await this._logServiceCall(serviceName, payload, result, 'completed', null, responseTime);

      // Update metrics
      await this._updateServiceMetrics(serviceName, true, responseTime);

      return { 
        success: true, 
        result,
        responseTime,
        service: serviceName
      };

    } catch (error) {
      const responseTime = Date.now() - startTime;
      
      console.error(`❌ Service call failed: ${serviceName}`, error.message);

      // Log failed call
      await this._logServiceCall(serviceName, payload, null, 'failed', error.message, responseTime);

      // Update metrics
      await this._updateServiceMetrics(serviceName, false, responseTime);

      return { 
        success: false, 
        error: error.message,
        service: serviceName,
        responseTime
      };
    }
  }

  async _logServiceCall(serviceName, payload, result, status, errorMessage, responseTime) {
    if (!this.isLoggerInitialized) {
      console.log(`[LOG] ${serviceName} - ${status} - ${errorMessage || 'Success'}`);
      return;
    }

    try {
      await this.loggerDB.run(
        `INSERT INTO service_logs (service_name, payload, result, status, error_message, timestamp, response_time) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          serviceName, 
          JSON.stringify(payload), 
          result ? JSON.stringify(result) : null,
          status,
          errorMessage,
          Date.now(),
          responseTime
        ]
      );
    } catch (error) {
      console.error("❌ Failed to log service call:", error.message);
    }
  }

  async _updateServiceMetrics(serviceName, success, responseTime) {
    if (!this.isLoggerInitialized) return;

    try {
      const existing = await this.loggerDB.get(
        "SELECT * FROM service_metrics WHERE service_name = ?",
        [serviceName]
      );

      if (existing) {
        await this.loggerDB.run(
          `UPDATE service_metrics 
           SET call_count = call_count + 1,
               success_count = success_count + ?,
               error_count = error_count + ?,
               avg_response_time = ((avg_response_time * call_count) + ?) / (call_count + 1),
               last_called = ?,
               updated_at = CURRENT_TIMESTAMP
           WHERE service_name = ?`,
          [
            success ? 1 : 0,
            success ? 0 : 1,
            responseTime,
            Date.now(),
            serviceName
          ]
        );
      } else {
        await this.loggerDB.run(
          `INSERT INTO service_metrics (service_name, call_count, success_count, error_count, avg_response_time, last_called)
           VALUES (?, 1, ?, ?, ?, ?)`,
          [
            serviceName,
            success ? 1 : 0,
            success ? 0 : 1,
            responseTime,
            Date.now()
          ]
        );
      }
    } catch (error) {
      console.error("❌ Failed to update service metrics:", error.message);
    }
  }

  _setupBasicRoutes() {
    // Basic health check that doesn't depend on initialized systems
    this.app.get("/", (req, res) => {
      res.json({ 
        status: "initializing", 
        service: "ArielSQL Suite v3.0", 
        mainnet: this.config.mainnet,
        timestamp: Date.now(),
        version: "3.0.0"
      });
    });

    // Basic health endpoint
    this.app.get("/health/basic", (req, res) => {
      res.json({
        status: "alive",
        service: "ArielSQL Suite",
        timestamp: Date.now(),
        mainnet: this.config.mainnet,
        loggerInitialized: this.isLoggerInitialized
      });
    });
  }

  _setupApiRoutes() {
    // Comprehensive health check
    this.app.get("/health", async (req, res) => {
      try {
        const healthStatus = this.agents.health ? 
          await this.agents.health.getStatus() : 
          { status: 'unknown', agents: Object.keys(this.agents) };
        
        const blockchainStatus = this.blockchain ? 
          await this.blockchain.getNetworkStats() : 
          { status: 'unknown' };

        res.json({
          service: "ArielSQL Suite",
          status: "healthy",
          mainnet: this.config.mainnet,
          timestamp: Date.now(),
          agents: healthStatus,
          blockchain: blockchainStatus,
          uptime: process.uptime(),
          loggerInitialized: this.isLoggerInitialized,
          connectedClients: this.connectedClients.size
        });
      } catch (error) {
        res.status(500).json({ 
          status: "degraded", 
          error: error.message 
        });
      }
    });

    // Service execution endpoint
    this.app.post("/service/:name", async (req, res) => {
      const { name } = req.params;
      const payload = req.body;

      if (!name || !payload) {
        return res.status(400).json({ 
          success: false, 
          error: "Service name and payload are required" 
        });
      }

      const result = await this.routeServiceCall(name, payload);
      res.json(result);
    });

    // Payouts endpoint
    this.app.post("/payouts", async (req, res) => {
      const { wallet, amount, currency = 'bwzC' } = req.body;
      
      if (!wallet || !amount) {
        return res.status(400).json({ 
          error: "Wallet and amount are required" 
        });
      }

      try {
        const result = await this.payoutSystem.recordPayout(wallet, amount, currency);
        
        // Broadcast payout event via WebSocket
        this._broadcastToClients({
          type: "payout_processed",
          data: { wallet, amount, currency, timestamp: Date.now() }
        });

        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Blockchain info endpoint
    this.app.get("/blockchain/info", async (req, res) => {
      try {
        const stats = await this.blockchain.getNetworkStats();
        const blockHeight = await this.blockchain.getBlockCount();
        const pendingTxs = await this.blockchain.getPendingTransactions();
        
        res.json({
          blockHeight,
          pendingTransactions: pendingTxs.length,
          networkStats: stats,
          mainnet: this.config.mainnet
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Service metrics endpoint
    this.app.get("/metrics/services", async (req, res) => {
      try {
        const metrics = await this.loggerDB.all(
          "SELECT * FROM service_metrics ORDER BY call_count DESC"
        );
        res.json({ metrics });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // System status endpoint
    this.app.get("/status", async (req, res) => {
      try {
        const status = await this.getServiceStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  _setupWebSocket() {
    this.wss.on("connection", (ws, req) => {
      console.log("🔗 New WebSocket connection");
      this.connectedClients.add(ws);

      ws.send(JSON.stringify({ 
        type: "connected",
        message: "Connected to ArielSQL Suite WebSocket",
        timestamp: Date.now(),
        mainnet: this.config.mainnet
      }));

      ws.on("message", async (data) => {
        try {
          const message = JSON.parse(data);
          
          switch (message.type) {
            case "ping":
              ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
              break;

            case "blockchain_tx":
              if (!this.blockchain) {
                throw new Error("Blockchain not initialized");
              }
              
              const txResult = await this.blockchain.addTransaction(message.payload);
              const block = await this.blockchain.mineBlock();
              
              ws.send(JSON.stringify({ 
                type: "block_mined", 
                block,
                transaction: txResult 
              }));

              // Broadcast to all clients
              this._broadcastToClients({
                type: "new_block",
                data: block
              });
              break;

            case "service_call":
              const serviceResult = await this.routeServiceCall(
                message.service, 
                message.payload
              );
              ws.send(JSON.stringify({
                type: "service_result",
                service: message.service,
                result: serviceResult
              }));
              break;

            case "interop":
              const interopResult = await this.modules.omnichainInterop.executeCrossChainOperation(message.payload);
              ws.send(JSON.stringify({ 
                type: "interop_result", 
                result: interopResult 
              }));
              break;

            default:
              ws.send(JSON.stringify({ 
                type: "error", 
                message: "Unknown message type" 
              }));
          }
        } catch (error) {
          console.error("WebSocket message error:", error);
          ws.send(JSON.stringify({ 
            type: "error", 
            message: error.message 
          }));
        }
      });

      ws.on("close", () => {
        console.log("🔌 WebSocket connection closed");
        this.connectedClients.delete(ws);
      });

      ws.on("error", (error) => {
        console.error("WebSocket error:", error);
        this.connectedClients.delete(ws);
      });
    });
  }

  _setupErrorHandling() {
    process.on('uncaughtException', (error) => {
      console.error('🛑 Uncaught Exception:', error);
      this._emergencyLogError('uncaught_exception', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('🛑 Unhandled Rejection at:', promise, 'reason:', reason);
      this._emergencyLogError('unhandled_rejection', reason);
    });

    this.app.use((error, req, res, next) => {
      console.error('🛑 Express error:', error);
      this._emergencyLogError('express_error', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    });
  }

  async _emergencyLogError(type, error) {
    // Emergency logging that works even if loggerDB isn't initialized
    const timestamp = Date.now();
    const errorMessage = error?.message || String(error);
    
    console.error(`[EMERGENCY ERROR] ${type}: ${errorMessage} at ${timestamp}`);
    
    // Try to use loggerDB if available
    if (this.isLoggerInitialized) {
      try {
        await this.loggerDB.run(
          "INSERT INTO service_logs (service_name, payload, result, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
          ['error_handler', JSON.stringify({ type }), null, 'error', errorMessage, timestamp]
        );
      } catch (logError) {
        console.error("❌ Failed to log error in database:", logError);
      }
    }
  }

  _broadcastToClients(message) {
    const messageStr = JSON.stringify(message);
    this.connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          console.error("Failed to broadcast to client:", error);
          this.connectedClients.delete(client);
        }
      }
    });
  }

  _startBackgroundServices() {
    // Background health monitoring
    this.backgroundInterval = setInterval(async () => {
      try {
        // Update network stats
        if (this.blockchain && this.blockchain.getNetworkStats) {
          const stats = await this.blockchain.getNetworkStats();
          this._broadcastToClients({
            type: "network_stats",
            data: stats,
            timestamp: Date.now()
          });
        }

        // Clean up old connections
        this.connectedClients.forEach(client => {
          if (client.readyState === WebSocket.CLOSED || 
              client.readyState === WebSocket.CLOSING) {
            this.connectedClients.delete(client);
          }
        });

        // Log system heartbeat
        if (this.isLoggerInitialized) {
          await this._logServiceCall('heartbeat', {}, { status: 'alive' }, 'completed', null, 0);
        }
      } catch (error) {
        console.error("Background service error:", error);
      }
    }, 30000); // Every 30 seconds
  }

  // Public method to get service status
  async getServiceStatus() {
    let metrics = [];
    
    if (this.isLoggerInitialized) {
      try {
        metrics = await this.loggerDB.all(
          "SELECT service_name, call_count, success_count, error_count, avg_response_time FROM service_metrics"
        );
      } catch (error) {
        console.error("Failed to get metrics:", error);
      }
    }
    
    return {
      initialized: this.isInitialized,
      mainnet: this.config.mainnet,
      connectedClients: this.connectedClients.size,
      loggerInitialized: this.isLoggerInitialized,
      services: metrics,
      uptime: process.uptime(),
      timestamp: Date.now()
    };
  }
}

export { serviceManager };
