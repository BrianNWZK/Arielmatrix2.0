import Web3 from 'web3';
import axios from 'axios';

export const cryptoAgent = async (CONFIG) => {
  try {
    if (!CONFIG.GAS_WALLET || !CONFIG.USDT_WALLETS.length) {
      throw new Error('Gas wallet or USDT wallets missing');
    }
    const web3 = new Web3(CONFIG.BSC_NODE);
    const priceData = await axios.get(CONFIG.COINGECKO_API);
    const btcPrice = priceData.data.bitcoin.usd;
    if (btcPrice < 50000) {
      const contract = new web3.eth.Contract(PancakeSwapABI, '0x10ED43C718714eb63d5aA57B78B54704E256024E');
      const amountIn = web3.utils.toWei('1', 'ether');
      const gasPrice = await axios.get(`https://api.bscscan.com/api?module=gastracker&action=gasoracle&apikey=${process.env.BSCSCAN_API_KEY || CONFIG.BSCSCAN_API_KEY}`);
      const tx = await contract.methods.swapExactTokensForTokens(
        amountIn,
        0,
        ['0x55d398326f99059ff775485246999027b3197955', '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c'],
        CONFIG.USDT_WALLETS[0],
        Math.floor(Date.now() / 1000) + 60 * 10
      ).send({ from: CONFIG.GAS_WALLET, gasPrice: gasPrice.data.result.SafeGasPrice });
      console.log('Trade executed:', tx);
    }
  } catch (error) {
    console.error('CryptoAgent Error:', error);
    throw error;
  }
};
