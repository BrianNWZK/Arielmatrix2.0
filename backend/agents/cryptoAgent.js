// backend/agents/cryptoAgent.js
import Web3 from 'web3';
import axios from 'axios';
import crypto from 'crypto';
import { ethers } from 'ethers'; // For wallet generation and signing
import { fileURLToPath } from 'url'; // For __dirname in ESM
import { dirname } from 'path';

// For __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @namespace CryptoAgent
 * @description Manages cryptocurrency assets, analyzes markets, executes trades,
 * and handles self-funding on the Binance Smart Chain (BSC).
 */
const cryptoAgent = {
    // Internal references for config and logger, set during the run method
    _config: null,
    _logger: null,

    /**
     * Introduces a quantum-jittered delay to simulate human-like interaction.
     * @param {number} ms - The base delay in milliseconds.
     * @returns {Promise<void>}
     */
    _quantumDelay(ms) {
        return new Promise(resolve => {
            const jitter = crypto.randomInt(800, 3000);
            setTimeout(resolve, ms + jitter);
        });
    },

    /**
     * Validates and sanitizes crypto configuration. Ensures wallets are valid addresses.
     * @param {object} configToValidate - The configuration object to validate.
     * @returns {object} Cleaned and validated crypto config subset.
     * @throws {Error} If critical configuration is invalid.
     */
    _validateCryptoConfig(configToValidate) {
        const GAS_WALLET = configToValidate.GAS_WALLET;
        const rawUsdtWallets = (configToValidate.USDT_WALLETS || '').split(',').map(w => w.trim());
        const USDT_WALLETS = rawUsdtWallets.filter(w => Web3.utils.isAddress(w));

        if (USDT_WALLETS.length === 0 && rawUsdtWallets.length > 0) {
            this._logger.warn(`⚠️ All provided USDT_WALLETS (${rawUsdtWallets.join(', ')}) were invalid after filtering.`);
        } else if (USDT_WALLETS.length > 0) {
            this._logger.info(`✅ Valid USDT_WALLETS: ${USDT_WALLETS.map(w => w.slice(0, 10) + '...').join(', ')}`);
        }

        const BSC_NODE = configToValidate.BSC_NODE || 'https://bsc-dataseed.binance.org'; // Default public node

        if (!GAS_WALLET || !Web3.utils.isAddress(GAS_WALLET)) {
            throw new Error('Invalid or missing GAS_WALLET address.');
        }
        if (USDT_WALLETS.length === 0) {
            throw new Error('No valid USDT_WALLETS provided. At least one valid USDT wallet is required.');
        }

        return { GAS_WALLET, USDT_WALLETS, BSC_NODE };
    },

    /**
     * Proactively remediates missing/placeholder crypto configuration,
     * including generating new private keys and deriving wallets.
     * @param {string} keyName - The name of the missing configuration key.
     * @returns {Promise<object|null>} An object containing the remediated key(s) if successful, null otherwise.
     */
    async _remediateMissingCryptoConfig(keyName) {
        this._logger.info(`\n⚙️ Initiating crypto remediation for missing/placeholder key: ${keyName}`);
        let keysToUpdate = {};

        try {
            switch (keyName) {
                case 'PRIVATE_KEY': {
                    const newWallet = ethers.Wallet.createRandom();
                    keysToUpdate.PRIVATE_KEY = newWallet.privateKey;
                    keysToUpdate.GAS_WALLET = newWallet.address;

                    const derivedUsdtWallets = [];
                    for (let i = 0; i < 3; i++) {
                        const derivedPath = `m/44'/60'/0'/0/${i}`;
                        const derivedWallet = newWallet.derivePath(derivedPath);
                        derivedUsdtWallets.push(derivedWallet.address);
                    }
                    keysToUpdate.USDT_WALLETS = derivedUsdtWallets.join(',');
                    this._logger.success(`✅ Autonomously generated new PRIVATE_KEY and derived wallets. GAS_WALLET: ${newWallet.address.slice(0, 10)}..., USDT_WALLETS: ${derivedUsdtWallets.map(w => w.slice(0, 10)).join(', ')}...`);
                    break;
                }
                case 'GAS_WALLET': {
                    if (this._config.PRIVATE_KEY && !String(this._config.PRIVATE_KEY).includes('PLACEHOLDER')) {
                        const walletFromPk = new ethers.Wallet(this._config.PRIVATE_KEY);
                        keysToUpdate.GAS_WALLET = walletFromPk.address;
                        this._logger.success(`✅ Derived GAS_WALLET from existing PRIVATE_KEY: ${keysToUpdate.GAS_WALLET.slice(0, 10)}...`);
                    } else {
                        this._logger.warn(`⚠️ Cannot derive GAS_WALLET: PRIVATE_KEY is missing or a placeholder. Cannot remediate.`);
                        return null;
                    }
                    break;
                }
                case 'USDT_WALLETS': {
                    if (this._config.PRIVATE_KEY && !String(this._config.PRIVATE_KEY).includes('PLACEHOLDER')) {
                        const baseWallet = new ethers.Wallet(this._config.PRIVATE_KEY);
                        const derivedWallets = [];
                        for (let i = 0; i < 3; i++) {
                            const derivedPath = `m/44'/60'/0'/0/${i}`;
                            const derived = baseWallet.derivePath(derivedPath);
                            derivedWallets.push(derived.address);
                        }
                        keysToUpdate.USDT_WALLETS = derivedWallets.join(',');
                        this._logger.success(`✅ Derived USDT_WALLETS from existing PRIVATE_KEY: ${keysToUpdate.USDT_WALLETS.slice(0, 30)}...`);
                    } else {
                        this._logger.warn(`⚠️ Cannot derive USDT_WALLETS: PRIVATE_KEY is missing or a placeholder. Cannot remediate.`);
                        return null;
                    }
                    break;
                }
                case 'BSC_NODE': {
                    keysToUpdate.BSC_NODE = 'https://bsc-dataseed.binance.org';
                    this._logger.success(`✅ Set default BSC_NODE: ${keysToUpdate.BSC_NODE}`);
                    break;
                }
                case 'COINGECKO_API': {
                    // This key is optional and often doesn't need remediation beyond default.
                    // If a specific API key were truly needed, this would interact with a web service.
                    this._logger.info(`ℹ️ COINGECKO_API typically doesn't require automated remediation.`);
                    return null;
                }
                default:
                    this._logger.warn(`⚠️ No specific remediation strategy defined for crypto key: ${keyName}. Manual intervention required.`);
                    return null;
            }

            return Object.keys(keysToUpdate).length > 0 ? keysToUpdate : null;

        } catch (error) {
            this._logger.error(`🚨 Crypto remediation for ${keyName} failed: ${error.message}`);
            return null;
        }
    },

    /**
     * Ensures the GAS_WALLET has sufficient BNB. If not, triggers revenue agents to generate funds.
     * @returns {Promise<object|null>} Object of newly remediated keys if any, null otherwise.
     */
    async _getInitialCapital() {
        // Use an ethers provider to avoid re-initializing Web3 instance
        const provider = new ethers.providers.JsonRpcProvider(this._config.BSC_NODE);

        if (!this._config.GAS_WALLET || !Web3.utils.isAddress(this._config.GAS_WALLET)) {
            this._logger.warn('⚠️ Invalid GAS_WALLET detected. Cannot check BNB balance or self-fund.');
            return null;
        }

        try {
            const balance = await provider.getBalance(this._config.GAS_WALLET);
            const bnbBalance = parseFloat(ethers.utils.formatEther(balance));
            this._logger.info(`Current GAS_WALLET balance: ${bnbBalance} BNB`);

            const MIN_BNB_THRESHOLD = 0.05;
            const remediatedKeysFromCapitalGeneration = {};

            if (bnbBalance < MIN_BNB_THRESHOLD) {
                this._logger.warn(`⚠️ Low gas: ${bnbBalance} BNB. Generating initial capital...`);

                try {
                    const payoutAgentModule = await import('./payoutAgent.js');
                    const socialAgentModule = await import('./socialAgent.js');
                    const shopifyAgentModule = await import('./shopifyAgent.js');

                    this._logger.info('Triggering socialAgent for revenue generation...');
                    const socialResult = await socialAgentModule.default.run(this._config, this._logger).catch(e => {
                        this._logger.warn('SocialAgent failed during capital generation:', e.message);
                        return { success: false, newlyRemediatedKeys: {} };
                    });
                    if (socialResult.newlyRemediatedKeys) Object.assign(remediatedKeysFromCapitalGeneration, socialResult.newlyRemediatedKeys);


                    this._logger.info('Triggering shopifyAgent for revenue generation...');
                    const shopifyResult = await shopifyAgentModule.default.run(this._config, this._logger).catch(e => {
                        this._logger.warn('ShopifyAgent failed during capital generation:', e.message);
                        return { status: 'failed', newlyRemediatedKeys: {} };
                    });
                    if (shopifyResult.newlyRemediatedKeys) Object.assign(remediatedKeysFromCapitalGeneration, shopifyResult.newlyRemediatedKeys);

                    let earningsFromAgents = 0;
                    if (socialResult.success) earningsFromAgents += 5;
                    if (shopifyResult.status === 'success') earningsFromAgents += 10;

                    if (earningsFromAgents > 0) {
                        this._logger.info(`Generated simulated earnings: $${earningsFromAgents}. Triggering payout...`);
                        // Pass a new object with updated earnings, but still reference the main config
                        const payoutResult = await payoutAgentModule.default.run({ ...this._config, earnings: earningsFromAgents }, this._logger);
                        if (payoutResult.newlyRemediatedKeys) Object.assign(remediatedKeysFromCapitalGeneration, payoutResult.newlyRemediatedKeys);

                        await this._quantumDelay(15000); // Increased delay for blockchain confirmation

                        const newBalance = await provider.getBalance(this._config.GAS_WALLET);
                        const newBnbBalance = parseFloat(ethers.utils.formatEther(newBalance));
                        this._logger.success(`✅ Gas wallet refilled: ${newBnbBalance} BNB`);
                        if (newBnbBalance >= MIN_BNB_THRESHOLD) {
                             return remediatedKeysFromCapitalGeneration;
                        } else {
                            this._logger.warn('⚠️ Capital generation successful, but gas wallet still below threshold.');
                            return null;
                        }
                    } else {
                        this._logger.warn('⚠️ No revenue generated from agents. Capital generation failed.');
                        return null;
                    }

                } catch (error) {
                    this._logger.warn('⚠️ Critical error during capital generation:', error.message);
                    return null;
                }
            }

            this._logger.info(`✅ Sufficient gas: ${bnbBalance} BNB`);
            return null; // No new keys if sufficient capital already
        } catch (error) {
            this._logger.error(`🚨 Error checking gas wallet balance: ${error.message}. Ensure BSC_NODE is reachable and GAS_WALLET is correct.`);
            return null;
        }
    },

    /**
     * Analyzes crypto market data from CoinGecko. Uses a fallback if API fails or key is missing.
     * @param {string} coingeckoApiUrl - The CoinGecko API URL from config.
     * @returns {Promise<object>} Market data for Bitcoin and Ethereum.
     */
    async _analyzeCryptoMarkets(coingeckoApiUrl) {
        const fallbackData = {
            bitcoin: { usd: 50000, last_updated_at: Date.now() / 1000 },
            ethereum: { usd: 3000, last_updated_at: Date.now() / 1000 }
        };

        const API_URL_BASE = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';

        if (!coingeckoApiUrl || String(coingeckoApiUrl).includes('PLACEHOLDER')) {
            this._logger.warn('⚠️ CoinGecko API URL missing or placeholder. Using fallback market data.');
            return fallbackData;
        }

        try {
            const url = coingeckoApiUrl.includes('/simple/price') ? coingeckoApiUrl : API_URL_BASE;
            const response = await axios.get(url, { timeout: 8000 });
            if (response.data && (response.data.bitcoin || response.data.ethereum)) {
                this._logger.info('✅ Fetched real market data from CoinGecko.');
                return response.data;
            }
            throw new Error('CoinGecko API returned empty or invalid data.');
        } catch (error) {
            this._logger.warn(`⚠️ Error fetching real market data: ${error.message.substring(0, 100)}. Using fallback data.`);
            return fallbackData;
        }
    },

    /**
     * Executes simulated arbitrage-like transfers on BSC if market conditions are favorable.
     * @param {object} params - Contains gasWallet, privateKey, recipientWallets, bscNode, and marketData.
     * @returns {Promise<string[]>} Array of transaction hashes.
     */
    async _executeArbitrageTrades({ gasWallet, privateKey, recipientWallets, bscNode, marketData }) {
        const provider = new ethers.providers.JsonRpcProvider(bscNode);
        const wallet = new ethers.Wallet(privateKey, provider);
        const txReceipts = [];

        const BTC_BEAR_THRESHOLD = 55000;
        if (marketData.bitcoin.usd < BTC_BEAR_THRESHOLD) {
            if (recipientWallets.length === 0) {
                this._logger.warn('⚠️ No valid recipient wallets available for arbitrage trades.');
                return txReceipts;
            }

            this._logger.info(`🐻 Bear market detected (BTC < $${BTC_BEAR_THRESHOLD}). Initiating arbitrage-like transfers.`);

            for (const recipient of recipientWallets.slice(0, 2)) {
                try {
                    const amountToSend = ethers.utils.parseEther('0.005');
                    const gasPrice = await provider.getGasPrice();

                    this._logger.info(`Attempting to send ${ethers.utils.formatEther(amountToSend)} BNB to ${recipient.slice(0, 6)}...`);

                    const txResponse = await wallet.sendTransaction({
                        to: recipient,
                        value: amountToSend,
                        gasLimit: 60000,
                        gasPrice: gasPrice
                    });

                    const receipt = await txResponse.wait(1);
                    txReceipts.push(receipt.transactionHash);
                    this._logger.success(`✅ Sent ${ethers.utils.formatEther(amountToSend)} BNB to ${recipient.slice(0, 6)}... TX: ${receipt.transactionHash.slice(0, 10)}...`);
                } catch (error) {
                    this._logger.warn(`⚠️ TX failed to ${recipient.slice(0, 6)}...: ${error.message.substring(0, 100)}...`);
                    if (error.code === 'INSUFFICIENT_FUNDS') {
                        this._logger.error('    Reason: Insufficient BNB in GAS_WALLET for this specific transaction.');
                    }
                }
            }
        } else {
            this._logger.info('💰 Crypto market bullish (BTC >= $55K) → holding position or not executing bear-market specific trades.');
        }

        return txReceipts;
    },

    /**
     * Executes a conceptual high-value trade on BSC (e.g., swapping BNB for BUSD).
     * @param {object} params - Contains gasWallet, privateKey, bscNode, and marketData.
     * @returns {Promise<string[]>} Array of transaction hashes.
     */
    async _executeHighValueTrades({ gasWallet, privateKey, bscNode, marketData }) {
        const provider = new ethers.providers.JsonRpcProvider(bscNode);
        const wallet = new ethers.Wallet(privateKey, provider);
        const txReceipts = [];

        const BTC_BEAR_THRESHOLD = 55000;
        if (marketData.bitcoin.usd < BTC_BEAR_THRESHOLD) {
            this._logger.info(`📈 Executing high-value trade (conceptual swap) in bear market.`);
            const routerAddress = '0x10ED43C718714eb63d5aA57B78B54704E256024E';

            const amountIn = ethers.utils.parseEther('0.02');

            try {
                const gasPrice = await provider.getGasPrice();
                this._logger.info(`Attempting conceptual swap of ${ethers.utils.formatEther(amountIn)} BNB via PancakeSwap Router.`);

                const txResponse = await wallet.sendTransaction({
                    to: routerAddress,
                    value: amountIn,
                    gasLimit: 250000,
                    gasPrice: gasPrice
                });

                const receipt = await txResponse.wait(1);
                txReceipts.push(receipt.transactionHash);
                this._logger.success(`✅ Conceptual swap TX sent: ${receipt.transactionHash.slice(0, 10)}...`);
            } catch (error) {
                this._logger.warn(`⚠️ Conceptual swap failed: ${error.message.substring(0, 100)}...`);
                if (error.code === 'INSUFFICIENT_FUNDS') {
                    this._logger.error('    Reason: Insufficient BNB for conceptual swap.');
                }
            }
        }

        return txReceipts;
    },

    /**
     * The primary crypto agent's run method. Responsible for managing crypto assets,
     * analyzing markets, executing trades, and self-funding.
     * @param {object} config - The global configuration object populated from Render ENV.
     * @param {object} logger - The global logger instance.
     * @returns {Promise<object>} Status and transaction details of crypto operations.
     */
    async run(config, logger) {
        this._config = config; // Set internal config reference
        this._logger = logger; // Set internal logger reference
        this._logger.info('💰 Crypto Agent Activated...');
        const startTime = process.hrtime.bigint();

        try {
            const cryptoCriticalKeys = [
                'PRIVATE_KEY',
                'GAS_WALLET',
                'USDT_WALLETS',
                'BSC_NODE',
                'COINGECKO_API'
            ];

            const newlyRemediatedKeys = {};

            // === PHASE 0: Proactive Configuration Remediation for Crypto Agent ===
            for (const key of cryptoCriticalKeys) {
                if (!this._config[key] || String(this._config[key]).includes('PLACEHOLDER')) {
                    const remediatedValue = await this._remediateMissingCryptoConfig(key);
                    if (remediatedValue) {
                        Object.assign(newlyRemediatedKeys, remediatedValue);
                        // Update internal config for immediate use
                        Object.assign(this._config, remediatedValue);
                    }
                }
            }
            if (Object.keys(newlyRemediatedKeys).length > 0) {
                this._logger.info(`🔑 Crypto Agent remediated ${Object.keys(newlyRemediatedKeys).length} key(s).`);
            } else {
                this._logger.info('No new keys remediated by Crypto Agent this cycle.');
            }
            this._logger.info('\n--- Finished Crypto Configuration Remediation Phase ---');

            // Re-validate config after remediation attempts
            let validatedSubsetConfig;
            try {
                validatedSubsetConfig = this._validateCryptoConfig(this._config);
            } catch (validationError) {
                this._logger.error(`🚨 Critical Crypto Config Error after remediation: ${validationError.message}. Cannot proceed with blockchain operations.`);
                throw new Error(`invalid_crypto_config: ${validationError.message}`);
            }

            const { GAS_WALLET, USDT_WALLETS, BSC_NODE } = validatedSubsetConfig;
            const PRIVATE_KEY = this._config.PRIVATE_KEY; // PRIVATE_KEY comes from original config or remediation

            if (!PRIVATE_KEY || String(PRIVATE_KEY).includes('PLACEHOLDER')) {
                this._logger.error('🚨 CRITICAL: PRIVATE_KEY is still missing or a placeholder after remediation. Cannot sign real blockchain transactions.');
                throw new Error('private_key_missing');
            }
            this._logger.success(`✅ Crypto configuration validated. Gas Wallet: ${GAS_WALLET.slice(0, 10)}...`);

            // ===== 1. SELF-FUNDING: GET INITIAL CAPITAL =====
            // This call updates newlyRemediatedKeys if capital generation involves other agents remediating keys
            const remediatedDuringCapital = await this._getInitialCapital();
            if (remediatedDuringCapital) {
                 Object.assign(newlyRemediatedKeys, remediatedDuringCapital);
                 Object.assign(this._config, remediatedDuringCapital); // Ensure internal config is updated
            }

            // After capital generation, re-check if the wallet is indeed funded sufficiently.
            // If getInitialCapital returns null, it either failed or didn't need to generate.
            // A direct balance check is the most reliable way to confirm.
            const provider = new ethers.providers.JsonRpcProvider(this._config.BSC_NODE);
            const currentBalance = await provider.getBalance(this._config.GAS_WALLET);
            const currentBnbBalance = parseFloat(ethers.utils.formatEther(currentBalance));
            const MIN_BNB_THRESHOLD = 0.05;

            if (currentBnbBalance < MIN_BNB_THRESHOLD) {
                this._logger.warn('⚠️ Wallet still has insufficient capital after self-funding attempts. Skipping crypto trades.');
                throw new Error('insufficient_capital_after_self_fund');
            }


            // ===== 2. MARKET ANALYSIS =====
            const marketData = await this._analyzeCryptoMarkets(this._config.COINGECKO_API);

            // ===== 3. EXECUTE ARBITRAGE TRADES =====
            const arbitrageTxs = await this._executeArbitrageTrades({
                gasWallet: GAS_WALLET,
                privateKey: PRIVATE_KEY,
                recipientWallets: USDT_WALLETS,
                bscNode: BSC_NODE,
                marketData
            });

            // ===== 4. EXECUTE HIGH-VALUE TRADES =====
            const highValueTxs = await this._executeHighValueTrades({
                gasWallet: GAS_WALLET,
                privateKey: PRIVATE_KEY,
                bscNode: BSC_NODE,
                marketData
            });

            // ===== 5. TRIGGER PAYOUT =====
            const totalTxs = arbitrageTxs.length + highValueTxs.length;
            if (totalTxs > 0) {
                this._logger.info(`🎯 Payout triggered: $${(totalTxs * 10).toFixed(2)} (conceptual earnings)`);
                const payoutAgentModule = await import('./payoutAgent.js');
                // Pass a new object with earnings, and the current logger
                const payoutResult = await payoutAgentModule.default.run({ ...this._config, earnings: totalTxs * 10 }, this._logger);
                if (payoutResult.newlyRemediatedKeys) Object.assign(newlyRemediatedKeys, payoutResult.newlyRemediatedKeys);
            }

            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            this._logger.success(`✅ Crypto Agent Completed in ${durationMs.toFixed(0)}ms | Total TXs: ${totalTxs}`);
            return { status: 'success', transactions: [...arbitrageTxs, ...highValueTxs], durationMs, newlyRemediatedKeys };

        } catch (error) {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            this._logger.error(`🚨 Crypto Agent Critical Failure in ${durationMs.toFixed(0)}ms: ${error.message}`);
            // Re-throw the error object for consistent handling by server.js
            throw { message: error.message, duration: durationMs };
        }
    }
};

export default cryptoAgent;
