// backend/hardhat.config.js
import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

const config = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    bsc: {
      url: 'https://bsc-dataseed.binance.org/', // ✅ Fixed: removed trailing spaces
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 56,
      timeout: 60000,
    },
    solana: {
      url: 'https://api.mainnet-beta.solana.com', // ✅ Fixed: removed trailing spaces
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
};

export default config;
