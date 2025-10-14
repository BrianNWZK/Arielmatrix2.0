// modules/regulatory-compliance-engine.js
import { randomBytes } from 'crypto';
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { BWAEZI_CHAIN } from '../config/bwaezi-config.js';

export class RegulatoryComplianceEngine {
  constructor(config = {}) {
    this.config = {
      auditInterval: 30 * 24 * 60 * 60 * 1000,
      reportingRequirements: true,
      ...config
    };
    this.complianceRecords = new Map();
    this.db = new ArielSQLiteEngine({ path: './regulatory-compliance.db' });
    this.events = new EventEmitter();
    this.sovereignService = null;
    this.serviceId = null;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    await this.db.init();
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS compliance_records (
        id TEXT PRIMARY KEY,
        entityId TEXT NOT NULL,
        framework TEXT NOT NULL,
        requirement TEXT NOT NULL,
        status TEXT NOT NULL,
        evidence TEXT,
        lastAudit DATETIME DEFAULT CURRENT_TIMESTAMP,
        nextAudit DATETIME NOT NULL
      )
    `);

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS audit_trails (
        id TEXT PRIMARY KEY,
        entityId TEXT NOT NULL,
        auditor TEXT NOT NULL,
        findings TEXT NOT NULL,
        score REAL NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.sovereignService = new SovereignRevenueEngine();
    await this.sovereignService.initialize();
    
    this.serviceId = await this.sovereignService.registerService({
      name: 'RegulatoryComplianceEngine',
      description: 'Automated compliance and auditing for BWAEZI Chain',
      registrationFee: 2000,
      annualLicenseFee: 1000,
      revenueShare: 0.15
    });

    this.startComplianceMonitoring();
    this.initialized = true;
    this.events.emit('initialized');
  }

  async registerEntity(entityId, frameworks = ['ISO-27001', 'NIST-CSF']) {
    if (!this.initialized) await this.initialize();
    
    const complianceId = randomBytes(16).toString('hex');
    const nextAudit = Date.now() + this.config.auditInterval;

    for (const framework of frameworks) {
      await this.db.run(`
        INSERT INTO compliance_records (id, entityId, framework, requirement, status, nextAudit)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [complianceId, entityId, framework, 'REGISTRATION', 'pending', nextAudit]);
    }

    this.complianceRecords.set(entityId, { frameworks, nextAudit });

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, 500, 'compliance_registration');
    }

    this.events.emit('entityRegistered', { entityId, frameworks });
    return complianceId;
  }

  async conductAudit(entityId, auditor = 'system_auditor') {
    if (!this.initialized) await this.initialize();
    
    const auditId = randomBytes(16).toString('hex');
    const records = await this.db.all('SELECT * FROM compliance_records WHERE entityId = ?', [entityId]);
    
    let totalScore = 0;
    const findings = [];

    for (const record of records) {
      const score = Math.random() * 0.3 + 0.7; // Simulated audit score
      totalScore += score;
      findings.push({
        framework: record.framework,
        score: score,
        status: score >= 0.8 ? 'compliant' : 'non_compliant'
      });
    }

    const overallScore = records.length > 0 ? totalScore / records.length : 0;
    const nextAudit = Date.now() + this.config.auditInterval;

    await this.db.run(`
      INSERT INTO audit_trails (id, entityId, auditor, findings, score)
      VALUES (?, ?, ?, ?, ?)
    `, [auditId, entityId, auditor, JSON.stringify(findings), overallScore]);

    await this.db.run('UPDATE compliance_records SET nextAudit = ? WHERE entityId = ?', [nextAudit, entityId]);

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, 1000, 'regulatory_audit');
    }

    this.events.emit('auditCompleted', { auditId, entityId, overallScore, findings });
    return { auditId, overallScore, findings };
  }

  startComplianceMonitoring() {
    setInterval(async () => {
      const now = Date.now();
      const dueAudits = await this.db.all(
        'SELECT DISTINCT entityId FROM compliance_records WHERE nextAudit <= ?',
        [now]
      );

      for (const audit of dueAudits) {
        await this.conductAudit(audit.entityId);
      }
    }, 24 * 60 * 60 * 1000);
  }

  async generateComplianceReport(entityId) {
    if (!this.initialized) await this.initialize();
    
    const records = await this.db.all(
      'SELECT * FROM compliance_records WHERE entityId = ? ORDER BY framework, requirement',
      [entityId]
    );

    const audits = await this.db.all(
      'SELECT * FROM audit_trails WHERE entityId = ? ORDER BY timestamp DESC LIMIT 5',
      [entityId]
    );

    const frameworkScores = {};
    records.forEach(record => {
      if (!frameworkScores[record.framework]) {
        frameworkScores[record.framework] = { total: 0, compliant: 0 };
      }
      frameworkScores[record.framework].total++;
      if (record.status === 'compliant') {
        frameworkScores[record.framework].compliant++;
      }
    });

    const report = {
      entityId,
      chain: BWAEZI_CHAIN.NAME,
      generationDate: Date.now(),
      frameworkScores: Object.keys(frameworkScores).map(framework => ({
        framework,
        complianceRate: frameworkScores[framework].compliant / frameworkScores[framework].total
      })),
      recentAudits: audits,
      overallCompliance: Object.values(frameworkScores).reduce((acc, curr) => 
        acc + (curr.compliant / curr.total), 0) / Object.keys(frameworkScores).length
    };

    if (this.sovereignService && this.serviceId) {
      await this.sovereignService.processRevenue(this.serviceId, 100, 'compliance_report');
    }

    return report;
  }

  async getStats() {
    if (!this.initialized) await this.initialize();
    
    const totalEntities = await this.db.get('SELECT COUNT(DISTINCT entityId) as count FROM compliance_records');
    const totalAudits = await this.db.get('SELECT COUNT(*) as count FROM audit_trails');

    return {
      totalEntities: totalEntities?.count || 0,
      totalAudits: totalAudits?.count || 0,
      chain: BWAEZI_CHAIN.NAME,
      initialized: this.initialized
    };
  }
}

export default RegulatoryComplianceEngine;
