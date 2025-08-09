import { exec } from 'child_process';
import util from 'util';
import Web3 from 'web3';
import axios from 'axios';
const execPromise = util.promisify(exec);

export const contractDeployAgent = async (CONFIG) => {
  try {
    if (!CONFIG.GAS_WALLET || !process.env.PRIVATE_KEY) {
      throw new Error('Gas wallet or private key missing');
    }
    // Compile and deploy contracts using Hardhat
    await execPromise('npx hardhat compile');
    const gasPrice = await axios.get(`https://api.bscscan.com/api?module=gastracker&action=gasoracle&apikey=${process.env.BSCSCAN_API_KEY || CONFIG.BSCSCAN_API_KEY}`);
    const web3 = new Web3(CONFIG.BSC_NODE);
    const account = web3.eth.accounts.privateKeyToAccount(process.env.PRIVATE_KEY);
    web3.eth.accounts.wallet.add(account);

    // Deploy RevenueDistributor
    const revenueDistributorAbi = JSON.parse(await execPromise('cat artifacts/contracts/RevenueDistributor.sol/RevenueDistributor.json')).abi;
    const revenueDistributorBytecode = JSON.parse(await execPromise('cat artifacts/contracts/RevenueDistributor.sol/RevenueDistributor.json')).bytecode;
    const revenueDistributorContract = new web3.eth.Contract(revenueDistributorAbi);
    const revenueDistributorDeploy = await revenueDistributorContract.deploy({
      data: revenueDistributorBytecode,
      arguments: [CONFIG.USDT_WALLETS, CONFIG.GAS_WALLET, '0x55d398326f99059ff775485246999027b3197955'],
    }).send({ from: CONFIG.GAS_WALLET, gasPrice: gasPrice.data.result.SafeGasPrice });
    console.log('RevenueDistributor deployed at:', revenueDistributorDeploy.options.address);

    // Deploy APIKeyGenerator
    const apiKeyGeneratorAbi = JSON.parse(await execPromise('cat artifacts/contracts/APIKeyGenerator.sol/APIKeyGenerator.json')).abi;
    const apiKeyGeneratorBytecode = JSON.parse(await execPromise('cat artifacts/contracts/APIKeyGenerator.sol/APIKeyGenerator.json')).bytecode;
    const apiKeyGeneratorContract = new web3.eth.Contract(apiKeyGeneratorAbi);
    const apiKeyGeneratorDeploy = await apiKeyGeneratorContract.deploy({
      data: apiKeyGeneratorBytecode,
    }).send({ from: CONFIG.GAS_WALLET, gasPrice: gasPrice.data.result.SafeGasPrice });
    console.log('APIKeyGenerator deployed at:', apiKeyGeneratorDeploy.options.address);

    // Update CONFIG with contract addresses
    CONFIG.REVENUE_DISTRIBUTOR_ADDRESS = revenueDistributorDeploy.options.address;
    CONFIG.API_KEY_GENERATOR_ADDRESS = apiKeyGeneratorDeploy.options.address;
  } catch (error) {
    console.error('ContractDeployAgent Error:', error);
    throw error;
  }
};
