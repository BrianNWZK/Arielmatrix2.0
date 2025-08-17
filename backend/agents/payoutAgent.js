// backend/agents/payoutAgent.js
import Web3 from 'web3'; // For blockchain interaction and address validation
import { ethers } from 'ethers'; // For wallet signing and transaction building
import crypto from 'crypto'; // For random numbers if needed, and secure operations (used in other agents, included for completeness)

/**
 * @namespace PayoutAgent
 * @description Responsible for distributing generated revenue (conceptually in crypto)
 * to designated wallets on the Binance Smart Chain (BSC). Focuses on real, on-chain
 * transfers with minimal transaction costs (gas fees) and a "conceptual flex gas" mechanism.
 */
const payoutAgent = {
    // Internal references for config and logger, set during the run method
    _config: null,
    _logger: null,

    /**
     * Main run method for the Payout Agent.
     * @param {object} config - The global configuration object containing blockchain credentials and earnings.
     * @param {number} config.earnings - The conceptual total earnings to be distributed.
     * @param {boolean} [config.useFlexGas=true] - Option to enable conceptual flex gas deduction.
     * @param {object} logger - The global logger instance.
     * @returns {Promise<object>} Status of the payout operation.
     */
    async run(config, logger) {
        this._config = config; // Set internal config reference
        this._logger = logger; // Set internal logger reference
        this._logger.info('🔍 Payout Agent Activated: Initiating Autonomous On-Chain Crypto Distribution...');
        const startTime = process.hrtime.bigint();

        try {
            const { PRIVATE_KEY, GAS_WALLET, BSC_NODE, USDT_WALLETS } = this._config;
            const useFlexGas = this._config.useFlexGas !== false; // Default to true

            // --- 1. Critical Configuration Validation ---
            if (!PRIVATE_KEY || String(PRIVATE_KEY).includes('PLACEHOLDER')) {
                this._logger.error('🚨 Payout Agent Failed: PRIVATE_KEY is missing or a placeholder. Cannot sign transactions.');
                throw new Error('private_key_missing');
            }
            if (!GAS_WALLET || !Web3.utils.isAddress(GAS_WALLET)) {
                this._logger.error('🚨 Payout Agent Failed: GAS_WALLET is invalid or missing.');
                throw new Error('invalid_gas_wallet');
            }
            if (!BSC_NODE || String(BSC_NODE).includes('PLACEHOLDER')) {
                this._logger.error('🚨 Payout Agent Failed: BSC_NODE is missing or a placeholder. Cannot connect to blockchain.');
                throw new Error('bsc_node_missing');
            }

            // Ensure USDT_WALLETS is an array of valid addresses
            const validUsdtWallets = (Array.isArray(USDT_WALLETS) ? USDT_WALLETS : (typeof USDT_WALLETS === 'string' ? USDT_WALLETS.split(',').map(w => w.trim()) : []))
                .filter(w => Web3.utils.isAddress(w));

            if (validUsdtWallets.length === 0) {
                this._logger.warn('⚠️ No valid USDT_WALLETS configured for distribution. Skipping on-chain payout.');
                return { status: 'skipped', reason: 'no_valid_usdt_wallets' };
            }
            this._logger.info(`✅ Payout configuration validated. Distributing to ${validUsdtWallets.length} wallets.`);

            const provider = new ethers.providers.JsonRpcProvider(BSC_NODE);
            const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

            // Verify that the GAS_WALLET address derived from PRIVATE_KEY matches this._config.GAS_WALLET
            if (wallet.address.toLowerCase() !== GAS_WALLET.toLowerCase()) {
                this._logger.error(`🚨 Payout Agent Critical Error: Mismatch between derived wallet address (${wallet.address}) and configured GAS_WALLET (${GAS_WALLET}). Ensure PRIVATE_KEY corresponds to GAS_WALLET.`);
                throw new Error('private_key_gas_wallet_mismatch');
            }
            this._logger.info(`Connected to BSC node: ${BSC_NODE} with wallet: ${wallet.address.slice(0, 10)}...`);

            // --- 2. Determine Conceptual Earnings ---
            let earnings = this._config.earnings || 0; // Get conceptual earnings from this._config, default to 0
            this._logger.info(`Initial Conceptual Earnings for Distribution: $${earnings.toFixed(2)}`);

            if (earnings <= 0) {
                this._logger.info('💸 No positive conceptual earnings to distribute. Skipping on-chain payout.');
                return { status: 'skipped', reason: 'zero_earnings' };
            }

            // --- 3. Conceptual "Flex Gas" Deduction (Novelty) ---
            const estimatedGasLimit = 60000; // Standard gas limit for a simple BNB transfer
            const gasPrice = await provider.getGasPrice();
            const costPerTxBNB_Wei = gasPrice.mul(estimatedGasLimit);
            const costPerTxBNB = parseFloat(ethers.utils.formatEther(costPerTxBNB_Wei));
            this._logger.info(`Estimated cost per transaction: ${costPerTxBNB.toFixed(8)} BNB`);

            // Convert BNB cost to conceptual USD (assuming 1 BNB = $300 for estimation)
            const BNB_USD_RATE_ESTIMATE = 300;
            const conceptualGasCostUSD_PerTx = costPerTxBNB * BNB_USD_RATE_ESTIMATE;

            let totalConceptualGasCostUSD = 0;
            if (useFlexGas) {
                totalConceptualGasCostUSD = conceptualGasCostUSD_PerTx * validUsdtWallets.length;
                this._logger.info(`Conceptual total gas cost for ${validUsdtWallets.length} transactions: $${totalConceptualGasCostUSD.toFixed(4)}`);

                earnings = Math.max(0, earnings - totalConceptualGasCostUSD);
                this._logger.info(`Earnings after conceptual flex gas deduction: $${earnings.toFixed(2)}`);
            } else {
                this._logger.info('Conceptual flex gas deduction is disabled.');
            }

            if (earnings <= 0) {
                this._logger.warn('⚠️ Earnings became zero or negative after conceptual gas deduction. Skipping actual payouts.');
                return { status: 'skipped', reason: 'earnings_insufficient_after_gas_deduction' };
            }

            // --- 4. Determine BNB Distribution Amount per Wallet ---
            const ACTUAL_BNB_TRANSFER_AMOUNT = ethers.utils.parseEther('0.0001'); // Fixed 0.0001 BNB per wallet

            // --- 5. Check Actual BNB Balance for Gas ---
            const gasWalletBalanceWei = await provider.getBalance(GAS_WALLET);
            const gasWalletBalanceBNB = parseFloat(ethers.utils.formatEther(gasWalletBalanceWei));
            this._logger.info(`Current GAS_WALLET BNB balance: ${gasWalletBalanceBNB.toFixed(6)} BNB`);

            const totalActualBNBNeeded = ACTUAL_BNB_TRANSFER_AMOUNT.mul(validUsdtWallets.length).add(costPerTxBNB_Wei.mul(validUsdtWallets.length));
            const totalActualBNBNeeded_Float = parseFloat(ethers.utils.formatEther(totalActualBNBNeeded));

            if (gasWalletBalanceBNB < totalActualBNBNeeded_Float) {
                this._logger.error(`🚨 Insufficient ACTUAL BNB in GAS_WALLET for distributing to all ${validUsdtWallets.length} wallets. Required: ~${totalActualBNBNeeded_Float.toFixed(6)} BNB.`);
                throw new Error('insufficient_bnb_for_actual_txs');
            }

            // --- 6. Execute On-Chain Distribution ---
            const txReceipts = [];
            let actualBNBDistributedTotal = 0;

            for (const recipientWallet of validUsdtWallets) {
                try {
                    this._logger.info(`Attempting to send ${ethers.utils.formatEther(ACTUAL_BNB_TRANSFER_AMOUNT)} BNB to ${recipientWallet.slice(0, 10)}...`);

                    const tx = {
                        to: recipientWallet,
                        value: ACTUAL_BNB_TRANSFER_AMOUNT,
                        gasLimit: estimatedGasLimit,
                        gasPrice: gasPrice
                    };

                    const transactionResponse = await wallet.sendTransaction(tx);
                    this._logger.info(`TX Hash: ${transactionResponse.hash.slice(0, 10)}... Waiting for confirmation...`);

                    const receipt = await transactionResponse.wait(1); // Wait for 1 confirmation
                    txReceipts.push(receipt.transactionHash);
                    this._logger.success(`✅ Distributed ${ethers.utils.formatEther(ACTUAL_BNB_TRANSFER_AMOUNT)} BNB to ${recipientWallet.slice(0, 10)}... Confirmed in block ${receipt.blockNumber}.`);
                    actualBNBDistributedTotal += parseFloat(ethers.utils.formatEther(ACTUAL_BNB_TRANSFER_AMOUNT));
                } catch (txError) {
                    this._logger.warn(`⚠️ Failed to distribute to ${recipientWallet.slice(0, 10)}...: ${txError.message.substring(0, 100)}...`);
                    if (txError.code === 'INSUFFICIENT_FUNDS') {
                        this._logger.error('    Reason: Gas wallet has insufficient funds for this specific transaction.');
                    }
                    // Continue to next wallet even if one transaction fails
                }
            }

            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            this._logger.success(`✅ Payout Agent completed in ${durationMs.toFixed(0)}ms. Total Actual BNB Distributed: ${actualBNBDistributedTotal.toFixed(6)} BNB.`);
            return {
                status: 'success',
                conceptualEarningsHandled: this._config.earnings,
                conceptualGasDeductedUSD: useFlexGas ? totalConceptualGasCostUSD.toFixed(4) : 'N/A',
                totalActualBNBDistributed: actualBNBDistributedTotal.toFixed(6),
                transactionCount: txReceipts.length,
                transactionHashes: txReceipts,
                distributedTo: validUsdtWallets,
                durationMs
            };

        } catch (error) {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            this._logger.error(`🚨 Payout Agent Critical Failure in ${durationMs.toFixed(0)}ms: ${error.message}`);
            // Re-throw the error object for consistent handling by server.js
            throw { message: error.message, duration: durationMs };
        }
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
    // Note: This function is kept separate and does not use `this._logger`
    // as it's a standalone conceptual utility. If it needed access to
    // the main agent's config/logger, it would need to be a method of payoutAgent
    // or receive them as arguments.
    if (amount >= 50) {
        console.log(`🎨 Conceptual: Minting NFT for $${amount} revenue (threshold $50)...`);
        return { status: 'mint_initiated', amount };
    } else {
        console.log(`ℹ️ Conceptual: Skipping NFT minting. Revenue $${amount} below threshold $50.`);
        return { status: 'skipped', reason: 'amount_below_threshold' };
    }
};

export default payoutAgent;
