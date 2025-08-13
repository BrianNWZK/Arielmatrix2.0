// backend/hardhat.config.js
// ESM+createRequire hybrid avoids ERR_MODULE_NOT_FOUND for 'hardhat/config'
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

require('@nomicfoundation/hardhat-toolbox');

const config = {
  solidity: {
    version: '0.8.20',
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    // EVM networks only; Hardhat doesn't compile/deploy Solana
    bsc: {
      url: 'https://bsc-dataseed.binance.org/',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 56,
      timeout: 60000,
    },
  },
  // IMPORTANT: this file lives in /backend; sources must be relative to it
  paths: {
    sources: './contracts',     // not ./backend/contracts
    artifacts: './artifacts',
    cache: './cache',
  },
  mocha: { timeout: 40000 },
};

export default config;
