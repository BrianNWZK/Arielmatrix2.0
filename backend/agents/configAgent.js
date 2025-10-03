import { EnhancedCryptoAgent } from './cryptoAgent.js';
import { EnhancedShopifyAgent } from './shopifyAgent.js';
import { socialAgent } from './socialAgent.js';
import forexSignalAgent from './forexSignalAgent.js';
import { dataAgent } from './dataAgent.js';
import { AdsenseAgent } from './adsenseAgent.js';
import { AdRevenueAgent } from './adRevenueAgent.js';
import { AutonomousAIEngine } from './autonomous-ai-engine.js';
import { serviceManager } from '../../arielsql_suite/serviceManager.js';

export class configAgent {
  constructor(CONFIG) {
    this.CONFIG = CONFIG;
    this.initializedAgents = new Map();
    this.failedAgents = new Map();
    this.serviceManager = serviceManager;
    this.systemStatus = {
      environment: 'MAINNET',
      system: 'Brian Nwaezike Enterprise Agent Platform',
      version: '2.0.0',
      deploymentId: `deploy-${Date.now()}`
    };
  }

  async initialize() {
    try {
      console.log('🚀 Initializing Global Enterprise Agent System...');
      console.log(`📋 Environment: ${this.systemStatus.environment}`);
      console.log(`🕒 Deployment ID: ${this.systemStatus.deploymentId}`);
      
      const initializationQueue = [];

      if (this.CONFIG.enableCrypto) {
        initializationQueue.push(this.initializeCryptoAgent());
      }

      if (this.CONFIG.enableShopify) {
        initializationQueue.push(this.initializeShopifyAgent());
      }

      if (this.CONFIG.enableSocial) {
        initializationQueue.push(this.initializeSocialAgent());
      }

      if (this.CONFIG.enableForex) {
        initializationQueue.push(this.initializeForexAgent());
      }

      if (this.CONFIG.enableData) {
        initializationQueue.push(this.initializeDataAgent());
      }

      if (this.CONFIG.enableAdsense) {
        initializationQueue.push(this.initializeAdsenseAgent());
      }

      if (this.CONFIG.enableAdRevenue) {
        initializationQueue.push(this.initializeAdRevenueAgent());
      }

      if (this.CONFIG.enableAutonomousAI) {
        initializationQueue.push(this.initializeAutonomousAI());
      }

      // Execute all initializations with individual error handling
      const results = await Promise.allSettled(initializationQueue);
      
      await this.verifySystemHealth();
      
      const successfulAgents = this.initializedAgents.size;
      const failedAgents = this.failedAgents.size;
      
      console.log(`✅ Enterprise Agent System Initialization Complete`);
      console.log(`📊 Successfully initialized: ${successfulAgents} agents`);
      if (failedAgents > 0) {
        console.log(`⚠️  Partially initialized: ${failedAgents} agents failed`);
        console.log(`🔧 Failed agents: ${Array.from(this.failedAgents.keys()).join(', ')}`);
      } else {
        console.log(`🎉 All agents initialized successfully`);
      }
      
      return this.getAgentResults();
    } catch (error) {
      console.error('🔴 ConfigAgent Critical System Error:', error);
      throw this.enhanceError(error);
    }
  }

  async initializeCryptoAgent() {
    try {
      const cryptoAgent = new EnhancedCryptoAgent(this.CONFIG.crypto);
      await cryptoAgent.initialize();
      this.serviceManager.register('cryptoAgent', cryptoAgent);
      this.initializedAgents.set('crypto', cryptoAgent);
      console.log('✅ EnhancedCryptoAgent initialized for global trading');
      return { agent: 'crypto', status: 'success' };
    } catch (error) {
      console.error('🔴 EnhancedCryptoAgent initialization failed:', error.message);
      this.failedAgents.set('crypto', error);
      return { agent: 'crypto', status: 'failed', error: error.message };
    }
  }

  async initializeShopifyAgent() {
    try {
      const shopifyAgent = new EnhancedShopifyAgent(this.CONFIG.shopify);
      await shopifyAgent.initialize();
      this.serviceManager.register('shopifyAgent', shopifyAgent);
      this.initializedAgents.set('shopify', shopifyAgent);
      console.log('✅ EnhancedShopifyAgent initialized for e-commerce operations');
      return { agent: 'shopify', status: 'success' };
    } catch (error) {
      console.error('🔴 EnhancedShopifyAgent initialization failed:', error.message);
      this.failedAgents.set('shopify', error);
      return { agent: 'shopify', status: 'failed', error: error.message };
    }
  }

  async initializeSocialAgent() {
    try {
      const socialAgentInstance = new socialAgent(this.CONFIG.social);
      await socialAgentInstance.initialize();
      this.serviceManager.register('socialAgent', socialAgentInstance);
      this.initializedAgents.set('social', socialAgentInstance);
      console.log('✅ SocialAgent initialized for global revenue generation');
      return { agent: 'social', status: 'success' };
    } catch (error) {
      console.error('🔴 SocialAgent initialization failed:', error.message);
      this.failedAgents.set('social', error);
      return { agent: 'social', status: 'failed', error: error.message };
    }
  }

  async initializeForexAgent() {
    try {
      const forexAgentInstance = new forexSignalAgent(this.CONFIG.forex);
      await forexAgentInstance.initialize();
      this.serviceManager.register('forexSignalAgent', forexAgentInstance);
      this.initializedAgents.set('forex', forexAgentInstance);
      console.log('✅ ForexSignalAgent initialized for global trading signals');
      return { agent: 'forex', status: 'success' };
    } catch (error) {
      console.error('🔴 ForexSignalAgent initialization failed:', error.message);
      this.failedAgents.set('forex', error);
      return { agent: 'forex', status: 'failed', error: error.message };
    }
  }

  async initializeDataAgent() {
    try {
      const dataAgentInstance = new dataAgent(this.CONFIG.data);
      await dataAgentInstance.initialize();
      this.serviceManager.register('dataAgent', dataAgentInstance);
      this.initializedAgents.set('data', dataAgentInstance);
      console.log('✅ DataAgent initialized for zero-cost data access');
      return { agent: 'data', status: 'success' };
    } catch (error) {
      console.error('🔴 DataAgent initialization failed:', error.message);
      this.failedAgents.set('data', error);
      return { agent: 'data', status: 'failed', error: error.message };
    }
  }

  async initializeAdsenseAgent() {
    try {
      const adsenseAgentInstance = new AdsenseAgent(this.CONFIG.adsense);
      await adsenseAgentInstance.initialize();
      this.serviceManager.register('adsenseAgent', adsenseAgentInstance);
      this.initializedAgents.set('adsense', adsenseAgentInstance);
      console.log('✅ AdsenseAgent initialized for ad revenue optimization');
      return { agent: 'adsense', status: 'success' };
    } catch (error) {
      console.error('🔴 AdsenseAgent initialization failed:', error.message);
      this.failedAgents.set('adsense', error);
      return { agent: 'adsense', status: 'failed', error: error.message };
    }
  }

  async initializeAdRevenueAgent() {
    try {
      const adRevenueAgentInstance = new AdRevenueAgent(this.CONFIG.adRevenue);
      await adRevenueAgentInstance.initialize();
      this.serviceManager.register('adRevenueAgent', adRevenueAgentInstance);
      this.initializedAgents.set('adRevenue', adRevenueAgentInstance);
      console.log('✅ AdRevenueAgent initialized for revenue tracking');
      return { agent: 'adRevenue', status: 'success' };
    } catch (error) {
      console.error('🔴 AdRevenueAgent initialization failed:', error.message);
      this.failedAgents.set('adRevenue', error);
      return { agent: 'adRevenue', status: 'failed', error: error.message };
    }
  }

  async initializeAutonomousAI() {
    try {
      const autonomousAIInstance = new AutonomousAIEngine(this.CONFIG.autonomousAI);
      await autonomousAIInstance.initialize();
      this.serviceManager.register('autonomousAIEngine', autonomousAIInstance);
      this.initializedAgents.set('autonomousAI', autonomousAIInstance);
      console.log('🧠 AutonomousAIEngine initialized for global AI operations');
      return { agent: 'autonomousAI', status: 'success' };
    } catch (error) {
      console.error('🔴 AutonomousAIEngine initialization failed:', error.message);
      this.failedAgents.set('autonomousAI', error);
      return { agent: 'autonomousAI', status: 'failed', error: error.message };
    }
  }

  async verifySystemHealth() {
    const healthChecks = [];
    const criticalAgents = ['crypto', 'shopify', 'autonomousAI']; // Define critical agents
    
    for (const [agentName, agent] of this.initializedAgents) {
      try {
        if (typeof agent.healthCheck === 'function') {
          const health = await agent.healthCheck();
          healthChecks.push({ 
            agent: agentName, 
            status: health,
            critical: criticalAgents.includes(agentName)
          });
        } else {
          healthChecks.push({ 
            agent: agentName, 
            status: { healthy: true, message: 'No health check method' },
            critical: criticalAgents.includes(agentName)
          });
        }
      } catch (error) {
        healthChecks.push({ 
          agent: agentName, 
          status: { healthy: false, message: error.message },
          critical: criticalAgents.includes(agentName)
        });
      }
    }

    const failedCriticalChecks = healthChecks.filter(
      check => check.critical && !check.status.healthy
    );
    
    const failedNonCriticalChecks = healthChecks.filter(
      check => !check.critical && !check.status.healthy
    );

    if (failedCriticalChecks.length > 0) {
      const criticalAgentNames = failedCriticalChecks.map(f => f.agent).join(', ');
      throw new Error(`Critical system health check failed for: ${criticalAgentNames}`);
    }

    if (failedNonCriticalChecks.length > 0) {
      console.warn(`⚠️  Non-critical health check failures: ${failedNonCriticalChecks.map(f => f.agent).join(', ')}`);
    }

    const healthyCount = healthChecks.filter(check => check.status.healthy).length;
    console.log(`📊 System Health: ${healthyCount}/${healthChecks.length} agents operational`);
    
    return healthChecks;
  }

  getAgentResults() {
    const results = {
      system: this.getSystemStatus(),
      agents: {}
    };
    
    for (const [key, agent] of this.initializedAgents) {
      results.agents[key] = agent.getStatus ? agent.getStatus() : { 
        initialized: true, 
        timestamp: new Date().toISOString(),
        status: 'operational'
      };
    }
    
    if (this.failedAgents.size > 0) {
      results.failedAgents = {};
      for (const [key, error] of this.failedAgents) {
        results.failedAgents[key] = {
          initialized: false,
          error: error.message,
          timestamp: new Date().toISOString()
        };
      }
    }
    
    return results;
  }

  enhanceError(error) {
    const enhancedError = new Error(`ConfigAgent System Error: ${error.message}`);
    enhancedError.originalError = error;
    enhancedError.timestamp = new Date().toISOString();
    enhancedError.systemStatus = this.getSystemStatus();
    enhancedError.failedAgents = Array.from(this.failedAgents.keys());
    enhancedError.stack = error.stack;
    return enhancedError;
  }

  getSystemStatus() {
    return {
      totalAgents: this.initializedAgents.size + this.failedAgents.size,
      successfulAgents: this.initializedAgents.size,
      failedAgents: this.failedAgents.size,
      activeAgents: Array.from(this.initializedAgents.keys()),
      failedAgentNames: Array.from(this.failedAgents.keys()),
      timestamp: new Date().toISOString(),
      ...this.systemStatus
    };
  }

  getAgent(agentName) {
    return this.initializedAgents.get(agentName) || null;
  }

  isAgentHealthy(agentName) {
    const agent = this.initializedAgents.get(agentName);
    if (!agent) return false;
    
    if (typeof agent.healthCheck === 'function') {
      return agent.healthCheck().then(health => health.healthy).catch(() => false);
    }
    
    return true;
  }

  async restartAgent(agentName) {
    console.log(`🔄 Attempting to restart agent: ${agentName}`);
    
    const agent = this.initializedAgents.get(agentName);
    if (agent && typeof agent.shutdown === 'function') {
      await agent.shutdown().catch(error => {
        console.warn(`⚠️  Error during ${agentName} shutdown:`, error.message);
      });
    }
    
    this.initializedAgents.delete(agentName);
    this.failedAgents.delete(agentName);
    
    switch (agentName) {
      case 'crypto':
        return this.initializeCryptoAgent();
      case 'shopify':
        return this.initializeShopifyAgent();
      case 'social':
        return this.initializeSocialAgent();
      case 'forex':
        return this.initializeForexAgent();
      case 'data':
        return this.initializeDataAgent();
      case 'adsense':
        return this.initializeAdsenseAgent();
      case 'adRevenue':
        return this.initializeAdRevenueAgent();
      case 'autonomousAI':
        return this.initializeAutonomousAI();
      default:
        throw new Error(`Unknown agent: ${agentName}`);
    }
  }

  async shutdown() {
    console.log('🛑 Shutting down enterprise agent system...');
    
    const shutdownPromises = [];
    for (const [agentName, agent] of this.initializedAgents) {
      if (typeof agent.shutdown === 'function') {
        shutdownPromises.push(
          agent.shutdown().catch(error => {
            console.error(`Error shutting down ${agentName}:`, error.message);
          })
        );
      }
    }

    await Promise.allSettled(shutdownPromises);
    this.initializedAgents.clear();
    this.failedAgents.clear();
    console.log('✅ Enterprise agent system shutdown complete');
  }
}

export default configAgent;
