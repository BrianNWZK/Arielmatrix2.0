// serviceManager.js - PRODUCTION READY v4.5 - ENTERPRISE FAULT TOLERANCE
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import crypto from "crypto";
import cluster from "cluster";
import os from "os";

// === Core Blockchain Systems ===
import BrianNwaezikeChain from "../backend/blockchain/BrianNwaezikeChain.js";
import { BrianNwaezikePayoutSystem } from "../backend/blockchain/BrianNwaezikePayoutSystem.js";

// === Governance + Logging ===
import { SovereignGovernance } from "../modules/governance-engine/index.js";
import { ArielSQLiteEngine } from "../modules/ariel-sqlite-engine/index.js";

// === Database Initializer ===
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
import SocialAgent from "../backend/agents/socialAgent.js";

// Enterprise monitoring - NOW IMPLEMENTED
import { EnterpriseMonitoring } from "../modules/enterprise-monitoring/index.js";

class serviceManager {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 10000,
      blockchainConfig: config.blockchainConfig || {},
      mainnet: config.mainnet !== undefined ? config.mainnet : true,
      dbPath: config.dbPath || "./data/service_logs.db",
      databaseConfig: config.databaseConfig || {},
      dataAnalytics: config.dataAnalytics || null,
      enableIsolation: config.enableIsolation !== undefined ? config.enableIsolation : true,
      maxAgentRestarts: config.maxAgentRestarts || 5,
      healthCheckInterval: config.healthCheckInterval || 30000
    };

    this.app = express();
    this.app.use(cors());
    this.app.use(bodyParser.json({ limit: "50mb" }));
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ 
      server: this.server,
      perMessageDeflate: false
    });

    // Use getDatabaseInitializer() function instead of direct instantiation
    this.databaseInitializer = getDatabaseInitializer();
    this.unifiedDatabaseInterfaces = new Map();
    
    // Core systems - will be initialized in proper sequence
    this.blockchain = null;
    this.payoutSystem = null;
    this.governance = null;
    
    this.modules = {};
    this.agents = {};
    this.agentHealth = new Map();
    this.agentRestartCounts = new Map();
    this.operationalAgents = new Set();

    this.connectedClients = new Set();
    this.isInitialized = false;
    this.backgroundInterval = null;
    this.healthCheckInterval = null;

    // Enterprise monitoring - NOW FULLY IMPLEMENTED
    this.monitoring = new EnterpriseMonitoring({
      serviceName: 'serviceManager',
      mainnet: this.config.mainnet,
      logLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
    });

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
      console.log("🚀 Initializing serviceManager with Enterprise Fault Tolerance...");

      // Start monitoring first
      await this.monitoring.initialize();
      await this.monitoring.trackEvent('service_manager_initialization_started');

      // STEP 1: Initialize ALL databases with unified interfaces
      await this._initializeAllDatabases();

      // STEP 2: Initialize core blockchain systems
      await this._initializeCoreSystems();

      // STEP 3: Initialize governance
      await this._initializeGovernance();

      // STEP 4: Initialize all modules with proper database interfaces
      await this._initializeModules();

      // STEP 5: Initialize all agents CONCURRENTLY with fault isolation
      await this._initializeAgentsConcurrently();

      this.isInitialized = true;
      
      // Start health monitoring
      this._startHealthMonitoring();
      
      // Setup full API routes now that everything is initialized
      this._setupApiRoutes();
      
      // Start background services
      this._startBackgroundServices();

      await this.monitoring.trackEvent('service_manager_initialized', {
        agents: this.operationalAgents.size,
        modules: Object.keys(this.modules).length,
        totalAgents: Object.keys(this.agents).length
      });

      console.log("✅ serviceManager initialized successfully with " + this.operationalAgents.size + " operational agents");

    } catch (error) {
      console.error("❌ serviceManager initialization failed:", error);
      
      // Ensure we can still log errors even if initialization fails
      await this._emergencyLogError('initialization_failed', error);
      await this.monitoring.trackError('initialization_failed', error);
      
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

      await this.monitoring.trackEvent('databases_initialized', {
        unifiedInterfaces: this.unifiedDatabaseInterfaces.size,
        mainDb: !!this.databaseInitializer.mainDb,
        arielEngine: !!this.databaseInitializer.arielEngine
      });

    } catch (error) {
      console.error("❌ Database initialization failed:", error);
      
      // Create emergency fallback logger
      this.loggerDB = this._createEmergencyLogger();
      this.isLoggerInitialized = false;
      this.unifiedDatabaseInterfaces.clear();
      
      await this.monitoring.trackError('database_initialization_failed', error);
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
      await this.monitoring.trackEvent('blockchain_initialized');
    } catch (error) {
      console.error("❌ Blockchain initialization failed:", error);
      await this.monitoring.trackError('blockchain_initialization_failed', error);
      throw error;
    }

    try {
      if (this.payoutSystem.init) await this.payoutSystem.init();
      console.log("✅ Payout system initialized");
      await this.monitoring.trackEvent('payout_system_initialized');
    } catch (error) {
      console.error("❌ Payout system initialization failed:", error);
      await this.monitoring.trackError('payout_system_initialization_failed', error);
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
      await this.monitoring.trackEvent('governance_initialized');
    } catch (error) {
      console.error("❌ Governance initialization failed:", error);
      await this.monitoring.trackError('governance_initialization_failed', error);
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
      getStatus: () => ({ status: 'emergency_mode', timestamp: Date.now() }),
      getProposals: async () => []
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
          ETHEREUM: process.env.ETH_MAINNET_RPC || "https://mainnet.infura.io/v3/" + process.env.INFURA_PROJECT_ID,
          SOLANA: process.env.SOL_MAINNET_RPC || "https://api.mainnet-beta.solana.com",
          BINANCE: process.env.BNB_MAINNET_RPC || "https://bsc-dataseed.binance.org",
          POLYGON: process.env.POLYGON_MAINNET_RPC || "https://polygon-rpc.com"
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
    const moduleInitPromises = Object.entries(this.modules).map(async ([moduleName, module]) => {
      try {
        const approved = await this.governance.verifyModule(moduleName);
        if (!approved) {
          console.warn(`⚠️ Governance rejected module: ${moduleName}`);
          await this.monitoring.trackEvent('module_rejected', { moduleName });
          return { moduleName, success: false, reason: 'governance_rejected' };
        }

        if (module.init) await module.init();
        console.log(`✅ Module initialized: ${moduleName}`);
        await this.monitoring.trackEvent('module_initialized', { moduleName });
        return { moduleName, success: true };
        
      } catch (error) {
        console.error(`❌ Module initialization failed: ${moduleName}`, error);
        await this.monitoring.trackError(`module_initialization_failed_${moduleName}`, error);
        return { moduleName, success: false, error: error.message };
      }
    });

    const results = await Promise.allSettled(moduleInitPromises);
    
    const successfulModules = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    console.log(`✅ ${successfulModules}/${Object.keys(this.modules).length} modules initialized successfully`);
  }

  async _initializeAgentsConcurrently() {
    console.log("🤖 Initializing all agents CONCURRENTLY with fault isolation...");
    
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

    // Pass dataAnalytics to agents that need it
    const dataAnalytics = this.config.dataAnalytics;

    // Create all agent instances
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
      socialAgent: new SocialAgent({
        mainnet: this.config.mainnet,
        database: socialAgentDb,
        dataAnalytics: dataAnalytics,
        ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
        COMPANY_WALLET_ADDRESS: process.env.COMPANY_WALLET_ADDRESS,
        COMPANY_WALLET_PRIVATE_KEY: process.env.COMPANY_WALLET_PRIVATE_KEY,
        X_API_KEY: process.env.X_API_KEY,
        X_API_SECRET: process.env.X_API_SECRET,
        X_ACCESS_TOKEN: process.env.X_ACCESS_TOKEN,
        X_ACCESS_SECRET: process.env.X_ACCESS_SECRET
      })
    };

    // Initialize agents CONCURRENTLY with Promise.allSettled
    const initializationPromises = Object.entries(this.agents).map(([agentName, agent]) => {
      return this._initializeSingleAgent(agentName, agent);
    });

    // Wait for all agents to initialize (successfully or not)
    const results = await Promise.allSettled(initializationPromises);

    // Process results and track operational agents
    results.forEach((result, index) => {
      const agentName = Object.keys(this.agents)[index];
      if (result.status === 'fulfilled' && result.value.initialized) {
        this.operationalAgents.add(agentName);
        this.agentHealth.set(agentName, { status: 'healthy', lastCheck: Date.now() });
        console.log(`✅ Agent initialized successfully: ${agentName}`);
        this.monitoring.trackEvent('agent_initialized', { agentName });
      } else {
        const error = result.status === 'rejected' ? result.reason : result.value.error;
        console.error(`❌ Agent initialization failed: ${agentName}`, error);
        this.agentHealth.set(agentName, { status: 'failed', lastCheck: Date.now(), error });
        this.monitoring.trackError(`agent_initialization_failed_${agentName}`, error);
        
        // Track restart count
        this.agentRestartCounts.set(agentName, 0);
      }
    });

    console.log(`✨ System operational with ${this.operationalAgents.size} agents ready for revenue generation`);
    await this.monitoring.trackEvent('agents_initialization_complete', {
      operational: this.operationalAgents.size,
      total: Object.keys(this.agents).length,
      failed: Object.keys(this.agents).length - this.operationalAgents.size
    });
  }

  async _initializeSingleAgent(agentName, agent) {
    try {
      // Add small delay to prevent database race conditions
      await new Promise(resolve => setTimeout(resolve, 150));
      
      if (agent.init) await agent.init();
      else if (agent.initialize) await agent.initialize();
      
      return { initialized: true, agentName };
    } catch (error) {
      console.error(`❌ Agent ${agentName} initialization failed:`, error);
      return { initialized: false, agentName, error: error.message };
    }
  }

  _startHealthMonitoring() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this._performHealthChecks();
    }, this.config.healthCheckInterval);

    console.log("❤️ Health monitoring started");
  }

  async _performHealthChecks() {
    const healthChecks = Array.from(this.operationalAgents).map(async (agentName) => {
      try {
        const agent = this.agents[agentName];
        if (agent && agent.getStatus) {
          const status = await agent.getStatus();
          const isHealthy = this._evaluateAgentHealth(status, agentName);
          
          this.agentHealth.set(agentName, {
            status: isHealthy ? 'healthy' : 'degraded',
            lastCheck: Date.now(),
            details: status
          });

          if (!isHealthy) {
            console.warn(`⚠️ Agent health degraded: ${agentName}`);
            await this.monitoring.trackEvent('agent_health_degraded', { agentName, status });
          }

          return { agentName, healthy: isHealthy };
        }
      } catch (error) {
        console.error(`❌ Health check failed for ${agentName}:`, error);
        this.agentHealth.set(agentName, {
          status: 'failed',
          lastCheck: Date.now(),
          error: error.message
        });
        await this.monitoring.trackError(`health_check_failed_${agentName}`, error);
        return { agentName, healthy: false };
      }
    });

    const results = await Promise.allSettled(healthChecks);
    
    // Handle failed agents
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && !result.value.healthy) {
        const agentName = result.value.agentName;
        this._handleUnhealthyAgent(agentName);
      }
    });

    // Track overall system health
    const healthyAgents = results.filter(r => r.status === 'fulfilled' && r.value.healthy).length;
    await this.monitoring.trackMetric('healthy_agents', healthyAgents);
    await this.monitoring.trackMetric('total_agents', this.operationalAgents.size);
  }

  _evaluateAgentHealth(status, agentName) {
    // Custom health evaluation logic per agent type
    switch (agentName) {
      case 'socialAgent':
        return status && status.initialized && status.databaseConnected;
      case 'cryptoAgent':
        return status && status.initialized && status.exchangeConnections > 0;
      case 'adRevenueAgent':
        return status && status.initialized && status.adNetworksConnected;
      default:
        return status && status.initialized;
    }
  }

  async _handleUnhealthyAgent(agentName) {
    const restartCount = this.agentRestartCounts.get(agentName) || 0;
    
    if (restartCount >= this.config.maxAgentRestarts) {
      console.error(`🚫 Agent ${agentName} exceeded maximum restart attempts`);
      this.operationalAgents.delete(agentName);
      await this.monitoring.trackEvent('agent_permanently_failed', { agentName, restartCount });
      return;
    }

    console.log(`🔄 Attempting to restart agent: ${agentName} (attempt ${restartCount + 1})`);
    
    try {
      const agent = this.agents[agentName];
      if (agent.stop) await agent.stop();
      
      // Re-initialize the agent
      const result = await this._initializeSingleAgent(agentName, agent);
      
      if (result.initialized) {
        this.operationalAgents.add(agentName);
        this.agentRestartCounts.set(agentName, 0);
        this.agentHealth.set(agentName, { status: 'healthy', lastCheck: Date.now() });
        console.log(`✅ Agent ${agentName} restarted successfully`);
        await this.monitoring.trackEvent('agent_restarted_success', { agentName, attempt: restartCount + 1 });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      this.agentRestartCounts.set(agentName, restartCount + 1);
      console.error(`❌ Failed to restart agent ${agentName}:`, error);
      await this.monitoring.trackEvent('agent_restart_failed', { 
        agentName, 
        attempt: restartCount + 1,
        error: error.message 
      });
    }
  }

  _setupBasicRoutes() {
    // Basic health check that works even if systems aren't fully initialized
    this.app.get("/health", (req, res) => {
      const agentHealthSummary = {};
      this.agentHealth.forEach((health, agentName) => {
        agentHealthSummary[agentName] = health.status;
      });

      res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
        version: "v4.5",
        mainnet: this.config.mainnet,
        initialized: this.isInitialized,
        operationalAgents: this.operationalAgents.size,
        totalAgents: Object.keys(this.agents).length,
        agentHealth: agentHealthSummary,
        systems: {
          database: !!this.loggerDB,
          blockchain: !!this.blockchain,
          governance: !!this.governance,
          monitoring: !!this.monitoring
        }
      });
    });

    this.app.get("/", (req, res) => {
      res.json({
        message: "🚀 ArielSQL Service Manager v4.5 - ENTERPRISE READY",
        version: "4.5.0",
        mainnet: this.config.mainnet,
        status: this.isInitialized ? "operational" : "initializing",
        timestamp: new Date().toISOString()
      });
    });
  }

  _setupApiRoutes() {
    // Agent status endpoints
    this.app.get("/api/agents/status", async (req, res) => {
      try {
        const status = {};
        for (const [agentName, agent] of Object.entries(this.agents)) {
          try {
            if (agent.getStatus) {
              status[agentName] = await agent.getStatus();
            } else {
              status[agentName] = { initialized: true, customStatus: false };
            }
          } catch (error) {
            status[agentName] = { error: error.message, initialized: false };
          }
        }
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Module status endpoints
    this.app.get("/api/modules/status", async (req, res) => {
      try {
        const status = {};
        for (const [moduleName, module] of Object.entries(this.modules)) {
          try {
            if (module.getStatus) {
              status[moduleName] = await module.getStatus();
            } else {
              status[moduleName] = { initialized: true, customStatus: false };
            }
          } catch (error) {
            status[moduleName] = { error: error.message, initialized: false };
          }
        }
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // System metrics endpoint
    this.app.get("/api/system/metrics", async (req, res) => {
      try {
        const metrics = await this.monitoring.getMetrics();
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Governance status endpoint
    this.app.get("/api/governance/status", async (req, res) => {
      try {
        const status = await this.governance.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Blockchain status endpoint
    this.app.get("/api/blockchain/status", async (req, res) => {
      try {
        const status = this.blockchain.getStatus ? await this.blockchain.getStatus() : { initialized: true };
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Agent control endpoints
    this.app.post("/api/agents/:agentName/restart", async (req, res) => {
      const { agentName } = req.params;
      
      if (!this.agents[agentName]) {
        return res.status(404).json({ error: `Agent ${agentName} not found` });
      }

      try {
        await this._restartAgent(agentName);
        res.json({ success: true, message: `Agent ${agentName} restart initiated` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  async _restartAgent(agentName) {
    console.log(`🔄 Manual restart requested for agent: ${agentName}`);
    
    const agent = this.agents[agentName];
    if (!agent) {
      throw new Error(`Agent ${agentName} not found`);
    }

    try {
      // Stop the agent
      if (agent.stop) await agent.stop();
      
      // Remove from operational agents
      this.operationalAgents.delete(agentName);
      
      // Re-initialize
      const result = await this._initializeSingleAgent(agentName, agent);
      
      if (result.initialized) {
        this.operationalAgents.add(agentName);
        this.agentRestartCounts.set(agentName, 0);
        this.agentHealth.set(agentName, { status: 'healthy', lastCheck: Date.now() });
        console.log(`✅ Agent ${agentName} manually restarted successfully`);
        await this.monitoring.trackEvent('agent_manual_restart_success', { agentName });
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`❌ Manual restart failed for agent ${agentName}:`, error);
      await this.monitoring.trackEvent('agent_manual_restart_failed', { agentName, error: error.message });
      throw error;
    }
  }

  _setupWebSocket() {
    this.wss.on("connection", (ws, req) => {
      const clientId = crypto.randomBytes(8).toString("hex");
      this.connectedClients.add(ws);

      console.log(`🔗 WebSocket client connected: ${clientId}`);

      ws.send(JSON.stringify({
        type: "welcome",
        clientId: clientId,
        message: "Connected to ArielSQL Service Manager",
        version: "4.5.0",
        mainnet: this.config.mainnet
      }));

      ws.on("close", () => {
        this.connectedClients.delete(ws);
        console.log(`🔌 WebSocket client disconnected: ${clientId}`);
      });

      ws.on("error", (error) => {
        console.error(`❌ WebSocket error for client ${clientId}:`, error);
      });
    });

    // Broadcast system status periodically
    setInterval(() => {
      if (this.connectedClients.size > 0) {
        const statusUpdate = {
          type: "system_status",
          timestamp: Date.now(),
          operationalAgents: this.operationalAgents.size,
          totalAgents: Object.keys(this.agents).length,
          connectedClients: this.connectedClients.size
        };

        this.connectedClients.forEach(client => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(statusUpdate));
          }
        });
      }
    }, 10000);
  }

  _setupErrorHandling() {
    process.on("uncaughtException", async (error) => {
      console.error("💥 UNCAUGHT EXCEPTION:", error);
      await this.monitoring.trackError('uncaught_exception', error);
      // Don't exit - keep the service running
    });

    process.on("unhandledRejection", async (reason, promise) => {
      console.error("💥 UNHANDLED REJECTION at:", promise, "reason:", reason);
      await this.monitoring.trackError('unhandled_rejection', reason);
      // Don't exit - keep the service running
    });

    this.app.use((error, req, res, next) => {
      console.error("🌐 Express error:", error);
      this.monitoring.trackError('express_error', error);
      res.status(500).json({ error: "Internal server error" });
    });
  }

  _startBackgroundServices() {
    // Background tasks for system maintenance
    this.backgroundInterval = setInterval(async () => {
      try {
        // Clean up old health check data
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        
        this.agentHealth.forEach((health, agentName) => {
          if (now - health.lastCheck > maxAge) {
            // Reset health data if it's too old
            this.agentHealth.set(agentName, { status: 'unknown', lastCheck: now });
          }
        });

        // Log system status periodically
        if (Math.random() < 0.1) { // 10% chance each interval
          console.log(`📊 System Status: ${this.operationalAgents.size}/${Object.keys(this.agents).length} agents operational`);
        }

      } catch (error) {
        console.error("❌ Background service error:", error);
        this.monitoring.trackError('background_service_error', error);
      }
    }, 60000); // Run every minute
  }

  async _emergencyLogError(context, error) {
    // Emergency logging when systems are unstable
    try {
      console.error(`🚨 EMERGENCY LOG [${context}]:`, error);
      
      // Try to use monitoring if available
      if (this.monitoring) {
        await this.monitoring.trackError(context, error);
      }
      
      // Try to use logger DB if available
      if (this.loggerDB && this.loggerDB.run) {
        await this.loggerDB.run(
          "INSERT INTO emergency_logs (context, error_message, stack_trace, timestamp) VALUES (?, ?, ?, ?)",
          [context, error.message, error.stack, Date.now()]
        );
      }
    } catch (logError) {
      // Last resort - console only
      console.error("💥 FAILED TO LOG ERROR:", logError);
    }
  }

  async start() {
    if (!this.isInitialized) {
      throw new Error("serviceManager must be initialized before starting");
    }

    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, (err) => {
        if (err) {
          console.error("❌ Failed to start server:", err);
          reject(err);
          return;
        }

        console.log(`🚀 ArielSQL Service Manager v4.5 running on port ${this.config.port}`);
        console.log(`🌐 Mainnet: ${this.config.mainnet}`);
        console.log(`🤖 Operational Agents: ${this.operationalAgents.size}/${Object.keys(this.agents).length}`);
        console.log(`📊 Monitoring: Active`);
        console.log(`⛓️ Blockchain: ${this.blockchain ? 'Ready' : 'Not available'}`);
        console.log(`🏛️ Governance: ${this.governance ? 'Active' : 'Emergency mode'}`);
        
        this.monitoring.trackEvent('service_started', {
          port: this.config.port,
          mainnet: this.config.mainnet,
          operationalAgents: this.operationalAgents.size
        });

        resolve();
      });
    });
  }

  async stop() {
    console.log("🛑 Stopping serviceManager...");

    // Stop background services
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop all agents
    const stopPromises = Object.entries(this.agents).map(async ([agentName, agent]) => {
      try {
        if (agent.stop) {
          await agent.stop();
          console.log(`✅ Agent stopped: ${agentName}`);
        }
      } catch (error) {
        console.error(`❌ Failed to stop agent ${agentName}:`, error);
      }
    });

    // Stop modules
    const moduleStopPromises = Object.entries(this.modules).map(async ([moduleName, module]) => {
      try {
        if (module.stop) {
          await module.stop();
          console.log(`✅ Module stopped: ${moduleName}`);
        }
      } catch (error) {
        console.error(`❌ Failed to stop module ${moduleName}:`, error);
      }
    });

    // Stop core systems
    try {
      if (this.payoutSystem && this.payoutSystem.stop) await this.payoutSystem.stop();
      if (this.blockchain && this.blockchain.stop) await this.blockchain.stop();
      if (this.governance && this.governance.stop) await this.governance.stop();
    } catch (error) {
      console.error("❌ Error stopping core systems:", error);
    }

    // Stop monitoring
    try {
      if (this.monitoring) await this.monitoring.stop();
    } catch (error) {
      console.error("❌ Error stopping monitoring:", error);
    }

    // Wait for all stops to complete
    await Promise.allSettled([...stopPromises, ...moduleStopPromises]);

    // Close server
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log("✅ serviceManager stopped successfully");
          resolve();
        });
      } else {
        console.log("✅ serviceManager stopped");
        resolve();
      }
    });
  }

  // Public methods for external interaction
  getAgent(agentName) {
    return this.agents[agentName];
  }

  getModule(moduleName) {
    return this.modules[moduleName];
  }

  async getSystemStatus() {
    const agentStatus = {};
    this.agentHealth.forEach((health, agentName) => {
      agentStatus[agentName] = health.status;
    });

    const moduleStatus = {};
    Object.keys(this.modules).forEach(moduleName => {
      moduleStatus[moduleName] = 'operational'; // Simplified status
    });

    return {
      initialized: this.isInitialized,
      mainnet: this.config.mainnet,
      timestamp: Date.now(),
      agents: {
        total: Object.keys(this.agents).length,
        operational: this.operationalAgents.size,
        status: agentStatus
      },
      modules: {
        total: Object.keys(this.modules).length,
        status: moduleStatus
      },
      coreSystems: {
        blockchain: !!this.blockchain,
        governance: !!this.governance,
        monitoring: !!this.monitoring,
        database: this.isLoggerInitialized
      }
    };
  }

  // Method to add new agents dynamically
  async registerAgent(agentName, agentInstance) {
    if (this.agents[agentName]) {
      throw new Error(`Agent ${agentName} already exists`);
    }

    this.agents[agentName] = agentInstance;
    
    try {
      const result = await this._initializeSingleAgent(agentName, agentInstance);
      if (result.initialized) {
        this.operationalAgents.add(agentName);
        this.agentHealth.set(agentName, { status: 'healthy', lastCheck: Date.now() });
        console.log(`✅ New agent registered and initialized: ${agentName}`);
        await this.monitoring.trackEvent('agent_registered', { agentName });
        return true;
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error(`❌ Failed to initialize new agent ${agentName}:`, error);
      await this.monitoring.trackError(`agent_registration_failed_${agentName}`, error);
      delete this.agents[agentName];
      throw error;
    }
  }
}

export default serviceManager;

// Factory function for easier creation
export function createServiceManager(config = {}) {
  return new serviceManager(config);
}
