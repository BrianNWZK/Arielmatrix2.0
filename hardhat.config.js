// arielmatrix2.0/hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.24", // Ensure this matches your contract's pragma
  networks: {
    hardhat: {
      // Local development network
    },
    localhost: {
      url: "http://127.0.0.1:8545" // For local Ganache or Hardhat node
    },
    // Add other networks for testnet/mainnet deployment later
    // e.g., polygonMumbai: { url: process.env.POLYGON_MUMBAI_RPC_URL, accounts: [process.env.PRIVATE_KEY] }
  }
};
