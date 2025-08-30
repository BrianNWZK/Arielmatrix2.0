require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

module.exports = {
    solidity: "0.8.20",
    networks: {
        mainnet: {
            url: "https://rpc.ankr.com/eth",
            accounts: [process.env.PRIVATE_KEY]
        }
    }
};
