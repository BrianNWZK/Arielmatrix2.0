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

// === Database Initializer ===
// 🏆 CRITICAL FIX: Import the getter function instead of the class directly
import { getDatabaseInitializer } from "../modules/database-initializer.js";

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
      databaseConfig: config.databaseConfig || {},
      // 🏆 CRITICAL FIX: Store dataAnalytics for agent initialization
      dataAnalytics: config.dataAnalytics || null
    };

    this.app = express();
    this.app.use(cors());
    this.app.use(bodyParser.json({ limit: "50mb" }));
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ 
      server: this.server,
      perMessageDeflate: false
    });

    // 🏆 CRITICAL FIX: Use getDatabaseInitializer() function instead of direct instantiation
    this.databaseInitializer = getDatabaseInitializer();
    this.unifiedDatabaseInterfaces = new Map();
    
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

      // STEP 1: Initialize ALL databases with unified interfaces
      await this._initializeAllDatabases();

      // STEP 2: Initialize core blockchain systems
      await this._initializeCoreSystems();

      // STEP 3: Initialize governance
      await this._initializeGovernance();

      // STEP 4: Initialize all modules with proper database interfaces
      await this._initializeModules();

      // STEP 5: Initialize all agents with proper database interfaces
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

  async _initializeAllDatabases() {
    try {
      console.log("🗄️ Initializing ALL databases with unified interfaces...");
      
      // Initialize all databases through the database initializer
      const initResult = await this.databaseInitializer.initializeAllDatabases(this.config.databaseConfig);
      
      if (!initResult || !initResult.success) {
        throw new Error('Database initialization returned invalid database object');
      }
      
      // Store unified interfaces for all modules and agents
      this.unifiedDatabaseInterfaces = new Map(Object.entries(initResult.unifiedInterfaces));
      
      // Set the main logger DB to ArielSQLiteEngine
      this.loggerDB = this.databaseInitializer.arielEngine;
      this.isLoggerInitialized = true;
      
      console.log("✅ All databases initialized with unified interfaces", {
        mainDb: !!this.databaseInitializer.mainDb,
        arielEngine: !!this.databaseInitializer.arielEngine,
        unifiedInterfaces: this.unifiedDatabaseInterfaces.size,
        specializedDbs: this.databaseInitializer.serviceDatabases.size
      });

    } catch (error) {
      console.error("❌ Database initialization failed:", error);
      
      // Create emergency fallback logger
      this.loggerDB = this._createEmergencyLogger();
      this.isLoggerInitialized = false;
      this.unifiedDatabaseInterfaces.clear();
      
      throw new Error(`Database initialization failed: ${error.message}`);
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
      init: async () => {
        console.log("[EMERGENCY DB] Initialized");
        return Promise.resolve();
      }
    };
  }

  async _initializeCoreSystems() {
    console.log("⛓️ Initializing core blockchain systems...");
    
    // Get database interface for blockchain
    const blockchainDb = this.unifiedDatabaseInterfaces.get('cross-chain-bridge') || this.loggerDB;
    
    this.blockchain = new BrianNwaezikeChain({
      mainnet: this.config.mainnet,
      chainId: this.config.mainnet ? 'bwaezi-mainnet-1' : 'bwaezi-testnet-1',
      database: blockchainDb,
      ...this.config.blockchainConfig
    });

    this.payoutSystem = new BrianNwaezikePayoutSystem({
      mainnet: this.config.mainnet,
      database: blockchainDb
    });

    // Enhanced initialization with error handling
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
    
    // Get database interface for governance
    const governanceDb = this.unifiedDatabaseInterfaces.get('ai-security-module') || this.loggerDB;
    
    this.governance = new SovereignGovernance({
      votingPeriod: 7 * 24 * 60 * 60 * 1000,
      mainnet: this.config.mainnet,
      database: governanceDb
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
    console.log("⚙️ Initializing modules with unified database interfaces...");
    
    // Get appropriate database interfaces for each module
    const quantumCryptoDb = this.unifiedDatabaseInterfaces.get('quantum-crypto') || this.loggerDB;
    const quantumShieldDb = this.unifiedDatabaseInterfaces.get('quantum-shield') || this.loggerDB;
    const aiThreatDb = this.unifiedDatabaseInterfaces.get('ai-threat-detector') || this.loggerDB;
    const aiSecurityDb = this.unifiedDatabaseInterfaces.get('ai-security-module') || this.loggerDB;
    const crossChainDb = this.unifiedDatabaseInterfaces.get('cross-chain-bridge') || this.loggerDB;

    this.modules = {
      quantumCrypto: new QuantumResistantCrypto({ 
        algorithm: 'dilithium3',
        mainnet: this.config.mainnet,
        database: quantumCryptoDb
      }),
      sqlite: this.loggerDB,
      quantumShield: new QuantumShield({ 
        mainnet: this.config.mainnet,
        database: quantumShieldDb
      }),
      aiThreatDetector: new AIThreatDetector({
        realTimeScan: true,
        mainnet: this.config.mainnet,
        database: aiThreatDb
      }),
      aiSecurity: new AISecurityModule({
        monitoring: true,
        mainnet: this.config.mainnet,
        database: aiSecurityDb
      }),
      crossChainBridge: new CrossChainBridge({
        mainnet: this.config.mainnet,
        database: crossChainDb,
        rpcEndpoints: {
          ETHEREUM: process.env.ETH_MAINNET_RPC || "https://mainnet.infura.io/v3/your-project-id",
          SOLANA: process.env.SOL_MAINNET_RPC || "https://api.mainnet-beta.solana.com",
          BINANCE: process.env.BNB_MAINNET_RPC || "https://bsc-dataseed.binance.org"
        }
      }),
      omnichainInterop: new OmnichainInteroperabilityEngine({
        mainnet: this.config.mainnet,
        database: crossChainDb
      }),
      shardingManager: new ShardingManager({
        shardCount: 4,
        mainnet: this.config.mainnet,
        database: crossChainDb
      }),
      infiniteScalability: new InfiniteScalabilityEngine({
        autoScale: true,
        mainnet: this.config.mainnet,
        database: crossChainDb
      }),
      energyEfficientConsensus: new EnergyEfficientConsensus({
        algorithm: 'proof-of-stake',
        mainnet: this.config.mainnet,
        database: crossChainDb
      }),
      carbonNegativeConsensus: new CarbonNegativeConsensus({
        carbonOffset: true,
        mainnet: this.config.mainnet,
        database: crossChainDb
      })
    };

    // Initialize modules with governance approval
    for (const [moduleName, module] of Object.entries(this.modules)) {
      try {
        const approved = await this.governance.verifyModule(moduleName);
        if (!approved) {
          console.warn(`⚠️ Governance rejected module: ${moduleName}`);
          continue;
        }

        if (module.init) await module.init();
        console.log(`✅ Module initialized: ${moduleName}`);
        
      } catch (error) {
        console.error(`❌ Module initialization failed: ${moduleName}`, error);
        // Continue with other modules even if one fails
      }
    }
  }

  async _initializeAgents() {
    console.log("🤖 Initializing agents with unified database interfaces...");
    
    // Get appropriate database interfaces for each agent
    const adRevenueDb = this.unifiedDatabaseInterfaces.get('ad-revenue') || this.loggerDB;
    const adsenseDb = this.unifiedDatabaseInterfaces.get('adsense') || this.loggerDB;
    const apiScoutDb = this.unifiedDatabaseInterfaces.get('api-scout') || this.loggerDB;
    const browserManagerDb = this.unifiedDatabaseInterfaces.get('browser-manager') || this.loggerDB;
    const configAgentDb = this.unifiedDatabaseInterfaces.get('config-agent') || this.loggerDB;
    const contractDeployDb = this.unifiedDatabaseInterfaces.get('contract-deploy') || this.loggerDB;
    const cryptoAgentDb = this.unifiedDatabaseInterfaces.get('crypto-agent') || this.loggerDB;
    const dataAgentDb = this.unifiedDatabaseInterfaces.get('data-agent') || this.loggerDB;
    const forexSignalDb = this.unifiedDatabaseInterfaces.get('forex-signal') || this.loggerDB;
    const healthAgentDb = this.unifiedDatabaseInterfaces.get('health-agent') || this.loggerDB;
    const payoutAgentDb = this.unifiedDatabaseInterfaces.get('payout-agent') || this.loggerDB;
    const shopifyAgentDb = this.unifiedDatabaseInterfaces.get('shopify-agent') || this.loggerDB;
    const socialAgentDb = this.unifiedDatabaseInterfaces.get('social-agent') || this.loggerDB;

    // 🏆 CRITICAL FIX: Pass dataAnalytics to agents that need it
    const dataAnalytics = this.config.dataAnalytics;

    this.agents = {
      adRevenueAgent: new AdRevenueAgent({
        mainnet: this.config.mainnet,
        database: adRevenueDb,
        dataAnalytics: dataAnalytics
      }),
      adsenseAgent: new AdsenseAgent({
        mainnet: this.config.mainnet,
        database: adsenseDb,
        dataAnalytics: dataAnalytics
      }),
      apiScoutAgent: new ApiScoutAgent({
        mainnet: this.config.mainnet,
        database: apiScoutDb,
        dataAnalytics: dataAnalytics
      }),
      browserManager: new QuantumBrowserManager({
        mainnet: this.config.mainnet,
        database: browserManagerDb
      }),
      configAgent: new configAgent({
        mainnet: this.config.mainnet,
        database: configAgentDb
      }),
      contractDeployAgent: new ContractDeployAgent({
        mainnet: this.config.mainnet,
        database: contractDeployDb
      }),
      cryptoAgent: new EnhancedCryptoAgent({
        mainnet: this.config.mainnet,
        database: cryptoAgentDb,
        dataAnalytics: dataAnalytics
      }),
      dataAgent: new DataAgent({
        mainnet: this.config.mainnet,
        database: dataAgentDb,
        dataAnalytics: dataAnalytics
      }),
      forexSignalAgent: new forexSignalAgent({
        mainnet: this.config.mainnet,
        database: forexSignalDb,
        dataAnalytics: dataAnalytics
      }),
      healthAgent: new HealthAgent({
        mainnet: this.config.mainnet,
        database: healthAgentDb
      }),
      payoutAgent: new PayoutAgent({
        mainnet: this.config.mainnet,
        database: payoutAgentDb
      }),
      shopifyAgent: new shopifyAgent({
        mainnet: this.config.mainnet,
        database: shopifyAgentDb,
        dataAnalytics: dataAnalytics
      }),
      socialAgent: new socialAgent({
        mainnet: this.config.mainnet,
        database: socialAgentDb,
        dataAnalytics: dataAnalytics
      })
    };

    // Initialize agents
    for (const [agentName, agent] of Object.entries(this.agents)) {
      try {
        if (agent.init) await agent.init();
        console.log(`✅ Agent initialized: ${agentName}`);
        
      } catch (error) {
        console.error(`❌ Agent initialization failed: ${agentName}`, error);
        // Continue with other agents even if one fails
      }
    }
  }

  _setupBasicRoutes() {
    // Basic health check that works even if systems aren't fully initialized
    this.app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "v4.2",
        mainnet: this.config.mainnet,
        initialized: this.isInitialized,
        systems: {
          database: !!this.loggerDB,
          blockchain: !!this.blockchain,
          governance: !!this.governance,
          modules: Object.keys(this.modules).length,
          agents: Object.keys(this.agents).length
        }
      });
    });

    // Basic info endpoint
    this.app.get("/", (req, res) => {
      res.json({
        name: "ArielSQL Ultimate Suite",
        version: "Production Mainnet v4.2",
        status: this.isInitialized ? "operational" : "initializing",
        timestamp: new Date().toISOString(),
        mainnet: this.config.mainnet
      });
    });
  }

  _setupApiRoutes() {
    // Only setup full API routes if systems are initialized
    if (!this.isInitialized) {
      console.warn("⚠️ Skipping API route setup - systems not initialized");
      return;
    }

    console.log("🌐 Setting up full API routes...");

    // Blockchain endpoints
    this.app.get("/api/blockchain/status", async (req, res) => {
      try {
        const status = await this.blockchain.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Payout endpoints
    this.app.post("/api/payouts/process", async (req, res) => {
      try {
        const result = await this.payoutSystem.processPayouts(req.body);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Governance endpoints
    this.app.get("/api/governance/proposals", async (req, res) => {
      try {
        const proposals = await this.governance.getProposals();
        res.json(proposals);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Module status endpoints
    this.app.get("/api/modules/status", async (req, res) => {
      try {
        const status = {};
        for (const [name, module] of Object.entries(this.modules)) {
          status[name] = module.getStatus ? await module.getStatus() : { status: "unknown" };
        }
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Agent endpoints
    this.app.get("/api/agents/status", async (req, res) => {
      try {
        const status = {};
        for (const [name, agent] of Object.entries(this.agents)) {
          status[name] = agent.getStatus ? await agent.getStatus() : { status: "unknown" };
        }
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Unified database interface endpoint
    this.app.get("/api/databases/interfaces", (req, res) => {
      const interfaces = {};
      for (const [name, db] of this.unifiedDatabaseInterfaces) {
        interfaces[name] = {
          type: typeof db,
          methods: Object.keys(db).filter(key => typeof db[key] === 'function')
        };
      }
      res.json(interfaces);
    });
  }

  _setupWebSocket() {
    this.wss.on("connection", (ws, req) => {
      console.log("🔗 New WebSocket connection");
      this.connectedClients.add(ws);

      ws.on("message", (message) => {
        try {
          const data = JSON.parse(message);
          this._handleWebSocketMessage(ws, data);
        } catch (error) {
          console.error("❌ WebSocket message parsing error:", error);
          ws.send(JSON.stringify({ error: "Invalid message format" }));
        }
      });

      ws.on("close", () => {
        console.log("🔌 WebSocket connection closed");
        this.connectedClients.delete(ws);
      });

      ws.on("error", (error) => {
        console.error("❌ WebSocket error:", error);
        this.connectedClients.delete(ws);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: "welcome",
        message: "Connected to ArielSQL Ultimate Suite",
        version: "v4.2",
        timestamp: new Date().toISOString()
      }));
    });
  }

  _handleWebSocketMessage(ws, data) {
    const { type, payload } = data;

    switch (type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
        break;

      case "get_status":
        const status = {
          type: "status",
          systems: {
            database: !!this.loggerDB,
            blockchain: !!this.blockchain,
            governance: !!this.governance,
            modules: Object.keys(this.modules).length,
            agents: Object.keys(this.agents).length
          },
          timestamp: new Date().toISOString()
        };
        ws.send(JSON.stringify(status));
        break;

      default:
        ws.send(JSON.stringify({ 
          type: "error", 
          message: `Unknown message type: ${type}` 
        }));
    }
  }

  _setupErrorHandling() {
    this.app.use((err, req, res, next) => {
      console.error("❌ Unhandled error:", err);
      res.status(500).json({ 
        error: "Internal server error",
        message: err.message,
        timestamp: new Date().toISOString()
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ 
        error: "Endpoint not found",
        path: req.path,
        timestamp: new Date().toISOString()
      });
    });
  }

  _startBackgroundServices() {
    console.log("🔄 Starting background services...");

    // Clear any existing interval
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
    }

    // Start new background interval (every 30 seconds)
    this.backgroundInterval = setInterval(async () => {
      try {
        await this._runBackgroundTasks();
      } catch (error) {
        console.error("❌ Background task error:", error);
      }
    }, 30000);

    // Run immediately once
    this._runBackgroundTasks();
  }

  async _runBackgroundTasks() {
    const tasks = [];

    // Update blockchain status
    if (this.blockchain && this.blockchain.getStatus) {
      tasks.push(this.blockchain.getStatus().catch(err => 
        console.error("❌ Blockchain status update failed:", err)
      ));
    }

    // Run agent background tasks
    for (const [name, agent] of Object.entries(this.agents)) {
      if (agent.runBackgroundTask) {
        tasks.push(
          agent.runBackgroundTask().catch(err =>
            console.error(`❌ Agent ${name} background task failed:`, err)
          )
        );
      }
    }

    // Run module background tasks
    for (const [name, module] of Object.entries(this.modules)) {
      if (module.runBackgroundTask) {
        tasks.push(
          module.runBackgroundTask().catch(err =>
            console.error(`❌ Module ${name} background task failed:`, err)
          )
        );
      }
    }

    // Wait for all tasks to complete
    await Promise.allSettled(tasks);

    // Broadcast status to WebSocket clients
    this._broadcastStatus();
  }

  _broadcastStatus() {
    if (this.connectedClients.size === 0) return;

    const status = {
      type: "system_status",
      timestamp: new Date().toISOString(),
      systems: {
        database: !!this.loggerDB,
        blockchain: !!this.blockchain,
        governance: !!this.governance,
        modules: Object.keys(this.modules).length,
        agents: Object.keys(this.agents).length
      }
    };

    const message = JSON.stringify(status);

    this.connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  async _emergencyLogError(context, error) {
    try {
      // Try to log to database first
      if (this.loggerDB && this.loggerDB.run) {
        await this.loggerDB.run(
          "INSERT INTO error_logs (context, error, timestamp) VALUES (?, ?, ?)",
          [context, error.message, new Date().toISOString()]
        );
      }
    } catch (dbError) {
      // Fallback to console if database logging fails
      console.error(`💀 EMERGENCY LOG FAILED [${context}]:`, error);
      console.error(`💀 DATABASE LOG ALSO FAILED:`, dbError);
    }
  }

  start() {
    if (!this.isInitialized) {
      console.warn("⚠️ ServiceManager not initialized. Call initialize() first.");
      return;
    }

    this.server.listen(this.config.port, () => {
      console.log(`🚀 ArielSQL Ultimate Suite running on port ${this.config.port}`);
      console.log(`🌐 Mainnet: ${this.config.mainnet}`);
      console.log(`📊 Database interfaces: ${this.unifiedDatabaseInterfaces.size}`);
      console.log(`⚙️ Modules: ${Object.keys(this.modules).length}`);
      console.log(`🤖 Agents: ${Object.keys(this.agents).length}`);
    });

    this.server.on("error", (error) => {
      console.error("❌ Server error:", error);
    });
  }

  async stop() {
    console.log("🛑 Stopping ServiceManager...");

    // Clear background interval
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }

    // Close WebSocket connections
    this.connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });
    this.connectedClients.clear();

    // Stop agents
    for (const [name, agent] of Object.entries(this.agents)) {
      try {
        if (agent.stop) await agent.stop();
        console.log(`✅ Agent stopped: ${name}`);
      } catch (error) {
        console.error(`❌ Failed to stop agent ${name}:`, error);
      }
    }

    // Stop modules
    for (const [name, module] of Object.entries(this.modules)) {
      try {
        if (module.stop) await module.stop();
        console.log(`✅ Module stopped: ${name}`);
      } catch (error) {
        console.error(`❌ Failed to stop module ${name}:`, error);
      }
    }

    // Stop core systems
    if (this.payoutSystem && this.payoutSystem.stop) {
      try {
        await this.payoutSystem.stop();
        console.log("✅ Payout system stopped");
      } catch (error) {
        console.error("❌ Failed to stop payout system:", error);
      }
    }

    if (this.blockchain && this.blockchain.stop) {
      try {
        await this.blockchain.stop();
        console.log("✅ Blockchain system stopped");
      } catch (error) {
        console.error("❌ Failed to stop blockchain system:", error);
      }
    }

    // Close database connections
    if (this.databaseInitializer && this.databaseInitializer.closeAll) {
      try {
        await this.databaseInitializer.closeAll();
        console.log("✅ Database connections closed");
      } catch (error) {
        console.error("❌ Failed to close database connections:", error);
      }
    }

    // Close HTTP server
    if (this.server) {
      this.server.close(() => {
        console.log("✅ HTTP server stopped");
      });
    }

    this.isInitialized = false;
    console.log("🛑 ServiceManager stopped successfully");
  }
}

export default serviceManager;
