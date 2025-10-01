import { EnhancedCryptoAgent } from './cryptoAgent.js';
import { EnhancedShopifyAgent } from './shopifyAgent.js';
import { SocialAgent } from './socialAgent.js';
import { ForexSignalAgent } from './forexSignalAgent.js';
import { dataAgent } from './dataAgent.js';
import { AdsenseAgent } from './adsenseAgent.js';
import { AdRevenueAgent } from './adRevenueAgent.js';
import { AutonomousAIEngine } from './autonomous-ai-engine.js';
import { serviceManager } from '../../arielsql_suite/serviceManager.js';

export class ConfigAgent {
  constructor(CONFIG) {
    this.CONFIG = CONFIG;
    this.initializedAgents = new Map();
    this.serviceManager = serviceManager;
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Global Enterprise Agent System...');
      
      if (this.CONFIG.enableCrypto) {
        await this.initializeCryptoAgent();
      }

      if (this.CONFIG.enableShopify) {
        await this.initializeShopifyAgent();
      }

      if (this.CONFIG.enableSocial) {
        await this.initializeSocialAgent();
      }

      if (this.CONFIG.enableForex) {
        await this.initializeForexAgent();
      }

      if (this.CONFIG.enableData) {
        await this.initializedataAgent();
      }

      if (this.CONFIG.enableAdsense) {
        await this.initializeAdsenseAgent();
      }

      if (this.CONFIG.enableAdRevenue) {
        await this.initializeAdRevenueAgent();
      }

      if (this.CONFIG.enableAutonomousAI) {
        await this.initializeAutonomousAI();
      }

      await this.verifySystemHealth();
      console.log('✅ All enterprise agents initialized successfully');
      
      return this.getAgentResults();
    } catch (error) {
      console.error('🔴 ConfigAgent Initialization Error:', error);
      throw this.enhanceError(error);
    }
  }

  async initializeCryptoAgent() {
    const cryptoAgent = new EnhancedCryptoAgent(this.CONFIG.crypto);
    await cryptoAgent.initialize();
    this.serviceManager.register('cryptoAgent', cryptoAgent);
    this.initializedAgents.set('crypto', cryptoAgent);
    console.log('✅ EnhancedCryptoAgent initialized for global trading');
  }

  async initializeShopifyAgent() {
    const shopifyAgent = new EnhancedShopifyAgent(this.CONFIG.shopify);
    await shopifyAgent.initialize();
    this.serviceManager.register('shopifyAgent', shopifyAgent);
    this.initializedAgents.set('shopify', shopifyAgent);
    console.log('✅ EnhancedShopifyAgent initialized for e-commerce operations');
  }

  async initializeSocialAgent() {
    const socialAgent = new SocialAgent(this.CONFIG.social);
    await socialAgent.initialize();
    this.serviceManager.register('socialAgent', socialAgent);
    this.initializedAgents.set('social', socialAgent);
    console.log('✅ SocialAgent initialized for global revenue generation');
  }

  async initializeForexAgent() {
    const forexAgent = new ForexSignalAgent(this.CONFIG.forex);
    await forexAgent.initialize();
    this.serviceManager.register('forexSignalAgent', forexAgent);
    this.initializedAgents.set('forex', forexAgent);
    console.log('✅ ForexSignalAgent initialized for global trading signals');
  }

  async initializeDataAgent() {
    const dataAgent = new dataAgent(this.CONFIG.data);
    await dataAgent.initialize();
    this.serviceManager.register('dataAgent', dataAgent);
    this.initializedAgents.set('data', dataAgent);
    console.log('✅ DataAgent initialized for zero-cost data access');
  }

  async initializeAdsenseAgent() {
    const adsenseAgent = new AdsenseAgent(this.CONFIG.adsense);
    await adsenseAgent.initialize();
    this.serviceManager.register('adsenseAgent', adsenseAgent);
    this.initializedAgents.set('adsense', adsenseAgent);
    console.log('✅ AdsenseAgent initialized for ad revenue optimization');
  }

  async initializeAdRevenueAgent() {
    const adRevenueAgent = new AdRevenueAgent(this.CONFIG.adRevenue);
    await adRevenueAgent.initialize();
    this.serviceManager.register('adRevenueAgent', adRevenueAgent);
    this.initializedAgents.set('adRevenue', adRevenueAgent);
    console.log('✅ AdRevenueAgent initialized for revenue tracking');
  }

  async initializeAutonomousAI() {
    const autonomousAI = new AutonomousAIEngine(this.CONFIG.autonomousAI);
    await autonomousAI.initialize();
    this.serviceManager.register('autonomousAIEngine', autonomousAI);
    this.initializedAgents.set('autonomousAI', autonomousAI);
    console.log('🧠 AutonomousAIEngine initialized for global AI operations');
  }

  async verifySystemHealth() {
    const healthChecks = [];
    
    for (const [agentName, agent] of this.initializedAgents) {
      if (typeof agent.healthCheck === 'function') {
        const health = await agent.healthCheck();
        healthChecks.push({ agent: agentName, status: health });
      }
    }

    const failedChecks = healthChecks.filter(check => !check.status.healthy);
    if (failedChecks.length > 0) {
      throw new Error(`System health check failed for: ${failedChecks.map(f => f.agent).join(', ')}`);
    }

    console.log('📊 System Health: All agents operational');
    return healthChecks;
  }

  getAgentResults() {
    const results = {};
    for (const [key, agent] of this.initializedAgents) {
      results[key] = agent.getStatus ? agent.getStatus() : { initialized: true, timestamp: new Date().toISOString() };
    }
    return results;
  }

  enhanceError(error) {
    const enhancedError = new Error(`ConfigAgent System Error: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.timestamp = new Date().toISOString();
    enhancedError.systemStatus = this.getSystemStatus();
    return enhancedError;
  }

  getSystemStatus() {
    return {
      totalAgents: this.initializedAgents.size,
      activeAgents: Array.from(this.initializedAgents.keys()),
      timestamp: new Date().toISOString(),
      environment: 'MAINNET',
      system: 'Brian Nwaezike Enterprise Agent Platform'
    };
  }

  async shutdown() {
    console.log('🛑 Shutting down enterprise agent system...');
    
    const shutdownPromises = [];
    for (const [agentName, agent] of this.initializedAgents) {
      if (typeof agent.shutdown === 'function') {
        shutdownPromises.push(
          agent.shutdown().catch(error => {
            console.error(`Error shutting down ${agentName}:`, error);
          })
        );
      }
    }

    await Promise.allSettled(shutdownPromises);
    this.initializedAgents.clear();
    console.log('✅ Enterprise agent system shutdown complete');
  }
}

export const configAgent = async (CONFIG) => {
  const agentSystem = new ConfigAgent(CONFIG);
  return await agentSystem.initialize();
};

export default configAgent;
