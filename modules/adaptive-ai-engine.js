// modules/adaptive-ai-engine.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes } from 'crypto';

export class AdaptiveAIEngine {
    constructor(config = {}) {
        this.config = {
            learningRate: 0.01,
            trainingEpochs: 1000,
            batchSize: 32,
            modelTypes: ['neural_network', 'decision_tree', 'ensemble', 'reinforcement_learning'],
            featureEngineering: true,
            autoTuning: true,
            predictionConfidenceThreshold: 0.8,
            modelRetrainingInterval: 24 * 60 * 60 * 1000,
            ...config
        };
        this.aiModels = new Map();
        this.trainingData = new Map();
        this.predictionHistory = new Map();
        this.featureImportance = new Map();
        this.performanceMetrics = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/adaptive-ai.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.trainingQueue = [];
        this.isTraining = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'AdaptiveAIEngine',
            description: 'Advanced adaptive AI engine with continuous learning and real-time optimization',
            registrationFee: 20000,
            annualLicenseFee: 10000,
            revenueShare: 0.25,
            serviceType: 'artificial_intelligence',
            dataPolicy: 'Encrypted training data only - Privacy-preserving AI',
            compliance: ['AI Ethics', 'Data Privacy', 'Model Governance']
        });

        await this.loadPreTrainedModels();
        await this.startTrainingScheduler();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            modelTypes: this.config.modelTypes,
            autoTuning: this.config.autoTuning,
            featureEngineering: this.config.featureEngineering
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS ai_models (
                id TEXT PRIMARY KEY,
                modelType TEXT NOT NULL,
                modelName TEXT NOT NULL,
                description TEXT,
                modelData BLOB NOT NULL,
                featureSet TEXT NOT NULL,
                accuracy REAL DEFAULT 0,
                precision REAL DEFAULT 0,
                recall REAL DEFAULT 0,
                f1Score REAL DEFAULT 0,
                trainingSamples INTEGER DEFAULT 0,
                lastTrained DATETIME DEFAULT CURRENT_TIMESTAMP,
                isActive BOOLEAN DEFAULT true,
                version INTEGER DEFAULT 1,
                hyperparameters TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS training_data (
                id TEXT PRIMARY KEY,
                modelId TEXT NOT NULL,
                features TEXT NOT NULL,
                labels TEXT NOT NULL,
                dataHash TEXT NOT NULL,
                source TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (modelId) REFERENCES ai_models (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS predictions (
                id TEXT PRIMARY KEY,
                modelId TEXT NOT NULL,
                inputData TEXT NOT NULL,
                predictionResult TEXT NOT NULL,
                confidence REAL NOT NULL,
                actualResult TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                feedbackScore INTEGER,
                FOREIGN KEY (modelId) REFERENCES ai_models (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS feature_importance (
                id TEXT PRIMARY KEY,
                modelId TEXT NOT NULL,
                featureName TEXT NOT NULL,
                importanceScore REAL NOT NULL,
                calculationMethod TEXT NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (modelId) REFERENCES ai_models (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS performance_metrics (
                id TEXT PRIMARY KEY,
                modelId TEXT NOT NULL,
                metricType TEXT NOT NULL,
                metricValue REAL NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                period TEXT DEFAULT 'hourly',
                FOREIGN KEY (modelId) REFERENCES ai_models (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS training_jobs (
                id TEXT PRIMARY KEY,
                modelId TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                startTime DATETIME,
                endTime DATETIME,
                epochsCompleted INTEGER DEFAULT 0,
                finalAccuracy REAL DEFAULT 0,
                errorMessage TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async createModel(modelType, modelName, description, featureSet, hyperparameters = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateModelType(modelType);
        await this.validateFeatureSet(featureSet);

        const modelId = this.generateModelId();
        const initialModel = await this.initializeModel(modelType, featureSet, hyperparameters);

        try {
            await this.db.run(`
                INSERT INTO ai_models (id, modelType, modelName, description, modelData, featureSet, hyperparameters)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [modelId, modelType, modelName, description, initialModel, JSON.stringify(featureSet), JSON.stringify(hyperparameters)]);

            const model = {
                id: modelId,
                modelType,
                modelName,
                description,
                featureSet,
                hyperparameters,
                accuracy: 0,
                precision: 0,
                recall: 0,
                f1Score: 0,
                trainingSamples: 0,
                isActive: true,
                version: 1,
                createdAt: new Date()
            };

            this.aiModels.set(modelId, model);

            this.events.emit('modelCreated', {
                modelId,
                modelType,
                modelName,
                featureSet: featureSet.length,
                hyperparameters
            });

            return modelId;
        } catch (error) {
            throw new Error(`Model creation failed: ${error.message}`);
        }
    }

    async validateModelType(modelType) {
        if (!this.config.modelTypes.includes(modelType)) {
            throw new Error(`Unsupported model type: ${modelType}. Supported: ${this.config.modelTypes.join(', ')}`);
        }
    }

    async validateFeatureSet(featureSet) {
        if (!Array.isArray(featureSet) || featureSet.length === 0) {
            throw new Error('Feature set must be a non-empty array');
        }

        if (featureSet.length > 1000) {
            throw new Error('Feature set too large. Maximum 1000 features allowed');
        }

        // Check for duplicate features
        const uniqueFeatures = new Set(featureSet);
        if (uniqueFeatures.size !== featureSet.length) {
            throw new Error('Feature set contains duplicate features');
        }
    }

    async initializeModel(modelType, featureSet, hyperparameters) {
        const modelStructure = {
            type: modelType,
            featureSet,
            hyperparameters,
            weights: this.initializeWeights(modelType, featureSet.length, hyperparameters),
            architecture: this.getModelArchitecture(modelType, featureSet.length, hyperparameters),
            initializedAt: new Date(),
            version: '1.0.0'
        };

        return Buffer.from(JSON.stringify(modelStructure));
    }

    initializeWeights(modelType, featureCount, hyperparameters) {
        switch (modelType) {
            case 'neural_network':
                return this.initializeNeuralNetworkWeights(featureCount, hyperparameters);
            case 'decision_tree':
                return this.initializeDecisionTreeWeights(featureCount);
            case 'ensemble':
                return this.initializeEnsembleWeights(featureCount, hyperparameters);
            case 'reinforcement_learning':
                return this.initializeRLWeights(featureCount, hyperparameters);
            default:
                throw new Error(`Unsupported model type for weight initialization: ${modelType}`);
        }
    }

    initializeNeuralNetworkWeights(featureCount, hyperparameters) {
        const hiddenLayers = hyperparameters.hiddenLayers || [64, 32];
        const layers = [featureCount, ...hiddenLayers, hyperparameters.outputSize || 1];
        const weights = {};

        for (let i = 0; i < layers.length - 1; i++) {
            const layerKey = `layer_${i}`;
            weights[layerKey] = {
                weights: this.randomMatrix(layers[i], layers[i + 1]),
                biases: new Array(layers[i + 1]).fill(0.1)
            };
        }

        return weights;
    }

    initializeDecisionTreeWeights(featureCount) {
        return {
            maxDepth: 10,
            minSamplesSplit: 2,
            minSamplesLeaf: 1,
            featureSubset: Math.sqrt(featureCount),
            initialized: true
        };
    }

    initializeEnsembleWeights(featureCount, hyperparameters) {
        const nEstimators = hyperparameters.nEstimators || 100;
        return {
            nEstimators,
            estimators: Array(nEstimators).fill(null).map(() => 
                this.initializeDecisionTreeWeights(featureCount)
            ),
            voting: hyperparameters.voting || 'soft'
        };
    }

    initializeRLWeights(featureCount, hyperparameters) {
        return {
            stateSize: featureCount,
            actionSize: hyperparameters.actionSize || 10,
            hiddenLayers: hyperparameters.hiddenLayers || [128, 64],
            explorationRate: hyperparameters.explorationRate || 1.0,
            discountFactor: hyperparameters.discountFactor || 0.95,
            memorySize: hyperparameters.memorySize || 10000
        };
    }

    randomMatrix(rows, cols) {
        const matrix = [];
        for (let i = 0; i < rows; i++) {
            matrix[i] = [];
            for (let j = 0; j < cols; j++) {
                matrix[i][j] = (Math.random() - 0.5) * 2;
            }
        }
        return matrix;
    }

    getModelArchitecture(modelType, featureCount, hyperparameters) {
        const baseArchitecture = {
            featureCount,
            inputNormalization: true,
            dropout: hyperparameters.dropout || 0.2,
            batchNormalization: hyperparameters.batchNormalization || true
        };

        switch (modelType) {
            case 'neural_network':
                return {
                    ...baseArchitecture,
                    type: 'feedforward',
                    activation: hyperparameters.activation || 'relu',
                    outputActivation: hyperparameters.outputActivation || 'sigmoid',
                    hiddenLayers: hyperparameters.hiddenLayers || [64, 32]
                };
            case 'decision_tree':
                return {
                    ...baseArchitecture,
                    type: 'categorical',
                    splitCriterion: hyperparameters.splitCriterion || 'gini',
                    maxDepth: hyperparameters.maxDepth || 10
                };
            case 'ensemble':
                return {
                    ...baseArchitecture,
                    type: 'bagging',
                    baseEstimator: hyperparameters.baseEstimator || 'decision_tree',
                    nEstimators: hyperparameters.nEstimators || 100
                };
            case 'reinforcement_learning':
                return {
                    ...baseArchitecture,
                    type: 'deep_q_network',
                    memory: 'experience_replay',
                    updateFrequency: hyperparameters.updateFrequency || 100
                };
            default:
                return baseArchitecture;
        }
    }

    async trainModel(modelId, trainingData, validationData = null, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const model = await this.getModel(modelId);
        if (!model) {
            throw new Error(`Model not found: ${modelId}`);
        }

        const jobId = this.generateJobId();
        
        try {
            await this.db.run(`
                INSERT INTO training_jobs (id, modelId, status, startTime)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `, [jobId, modelId, 'running']);

            // Store training data
            await this.storeTrainingData(modelId, trainingData);

            // Perform feature engineering if enabled
            const engineeredData = this.config.featureEngineering ? 
                await this.performFeatureEngineering(trainingData, model.featureSet) : 
                trainingData;

            // Train the model
            const trainingResult = await this.executeTraining(
                model, 
                engineeredData, 
                validationData, 
                options
            );

            // Update model with new weights and metrics
            await this.updateModelAfterTraining(modelId, trainingResult);

            await this.db.run(`
                UPDATE training_jobs 
                SET status = 'completed', endTime = CURRENT_TIMESTAMP, finalAccuracy = ?, epochsCompleted = ?
                WHERE id = ?
            `, [trainingResult.accuracy, trainingResult.epochsCompleted, jobId]);

            // Calculate feature importance
            await this.calculateFeatureImportance(modelId, engineeredData);

            this.events.emit('modelTrained', {
                modelId,
                jobId,
                accuracy: trainingResult.accuracy,
                trainingSamples: trainingData.length,
                epochs: trainingResult.epochsCompleted,
                duration: trainingResult.trainingTime
            });

            return {
                success: true,
                jobId,
                accuracy: trainingResult.accuracy,
                trainingSamples: trainingData.length,
                epochs: trainingResult.epochsCompleted
            };
        } catch (error) {
            await this.db.run(`
                UPDATE training_jobs 
                SET status = 'failed', errorMessage = ?
                WHERE id = ?
            `, [error.message, jobId]);

            throw new Error(`Model training failed: ${error.message}`);
        }
    }

    async storeTrainingData(modelId, trainingData) {
        for (const dataPoint of trainingData) {
            const dataId = this.generateDataId();
            const dataHash = this.hashData(dataPoint);
            
            await this.db.run(`
                INSERT INTO training_data (id, modelId, features, labels, dataHash)
                VALUES (?, ?, ?, ?, ?)
            `, [dataId, modelId, JSON.stringify(dataPoint.features), JSON.stringify(dataPoint.labels), dataHash]);
        }
    }

    async performFeatureEngineering(trainingData, featureSet) {
        const engineeredData = [];
        
        for (const dataPoint of trainingData) {
            const engineeredFeatures = {};
            
            // Basic feature engineering operations
            for (const feature of featureSet) {
                const value = dataPoint.features[feature];
                
                if (typeof value === 'number') {
                    // Create polynomial features
                    engineeredFeatures[`${feature}_squared`] = value * value;
                    engineeredFeatures[`${feature}_sqrt`] = Math.sqrt(Math.abs(value));
                    
                    // Create interaction features
                    for (const otherFeature of featureSet) {
                        if (otherFeature !== feature && typeof dataPoint.features[otherFeature] === 'number') {
                            engineeredFeatures[`${feature}_x_${otherFeature}`] = 
                                value * dataPoint.features[otherFeature];
                        }
                    }
                }
            }
            
            engineeredData.push({
                ...dataPoint,
                features: {
                    ...dataPoint.features,
                    ...engineeredFeatures
                }
            });
        }
        
        return engineeredData;
    }

    async executeTraining(model, trainingData, validationData, options) {
        const startTime = Date.now();
        const epochs = options.epochs || this.config.trainingEpochs;
        const batchSize = options.batchSize || this.config.batchSize;
        
        let bestAccuracy = 0;
        let bestWeights = null;
        let currentEpoch = 0;

        for (currentEpoch = 0; currentEpoch < epochs; currentEpoch++) {
            const epochAccuracy = await this.trainEpoch(
                model, 
                trainingData, 
                batchSize, 
                options.learningRate || this.config.learningRate
            );

            if (epochAccuracy > bestAccuracy) {
                bestAccuracy = epochAccuracy;
                bestWeights = JSON.parse(JSON.stringify(model.weights));
            }

            // Early stopping if no improvement
            if (currentEpoch > 100 && epochAccuracy < bestAccuracy * 0.95) {
                break;
            }

            // Update learning rate if adaptive
            if (options.adaptiveLearningRate) {
                this.updateLearningRate(model, currentEpoch, epochAccuracy);
            }
        }

        return {
            accuracy: bestAccuracy,
            weights: bestWeights,
            epochsCompleted: currentEpoch,
            trainingTime: Date.now() - startTime,
            finalLoss: await this.calculateLoss(model, trainingData)
        };
    }

    async trainEpoch(model, trainingData, batchSize, learningRate) {
        let totalAccuracy = 0;
        const batches = this.createBatches(trainingData, batchSize);

        for (const batch of batches) {
            const batchAccuracy = await this.trainBatch(model, batch, learningRate);
            totalAccuracy += batchAccuracy;
        }

        return totalAccuracy / batches.length;
    }

    async trainBatch(model, batch, learningRate) {
        let correctPredictions = 0;

        for (const dataPoint of batch) {
            const prediction = await this.makePrediction(model, dataPoint.features);
            const error = this.calculateError(prediction, dataPoint.labels);
            
            await this.updateWeights(model, dataPoint.features, error, learningRate);
            
            if (this.isPredictionCorrect(prediction, dataPoint.labels)) {
                correctPredictions++;
            }
        }

        return correctPredictions / batch.length;
    }

    async makePrediction(model, features) {
        switch (model.modelType) {
            case 'neural_network':
                return this.neuralNetworkPredict(model, features);
            case 'decision_tree':
                return this.decisionTreePredict(model, features);
            case 'ensemble':
                return this.ensemblePredict(model, features);
            case 'reinforcement_learning':
                return this.rlPredict(model, features);
            default:
                throw new Error(`Unsupported model type for prediction: ${model.modelType}`);
        }
    }

    neuralNetworkPredict(model, features) {
        let activation = this.extractFeatures(features, model.featureSet);
        
        for (const layerKey in model.weights) {
            const layer = model.weights[layerKey];
            activation = this.matrixMultiply(activation, layer.weights);
            activation = this.vectorAdd(activation, layer.biases);
            activation = this.applyActivation(activation, model.hyperparameters.activation || 'relu');
        }
        
        return this.applyActivation(activation, model.hyperparameters.outputActivation || 'sigmoid');
    }

    decisionTreePredict(model, features) {
        // Simplified decision tree prediction
        const featureValues = this.extractFeatures(features, model.featureSet);
        const weightedSum = featureValues.reduce((sum, value, index) => 
            sum + value * (model.weights.featureImportance?.[index] || 1), 0);
        
        return this.sigmoid(weightedSum);
    }

    ensemblePredict(model, features) {
        const predictions = model.weights.estimators.map(estimator => 
            this.decisionTreePredict({ weights: estimator, featureSet: model.featureSet }, features)
        );
        
        return predictions.reduce((sum, pred) => sum + pred, 0) / predictions.length;
    }

    rlPredict(model, features) {
        const state = this.extractFeatures(features, model.featureSet);
        const qValues = this.neuralNetworkPredict(
            { ...model, modelType: 'neural_network' }, 
            state
        );
        
        return this.softmax(qValues);
    }

    extractFeatures(features, featureSet) {
        return featureSet.map(feature => features[feature] || 0);
    }

    matrixMultiply(vector, matrix) {
        const result = [];
        for (let j = 0; j < matrix[0].length; j++) {
            let sum = 0;
            for (let i = 0; i < vector.length; i++) {
                sum += vector[i] * matrix[i][j];
            }
            result.push(sum);
        }
        return result;
    }

    vectorAdd(vector, biases) {
        return vector.map((value, index) => value + (biases[index] || 0));
    }

    applyActivation(vector, activation) {
        switch (activation) {
            case 'relu':
                return vector.map(x => Math.max(0, x));
            case 'sigmoid':
                return vector.map(x => 1 / (1 + Math.exp(-x)));
            case 'tanh':
                return vector.map(x => Math.tanh(x));
            case 'softmax':
                const expVector = vector.map(x => Math.exp(x));
                const sum = expVector.reduce((a, b) => a + b, 0);
                return expVector.map(x => x / sum);
            default:
                return vector;
        }
    }

    sigmoid(x) {
        return 1 / (1 + Math.exp(-x));
    }

    softmax(vector) {
        const expVector = vector.map(x => Math.exp(x));
        const sum = expVector.reduce((a, b) => a + b, 0);
        return expVector.map(x => x / sum);
    }

    calculateError(prediction, actual) {
        if (Array.isArray(prediction) && Array.isArray(actual)) {
            return prediction.map((p, i) => p - actual[i]);
        }
        return prediction - actual;
    }

    isPredictionCorrect(prediction, actual) {
        if (Array.isArray(prediction) && Array.isArray(actual)) {
            return prediction.every((p, i) => Math.abs(p - actual[i]) < 0.5);
        }
        return Math.abs(prediction - actual) < 0.5;
    }

    async updateWeights(model, features, error, learningRate) {
        // Simplified weight update (real implementation would use backpropagation)
        const featureValues = this.extractFeatures(features, model.featureSet);
        
        switch (model.modelType) {
            case 'neural_network':
                await this.updateNeuralNetworkWeights(model, featureValues, error, learningRate);
                break;
            case 'decision_tree':
                await this.updateDecisionTreeWeights(model, featureValues, error, learningRate);
                break;
            // Other model types would have their own update methods
        }
    }

    async updateNeuralNetworkWeights(model, features, error, learningRate) {
        // Simplified backpropagation
        for (const layerKey in model.weights) {
            const layer = model.weights[layerKey];
            const gradient = this.calculateGradient(features, error, learningRate);
            
            for (let i = 0; i < layer.weights.length; i++) {
                for (let j = 0; j < layer.weights[i].length; j++) {
                    layer.weights[i][j] -= learningRate * gradient[i][j];
                }
            }
        }
    }

    calculateGradient(features, error, learningRate) {
        const gradient = [];
        for (let i = 0; i < features.length; i++) {
            gradient[i] = [];
            for (let j = 0; j < error.length; j++) {
                gradient[i][j] = features[i] * error[j] * learningRate;
            }
        }
        return gradient;
    }

    async updateDecisionTreeWeights(model, features, error, learningRate) {
        // Update feature importance based on error
        if (!model.weights.featureImportance) {
            model.weights.featureImportance = new Array(features.length).fill(1);
        }
        
        for (let i = 0; i < features.length; i++) {
            const featureContribution = Math.abs(features[i] * error);
            model.weights.featureImportance[i] += featureContribution * learningRate;
        }
    }

    async updateModelAfterTraining(modelId, trainingResult) {
        const model = await this.getModel(modelId);
        model.weights = trainingResult.weights;
        model.accuracy = trainingResult.accuracy;
        model.trainingSamples += trainingResult.trainingSamples;
        model.version += 1;
        model.lastTrained = new Date();

        await this.db.run(`
            UPDATE ai_models 
            SET modelData = ?, accuracy = ?, trainingSamples = ?, version = ?, lastTrained = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [Buffer.from(JSON.stringify(model)), trainingResult.accuracy, model.trainingSamples, model.version, modelId]);

        // Store performance metrics
        await this.storePerformanceMetrics(modelId, 'accuracy', trainingResult.accuracy);
        await this.storePerformanceMetrics(modelId, 'loss', trainingResult.finalLoss);
    }

    async calculateFeatureImportance(modelId, trainingData) {
        const model = await this.getModel(modelId);
        const importanceScores = {};

        // Calculate importance using permutation importance
        const baselineAccuracy = await this.calculateModelAccuracy(model, trainingData);
        
        for (const feature of model.featureSet) {
            const shuffledData = this.shuffleFeature(trainingData, feature);
            const shuffledAccuracy = await this.calculateModelAccuracy(model, shuffledData);
            
            importanceScores[feature] = baselineAccuracy - shuffledAccuracy;
        }

        // Store importance scores
        for (const [feature, score] of Object.entries(importanceScores)) {
            const importanceId = this.generateImportanceId();
            
            await this.db.run(`
                INSERT INTO feature_importance (id, modelId, featureName, importanceScore, calculationMethod)
                VALUES (?, ?, ?, ?, ?)
            `, [importanceId, modelId, feature, score, 'permutation_importance']);
        }

        this.featureImportance.set(modelId, importanceScores);
        
        return importanceScores;
    }

    async calculateModelAccuracy(model, data) {
        let correct = 0;
        
        for (const dataPoint of data) {
            const prediction = await this.makePrediction(model, dataPoint.features);
            if (this.isPredictionCorrect(prediction, dataPoint.labels)) {
                correct++;
            }
        }
        
        return correct / data.length;
    }

    shuffleFeature(data, feature) {
        return data.map(dataPoint => ({
            ...dataPoint,
            features: {
                ...dataPoint.features,
                [feature]: dataPoint.features[feature] * (0.8 + Math.random() * 0.4) // Add noise
            }
        }));
    }

    async predict(modelId, inputData, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const model = await this.getModel(modelId);
        if (!model) {
            throw new Error(`Model not found: ${modelId}`);
        }

        if (!model.isActive) {
            throw new Error(`Model is not active: ${modelId}`);
        }

        try {
            const startTime = Date.now();
            const prediction = await this.makePrediction(model, inputData);
            const confidence = await this.calculatePredictionConfidence(model, inputData, prediction);
            const predictionId = this.generatePredictionId();

            // Store prediction
            await this.db.run(`
                INSERT INTO predictions (id, modelId, inputData, predictionResult, confidence)
                VALUES (?, ?, ?, ?, ?)
            `, [predictionId, modelId, JSON.stringify(inputData), JSON.stringify(prediction), confidence]);

            this.predictionHistory.set(predictionId, {
                id: predictionId,
                modelId,
                inputData,
                prediction,
                confidence,
                timestamp: new Date()
            });

            // Check confidence threshold
            if (confidence < this.config.predictionConfidenceThreshold) {
                this.events.emit('lowConfidencePrediction', {
                    predictionId,
                    modelId,
                    confidence,
                    threshold: this.config.predictionConfidenceThreshold
                });
            }

            this.events.emit('predictionMade', {
                predictionId,
                modelId,
                prediction,
                confidence,
                inferenceTime: Date.now() - startTime
            });

            return {
                prediction,
                confidence,
                predictionId,
                modelVersion: model.version
            };
        } catch (error) {
            throw new Error(`Prediction failed: ${error.message}`);
        }
    }

    async calculatePredictionConfidence(model, inputData, prediction) {
        // Calculate confidence based on model certainty and input data characteristics
        const featureValues = this.extractFeatures(inputData, model.featureSet);
        const variance = this.calculateFeatureVariance(featureValues);
        const modelCertainty = this.calculateModelCertainty(model, prediction);
        
        return Math.min(1, (modelCertainty + (1 - variance)) / 2);
    }

    calculateFeatureVariance(featureValues) {
        const mean = featureValues.reduce((sum, val) => sum + val, 0) / featureValues.length;
        const variance = featureValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / featureValues.length;
        return Math.min(1, variance);
    }

    calculateModelCertainty(model, prediction) {
        if (Array.isArray(prediction)) {
            const maxProb = Math.max(...prediction);
            return maxProb;
        }
        return Math.abs(prediction - 0.5) * 2;
    }

    async provideFeedback(predictionId, actualResult, feedbackScore) {
        await this.db.run(`
            UPDATE predictions 
            SET actualResult = ?, feedbackScore = ?
            WHERE id = ?
        `, [JSON.stringify(actualResult), feedbackScore, predictionId]);

        const prediction = await this.db.get(
            'SELECT * FROM predictions WHERE id = ?',
            [predictionId]
        );

        if (prediction) {
            // Use feedback for continuous learning
            await this.incorporateFeedback(prediction.modelId, prediction, actualResult, feedbackScore);
        }

        this.events.emit('feedbackProvided', {
            predictionId,
            actualResult,
            feedbackScore,
            modelId: prediction?.modelId
        });
    }

    async incorporateFeedback(modelId, prediction, actualResult, feedbackScore) {
        // Add feedback to training data for continuous learning
        const trainingData = [{
            features: JSON.parse(prediction.inputData),
            labels: actualResult
        }];

        // Schedule retraining if feedback indicates model degradation
        if (feedbackScore < 0.5) {
            this.scheduleRetraining(modelId, trainingData);
        }
    }

    async scheduleRetraining(modelId, additionalData) {
        this.trainingQueue.push({
            modelId,
            additionalData,
            priority: 'high',
            scheduledAt: new Date()
        });

        if (!this.isTraining) {
            await this.processTrainingQueue();
        }
    }

    async processTrainingQueue() {
        if (this.isTraining || this.trainingQueue.length === 0) return;

        this.isTraining = true;

        while (this.trainingQueue.length > 0) {
            const job = this.trainingQueue.shift();
            try {
                await this.retrainModel(job.modelId, job.additionalData);
            } catch (error) {
                console.error(`Retraining failed for model ${job.modelId}:`, error);
            }
        }

        this.isTraining = false;
    }

    async retrainModel(modelId, additionalData) {
        const model = await this.getModel(modelId);
        const existingData = await this.getTrainingData(modelId, 1000); // Get recent data
        
        const combinedData = [...existingData, ...additionalData];
        
        await this.trainModel(modelId, combinedData, null, {
            epochs: 100,
            learningRate: this.config.learningRate * 0.5 // Lower learning rate for fine-tuning
        });
    }

    async getTrainingData(modelId, limit = 100) {
        return await this.db.all(`
            SELECT features, labels FROM training_data 
            WHERE modelId = ? 
            ORDER BY timestamp DESC 
            LIMIT ?
        `, [modelId, limit]);
    }

    async storePerformanceMetrics(modelId, metricType, metricValue) {
        const metricId = this.generateMetricId();
        
        await this.db.run(`
            INSERT INTO performance_metrics (id, modelId, metricType, metricValue)
            VALUES (?, ?, ?, ?)
        `, [metricId, modelId, metricType, metricValue]);

        // Update performance metrics cache
        if (!this.performanceMetrics.has(modelId)) {
            this.performanceMetrics.set(modelId, new Map());
        }
        this.performanceMetrics.get(modelId).set(metricType, metricValue);
    }

    async startTrainingScheduler() {
        setInterval(async () => {
            await this.schedulePeriodicRetraining();
        }, this.config.modelRetrainingInterval);
    }

    async schedulePeriodicRetraining() {
        const models = await this.db.all(
            'SELECT id FROM ai_models WHERE isActive = true'
        );

        for (const model of models) {
            this.trainingQueue.push({
                modelId: model.id,
                additionalData: [],
                priority: 'low',
                scheduledAt: new Date()
            });
        }

        await this.processTrainingQueue();
    }

    async getModelPerformance(modelId) {
        const metrics = await this.db.all(`
            SELECT metricType, metricValue, timestamp 
            FROM performance_metrics 
            WHERE modelId = ? 
            ORDER BY timestamp DESC 
            LIMIT 100
        `, [modelId]);

        const featureImportance = await this.db.all(`
            SELECT featureName, importanceScore 
            FROM feature_importance 
            WHERE modelId = ? 
            ORDER BY importanceScore DESC
        `, [modelId]);

        const recentPredictions = await this.db.all(`
            SELECT confidence, feedbackScore 
            FROM predictions 
            WHERE modelId = ? 
            ORDER BY timestamp DESC 
            LIMIT 50
        `, [modelId]);

        return {
            modelId,
            metrics: this.aggregateMetrics(metrics),
            featureImportance,
            predictionStats: this.calculatePredictionStats(recentPredictions),
            timestamp: new Date()
        };
    }

    aggregateMetrics(metrics) {
        const aggregated = {};
        
        for (const metric of metrics) {
            if (!aggregated[metric.metricType]) {
                aggregated[metric.metricType] = [];
            }
            aggregated[metric.metricType].push(metric.metricValue);
        }

        for (const [metricType, values] of Object.entries(aggregated)) {
            aggregated[metricType] = {
                current: values[0],
                average: values.reduce((a, b) => a + b, 0) / values.length,
                trend: this.calculateTrend(values),
                min: Math.min(...values),
                max: Math.max(...values)
            };
        }

        return aggregated;
    }

    calculateTrend(values) {
        if (values.length < 2) return 'stable';
        
        const recent = values.slice(0, 5);
        const older = values.slice(-5);
        
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;
        
        if (recentAvg > olderAvg * 1.05) return 'improving';
        if (recentAvg < olderAvg * 0.95) return 'declining';
        return 'stable';
    }

    calculatePredictionStats(predictions) {
        const confidences = predictions.map(p => p.confidence);
        const feedbackScores = predictions.filter(p => p.feedbackScore !== null).map(p => p.feedbackScore);
        
        return {
            totalPredictions: predictions.length,
            averageConfidence: confidences.reduce((a, b) => a + b, 0) / confidences.length,
            averageFeedback: feedbackScores.length > 0 ? 
                feedbackScores.reduce((a, b) => a + b, 0) / feedbackScores.length : null,
            lowConfidenceCount: confidences.filter(c => c < this.config.predictionConfidenceThreshold).length
        };
    }

    generateModelId() {
        return `model_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
    }

    generateJobId() {
        return `job_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
    }

    generateDataId() {
        return `data_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
    }

    generatePredictionId() {
        return `pred_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
    }

    generateImportanceId() {
        return `imp_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
    }

    generateMetricId() {
        return `metric_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
    }

    hashData(data) {
        return createHash('sha256').update(JSON.stringify(data)).digest('hex');
    }

    createBatches(data, batchSize) {
        const batches = [];
        for (let i = 0; i < data.length; i += batchSize) {
            batches.push(data.slice(i, i + batchSize));
        }
        return batches;
    }

    calculateLoss(model, data) {
        let totalLoss = 0;
        
        for (const dataPoint of data) {
            const prediction = this.makePrediction(model, dataPoint.features);
            const error = this.calculateError(prediction, dataPoint.labels);
            totalLoss += Math.pow(Array.isArray(error) ? error[0] : error, 2);
        }
        
        return totalLoss / data.length;
    }

    updateLearningRate(model, epoch, accuracy) {
        // Adaptive learning rate adjustment
        if (epoch > 100 && accuracy < 0.8) {
            model.hyperparameters.learningRate *= 0.9;
        }
    }

    async getModel(modelId) {
        if (this.aiModels.has(modelId)) {
            return this.aiModels.get(modelId);
        }

        const modelData = await this.db.get('SELECT * FROM ai_models WHERE id = ?', [modelId]);
        if (modelData) {
            const model = {
                ...modelData,
                featureSet: JSON.parse(modelData.featureSet),
                hyperparameters: JSON.parse(modelData.hyperparameters),
                weights: JSON.parse(modelData.modelData.toString()).weights
            };
            this.aiModels.set(modelId, model);
            return model;
        }
        return null;
    }

    async loadPreTrainedModels() {
        // Load any pre-trained models for common use cases
        const preTrainedModels = [
            {
                id: 'fraud_detection_v1',
                modelType: 'neural_network',
                modelName: 'Fraud Detection Model',
                description: 'Pre-trained model for financial fraud detection',
                featureSet: ['transaction_amount', 'location', 'time_of_day', 'user_behavior'],
                hyperparameters: { hiddenLayers: [64, 32], activation: 'relu' }
            },
            {
                id: 'market_prediction_v1',
                modelType: 'ensemble',
                modelName: 'Market Prediction Model',
                description: 'Pre-trained model for financial market predictions',
                featureSet: ['price_history', 'volume', 'market_sentiment', 'economic_indicators'],
                hyperparameters: { nEstimators: 100, voting: 'soft' }
            }
        ];

        for (const modelConfig of preTrainedModels) {
            if (!(await this.getModel(modelConfig.id))) {
                await this.createModel(
                    modelConfig.modelType,
                    modelConfig.modelName,
                    modelConfig.description,
                    modelConfig.featureSet,
                    modelConfig.hyperparameters
                );
            }
        }
    }
}

export default AdaptiveAIEngine;
