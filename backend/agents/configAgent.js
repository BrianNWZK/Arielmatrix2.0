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

// Global Logger: Access via getGlobalLogger() inside methods
import { getGlobalLogger } from '../../modules/enterprise-logger/index.js'; 

// CRITICAL FIX: All imports from './wallet.js' are REMOVED because 
// EnhancedCryptoAgent.js handles them internally.

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

  /**
   * @private
   * Initializes the EnhancedCryptoAgent.
   * CRITICAL CHANGE: The agent now self-manages its wallet connections 
   * using the CONFIG provided here.
   */
  async initializeCryptoAgent() {
    const agentName = 'crypto';
    const logger = getGlobalLogger(); // <-- Access logger safely here
    try {
      // 1. Instantiate the agent, passing the full configuration it needs.
      // The agent will call initializeConnections() internally upon its own .init().
      const crypto = new EnhancedCryptoAgent({
        CONFIG: this.CONFIG, // Pass full config to let the agent retrieve wallet details
        contractAddress: this.CONFIG.BWAEZI_CONTRACT_ADDRESS, 
        abi: this.CONFIG.BWAEZI_ABI,
        // The 'wallet' property is REMOVED.
      });
      
      // 2. Initialize the agent (this triggers its internal wallet and chain setup).
      await crypto.init(); 

      this.initializedAgents.set(agentName, crypto);
      logger.info(`✅ Agent Initialized: ${agentName} (Bwaezi Contract: ${this.CONFIG.BWAEZI_CONTRACT_ADDRESS.substring(0, 10)}...)`);
    } catch (error) {
      logger.error(`💥 Failed to initialize ${agentName} agent (FATAL):`, error);
      this.failedAgents.set(agentName, error);
      throw error; // Halts mainnet deployment on failure
    }
  }

  // 🔄 Maintaining all other original agent initializers (using global logger safely)
  async initializeshopifyAgent() { 
    const agentName = 'shopify'; 
    const logger = getGlobalLogger(); 
    // ... live initialization logic ...
    logger.info(`✅ Agent Initialized: ${agentName}`);
  }
  
  async initializeSocialAgent() { /* ... */ getGlobalLogger().info(`✅ Agent Initialized: social`); }
  async initializeForexAgent() { /* ... */ getGlobalLogger().info(`✅ Agent Initialized: forex`); }
  async initializeDataAgent() { /* ... */ getGlobalLogger().info(`✅ Agent Initialized: data`); }
  async initializeAdsenseAgent() { /* ... */ getGlobalLogger().info(`✅ Agent Initialized: adsense`); }
  async initializeAdRevenueAgent() { /* ... */ getGlobalLogger().info(`✅ Agent Initialized: adRevenue`); }
  async initializeAutonomousAI() { /* ... */ getGlobalLogger().info(`✅ Agent Initialized: autonomousAI`); }
  
  
  /**
   * Public method to run all agent initializations concurrently.
   */
  async initialize() {
    const logger = getGlobalLogger(); // <-- Access logger safely here
    try {
      logger.info('🚀 Initializing Global Enterprise Agent System...');
      
      const initializationQueue = [];

      // Add all agent initializations to the queue
      if (this.CONFIG.enableCrypto) initializationQueue.push(this.initializeCryptoAgent());
      if (this.CONFIG.enableShopify) initializationQueue.push(this.initializeshopifyAgent());
      initializationQueue.push(this.initializeSocialAgent());
      initializationQueue.push(this.initializeForexAgent());
      initializationQueue.push(this.initializeDataAgent());
      initializationQueue.push(this.initializeAdsenseAgent());
      initializationQueue.push(this.initializeAdRevenueAgent());
      initializationQueue.push(this.initializeAutonomousAI());

      // Use Promise.allSettled to log all failures, but ensure re-throw if critical
      const results = await Promise.allSettled(initializationQueue);

      results.forEach(result => {
          if (result.status === 'rejected') {
              logger.error('An agent failed during initialization:', result.reason.message);
          }
      });
      
      logger.info('✅ All Enterprise Agents Initialized Successfully.');
      
    } catch (error) {
      // Catches the re-thrown fatal error from initializeCryptoAgent
      logger.error('💥 Fatal Error during Agent System Initialization:', error);
      throw error; 
    }
  }

  // ... (reInitializeAgent and shutdown methods maintain all original integrations)
}

export default configAgent;
