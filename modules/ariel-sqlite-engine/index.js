import { yourSQLite } from "../your-sqlite/index.js";

export class ArielSQLiteEngine {
  constructor(path = "./data/ariel.db") {
    this.path = path;
    this.db = null;
  }

  async init() {
    this.db = await yourSQLite.createDatabase(this.path);
  }

  async run(sql, params = []) {
    return this.db.run(yourSQLite.optimizedQuery(sql), params);
  }

  async get(sql, params = []) {
    return this.db.get(yourSQLite.optimizedQuery(sql), params);
  }

  async all(sql, params = []) {
    return this.db.all(yourSQLite.optimizedQuery(sql), params);
  }
}
