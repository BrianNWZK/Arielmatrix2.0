// backend/agents/adsenseAgent.js
import axios from 'axios';

export const adsenseAgent = async (CONFIG) => {
  try {
    if (!CONFIG.ADSENSE_API_KEY || CONFIG.ADSENSE_API_KEY.includes('mock')) {
      console.log('❌ AdSense API key missing or mocked. Skipping.');
      return { earnings: 0, pageViews: 0 };
    }

    // Real AdSense API endpoint (Google AdSense Reporting API)
    const response = await axios.get('https://adsense.googleapis.com/v2/accounts/pub-123456789/reports', {
      headers: { Authorization: `Bearer ${CONFIG.ADSENSE_API_KEY}` },
      params: {
        dateRange: 'TODAY',
        metrics: ['PAGE_VIEWS', 'AD_REQUESTS', 'ESTIMATED_EARNINGS'],
        dimensions: ['DATE']
      },
      timeout: 10000
    });

    const rows = response.data.rows || [];
    const today = new Date().toISOString().split('T')[0];
    const todayData = rows.find(r => r.dimensionValues?.[0]?.value === today);

    const earnings = parseFloat(todayData?.metricValues?.ESTIMATED_EARNINGS?.value || 0);
    const pageViews = parseInt(todayData?.metricValues?.PAGE_VIEWS?.value || 0);

    console.log(`📊 AdSense earnings today: $${earnings.toFixed(2)} (${pageViews} views)`);

    // If earnings > $5, trigger payout
    if (earnings > 5) {
      console.log('🎯 AdSense payout threshold reached. Triggering payoutAgent...');
      const { payoutAgent } = await import('./payoutAgent.js');
      await payoutAgent({ ...CONFIG, ADSENSE_EARNINGS: earnings });
    }

    return { earnings, pageViews, status: 'success' };
  } catch (error) {
    console.error('AdSense Agent Error:', error.message);
    return { earnings: 0, pageViews: 0, status: 'failed' };
  }
};
