import sqlite3 from "sqlite3";
import { open } from "sqlite";

export class yourSQLite {
  static async createDatabase(path) {
    return open({ filename: path, driver: sqlite3.Database });
  }

  static optimizedQuery(sql) {
    return sql.replace(/\s+/g, " ").trim();
  }
}
