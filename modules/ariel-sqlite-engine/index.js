// modules/ariel-sqlite-engine/index.js
import { SQLite } from "../your-sqlite/index.js";

export class ArielSQLiteEngine {
  /**
   * @param {string} path - Path to the SQLite database file.
   */
  constructor(path = "./data/ariel.db") {
    this.path = path;
    this.db = null;
  }

  /**
   * Initialize the SQLite database connection.
   */
  async init() {
    try {
      this.db = await SQLite.createDatabase(this.path);
      console.log(`[ArielSQLiteEngine] Database initialized at ${this.path}`);
    } catch (err) {
      console.error("[ArielSQLiteEngine] Failed to initialize database:", err);
      throw err;
    }
  }

  /**
   * Ensure the database is initialized before executing queries.
   * @private
   */
  _ensureInitialized() {
    if (!this.db) {
      throw new Error(
        "[ArielSQLiteEngine] Database not initialized. Call init() first."
      );
    }
  }

  /**
   * Run a SQL statement (INSERT/UPDATE/DELETE).
   * @param {string} sql - SQL query string.
   * @param {Array} params - Query parameters.
   * @param {boolean} optimize - Whether to run through SQLite.optimizedQuery().
   */
  async run(sql, params = [], optimize = true) {
    this._ensureInitialized();
    try {
      const query = optimize ? SQLite.optimizedQuery(sql) : sql;
      return await this.db.run(query, params);
    } catch (err) {
      console.error("[ArielSQLiteEngine] Error running query:", err);
      throw err;
    }
  }

  /**
   * Get a single row from the database.
   */
  async get(sql, params = [], optimize = true) {
    this._ensureInitialized();
    try {
      const query = optimize ? SQLite.optimizedQuery(sql) : sql;
      return await this.db.get(query, params);
    } catch (err) {
      console.error("[ArielSQLiteEngine] Error fetching single row:", err);
      throw err;
    }
  }

  /**
   * Get all rows from the database.
   */
  async all(sql, params = [], optimize = true) {
    this._ensureInitialized();
    try {
      const query = optimize ? SQLite.optimizedQuery(sql) : sql;
      return await this.db.all(query, params);
    } catch (err) {
      console.error("[ArielSQLiteEngine] Error fetching rows:", err);
      throw err;
    }
  }
}
