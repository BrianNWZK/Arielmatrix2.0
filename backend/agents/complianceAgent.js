import axios from 'axios';

export const complianceAgent = async (CONFIG) => {
  try {
    if (!CONFIG.USDT_WALLETS.length || !process.env.CHAINALYSIS_API_KEY) {
      throw new Error('USDT wallets or Chainalysis API key missing');
    }
    const response = await axios.post('https://api.chainalysis.com/kyt', {
      wallets: CONFIG.USDT_WALLETS,
    }, { headers: { 'Authorization': `Bearer ${process.env.CHAINALYSIS_API_KEY}` } });
    return response.data;
  } catch (error) {
    console.error('ComplianceAgent Error:', error);
    throw error;
  }
};
