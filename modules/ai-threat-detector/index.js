import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';
import { QuantumShield } from '../quantum-shield/index.js';
import crypto from 'crypto';

// Enterprise-grade error classes
export class AIThreatDetectorError extends Error {
  constructor(message, code = 'AI_THREAT_DETECTOR_ERROR') {
    super(message);
    this.name = 'AIThreatDetectorError';
    this.code = code;
  }
}

export class ModelError extends AIThreatDetectorError {
  constructor(message) {
    super(message, 'MODEL_ERROR');
  }
}

export class TrainingError extends AIThreatDetectorError {
  constructor(message) {
    super(message, 'TRAINING_ERROR');
  }
}

/**
 * @class AIThreatDetector
 * @description AI-powered threat detection with rule-based analysis
 * Note: TensorFlow.js dependency removed for compatibility
 */
export class AIThreatDetector {
  constructor(options = {}) {
    this.options = {
      confidenceThreshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.85,
      ...options
    };

    // FIXED: Proper database initialization
    this.db = new ArielSQLiteEngine({
      dbPath: './data/ai_threat_detector.db',
      autoBackup: true
    });
    
    this.quantumShield = new QuantumShield();
    this.isInitialized = false;

    // Enhanced threat vocabulary with weights
    this.threatVocabulary = new Map([
      ['error', { weight: 1.2, category: 'system' }],
      ['attack', { weight: 2.0, category: 'security' }],
      ['violation', { weight: 1.8, category: 'security' }],
      ['unauthorized', { weight: 2.2, category: 'access' }],
      ['failed', { weight: 1.1, category: 'system' }],
      ['phishing', { weight: 2.5, category: 'fraud' }],
      ['reentrancy', { weight: 2.8, category: 'blockchain' }],
      ['overflow', { weight: 2.3, category: 'blockchain' }],
      ['tamper', { weight: 2.1, category: 'security' }],
      ['exploit', { weight: 2.7, category: 'security' }],
      ['malicious', { weight: 2.4, category: 'security' }],
      ['suspicious', { weight: 1.9, category: 'security' }],
      ['breach', { weight: 2.6, category: 'security' }],
      ['hack', { weight: 2.9, category: 'security' }],
      ['inject', { weight: 2.3, category: 'security' }]
    ]);

    this.performanceMetrics = {
      inferences: 0,
      anomaliesDetected: 0,
      startTime: Date.now()
    };
  }

  /**
   * Initialize the AI Threat Detector
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🤖 Initializing AI Threat Detector...');

      // FIXED: Use connect/initialize instead of init
      if (typeof this.db.connect === 'function') {
        await this.db.connect();
      } else if (typeof this.db.initialize === 'function') {
        await this.db.initialize();
      }
      
      await this.quantumShield.initialize();
      await this.createDatabaseSchema();

      this.isInitialized = true;
      console.log('✅ AI Threat Detector initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize AI Threat Detector:', error);
      throw new AIThreatDetectorError(`Initialization failed: ${error.message}`);
    }
  }

  async createDatabaseSchema() {
    const tables = [
      `CREATE TABLE IF NOT EXISTS threat_detections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        detection_id TEXT NOT NULL,
        log_data TEXT,
        threat_score REAL NOT NULL,
        severity TEXT NOT NULL,
        detected_threats TEXT,
        processing_time INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,
      
      `CREATE TABLE IF NOT EXISTS behavioral_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metric_type TEXT NOT NULL,
        avg_value REAL NOT NULL,
        std_dev REAL NOT NULL,
        min_value REAL NOT NULL,
        max_value REAL NOT NULL,
        sample_count INTEGER NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    for (const tableSql of tables) {
      await this.db.execute(tableSql);
    }
  }

  /**
   * Detect anomalies using rule-based analysis
   */
  async detectAnomalies(logs, realTimeData = {}, options = {}) {
    if (!this.isInitialized) {
      throw new AIThreatDetectorError('Detector not initialized');
    }

    const startTime = Date.now();
    const detectionId = crypto.randomBytes(8).toString('hex');
    const anomalies = [];

    try {
      // Phase 1: Rule-based detection
      const ruleResults = this.ruleBasedDetectionPhase(logs);
      anomalies.push(...ruleResults.anomalies);

      // Phase 2: Behavioral analysis
      const behavioralResults = this.behavioralAnalysisPhase(realTimeData);
      anomalies.push(...behavioralResults);

      // Phase 3: Correlation analysis
      const correlatedResults = await this.correlationAnalysisPhase(anomalies, realTimeData);
      anomalies.push(...correlatedResults);

      // Log detection event
      if (anomalies.length > 0) {
        await this.logDetectionEvent(anomalies, detectionId, startTime);
      }

      this.performanceMetrics.inferences++;
      this.performanceMetrics.anomaliesDetected += anomalies.length;

      return {
        anomalies,
        detectionId,
        processingTime: Date.now() - startTime,
        modelVersion: 'rule-based-v1.0'
      };

    } catch (error) {
      console.error('❌ Anomaly detection failed:', error);
      
      return {
        anomalies: [],
        detectionId,
        processingTime: Date.now() - startTime,
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * Rule-based detection phase
   */
  ruleBasedDetectionPhase(logs) {
    const anomalies = [];

    for (const log of logs) {
      const threatScore = this.calculateThreatScore(log);
      const detectedThreats = this.analyzeThreatPatterns(log);
      
      if (threatScore > this.options.confidenceThreshold || detectedThreats.length > 0) {
        anomalies.push({
          type: 'rule_based_threat',
          log: log.substring(0, 500), // Limit log size
          confidence: threatScore,
          severity: this.calculateSeverity(threatScore, detectedThreats),
          detectedThreats: detectedThreats,
          detectionMethod: 'rule_based'
        });
      }
    }

    return { anomalies };
  }

  /**
   * Behavioral analysis phase
   */
  behavioralAnalysisPhase(realTimeData) {
    const anomalies = [];

    // Transaction frequency analysis
    if (realTimeData.transactionCount > 1000) {
      anomalies.push({
        type: 'high_frequency_operations',
        count: realTimeData.transactionCount,
        threshold: 1000,
        severity: 'high',
        confidence: 0.8
      });
    }

    // Value analysis
    if (realTimeData.totalValue > 1000000) { // 1M threshold
      anomalies.push({
        type: 'large_value_operations',
        value: realTimeData.totalValue,
        threshold: 1000000,
        severity: 'critical',
        confidence: 0.9
      });
    }

    // Gas price analysis
    if (realTimeData.avgGasPrice > 200000000000) { // 200 Gwei
      anomalies.push({
        type: 'suspicious_gas_price',
        gasPrice: realTimeData.avgGasPrice,
        threshold: 200000000000,
        severity: 'medium',
        confidence: 0.7
      });
    }

    // Time pattern analysis
    if (realTimeData.transactionsPerSecond > 50) {
      anomalies.push({
        type: 'burst_activity',
        tps: realTimeData.transactionsPerSecond,
        threshold: 50,
        severity: 'high',
        confidence: 0.85
      });
    }

    return anomalies;
  }

  /**
   * Correlation analysis phase
   */
  async correlationAnalysisPhase(anomalies, realTimeData) {
    const correlatedAnomalies = [];

    // Group anomalies by type and check for patterns
    const anomalyGroups = {};
    anomalies.forEach(anomaly => {
      if (!anomalyGroups[anomaly.type]) {
        anomalyGroups[anomaly.type] = [];
      }
      anomalyGroups[anomaly.type].push(anomaly);
    });

    // Check for coordinated attacks (multiple anomaly types)
    if (Object.keys(anomalyGroups).length >= 3) {
      correlatedAnomalies.push({
        type: 'coordinated_attack_pattern',
        anomalyTypes: Object.keys(anomalyGroups),
        count: anomalies.length,
        severity: 'critical',
        confidence: 0.9
      });
    }

    // Check for temporal patterns
    if (anomalies.length > 10) {
      correlatedAnomalies.push({
        type: 'temporal_anomaly_cluster',
        count: anomalies.length,
        timeWindow: 60000, // 1 minute
        severity: 'high',
        confidence: 0.8
      });
    }

    return correlatedAnomalies;
  }

  /**
   * Calculate threat score based on keyword analysis
   */
  calculateThreatScore(text) {
    let score = 0;
    const lowerText = text.toLowerCase();
    let keywordCount = 0;
    
    for (const [word, config] of this.threatVocabulary) {
      if (lowerText.includes(word)) {
        score += config.weight * 0.1;
        keywordCount++;
      }
    }

    // Normalize by keyword count
    if (keywordCount > 0) {
      score = score * (1 + (keywordCount - 1) * 0.2); // Boost for multiple keywords
    }

    return Math.min(score, 1.0);
  }

  /**
   * Analyze specific threat patterns in text
   */
  analyzeThreatPatterns(text) {
    const lowerText = text.toLowerCase();
    const threats = [];

    // SQL injection patterns
    if (lowerText.includes('select ') && (lowerText.includes('from ') || lowerText.includes('where '))) {
      threats.push('sql_injection_pattern');
    }

    // XSS patterns
    if (lowerText.includes('<script>') || lowerText.includes('javascript:') || lowerText.includes('onerror=')) {
      threats.push('xss_pattern');
    }

    // Command injection
    if (lowerText.includes('system(') || lowerText.includes('exec(') || lowerText.includes('eval(')) {
      threats.push('command_injection_pattern');
    }

    // Path traversal
    if (lowerText.includes('../') || lowerText.includes('..\\') || lowerText.includes('/etc/passwd')) {
      threats.push('path_traversal_pattern');
    }

    return threats;
  }

  /**
   * Calculate severity based on threat score and patterns
   */
  calculateSeverity(threatScore, detectedThreats) {
    if (threatScore > 0.9 || detectedThreats.includes('sql_injection_pattern')) {
      return 'critical';
    } else if (threatScore > 0.7 || detectedThreats.length >= 2) {
      return 'high';
    } else if (threatScore > 0.5) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  /**
   * Log detection event
   */
  async logDetectionEvent(anomalies, detectionId, startTime) {
    const processingTime = Date.now() - startTime;
    
    // Log to database
    try {
      await this.db.execute(
        `INSERT INTO threat_detections 
         (detection_id, log_data, threat_score, severity, detected_threats, processing_time) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          detectionId,
          JSON.stringify(anomalies.slice(0, 5)), // Sample of anomalies
          anomalies.reduce((max, a) => Math.max(max, a.confidence), 0),
          anomalies.reduce((max, a) => this.severityValue(a.severity) > this.severityValue(max) ? a.severity : max, 'low'),
          JSON.stringify(anomalies.map(a => a.type)),
          processingTime
        ]
      );
    } catch (error) {
      console.error('Failed to log detection event:', error);
    }

    // Log to quantum shield
    await this.quantumShield.logSecurityEvent(
      'ai_threat_detection',
      'high',
      `AI detected ${anomalies.length} anomalies in ${processingTime}ms`,
      null,
      null,
      {
        detectionId,
        anomalyCount: anomalies.length,
        processingTime
      }
    );
  }

  /**
   * Utility method to convert severity to numeric value
   */
  severityValue(severity) {
    const values = {
      'critical': 4,
      'high': 3,
      'medium': 2,
      'low': 1
    };
    return values[severity] || 0;
  }

  /**
   * Get detector statistics and health
   */
  async getStats() {
    try {
      const recentDetections = await this.db.query(
        "SELECT COUNT(*) as count FROM threat_detections WHERE timestamp > datetime('now', '-1 hour')"
      );

      return {
        isInitialized: this.isInitialized,
        performance: this.performanceMetrics,
        recentDetections: recentDetections[0]?.count || 0,
        threatVocabularySize: this.threatVocabulary.size,
        uptime: Date.now() - this.performanceMetrics.startTime
      };
    } catch (error) {
      return {
        isInitialized: this.isInitialized,
        error: error.message
      };
    }
  }

  /**
   * Train on new threat patterns (stub for future implementation)
   */
  async trainOnNewData(trainingData) {
    console.log('Training on new data...', trainingData.length, 'samples');
    // Future implementation would update threat vocabulary and patterns
    return { success: true, trainedSamples: trainingData.length };
  }

  /**
   * Cleanup resources
   */
  async shutdown() {
    if (this.db && typeof this.db.close === 'function') {
      await this.db.close();
    }
    console.log('✅ AI Threat Detector shut down successfully');
  }
}

// Export for backward compatibility
export default AIThreatDetector;
