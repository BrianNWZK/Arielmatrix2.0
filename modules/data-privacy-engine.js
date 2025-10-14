// modules/data-privacy-engine.js
import { randomBytes, createHash } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { BWAEZI_CHAIN } from '../config/bwaezi-config.js';

export class DataPrivacyEngine {
  constructor(config = {}) {
    this.config = {
      dataRetentionDays: 365,
      autoPurge: true,
      ...config
    };
    this.privacyPolicies = new Map();
    this.db = new ArielSQLiteEngine({ path: './data-privacy.db' });
    this.events = new EventEmitter();
    this.sovereignService = null;
    this.serviceId = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await this.db.init();
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS privacy_policies (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        dataType TEXT NOT NULL,
        consentLevel TEXT NOT NULL,
        purposes TEXT NOT NULL,
        expiresAt DATETIME,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS consent_records (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        action TEXT NOT NULL,
        policyId TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sovereignService = new SovereignRevenueEngine();
    await this.sovereignService.initialize();
    
    this.serviceId = await this.sovereignService.registerService({
      name: 'DataPrivacyEngine',
      description: 'Data privacy and consent management for BWAEZI Chain',
      registrationFee: 1800,
      annualLicenseFee: 900,
      revenueShare: 0.13
    });

    this.startAutoPurge();
    this.initialized = true;
    this.events.emit('initialized');
  }

  async setPrivacyPolicy(userId, dataType, consentLevel, purposes, expiresInDays = 365) {
    if (!this.initialized) await this.initialize();
    
    const policyId = randomBytes(16).toString('hex');
    const expiresAt = Date.now() + (expiresInDays * 24 * 60 * 60 * 1000);

    await this.db.run(`
      INSERT INTO privacy_policies (id, userId, dataType, consentLevel, purposes, expiresAt)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [policyId, userId, dataType, consentLevel, JSON.stringify(purposes), expiresAt]);

    this.privacyPolicies.set(policyId, { userId, dataType, consentLevel, purposes, expiresAt });

    await this.recordConsent(userId, 'SET_POLICY', policyId);

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, 25, 'privacy_policy');
    }

    this.events.emit('privacyPolicySet', { policyId, userId, dataType, consentLevel });
    return policyId;
  }

  async recordConsent(userId, action, policyId) {
    if (!this.initialized) await this.initialize();
    
    const consentId = randomBytes(16).toString('hex');

    await this.db.run(`
      INSERT INTO consent_records (id, userId, action, policyId)
      VALUES (?, ?, ?, ?)
    `, [consentId, userId, action, policyId]);

    this.events.emit('consentRecorded', { consentId, userId, action });
    return consentId;
  }

  async canProcessData(userId, dataType, purpose) {
    if (!this.initialized) await this.initialize();
    
    const policy = await this.db.get(`
      SELECT * FROM privacy_policies 
      WHERE userId = ? AND dataType = ? AND expiresAt > ? 
      ORDER BY createdAt DESC LIMIT 1
    `, [userId, dataType, Date.now()]);

    if (!policy) return { allowed: false, reason: 'No active policy' };

    const purposes = JSON.parse(policy.purposes);
    if (!purposes.includes(purpose)) {
      return { allowed: false, reason: 'Purpose not authorized' };
    }

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, 0.05, 'data_access_check');
    }

    return { allowed: true, policyId: policy.id };
  }

  async anonymizeData(data, userId, dataType) {
    const anonymized = { ...data };

    switch (dataType) {
      case 'identity_data':
        anonymized.email = this.hashIdentifier(anonymized.email);
        anonymized.phone = this.hashIdentifier(anonymized.phone);
        break;
      case 'system_data':
        anonymized.deviceId = this.hashIdentifier(anonymized.deviceId);
        break;
    }

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, 0.1, 'data_anonymization');
    }

    this.events.emit('dataAnonymized', { userId, dataType });
    return anonymized;
  }

  hashIdentifier(identifier) {
    if (!identifier) return null;
    return createHash('sha256').update(identifier).digest('hex');
  }

  startAutoPurge() {
    if (this.config.autoPurge) {
      setInterval(async () => {
        const cutoff = Date.now() - (this.config.dataRetentionDays * 24 * 60 * 60 * 1000);
        await this.db.run('DELETE FROM privacy_policies WHERE expiresAt < ?', [cutoff]);
        await this.db.run('DELETE FROM consent_records WHERE timestamp < ?', [cutoff]);
        this.events.emit('dataPurged', { cutoff });
      }, 24 * 60 * 60 * 1000);
    }
  }

  async getStats() {
    if (!this.initialized) await this.initialize();
    
    const totalPolicies = await this.db.get('SELECT COUNT(*) as count FROM privacy_policies');
    const totalConsents = await this.db.get('SELECT COUNT(*) as count FROM consent_records');

    return {
      totalPolicies: totalPolicies?.count || 0,
      totalConsents: totalConsents?.count || 0,
      chain: BWAEZI_CHAIN.NAME,
      initialized: this.initialized
    };
  }
}

export default DataPrivacyEngine;
