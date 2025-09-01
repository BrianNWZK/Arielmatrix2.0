/**
 * wallet.js
 *
 * This utility module is a core component of the Bwaezi centralized backend.
 * It is responsible for all blockchain-related operations, particularly
 * creating and sending signed transactions.
 *
 * This module is kept separate from the main server file to isolate
 * all blockchain-specific logic and ensure the security of the private key.
 *
 * Dependencies:
 * - ethers: A comprehensive library for interacting with the Ethereum blockchain.
 */

// =========================================================================
// 1. External Library Import
// =========================================================================
import { ethers } from 'ethers';

// =========================================================================
// 2. Configuration and Initialization
// =========================================================================
// IMPORTANT: For production, this private key must be loaded securely from
// environment variables or a key management system. DO NOT hardcode it.
const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bac478c1b86e00194458f33878b6638";

// Connect to a local Ethereum network (like Hardhat or Ganache).
const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');

// Create a wallet instance from the private key and connect it to the provider.
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

console.log(`Wallet initialized with address: ${wallet.address}`);

// =========================================================================
// 3. Core Functionality
// =========================================================================

/**
 * Sends a blockchain transaction from the centralized wallet to a recipient.
 * This function is called by the job processor in `CentralizedBwaeziBackend.js`.
 *
 * @param {string} recipientAddress - The public address of the recipient.
 * @param {string} amount - The amount of Ether to send, as a string.
 * @returns {Promise<ethers.providers.TransactionResponse>} The transaction response object.
 */
export async function sendTransaction(recipientAddress, amount) {
  try {
    // Log the details of the transaction being prepared.
    console.log(`[WALLET] Preparing to send ${amount} ETH to ${recipientAddress}`);

    // Create the transaction object.
    const transaction = {
      to: recipientAddress,
      value: ethers.parseEther(amount), // Convert the amount to a BigInt in wei.
    };

    // Sign and send the transaction. The wallet automatically handles the nonce
    // and gas estimation.
    const txResponse = await wallet.sendTransaction(transaction);

    console.log(`[WALLET] Transaction sent. Transaction hash: ${txResponse.hash}`);
    return txResponse;

  } catch (error) {
    console.error('[WALLET] Failed to send transaction:', error);
    // Rethrow the error so the calling function can handle it.
    throw error;
  }
}
