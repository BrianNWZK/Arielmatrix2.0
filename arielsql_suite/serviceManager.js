import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

// === Core Blockchain Systems ===
import { BrianNwaezikeChain } from "../backend/blockchain/BrianNwaezikeChain.js";
import { BrianNwaezikePayoutSystem } from "../backend/blockchain/BrianNwaezikePayoutSystem.js";

// === Governance + Logging ===
import GovernanceEngine from "../modules/governance-engine/index.js";
import { ArielSQLiteEngine } from "../modules/ariel-sqlite-engine/index.js";

// === Phase 3 Advanced Modules ===
import { QuantumResistantCrypto } from "../modules/quantum-resistant-crypto/index.js";
import { QuantumShield } from "../modules/quantum-shield/index.js";
import { AIThreatDetector } from "../modules/ai-threat-detector/index.js";
import { AISecurityModule } from "../modules/ai-security-module/index.js";
import { CrossChainBridge } from "../modules/cross-chain-bridge/index.js";
import { OmnichainInterop } from "../modules/omnichain-interoperability/index.js";
import { ShardingManager } from "../modules/sharding-manager/index.js";
import { InfiniteScalabilityEngine } from "../modules/infinite-scalability-engine/index.js";
import { EnergyEfficientConsensus } from "../modules/energy-efficient-consensus/index.js";
import { CarbonNegativeConsensus } from "../modules/carbon-negative-consensus/index.js";

// === Agents ===
import AdRevenueAgent from "../backend/agents/adRevenueAgent.js";
import AdsenseAgent from "../backend/agents/adsenseAgent.js";
import ApiScoutAgent from "../backend/agents/apiScoutAgent.js";
import QuantumBrowserManager from "../backend/agents/browserManager.js";
import ConfigAgent from "../backend/agents/configAgent.js";
import ContractDeployAgent from "../backend/agents/contractDeployAgent.js";
import { EnhancedCryptoAgent } from "../backend/agents/cryptoAgent.js";
import DataAgent from "../backend/agents/dataAgent.js";
import ForexSignalAgent from "../backend/agents/forexSignalAgent.js";
import HealthAgent from "../backend/agents/healthAgent.js";
import PayoutAgent from "../backend/agents/payoutAgent.js";
import EnhancedShopifyAgent from "../backend/agents/shopifyAgent.js";
import SocialAgent from "../backend/agents/socialAgent.js";


export class serviceManager {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 10000,
    };

    this.app = express();
    this.app.use(cors());
    this.app.use(bodyParser.json({ limit: "20mb" }));
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.blockchain = new BrianNwaezikeChain();
    this.payoutSystem = new BrianNwaezikePayoutSystem();

    this.governance = new GovernanceEngine();
    this.loggerDB = new ArielSQLiteEngine("./data/service_logs.db");

    this.modules = {
      qrCrypto: new QuantumResistantCrypto(),
      sqlite: this.loggerDB,
      qShield: new QuantumShield(),
      aiThreat: new AIThreatDetector(),
      aiSecurity: new AISecurityModule(),
      bridge: new CrossChainBridge(),
      interop: new OmnichainInterop(),
      shards: new ShardingManager(),
      scalability: new InfiniteScalabilityEngine(),
      consensus: new EnergyEfficientConsensus(),
      carbonConsensus: new CarbonNegativeConsensus(),
    };

    this.agents = {
      adRevenue: new AdRevenueAgent(),
      adsense: new AdsenseApi(),
      apiScout: new ApiScoutAgent(),
      browser: new BrowserManager(),
      config: new ConfigAgent(),
      contractDeploy: new ContractDeployAgent(),
      crypto: new CryptoAgent(),
      data: new DataAgent(),
      forex: new ForexSignalAgent(),
      health: new HealthAgent(),
      payout: new PayoutAgent(),
      shopify: new ShopifyAgent(),
      social: new SocialAgent(),
   };


    this._setupApiRoutes();
    this._setupWebSocket();
  }

  async init() {
    if (this.blockchain.init) await this.blockchain.init();
    if (this.payoutSystem.init) await this.payoutSystem.init();

    await this.governance.initialize();
    await this.loggerDB.init();

    await this.loggerDB.run(`
      CREATE TABLE IF NOT EXISTS service_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        service_name TEXT NOT NULL,
        payload TEXT,
        result TEXT,
        timestamp INTEGER NOT NULL
      )
    `);

    for (const [name, mod] of Object.entries(this.modules)) {
      if (mod.initialize) {
        console.log(`⚙ Initializing module: ${name}`);
        await mod.initialize();
      }
    }

    for (const [name, agent] of Object.entries(this.agents)) {
      if (agent.initialize) {
        console.log(`🤖 Initializing agent: ${name}`);
        await agent.initialize();
      }
    }
  }

  start() {
    this.server.listen(this.config.port, "0.0.0.0", () => {
      console.log(`🌐 ServiceManager live on port ${this.config.port}`);
    });
  }

  async stop() {
    console.log("🛑 Stopping services...");
    this.wss.close();
    this.server.close();
    if (this.modules.sqlite && this.modules.sqlite.db) {
      await this.modules.sqlite.db.close();
    }
  }

  async routeServiceCall(serviceName, payload) {
    try {
      const approved = await this.governance.verifyModule(serviceName);
      if (!approved) throw new Error(`❌ Service ${serviceName} not approved by governance`);

      const handler = this.agents[serviceName] || this.modules[serviceName];
      if (!handler || typeof handler.execute !== "function") {
        throw new Error(`⚠️ No executable handler found for ${serviceName}`);
      }

      const result = await handler.execute(payload);

      await this.loggerDB.run(
        `INSERT INTO service_logs (service_name, payload, result, timestamp) VALUES (?, ?, ?, ?)`,
        [serviceName, JSON.stringify(payload), JSON.stringify(result), Date.now()]
      );

      return { success: true, result };
    } catch (error) {
      console.error(`❌ Service call failed: ${serviceName}`, error.message);
      return { success: false, error: error.message };
    }
  }

  _setupApiRoutes() {
    this.app.get("/", (req, res) => {
      res.json({ status: "ok", service: "ArielSQL Suite v2.0" });
    });

    this.app.get("/health", (req, res) => {
      res.json(this.agents.health.getStatus());
    });

    this.app.post("/service/:name", async (req, res) => {
      const result = await this.routeServiceCall(req.params.name, req.body);
      res.json(result);
    });

    this.app.post("/payouts", async (req, res) => {
      const { wallet, amount } = req.body;
      try {
        const result = await this.payoutSystem.recordPayout(wallet, amount);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });
  }

  _setupWebSocket() {
    this.wss.on("connection", (ws) => {
      ws.send(JSON.stringify({ msg: "Connected to ArielSQL Suite WS" }));

      ws.on("message", async (msg) => {
        try {
          const data = JSON.parse(msg);

          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong" }));
          }

          if (data.type === "blockchain_tx") {
            await this.blockchain.addTransaction(data.payload);
            const block = await this.blockchain.minePendingTransactions();
            ws.send(JSON.stringify({ type: "block_mined", block }));
          }

          if (data.type === "interop") {
            const result = await this.modules.interop.executeCrossChainOperation(data.payload);
            ws.send(JSON.stringify({ type: "interop_result", result }));
          }
        } catch (err) {
          ws.send(JSON.stringify({ error: err.message }));
        }
      });
    });
  }
}
