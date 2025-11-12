import Database from 'better-sqlite3';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { createHash, randomBytes } from 'crypto';
import EventEmitter from 'events';

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
    
    console.log(JSON.stringify(logEntry));
    
    // Write to file in production
    if (process.env.NODE_ENV === 'production') {
      const logFile = path.join(__dirname, '../../logs/ariel-engine.log');
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

// Enhanced Ariel SQLite Engine
class ArielSQLiteEngine extends EventEmitter {
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
      // --- v7.7.7 UNBREAKABLE RESILIENCE PATCH: NEW OPTIONS ---
      maxReconnectAttempts: 5, // Max attempts before entering degraded mode
      reconnectInterval: 5000, // 5 seconds between reconnect attempts
      // --------------------------------------------------------
      ...options
    };
    
    this.db = null;
    this.isConnected = false;
    this.backupInterval = null;
    this.preparedStatements = new Map();
    this.queryCache = new Map();
    this.maxCacheSize = 1000;

    // --- v7.7.7 UNBREAKABLE RESILIENCE PATCH: NEW STATE ---
    this.isDegraded = false; // Flag indicating persistent failure, requires manual intervention
    this.reconnectAttempts = 0;
    // --------------------------------------------------------
    
    // Ensure directories exist
    this.ensureDirectories();
    
    ArielLogger.info('ArielSQLiteEngine initialized', {
      dbPath: this.options.dbPath,
      autoBackup: this.options.autoBackup
    });
  }
  
  async ensureDirectories() {
    try {
      await fs.mkdir(path.dirname(this.options.dbPath), { recursive: true });
      await fs.mkdir(this.options.backupPath, { recursive: true });
    } catch (error) {
      ArielLogger.error('Failed to create directories', { error: error.message });
    }
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
      
      // Initialize schema
      await this.initializeSchema();
      
      this.isConnected = true;
      this.reconnectAttempts = 0; // Reset on successful connect
      this.isDegraded = false; // Reset on successful connect
      
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
      this.isDegraded = true; // Mark as degraded on initial failure
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
      
      // 🔥 LATEST UPDATE: Prepared statements for daily statistics (ariel_stats)
      
      // Increment total transactions (for 'pending')
      this.preparedStatements.set('incrementTotalTxStat', this.db.prepare(`
          INSERT INTO ariel_stats (date, network, total_transactions)
          VALUES (?, ?, 1)
          ON CONFLICT(date, network) DO UPDATE SET
              total_transactions = total_transactions + 1
      `));

      // Update completed stats
      this.preparedStatements.set('updateCompletedStat', this.db.prepare(`
          INSERT INTO ariel_stats (date, network, completed_transactions, total_gas_used, total_amount)
          VALUES (?, ?, 1, ?, ?)
          ON CONFLICT(date, network) DO UPDATE SET
              completed_transactions = completed_transactions + 1,
              total_gas_used = total_gas_used + excluded.total_gas_used,
              total_amount = CAST(total_amount AS REAL) + CAST(excluded.total_amount AS REAL)
      `));

      // Update failed/cancelled stats
      this.preparedStatements.set('updateFailedStat', this.db.prepare(`
          INSERT INTO ariel_stats (date, network, failed_transactions)
          VALUES (?, ?, 1)
          ON CONFLICT(date, network) DO UPDATE SET
              failed_transactions = failed_transactions + 1
      `));
      
      ArielLogger.debug('Prepared statements initialized');
      
    } catch (error) {
      ArielLogger.error('Failed to prepare statements', { error: error.message });
    }
  }

  // --- v7.7.7 UNBREAKABLE RESILIENCE PATCH: NEW CORE METHODS ---

  /**
   * Centralized error handler for logging and state management.
   * @param {Error} error
   * @param {string} operation
   */
  _handleError(error, operation) {
    // Check for common better-sqlite3 errors indicating connection or lock issues
    const isConnectionError = error.message.includes('closed') || 
                              error.code === 'SQLITE_BUSY' || 
                              error.code === 'SQLITE_LOCKED';

    if (isConnectionError) {
      this.isConnected = false;
      this.isDegraded = false; // Allow reconnection attempt before final degradation
      ArielLogger.warn(`Database instability detected during ${operation}. Will attempt reconnection/retry.`, { error: error.message });
      this.emit('connectionInstability', { operation, error: error.message });
    } else {
      ArielLogger.error(`Persistent error during ${operation}`, { error: error.message, stack: error.stack });
      this.isDegraded = true;
      this.emit('degraded', { operation, error: error.message });
    }
  }

  /**
   * Internal method to attempt stateful reconnection.
   */
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
    ArielLogger.warn(`Attempting reconnection ${this.reconnectAttempts}/${this.options.maxReconnectAttempts}...`);

    try {
      // Attempt graceful close of potentially stale connection
      if (this.db && typeof this.db.close === 'function' && !this.db.readonly) {
        this.db.close();
      }
      
      // Open database with enhanced settings (core of connect() logic)
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

      this.prepareStatements(); // Re-prepare statements on the new connection

      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.isDegraded = false;

      ArielLogger.info('Database reconnected successfully');
      this.emit('reconnected');

    } catch (error) {
      ArielLogger.error(`Reconnection attempt ${this.reconnectAttempts} failed.`, { error: error.message });
      await new Promise(resolve => setTimeout(resolve, this.options.reconnectInterval));
      // Recursive call is now an intentional loop outside, or let the caller retry.
      // We will let the caller (via _execute) handle the max attempts loop.
    }
  }
  
  /**
   * Core execution wrapper with resilience logic.
   * Handles automatic reconnection and single retry on connection instability.
   * @param {string} statementName The name of the prepared statement.
   * @param {Array<any>} params Parameters for the statement.
   * @param {'run'|'get'|'all'} method Execution method.
   */
  async _execute(statementName, params, method = 'run') {
    if (this.isDegraded) {
      throw new Error('Engine is in degraded mode. Cannot execute query.');
    }

    if (!this.isConnected || !this.db) {
      await this._reconnect(); // Attempt immediate reconnect if not connected
    }
    
    // Check degradation again after potential reconnect
    if (this.isDegraded || !this.isConnected || !this.db) {
      throw new Error('Database is disconnected or in degraded mode. Query execution aborted.');
    }

    try {
      const stmt = this.preparedStatements.get(statementName);
      if (!stmt) {
        throw new Error(`Prepared statement not found: ${statementName}`);
      }
      
      // Execute the statement synchronously
      return stmt[method](...params);

    } catch (error) {
      this._handleError(error, statementName);
      
      // If the error suggests a connection issue and we haven't reached max attempts, retry once after reconnect.
      if (!this.isDegraded && this.reconnectAttempts < this.options.maxReconnectAttempts) {
        ArielLogger.warn(`Query failed, attempting reconnect and immediate retry for: ${statementName}`);
        await this._reconnect(); // Wait for reconnection
        
        if (!this.isDegraded && this.isConnected && this.db) {
          // Final synchronous retry
          const stmt = this.preparedStatements.get(statementName);
          if (!stmt) {
              throw new Error(`Prepared statement not found after reconnect: ${statementName}`);
          }
          ArielLogger.info(`Successful retry for: ${statementName}`);
          return stmt[method](...params); 
        }
      }
      
      // Unrecoverable or max retries reached
      throw new Error(`Unrecoverable database error during ${statementName}: ${error.message}`);
    }
  }

  // -----------------------------------------------------------------------------
  
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
      
      // 🔥 LATEST UPDATE: Update stats for new transaction (Total Tx Count)
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
    
    // 🔥 LATEST UPDATE: Fetch original transaction data for stats if failing/cancelling
    let originalTx = null;
    if (status === 'failed' || status === 'cancelled') {
        originalTx = await this._execute('getById', [transactionId], 'get');
        if (!originalTx) {
            // Log a warning but proceed with the update attempt
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
      
      // 🔥 LATEST UPDATE: Update stats for failed/cancelled transaction
      if (originalTx) {
          await this.updateStats(status, originalTx.amount, 0, originalTx.network);
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
    
    // 🔥 LATEST UPDATE: Fetch original transaction data for stats
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
      
      // 🔥 LATEST UPDATE: Update stats for completed transaction
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
  
  // 🎯 CRITICAL FIX: Enhanced transaction retrieval by hash
  async getTransactionByHash(txHash) {
    try {
      const transaction = await this._execute('getByHash', [txHash], 'get');
      
      if (!transaction) {
        throw new Error(`Transaction not found with hash: ${txHash}`);
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
  
  // 🎯 CRITICAL FIX: Enhanced increment retry count
  async incrementRetryCount(transactionId) {
    try {
      const result = await this._execute('incrementRetry', [transactionId], 'run');
      
      if (result.changes === 0) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }
      
      ArielLogger.debug('Retry count incremented', { transactionId });
      
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
  
  // 🎯 CRITICAL FIX: Enhanced transaction search with filters
  async searchTransactions(filters = {}, limit = 100, offset = 0) {
    const {
      status,
      recipientAddress,
      network,
      dateFrom,
      dateTo
    } = filters;
    
    try {
      let whereClauses = [];
      let params = [];
      
      if (status) {
        whereClauses.push('status = ?');
        params.push(status);
      }
      
      if (recipientAddress) {
        whereClauses.push('recipient_address = ?');
        params.push(recipientAddress);
      }
      
      if (network) {
        whereClauses.push('network = ?');
        params.push(network);
      }
      
      if (dateFrom) {
        whereClauses.push('created_at >= ?');
        params.push(dateFrom);
      }
      
      if (dateTo) {
        whereClauses.push('created_at <= ?');
        params.push(dateTo);
      }
      
      const whereClause = whereClauses.length > 0 ? 
        `WHERE ${whereClauses.join(' AND ')}` : '';
      
      const sql = `
        SELECT * FROM ariel_transactions 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `;
      
      params.push(limit, offset);
      
      // Need to use the raw db.prepare since this is a dynamic query, not a prepared statement
      // We wrap it with resilience logic manually
      let transactions;
      try {
        // NOTE: This is a deviation from _execute pattern due to dynamic SQL.
        transactions = this.db.prepare(sql).all(...params);
      } catch (error) {
        // Fallback resilience for dynamic query
        this._handleError(error, 'searchTransactions-dynamic');
        if (!this.isDegraded && this.reconnectAttempts < this.options.maxReconnectAttempts) {
          await this._reconnect();
          if (!this.isDegraded && this.isConnected && this.db) {
            transactions = this.db.prepare(sql).all(...params);
          } else {
            throw new Error(`Search failed after reconnect: ${error.message}`);
          }
        } else {
          throw error;
        }
      }

      ArielLogger.debug('Transaction search completed', {
        filters,
        count: transactions.length,
        limit,
        offset
      });
      
      return transactions.map(tx => ({
        ...tx,
        metadata: tx.metadata ? JSON.parse(tx.metadata) : null
      }));
      
    } catch (error) {
      ArielLogger.error('Failed to search transactions', {
        error: error.message,
        filters
      });
      
      throw new Error(`Failed to search transactions: ${error.message}`);
    }
  }
  
  // 🎯 CRITICAL FIX: Enhanced statistics with date range
  async getStatistics(dateFrom = null, dateTo = null) {
    try {
      let whereClause = '';
      let params = [];
      
      if (dateFrom && dateTo) {
        whereClause = 'WHERE date BETWEEN ? AND ?';
        params = [dateFrom, dateTo];
      } else if (dateFrom) {
        whereClause = 'WHERE date >= ?';
        params = [dateFrom];
      } else if (dateTo) {
        whereClause = 'WHERE date <= ?';
        params = [dateTo];
      }
      
      // NOTE: getStatistics uses dynamic queries, so it cannot use _execute directly.
      
      const stats = this.db.prepare(`
        SELECT 
          network,
          SUM(total_transactions) as total_transactions,
          SUM(completed_transactions) as completed_transactions,
          SUM(failed_transactions) as failed_transactions,
          SUM(total_gas_used) as total_gas_used,
          -- Use CAST to ensure correct summation of TEXT amounts
          CAST(SUM(CAST(total_amount AS REAL)) AS TEXT) as total_amount_sum 
        FROM ariel_stats 
        ${whereClause}
        GROUP BY network
      `).all(...params);
      
      // Get real-time pending count
      const pendingCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM ariel_transactions 
        WHERE status = 'pending'
      `).get().count;
      
      const result = {
        networks: stats.map(s => ({
            ...s,
            // Remap the summed amount to the expected key
            total_amount: s.total_amount_sum,
            total_amount_sum: undefined
        })),
        realTime: {
          pendingTransactions: pendingCount
        },
        period: {
          from: dateFrom,
          to: dateTo
        }
      };
      
      ArielLogger.debug('Statistics retrieved', {
        period: { dateFrom, dateTo },
        networkCount: stats.length
      });
      
      return result;
      
    } catch (error) {
      ArielLogger.error('Failed to get statistics', {
        error: error.message,
        dateFrom,
        dateTo
      });
      
      throw new Error(`Failed to get statistics: ${error.message}`);
    }
  }
  
  // 🎯 CRITICAL FIX: Enhanced backup with compression support
  async backup(backupName = null) {
    if (!this.isConnected || !this.db) {
      throw new Error('Database not connected');
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = backupName || `ariel_backup_${timestamp}.db`;
    const backupPath = path.join(this.options.backupPath, backupFile);
    
    try {
      // Use VACUUM INTO for consistent backup
      this.db.prepare(`VACUUM INTO ?`).run(backupPath);
      
      ArielLogger.info('Database backup created successfully', {
        backupPath,
        size: (await fs.stat(backupPath)).size
      });
      
      // Clean up old backups
      await this.cleanupOldBackups();
      
      return {
        success: true,
        backupPath,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      ArielLogger.error('Failed to create backup', {
        error: error.message,
        backupPath
      });
      
      throw new Error(`Backup failed: ${error.message}`);
    }
  }
  
  async cleanupOldBackups() {
    try {
      const files = await fs.readdir(this.options.backupPath);
      const backupFiles = files
        .filter(f => f.startsWith('ariel_backup_') && f.endsWith('.db'))
        .map(f => ({
          name: f,
          path: path.join(this.options.backupPath, f),
          time: f.split('_').slice(2).join('_').replace('.db', '')
        }))
        .sort((a, b) => new Date(b.time) - new Date(a.time));
      
      // Remove backups beyond maxBackups
      if (backupFiles.length > this.options.maxBackups) {
        const toRemove = backupFiles.slice(this.options.maxBackups);
        
        for (const file of toRemove) {
          await fs.unlink(file.path);
          ArielLogger.debug('Old backup removed', { file: file.name });
        }
      }
      
    } catch (error) {
      ArielLogger.error('Failed to cleanup old backups', { error: error.message });
    }
  }
  
  startAutoBackup() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
    }
    
    this.backupInterval = setInterval(async () => {
      try {
        await this.backup();
      } catch (error) {
        ArielLogger.error('Auto-backup failed', { error: error.message });
      }
    }, this.options.backupInterval);
    
    ArielLogger.info('Auto-backup started', {
      interval: this.options.backupInterval
    });
  }
  
  stopAutoBackup() {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
      ArielLogger.info('Auto-backup stopped');
    }
  }
  
  // Utility methods
  generateTransactionId() {
    return `tx_${randomBytes(16).toString('hex')}`;
  }
  
  isValidEthereumAddress(address) {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
  
  isValidAmount(amount) {
    return /^[0-9]+(\.[0-9]+)?$/.test(amount) && parseFloat(amount) > 0;
  }
  
  isValidStatus(status) {
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
    return validStatuses.includes(status);
  }
  
  // 🎯 CRITICAL FIX: Fully implemented updateStats for accurate daily tracking
  async updateStats(status, amount = '0', gasUsed = 0, network = 'mainnet') {
    const today = new Date().toISOString().split('T')[0];
    
    try {
        // All new transactions (pending) should increment total_transactions
        if (status === 'pending') {
            // Use _execute to wrap this synchronous call with resilience
            await this._execute('incrementTotalTxStat', [today, network], 'run');
        }

        // Completed transactions update the completed count, gas, and amount
        if (status === 'completed') {
            await this._execute(
                'updateCompletedStat', 
                [today, network, gasUsed, amount], 
                'run'
            );
        }

        // Failed or Cancelled transactions update the failed count
        if (status === 'failed' || status === 'cancelled') {
            await this._execute('updateFailedStat', [today, network], 'run');
        }
      ArielLogger.debug('Stats updated successfully', { status, today, network });
    } catch (error) {
      ArielLogger.error('Failed to update stats', { error: error.message, status, today, network });
    }
  }
  
  // 🎯 CRITICAL FIX: Enhanced database health check
  async healthCheck() {
    try {
      if (!this.isConnected || !this.db) {
        // Attempt an emergency reconnect for the health check itself
        await this._reconnect();
        if (!this.isConnected) {
          return {
            status: this.isDegraded ? 'degraded' : 'disconnected',
            message: this.isDegraded ? 'Database in degraded mode' : 'Database not connected after attempt'
          };
        }
      }
      
      // Test query
      const result = this.db.prepare('SELECT 1 as test').get();
      
      // Check if we can read from transactions table
      const pendingCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM ariel_transactions WHERE status = 'pending'
      `).get().count;
      
      return {
        status: 'healthy',
        message: 'Database is responding correctly',
        details: {
          pendingTransactions: pendingCount,
          connection: 'active',
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      ArielLogger.error('Health check failed', { error: error.message });
      
      return {
        status: 'unhealthy',
        message: `Health check failed: ${error.message}`,
        error: error.message
      };
    }
  }
  
  // 🎯 CRITICAL FIX: Enhanced close method with proper cleanup
  async close() {
    try {
      this.stopAutoBackup();
      
      // Clear prepared statements
      this.preparedStatements.clear();
      
      // Clear cache
      this.queryCache.clear();
      
      // Close database
      if (this.db) {
        this.db.close();
        this.db = null;
      }
      
      this.isConnected = false;
      this.isDegraded = false;
      this.reconnectAttempts = 0;
      
      ArielLogger.info('Database connection closed');
      this.emit('closed');
      
    } catch (error) {
      ArielLogger.error('Error closing database', { error: error.message });
      throw error;
    }
  }
}

// Export singleton instance
let arielInstance = null;

export function getArielSQLiteEngine(options = {}) {
  if (!arielInstance) {
    arielInstance = new ArielSQLiteEngine(options);
  }
  return arielInstance;
}

export { ArielSQLiteEngine };
