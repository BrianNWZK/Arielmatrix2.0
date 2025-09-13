// modules/your-sqlite/index.js
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export class SQLite {
  /**
   * Create and initialize a SQLite database connection.
   * @param {string} path - Path to the SQLite database file.
   * @param {object} [options] - Optional settings (e.g., { log: true }).
   */
  static async createDatabase(path, options = {}) {
    try {
      const db = await open({
        filename: path,
        driver: sqlite3.Database
      });

      // Apply performance-related PRAGMAs
      await db.exec("PRAGMA journal_mode = WAL;");
      await db.exec("PRAGMA synchronous = NORMAL;");
      await db.exec("PRAGMA foreign_keys = ON;");

      if (options.log) {
        console.log(`[SQLite] Database opened at ${path}`);
      }

      return db;
    } catch (err) {
      console.error(`[SQLite] Failed to open database at ${path}:`, err);
      throw err;
    }
  }

  /**
   * Optimize a SQL query string by normalizing whitespace.
   * @param {string} sql - The SQL query string.
   * @returns {string} Optimized SQL query.
   */
  static optimizedQuery(sql) {
    if (typeof sql !== "string" || !sql.trim()) {
      throw new Error("[SQLite] Invalid SQL query string.");
    }
    return sql.replace(/\s+/g, " ").trim();
  }
}
