import { AIThreatDetector } from "../ai-threat-detector/index.js";
import { QuantumShield } from "../quantum-shield/index.js";
import { Database } from "../ariel-sqlite-engine/index.js";

export class AISecurityModule {
  constructor() {
    this.detector = new AIThreatDetector();
    this.quantumShield = new QuantumShield();
    this.db = new Database();
  }

  async initialize() {
    await this.detector.initialize();
    await this.quantumShield.initialize();
    await this.db.init();

    await this.db.run(`
      CREATE TABLE IF NOT EXISTS security_incidents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT, severity TEXT, description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  async monitorSystem(logs, realTimeData = {}) {
    const threats = await this.detector.detectAnomalies(logs, realTimeData);
    for (const t of threats) {
      await this.db.run(
        "INSERT INTO security_incidents (type, severity, description) VALUES (?, ?, ?)",
        [t.type, "high", t.log || JSON.stringify(t)]
      );
    }
    return threats;
  }
}
