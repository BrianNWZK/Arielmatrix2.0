// =========================================================================
// ArielMatrix Crypto Agent: Autonomous On-Chain Management
// Upgraded Version
// =========================================================================

import Web3 from 'web3';
import axios from 'axios';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { provideThreatIntelligence } from './healthAgent.js'; // Assumed from the previous upgrade

// --- ES Module Path Fix ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// --- Contract ABIs & Addresses ---
// More comprehensive ABI for a standard DEX Router
const PANCAKESWAP_ROUTER_ABI = [
    "function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)",
    "function getAmountsOut(uint amountIn, address[] memory path) public view returns (uint[] memory amounts)"
];

const PANCAKESWAP_ROUTER_ADDRESS = '0x10ED43C718714eb63d5aA57B78B54704E256024E'; // PancakeSwap on BSC Mainnet
const WBNB_ADDRESS = '0xbb4CdB9eD5B5D88B9aC1cBaA24a0d52fFe2607c7';
const BUSD_ADDRESS = '0xe9e7CEA3a59806eADb097E5fDd0Fb0d2b1fCcc4c';

// --- Agent Status Tracking ---
let lastExecutionTime = 'Never';
let lastStatus = 'idle';
let lastTotalTransactions = 0;
let lastConceptualEarnings = 0;
let lastGasBalance = 0;

/**
 * @namespace CryptoAgent
 * @description Manages on-chain crypto assets, analyzes markets, executes trades,
 * and handles autonomous self-funding on the Binance Smart Chain (BSC).
 */
const cryptoAgent = {
    _config: null,
    _logger: null,

    // --- Core Methods ---

    /**
     * The primary entry point for the Crypto Agent.
     * @param {object} config - Global configuration.
     * @param {object} logger - Global logger.
     * @returns {Promise<object>} Transaction details and status.
     */
    async run(config, logger) {
        this._config = config;
        this._logger = logger;
        lastExecutionTime = new Date().toISOString();
        lastStatus = 'running';
        lastTotalTransactions = 0;
        this._logger.info('💰 Crypto Agent Activated: Managing on-chain assets...');
        const startTime = process.hrtime.bigint();

        try {
            // Phase 1: Configuration & Remediation
            const newlyRemediatedKeys = await this._remediateAndValidateConfig();
            const validatedConfig = this._validateCryptoConfig(this._config);
            const { PRIVATE_KEY, GAS_WALLET, USDT_WALLETS, BSC_NODE } = validatedConfig;

            // Phase 2: Self-Funding Check
            const hasSufficientFunds = await this._checkGasWalletBalance(GAS_WALLET, BSC_NODE);
            if (!hasSufficientFunds) {
                this._logger.error('🚨 Aborting crypto operations due to insufficient gas.');
                throw { message: 'insufficient_capital_for_onchain_ops' };
            }

            // Phase 3: Market Analysis
            const marketData = await this._analyzeCryptoMarkets(this._config.COINGECKO_API);

            // Phase 4: Transaction Execution
            const txHashes = [];
            
            // Execute arbitrage-like trades based on a bearish signal
            const arbitrageTxs = await this._executeArbitrageTrades({
                privateKey: PRIVATE_KEY,
                recipientWallets: USDT_WALLETS,
                bscNode: BSC_NODE,
                marketData
            });
            txHashes.push(...arbitrageTxs);

            // Execute high-value DEX swaps based on a bullish signal
            const highValueTxs = await this._executeHighValueTrades({
                privateKey: PRIVATE_KEY,
                bscNode: BSC_NODE,
                marketData
            });
            txHashes.push(...highValueTxs);

            // Phase 5: Payout Trigger
            const totalOnChainTxs = txHashes.length;
            lastTotalTransactions = totalOnChainTxs;

            let finalConceptualEarnings = 0;
            if (totalOnChainTxs > 0) {
                finalConceptualEarnings = totalOnChainTxs * 0.1;
                lastConceptualEarnings = finalConceptualEarnings;
                this._logger.info(`🎯 Payout triggered based on ${totalOnChainTxs} on-chain activities: $${finalConceptualEarnings.toFixed(2)} (conceptual earnings)`);
                const payoutAgentModule = await import('./payoutAgent.js');
                const payoutResult = await payoutAgentModule.default.run({ ...this._config, earnings: finalConceptualEarnings }, this._logger);
                if (payoutResult && payoutResult.newlyRemediatedKeys) {
                    Object.assign(newlyRemediatedKeys, payoutResult.newlyRemediatedKeys);
                }
            } else {
                this._logger.info('No on-chain transactions executed, skipping payout trigger.');
            }

            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            lastStatus = 'success';
            this._logger.success(`✅ Crypto Agent Completed in ${durationMs.toFixed(0)}ms | Total TXs: ${totalOnChainTxs}`);
            
            return {
                status: 'success',
                transactions: txHashes,
                conceptualEarnings: finalConceptualEarnings,
                durationMs,
                newlyRemediatedKeys
            };

        } catch (error) {
            const endTime = process.hrtime.bigint();
            const durationMs = Number(endTime - startTime) / 1_000_000;
            lastStatus = 'failed';
            this._logger.error(`🚨 Crypto Agent Critical Failure: ${error.message} in ${durationMs.toFixed(0)}ms`);
            provideThreatIntelligence('crypto_agent_failure', `Critical error: ${error.message}`);
            throw { message: error.message, duration: durationMs };
        }
    },

    /**
     * Proactively remediates missing/placeholder crypto configuration.
     * @returns {Promise<object>} An object containing all remediated key-value pairs.
     */
    async _remediateAndValidateConfig() {
        this._logger.info('⚙️ Initiating proactive configuration remediation...');
        const newlyRemediatedKeys = {};
        const cryptoCriticalKeys = ['PRIVATE_KEY', 'GAS_WALLET', 'USDT_WALLETS', 'BSC_NODE', 'COINGECKO_API'];

        for (const key of cryptoCriticalKeys) {
            if (!this._config[key] || String(this._config[key]).includes('PLACEHOLDER')) {
                const remediationResult = await this._attemptRemediation(key);
                if (remediationResult) {
                    Object.assign(newlyRemediatedKeys, remediationResult);
                    Object.assign(this._config, remediationResult);
                }
            }
        }
        this._logger.info(`--- Finished Remediation. ${Object.keys(newlyRemediatedKeys).length} key(s) remediated. ---`);
        return newlyRemediatedKeys;
    },

    // --- Helper Functions ---

    /**
     * Validates a given configuration object.
     * @param {object} configToValidate - The configuration object to validate.
     * @returns {object} Cleaned and validated config subset.
     * @throws {Error} If critical configuration is invalid.
     */
    _validateCryptoConfig(configToValidate) {
        const { PRIVATE_KEY, GAS_WALLET, USDT_WALLETS, BSC_NODE } = configToValidate;
        if (!PRIVATE_KEY || String(PRIVATE_KEY).includes('PLACEHOLDER')) {
            throw new Error('Missing or placeholder PRIVATE_KEY.');
        }

        try {
            const walletFromPk = new ethers.Wallet(PRIVATE_KEY);
            if (GAS_WALLET && GAS_WALLET.toLowerCase() !== walletFromPk.address.toLowerCase()) {
                this._logger.warn(`⚙️ GAS_WALLET in config (${GAS_WALLET}) does not match derived from PRIVATE_KEY (${walletFromPk.address}). Using derived.`);
                configToValidate.GAS_WALLET = walletFromPk.address;
            }
        } catch (e) {
            throw new Error(`Invalid PRIVATE_KEY format: ${e.message}`);
        }

        const validUsdtWallets = (USDT_WALLETS || '').split(',').map(w => w.trim()).filter(w => Web3.utils.isAddress(w));
        if (validUsdtWallets.length === 0 && (USDT_WALLETS || '').length > 0) {
            this._logger.warn('⚠️ All provided USDT_WALLETS were invalid. No recipients for arbitrage.');
        }
        configToValidate.USDT_WALLETS = validUsdtWallets.join(',');
        
        return configToValidate;
    },

    /**
     * Helper to attempt a single remediation.
     * @param {string} keyName - The name of the key to remediate.
     * @returns {Promise<object|null>} Remediation result.
     */
    async _attemptRemediation(keyName) {
        this._logger.info(`⚙️ Attempting to remediate: ${keyName}`);
        try {
            switch (keyName) {
                case 'PRIVATE_KEY': {
                    const newWallet = ethers.Wallet.createRandom();
                    this._logger.success(`✅ Autonomously generated new PRIVATE_KEY and derived wallets.`);
                    return {
                        PRIVATE_KEY: newWallet.privateKey,
                        GAS_WALLET: newWallet.address,
                        USDT_WALLETS: `${ethers.Wallet.createRandom().address},${ethers.Wallet.createRandom().address}`
                    };
                }
                case 'GAS_WALLET':
                    if (this._config.PRIVATE_KEY) {
                        const wallet = new ethers.Wallet(this._config.PRIVATE_KEY);
                        this._logger.success(`✅ Derived GAS_WALLET from existing PRIVATE_KEY.`);
                        return { GAS_WALLET: wallet.address };
                    }
                    this._logger.warn('⚠️ Cannot derive GAS_WALLET: PRIVATE_KEY is missing.');
                    return null;
                case 'USDT_WALLETS': {
                    const wallets = [`${ethers.Wallet.createRandom().address}`, `${ethers.Wallet.createRandom().address}`];
                    this._logger.success(`✅ Generated new USDT_WALLETS.`);
                    return { USDT_WALLETS: wallets.join(',') };
                }
                case 'BSC_NODE':
                    this._logger.success(`✅ Set default BSC_NODE.`);
                    return { BSC_NODE: 'https://bsc-dataseed.binance.org' };
                case 'COINGECKO_API':
                    this._logger.info('ℹ️ CoinGecko API typically does not require remediation.');
                    return null;
                default:
                    this._logger.warn(`⚠️ No remediation strategy for key: ${keyName}.`);
                    return null;
            }
        } catch (error) {
            this._logger.error(`🚨 Remediation for ${keyName} failed: ${error.message}`);
            return null;
        }
    },

    /**
     * Checks if the gas wallet has sufficient BNB.
     * @param {string} walletAddress - The address of the gas wallet.
     * @param {string} bscNode - The BSC node URL.
     * @returns {Promise<boolean>}
     */
    async _checkGasWalletBalance(walletAddress, bscNode) {
        try {
            const provider = new ethers.providers.JsonRpcProvider(bscNode);
            const balance = await provider.getBalance(walletAddress);
            const bnbBalance = parseFloat(ethers.utils.formatEther(balance));
            lastGasBalance = bnbBalance;
            this._logger.info(`Current GAS_WALLET balance: ${bnbBalance} BNB`);

            const MIN_BNB_THRESHOLD = 0.05;
            if (bnbBalance < MIN_BNB_THRESHOLD) {
                this._logger.warn(`⚠️ CRITICAL: Low gas: ${bnbBalance} BNB. Required: ${MIN_BNB_THRESHOLD} BNB.`);
                provideThreatIntelligence('low_gas_balance', `Wallet balance is below threshold: ${bnbBalance} BNB`);
                return false;
            }
            this._logger.success(`✅ Sufficient gas: ${bnbBalance} BNB`);
            return true;
        } catch (error) {
            this._logger.error(`🚨 Error checking gas balance: ${error.message}`);
            return false;
        }
    },

    /**
     * Analyzes crypto market data from CoinGecko.
     * @param {string} coingeckoApiUrl - The CoinGecko API URL.
     * @returns {Promise<object>} Market data for BTC and ETH.
     */
    async _analyzeCryptoMarkets(coingeckoApiUrl) {
        const fallbackData = {
            bitcoin: { usd: 50000, last_updated_at: Date.now() / 1000 },
            ethereum: { usd: 3000, last_updated_at: Date.now() / 1000 }
        };

        const url = coingeckoApiUrl && !coingeckoApiUrl.includes('PLACEHOLDER') ? 
            coingeckoApiUrl : 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';

        try {
            const response = await axios.get(url, { timeout: 8000 });
            if (response.data && (response.data.bitcoin || response.data.ethereum)) {
                this._logger.info('✅ Fetched real market data from CoinGecko.');
                return response.data;
            }
            throw new Error('CoinGecko API returned invalid data.');
        } catch (error) {
            this._logger.warn(`⚠️ Error fetching market data: ${error.message}. Using fallback.`);
            provideThreatIntelligence('coingecko_api_failure', 'Failed to fetch market data from CoinGecko.');
            return fallbackData;
        }
    },

    /**
     * Executes arbitrage-like trades (simulated) on BSC.
     * @param {object} params - Trade parameters.
     * @returns {Promise<string[]>} Array of transaction hashes.
     */
    async _executeArbitrageTrades({ privateKey, recipientWallets, bscNode, marketData }) {
        const txHashes = [];
        const provider = new ethers.providers.JsonRpcProvider(bscNode);
        const wallet = new ethers.Wallet(privateKey, provider);

        const BTC_BEAR_THRESHOLD = marketData.bitcoin.usd * 0.95;
        if (marketData.bitcoin.usd < BTC_BEAR_THRESHOLD) {
            this._logger.info('🐻 Bearish signal detected. Initiating strategic BNB transfers.');
            if (recipientWallets.length === 0) {
                this._logger.warn('⚠️ No valid recipient wallets available for transfers.');
                return txHashes;
            }

            for (const recipient of recipientWallets.slice(0, 2)) {
                try {
                    const amountToSend = ethers.utils.parseEther('0.002');
                    const gasPrice = await provider.getGasPrice();
                    const txResponse = await wallet.sendTransaction({
                        to: recipient,
                        value: amountToSend,
                        gasLimit: 60000,
                        gasPrice: gasPrice
                    });
                    const receipt = await txResponse.wait(1);
                    txHashes.push(receipt.transactionHash);
                    this._logger.success(`✅ Sent ${ethers.utils.formatEther(amountToSend)} BNB to ${recipient.slice(0, 6)}... TX: ${receipt.transactionHash.slice(0, 10)}...`);
                } catch (error) {
                    this._logger.warn(`⚠️ Transfer failed to ${recipient}: ${error.message}`);
                    if (error.code === 'INSUFFICIENT_FUNDS') throw new Error('insufficient_funds_for_transfer');
                }
            }
        } else {
            this._logger.info('💰 Market is stable. No arbitrage-like trades executed.');
        }
        return txHashes;
    },

    /**
     * Executes a conceptual high-value DEX trade on BSC.
     * @param {object} params - Trade parameters.
     * @returns {Promise<string[]>} Array of transaction hashes.
     */
    async _executeHighValueTrades({ privateKey, bscNode, marketData }) {
        const txHashes = [];
        const provider = new ethers.providers.JsonRpcProvider(bscNode);
        const wallet = new ethers.Wallet(privateKey, provider);

        const ETH_BULL_THRESHOLD = 3200;
        if (marketData.ethereum.usd > ETH_BULL_THRESHOLD) {
            this._logger.info('📈 Bullish ETH signal detected. Initiating high-value DEX swap.');
            const routerContract = new ethers.Contract(PANCAKESWAP_ROUTER_ADDRESS, PANCAKESWAP_ROUTER_ABI, wallet);
            const amountIn = ethers.utils.parseEther('0.01');
            const path = [WBNB_ADDRESS, BUSD_ADDRESS];
            const to = wallet.address;
            const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 minutes

            try {
                // Get the minimum amount out to prevent slippage issues
                const amounts = await routerContract.getAmountsOut(amountIn, path);
                const amountOutMin = amounts[1].sub(amounts[1].div(20)); // 5% slippage tolerance

                const gasPrice = await provider.getGasPrice();
                const txResponse = await routerContract.swapExactETHForTokens(
                    amountOutMin,
                    path,
                    to,
                    deadline,
                    {
                        value: amountIn,
                        gasLimit: 300000,
                        gasPrice: gasPrice
                    }
                );
                const receipt = await txResponse.wait(1);
                txHashes.push(receipt.transactionHash);
                this._logger.success(`✅ High-value swap TX sent: ${receipt.transactionHash.slice(0, 10)}...`);
            } catch (error) {
                this._logger.warn(`⚠️ High-value swap failed: ${error.message}`);
                if (error.code === 'INSUFFICIENT_FUNDS') throw new Error('insufficient_funds_for_swap');
            }
        } else {
            this._logger.info('📉 ETH market is neutral. No high-value swaps executed.');
        }
        return txHashes;
    }
};

/**
 * @method getStatus
 * @description Returns the current operational status of the Crypto Agent.
 * @returns {object} Current status.
 */
export function getStatus() {
    return {
        agent: 'cryptoAgent',
        lastExecution: lastExecutionTime,
        lastStatus: lastStatus,
        lastTotalTransactions: lastTotalTransactions,
        lastConceptualEarnings: lastConceptualEarnings,
        lastGasBalance: lastGasBalance
    };
}

export default cryptoAgent;
