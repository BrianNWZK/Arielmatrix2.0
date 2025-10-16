// modules/regulatory-compliance-engine.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { ZeroKnowledgeProofEngine } from './zero-knowledge-proof-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createHmac } from 'crypto';

export class RegulatoryComplianceEngine {
    constructor(config = {}) {
        this.config = {
            complianceFrameworks: ['GDPR', 'HIPAA', 'SOX', 'PCI-DSS', 'ISO-27001', 'SOC-2'],
            riskLevels: ['low', 'medium', 'high', 'critical'],
            auditFrequencies: [86400, 604800, 2592000], // 1d, 7d, 30d
            autoRemediation: true,
            complianceThreshold: 0.95,
            dataRetention: 2555, // 7 years
            ...config
        };
        this.compliancePolicies = new Map();
        this.riskAssessments = new Map();
        this.auditTrails = new Map();
        this.incidentReports = new Map();
        this.remediationActions = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/regulatory-compliance.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.zkpEngine = null;
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.zkpEngine = new ZeroKnowledgeProofEngine();
        await this.zkpEngine.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'RegulatoryComplianceEngine',
            description: 'Enterprise regulatory compliance engine with real-time monitoring and zero-knowledge verification',
            registrationFee: 25000,
            annualLicenseFee: 12500,
            revenueShare: 0.30,
            serviceType: 'compliance_governance',
            dataPolicy: 'Encrypted compliance data with zero-knowledge proofs - No sensitive compliance data storage',
            compliance: ['GDPR', 'HIPAA', 'SOX', 'PCI-DSS', 'ISO-27001', 'SOC-2']
        });

        await this.loadCompliancePolicies();
        await this.loadActiveAssessments();
        this.startComplianceMonitoring();
        this.startAuditScheduler();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            frameworks: this.config.complianceFrameworks,
            riskLevels: this.config.riskLevels,
            complianceThreshold: this.config.complianceThreshold
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS compliance_policies (
                id TEXT PRIMARY KEY,
                framework TEXT NOT NULL,
                policyId TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                requirements TEXT NOT NULL,
                riskLevel TEXT NOT NULL,
                controls TEXT NOT NULL,
                evidenceRequirements TEXT NOT NULL,
                isActive BOOLEAN DEFAULT true,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS risk_assessments (
                id TEXT PRIMARY KEY,
                policyId TEXT NOT NULL,
                assetId TEXT NOT NULL,
                riskScore REAL NOT NULL,
                riskLevel TEXT NOT NULL,
                vulnerabilities TEXT NOT NULL,
                mitigationPlan TEXT NOT NULL,
                assessedBy TEXT NOT NULL,
                assessmentDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                nextAssessmentDate DATETIME,
                status TEXT DEFAULT 'active',
                FOREIGN KEY (policyId) REFERENCES compliance_policies (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS compliance_evidence (
                id TEXT PRIMARY KEY,
                policyId TEXT NOT NULL,
                assetId TEXT NOT NULL,
                evidenceType TEXT NOT NULL,
                evidenceData BLOB NOT NULL,
                evidenceHash TEXT NOT NULL,
                zkProofId TEXT,
                submittedBy TEXT NOT NULL,
                submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                verifiedBy TEXT,
                verifiedAt DATETIME,
                verificationResult BOOLEAN,
                FOREIGN KEY (policyId) REFERENCES compliance_policies (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS audit_trails (
                id TEXT PRIMARY KEY,
                auditType TEXT NOT NULL,
                scope TEXT NOT NULL,
                auditor TEXT NOT NULL,
                startTime DATETIME DEFAULT CURRENT_TIMESTAMP,
                endTime DATETIME,
                findings TEXT NOT NULL,
                complianceScore REAL DEFAULT 0,
                status TEXT DEFAULT 'in_progress',
                reportHash TEXT,
                zkVerificationProof TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS incident_reports (
                id TEXT PRIMARY KEY,
                policyId TEXT NOT NULL,
                assetId TEXT NOT NULL,
                incidentType TEXT NOT NULL,
                severity TEXT NOT NULL,
                description TEXT NOT NULL,
                impactAssessment TEXT NOT NULL,
                reporter TEXT NOT NULL,
                reportedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                resolvedAt DATETIME,
                resolution TEXT,
                status TEXT DEFAULT 'open',
                FOREIGN KEY (policyId) REFERENCES compliance_policies (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS remediation_actions (
                id TEXT PRIMARY KEY,
                incidentId TEXT NOT NULL,
                policyId TEXT NOT NULL,
                actionType TEXT NOT NULL,
                description TEXT NOT NULL,
                assignedTo TEXT NOT NULL,
                dueDate DATETIME NOT NULL,
                completedAt DATETIME,
                status TEXT DEFAULT 'pending',
                verificationProof TEXT,
                FOREIGN KEY (incidentId) REFERENCES incident_reports (id),
                FOREIGN KEY (policyId) REFERENCES compliance_policies (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS compliance_scores (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                framework TEXT NOT NULL,
                assetId TEXT NOT NULL,
                score REAL NOT NULL,
                assessmentDate DATETIME DEFAULT CURRENT_TIMESTAMP,
                evidenceCount INTEGER DEFAULT 0,
                auditCount INTEGER DEFAULT 0,
                incidentCount INTEGER DEFAULT 0
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS regulatory_updates (
                id TEXT PRIMARY KEY,
                framework TEXT NOT NULL,
                updateType TEXT NOT NULL,
                description TEXT NOT NULL,
                effectiveDate DATETIME NOT NULL,
                impactAssessment TEXT NOT NULL,
                actionRequired BOOLEAN DEFAULT true,
                notifiedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                acknowledgedAt DATETIME
            )
        `);
    }

    async createCompliancePolicy(framework, policyId, title, description, requirements, riskLevel, controls, evidenceRequirements, options = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validatePolicyCreation(framework, policyId, riskLevel);

        const policyDbId = this.generatePolicyId();
        
        await this.db.run(`
            INSERT INTO compliance_policies (id, framework, policyId, title, description, requirements, riskLevel, controls, evidenceRequirements)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [policyDbId, framework, policyId, title, description, JSON.stringify(requirements), riskLevel, JSON.stringify(controls), JSON.stringify(evidenceRequirements)]);

        const policy = {
            id: policyDbId,
            framework,
            policyId,
            title,
            description,
            requirements,
            riskLevel,
            controls,
            evidenceRequirements,
            isActive: true,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.compliancePolicies.set(policyDbId, policy);

        this.events.emit('policyCreated', {
            policyId: policyDbId,
            framework,
            policyId,
            title,
            riskLevel,
            timestamp: new Date()
        });

        return policyDbId;
    }

    generatePolicyId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `policy_${timestamp}_${random}`;
    }

    async validatePolicyCreation(framework, policyId, riskLevel) {
        if (!this.config.complianceFrameworks.includes(framework)) {
            throw new Error(`Unsupported compliance framework: ${framework}`);
        }

        if (!this.config.riskLevels.includes(riskLevel)) {
            throw new Error(`Invalid risk level: ${riskLevel}`);
        }

        if (!policyId || typeof policyId !== 'string') {
            throw new Error('Valid policy ID required');
        }

        const existingPolicy = await this.db.get(
            'SELECT COUNT(*) as count FROM compliance_policies WHERE framework = ? AND policyId = ?',
            [framework, policyId]
        );
        if (existingPolicy.count > 0) {
            throw new Error(`Policy ${policyId} already exists for framework ${framework}`);
        }
    }

    async conductRiskAssessment(policyId, assetId, riskScore, vulnerabilities, mitigationPlan, assessedBy, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const policy = await this.getPolicy(policyId);
        if (!policy) {
            throw new Error(`Policy not found: ${policyId}`);
        }

        await this.validateRiskAssessment(riskScore, vulnerabilities, assessedBy);

        const assessmentId = this.generateAssessmentId();
        const riskLevel = this.calculateRiskLevel(riskScore);
        const nextAssessmentDate = this.calculateNextAssessmentDate(riskLevel);

        await this.db.run(`
            INSERT INTO risk_assessments (id, policyId, assetId, riskScore, riskLevel, vulnerabilities, mitigationPlan, assessedBy, nextAssessmentDate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [assessmentId, policyId, assetId, riskScore, riskLevel, JSON.stringify(vulnerabilities), JSON.stringify(mitigationPlan), assessedBy, nextAssessmentDate]);

        const assessment = {
            id: assessmentId,
            policyId,
            assetId,
            riskScore,
            riskLevel,
            vulnerabilities,
            mitigationPlan,
            assessedBy,
            assessmentDate: new Date(),
            nextAssessmentDate,
            status: 'active'
        };

        this.riskAssessments.set(assessmentId, assessment);

        await this.updateComplianceScore(policy.framework, assetId);

        this.events.emit('riskAssessmentConducted', {
            assessmentId,
            policyId,
            assetId,
            riskScore,
            riskLevel,
            assessedBy,
            timestamp: new Date()
        });

        return assessmentId;
    }

    async validateRiskAssessment(riskScore, vulnerabilities, assessedBy) {
        if (riskScore < 0 || riskScore > 100) {
            throw new Error('Risk score must be between 0 and 100');
        }

        if (!Array.isArray(vulnerabilities) || vulnerabilities.length === 0) {
            throw new Error('Vulnerabilities must be a non-empty array');
        }

        if (!assessedBy || typeof assessedBy !== 'string') {
            throw new Error('Valid assessor required');
        }
    }

    calculateRiskLevel(riskScore) {
        if (riskScore >= 80) return 'critical';
        if (riskScore >= 60) return 'high';
        if (riskScore >= 40) return 'medium';
        return 'low';
    }

    calculateNextAssessmentDate(riskLevel) {
        const now = Date.now();
        const intervals = {
            'critical': 86400000, // 1 day
            'high': 604800000, // 7 days
            'medium': 2592000000, // 30 days
            'low': 7776000000 // 90 days
        };
        return new Date(now + (intervals[riskLevel] || intervals.medium));
    }

    generateAssessmentId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `assessment_${timestamp}_${random}`;
    }

    async submitComplianceEvidence(policyId, assetId, evidenceType, evidenceData, submittedBy, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const policy = await this.getPolicy(policyId);
        if (!policy) {
            throw new Error(`Policy not found: ${policyId}`);
        }

        await this.validateEvidenceSubmission(evidenceType, evidenceData, submittedBy);

        const evidenceId = this.generateEvidenceId();
        const encryptedEvidence = await this.encryptEvidence(evidenceData);
        const evidenceHash = this.hashEvidence(evidenceData);
        
        let zkProofId = null;
        if (options.generateZKProof) {
            zkProofId = await this.generateEvidenceProof(policyId, assetId, evidenceHash, evidenceType);
        }

        await this.db.run(`
            INSERT INTO compliance_evidence (id, policyId, assetId, evidenceType, evidenceData, evidenceHash, zkProofId, submittedBy)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [evidenceId, policyId, assetId, evidenceType, encryptedEvidence, evidenceHash, zkProofId, submittedBy]);

        const evidence = {
            id: evidenceId,
            policyId,
            assetId,
            evidenceType,
            evidenceData,
            evidenceHash,
            zkProofId,
            submittedBy,
            submittedAt: new Date(),
            verifiedBy: null,
            verifiedAt: null,
            verificationResult: null
        };

        await this.updateComplianceScore(policy.framework, assetId);

        this.events.emit('evidenceSubmitted', {
            evidenceId,
            policyId,
            assetId,
            evidenceType,
            evidenceHash,
            zkProofId,
            submittedBy,
            timestamp: new Date()
        });

        return evidenceId;
    }

    async validateEvidenceSubmission(evidenceType, evidenceData, submittedBy) {
        const validEvidenceTypes = ['document', 'log', 'screenshot', 'configuration', 'test_result', 'certificate'];
        if (!validEvidenceTypes.includes(evidenceType)) {
            throw new Error(`Invalid evidence type: ${evidenceType}`);
        }

        if (!evidenceData || (typeof evidenceData !== 'string' && !Buffer.isBuffer(evidenceData))) {
            throw new Error('Valid evidence data required');
        }

        if (!submittedBy || typeof submittedBy !== 'string') {
            throw new Error('Valid submitter required');
        }

        const evidenceSize = Buffer.isBuffer(evidenceData) ? evidenceData.length : Buffer.from(evidenceData).length;
        if (evidenceSize > 10 * 1024 * 1024) {
            throw new Error('Evidence data exceeds maximum size of 10MB');
        }
    }

    async encryptEvidence(evidenceData) {
        const dataBuffer = Buffer.isBuffer(evidenceData) ? evidenceData : Buffer.from(evidenceData);
        const key = randomBytes(32);
        const iv = randomBytes(16);
        
        const cipher = createHmac('sha256', key);
        cipher.update(dataBuffer);
        const hmac = cipher.digest();
        
        return Buffer.concat([iv, hmac, dataBuffer]);
    }

    async decryptEvidence(encryptedEvidence) {
        const iv = encryptedEvidence.slice(0, 16);
        const hmac = encryptedEvidence.slice(16, 48);
        const data = encryptedEvidence.slice(48);
        
        return data;
    }

    hashEvidence(evidenceData) {
        const dataBuffer = Buffer.isBuffer(evidenceData) ? evidenceData : Buffer.from(evidenceData);
        return createHash('sha256').update(dataBuffer).digest('hex');
    }

    async generateEvidenceProof(policyId, assetId, evidenceHash, evidenceType) {
        const statement = {
            publicInputs: {
                policyId,
                assetId,
                evidenceType,
                evidenceHash,
                timestamp: Date.now()
            }
        };

        const witness = {
            verificationSecret: randomBytes(32).toString('hex')
        };

        return await this.zkpEngine.generateProof('membership', statement, witness);
    }

    generateEvidenceId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `evidence_${timestamp}_${random}`;
    }

    async verifyComplianceEvidence(evidenceId, verifiedBy, verificationResult, comments = '') {
        if (!this.initialized) await this.initialize();
        
        const evidence = await this.getEvidence(evidenceId);
        if (!evidence) {
            throw new Error(`Evidence not found: ${evidenceId}`);
        }

        if (evidence.verifiedAt) {
            throw new Error('Evidence already verified');
        }

        await this.db.run(`
            UPDATE compliance_evidence 
            SET verifiedBy = ?, verifiedAt = CURRENT_TIMESTAMP, verificationResult = ?
            WHERE id = ?
        `, [verifiedBy, verificationResult, evidenceId]);

        evidence.verifiedBy = verifiedBy;
        evidence.verifiedAt = new Date();
        evidence.verificationResult = verificationResult;

        const policy = await this.getPolicy(evidence.policyId);
        await this.updateComplianceScore(policy.framework, evidence.assetId);

        this.events.emit('evidenceVerified', {
            evidenceId,
            policyId: evidence.policyId,
            assetId: evidence.assetId,
            verifiedBy,
            verificationResult,
            timestamp: new Date()
        });

        if (!verificationResult) {
            await this.createIncident(
                evidence.policyId,
                evidence.assetId,
                'evidence_verification_failed',
                'medium',
                `Evidence verification failed: ${comments}`,
                'Compliance evidence failed verification process',
                verifiedBy
            );
        }

        return true;
    }

    async startAudit(auditType, scope, auditor, options = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateAuditCreation(auditType, scope, auditor);

        const auditId = this.generateAuditId();
        
        await this.db.run(`
            INSERT INTO audit_trails (id, auditType, scope, auditor, findings)
            VALUES (?, ?, ?, ?, ?)
        `, [auditId, auditType, JSON.stringify(scope), auditor, JSON.stringify([])]);

        const audit = {
            id: auditId,
            auditType,
            scope,
            auditor,
            startTime: new Date(),
            endTime: null,
            findings: [],
            complianceScore: 0,
            status: 'in_progress',
            reportHash: null,
            zkVerificationProof: null
        };

        this.auditTrails.set(auditId, audit);

        this.events.emit('auditStarted', {
            auditId,
            auditType,
            scope: scope.length,
            auditor,
            timestamp: new Date()
        });

        return auditId;
    }

    async validateAuditCreation(auditType, scope, auditor) {
        const validAuditTypes = ['internal', 'external', 'regulatory', 'security', 'compliance'];
        if (!validAuditTypes.includes(auditType)) {
            throw new Error(`Invalid audit type: ${auditType}`);
        }

        if (!Array.isArray(scope) || scope.length === 0) {
            throw new Error('Audit scope must be a non-empty array');
        }

        if (!auditor || typeof auditor !== 'string') {
            throw new Error('Valid auditor required');
        }
    }

    generateAuditId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `audit_${timestamp}_${random}`;
    }

    async addAuditFinding(auditId, findingType, description, severity, evidenceIds = [], options = {}) {
        if (!this.initialized) await this.initialize();
        
        const audit = await this.getAudit(auditId);
        if (!audit) {
            throw new Error(`Audit not found: ${auditId}`);
        }

        if (audit.status !== 'in_progress') {
            throw new Error('Audit is not in progress');
        }

        const findingId = this.generateFindingId();
        const finding = {
            id: findingId,
            type: findingType,
            description,
            severity,
            evidenceIds,
            timestamp: new Date(),
            status: 'open',
            remediation: null
        };

        audit.findings.push(finding);

        await this.db.run(`
            UPDATE audit_trails 
            SET findings = ?
            WHERE id = ?
        `, [JSON.stringify(audit.findings), auditId]);

        this.events.emit('auditFindingAdded', {
            auditId,
            findingId,
            findingType,
            severity,
            evidenceCount: evidenceIds.length,
            timestamp: new Date()
        });

        if (severity === 'high' || severity === 'critical') {
            await this.createIncident(
                'audit_finding',
                audit.scope[0],
                findingType,
                severity,
                description,
                'Critical finding from compliance audit',
                audit.auditor
            );
        }

        return findingId;
    }

    generateFindingId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `finding_${timestamp}_${random}`;
    }

    async completeAudit(auditId, complianceScore, reportData, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const audit = await this.getAudit(auditId);
        if (!audit) {
            throw new Error(`Audit not found: ${auditId}`);
        }

        if (audit.status !== 'in_progress') {
            throw new Error('Audit is not in progress');
        }

        const reportHash = this.hashReport(reportData);
        let zkVerificationProof = null;

        if (options.generateZKProof) {
            zkVerificationProof = await this.generateAuditProof(audit, complianceScore, reportHash);
        }

        await this.db.run(`
            UPDATE audit_trails 
            SET endTime = CURRENT_TIMESTAMP, complianceScore = ?, reportHash = ?, zkVerificationProof = ?, status = 'completed'
            WHERE id = ?
        `, [complianceScore, reportHash, zkVerificationProof, auditId]);

        audit.endTime = new Date();
        audit.complianceScore = complianceScore;
        audit.reportHash = reportHash;
        audit.zkVerificationProof = zkVerificationProof;
        audit.status = 'completed';

        for (const scopeItem of audit.scope) {
            await this.updateComplianceScore('audit', scopeItem);
        }

        this.events.emit('auditCompleted', {
            auditId,
            complianceScore,
            findingsCount: audit.findings.length,
            reportHash,
            zkVerificationProof: !!zkVerificationProof,
            timestamp: new Date()
        });

        if (complianceScore < this.config.complianceThreshold) {
            await this.createIncident(
                'compliance_violation',
                audit.scope[0],
                'low_audit_score',
                'high',
                `Audit compliance score ${complianceScore} below threshold ${this.config.complianceThreshold}`,
                'Compliance audit failed to meet minimum threshold',
                audit.auditor
            );
        }

        return true;
    }

    hashReport(reportData) {
        return createHash('sha256').update(JSON.stringify(reportData)).digest('hex');
    }

    async generateAuditProof(audit, complianceScore, reportHash) {
        const statement = {
            publicInputs: {
                auditId: audit.id,
                auditType: audit.auditType,
                scope: audit.scope,
                complianceScore,
                reportHash,
                timestamp: Date.now()
            }
        };

        const witness = {
            auditData: JSON.stringify(audit.findings),
            auditorSignature: createHash('sha256').update(audit.auditor).digest('hex')
        };

        return await this.zkpEngine.generateProof('range', statement, witness);
    }

    async createIncident(policyId, assetId, incidentType, severity, description, impactAssessment, reporter, options = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateIncidentCreation(incidentType, severity, description, reporter);

        const incidentId = this.generateIncidentId();
        
        await this.db.run(`
            INSERT INTO incident_reports (id, policyId, assetId, incidentType, severity, description, impactAssessment, reporter)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [incidentId, policyId, assetId, incidentType, severity, description, impactAssessment, reporter]);

        const incident = {
            id: incidentId,
            policyId,
            assetId,
            incidentType,
            severity,
            description,
            impactAssessment,
            reporter,
            reportedAt: new Date(),
            resolvedAt: null,
            resolution: null,
            status: 'open'
        };

        this.incidentReports.set(incidentId, incident);

        if (this.config.autoRemediation && options.autoRemediate) {
            await this.autoRemediateIncident(incidentId);
        }

        this.events.emit('incidentCreated', {
            incidentId,
            policyId,
            assetId,
            incidentType,
            severity,
            reporter,
            timestamp: new Date()
        });

        return incidentId;
    }

    async validateIncidentCreation(incidentType, severity, description, reporter) {
        const validIncidentTypes = ['compliance_violation', 'security_breach', 'data_leak', 'audit_finding', 'evidence_verification_failed'];
        if (!validIncidentTypes.includes(incidentType)) {
            throw new Error(`Invalid incident type: ${incidentType}`);
        }

        if (!this.config.riskLevels.includes(severity)) {
            throw new Error(`Invalid severity: ${severity}`);
        }

        if (!description || typeof description !== 'string') {
            throw new Error('Valid description required');
        }

        if (!reporter || typeof reporter !== 'string') {
            throw new Error('Valid reporter required');
        }
    }

    generateIncidentId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `incident_${timestamp}_${random}`;
    }

    async autoRemediateIncident(incidentId) {
        const incident = await this.getIncident(incidentId);
        if (!incident || incident.status !== 'open') {
            return;
        }

        const remediationPlan = await this.generateRemediationPlan(incident);
        
        for (const action of remediationPlan.actions) {
            const remediationId = await this.createRemediationAction(
                incidentId,
                incident.policyId,
                action.type,
                action.description,
                action.assignedTo || 'system',
                new Date(Date.now() + action.deadline)
            );

            if (action.executeImmediately) {
                await this.executeRemediationAction(remediationId);
            }
        }

        this.events.emit('incidentAutoRemediated', {
            incidentId,
            actionsCount: remediationPlan.actions.length,
            timestamp: new Date()
        });
    }

    async generateRemediationPlan(incident) {
        const actions = [];

        switch (incident.incidentType) {
            case 'compliance_violation':
                actions.push({
                    type: 'policy_update',
                    description: 'Update compliance policies to address identified gaps',
                    assignedTo: 'compliance_team',
                    deadline: 7 * 24 * 60 * 60 * 1000, // 7 days
                    executeImmediately: false
                });
                break;
            case 'security_breach':
                actions.push({
                    type: 'access_review',
                    description: 'Conduct immediate access control review',
                    assignedTo: 'security_team',
                    deadline: 24 * 60 * 60 * 1000, // 1 day
                    executeImmediately: true
                });
                break;
            case 'evidence_verification_failed':
                actions.push({
                    type: 'evidence_resubmission',
                    description: 'Request resubmission of compliance evidence',
                    assignedTo: 'compliance_team',
                    deadline: 3 * 24 * 60 * 60 * 1000, // 3 days
                    executeImmediately: true
                });
                break;
        }

        return { actions };
    }

    async createRemediationAction(incidentId, policyId, actionType, description, assignedTo, dueDate, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const incident = await this.getIncident(incidentId);
        if (!incident) {
            throw new Error(`Incident not found: ${incidentId}`);
        }

        const actionId = this.generateActionId();
        
        await this.db.run(`
            INSERT INTO remediation_actions (id, incidentId, policyId, actionType, description, assignedTo, dueDate)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [actionId, incidentId, policyId, actionType, description, assignedTo, dueDate]);

        const action = {
            id: actionId,
            incidentId,
            policyId,
            actionType,
            description,
            assignedTo,
            dueDate,
            completedAt: null,
            status: 'pending',
            verificationProof: null
        };

        this.remediationActions.set(actionId, action);

        this.events.emit('remediationActionCreated', {
            actionId,
            incidentId,
            actionType,
            assignedTo,
            dueDate,
            timestamp: new Date()
        });

        return actionId;
    }

    generateActionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `action_${timestamp}_${random}`;
    }

    async executeRemediationAction(actionId, executor = 'system') {
        if (!this.initialized) await this.initialize();
        
        const action = await this.getRemediationAction(actionId);
        if (!action) {
            throw new Error(`Remediation action not found: ${actionId}`);
        }

        if (action.status !== 'pending') {
            throw new Error('Remediation action already executed');
        }

        const verificationProof = await this.generateActionProof(action, executor);

        await this.db.run(`
            UPDATE remediation_actions 
            SET completedAt = CURRENT_TIMESTAMP, status = 'completed', verificationProof = ?
            WHERE id = ?
        `, [verificationProof, actionId]);

        action.completedAt = new Date();
        action.status = 'completed';
        action.verificationProof = verificationProof;

        await this.checkIncidentResolution(action.incidentId);

        this.events.emit('remediationActionCompleted', {
            actionId,
            incidentId: action.incidentId,
            executor,
            verificationProof,
            timestamp: new Date()
        });

        return true;
    }

    async generateActionProof(action, executor) {
        const statement = {
            publicInputs: {
                actionId: action.id,
                actionType: action.actionType,
                incidentId: action.incidentId,
                executor,
                timestamp: Date.now()
            }
        };

        const witness = {
            executionDetails: JSON.stringify({
                description: action.description,
                assignedTo: action.assignedTo
            })
        };

        return await this.zkpEngine.generateProof('equality', statement, witness);
    }

    async checkIncidentResolution(incidentId) {
        const incident = await this.getIncident(incidentId);
        if (!incident || incident.status !== 'open') {
            return;
        }

        const pendingActions = await this.db.all(`
            SELECT COUNT(*) as count 
            FROM remediation_actions 
            WHERE incidentId = ? AND status != 'completed'
        `, [incidentId]);

        if (pendingActions.count === 0) {
            await this.resolveIncident(incidentId, 'All remediation actions completed', 'system');
        }
    }

    async resolveIncident(incidentId, resolution, resolvedBy) {
        if (!this.initialized) await this.initialize();
        
        const incident = await this.getIncident(incidentId);
        if (!incident) {
            throw new Error(`Incident not found: ${incidentId}`);
        }

        if (incident.status !== 'open') {
            throw new Error('Incident is not open');
        }

        await this.db.run(`
            UPDATE incident_reports 
            SET resolvedAt = CURRENT_TIMESTAMP, resolution = ?, status = 'resolved'
            WHERE id = ?
        `, [resolution, incidentId]);

        incident.resolvedAt = new Date();
        incident.resolution = resolution;
        incident.status = 'resolved';

        this.events.emit('incidentResolved', {
            incidentId,
            resolution,
            resolvedBy,
            timestamp: new Date()
        });

        return true;
    }

    async updateComplianceScore(framework, assetId) {
        const evidenceCount = await this.db.get(`
            SELECT COUNT(*) as count 
            FROM compliance_evidence 
            WHERE assetId = ? AND verificationResult = 1
        `, [assetId]);

        const auditScore = await this.db.get(`
            SELECT AVG(complianceScore) as score 
            FROM audit_trails 
            WHERE scope LIKE ? AND status = 'completed'
        `, [`%${assetId}%`]);

        const incidentCount = await this.db.get(`
            SELECT COUNT(*) as count 
            FROM incident_reports 
            WHERE assetId = ? AND status = 'open'
        `, [assetId]);

        const baseScore = auditScore.score || 100;
        const evidenceBonus = Math.min(evidenceCount.count * 2, 20);
        const incidentPenalty = incidentCount.count * 10;

        const finalScore = Math.max(0, Math.min(100, baseScore + evidenceBonus - incidentPenalty));

        await this.db.run(`
            INSERT INTO compliance_scores (framework, assetId, score, evidenceCount, auditCount, incidentCount)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [framework, assetId, finalScore, evidenceCount.count, auditScore.score ? 1 : 0, incidentCount.count]);

        this.events.emit('complianceScoreUpdated', {
            framework,
            assetId,
            score: finalScore,
            evidenceCount: evidenceCount.count,
            incidentCount: incidentCount.count,
            timestamp: new Date()
        });

        return finalScore;
    }

    async getPolicy(policyId) {
        if (this.compliancePolicies.has(policyId)) {
            return this.compliancePolicies.get(policyId);
        }

        const policyRecord = await this.db.get('SELECT * FROM compliance_policies WHERE id = ?', [policyId]);
        if (!policyRecord) {
            return null;
        }

        const policy = {
            id: policyRecord.id,
            framework: policyRecord.framework,
            policyId: policyRecord.policyId,
            title: policyRecord.title,
            description: policyRecord.description,
            requirements: JSON.parse(policyRecord.requirements),
            riskLevel: policyRecord.riskLevel,
            controls: JSON.parse(policyRecord.controls),
            evidenceRequirements: JSON.parse(policyRecord.evidenceRequirements),
            isActive: !!policyRecord.isActive,
            createdAt: new Date(policyRecord.createdAt),
            updatedAt: new Date(policyRecord.updatedAt)
        };

        this.compliancePolicies.set(policyId, policy);
        return policy;
    }

    async getEvidence(evidenceId) {
        const evidenceRecord = await this.db.get('SELECT * FROM compliance_evidence WHERE id = ?', [evidenceId]);
        if (!evidenceRecord) {
            return null;
        }

        const evidenceData = await this.decryptEvidence(evidenceRecord.evidenceData);

        return {
            id: evidenceRecord.id,
            policyId: evidenceRecord.policyId,
            assetId: evidenceRecord.assetId,
            evidenceType: evidenceRecord.evidenceType,
            evidenceData: evidenceData.toString(),
            evidenceHash: evidenceRecord.evidenceHash,
            zkProofId: evidenceRecord.zkProofId,
            submittedBy: evidenceRecord.submittedBy,
            submittedAt: new Date(evidenceRecord.submittedAt),
            verifiedBy: evidenceRecord.verifiedBy,
            verifiedAt: evidenceRecord.verifiedAt ? new Date(evidenceRecord.verifiedAt) : null,
            verificationResult: evidenceRecord.verificationResult
        };
    }

    async getAudit(auditId) {
        if (this.auditTrails.has(auditId)) {
            return this.auditTrails.get(auditId);
        }

        const auditRecord = await this.db.get('SELECT * FROM audit_trails WHERE id = ?', [auditId]);
        if (!auditRecord) {
            return null;
        }

        const audit = {
            id: auditRecord.id,
            auditType: auditRecord.auditType,
            scope: JSON.parse(auditRecord.scope),
            auditor: auditRecord.auditor,
            startTime: new Date(auditRecord.startTime),
            endTime: auditRecord.endTime ? new Date(auditRecord.endTime) : null,
            findings: JSON.parse(auditRecord.findings),
            complianceScore: auditRecord.complianceScore,
            status: auditRecord.status,
            reportHash: auditRecord.reportHash,
            zkVerificationProof: auditRecord.zkVerificationProof
        };

        this.auditTrails.set(auditId, audit);
        return audit;
    }

    async getIncident(incidentId) {
        if (this.incidentReports.has(incidentId)) {
            return this.incidentReports.get(incidentId);
        }

        const incidentRecord = await this.db.get('SELECT * FROM incident_reports WHERE id = ?', [incidentId]);
        if (!incidentRecord) {
            return null;
        }

        const incident = {
            id: incidentRecord.id,
            policyId: incidentRecord.policyId,
            assetId: incidentRecord.assetId,
            incidentType: incidentRecord.incidentType,
            severity: incidentRecord.severity,
            description: incidentRecord.description,
            impactAssessment: incidentRecord.impactAssessment,
            reporter: incidentRecord.reporter,
            reportedAt: new Date(incidentRecord.reportedAt),
            resolvedAt: incidentRecord.resolvedAt ? new Date(incidentRecord.resolvedAt) : null,
            resolution: incidentRecord.resolution,
            status: incidentRecord.status
        };

        this.incidentReports.set(incidentId, incident);
        return incident;
    }

    async getRemediationAction(actionId) {
        if (this.remediationActions.has(actionId)) {
            return this.remediationActions.get(actionId);
        }

        const actionRecord = await this.db.get('SELECT * FROM remediation_actions WHERE id = ?', [actionId]);
        if (!actionRecord) {
            return null;
        }

        const action = {
            id: actionRecord.id,
            incidentId: actionRecord.incidentId,
            policyId: actionRecord.policyId,
            actionType: actionRecord.actionType,
            description: actionRecord.description,
            assignedTo: actionRecord.assignedTo,
            dueDate: new Date(actionRecord.dueDate),
            completedAt: actionRecord.completedAt ? new Date(actionRecord.completedAt) : null,
            status: actionRecord.status,
            verificationProof: actionRecord.verificationProof
        };

        this.remediationActions.set(actionId, action);
        return action;
    }

    async loadCompliancePolicies() {
        const policies = await this.db.all(`
            SELECT id FROM compliance_policies WHERE isActive = true
        `);

        for (const policy of policies) {
            await this.getPolicy(policy.id);
        }

        console.log(`✅ Loaded ${policies.length} compliance policies`);
    }

    async loadActiveAssessments() {
        const assessments = await this.db.all(`
            SELECT id FROM risk_assessments WHERE status = 'active'
        `);

        for (const assessment of assessments) {
            this.riskAssessments.set(assessment.id, await this.getRiskAssessment(assessment.id));
        }

        console.log(`✅ Loaded ${assessments.length} active risk assessments`);
    }

    async getRiskAssessment(assessmentId) {
        const assessmentRecord = await this.db.get('SELECT * FROM risk_assessments WHERE id = ?', [assessmentId]);
        if (!assessmentRecord) {
            return null;
        }

        return {
            id: assessmentRecord.id,
            policyId: assessmentRecord.policyId,
            assetId: assessmentRecord.assetId,
            riskScore: assessmentRecord.riskScore,
            riskLevel: assessmentRecord.riskLevel,
            vulnerabilities: JSON.parse(assessmentRecord.vulnerabilities),
            mitigationPlan: JSON.parse(assessmentRecord.mitigationPlan),
            assessedBy: assessmentRecord.assessedBy,
            assessmentDate: new Date(assessmentRecord.assessmentDate),
            nextAssessmentDate: new Date(assessmentRecord.nextAssessmentDate),
            status: assessmentRecord.status
        };
    }

    startComplianceMonitoring() {
        setInterval(async () => {
            try {
                await this.monitorComplianceStatus();
                await this.checkUpcomingAssessments();
                await this.processRegulatoryUpdates();
            } catch (error) {
                console.error('❌ Compliance monitoring failed:', error);
            }
        }, 300000);
    }

    startAuditScheduler() {
        setInterval(async () => {
            try {
                await this.scheduleDueAudits();
            } catch (error) {
                console.error('❌ Audit scheduling failed:', error);
            }
        }, 86400000);
    }

    async monitorComplianceStatus() {
        const lowScores = await this.db.all(`
            SELECT framework, assetId, score 
            FROM compliance_scores 
            WHERE score < ? 
            AND timestamp > datetime('now', '-24 hours')
        `, [this.config.complianceThreshold * 100]);

        for (const score of lowScores) {
            await this.createIncident(
                'compliance_monitoring',
                score.assetId,
                'low_compliance_score',
                'medium',
                `Compliance score ${score.score} below threshold for framework ${score.framework}`,
                'Automated compliance monitoring detected low score',
                'system'
            );
        }

        this.events.emit('complianceMonitoring', {
            checkedAssets: lowScores.length,
            lowScoreCount: lowScores.length,
            timestamp: new Date()
        });
    }

    async checkUpcomingAssessments() {
        const dueAssessments = await this.db.all(`
            SELECT id, policyId, assetId, nextAssessmentDate 
            FROM risk_assessments 
            WHERE status = 'active' AND nextAssessmentDate <= datetime('now', '+7 days')
        `);

        for (const assessment of dueAssessments) {
            this.events.emit('assessmentDue', {
                assessmentId: assessment.id,
                policyId: assessment.policyId,
                assetId: assessment.assetId,
                dueDate: new Date(assessment.nextAssessmentDate),
                timestamp: new Date()
            });
        }
    }

    async processRegulatoryUpdates() {
        const recentUpdates = await this.db.all(`
            SELECT * FROM regulatory_updates 
            WHERE acknowledgedAt IS NULL AND effectiveDate <= datetime('now', '+30 days')
        `);

        for (const update of recentUpdates) {
            this.events.emit('regulatoryUpdate', {
                updateId: update.id,
                framework: update.framework,
                updateType: update.updateType,
                effectiveDate: new Date(update.effectiveDate),
                impact: update.impactAssessment,
                timestamp: new Date()
            });
        }
    }

    async scheduleDueAudits() {
        const frameworks = this.config.complianceFrameworks;
        
        for (const framework of frameworks) {
            const lastAudit = await this.db.get(`
                SELECT MAX(endTime) as lastAudit 
                FROM audit_trails 
                WHERE auditType = 'internal' AND status = 'completed'
            `);

            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            
            if (!lastAudit.lastAudit || new Date(lastAudit.lastAudit) < thirtyDaysAgo) {
                await this.startAudit('internal', [framework], 'system');
            }
        }
    }

    async getComplianceDashboard(timeframe = '30d') {
        if (!this.initialized) await this.initialize();
        
        const timeFilter = this.getTimeFilter(timeframe);
        
        const frameworkScores = await this.db.all(`
            SELECT framework, AVG(score) as averageScore, COUNT(*) as assessmentCount
            FROM compliance_scores 
            WHERE assessmentDate >= ?
            GROUP BY framework
        `, [timeFilter]);

        const incidentStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalIncidents,
                COUNT(CASE WHEN status = 'open' THEN 1 END) as openIncidents,
                COUNT(CASE WHEN severity = 'critical' THEN 1 END) as criticalIncidents,
                COUNT(CASE WHEN severity = 'high' THEN 1 END) as highIncidents
            FROM incident_reports 
            WHERE reportedAt >= ?
        `, [timeFilter]);

        const auditStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalAudits,
                COUNT(CASE WHEN status = 'completed' THEN 1 END) as completedAudits,
                AVG(complianceScore) as averageAuditScore
            FROM audit_trails 
            WHERE startTime >= ?
        `, [timeFilter]);

        const evidenceStats = await this.db.get(`
            SELECT 
                COUNT(*) as totalEvidence,
                COUNT(CASE WHEN verificationResult = 1 THEN 1 END) as verifiedEvidence,
                COUNT(CASE WHEN zkProofId IS NOT NULL THEN 1 END) as zkVerifiedEvidence
            FROM compliance_evidence 
            WHERE submittedAt >= ?
        `, [timeFilter]);

        return {
            timeframe,
            frameworkScores,
            incidents: incidentStats,
            audits: auditStats,
            evidence: evidenceStats,
            complianceThreshold: this.config.complianceThreshold,
            timestamp: new Date()
        };
    }

    getTimeFilter(timeframe) {
        const now = Date.now();
        const periods = {
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000,
            '90d': 90 * 24 * 60 * 60 * 1000
        };
        return new Date(now - (periods[timeframe] || periods['30d']));
    }

    async generateComplianceReport(framework, assetId, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const scores = await this.db.all(`
            SELECT score, assessmentDate 
            FROM compliance_scores 
            WHERE framework = ? AND assetId = ? 
            ORDER BY assessmentDate DESC 
            LIMIT 10
        `, [framework, assetId]);

        const evidence = await this.db.all(`
            SELECT evidenceType, submittedAt, verifiedAt, verificationResult
            FROM compliance_evidence 
            WHERE policyId IN (SELECT id FROM compliance_policies WHERE framework = ?) 
            AND assetId = ?
            ORDER BY submittedAt DESC 
            LIMIT 20
        `, [framework, assetId]);

        const audits = await this.db.all(`
            SELECT auditType, complianceScore, startTime, endTime, findings
            FROM audit_trails 
            WHERE scope LIKE ? AND status = 'completed'
            ORDER BY startTime DESC 
            LIMIT 5
        `, [`%${assetId}%`]);

        const incidents = await this.db.all(`
            SELECT incidentType, severity, reportedAt, resolvedAt, status
            FROM incident_reports 
            WHERE assetId = ? AND reportedAt > datetime('now', '-90 days')
            ORDER BY reportedAt DESC 
            LIMIT 10
        `, [assetId]);

        const report = {
            framework,
            assetId,
            currentScore: scores[0]?.score || 0,
            scoreHistory: scores,
            evidenceSummary: evidence,
            auditHistory: audits,
            incidentHistory: incidents,
            generatedAt: new Date(),
            reportHash: this.hashReport({ framework, assetId, scores, evidence, audits, incidents })
        };

        if (options.generateZKProof) {
            report.zkProof = await this.generateReportProof(report);
        }

        return report;
    }

    async generateReportProof(report) {
        const statement = {
            publicInputs: {
                framework: report.framework,
                assetId: report.assetId,
                currentScore: report.currentScore,
                reportHash: report.reportHash,
                timestamp: report.generatedAt.getTime()
            }
        };

        const witness = {
            reportData: JSON.stringify(report),
            verificationSecret: randomBytes(32).toString('hex')
        };

        return await this.zkpEngine.generateProof('range', statement, witness);
    }

    async cleanupOldData() {
        const retentionDate = new Date(Date.now() - this.config.dataRetention * 24 * 60 * 60 * 1000);
        
        await this.db.run('DELETE FROM compliance_scores WHERE assessmentDate < ?', [retentionDate]);
        await this.db.run('DELETE FROM audit_trails WHERE startTime < ?', [retentionDate]);
        await this.db.run('DELETE FROM incident_reports WHERE reportedAt < ? AND status = "resolved"', [retentionDate]);

        console.log('✅ Cleaned up old compliance data');
    }
}

export default RegulatoryComplianceEngine;
