// backend/agents/configAgent.js (Full, Production-Ready, Enhanced)

import { EnhancedCryptoAgent } from './cryptoAgent.js';
import shopifyAgent from './shopifyAgent.js';
import { socialAgent } from './socialAgent.js';
import forexSignalAgent from './forexSignalAgent.js';
import { dataAgent } from './dataAgent.js';
import { AdsenseAgent } from './adsenseAgent.js';
import { AdRevenueAgent } from './adRevenueAgent.js';
import { AutonomousAIEngine } from './autonomous-ai-engine.js';
import { serviceManager } from '../../arielsql_suite/serviceManager.js';

/**
 * @class configAgent
 * @description Global Enterprise Agent Manager.
 * Manages initialization, dependencies, and graceful shutdown of all core business agents.
 */
export class configAgent {
  constructor(CONFIG, logger) {
    this.CONFIG = CONFIG;
    this.logger = logger;
    this.initializedAgents = new Map();
    this.failedAgents = new Map();
    this.serviceManager = serviceManager;
    this.systemStatus = {
      environment: CONFIG.NODE_ENV || 'MAINNET',
      system: 'Brian Nwaezike Enterprise Agent Platform',
      version: '2.0.0-MAINNET-P3',
      deploymentId: `deploy-${Date.now()}`
    };
  }

  /**
   * @private
   * Initializes the EnhancedCryptoAgent.
   * CRITICAL CHANGE: The agent now self-manages its wallet connections
   * using the CONFIG provided here.
   */
  async initializeCryptoAgent() {
    const agentName = 'crypto';
    try {
      // 1. Instantiate the agent, passing the full configuration it needs.
      const crypto = new EnhancedCryptoAgent({
        CONFIG: this.CONFIG, // Pass full config to let the agent retrieve wallet details
        contractAddress: this.CONFIG.BWAEZI_CONTRACT_ADDRESS,
        abi: this.CONFIG.BWAEZI_ABI,
      });
      // 2. Initialize the agent (this triggers its internal wallet and chain setup).
      await crypto.init();

      this.initializedAgents.set(agentName, crypto);
      this.serviceManager.register('cryptoAgent', crypto);
      this.logger.info(`✅ Agent Initialized: ${agentName} (Bwaezi Contract: ${this.CONFIG.BWAEZI_CONTRACT_ADDRESS.substring(0, 10)}...)`);
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName} agent (FATAL):`, error);
      this.failedAgents.set(agentName, error);
      throw error; // Halts mainnet deployment on failure
    }
  }

  async initializeShopifyAgent() {
    const agentName = 'shopify';
    try {
      const shopify = new shopifyAgent(this.CONFIG.shopify || {});
      await shopify.initialize();
      this.initializedAgents.set(agentName, shopify);
      this.serviceManager.register('shopifyAgent', shopify);
      this.logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }

  async initializeSocialAgent() {
    const agentName = 'social';
    try {
      const social = new socialAgent(this.CONFIG.social || {});
      await social.initialize();
      this.initializedAgents.set(agentName, social);
      this.serviceManager.register('socialAgent', social);
      this.logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }

  async initializeForexAgent() {
    const agentName = 'forex';
    try {
      const forex = new forexSignalAgent(this.CONFIG.forex || {});
      await forex.initialize();
      this.initializedAgents.set(agentName, forex);
      this.serviceManager.register('forexSignalAgent', forex);
      this.logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }

  async initializeDataAgent() {
    const agentName = 'data';
    try {
      const data = new dataAgent(this.CONFIG.data || {});
      await data.initialize();
      this.initializedAgents.set(agentName, data);
      this.serviceManager.register('dataAgent', data);
      this.logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }

  async initializeAdsenseAgent() {
    const agentName = 'adsense';
    try {
      const adsense = new AdsenseAgent(this.CONFIG.adsense || {});
      await adsense.initialize();
      this.initializedAgents.set(agentName, adsense);
      this.serviceManager.register('adsenseAgent', adsense);
      this.logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }

  async initializeAdRevenueAgent() {
    const agentName = 'adRevenue';
    try {
      const adRevenue = new AdRevenueAgent(this.CONFIG.adRevenue || {});
      await adRevenue.initialize();
      this.initializedAgents.set(agentName, adRevenue);
      this.serviceManager.register('adRevenueAgent', adRevenue);
      this.logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }

  async initializeAutonomousAI() {
    const agentName = 'autonomousAI';
    try {
      const autonomous = new AutonomousAIEngine(this.CONFIG.autonomousAI || {});
      await autonomous.initialize();
      this.initializedAgents.set(agentName, autonomous);
      this.serviceManager.register('autonomousAIEngine', autonomous);
      this.logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }

  /**
   * Public method to run all agent initializations concurrently.
   */
  async initialize() {
    try {
      this.logger.info('🚀 Initializing Global Enterprise Agent System...');
      const initializationQueue = [];
      const agentInitializers = {
          crypto: { fn: () => this.initializeCryptoAgent(), enabled: this.CONFIG.enableCrypto },
          shopify: { fn: () => this.initializeShopifyAgent(), enabled: this.CONFIG.enableShopify },
          social: { fn: () => this.initializeSocialAgent(), enabled: this.CONFIG.enableSocial },
          forex: { fn: () => this.initializeForexAgent(), enabled: this.CONFIG.enableForex },
          data: { fn: () => this.initializeDataAgent(), enabled: this.CONFIG.enableData },
          adsense: { fn: () => this.initializeAdsenseAgent(), enabled: this.CONFIG.enableAdsense },
          adRevenue: { fn: () => this.initializeAdRevenueAgent(), enabled: this.CONFIG.enableAdRevenue },
          autonomousAI: { fn: () => this.initializeAutonomousAI(), enabled: this.CONFIG.enableAutonomousAI },
      };

      // ENHANCEMENT: Log skipped agents and build the queue dynamically
      for (const [name, agent] of Object.entries(agentInitializers)) {
          if (agent.enabled) {
              initializationQueue.push(agent.fn());
              this.logger.info(`  -> Queuing agent: ${name}`);
          } else {
              this.logger.warn(`  -> Skipping agent: ${name} (disabled by config)`);
          }
      }
      
      if (initializationQueue.length === 0) {
        this.logger.warn("⚠️ No agents were enabled for initialization.");
        return;
      }

      // Use Promise.allSettled to attempt all initializations and log all failures
      const results = await Promise.allSettled(initializationQueue);
      results.forEach(result => {
        if (result.status === 'rejected') {
          this.logger.error('An agent failed during concurrent initialization:', result.reason.message);
        }
      });

      if (this.failedAgents.size > 0) {
        throw new Error(`Failed to initialize ${this.failedAgents.size} critical agent(s): [${Array.from(this.failedAgents.keys()).join(', ')}]`);
      }

      this.logger.info('✅ All Enabled Enterprise Agents Initialized Successfully.');
    } catch (error) {
      this.logger.error('💥 Fatal Error during Agent System Initialization:', error);
      throw error;
    }
  }
}

export default configAgent;
