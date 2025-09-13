import crypto from "crypto";

export class ShardingManager {
  constructor(shards = 4) {
    this.shards = Array.from({ length: shards }, (_, i) => `shard-${i}`);
    this.nodes = new Map();
  }

  assignNode(nodeId) {
    const shard = this.shards[this.nodes.size % this.shards.length];
    this.nodes.set(nodeId, shard);
  }

  getShardForKey(key) {
    const h = crypto.createHash("sha256").update(key).digest("hex");
    return this.shards[parseInt(h.slice(0, 8), 16) % this.shards.length];
  }
}
