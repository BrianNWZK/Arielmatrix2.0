import { EnhancedCryptoAgent } from './cryptoAgent.js';
import shopifyAgent from './shopifyAgent.js';
import { socialAgent } from './socialAgent.js';
import forexSignalAgent from './forexSignalAgent.js';
import { dataAgent } from './dataAgent.js';
import { AdsenseAgent } from './adsenseAgent.js';
import { AdRevenueAgent } from './adRevenueAgent.js';
import { AutonomousAIEngine } from './autonomous-ai-engine.js';
import { serviceManager } from '../../arielsql_suite/serviceManager.js';
import { getGlobalLogger } from '../../modules/enterprise-logger/index.js';

/**
 * @class configAgent
 * @description Global Enterprise Agent Manager. Manages initialization, 
 * dependencies, and graceful shutdown of all core business agents.
 */
export class configAgent {
  constructor(CONFIG) {
    this.CONFIG = CONFIG;
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

  async initializeCryptoAgent() {
    const agentName = 'crypto';
    const logger = getGlobalLogger();
    try {
      const crypto = new EnhancedCryptoAgent({
        CONFIG: this.CONFIG,
        contractAddress: this.CONFIG.BWAEZI_CONTRACT_ADDRESS,
        abi: this.CONFIG.BWAEZI_ABI,
      });
      
      await crypto.init();
      this.initializedAgents.set(agentName, crypto);
      this.serviceManager.register('cryptoAgent', crypto);
      logger.info(`✅ Agent Initialized: ${agentName} (Bwaezi Contract: ${this.CONFIG.BWAEZI_CONTRACT_ADDRESS.substring(0, 10)}...)`);
    } catch (error) {
      logger.error(`💥 Failed to initialize ${agentName} agent (FATAL):`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }

  async initializeShopifyAgent() { 
    const agentName = 'shopify';
    const logger = getGlobalLogger();
    try {
      const shopify = new shopifyAgent(this.CONFIG.shopify || {});
      await shopify.initialize();
      this.initializedAgents.set(agentName, shopify);
      this.serviceManager.register('shopifyAgent', shopify);
      logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }
  
  async initializeSocialAgent() {
    const agentName = 'social';
    const logger = getGlobalLogger();
    try {
      const social = new socialAgent(this.CONFIG.social || {});
      await social.initialize();
      this.initializedAgents.set(agentName, social);
      this.serviceManager.register('socialAgent', social);
      logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }
  
  async initializeForexAgent() {
    const agentName = 'forex';
    const logger = getGlobalLogger();
    try {
      const forex = new forexSignalAgent(this.CONFIG.forex || {});
      await forex.initialize();
      this.initializedAgents.set(agentName, forex);
      this.serviceManager.register('forexSignalAgent', forex);
      logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }
  
  async initializeDataAgent() {
    const agentName = 'data';
    const logger = getGlobalLogger();
    try {
      const data = new dataAgent(this.CONFIG.data || {});
      await data.initialize();
      this.initializedAgents.set(agentName, data);
      this.serviceManager.register('dataAgent', data);
      logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }
  
  async initializeAdsenseAgent() {
    const agentName = 'adsense';
    const logger = getGlobalLogger();
    try {
      const adsense = new AdsenseAgent(this.CONFIG.adsense || {});
      await adsense.initialize();
      this.initializedAgents.set(agentName, adsense);
      this.serviceManager.register('adsenseAgent', adsense);
      logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }
  
  async initializeAdRevenueAgent() {
    const agentName = 'adRevenue';
    const logger = getGlobalLogger();
    try {
      const adRevenue = new AdRevenueAgent(this.CONFIG.adRevenue || {});
      await adRevenue.initialize();
      this.initializedAgents.set(agentName, adRevenue);
      this.serviceManager.register('adRevenueAgent', adRevenue);
      logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }
  
  async initializeAutonomousAI() {
    const agentName = 'autonomousAI';
    const logger = getGlobalLogger();
    try {
      const autonomous = new AutonomousAIEngine(this.CONFIG.autonomousAI || {});
      await autonomous.initialize();
      this.initializedAgents.set(agentName, autonomous);
      this.serviceManager.register('autonomousAIEngine', autonomous);
      logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
      logger.error(`💥 Failed to initialize ${agentName}:`, error);
      this.failedAgents.set(agentName, error);
      throw error;
    }
  }
  
  /**
   * Public method to run all agent initializations concurrently.
   */
  async initialize() {
    const logger = getGlobalLogger();
    try {
      logger.info('🚀 Initializing Global Enterprise Agent System...');
      
      const initializationQueue = [];

      // Add all agent initializations to the queue with config checks
      if (this.CONFIG.enableCrypto) initializationQueue.push(this.initializeCryptoAgent());
      if (this.CONFIG.enableShopify) initializationQueue.push(this.initializeShopifyAgent());
      if (this.CONFIG.enableSocial) initializationQueue.push(this.initializeSocialAgent());
      if (this.CONFIG.enableForex) initializationQueue.push(this.initializeForexAgent());
      if (this.CONFIG.enableData) initializationQueue.push(this.initializeDataAgent());
      if (this.CONFIG.enableAdsense) initializationQueue.push(this.initializeAdsenseAgent());
      if (this.CONFIG.enableAdRevenue) initializationQueue.push(this.initializeAdRevenueAgent());
      if (this.CONFIG.enableAutonomousAI) initializationQueue.push(this.initializeAutonomousAI());

      // Use Promise.allSettled to log all failures
      const results = await Promise.allSettled(initializationQueue);

      results.forEach(result => {
          if (result.status === 'rejected') {
              logger.error('An agent failed during initialization:', result.reason.message);
          }
      });
      
      if (this.failedAgents.size > 0) {
          throw new Error(`Failed to initialize ${this.failedAgents.size} agents`);
      }
      
      logger.info('✅ All Enterprise Agents Initialized Successfully.');
      
    } catch (error) {
      logger.error('💥 Fatal Error during Agent System Initialization:', error);
      throw error;
    }
  }
}

export default configAgent;
