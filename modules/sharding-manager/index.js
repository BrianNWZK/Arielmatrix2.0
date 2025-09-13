import { createHash } from "crypto";
import { Database } from "../ariel-sqlite-engine/index.js";

export class ShardingManager {
  constructor(shards = 4) {
    this.db = new Database();
    this.shards = Array.from({ length: shards }, (_, i) => `shard-${i}`);
  }

  async initialize() {
    await this.db.init();
    await this.db.run(`
      CREATE TABLE IF NOT EXISTS shard_stats (
        shard TEXT PRIMARY KEY,
        load INTEGER DEFAULT 0
      )
    `);
    for (const s of this.shards) {
      await this.db.run("INSERT OR IGNORE INTO shard_stats (shard) VALUES (?)", [s]);
    }
  }

  getShardForKey(key) {
    const h = createHash("sha256").update(key).digest("hex");
    return this.shards[parseInt(h.slice(0, 8), 16) % this.shards.length];
  }

  async incrementLoad(shard) {
    await this.db.run("UPDATE shard_stats SET load = load + 1 WHERE shard = ?", [shard]);
  }
}
