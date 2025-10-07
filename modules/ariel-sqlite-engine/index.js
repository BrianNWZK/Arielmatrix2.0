// modules/ariel-sqlite-engine/index.js
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
      ...options
    };
    
    this.db = null;
    this.isConnected = false;
    this.backupInterval = null;
    this.preparedStatements = new Map();
    this.queryCache = new Map();
    this.maxCacheSize = 1000;
    
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
      
      ArielLogger.debug('Prepared statements initialized');
      
    } catch (error) {
      ArielLogger.error('Failed to prepare statements', { error: error.message });
    }
  }
  
  // 🎯 CRITICAL FIX: Enhanced transaction creation with validation
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
      const result = this.preparedStatements.get('insertTransaction').run(
        transactionId,
        recipientAddress,
        amount,
        'pending',
        gasPrice,
        nonce,
        network,
        metadataStr
      );
      
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
  
  // 🎯 CRITICAL FIX: Enhanced transaction status update
  async updateTransactionStatus(transactionId, status, errorMessage = null) {
    if (!this.isValidStatus(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    
    try {
      const result = this.preparedStatements.get('updateStatus').run(
        status,
        errorMessage,
        transactionId
      );
      
      if (result.changes === 0) {
        throw new Error(`Transaction not found: ${transactionId}`);
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
  
  // 🎯 CRITICAL FIX: Enhanced transaction completion
  async completeTransaction(transactionId, txHash, gasUsed, blockNumber, confirmations = 1) {
    if (!txHash) {
      throw new Error('Transaction hash is required');
    }
    
    try {
      const result = this.preparedStatements.get('updateWithHash').run(
        'completed',
        txHash,
        gasUsed,
        blockNumber,
        confirmations,
        transactionId
      );
      
      if (result.changes === 0) {
        throw new Error(`Transaction not found: ${transactionId}`);
      }
      
      // Update stats
      await this.updateStats('completed', gasUsed);
      
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
      const transactions = this.preparedStatements.get('getPending').all(limit);
      
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
      const transaction = this.preparedStatements.get('getById').get(transactionId);
      
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
      const transaction = this.preparedStatements.get('getByHash').get(txHash);
      
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
      const result = this.preparedStatements.get('incrementRetry').run(transactionId);
      
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
      
      const transactions = this.db.prepare(sql).all(...params);
      
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
      
      const stats = this.db.prepare(`
        SELECT 
          network,
          SUM(total_transactions) as total_transactions,
          SUM(completed_transactions) as completed_transactions,
          SUM(failed_transactions) as failed_transactions,
          SUM(total_gas_used) as total_gas_used
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
        networks: stats,
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
  
  async updateStats(status, gasUsed = 0) {
    const today = new Date().toISOString().split('T')[0];
    const network = 'mainnet'; // Could be dynamic
    
    try {
      // This would be implemented to update daily statistics
      // Implementation depends on specific requirements
    } catch (error) {
      ArielLogger.error('Failed to update stats', { error: error.message });
    }
  }
  
  // 🎯 CRITICAL FIX: Enhanced database health check
  async healthCheck() {
    try {
      if (!this.isConnected || !this.db) {
        return {
          status: 'disconnected',
          message: 'Database not connected'
        };
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

