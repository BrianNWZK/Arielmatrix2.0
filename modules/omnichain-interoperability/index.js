import { CrossChainBridge } from "../cross-chain-bridge/index.js";
import { Database } from "../ariel-sqlite-engine/index.js";

export class OmnichainInterop {
  constructor() {
    this.bridge = new CrossChainBridge();
    this.db = new Database();
  }

  async initialize(chainConfigs) {
    await this.bridge.initialize(chainConfigs);
    await this.db.init();

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS interop_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT, source TEXT, target TEXT, status TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async swapAssets(source, target, amount, token, sender, receiver) {
    const result = await this.bridge.bridgeAssets(
      source,
      target,
      amount,
      token,
      sender,
      receiver
    );
    await this.db.run(
      "INSERT INTO interop_logs (type, source, target, status) VALUES (?, ?, ?, ?)",
      ["swap", source, target, "completed"]
    );
    return result;
  }
}
