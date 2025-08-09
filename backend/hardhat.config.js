import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';

const config = {
  solidity: '0.8.0',
  networks: {
    bsc: {
      url: 'https://bsc-dataseed.binance.org/',
      accounts: [process.env.PRIVATE_KEY],
    },
  },
};

export default config;
