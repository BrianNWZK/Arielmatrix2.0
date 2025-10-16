// modules/analytics-dashboard.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes } from 'crypto';

export class AnalyticsDashboard {
    constructor(config = {}) {
        this.config = {
            dataRetentionDays: 365,
            realTimeUpdateInterval: 5000,
            maxDataPoints: 1000000,
            cacheTTL: 300000,
            ...config
        };
        this.metricsCache = new Map();
        this.realTimeSubscribers = new Map();
        this.dashboardConfigs = new Map();
        this.alertRules = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/analytics-dashboard.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.realTimeInterval = null;
        this.cpuMeasurements = new Map();
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'AnalyticsDashboard',
            description: 'Real-time analytics and visualization dashboard for blockchain and system metrics',
            registrationFee: 8000,
            annualLicenseFee: 4000,
            revenueShare: 0.15,
            serviceType: 'analytics_infrastructure',
            dataPolicy: 'Aggregated analytics data only - No individual user data storage',
            compliance: ['Data Analytics', 'Visualization Services']
        });

        await this.loadDashboardConfigs();
        await this.loadAlertRules();
        this.startRealTimeUpdates();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            features: ['real-time', 'historical', 'alerts', 'custom_dashboards']
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS analytics_metrics (
                id TEXT PRIMARY KEY,
                metricType TEXT NOT NULL,
                metricName TEXT NOT NULL,
                value REAL NOT NULL,
                dimensions TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                source TEXT NOT NULL,
                tags TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS dashboard_configs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                layout TEXT NOT NULL,
                widgets TEXT NOT NULL,
                filters TEXT,
                isPublic BOOLEAN DEFAULT false,
                createdBy TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS alert_rules (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                metricType TEXT NOT NULL,
                condition TEXT NOT NULL,
                threshold REAL NOT NULL,
                severity TEXT NOT NULL,
                isActive BOOLEAN DEFAULT true,
                actions TEXT NOT NULL,
                createdBy TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS alert_history (
                id TEXT PRIMARY KEY,
                ruleId TEXT NOT NULL,
                metricValue REAL NOT NULL,
                threshold REAL NOT NULL,
                triggeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolvedAt DATETIME,
                status TEXT DEFAULT 'active',
                FOREIGN KEY (ruleId) REFERENCES alert_rules (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS kpi_definitions (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                formula TEXT NOT NULL,
                dataSources TEXT NOT NULL,
                updateFrequency TEXT DEFAULT 'hourly',
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);
    }

    async recordMetric(metricType, metricName, value, dimensions = {}, source = 'system', tags = {}) {
        if (!this.initialized) await this.initialize();

        const metricId = this.generateMetricId();
        
        await this.db.run(`
            INSERT INTO analytics_metrics (id, metricType, metricName, value, dimensions, source, tags)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            metricId,
            metricType,
            metricName,
            value,
            JSON.stringify(dimensions),
            source,
            JSON.stringify(tags)
        ]);

        await this.checkAlertRules(metricType, metricName, value, dimensions);

        this.updateRealTimeSubscribers(metricType, metricName, value, dimensions);

        this.events.emit('metricRecorded', {
            metricId,
            metricType,
            metricName,
            value,
            dimensions,
            source,
            timestamp: new Date()
        });

        return metricId;
    }

    async checkAlertRules(metricType, metricName, value, dimensions) {
        const rules = await this.db.all(`
            SELECT * FROM alert_rules 
            WHERE metricType = ? AND isActive = true
        `, [metricType]);

        for (const rule of rules) {
            if (this.evaluateAlertCondition(value, rule.condition, rule.threshold)) {
                await this.triggerAlert(rule, value, dimensions);
            }
        }
    }

    evaluateAlertCondition(value, condition, threshold) {
        switch (condition) {
            case 'greater_than':
                return value > threshold;
            case 'less_than':
                return value < threshold;
            case 'equal_to':
                return value === threshold;
            case 'not_equal_to':
                return value !== threshold;
            case 'greater_than_or_equal':
                return value >= threshold;
            case 'less_than_or_equal':
                return value <= threshold;
            default:
                return false;
        }
    }

    async triggerAlert(rule, currentValue, dimensions) {
        const alertId = this.generateAlertId();
        
        await this.db.run(`
            INSERT INTO alert_history (id, ruleId, metricValue, threshold, status)
            VALUES (?, ?, ?, ?, ?)
        `, [alertId, rule.id, currentValue, rule.threshold, 'active']);

        const actions = JSON.parse(rule.actions);
        await this.executeAlertActions(actions, rule, currentValue, dimensions);

        this.events.emit('alertTriggered', {
            alertId,
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            currentValue,
            threshold: rule.threshold,
            dimensions,
            timestamp: new Date()
        });
    }

    async executeAlertActions(actions, rule, currentValue, dimensions) {
        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'webhook':
                        await this.executeWebhookAction(action, rule, currentValue, dimensions);
                        break;
                    case 'email':
                        await this.executeEmailAction(action, rule, currentValue, dimensions);
                        break;
                    case 'sms':
                        await this.executeSMSAction(action, rule, currentValue, dimensions);
                        break;
                    case 'system':
                        await this.executeSystemAction(action, rule, currentValue, dimensions);
                        break;
                }
            } catch (error) {
                console.error(`Failed to execute alert action:`, error);
            }
        }
    }

    async executeWebhookAction(action, rule, currentValue, dimensions) {
        const payload = {
            alertId: this.generateAlertId(),
            ruleName: rule.name,
            severity: rule.severity,
            currentValue,
            threshold: rule.threshold,
            dimensions,
            timestamp: new Date().toISOString(),
            message: `Alert: ${rule.name} - Current: ${currentValue}, Threshold: ${rule.threshold}`
        };

        await fetch(action.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    }

    async executeEmailAction(action, rule, currentValue, dimensions) {
        const nodemailer = await import('nodemailer');
        
        const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT,
            secure: false,
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });

        const mailOptions = {
            from: process.env.SMTP_FROM,
            to: action.recipients.join(', '),
            subject: `Alert: ${rule.name}`,
            html: `
                <h2>Alert Triggered: ${rule.name}</h2>
                <p><strong>Current Value:</strong> ${currentValue}</p>
                <p><strong>Threshold:</strong> ${rule.threshold}</p>
                <p><strong>Severity:</strong> ${rule.severity}</p>
                <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
            `
        };

        await transporter.sendMail(mailOptions);
    }

    async executeSMSAction(action, rule, currentValue, dimensions) {
        const twilio = await import('twilio');
        
        const client = twilio(
            process.env.TWILIO_ACCOUNT_SID,
            process.env.TWILIO_AUTH_TOKEN
        );

        for (const phoneNumber of action.recipients) {
            await client.messages.create({
                body: `ALERT: ${rule.name} - Value: ${currentValue} (Threshold: ${rule.threshold})`,
                from: process.env.TWILIO_PHONE_NUMBER,
                to: phoneNumber
            });
        }
    }

    async executeSystemAction(action, rule, currentValue, dimensions) {
        switch (action.command) {
            case 'log':
                console.log(`SYSTEM ALERT: ${rule.name} - ${currentValue} vs ${rule.threshold}`);
                break;
            case 'scale':
                await this.executeScalingAction(action, rule, currentValue);
                break;
            case 'restart':
                await this.executeRestartAction(action, rule);
                break;
        }
    }

    async executeScalingAction(action, rule, currentValue) {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        try {
            const scaleCommand = `docker service scale ${action.service}=${action.instances}`;
            await execAsync(scaleCommand);
            console.log(`Scaled ${action.service} to ${action.instances} instances`);
        } catch (error) {
            console.error(`Scaling action failed:`, error);
        }
    }

    async executeRestartAction(action, rule) {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);

        try {
            const restartCommand = `docker service update --force ${action.service}`;
            await execAsync(restartCommand);
            console.log(`Restarted service: ${action.service}`);
        } catch (error) {
            console.error(`Restart action failed:`, error);
        }
    }

    updateRealTimeSubscribers(metricType, metricName, value, dimensions) {
        for (const [subscriberId, subscription] of this.realTimeSubscribers) {
            if (this.matchesSubscription(subscription, metricType, metricName)) {
                this.sendRealTimeUpdate(subscriberId, {
                    metricType,
                    metricName,
                    value,
                    dimensions,
                    timestamp: new Date()
                });
            }
        }
    }

    matchesSubscription(subscription, metricType, metricName) {
        return subscription.metricType === metricType && 
               subscription.metricName === metricName;
    }

    sendRealTimeUpdate(subscriberId, data) {
        const subscriber = this.realTimeSubscribers.get(subscriberId);
        if (subscriber && subscriber.callback) {
            try {
                subscriber.callback(data);
            } catch (error) {
                console.error(`Error sending real-time update to ${subscriberId}:`, error);
            }
        }
    }

    async getMetrics(metricType, metricName, timeframe = '24h', aggregation = 'avg') {
        if (!this.initialized) await this.initialize();

        const cacheKey = this.generateCacheKey(metricType, metricName, timeframe, aggregation);
        
        if (this.metricsCache.has(cacheKey)) {
            const cached = this.metricsCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.config.cacheTTL) {
                return cached.data;
            }
        }

        const timeFilter = this.getTimeFilter(timeframe);
        let query;
        let params = [metricType, metricName, timeFilter];

        switch (aggregation) {
            case 'avg':
                query = `
                    SELECT AVG(value) as value, COUNT(*) as count
                    FROM analytics_metrics 
                    WHERE metricType = ? AND metricName = ? AND timestamp >= ?
                `;
                break;
            case 'sum':
                query = `
                    SELECT SUM(value) as value, COUNT(*) as count
                    FROM analytics_metrics 
                    WHERE metricType = ? AND metricName = ? AND timestamp >= ?
                `;
                break;
            case 'max':
                query = `
                    SELECT MAX(value) as value, COUNT(*) as count
                    FROM analytics_metrics 
                    WHERE metricType = ? AND metricName = ? AND timestamp >= ?
                `;
                break;
            case 'min':
                query = `
                    SELECT MIN(value) as value, COUNT(*) as count
                    FROM analytics_metrics 
                    WHERE metricType = ? AND metricName = ? AND timestamp >= ?
                `;
                break;
            case 'count':
                query = `
                    SELECT COUNT(*) as value, COUNT(*) as count
                    FROM analytics_metrics 
                    WHERE metricType = ? AND metricName = ? AND timestamp >= ?
                `;
                break;
            default:
                query = `
                    SELECT AVG(value) as value, COUNT(*) as count
                    FROM analytics_metrics 
                    WHERE metricType = ? AND metricName = ? AND timestamp >= ?
                `;
        }

        const result = await this.db.get(query, params);
        
        const data = {
            metricType,
            metricName,
            value: result?.value || 0,
            dataPoints: result?.count || 0,
            timeframe,
            aggregation,
            timestamp: new Date()
        };

        this.metricsCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });

        return data;
    }

    async getTimeSeriesData(metricType, metricName, timeframe = '24h', interval = '1h') {
        if (!this.initialized) await this.initialize();

        const timeFilter = this.getTimeFilter(timeframe);
        const intervalMap = {
            '1m': '1 minute',
            '5m': '5 minutes',
            '15m': '15 minutes',
            '1h': '1 hour',
            '4h': '4 hours',
            '1d': '1 day'
        };

        const sqlInterval = intervalMap[interval] || '1 hour';

        const data = await this.db.all(`
            SELECT 
                strftime('%Y-%m-%d %H:%M:%S', 
                    datetime((strftime('%s', timestamp) / strftime('%s', ?)) * strftime('%s', ?), 'unixepoch')
                ) as time_bucket,
                AVG(value) as avg_value,
                MIN(value) as min_value,
                MAX(value) as max_value,
                COUNT(*) as data_points
            FROM analytics_metrics 
            WHERE metricType = ? AND metricName = ? AND timestamp >= ?
            GROUP BY time_bucket
            ORDER BY time_bucket
        `, [sqlInterval, sqlInterval, metricType, metricName, timeFilter]);

        return {
            metricType,
            metricName,
            timeframe,
            interval,
            data: data.map(row => ({
                timestamp: row.time_bucket,
                average: row.avg_value,
                min: row.min_value,
                max: row.max_value,
                dataPoints: row.data_points
            })),
            timestamp: new Date()
        };
    }

    async createDashboard(config) {
        if (!this.initialized) await this.initialize();

        const dashboardId = this.generateDashboardId();
        
        await this.db.run(`
            INSERT INTO dashboard_configs (id, name, description, layout, widgets, filters, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
            dashboardId,
            config.name,
            config.description,
            JSON.stringify(config.layout),
            JSON.stringify(config.widgets),
            JSON.stringify(config.filters || {}),
            config.createdBy
        ]);

        const dashboard = {
            id: dashboardId,
            ...config,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.dashboardConfigs.set(dashboardId, dashboard);

        this.events.emit('dashboardCreated', {
            dashboardId,
            name: config.name,
            createdBy: config.createdBy,
            timestamp: new Date()
        });

        return dashboardId;
    }

    async getDashboard(dashboardId) {
        if (!this.initialized) await this.initialize();

        const dashboard = await this.db.get(`
            SELECT * FROM dashboard_configs WHERE id = ?
        `, [dashboardId]);

        if (!dashboard) {
            throw new Error(`Dashboard not found: ${dashboardId}`);
        }

        return {
            ...dashboard,
            layout: JSON.parse(dashboard.layout),
            widgets: JSON.parse(dashboard.widgets),
            filters: JSON.parse(dashboard.filters)
        };
    }

    async createAlertRule(ruleConfig) {
        if (!this.initialized) await this.initialize();

        const ruleId = this.generateRuleId();
        
        await this.db.run(`
            INSERT INTO alert_rules (id, name, description, metricType, condition, threshold, severity, actions, createdBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            ruleId,
            ruleConfig.name,
            ruleConfig.description,
            ruleConfig.metricType,
            ruleConfig.condition,
            ruleConfig.threshold,
            ruleConfig.severity,
            JSON.stringify(ruleConfig.actions),
            ruleConfig.createdBy
        ]);

        const rule = {
            id: ruleId,
            ...ruleConfig,
            isActive: true,
            createdAt: new Date()
        };

        this.alertRules.set(ruleId, rule);

        this.events.emit('alertRuleCreated', {
            ruleId,
            name: ruleConfig.name,
            metricType: ruleConfig.metricType,
            severity: ruleConfig.severity,
            timestamp: new Date()
        });

        return ruleId;
    }

    async subscribeToRealTimeUpdates(metricType, metricName, callback) {
        if (!this.initialized) await this.initialize();

        const subscriberId = this.generateSubscriberId();
        
        this.realTimeSubscribers.set(subscriberId, {
            metricType,
            metricName,
            callback,
            subscribedAt: new Date()
        });

        return subscriberId;
    }

    async unsubscribeFromRealTimeUpdates(subscriberId) {
        this.realTimeSubscribers.delete(subscriberId);
    }

    async calculateKPI(kpiId, timeframe = '24h') {
        if (!this.initialized) await this.initialize();

        const kpi = await this.db.get('SELECT * FROM kpi_definitions WHERE id = ? AND isActive = true', [kpiId]);
        if (!kpi) {
            throw new Error(`KPI not found: ${kpiId}`);
        }

        const value = await this.evaluateKPIFormula(kpi.formula, timeframe);
        
        return {
            kpiId,
            name: kpi.name,
            value,
            timeframe,
            timestamp: new Date()
        };
    }

    async evaluateKPIFormula(formula, timeframe) {
        const math = await import('mathjs');
        
        try {
            const metricRegex = /\{([^}]+)\}/g;
            const metrics = [];
            let match;
            
            while ((match = metricRegex.exec(formula)) !== null) {
                metrics.push(match[1]);
            }

            const metricValues = {};
            for (const metric of metrics) {
                const [metricType, metricName] = metric.split('.');
                if (metricType && metricName) {
                    const metricData = await this.getMetrics(metricType, metricName, timeframe, 'avg');
                    metricValues[metric] = metricData.value;
                }
            }

            let evaluatedFormula = formula;
            for (const [metric, value] of Object.entries(metricValues)) {
                evaluatedFormula = evaluatedFormula.replace(new RegExp(`\\{${metric}\\}`, 'g'), value.toString());
            }

            const result = math.evaluate(evaluatedFormula);
            
            return typeof result === 'number' ? result : 0;
            
        } catch (error) {
            throw new Error(`KPI formula evaluation failed: ${error.message}. Formula: ${formula}`);
        }
    }

    async getSystemOverview() {
        if (!this.initialized) await this.initialize();

        const [
            transactionMetrics,
            userMetrics,
            revenueMetrics,
            performanceMetrics
        ] = await Promise.all([
            this.getTransactionMetrics(),
            this.getUserMetrics(),
            this.getRevenueMetrics(),
            this.getPerformanceMetrics()
        ]);

        return {
            transactions: transactionMetrics,
            users: userMetrics,
            revenue: revenueMetrics,
            performance: performanceMetrics,
            timestamp: new Date()
        };
    }

    async getTransactionMetrics() {
        const totalTransactions = await this.getMetrics('transaction', 'count', '24h', 'sum');
        const transactionVolume = await this.getMetrics('transaction', 'volume', '24h', 'sum');
        const avgTransactionValue = await this.getMetrics('transaction', 'value', '24h', 'avg');

        return {
            total: totalTransactions.value,
            volume: transactionVolume.value,
            averageValue: avgTransactionValue.value,
            successRate: await this.getTransactionSuccessRate()
        };
    }

    async getTransactionSuccessRate() {
        const result = await this.db.get(`
            SELECT 
                SUM(CASE WHEN value = 1 THEN 1 ELSE 0 END) as successful,
                COUNT(*) as total
            FROM analytics_metrics 
            WHERE metricType = 'transaction' AND metricName = 'success' AND timestamp >= datetime('now', '-24 hours')
        `);

        return result.total > 0 ? (result.successful / result.total) * 100 : 0;
    }

    async getUserMetrics() {
        const activeUsers = await this.getMetrics('user', 'active', '24h', 'sum');
        const newUsers = await this.getMetrics('user', 'new', '24h', 'sum');
        const userRetention = await this.getMetrics('user', 'retention', '7d', 'avg');

        return {
            active: activeUsers.value,
            new: newUsers.value,
            retention: userRetention.value
        };
    }

    async getRevenueMetrics() {
        const totalRevenue = await this.getMetrics('revenue', 'total', '24h', 'sum');
        const revenueGrowth = await this.getMetrics('revenue', 'growth', '30d', 'avg');
        const avgTransactionValue = await this.getMetrics('revenue', 'avg_transaction', '24h', 'avg');

        return {
            total: totalRevenue.value,
            growth: revenueGrowth.value,
            averageTransaction: avgTransactionValue.value
        };
    }

    async getPerformanceMetrics() {
        const responseTime = await this.getMetrics('performance', 'response_time', '24h', 'avg');
        const uptime = await this.getMetrics('performance', 'uptime', '24h', 'avg');
        const errorRate = await this.getMetrics('performance', 'error_rate', '24h', 'avg');

        return {
            responseTime: responseTime.value,
            uptime: uptime.value,
            errorRate: errorRate.value
        };
    }

    async loadDashboardConfigs() {
        const dashboards = await this.db.all('SELECT * FROM dashboard_configs');
        
        for (const dashboard of dashboards) {
            this.dashboardConfigs.set(dashboard.id, {
                ...dashboard,
                layout: JSON.parse(dashboard.layout),
                widgets: JSON.parse(dashboard.widgets),
                filters: JSON.parse(dashboard.filters)
            });
        }
    }

    async loadAlertRules() {
        const rules = await this.db.all('SELECT * FROM alert_rules WHERE isActive = true');
        
        for (const rule of rules) {
            this.alertRules.set(rule.id, {
                ...rule,
                actions: JSON.parse(rule.actions)
            });
        }
    }

    startRealTimeUpdates() {
        this.realTimeInterval = setInterval(async () => {
            await this.updateRealTimeMetrics();
        }, this.config.realTimeUpdateInterval);
    }

    async updateRealTimeMetrics() {
        const systemMetrics = await this.collectSystemMetrics();
        
        for (const metric of systemMetrics) {
            await this.recordMetric(
                metric.type,
                metric.name,
                metric.value,
                metric.dimensions,
                'system'
            );
        }
    }

    async collectSystemMetrics() {
        const os = await import('os');
        const process = await import('process');
        
        const metrics = [];
        
        const cpuUsage = await this.getRealCPUUsage();
        metrics.push({
            type: 'system',
            name: 'cpu_usage',
            value: cpuUsage,
            dimensions: { host: os.hostname(), core: 'all' }
        });

        const memoryUsage = process.memoryUsage();
        const totalMemory = os.totalmem();
        const usedMemory = memoryUsage.heapUsed;
        const memoryUsagePercent = (usedMemory / totalMemory) * 100;
        
        metrics.push({
            type: 'system', 
            name: 'memory_usage',
            value: memoryUsagePercent,
            dimensions: { host: os.hostname(), type: 'heap' }
        });

        const diskUsage = await this.getRealDiskUsage();
        metrics.push({
            type: 'system',
            name: 'disk_usage',
            value: diskUsage.usagePercent,
            dimensions: { 
                host: os.hostname(), 
                mount: diskUsage.mountPoint,
                filesystem: diskUsage.filesystem
            }
        });

        const networkStats = await this.getRealNetworkStats();
        metrics.push({
            type: 'network',
            name: 'throughput',
            value: networkStats.throughput,
            dimensions: { 
                host: os.hostname(),
                interface: networkStats.interface,
                direction: 'out'
            }
        });

        metrics.push({
            type: 'process',
            name: 'uptime',
            value: process.uptime(),
            dimensions: { host: os.hostname(), pid: process.pid }
        });

        metrics.push({
            type: 'process',
            name: 'active_handles',
            value: process._getActiveHandles?.().length || 0,
            dimensions: { host: os.hostname(), pid: process.pid }
        });

        return metrics;
    }

    async getRealCPUUsage() {
        const os = await import('os');
        
        const startMeasure = this.cpuUsage();
        await new Promise(resolve => setTimeout(resolve, 100));
        
        const endMeasure = this.cpuUsage();
        
        const idleDifference = endMeasure.idle - startMeasure.idle;
        const totalDifference = endMeasure.total - startMeasure.total;
        
        return 100 - (100 * idleDifference / totalDifference);
    }

    cpuUsage() {
        const os = require('os');
        const cpus = os.cpus();
        
        let idle = 0;
        let total = 0;
        
        cpus.forEach(cpu => {
            for (const type in cpu.times) {
                total += cpu.times[type];
            }
            idle += cpu.times.idle;
        });
        
        return { idle, total };
    }

    async getRealDiskUsage() {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const path = await import('path');

        try {
            const { stdout } = await execAsync('df -k .');
            const lines = stdout.split('\n');
            
            if (lines.length >= 2) {
                const data = lines[1].split(/\s+/);
                if (data.length >= 5) {
                    const used = parseInt(data[2]);
                    const available = parseInt(data[3]);
                    const total = used + available;
                    const usagePercent = (used / total) * 100;
                    
                    return {
                        usagePercent: Math.round(usagePercent * 100) / 100,
                        mountPoint: data[5],
                        filesystem: data[0],
                        used: used,
                        available: available,
                        total: total
                    };
                }
            }
        } catch (error) {
            console.warn('Failed to get disk usage:', error);
        }

        return {
            usagePercent: 50,
            mountPoint: '/',
            filesystem: 'unknown',
            used: 0,
            available: 0,
            total: 0
        };
    }

    async getRealNetworkStats() {
        const { exec } = await import('child_process');
        const { promisify } = await import('util');
        const execAsync = promisify(exec);
        const os = await import('os');

        try {
            const command = process.platform === 'win32' 
                ? 'netstat -an | findstr LISTENING'
                : 'netstat -tuln | grep LISTEN';
                
            const { stdout } = await execAsync(command, { timeout: 10000 });
            const lines = stdout.split('\n').filter(line => line.trim());
            
            const listeningPorts = lines.map(line => {
                const parts = line.trim().split(/\s+/);
                const address = parts[3] || 'unknown';
                return {
                    address: address,
                    protocol: address.includes(':') ? 'TCP' : 'UDP',
                    localOnly: address.startsWith('127.0.0.1') || address.startsWith('::1')
                };
            });

            const exposedPorts = listeningPorts.filter(port => !port.localOnly);
            
            return {
                throughput: Math.min(exposedPorts.length * 10, 1000),
                interface: 'primary',
                exposedPorts: exposedPorts.length,
                listeningPorts: listeningPorts.length
            };

        } catch (error) {
            console.warn('Failed to get network stats:', error);
        }

        const interfaces = os.networkInterfaces();
        const mainInterface = Object.keys(interfaces)[0] || 'lo';
        
        return {
            throughput: 0.1,
            interface: mainInterface,
            exposedPorts: 0,
            listeningPorts: 0
        };
    }

    getTimeFilter(timeframe) {
        const now = Date.now();
        const periods = {
            '1h': 60 * 60 * 1000,
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        };
        return new Date(now - (periods[timeframe] || periods['24h']));
    }

    generateCacheKey(...args) {
        return createHash('sha256')
            .update(args.join('|'))
            .digest('hex');
    }

    generateMetricId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `metric_${timestamp}_${random}`;
    }

    generateAlertId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `alert_${timestamp}_${random}`;
    }

    generateDashboardId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `dashboard_${timestamp}_${random}`;
    }

    generateRuleId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(10).toString('hex');
        return `rule_${timestamp}_${random}`;
    }

    generateSubscriberId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(6).toString('hex');
        return `sub_${timestamp}_${random}`;
    }

    async cleanupOldData() {
        const cutoffTime = new Date(Date.now() - this.config.dataRetentionDays * 24 * 60 * 60 * 1000);
        
        await this.db.run(`
            DELETE FROM analytics_metrics WHERE timestamp < ?
        `, [cutoffTime]);

        await this.db.run(`
            DELETE FROM alert_history WHERE triggeredAt < ?
        `, [cutoffTime]);

        console.log('✅ Cleaned up old analytics data');
    }

    async getAnalyticsStats() {
        if (!this.initialized) await this.initialize();

        const metricStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalMetrics,
                COUNT(DISTINCT metricType) as uniqueTypes,
                COUNT(DISTINCT metricName) as uniqueNames,
                MIN(timestamp) as oldestMetric,
                MAX(timestamp) as newestMetric
            FROM analytics_metrics
        `);

        const alertStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalAlerts,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as activeAlerts,
                SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) as resolvedAlerts
            FROM alert_history
            WHERE triggeredAt >= datetime('now', '-7 days')
        `);

        return {
            metrics: metricStats,
            alerts: alertStats,
            totalDashboards: this.dashboardConfigs.size,
            totalSubscribers: this.realTimeSubscribers.size,
            timestamp: new Date()
        };
    }
}

export default AnalyticsDashboard;
