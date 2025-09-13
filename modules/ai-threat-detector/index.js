import { Database } from "../ariel-sqlite-engine/index.js";
import { QuantumShield } from "../quantum-shield/index.js";
import * as tf from "@tensorflow/tfjs-node";

export class AIThreatDetector {
  constructor() {
    this.db = new Database();
    this.quantumShield = new QuantumShield();
    this.model = null;
    this.isTraining = false;
  }

  async initialize() {
    await this.db.init();
    await this.quantumShield.initialize();
    await this.loadModel();
  }

  async loadModel() {
    try {
      this.model = await tf.loadLayersModel(
        "file://./models/threat-detection/model.json"
      );
    } catch {
      console.log("⚠️ No pre-trained model found, fallback to rule-based.");
      this.model = null;
    }
  }

  extractFeatures(log) {
    const features = [];
    features.push(log.length / 500);
    const keywords = ["error", "attack", "unauthorized", "violation"];
    keywords.forEach((k) => features.push(log.toLowerCase().includes(k) ? 1 : 0));
    return features;
  }

  async detectAnomalies(logs, realTimeData = {}) {
    const anomalies = [];

    for (const log of logs) {
      const features = this.extractFeatures(log);

      let score = 0;
      if (this.model) {
        const tensor = tf.tensor2d([features]);
        const prediction = this.model.predict(tensor);
        score = prediction.arraySync()[0][0];
      } else {
        score = features.reduce((a, b) => a + b, 0) / features.length;
      }

      if (score > 0.8) {
        anomalies.push({ log, score, type: "ai_detected_threat" });
        await this.quantumShield.logSecurityEvent(
          "ai_threat_detected",
          "high",
          log.slice(0, 120)
        );
      }
    }

    if (realTimeData.transactionCount > 100) {
      anomalies.push({ type: "high_frequency_ops", count: realTimeData.transactionCount });
    }

    return anomalies;
  }
}
