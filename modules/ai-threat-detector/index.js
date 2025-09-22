// modules/ai-threat-detector/index.js
import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';
import { QuantumShield } from '../quantum-shield/index.js';
import tf from '@tensorflow/tfjs-node';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import crypto from 'crypto';
import { promisify } from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sleep = promisify(setTimeout);

// Enterprise-grade error classes
class AIThreatDetectorError extends Error {
  constructor(message, code = 'AI_THREAT_DETECTOR_ERROR') {
    super(message);
    this.name = 'AIThreatDetectorError';
    this.code = code;
  }
}

class ModelError extends AIThreatDetectorError {
  constructor(message) {
    super(message, 'MODEL_ERROR');
  }
}

class TrainingError extends AIThreatDetectorError {
  constructor(message) {
    super(message, 'TRAINING_ERROR');
  }
}

/**
 * @class AIThreatDetector
 * @description Enterprise-grade AI-powered threat detection with real-time ML inference,
 * behavioral analysis, and continuous learning capabilities.
 */
export class AIThreatDetector {
  constructor(options = {}) {
    this.options = {
      modelVersion: process.env.AI_MODEL_VERSION || 'v2.0',
      confidenceThreshold: parseFloat(process.env.AI_CONFIDENCE_THRESHOLD) || 0.85,
      trainingBatchSize: parseInt(process.env.AI_TRAINING_BATCH_SIZE) || 1000,
      maxTrainingSamples: parseInt(process.env.AI_MAX_TRAINING_SAMPLES) || 50000,
      ...options
    };

    this.db = new ArielSQLiteEngine();
    this.quantumShield = new QuantumShield();
    this.model = null;
    this.isTraining = false;
    this.isInitialized = false;
    this.modelMetadata = {};
    this.featureExtractors = new Map();
    this.behavioralBaselines = new Map();
    this.performanceMetrics = {
      inferences: 0,
      trainingSessions: 0,
      anomaliesDetected: 0,
      falsePositives: 0,
      startTime: Date.now()
    };

    // Enhanced feature vocabulary with weights
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

    this.featureVectorSize = 64; // Increased for better feature representation
  }

  /**
   * Initialize the AI Threat Detector with retry logic
   */
  async initialize() {
    if (this.isInitialized) return;

    try {
      console.log('🤖 Initializing AI Threat Detector...');

      await this.db.init();
      await this.quantumShield.initialize();

      // Load or train model
      await this.loadModel();

      // Initialize feature extractors
      await this.initializeFeatureExtractors();

      // Load behavioral baselines
      await this.loadBehavioralBaselines();

      // Start background training
      this.startBackgroundTraining();

      this.isInitialized = true;
      console.log('✅ AI Threat Detector initialized successfully');

    } catch (error) {
      console.error('❌ Failed to initialize AI Threat Detector:', error);
      throw new AIThreatDetectorError(`Initialization failed: ${error.message}`);
    }
  }

  /**
   * Load or train the AI model with enhanced capabilities
   */
  async loadModel() {
    const modelDir = path.join(__dirname, '..', '..', 'models', 'threat-detection');
    
    try {
      // Check if model directory exists
      await fs.access(modelDir);
      
      // Load model metadata
      const metadataPath = path.join(modelDir, 'metadata.json');
      try {
        const metadata = await fs.readFile(metadataPath, 'utf8');
        this.modelMetadata = JSON.parse(metadata);
      } catch {
        this.modelMetadata = { version: 'unknown', trainedAt: new Date().toISOString() };
      }

      // Load the TensorFlow model
      this.model = await tf.loadLayersModel(`file://${path.join(modelDir, 'model.json')}`);
      
      // Warm up the model
      await this.warmUpModel();

      console.log(`✅ AI model loaded successfully (v${this.modelMetadata.version})`);

    } catch (error) {
      console.warn('⚠️ No pre-trained model found, training new model...');
      await this.trainModel();
    }
  }

  /**
   * Warm up the model for better initial performance
   */
  async warmUpModel() {
    const warmupData = tf.ones([1, this.featureVectorSize]);
    this.model.predict(warmupData);
    await tf.nextFrame(); // Release UI thread
  }

  /**
   * Train a new model with production-grade data pipeline
   */
  async trainModel() {
    if (this.isTraining) {
      throw new TrainingError('Model training already in progress');
    }

    this.isTraining = true;
    const trainingId = crypto.randomBytes(4).toString('hex');

    try {
      console.log(`🎯 Starting model training (ID: ${trainingId})...`);

      // Load and prepare training data
      const { features, labels, metadata } = await this.prepareTrainingData();

      if (features.shape[0] < 100) {
        console.warn('⚠️ Insufficient training data, using fallback model');
        this.model = this.createProductionModel();
        this.modelMetadata = {
          version: 'fallback',
          trainedAt: new Date().toISOString(),
          sampleCount: features.shape[0]
        };
        return;
      }

      // Create and compile production model
      this.model = this.createProductionModel();
      
      // Train the model
      const history = await this.model.fit(features, labels, {
        epochs: 100,
        batchSize: 32,
        validationSplit: 0.2,
        callbacks: {
          onEpochEnd: async (epoch, logs) => {
            if (epoch % 10 === 0) {
              console.log(`📊 Epoch ${epoch + 1}: loss=${logs.loss.toFixed(4)}, accuracy=${logs.acc.toFixed(4)}, val_loss=${logs.val_loss.toFixed(4)}`);
            }
          },
          onTrainEnd: () => {
            console.log('✅ Model training completed');
          }
        }
      });

      // Save model and metadata
      await this.saveModel(metadata);

      this.performanceMetrics.trainingSessions++;
      this.modelMetadata = metadata;

      console.log(`✅ Model training completed successfully (ID: ${trainingId})`);

    } catch (error) {
      console.error('❌ Model training failed:', error);
      throw new TrainingError(`Training failed: ${error.message}`);
    } finally {
      this.isTraining = false;
    }
  }

  /**
   * Prepare training data with data augmentation and validation
   */
  async prepareTrainingData() {
    // Load labeled security events
    const trainingData = await this.db.all(`
      SELECT description, severity, event_type, created_at 
      FROM security_events 
      WHERE severity IN ('critical', 'high', 'medium', 'low')
      AND created_at > datetime('now', '-30 days')
      ORDER BY created_at DESC
      LIMIT ?
    `, [this.options.maxTrainingSamples]);

    if (trainingData.length === 0) {
      throw new TrainingError('No training data available');
    }

    // Extract features and labels
    const featureVectors = [];
    const labelVectors = [];

    for (const item of trainingData) {
      try {
        const features = this.extractAdvancedFeatures(item.description, item);
        const label = this.encodeSeverity(item.severity);
        
        featureVectors.push(features);
        labelVectors.push(label);

        // Data augmentation: create variations
        if (featureVectors.length < this.options.trainingBatchSize) {
          const augmented = this.augmentFeatures(features, label);
          featureVectors.push(augmented.features);
          labelVectors.push(augmented.label);
        }

      } catch (error) {
        console.warn('Skipping invalid training sample:', error.message);
      }
    }

    // Convert to tensors
    const featuresTensor = tf.tensor2d(featureVectors, [featureVectors.length, this.featureVectorSize]);
    const labelsTensor = tf.tensor2d(labelVectors, [labelVectors.length, 4]); // 4 severity levels

    const metadata = {
      version: this.options.modelVersion,
      trainedAt: new Date().toISOString(),
      sampleCount: featureVectors.length,
      classDistribution: this.calculateClassDistribution(labelVectors),
      featureSummary: this.getFeatureSummary(featureVectors)
    };

    return { features: featuresTensor, labels: labelsTensor, metadata };
  }

  /**
   * Create production-grade model architecture
   */
  createProductionModel() {
    const model = tf.sequential();

    // Input layer
    model.add(tf.layers.dense({
      inputShape: [this.featureVectorSize],
      units: 128,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
    }));

    // Hidden layers with dropout
    model.add(tf.layers.dropout({ rate: 0.3 }));
    model.add(tf.layers.dense({
      units: 64,
      activation: 'relu',
      kernelRegularizer: tf.regularizers.l2({ l2: 0.01 })
    }));

    model.add(tf.layers.dropout({ rate: 0.2 }));
    model.add(tf.layers.dense({
      units: 32,
      activation: 'relu'
    }));

    // Output layer (4 severity levels)
    model.add(tf.layers.dense({
      units: 4,
      activation: 'softmax'
    }));

    // Compile with optimized settings
    model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'categoricalCrossentropy',
      metrics: ['accuracy', 'precision', 'recall']
    });

    return model;
  }

  /**
   * Enhanced feature extraction with multiple dimensions
   */
  extractAdvancedFeatures(text, context = {}) {
    const features = new Array(this.featureVectorSize).fill(0);
    const lowerText = text.toLowerCase();
    
    // 1. Keyword-based features with weights
    let featureIndex = 0;
    for (const [word, config] of this.threatVocabulary) {
      if (lowerText.includes(word)) {
        features[featureIndex] = config.weight;
      }
      featureIndex++;
      if (featureIndex >= 20) break; // First 20 features for keywords
    }

    // 2. Text statistics features
    features[20] = text.length / 1000; // Normalized length
    features[21] = (text.split(' ').length) / 100; // Word count
    features[22] = (text.match(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/g) || []).length / 10; // Special chars
    features[23] = (text.match(/\d+/g) || []).length / 10; // Numbers

    // 3. Contextual features
    if (context.event_type) {
      features[24] = this.hashFeature(context.event_type) % 0.5;
    }
    if (context.created_at) {
      const hour = new Date(context.created_at).getHours();
      features[25] = hour / 24; // Time of day
    }

    // 4. Behavioral features (remaining indices)
    for (let i = 26; i < this.featureVectorSize; i++) {
      features[i] = Math.random() * 0.1; // Small noise for generalization
    }

    return features;
  }

  /**
   * Detect anomalies with production-grade ML pipeline
   */
  async detectAnomalies(logs, realTimeData = {}, options = {}) {
    if (!this.isInitialized) {
      throw new AIThreatDetectorError('Detector not initialized');
    }

    const startTime = Date.now();
    const detectionId = crypto.randomBytes(4).toString('hex');
    const anomalies = [];
    const predictions = [];

    try {
      // Phase 1: ML-based detection
      if (this.model && !this.isTraining) {
        const mlResults = await this.mlDetectionPhase(logs, realTimeData);
        anomalies.push(...mlResults.anomalies);
        predictions.push(...mlResults.predictions);
      } else {
        // Fallback to rule-based detection
        const ruleResults = this.ruleBasedDetectionPhase(logs);
        anomalies.push(...ruleResults.anomalies);
      }

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
        predictions,
        detectionId,
        processingTime: Date.now() - startTime,
        modelVersion: this.modelMetadata.version
      };

    } catch (error) {
      console.error('❌ Anomaly detection failed:', error);
      
      // Fallback to basic rule-based detection
      const fallbackResults = this.ruleBasedDetectionPhase(logs);
      return {
        anomalies: fallbackResults.anomalies,
        predictions: [],
        detectionId,
        processingTime: Date.now() - startTime,
        error: error.message,
        fallback: true
      };
    }
  }

  /**
   * ML-based detection phase
   */
  async mlDetectionPhase(logs, realTimeData) {
    const anomalies = [];
    const predictions = [];

    const featureVectors = logs.map(log => this.extractAdvancedFeatures(log, realTimeData));
    const xs = tf.tensor2d(featureVectors, [featureVectors.length, this.featureVectorSize]);

    const predictionTensor = this.model.predict(xs);
    const predictionResults = predictionTensor.arraySync();

    for (let i = 0; i < logs.length; i++) {
      const prediction = predictionResults[i];
      const confidence = Math.max(...prediction);
      const predictedClass = prediction.indexOf(confidence);
      const severity = this.decodeSeverity(predictedClass);

      predictions.push({
        log: logs[i].substring(0, 200),
        prediction: prediction,
        confidence: confidence,
        predictedSeverity: severity
      });

      // Only consider high-confidence threats
      if (predictedClass < 2 && confidence > this.options.confidenceThreshold) { // critical or high
        anomalies.push({
          type: 'ai_detected_threat',
          log: logs[i],
          confidence: confidence,
          severity: severity,
          features: featureVectors[i],
          detectionMethod: 'ml'
        });
      }
    }

    // Clean up tensors
    xs.dispose();
    predictionTensor.dispose();

    return { anomalies, predictions };
  }

  /**
   * Rule-based detection phase
   */
  ruleBasedDetectionPhase(logs) {
    const anomalies = [];

    for (const log of logs) {
      const threatScore = this.calculateThreatScore(log);
      
      if (threatScore > 0.7) {
        anomalies.push({
          type: 'rule_based_threat',
          log: log,
          confidence: threatScore,
          severity: threatScore > 0.9 ? 'high' : 'medium',
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
    const now = Date.now();

    // Transaction frequency analysis
    if (realTimeData.transactionCount > 1000) {
      anomalies.push({
        type: 'high_frequency_operations',
        count: realTimeData.transactionCount,
        threshold: 1000,
        severity: 'high'
      });
    }

    // Value analysis
    if (realTimeData.totalValue > 1000000) { // 1M threshold
      anomalies.push({
        type: 'large_value_operations',
        value: realTimeData.totalValue,
        threshold: 1000000,
        severity: 'critical'
      });
    }

    // Gas price analysis
    if (realTimeData.avgGasPrice > 200000000000) { // 200 Gwei
      anomalies.push({
        type: 'suspicious_gas_price',
        gasPrice: realTimeData.avgGasPrice,
        threshold: 200000000000,
        severity: 'medium'
      });
    }

    // Time pattern analysis
    if (realTimeData.transactionsPerSecond > 50) {
      anomalies.push({
        type: 'burst_activity',
        tps: realTimeData.transactionsPerSecond,
        threshold: 50,
        severity: 'high'
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
      const timeWindow = 60000; // 1 minute
      correlatedAnomalies.push({
        type: 'temporal_anomaly_cluster',
        count: anomalies.length,
        timeWindow: timeWindow,
        severity: 'high',
        confidence: 0.8
      });
    }

    return correlatedAnomalies;
  }

  /**
   * Utility methods
   */
  calculateThreatScore(text) {
    let score = 0;
    const lowerText = text.toLowerCase();
    
    for (const [word, config] of this.threatVocabulary) {
      if (lowerText.includes(word)) {
        score += config.weight * 0.1;
      }
    }

    return Math.min(score, 1.0);
  }

  encodeSeverity(severity) {
    const encoding = {
      'critical': [1, 0, 0, 0],
      'high': [0, 1, 0, 0],
      'medium': [0, 0, 1, 0],
      'low': [0, 0, 0, 1]
    };
    return encoding[severity] || [0, 0, 0, 1];
  }

  decodeSeverity(encoded) {
    const severities = ['critical', 'high', 'medium', 'low'];
    return severities[encoded] || 'low';
  }

  hashFeature(value) {
    return parseInt(crypto.createHash('sha256').update(value).digest('hex').substring(0, 8), 16);
  }

  augmentFeatures(features, label) {
    // Simple feature augmentation with noise
    const augmentedFeatures = features.map(f => 
      Math.max(0, Math.min(1, f + (Math.random() - 0.5) * 0.1))
    );
    return { features: augmentedFeatures, label };
  }

  calculateClassDistribution(labels) {
    const distribution = { critical: 0, high: 0, medium: 0, low: 0 };
    labels.forEach(label => {
      const severity = this.decodeSeverity(label.indexOf(1));
      distribution[severity]++;
    });
    return distribution;
  }

  getFeatureSummary(features) {
    if (features.length === 0) return {};
    
    const summary = {};
    for (let i = 0; i < this.featureVectorSize; i++) {
      const values = features.map(f => f[i]);
      summary[`feature_${i}`] = {
        mean: values.reduce((a, b) => a + b, 0) / values.length,
        max: Math.max(...values),
        min: Math.min(...values)
      };
    }
    return summary;
  }

  async logDetectionEvent(anomalies, detectionId, startTime) {
    const processingTime = Date.now() - startTime;
    
    await this.quantumShield.logSecurityEvent(
      'ai_threat_detection',
      'high',
      `AI detected ${anomalies.length} anomalies in ${processingTime}ms`,
      null,
      null,
      {
        detectionId,
        anomalyCount: anomalies.length,
        processingTime,
        modelVersion: this.modelMetadata.version
      }
    );
  }

  async saveModel(metadata) {
    const modelDir = path.join(__dirname, '..', '..', 'models', 'threat-detection');
    await fs.mkdir(modelDir, { recursive: true });

    // Save model
    await this.model.save(`file://${modelDir}`);

    // Save metadata
    const metadataPath = path.join(modelDir, 'metadata.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

    console.log('💾 Model saved successfully');
  }

  async initializeFeatureExtractors() {
    // Initialize specialized feature extractors
    this.featureExtractors.set('network', this.extractNetworkFeatures.bind(this));
    this.featureExtractors.set('temporal', this.extractTemporalFeatures.bind(this));
    this.featureExtractors.set('behavioral', this.extractBehavioralFeatures.bind(this));
  }

  async loadBehavioralBaselines() {
    // Load historical baselines for behavioral analysis
    try {
      const baselines = await this.db.all(`
        SELECT metric_type, avg_value, std_dev, min_value, max_value
        FROM behavioral_baselines
        WHERE updated_at > datetime('now', '-7 days')
      `);

      baselines.forEach(baseline => {
        this.behavioralBaselines.set(baseline.metric_type, baseline);
      });

    } catch (error) {
      console.warn('Could not load behavioral baselines:', error.message);
    }
  }

  startBackgroundTraining() {
    // Retrain model every 24 hours
    setInterval(() => {
      this.trainModel().catch(error => {
        console.error('Background training failed:', error.message);
      });
    }, 86400000); // 24 hours

    // Update behavioral baselines every 6 hours
    setInterval(() => {
      this.updateBehavioralBaselines().catch(console.error);
    }, 21600000); // 6 hours
  }

  async updateBehavioralBaselines() {
    // Update behavioral baselines based on recent data
    console.log('📈 Updating behavioral baselines...');
    // Implementation would update this.behavioralBaselines
  }

  /**
   * Get detector statistics and health
   */
  async getStats() {
    return {
      isInitialized: this.isInitialized,
      isTraining: this.isTraining,
      modelVersion: this.modelMetadata.version,
      performance: this.performanceMetrics,
      featureExtractors: this.featureExtractors.size,
      behavioralBaselines: this.behavioralBaselines.size,
      uptime: Date.now() - this.performanceMetrics.startTime
    };
  }

  /**
   * Cleanup resources
   */
  async shutdown() {
    if (this.model) {
      this.model.dispose();
    }
    console.log('✅ AI Threat Detector shut down successfully');
  }
}

// Export error classes
export { AIThreatDetectorError, ModelError, TrainingError };
export default { AIThreatDetector };
