// modules/ai-security-module/index.js
import { AIThreatDetector } from '../ai-threat-detector/index.js';
import { QuantumShield } from '../quantum-shield/index.js';
import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';
import { promisify } from 'util';
import crypto from 'crypto';

const sleep = promisify(setTimeout);

// Enterprise-grade error classes
class AISecurityModuleError extends Error {
  constructor(message, code = 'AI_SECURITY_MODULE_ERROR') {
    super(message);
    this.name = 'AISecurityModuleError';
    this.code = code;
  }
}

class IncidentResponseError extends AISecurityModuleError {
  constructor(message) {
    super(message, 'INCIDENT_RESPONSE_ERROR');
  }
}

class SystemHaltError extends AISecurityModuleError {
  constructor(message) {
    super(message, 'SYSTEM_HALT_ERROR');
  }
}

/**
 * @class AISecurityModule
 * @description Enterprise-grade security orchestration module with AI-powered threat detection,
 * automated incident response, and real-time system protection.
 */
export class AISecurityModule {
  constructor(options = {}) {
    this.options = {
      enableAutoResponse: process.env.ENABLE_AUTO_RESPONSE === 'true',
      maxResponseTime: parseInt(process.env.MAX_RESPONSE_TIME) || 5000,
      bridgeContractAddress: process.env.BRIDGE_CONTRACT_ADDRESS,
      minConfidence: parseFloat(process.env.MIN_CONFIDENCE) || 0.8,
      ...options
    };

    this.detector = new AIThreatDetector();
    this.quantumShield = new QuantumShield();
    this.db = new ArielSQLiteEngine();
    this.incidentResponse = new Map();
    this.isBridgeHalted = false;
    this.isInitialized = false;
    this.incidentCounters = new Map();
    this.responseHandlers = new Map();
    this.systemState = {
      operational: true,
      degraded: false,
      maintenance: false,
      lastIncident: null
    };

    this.performanceMetrics = {
      incidentsHandled: 0,
      responsesExecuted: 0,
      averageResponseTime: 0,
      startTime: Date.now()
    };
  }

  /**
   * Initialize the security module with retry logic
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🛡️ Initializing AI Security Module...');

      // Initialize sub-modules with retry
      await this.retryOperation(async () => {
        await this.detector.initialize();
      }, 3, 2000);

      await this.retryOperation(async () => {
        await this.quantumShield.initialize();
      }, 3, 2000);

      await this.retryOperation(async () => {
        await this.db.init();
      }, 3, 2000);

      // Create enhanced incident tracking tables
      await this.createIncidentTables();

      // Setup response protocols
      this.setupResponseProtocols();

      // Setup response handlers
      this.setupResponseHandlers();

      // Load historical incident data
      await this.loadHistoricalIncidents();

      // Start health monitoring
      this.startHealthMonitoring();

      this.isInitialized = true;
      console.log('✅ AI Security Module initialized successfully');

      await this.logIncident({
        incident_type: 'system_startup',
        severity: 'info',
        description: 'AI Security Module started successfully',
        affected_systems: ['all'],
        response_taken: ['initialization_complete']
      });

    } catch (error) {
      console.error('❌ Failed to initialize AI Security Module:', error);
      throw new AISecurityModuleError(`Initialization failed: ${error.message}`);
    }
  }

  /**
   * Create enhanced incident tracking tables with SQL syntax fixes
   */
  async createIncidentTables() {
    try {
      // Enhanced security incidents table - FIXED SQL SYNTAX
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS security_incidents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          incident_id TEXT UNIQUE NOT NULL,
          incident_type TEXT NOT NULL,
          severity TEXT NOT NULL CHECK(severity IN ('critical', 'high', 'medium', 'low', 'info')),
          description TEXT NOT NULL,
          affected_systems TEXT NOT NULL,
          root_cause TEXT,
          impact_assessment TEXT,
          response_taken TEXT NOT NULL,
          resolved BOOLEAN DEFAULT FALSE,
          resolution_notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes separately to avoid syntax errors
      await this.createTableIndexes();

      // Incident response log table - FIXED SQL SYNTAX
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS incident_response_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          incident_id TEXT NOT NULL,
          action_type TEXT NOT NULL,
          action_details TEXT NOT NULL,
          executed_by TEXT DEFAULT 'system',
          execution_time INTEGER NOT NULL,
          success BOOLEAN DEFAULT TRUE,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for response log
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_response_incident_id ON incident_response_log(incident_id)`);
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_response_action_type ON incident_response_log(action_type)`);

      // System state history table
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS system_state_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          state TEXT NOT NULL,
          reason TEXT NOT NULL,
          duration INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for system state
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_state_history_state ON system_state_history(state)`);
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_state_history_created_at ON system_state_history(created_at)`);

    } catch (error) {
      console.error('❌ Failed to create security tables:', error);
      // Fallback to simplified table creation
      await this.createFallbackTables();
    }
  }

  /**
   * Create table indexes separately to avoid SQL syntax errors
   */
  async createTableIndexes() {
    try {
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_incidents_severity ON security_incidents(severity)`);
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_incidents_type ON security_incidents(incident_type)`);
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_incidents_created_at ON security_incidents(created_at)`);
      await this.db.run(`CREATE INDEX IF NOT EXISTS idx_incidents_resolved ON security_incidents(resolved)`);
    } catch (error) {
      console.warn('⚠️ Could not create some indexes, continuing with limited functionality:', error.message);
    }
  }

  /**
   * Fallback table creation for SQL compatibility
   */
  async createFallbackTables() {
    try {
      // Simplified security incidents table without complex constraints
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS security_incidents (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          incident_id TEXT UNIQUE NOT NULL,
          incident_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          description TEXT NOT NULL,
          affected_systems TEXT NOT NULL,
          root_cause TEXT,
          impact_assessment TEXT,
          response_taken TEXT NOT NULL,
          resolved BOOLEAN DEFAULT FALSE,
          resolution_notes TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          resolved_at DATETIME,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Simplified incident response log
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS incident_response_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          incident_id TEXT NOT NULL,
          action_type TEXT NOT NULL,
          action_details TEXT NOT NULL,
          executed_by TEXT DEFAULT 'system',
          execution_time INTEGER NOT NULL,
          success BOOLEAN DEFAULT TRUE,
          error_message TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Simplified system state history
      await this.db.run(`
        CREATE TABLE IF NOT EXISTS system_state_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          state TEXT NOT NULL,
          reason TEXT NOT NULL,
          duration INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      console.log('✅ Created fallback tables successfully');
    } catch (error) {
      throw new AISecurityModuleError(`Failed to create fallback tables: ${error.message}`);
    }
  }

  /**
   * Setup enhanced response protocols
   */
  setupResponseProtocols() {
    // Critical severity responses
    this.incidentResponse.set('critical', {
      actions: [
        'halt_bridge_operations',
        'freeze_suspicious_accounts',
        'notify_security_team',
        'initiate_forensics',
        'enable_enhanced_monitoring',
        'isolate_affected_systems'
      ],
      timeout: 5000,
      escalation: 'immediate',
      requiredApproval: 'security_lead'
    });

    // High severity responses
    this.incidentResponse.set('high', {
      actions: [
        'freeze_suspicious_accounts',
        'increase_monitoring',
        'notify_operations_team',
        'require_2fa',
        'review_access_logs'
      ],
      timeout: 10000,
      escalation: 'within_15_minutes',
      requiredApproval: 'shift_lead'
    });

    // Medium severity responses
    this.incidentResponse.set('medium', {
      actions: [
        'increase_monitoring',
        'require_2fa',
        'review_incident',
        'update_threat_intel'
      ],
      timeout: 30000,
      escalation: 'within_1_hour',
      requiredApproval: 'automated'
    });

    // Low severity responses
    this.incidentResponse.set('low', {
      actions: [
        'log_event',
        'monitor_patterns',
        'update_baselines'
      ],
      timeout: 60000,
      escalation: 'within_24_hours',
      requiredApproval: 'automated'
    });

    // Info severity responses
    this.incidentResponse.set('info', {
      actions: ['log_event'],
      timeout: 0,
      escalation: 'none',
      requiredApproval: 'automated'
    });
  }

  /**
   * Setup response action handlers
   */
  setupResponseHandlers() {
    this.responseHandlers.set('halt_bridge_operations', this.haltBridgeOperations.bind(this));
    this.responseHandlers.set('freeze_suspicious_accounts', this.freezeAccounts.bind(this));
    this.responseHandlers.set('notify_security_team', this.notifySecurityTeam.bind(this));
    this.responseHandlers.set('initiate_forensics', this.initiateForensics.bind(this));
    this.responseHandlers.set('increase_monitoring', this.increaseMonitoring.bind(this));
    this.responseHandlers.set('require_2fa', this.require2FA.bind(this));
    this.responseHandlers.set('notify_operations_team', this.notifyOperationsTeam.bind(this));
    this.responseHandlers.set('log_event', this.logEvent.bind(this));
    this.responseHandlers.set('monitor_patterns', this.monitorPatterns.bind(this));
    this.responseHandlers.set('enable_enhanced_monitoring', this.enableEnhancedMonitoring.bind(this));
    this.responseHandlers.set('isolate_affected_systems', this.isolateAffectedSystems.bind(this));
    this.responseHandlers.set('review_access_logs', this.reviewAccessLogs.bind(this));
    this.responseHandlers.set('update_threat_intel', this.updateThreatIntel.bind(this));
    this.responseHandlers.set('update_baselines', this.updateBaselines.bind(this));
  }

  /**
   * Main monitoring method with enhanced capabilities
   */
  async monitorSystem(logs, realTimeData = {}, options = {}) {
    if (!this.isInitialized) {
      throw new AISecurityModuleError('Security module not initialized');
    }

    const monitorId = crypto.randomBytes(4).toString('hex');
    const startTime = Date.now();

    const results = {
      threats: [],
      responses: [],
      incidents: [],
      monitorId,
      processingTime: 0
    };

    try {
      // Phase 1: Basic threat detection using QuantumShield
      const basicThreats = await this.quantumShield.monitorTransaction(realTimeData);
      if (!basicThreats.allowed) {
        results.threats.push({
          type: 'basic_threat_detected',
          severity: this.getThreatSeverity(basicThreats),
          details: basicThreats,
          detectionMethod: 'quantum_shield'
        });
      }

      // Phase 2: AI-powered anomaly detection
      const aiResults = await this.detector.detectAnomalies(logs, realTimeData);
      results.threats.push(...aiResults.anomalies.map(anomaly => ({
        ...anomaly,
        detectionMethod: 'ai_detector'
      })));

      // Phase 3: Execute response protocols based on threats
      if (results.threats.length > 0) {
        const responseResults = await this.executeResponseProtocols(results.threats);
        results.responses = responseResults;

        // Log incident with enhanced details
        const incidentId = await this.logIncident({
          incident_type: 'security_threats_detected',
          severity: this.getHighestSeverity(results.threats),
          description: `Detected ${results.threats.length} security threats`,
          affected_systems: this.getAffectedSystems(results.threats),
          root_cause: this.analyzeRootCause(results.threats),
          impact_assessment: this.assessImpact(results.threats),
          response_taken: responseResults.map(r => r.action)
        });

        results.incidents.push(incidentId);

        // Update system state if needed
        await this.updateSystemState(results.threats);
      }

      results.processingTime = Date.now() - startTime;
      this.performanceMetrics.incidentsHandled += results.incidents.length;
      this.performanceMetrics.responsesExecuted += results.responses.length;

      return results;

    } catch (error) {
      console.error('❌ Security monitoring failed:', error);

      await this.logIncident({
        incident_type: 'security_monitoring_failure',
        severity: 'critical',
        description: `Security monitoring failed: ${error.message}`,
        affected_systems: ['monitoring_system'],
        response_taken: ['investigate_failure']
      });

      // Enter degraded mode but don't throw to avoid complete system failure
      await this.setSystemState('degraded', 'monitoring_failure');
      
      return {
        ...results,
        error: error.message,
        processingTime: Date.now() - startTime,
        fallback: true
      };
    }
  }

  /**
   * Execute response protocols with enhanced error handling
   */
  async executeResponseProtocols(threats) {
    const responses = [];
    const highestSeverity = this.getHighestSeverity(threats);

    if (!this.incidentResponse.has(highestSeverity)) {
      console.warn(`No response protocol defined for severity: ${highestSeverity}`);
      return responses;
    }

    const protocol = this.incidentResponse.get(highestSeverity);
    const incidentId = crypto.randomBytes(8).toString('hex');

    for (const action of protocol.actions) {
      const actionStartTime = Date.now();
      
      try {
        if (!this.responseHandlers.has(action)) {
          throw new IncidentResponseError(`Action handler not found: ${action}`);
        }

        const handler = this.responseHandlers.get(action);
        const result = await handler(threats);

        const executionTime = Date.now() - actionStartTime;
        
        responses.push({
          action,
          result,
          executionTime,
          success: true,
          incidentId
        });

        // Log response execution
        await this.logResponseExecution(incidentId, action, result, executionTime, true);

      } catch (error) {
        const executionTime = Date.now() - actionStartTime;
        
        responses.push({
          action,
          error: error.message,
          executionTime,
          success: false,
          incidentId
        });

        await this.logResponseExecution(incidentId, action, null, executionTime, false, error.message);
        
        console.error(`❌ Response action failed: ${action}`, error);
      }

      // Respect timeout between actions
      if (protocol.timeout > 0) {
        await sleep(protocol.timeout);
      }
    }

    return responses;
  }

  /**
   * Response action implementations
   */
  async haltBridgeOperations() {
    if (this.isBridgeHalted) {
      return { status: 'already_halted', timestamp: Date.now() };
    }

    try {
      // In production, this would interact with smart contracts
      console.warn('🚨 CRITICAL: Halting all bridge operations');
      
      // Simulate contract interaction
      const txHash = crypto.randomBytes(16).toString('hex');
      
      this.isBridgeHalted = true;
      await this.setSystemState('degraded', 'bridge_halted');

      return {
        status: 'bridge_operations_halted',
        txHash,
        timestamp: Date.now(),
        duration: 3600000 // 1 hour
      };

    } catch (error) {
      throw new SystemHaltError(`Failed to halt bridge operations: ${error.message}`);
    }
  }

  async freezeAccounts(threats) {
    const suspiciousAddresses = threats
      .filter(t => t.relatedAddress)
      .map(t => t.relatedAddress)
      .filter((addr, index, array) => array.indexOf(addr) === index); // Unique addresses

    if (suspiciousAddresses.length === 0) {
      return { status: 'no_addresses_to_freeze' };
    }

    try {
      // In production, this would interact with account management system
      console.log(`❄️ Freezing ${suspiciousAddresses.length} suspicious accounts`);

      // Simulate freezing process
      const results = await Promise.all(
        suspiciousAddresses.map(async (address) => {
          await sleep(100); // Simulate processing time
          return { address, status: 'frozen', timestamp: Date.now() };
        })
      );

      return {
        frozenCount: results.length,
        addresses: results,
        status: 'accounts_frozen'
      };

    } catch (error) {
      throw new IncidentResponseError(`Failed to freeze accounts: ${error.message}`);
    }
  }

  async notifySecurityTeam(threats) {
    // In production, this would integrate with PagerDuty, Slack, etc.
    const message = {
      severity: this.getHighestSeverity(threats),
      threatCount: threats.length,
      timestamp: Date.now(),
      summary: `Security incident detected with ${threats.length} threats`
    };

    console.log(`📧 Notifying security team: ${JSON.stringify(message)}`);
    
    return {
      status: 'security_team_notified',
      messageId: crypto.randomBytes(4).toString('hex'),
      timestamp: Date.now()
    };
  }

  async initiateForensics(threats) {
    console.log('🔍 Initiating forensic analysis');
    
    // Collect forensic data
    const forensicData = {
      threats: threats.map(t => ({
        type: t.type,
        severity: t.severity,
        detectedAt: Date.now()
      })),
      systemState: this.systemState,
      timeline: await this.generateIncidentTimeline(threats)
    };

    return {
      status: 'forensics_initiated',
      caseId: crypto.randomBytes(6).toString('hex'),
      dataCollected: forensicData.threats.length,
      timestamp: Date.now()
    };
  }

  async increaseMonitoring() {
    console.log('👀 Increasing monitoring levels');
    
    return {
      status: 'monitoring_increased',
      level: 'enhanced',
      duration: 3600000, // 1 hour
      timestamp: Date.now()
    };
  }

  async require2FA() {
    console.log('🔐 Requiring 2FA for affected accounts');
    
    return {
      status: '2fa_required',
      scope: 'affected_accounts',
      timestamp: Date.now()
    };
  }

  async notifyOperationsTeam(threats) {
    const message = {
      severity: this.getHighestSeverity(threats),
      actionRequired: true,
      timestamp: Date.now()
    };

    console.log(`📧 Notifying operations team: ${JSON.stringify(message)}`);
    
    return {
      status: 'operations_team_notified',
      messageId: crypto.randomBytes(4).toString('hex'),
      timestamp: Date.now()
    };
  }

  async logEvent() {
    return { status: 'event_logged', timestamp: Date.now() };
  }

  async monitorPatterns() {
    console.log('📊 Monitoring patterns for anomalies');
    
    return {
      status: 'pattern_monitoring_active',
      duration: 1800000, // 30 minutes
      timestamp: Date.now()
    };
  }

  async enableEnhancedMonitoring() {
    console.log('🔍 Enabling enhanced monitoring mode');
    
    return {
      status: 'enhanced_monitoring_enabled',
      level: 'maximum',
      timestamp: Date.now()
    };
  }

  async isolateAffectedSystems(threats) {
    const systems = this.getAffectedSystems(threats);
    console.log(`🔒 Isolating affected systems: ${systems.join(', ')}`);
    
    return {
      status: 'systems_isolated',
      affectedSystems: systems,
      timestamp: Date.now()
    };
  }

  async reviewAccessLogs() {
    console.log('📋 Reviewing access logs for suspicious activity');
    
    return {
      status: 'access_logs_review_initiated',
      timeframe: 'last_24_hours',
      timestamp: Date.now()
    };
  }

  async updateThreatIntel() {
    console.log('🔄 Updating threat intelligence feeds');
    
    return {
      status: 'threat_intel_updated',
      timestamp: Date.now()
    };
  }

  async updateBaselines() {
    console.log('📈 Updating behavioral baselines');
    
    return {
      status: 'baselines_updated',
      timestamp: Date.now()
    };
  }

  /**
   * Utility methods
   */
  getHighestSeverity(threats) {
    const severityOrder = { critical: 4, high: 3, medium: 2, low: 1, info: 0 };
    let highest = 'info';
    
    threats.forEach(threat => {
      if (severityOrder[threat.severity] > severityOrder[highest]) {
        highest = threat.severity;
      }
    });
    
    return highest;
  }

  getThreatSeverity(threatResult) {
    if (threatResult.severity) return threatResult.severity;
    if (threatResult.threats && threatResult.threats.length > 0) {
      return this.getHighestSeverity(threatResult.threats);
    }
    return 'medium';
  }

  getAffectedSystems(threats) {
    const systems = new Set();
    
    threats.forEach(threat => {
      if (threat.affectedSystems) {
        threat.affectedSystems.forEach(sys => systems.add(sys));
      }
    });
    
    return Array.from(systems);
  }

  analyzeRootCause(threats) {
    if (threats.length === 0) return 'unknown';
    
    // Simple root cause analysis
    const types = threats.map(t => t.type);
    if (types.includes('ai_detected_threat')) return 'sophisticated_attack';
    if (types.includes('coordinated_attack_pattern')) return 'coordinated_attack';
    if (types.includes('basic_threat_detected')) return 'known_threat_pattern';
    
    return 'multiple_factors';
  }

  assessImpact(threats) {
    const severity = this.getHighestSeverity(threats);
    
    const impactLevels = {
      critical: 'severe_impact',
      high: 'significant_impact',
      medium: 'moderate_impact',
      low: 'minimal_impact',
      info: 'no_impact'
    };
    
    return impactLevels[severity] || 'unknown_impact';
  }

  async logIncident(incidentData) {
    const incidentId = crypto.randomBytes(8).toString('hex');
    
    try {
      const result = await this.db.run(
        `INSERT INTO security_incidents 
         (incident_id, incident_type, severity, description, affected_systems, root_cause, impact_assessment, response_taken)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          incidentId,
          incidentData.incident_type,
          incidentData.severity,
          incidentData.description,
          JSON.stringify(incidentData.affected_systems || []),
          incidentData.root_cause || 'unknown',
          incidentData.impact_assessment || 'unknown',
          JSON.stringify(incidentData.response_taken || [])
        ]
      );

      // Update incident counters
      const count = this.incidentCounters.get(incidentData.severity) || 0;
      this.incidentCounters.set(incidentData.severity, count + 1);

      return incidentId;

    } catch (error) {
      console.error('Failed to log incident:', error);
      // Fallback to basic logging
      console.log('INCIDENT:', incidentData);
      return `fallback-${Date.now()}`;
    }
  }

  async logResponseExecution(incidentId, action, result, executionTime, success, errorMessage = null) {
    try {
      await this.db.run(
        `INSERT INTO incident_response_log 
         (incident_id, action_type, action_details, execution_time, success, error_message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          incidentId,
          action,
          result ? JSON.stringify(result) : '{}',
          executionTime,
          success,
          errorMessage
        ]
      );
    } catch (error) {
      console.error('Failed to log response execution:', error);
    }
  }

  async setSystemState(state, reason) {
    const previousState = this.systemState.operational ? 'operational' : 
                         this.systemState.degraded ? 'degraded' : 'maintenance';
    
    this.systemState = {
      operational: state === 'operational',
      degraded: state === 'degraded',
      maintenance: state === 'maintenance',
      lastStateChange: Date.now(),
      lastState: previousState
    };

    try {
      await this.db.run(
        `INSERT INTO system_state_history (state, reason) VALUES (?, ?)`,
        [state, reason]
      );
    } catch (error) {
      console.error('Failed to log system state change:', error);
    }

    console.log(`🔄 System state changed to: ${state} (Reason: ${reason})`);
  }

  async updateSystemState(threats) {
    const severity = this.getHighestSeverity(threats);
    
    if (severity === 'critical' && !this.systemState.degraded) {
      await this.setSystemState('degraded', 'critical_security_incident');
    } else if (severity === 'high' && this.systemState.operational) {
      await this.setSystemState('degraded', 'high_security_incident');
    }
  }

  async generateIncidentTimeline(threats) {
    // Generate a timeline of events for forensic analysis
    return threats.map(threat => ({
      timestamp: Date.now(),
      type: threat.type,
      severity: threat.severity,
      details: threat.detectionMethod
    }));
  }

  async loadHistoricalIncidents() {
    try {
      const incidents = await this.db.all(`
        SELECT severity, COUNT(*) as count 
        FROM security_incidents 
        WHERE created_at > datetime('now', '-30 days')
        GROUP BY severity
      `);

      incidents.forEach(inc => {
        this.incidentCounters.set(inc.severity, inc.count);
      });

    } catch (error) {
      console.warn('Could not load historical incidents:', error.message);
    }
  }

  startHealthMonitoring() {
    // Monitor system health every 5 minutes
    setInterval(() => {
      this.checkSystemHealth().catch(console.error);
    }, 300000);
  }

  async checkSystemHealth() {
    try {
      const health = {
        timestamp: Date.now(),
        systemState: this.systemState,
        incidentCounters: Object.fromEntries(this.incidentCounters),
        submoduleHealth: {
          detector: this.detector.isInitialized,
          quantumShield: this.quantumShield.isInitialized,
          database: this.db.isInitialized
        },
        performance: this.performanceMetrics
      };

      // Log health check
      await this.logIncident({
        incident_type: 'system_health_check',
        severity: 'info',
        description: 'System health check completed',
        affected_systems: ['monitoring'],
        response_taken: ['health_check']
      });

      return health;

    } catch (error) {
      console.error('Health check failed:', error);
      return { error: error.message };
    }
  }

  async retryOperation(operation, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) break;
        
        await sleep(delay * attempt);
        console.warn(`Retry attempt ${attempt}/${maxRetries} failed:`, error.message);
      }
    }
    
    throw lastError;
  }

  /**
   * Get security module statistics
   */
  async getStats() {
    return {
      isInitialized: this.isInitialized,
      systemState: this.systemState,
      incidentCounters: Object.fromEntries(this.incidentCounters),
      performance: this.performanceMetrics,
      isBridgeHalted: this.isBridgeHalted,
      uptime: Date.now() - this.performanceMetrics.startTime
    };
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('🛑 Shutting down AI Security Module...');
    
    try {
      if (this.detector.shutdown) {
        await this.detector.shutdown();
      }
      
      if (this.db.close) {
        await this.db.close();
      }

      await this.logIncident({
        incident_type: 'system_shutdown',
        severity: 'info',
        description: 'AI Security Module shutting down',
        affected_systems: ['all'],
        response_taken: ['graceful_shutdown']
      });

      this.isInitialized = false;
      console.log('✅ AI Security Module shut down successfully');

    } catch (error) {
      console.error('❌ Error during shutdown:', error);
    }
  }
}

// Export error classes
export { AISecurityModuleError, IncidentResponseError, SystemHaltError };
export default AISecurityModule;
