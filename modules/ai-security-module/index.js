import { AIThreatDetector } from "../ai-threat-detector/index.js";

export class AISecurityModule {
  constructor() {
    this.detector = new AIThreatDetector();
  }

  monitorSystem(logs) {
    return this.detector.detectAnomalies(logs);
  }
}
