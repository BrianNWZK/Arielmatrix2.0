// modules/decentralized-storage.js
import { EventEmitter } from 'events';
import { ArielSQLiteEngine } from './ariel-sqlite-engine/index.js';
import { SovereignRevenueEngine } from './sovereign-revenue-engine.js';
import { 
    BWAEZI_CHAIN,
    BWAEZI_SOVEREIGN_CONFIG,
    ConfigUtils 
} from '../config/bwaezi-config.js';
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { Web3Storage } from 'web3.storage';
import { NFTStorage } from 'nft.storage';
import Arweave from 'arweave';

export class DecentralizedStorage {
    constructor(config = {}) {
        this.config = {
            storageProviders: ['ipfs', 'arweave', 'filecoin', 'swarm'],
            encryptionEnabled: true,
            replicationFactor: 3,
            chunkSize: 1024 * 1024, // 1MB chunks
            maxFileSize: 100 * 1024 * 1024, // 100MB max
            retentionPeriod: 365 * 24 * 60 * 60 * 1000, // 1 year
            ...config
        };
        this.storageClients = new Map();
        this.fileRegistry = new Map();
        this.encryptionKeys = new Map();
        this.pinningServices = new Map();
        this.db = new ArielSQLiteEngine({ path: './data/decentralized-storage.db' });
        this.events = new EventEmitter();
        this.sovereignService = null;
        this.serviceId = null;
        this.initialized = false;
        this.storageMetrics = {
            totalFiles: 0,
            totalSize: 0,
            ipfsFiles: 0,
            arweaveFiles: 0,
            filecoinFiles: 0
        };
    }

    async initialize() {
        if (this.initialized) return;
        
        await this.db.init();
        await this.createDatabaseTables();
        
        this.sovereignService = new SovereignRevenueEngine();
        await this.sovereignService.initialize();
        
        this.serviceId = await this.sovereignService.registerService({
            name: 'DecentralizedStorage',
            description: 'Advanced decentralized storage system with multi-provider support and encryption',
            registrationFee: 10000,
            annualLicenseFee: 5000,
            revenueShare: 0.15,
            serviceType: 'storage_infrastructure',
            dataPolicy: 'Encrypted content storage only - No plaintext data',
            compliance: ['Zero-Knowledge Storage', 'Data Sovereignty']
        });

        await this.initializeStorageClients();
        await this.loadStorageMetrics();
        await this.startStorageMaintenance();
        this.initialized = true;
        
        this.events.emit('initialized', {
            timestamp: Date.now(),
            storageProviders: this.config.storageProviders,
            encryptionEnabled: this.config.encryptionEnabled,
            replicationFactor: this.config.replicationFactor
        });
    }

    async createDatabaseTables() {
        await this.db.run(`
            CREATE TABLE IF NOT EXISTS stored_files (
                id TEXT PRIMARY KEY,
                original_name TEXT NOT NULL,
                encrypted_hash TEXT NOT NULL,
                content_hash TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                mime_type TEXT,
                encryption_key_id TEXT,
                storage_providers TEXT NOT NULL,
                replication_count INTEGER DEFAULT 1,
                upload_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                expiration_date DATETIME,
                access_count INTEGER DEFAULT 0,
                last_accessed DATETIME,
                metadata TEXT
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS storage_providers (
                provider TEXT PRIMARY KEY,
                api_key TEXT,
                endpoint_url TEXT,
                status TEXT DEFAULT 'active',
                storage_used INTEGER DEFAULT 0,
                files_stored INTEGER DEFAULT 0,
                last_sync DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS file_chunks (
                file_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                chunk_hash TEXT NOT NULL,
                storage_locations TEXT NOT NULL,
                chunk_size INTEGER NOT NULL,
                PRIMARY KEY (file_id, chunk_index),
                FOREIGN KEY (file_id) REFERENCES stored_files (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS access_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id TEXT NOT NULL,
                access_type TEXT NOT NULL,
                requester TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                success BOOLEAN DEFAULT true,
                error_message TEXT,
                FOREIGN KEY (file_id) REFERENCES stored_files (id)
            )
        `);

        await this.db.run(`
            CREATE TABLE IF NOT EXISTS storage_metrics (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                total_files INTEGER DEFAULT 0,
                total_size INTEGER DEFAULT 0,
                ipfs_files INTEGER DEFAULT 0,
                arweave_files INTEGER DEFAULT 0,
                filecoin_files INTEGER DEFAULT 0,
                average_file_size REAL DEFAULT 0
            )
        `);
    }

    async initializeStorageClients() {
        for (const provider of this.config.storageProviders) {
            try {
                let client;
                switch (provider) {
                    case 'ipfs':
                        client = new Web3Storage({ 
                            token: process.env.WEB3_STORAGE_TOKEN || 'your-web3-storage-token' 
                        });
                        break;
                    case 'arweave':
                        client = Arweave.init({
                            host: 'arweave.net',
                            port: 443,
                            protocol: 'https',
                            timeout: 20000,
                            logging: false
                        });
                        break;
                    case 'filecoin':
                        // Filecoin through web3.storage
                        client = new Web3Storage({ 
                            token: process.env.WEB3_STORAGE_TOKEN || 'your-web3-storage-token' 
                        });
                        break;
                    case 'swarm':
                        // Swarm client initialization
                        client = {
                            type: 'swarm',
                            endpoint: process.env.SWARM_ENDPOINT || 'http://localhost:1633'
                        };
                        break;
                }

                if (client) {
                    this.storageClients.set(provider, client);
                    await this.registerStorageProvider(provider, 'active');
                    console.log(`✅ Initialized ${provider} storage client`);
                }
            } catch (error) {
                console.error(`❌ Failed to initialize ${provider} storage client:`, error);
                await this.registerStorageProvider(provider, 'inactive');
            }
        }
    }

    async registerStorageProvider(provider, status) {
        await this.db.run(`
            INSERT OR REPLACE INTO storage_providers (provider, status, last_sync)
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, [provider, status]);
    }

    async storeFile(fileData, fileName, options = {}) {
        if (!this.initialized) await this.initialize();
        
        await this.validateFile(fileData, fileName);

        const fileId = this.generateFileId();
        const encryptionKey = this.config.encryptionEnabled ? await this.generateEncryptionKey() : null;
        
        try {
            const startTime = Date.now();
            
            // Encrypt file data if enabled
            const processedData = this.config.encryptionEnabled ? 
                await this.encryptFileData(fileData, encryptionKey) : fileData;

            const contentHash = this.calculateContentHash(processedData);
            const encryptedHash = this.calculateContentHash(fileData); // Hash of original for verification

            // Split into chunks if file is large
            const chunks = await this.splitIntoChunks(processedData);
            const storageLocations = await this.distributeChunks(chunks, options.replicationFactor);

            // Store file metadata
            await this.db.run(`
                INSERT INTO stored_files 
                (id, original_name, encrypted_hash, content_hash, file_size, mime_type, 
                 encryption_key_id, storage_providers, replication_count, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [fileId, fileName, encryptedHash, contentHash, fileData.length, 
                options.mimeType || 'application/octet-stream',
                encryptionKey?.id, JSON.stringify(storageLocations.providers), 
                storageLocations.replicationCount, JSON.stringify(options.metadata || {})]);

            // Store chunk information
            for (let i = 0; i < chunks.length; i++) {
                await this.db.run(`
                    INSERT INTO file_chunks (file_id, chunk_index, chunk_hash, storage_locations, chunk_size)
                    VALUES (?, ?, ?, ?, ?)
                `, [fileId, i, this.calculateContentHash(chunks[i]), 
                    JSON.stringify(storageLocations.chunks[i]), chunks[i].length]);
            }

            if (encryptionKey) {
                this.encryptionKeys.set(fileId, encryptionKey);
            }

            this.fileRegistry.set(fileId, {
                id: fileId,
                fileName,
                contentHash,
                encryptedHash,
                fileSize: fileData.length,
                storageLocations,
                uploadTime: new Date(),
                accessCount: 0
            });

            await this.updateStorageMetrics(fileData.length, storageLocations.providers);
            await this.recordAccessLog(fileId, 'upload', null, true);

            const storageTime = Date.now() - startTime;

            if (this.sovereignService && this.serviceId) {
                const storageFee = this.calculateStorageFee(fileData.length, options.retentionPeriod);
                await this.sovereignService.processRevenue(
                    this.serviceId, 
                    storageFee, 
                    'file_storage',
                    'USD',
                    'bwaezi',
                    {
                        fileId,
                        fileSize: fileData.length,
                        fileName,
                        replicationCount: storageLocations.replicationCount,
                        storageFee
                    }
                );
            }

            this.events.emit('fileStored', {
                fileId,
                fileName,
                fileSize: fileData.length,
                contentHash,
                storageProviders: storageLocations.providers,
                replicationCount: storageLocations.replicationCount,
                storageTime,
                storageFee: this.calculateStorageFee(fileData.length, options.retentionPeriod)
            });

            return fileId;
        } catch (error) {
            await this.recordAccessLog(fileId, 'upload', null, false, error.message);
            throw new Error(`File storage failed: ${error.message}`);
        }
    }

    async validateFile(fileData, fileName) {
        if (!fileData || fileData.length === 0) {
            throw new Error('File data cannot be empty');
        }

        if (fileData.length > this.config.maxFileSize) {
            throw new Error(`File size ${fileData.length} exceeds maximum ${this.config.maxFileSize}`);
        }

        if (!fileName || fileName.length === 0) {
            throw new Error('File name is required');
        }

        // Check for forbidden file types
        const forbiddenExtensions = ['.exe', '.bat', '.cmd', '.sh', '.php', '.py'];
        const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
        if (forbiddenExtensions.includes(fileExtension)) {
            throw new Error(`File type ${fileExtension} is not allowed`);
        }
    }

    async retrieveFile(fileId, options = {}) {
        if (!this.initialized) await this.initialize();
        
        const fileRecord = await this.db.get('SELECT * FROM stored_files WHERE id = ?', [fileId]);
        if (!fileRecord) {
            throw new Error(`File not found: ${fileId}`);
        }

        try {
            await this.recordAccessLog(fileId, 'retrieve', options.requester, true);

            const chunks = await this.db.all(
                'SELECT * FROM file_chunks WHERE file_id = ? ORDER BY chunk_index', 
                [fileId]
            );

            const assembledData = await this.assembleChunks(chunks);
            
            // Decrypt if encrypted
            const finalData = fileRecord.encryption_key_id ? 
                await this.decryptFileData(assembledData, fileRecord.encryption_key_id) : assembledData;

            // Verify content hash
            const verifiedHash = this.calculateContentHash(finalData);
            if (verifiedHash !== fileRecord.encrypted_hash) {
                throw new Error('File content verification failed');
            }

            await this.db.run(`
                UPDATE stored_files 
                SET access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
                WHERE id = ?
            `, [fileId]);

            this.events.emit('fileRetrieved', {
                fileId,
                fileName: fileRecord.original_name,
                fileSize: fileRecord.file_size,
                requester: options.requester,
                timestamp: new Date()
            });

            return {
                data: finalData,
                fileName: fileRecord.original_name,
                mimeType: fileRecord.mime_type,
                fileSize: fileRecord.file_size,
                metadata: JSON.parse(fileRecord.metadata || '{}')
            };
        } catch (error) {
            await this.recordAccessLog(fileId, 'retrieve', options.requester, false, error.message);
            throw new Error(`File retrieval failed: ${error.message}`);
        }
    }

    async distributeChunks(chunks, replicationFactor = null) {
        const actualReplication = replicationFactor || this.config.replicationFactor;
        const providers = Array.from(this.storageClients.keys());
        const storageLocations = {
            providers: [],
            chunks: [],
            replicationCount: actualReplication
        };

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const chunkLocations = [];

            for (let j = 0; j < actualReplication; j++) {
                const provider = providers[(i + j) % providers.length];
                const location = await this.storeChunkWithProvider(chunk, provider);
                chunkLocations.push({
                    provider,
                    location,
                    timestamp: new Date()
                });
            }

            storageLocations.chunks.push(chunkLocations);
            
            if (i === 0) {
                storageLocations.providers = chunkLocations.map(loc => loc.provider);
            }
        }

        return storageLocations;
    }

    async storeChunkWithProvider(chunkData, provider) {
        const client = this.storageClients.get(provider);
        if (!client) {
            throw new Error(`Storage provider not available: ${provider}`);
        }

        try {
            switch (provider) {
                case 'ipfs':
                case 'filecoin':
                    const cid = await client.put([new Blob([chunkData])]);
                    return cid;
                case 'arweave':
                    const transaction = await client.createTransaction({
                        data: chunkData
                    });
                    await client.transactions.sign(transaction);
                    await client.transactions.post(transaction);
                    return transaction.id;
                case 'swarm':
                    // Swarm storage implementation
                    const response = await fetch(`${client.endpoint}/bzz`, {
                        method: 'POST',
                        body: chunkData
                    });
                    const hash = await response.text();
                    return hash;
                default:
                    throw new Error(`Unsupported storage provider: ${provider}`);
            }
        } catch (error) {
            console.error(`Failed to store chunk with ${provider}:`, error);
            throw error;
        }
    }

    async retrieveChunkFromProvider(location, provider) {
        const client = this.storageClients.get(provider);
        if (!client) {
            throw new Error(`Storage provider not available: ${provider}`);
        }

        try {
            switch (provider) {
                case 'ipfs':
                case 'filecoin':
                    const response = await client.get(location);
                    const files = await response.files();
                    return await files[0].arrayBuffer();
                case 'arweave':
                    const data = await client.transactions.getData(location, { decode: true });
                    return data;
                case 'swarm':
                    const swarmResponse = await fetch(`${client.endpoint}/bzz/${location}`);
                    return await swarmResponse.arrayBuffer();
                default:
                    throw new Error(`Unsupported storage provider: ${provider}`);
            }
        } catch (error) {
            console.error(`Failed to retrieve chunk from ${provider}:`, error);
            throw error;
        }
    }

    async assembleChunks(chunks) {
        const chunkData = [];
        
        for (const chunk of chunks) {
            const locations = JSON.parse(chunk.storage_locations);
            let chunkContent = null;

            // Try to retrieve from each location until successful
            for (const location of locations) {
                try {
                    chunkContent = await this.retrieveChunkFromProvider(location.location, location.provider);
                    break;
                } catch (error) {
                    console.warn(`Failed to retrieve chunk from ${location.provider}:`, error);
                    continue;
                }
            }

            if (!chunkContent) {
                throw new Error(`Failed to retrieve chunk ${chunk.chunk_index} from any provider`);
            }

            // Verify chunk hash
            const chunkHash = this.calculateContentHash(Buffer.from(chunkContent));
            if (chunkHash !== chunk.chunk_hash) {
                throw new Error(`Chunk ${chunk.chunk_index} verification failed`);
            }

            chunkData.push(Buffer.from(chunkContent));
        }

        return Buffer.concat(chunkData);
    }

    async splitIntoChunks(data) {
        const chunks = [];
        const chunkSize = this.config.chunkSize;
        
        for (let i = 0; i < data.length; i += chunkSize) {
            chunks.push(data.slice(i, i + chunkSize));
        }
        
        return chunks;
    }

    async encryptFileData(data, encryptionKey) {
        const iv = randomBytes(16);
        const cipher = createCipheriv('aes-256-gcm', encryptionKey.key, iv);
        
        const encrypted = Buffer.concat([
            cipher.update(data),
            cipher.final()
        ]);

        const authTag = cipher.getAuthTag();

        return Buffer.concat([iv, authTag, encrypted]);
    }

    async decryptFileData(encryptedData, keyId) {
        const encryptionKey = this.encryptionKeys.get(keyId);
        if (!encryptionKey) {
            throw new Error(`Encryption key not found: ${keyId}`);
        }

        const iv = encryptedData.slice(0, 16);
        const authTag = encryptedData.slice(16, 32);
        const encrypted = encryptedData.slice(32);
        
        const decipher = createDecipheriv('aes-256-gcm', encryptionKey.key, iv);
        decipher.setAuthTag(authTag);
        
        return Buffer.concat([
            decipher.update(encrypted),
            decipher.final()
        ]);
    }

    async generateEncryptionKey() {
        const key = randomBytes(32);
        const keyId = this.generateKeyId();
        
        this.encryptionKeys.set(keyId, {
            id: keyId,
            key: key,
            created: new Date()
        });

        return { id: keyId, key };
    }

    calculateContentHash(data) {
        return createHash('sha256').update(data).digest('hex');
    }

    calculateStorageFee(fileSize, retentionPeriod) {
        const baseRate = 0.0000001; // $0.0000001 per byte per day
        const retentionDays = (retentionPeriod || this.config.retentionPeriod) / (24 * 60 * 60 * 1000);
        return fileSize * baseRate * retentionDays * this.config.replicationFactor;
    }

    generateFileId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(16).toString('hex');
        return `file_${timestamp}_${random}`;
    }

    generateKeyId() {
        const timestamp = Date.now().toString(36);
        const random = randomBytes(12).toString('hex');
        return `key_${timestamp}_${random}`;
    }

    async recordAccessLog(fileId, accessType, requester, success, errorMessage = null) {
        await this.db.run(`
            INSERT INTO access_logs (file_id, access_type, requester, success, error_message)
            VALUES (?, ?, ?, ?, ?)
        `, [fileId, accessType, requester, success, errorMessage]);
    }

    async updateStorageMetrics(fileSize, providers) {
        this.storageMetrics.totalFiles++;
        this.storageMetrics.totalSize += fileSize;

        for (const provider of providers) {
            switch (provider) {
                case 'ipfs':
                    this.storageMetrics.ipfsFiles++;
                    break;
                case 'arweave':
                    this.storageMetrics.arweaveFiles++;
                    break;
                case 'filecoin':
                    this.storageMetrics.filecoinFiles++;
                    break;
            }
        }

        await this.db.run(`
            INSERT INTO storage_metrics 
            (total_files, total_size, ipfs_files, arweave_files, filecoin_files, average_file_size)
            VALUES (?, ?, ?, ?, ?, ?)
        `, [
            this.storageMetrics.totalFiles,
            this.storageMetrics.totalSize,
            this.storageMetrics.ipfsFiles,
            this.storageMetrics.arweaveFiles,
            this.storageMetrics.filecoinFiles,
            this.storageMetrics.totalSize / Math.max(this.storageMetrics.totalFiles, 1)
        ]);
    }

    async loadStorageMetrics() {
        const metrics = await this.db.get(`
            SELECT 
                SUM(total_files) as total_files,
                SUM(total_size) as total_size,
                SUM(ipfs_files) as ipfs_files,
                SUM(arweave_files) as arweave_files,
                SUM(filecoin_files) as filecoin_files
            FROM storage_metrics
            WHERE timestamp >= datetime('now', '-30 days')
        `);

        if (metrics) {
            this.storageMetrics = {
                totalFiles: metrics.total_files || 0,
                totalSize: metrics.total_size || 0,
                ipfsFiles: metrics.ipfs_files || 0,
                arweaveFiles: metrics.arweave_files || 0,
                filecoinFiles: metrics.filecoin_files || 0
            };
        }
    }

    async startStorageMaintenance() {
        // Clean up expired files
        setInterval(async () => {
            await this.cleanupExpiredFiles();
        }, 24 * 60 * 60 * 1000); // Daily

        // Verify storage integrity
        setInterval(async () => {
            await this.verifyStorageIntegrity();
        }, 6 * 60 * 60 * 1000); // Every 6 hours

        // Rebalance storage distribution
        setInterval(async () => {
            await this.rebalanceStorage();
        }, 12 * 60 * 60 * 1000); // Every 12 hours
    }

    async cleanupExpiredFiles() {
        const expiredFiles = await this.db.all(`
            SELECT id FROM stored_files 
            WHERE expiration_date < CURRENT_TIMESTAMP
        `);

        for (const file of expiredFiles) {
            await this.deleteFile(file.id, 'expired');
        }

        console.log(`✅ Cleaned up ${expiredFiles.length} expired files`);
    }

    async verifyStorageIntegrity() {
        const files = await this.db.all(`
            SELECT id, content_hash, encrypted_hash FROM stored_files 
            WHERE upload_timestamp >= datetime('now', '-7 days')
        `);

        let verified = 0;
        let failed = 0;

        for (const file of files) {
            try {
                const retrieved = await this.retrieveFile(file.id, { integrityCheck: true });
                const currentHash = this.calculateContentHash(retrieved.data);
                
                if (currentHash === file.encrypted_hash) {
                    verified++;
                } else {
                    failed++;
                    console.warn(`Integrity check failed for file ${file.id}`);
                    
                    // Trigger repair process
                    await this.repairFile(file.id);
                }
            } catch (error) {
                failed++;
                console.error(`Integrity check error for file ${file.id}:`, error);
            }
        }

        this.events.emit('integrityCheckCompleted', {
            verified,
            failed,
            total: files.length,
            timestamp: new Date()
        });
    }

    async repairFile(fileId) {
        try {
            const fileRecord = await this.db.get('SELECT * FROM stored_files WHERE id = ?', [fileId]);
            if (!fileRecord) return;

            // Re-upload file to ensure redundancy
            const retrieved = await this.retrieveFile(fileId, { repair: true });
            await this.storeFile(retrieved.data, fileRecord.original_name, {
                mimeType: fileRecord.mime_type,
                metadata: JSON.parse(fileRecord.metadata || '{}')
            });

            console.log(`✅ Repaired file ${fileId}`);
        } catch (error) {
            console.error(`❌ Failed to repair file ${fileId}:`, error);
        }
    }

    async rebalanceStorage() {
        // Analyze storage distribution and rebalance if needed
        const providerStats = await this.db.all(`
            SELECT 
                provider,
                COUNT(*) as file_count,
                SUM(file_size) as total_size
            FROM stored_files 
            GROUP BY provider
        `);

        const totalFiles = providerStats.reduce((sum, stat) => sum + stat.file_count, 0);
        const averageFiles = totalFiles / providerStats.length;

        for (const stat of providerStats) {
            if (stat.file_count > averageFiles * 1.5) {
                // This provider has too many files, migrate some to other providers
                await this.migrateFilesFromProvider(stat.provider, Math.floor(stat.file_count - averageFiles));
            }
        }
    }

    async migrateFilesFromProvider(provider, count) {
        const filesToMigrate = await this.db.all(`
            SELECT id FROM stored_files 
            WHERE storage_providers LIKE ? 
            LIMIT ?
        `, [`%${provider}%`, count]);

        for (const file of filesToMigrate) {
            await this.migrateFile(file.id, provider);
        }
    }

    async migrateFile(fileId, fromProvider) {
        try {
            const fileRecord = await this.db.get('SELECT * FROM stored_files WHERE id = ?', [fileId]);
            if (!fileRecord) return;

            const retrieved = await this.retrieveFile(fileId, { migration: true });
            await this.storeFile(retrieved.data, fileRecord.original_name, {
                mimeType: fileRecord.mime_type,
                metadata: JSON.parse(fileRecord.metadata || '{}'),
                excludeProviders: [fromProvider]
            });

            // Update the original file record to include new providers
            const currentProviders = JSON.parse(fileRecord.storage_providers);
            const newProviders = Array.from(new Set([...currentProviders, ...retrieved.storageProviders]));
            
            await this.db.run(`
                UPDATE stored_files 
                SET storage_providers = ?, replication_count = ?
                WHERE id = ?
            `, [JSON.stringify(newProviders), newProviders.length, fileId]);

            console.log(`✅ Migrated file ${fileId} from ${fromProvider}`);
        } catch (error) {
            console.error(`❌ Failed to migrate file ${fileId}:`, error);
        }
    }

    async deleteFile(fileId, reason = 'user_request') {
        try {
            const fileRecord = await this.db.get('SELECT * FROM stored_files WHERE id = ?', [fileId]);
            if (!fileRecord) return;

            // Delete chunks from storage providers
            const chunks = await this.db.all('SELECT * FROM file_chunks WHERE file_id = ?', [fileId]);
            
            for (const chunk of chunks) {
                const locations = JSON.parse(chunk.storage_locations);
                for (const location of locations) {
                    await this.deleteChunkFromProvider(location.location, location.provider);
                }
            }

            // Delete database records
            await this.db.run('DELETE FROM file_chunks WHERE file_id = ?', [fileId]);
            await this.db.run('DELETE FROM stored_files WHERE id = ?', [fileId]);

            // Remove encryption key
            if (fileRecord.encryption_key_id) {
                this.encryptionKeys.delete(fileRecord.encryption_key_id);
            }

            this.fileRegistry.delete(fileId);

            this.events.emit('fileDeleted', {
                fileId,
                fileName: fileRecord.original_name,
                reason,
                timestamp: new Date()
            });

        } catch (error) {
            console.error(`❌ Failed to delete file ${fileId}:`, error);
            throw error;
        }
    }

    async deleteChunkFromProvider(location, provider) {
        try {
            const client = this.storageClients.get(provider);
            if (!client) return;

            // Note: Not all decentralized storage providers support deletion
            // This would need to be implemented per provider
            console.log(`Would delete chunk ${location} from ${provider} (deletion not implemented)`);
        } catch (error) {
            console.error(`Failed to delete chunk from ${provider}:`, error);
        }
    }

    async getStorageAnalytics() {
        const fileStats = await this.db.get(`
            SELECT 
                COUNT(*) as total_files,
                SUM(file_size) as total_size,
                AVG(file_size) as average_size,
                MAX(file_size) as largest_file,
                COUNT(DISTINCT mime_type) as unique_types
            FROM stored_files
        `);

        const providerStats = await this.db.all(`
            SELECT 
                provider,
                COUNT(*) as file_count,
                SUM(file_size) as total_size,
                AVG(file_size) as average_size
            FROM stored_files 
            GROUP BY provider
        `);

        const accessStats = await this.db.get(`
            SELECT 
                COUNT(*) as total_accesses,
                SUM(CASE WHEN access_type = 'upload' THEN 1 ELSE 0 END) as uploads,
                SUM(CASE WHEN access_type = 'retrieve' THEN 1 ELSE 0 END) as retrieves,
                AVG(CASE WHEN success = 1 THEN 1 ELSE 0 END) as success_rate
            FROM access_logs 
            WHERE timestamp >= datetime('now', '-24 hours')
        `);

        return {
            fileStats,
            providerStats,
            accessStats,
            currentMetrics: this.storageMetrics,
            timestamp: new Date()
        };
    }
}

export default DecentralizedStorage;
