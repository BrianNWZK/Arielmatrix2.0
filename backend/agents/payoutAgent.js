/**
 * PayoutAgent.js
 *
 * This module is a live client-side agent. It sends API requests to the
 * centralized backend, ensuring that new payouts are added to the
 * persistent SQLite queue. This is a critical component for a distributed,
 * production-ready system.
 */

// The base URL of our new local Express server.
const API_BASE_URL = 'http://localhost:3000';

class PayoutAgent {
  constructor() {
    console.log("Payout Agent initialized for API calls.");
  }

  /**
   * Submits a single payout request to the backend API.
   * @param {string} recipientAddress - The recipient's public address.
   * @param {number} amount - The amount to be paid.
   */
  async submitPayoutRequest(recipientAddress, amount) {
    try {
      console.log(`Submitting new payout request: ${amount} to ${recipientAddress}`);
      const response = await fetch(`${API_BASE_URL}/payouts/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipient: recipientAddress, amount }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log(`Response from API:`, data.message);
      return data;
    } catch (error) {
      console.error('Error submitting payout request:', error);
      return { status: 'error', message: 'Failed to submit request.' };
    }
  }

  /**
   * Simulates a continuous stream of payout requests to the backend.
   * @param {number} intervalMs - The interval in milliseconds between adding new requests.
   */
  start(intervalMs = 3000) { // Default to 3 seconds
    console.log(`Payout Agent started, submitting new requests every ${intervalMs / 1000} seconds.`);
    setInterval(() => {
      // Simulate new payout requests from a client service.
      const recipient1 = "recipient-address-1";
      const recipient2 = "recipient-address-2";
      const amount1 = Math.random() * 10;
      const amount2 = Math.random() * 5;

      this.submitPayoutRequest(recipient1, amount1);
      this.submitPayoutRequest(recipient2, amount2);
    }, intervalMs);
  }
}

// Example usage to start the agent:
const agent = new PayoutAgent();
agent.start();
