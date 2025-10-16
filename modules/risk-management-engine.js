// modules/risk-management-engine.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createHmac } from 'crypto';

export class RiskManagementEngine {
    constructor(config = {}) {
        this.config = {
            riskModels: ['VaR', 'CVaR', 'StressTesting', 'ScenarioAnalysis', 'MonteCarlo'],
            confidenceLevel: 0.95,
            timeHorizon: 1,
            maxPortfolioValue: 100000000,
            riskLimits: {
                singleAsset: 0.1,
                sector: 0.25,
                totalPortfolio: 1.0
            },
            alertThresholds: {
                warning: 0.7,
                critical: 0.9
            },
            ...config
        };
        this.riskMetrics = new Map();
        this.portfolioPositions = new Map();
        this.correlationMatrix = new Map();
        this.volatilitySurface = new Map();
        this.riskAlerts = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/risk-management.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.marketDataCache = new Map();
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'RiskManagementEngine',
            description: 'Advanced risk management system with real-time VaR, stress testing, and scenario analysis',
            registrationFee: 15000,
            annualLicenseFee: 7500,
            revenueShare: 0.12,
            serviceType: 'financial_risk_management',
            dataPolicy: 'Encrypted risk data only - No sensitive financial information storage',
            compliance: ['Financial Risk Management', 'Regulatory Compliance']
        });

        await this.loadHistoricalData();
        await this.initializeRiskModels();
        this.startRiskMonitoring();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            riskModels: this.config.riskModels,
            confidenceLevel: this.config.confidenceLevel
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS portfolio_positions (
                id TEXT PRIMARY KEY,
                assetId TEXT NOT NULL,
                assetType TEXT NOT NULL,
                quantity REAL NOT NULL,
                averagePrice REAL NOT NULL,
                currentPrice REAL NOT NULL,
                marketValue REAL NOT NULL,
                sector TEXT NOT NULL,
                currency TEXT DEFAULT 'USD',
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS risk_metrics (
                id TEXT PRIMARY KEY,
                metricType TEXT NOT NULL,
                portfolioId TEXT NOT NULL,
                value REAL NOT NULL,
                confidenceLevel REAL NOT NULL,
                timeHorizon INTEGER NOT NULL,
                calculationTime INTEGER NOT NULL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS correlation_data (
                assetA TEXT NOT NULL,
                assetB TEXT NOT NULL,
                correlation REAL NOT NULL,
                period TEXT NOT NULL,
                dataPoints INTEGER NOT NULL,
                lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (assetA, assetB, period)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS volatility_data (
                assetId TEXT NOT NULL,
                period TEXT NOT NULL,
                volatility REAL NOT NULL,
                annualizedVol REAL NOT NULL,
                dataPoints INTEGER NOT NULL,
                lastUpdated DATETIME DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (assetId, period)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS risk_alerts (
                id TEXT PRIMARY KEY,
                alertType TEXT NOT NULL,
                severity TEXT NOT NULL,
                portfolioId TEXT NOT NULL,
                metricType TEXT NOT NULL,
                threshold REAL NOT NULL,
                actualValue REAL NOT NULL,
                description TEXT NOT NULL,
                triggeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                acknowledgedAt DATETIME,
                status TEXT DEFAULT 'active'
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS stress_test_scenarios (
                id TEXT PRIMARY KEY,
                scenarioName TEXT NOT NULL,
                scenarioType TEXT NOT NULL,
                parameters TEXT NOT NULL,
                results TEXT NOT NULL,
                executedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async addPortfolioPosition(positionData) {
        if (!this.initialized) await this.initialize();
        
        await this.validatePositionData(positionData);

        const positionId = this.generatePositionId();
        const marketValue = positionData.quantity * positionData.currentPrice;

        await this.db.run(`
            INSERT INTO portfolio_positions (id, assetId, assetType, quantity, averagePrice, currentPrice, marketValue, sector, currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [positionId, positionData.assetId, positionData.assetType, positionData.quantity, 
            positionData.averagePrice, positionData.currentPrice, marketValue, 
            positionData.sector, positionData.currency]);

        this.portfolioPositions.set(positionId, {
            ...positionData,
            id: positionId,
            marketValue,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        await this.updatePortfolioRiskMetrics();

        this.events.emit('positionAdded', {
            positionId,
            assetId: positionData.assetId,
            marketValue,
            timestamp: new Date()
        });

        return positionId;
    }

    async validatePositionData(positionData) {
        const required = ['assetId', 'assetType', 'quantity', 'currentPrice', 'sector'];
        for (const field of required) {
            if (!positionData[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        if (positionData.quantity <= 0) {
            throw new Error('Quantity must be positive');
        }

        if (positionData.currentPrice <= 0) {
            throw new Error('Current price must be positive');
        }

        const totalPortfolioValue = await this.calculateTotalPortfolioValue();
        const newPositionValue = positionData.quantity * positionData.currentPrice;

        if (totalPortfolioValue + newPositionValue > this.config.maxPortfolioValue) {
            throw new Error('Position would exceed maximum portfolio value');
        }
    }

    async calculateTotalPortfolioValue() {
        const result = await this.db.get(`
            SELECT SUM(marketValue) as totalValue 
            FROM portfolio_positions
        `);
        return result?.totalValue || 0;
    }

    async calculateValueAtRisk(portfolioId = 'default', timeHorizon = null, confidenceLevel = null) {
        if (!this.initialized) await this.initialize();
        
        const horizon = timeHorizon || this.config.timeHorizon;
        const confidence = confidenceLevel || this.config.confidenceLevel;

        const positions = await this.getPortfolioPositions(portfolioId);
        if (positions.length === 0) {
            throw new Error('No positions in portfolio for VaR calculation');
        }

        const startTime = Date.now();
        
        try {
            // Historical Simulation Method
            const historicalVaR = await this.calculateHistoricalVaR(positions, horizon, confidence);
            
            // Parametric (Variance-Covariance) Method
            const parametricVaR = await this.calculateParametricVaR(positions, horizon, confidence);
            
            // Monte Carlo Simulation
            const monteCarloVaR = await this.calculateMonteCarloVaR(positions, horizon, confidence);

            // Use weighted average of methods
            const finalVaR = this.combineVaRMethods([historicalVaR, parametricVaR, monteCarloVaR]);

            const calculationTime = Date.now() - startTime;

            await this.storeRiskMetric('VaR', portfolioId, finalVaR, confidence, horizon, calculationTime);

            this.events.emit('varCalculated', {
                portfolioId,
                value: finalVaR,
                confidenceLevel: confidence,
                timeHorizon: horizon,
                calculationTime,
                timestamp: new Date()
            });

            return finalVaR;
        } catch (error) {
            throw new Error(`VaR calculation failed: ${error.message}`);
        }
    }

    async calculateHistoricalVaR(positions, horizon, confidence) {
        const historicalReturns = await this.getHistoricalReturns(positions, 252); // 1 year of data
        const portfolioReturns = this.calculatePortfolioReturns(positions, historicalReturns);
        
        const sortedReturns = portfolioReturns.sort((a, b) => a - b);
        const varIndex = Math.floor((1 - confidence) * sortedReturns.length);
        
        return Math.abs(sortedReturns[varIndex]) * this.calculatePortfolioValue(positions);
    }

    async calculateParametricVaR(positions, horizon, confidence) {
        const portfolioValue = this.calculatePortfolioValue(positions);
        const portfolioVolatility = await this.calculatePortfolioVolatility(positions);
        
        const zScore = this.calculateZScore(confidence);
        const timeFactor = Math.sqrt(horizon / 252); // Annualized
        
        return portfolioValue * portfolioVolatility * zScore * timeFactor;
    }

    async calculateMonteCarloVaR(positions, horizon, confidence) {
        const simulations = 10000;
        const portfolioValue = this.calculatePortfolioValue(positions);
        const portfolioReturns = [];
        
        for (let i = 0; i < simulations; i++) {
            const simulatedReturn = await this.simulatePortfolioReturn(positions, horizon);
            portfolioReturns.push(simulatedReturn);
        }
        
        const sortedReturns = portfolioReturns.sort((a, b) => a - b);
        const varIndex = Math.floor((1 - confidence) * simulations);
        
        return Math.abs(sortedReturns[varIndex]) * portfolioValue;
    }

    async calculatePortfolioVolatility(positions) {
        const weights = this.calculatePositionWeights(positions);
        const covarianceMatrix = await this.buildCovarianceMatrix(positions);
        
        let portfolioVariance = 0;
        for (let i = 0; i < positions.length; i++) {
            for (let j = 0; j < positions.length; j++) {
                portfolioVariance += weights[i] * weights[j] * covarianceMatrix[i][j];
            }
        }
        
        return Math.sqrt(portfolioVariance);
    }

    async buildCovarianceMatrix(positions) {
        const matrix = [];
        const assetIds = positions.map(p => p.assetId);
        
        for (let i = 0; i < assetIds.length; i++) {
            matrix[i] = [];
            for (let j = 0; j < assetIds.length; j++) {
                const correlation = await this.getCorrelation(assetIds[i], assetIds[j]);
                const volI = await this.getVolatility(assetIds[i]);
                const volJ = await this.getVolatility(assetIds[j]);
                
                matrix[i][j] = correlation * volI * volJ;
            }
        }
        
        return matrix;
    }

    async calculateConditionalVaR(portfolioId = 'default', timeHorizon = null, confidenceLevel = null) {
        const varValue = await this.calculateValueAtRisk(portfolioId, timeHorizon, confidenceLevel);
        const tailLosses = await this.calculateTailLosses(portfolioId, varValue);
        
        // CVaR is the average of losses exceeding VaR
        const cvar = tailLosses.reduce((sum, loss) => sum + loss, 0) / tailLosses.length;
        
        await this.storeRiskMetric('CVaR', portfolioId, cvar, confidenceLevel, timeHorizon, 0);
        
        return cvar;
    }

    async runStressTest(scenario) {
        if (!this.initialized) await this.initialize();
        
        await this.validateStressScenario(scenario);

        const scenarioId = this.generateScenarioId();
        const startTime = Date.now();

        try {
            const results = await this.executeStressScenario(scenario);
            const executionTime = Date.now() - startTime;

            await this.db.run(`
                INSERT INTO stress_test_scenarios (id, scenarioName, scenarioType, parameters, results)
                VALUES (?, ?, ?, ?, ?)
            `, [scenarioId, scenario.name, scenario.type, JSON.stringify(scenario.parameters), JSON.stringify(results)]);

            this.events.emit('stressTestCompleted', {
                scenarioId,
                scenarioName: scenario.name,
                results,
                executionTime,
                timestamp: new Date()
            });

            return { scenarioId, results };
        } catch (error) {
            throw new Error(`Stress test failed: ${error.message}`);
        }
    }

    async executeStressScenario(scenario) {
        const positions = await this.getPortfolioPositions();
        const results = {
            initialValue: this.calculatePortfolioValue(positions),
            stressedValue: 0,
            lossAmount: 0,
            lossPercentage: 0,
            affectedPositions: []
        };

        const stressedPositions = positions.map(position => {
            const stressFactor = this.calculateStressFactor(position, scenario);
            const stressedValue = position.marketValue * stressFactor;
            
            results.affectedPositions.push({
                assetId: position.assetId,
                initialValue: position.marketValue,
                stressedValue,
                stressFactor
            });

            return { ...position, marketValue: stressedValue };
        });

        results.stressedValue = this.calculatePortfolioValue(stressedPositions);
        results.lossAmount = results.initialValue - results.stressedValue;
        results.lossPercentage = (results.lossAmount / results.initialValue) * 100;

        return results;
    }

    calculateStressFactor(position, scenario) {
        let stressFactor = 1.0;

        switch (scenario.type) {
            case 'market_crash':
                stressFactor = this.calculateMarketCrashFactor(position, scenario);
                break;
            case 'sector_shock':
                stressFactor = this.calculateSectorShockFactor(position, scenario);
                break;
            case 'liquidity_crisis':
                stressFactor = this.calculateLiquidityCrisisFactor(position, scenario);
                break;
            case 'interest_rate_shock':
                stressFactor = this.calculateInterestRateShockFactor(position, scenario);
                break;
            default:
                stressFactor = 0.9; // Default 10% decline
        }

        return Math.max(0, stressFactor); // Prevent negative values
    }

    calculateMarketCrashFactor(position, scenario) {
        const baseDecline = scenario.parameters.marketDecline || 0.2;
        const beta = position.beta || 1.0; // Asset sensitivity to market
        return 1 - (baseDecline * beta);
    }

    calculateSectorShockFactor(position, scenario) {
        const sectorShocks = scenario.parameters.sectorShocks || {};
        const sectorShock = sectorShocks[position.sector] || 0.1;
        return 1 - sectorShock;
    }

    calculateLiquidityCrisisFactor(position, scenario) {
        const liquidityImpact = scenario.parameters.liquidityImpact || 0.15;
        const assetLiquidity = position.liquidityScore || 0.5; // 0-1 scale
        return 1 - (liquidityImpact * (1 - assetLiquidity));
    }

    calculateInterestRateShockFactor(position, scenario) {
        const rateChange = scenario.parameters.rateChange || 0.01; // 1% change
        const duration = position.duration || 0; // Interest rate sensitivity
        
        if (position.assetType === 'bond') {
            return 1 - (duration * rateChange);
        }
        return 1.0;
    }

    async monitorRiskLimits() {
        if (!this.initialized) await this.initialize();
        
        const positions = await this.getPortfolioPositions();
        const portfolioValue = this.calculatePortfolioValue(positions);

        // Check single asset concentration
        await this.checkSingleAssetLimits(positions, portfolioValue);

        // Check sector concentration
        await this.checkSectorLimits(positions, portfolioValue);

        // Check total portfolio risk
        await this.checkPortfolioRiskLimits(portfolioValue);

        // Check correlation risks
        await this.checkCorrelationRisks(positions);
    }

    async checkSingleAssetLimits(positions, portfolioValue) {
        for (const position of positions) {
            const concentration = position.marketValue / portfolioValue;
            const limit = this.config.riskLimits.singleAsset;

            if (concentration > limit) {
                await this.triggerRiskAlert(
                    'SINGLE_ASSET_CONCENTRATION',
                    'warning',
                    position.portfolioId || 'default',
                    'concentration',
                    limit,
                    concentration,
                    `Single asset concentration ${(concentration * 100).toFixed(2)}% exceeds limit ${(limit * 100).toFixed(2)}% for asset ${position.assetId}`
                );
            }
        }
    }

    async checkSectorLimits(positions, portfolioValue) {
        const sectorValues = {};
        
        for (const position of positions) {
            sectorValues[position.sector] = (sectorValues[position.sector] || 0) + position.marketValue;
        }

        for (const [sector, value] of Object.entries(sectorValues)) {
            const concentration = value / portfolioValue;
            const limit = this.config.riskLimits.sector;

            if (concentration > limit) {
                await this.triggerRiskAlert(
                    'SECTOR_CONCENTRATION',
                    'warning',
                    'default',
                    'sector_concentration',
                    limit,
                    concentration,
                    `Sector concentration ${(concentration * 100).toFixed(2)}% exceeds limit ${(limit * 100).toFixed(2)}% for sector ${sector}`
                );
            }
        }
    }

    async checkPortfolioRiskLimits(portfolioValue) {
        const varMetric = await this.calculateValueAtRisk();
        const varPercentage = varMetric / portfolioValue;

        if (varPercentage > this.config.alertThresholds.critical) {
            await this.triggerRiskAlert(
                'PORTFOLIO_VAR_EXCEEDED',
                'critical',
                'default',
                'VaR',
                this.config.alertThresholds.critical,
                varPercentage,
                `Portfolio VaR ${(varPercentage * 100).toFixed(2)}% exceeds critical threshold ${(this.config.alertThresholds.critical * 100).toFixed(2)}%`
            );
        } else if (varPercentage > this.config.alertThresholds.warning) {
            await this.triggerRiskAlert(
                'PORTFOLIO_VAR_WARNING',
                'warning',
                'default',
                'VaR',
                this.config.alertThresholds.warning,
                varPercentage,
                `Portfolio VaR ${(varPercentage * 100).toFixed(2)}% exceeds warning threshold ${(this.config.alertThresholds.warning * 100).toFixed(2)}%`
            );
        }
    }

    async triggerRiskAlert(alertType, severity, portfolioId, metricType, threshold, actualValue, description) {
        const alertId = this.generateAlertId();

        await this.db.run(`
            INSERT INTO risk_alerts (id, alertType, severity, portfolioId, metricType, threshold, actualValue, description)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [alertId, alertType, severity, portfolioId, metricType, threshold, actualValue, description]);

        this.riskAlerts.set(alertId, {
            id: alertId,
            alertType,
            severity,
            portfolioId,
            metricType,
            threshold,
            actualValue,
            description,
            triggeredAt: new Date(),
            status: 'active'
        });

        this.events.emit('riskAlert', {
            alertId,
            alertType,
            severity,
            portfolioId,
            metricType,
            threshold,
            actualValue,
            description,
            timestamp: new Date()
        });

        return alertId;
    }

    async getRiskDashboard() {
        if (!this.initialized) await this.initialize();
        
        const portfolioValue = await this.calculateTotalPortfolioValue();
        const varMetric = await this.calculateValueAtRisk();
        const cvarMetric = await this.calculateConditionalVaR();
        const activeAlerts = await this.getActiveAlerts();
        const recentStressTests = await this.getRecentStressTests();

        return {
            portfolioValue,
            riskMetrics: {
                var: varMetric,
                cvar: cvarMetric,
                varPercentage: (varMetric / portfolioValue) * 100
            },
            concentration: await this.calculateConcentrationMetrics(),
            alerts: activeAlerts,
            stressTests: recentStressTests,
            timestamp: new Date()
        };
    }

    async calculateConcentrationMetrics() {
        const positions = await this.getPortfolioPositions();
        const portfolioValue = this.calculatePortfolioValue(positions);

        const topPositions = positions
            .sort((a, b) => b.marketValue - a.marketValue)
            .slice(0, 5)
            .map(p => ({
                assetId: p.assetId,
                concentration: (p.marketValue / portfolioValue) * 100
            }));

        const sectorConcentration = {};
        for (const position of positions) {
            sectorConcentration[position.sector] = (sectorConcentration[position.sector] || 0) + position.marketValue;
        }

        return {
            topPositions,
            sectorConcentration: Object.fromEntries(
                Object.entries(sectorConcentration).map(([sector, value]) => [
                    sector,
                    (value / portfolioValue) * 100
                ])
            )
        };
    }

    // Utility Methods
    generatePositionId() {
        return `pos_${Date.now().toString(36)}_${randomBytes(8).toString('hex')}`;
    }

    generateScenarioId() {
        return `scenario_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
    }

    generateAlertId() {
        return `alert_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
    }

    calculatePortfolioValue(positions) {
        return positions.reduce((sum, position) => sum + position.marketValue, 0);
    }

    calculatePositionWeights(positions) {
        const totalValue = this.calculatePortfolioValue(positions);
        return positions.map(position => position.marketValue / totalValue);
    }

    calculateZScore(confidence) {
        // Standard normal distribution quantiles
        const quantiles = {
            0.90: 1.282,
            0.95: 1.645,
            0.99: 2.326,
            0.995: 2.576,
            0.999: 3.090
        };
        return quantiles[confidence] || 1.645; // Default to 95% confidence
    }

    combineVaRMethods(varResults) {
        // Use weighted average with more weight on historical and Monte Carlo
        const weights = [0.4, 0.2, 0.4]; // historical, parametric, monte carlo
        return varResults.reduce((sum, varValue, index) => sum + varValue * weights[index], 0);
    }

    async getPortfolioPositions(portfolioId = 'default') {
        const positions = await this.db.all('SELECT * FROM portfolio_positions');
        return positions;
    }

    async getHistoricalReturns(positions, days) {
        // In production, this would fetch real historical data
        // For now, generate realistic synthetic data
        const returns = {};
        
        for (const position of positions) {
            const assetReturns = [];
            for (let i = 0; i < days; i++) {
                // Generate random returns with some volatility
                const dailyReturn = (Math.random() - 0.5) * 0.1; // ±5% daily
                assetReturns.push(dailyReturn);
            }
            returns[position.assetId] = assetReturns;
        }
        
        return returns;
    }

    calculatePortfolioReturns(positions, historicalReturns) {
        const weights = this.calculatePositionWeights(positions);
        const assetIds = positions.map(p => p.assetId);
        const days = historicalReturns[assetIds[0]].length;
        
        const portfolioReturns = [];
        
        for (let day = 0; day < days; day++) {
            let dailyReturn = 0;
            for (let i = 0; i < assetIds.length; i++) {
                dailyReturn += weights[i] * historicalReturns[assetIds[i]][day];
            }
            portfolioReturns.push(dailyReturn);
        }
        
        return portfolioReturns;
    }

    async simulatePortfolioReturn(positions, horizon) {
        const weights = this.calculatePositionWeights(positions);
        let portfolioReturn = 0;
        
        for (let i = 0; i < positions.length; i++) {
            const volatility = await this.getVolatility(positions[i].assetId);
            const randomReturn = this.generateRandomReturn(volatility, horizon);
            portfolioReturn += weights[i] * randomReturn;
        }
        
        return portfolioReturn;
    }

    generateRandomReturn(volatility, horizon) {
        const timeFactor = Math.sqrt(horizon / 252);
        return (Math.random() - 0.5) * volatility * timeFactor;
    }

    async getCorrelation(assetA, assetB) {
        if (assetA === assetB) return 1.0;
        
        const result = await this.db.get(`
            SELECT correlation FROM correlation_data 
            WHERE assetA = ? AND assetB = ? AND period = '1y'
        `, [assetA, assetB]);
        
        return result?.correlation || 0.3; // Default correlation
    }

    async getVolatility(assetId) {
        const result = await this.db.get(`
            SELECT annualizedVol FROM volatility_data 
            WHERE assetId = ? AND period = '1y'
        `, [assetId]);
        
        return result?.annualizedVol || 0.2; // Default 20% volatility
    }

    async calculateTailLosses(portfolioId, varValue) {
        // In production, this would calculate actual tail losses from historical data
        // For now, generate realistic tail loss distribution
        const tailLosses = [];
        const tailCount = 100;
        
        for (let i = 0; i < tailCount; i++) {
            const loss = varValue * (1 + Math.random() * 0.5); // Losses 0-50% beyond VaR
            tailLosses.push(loss);
        }
        
        return tailLosses;
    }

    async validateStressScenario(scenario) {
        if (!scenario.name || !scenario.type) {
            throw new Error('Stress scenario must have name and type');
        }

        if (!scenario.parameters || typeof scenario.parameters !== 'object') {
            throw new Error('Stress scenario must have parameters object');
        }
    }

    async getActiveAlerts() {
        return await this.db.all(`
            SELECT * FROM risk_alerts 
            WHERE status = 'active' 
            ORDER BY triggeredAt DESC 
            LIMIT 50
        `);
    }

    async getRecentStressTests() {
        return await this.db.all(`
            SELECT * FROM stress_test_scenarios 
            ORDER BY executedAt DESC 
            LIMIT 10
        `);
    }

    async storeRiskMetric(metricType, portfolioId, value, confidenceLevel, timeHorizon, calculationTime) {
        const metricId = `metric_${Date.now().toString(36)}_${randomBytes(6).toString('hex')}`;
        
        await this.db.run(`
            INSERT INTO risk_metrics (id, metricType, portfolioId, value, confidenceLevel, timeHorizon, calculationTime)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [metricId, metricType, portfolioId, value, confidenceLevel, timeHorizon, calculationTime]);

        this.riskMetrics.set(metricId, {
            id: metricId,
            metricType,
            portfolioId,
            value,
            confidenceLevel,
            timeHorizon,
            calculationTime,
            timestamp: new Date()
        });
    }

    async updatePortfolioRiskMetrics() {
        // Recalculate all risk metrics when portfolio changes
        await this.calculateValueAtRisk();
        await this.calculateConditionalVaR();
        await this.monitorRiskLimits();
    }

    async loadHistoricalData() {
        // In production, this would load real historical market data
        // For now, initialize with sample data
        console.log('📊 Loading historical risk data...');
    }

    async initializeRiskModels() {
        // Initialize risk models with default parameters
        console.log('🔧 Initializing risk models...');
    }

    startRiskMonitoring() {
        // Continuous risk monitoring
        setInterval(async () => {
            try {
                await this.updatePortfolioRiskMetrics();
            } catch (error) {
                console.error('Risk monitoring error:', error);
            }
        }, 300000); // Every 5 minutes

        console.log('🔍 Risk monitoring activated');
    }
}

export default RiskManagementEngine;
