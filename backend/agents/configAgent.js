import { EnhancedCryptoAgent } from './cryptoAgent.js';
import { EnhancedShopifyAgent } from './shopifyAgent.js';
import { socialAgent } from './socialAgent.js';
import { forexSignalAgent } from './forexSignalAgent.js';
import { dataAgent } from './dataAgent.js';
import { adsenseAgent } from './adsenseAgent.js';
import   adRevenueAgent  from './adRevenueAgent.js';
import { AutonomousAIEngine } from './autonomous-ai-engine.js';
import { serviceManager } from '../../arielsql_suite/serviceManager.js';

export const configAgent = async (CONFIG) => {
  try {
    const results = {};

    if (CONFIG.enableCrypto) {
      const cryptoResult = await cryptoAgent(CONFIG.crypto);
      ServiceManager.register('cryptoAgent', cryptoResult);
      results.crypto = cryptoResult;
    }

    if (CONFIG.enableShopify) {
      const shopifyResult = await shopifyAgent(CONFIG.shopify);
      ServiceManager.register('shopifyAgent', shopifyResult);
      results.shopify = shopifyResult;
    }

    if (CONFIG.enableSocial) {
      const socialResult = await socialAgent(CONFIG.social);
      ServiceManager.register('socialAgent', socialResult);
      results.social = socialResult;
    }

    if (CONFIG.enableForex) {
      const forexResult = await forexSignalAgent(CONFIG.forex);
      ServiceManager.register('forexSignalAgent', forexResult);
      results.forex = forexResult;
    }

    if (CONFIG.enableData) {
      const dataResult = await dataAgent(CONFIG.data);
      ServiceManager.register('dataAgent', dataResult);
      results.data = dataResult;
    }

    if (CONFIG.enableAdsense) {
      const adsenseResult = await adsenseAgent(CONFIG.adsense);
      ServiceManager.register('adsenseAgent', adsenseResult);
      results.adsense = adsenseResult;
    }

    if (CONFIG.enableAdRevenue) {
      const adRevenueResult = await adRevenueAgent(CONFIG.adRevenue);
      ServiceManager.register('adRevenueAgent', adRevenueResult);
      results.adRevenue = adRevenueResult;
    }

    if (CONFIG.enableAutonomousAI) {
      const aiResult = await autonomousAIEngine(CONFIG.autonomousAI);
      ServiceManager.register('autonomousAIEngine', aiResult);
      results.autonomousAI = aiResult;
    }

    return results;
  } catch (error) {
    console.error('ConfigAgent Error:', error);
    throw error;
  }
};

export default configAgent;
