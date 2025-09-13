export class AIThreatDetector {
  detectAnomalies(logs) {
    return logs.filter(l => l.includes("error") || l.includes("attack"));
  }
}
