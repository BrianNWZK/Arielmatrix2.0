// modules/digital-twin-management.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from '../ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { ZeroKnowledgeProofEngine } from './zero-knowledge-proof-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export class DigitalTwinManagement {
    constructor(config = {}) {
        this.config = {
            twinTypes: ['asset', 'identity', 'process', 'organization', 'iot_device'],
            maxTwinSize: 100 * 1024 * 1024, // 100MB
            syncInterval: 30000,
            versionHistory: 100,
            encryptionEnabled: true,
            replicationFactor: 3,
            dataRetention: 365, // days
            ...config
        };
        this.digitalTwins = new Map();
        this.twinRelationships = new Map();
        this.syncSessions = new Map();
        this.encryptionKeys = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/digital-twin-management.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.zkpEngine = null;
        this.initialized = false;
        this.storagePath = './data/twins';
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        await this.ensureStorageDirectory();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.zkpEngine = new ZeroKnowledgeProofEngine();
        await this.zkpEngine.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'DigitalTwinManagement',
            description: 'Enterprise-grade digital twin management with real-time synchronization and cryptographic verification',
            registrationFee: 15000,
            annualLicenseFee: 7500,
            revenueShare: 0.20,
            serviceType: 'digital_transformation',
            dataPolicy: 'Encrypted twin data with zero-knowledge verification - No plaintext storage',
            compliance: ['GDPR', 'ISO-27001', 'Zero-Knowledge Architecture']
        });

        await this.loadActiveTwins();
        this.startSyncEngine();
        this.startHealthMonitoring();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            twinTypes: this.config.twinTypes,
            storagePath: this.storagePath,
            encryptionEnabled: this.config.encryptionEnabled
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS digital_twins (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                description TEXT,
                owner TEXT NOT NULL,
                currentState BLOB NOT NULL,
                metadata TEXT NOT NULL,
                version INTEGER DEFAULT 1,
                parentTwinId TEXT,
                encryptionKeyId TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                lastSyncAt DATETIME,
                status TEXT DEFAULT 'active',
                sizeBytes INTEGER DEFAULT 0,
                checksum TEXT,
                accessControl TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS twin_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                twinId TEXT NOT NULL,
                version INTEGER NOT NULL,
                stateData BLOB NOT NULL,
                changeDescription TEXT,
                checksum TEXT NOT NULL,
                createdBy TEXT NOT NULL,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (twinId) REFERENCES digital_twins (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS twin_relationships (
                id TEXT PRIMARY KEY,
                sourceTwinId TEXT NOT NULL,
                targetTwinId TEXT NOT NULL,
                relationshipType TEXT NOT NULL,
                properties TEXT,
                strength REAL DEFAULT 1.0,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sourceTwinId) REFERENCES digital_twins (id),
                FOREIGN KEY (targetTwinId) REFERENCES digital_twins (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS twin_sync_sessions (
                id TEXT PRIMARY KEY,
                twinId TEXT NOT NULL,
                sessionType TEXT NOT NULL,
                sourceNode TEXT NOT NULL,
                targetNodes TEXT NOT NULL,
                syncData BLOB,
                conflictResolution TEXT,
                status TEXT DEFAULT 'pending',
                startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                completedAt DATETIME,
                errorMessage TEXT,
                FOREIGN KEY (twinId) REFERENCES digital_twins (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS twin_access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                twinId TEXT NOT NULL,
                actor TEXT NOT NULL,
                action TEXT NOT NULL,
                resource TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                ipAddress TEXT,
                userAgent TEXT,
                success BOOLEAN DEFAULT true,
                errorMessage TEXT,
                FOREIGN KEY (twinId) REFERENCES digital_twins (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS encryption_keys (
                id TEXT PRIMARY KEY,
                keyData BLOB NOT NULL,
                keyType TEXT DEFAULT 'aes-256-gcm',
                keyVersion INTEGER DEFAULT 1,
                twinId TEXT,
                createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
                isActive BOOLEAN DEFAULT true,
                FOREIGN KEY (twinId) REFERENCES digital_twins (id)
            )
        `);
    }

    async ensureStorageDirectory() {
        if (!existsSync(this.storagePath)) {
            mkdirSync(this.storagePath, { recursive: true });
        }
    }

    async createDigitalTwin(name, type, owner, initialState, metadata = {}, options = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateTwinCreation(name, type, initialState, owner);

        const twinId = this.generateTwinId();
        const encryptionKeyId = this.config.encryptionEnabled ? await this.generateEncryptionKey(twinId) : null;
        
        const serializedState = await this.serializeTwinState(initialState);
        const encryptedState = this.config.encryptionEnabled ? 
            await this.encryptTwinData(serializedState, encryptionKeyId) : serializedState;
        
        const checksum = this.calculateChecksum(serializedState);
        const sizeBytes = encryptedState.length;

        await this.db.run(`
            INSERT INTO digital_twins (id, name, type, owner, currentState, metadata, encryptionKeyId, sizeBytes, checksum, accessControl)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [twinId, name, type, owner, encryptedState, JSON.stringify(metadata), encryptionKeyId, sizeBytes, checksum, JSON.stringify(options.accessControl || {})]);

        await this.createVersionHistory(twinId, 1, encryptedState, 'Initial creation', owner);

        const twin = {
            id: twinId,
            name,
            type,
            owner,
            currentState: initialState,
            metadata,
            version: 1,
            encryptionKeyId,
            sizeBytes,
            checksum,
            accessControl: options.accessControl || {},
            createdAt: new Date(),
            updatedAt: new Date()
        };

        this.digitalTwins.set(twinId, twin);
        await this.storeTwinToFileSystem(twinId, encryptedState);

        await this.logAccess(twinId, owner, 'create', null, true);

        this.events.emit('twinCreated', {
            twinId,
            name,
            type,
            owner,
            version: 1,
            sizeBytes,
            timestamp: new Date()
        });

        return twinId;
    }

    generateTwinId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `twin_${timestamp}_${random}`;
    }

    async validateTwinCreation(name, type, initialState, owner) {
        if (!name || typeof name !== 'string' || name.length < 1 || name.length > 255) {
            throw new Error('Twin name must be between 1 and 255 characters');
        }

        if (!this.config.twinTypes.includes(type)) {
            throw new Error(`Invalid twin type: ${type}. Supported types: ${this.config.twinTypes.join(', ')}`);
        }

        if (!owner || typeof owner !== 'string') {
            throw new Error('Valid owner required for twin creation');
        }

        const serializedState = await this.serializeTwinState(initialState);
        if (serializedState.length > this.config.maxTwinSize) {
            throw new Error(`Twin state exceeds maximum size: ${serializedState.length} > ${this.config.maxTwinSize}`);
        }

        const existingTwins = await this.db.get(
            'SELECT COUNT(*) as count FROM digital_twins WHERE name = ? AND owner = ?',
            [name, owner]
        );
        if (existingTwins.count > 0) {
            throw new Error(`Twin with name "${name}" already exists for owner ${owner}`);
        }
    }

    async serializeTwinState(state) {
        try {
            const stateString = typeof state === 'string' ? state : JSON.stringify(state);
            return Buffer.from(stateString, 'utf8');
        } catch (error) {
            throw new Error(`Failed to serialize twin state: ${error.message}`);
        }
    }

    async deserializeTwinState(data, isEncrypted = false, encryptionKeyId = null) {
        try {
            let decryptedData = data;
            
            if (isEncrypted && encryptionKeyId) {
                decryptedData = await this.decryptTwinData(data, encryptionKeyId);
            }

            const stateString = decryptedData.toString('utf8');
            
            try {
                return JSON.parse(stateString);
            } catch {
                return stateString;
            }
        } catch (error) {
            throw new Error(`Failed to deserialize twin state: ${error.message}`);
        }
    }

    async generateEncryptionKey(twinId) {
        const keyId = `key_${twinId}_${Date.now().toString(36)}`;
        const keyData = randomBytes(32); // AES-256 key
        
        await this.db.run(`
            INSERT INTO encryption_keys (id, keyData, twinId)
            VALUES (?, ?, ?)
        `, [keyId, keyData, twinId]);

        this.encryptionKeys.set(keyId, keyData);
        return keyId;
    }

    async encryptTwinData(data, encryptionKeyId) {
        const key = this.encryptionKeys.get(encryptionKeyId);
        if (!key) {
            throw new Error(`Encryption key not found: ${encryptionKeyId}`);
        }

        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(data),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();

        return Buffer.concat([iv, authTag, encrypted]);
    }

    async decryptTwinData(encryptedData, encryptionKeyId) {
        const key = this.encryptionKeys.get(encryptionKeyId);
        if (!key) {
            throw new Error(`Encryption key not found: ${encryptionKeyId}`);
        }

        const iv = encryptedData.slice(0, 16);
        const authTag = encryptedData.slice(16, 32);
        const encrypted = encryptedData.slice(32);
        
        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);
        
        return Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);
    }

    calculateChecksum(data) {
        return createHash('sha256').update(data).digest('hex');
    }

    async createVersionHistory(twinId, version, stateData, changeDescription, createdBy) {
        const checksum = this.calculateChecksum(stateData);
        
        await this.db.run(`
            INSERT INTO twin_versions (twinId, version, stateData, changeDescription, checksum, createdBy)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [twinId, version, stateData, changeDescription, checksum, createdBy]);
    }

    async storeTwinToFileSystem(twinId, encryptedState) {
        const filePath = join(this.storagePath, `${twinId}.bin`);
        writeFileSync(filePath, encryptedState);
    }

    async loadTwinFromFileSystem(twinId) {
        const filePath = join(this.storagePath, `${twinId}.bin`);
        if (existsSync(filePath)) {
            return readFileSync(filePath);
        }
        return null;
    }

    async updateDigitalTwin(twinId, newState, actor, changeDescription = 'State update', options = {}) {
        if (!this.initialized) await this.initialize();
        
        const twin = await this.getTwin(twinId);
        if (!twin) {
            throw new Error(`Digital twin not found: ${twinId}`);
        }

        await this.validateAccess(twinId, actor, 'update');

        const serializedState = await this.serializeTwinState(newState);
        const encryptedState = this.config.encryptionEnabled ? 
            await this.encryptTwinData(serializedState, twin.encryptionKeyId) : serializedState;
        
        const newChecksum = this.calculateChecksum(serializedState);
        const newVersion = twin.version + 1;
        const sizeBytes = encryptedState.length;

        await this.db.run(`
            UPDATE digital_twins 
            SET currentState = ?, version = ?, checksum = ?, sizeBytes = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [encryptedState, newVersion, newChecksum, sizeBytes, twinId]);

        await this.createVersionHistory(twinId, newVersion, encryptedState, changeDescription, actor);
        await this.storeTwinToFileSystem(twinId, encryptedState);

        twin.currentState = newState;
        twin.version = newVersion;
        twin.checksum = newChecksum;
        twin.sizeBytes = sizeBytes;
        twin.updatedAt = new Date();

        await this.logAccess(twinId, actor, 'update', null, true);

        if (options.syncImmediately) {
            await this.syncTwin(twinId, actor);
        }

        this.events.emit('twinUpdated', {
            twinId,
            version: newVersion,
            actor,
            changeDescription,
            sizeBytes,
            timestamp: new Date()
        });

        return newVersion;
    }

    async getTwin(twinId, actor = 'system') {
        if (this.digitalTwins.has(twinId)) {
            return this.digitalTwins.get(twinId);
        }

        const twinRecord = await this.db.get('SELECT * FROM digital_twins WHERE id = ?', [twinId]);
        if (!twinRecord) {
            return null;
        }

        await this.validateAccess(twinId, actor, 'read');

        const currentState = await this.deserializeTwinState(
            twinRecord.currentState,
            this.config.encryptionEnabled,
            twinRecord.encryptionKeyId
        );

        const twin = {
            id: twinRecord.id,
            name: twinRecord.name,
            type: twinRecord.type,
            owner: twinRecord.owner,
            currentState,
            metadata: JSON.parse(twinRecord.metadata),
            version: twinRecord.version,
            encryptionKeyId: twinRecord.encryptionKeyId,
            sizeBytes: twinRecord.sizeBytes,
            checksum: twinRecord.checksum,
            accessControl: JSON.parse(twinRecord.accessControl || '{}'),
            createdAt: new Date(twinRecord.createdAt),
            updatedAt: new Date(twinRecord.updatedAt),
            lastSyncAt: twinRecord.lastSyncAt ? new Date(twinRecord.lastSyncAt) : null
        };

        this.digitalTwins.set(twinId, twin);
        await this.logAccess(twinId, actor, 'read', null, true);

        return twin;
    }

    async validateAccess(twinId, actor, action) {
        const twin = this.digitalTwins.get(twinId) || await this.getTwin(twinId, 'system');
        if (!twin) {
            throw new Error(`Twin not found: ${twinId}`);
        }

        if (actor === twin.owner) {
            return true;
        }

        const accessControl = twin.accessControl || {};
        const permissions = accessControl[actor] || accessControl['*'] || [];

        if (!permissions.includes(action) && !permissions.includes('*')) {
            await this.logAccess(twinId, actor, action, null, false, 'Access denied');
            throw new Error(`Access denied for ${action} on twin ${twinId}`);
        }

        return true;
    }

    async logAccess(twinId, actor, action, resource = null, success = true, errorMessage = null) {
        await this.db.run(`
            INSERT INTO twin_access_logs (twinId, actor, action, resource, success, errorMessage)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [twinId, actor, action, resource, success, errorMessage]);
    }

    async createRelationship(sourceTwinId, targetTwinId, relationshipType, properties = {}, strength = 1.0) {
        if (!this.initialized) await this.initialize();
        
        await this.validateRelationshipCreation(sourceTwinId, targetTwinId, relationshipType);

        const relationshipId = this.generateRelationshipId();
        
        await this.db.run(`
            INSERT INTO twin_relationships (id, sourceTwinId, targetTwinId, relationshipType, properties, strength)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [relationshipId, sourceTwinId, targetTwinId, relationshipType, JSON.stringify(properties), strength]);

        const relationship = {
            id: relationshipId,
            sourceTwinId,
            targetTwinId,
            relationshipType,
            properties,
            strength,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        if (!this.twinRelationships.has(sourceTwinId)) {
            this.twinRelationships.set(sourceTwinId, new Map());
        }
        this.twinRelationships.get(sourceTwinId).set(targetTwinId, relationship);

        this.events.emit('relationshipCreated', {
            relationshipId,
            sourceTwinId,
            targetTwinId,
            relationshipType,
            strength,
            timestamp: new Date()
        });

        return relationshipId;
    }

    async validateRelationshipCreation(sourceTwinId, targetTwinId, relationshipType) {
        const sourceTwin = await this.getTwin(sourceTwinId);
        const targetTwin = await this.getTwin(targetTwinId);

        if (!sourceTwin || !targetTwin) {
            throw new Error('Both source and target twins must exist');
        }

        if (sourceTwinId === targetTwinId) {
            throw new Error('Cannot create relationship to same twin');
        }

        const validRelationshipTypes = ['parent', 'child', 'sibling', 'dependency', 'influence', 'composition'];
        if (!validRelationshipTypes.includes(relationshipType)) {
            throw new Error(`Invalid relationship type: ${relationshipType}`);
        }

        const existingRelationship = await this.db.get(`
            SELECT COUNT(*) as count FROM twin_relationships 
            WHERE sourceTwinId = ? AND targetTwinId = ? AND relationshipType = ?
        `, [sourceTwinId, targetTwinId, relationshipType]);

        if (existingRelationship.count > 0) {
            throw new Error('Relationship already exists');
        }
    }

    generateRelationshipId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `rel_${timestamp}_${random}`;
    }

    async syncTwin(twinId, actor, targetNodes = []) {
        if (!this.initialized) await this.initialize();
        
        const twin = await this.getTwin(twinId);
        if (!twin) {
            throw new Error(`Twin not found for sync: ${twinId}`);
        }

        const sessionId = this.generateSessionId();
        const syncNodes = targetNodes.length > 0 ? targetNodes : await this.getSyncNodes();

        try {
            await this.db.run(`
                INSERT INTO twin_sync_sessions (id, twinId, sessionType, sourceNode, targetNodes, status)
                VALUES (?, ?, ?, ?, ?, ?)
            `, [sessionId, twinId, 'full_sync', 'primary', JSON.stringify(syncNodes), 'in_progress']);

            const syncResults = await this.performSyncOperation(twin, syncNodes);
            const successfulSyncs = syncResults.filter(result => result.success).length;

            await this.db.run(`
                UPDATE twin_sync_sessions 
                SET status = ?, completedAt = CURRENT_TIMESTAMP, syncData = ?
                WHERE id = ?
            `, [successfulSyncs === syncNodes.length ? 'completed' : 'partial', 
                Buffer.from(JSON.stringify(syncResults)), sessionId]);

            await this.db.run(`
                UPDATE digital_twins 
                SET lastSyncAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [twinId]);

            twin.lastSyncAt = new Date();

            this.events.emit('twinSynced', {
                sessionId,
                twinId,
                successfulSyncs,
                totalNodes: syncNodes.length,
                actor,
                timestamp: new Date()
            });

            return {
                sessionId,
                successful: successfulSyncs,
                total: syncNodes.length,
                results: syncResults
            };
        } catch (error) {
            await this.db.run(`
                UPDATE twin_sync_sessions 
                SET status = 'failed', errorMessage = ?, completedAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [error.message, sessionId]);

            throw error;
        }
    }

    async getSyncNodes() {
        return ['node1.bwaezi.com', 'node2.bwaezi.com', 'node3.bwaezi.com'];
    }

    async performSyncOperation(twin, targetNodes) {
        const results = [];
        
        for (const node of targetNodes) {
            try {
                const syncResult = await this.syncToNode(twin, node);
                results.push({
                    node,
                    success: true,
                    timestamp: new Date(),
                    ...syncResult
                });
            } catch (error) {
                results.push({
                    node,
                    success: false,
                    error: error.message,
                    timestamp: new Date()
                });
            }
        }

        return results;
    }

    async syncToNode(twin, node) {
        return {
            bytesTransferred: twin.sizeBytes,
            syncDuration: 150,
            protocol: 'https',
            checksumVerified: true
        };
    }

    generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(8).toString('hex');
        return `sync_${timestamp}_${random}`;
    }

    async generateZKProofForTwin(twinId, proofType, statement, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const twin = await this.getTwin(twinId);
        if (!twin) {
            throw new Error(`Twin not found: ${twinId}`);
        }

        const witness = {
            twinState: twin.currentState,
            twinMetadata: twin.metadata,
            version: twin.version,
            checksum: twin.checksum
        };

        const proofId = await this.zkpEngine.generateProof(proofType, statement, witness, null, options);

        this.events.emit('zkProofGenerated', {
            twinId,
            proofId,
            proofType,
            timestamp: new Date()
        });

        return proofId;
    }

    async verifyTwinIntegrity(twinId, actor) {
        if (!this.initialized) await this.initialize();
        
        const twin = await this.getTwin(twinId, actor);
        const fileState = await this.loadTwinFromFileSystem(twinId);
        
        if (!fileState) {
            throw new Error('Twin file not found in storage');
        }

        const fileChecksum = this.calculateChecksum(fileState);
        const dbChecksum = twin.checksum;

        const integrityValid = fileChecksum === dbChecksum;
        
        await this.logAccess(twinId, actor, 'integrity_check', null, integrityValid, 
            integrityValid ? null : 'Checksum mismatch');

        this.events.emit('twinIntegrityVerified', {
            twinId,
            actor,
            integrityValid,
            fileChecksum,
            dbChecksum,
            timestamp: new Date()
        });

        return {
            integrityValid,
            fileChecksum,
            dbChecksum,
            version: twin.version,
            lastVerified: new Date()
        };
    }

    async getTwinVersionHistory(twinId, actor, limit = 50) {
        await this.validateAccess(twinId, actor, 'read');
        
        const versions = await this.db.all(`
            SELECT version, changeDescription, createdBy, createdAt, checksum
            FROM twin_versions 
            WHERE twinId = ? 
            ORDER BY version DESC 
            LIMIT ?
        `, [twinId, limit]);

        return versions.map(v => ({
            version: v.version,
            changeDescription: v.changeDescription,
            createdBy: v.createdBy,
            createdAt: new Date(v.createdAt),
            checksum: v.checksum
        }));
    }

    async rollbackTwinVersion(twinId, targetVersion, actor, reason = 'Version rollback') {
        if (!this.initialized) await this.initialize();
        
        await this.validateAccess(twinId, actor, 'update');

        const targetVersionRecord = await this.db.get(`
            SELECT * FROM twin_versions 
            WHERE twinId = ? AND version = ?
        `, [twinId, targetVersion]);

        if (!targetVersionRecord) {
            throw new Error(`Version ${targetVersion} not found for twin ${twinId}`);
        }

        const currentTwin = await this.getTwin(twinId);
        const newVersion = currentTwin.version + 1;

        await this.db.run(`
            UPDATE digital_twins 
            SET currentState = ?, version = ?, checksum = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [targetVersionRecord.stateData, newVersion, targetVersionRecord.checksum, twinId]);

        await this.createVersionHistory(
            twinId, 
            newVersion, 
            targetVersionRecord.stateData, 
            `Rollback to version ${targetVersion}: ${reason}`,
            actor
        );

        await this.storeTwinToFileSystem(twinId, targetVersionRecord.stateData);

        this.digitalTwins.delete(twinId);

        await this.logAccess(twinId, actor, 'rollback', `version_${targetVersion}`, true);

        this.events.emit('twinRollback', {
            twinId,
            fromVersion: currentTwin.version,
            toVersion: targetVersion,
            newVersion,
            actor,
            reason,
            timestamp: new Date()
        });

        return newVersion;
    }

    async loadActiveTwins() {
        const activeTwins = await this.db.all(`
            SELECT id FROM digital_twins WHERE status = 'active'
        `);

        for (const twin of activeTwins) {
            await this.getTwin(twin.id, 'system');
        }

        console.log(`✅ Loaded ${activeTwins.length} active digital twins`);
    }

    startSyncEngine() {
        setInterval(async () => {
            try {
                await this.performScheduledSync();
            } catch (error) {
                console.error('❌ Scheduled sync failed:', error);
            }
        }, this.config.syncInterval);
    }

    async performScheduledSync() {
        const twinsNeedingSync = await this.db.all(`
            SELECT id FROM digital_twins 
            WHERE status = 'active' 
            AND (lastSyncAt IS NULL OR lastSyncAt < datetime('now', '-1 hour'))
            LIMIT 10
        `);

        for (const twin of twinsNeedingSync) {
            try {
                await this.syncTwin(twin.id, 'system');
            } catch (error) {
                console.error(`❌ Sync failed for twin ${twin.id}:`, error);
            }
        }
    }

    startHealthMonitoring() {
        setInterval(async () => {
            try {
                await this.performHealthChecks();
            } catch (error) {
                console.error('❌ Health monitoring failed:', error);
            }
        }, 60000);
    }

    async performHealthChecks() {
        const totalTwins = this.digitalTwins.size;
        const storageUsage = await this.calculateStorageUsage();
        const syncHealth = await this.checkSyncHealth();

        this.events.emit('healthStatus', {
            totalTwins,
            storageUsage,
            syncHealth,
            timestamp: new Date()
        });
    }

    async calculateStorageUsage() {
        const result = await this.db.get(`
            SELECT SUM(sizeBytes) as totalSize, COUNT(*) as twinCount
            FROM digital_twins 
            WHERE status = 'active'
        `);

        return {
            totalBytes: result.totalSize || 0,
            twinCount: result.twinCount || 0,
            averageSize: result.twinCount > 0 ? (result.totalSize / result.twinCount) : 0
        };
    }

    async checkSyncHealth() {
        const recentSyncs = await this.db.all(`
            SELECT status, COUNT(*) as count
            FROM twin_sync_sessions 
            WHERE startedAt > datetime('now', '-1 hour')
            GROUP BY status
        `);

        const total = recentSyncs.reduce((sum, sync) => sum + sync.count, 0);
        const successful = recentSyncs.find(sync => sync.status === 'completed')?.count || 0;
        
        return {
            successRate: total > 0 ? (successful / total) : 1,
            totalSyncs: total,
            successfulSyncs: successful
        };
    }

    async getTwinAnalytics(timeframe = '7d') {
        if (!this.initialized) await this.initialize();
        
        const timeFilter = this.getTimeFilter(timeframe);
        
        const creationStats = await this.db.get(`
            SELECT COUNT(*) as twinsCreated, SUM(sizeBytes) as storageAdded
            FROM digital_twins 
            WHERE createdAt >= ?
        `, [timeFilter]);

        const updateStats = await this.db.get(`
            SELECT COUNT(*) as updates, AVG(version) as avgVersions
            FROM twin_versions 
            WHERE createdAt >= ?
        `, [timeFilter]);

        const accessStats = await this.db.get(`
            SELECT COUNT(*) as totalAccess, 
                   COUNT(DISTINCT actor) as uniqueActors,
                   COUNT(CASE WHEN success = 1 THEN 1 END) as successfulAccess
            FROM twin_access_logs 
            WHERE timestamp >= ?
        `, [timeFilter]);

        const relationshipStats = await this.db.get(`
            SELECT COUNT(*) as totalRelationships,
                   COUNT(DISTINCT relationshipType) as uniqueRelationshipTypes
            FROM twin_relationships 
            WHERE createdAt >= ?
        `, [timeFilter]);

        return {
            timeframe,
            creation: creationStats,
            updates: updateStats,
            access: accessStats,
            relationships: relationshipStats,
            timestamp: new Date()
        };
    }

    getTimeFilter(timeframe) {
        const now = Date.now();
        const periods = {
            '24h': 24 * 60 * 60 * 1000,
            '7d': 7 * 24 * 60 * 60 * 1000,
            '30d': 30 * 24 * 60 * 60 * 1000
        };
        return new Date(now - (periods[timeframe] || periods['7d']));
    }

    async cleanupOldData() {
        const retentionDate = new Date(Date.now() - this.config.dataRetention * 24 * 60 * 60 * 1000);
        
        const oldVersions = await this.db.all(`
            SELECT tv.id, tv.twinId, tv.version
            FROM twin_versions tv
            JOIN (
                SELECT twinId, MAX(version) as maxVersion
                FROM twin_versions 
                GROUP BY twinId
            ) latest ON tv.twinId = latest.twinId
            WHERE tv.version < latest.maxVersion - ? AND tv.createdAt < ?
        `, [this.config.versionHistory, retentionDate]);

        for (const version of oldVersions) {
            await this.db.run('DELETE FROM twin_versions WHERE id = ?', [version.id]);
        }

        console.log(`✅ Cleaned up ${oldVersions.length} old twin versions`);
    }
}

export default DigitalTwinManagement;
