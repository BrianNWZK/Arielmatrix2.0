// backend/hardhat.config.js
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

// Autonomous ENV loader (uses existing renderApiAgent)
const loadQuantumEnv = async () => {
  try {
    const { initQuantumEnv } = await import('./agents/renderApiAgent.js');
    return initQuantumEnv();
  } catch {
    return {
      QUANTUM_MODE: 'true',
      QUANTUM_API_KEY: 'AUTO-FALLBACK'
    };
  }
};

const quantumEnv = await loadQuantumEnv();

const config = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    bsc: {
      url: 'https://bsc-dataseed.binance.org/',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 56,
      timeout: 60000,
    },
    solana: {
      url: 'https://api.mainnet-beta.solana.com',
      chainId: 'solana-mainnet',
    },
  },
  paths: {
    artifacts: './artifacts',
    sources: './backend/contracts',
  },
  mocha: {
    timeout: 40000,
  },
  // Silent quantum mode
  quantum: {
    enabled: quantumEnv.QUANTUM_MODE === 'true',
    apiKey: quantumEnv.QUANTUM_API_KEY,
    // No external dependencies
    selfManaged: true
  }
};

export default config;
