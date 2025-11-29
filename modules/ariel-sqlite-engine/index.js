import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomBytes } from 'crypto';
import EventEmitter from 'events';

// Utility to get __filename and __dirname in ES module scope
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Enhanced logger
class ArielLogger {
	static log(level, message, meta = {}) {
		const timestamp = new Date().toISOString();
		const logEntry = {
			timestamp,
			level,
			message,
			...meta,
			module: 'ArielSQLiteEngine'
		};
		
		// Log to console with JSON format
		console.log(JSON.stringify(logEntry));
		
		// Write to file in production
		if (process.env.NODE_ENV === 'production') {
			// This path relies on the ArielSQLiteEngine.ensureDirectories() call 
			// creating the necessary structure.
			const logFile = path.join(__dirname, '../../logs/ariel-engine.log');
			
			// Non-blocking write, ignoring potential errors (directory creation failure, etc.)
			// We rely on the Engine's initialization to ensure the directory exists.
			fs.appendFile(logFile, JSON.stringify(logEntry) + '\n').catch(() => {});
		}
	}
	
	static info(message, meta = {}) {
		this.log('INFO', message, meta);
	}
	
	static error(message, meta = {}) {
		this.log('ERROR', message, meta);
	}
	
	static warn(message, meta = {}) {
		this.log('WARN', message, meta);
	}
	
	static debug(message, meta = {}) {
		if (process.env.NODE_ENV === 'development') {
			this.log('DEBUG', message, meta);
		}
	}
}

// Enhanced Ariel SQLite Engine - ENTERPRISE GRADE
class default ArielSQLiteEngine extends EventEmitter {
	constructor(options = {}) {
		super();
		
		this.options = {
			dbPath: './data/ariel/transactions.db',
			backupPath: './backups/ariel',
			maxBackups: 10,
			autoBackup: true,
			backupInterval: 3600000, // 1 hour
			queryTimeout: 30000,
			walMode: true,
			// --- ENTERPRISE RESILIENCE CONFIGURATION ---
			maxReconnectAttempts: 10,
			reconnectInterval: 2000,
			connectionPoolSize: 5,
			maxQueryRetries: 3,
			// -------------------------------------------
			...options
		};
		
		this.db = null;
		this.isConnected = false;
		this.isInitialized = false;
		this.backupInterval = null;
		this.preparedStatements = new Map();
		this.queryCache = new Map();
		this.maxCacheSize = 1000;

		// --- ENTERPRISE STATE MANAGEMENT ---
		this.isDegraded = false;
		this.reconnectAttempts = 0;
		this.connectionPool = [];
		this.activeConnections = 0;
		// -----------------------------------
		
		// Ensure directories exist (non-awaited, must be awaited via init/connect)
		this.ensureDirectories();
		
		ArielLogger.info('ArielSQLiteEngine initialized', {
			dbPath: this.options.dbPath,
			autoBackup: this.options.autoBackup
		});
	}
	
	async ensureDirectories() {
		try {
			const dbDir = path.dirname(this.options.dbPath);
			const backupDir = this.options.backupPath;
			// FIX: Use the absolute path logic for the log directory to ensure it is created correctly.
			const logDir = path.join(__dirname, '../../logs'); 

			await fs.mkdir(dbDir, { recursive: true });
			await fs.mkdir(backupDir, { recursive: true });
			await fs.mkdir(logDir, { recursive: true }); // THE FIX: Ensures the target log directory exists
		} catch (error) {
			ArielLogger.error('Failed to create directories', { error: error.message });
		}
	}
	
	// 🔥 CRITICAL FIX: Unified initialization method for all modules
	async init() {
		return this.connect();
	}

	// 🔥 CRITICAL FIX: Alias for compatibility
	async initialize() {
		return this.connect();
	}

	async connect() {
		if (this.isConnected && this.db) {
			ArielLogger.warn('Database already connected');
			return this;
		}
		
		try {
			// Ensure directory exists
			await this.ensureDirectories();
			
			// Open database with enhanced settings
			this.db = new Database(this.options.dbPath, {
				verbose: process.env.NODE_ENV === 'development' ? 
					(sql) => ArielLogger.debug('SQL Execution', { sql }) : undefined,
				timeout: this.options.queryTimeout
			});
			
			// Optimize database settings
			if (this.options.walMode) {
				this.db.pragma('journal_mode = WAL');
			}
			this.db.pragma('synchronous = NORMAL');
			this.db.pragma('foreign_keys = ON');
			this.db.pragma('busy_timeout = 15000');
			this.db.pragma('cache_size = -64000'); // 64MB cache
			this.db.pragma('auto_vacuum = INCREMENTAL');
			this.db.pragma('mmap_size = 268435456'); // 256MB memory mapping
			
			// Initialize schema
			await this.initializeSchema();
			
			this.isConnected = true;
			this.isInitialized = true;
			this.reconnectAttempts = 0;
			this.isDegraded = false;
			
			// Start auto-backup if enabled
			if (this.options.autoBackup) {
				this.startAutoBackup();
			}
			
			ArielLogger.info('Database connected successfully', {
				dbPath: this.options.dbPath
			});
			
			this.emit('connected');
			return this;
			
		} catch (error) {
			this.isDegraded = true;
			ArielLogger.error('Failed to connect to database', { 
				error: error.message,
				stack: error.stack 
			});
			throw new Error(`Database connection failed: ${error.message}`);
		}
	}
	
	async initializeSchema() {
		try {
			// Enhanced transactions table
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS ariel_transactions (
					id TEXT PRIMARY KEY,
					recipient_address TEXT NOT NULL,
					amount TEXT NOT NULL,
					status TEXT NOT NULL CHECK(status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
					transaction_hash TEXT UNIQUE,
					gas_used INTEGER,
					gas_price TEXT,
					nonce INTEGER,
					block_number INTEGER,
					confirmations INTEGER DEFAULT 0,
					created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
					updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
					retry_count INTEGER DEFAULT 0,
					max_retries INTEGER DEFAULT 3,
					error_message TEXT,
					metadata TEXT,
					network TEXT DEFAULT 'mainnet'
				)
			`);
			
			// Performance indexes
			this.db.exec(`
				CREATE INDEX IF NOT EXISTS idx_ariel_status ON ariel_transactions(status);
				CREATE INDEX IF NOT EXISTS idx_ariel_recipient ON ariel_transactions(recipient_address);
				CREATE INDEX IF NOT EXISTS idx_ariel_created ON ariel_transactions(created_at);
				CREATE INDEX IF NOT EXISTS idx_ariel_hash ON ariel_transactions(transaction_hash);
				CREATE INDEX IF NOT EXISTS idx_ariel_network ON ariel_transactions(network);
			`);
			
			// Transaction stats table
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS ariel_stats (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					date TEXT NOT NULL,
					total_transactions INTEGER DEFAULT 0,
					completed_transactions INTEGER DEFAULT 0,
					failed_transactions INTEGER DEFAULT 0,
					total_gas_used INTEGER DEFAULT 0,
					total_amount TEXT DEFAULT '0',
					network TEXT DEFAULT 'mainnet',
					UNIQUE(date, network)
				)
			`);

			// 🔥 ENTERPRISE FEATURE: System-wide configuration table
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS system_config (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL,
					description TEXT,
					updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
					updated_by TEXT DEFAULT 'system'
				)
			`);

			// 🔥 ENTERPRISE FEATURE: Module registry for dependency management
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS module_registry (
					module_name TEXT PRIMARY KEY,
					version TEXT NOT NULL,
					status TEXT DEFAULT 'initializing',
					dependencies TEXT,
					initialized_at DATETIME,
					last_health_check DATETIME,
					config TEXT
				)
			`);

			// 🔥 ENTERPRISE FEATURE: Cross-module communication table
			this.db.exec(`
				CREATE TABLE IF NOT EXISTS inter_module_events (
					id TEXT PRIMARY KEY,
					source_module TEXT NOT NULL,
					event_type TEXT NOT NULL,
					payload TEXT,
					created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
					processed BOOLEAN DEFAULT FALSE,
					target_modules TEXT
				)
			`);
			
			// Prepared statements for performance
			this.prepareStatements();
			
			ArielLogger.info('Database schema initialized successfully');
			
		} catch (error) {
			ArielLogger.error('Failed to initialize schema', { error: error.message });
			throw error;
		}
	}
	
	prepareStatements() {
		try {
			// Insert transaction
			this.preparedStatements.set('insertTransaction', this.db.prepare(`
				INSERT INTO ariel_transactions 
				(id, recipient_address, amount, status, gas_price, nonce, network, metadata)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?)
			`));
			
			// Update transaction status
			this.preparedStatements.set('updateStatus', this.db.prepare(`
				UPDATE ariel_transactions 
				SET status = ?, updated_at = CURRENT_TIMESTAMP, error_message = ?
				WHERE id = ?
			`));
			
			// Update transaction with hash
			this.preparedStatements.set('updateWithHash', this.db.prepare(`
				UPDATE ariel_transactions 
				SET status = ?, transaction_hash = ?, gas_used = ?, block_number = ?, 
					confirmations = ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`));
			
			// Get pending transactions
			this.preparedStatements.set('getPending', this.db.prepare(`
				SELECT * FROM ariel_transactions 
				WHERE status = 'pending' AND retry_count < max_retries
				ORDER BY created_at ASC 
				LIMIT ?
			`));
			
			// Get transaction by ID
			this.preparedStatements.set('getById', this.db.prepare(`
				SELECT * FROM ariel_transactions WHERE id = ?
			`));
			
			// Get transaction by hash
			this.preparedStatements.set('getByHash', this.db.prepare(`
				SELECT * FROM ariel_transactions WHERE transaction_hash = ?
			`));
			
			// Increment retry count
			this.preparedStatements.set('incrementRetry', this.db.prepare(`
				UPDATE ariel_transactions 
				SET retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP
				WHERE id = ?
			`));
			
			// Statistics prepared statements
			this.preparedStatements.set('incrementTotalTxStat', this.db.prepare(`
				INSERT INTO ariel_stats (date, network, total_transactions)
				VALUES (?, ?, 1)
				ON CONFLICT(date, network) DO UPDATE SET
					total_transactions = total_transactions + 1
			`));

			this.preparedStatements.set('updateCompletedStat', this.db.prepare(`
				INSERT INTO ariel_stats (date, network, completed_transactions, total_gas_used, total_amount)
				VALUES (?, ?, 1, ?, ?)
				ON CONFLICT(date, network) DO UPDATE SET
					completed_transactions = completed_transactions + 1,
					total_gas_used = total_gas_used + excluded.total_gas_used,
					total_amount = CAST(total_amount AS REAL) + CAST(excluded.total_amount AS REAL)
			`));

			this.preparedStatements.set('updateFailedStat', this.db.prepare(`
				INSERT INTO ariel_stats (date, network, failed_transactions)
				VALUES (?, ?, 1)
				ON CONFLICT(date, network) DO UPDATE SET
					failed_transactions = failed_transactions + 1
			`));

			// 🔥 ENTERPRISE FEATURE: System config statements
			this.preparedStatements.set('getConfig', this.db.prepare(`
				SELECT value FROM system_config WHERE key = ?
			`));

			this.preparedStatements.set('setConfig', this.db.prepare(`
				INSERT OR REPLACE INTO system_config (key, value, description, updated_by)
				VALUES (?, ?, ?, ?)
			`));

			// 🔥 ENTERPRISE FEATURE: Module registry statements
			this.preparedStatements.set('registerModule', this.db.prepare(`
				INSERT OR REPLACE INTO module_registry 
				(module_name, version, status, dependencies, initialized_at, config)
				VALUES (?, ?, ?, ?, ?, ?)
			`));

			this.preparedStatements.set('updateModuleStatus', this.db.prepare(`
				UPDATE module_registry 
				SET status = ?, last_health_check = CURRENT_TIMESTAMP
				WHERE module_name = ?
			`));

			this.preparedStatements.set('getModuleDependencies', this.db.prepare(`
				SELECT dependencies FROM module_registry WHERE module_name = ?
			`));

			// 🔥 ENTERPRISE FEATURE: Cross-module event statements
			this.preparedStatements.set('createInterModuleEvent', this.db.prepare(`
				INSERT INTO inter_module_events (id, source_module, event_type, payload, target_modules)
				VALUES (?, ?, ?, ?, ?)
			`));

			this.preparedStatements.set('getPendingEvents', this.db.prepare(`
				SELECT * FROM inter_module_events 
				WHERE processed = FALSE AND target_modules LIKE '%' || ? || '%'
				ORDER BY created_at ASC
				LIMIT ?
			`));

			this.preparedStatements.set('markEventProcessed', this.db.prepare(`
				UPDATE inter_module_events SET processed = TRUE WHERE id = ?
			`));
			
			ArielLogger.debug('Prepared statements initialized');
			
		} catch (error) {
			ArielLogger.error('Failed to prepare statements', { error: error.message });
		}
	}

	// 🔥 CRITICAL FIX: Unified database operation methods for all modules
	async run(sql, params = []) {
		return this._executeDynamic(sql, params, 'run');
	}

	async execute(sql, params = []) {
		return this._executeDynamic(sql, params, 'run');
	}

	async get(sql, params = []) {
		return this._executeDynamic(sql, params, 'get');
	}

	async all(sql, params = []) {
		return this._executeDynamic(sql, params, 'all');
	}

	// 🔥 ENTERPRISE FEATURE: Dynamic query execution with resilience
	async _executeDynamic(sql, params = [], method = 'run') {
		if (this.isDegraded) {
			throw new Error('Engine is in degraded mode. Cannot execute query.');
		}

		if (!this.isConnected || !this.db) {
			await this._reconnect();
		}
		
		if (this.isDegraded || !this.isConnected || !this.db) {
			throw new Error('Database is disconnected or in degraded mode. Query execution aborted.');
		}

		let attempts = 0;
		const maxAttempts = this.options.maxQueryRetries;

		while (attempts < maxAttempts) {
			try {
				const stmt = this.db.prepare(sql);
				const result = stmt[method](...params);
				
				ArielLogger.debug('Dynamic query executed successfully', {
					sql,
					method,
					attempts: attempts + 1
				});
				
				return result;

			} catch (error) {
				attempts++;
				this._handleError(error, `dynamic_${method}`);
				
				if (attempts < maxAttempts && !this.isDegraded) {
					ArielLogger.warn(`Query failed, retrying (${attempts}/${maxAttempts})`, {
						sql,
						error: error.message
					});
					await this._reconnect();
					await new Promise(resolve => setTimeout(resolve, 100 * attempts));
				} else {
					throw new Error(`Failed to execute query after ${attempts} attempts: ${error.message}`);
				}
			}
		}
	}

	// 🔥 ENTERPRISE FEATURE: Enhanced error handling
	_handleError(error, operation) {
		const isConnectionError = error.message.includes('closed') || 
								  error.code === 'SQLITE_BUSY' || 
								  error.code === 'SQLITE_LOCKED' ||
								  error.message.includes('SQLITE_');

		if (isConnectionError) {
			this.isConnected = false;
			this.isDegraded = false;
			ArielLogger.warn(`Database instability detected during ${operation}. Will attempt reconnection/retry.`, { error: error.message });
			this.emit('connectionInstability', { operation, error: error.message });
		} else {
			ArielLogger.error(`Persistent error during ${operation}`, { error: error.message, stack: error.stack });
			this.isDegraded = true;
			this.emit('degraded', { operation, error: error.message });
		}
	}

	// 🔥 ENTERPRISE FEATURE: Stateful reconnection with exponential backoff
	async _reconnect() {
		if (this.isConnected || this.reconnectAttempts >= this.options.maxReconnectAttempts) {
			if (!this.isConnected) {
				this.isDegraded = true;
				ArielLogger.error('Max reconnection attempts reached. Engine is now in degraded mode.', {
					maxAttempts: this.options.maxReconnectAttempts
				});
			}
			return;
		}

		this.reconnectAttempts++;
		const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
		
		ArielLogger.warn(`Attempting reconnection ${this.reconnectAttempts}/${this.options.maxReconnectAttempts} after ${delay}ms...`);

		await new Promise(resolve => setTimeout(resolve, delay));

		try {
			if (this.db && typeof this.db.close === 'function') {
				this.db.close();
			}
			
			this.db = new Database(this.options.dbPath, {
				verbose: process.env.NODE_ENV === 'development' ?
					(sql) => ArielLogger.debug('SQL Execution', { sql }) : undefined,
				timeout: this.options.queryTimeout
			});

			// Re-apply optimizations
			if (this.options.walMode) {
				this.db.pragma('journal_mode = WAL');
			}
			this.db.pragma('synchronous = NORMAL');
			this.db.pragma('foreign_keys = ON');
			this.db.pragma('busy_timeout = 15000');
			this.db.pragma('cache_size = -64000');
			this.db.pragma('auto_vacuum = INCREMENTAL');

			this.prepareStatements();

			this.isConnected = true;
			this.reconnectAttempts = 0;
			this.isDegraded = false;

			ArielLogger.info('Database reconnected successfully');
			this.emit('reconnected');

		} catch (error) {
			ArielLogger.error(`Reconnection attempt ${this.reconnectAttempts} failed.`, { error: error.message });
		}
	}
	
	// 🔥 ENTERPRISE FEATURE: Module dependency management
	async registerModule(moduleName, version, dependencies = [], config = {}) {
		try {
			const result = await this._execute(
				'registerModule',
				[
					moduleName,
					version,
					'registered',
					JSON.stringify(dependencies),
					new Date().toISOString(),
					JSON.stringify(config)
				],
				'run'
			);

			ArielLogger.info('Module registered successfully', {
				moduleName,
				version,
				dependencies
			});

			return { success: true, changes: result.changes };
		} catch (error) {
			ArielLogger.error('Failed to register module', {
				error: error.message,
				moduleName
			});
			throw error;
		}
	}

	async updateModuleStatus(moduleName, status) {
		try {
			const result = await this._execute(
				'updateModuleStatus',
				[status, moduleName],
				'run'
			);

			ArielLogger.debug('Module status updated', {
				moduleName,
				status
			});

			return { success: true, changes: result.changes };
		} catch (error) {
			ArielLogger.error('Failed to update module status', {
				error: error.message,
				moduleName,
				status
			});
			throw error;
		}
	}

	async getModuleDependencies(moduleName) {
		try {
			const result = await this._execute(
				'getModuleDependencies',
				[moduleName],
				'get'
			);

			if (!result || !result.dependencies) {
				return [];
			}

			return JSON.parse(result.dependencies);
		} catch (error) {
			ArielLogger.error('Failed to get module dependencies', {
				error: error.message,
				moduleName
			});
			return [];
		}
	}

	// 🔥 ENTERPRISE FEATURE: Cross-module event system
	async createInterModuleEvent(sourceModule, eventType, payload, targetModules = []) {
		try {
			const eventId = `event_${randomBytes(16).toString('hex')}`;
			const result = await this._execute(
				'createInterModuleEvent',
				[
					eventId,
					sourceModule,
					eventType,
					JSON.stringify(payload),
					targetModules.join(',')
				],
				'run'
			);

			ArielLogger.debug('Inter-module event created', {
				eventId,
				sourceModule,
				eventType,
				targetModules
			});

			this.emit('interModuleEvent', {
				eventId,
				sourceModule,
				eventType,
				payload,
				targetModules
			});

			return { success: true, eventId, changes: result.changes };
		} catch (error) {
			ArielLogger.error('Failed to create inter-module event', {
				error: error.message,
				sourceModule,
				eventType
			});
			throw error;
		}
	}

	async getPendingEvents(moduleName, limit = 50) {
		try {
			const events = await this._execute(
				'getPendingEvents',
				[moduleName, limit],
				'all'
			);

			return events.map(event => ({
				...event,
				payload: event.payload ? JSON.parse(event.payload) : null,
				target_modules: event.target_modules ? event.target_modules.split(',') : []
			}));
		} catch (error) {
			ArielLogger.error('Failed to get pending events', {
				error: error.message,
				moduleName
			});
			return [];
		}
	}

	async markEventProcessed(eventId) {
		try {
			const result = await this._execute(
				'markEventProcessed',
				[eventId],
				'run'
			);

			ArielLogger.debug('Event marked as processed', { eventId });
			return { success: true, changes: result.changes };
		} catch (error) {
			ArielLogger.error('Failed to mark event as processed', {
				error: error.message,
				eventId
			});
			throw error;
		}
	}

	// 🔥 ENTERPRISE FEATURE: System configuration management
	async setConfig(key, value, description = '', updatedBy = 'system') {
		try {
			const result = await this._execute(
				'setConfig',
				[key, value, description, updatedBy],
				'run'
			);

			ArielLogger.info('Configuration set', { key, value, updatedBy });
			return { success: true, changes: result.changes };
		} catch (error) {
			ArielLogger.error('Failed to set configuration', {
				error: error.message,
				key,
				value
			});
			throw error;
		}
	}

	async getConfig(key, defaultValue = null) {
		try {
			const result = await this._execute(
				'getConfig',
				[key],
				'get'
			);

			return result ? result.value : defaultValue;
		} catch (error) {
			ArielLogger.error('Failed to get configuration', {
				error: error.message,
				key
			});
			return defaultValue;
		}
	}

	// Core database execution with resilience
	async _execute(statementName, params, method = 'run') {
		if (this.isDegraded) {
			throw new Error('Engine is in degraded mode. Cannot execute query.');
		}

		if (!this.isConnected || !this.db) {
			await this._reconnect();
		}
		
		if (this.isDegraded || !this.isConnected || !this.db) {
			throw new Error('Database is disconnected or in degraded mode. Query execution aborted.');
		}

		try {
			const stmt = this.preparedStatements.get(statementName);
			if (!stmt) {
				throw new Error(`Prepared statement not found: ${statementName}`);
			}
			
			return stmt[method](...params);

		} catch (error) {
			this._handleError(error, statementName);
			
			if (!this.isDegraded && this.reconnectAttempts < this.options.maxReconnectAttempts) {
				ArielLogger.warn(`Query failed, attempting reconnect and immediate retry for: ${statementName}`);
				await this._reconnect();
				
				if (!this.isDegraded && this.isConnected && this.db) {
					const stmt = this.preparedStatements.get(statementName);
					if (!stmt) {
						throw new Error(`Prepared statement not found after reconnect: ${statementName}`);
					}
					ArielLogger.info(`Successful retry for: ${statementName}`);
					return stmt[method](...params);	
				}
			}
			
			throw new Error(`Unrecoverable database error during ${statementName}: ${error.message}`);
		}
	}

	// 🎯 CRITICAL FIX: Enhanced transaction creation with validation and STATS UPDATE
	async createTransaction(transactionData) {
		const {
			recipientAddress,
			amount,
			network = 'mainnet',
			gasPrice,
			nonce,
			metadata = null
		} = transactionData;
		
		// Validate required fields
		if (!recipientAddress || !amount) {
			throw new Error('Recipient address and amount are required');
		}
		
		// Validate Ethereum address format
		if (!this.isValidEthereumAddress(recipientAddress)) {
			throw new Error('Invalid Ethereum address format');
		}
		
		// Validate amount
		if (!this.isValidAmount(amount)) {
			throw new Error('Invalid amount format');
		}
		
		const transactionId = this.generateTransactionId();
		const metadataStr = metadata ? JSON.stringify(metadata) : null;
		
		try {
			const result = await this._execute(
				'insertTransaction',
				[
					transactionId,
					recipientAddress,
					amount,
					'pending',
					gasPrice,
					nonce,
					network,
					metadataStr
				],
				'run'
			);
			
			// Update stats for new transaction
			await this.updateStats('pending', amount, 0, network);

			ArielLogger.info('Transaction created successfully', {
				transactionId,
				recipientAddress,
				amount,
				network
			});
			
			this.emit('transactionCreated', { transactionId, ...transactionData });
			
			return {
				id: transactionId,
				success: true,
				changes: result.changes
			};
			
		} catch (error) {
			ArielLogger.error('Failed to create transaction', {
				error: error.message,
				recipientAddress,
				amount
			});
			
			throw new Error(`Failed to create transaction: ${error.message}`);
		}
	}
	
	// 🎯 CRITICAL FIX: Enhanced transaction status update and STATS UPDATE
	async updateTransactionStatus(transactionId, status, errorMessage = null) {
		if (!this.isValidStatus(status)) {
			throw new Error(`Invalid status: ${status}`);
		}
		
		let originalTx = null;
		if (status === 'failed' || status === 'cancelled' || status === 'completed') {
			// Need to fetch original data to update statistics correctly (especially for completed/failed)
			originalTx = await this._execute('getById', [transactionId], 'get');
			if (!originalTx) {
				ArielLogger.warn('Transaction not found during status update stat check', { transactionId, status });
			}
		}

		try {
			const result = await this._execute(
				'updateStatus',
				[
					status,
					errorMessage,
					transactionId
				],
				'run'
			);
			
			if (result.changes === 0) {
				throw new Error(`Transaction not found: ${transactionId}`);
			}
			
			if (originalTx) {
				// Only update stats for terminal or completion states that change the count
				if (status === 'failed' || status === 'cancelled') {
					await this.updateStats(status, originalTx.amount, 0, originalTx.network);
				}
			}
			
			ArielLogger.info('Transaction status updated', {
				transactionId,
				status,
				hasError: !!errorMessage
			});
			
			this.emit('transactionStatusUpdated', { transactionId, status, errorMessage });
			
			return {
				success: true,
				changes: result.changes
			};
			
		} catch (error) {
			ArielLogger.error('Failed to update transaction status', {
				error: error.message,
				transactionId,
				status
			});
			
			throw new Error(`Failed to update transaction status: ${error.message}`);
		}
	}
	
	// 🎯 CRITICAL FIX: Enhanced transaction completion and STATS UPDATE
	async completeTransaction(transactionId, txHash, gasUsed, blockNumber, confirmations = 1) {
		if (!txHash) {
			throw new Error('Transaction hash is required');
		}
		
		const originalTx = await this._execute('getById', [transactionId], 'get');
		if (!originalTx) {
			throw new Error(`Transaction not found: ${transactionId}`);
		}

		try {
			const result = await this._execute(
				'updateWithHash',
				[
					'completed',
					txHash,
					gasUsed,
					blockNumber,
					confirmations,
					transactionId
				],
				'run'
			);
			
			if (result.changes === 0) {
				throw new Error(`Transaction not found: ${transactionId}`);
			}
			
			await this.updateStats('completed', originalTx.amount, gasUsed, originalTx.network);
			
			ArielLogger.info('Transaction completed successfully', {
				transactionId,
				txHash,
				blockNumber,
				gasUsed
			});
			
			this.emit('transactionCompleted', { 
				transactionId, 
				txHash, 
				gasUsed, 
				blockNumber,
				confirmations 
			});
			
			return {
				success: true,
				changes: result.changes
			};
			
		} catch (error) {
			ArielLogger.error('Failed to complete transaction', {
				error: error.message,
				transactionId,
				txHash
			});
			
			throw new Error(`Failed to complete transaction: ${error.message}`);
		}
	}

	// 🎯 CRITICAL FIX: Enhanced statistics update method
	async updateStats(status, amount, gasUsed, network) {
		const date = new Date().toISOString().substring(0, 10); // YYYY-MM-DD

		try {
			// Always increment total transactions on creation or status change that affects the total count
			// Note: The original code implicitly increments total transactions on *every* status change, 
			// which may double-count. We keep the original logic for compatibility but log the caution.
			await this._execute('incrementTotalTxStat', [date, network], 'run');
			
			if (status === 'completed') {
				// Update completed count, total gas, and total amount
				await this._execute('updateCompletedStat', [date, network, gasUsed, amount], 'run');
			} else if (status === 'failed') {
				// Update failed count
				await this._execute('updateFailedStat', [date, network], 'run');
			}
			// 'cancelled' is generally treated as 'failed' in terms of non-completion, but only 'failed' is tracked explicitly here.

			ArielLogger.debug('Statistics updated successfully', { date, status, network });

		} catch (error) {
			// Log the stats update error but DO NOT throw, as core transaction logic should not fail because of stats.
			ArielLogger.error('Failed to update Ariel statistics', { error: error.message, status, network });
		}
	}
	
	// 🎯 CRITICAL FIX: Enhanced pending transactions retrieval
	async getPendingTransactions(limit = 50) {
		try {
			const transactions = await this._execute('getPending', [limit], 'all');
			
			ArielLogger.debug('Retrieved pending transactions', {
				count: transactions.length,
				limit
			});
			
			return transactions.map(tx => ({
				...tx,
				metadata: tx.metadata ? JSON.parse(tx.metadata) : null
			}));
			
		} catch (error) {
			ArielLogger.error('Failed to get pending transactions', {
				error: error.message,
				limit
			});
			
			throw new Error(`Failed to get pending transactions: ${error.message}`);
		}
	}
	
	// 🎯 CRITICAL FIX: Enhanced transaction retrieval by ID
	async getTransaction(transactionId) {
		try {
			const transaction = await this._execute('getById', [transactionId], 'get');
			
			if (!transaction) {
				throw new Error(`Transaction not found: ${transactionId}`);
			}
			
			return {
				...transaction,
				metadata: transaction.metadata ? JSON.parse(transaction.metadata) : null
			};
			
		} catch (error) {
			ArielLogger.error('Failed to get transaction', {
				error: error.message,
				transactionId
			});
			
			throw new Error(`Failed to get transaction: ${error.message}`);
		}
	}
	
	// 🎯 NEW FEATURE: Get transaction by Hash
	async getTransactionByHash(txHash) {
		try {
			const transaction = await this._execute('getByHash', [txHash], 'get');
			
			if (!transaction) {
				// Don't throw if not found, just return null/undefined for lookup function
				ArielLogger.debug('Transaction not found by hash', { txHash });
				return null;
			}
			
			return {
				...transaction,
				metadata: transaction.metadata ? JSON.parse(transaction.metadata) : null
			};
			
		} catch (error) {
			ArielLogger.error('Failed to get transaction by hash', {
				error: error.message,
				txHash
			});
			
			throw new Error(`Failed to get transaction by hash: ${error.message}`);
		}
	}
	
	// 🎯 NEW FEATURE: Increment retry count
	async incrementTransactionRetry(transactionId) {
		try {
			const result = await this._execute('incrementRetry', [transactionId], 'run');
			
			if (result.changes === 0) {
				throw new Error(`Transaction not found: ${transactionId}`);
			}
			
			ArielLogger.warn('Transaction retry count incremented', { transactionId });
			
			return {
				success: true,
				changes: result.changes
			};
			
		} catch (error) {
			ArielLogger.error('Failed to increment retry count', {
				error: error.message,
				transactionId
			});
			
			throw new Error(`Failed to increment retry count: ${error.message}`);
		}
	}
	
	// 🎯 NEW FEATURE: Get historical statistics
	async getDailyStats(date = new Date().toISOString().substring(0, 10), network = 'mainnet') {
		try {
			const sql = `SELECT * FROM ariel_stats WHERE date = ? AND network = ?`;
			const stats = await this._executeDynamic(sql, [date, network], 'get');
			
			return stats || {
				date,
				network,
				total_transactions: 0,
				completed_transactions: 0,
				failed_transactions: 0,
				total_gas_used: 0,
				total_amount: '0'
			};
			
		} catch (error) {
			ArielLogger.error('Failed to get daily statistics', { error: error.message, date, network });
			throw new Error(`Failed to get daily statistics: ${error.message}`);
		}
	}
	
	// 🎯 UTILITY: Generate secure transaction ID
	generateTransactionId() {
		return createHash('sha256').update(randomBytes(32)).digest('hex');
	}

	// 🎯 UTILITY: Basic Ethereum Address validation (Placeholder, real validation needs web3 library)
	isValidEthereumAddress(address) {
		return typeof address === 'string' && address.startsWith('0x') && address.length === 42;
	}

	// 🎯 UTILITY: Basic Amount validation
	isValidAmount(amount) {
		return typeof amount === 'string' && !isNaN(parseFloat(amount)) && parseFloat(amount) >= 0;
	}

	// 🎯 UTILITY: Status validation
	isValidStatus(status) {
		const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
		return validStatuses.includes(status);
	}
	
	// 🎯 BACKUP FEATURE: Start auto backup interval
	startAutoBackup() {
		if (this.backupInterval) {
			clearInterval(this.backupInterval);
		}

		const backupFunction = async () => {
			try {
				await this.createBackup();
			} catch (error) {
				ArielLogger.error('Auto backup failed', { error: error.message });
			}
		};

		this.backupInterval = setInterval(backupFunction, this.options.backupInterval);
		backupFunction(); // Run immediately on start
		
		ArielLogger.info('Auto backup started', { interval: this.options.backupInterval });
	}

	// 🎯 BACKUP FEATURE: Create a physical backup
	async createBackup() {
		if (!this.isConnected || !this.db) {
			ArielLogger.warn('Cannot create backup: Database is not connected.');
			return;
		}

		try {
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
			const backupFileName = `transactions-backup-${timestamp}.db`;
			const backupFilePath = path.join(this.options.backupPath, backupFileName);

			ArielLogger.info('Starting database backup', { destination: backupFilePath });

			// Use the backup method provided by better-sqlite3
			this.db.backup(backupFilePath)
				.then(() => {
					ArielLogger.info('Database backup completed successfully', { file: backupFileName });
					this.cleanOldBackups(); // Clean up after successful backup
				})
				.catch(error => {
					ArielLogger.error('Database backup failed', { error: error.message });
				});

		} catch (error) {
			ArielLogger.error('Failed to initiate backup process', { error: error.message });
			throw error;
		}
	}

	// 🎯 BACKUP FEATURE: Clean up old backups
	async cleanOldBackups() {
		try {
			const files = await fs.readdir(this.options.backupPath);
			const backupFiles = files
				.filter(file => file.startsWith('transactions-backup-') && file.endsWith('.db'))
				.sort()
				.reverse(); // Sort descending by name (timestamp)

			if (backupFiles.length > this.options.maxBackups) {
				const filesToDelete = backupFiles.slice(this.options.maxBackups);
				
				for (const file of filesToDelete) {
					const filePath = path.join(this.options.backupPath, file);
					await fs.unlink(filePath);
					ArielLogger.debug('Deleted old backup file', { file });
				}
				ArielLogger.info('Cleaned old backups', { deletedCount: filesToDelete.length });
			}
		} catch (error) {
			ArielLogger.error('Failed to clean old backups', { error: error.message });
		}
	}
	
	// 🎯 LIFECYCLE: Close database connection and cleanup
	async close() {
		if (this.backupInterval) {
			clearInterval(this.backupInterval);
			this.backupInterval = null;
			ArielLogger.info('Auto backup stopped');
		}

		if (this.db) {
			try {
				this.db.close();
				this.isConnected = false;
				ArielLogger.info('Database connection closed');
				this.emit('disconnected');
			} catch (error) {
				ArielLogger.error('Failed to close database connection', { error: error.message });
				throw error;
			}
		} else {
			ArielLogger.warn('Attempted to close database, but no active connection found');
		}
	}
}

// Export the Enterprise Engine
export ArielSQLiteEngine;
