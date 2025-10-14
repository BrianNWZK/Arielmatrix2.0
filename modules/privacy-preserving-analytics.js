// modules/privacy-preserving-analytics.js
import { randomBytes, createHash } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { BWAEZI_CHAIN } from '../config/bwaezi-config.js';

export class PrivacyPreservingAnalytics {
  constructor(config = {}) {
    this.config = {
      dataRetentionDays: 90,
      aggregationPeriod: 24 * 60 * 60 * 1000,
      ...config
    };
    this.analyticsData = new Map();
    this.db = new ArielSQLiteEngine({ path: './privacy-analytics.db' });
    this.events = new EventEmitter();
    this.sovereignService = null;
    this.serviceId = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await this.db.init();
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id TEXT PRIMARY KEY,
        eventType TEXT NOT NULL,
        anonymizedUserId TEXT NOT NULL,
        properties TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS aggregated_metrics (
        id TEXT PRIMARY KEY,
        metricType TEXT NOT NULL,
        timePeriod TEXT NOT NULL,
        data TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sovereignService = new SovereignRevenueEngine();
    await this.sovereignService.initialize();
    
    this.serviceId = await this.sovereignService.registerService({
      name: 'PrivacyPreservingAnalytics',
      description: 'Privacy-focused analytics for BWAEZI Chain',
      registrationFee: 1500,
      annualLicenseFee: 750,
      revenueShare: 0.12
    });

    this.startDataAggregation();
    this.initialized = true;
    this.events.emit('initialized');
  }

  async trackEvent(eventType, userId, properties = {}) {
    if (!this.initialized) await this.initialize();
    
    const eventId = randomBytes(16).toString('hex');
    const anonymizedUserId = createHash('sha256').update(userId + 'bwaezi-salt').digest('hex');
    const sanitizedProperties = this.sanitizeProperties(properties);

    await this.db.run(`
      INSERT INTO analytics_events (id, eventType, anonymizedUserId, properties)
      VALUES (?, ?, ?, ?)
    `, [eventId, eventType, anonymizedUserId, JSON.stringify(sanitizedProperties)]);

    this.analyticsData.set(eventId, { eventType, anonymizedUserId, properties: sanitizedProperties });

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, 0.01, 'analytics_event');
    }

    this.events.emit('eventTracked', { eventId, eventType, anonymizedUserId });
    return eventId;
  }

  sanitizeProperties(properties) {
    const sanitized = { ...properties };
    const piiFields = ['email', 'phone', 'name', 'address', 'ip'];

    piiFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = createHash('sha256').update(sanitized[field]).digest('hex');
      }
    });

    return sanitized;
  }

  async aggregateMetrics(metricType, timePeriod = 'daily') {
    if (!this.initialized) await this.initialize();
    
    const aggregationId = randomBytes(16).toString('hex');
    let aggregatedData = {};

    switch (metricType) {
      case 'user_engagement':
        aggregatedData = await this.aggregateUserEngagement(timePeriod);
        break;
      case 'system_usage':
        aggregatedData = await this.aggregateSystemUsage(timePeriod);
        break;
      default:
        aggregatedData = { metricType, timePeriod, data: 'No aggregation logic' };
    }

    await this.db.run(`
      INSERT INTO aggregated_metrics (id, metricType, timePeriod, data)
      VALUES (?, ?, ?, ?)
    `, [aggregationId, metricType, timePeriod, JSON.stringify(aggregatedData)]);

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, 5, 'analytics_aggregation');
    }

    this.events.emit('metricsAggregated', { aggregationId, metricType, timePeriod });
    return aggregationId;
  }

  async aggregateUserEngagement(timePeriod) {
    const events = await this.db.all(`
      SELECT eventType, COUNT(*) as count, COUNT(DISTINCT anonymizedUserId) as uniqueUsers
      FROM analytics_events 
      WHERE timestamp >= ?
      GROUP BY eventType
    `, [this.getTimePeriodStart(timePeriod)]);

    return {
      totalEvents: events.reduce((sum, event) => sum + event.count, 0),
      uniqueUsers: new Set(events.map(e => e.uniqueUsers)).size,
      eventsByType: events,
      chain: BWAEZI_CHAIN.NAME
    };
  }

  async aggregateSystemUsage(timePeriod) {
    const systemEvents = await this.db.all(`
      SELECT COUNT(*) as totalOperations
      FROM analytics_events 
      WHERE eventType = 'system_operation' AND timestamp >= ?
    `, [this.getTimePeriodStart(timePeriod)]);

    return {
      totalOperations: systemEvents[0]?.totalOperations || 0,
      chain: BWAEZI_CHAIN.NAME
    };
  }

  getTimePeriodStart(timePeriod) {
    const now = Date.now();
    const periods = {
      'hourly': 60 * 60 * 1000,
      'daily': 24 * 60 * 60 * 1000,
      'weekly': 7 * 24 * 60 * 60 * 1000
    };
    return now - (periods[timePeriod] || periods['daily']);
  }

  startDataAggregation() {
    setInterval(async () => {
      await this.aggregateMetrics('user_engagement', 'daily');
      await this.aggregateMetrics('system_usage', 'daily');
    }, this.config.aggregationPeriod);
  }

  async getStats() {
    if (!this.initialized) await this.initialize();
    
    const totalEvents = await this.db.get('SELECT COUNT(*) as count FROM analytics_events');
    const uniqueUsers = await this.db.get('SELECT COUNT(DISTINCT anonymizedUserId) as count FROM analytics_events');

    return {
      totalEvents: totalEvents?.count || 0,
      uniqueUsers: uniqueUsers?.count || 0,
      chain: BWAEZI_CHAIN.NAME,
      initialized: this.initialized
    };
  }
}

export default PrivacyPreservingAnalytics;
