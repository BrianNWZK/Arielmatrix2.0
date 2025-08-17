// backend/agents/adsenseAgent.js
import axios from 'axios';

/**
 * @function adsenseAgent
 * @description Fetches AdSense earnings data, calculates key performance metrics,
 * suggests optimizations, and triggers payouts based on configured thresholds.
 * Integrates with a global logger and Redis for data persistence.
 *
 * Cost Considerations:
 * - AdSense API: Generally free for reporting usage within reasonable limits.
 * The primary "cost" related to AdSense is the AdSense platform itself,
 * which is a revenue stream for the user, not an expenditure.
 * - Axios: A free, open-source HTTP client.
 * - Redis: Can be run locally for free, or accessed via paid cloud services.
 * To keep this agent's operation truly zero-cost on the infrastructure side,
 * consider self-hosting Redis or using a free tier provided by cloud providers.
 *
 * @param {object} CONFIG - The global configuration object, including API keys and thresholds.
 * @param {object} logger - The global logger instance for consistent logging.
 * @param {object} [redisClient=null] - Optional Redis client for caching data.
 * @returns {Promise<object>} An object containing fetched earnings, page views, and status.
 */
export const adsenseAgent = async (CONFIG, logger, redisClient = null) => {
    try {
        logger.info('📊 Starting adsenseAgent...');

        // Validate required keys and ensure it's not a mock key
        if (!CONFIG.ADSENSE_API_KEY || CONFIG.ADSENSE_API_KEY.includes('mock') || !CONFIG.ADSENSE_ACCOUNT_ID) {
            logger.warn('❌ AdSense API key, account ID missing, or mocked. Skipping AdSense data retrieval.');
            return { earnings: 0, pageViews: 0, status: 'skipped', message: 'Missing AdSense credentials' };
        }

        // Define the date range for the report (e.g., 'LAST_7_DAYS', 'TODAY')
        // We'll fetch for the last 7 days to enable basic trend analysis.
        const dateRange = 'LAST_7_DAYS'; // Can be made configurable in CONFIG later
        const today = new Date().toISOString().split('T')[0];

        // Google AdSense Reporting API endpoint
        const adsenseReportUrl = `https://adsense.googleapis.com/v2/accounts/${CONFIG.ADSENSE_ACCOUNT_ID}/reports:generate`;

        const response = await axios.get(adsenseReportUrl, {
            headers: { Authorization: `Bearer ${CONFIG.ADSENSE_API_KEY}` },
            params: {
                dateRange: dateRange,
                metrics: ['PAGE_VIEWS', 'AD_REQUESTS', 'ESTIMATED_EARNINGS', 'COST_PER_MILLE'], // Added CPM
                dimensions: ['DATE'],
                currencyCode: CONFIG.ADSENSE_CURRENCY || 'USD' // Allow configurable currency
            },
            timeout: 15000 // Increased timeout for API call for robustness
        });

        const rows = response.data.rows || [];
        let totalEarnings = 0;
        let totalPageViews = 0;
        let totalAdRequests = 0;
        let dailyEarnings = {};

        // Process data for the specified date range
        rows.forEach(row => {
            const date = row.dimensionValues?.[0]?.value;
            const earnings = parseFloat(row.metricValues?.ESTIMATED_EARNINGS?.value || 0);
            const pageViews = parseInt(row.metricValues?.PAGE_VIEWS?.value || 0);
            const adRequests = parseInt(row.metricValues?.AD_REQUESTS?.value || 0);

            if (date) {
                dailyEarnings[date] = { earnings, pageViews, adRequests };
                totalEarnings += earnings;
                totalPageViews += pageViews;
                totalAdRequests += adRequests;
            }
        });

        // Get today's data specifically
        const todayData = dailyEarnings[today] || { earnings: 0, pageViews: 0, adRequests: 0 };
        const currentEarnings = todayData.earnings;
        const currentPageViews = todayData.pageViews;
        const currentAdRequests = todayData.adRequests;

        logger.info(`📊 AdSense today's earnings: $${currentEarnings.toFixed(2)} (${currentPageViews} views, ${currentAdRequests} ad requests)`);
        logger.info(`📈 AdSense ${dateRange} summary: Total $${totalEarnings.toFixed(2)} across ${totalPageViews} views.`);

        // === Novelty Feature 1: Performance Insights & Optimization Suggestions ===
        const earningsPerPageView = currentPageViews > 0 ? currentEarnings / currentPageViews : 0;
        const adRequestsPerPageView = currentPageViews > 0 ? currentAdRequests / currentPageViews : 0;
        // Fill rate (ad requests that resulted in an ad served)
        const fillRate = totalAdRequests > 0 ? (totalPageViews / totalAdRequests) * 100 : 0;

        logger.info(`✨ Performance Metrics:`);
        logger.info(`   - Earnings Per Page View (EPPV) Today: $${earningsPerPageView.toFixed(4)}`);
        logger.info(`   - Ad Requests Per Page View Today: ${adRequestsPerPageView.toFixed(2)}`);
        logger.info(`   - Fill Rate (${dateRange}): ${fillRate.toFixed(2)}%`);

        if (earningsPerPageView < (CONFIG.ADSENSE_EPPV_THRESHOLD || 0.005)) { // Configurable threshold for EPPV
            logger.suggest('💡 Suggestion: Low Earnings Per Page View. Consider optimizing ad placements, improving content quality, or increasing traffic from higher-value regions.');
        }
        if (fillRate < (CONFIG.ADSENSE_FILL_RATE_THRESHOLD || 70)) { // Configurable threshold for fill rate
            logger.suggest('💡 Suggestion: Low Ad Fill Rate. This might indicate issues with ad serving or a need for more diverse ad networks. Ensure your ads.txt is correctly configured.');
        }

        // === Novelty Feature 2: Basic Predictive Trend ===
        if (rows.length >= 2) {
            // Simple daily average for the period
            const avgDailyEarnings = totalEarnings / rows.length;
            logger.info(`🔮 Daily Average Earnings (${dateRange}): $${avgDailyEarnings.toFixed(2)}`);
            // Very basic projection: If trends continue, monthly projection (30 days)
            const projectedMonthlyEarnings = avgDailyEarnings * 30;
            logger.info(`🔮 Projected Monthly Earnings: $${projectedMonthlyEarnings.toFixed(2)} (based on ${dateRange} average)`);
        } else {
            logger.info('🔮 Not enough historical data to project trends (requires at least 2 days).');
        }

        // === Novelty Feature 3: Conceptual A/B Testing Suggestion ===
        logger.info('🧪 Future Idea: Integrate with an A/B testing framework to optimize ad unit sizes, positions, and types. This agent could then analyze test results to recommend optimal configurations.');


        // === 💸 Trigger Payout ===
        const payoutThreshold = CONFIG.ADSENSE_PAYOUT_THRESHOLD || 10; // Default payout threshold
        if (currentEarnings >= payoutThreshold) { // Trigger if today's earnings meet threshold
            logger.info(`🎯 AdSense payout threshold ($${payoutThreshold.toFixed(2)}) reached today. Triggering payoutAgent...`);
            const payoutAgentModule = await import('./payoutAgent.js');
            await payoutAgentModule.payoutAgent({ ...CONFIG, ADSENSE_EARNINGS: currentEarnings }, logger);
        } else {
            logger.info(`💰 Current earnings $${currentEarnings.toFixed(2)} below payout threshold $${payoutThreshold.toFixed(2)}. No payout triggered.`);
        }

        // === 🗄️ Save to Redis ===
        if (redisClient) {
            try {
                // Store daily data for historical tracking
                await redisClient.set(`adsense:daily:${today}`, JSON.stringify(todayData), { EX: 86400 * 30 }); // Store for 30 days
                // Store weekly/period data
                await redisClient.set(`adsense:period:${dateRange}`, JSON.stringify({ totalEarnings, totalPageViews, totalAdRequests, dailyEarnings, timestamp: new Date().toISOString() }), { EX: 86400 * 7 }); // Store for 7 days
                logger.info('✅ Saved AdSense data to Redis.');
            } catch (redisError) {
                logger.error(`🚨 Failed to save AdSense data to Redis: ${redisError.message}`);
            }
        }

        return { earnings: currentEarnings, pageViews: currentPageViews, totalEarnings, totalPageViews, status: 'success', message: 'AdSense data retrieved and processed.' };
    } catch (error) {
        logger.error(`🚨 AdSense Agent critical ERROR: ${error.message}`);
        return { earnings: 0, pageViews: 0, status: 'failed', message: error.message };
    }
};
