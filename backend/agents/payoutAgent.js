/**
 * PayoutAgent.js
 *
 * This module is a live client-side agent. It sends API requests to the
 * centralized backend, ensuring that new payouts are added to the
 * persistent SQLite queue. This is a critical component for a distributed,
 * production-ready system.
 */

// The base URL of our new local Express server.
const API_BASE_URL = 'http://localhost:1000';

class PayoutAgent {
  constructor() {
    console.log("Payout Agent initialized for API calls.");
    this.intervalId = null;
  }

  /**
   * Submits a single payout request to the backend API.
   * @param {string} recipientAddress - The recipient's public address.
   * @param {number} amount - The amount to be paid.
   * @param {string} currency - The cryptocurrency to use (e.g., 'USDT', 'SOL').
   */
  async submitPayoutRequest(recipientAddress, amount, currency) {
    try {
      console.log(`Submitting new payout request: ${amount} ${currency} to ${recipientAddress}`);
      const response = await fetch(`${API_BASE_URL}/payouts/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ recipient: recipientAddress, amount, currency }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Response from API:", data.message);
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
    if (this.intervalId) {
      console.log("Agent is already running.");
      return;
    }

    console.log(`Payout Agent started, submitting new requests every ${intervalMs / 1000} seconds.`);
    this.intervalId = setInterval(() => {
      // Simulate new payout requests from a client service.
      const mockRequests = [
        { recipient: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount: (Math.random() * 10).toFixed(4), currency: 'USDT' },
        { recipient: "0x3C44CdDdB6a900fa2b585dd299e03d120979392", amount: (Math.random() * 5).toFixed(4), currency: 'SOL' }
      ];

      mockRequests.forEach(request => {
        this.submitPayoutRequest(request.recipient, request.amount, request.currency);
      });

    }, intervalMs);
  }

  /**
   * Stops the continuous stream of payout requests.
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log("Payout Agent stopped.");
    }
  }
}

// Example usage to start the agent:
const agent = new PayoutAgent();
agent.start();
