import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

// The connection to the Solana network (e.g., devnet, testnet, or mainnet).
// We'll use the URL from your .env file for flexibility.
const connection = new Connection(process.env.SOLANA_PROVIDER_URL, 'confirmed');

/**
 * Retrieves the SOL balance of a Solana address.
 * @param {string} publicKey The public key of the Solana wallet.
 * @returns {Promise<number>} The SOL balance as a number.
 */
export async function getSolanaBalance(publicKey) {
  try {
    const pubKey = new PublicKey(publicKey);
    const balanceInLamports = await connection.getBalance(pubKey);
    const balanceInSol = balanceInLamports / LAMPORTS_PER_SOL;
    return balanceInSol;
  } catch (error) {
    console.error(`Error fetching Solana balance for ${publicKey}:`, error);
    return 0;
  }
}
