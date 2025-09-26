import { CONFIG } from '../../config/bwaezi-config.js';
import { validateWallets } from '../wallet.js';
import { serviceManager } from '../../arielsql_suite/serviceManager.js';
import { GovernanceEngine } from '../../modules/governance-engine/index.js';
import { TokenomicsEngine } from '../../modules/tokenomics-engine/index.js';

export const complianceAgent = async () => {
  try {
    const { ETH_WALLETS, USDT_WALLETS, SOL_WALLETS } = CONFIG;

    const allWallets = [
      ...ETH_WALLETS,
      ...USDT_WALLETS,
      ...SOL_WALLETS
    ];

    if (!allWallets.length) {
      throw new Error('No wallet addresses provided');
    }

    const validWallets = validateWallets(allWallets);
    if (!validWallets.length) {
      throw new Error('No valid wallet addresses found');
    }

    const filteredWallets = GovernanceEngine.filterByPolicy(validWallets);
    const scoredWallets = TokenomicsEngine.scoreWallets(filteredWallets);

    ServiceManager.register('complianceAgent', scoredWallets);

    return scoredWallets;
  } catch (error) {
    console.error('ComplianceAgent Error:', error);
    throw error;
  }
};
