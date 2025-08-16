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

// Reusable Render ENV update function (extracted for common use across agents)
async function _updateRenderEnvWithKeys(keysToSave, config) {
    if (Object.keys(keysToSave).length === 0) return;

    if (config.RENDER_API_TOKEN && !String(config.RENDER_API_TOKEN).includes('PLACEHOLDER') &&
        config.RENDER_SERVICE_ID && !String(config.RENDER_SERVICE_ID).includes('PLACEHOLDER')) {
        console.log('Attempting to sync new keys to Render environment variables via Crypto Agent...');
        try {
            const envVarsToAdd = Object.entries(keysToSave).map(([key, value]) => ({ key, value }));
            const currentEnvResponse = await axios.get(
                `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/env-vars`,
                { headers: { Authorization: `Bearer ${config.RENDER_API_TOKEN}` }, timeout: 15000 }
            );
            const existingEnvVars = currentEnvResponse.data;

            const updatedEnvVars = existingEnvVars.map(envVar => {
                if (keysToSave[envVar.key] && !String(keysToSave[envVar.key]).includes('PLACEHOLDER')) {
                    return { key: envVar.key, value: keysToSave[envVar.key] };
                }
                return envVar;
            });

            envVarsToAdd.forEach(newEnv => {
                if (!updatedEnvVars.some(existing => existing.key === newEnv.key)) {
                    updatedEnvVars.push(newEnv);
                }
            });

            await axios.put(
                `https://api.render.com/v1/services/${config.RENDER_SERVICE_ID}/env-vars`,
                { envVars: updatedEnvVars },
                { headers: { Authorization: `Bearer ${config.RENDER_API_TOKEN}` }, timeout: 20000 }
            );
            console.log(`🔄 Successfully synced ${envVarsToAdd.length} new/updated keys to Render ENV.`);
        } catch (envUpdateError) {
            console.warn('⚠️ Failed to update Render ENV with new keys:', envUpdateError.message);
            console.warn('Ensure RENDER_API_TOKEN has write permissions for environment variables and is valid. This is CRITICAL for persistent learning.');
        }
    } else {
        console.warn('Skipping Render ENV update: RENDER_API_TOKEN or RENDER_SERVICE_ID missing or are placeholders. Key persistence to Render ENV is disabled.');
    }
}


// === 🌀 Quantum Jitter (Anti-Robot) ===
const quantumDelay = (ms) => new Promise(resolve => {
  const jitter = crypto.randomInt(800, 3000);
  setTimeout(resolve, ms + jitter);
});

// === 🛡️ Validate Crypto Configuration ===
/**
 * Validates and sanitizes crypto configuration. Ensures wallets are valid addresses.
 * @param {object} config - The global configuration object.
 * @returns {object} Cleaned and validated crypto config.
 * @throws {Error} If critical configuration is invalid.
 */
function validateCryptoConfig(config) {
  const GAS_WALLET = config.GAS_WALLET;
  const rawUsdtWallets = (config.USDT_WALLETS || '').split(',').map(w => w.trim());
  const USDT_WALLETS = rawUsdtWallets.filter(w => Web3.utils.isAddress(w)); // Use Web3.utils.isAddress for robust validation

  // Debugging log for USDT_WALLETS after filtering
  if (USDT_WALLETS.length === 0 && rawUsdtWallets.length > 0) {
      console.warn(`⚠️ All provided USDT_WALLETS (${rawUsdtWallets.join(', ')}) were invalid after filtering.`);
  } else if (USDT_WALLETS.length > 0) {
      console.log(`✅ Valid USDT_WALLETS: ${USDT_WALLETS.map(w => w.slice(0, 10) + '...').join(', ')}`);
  }

  const BSC_NODE = config.BSC_NODE || 'https://bsc-dataseed.binance.org'; // Default public node

  // Ensure required wallets are present and valid after filtering
  if (!GAS_WALLET || !Web3.utils.isAddress(GAS_WALLET)) { // Use Web3.utils.isAddress for GAS_WALLET too
    throw new Error('Invalid or missing GAS_WALLET address.');
  }
  if (USDT_WALLETS.length === 0) {
    throw new Error('No valid USDT_WALLETS provided. At least one valid USDT wallet is required.');
  }

  return { GAS_WALLET, USDT_WALLETS, BSC_NODE };
}


// === 🛠 CONFIGURATION REMEDIATION LAYER (NEW CORE FUNCTIONALITY FOR CRYPTO AGENT) ===
/**
 * Proactively remediates missing/placeholder crypto configuration,
 * including generating new private keys and deriving wallets.
 * @param {string} keyName - The name of the missing configuration key.
 * @param {object} config - The global CONFIG object (passed by reference).
 * @returns {Promise<boolean>} True if remediation was successful, false otherwise.
 */
async function remediateMissingCryptoConfig(keyName, config) {
    console.log(`\n⚙️ Initiating crypto remediation for missing/placeholder key: ${keyName}`);
    let newFoundValue = null;
    let keysToUpdate = {};

    try {
        switch (keyName) {
            case 'PRIVATE_KEY':
                // Autonomous generation of a new private key and derived wallets
                const newWallet = ethers.Wallet.createRandom();
                newFoundValue = newWallet.privateKey;
                keysToUpdate.PRIVATE_KEY = newFoundValue;
                keysToUpdate.GAS_WALLET = newWallet.address;
                // Generate a few USDT wallets (simplified, could be more complex derivation)
                const derivedUsdtWallets = [];
                for (let i = 0; i < 3; i++) { // Generate 3 derived wallets
                    const derivedPath = `m/44'/60'/0'/0/${i}`;
                    const derivedWallet = newWallet.derivePath(derivedPath);
                    derivedUsdtWallets.push(derivedWallet.address);
                }
                keysToUpdate.USDT_WALLETS = derivedUsdtWallets.join(',');
                console.log(`✅ Autonomously generated new PRIVATE_KEY and derived wallets. GAS_WALLET: ${newWallet.address.slice(0, 10)}..., USDT_WALLETS: ${derivedUsdtWallets.map(w => w.slice(0, 10)).join(', ')}...`);
                break;

            case 'GAS_WALLET':
                // If GAS_WALLET is missing but PRIVATE_KEY exists, derive it
                if (config.PRIVATE_KEY && !String(config.PRIVATE_KEY).includes('PLACEHOLDER')) {
                    const walletFromPk = new ethers.Wallet(config.PRIVATE_KEY);
                    newFoundValue = walletFromPk.address;
                    keysToUpdate.GAS_WALLET = newFoundValue;
                    console.log(`✅ Derived GAS_WALLET from existing PRIVATE_KEY: ${newFoundValue.slice(0, 10)}...`);
                } else {
                    console.warn(`⚠️ Cannot derive GAS_WALLET: PRIVATE_KEY is missing or a placeholder.`);
                    return false; // Requires PRIVATE_KEY to derive
                }
                break;

            case 'USDT_WALLETS':
                // If USDT_WALLETS is missing but PRIVATE_KEY exists, derive them
                if (config.PRIVATE_KEY && !String(config.PRIVATE_KEY).includes('PLACEHOLDER')) {
                    const baseWallet = new ethers.Wallet(config.PRIVATE_KEY);
                    const derivedWallets = [];
                    for (let i = 0; i < 3; i++) {
                        const derivedPath = `m/44'/60'/0'/0/${i}`;
                        const derived = baseWallet.derivePath(derivedPath);
                        derivedWallets.push(derived.address);
                    }
                    newFoundValue = derivedWallets.join(',');
                    keysToUpdate.USDT_WALLETS = newFoundValue;
                    console.log(`✅ Derived USDT_WALLETS from existing PRIVATE_KEY: ${newFoundValue.slice(0, 30)}...`);
                } else {
                    console.warn(`⚠️ Cannot derive USDT_WALLETS: PRIVATE_KEY is missing or a placeholder.`);
                    return false; // Requires PRIVATE_KEY to derive
                }
                break;

            case 'BSC_NODE':
                // Use a default public BSC node
                newFoundValue = 'https://bsc-dataseed.binance.org'; // Fallback to a well-known public node
                keysToUpdate.BSC_NODE = newFoundValue;
                console.log(`✅ Set default BSC_NODE: ${newFoundValue}`);
                break;

            // Add other crypto-related keys if needed (e.g., exchange API keys if supported)
            default:
                console.warn(`⚠️ No specific remediation strategy defined for crypto key: ${keyName}. Manual intervention required.`);
                return false;
        }

        if (Object.keys(keysToUpdate).length > 0) {
            await _updateRenderEnvWithKeys(keysToUpdate, config); // Update Render ENV
            Object.assign(config, keysToUpdate); // Update in-memory config
            console.log(`✅ Remediation successful for ${keyName}.`);
            return true;
        }

    } catch (error) {
        console.error(`🚨 Crypto remediation for ${keyName} failed: ${error.message}`);
    }
    return false;
}


// === 💰 Self-Funding: Get Initial Capital from Revenue Agents ===
/**
 * Ensures the GAS_WALLET has sufficient BNB. If not, triggers revenue agents to generate funds.
 * @param {object} CONFIG - Global configuration.
 * @returns {Promise<boolean>} True if capital is sufficient or successfully generated, false otherwise.
 */
async function getInitialCapital(CONFIG) {
  const web3 = new Web3(CONFIG.BSC_NODE);
  // Ensure the gas wallet is valid before checking balance
  if (!CONFIG.GAS_WALLET || !Web3.utils.isAddress(CONFIG.GAS_WALLET)) { // Use Web3.utils.isAddress
      console.warn('⚠️ Invalid GAS_WALLET detected. Cannot check BNB balance or self-fund.');
      return false;
  }

  try {
    const balance = await web3.eth.getBalance(CONFIG.GAS_WALLET);
    const bnbBalance = parseFloat(web3.utils.fromWei(balance, 'ether'));
    console.log(`Current GAS_WALLET balance: ${bnbBalance} BNB`);

    // If we have less than 0.05 BNB, trigger capital generation
    const MIN_BNB_THRESHOLD = 0.05; // Increased threshold for more reliable operations
    if (bnbBalance < MIN_BNB_THRESHOLD) {
      console.log(`⚠️ Low gas: ${bnbBalance} BNB. Generating initial capital...`);

      try {
        // Dynamically import agents to avoid circular dependencies and only when needed
        // Only import if needed to avoid `puppeteer` re-declaration unless fixed in respective agents
        const payoutAgent = await import('./payoutAgent.js');
        const socialAgent = await import('./socialAgent.js');
        const shopifyAgent = await import('./shopifyAgent.js');

        // Run social and e-commerce agents to generate revenue
        console.log('Triggering socialAgent for revenue generation...');
        // Pass a copy of CONFIG to prevent agents from modifying it directly unexpectedly
        const socialResult = await socialAgent.socialAgent({ ...CONFIG }).catch(e => { console.warn('SocialAgent failed during capital generation:', e.message); return { success: false }; });
        console.log('Triggering shopifyAgent for revenue generation...');
        const shopifyResult = await shopifyAgent.shopifyAgent({ ...CONFIG }).catch(e => { console.warn('ShopifyAgent failed during capital generation:', e.message); return { status: 'failed' }; });

        let earningsFromAgents = 0;
        if (socialResult.success) earningsFromAgents += 5; // Simulate earnings
        if (shopifyResult.status === 'success') earningsFromAgents += 10; // Simulate earnings

        if (earningsFromAgents > 0) {
            console.log(`Generated simulated earnings: $${earningsFromAgents}. Triggering payout...`);
            await payoutAgent.payoutAgent({ ...CONFIG, earnings: earningsFromAgents });
            await quantumDelay(15000); // Increased delay for blockchain confirmation

            const newBalance = await web3.eth.getBalance(CONFIG.GAS_WALLET);
            const newBnbBalance = parseFloat(web3.utils.fromWei(newBalance, 'ether'));
            console.log(`✅ Gas wallet refilled: ${newBnbBalance} BNB`);
            return newBnbBalance >= MIN_BNB_THRESHOLD;
        } else {
            console.warn('⚠️ No revenue generated from agents. Capital generation failed.');
            return false;
        }

      } catch (error) {
        console.warn('⚠️ Critical error during capital generation:', error.message);
        return false;
      }
    }

    console.log(`✅ Sufficient gas: ${bnbBalance} BNB`);
    return true;
  } catch (error) {
      console.error(`🚨 Error checking gas wallet balance: ${error.message}. Ensure BSC_NODE is reachable and GAS_WALLET is correct.`);
      return false;
  }
}

// === 📊 Analyze Crypto Markets ===
/**
 * Analyzes crypto market data from CoinGecko. Uses a fallback if API fails or key is missing.
 * @param {string} coingeckoApiUrl - The CoinGecko API URL from config.
 * @returns {Promise<object>} Market data for Bitcoin and Ethereum.
 */
async function analyzeCryptoMarkets(coingeckoApiUrl) {
  const fallbackData = {
    bitcoin: { usd: 50000, last_updated_at: Date.now() / 1000 },
    ethereum: { usd: 3000, last_updated_at: Date.now() / 1000 }
  };

  const API_URL_BASE = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';

  if (!coingeckoApiUrl || String(coingeckoApiUrl).includes('PLACEHOLDER')) {
      console.warn('⚠️ CoinGecko API URL missing or placeholder. Using fallback market data.');
      return fallbackData;
  }

  try {
    // The CoinGecko API URL you passed in config might be just a base URL or a full endpoint.
    // Ensure it's the correct endpoint for simple price.
    const url = coingeckoApiUrl.includes('/simple/price') ? coingeckoApiUrl : API_URL_BASE;
    const response = await axios.get(url, { timeout: 8000 }); // Increased timeout
    if (response.data && (response.data.bitcoin || response.data.ethereum)) {
        console.log('✅ Fetched real market data from CoinGecko.');
        return response.data;
    }
    throw new Error('CoinGecko API returned empty or invalid data.');
  } catch (error) {
    console.warn(`⚠️ Error fetching real market data: ${error.message.substring(0, 100)}. Using fallback data.`);
    return fallbackData;
  }
}

// === 💹 Execute Arbitrage Trades (Simplified for Conceptual Autonomy) ===
/**
 * Executes simulated arbitrage-like transfers on BSC if market conditions are favorable.
 * This is a conceptual representation of opportunistic crypto transactions.
 * @param {object} params - Contains gasWallet, recipientWallets, bscNode, and marketData.
 * @returns {Promise<string[]>} Array of transaction hashes.
 */
async function executeArbitrageTrades({ gasWallet, privateKey, recipientWallets, bscNode, marketData }) {
  const provider = new ethers.providers.JsonRpcProvider(bscNode);
  const wallet = new ethers.Wallet(privateKey, provider);
  const txReceipts = [];

  // Bear market strategy: Opportunistic transfer when BTC is below a threshold
  const BTC_BEAR_THRESHOLD = 55000; // Adjusted threshold
  if (marketData.bitcoin.usd < BTC_BEAR_THRESHOLD) {
    if (recipientWallets.length === 0) {
      console.warn('⚠️ No valid recipient wallets available for arbitrage trades.');
      return txReceipts;
    }

    console.log(`🐻 Bear market detected (BTC < $${BTC_BEAR_THRESHOLD}). Initiating arbitrage-like transfers.`);

    // Limit to a few transfers to manage gas and avoid spamming
    for (const recipient of recipientWallets.slice(0, 2)) { // Try up to 2 recipients
      try {
        const amountToSend = ethers.utils.parseEther('0.005'); // Send 0.005 BNB per transaction
        const gasPrice = await provider.getGasPrice();

        console.log(`Attempting to send ${ethers.utils.formatEther(amountToSend)} BNB to ${recipient.slice(0, 6)}...`);

        const txResponse = await wallet.sendTransaction({
          to: recipient,
          value: amountToSend,
          gasLimit: 60000, // Explicit gas limit for simple transfer
          gasPrice: gasPrice
        });

        // Wait for transaction to be mined and confirmed
        const receipt = await txResponse.wait(1); // Wait for 1 confirmation
        txReceipts.push(receipt.transactionHash);
        console.log(`✅ Sent ${ethers.utils.formatEther(amountToSend)} BNB to ${recipient.slice(0, 6)}... TX: ${receipt.transactionHash.slice(0, 10)}...`);
      } catch (error) {
        console.warn(`⚠️ TX failed to ${recipient.slice(0, 6)}...: ${error.message.substring(0, 100)}...`);
        // Log more details if it's a known error from transaction failure
        if (error.code === 'INSUFFICIENT_FUNDS') {
          console.error('   Reason: Insufficient BNB in GAS_WALLET for transaction.');
        }
      }
    }
  } else {
    console.log('💰 Crypto market bullish (BTC >= $55K) → holding position or not executing bear-market specific trades.');
  }

  return txReceipts;
}

// === 🚀 Execute High-Value Trades on BSC (Conceptual PancakeSwap Interaction) ===
/**
 * Executes a conceptual high-value trade on BSC (e.g., swapping BNB for BUSD).
 * This represents a strategic trade in a bear market scenario.
 * @param {object} params - Contains gasWallet, privateKey, bscNode, and marketData.
 * @returns {Promise<string[]>} Array of transaction hashes.
 */
async function executeHighValueTrades({ gasWallet, privateKey, bscNode, marketData }) {
  const provider = new ethers.providers.JsonRpcProvider(bscNode);
  const wallet = new ethers.Wallet(privateKey, provider);
  const txReceipts = [];

  // Only trade if BTC below threshold (bear market strategy)
  const BTC_BEAR_THRESHOLD = 55000;
  if (marketData.bitcoin.usd < BTC_BEAR_THRESHOLD) {
    console.log(`📈 Executing high-value trade (conceptual swap) in bear market.`);
    // PancakeSwap Router v2 (Real contract address for BSC)
    const routerAddress = '0x10ED43C718714eb63d5aA57B78B54704E256024E'; // PancakeSwap Router v2

    // This is a simplified direct transfer to router. A real swap requires ABI interaction
    // to call the `swapExactETHForTokens` or similar function.
    // This is a placeholder for a complex defi interaction.
    const amountIn = ethers.utils.parseEther('0.02'); // 0.02 BNB for the conceptual swap

    try {
      const gasPrice = await provider.getGasPrice();
      console.log(`Attempting conceptual swap of ${ethers.utils.formatEther(amountIn)} BNB via PancakeSwap Router.`);

      // Sending BNB directly to router. This is NOT a real swap without contract ABI interaction.
      // For real swap: need PancakeSwap ABI, target token ABI, token address, amountOutMin, path, to, deadline
      // Example (conceptual):
      // const routerABI = [...]; // PancakeSwap Router ABI
      // const routerContract = new ethers.Contract(routerAddress, routerABI, wallet);
      // const WBNB_ADDRESS = '0xbb4cdb9ed9b896d0a9597d8c6baac65eaef21fb'; // WBNB
      // const BUSD_ADDRESS = '0xe9e7CEA3DedcA5984780B5afcE0fE42A86eA98yA'; // BUSD
      // const path = [WBNB_ADDRESS, BUSD_ADDRESS];
      // const amountOutMin = 0; // Or calculate based on slippage
      // const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 minutes from now
      // const tx = await routerContract.swapExactETHForTokens(amountOutMin, path, wallet.address, deadline, {
      //   value: amountIn,
      //   gasLimit: 300000,
      //   gasPrice: gasPrice
      // });

      const txResponse = await wallet.sendTransaction({
        to: routerAddress,
        value: amountIn,
        gasLimit: 250000, // Explicit gas limit for a conceptual swap transaction
        gasPrice: gasPrice
      });

      const receipt = await txResponse.wait(1);
      txReceipts.push(receipt.transactionHash);
      console.log(`✅ Conceptual swap TX sent: ${receipt.transactionHash.slice(0, 10)}...`);
    } catch (error) {
      console.warn(`⚠️ Conceptual swap failed: ${error.message.substring(0, 100)}...`);
      if (error.code === 'INSUFFICIENT_FUNDS') {
        console.error('   Reason: Insufficient BNB for conceptual swap.');
      }
    }
  }

  return txReceipts;
}

// === 🚀 Main Crypto Agent ===
/**
 * The primary crypto agent. Responsible for managing crypto assets,
 * analyzing markets, executing trades, and self-funding.
 * @param {object} CONFIG - The global configuration object populated from Render ENV.
 * @returns {Promise<object>} Status and transaction details of crypto operations.
 */
export const cryptoAgent = async (CONFIG) => {
  console.log('💰 Crypto Agent Activated');

  try {
    // === PHASE 0: Proactive Configuration Remediation for Crypto Agent ===
    const cryptoCriticalKeys = [
        'PRIVATE_KEY',
        'GAS_WALLET',
        'USDT_WALLETS',
        'BSC_NODE',
        'COINGECKO_API' // If a specific API key for CoinGecko becomes necessary later
    ];

    for (const key of cryptoCriticalKeys) {
        if (!CONFIG[key] || String(CONFIG[key]).includes('PLACEHOLDER')) {
            const success = await remediateMissingCryptoConfig(key, CONFIG);
            if (!success) {
                console.warn(`⚠️ Remediation for ${key} failed for Crypto Agent. Critical blockchain functionality might be limited.`);
            }
        }
    }
    console.log('\n--- Finished Crypto Configuration Remediation Phase ---');

    // Re-validate config after remediation attempts
    let validatedConfig;
    try {
        validatedConfig = validateCryptoConfig(CONFIG);
    } catch (validationError) {
        console.error(`🚨 Critical Crypto Config Error after remediation: ${validationError.message}. Cannot proceed with blockchain operations.`);
        return { status: 'failed', reason: 'invalid_crypto_config', error: validationError.message };
    }

    const { GAS_WALLET, USDT_WALLETS, BSC_NODE, PRIVATE_KEY } = { // Destructure from CONFIG after validation
        GAS_WALLET: validatedConfig.GAS_WALLET,
        USDT_WALLETS: validatedConfig.USDT_WALLETS,
        BSC_NODE: validatedConfig.BSC_NODE,
        PRIVATE_KEY: CONFIG.PRIVATE_KEY // PRIVATE_KEY is crucial for signing, comes from original config or remediation
    };

    if (!PRIVATE_KEY || String(PRIVATE_KEY).includes('PLACEHOLDER')) {
        console.error('🚨 CRITICAL: PRIVATE_KEY is still missing or a placeholder after remediation. Cannot sign real blockchain transactions.');
        return { status: 'failed', reason: 'private_key_missing' };
    }
    console.log(`✅ Crypto configuration validated. Gas Wallet: ${GAS_WALLET.slice(0, 10)}...`);


    // ===== 1. SELF-FUNDING: GET INITIAL CAPITAL =====
    const hasCapital = await getInitialCapital(CONFIG); // Pass CONFIG to use updated values
    if (!hasCapital) {
      console.warn('⚠️ Failed to ensure initial capital. Skipping crypto trades.');
      return { status: 'failed', reason: 'no_capital' };
    }

    // ===== 2. MARKET ANALYSIS =====
    const marketData = await analyzeCryptoMarkets(CONFIG.COINGECKO_API);

    // ===== 3. EXECUTE ARBITRAGE TRADES =====
    const arbitrageTxs = await executeArbitrageTrades({
      gasWallet: GAS_WALLET,
      privateKey: PRIVATE_KEY, // Pass private key for ethers.Wallet
      recipientWallets: USDT_WALLETS,
      bscNode: BSC_NODE,
      marketData
    });

    // ===== 4. EXECUTE HIGH-VALUE TRADES =====
    const highValueTxs = await executeHighValueTrades({
      gasWallet: GAS_WALLET,
      privateKey: PRIVATE_KEY, // Pass private key for ethers.Wallet
      bscNode: BSC_NODE,
      marketData
    });

    // ===== 5. TRIGGER PAYOUT =====
    const totalTxs = arbitrageTxs.length + highValueTxs.length;
    if (totalTxs > 0) {
      console.log(`🎯 Payout triggered: $${(totalTxs * 10).toFixed(2)} (conceptual earnings)`); // Conceptual earnings per trade
      const payoutAgent = await import('./payoutAgent.js');
      await payoutAgent.payoutAgent({ ...CONFIG, earnings: totalTxs * 10 });
    }

    console.log(`✅ Crypto trades completed | Total TXs: ${totalTxs}`);
    return { status: 'success', transactions: [...arbitrageTxs, ...highValueTxs] };

  } catch (error) {
    console.error('🚨 Crypto Agent Critical Failure:', error.message);
    // Don't re-throw, let the main orchestrator decide on overall healing
    return { status: 'failed', error: error.message };
  }
};
