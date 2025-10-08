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

// === Unified Database Interface ===
import { UnifiedDatabaseInterface } from "../modules/database-initializer.js";

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
import DataAgent from "../backend/agents/dataAgent.js";
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
      dbPath: config.dbPath || "./data/service_logs.db",
      // 🆕 Database configuration
      databaseConfig: config.databaseConfig || {
        maxConnections: 10,
        timeout: 30000,
        autoBackup: true,
        enableWAL: true,
        journalMode: 'WAL',
        cacheSize: -2000
      }
    };

    this.app = express();
    this.app.use(cors());
    this.app.use(bodyParser.json({ limit: "50mb" }));
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ 
      server: this.server,
      perMessageDeflate: false
    });

    // 🆕 Unified Database Interface
    this.database = null;
    this.isDatabaseInitialized = false;
    
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

      // 🆕 STEP 1: Initialize Unified Database Interface FIRST
      await this._initializeUnifiedDatabase();

      // STEP 2: Initialize core blockchain systems
      await this._initializeCoreSystems();

      // STEP 3: Initialize governance
      await this._initializeGovernance();

      // STEP 4: Initialize all modules (with database access)
      await this._initializeModules();

      // STEP 5: Initialize all agents (with database access)
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

  // 🆕 NEW METHOD: Initialize Unified Database Interface
  async _initializeUnifiedDatabase() {
    try {
      console.log("🗄️ Initializing Unified Database Interface...");
      
      this.database = new UnifiedDatabaseInterface({
        dbPath: this.config.dbPath,
        mainnet: this.config.mainnet,
        ...this.config.databaseConfig
      });

      // Initialize the database
      await this.database.initialize();
      
      // Store reference for backward compatibility
      this.loggerDB = this.database;
      this.isDatabaseInitialized = true;
      this.isLoggerInitialized = true;
      
      console.log("✅ Unified Database Interface initialized successfully");
    } catch (error) {
      console.error("❌ Unified Database Interface initialization failed:", error);
      
      // Create emergency fallback
      this.database = this._createEmergencyDatabase();
      this.isDatabaseInitialized = false;
      
      throw new Error(`Database initialization failed: ${error.message}`);
    }
  }

  // 🆕 NEW METHOD: Create emergency database fallback
  _createEmergencyDatabase() {
    console.warn("🔄 Creating emergency fallback database");
    
    const emergencyDB = {
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
      initialize: async () => {
        console.log("[EMERGENCY DB] Initialized");
        return Promise.resolve();
      },
      // 🆕 Unified interface methods
      query: async (sql, params = []) => {
        console.log(`[EMERGENCY DB QUERY] ${sql}`, params);
        return { rows: [], changes: 0 };
      },
      transaction: async (callback) => {
        console.log("[EMERGENCY DB] Transaction started");
        return await callback(emergencyDB);
      },
      getDatabaseInstance: () => emergencyDB
    };
    
    return emergencyDB;
  }

  // 🆕 NEW METHOD: Get database instance for modules/agents
  getDatabase() {
    if (!this.isDatabaseInitialized) {
      console.warn("⚠️ Database not initialized, returning emergency database");
      return this._createEmergencyDatabase();
    }
    return this.database;
  }

  // 🆕 UPDATED: Initialize modules with database access
  async _initializeModules() {
    console.log("⚙️ Initializing modules...");
    
    // Get database instance for all modules
    const database = this.getDatabase();
    
    this.modules = {
      quantumCrypto: new QuantumResistantCrypto({ 
        algorithm: 'dilithium3',
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      sqlite: database, // 🆕 Use unified database
      quantumShield: new QuantumShield({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      aiThreatDetector: new AIThreatDetector({
        realTimeScan: true,
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      aiSecurity: new AISecurityModule({
        monitoring: true,
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      crossChainBridge: new CrossChainBridge({
        mainnet: this.config.mainnet,
        rpcEndpoints: {
          ETHEREUM: process.env.ETH_MAINNET_RPC || "https://mainnet.infura.io/v3/your-project-id",
          SOLANA: process.env.SOL_MAINNET_RPC || "https://api.mainnet-beta.solana.com",
          BINANCE: process.env.BNB_MAINNET_RPC || "https://bsc-dataseed.binance.org"
        },
        database: database // 🆕 Pass database instance
      }),
      omnichainInterop: new OmnichainInteroperabilityEngine({
        mainnet: this.config.mainnet,
        supportedChains: ['ethereum', 'solana', 'binance', 'polygon', 'avalanche'],
        database: database // 🆕 Pass database instance
      }),
      shardingManager: new ShardingManager(4, {
        autoRebalance: true,
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      scalabilityEngine: new InfiniteScalabilityEngine({
        maxTps: 100000,
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      consensusEngine: new EnergyEfficientConsensus({
        zeroCost: true,
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      carbonConsensus: new CarbonNegativeConsensus({
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
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

  // 🆕 UPDATED: Initialize agents with database access
  async _initializeAgents() {
    console.log("🤖 Initializing agents...");
    
    // Get database instance for all agents
    const database = this.getDatabase();
    
    this.agents = {
      adRevenue: new AdRevenueAgent({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      adsense: new AdsenseAgent({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      apiScout: new ApiScoutAgent({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      browser: new QuantumBrowserManager({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      config: new configAgent({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      contractDeploy: new ContractDeployAgent({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      crypto: new EnhancedCryptoAgent({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      data: new DataAgent({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      forex: new forexSignalAgent({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      health: HealthAgent, // Static class or function
      payout: PayoutAgent, // Static class or function
      shopify: new shopifyAgent({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      }),
      social: new socialAgent({ 
        mainnet: this.config.mainnet,
        database: database // 🆕 Pass database instance
      })
    };

    // 🆕 Inject database into static agents if they support it
    if (this.agents.health && this.agents.health.setDatabase) {
      this.agents.health.setDatabase(database);
    }
    if (this.agents.payout && this.agents.payout.setDatabase) {
      this.agents.payout.setDatabase(database);
    }

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

  // 🆕 UPDATED: Use unified database for schema creation
  async _createServiceSchema() {
    if (!this.isDatabaseInitialized) {
      console.warn("⚠️ Skipping schema creation - database not initialized");
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
        await this.database.run(tableSql);
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
        await this.database.run(indexSql);
      } catch (error) {
        console.error(`❌ Failed to create index: ${error.message}`);
      }
    }

    console.log("✅ Database schema initialized successfully");
  }

  // 🆕 UPDATED: Stop method to close unified database
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

    // 🆕 Close unified database connection
    if (this.database && this.database.close) {
      try {
        await this.database.close();
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

  // 🆕 UPDATED: Logging methods to use unified database
  async _logServiceCall(serviceName, payload, result, status, errorMessage, responseTime) {
    if (!this.isDatabaseInitialized) {
      console.log(`[LOG] ${serviceName} - ${status} - ${errorMessage || 'Success'}`);
      return;
    }

    try {
      await this.database.run(
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
    if (!this.isDatabaseInitialized) return;

    try {
      const existing = await this.database.get(
        "SELECT * FROM service_metrics WHERE service_name = ?",
        [serviceName]
      );

      if (existing) {
        await this.database.run(
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
        await this.database.run(
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

  // 🆕 UPDATED: API routes to use unified database
  _setupApiRoutes() {
    // ... existing routes ...

    // Service metrics endpoint
    this.app.get("/metrics/services", async (req, res) => {
      try {
        const metrics = await this.database.all(
          "SELECT * FROM service_metrics ORDER BY call_count DESC"
        );
        res.json({ metrics });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // ... other existing routes ...
  }

  // 🆕 NEW METHOD: Public access to database for external modules
  getDatabaseInterface() {
    return this.getDatabase();
  }
}

export { serviceManager };
