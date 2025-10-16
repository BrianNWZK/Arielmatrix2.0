// modules/predictive-scaling.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createHmac } from 'crypto';
import { performance } from 'perf_hooks';

export class PredictiveScaling {
    constructor(config = {}) {
        this.config = {
            scalingMetrics: ['throughput', 'latency', 'memory', 'cpu', 'network'],
            predictionHorizon: 300, // 5 minutes
            trainingInterval: 60000, // 1 minute
            scalingThreshold: 0.85, // 85% utilization
            minReplicas: 1,
            maxReplicas: 100,
            coolDownPeriod: 300000, // 5 minutes
            adaptiveLearning: true,
            ...config
        };
        this.metricsHistory = new Map();
        this.scalingPredictions = new Map();
        this.resourceModels = new Map();
        this.activeAlerts = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/predictive-scaling.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.monitoringInterval = null;
        this.trainingInterval = null;
        this.lastScalingAction = 0;
        this.systemMetrics = {
            currentLoad: 0,
            predictedLoad: 0,
            resourceUtilization: {},
            scalingRecommendations: []
        };
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'PredictiveScaling',
            description: 'AI-driven predictive scaling system with real-time resource optimization',
            registrationFee: 15000,
            annualLicenseFee: 7500,
            revenueShare: 0.20,
            serviceType: 'infrastructure_optimization',
            dataPolicy: 'Encrypted performance metrics only - No PII storage',
            compliance: ['Infrastructure Optimization', 'Performance Management']
        });

        await this.loadHistoricalData();
        await this.initializeResourceModels();
        this.startMonitoring();
        this.startModelTraining();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            scalingMetrics: this.config.scalingMetrics,
            predictionHorizon: this.config.predictionHorizon,
            adaptiveLearning: this.config.adaptiveLearning
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS scaling_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                metric_name TEXT NOT NULL,
                metric_value REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                service_id TEXT,
                instance_id TEXT,
                resource_type TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS scaling_predictions (
                id TEXT PRIMARY KEY,
                prediction_type TEXT NOT NULL,
                predicted_value REAL NOT NULL,
                confidence REAL NOT NULL,
                horizon_seconds INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                actual_value REAL,
                accuracy REAL
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS scaling_actions (
                id TEXT PRIMARY KEY,
                action_type TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                current_value REAL NOT NULL,
                target_value REAL NOT NULL,
                reason TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN,
                error_message TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS resource_models (
                id TEXT PRIMARY KEY,
                model_type TEXT NOT NULL,
                model_data BLOB NOT NULL,
                accuracy REAL DEFAULT 0,
                training_samples INTEGER DEFAULT 0,
                last_trained DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active BOOLEAN DEFAULT true
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS performance_alerts (
                id TEXT PRIMARY KEY,
                alert_type TEXT NOT NULL,
                severity TEXT NOT NULL,
                metric_name TEXT NOT NULL,
                threshold REAL NOT NULL,
                current_value REAL NOT NULL,
                triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolved_at DATETIME,
                action_taken TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS cost_optimization (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                resource_type TEXT NOT NULL,
                current_cost REAL NOT NULL,
                optimized_cost REAL NOT NULL,
                savings REAL NOT NULL,
                optimization_strategy TEXT NOT NULL
            )
        `);
    }

    async recordMetric(metricName, metricValue, serviceId = 'system', instanceId = 'default', resourceType = 'general') {
        if (!this.initialized) await this.initialize();

        const metricId = await this.db.run(`
            INSERT INTO scaling_metrics (metric_name, metric_value, service_id, instance_id, resource_type)
            VALUES (?, ?, ?, ?, ?)
        `, [metricName, metricValue, serviceId, instanceId, resourceType]);

        this.updateMetricsHistory(metricName, metricValue, serviceId, instanceId);
        await this.analyzeMetricTrend(metricName, metricValue, serviceId);

        this.events.emit('metricRecorded', {
            metricName,
            metricValue,
            serviceId,
            instanceId,
            resourceType,
            timestamp: Date.now()
        });

        return metricId;
    }

    updateMetricsHistory(metricName, metricValue, serviceId, instanceId) {
        const key = `${serviceId}_${instanceId}_${metricName}`;
        const history = this.metricsHistory.get(key) || [];
        
        history.push({
            value: metricValue,
            timestamp: Date.now()
        });

        if (history.length > 1000) {
            history.shift();
        }

        this.metricsHistory.set(key, history);
    }

    async analyzeMetricTrend(metricName, currentValue, serviceId) {
        const key = `${serviceId}_default_${metricName}`;
        const history = this.metricsHistory.get(key) || [];
        
        if (history.length < 10) return;

        const recentValues = history.slice(-10).map(h => h.value);
        const trend = this.calculateTrend(recentValues);
        const volatility = this.calculateVolatility(recentValues);

        if (this.shouldTriggerAlert(metricName, currentValue, trend, volatility)) {
            await this.triggerPerformanceAlert(metricName, currentValue, trend, serviceId);
        }

        if (this.config.adaptiveLearning) {
            await this.updatePredictiveModel(metricName, recentValues, serviceId);
        }
    }

    calculateTrend(values) {
        if (values.length < 2) return 0;
        
        const n = values.length;
        const xMean = (n - 1) / 2;
        const yMean = values.reduce((sum, val) => sum + val, 0) / n;
        
        let numerator = 0;
        let denominator = 0;
        
        for (let i = 0; i < n; i++) {
            numerator += (i - xMean) * (values[i] - yMean);
            denominator += Math.pow(i - xMean, 2);
        }
        
        return denominator !== 0 ? numerator / denominator : 0;
    }

    calculateVolatility(values) {
        if (values.length < 2) return 0;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        return Math.sqrt(variance);
    }

    shouldTriggerAlert(metricName, currentValue, trend, volatility) {
        const thresholds = {
            'cpu': { upper: 0.9, lower: 0.1, trend: 0.05 },
            'memory': { upper: 0.85, lower: 0.15, trend: 0.03 },
            'throughput': { upper: 0.95, lower: 0.05, trend: 0.1 },
            'latency': { upper: 0.8, lower: 0.2, trend: -0.08 }
        };

        const threshold = thresholds[metricName];
        if (!threshold) return false;

        if (currentValue > threshold.upper || currentValue < threshold.lower) {
            return true;
        }

        if (Math.abs(trend) > threshold.trend) {
            return true;
        }

        return false;
    }

    async triggerPerformanceAlert(metricName, currentValue, trend, serviceId) {
        const alertId = this.generateAlertId();
        const severity = this.determineAlertSeverity(metricName, currentValue, trend);

        await this.db.run(`
            INSERT INTO performance_alerts (id, alert_type, severity, metric_name, threshold, current_value)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [alertId, 'performance', severity, metricName, this.config.scalingThreshold, currentValue]);

        this.activeAlerts.set(alertId, {
            id: alertId,
            metricName,
            currentValue,
            trend,
            severity,
            triggeredAt: new Date()
        });

        await this.generateScalingRecommendation(metricName, currentValue, trend, serviceId);

        this.events.emit('performanceAlert', {
            alertId,
            metricName,
            currentValue,
            trend,
            severity,
            serviceId,
            timestamp: Date.now()
        });

        return alertId;
    }

    determineAlertSeverity(metricName, currentValue, trend) {
        const deviation = Math.abs(currentValue - this.config.scalingThreshold);
        
        if (deviation > 0.3 || Math.abs(trend) > 0.15) {
            return 'critical';
        } else if (deviation > 0.15 || Math.abs(trend) > 0.08) {
            return 'warning';
        } else {
            return 'info';
        }
    }

    async generateScalingRecommendation(metricName, currentValue, trend, serviceId) {
        const prediction = await this.predictResourceNeed(metricName, serviceId);
        const recommendation = this.calculateScalingAction(currentValue, trend, prediction);

        if (recommendation.action !== 'maintain') {
            await this.executeScalingAction(recommendation, serviceId);
        }

        this.systemMetrics.scalingRecommendations.push({
            ...recommendation,
            timestamp: Date.now(),
            metricName,
            serviceId
        });

        this.events.emit('scalingRecommendation', {
            recommendation,
            metricName,
            serviceId,
            timestamp: Date.now()
        });

        return recommendation;
    }

    async predictResourceNeed(metricName, serviceId) {
        const model = this.resourceModels.get(`${serviceId}_${metricName}`);
        if (!model) {
            return await this.createBaselinePrediction(metricName, serviceId);
        }

        const history = this.metricsHistory.get(`${serviceId}_default_${metricName}`) || [];
        const recentValues = history.slice(-50).map(h => h.value);
        
        if (recentValues.length < 10) {
            return await this.createBaselinePrediction(metricName, serviceId);
        }

        const prediction = await this.applyPredictiveModel(model, recentValues);
        const confidence = this.calculatePredictionConfidence(recentValues, prediction);

        const predictionId = this.generatePredictionId();
        await this.db.run(`
            INSERT INTO scaling_predictions (id, prediction_type, predicted_value, confidence, horizon_seconds)
            VALUES (?, ?, ?, ?, ?)
        `, [predictionId, metricName, prediction, confidence, this.config.predictionHorizon]);

        return {
            value: prediction,
            confidence,
            horizon: this.config.predictionHorizon
        };
    }

    async createBaselinePrediction(metricName, serviceId) {
        const history = this.metricsHistory.get(`${serviceId}_default_${metricName}`) || [];
        const recentValues = history.slice(-20).map(h => h.value);
        
        if (recentValues.length === 0) {
            return { value: 0.5, confidence: 0, horizon: this.config.predictionHorizon };
        }

        const average = recentValues.reduce((sum, val) => sum + val, 0) / recentValues.length;
        const trend = this.calculateTrend(recentValues);
        const prediction = average + (trend * this.config.predictionHorizon / 60);

        return {
            value: Math.max(0, Math.min(1, prediction)),
            confidence: 0.5,
            horizon: this.config.predictionHorizon
        };
    }

    async applyPredictiveModel(model, recentValues) {
        switch (model.type) {
            case 'linear_regression':
                return this.applyLinearRegression(model, recentValues);
            case 'exponential_smoothing':
                return this.applyExponentialSmoothing(model, recentValues);
            case 'arima':
                return this.applyARIMA(model, recentValues);
            default:
                return this.applyMovingAverage(recentValues);
        }
    }

    applyLinearRegression(model, values) {
        const n = values.length;
        const xMean = (n - 1) / 2;
        const yMean = values.reduce((sum, val) => sum + val, 0) / n;
        
        let numerator = 0;
        let denominator = 0;
        
        for (let i = 0; i < n; i++) {
            numerator += (i - xMean) * (values[i] - yMean);
            denominator += Math.pow(i - xMean, 2);
        }
        
        const slope = denominator !== 0 ? numerator / denominator : 0;
        return yMean + (slope * this.config.predictionHorizon / 60);
    }

    applyExponentialSmoothing(model, values) {
        const alpha = model.parameters?.alpha || 0.3;
        let smoothed = values[0];
        
        for (let i = 1; i < values.length; i++) {
            smoothed = alpha * values[i] + (1 - alpha) * smoothed;
        }
        
        return smoothed;
    }

    applyARIMA(model, values) {
        return this.applyMovingAverage(values);
    }

    applyMovingAverage(values) {
        const window = Math.min(5, values.length);
        const recent = values.slice(-window);
        return recent.reduce((sum, val) => sum + val, 0) / recent.length;
    }

    calculatePredictionConfidence(values, prediction) {
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        
        const error = Math.abs(prediction - mean);
        const normalizedError = stdDev > 0 ? error / stdDev : 0;
        
        return Math.max(0, 1 - normalizedError);
    }

    calculateScalingAction(currentValue, trend, prediction) {
        const combinedScore = (currentValue * 0.4) + (prediction.value * 0.4) + (Math.abs(trend) * 0.2);
        
        if (combinedScore > this.config.scalingThreshold + 0.1) {
            return { action: 'scale_up', amount: this.calculateScaleAmount(combinedScore), reason: 'high_utilization' };
        } else if (combinedScore < this.config.scalingThreshold - 0.2) {
            return { action: 'scale_down', amount: this.calculateScaleAmount(combinedScore), reason: 'low_utilization' };
        } else {
            return { action: 'maintain', amount: 0, reason: 'optimal_range' };
        }
    }

    calculateScaleAmount(score) {
        const excess = Math.max(0, score - this.config.scalingThreshold);
        return Math.ceil(excess * 10);
    }

    async executeScalingAction(recommendation, serviceId) {
        const now = Date.now();
        if (now - this.lastScalingAction < this.config.coolDownPeriod) {
            console.log('Scaling action skipped: in cool down period');
            return;
        }

        const actionId = this.generateActionId();
        
        try {
            await this.db.run(`
                INSERT INTO scaling_actions (id, action_type, resource_type, current_value, target_value, reason)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [actionId, recommendation.action, 'compute', this.systemMetrics.currentLoad, 
                recommendation.amount, recommendation.reason]);

            const success = await this.performActualScaling(recommendation, serviceId);
            
            await this.db.run(`
                UPDATE scaling_actions SET success = ? WHERE id = ?
            `, [success, actionId]);

            if (success) {
                this.lastScalingAction = now;
                this.systemMetrics.currentLoad = this.calculateNewLoad(recommendation);
            }

            this.events.emit('scalingActionExecuted', {
                actionId,
                recommendation,
                serviceId,
                success,
                timestamp: now
            });

        } catch (error) {
            await this.db.run(`
                UPDATE scaling_actions SET success = false, error_message = ? WHERE id = ?
            `, [error.message, actionId]);

            this.events.emit('scalingActionFailed', {
                actionId,
                error: error.message,
                timestamp: now
            });
        }
    }

    async performActualScaling(recommendation, serviceId) {
        switch (recommendation.action) {
            case 'scale_up':
                return await this.scaleUpInstances(recommendation.amount, serviceId);
            case 'scale_down':
                return await this.scaleDownInstances(recommendation.amount, serviceId);
            default:
                return true;
        }
    }

    async scaleUpInstances(amount, serviceId) {
        const currentInstances = await this.getCurrentInstanceCount(serviceId);
        const targetInstances = Math.min(this.config.maxReplicas, currentInstances + amount);
        
        if (targetInstances <= currentInstances) {
            return false;
        }

        return await this.updateInstanceCount(serviceId, targetInstances);
    }

    async scaleDownInstances(amount, serviceId) {
        const currentInstances = await this.getCurrentInstanceCount(serviceId);
        const targetInstances = Math.max(this.config.minReplicas, currentInstances - amount);
        
        if (targetInstances >= currentInstances) {
            return false;
        }

        return await this.updateInstanceCount(serviceId, targetInstances);
    }

    async getCurrentInstanceCount(serviceId) {
        const result = await this.db.get(`
            SELECT COUNT(*) as count FROM scaling_metrics 
            WHERE service_id = ? AND metric_name = 'active_instances'
            ORDER BY timestamp DESC LIMIT 1
        `, [serviceId]);

        return result?.count || 1;
    }

    async updateInstanceCount(serviceId, targetCount) {
        await this.recordMetric('active_instances', targetCount, serviceId, 'scaler', 'instances');
        return true;
    }

    calculateNewLoad(recommendation) {
        const loadChange = recommendation.action === 'scale_up' ? -0.1 : 0.05;
        return Math.max(0.1, Math.min(1.0, this.systemMetrics.currentLoad + loadChange));
    }

    async updatePredictiveModel(metricName, values, serviceId) {
        const modelKey = `${serviceId}_${metricName}`;
        let model = this.resourceModels.get(modelKey);

        if (!model) {
            model = await this.initializeModel(metricName, values);
        }

        model.training_samples += values.length;
        model.accuracy = await this.calculateModelAccuracy(model, values);
        model.last_trained = new Date();

        await this.saveModel(modelKey, model);
        this.resourceModels.set(modelKey, model);
    }

    async initializeModel(metricName, initialValues) {
        return {
            type: 'linear_regression',
            parameters: {
                coefficients: this.calculateInitialCoefficients(initialValues),
                intercept: initialValues[0] || 0.5
            },
            training_samples: initialValues.length,
            accuracy: 0.7,
            last_trained: new Date(),
            is_active: true
        };
    }

    calculateInitialCoefficients(values) {
        if (values.length < 2) return [0];
        
        const coefficients = [];
        for (let i = 1; i < values.length; i++) {
            coefficients.push(values[i] - values[i-1]);
        }
        return coefficients;
    }

    async calculateModelAccuracy(model, values) {
        if (values.length < 10) return model.accuracy;

        const predictions = [];
        for (let i = 0; i < values.length - 1; i++) {
            const prediction = await this.applyPredictiveModel(model, values.slice(0, i + 1));
            predictions.push(prediction);
        }

        let totalError = 0;
        for (let i = 0; i < predictions.length; i++) {
            totalError += Math.abs(predictions[i] - values[i + 1]);
        }

        const mae = totalError / predictions.length;
        const maxError = Math.max(...values) - Math.min(...values);
        
        return maxError > 0 ? Math.max(0, 1 - (mae / maxError)) : 1;
    }

    async saveModel(modelKey, model) {
        await this.db.run(`
            INSERT OR REPLACE INTO resource_models (id, model_type, model_data, accuracy, training_samples, last_trained, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [modelKey, model.type, JSON.stringify(model), model.accuracy, model.training_samples, model.last_trained, model.is_active]);
    }

    async initializeResourceModels() {
        const models = await this.db.all('SELECT * FROM resource_models WHERE is_active = true');
        
        for (const model of models) {
            this.resourceModels.set(model.id, {
                ...JSON.parse(model.model_data),
                accuracy: model.accuracy,
                training_samples: model.training_samples,
                last_trained: new Date(model.last_trained)
            });
        }
    }

    async loadHistoricalData() {
        const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        const metrics = await this.db.all(`
            SELECT * FROM scaling_metrics 
            WHERE timestamp >= ? 
            ORDER BY timestamp DESC 
            LIMIT 10000
        `, [oneWeekAgo]);

        for (const metric of metrics) {
            this.updateMetricsHistory(
                metric.metric_name, 
                metric.metric_value, 
                metric.service_id, 
                metric.instance_id
            );
        }
    }

    startMonitoring() {
        this.monitoringInterval = setInterval(async () => {
            await this.collectSystemMetrics();
            await this.checkSystemHealth();
        }, 30000);

        console.log('🔍 Predictive scaling monitoring started');
    }

    startModelTraining() {
        this.trainingInterval = setInterval(async () => {
            await this.retrainModels();
            await this.optimizeCosts();
        }, this.config.trainingInterval);

        console.log('🧠 Predictive model training started');
    }

    async collectSystemMetrics() {
        const metrics = [
            { name: 'cpu', value: await this.getCurrentCPUUsage() },
            { name: 'memory', value: await this.getCurrentMemoryUsage() },
            { name: 'throughput', value: await this.getCurrentThroughput() },
            { name: 'latency', value: await this.getCurrentLatency() },
            { name: 'network', value: await this.getCurrentNetworkUsage() }
        ];

        for (const metric of metrics) {
            await this.recordMetric(metric.name, metric.value, 'system', 'monitor', 'infrastructure');
            this.systemMetrics.resourceUtilization[metric.name] = metric.value;
        }

        this.systemMetrics.currentLoad = this.calculateSystemLoad();
        this.systemMetrics.predictedLoad = await this.predictSystemLoad();
    }

    async getCurrentCPUUsage() {
        const startUsage = process.cpuUsage();
        await new Promise(resolve => setTimeout(resolve, 100));
        const endUsage = process.cpuUsage(startUsage);
        
        const elapsed = 100000;
        const usage = (endUsage.user + endUsage.system) / elapsed;
        return Math.min(1, usage);
    }

    async getCurrentMemoryUsage() {
        const used = process.memoryUsage().heapUsed;
        const total = process.memoryUsage().heapTotal;
        return total > 0 ? used / total : 0;
    }

    async getCurrentThroughput() {
        const recentMetrics = await this.db.get(`
            SELECT AVG(metric_value) as avg_throughput 
            FROM scaling_metrics 
            WHERE metric_name = 'requests_per_second' 
            AND timestamp >= datetime('now', '-1 minute')
        `);
        return recentMetrics?.avg_throughput || 0.5;
    }

    async getCurrentLatency() {
        const recentMetrics = await this.db.get(`
            SELECT AVG(metric_value) as avg_latency 
            FROM scaling_metrics 
            WHERE metric_name = 'response_time' 
            AND timestamp >= datetime('now', '-1 minute')
        `);
        const normalized = (recentMetrics?.avg_latency || 100) / 1000;
        return Math.min(1, normalized);
    }

    async getCurrentNetworkUsage() {
        return 0.3;
    }

    calculateSystemLoad() {
        const utilizations = Object.values(this.systemMetrics.resourceUtilization);
        return utilizations.length > 0 ? 
            utilizations.reduce((sum, util) => sum + util, 0) / utilizations.length : 0;
    }

    async predictSystemLoad() {
        const predictions = await Promise.all(
            this.config.scalingMetrics.map(metric => 
                this.predictResourceNeed(metric, 'system')
            )
        );

        const avgPrediction = predictions.reduce((sum, pred) => sum + pred.value, 0) / predictions.length;
        return avgPrediction;
    }

    async checkSystemHealth() {
        for (const [metricName, utilization] of Object.entries(this.systemMetrics.resourceUtilization)) {
            if (utilization > 0.9) {
                await this.triggerPerformanceAlert(metricName, utilization, 0, 'system');
            }
        }
    }

    async retrainModels() {
        for (const [modelKey, model] of this.resourceModels) {
            if (model.training_samples > 1000) {
                await this.updatePredictiveModel(
                    modelKey.split('_')[1],
                    this.getRecentMetricsForModel(modelKey),
                    modelKey.split('_')[0]
                );
            }
        }
    }

    getRecentMetricsForModel(modelKey) {
        const [serviceId, metricName] = modelKey.split('_');
        const history = this.metricsHistory.get(`${serviceId}_default_${metricName}`) || [];
        return history.slice(-100).map(h => h.value);
    }

    async optimizeCosts() {
        const currentCost = await this.calculateCurrentCost();
        const optimizedCost = await this.calculateOptimizedCost();
        const savings = currentCost - optimizedCost;

        if (savings > 0) {
            await this.db.run(`
                INSERT INTO cost_optimization (resource_type, current_cost, optimized_cost, savings, optimization_strategy)
                VALUES (?, ?, ?, ?, ?)
            `, ['compute', currentCost, optimizedCost, savings, 'predictive_scaling']);

            this.events.emit('costOptimized', {
                currentCost,
                optimizedCost,
                savings,
                timestamp: Date.now()
            });
        }
    }

    async calculateCurrentCost() {
        const instances = await this.getCurrentInstanceCount('system');
        return instances * 0.10;
    }

    async calculateOptimizedCost() {
        const optimalInstances = Math.ceil(this.systemMetrics.predictedLoad * 10);
        return optimalInstances * 0.10;
    }

    generateAlertId() {
        return `alert_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
    }

    generatePredictionId() {
        return `pred_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
    }

    generateActionId() {
        return `action_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
    }

    async getScalingAnalytics(timeframe = '24h') {
        const timeFilter = this.getTimeFilter(timeframe);
        
        const scalingStats = await this.db.get(`
            SELECT 
                COUNT(*) as total_actions,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_actions,
                AVG(target_value - current_value) as avg_scale_amount
            FROM scaling_actions 
            WHERE timestamp >= ?
        `, [timeFilter]);

        const predictionStats = await this.db.get(`
            SELECT 
                AVG(confidence) as avg_confidence,
                AVG(accuracy) as avg_accuracy,
                COUNT(*) as total_predictions
            FROM scaling_predictions 
            WHERE timestamp >= ?
        `, [timeFilter]);

        const costStats = await this.db.get(`
            SELECT 
                SUM(savings) as total_savings,
                AVG(savings) as avg_savings
            FROM cost_optimization 
            WHERE timestamp >= ?
        `, [timeFilter]);

        return {
            scaling: scalingStats,
            predictions: predictionStats,
            costs: costStats,
            currentLoad: this.systemMetrics.currentLoad,
            predictedLoad: this.systemMetrics.predictedLoad,
            activeAlerts: this.activeAlerts.size
        };
    }

    getTimeFilter(timeframe) {
        const now = Date.now();
        const periods = {
            '1h': 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000
        };
        return new Date(now - (periods[timeframe] || periods['24h']));
    }

    async shutdown() {
        if (this.monitoringInterval) clearInterval(this.monitoringInterval);
        if (this.trainingInterval) clearInterval(this.trainingInterval);
        
        if (this.db) await this.db.close();
        
        this.initialized = false;
        console.log('✅ Predictive Scaling system shut down');
    }
}

export default PredictiveScaling;
