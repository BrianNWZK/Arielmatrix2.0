import axios from 'axios';

export const fetchAdSenseData = async (CONFIG) => {
  try {
    // Mock AdSense API call (replace with actual AdSense API endpoint and key)
    const response = await axios.get('https://api.adsense.example.com/v2/accounts/adsense_account/reports', {
      headers: { Authorization: `Bearer ${CONFIG.ADSENSE_API_KEY || 'mock_adsense_key'}` },
      params: {
        dateRange: 'TODAY',
        metrics: ['PAGE_VIEWS', 'AD_REQUESTS', 'EARNINGS'],
      },
      timeout: 10000,
    });
    return response.data || {
      pageViews: 1000,
      adRequests: 800,
      earnings: 10.50,
    };
  } catch (error) {
    console.error('AdSense API Error:', error);
    return {
      pageViews: 0,
      adRequests: 0,
      earnings: 0,
    };
  }
};
