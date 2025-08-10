import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import '@nomiclabs/hardhat-solhint';

const config: HardhatUserConfig = {
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
      url: 'https://bsc-dataseed.binance.org/',
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
    solana: {
      url: 'https://api.devnet.solana.com', // Solana devnet for NFT minting
      accounts: process.env.SOLANA_PRIVATE_KEY ? [process.env.SOLANA_PRIVATE_KEY] : [],
      chainId: 900, // Solana devnet chain ID
    },
  },
};

export default config;
