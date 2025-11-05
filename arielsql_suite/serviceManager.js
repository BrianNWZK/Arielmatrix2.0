// arielsql_suite/serviceManager.js - PRODUCTION GOD MODE v5.0 (V4 - ALL REVENUE AGENT NAMES CORRECTED)
/**
 * 🚀 ArielSQL Suite Service Manager
 * Manages all core services: Express API, WebSocket, Sovereign Core (GOD MODE), 
 * Revenue Agents, Database, and Blockchain components.
 * 🛡️ Designed for high-availability, clustering, and graceful shutdown.
 */
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import crypto from "crypto";
import cluster from "cluster";
import os from "os";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs/promises';

// 🔥 REAL PRODUCTION IMPORTS - NO SIMULATIONS
import BrianNwaezikeChain from "../backend/blockchain/BrianNwaezikeChain.js";
import { BrianNwaezikePayoutSystem } from "../backend/blockchain/BrianNwaezikePayoutSystem.js";
import { SovereignGovernance } from "../modules/governance-engine/index.js";
import { ArielSQLiteEngine } from "../modules/ariel-sqlite-engine/index.js";
import { getDatabaseInitializer } from "../modules/database-initializer.js";

// Enterprise Modules (CRITICAL: Re-added missing core dependencies)
import { ProductionSovereignCore } from "../core/sovereign-brain.js";
import { getGlobalLogger } from "../modules/enterprise-logger/index.js"; 
import MonitoringSystem from "../modules/monitoring/index.js"; 
import { getSovereignRevenueEngine } from "../modules/sovereign-revenue-engine.js";

// 🔥 REAL REVENUE AGENTS - LIVE PRODUCTION (NAME CORRECTIONS APPLIED)
import AdRevenueAgent from "../backend/agents/adRevenueAgent.js";
import AdsenseAgent from "../backend/agents/adsenseAgent.js";
import ApiScoutAgent from "../backend/agents/apiScoutAgent.js";
import { QuantumBrowserManager } from "../backend/agents/browserManager.js";
import ConfigAgent from "../backend/agents/configAgent.js"; // ✅ CORRECTION: Changed to TitleCase
import ContractDeployAgent from "../backend/agents/contractDeployAgent.js";
import { EnhancedCryptoAgent } from "../backend/agents/cryptoAgent.js";
import DataAgent from "../backend/agents/dataAgent.js";
import ForexSignalAgent from "../backend/agents/forexSignalAgent.js"; // ✅ CORRECTION: Changed to TitleCase
import HealthAgent from "../backend/agents/healthAgent.js";
import PayoutAgent from "../backend/agents/payoutAgent.js";
import ShopifyAgent from "../backend/agents/shopifyAgent.js"; // ✅ CORRECTION: Changed to TitleCase
import SocialAgent from "../backend/agents/socialAgent.js"; // ✅ CORRECTION: Changed to TitleCase

// 🔥 REAL WALLET INTEGRATION (UPDATED IMPORTS)
import { consolidateRevenue } from "../backend/agents/wallet.js";
// NOTE: initializeConnections and getWalletBalances were imported but not used in ServiceManager, 
// so only consolidateRevenue is carried over for the handler logic.

// =========================================================================
// SERVICE MANAGER CLASS
// =========================================================================

export class ServiceManager {
  /**
   * @param {object} config - Application configuration.
   * @param {ArielSQLiteEngine} dbEngine - Primary database instance.
   * @param {ProductionSovereignCore} sovereignCore - AI Core instance.
   * @param {MonitoringSystem} monitoring - System monitoring instance.
   * @param {BrianNwaezikeChain} bwaeziChain - Blockchain component.
   * @param {BrianNwaezikePayoutSystem} payoutSystem - Payout component.
   */
  constructor(config = {}) {
    this.config = config;
    this.logger = getGlobalLogger('ServiceManager');
    this.isInitialized = false;

    // Core Components (injected or set in initialize)
    this.dbEngine = null;
    this.sovereignCore = null;
    this.monitoring = null;
    this.bwaeziChain = null;
    this.payoutSystem = null;
    this.revenueEngine = null;

    // Agent Management
    this.agents = {};
    // ✅ Agent Roster Vetting: Using the latest 13 production agents with corrected names
    this.agentClasses = {
      AdRevenueAgent, AdsenseAgent, ApiScoutAgent, QuantumBrowserManager, 
      ConfigAgent, ContractDeployAgent, EnhancedCryptoAgent, DataAgent, 
      ForexSignalAgent, HealthAgent, PayoutAgent, ShopifyAgent, SocialAgent
    };

    // Server and WebSocket
    this.app = null;
    this.server = null;
    this.wss = null;
    this.connectedClients = new Set();
    
    // Interval Management
    this.backgroundInterval = null; 
    this.healthCheckInterval = null; 
    this.godModeOptimizationInterval = null; 
    this.godModeActive = false;
  }

  /**
   * Main initialization routine.
   */
  async initialize({ dbEngine, sovereignCore, monitoring, bwaeziChain, payoutSystem }) {
    if (this.isInitialized) {
      this.logger.warn('ServiceManager already initialized. Skipping.');
      return;
    }

    this.logger.info('🚀 Initializing ServiceManager...');

    // 1. Dependency Injection
    this.dbEngine = dbEngine;
    this.sovereignCore = sovereignCore;
    this.monitoring = monitoring;
    this.bwaeziChain = bwaeziChain;
    this.payoutSystem = payoutSystem;
    
    // Core utility setup
    this.revenueEngine = getSovereignRevenueEngine(this.config, sovereignCore, dbEngine);

    // 2. Setup Server Infrastructure
    this._setupExpress();
    this._setupRoutes();
    this._setupWebSockets();

    // 3. Setup and Start Agents
    await this._setupAgents();

    // 4. Start Core Loops and Tasks
    this._startBackgroundTasks();

    this.isInitialized = true;
    this.logger.info('✅ ServiceManager initialized successfully. Web server and core loops active.');
  }

  // =========================================================================
  // CORE INFRASTRUCTURE SETUP
  // =========================================================================

  /**
   * Configures the Express application and HTTP server.
   */
  _setupExpress() {
    this.app = express();
    this.app.use(cors());
    this.app.use(bodyParser.json());

    this.app.use((req, res, next) => {
      req.dbEngine = this.dbEngine;
      req.sovereignCore = this.sovereignCore;
      req.serviceManager = this;
      next();
    });

    this.server = http.createServer(this.app);
    this.server.listen(this.config.PORT, () => {
      this.logger.info(`🌐 Web Server listening on port ${this.config.PORT}`);
    });

    this.server.on('error', (err) => {
        this.logger.error(`🛑 HTTP Server Error: ${err.message}`, { stack: err.stack });
        this.shutdown();
    });
  }

  /**
   * Sets up all API endpoints.
   */
  _setupRoutes() {
    // === 1. HEALTH AND STATUS ENDPOINTS ===
    this.app.get('/api/status', async (req, res) => {
      try {
        const fullStatus = await this.getStatus();
        res.status(200).json(fullStatus);
      } catch (error) {
        this.logger.error('Error fetching global status', { error: error.message });
        res.status(500).json({ error: 'Internal Server Error', detail: error.message });
      }
    });

    // CRITICAL: REQUIRED AGENT STATUS ENDPOINT
    this.app.get('/api/status/agents', async (req, res) => {
      try {
        const agentStatus = await this.getAgentStatus();
        res.status(200).json(agentStatus);
      } catch (error) {
        this.logger.error('Error fetching agent status', { error: error.message });
        res.status(500).json({ error: 'Failed to retrieve agent status', detail: error.message });
      }
    });

    // === 2. CONTROL ENDPOINTS ===
    this.app.post('/api/triggerConsolidation', this.triggerConsolidationHandler.bind(this));
    
    this.app.get('/api/godmode/status', (req, res) => {
        const coreStatus = this.sovereignCore ? this.sovereignCore.getStatus() : { godMode: false, optimizationCycle: 0 };
        res.status(200).json(coreStatus);
    });
    
    this.app.get('/api/governance/policies', async (req, res) => {
        const initializer = getDatabaseInitializer();
        const governance = initializer.getSovereignGovernance();
        if (governance && governance.policyFramework) {
            return res.json(governance.policyFramework);
        }
        res.status(503).json({ error: 'Governance engine not initialized' });
    });
  }
  
  /**
   * Handles the manual trigger for revenue consolidation.
   */
  async triggerConsolidationHandler(req, res) {
    this.logger.info('Manual revenue consolidation triggered by API request.');
    try {
      // ✅ CORRECTION: Using consolidateRevenue as requested
      const result = await consolidateRevenue(); 
      
      this.broadcastStatusUpdate(); 

      res.status(200).json({ 
        message: 'Revenue consolidation process initiated.',
        details: result 
      });
    } catch (error) {
      this.logger.error('Error during manual consolidation trigger:', { error: error.message, stack: error.stack });
      res.status(500).json({ error: 'Failed to initiate consolidation', detail: error.message });
    }
  }

  /**
   * Configures the WebSocket server for real-time status updates.
   */
  _setupWebSockets() {
    this.wss = new WebSocketServer({ server: this.server });

    this.wss.on('connection', (ws, req) => {
      ws.id = crypto.randomUUID(); 
      this.connectedClients.add(ws);
      this.logger.info(`WebSocket client connected. ID: ${ws.id}. Total clients: ${this.connectedClients.size}`);

      this.getStatus().then(status => {
        ws.send(JSON.stringify({ type: 'INITIAL_STATUS', data: status }));
      });
      
      ws.on('close', () => {
        this.connectedClients.delete(ws);
        this.logger.info(`WebSocket client disconnected. ID: ${ws.id}. Remaining clients: ${this.connectedClients.size}`);
      });
      
      ws.on('error', (error) => {
        this.logger.error(`WebSocket Error for client ${ws.id}: ${error.message}`);
      });
    });
  }
  
  /**
   * Broadcasts the current system status to all connected WebSocket clients.
   */
  async broadcastStatusUpdate() {
    if (this.connectedClients.size === 0) return;
    
    try {
      const status = await this.getStatus();
      const message = JSON.stringify({ type: 'STATUS_UPDATE', data: status });

      this.connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    } catch (error) {
      this.logger.error('Error broadcasting status update:', { error: error.message });
    }
  }

  // =========================================================================
  // AGENT AND CORE MANAGEMENT
  // =========================================================================

  /**
   * Instantiates and stores an agent instance.
   */
  _initializeAgent(AgentClass, agentName) {
    try {
        const agent = new AgentClass({
          config: this.config, 
          db: this.dbEngine, 
          core: this.sovereignCore,
          logger: getGlobalLogger(agentName)
        });
        this.agents[agentName] = agent;
        this.logger.info(`Agent '${agentName}' initialized.`);
    } catch (error) {
        this.logger.error(`❌ Failed to initialize agent ${agentName}: ${error.message}`);
    }
  }

  /**
   * Initializes all production revenue agents.
   */
  async _setupAgents() {
    this.logger.info('Initializing production agents...');
    const agentPromises = [];

    // Instantiate all agents using the vetted agentClasses map
    for (const [agentName, AgentClass] of Object.entries(this.agentClasses)) {
      this._initializeAgent(AgentClass, agentName);
    }
    
    // Start all agents concurrently
    for (const [agentName, agent] of Object.entries(this.agents)) {
      if (agent && typeof agent.start === 'function') {
        agentPromises.push(agent.start().then(() => {
          this.logger.info(`Agent ${agentName} started.`);
        }).catch(error => {
          this.logger.error(`❌ Failed to start agent ${agentName}: ${error.message}`);
        }));
      } else {
        this.logger.warn(`Agent ${agentName} does not have a 'start' function or is invalid.`);
      }
    }

    await Promise.allSettled(agentPromises);
    this.logger.info(`✅ All agents finished their initial setup/start routines.`);
  }

  /**
   * Starts periodic background tasks and the GOD MODE loop.
   */
  _startBackgroundTasks() {
    this.backgroundInterval = setInterval(() => {
      this.broadcastStatusUpdate();
    }, this.config.STATUS_BROADCAST_INTERVAL || 5000); 

    this.healthCheckInterval = setInterval(() => {
      this.monitoring?.runHealthCheck();
    }, this.config.HEALTH_CHECK_INTERVAL || 60000); 

    // 🔥 Start GOD MODE Optimization Loop
    if (this.sovereignCore && typeof this.sovereignCore.startGodModeLoop === 'function') {
      this.godModeActive = true;
      this.sovereignCore.startGodModeLoop(); 
      this.logger.info(`🧠 GOD MODE Optimization Loop initiated.`);
    }
  }

  // =========================================================================
  // STATUS & SHUTDOWN
  // =========================================================================

  /**
   * Aggregates the full system status.
   */
  async getStatus() {
    const agentStatus = await this.getAgentStatus();
    const coreStatus = this.sovereignCore ? this.sovereignCore.getStatus() : { godMode: false, optimizationCycle: 0 };
    const bwaeziHealth = await this.payoutSystem?.checkHealth();

    return {
      managerStatus: this.isInitialized ? 'ONLINE' : 'SHUTDOWN',
      timestamp: new Date().toISOString(),
      process: {
        pid: process.pid,
        cpuUsage: process.cpuUsage(),
        memoryUsage: process.memoryUsage(),
        workerId: cluster.worker ? cluster.worker.id : 'MASTER'
      },
      godMode: coreStatus,
      bwaeziChain: bwaeziHealth,
      agentCount: Object.keys(this.agents).length,
      agents: agentStatus
    };
  }
  
  /**
   * Retrieves the status of all managed agents.
   * MAINTAINED: /api/status/agents endpoint functionality.
   */
  async getAgentStatus() {
    const statusPromises = Object.entries(this.agents).map(async ([name, agent]) => {
      try {
        const agentStatus = agent && typeof agent.getStatus === 'function' 
          ? await agent.getStatus() 
          : { status: 'UNKNOWN', lastRun: 'N/A' };
          
        return {
          name,
          ...agentStatus,
          isLive: agentStatus.status === 'RUNNING' || agentStatus.status === 'ACTIVE',
        };
      } catch (error) {
        this.logger.error(`Error getting status for agent ${name}: ${error.message}`);
        return {
          name,
          status: 'ERROR',
          error: error.message,
          isLive: false,
        };
      }
    });

    return (await Promise.allSettled(statusPromises))
      .filter(p => p.status === 'fulfilled')
      .map(p => p.value);
  }

  /**
   * Performs a graceful shutdown of all services.
   */
  async shutdown() {
    if (!this.isInitialized) {
      this.logger.warn('ServiceManager is already shut down.');
      return;
    }

    this.logger.info('🛑 Initiating graceful ServiceManager shutdown...');

    // Clear all intervals
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.godModeOptimizationInterval) {
        clearInterval(this.godModeOptimizationInterval);
    }


    // Close WebSocket connections gracefully (Code 1000 - Normal Closure)
    this.connectedClients.forEach(client => {
      try {
        client.close(1000, 'Service shutdown');
      } catch (error) {
        this.logger.error("Error closing WebSocket client:", { error: error.message });
      }
    });
    this.connectedClients.clear();

    // Stop agents concurrently with robust error handling
    const agentStopPromises = [];
    for (const [agentName, agent] of Object.entries(this.agents)) {
      try {
        if (agent && typeof agent.stop === 'function') {
          agentStopPromises.push(agent.stop().catch(error => {
             this.logger.error(`Error stopping agent ${agentName}: ${error.message}`);
          }));
        }
      } catch (error) {
        this.logger.error(`Error stopping agent ${agentName}: ${error.message}`);
      }
    }
    await Promise.allSettled(agentStopPromises);
    this.logger.info('✅ All agents stopped.');

    // Stop core components
    if (this.monitoring) {
      await this.monitoring.stop().catch(e => this.logger.error('Monitoring shutdown failed:', e.message));
    }
    
    // 🔥 DEACTIVATE GOD MODE
    if (this.sovereignCore && this.godModeActive) {
      await this.sovereignCore.emergencyShutdown().catch(e => this.logger.error('SovereignCore shutdown failed:', e.message));
      this.godModeActive = false;
      this.logger.info('💀 GOD MODE DEACTIVATED by Sovereign Core emergency shutdown.');
    }
    
    if (this.payoutSystem && typeof this.payoutSystem.shutdown === 'function') {
        await this.payoutSystem.shutdown().catch(e => this.logger.error('PayoutSystem shutdown failed:', e.message));
    }

    // Stop Express/HTTP server gracefully
    if (this.server) {
      await new Promise(resolve => this.server.close(() => {
        this.logger.info('✅ HTTP Server closed.');
        resolve();
      }));
    }

    this.isInitialized = false;
    this.logger.info('✅ ServiceManager shutdown complete.');
  }
}

// =========================================================================
// SINGLETON MANAGEMENT AND EXPORTS
// =========================================================================

let globalServiceManager = null;

/**
 * Retrieves the global singleton instance of ServiceManager.
 * @param {object} [config={}] - Configuration object.
 * @returns {ServiceManager}
 */
export function getServiceManager(config = {}) {
  if (!globalServiceManager) {
    globalServiceManager = new ServiceManager(config);
  }
  return globalServiceManager;
}

export default ServiceManager;
