import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { promisify } from "util";
import { createLogger, format, transports } from "winston";
import { config } from "../../config/bwaezi-config.js";

// Initialize logger for enterprise-grade logging
const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.File({ filename: "logs/sqlite.log" }),
    new transports.Console()
  ]
});

// Constants for configuration
const DB_CONFIG = {
  maxConnections: config.sqlite?.maxConnections || 10,
  connectionTimeout: config.sqlite?.connectionTimeout || 30000,
  maxRetries: config.sqlite?.maxRetries || 3,
  retryDelay: config.sqlite?.retryDelay || 1000
};

/**
 * Enterprise-grade SQLite database manager with connection pooling and advanced features
 */
export class SQLiteManager {
  #pool = new Map();
  #activeConnections = 0;

  /**
   * Initialize SQLiteManager with configuration
   * @param {string} path - Path to SQLite database file
   * @param {object} options - Configuration options
   */
  constructor(path, options = {}) {
    this.path = path;
    this.options = {
      log: true,
      readOnly: false,
      ...options
    };
    this.initialized = false;
  }

  /**
   * Initialize database connection pool
   */
  async initialize() {
    try {
      await this.#createConnectionPool();
      await this.#applyDatabasePragmas();
      this.initialized = true;
      logger.info(`SQLiteManager initialized for database at ${this.path}`);
    } catch (err) {
      logger.error(`Failed to initialize SQLiteManager: ${err.message}`);
      throw new Error(`Database initialization failed: ${err.message}`);
    }
  }

  /**
   * Create connection pool with retry mechanism
   */
  async #createConnectionPool() {
    let attempts = 0;
    while (attempts < DB_CONFIG.maxRetries) {
      try {
        for (let i = 0; i < DB_CONFIG.maxConnections; i++) {
          const db = await open({
            filename: this.path,
            driver: sqlite3.Database,
            mode: this.options.readOnly ? sqlite3.OPEN_READONLY : (sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE)
          });
          this.#pool.set(i, db);
        }
        return;
      } catch (err) {
        attempts++;
        if (attempts === DB_CONFIG.maxRetries) {
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, DB_CONFIG.retryDelay));
      }
    }
  }

  /**
   * Apply performance and security PRAGMAs
   */
  async #applyDatabasePragmas() {
    const db = await this.#getConnection();
    try {
      await db.exec(`
        PRAGMA journal_mode = WAL;
        PRAGMA synchronous = NORMAL;
        PRAGMA foreign_keys = ON;
        PRAGMA secure_delete = ON;
        PRAGMA auto_vacuum = INCREMENTAL;
      `);
      await this.#releaseConnection(db);
    } catch (err) {
      await this.#releaseConnection(db);
      throw err;
    }
  }

  /**
   * Get available connection from pool
   */
  async #getConnection() {
    if (this.#activeConnections >= DB_CONFIG.maxConnections) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return this.#getConnection();
    }

    for (const [id, db] of this.#pool) {
      if (!db.inUse) {
        db.inUse = true;
        this.#activeConnections++;
        return db;
      }
    }

    throw new Error("No available database connections");
  }

  /**
   * Release connection back to pool
   */
  async #releaseConnection(db) {
    db.inUse = false;
    this.#activeConnections--;
  }

  /**
   * Execute a SQL query with transaction support
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @returns {Promise<any>} Query results
   */
  async query(sql, params = []) {
    if (!this.initialized) await this.initialize();
    
    const optimizedSql = this.#optimizeQuery(sql);
    const db = await this.#getConnection();
    
    try {
      const result = await db.all(optimizedSql, params);
      logger.info(`Query executed: ${optimizedSql}`);
      await this.#releaseConnection(db);
      return result;
    } catch (err) {
      logger.error(`Query failed: ${optimizedSql} - ${err.message}`);
      await this.#releaseConnection(db);
      throw err;
    }
  }

  /**
   * Execute transaction with multiple queries
   * @param {Array<{sql: string, params: Array}>} queries - Array of queries
   * @returns {Promise<void>}
   */
  async transaction(queries) {
    if (!this.initialized) await this.initialize();
    
    const db = await this.#getConnection();
    try {
      await db.exec("BEGIN TRANSACTION");
      for (const { sql, params } of queries) {
        const optimizedSql = this.#optimizeQuery(sql);
        await db.run(optimizedSql, params);
        logger.info(`Transaction query: ${optimizedSql}`);
      }
      await db.exec("COMMIT");
      logger.info("Transaction committed successfully");
    } catch (err) {
      await db.exec("ROLLBACK");
      logger.error(`Transaction failed: ${err.message}`);
      throw err;
    } finally {
      await this.#releaseConnection(db);
    }
  }

  /**
   * Optimize SQL query
   * @param {string} sql - SQL query
   * @returns {string} Optimized SQL
   */
  #optimizeQuery(sql) {
    if (typeof sql !== "string" || !sql.trim()) {
      throw new Error("Invalid SQL query string");
    }
    return sql.replace(/\s+/g, " ").trim();
  }

  /**
   * Close all database connections
   */
  async close() {
    for (const [id, db] of this.#pool) {
      try {
        await db.close();
        this.#pool.delete(id);
      } catch (err) {
        logger.error(`Failed to close connection ${id}: ${err.message}`);
      }
    }
    this.#activeConnections = 0;
    this.initialized = false;
    logger.info("All database connections closed");
  }

  /**
   * Get database statistics
   * @returns {object} Database statistics
   */
  async getStats() {
    return {
      activeConnections: this.#activeConnections,
      totalConnections: this.#pool.size,
      initialized: this.initialized,
      path: this.path
    };
  }
}

/**
 * Initialize database schema for Bwaezi system
 * @param {SQLiteManager} dbManager - Database manager instance
 */
export async function initializeSchema(dbManager) {
  try {
    await dbManager.transaction([
      {
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            address TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `,
        params: []
      },
      {
        sql: `
          CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            amount REAL NOT NULL,
            currency TEXT NOT NULL,
            tx_hash TEXT UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
          )
        `,
        params: []
      }
    ]);
    logger.info("Database schema initialized successfully");
  } catch (err) {
    logger.error(`Schema initialization failed: ${err.message}`);
    throw err;
  }
}
