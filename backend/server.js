/**
 * Wallet Utility
 *
 * This utility provides the core functionality for all blockchain interactions.
 * It is a secure, server-side component and should never be exposed to the public.
 */

// =========================================================================
// 1. External Library Imports
// =========================================================================
import { ethers } from 'ethers';

// =========================================================================
// 2. Configuration & Initialization
// =========================================================================
// ⚠️ IMPORTANT: Configure your Ethereum RPC URL and Private Key here.
// These are sensitive credentials and should be kept secure.
const ETHEREUM_RPC_URL = 'YOUR_ETHEREUM_RPC_URL';
const OPERATIONAL_WALLET_PRIVATE_KEY = 'YOUR_OPERATIONAL_WALLET_PRIVATE_KEY';

const provider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);
const wallet = new ethers.Wallet(OPERATIONAL_WALLET_PRIVATE_KEY, provider);

// =========================================================================
// 3. Core Functions
// =========================================================================

/**
 * Retrieves the Ethers.js wallet instance.
 * @returns {ethers.Wallet} The wallet object.
 */
export function getWalletInstance() {
    return wallet;
}

/**
 * Retrieves the public address of the operational wallet.
 * @returns {Promise<string>} The wallet address.
 */
export async function getOperationalAddress() {
    return wallet.getAddress();
}

/**
 * Sends a transaction from the operational wallet to a destination.
 * @param {string} toAddress The recipient's address.
 * @param {string} amountEth The amount of ETH to send, as a string.
 * @returns {Promise<string>} The transaction hash.
 */
export async function sendTransaction(toAddress, amountEth) {
    const transaction = {
        to: toAddress,
        value: ethers.parseEther(amountEth)
    };
    const txResponse = await wallet.sendTransaction(transaction);
    return txResponse.hash;
}
