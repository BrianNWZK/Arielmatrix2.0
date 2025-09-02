import { ethers } from 'ethers';
import dotenv from 'dotenv';

dotenv.config();

// USDT contract address on Ethereum Mainnet.
const USDT_CONTRACT_ADDRESS = '0xdAC17F958D2ee523a2206206994597C13D831ec7';

// The ABI for the ERC-20 standard, with just the functions we need.
const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)'
];

// Set up a provider to connect to the Ethereum network.
const provider = new ethers.JsonRpcProvider(process.env.ETH_PROVIDER_URL);

/**
 * Retrieves the USDT balance of a given Ethereum address.
 * @param {string} address The Ethereum address to check.
 * @returns {Promise<string>} The USDT balance as a string, formatted for display.
 */
export async function getUSDTBalance(address) {
  try {
    const contract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, provider);
    const balance = await contract.balanceOf(address);
    // USDT has 6 decimals, so we format accordingly.
    const formattedBalance = ethers.formatUnits(balance, 6);
    return formattedBalance;
  } catch (error) {
    console.error(`Error fetching USDT balance for ${address}:`, error);
    return '0.0';
  }
}

/**
 * Sends a specified amount of USDT to a recipient address.
 * Note: This requires the sender's private key and enough ETH for gas.
 * @param {string} toAddress The recipient's Ethereum address.
 * @param {string} amount The amount of USDT to send (as a decimal string).
 * @returns {Promise<ethers.providers.TransactionResponse | null>} The transaction response or null on error.
 */
export async function sendUSDT(toAddress, amount) {
  try {
    const wallet = new ethers.Wallet(process.env.ETH_PRIVATE_KEY, provider);
    const contract = new ethers.Contract(USDT_CONTRACT_ADDRESS, ERC20_ABI, wallet);
    const amountInWei = ethers.parseUnits(amount, 6);
    const tx = await contract.transfer(toAddress, amountInWei);
    await tx.wait(); // Wait for confirmation
    return tx;
  } catch (error) {
    console.error('Error sending USDT:', error);
    return null;
  }
}
