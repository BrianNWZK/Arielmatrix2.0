import { EnhancedcryptoAgent } from './cryptoAgent.js';
import { EnhancedShopifyAgent } from './shopifyAgent.js';
import { socialAgent } from './socialAgent.js';
import { forexSignalAgent } from './forexSignalAgent.js';
import { dataAgent } from './dataAgent.js';
import { adsenseAgent } from './adsenseAgent.js';
import { adRevenueAgent } from './adRevenueAgent.js';

export const configAgent = async (CONFIG) => {
  try {
    const results = {};

    if (CONFIG.enableCrypto) {
      results.crypto = await cryptoAgent(CONFIG.crypto);
    }

    if (CONFIG.enableShopify) {
      results.shopify = await shopifyAgent(CONFIG.shopify);
    }

    if (CONFIG.enableSocial) {
      results.social = await socialAgent(CONFIG.social);
    }

    if (CONFIG.enableForex) {
      results.forex = await forexSignalAgent(CONFIG.forex);
    }

    if (CONFIG.enableData) {
      results.data = await dataAgent(CONFIG.data);
    }

    if (CONFIG.enableAdsense) {
      results.adsense = await adsenseAgent(CONFIG.adsense);
    }

    if (CONFIG.enableAdRevenue) {
      results.adRevenue = await adRevenueAgent(CONFIG.adRevenue);
    }

    return results;
  } catch (error) {
    console.error('ConfigAgent Error:', error);
    throw error;
  }
};
