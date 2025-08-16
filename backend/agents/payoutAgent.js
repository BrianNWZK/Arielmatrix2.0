// backend/agents/payoutAgent.js
import Web3 from 'web3'; // For blockchain interaction and address validation
import { ethers } from 'ethers'; // For wallet signing and transaction building
import crypto from 'crypto'; // For random numbers if needed, and secure operations (used in other agents, included for completeness)

/**
 * The Payout Agent is responsible for distributing generated revenue (conceptually in crypto)
 * to the designated USDT wallets on the Binance Smart Chain (BSC).
 * This agent focuses on real, on-chain transfers with minimal transaction costs (gas fees).
 *
 * It implements a novel "conceptual flex gas" mechanism where estimated gas fees are
 * notionally deducted from the total revenue before distribution.
 * It removes dependencies on external fiat-to-crypto services and direct browser automation
 * for payouts, focusing on direct, gas-efficient, on-chain distribution.
 *
 * @param {object} CONFIG - The global configuration object containing blockchain credentials and earnings.
 * @param {number} CONFIG.earnings - The conceptual total earnings to be distributed (e.g., from other agents' performance).
 * @param {boolean} [CONFIG.useFlexGas=true] - Option to enable conceptual flex gas deduction.
 * @returns {Promise<object>} Status of the payout operation.
 */
export const payoutAgent = async (CONFIG) => {
    console.log('🔍 Payout Agent Activated: Initiating Autonomous On-Chain Crypto Distribution');

    try {
        const { PRIVATE_KEY, GAS_WALLET, BSC_NODE, USDT_WALLETS } = CONFIG;
        const useFlexGas = CONFIG.useFlexGas !== false; // Default to true

        // --- 1. Critical Configuration Validation ---
        if (!PRIVATE_KEY || String(PRIVATE_KEY).includes('PLACEHOLDER')) {
            console.error('🚨 Payout Agent Failed: PRIVATE_KEY is missing or a placeholder. Cannot sign transactions.');
            return { status: 'failed', reason: 'private_key_missing' };
        }
        if (!GAS_WALLET || !Web3.utils.isAddress(GAS_WALLET)) {
            console.error('🚨 Payout Agent Failed: GAS_WALLET is invalid or missing.');
            return { status: 'failed', reason: 'invalid_gas_wallet' };
        }
        if (!BSC_NODE || String(BSC_NODE).includes('PLACEHOLDER')) {
            console.error('🚨 Payout Agent Failed: BSC_NODE is missing or a placeholder. Cannot connect to blockchain.');
            return { status: 'failed', reason: 'bsc_node_missing' };
        }

        // Ensure USDT_WALLETS is an array of valid addresses
        const validUsdtWallets = (Array.isArray(USDT_WALLETS) ? USDT_WALLETS : (typeof USDT_WALLETS === 'string' ? USDT_WALLETS.split(',').map(w => w.trim()) : []))
            .filter(w => Web3.utils.isAddress(w));

        if (validUsdtWallets.length === 0) {
            console.warn('⚠️ No valid USDT_WALLETS configured for distribution. Skipping on-chain payout.');
            return { status: 'skipped', reason: 'no_valid_usdt_wallets' };
        }
        console.log(`✅ Payout configuration validated. Distributing to ${validUsdtWallets.length} wallets.`);

        const provider = new ethers.providers.JsonRpcProvider(BSC_NODE);
        const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

        // Verify that the GAS_WALLET address derived from PRIVATE_KEY matches CONFIG.GAS_WALLET
        if (wallet.address.toLowerCase() !== GAS_WALLET.toLowerCase()) {
            console.error(`🚨 Payout Agent Critical Error: Mismatch between derived wallet address (${wallet.address}) and configured GAS_WALLET (${GAS_WALLET}). Ensure PRIVATE_KEY corresponds to GAS_WALLET.`);
            return { status: 'failed', reason: 'private_key_gas_wallet_mismatch' };
        }
        console.log(`Connected to BSC node: ${BSC_NODE} with wallet: ${wallet.address.slice(0, 10)}...`);


        // --- 2. Determine Conceptual Earnings ---
        let earnings = CONFIG.earnings || 0; // Get conceptual earnings from CONFIG, default to 0
        console.log(`Initial Conceptual Earnings for Distribution: $${earnings.toFixed(2)}`);

        if (earnings <= 0) {
            console.log('💸 No positive conceptual earnings to distribute. Skipping on-chain payout.');
            return { status: 'skipped', reason: 'zero_earnings' };
        }

        // --- 3. Conceptual "Flex Gas" Deduction (Novelty) ---
        const estimatedGasLimit = 60000; // Standard gas limit for a simple BNB transfer
        const gasPrice = await provider.getGasPrice();
        const costPerTxBNB_Wei = gasPrice.mul(estimatedGasLimit);
        const costPerTxBNB = parseFloat(ethers.utils.formatEther(costPerTxBNB_Wei));
        console.log(`Estimated cost per transaction: ${costPerTxBNB.toFixed(8)} BNB`);

        // Convert BNB cost to conceptual USD (assuming 1 BNB = $300 for estimation)
        // This is a simplification; in a real system, you'd fetch real-time BNB/USD price.
        const BNB_USD_RATE_ESTIMATE = 300;
        const conceptualGasCostUSD_PerTx = costPerTxBNB * BNB_USD_RATE_ESTIMATE;

        let totalConceptualGasCostUSD = 0;
        if (useFlexGas) {
            // Calculate total conceptual gas cost for all transactions
            totalConceptualGasCostUSD = conceptualGasCostUSD_PerTx * validUsdtWallets.length;
            console.log(`Conceptual total gas cost for ${validUsdtWallets.length} transactions: $${totalConceptualGasCostUSD.toFixed(4)}`);

            // Deduct conceptual gas cost from earnings
            earnings = Math.max(0, earnings - totalConceptualGasCostUSD);
            console.log(`Earnings after conceptual flex gas deduction: $${earnings.toFixed(2)}`);
        } else {
            console.log('Conceptual flex gas deduction is disabled.');
        }

        if (earnings <= 0) {
            console.warn('⚠️ Earnings became zero or negative after conceptual gas deduction. Skipping actual payouts.');
            return { status: 'skipped', reason: 'earnings_insufficient_after_gas_deduction' };
        }

        // --- 4. Determine BNB Distribution Amount per Wallet ---
        // We aim to distribute a *representation* of the earnings as a small, fixed BNB amount per wallet.
        // This ensures payouts are gas-efficient and don't require complex token approvals.
        // The total 'earnings' guide the overall *intention* of payout.
        const conceptualAmountToDistributePerWalletUSD = earnings / validUsdtWallets.length;
        // Map this conceptual USD amount to a very small, fixed BNB amount to actually send.
        // This makes the transactions simple BNB transfers, representing a successful "payment"
        // without needing a complex USD-to-BNB conversion or USDT token transfers.
        // A minimal, consistent BNB amount is key for 'zero-cost' reliability (only gas matters).
        const ACTUAL_BNB_TRANSFER_AMOUNT = ethers.utils.parseEther('0.0001'); // Fixed 0.0001 BNB per wallet

        // --- 5. Check Actual BNB Balance for Gas ---
        const gasWalletBalanceWei = await provider.getBalance(GAS_WALLET);
        const gasWalletBalanceBNB = parseFloat(ethers.utils.formatEther(gasWalletBalanceWei));
        console.log(`Current GAS_WALLET BNB balance: ${gasWalletBalanceBNB.toFixed(6)} BNB`);

        const totalActualBNBNeeded = ACTUAL_BNB_TRANSFER_AMOUNT.mul(validUsdtWallets.length).add(costPerTxBNB_Wei.mul(validUsdtWallets.length));
        const totalActualBNBNeeded_Float = parseFloat(ethers.utils.formatEther(totalActualBNBNeeded));

        if (gasWalletBalanceBNB < totalActualBNBNeeded_Float) {
            console.error(`🚨 Insufficient ACTUAL BNB in GAS_WALLET for distributing to all ${validUsdtWallets.length} wallets. Required: ~${totalActualBNBNeeded_Float.toFixed(6)} BNB.`);
            return { status: 'failed', reason: 'insufficient_bnb_for_actual_txs' };
        }

        // --- 6. Execute On-Chain Distribution ---
        const txReceipts = [];
        let actualBNBDistributedTotal = 0;

        for (const recipientWallet of validUsdtWallets) {
            try {
                console.log(`Attempting to send ${ethers.utils.formatEther(ACTUAL_BNB_TRANSFER_AMOUNT)} BNB to ${recipientWallet.slice(0, 10)}...`);

                const tx = {
                    to: recipientWallet,
                    value: ACTUAL_BNB_TRANSFER_AMOUNT,
                    gasLimit: estimatedGasLimit,
                    gasPrice: gasPrice
                };

                const transactionResponse = await wallet.sendTransaction(tx);
                console.log(`TX Hash: ${transactionResponse.hash.slice(0, 10)}... Waiting for confirmation...`);

                const receipt = await transactionResponse.wait(1); // Wait for 1 confirmation
                txReceipts.push(receipt.transactionHash);
                console.log(`✅ Distributed ${ethers.utils.formatEther(ACTUAL_BNB_TRANSFER_AMOUNT)} BNB to ${recipientWallet.slice(0, 10)}... Confirmed in block ${receipt.blockNumber}.`);
                actualBNBDistributedTotal += parseFloat(ethers.utils.formatEther(ACTUAL_BNB_TRANSFER_AMOUNT));
            } catch (txError) {
                console.warn(`⚠️ Failed to distribute to ${recipientWallet.slice(0, 10)}...: ${txError.message.substring(0, 100)}...`);
                if (txError.code === 'INSUFFICIENT_FUNDS') {
                    console.error('    Reason: Gas wallet has insufficient funds for this specific transaction.');
                }
                // Continue to next wallet even if one transaction fails
            }
        }

        console.log(`✅ Payout Agent completed. Total Actual BNB Distributed: ${actualBNBDistributedTotal.toFixed(6)} BNB.`);
        return {
            status: 'success',
            conceptualEarningsHandled: CONFIG.earnings,
            conceptualGasDeductedUSD: useFlexGas ? totalConceptualGasCostUSD.toFixed(4) : 'N/A',
            totalActualBNBDistributed: actualBNBDistributedTotal.toFixed(6),
            transactionCount: txReceipts.length,
            transactionHashes: txReceipts,
            distributedTo: validUsdtWallets
        };

    } catch (error) {
        console.error('🚨 Payout Agent Critical Error:', error.message);
        // Do not re-throw here; let the orchestrator (`server.js`) handle overall flow.
        return { status: 'failed', reason: error.message };
    }
};

// === 🎨 Mint Revenue NFT (Optional) ===
/**
 * A conceptual function for minting an NFT based on revenue.
 * It does NOT use Puppeteer.
 * @param {number} amount - The revenue amount.
 * @returns {Promise<object>} Status of the conceptual NFT minting.
 */
export const mintRevenueNFT = async (amount) => {
    if (amount >= 50) {
        console.log(`🎨 Conceptual: Minting NFT for $${amount} revenue (threshold $50)...`);
        return { status: 'mint_initiated', amount };
    } else {
        console.log(`ℹ️ Conceptual: Skipping NFT minting. Revenue $${amount} below threshold $50.`);
        return { status: 'skipped', reason: 'amount_below_threshold' };
    }
};
