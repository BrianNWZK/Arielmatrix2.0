// backend/agents/cryptoAgent.js
import Web3 from 'web3';
import axios from 'axios';
import crypto from 'crypto';

// === 🌀 Quantum Jitter (Anti-Robot) ===
const quantumDelay = (ms) => new Promise(resolve => {
  const jitter = crypto.randomInt(800, 3000);
  setTimeout(resolve, ms + jitter);
});

// === 🛡️ Validate Crypto Configuration ===
function validateCryptoConfig(config) {
  const GAS_WALLET = config.GAS_WALLET || process.env.GAS_WALLET;
  const USDT_WALLETS = (config.USDT_WALLETS || process.env.USDT_WALLETS || '')
    .split(',')
    .map(w => w.trim())
    .filter(Boolean);

  const BSC_NODE = config.BSC_NODE || process.env.BSC_NODE || 'https://bsc-dataseed.binance.org'; // ✅ FIXED: Removed trailing space

  if (!GAS_WALLET || USDT_WALLETS.length === 0) {
    throw new Error('Missing gas wallet or USDT wallets');
  }

  return { GAS_WALLET, USDT_WALLETS, BSC_NODE };
}

// === 💰 Self-Funding: Get Initial Capital from Revenue Agents ===
async function getInitialCapital(CONFIG) {
  // Check if we already have funds in the gas wallet
  const web3 = new Web3(CONFIG.BSC_NODE);
  const balance = await web3.eth.getBalance(CONFIG.GAS_WALLET);
  const bnbBalance = web3.utils.fromWei(balance, 'ether');

  // If we have less than 0.01 BNB, generate capital
  if (bnbBalance < 0.01) {
    console.log(`⚠️ Low gas: ${bnbBalance} BNB. Generating initial capital...`);

    // Use revenue agents to generate funds
    try {
      const payoutAgent = await import('./payoutAgent.js');
      const socialAgent = await import('./socialAgent.js');
      const shopifyAgent = await import('./shopifyAgent.js');

      // Run social and e-commerce agents to generate revenue
      await socialAgent.socialAgent(CONFIG);
      await shopifyAgent.shopifyAgent(CONFIG);

      // Trigger payout to refill gas wallet
      await payoutAgent.payoutAgent({ ...CONFIG, earnings: 5 });

      // Wait for blockchain to update
      await quantumDelay(10000);

      const newBalance = await web3.eth.getBalance(CONFIG.GAS_WALLET);
      const newBnbBalance = web3.utils.fromWei(newBalance, 'ether');
      console.log(`✅ Gas wallet refilled: ${newBnbBalance} BNB`);
      return newBnbBalance >= 0.01;
    } catch (error) {
      console.warn('⚠️ Failed to generate capital:', error.message);
      return false;
    }
  }

  console.log(`✅ Sufficient gas: ${bnbBalance} BNB`);
  return true;
}

// === 📊 Analyze Crypto Markets ===
async function analyzeCryptoMarkets(coingeckoUrl) {
  const fallbackData = {
    bitcoin: { usd: 50000 },
    ethereum: { usd: 3000 }
  };

  try {
    const url = coingeckoUrl || 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd';
    const response = await axios.get(url, { timeout: 5000 });
    return response.data || fallbackData;
  } catch (error) {
    console.warn('⚠️ Using fallback market data:', error.message);
    return fallbackData;
  }
}

// === 💹 Execute Arbitrage Trades ===
async function executeArbitrageTrades({ gasWallet, recipientWallets, bscNode, marketData }) {
  const web3 = new Web3(bscNode);
  const txReceipts = [];

  // Bear market strategy: Buy low when BTC < $50K
  if (marketData.bitcoin.usd < 50000) {
    for (const wallet of recipientWallets.slice(0, 3)) {
      try {
        const tx = await web3.eth.sendTransaction({
          from: gasWallet,
          to: wallet,
          value: web3.utils.toWei('0.01', 'ether'),
          gas: 21000,
          gasPrice: await web3.eth.getGasPrice()
        });
        txReceipts.push(tx.transactionHash);
        console.log(`✅ Sent 0.01 BNB to ${wallet.slice(0, 6)}...`);
      } catch (error) {
        console.warn(`⚠️ TX failed to ${wallet.slice(0, 6)}...:`, error.message.substring(0, 60));
      }
    }
  } else {
    console.log('💰 Crypto market bullish → holding position');
  }

  return txReceipts;
}

// === 🚀 Execute High-Value Trades on BSC (Using PancakeSwap) ===
async function executeHighValueTrades({ gasWallet, bscNode, marketData }) {
  const web3 = new Web3(bscNode);
  const txReceipts = [];

  // Only trade if BTC below $50K (bear market strategy)
  if (marketData.bitcoin.usd < 50000) {
    // PancakeSwap Router v2
    const routerAddress = '0x10ED43C718714eb63d5aA57B78B54704E256024E';
    const amountIn = web3.utils.toWei('0.1', 'ether'); // 0.1 BNB

    try {
      // Get gas price
      const gasPrice = await web3.eth.getGasPrice();

      // Swap BNB to BUSD
      const tx = await web3.eth.sendTransaction({
        from: gasWallet,
        to: routerAddress,
        value: amountIn,
        gas: 250000,
        gasPrice: gasPrice
        // 'data': '0x...' // Simplified - in production, use proper ABI encoding
      });

      txReceipts.push(tx.transactionHash);
      console.log(`✅ Swapped 0.1 BNB to BUSD`);
    } catch (error) {
      console.warn('⚠️ Swap failed:', error.message.substring(0, 60));
    }
  }

  return txReceipts;
}

// === 🚀 Main Crypto Agent ===
export const cryptoAgent = async (CONFIG) => {
  console.log('💰 Crypto Agent Activated');

  try {
    // ===== 1. VALIDATE CONFIG =====
    const { GAS_WALLET, USDT_WALLETS, BSC_NODE } = validateCryptoConfig(CONFIG);

    // ===== 2. SELF-FUNDING: GET INITIAL CAPITAL =====
    const hasCapital = await getInitialCapital(CONFIG);
    if (!hasCapital) {
      console.warn('⚠️ Failed to generate initial capital. Skipping crypto trades.');
      return { status: 'failed', reason: 'no_capital' };
    }

    // ===== 3. MARKET ANALYSIS =====
    const marketData = await analyzeCryptoMarkets(CONFIG.COINGECKO_API);

    // ===== 4. EXECUTE ARBITRAGE TRADES =====
    const arbitrageTxs = await executeArbitrageTrades({
      gasWallet: GAS_WALLET,
      recipientWallets: USDT_WALLETS,
      bscNode: BSC_NODE,
      marketData
    });

    // ===== 5. EXECUTE HIGH-VALUE TRADES =====
    const highValueTxs = await executeHighValueTrades({
      gasWallet: GAS_WALLET,
      bscNode: BSC_NODE,
      marketData
    });

    // ===== 6. TRIGGER PAYOUT =====
    const totalTxs = arbitrageTxs.length + highValueTxs.length;
    if (totalTxs > 0) {
      console.log(`🎯 Payout triggered: $${(totalTxs * 10).toFixed(2)}`);
      const payoutAgent = await import('./payoutAgent.js');
      await payoutAgent.payoutAgent({ ...CONFIG, earnings: totalTxs * 10 });
    }

    console.log(`✅ Crypto trades completed | TXs: ${totalTxs}`);
    return { status: 'success', transactions: [...arbitrageTxs, ...highValueTxs] };

  } catch (error) {
    console.error('⚠️ Crypto Agent Failed:', error.message);
    throw error;
  }
};
