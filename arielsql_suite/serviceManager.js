import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";

// === Core Blockchain Systems ===
import { BrianNwaezikeChain } from "../backend/blockchain/BrianNwaezikeChain.js";
import { BrianNwaezikePayoutSystem } from "../backend/blockchain/BrianNwaezikePayoutSystem.js";

// === Phase 3 Advanced Modules ===
import { QuantumResistantCrypto } from "../modules/quantum-resistant-crypto/index.js";
import { ArielSQLiteEngine } from "../modules/ariel-sqlite-engine/index.js";
import { QuantumShield } from "../modules/quantum-shield/index.js";
import { AIThreatDetector } from "../modules/ai-threat-detector/index.js";
import { AISecurityModule } from "../modules/ai-security-module/index.js";
import { CrossChainBridge } from "../modules/cross-chain-bridge/index.js";
import { OmnichainInterop } from "../modules/omnichain-interoperability/index.js";
import { ShardingManager } from "../modules/sharding-manager/index.js";
import { InfiniteScalabilityEngine } from "../modules/infinite-scalability-engine/index.js";
import { EnergyEfficientConsensus } from "../modules/energy-efficient-consensus/index.js";
import { CarbonNegativeConsensus } from "../modules/carbon-negative-consensus/index.js";

// === Agents (simplified examples) ===
import AdRevenueAgent from "../backend/agents/adRevenueAgent.js";
import ComplianceAgent from "../backend/agents/complianceAgent.js";
import PayoutAgent from "../backend/agents/payoutAgent.js";
import HealthAgent from "../backend/agents/healthAgent.js";

export class ServiceManager {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 10000,
    };

    // Core App/Server
    this.app = express();
    this.app.use(cors());
    this.app.use(bodyParser.json({ limit: "20mb" }));
    this.server = http.createServer(this.app);

    // WebSocket
    this.wss = new WebSocketServer({ server: this.server });

    // Core Blockchain
    this.blockchain = new BrianNwaezikeChain();
    this.payoutSystem = new BrianNwaezikePayoutSystem();

    // Advanced Modules
    this.modules = {
      qrCrypto: new QuantumResistantCrypto(),
      sqlite: new ArielSQLiteEngine("./data/ariel.db"),
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

    // Core Agents
    this.agents = {
      adRevenue: new AdRevenueAgent(),
      compliance: new ComplianceAgent(),
      payout: new PayoutAgent(),
      health: new HealthAgent(),
    };

    this._setupApiRoutes();
    this._setupWebSocket();
  }

  async init() {
    // Initialize blockchain + payout system
    if (this.blockchain.init) await this.blockchain.init();
    if (this.payoutSystem.init) await this.payoutSystem.init();

    // Initialize all modules
    for (const [name, mod] of Object.entries(this.modules)) {
      if (mod.initialize) {
        console.log(`⚙ Initializing module: ${name}`);
        await mod.initialize();
      }
    }

    // Initialize all agents
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

    // Close module connections
    if (this.modules.sqlite && this.modules.sqlite.db) {
      await this.modules.sqlite.db.close();
    }
  }

  _setupApiRoutes() {
    this.app.get("/", (req, res) => {
      res.json({ status: "ok", service: "ArielSQL Suite v2.0" });
    });

    this.app.get("/health", (req, res) => {
      res.json(this.agents.health.getStatus());
    });

    // Blockchain APIs
    this.app.get("/blockchain/chain", (req, res) => {
      res.json(this.blockchain.chain);
    });

    this.app.post("/blockchain/tx", async (req, res) => {
      try {
        await this.blockchain.addTransaction(req.body);
        const block = await this.blockchain.minePendingTransactions();
        res.json({ success: true, block });
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Payouts
    this.app.post("/payouts", async (req, res) => {
      const { wallet, amount } = req.body;
      try {
        const result = await this.payoutSystem.recordPayout(wallet, amount);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // AI Security
    this.app.post("/security/scan", async (req, res) => {
      try {
        const result = await this.modules.aiSecurity.monitorSystem(req.body.logs, req.body.data);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Interop
    this.app.post("/interop", async (req, res) => {
      try {
        const result = await this.modules.interop.executeCrossChainOperation(req.body);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Consensus
    this.app.post("/consensus/block", async (req, res) => {
      try {
        const result = await this.modules.consensus.proposeBlock(req.body);
        res.json(result);
      } catch (err) {
        res.status(500).json({ error: err.message });
      }
    });

    // Carbon Offsets
    this.app.post("/carbon/offset", async (req, res) => {
      try {
        const result = await this.modules.carbonConsensus.processTransaction(req.body);
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
