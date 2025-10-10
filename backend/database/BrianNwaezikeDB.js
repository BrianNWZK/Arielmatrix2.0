// backend/database/BrianNwaezikeDB.js - PRODUCTION READY v4.3 - FIXED
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Global database instance cache
const databaseInstances = new Map();

// 🏆 CRITICAL FIX: Enhanced database initialization with proper error handling
async function initializeDatabase(databasePath = './data/brian_nwaezike.db') {
  try {
    // Ensure data directory exists
    const dir = path.dirname(databasePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Check if we already have an instance for this path
    if (databaseInstances.has(databasePath)) {
      const existingInstance = databaseInstances.get(databasePath);
      if (existingInstance && existingInstance.db) {
        console.log(`✅ Using existing database instance for: ${databasePath}`);
        return existingInstance;
      }
    }

    console.log(`🗄️ Initializing database: ${databasePath}`);

    // Open database connection with enhanced configuration
    const db = await open({
      filename: databasePath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE | sqlite3.OPEN_FULLMUTEX
    });

    // Enable foreign keys and other pragmas
    await db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;
      PRAGMA busy_timeout = 5000;
      PRAGMA temp_store = memory;
    `);

    // Create core tables with enhanced schema
    const tables = [
      // Users table
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT,
        last_name TEXT,
        phone_number TEXT,
        date_of_birth DATE,
        country TEXT DEFAULT 'United States',
        timezone TEXT DEFAULT 'UTC',
        profile_picture_url TEXT,
        bio TEXT,
        website_url TEXT,
        social_media_links JSON,
        email_verified BOOLEAN DEFAULT FALSE,
        phone_verified BOOLEAN DEFAULT FALSE,
        two_factor_enabled BOOLEAN DEFAULT FALSE,
        account_status TEXT DEFAULT 'active' CHECK(account_status IN ('active', 'suspended', 'deactivated', 'pending')),
        subscription_tier TEXT DEFAULT 'free' CHECK(subscription_tier IN ('free', 'premium', 'enterprise')),
        last_login DATETIME,
        login_attempts INTEGER DEFAULT 0,
        lock_until DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )`,

      // User sessions table
      `CREATE TABLE IF NOT EXISTS user_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        session_token TEXT UNIQUE NOT NULL,
        refresh_token TEXT UNIQUE NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        device_info JSON,
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        revoked_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,

      // User preferences table
      `CREATE TABLE IF NOT EXISTS user_preferences (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL UNIQUE,
        theme TEXT DEFAULT 'light' CHECK(theme IN ('light', 'dark', 'auto')),
        language TEXT DEFAULT 'en',
        currency TEXT DEFAULT 'USD',
        notifications_enabled BOOLEAN DEFAULT TRUE,
        email_notifications BOOLEAN DEFAULT TRUE,
        push_notifications BOOLEAN DEFAULT TRUE,
        sms_notifications BOOLEAN DEFAULT FALSE,
        marketing_emails BOOLEAN DEFAULT FALSE,
        data_sharing BOOLEAN DEFAULT FALSE,
        privacy_level TEXT DEFAULT 'standard' CHECK(privacy_level IN ('minimal', 'standard', 'strict')),
        auto_backup_enabled BOOLEAN DEFAULT TRUE,
        backup_frequency TEXT DEFAULT 'weekly' CHECK(backup_frequency IN ('daily', 'weekly', 'monthly')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,

      // Blockchain transactions table
      `CREATE TABLE IF NOT EXISTS blockchain_transactions (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        transaction_hash TEXT UNIQUE NOT NULL,
        from_address TEXT NOT NULL,
        to_address TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL,
        network TEXT NOT NULL CHECK(network IN ('solana', 'ethereum', 'bitcoin', 'bsc', 'polygon')),
        transaction_type TEXT NOT NULL CHECK(transaction_type IN ('transfer', 'swap', 'stake', 'unstake', 'reward', 'fee')),
        status TEXT NOT NULL CHECK(status IN ('pending', 'confirmed', 'failed', 'cancelled')),
        block_number INTEGER,
        gas_used INTEGER,
        gas_price REAL,
        transaction_fee REAL,
        confirmation_count INTEGER DEFAULT 0,
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        confirmed_at DATETIME,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )`,

      // Wallet addresses table
      `CREATE TABLE IF NOT EXISTS wallet_addresses (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        address TEXT NOT NULL,
        network TEXT NOT NULL CHECK(network IN ('solana', 'ethereum', 'bitcoin', 'bsc', 'polygon')),
        wallet_type TEXT DEFAULT 'hot' CHECK(wallet_type IN ('hot', 'cold', 'multisig')),
        label TEXT,
        is_default BOOLEAN DEFAULT FALSE,
        balance REAL DEFAULT 0,
        balance_updated_at DATETIME,
        public_key TEXT,
        private_key_encrypted TEXT,
        derivation_path TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        UNIQUE(user_id, network, address)
      )`,

      // AI models table
      `CREATE TABLE IF NOT EXISTS ai_models (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        version TEXT NOT NULL,
        model_type TEXT NOT NULL CHECK(model_type IN ('text', 'image', 'audio', 'video', 'multimodal')),
        provider TEXT NOT NULL CHECK(provider IN ('openai', 'anthropic', 'google', 'meta', 'stability', 'midjourney', 'custom')),
        description TEXT,
        parameters JSON,
        capabilities JSON,
        cost_per_token REAL,
        cost_per_image REAL,
        rate_limit INTEGER,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`,

      // AI conversations table
      `CREATE TABLE IF NOT EXISTS ai_conversations (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        model_id TEXT NOT NULL,
        system_prompt TEXT,
        parameters JSON,
        message_count INTEGER DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        is_archived BOOLEAN DEFAULT FALSE,
        last_message_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
        FOREIGN KEY (model_id) REFERENCES ai_models (id) ON DELETE RESTRICT
      )`,

      // AI messages table
      `CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('system', 'user', 'assistant', 'function')),
        content TEXT NOT NULL,
        tokens INTEGER,
        cost REAL,
        metadata JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (conversation_id) REFERENCES ai_conversations (id) ON DELETE CASCADE
      )`,

      // API keys table
      `CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        key_hash TEXT UNIQUE NOT NULL,
        scopes JSON NOT NULL,
        rate_limit INTEGER DEFAULT 1000,
        requests_count INTEGER DEFAULT 0,
        last_used DATETIME,
        expires_at DATETIME,
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`,

      // Audit logs table
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        resource_type TEXT NOT NULL,
        resource_id TEXT,
        ip_address TEXT,
        user_agent TEXT,
        old_values JSON,
        new_values JSON,
        status TEXT CHECK(status IN ('success', 'failure')),
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
      )`,

      // System settings table
      `CREATE TABLE IF NOT EXISTS system_settings (
        id TEXT PRIMARY KEY,
        setting_key TEXT UNIQUE NOT NULL,
        setting_value TEXT NOT NULL,
        data_type TEXT CHECK(data_type IN ('string', 'number', 'boolean', 'json', 'array')),
        description TEXT,
        is_public BOOLEAN DEFAULT FALSE,
        updated_by TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`
    ];

    // Execute table creation with transaction
    await db.exec('BEGIN TRANSACTION');
    try {
      for (const tableSql of tables) {
        await db.exec(tableSql);
      }
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }

    // Create indexes for performance
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
      'CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)',
      'CREATE INDEX IF NOT EXISTS idx_users_account_status ON users(account_status)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON user_sessions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(session_token)',
      'CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON blockchain_transactions(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_hash ON blockchain_transactions(transaction_hash)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_status ON blockchain_transactions(status)',
      'CREATE INDEX IF NOT EXISTS idx_transactions_created ON blockchain_transactions(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallet_addresses(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_wallets_network ON wallet_addresses(network)',
      'CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON ai_conversations(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON ai_messages(conversation_id)',
      'CREATE INDEX IF NOT EXISTS idx_messages_created ON ai_messages(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at)'
    ];

    for (const indexSql of indexes) {
      await db.exec(indexSql);
    }

    // Insert default system settings
    const defaultSettings = [
      ['system_name', 'Brian Nwaezike Platform', 'string', 'The name of the system/platform'],
      ['system_version', '4.3.0', 'string', 'Current system version'],
      ['maintenance_mode', 'false', 'boolean', 'Whether the system is in maintenance mode'],
      ['registration_enabled', 'true', 'boolean', 'Whether new user registration is enabled'],
      ['max_file_size', '104857600', 'number', 'Maximum file upload size in bytes'],
      ['supported_currencies', '["USD", "EUR", "GBP", "JPY", "CAD", "AUD", "CHF", "CNY", "INR", "BRL", "RUB", "NGN"]', 'json', 'Supported currencies'],
      ['default_currency', 'USD', 'string', 'Default currency for the system'],
      ['rate_limit_per_minute', '1000', 'number', 'Default rate limit per minute per user'],
      ['session_timeout_minutes', '43200', 'number', 'Session timeout in minutes (30 days)'],
      ['backup_enabled', 'true', 'boolean', 'Whether automatic backups are enabled'],
      ['backup_schedule', '0 2 * * *', 'string', 'Cron schedule for automatic backups']
    ];

    await db.exec('BEGIN TRANSACTION');
    try {
      for (const [key, value, dataType, description] of defaultSettings) {
        await db.run(
          `INSERT OR REPLACE INTO system_settings (setting_key, setting_value, data_type, description, updated_by) 
           VALUES (?, ?, ?, ?, ?)`,
          [key, value, dataType, description, 'system']
        );
      }
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }

    // Create database instance wrapper
    const databaseInstance = {
      db,
      
      // Enhanced query methods
      async run(sql, params = []) {
        try {
          const result = await db.run(sql, params);
          return result;
        } catch (error) {
          console.error('Database run error:', error);
          throw error;
        }
      },

      async get(sql, params = []) {
        try {
          const result = await db.get(sql, params);
          return result;
        } catch (error) {
          console.error('Database get error:', error);
          throw error;
        }
      },

      async all(sql, params = []) {
        try {
          const result = await db.all(sql, params);
          return result;
        } catch (error) {
          console.error('Database all error:', error);
          throw error;
        }
      },

      async exec(sql) {
        try {
          await db.exec(sql);
        } catch (error) {
          console.error('Database exec error:', error);
          throw error;
        }
      },

      // Transaction helper
      async transaction(callback) {
        await db.exec('BEGIN TRANSACTION');
        try {
          const result = await callback();
          await db.exec('COMMIT');
          return result;
        } catch (error) {
          await db.exec('ROLLBACK');
          throw error;
        }
      },

      // Close connection
      async close() {
        try {
          await db.close();
          databaseInstances.delete(databasePath);
          console.log(`✅ Database connection closed: ${databasePath}`);
        } catch (error) {
          console.error('Error closing database:', error);
          throw error;
        }
      },

      // Health check
      async healthCheck() {
        try {
          const result = await db.get('SELECT 1 as health_check');
          return result.health_check === 1;
        } catch (error) {
          console.error('Database health check failed:', error);
          return false;
        }
      },

      // Backup database
      async backup(backupPath) {
        try {
          await db.exec(`VACUUM INTO ?`, [backupPath]);
          return true;
        } catch (error) {
          console.error('Database backup failed:', error);
          return false;
        }
      }
    };

    // Cache the instance
    databaseInstances.set(databasePath, databaseInstance);

    console.log(`✅ Database initialized successfully: ${databasePath}`);
    return databaseInstance;

  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

// 🏆 CRITICAL FIX: Enhanced getDatabase function with proper initialization
async function getDatabase(databasePath = './data/brian_nwaezike.db') {
  if (databaseInstances.has(databasePath)) {
    const instance = databaseInstances.get(databasePath);
    if (instance && await instance.healthCheck()) {
      return instance;
    } else {
      databaseInstances.delete(databasePath);
    }
  }
  
  return await initializeDatabase(databasePath);
}

// Create database function (alias for initializeDatabase)
async function createDatabase(databasePath = './data/brian_nwaezike.db') {
  return await initializeDatabase(databasePath);
}

// BrianNwaezikeDB class for backward compatibility
class BrianNwaezikeDB {
  constructor(databasePath = './data/brian_nwaezike.db') {
    this.databasePath = databasePath;
    this.db = null;
  }

  async init() {
    this.db = await initializeDatabase(this.databasePath);
    return this;
  }

  async run(sql, params = []) {
    if (!this.db) await this.init();
    return this.db.run(sql, params);
  }

  async get(sql, params = []) {
    if (!this.db) await this.init();
    return this.db.get(sql, params);
  }

  async all(sql, params = []) {
    if (!this.db) await this.init();
    return this.db.all(sql, params);
  }

  async exec(sql) {
    if (!this.db) await this.init();
    return this.db.exec(sql);
  }

  async close() {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }
}

// Export functions and class
export {
  initializeDatabase,
  getDatabase,
  createDatabase,
  BrianNwaezikeDB,
  databaseInstances
};

export default BrianNwaezikeDB;
