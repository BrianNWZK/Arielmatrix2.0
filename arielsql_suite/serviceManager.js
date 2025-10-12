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

class ServiceManager {
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
      serviceName: 'ServiceManager',
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
      console.log("⚠️ ServiceManager already initialized");
      return;
    }

    try {
      console.log("🚀 Initializing ServiceManager with Enterprise Fault Tolerance...");

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

      console.log("✅ ServiceManager initialized successfully with " + this.operationalAgents.size + " operational agents");

    } catch (error) {
      console.error("❌ ServiceManager initialization failed:", error);
      
      // Ensure we can still log errors even if initialization fails
      await this._emergencyLogError('initialization_failed', error);
      await this.monitoring.trackError('initialization_failed', error);
      
      throw error;
    }
  }

  async _initializeAllDatabases() {
    console.log("🗄️ Initializing all databases...");
    
    try {
      const initResult = await this.databaseInitializer.initializeAllDatabases();
      
      if (initResult && initResult.success) {
        console.log("✅ All databases initialized successfully");
        
        // Store unified database interfaces
        this.unifiedDatabaseInterfaces.set('main', this.databaseInitializer.getMainDatabase());
        this.unifiedDatabaseInterfaces.set('arielEngine', this.databaseInitializer.getArielEngine());
        
        // Store service-specific databases
        const serviceDbs = this.databaseInitializer.getServiceDatabases();
        for (const [serviceName, db] of Object.entries(serviceDbs)) {
          this.unifiedDatabaseInterfaces.set(serviceName, db);
        }
        
        await this.monitoring.trackEvent('databases_initialized', {
          totalDatabases: this.unifiedDatabaseInterfaces.size,
          services: Array.from(this.unifiedDatabaseInterfaces.keys())
        });
      } else {
        throw new Error('Database initialization returned invalid result');
      }
    } catch (error) {
      console.error("❌ Database initialization failed:", error);
      await this.monitoring.trackError('database_initialization_failed', error);
      throw error;
    }
  }

  async _initializeCoreSystems() {
    console.log("🔗 Initializing core blockchain systems...");
    
    try {
      // Initialize blockchain with production credentials
      this.blockchain = await this._initializeBlockchain();
      
      // Initialize payout system
      this.payoutSystem = new BrianNwaezikePayoutSystem({
        blockchain: this.blockchain,
        database: this.unifiedDatabaseInterfaces.get('main')
      });
      await this.payoutSystem.initialize();
      
      await this.monitoring.trackEvent('core_systems_initialized', {
        blockchain: !!this.blockchain,
        payoutSystem: !!this.payoutSystem
      });
      
      console.log("✅ Core systems initialized successfully");
    } catch (error) {
      console.error("❌ Core systems initialization failed:", error);
      await this.monitoring.trackError('core_systems_initialization_failed', error);
      throw error;
    }
  }

  async _initializeBlockchain() {
    console.log("⛓️ Initializing blockchain with production credentials...");
    
    try {
      const blockchain = await import('../backend/blockchain/BrianNwaezikeChain.js');
      const chainInstance = await blockchain.createBrianNwaezikeChain({
        rpcUrl: "https://rpc.winr.games",
        network: 'mainnet',
        chainId: 777777,
        contractAddress: "0x00000000000000000000000000000000000a4b05"
      });
      
      await chainInstance.init();
      console.log("✅ Blockchain initialized with production credentials");
      return chainInstance;
    } catch (error) {
      console.error("❌ Blockchain initialization failed:", error);
      throw error;
    }
  }

  async _initializeGovernance() {
    console.log("🏛️ Initializing governance system...");
    
    try {
      this.governance = new SovereignGovernance({
        database: this.unifiedDatabaseInterfaces.get('main'),
        blockchain: this.blockchain
      });
      
      await this.governance.initialize();
      await this.monitoring.trackEvent('governance_initialized', {
        module: 'SovereignGovernance'
      });
      
      console.log("✅ Governance system initialized successfully");
    } catch (error) {
      console.error("❌ Governance initialization failed:", error);
      await this.monitoring.trackError('governance_initialization_failed', error);
      // Don't throw error - governance is not critical for basic operation
    }
  }

  async _initializeModules() {
    console.log("🔧 Initializing advanced modules...");
    
    const moduleConfigs = {
      QuantumResistantCrypto: { database: this.unifiedDatabaseInterfaces.get('main') },
      QuantumShield: { database: this.unifiedDatabaseInterfaces.get('main') },
      AIThreatDetector: { database: this.unifiedDatabaseInterfaces.get('main') },
      AISecurityModule: { database: this.unifiedDatabaseInterfaces.get('main') },
      CrossChainBridge: { 
        database: this.unifiedDatabaseInterfaces.get('main'),
        blockchain: this.blockchain
      },
      OmnichainInteroperabilityEngine: { 
        database: this.unifiedDatabaseInterfaces.get('main'),
        blockchain: this.blockchain
      },
      ShardingManager: { database: this.unifiedDatabaseInterfaces.get('main') },
      InfiniteScalabilityEngine: { database: this.unifiedDatabaseInterfaces.get('main') },
      EnergyEfficientConsensus: { 
        database: this.unifiedDatabaseInterfaces.get('main'),
        blockchain: this.blockchain
      },
      CarbonNegativeConsensus: { 
        database: this.unifiedDatabaseInterfaces.get('main'),
        blockchain: this.blockchain
      }
    };

    for (const [moduleName, ModuleClass] of Object.entries({
      QuantumResistantCrypto,
      QuantumShield,
      AIThreatDetector,
      AISecurityModule,
      CrossChainBridge,
      OmnichainInteroperabilityEngine,
      ShardingManager,
      InfiniteScalabilityEngine,
      EnergyEfficientConsensus,
      CarbonNegativeConsensus
    })) {
      try {
        const config = moduleConfigs[moduleName] || {};
        this.modules[moduleName] = new ModuleClass(config);
        
        if (this.modules[moduleName].initialize) {
          await this.modules[moduleName].initialize();
        }
        
        console.log(`✅ ${moduleName} initialized`);
      } catch (error) {
        console.error(`❌ ${moduleName} initialization failed:`, error);
        await this.monitoring.trackError(`module_initialization_failed_${moduleName}`, error);
        // Continue with other modules even if one fails
      }
    }
    
    await this.monitoring.trackEvent('modules_initialized', {
      totalModules: Object.keys(this.modules).length,
      moduleNames: Object.keys(this.modules)
    });
  }

  async _initializeAgentsConcurrently() {
    console.log("🤖 Initializing agents concurrently with fault isolation...");
    
    const agentConfigs = {
      AdRevenueAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      AdsenseAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      ApiScoutAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      QuantumBrowserManager: { database: this.unifiedDatabaseInterfaces.get('main') },
      configAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      ContractDeployAgent: { 
        database: this.unifiedDatabaseInterfaces.get('main'),
        blockchain: this.blockchain
      },
      EnhancedCryptoAgent: { 
        database: this.unifiedDatabaseInterfaces.get('main'),
        blockchain: this.blockchain
      },
      DataAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      forexSignalAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      HealthAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      PayoutAgent: { 
        database: this.unifiedDatabaseInterfaces.get('main'),
        payoutSystem: this.payoutSystem
      },
      shopifyAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      socialAgent: { database: this.unifiedDatabaseInterfaces.get('main') }
    };

    const agentInitializers = Object.entries({
      AdRevenueAgent,
      AdsenseAgent,
      ApiScoutAgent,
      QuantumBrowserManager,
      configAgent,
      ContractDeployAgent,
      EnhancedCryptoAgent,
      DataAgent,
      forexSignalAgent,
      HealthAgent,
      PayoutAgent,
      shopifyAgent,
      socialAgent
    }).map(async ([agentName, AgentClass]) => {
      return this._initializeAgentWithIsolation(agentName, AgentClass, agentConfigs[agentName] || {});
    });

    const results = await Promise.allSettled(agentInitializers);
    
    // Process results and track operational agents
    results.forEach((result, index) => {
      const agentName = Object.keys({
        AdRevenueAgent,
        AdsenseAgent,
        ApiScoutAgent,
        QuantumBrowserManager,
        configAgent,
        ContractDeployAgent,
        EnhancedCryptoAgent,
        DataAgent,
        forexSignalAgent,
        HealthAgent,
        PayoutAgent,
        shopifyAgent,
        socialAgent
      })[index];
      
      if (result.status === 'fulfilled' && result.value) {
        this.operationalAgents.add(agentName);
        this.agentHealth.set(agentName, { status: 'healthy', lastCheck: Date.now() });
      } else {
        console.error(`❌ Agent ${agentName} failed to initialize`);
        this.agentHealth.set(agentName, { 
          status: 'failed', 
          lastCheck: Date.now(),
          error: result.reason?.message || 'Unknown error'
        });
      }
    });

    await this.monitoring.trackEvent('agents_initialization_completed', {
      totalAgents: Object.keys(agentConfigs).length,
      operationalAgents: this.operationalAgents.size,
      failedAgents: Object.keys(agentConfigs).length - this.operationalAgents.size
    });

    console.log(`✅ ${this.operationalAgents.size}/${Object.keys(agentConfigs).length} agents initialized successfully`);
  }

  async _initializeAgentWithIsolation(agentName, AgentClass, config) {
    if (!this.config.enableIsolation) {
      // Direct initialization without isolation
      const agent = new AgentClass(config);
      if (agent.initialize) {
        await agent.initialize();
      }
      this.agents[agentName] = agent;
      return agent;
    }

    // Initialize with fault isolation
    try {
      const agent = new AgentClass(config);
      
      if (agent.initialize) {
        await agent.initialize();
      }
      
      this.agents[agentName] = agent;
      this.agentRestartCounts.set(agentName, 0);
      
      await this.monitoring.trackEvent('agent_initialized', {
        agentName,
        hasInitialize: !!agent.initialize,
        isolated: true
      });
      
      return agent;
    } catch (error) {
      console.error(`❌ Agent ${agentName} initialization failed:`, error);
      await this.monitoring.trackError(`agent_initialization_failed_${agentName}`, error);
      
      // Create a stub agent that can be restarted later
      this.agents[agentName] = this._createStubAgent(agentName, error);
      throw error;
    }
  }

  _createStubAgent(agentName, error) {
    return {
      name: agentName,
      status: 'failed',
      error: error,
      initialize: async () => { throw error; },
      process: async () => ({ error: `Agent ${agentName} is in failed state` }),
      healthCheck: async () => ({ healthy: false, error: error.message })
    };
  }

  _setupBasicRoutes() {
    // Basic health check that works even before full initialization
    this.app.get("/health", async (req, res) => {
      const health = await this.monitoring.getHealth();
      res.json(health);
    });

    // Basic info endpoint
    this.app.get("/", (req, res) => {
      res.json({
        service: "ServiceManager",
        version: "4.5.0",
        mainnet: this.config.mainnet,
        initialized: this.isInitialized,
        timestamp: Date.now()
      });
    });
  }

  _setupApiRoutes() {
    if (!this.isInitialized) {
      console.warn("⚠️ Cannot setup API routes - ServiceManager not initialized");
      return;
    }

    // Agent status endpoint
    this.app.get("/agents/status", (req, res) => {
      const status = {};
      for (const [agentName, agent] of Object.entries(this.agents)) {
        const health = this.agentHealth.get(agentName) || { status: 'unknown' };
        status[agentName] = {
          status: health.status,
          operational: this.operationalAgents.has(agentName),
          lastCheck: health.lastCheck || null
        };
      }
      res.json(status);
    });

    // Module status endpoint
    this.app.get("/modules/status", (req, res) => {
      const status = {};
      for (const [moduleName, module] of Object.entries(this.modules)) {
        status[moduleName] = {
          initialized: !!module,
          hasHealthCheck: typeof module.healthCheck === 'function'
        };
      }
      res.json(status);
    });

    // Blockchain status endpoint
    this.app.get("/blockchain/status", async (req, res) => {
      try {
        const status = await this.blockchain.getStatus();
        res.json(status);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Monitoring metrics endpoint
    this.app.get("/monitoring/metrics", async (req, res) => {
      try {
        const metrics = await this.monitoring.getMetrics();
        res.json(metrics);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Performance report endpoint
    this.app.get("/monitoring/performance", async (req, res) => {
      try {
        const timeframe = req.query.timeframe || '1h';
        const report = await this.monitoring.getPerformanceReport(timeframe);
        res.json(report);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // Agent restart endpoint
    this.app.post("/agents/:agentName/restart", async (req, res) => {
      const agentName = req.params.agentName;
      try {
        await this.restartAgent(agentName);
        res.json({ success: true, message: `Agent ${agentName} restart initiated` });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }

  _setupWebSocket() {
    this.wss.on("connection", (ws, req) => {
      const clientId = crypto.randomBytes(8).toString("hex");
      this.connectedClients.add(ws);

      console.log(`🔗 WebSocket client connected: ${clientId}`);
      this.monitoring.trackEvent('websocket_client_connected', { clientId });

      ws.on("message", async (data) => {
        try {
          const message = JSON.parse(data);
          await this._handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error("❌ WebSocket message handling error:", error);
          this.monitoring.trackError('websocket_message_handling', error);
        }
      });

      ws.on("close", () => {
        this.connectedClients.delete(ws);
        console.log(`🔌 WebSocket client disconnected: ${clientId}`);
        this.monitoring.trackEvent('websocket_client_disconnected', { clientId });
      });

      ws.on("error", (error) => {
        console.error(`❌ WebSocket error for client ${clientId}:`, error);
        this.monitoring.trackError('websocket_error', error, { clientId });
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: "welcome",
        clientId,
        timestamp: Date.now(),
        service: "ServiceManager"
      }));
    });
  }

  async _handleWebSocketMessage(ws, message) {
    const { type, data, requestId } = message;

    try {
      let response;

      switch (type) {
        case "agent_status":
          response = await this._getAgentStatus(data);
          break;
        case "blockchain_status":
          response = await this.blockchain.getStatus();
          break;
        case "system_metrics":
          response = await this.monitoring.getMetrics();
          break;
        case "health_check":
          response = await this.monitoring.getHealth();
          break;
        default:
          response = { error: `Unknown message type: ${type}` };
      }

      ws.send(JSON.stringify({
        type: "response",
        requestId,
        data: response,
        timestamp: Date.now()
      }));

      await this.monitoring.trackRequest(true, 0, { 
        websocketMessageType: type,
        clientId: "unknown" // Would need to track client IDs
      });

    } catch (error) {
      console.error(`❌ WebSocket message processing error:`, error);
      
      ws.send(JSON.stringify({
        type: "error",
        requestId,
        error: error.message,
        timestamp: Date.now()
      }));

      await this.monitoring.trackError('websocket_message_processing', error, {
        messageType: type,
        requestId
      });
    }
  }

  async _getAgentStatus(agentNames) {
    const status = {};
    const names = Array.isArray(agentNames) ? agentNames : Object.keys(this.agents);

    for (const agentName of names) {
      const agent = this.agents[agentName];
      const health = this.agentHealth.get(agentName) || { status: 'unknown' };
      
      status[agentName] = {
        exists: !!agent,
        status: health.status,
        operational: this.operationalAgents.has(agentName),
        restartCount: this.agentRestartCounts.get(agentName) || 0,
        lastCheck: health.lastCheck || null
      };
    }

    return status;
  }

  _setupErrorHandling() {
    this.app.use((error, req, res, next) => {
      console.error("❌ Unhandled error:", error);
      
      this.monitoring.trackError('unhandled_http_error', error, {
        path: req.path,
        method: req.method
      });

      res.status(500).json({
        error: "Internal server error",
        timestamp: Date.now()
      });
    });

    process.on("unhandledRejection", (reason, promise) => {
      console.error("❌ Unhandled promise rejection:", reason);
      this.monitoring.trackError('unhandled_promise_rejection', new Error(reason));
    });

    process.on("uncaughtException", (error) => {
      console.error("❌ Uncaught exception:", error);
      this.monitoring.trackError('uncaught_exception', error);
      
      // In production, we might want to exit here
      if (this.config.mainnet) {
        console.error("🛑 Critical error in mainnet - exiting process");
        process.exit(1);
      }
    });
  }

  _startHealthMonitoring() {
    this.healthCheckInterval = setInterval(async () => {
      await this._performHealthChecks();
    }, this.config.healthCheckInterval);

    console.log("❤️ Health monitoring started");
  }

  async _performHealthChecks() {
    const checkStart = Date.now();
    
    try {
      // Check agent health
      for (const [agentName, agent] of Object.entries(this.agents)) {
        try {
          let healthy = false;
          
          if (agent.healthCheck && typeof agent.healthCheck === 'function') {
            const healthResult = await agent.healthCheck();
            healthy = healthResult.healthy !== false;
          } else {
            // Basic health check - agent exists and is not a stub
            healthy = agent.status !== 'failed' && !agent.error;
          }
          
          this.agentHealth.set(agentName, {
            status: healthy ? 'healthy' : 'unhealthy',
            lastCheck: Date.now()
          });
          
          if (!healthy && this.operationalAgents.has(agentName)) {
            console.warn(`⚠️ Agent ${agentName} is unhealthy`);
            await this.monitoring.trackEvent('agent_unhealthy', { agentName });
          }
          
        } catch (error) {
          console.error(`❌ Health check failed for agent ${agentName}:`, error);
          this.agentHealth.set(agentName, {
            status: 'error',
            lastCheck: Date.now(),
            error: error.message
          });
          
          await this.monitoring.trackError(`agent_health_check_failed_${agentName}`, error);
        }
      }

      // Check module health
      for (const [moduleName, module] of Object.entries(this.modules)) {
        if (module.healthCheck && typeof module.healthCheck === 'function') {
          try {
            await module.healthCheck();
          } catch (error) {
            console.error(`❌ Health check failed for module ${moduleName}:`, error);
            await this.monitoring.trackError(`module_health_check_failed_${moduleName}`, error);
          }
        }
      }

      // Track health check completion
      await this.monitoring.trackMetric('health_check_duration', Date.now() - checkStart);
      await this.monitoring.trackEvent('health_check_completed', {
        agentsChecked: Object.keys(this.agents).length,
        modulesChecked: Object.keys(this.modules).length,
        duration: Date.now() - checkStart
      });

    } catch (error) {
      console.error("❌ Overall health check failed:", error);
      await this.monitoring.trackError('overall_health_check_failed', error);
    }
  }

  _startBackgroundServices() {
    // Background tasks interval
    this.backgroundInterval = setInterval(async () => {
      try {
        await this._performBackgroundTasks();
      } catch (error) {
        console.error("❌ Background tasks error:", error);
        this.monitoring.trackError('background_tasks_error', error);
      }
    }, 60000); // Every minute

    console.log("🔄 Background services started");
  }

  async _performBackgroundTasks() {
    const tasks = [];

    // Clean up old monitoring data
    tasks.push(this._cleanupOldMonitoringData());

    // Check for agent restarts
    tasks.push(this._checkForAgentRestarts());

    // Perform system maintenance
    tasks.push(this._performSystemMaintenance());

    await Promise.allSettled(tasks);
  }

  async _cleanupOldMonitoringData() {
    const now = Date.now();
    const oneDayAgo = now - (24 * 60 * 60 * 1000);
    
    // Clean old events
    this.monitoring.events = this.monitoring.events.filter(event => 
      event.timestamp > oneDayAgo
    );
    
    // Clean old health checks
    const systemChecks = this.monitoring.healthChecks.get('system') || [];
    if (systemChecks.length > 0) {
      this.monitoring.healthChecks.set('system', 
        systemChecks.filter(check => check.timestamp > oneDayAgo)
      );
    }
  }

  async _checkForAgentRestarts() {
    for (const [agentName, health] of this.agentHealth) {
      if (health.status === 'failed' || health.status === 'unhealthy') {
        const restartCount = this.agentRestartCounts.get(agentName) || 0;
        
        if (restartCount < this.config.maxAgentRestarts) {
          console.log(`🔄 Attempting to restart agent: ${agentName}`);
          await this.restartAgent(agentName);
        } else {
          console.error(`🛑 Agent ${agentName} has exceeded maximum restart attempts`);
        }
      }
    }
  }

  async _performSystemMaintenance() {
    // Perform any system-wide maintenance tasks
    try {
      // Example: Clean up temporary files, optimize databases, etc.
      if (this.modules.ArielSQLiteEngine && this.modules.ArielSQLiteEngine.optimize) {
        await this.modules.ArielSQLiteEngine.optimize();
      }
    } catch (error) {
      console.error("❌ System maintenance error:", error);
      await this.monitoring.trackError('system_maintenance_error', error);
    }
  }

  _registerHealthChecks() {
    // Register system health checks with monitoring
    this.monitoring.registerHealthCheck('blockchain', async () => {
      try {
        const status = await this.blockchain.getStatus();
        return {
          healthy: status.connected === true,
          details: status,
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

    this.monitoring.registerHealthCheck('database', async () => {
      try {
        const mainDb = this.unifiedDatabaseInterfaces.get('main');
        if (mainDb && mainDb.healthCheck) {
          return await mainDb.healthCheck();
        }
        return { healthy: true, timestamp: Date.now() };
      } catch (error) {
        return {
          healthy: false,
          error: error.message,
          timestamp: Date.now()
        };
      }
    });
  }

  async restartAgent(agentName) {
    console.log(`🔄 Restarting agent: ${agentName}`);
    
    try {
      const restartCount = this.agentRestartCounts.get(agentName) || 0;
      
      if (restartCount >= this.config.maxAgentRestarts) {
        throw new Error(`Agent ${agentName} has exceeded maximum restart attempts`);
      }

      // Remove current agent
      delete this.agents[agentName];
      this.operationalAgents.delete(agentName);
      this.agentHealth.delete(agentName);

      // Reinitialize agent
      const AgentClass = this._getAgentClassByName(agentName);
      if (!AgentClass) {
        throw new Error(`Unknown agent class: ${agentName}`);
      }

      const config = this._getAgentConfig(agentName);
      const agent = await this._initializeAgentWithIsolation(agentName, AgentClass, config);
      
      this.agentRestartCounts.set(agentName, restartCount + 1);
      this.operationalAgents.add(agentName);

      await this.monitoring.trackEvent('agent_restarted', {
        agentName,
        restartCount: restartCount + 1,
        success: true
      });

      console.log(`✅ Agent ${agentName} restarted successfully`);
      return agent;

    } catch (error) {
      console.error(`❌ Failed to restart agent ${agentName}:`, error);
      
      await this.monitoring.trackError(`agent_restart_failed_${agentName}`, error, {
        restartCount: this.agentRestartCounts.get(agentName) || 0
      });

      throw error;
    }
  }

  _getAgentClassByName(agentName) {
    const agentClasses = {
      AdRevenueAgent,
      AdsenseAgent,
      ApiScoutAgent,
      QuantumBrowserManager,
      configAgent,
      ContractDeployAgent,
      EnhancedCryptoAgent,
      DataAgent,
      forexSignalAgent,
      HealthAgent,
      PayoutAgent,
      shopifyAgent,
      socialAgent
    };

    return agentClasses[agentName];
  }

  _getAgentConfig(agentName) {
    const configs = {
      AdRevenueAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      AdsenseAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      ApiScoutAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      QuantumBrowserManager: { database: this.unifiedDatabaseInterfaces.get('main') },
      configAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      ContractDeployAgent: { 
        database: this.unifiedDatabaseInterfaces.get('main'),
        blockchain: this.blockchain
      },
      EnhancedCryptoAgent: { 
        database: this.unifiedDatabaseInterfaces.get('main'),
        blockchain: this.blockchain
      },
      DataAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      forexSignalAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      HealthAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      PayoutAgent: { 
        database: this.unifiedDatabaseInterfaces.get('main'),
        payoutSystem: this.payoutSystem
      },
      shopifyAgent: { database: this.unifiedDatabaseInterfaces.get('main') },
      socialAgent: { database: this.unifiedDatabaseInterfaces.get('main') }
    };

    return configs[agentName] || {};
  }

  async _emergencyLogError(context, error) {
    // Emergency logging when systems are not fully initialized
    try {
      console.error(`🛑 EMERGENCY ERROR [${context}]:`, error);
      
      // Try to use monitoring if available
      if (this.monitoring) {
        await this.monitoring.trackError(context, error);
      }
      
      // Basic file logging as fallback
      const fs = await import('fs');
      const logEntry = {
        timestamp: new Date().toISOString(),
        context,
        error: error.message,
        stack: error.stack
      };
      
      fs.appendFileSync('./emergency_errors.log', JSON.stringify(logEntry) + '\n');
    } catch (logError) {
      // Last resort - console only
      console.error('🛑 CRITICAL: Cannot log emergency error:', logError);
    }
  }

  async start() {
    if (!this.isInitialized) {
      throw new Error("ServiceManager must be initialized before starting");
    }

    return new Promise((resolve, reject) => {
      this.server.listen(this.config.port, (err) => {
        if (err) {
          console.error("❌ Failed to start server:", err);
          this.monitoring.trackError('server_start_failed', err);
          reject(err);
          return;
        }

        console.log(`🚀 ServiceManager running on port ${this.config.port}`);
        console.log(`📊 Enterprise Monitoring: ACTIVE`);
        console.log(`🌐 Mainnet Mode: ${this.config.mainnet}`);
        console.log(`🤖 Operational Agents: ${this.operationalAgents.size}`);
        
        this.monitoring.trackEvent('server_started', {
          port: this.config.port,
          mainnet: this.config.mainnet,
          operationalAgents: this.operationalAgents.size
        });

        resolve();
      });
    });
  }

  async stop() {
    console.log("🛑 Stopping ServiceManager...");

    // Stop intervals
    if (this.backgroundInterval) {
      clearInterval(this.backgroundInterval);
    }
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Close WebSocket connections
    this.connectedClients.forEach(client => {
      try {
        client.close();
      } catch (error) {
        console.error("Error closing WebSocket client:", error);
      }
    });
    this.connectedClients.clear();

    // Stop server
    if (this.server) {
      this.server.close();
    }

    // Stop monitoring
    if (this.monitoring) {
      await this.monitoring.stop();
    }

    this.isInitialized = false;
    console.log("✅ ServiceManager stopped successfully");
  }

  // Public API methods
  getAgent(agentName) {
    return this.agents[agentName];
  }

  getModule(moduleName) {
    return this.modules[moduleName];
  }

  getBlockchain() {
    return this.blockchain;
  }

  getMonitoring() {
    return this.monitoring;
  }

  async getSystemStatus() {
    const health = await this.monitoring.getHealth();
    const metrics = await this.monitoring.getMetrics();
    
    return {
      initialized: this.isInitialized,
      mainnet: this.config.mainnet,
      health,
      metrics,
      agents: {
        total: Object.keys(this.agents).length,
        operational: this.operationalAgents.size,
        status: Object.fromEntries(this.agentHealth)
      },
      modules: {
        total: Object.keys(this.modules).length,
        names: Object.keys(this.modules)
      },
      timestamp: Date.now()
    };
  }
}

// Export the ServiceManager class
export { ServiceManager, EnterpriseMonitoring };

// Create and export default instance
const serviceManager = new ServiceManager();
export default serviceManager;
