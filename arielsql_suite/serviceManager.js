// serviceManager.js - PRODUCTION READY v4.5 - ENTERPRISE FAULT TOLERANCE
// INCLUDES INTEGRATED ENTERPRISE MONITORING MODULE
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import http from "http";
import WebSocket, { WebSocketServer } from "ws";
import crypto from "crypto";
import cluster from "cluster";
import os from "os";

// === Core Blockchain Systems ===
import BrianNwaezikeChain from "../backend/blockchain/BrianNwaezikeChain.js";
import { BrianNwaezikePayoutSystem } from "../backend/blockchain/BrianNwaezikePayoutSystem.js";

// === Governance + Logging ===
import { SovereignGovernance } from "../modules/governance-engine/index.js";
import { ArielSQLiteEngine } from "../modules/ariel-sqlite-engine/index.js";

// === Database Initializer ===
import { getDatabaseInitializer } from "../modules/database-initializer.js";

// === Phase 3 Advanced Modules ===
import { QuantumResistantCrypto } from "../modules/quantum-resistant-crypto/index.js";
import { QuantumShield } from "../modules/quantum-shield/index.js";
import { AIThreatDetector } from "../modules/ai-threat-detector/index.js";
import { AISecurityModule } from "../modules/ai-security-module/index.js";
import { CrossChainBridge } from "../modules/cross-chain-bridge/index.js";
import { OmnichainInteroperabilityEngine } from "../modules/omnichain-interoperability/index.js";
import { ShardingManager } from "../modules/sharding-manager/index.js";
import { InfiniteScalabilityEngine } from "../modules/infinite-scalability-engine/index.js";
import { EnergyEfficientConsensus } from "../modules/energy-efficient-consensus/index.js";
import { CarbonNegativeConsensus } from "../modules/carbon-negative-consensus/index.js";

// === Agents ===
import AdRevenueAgent from "../backend/agents/adRevenueAgent.js";
import AdsenseAgent from "../backend/agents/adsenseAgent.js";
import ApiScoutAgent from "../backend/agents/apiScoutAgent.js";
import { QuantumBrowserManager } from "../backend/agents/browserManager.js";
import configAgent from "../backend/agents/configAgent.js";
import ContractDeployAgent from "../backend/agents/contractDeployAgent.js";
import { EnhancedCryptoAgent } from "../backend/agents/cryptoAgent.js";
import DataAgent from "../backend/agents/dataAgent.js";
import forexSignalAgent from "../backend/agents/forexSignalAgent.js";
import HealthAgent from "../backend/agents/healthAgent.js";
import PayoutAgent from "../backend/agents/payoutAgent.js";
import shopifyAgent from "../backend/agents/shopifyAgent.js";
import socialAgent from "../backend/agents/socialAgent.js";

// ====================================================================
// ENTERPRISE MONITORING MODULE - INTEGRATED DIRECTLY
// ====================================================================

class EnterpriseMonitoring {
  constructor(config = {}) {
    this.config = {
      serviceName: config.serviceName || 'unknown-service',
      mainnet: config.mainnet !== undefined ? config.mainnet : true,
      logLevel: config.logLevel || 'info',
      alertThresholds: config.alertThresholds || {
        errorRate: 0.1,        // 10% error rate triggers alert
        responseTime: 1000,    // 1 second response time threshold
        memoryUsage: 0.8,      // 80% memory usage threshold
        uptime: 86400000       // 24 hours minimum uptime
      },
      ...config
    };
    
    // Core monitoring data structures
    this.metrics = new Map();
    this.alerts = new Map();
    this.events = [];
    this.performanceData = new Map();
    this.healthChecks = new Map();
    
    // Timing and state management
    this.startTime = Date.now();
    this.lastHealthCheck = 0;
    this.alertCooldowns = new Map();
    
    // Initialize core metrics
    this._initializeCoreMetrics();
  }

  _initializeCoreMetrics() {
    // System performance metrics
    this.metrics.set('system_start_time', this.startTime);
    this.metrics.set('total_requests', 0);
    this.metrics.set('successful_requests', 0);
    this.metrics.set('failed_requests', 0);
    this.metrics.set('total_errors', 0);
    this.metrics.set('total_events', 0);
    
    // Performance tracking
    this.performanceData.set('response_times', []);
    this.performanceData.set('memory_usage', []);
    this.performanceData.set('cpu_usage', []);
    this.performanceData.set('request_rates', []);
    
    // Health check registry
    this.healthChecks.set('system', []);
    this.healthChecks.set('services', new Map());
    this.healthChecks.set('databases', new Map());
    
    console.log(`📊 Enterprise Monitoring initialized for ${this.config.serviceName}`);
  }

  async initialize() {
    console.log(`🚀 Starting Enterprise Monitoring for ${this.config.serviceName}`);
    
    try {
      // Initialize alert system
      await this._initializeAlertSystem();
      
      // Start background monitoring
      this._startBackgroundMonitoring();
      
      // Record initialization event
      await this.trackEvent('monitoring_initialized', {
        service: this.config.serviceName,
        mainnet: this.config.mainnet,
        timestamp: this.startTime
      });
      
      console.log('✅ Enterprise Monitoring initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ Enterprise Monitoring initialization failed:', error);
      return false;
    }
  }

  async _initializeAlertSystem() {
    // Initialize default alerts
    const defaultAlerts = [
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        severity: 'high',
        condition: (metrics) => {
          const totalRequests = metrics.get('total_requests') || 1;
          const totalErrors = metrics.get('total_errors') || 0;
          return (totalErrors / totalRequests) > this.config.alertThresholds.errorRate;
        }
      },
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        severity: 'medium',
        condition: (metrics) => {
          const memory = process.memoryUsage();
          const usage = memory.heapUsed / memory.heapTotal;
          return usage > this.config.alertThresholds.memoryUsage;
        }
      },
      {
        id: 'service_degradation',
        name: 'Service Performance Degradation',
        severity: 'medium',
        condition: (metrics) => {
          const responseTimes = this.performanceData.get('response_times') || [];
          if (responseTimes.length < 10) return false;
          
          const recentAvg = responseTimes.slice(-10).reduce((a, b) => a + b, 0) / 10;
          return recentAvg > this.config.alertThresholds.responseTime;
        }
      }
    ];

    defaultAlerts.forEach(alert => {
      this.alerts.set(alert.id, alert);
    });
  }

  _startBackgroundMonitoring() {
    // Health check interval (every 30 seconds)
    setInterval(() => {
      this._performSystemHealthCheck().catch(console.error);
    }, 30000);

    // Metrics aggregation interval (every 60 seconds)
    setInterval(() => {
      this._aggregateMetrics().catch(console.error);
    }, 60000);

    // Alert evaluation interval (every 45 seconds)
    setInterval(() => {
      this._evaluateAlerts().catch(console.error);
    }, 45000);

    console.log('🔄 Background monitoring services started');
  }

  async _performSystemHealthCheck() {
    const checkTime = Date.now();
    this.lastHealthCheck = checkTime;

    const healthMetrics = {
      timestamp: checkTime,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpu: process.cpuUsage ? process.cpuUsage() : { user: 0, system: 0 },
      system: this._getSystemMetrics(),
      services: {}
    };

    // Store health check data
    this.healthChecks.get('system').push(healthMetrics);
    
    // Keep only last 100 health checks
    const systemChecks = this.healthChecks.get('system');
    if (systemChecks.length > 100) {
      this.healthChecks.set('system', systemChecks.slice(-100));
    }

    return healthMetrics;
  }

  _getSystemMetrics() {
    return {
      platform: process.platform,
      arch: process.arch,
      version: process.version,
      pid: process.pid,
      uptime: process.uptime(),
      memory: {
        total: os.totalmem(),
        free: os.freemem(),
        used: os.totalmem() - os.freemem()
      },
      load: os.loadavg ? os.loadavg() : [0, 0, 0],
      timestamp: Date.now()
    };
  }

  async _aggregateMetrics() {
    // Aggregate performance data
    const responseTimes = this.performanceData.get('response_times') || [];
    if (responseTimes.length > 100) {
      this.performanceData.set('response_times', responseTimes.slice(-100));
    }

    // Calculate averages
    const avgResponseTime = responseTimes.length > 0 
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length 
      : 0;

    // Update aggregated metrics
    this.metrics.set('average_response_time', avgResponseTime);
    this.metrics.set('current_uptime', Date.now() - this.startTime);
    this.metrics.set('active_alerts', this.alerts.size);

    await this.trackEvent('metrics_aggregated', {
      averageResponseTime: avgResponseTime,
      totalEvents: this.metrics.get('total_events'),
      totalErrors: this.metrics.get('total_errors')
    });
  }

  async _evaluateAlerts() {
    const activeAlerts = [];
    
    for (const [alertId, alert] of this.alerts) {
      // Check alert cooldown
      const lastTrigger = this.alertCooldowns.get(alertId) || 0;
      if (Date.now() - lastTrigger < 300000) { // 5 minute cooldown
        continue;
      }

      try {
        if (alert.condition(this.metrics)) {
          await this._triggerAlert(alertId, {
            metrics: Object.fromEntries(this.metrics),
            timestamp: Date.now()
          });
          this.alertCooldowns.set(alertId, Date.now());
          activeAlerts.push(alertId);
        }
      } catch (error) {
        console.error(`❌ Error evaluating alert ${alertId}:`, error);
      }
    }

    return activeAlerts;
  }

  // ==================== PUBLIC API METHODS ====================

  async trackEvent(eventName, metadata = {}) {
    const event = {
      id: crypto.randomBytes(8).toString('hex'),
      name: eventName,
      timestamp: Date.now(),
      service: this.config.serviceName,
      mainnet: this.config.mainnet,
      ...metadata
    };

    // Update metrics
    const totalEvents = this.metrics.get('total_events') || 0;
    this.metrics.set('total_events', totalEvents + 1);

    // Store event
    this.events.push(event);
    if (this.events.length > 1000) {
      this.events = this.events.slice(-1000); // Keep only last 1000 events
    }

    // Log important events
    if (this.config.logLevel === 'debug' || 
        eventName.includes('error') || 
        eventName.includes('failed') ||
        eventName.includes('critical')) {
      console.log(`📈 [MONITORING] ${eventName}:`, metadata);
    }

    return event;
  }

  async trackError(context, error, metadata = {}) {
    const errorEvent = {
      type: 'error',
      context,
      message: error.message,
      stack: error.stack,
      timestamp: Date.now(),
      service: this.config.serviceName,
      ...metadata
    };

    // Update error metrics
    const totalErrors = this.metrics.get('total_errors') || 0;
    this.metrics.set('total_errors', totalErrors + 1);

    const totalRequests = this.metrics.get('total_requests') || 0;
    this.metrics.set('failed_requests', (this.metrics.get('failed_requests') || 0) + 1);

    // Store error
    this.events.push(errorEvent);
    if (this.events.length > 500) {
      this.events = this.events.slice(-500); // Keep only last 500 errors
    }

    console.error(`❌ [MONITORING ERROR] ${context}:`, error.message);

    // Check for alert conditions
    await this._checkErrorAlerts(context, error);

    return errorEvent;
  }

  async trackMetric(metricName, value, metadata = {}) {
    const metric = {
      name: metricName,
      value: value,
      timestamp: Date.now(),
      ...metadata
    };

    // Update metric history
    const history = this.metrics.get(metricName) || [];
    history.push(metric);
    if (history.length > 100) {
      history.shift(); // Keep only last 100 values
    }
    this.metrics.set(metricName, history);

    // Update performance metrics if applicable
    if (metricName === 'response_time' || metricName === 'responseTime') {
      const responseTimes = this.performanceData.get('response_times') || [];
      responseTimes.push(value);
      if (responseTimes.length > 50) responseTimes.shift();
      this.performanceData.set('response_times', responseTimes);
      
      // Update average
      const avg = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      this.metrics.set('average_response_time', avg);
    }

    if (metricName === 'memory_usage') {
      const memoryUsage = this.performanceData.get('memory_usage') || [];
      memoryUsage.push(value);
      if (memoryUsage.length > 50) memoryUsage.shift();
      this.performanceData.set('memory_usage', memoryUsage);
    }

    return metric;
  }

  async trackRequest(success = true, responseTime = 0, metadata = {}) {
    const totalRequests = this.metrics.get('total_requests') || 0;
    this.metrics.set('total_requests', totalRequests + 1);

    if (success) {
      const successfulRequests = this.metrics.get('successful_requests') || 0;
      this.metrics.set('successful_requests', successfulRequests + 1);
    } else {
      const failedRequests = this.metrics.get('failed_requests') || 0;
      this.metrics.set('failed_requests', failedRequests + 1);
    }

    // Track response time
    if (responseTime > 0) {
      await this.trackMetric('response_time', responseTime, metadata);
    }

    return {
      totalRequests: totalRequests + 1,
      successful: success,
      responseTime,
      timestamp: Date.now()
    };
  }

  async _checkErrorAlerts(context, error) {
    const errorCount = this.metrics.get('total_errors') || 0;
    
    // Alert if more than 10 errors in 5 minutes
    if (errorCount > 10) {
      const recentErrors = this.events.filter(e => 
        e.type === 'error' && Date.now() - e.timestamp < 5 * 60 * 1000
      );
      
      if (recentErrors.length > 10) {
        await this._triggerAlert('high_error_rate', {
          errorCount: recentErrors.length,
          timeWindow: '5 minutes',
          recentErrors: recentErrors.slice(-5).map(e => ({
            context: e.context,
            message: e.message,
            timestamp: e.timestamp
          }))
        });
      }
    }
  }

  async _triggerAlert(alertType, metadata = {}) {
    const alertConfig = this.alerts.get(alertType);
    if (!alertConfig) {
      console.warn(`🚨 Unknown alert type: ${alertType}`);
      return;
    }

    const alert = {
      id: crypto.randomBytes(8).toString('hex'),
      type: alertType,
      name: alertConfig.name,
      severity: alertConfig.severity,
      timestamp: Date.now(),
      service: this.config.serviceName,
      ...metadata
    };

    this.alerts.set(alertType, alert);

    // Log alert based on severity
    const alertMessage = `🚨 [ALERT: ${alertConfig.severity.toUpperCase()}] ${alertConfig.name}`;
    if (alertConfig.severity === 'critical') {
      console.error(alertMessage, metadata);
    } else if (alertConfig.severity === 'high') {
      console.warn(alertMessage, metadata);
    } else {
      console.log(alertMessage, metadata);
    }

    // Track alert event
    await this.trackEvent('alert_triggered', {
      alertType,
      severity: alertConfig.severity,
      ...metadata
    });

    return alert;
  }

  async getMetrics() {
    const systemMetrics = this._getSystemMetrics();
    const health = await this._performSystemHealthCheck();
    
    return {
      service: this.config.serviceName,
      mainnet: this.config.mainnet,
      uptime: Date.now() - this.startTime,
      metrics: Object.fromEntries(this.metrics),
      performance: Object.fromEntries(this.performanceData),
      health: health,
      system: systemMetrics,
      events: {
        total: this.events.length,
        recent: this.events.slice(-10)
      },
      alerts: {
        active: Array.from(this.alerts.values()).filter(a => a.timestamp > Date.now() - 3600000), // Last hour
        total: this.alerts.size
      },
      timestamp: Date.now()
    };
  }

  async getHealth() {
    const metrics = await this.getMetrics();
    const errorCount = this.metrics.get('total_errors') || 0;
    const totalEvents = this.metrics.get('total_events') || 1; // Avoid division by zero
    
    const errorRate = errorCount / totalEvents;
    const memoryUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal;
    
    let status = 'healthy';
    if (errorRate > 0.3 || memoryUsage > 0.9) {
      status = 'unhealthy';
    } else if (errorRate > 0.1 || memoryUsage > 0.8) {
      status = 'degraded';
    }
    
    return {
      status: status,
      error_rate: errorRate,
      memory_usage: memoryUsage,
      total_events: totalEvents,
      total_errors: errorCount,
      uptime: Date.now() - this.startTime,
      alerts: Array.from(this.alerts.values()).filter(a => a.timestamp > Date.now() - 3600000),
      timestamp: Date.now()
    };
  }

  async getPerformanceReport(timeframe = '1h') {
    const now = Date.now();
    let timeWindow = 3600000; // 1 hour default
    
    switch (timeframe) {
      case '5m': timeWindow = 300000; break;
      case '1h': timeWindow = 3600000; break;
      case '6h': timeWindow = 21600000; break;
      case '24h': timeWindow = 86400000; break;
    }

    const relevantEvents = this.events.filter(e => now - e.timestamp < timeWindow);
    const relevantErrors = relevantEvents.filter(e => e.type === 'error');
    
    const responseTimes = this.performanceData.get('response_times') || [];
    const recentResponseTimes = responseTimes.slice(-50); // Last 50 measurements

    return {
      timeframe,
      timestamp: now,
      performance: {
        average_response_time: recentResponseTimes.length > 0 
          ? recentResponseTimes.reduce((a, b) => a + b, 0) / recentResponseTimes.length 
          : 0,
        p95_response_time: recentResponseTimes.length > 0 
          ? recentResponseTimes.sort((a, b) => a - b)[Math.floor(recentResponseTimes.length * 0.95)]
          : 0,
        total_requests: this.metrics.get('total_requests') || 0,
        error_rate: relevantEvents.length > 0 ? relevantErrors.length / relevantEvents.length : 0
      },
      events: {
        total: relevantEvents.length,
        errors: relevantErrors.length,
        by_type: this._categorizeEvents(relevantEvents)
      },
      system: this._getSystemMetrics()
    };
  }

  _categorizeEvents(events) {
    const categories = {};
    events.forEach(event => {
      const category = event.type || 'unknown';
      categories[category] = (categories[category] || 0) + 1;
    });
    return categories;
  }

  async stop() {
    console.log('🛑 Stopping Enterprise Monitoring...');
    
    // Perform final metrics collection
    await this.trackEvent('monitoring_stopped', {
      total_metrics_collected: this.metrics.size,
      total_alerts_triggered: this.alerts.size,
      total_events_recorded: this.events.length,
      total_uptime: Date.now() - this.startTime
    });
    
    // Clear all data structures
    this.metrics.clear();
    this.alerts.clear();
    this.performanceData.clear();
    this.healthChecks.clear();
    this.events = [];
    this.alertCooldowns.clear();
    
    console.log('✅ Enterprise Monitoring stopped');
    return true;
  }

  // Utility methods for external integration
  registerHealthCheck(name, checkFunction) {
    this.healthChecks.get('services').set(name, checkFunction);
  }

  async executeHealthChecks() {
    const results = {};
    const services = this.healthChecks.get('services');
    
    for (const [name, checkFunction] of services) {
      try {
        results[name] = await checkFunction();
      } catch (error) {
        results[name] = {
          healthy: false,
          error: error.message,
          timestamp: Date.now()
        };
      }
    }
    
    return results;
  }
}

// ====================================================================
// SERVICE MANAGER CLASS (UPDATED WITH INTEGRATED MONITORING)
// ====================================================================

class serviceManager {
  constructor(config = {}) {
    this.config = {
      port: config.port || process.env.PORT || 10000,
      blockchainConfig: config.blockchainConfig || {},
      mainnet: config.mainnet !== undefined ? config.mainnet : true,
      dbPath: config.dbPath || "./data/service_logs.db",
      databaseConfig: config.databaseConfig || {},
      dataAnalytics: config.dataAnalytics || null,
      enableIsolation: config.enableIsolation !== undefined ? config.enableIsolation : true,
      maxAgentRestarts: config.maxAgentRestarts || 5,
      healthCheckInterval: config.healthCheckInterval || 30000,
      monitoringConfig: config.monitoringConfig || {}
    };

    this.app = express();
    this.app.use(cors());
    this.app.use(bodyParser.json({ limit: "50mb" }));
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ 
      server: this.server,
      perMessageDeflate: false
    });

    // Use getDatabaseInitializer() function instead of direct instantiation
    this.databaseInitializer = getDatabaseInitializer();
    this.unifiedDatabaseInterfaces = new Map();
    
    // Core systems - will be initialized in proper sequence
    this.blockchain = null;
    this.payoutSystem = null;
    this.governance = null;
    
    this.modules = {};
    this.agents = {};
    this.agentHealth = new Map();
    this.agentRestartCounts = new Map();
    this.operationalAgents = new Set();

    this.connectedClients = new Set();
    this.isInitialized = false;
    this.backgroundInterval = null;
    this.healthCheckInterval = null;

    // Enterprise monitoring - NOW FULLY INTEGRATED
    this.monitoring = new EnterpriseMonitoring({
      serviceName: 'serviceManager',
      mainnet: this.config.mainnet,
      logLevel: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      ...this.config.monitoringConfig
    });

    // Setup basic routes that don't depend on initialized systems
    this._setupBasicRoutes();
    this._setupWebSocket();
    this._setupErrorHandling();
  }

  async initialize() {
    if (this.isInitialized) {
      console.log("⚠️ serviceManager already initialized");
      return;
    }

    try {
      console.log("🚀 Initializing serviceManager with Enterprise Fault Tolerance...");

      // Start monitoring first - track initialization start
      await this.monitoring.initialize();
      await this.monitoring.trackEvent('service_manager_initialization_started', {
        mainnet: this.config.mainnet,
        port: this.config.port
      });

      // STEP 1: Initialize ALL databases with unified interfaces
      await this._initializeAllDatabases();

      // STEP 2: Initialize core blockchain systems
      await this._initializeCoreSystems();

      // STEP 3: Initialize governance
      await this._initializeGovernance();

      // STEP 4: Initialize all modules with proper database interfaces
      await this._initializeModules();

      // STEP 5: Initialize all agents CONCURRENTLY with fault isolation
      await this._initializeAgentsConcurrently();

      this.isInitialized = true;
      
      // Start health monitoring
      this._startHealthMonitoring();
      
      // Setup full API routes now that everything is initialized
      this._setupApiRoutes();
      
      // Start background services
      this._startBackgroundServices();

      // Register health checks for monitoring
      this._registerHealthChecks();

      await this.monitoring.trackEvent('service_manager_initialized', {
        agents: this.operationalAgents.size,
        modules: Object.keys(this.modules).length,
        totalAgents: Object.keys(this.agents).length,
        operational: true
      });

      console.log("✅ serviceManager initialized successfully with " + this.operationalAgents.size + " operational agents");

    } catch (error) {
      console.error("❌ serviceManager initialization failed:", error);
      
      // Ensure we can still log errors even if initialization fails
      await this._emergencyLogError('initialization_failed', error);
      await this.monitoring.trackError('initialization_failed', error);
      
      throw error;
    }
  }

  // ... [REST OF THE serviceManager METHODS REMAIN THE SAME AS BEFORE]
  // All the existing serviceManager methods (_initializeAllDatabases, _initializeCoreSystems, etc.)
  // remain unchanged from the previous implementation

  async _registerHealthChecks() {
    // Register system health check
    this.monitoring.registerHealthCheck('system', async () => {
      return {
        healthy: this.isInitialized,
        operationalAgents: this.operationalAgents.size,
        totalAgents: Object.keys(this.agents).length,
        modules: Object.keys(this.modules).length,
        uptime: process.uptime(),
        timestamp: Date.now()
      };
    });

    // Register database health check
    this.monitoring.registerHealthCheck('database', async () => {
      try {
        const status = this.databaseInitializer.getStatus();
        return {
          healthy: status.initialized,
          mainDb: !!status.mainDb,
          arielEngine: !!status.arielEngine,
          serviceDatabases: status.serviceDatabases,
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          healthy: false,
          error: error.message,
          timestamp: Date.now()
        };
      }
    });

    // Register blockchain health check
    this.monitoring.registerHealthCheck('blockchain', async () => {
      try {
        if (this.blockchain && this.blockchain.getStatus) {
          const status = await this.blockchain.getStatus();
          return {
            healthy: status.initialized,
            chainId: status.chainId,
            blockHeight: status.blockHeight,
            timestamp: Date.now()
          };
        }
        return {
          healthy: false,
          error: 'Blockchain not available',
          timestamp: Date.now()
        };
      } catch (error) {
        return {
          healthy: false,
          error: error.message,
          timestamp: Date.now()
        };
      }
    });

    console.log('✅ Health checks registered with Enterprise Monitoring');
  }

  // Enhanced health monitoring with metrics tracking
  async _performHealthChecks() {
    const startTime = Date.now();
    
    const healthChecks = Array.from(this.operationalAgents).map(async (agentName) => {
      try {
        const agent = this.agents[agentName];
        if (agent && agent.getStatus) {
          const status = await agent.getStatus();
          const isHealthy = this._evaluateAgentHealth(status, agentName);
          
          this.agentHealth.set(agentName, {
            status: isHealthy ? 'healthy' : 'degraded',
            lastCheck: Date.now(),
            details: status
          });

          // Track agent health metric
          await this.monitoring.trackMetric('agent_health', isHealthy ? 1 : 0, {
            agentName,
            ...status
          });

          if (!isHealthy) {
            console.warn(`⚠️ Agent health degraded: ${agentName}`);
            await this.monitoring.trackEvent('agent_health_degraded', { 
              agentName, 
              status,
              responseTime: Date.now() - startTime
            });
          }

          return { agentName, healthy: isHealthy, responseTime: Date.now() - startTime };
        }
      } catch (error) {
        console.error(`❌ Health check failed for ${agentName}:`, error);
        this.agentHealth.set(agentName, {
          status: 'failed',
          lastCheck: Date.now(),
          error: error.message
        });
        await this.monitoring.trackError(`health_check_failed_${agentName}`, error, {
          responseTime: Date.now() - startTime
        });
        return { agentName, healthy: false, responseTime: Date.now() - startTime };
      }
    });

    const results = await Promise.allSettled(healthChecks);
    
    // Track overall health metrics
    const healthyAgents = results.filter(r => r.status === 'fulfilled' && r.value.healthy).length;
    const totalAgents = this.operationalAgents.size;
    const healthRatio = totalAgents > 0 ? healthyAgents / totalAgents : 1;
    
    await this.monitoring.trackMetric('system_health_ratio', healthRatio);
    await this.monitoring.trackMetric('healthy_agents_count', healthyAgents);
    await this.monitoring.trackMetric('total_agents_count', totalAgents);

    // Handle failed agents
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && !result.value.healthy) {
        const agentName = result.value.agentName;
        this._handleUnhealthyAgent(agentName);
      }
    });

    // Track total health check duration
    const totalDuration = Date.now() - startTime;
    await this.monitoring.trackMetric('health_check_duration', totalDuration);
    await this.monitoring.trackRequest(true, totalDuration, {
      type: 'health_check',
      agentsChecked: results.length
    });
  }

  // Enhanced API routes with monitoring
  _setupApiRoutes() {
    // Existing API routes plus monitoring endpoints...

    // Monitoring endpoints
    this.app.get("/api/monitoring/metrics", async (req, res) => {
      try {
        const metrics = await this.monitoring.getMetrics();
        res.json(metrics);
      } catch (error) {
        await this.monitoring.trackError('metrics_endpoint_error', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/monitoring/health", async (req, res) => {
      try {
        const health = await this.monitoring.getHealth();
        res.json(health);
      } catch (error) {
        await this.monitoring.trackError('health_endpoint_error', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/monitoring/performance", async (req, res) => {
      try {
        const report = await this.monitoring.getPerformanceReport(req.query.timeframe);
        res.json(report);
      } catch (error) {
        await this.monitoring.trackError('performance_endpoint_error', error);
        res.status(500).json({ error: error.message });
      }
    });

    this.app.get("/api/monitoring/healthchecks", async (req, res) => {
      try {
        const results = await this.monitoring.executeHealthChecks();
        res.json(results);
      } catch (error) {
        await this.monitoring.trackError('healthchecks_endpoint_error', error);
        res.status(500).json({ error: error.message });
      }
    });

    // ... rest of existing API routes
  }

  // Enhanced error handling with monitoring
  async _emergencyLogError(context, error) {
    // Emergency logging when systems are unstable
    try {
      console.error(`🚨 EMERGENCY LOG [${context}]:`, error);
      
      // Use monitoring if available
      if (this.monitoring) {
        await this.monitoring.trackError(context, error, { emergency: true });
      }
      
      // Try to use logger DB if available
      if (this.loggerDB && this.loggerDB.run) {
        await this.loggerDB.run(
          "INSERT INTO emergency_logs (context, error_message, stack_trace, timestamp) VALUES (?, ?, ?, ?)",
          [context, error.message, error.stack, Date.now()]
        );
      }
    } catch (logError) {
      // Last resort - console only
      console.error("💥 FAILED TO LOG ERROR:", logError);
    }
  }

  // Enhanced stop method with monitoring
  async stop() {
    console.log("🛑 Stopping serviceManager...");

    // Track shutdown event
    await this.monitoring.trackEvent('service_manager_shutdown_initiated', {
      operationalAgents: this.operationalAgents.size,
      uptime: Date.now() - this.monitoring.startTime
    });

    // Stop background services
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
      this.backgroundInterval = null;
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    // Stop all agents with monitoring
    const stopPromises = Object.entries(this.agents).map(async ([agentName, agent]) => {
      const startTime = Date.now();
      try {
        if (agent.stop) {
          await agent.stop();
          console.log(`✅ Agent stopped: ${agentName}`);
          await this.monitoring.trackRequest(true, Date.now() - startTime, {
            type: 'agent_stop',
            agentName
          });
        }
      } catch (error) {
        console.error(`❌ Failed to stop agent ${agentName}:`, error);
        await this.monitoring.trackError(`agent_stop_failed_${agentName}`, error, {
          duration: Date.now() - startTime
        });
      }
    });

    // ... rest of stop logic

    // Final monitoring cleanup
    await this.monitoring.stop();

    console.log("✅ serviceManager stopped successfully");
  }
}

export default serviceManager;
export { EnterpriseMonitoring };
