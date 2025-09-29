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
import ConfigAgent from "../backend/agents/configAgent.js";
import ContractDeployAgent from "../backend/agents/contractDeployAgent.js";
import { EnhancedCryptoAgent } from "../backend/agents/cryptoAgent.js";
import DataAgent from "../backend/agents/dataAgent.js";
import ForexSignalAgent from "../backend/agents/forexSignalAgent.js";
import HealthAgent from "../backend/agents/healthAgent.js";
import PayoutAgent from "../backend/agents/payoutAgent.js";
import EnhancedShopifyAgent from "../backend/agents/shopifyAgent.js";
import SocialAgent from "../backend/agents/socialAgent.js";

class ServiceManager {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 10000,
      blockchainConfig: config.blockchainConfig || {},
      mainnet: config.mainnet !== undefined ? config.mainnet : true
    };

    this.app = express();
    this.app.use(cors());
    this.app.use(bodyParser.json({ limit: "50mb" }));
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ 
      server: this.server,
      perMessageDeflate: false
    });

    // Initialize core systems with production configurations
    this.blockchain = new BrianNwaezikeChain({
      mainnet: this.config.mainnet,
      chainId: this.config.mainnet ? 'bwaezi-mainnet-1' : 'bwaezi-testnet-1',
      ...this.config.blockchainConfig
    });

    this.payoutSystem = new BrianNwaezikePayoutSystem({
      mainnet: this.config.mainnet
    });

    this.governance = new SovereignGovernance({
      votingPeriod: 7 * 24 * 60 * 60 * 1000,
      mainnet: this.config.mainnet
    });

    this.loggerDB = new ArielSQLiteEngine("./data/service_logs.db", {
      poolSize: 5,
      timeout: 15000
    });

    // Initialize all production modules
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
          ETHEREUM: process.env.ETH_MAINNET_RPC,
          SOLANA: process.env.SOL_MAINNET_RPC,
          BINANCE: process.env.BNB_MAINNET_RPC
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

    // Initialize production agents
    this.agents = {
      adRevenue: new AdRevenueAgent({ mainnet: this.config.mainnet }),
      adsense: new AdsenseAgent({ mainnet: this.config.mainnet }),
      apiScout: new ApiScoutAgent({ mainnet: this.config.mainnet }),
      browser: new QuantumBrowserManager({ mainnet: this.config.mainnet }),
      config: new ConfigAgent({ mainnet: this.config.mainnet }),
      contractDeploy: new ContractDeployAgent({ mainnet: this.config.mainnet }),
      crypto: new EnhancedCryptoAgent({ mainnet: this.config.mainnet }),
      data: new DataAgent({ mainnet: this.config.mainnet }),
      forex: new ForexSignalAgent({ mainnet: this.config.mainnet }),
      health: new HealthAgent({ mainnet: this.config.mainnet }),
      payout: new PayoutAgent({ mainnet: this.config.mainnet }),
      shopify: new EnhancedShopifyAgent({ mainnet: this.config.mainnet }),
      social: new SocialAgent({ mainnet: this.config.mainnet })
    };

    this.connectedClients = new Set();
    this.isInitialized = false;
    this.backgroundInterval = null;

    this._setupApiRoutes();
    this._setupWebSocket();
    this._setupErrorHandling();
  }

  async initialize() {
    if (this.isInitialized) {
      console.log("⚠️ ServiceManager already initialized");
      return;
    }

    try {
      console.log("🚀 Initializing ServiceManager...");

      // Initialize database first
      await this.loggerDB.init();
      await this._createServiceSchema();

      // Initialize blockchain systems
      if (this.blockchain.init) await this.blockchain.init();
      if (this.payoutSystem.init) await this.payoutSystem.init();

      // Initialize governance
      await this.governance.initialize();

      // Initialize all modules with error handling
      const modulePromises = Object.entries(this.modules).map(async ([name, module]) => {
        try {
          if (module.initialize && typeof module.initialize === 'function') {
            console.log(`⚙️ Initializing module: ${name}`);
            await module.initialize();
            console.log(`✅ Module ${name} initialized successfully`);
          }
        } catch (error) {
          console.error(`❌ Failed to initialize module ${name}:`, error.message);
          throw error;
        }
      });

      await Promise.all(modulePromises);

      // Initialize all agents with error handling
      const agentPromises = Object.entries(this.agents).map(async ([name, agent]) => {
        try {
          if (agent.initialize && typeof agent.initialize === 'function') {
            console.log(`🤖 Initializing agent: ${name}`);
            await agent.initialize();
            console.log(`✅ Agent ${name} initialized successfully`);
          }
        } catch (error) {
          console.error(`❌ Failed to initialize agent ${name}:`, error.message);
          throw error;
        }
      });

      await Promise.all(agentPromises);

      this.isInitialized = true;
      console.log("✅ ServiceManager initialized successfully");

      // Start background services
      this._startBackgroundServices();

    } catch (error) {
      console.error("❌ ServiceManager initialization failed:", error);
      throw error;
    }
  }

  async _createServiceSchema() {
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
      await this.loggerDB.run(tableSql);
    }

    // Create indexes
    const indexes = [
      "CREATE INDEX IF NOT EXISTS idx_service_logs_name ON service_logs(service_name)",
      "CREATE INDEX IF NOT EXISTS idx_service_logs_time ON service_logs(timestamp)",
      "CREATE INDEX IF NOT EXISTS idx_blockchain_events_type ON blockchain_events(event_type)",
      "CREATE INDEX IF NOT EXISTS idx_blockchain_events_time ON blockchain_events(timestamp)"
    ];

    for (const indexSql of indexes) {
      await this.loggerDB.run(indexSql);
    }
  }

  start() {
    this.server.listen(this.config.port, "0.0.0.0", () => {
      console.log(`🌐 ServiceManager live on port ${this.config.port}`);
      console.log(`📊 Mainnet Mode: ${this.config.mainnet}`);
      console.log(`🔗 WebSocket Server: ws://localhost:${this.config.port}`);
    });
  }

  async stop() {
    console.log("🛑 Stopping ServiceManager...");
    
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

    // Close server
    return new Promise((resolve) => {
      this.server.close(() => {
        console.log("✅ ServiceManager stopped successfully");
        resolve();
      });
    });
  }

  async routeServiceCall(serviceName, payload) {
    const startTime = Date.now();
    
    try {
      // Verify service is approved by governance
      const approved = await this.governance.verifyModule(serviceName);
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

  _setupApiRoutes() {
    // Health check endpoint
    this.app.get("/", (req, res) => {
      res.json({ 
        status: "ok", 
        service: "ArielSQL Suite v3.0", 
        mainnet: this.config.mainnet,
        timestamp: Date.now()
      });
    });

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
          uptime: process.uptime()
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
  }

  _setupWebSocket() {
    this.wss.on("connection", (ws, req) => {
      console.log("🔗 New WebSocket connection");
      this.connectedClients.add(ws);

      ws.send(JSON.stringify({ 
        type: "connected",
        message: "Connected to ArielSQL Suite WebSocket",
        timestamp: Date.now()
      }));

      ws.on("message", async (data) => {
        try {
          const message = JSON.parse(data);
          
          switch (message.type) {
            case "ping":
              ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
              break;

            case "blockchain_tx":
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
      // Don't exit in production, log and continue
      this._logError('uncaught_exception', error);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('🛑 Unhandled Rejection at:', promise, 'reason:', reason);
      this._logError('unhandled_rejection', reason);
    });

    this.app.use((error, req, res, next) => {
      console.error('🛑 Express error:', error);
      this._logError('express_error', error);
      res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
      });
    });
  }

  async _logError(type, error) {
    try {
      await this.loggerDB.run(
        "INSERT INTO service_logs (service_name, payload, result, status, error_message, timestamp) VALUES (?, ?, ?, ?, ?, ?)",
        ['error_handler', JSON.stringify({ type }), null, 'error', error.message, Date.now()]
      );
    } catch (logError) {
      console.error("❌ Failed to log error:", logError);
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
      } catch (error) {
        console.error("Background service error:", error);
      }
    }, 30000); // Every 30 seconds
  }

  // Public method to get service status
  async getServiceStatus() {
    const metrics = await this.loggerDB.all(
      "SELECT service_name, call_count, success_count, error_count, avg_response_time FROM service_metrics"
    );
    
    return {
      initialized: this.isInitialized,
      mainnet: this.config.mainnet,
      connectedClients: this.connectedClients.size,
      services: metrics,
      uptime: process.uptime()
    };
  }
}

export { ServiceManager as serviceManager };
export default ServiceManager;
