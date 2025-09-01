/**
 * PayoutAgent.js
 *
 * This module simulates a microservice or an independent agent that generates
 * and submits payout requests to the BrianNwaezikePayoutSystem. This model
 * showcases a distributed, scalable architecture where various services
 * can seamlessly leverage the feeless payout infrastructure.
 */

// We import the main payout system to interact with it.
import BrianNwaezikePayoutSystem from '../blockchain/BrianNwaezikePayoutSystem.js';

class PayoutAgent {
  /**
   * @param {object} payoutSystemInstance - The instance of the BrianNwaezikePayoutSystem.
   */
  constructor(payoutSystemInstance) {
    if (!payoutSystemInstance) {
      throw new Error("PayoutAgent requires a PayoutSystem instance.");
    }
    this.payoutSystem = payoutSystemInstance;
    console.log("Payout Agent initialized.");
  }

  /**
   * Simulates a continuous stream of payout requests.
   * @param {number} intervalMs - The interval in milliseconds between adding new requests.
   */
  start(intervalMs = 5000) { // Default to 5 seconds
    console.log(`Payout Agent started, submitting new requests every ${intervalMs / 1000} seconds.`);
    setInterval(() => {
      // Simulate new payout requests from a client service.
      const recipient1 = "recipient-address-1";
      const recipient2 = "recipient-address-2";
      const amount1 = Math.random() * 10; // Random amount for a mock payout
      const amount2 = Math.random() * 5;

      this.payoutSystem.addPayoutRequest(recipient1, amount1);
      this.payoutSystem.addPayoutRequest(recipient2, amount2);

    }, intervalMs);
  }
}

export default PayoutAgent;
