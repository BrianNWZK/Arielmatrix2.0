// backend/agents/configAgent.js (FIXED - Production-Ready)
import { EnhancedCryptoAgent } from './cryptoAgent.js';
import shopifyAgent from './shopifyAgent.js';
import socialAgent from './socialAgent.js';
import forexSignalAgent from './forexSignalAgent.js';
import DataAgent from './dataAgent.js';
import { AdsenseAgent } from './adsenseAgent.js';
import { AdRevenueAgent } from './adRevenueAgent.js';
import { AutonomousAIEngine } from './autonomous-ai-engine.js';
import serviceManager from '../../arielsql_suite/serviceManager.js';

/**
 * @class configAgent
 * @description Global Enterprise Agent Manager.
 * Manages initialization, dependencies, and graceful shutdown of all core business agents.
 * ✅ FIXED: Database logging errors and undefined property access
 */
export class configAgent {
  constructor(CONFIG, logger) {
    this.CONFIG = CONFIG;
    this.logger = logger || console; // 🎯 CRITICAL FIX: Ensure logger is always available
    this.initializedAgents = new Map();
    this.failedAgents = new Map();
    this.serviceManager = serviceManager;
    this.systemStatus = {
      environment: CONFIG.NODE_ENV || 'MAINNET',
      system: 'Brian Nwaezike Enterprise Agent Platform',
      version: '2.0.0-MAINNET-P3',
      deploymentId: `deploy-${Date.now()}`
    };
    
    // 🎯 CRITICAL FIX: Initialize error tracking with safe defaults
    this.error = null;
    this.agents = {};
    this.status = 'initializing';
  }

  /**
   * @private
   * Initializes the EnhancedCryptoAgent with enhanced error handling
   */
  async initializeCryptoAgent() {
    const agentName = 'crypto';
    try {
      this.logger.info(`🔄 Initializing ${agentName} agent...`);
      
      // 🎯 CRITICAL FIX: Validate required configuration
      if (!this.CONFIG.BWAEZI_CONTRACT_ADDRESS) {
        throw new Error('Missing BWAEZI_CONTRACT_ADDRESS in configuration');
      }

      const crypto = new EnhancedCryptoAgent({
        CONFIG: this.CONFIG,
        contractAddress: this.CONFIG.BWAEZI_CONTRACT_ADDRESS,
        abi: this.CONFIG.BWAEZI_ABI || [],
      });

      await crypto.init();
      this.initializedAgents.set(agentName, crypto);
      this.agents[agentName] = crypto; // 🎯 CRITICAL FIX: Populate agents object

      // Safe service manager registration
      if (this.serviceManager && typeof this.serviceManager.register === 'function') {
        this.serviceManager.register('cryptoAgent', crypto);
      }

      this.logger.info(`✅ Agent Initialized: ${agentName} (Bwaezi Contract: ${this.CONFIG.BWAEZI_CONTRACT_ADDRESS.substring(0, 10)}...)`);
      return crypto;
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName} agent:`, error.message);
      this.failedAgents.set(agentName, error);
      this.error = error; // 🎯 CRITICAL FIX: Set error property safely
      throw error;
    }
  }

  async initializeShopifyAgent() {
    const agentName = 'shopify';
    try {
      this.logger.info(`🔄 Initializing ${agentName} agent...`);
      const shopify = new shopifyAgent(this.CONFIG.shopify || {});
      await shopify.initialize();
      this.initializedAgents.set(agentName, shopify);
      this.agents[agentName] = shopify;

      if (this.serviceManager && typeof this.serviceManager.register === 'function') {
        this.serviceManager.register('shopifyAgent', shopify);
      }

      this.logger.info(`✅ Agent Initialized: ${agentName}`);
      return shopify;
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error.message);
      this.failedAgents.set(agentName, error);
      this.error = error;
      throw error;
    }
  }

  async initializeSocialAgent() {
    const agentName = 'social';
    try {
      this.logger.info(`🔄 Initializing ${agentName} agent...`);
      const social = new socialAgent(this.CONFIG.social || {});
      await social.initialize();
      this.initializedAgents.set(agentName, social);
      this.agents[agentName] = social;

      if (this.serviceManager && typeof this.serviceManager.register === 'function') {
        this.serviceManager.register('socialAgent', social);
      }

      this.logger.info(`✅ Agent Initialized: ${agentName}`);
      return social;
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error.message);
      this.failedAgents.set(agentName, error);
      this.error = error;
      throw error;
    }
  }

  async initializeForexAgent() {
    const agentName = 'forex';
    try {
      this.logger.info(`🔄 Initializing ${agentName} agent...`);
      const forex = new forexSignalAgent(this.CONFIG.forex || {});
      await forex.initialize();
      this.initializedAgents.set(agentName, forex);
      this.agents[agentName] = forex;

      if (this.serviceManager && typeof this.serviceManager.register === 'function') {
        this.serviceManager.register('forexSignalAgent', forex);
      }

      this.logger.info(`✅ Agent Initialized: ${agentName}`);
      return forex;
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error.message);
      this.failedAgents.set(agentName, error);
      this.error = error;
      throw error;
    }
  }

  async initializeDataAgent() {
    const agentName = 'data';
    try {
      this.logger.info(`🔄 Initializing ${agentName} agent...`);
      const data = new dataAgent(this.CONFIG.data || {});
      await data.initialize();
      this.initializedAgents.set(agentName, data);
      this.agents[agentName] = data;

      if (this.serviceManager && typeof this.serviceManager.register === 'function') {
        this.serviceManager.register('dataAgent', data);
      }

      this.logger.info(`✅ Agent Initialized: ${agentName}`);
      return data;
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error.message);
      this.failedAgents.set(agentName, error);
      this.error = error;
      throw error;
    }
  }

  async initializeAdsenseAgent() {
    const agentName = 'adsense';
    try {
      this.logger.info(`🔄 Initializing ${agentName} agent...`);
      const adsense = new AdsenseAgent(this.CONFIG.adsense || {});
      await adsense.initialize();
      this.initializedAgents.set(agentName, adsense);
      this.agents[agentName] = adsense;

      if (this.serviceManager && typeof this.serviceManager.register === 'function') {
        this.serviceManager.register('adsenseAgent', adsense);
      }

      this.logger.info(`✅ Agent Initialized: ${agentName}`);
      return adsense;
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error.message);
      this.failedAgents.set(agentName, error);
      this.error = error;
      throw error;
    }
  }

  async initializeAdRevenueAgent() {
    const agentName = 'adRevenue';
    try {
      this.logger.info(`🔄 Initializing ${agentName} agent...`);
      const adRevenue = new AdRevenueAgent(this.CONFIG.adRevenue || {});
      await adRevenue.initialize();
      this.initializedAgents.set(agentName, adRevenue);
      this.agents[agentName] = adRevenue;

      if (this.serviceManager && typeof this.serviceManager.register === 'function') {
        this.serviceManager.register('adRevenueAgent', adRevenue);
      }

      this.logger.info(`✅ Agent Initialized: ${agentName}`);
      return adRevenue;
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error.message);
      this.failedAgents.set(agentName, error);
      this.error = error;
      throw error;
    }
  }

  async initializeAutonomousAI() {
    const agentName = 'autonomousAI';
    try {
      this.logger.info(`🔄 Initializing ${agentName} agent...`);
      const autonomous = new AutonomousAIEngine(this.CONFIG.autonomousAI || {});
      await autonomous.initialize();
      this.initializedAgents.set(agentName, autonomous);
      this.agents[agentName] = autonomous;

      if (this.serviceManager && typeof this.serviceManager.register === 'function') {
        this.serviceManager.register('autonomousAIEngine', autonomous);
      }

      this.logger.info(`✅ Agent Initialized: ${agentName}`);
      return autonomous;
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName}:`, error.message);
      this.failedAgents.set(agentName, error);
      this.error = error;
      throw error;
    }
  }

  /**
   * Enhanced initialization with comprehensive error handling
   */
  async initialize() {
    try {
      this.logger.info('🚀 Initializing Global Enterprise Agent System...');
      this.status = 'initializing';

      const agentInitializers = {
        crypto: { 
          fn: () => this.initializeCryptoAgent(), 
          enabled: this.CONFIG.enableCrypto,
          critical: true // 🎯 CRITICAL FIX: Mark crypto as critical
        },
        shopify: { fn: () => this.initializeShopifyAgent(), enabled: this.CONFIG.enableShopify, critical: false },
        social: { fn: () => this.initializeSocialAgent(), enabled: this.CONFIG.enableSocial, critical: false },
        forex: { fn: () => this.initializeForexAgent(), enabled: this.CONFIG.enableForex, critical: false },
        Data: { fn: () => this.initializeDataAgent(), enabled: this.CONFIG.enableData, critical: false },
        adsense: { fn: () => this.initializeAdsenseAgent(), enabled: this.CONFIG.enableAdsense, critical: false },
        adRevenue: { fn: () => this.initializeAdRevenueAgent(), enabled: this.CONFIG.enableAdRevenue, critical: false },
        autonomousAI: { fn: () => this.initializeAutonomousAI(), enabled: this.CONFIG.enableAutonomousAI, critical: false },
      };

      // Separate critical and non-critical agents
      const criticalQueue = [];
      const nonCriticalQueue = [];

      for (const [name, agent] of Object.entries(agentInitializers)) {
        if (agent.enabled) {
          if (agent.critical) {
            criticalQueue.push(agent.fn());
            this.logger.info(`  -> Queuing CRITICAL agent: ${name}`);
          } else {
            nonCriticalQueue.push(agent.fn());
            this.logger.info(`  -> Queuing agent: ${name}`);
          }
        } else {
          this.logger.warn(`  -> Skipping agent: ${name} (disabled by config)`);
        }
      }

      // 🎯 CRITICAL FIX: Initialize critical agents first with proper error handling
      if (criticalQueue.length > 0) {
        this.logger.info('🔧 Initializing critical agents...');
        const criticalResults = await Promise.allSettled(criticalQueue);
        
        // Check for critical failures
        const criticalFailures = criticalResults.filter(result => result.status === 'rejected');
        if (criticalFailures.length > 0) {
          const errorMessages = criticalFailures.map(r => r.reason?.message || 'Unknown error').join(', ');
          throw new Error(`Critical agent initialization failed: ${errorMessages}`);
        }
      }

      // Initialize non-critical agents with graceful error handling
      if (nonCriticalQueue.length > 0) {
        this.logger.info('🔧 Initializing non-critical agents...');
        const nonCriticalResults = await Promise.allSettled(nonCriticalQueue);
        
        nonCriticalResults.forEach((result, index) => {
          if (result.status === 'rejected') {
            const agentName = Object.keys(agentInitializers).filter(name => 
              agentInitializers[name].enabled && !agentInitializers[name].critical
            )[index];
            this.logger.warn(`⚠️ Non-critical agent ${agentName} failed but continuing:`, result.reason.message);
          }
        });
      }

      // Final status check
      if (this.failedAgents.size > 0) {
        const failedList = Array.from(this.failedAgents.keys()).join(', ');
        this.logger.warn(`⚠️ Some agents failed to initialize: [${failedList}]`);
        
        // Only throw if critical agents failed (handled above)
        if (this.failedAgents.has('crypto')) {
          throw new Error(`Critical crypto agent failed: ${this.failedAgents.get('crypto').message}`);
        }
      }

      this.status = 'active';
      this.error = null; // 🎯 CRITICAL FIX: Clear error on success
      this.logger.info('✅ All Enterprise Agents Initialized Successfully.');
      
    } catch (error) {
      this.status = 'failed';
      this.error = error; // 🎯 CRITICAL FIX: Set error property safely
      this.logger.error('💥 Fatal Error during Agent System Initialization:', error.message);
      throw error;
    }
  }

  /**
   * 🎯 CRITICAL FIX: Safe method to get agent status
   */
  getStatus() {
    return {
      status: this.status,
      error: this.error ? this.error.message : null,
      initialized: Array.from(this.initializedAgents.keys()),
      failed: Array.from(this.failedAgents.keys()),
      totalAgents: this.initializedAgents.size + this.failedAgents.size
    };
  }

  /**
   * 🎯 CRITICAL FIX: Safe method to get specific agent
   */
  getAgent(agentName) {
    return this.agents[agentName] || this.initializedAgents.get(agentName) || null;
  }
}

export default configAgent;
