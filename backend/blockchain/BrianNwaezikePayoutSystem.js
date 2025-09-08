/**
 * BrianNwaezikePayoutSystem.js
 *
 * This module is a core backend service that manages and processes automated payouts
 * for the Bwaezi Chain. It is designed to handle high-frequency micropayments efficiently
 * by batching multiple payout requests into single blockchain transactions.
 *
 * Core Principles:
 * - Zero-Cost: All payouts are fee-less, leveraging the Bwaezi protocol's architecture.
 * - Scalability: It batches transactions to minimize blockchain load and ensure high throughput.
 * - Automation: It operates as an independent service, enabling fully automated payment cycles.
 */

import Transaction from '../../Transaction.js';

class BrianNwaezikePayoutSystem {
  /**
   * Constructs the Payout System.
   * @param {object} chainInstance - The main Bwaezi Chain instance.
   * @param {object} systemWallet - The wallet object for the payout system, used for signing transactions.
   */
  constructor(chainInstance, systemWallet) {
    if (!chainInstance) {
      throw new Error("PayoutSystem requires a Bwaezi Chain instance.");
    }
    if (!systemWallet || !systemWallet.getPrivateKey()) {
      throw new Error("PayoutSystem requires a valid system wallet.");
    }

    this.chain = chainInstance;
    this.systemWallet = systemWallet;
    // In a production environment, this would be a persistent database (e.g., Firestore).
    // An in-memory array is used here for demonstration purposes.
    this.payoutRequests = [];
    console.log("Brian Nwaezike Payout System initialized.");
  }

  /**
   * Adds a new payout request to the queue.
   * @param {string} recipientAddress - The recipient's public address.
   * @param {number} amount - The amount to be paid.
   * @returns {void}
   */
  addPayoutRequest(recipientAddress, amount) {
    console.log(`- New payout request added: ${amount} $BWAEZI to ${recipientAddress}`);
    this.payoutRequests.push({ recipientAddress, amount });
  }

  /**
   * Processes all pending payout requests by creating, signing, and submitting
   * a single transaction that bundles all individual payments.
   *
   * @returns {Promise<boolean>} Resolves to true if the transaction was successfully
   * submitted to the chain, false otherwise.
   */
  async processPayouts() {
    if (this.payoutRequests.length === 0) {
      console.log('No pending payouts to process.');
      return false;
    }

    console.log("\n--- Processing Payout Cycle ---");
    console.log(`Processing a batch of ${this.payoutRequests.length} payouts.`);

    // Note: The Bwaezi whitepaper describes feeless transactions, so we create a
    // single transaction that encapsulates multiple "payouts" by adding a custom
    // 'payouts' property.
    const payoutData = this.payoutRequests.map(req => ({
      to: req.recipientAddress,
      amount: req.amount,
    }));

    // For a real system, you would sum the amounts for a single transaction.
    // For this simulation, we will create multiple transactions for clarity.
    for (const payout of this.payoutRequests) {
      const transaction = new Transaction(
        this.systemWallet.getPublicKey(),
        payout.recipientAddress,
        payout.amount
      );
      // Sign the transaction with the system's private key.
      transaction.signTransaction(this.systemWallet.getPrivateKey());

      // Add the signed transaction to the main blockchain's pending pool.
      await this.chain.addTransaction(transaction);
    }

    // Clear the queue after processing.
    this.payoutRequests = [];
    console.log("Payouts submitted successfully. Queue cleared.");
    return true;
  }

  /**
   * Initializes a recurring payout cycle. In a production environment, this
   * would be managed by a cron job or scheduler.
   * @param {number} intervalMs - The interval in milliseconds to process payouts.
   */
  startPayoutCycle(intervalMs = 60000) { // Default to 1 minute
    console.log(`Payout System started, processing every ${intervalMs / 1000} seconds.`);
    setInterval(() => this.processPayouts(), intervalMs);
  }
}

export default BrianNwaezikePayoutSystem;
