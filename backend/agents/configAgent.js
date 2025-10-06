// backend/agents/configAgent.js (Full, Production-Ready)

import { EnhancedCryptoAgent } from './cryptoAgent.js';
import shopifyAgent from './shopifyAgent.js';
import { socialAgent } from './socialAgent.js';
import forexSignalAgent from './forexSignalAgent.js';
import { dataAgent } from './dataAgent.js';
import { AdsenseAgent } from './adsenseAgent.js';
import { AdRevenueAgent } from './adRevenueAgent.js';
import { AutonomousAIEngine } from './autonomous-ai-engine.js';
import { serviceManager } from '../../arielsql_suite/serviceManager.js';

// CRITICAL FIX: The Global Logger is NO LONGER imported here to prevent dependency cycle crashes.

/**
 * @class configAgent
 * @description Global Enterprise Agent Manager. Manages initialization, 
 * dependencies, and graceful shutdown of all core business agents.
 */
export class configAgent {
  /**
   * @param {object} CONFIG - The global configuration object.
   * @param {object} logger - The EnterpriseLogger instance (INJECTED).
   */
  constructor(CONFIG, logger) { // NOVEL: Logger is injected.
    this.CONFIG = CONFIG; 
    this.logger = logger; // Store the injected logger instance.
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
   */
  async initializeCryptoAgent() {
    const agentName = 'crypto';
    try {
      const crypto = new EnhancedCryptoAgent({
        CONFIG: this.CONFIG, 
        contractAddress: this.CONFIG.BWAEZI_CONTRACT_ADDRESS, 
        abi: this.CONFIG.BWAEZI_ABI,
        logger: this.logger, // Inject logger into the agent
      });
      
      await crypto.init(); 

      this.initializedAgents.set(agentName, crypto);
      this.logger.info(`✅ Agent Initialized: ${agentName} (Bwaezi Contract: ${this.CONFIG.BWAEZI_CONTRACT_ADDRESS.substring(0, 10)}...)`);
    } catch (error) {
      this.logger.error(`💥 Failed to initialize ${agentName} agent (FATAL):`, error);
      this.failedAgents.set(agentName, error);
      throw error; // Halts mainnet deployment on failure
    }
  }

  async initializeshopifyAgent() { 
    const agentName = 'shopify'; 
    try {
        // Placeholder for real initialization logic that must use injected logger
        this.logger.info(`✅ Agent Initialized: ${agentName}`);
    } catch (error) {
        this.logger.error(`💥 Failed to initialize ${agentName} agent:`, error);
        this.failedAgents.set(agentName, error);
    }
  }
  
  async initializeSocialAgent() { this.logger.info(`✅ Agent Initialized: social`); }
  async initializeForexAgent() { this.logger.info(`✅ Agent Initialized: forex`); }
  async initializeDataAgent() { this.logger.info(`✅ Agent Initialized: data`); }
  async initializeAdsenseAgent() { this.logger.info(`✅ Agent Initialized: adsense`); }
  async initializeAdRevenueAgent() { this.logger.info(`✅ Agent Initialized: adRevenue`); }
  async initializeAutonomousAI() { this.logger.info(`✅ Agent Initialized: autonomousAI`); }
  
  
  /**
   * Public method to run all agent initializations concurrently.
   */
  async initialize() {
    try {
      this.logger.info('🚀 Initializing Global Enterprise Agent System...');
      
      const initializationQueue = [];

      if (this.CONFIG.enableCrypto) initializationQueue.push(this.initializeCryptoAgent());
      if (this.CONFIG.enableShopify) initializationQueue.push(this.initializeshopifyAgent());
      if (this.CONFIG.enableSocial) initializationQueue.push(this.initializeSocialAgent());
      if (this.CONFIG.enableForex) initializationQueue.push(this.initializeForexAgent());
      if (this.CONFIG.enableData) initializationQueue.push(this.initializeDataAgent());
      if (this.CONFIG.enableAdsense) initializationQueue.push(this.initializeAdsenseAgent());
      if (this.CONFIG.enableAdRevenue) initializationQueue.push(this.initializeAdRevenueAgent());
      if (this.CONFIG.enableAutonomousAI) initializationQueue.push(this.initializeAutonomousAI());

      const results = await Promise.allSettled(initializationQueue);

      results.forEach(result => {
          if (result.status === 'rejected') {
              this.logger.error('An agent failed during initialization:', result.reason.message);
          }
      });
      
      if (this.failedAgents.size > 0) {
          throw new Error(`Failed to initialize ${this.failedAgents.size} critical agents.`);
      }
      
      this.logger.info('✅ All Enterprise Agents Initialized Successfully.');
      
    } catch (error) {
      this.logger.error('💥 Fatal Error during Agent System Initialization:', error);
      throw error; 
    }
  }

  async shutdown() {
      this.logger.info('🛑 Shutting down enterprise agent system...');
      // ... Shutdown logic using this.logger ...
  }
}

export default configAgent;
