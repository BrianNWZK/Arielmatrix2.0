import axios from "axios";

export class CarbonNegativeConsensus {
  constructor(apiUrl = "https://api.carbon-offsets.io") {
    this.apiUrl = apiUrl;
  }

  async offsetTransaction(txId, amount) {
    try {
      await axios.post(`${this.apiUrl}/purchase`, {
        txId, credits: amount * 0.001, project: "GoldStandard"
      });
      return { txId, offset: amount * 0.001 };
    } catch (e) {
      return { txId, error: e.message };
    }
  }
}
